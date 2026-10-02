'use strict';

const fs = require('node:fs/promises');
const { importFaroAttention } = require('../src/services/imports/faro-import.service');
const { sequelize } = require('../src/models');

async function main() {
  try {
    const inputPath = process.argv[2];
    if (!inputPath) throw new Error('Uso: npm run scrape:import -- ruta-al-respaldo.json');
    const extraction = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    await importFaroAttention(extraction);
    console.log('Importación confirmada: paciente, atención, procedimiento e información clínica.');
  } finally { await sequelize.close(); }
}

main().catch((error) => {
  console.error(`Importación cancelada (${error.original?.code || error.code || error.name}). No se imprime contenido clínico.`);
  process.exitCode = 1;
});
