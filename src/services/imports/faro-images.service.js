'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const { sequelize, Attention, StudyFile } = require('../../models');

const STORAGE_ROOT = path.resolve(__dirname, '../../../storage');
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validateImageManifest(manifest) {
  const source = new URL(manifest.sourceUrl);
  if (source.origin !== 'https://orthanc.farocloud.cl' || source.pathname !== '/ohif/viewer'
    || source.searchParams.get('StudyInstanceUIDs') !== manifest.studyInstanceUid
    || typeof manifest.externalAttentionId !== 'string' || !/^\d+$/.test(manifest.externalAttentionId) || !manifest.externalPatientId
    || !/^[0-9]+(?:\.[0-9]+)+$/.test(manifest.studyInstanceUid)
    || !Number.isInteger(manifest.expectedImages) || manifest.expectedImages < 1
    || manifest.images?.length !== manifest.expectedImages
    || manifest.exportMethod !== 'ohif_viewport_screenshot' || manifest.diagnosticOriginal !== false) {
    throw new Error('Se requiere una colección completa de capturas JPG identificadas.');
  }
  const indices = new Set();
  for (const image of manifest.images) {
    if (!Number.isInteger(image.index) || image.index < 1 || image.index > manifest.expectedImages
      || indices.has(image.index) || !/^[a-f0-9]{64}$/.test(image.sha256)) {
      throw new Error('Índice de imagen duplicado, inválido o sin checksum.');
    }
    indices.add(image.index);
  }
}

async function importFaroImages(manifestPath) {
  const directory = path.dirname(path.resolve(manifestPath));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  validateImageManifest(manifest);
  const attention = await Attention.findOne({
    where: { sourceSystem: 'faro_gestion', externalAttentionId: manifest.externalAttentionId }, include: ['patient'],
  });
  if (!attention || attention.patient.externalPatientId !== manifest.externalPatientId) {
    throw new Error('La colección no corresponde al paciente de la atención guardada.');
  }

  // Validamos el lote completo antes de copiarlo al bucket local o modificar la base.
  const files = [];
  for (const image of manifest.images) {
    const inputPath = path.resolve(image.jpgPath);
    if (path.dirname(inputPath) !== directory) throw new Error('Archivo fuera del directorio de captura.');
    const bytes = await fs.readFile(inputPath);
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'jpeg' || checksum(bytes) !== image.sha256 || bytes.length !== image.byteSize
      || metadata.width !== image.width || metadata.height !== image.height) {
      throw new Error('Un JPG no coincide con su checksum, tamaño o dimensiones.');
    }
    // Las claves usan UUID, UID y número; no incluyen nombres ni ID del paciente.
    const storageKey = `study-images/${attention.id}/${manifest.studyInstanceUid}/frame-${String(image.index).padStart(3, '0')}.jpg`;
    files.push({ ...image, bytes, storageKey, externalFileId: `${manifest.studyInstanceUid}:${image.index}` });
  }

  for (const file of files) {
    const target = path.join(STORAGE_ROOT, ...file.storageKey.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Escribimos los bytes ya validados; no releemos una fuente que pudo cambiar.
    try { await fs.writeFile(target, file.bytes, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (checksum(await fs.readFile(target)) !== file.sha256) throw new Error('Ya existe otra imagen en la clave local.');
    }
  }

  await sequelize.transaction(async (transaction) => {
    // La atención serializa los reintentos para no duplicar sus study_files.
    // Bloqueamos solo attentions; un FOR UPDATE sobre el LEFT JOIN del paciente
    // no está permitido por PostgreSQL.
    await Attention.findByPk(attention.id, { transaction, lock: transaction.LOCK.UPDATE });
    for (const file of files) {
      const existing = await StudyFile.findOne({
        where: { attentionId: attention.id, externalFileId: file.externalFileId }, transaction,
      });
      if (existing) {
        if (existing.sha256 !== file.sha256 || existing.storageKey !== file.storageKey) {
          throw new Error('La imagen registrada cambió; se requiere revisión.');
        }
        continue;
      }
      await StudyFile.create({
        attentionId: attention.id, kind: 'image', storageKey: file.storageKey,
        originalName: path.basename(file.jpgPath), mimeType: 'image/jpeg',
        byteSize: file.byteSize, sha256: file.sha256, externalFileId: file.externalFileId,
        sourceMetadata: {
          storageProvider: 'local', sourceUrl: manifest.sourceUrl, studyInstanceUid: manifest.studyInstanceUid,
          imageIndex: file.index, expectedImages: manifest.expectedImages,
          width: file.width, height: file.height, exportMethod: manifest.exportMethod,
          diagnosticOriginal: false, displayText: file.displayText,
        },
      }, { transaction });
    }
  });

  // Corroboramos desde PostgreSQL y desde los bytes guardados en storage.
  const saved = await StudyFile.findAll({ where: { attentionId: attention.id } });
  for (const file of files) {
    const row = saved.find((item) => item.externalFileId === file.externalFileId);
    if (!row || row.sha256 !== file.sha256 || row.mimeType !== 'image/jpeg'
      || String(row.byteSize) !== String(file.byteSize)
      || checksum(await fs.readFile(path.join(STORAGE_ROOT, ...row.storageKey.split('/')))) !== row.sha256) {
      throw new Error('La corroboración del archivo local y PostgreSQL no coincide.');
    }
  }
  const result = {
    storageProvider: 'local', externalAttentionId: manifest.externalAttentionId,
    imagesVerified: files.length, byteSize: files.reduce((total, file) => total + file.byteSize, 0),
    uniqueChecksums: new Set(files.map((file) => file.sha256)).size,
    directory: path.dirname(path.join(STORAGE_ROOT, ...files[0].storageKey.split('/'))),
  };
  await fs.writeFile(path.join(directory, 'storage-verification.json'), JSON.stringify(result, null, 2), 'utf8');
  return result;
}

module.exports = { validateImageManifest, importFaroImages };
