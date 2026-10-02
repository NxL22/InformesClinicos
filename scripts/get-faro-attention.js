'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getFaroAttention } = require('../src/services/imports/faro-import.service');
const { sequelize } = require('../src/models');

async function main() {
  try {
    const id = process.argv[2];
    if (!id) throw new Error('Uso: npm run scrape:get -- ID_ATENCION');
    const data = await getFaroAttention(id);
    const outputDirectory = path.resolve(__dirname, '../local-extractions');
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(path.join(outputDirectory, 'database-get.json'), JSON.stringify(data, null, 2), 'utf8');
    console.log('Consulta PostgreSQL exportada a local-extractions/database-get.json.');
  } finally { await sequelize.close(); }
}

main().catch((error) => {
  console.error(`No se pudo consultar la atención (${error.original?.code || error.code || error.name}).`);
  process.exitCode = 1;
});
