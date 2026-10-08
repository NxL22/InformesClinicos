'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');

// Capturamos solo el área del visor a través de la API de screenshot de Codex.
// Son JPG renderizados para visualización, no imágenes DICOM originales.
async function startImageCollection(tab, { externalAttentionId, externalPatientId, expectedImages }) {
  const url = new URL(await tab.url());
  if (url.origin !== 'https://orthanc.farocloud.cl' || url.pathname !== '/ohif/viewer'
    || !url.searchParams.get('StudyInstanceUIDs') || !/^\d+$/.test(externalAttentionId)
    || !externalPatientId || !Number.isInteger(expectedImages) || expectedImages < 1) {
    throw new Error('Se requiere el visor del estudio y una atención identificada.');
  }
  const dialog = tab.playwright.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await tab.playwright.domSnapshot();
  }
  // El encabezado Patient debe estar expandido para leer el identificador visible.
  const bodyText = await tab.playwright.getByRole('slider', { name: 'Image navigation scrollbar' }).evaluate(() => document.body.innerText);
  if (!bodyText.includes(externalPatientId)) throw new Error('El paciente visible no coincide con la atención.');
  const slider = tab.playwright.getByRole('slider', { name: 'Image navigation scrollbar' });
  if (Number(await slider.getAttribute('max')) + 1 !== expectedImages) {
    throw new Error('El número de imágenes no coincide con el solicitado.');
  }
  await slider.press('Home');
  await tab.playwright.domSnapshot();
  const directory = path.resolve(__dirname, '../local-extractions', `images-${externalAttentionId}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(directory, { recursive: true });
  const collection = {
    directory, externalAttentionId, externalPatientId, expectedImages,
    sourceUrl: url.href, studyInstanceUid: url.searchParams.get('StudyInstanceUIDs'),
    exportMethod: 'ohif_viewport_screenshot', diagnosticOriginal: false,
    images: [],
  };
  await saveManifest(collection);
  return collection;
}

async function saveManifest(collection) {
  await fs.writeFile(path.join(collection.directory, 'manifest.json'), JSON.stringify(collection, null, 2), 'utf8');
}

async function collectNextImage(tab, collection) {
  const index = collection.images.length + 1;
  if (index > collection.expectedImages) return { done: true, count: collection.images.length };
  if (await tab.url() !== collection.sourceUrl) throw new Error('Cambió el estudio del visor.');
  const slider = tab.playwright.getByRole('slider', { name: 'Image navigation scrollbar' });
  const existingDialog = tab.playwright.getByRole('dialog');
  if (await existingDialog.isVisible()) {
    await existingDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await tab.playwright.domSnapshot();
  }
  // Restauramos la posición para admitir reintentos, comprobando luego el índice visible.
  const currentIndex = Number(await slider.getAttribute('value'));
  if (currentIndex === index - 2) {
    await slider.press('ArrowDown');
  } else if (currentIndex !== index - 1) {
    await slider.press('Home');
    for (let step = 1; step < index; step++) await slider.press('ArrowDown');
  }
  await tab.playwright.domSnapshot();
  const position = tab.playwright.getByText(new RegExp(`^I:.*\\(${index}/${collection.expectedImages}\\)`));
  await position.waitFor({ state: 'visible', timeoutMs: 15000 });
  const displayText = await position.innerText();
  const canvas = tab.playwright.locator('canvas.cornerstone-canvas');
  if (await canvas.count() !== 1) throw new Error('Se requiere un único viewport para capturar la serie.');
  const clip = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: Math.ceil(rect.x), y: Math.ceil(rect.y), width: Math.floor(rect.width), height: Math.floor(rect.height) };
  });
  // La integración no conserva el desplazamiento de clip en este visor.
  // Capturamos el viewport y recortamos con los límites observados del canvas.
  const fullScreenshot = Buffer.from(await tab.screenshot({ fullPage: false }));
  const screenshot = await sharp(fullScreenshot).extract({
    left: clip.x, top: clip.y, width: clip.width, height: clip.height,
  }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  // Usamos Sharp para validar/convertir el formato; no reimplementamos un codec.
  const stats = await sharp(screenshot).stats();
  if (!stats.channels.slice(0, 3).some((channel) => channel.max - channel.min > 10)) {
    throw new Error('El visor sigue vacío: se detiene sin avanzar.');
  }
  const sourceMetadata = await sharp(screenshot).metadata();
  const bytes = sourceMetadata.format === 'jpeg' ? screenshot
    : await sharp(screenshot).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  const jpgPath = path.join(collection.directory, `frame-${String(index).padStart(3, '0')}.jpg`);
  await position.waitFor({ state: 'visible', timeoutMs: 15000 });
  if (await tab.url() !== collection.sourceUrl) throw new Error('Cambió el estudio durante la captura.');
  await fs.writeFile(jpgPath, bytes, { flag: 'wx' });
  collection.images.push({
    index, jpgPath, width: sourceMetadata.width, height: sourceMetadata.height,
    sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length, displayText,
  });
  await saveManifest(collection);
  return { done: collection.images.length === collection.expectedImages, count: collection.images.length };
}

module.exports = { startImageCollection, collectNextImage };
