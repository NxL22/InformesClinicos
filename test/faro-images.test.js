'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { validateImageManifest } = require('../src/services/imports/faro-images.service');
const { sequelize } = require('../src/models');
after(() => sequelize.close());

function manifest() {
  return {
    externalAttentionId: '00123', externalPatientId: '00456',
    studyInstanceUid: '1.2.3', sourceUrl: 'https://orthanc.farocloud.cl/ohif/viewer?StudyInstanceUIDs=1.2.3',
    expectedImages: 2, exportMethod: 'ohif_viewport_screenshot', diagnosticOriginal: false,
    images: [1, 2].map((index) => ({ index, sha256: 'a'.repeat(64) })),
  };
}

test('acepta una colección completa sin deduplicar imágenes por su contenido', () => {
  assert.doesNotThrow(() => validateImageManifest(manifest()));
});

test('rechaza colecciones incompletas, duplicadas, de otro estudio o con rutas en el UID', () => {
  const variants = [
    { expectedImages: 3 }, { studyInstanceUid: '../otro' },
    { sourceUrl: 'https://otro.example/ohif/viewer?StudyInstanceUIDs=1.2.3' },
    { sourceUrl: 'https://orthanc.farocloud.cl/ohif/viewer?StudyInstanceUIDs=1.2.4' },
    { externalAttentionId: 123 }, { diagnosticOriginal: true },
    { images: [{ index: 1, sha256: 'a'.repeat(64) }, { index: 1, sha256: 'a'.repeat(64) }] },
    { images: [{ index: 1, sha256: 'incorrecto' }, { index: 2, sha256: 'a'.repeat(64) }] },
  ];
  for (const variant of variants) assert.throws(() => validateImageManifest({ ...manifest(), ...variant }));
});
