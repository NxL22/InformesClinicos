'use strict';

const { importFaroImages } = require('../src/services/imports/faro-images.service');
const { sequelize } = require('../src/models');

async function main() {
  try {
    if (!process.argv[2]) throw new Error('Indicar el manifest.json de la colección de imágenes.');
    console.log(JSON.stringify(await importFaroImages(process.argv[2]), null, 2));
  } finally { await sequelize.close(); }
}

main().catch((error) => {
  console.error(`No se completó el respaldo de imágenes (${error.original?.code || error.code || error.name}).`);
  process.exitCode = 1;
});
