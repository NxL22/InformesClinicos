'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { sequelize, Patient, Attention } = require('../src/models');
const { importFaroAttention, getFaroAttention } = require('../src/services/imports/faro-import.service');

async function importBatch(manifestPath) {
  const directory = path.dirname(path.resolve(manifestPath));
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (!manifest.captures?.length) throw new Error('El lote no contiene capturas.');
  const extractions = [];
  const attentionIds = new Set();
  for (const capture of manifest.captures) {
    const inputPath = path.resolve(capture.extractionPath);
    if (path.dirname(inputPath) !== directory || attentionIds.has(capture.externalAttentionId)) {
      throw new Error('Respaldo fuera del lote o atención duplicada en el manifiesto.');
    }
    const extraction = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    if (extraction.normalized.attention.externalAttentionId !== capture.externalAttentionId) {
      throw new Error('El respaldo no coincide con el ID del manifiesto.');
    }
    attentionIds.add(capture.externalAttentionId);
    extractions.push(extraction);
  }

  // Una transacción engloba el lote; un fallo no deja importada solo una parte.
  // Reutilizamos el importador existente y sus comprobaciones de reimportación.
  const counts = await sequelize.transaction(async (transaction) => {
    let newPatients = 0;
    let newAttentions = 0;
    for (const extraction of extractions) {
      const { patient, attention } = extraction.normalized;
      if (!await Patient.findOne({ where: { sourceSystem: patient.sourceSystem, externalPatientId: patient.externalPatientId }, transaction })) newPatients++;
      if (!await Attention.findOne({ where: { sourceSystem: attention.sourceSystem, externalAttentionId: attention.externalAttentionId }, transaction })) newAttentions++;
      await importFaroAttention(extraction, { transaction });
    }
    return { newPatients, newAttentions };
  });
  // Conservamos la confirmación antes de consultar: un fallo de corroboración
  // posterior no significa que la transacción se haya revertido.
  const committedAt = new Date().toISOString();
  await fs.writeFile(path.join(directory, `import-${committedAt.replace(/[:.]/g, '-')}.json`),
    JSON.stringify({ committedAt, ...counts, attentionIds: [...attentionIds] }, null, 2), { encoding: 'utf8', flag: 'wx' });

  // La corroboración consulta PostgreSQL después del commit, nunca muestra nombres
  // tomados de los respaldos. Comparamos además todos los atributos normalizados.
  const patients = new Map();
  for (const extraction of extractions) {
    const source = extraction.normalized;
    const saved = await getFaroAttention(source.attention.externalAttentionId);
    for (const entity of ['patient', 'attention', 'clinicalInput']) {
      for (const [field, value] of Object.entries(source[entity])) {
        // Sequelize devuelve DATE como Date; el respaldo JSON usa una cadena ISO.
        const actual = saved[entity][field] instanceof Date
          ? saved[entity][field].toISOString() : saved[entity][field];
        assert.deepEqual(actual, value, `Diferencia en ${entity}.${field}`);
      }
    }
    assert.equal(saved.procedures.length, source.procedures.length);
    for (const [field, value] of Object.entries(source.procedures[0])) {
      assert.deepEqual(saved.procedures[0][field], value, `Diferencia en procedure.${field}`);
    }
    const patient = patients.get(saved.patient.id) || { name: saved.patient.fullName, attentionIds: [] };
    patient.attentionIds.push(saved.attention.externalAttentionId);
    patients.set(saved.patient.id, patient);
  }
  const result = { ...counts, verifiedAttentions: extractions.length, verifiedPatients: patients.size, patients: [...patients.values()] };
  await fs.writeFile(path.join(directory, 'database-verification.json'), JSON.stringify(result, null, 2), 'utf8');
  return result;
}

async function main() {
  try {
    if (!process.argv[2]) throw new Error('Indicar la ruta del manifest.json del lote.');
    // Los nombres se muestran solo en esta consulta de corroboración solicitada.
    console.log(JSON.stringify(await importBatch(process.argv[2]), null, 2));
  } finally { await sequelize.close(); }
}

if (require.main === module) main().catch((error) => {
  console.error(`El lote falló (${error.original?.code || error.code || error.name}). Revisar si ocurrió durante importación o corroboración.`);
  process.exitCode = 1;
});

module.exports = { importBatch };
