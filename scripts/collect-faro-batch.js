'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { applySanMiguelView } = require('./prepare-faro-worklist');
const { collectAttention } = require('../src/extraction/faro/collect-attention');

// Leemos únicamente la hoja renderizada. Las filas responsive sin Informe no son casos.
function readPage() {
  const table = document.querySelector('#atenciones');
  const headers = Array.from(table.tHead.rows[0].cells).map((cell) => cell.textContent.trim());
  const idColumn = headers.indexOf('ID');
  const placeColumn = headers.indexOf('Lugar');
  if (idColumn < 0 || placeColumn < 0) throw new Error('Faltan columnas de identificación.');
  const ids = Array.from(table.tBodies[0].rows).filter((row) => row.querySelector('.btn-informe')).map((row) => {
    const id = row.cells[idColumn].textContent.trim();
    if (!/^\d+$/.test(id) || row.querySelector('.btn-informe').getAttribute('data-id') !== id
      || row.cells[placeColumn].textContent.trim() !== 'ISM') {
      throw new Error('La hoja contiene una fila sin ID consistente o fuera de San Miguel.');
    }
    return id;
  });
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Hoja vacía o con IDs duplicados.');
  const page = Number(document.querySelector('#atenciones_paginate .current')?.textContent);
  if (!Number.isInteger(page) || page < 1) throw new Error('No se identificó la hoja actual.');
  return {
    page,
    ids,
    hasNext: document.querySelector('#atenciones_next')?.getAttribute('aria-disabled') !== 'true',
  };
}

// Usamos los controles de DataTables, sin acceder a su estado interno ni inventar URLs.
async function goToPage(tab, page) {
  if (!Number.isInteger(page) || page < 1) throw new Error('Indicar una hoja válida.');
  let current = await tab.playwright.evaluate(readPage);
  while (current.page !== page) {
    const forward = current.page < page;
    const control = tab.playwright.locator(forward ? '#atenciones_next' : '#atenciones_previous');
    if (await control.getAttribute('aria-disabled') === 'true') throw new Error('La página solicitada ya no está disponible.');
    const expectedPage = current.page + (forward ? 1 : -1);
    await control.click();
    await tab.playwright.domSnapshot();
    await tab.playwright.locator('#atenciones_paginate .current').filter({
      hasText: new RegExp(`^${expectedPage}$`),
    }).waitFor({ state: 'visible', timeoutMs: 15000 });
    current = await tab.playwright.evaluate(readPage);
    if (current.page !== expectedPage) throw new Error('No se confirmó el cambio de hoja.');
  }
  return current;
}

async function startBatch(tab, { maxPatients = 10, maxPages = 1 } = {}) {
  if (!Number.isInteger(maxPatients) || maxPatients < 1 || !Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('Indicar límites enteros positivos para pacientes y hojas.');
  }
  await applySanMiguelView(tab);
  const first = await tab.playwright.evaluate(readPage);
  const queue = [];
  const seen = new Set();
  let page = first;
  for (let index = 0; index < maxPages; index++) {
    for (const externalAttentionId of page.ids) {
      if (!seen.has(externalAttentionId)) {
        queue.push({ page: page.page, externalAttentionId });
        seen.add(externalAttentionId);
      }
    }
    if (!page.hasNext || index + 1 === maxPages) break;
    page = await goToPage(tab, page.page + 1);
  }
  await goToPage(tab, first.page);
  const directory = path.resolve(__dirname, '../local-extractions', `batch-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await fs.mkdir(directory, { recursive: true });
  const batch = { directory, maxPatients, startPage: first.page, queue, captures: [], patientIds: [] };
  await saveBatch(batch);
  return batch;
}

async function saveBatch(batch) {
  await fs.writeFile(path.join(batch.directory, 'manifest.json'), JSON.stringify(batch, null, 2), 'utf8');
}

// Un paso por llamada permite comunicar avance y revisar cada caso secuencialmente.
// Contamos pacientes por su ID externo, no por nombre: una persona puede tener varias atenciones.
async function collectNext(tab, batch) {
  if (batch.patientIds.length >= batch.maxPatients) return { done: true, patients: batch.patientIds.length };
  const item = batch.queue[batch.captures.length];
  if (!item) return { done: true, exhausted: true, patients: batch.patientIds.length };
  const url = new URL(await tab.url());
  if (url.pathname === '/modulorad/editor/editormulti.html' && url.origin === 'https://farogestion.cl') {
    await tab.back();
    await tab.playwright.waitForURL('https://farogestion.cl/modulorad/listatrabajo.html', { timeoutMs: 15000 });
    await tab.playwright.domSnapshot();
  }
  // También reaplicamos al reintentar desde la lista: un retorno interrumpido
  // puede haber dejado los filtros generales del portal.
  await applySanMiguelView(tab);
  await goToPage(tab, item.page);
  const extraction = await collectAttention(tab, { externalAttentionId: item.externalAttentionId });
  const patientId = extraction.normalized.patient.externalPatientId;
  if (!patientId?.trim()) throw new Error('No se puede contar un paciente sin ID externo.');
  const extractionPath = path.join(batch.directory, `attention-${item.externalAttentionId}.json`);
  await fs.writeFile(extractionPath, JSON.stringify(extraction, null, 2), { encoding: 'utf8', flag: 'wx' });
  batch.captures.push({ ...item, extractionPath });
  if (!batch.patientIds.includes(patientId)) batch.patientIds.push(patientId);
  await saveBatch(batch);
  return { done: batch.patientIds.length >= batch.maxPatients, captures: batch.captures.length, patients: batch.patientIds.length };
}

module.exports = { readPage, goToPage, startBatch, collectNext };
