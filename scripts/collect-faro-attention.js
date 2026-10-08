'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { prepareFaroWorklist } = require('./prepare-faro-worklist');
const { collectAttention } = require('../src/extraction/faro/collect-attention');

// Une el recorrido y el extractor existentes sobre una sola pestaña y un solo caso.
// PostgreSQL se carga después con scrape:import: si falla, el respaldo permite reintentar.
async function collectFaroAttention(tab, selection) {
  const row = await prepareFaroWorklist(tab, selection);
  // La lista puede incluir espacios dobles; conservamos el original en la extracción.
  const comparableName = (name) => name.replace(/\s+/g, ' ').trim();
  if (selection.fullName && comparableName(row.fullName) !== comparableName(selection.fullName)) {
    throw new Error('El nombre de la fila no coincide con la persona solicitada.');
  }
  const extraction = await collectAttention(tab, {
    externalAttentionId: row.externalAttentionId,
  });

  // Guardamos cada captura por separado, en el directorio excluido de Git.
  // wx evita reemplazar un respaldo anterior, incluso ante una colisión de nombre.
  const directory = path.resolve(__dirname, '../local-extractions');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extractionPath = path.join(directory, `attention-${row.externalAttentionId}-${timestamp}.json`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(extractionPath, JSON.stringify(extraction, null, 2), { encoding: 'utf8', flag: 'wx' });

  // La salida de control no incluye nombres, identificadores de paciente ni texto clínico.
  return { extractionPath, externalAttentionId: row.externalAttentionId, verification: extraction.verification };
}

module.exports = { collectFaroAttention };
