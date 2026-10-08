'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readPage, goToPage } = require('../scripts/collect-faro-batch');

// DOM sintético: columnas reordenadas y una fila responsive sin botón Informe.
function pageDocument({ place = 'ISM', buttonId = '00123', duplicate = false, page = '1' } = {}) {
  const row = {
    cells: [{ textContent: place }, { textContent: '00123' }],
    querySelector: () => ({ getAttribute: () => buttonId }),
  };
  const table = {
    tHead: { rows: [{ cells: [{ textContent: 'Lugar' }, { textContent: 'ID' }] }] },
    tBodies: [{ rows: [row, { querySelector: () => null }, ...(duplicate ? [row] : [])] }],
  };
  return { querySelector: (selector) => selector === '#atenciones' ? table
    : selector.includes('.current') ? { textContent: page }
      : { getAttribute: () => 'true' } };
}

test('la hoja conserva IDs textuales con columnas reordenadas y descarta filas secundarias', () => {
  const result = vm.runInNewContext(`(${readPage.toString()})()`, { document: pageDocument() });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { page: 1, ids: ['00123'], hasNext: false });
});

test('detiene el lote ante otro centro, ID inconsistente, duplicado o página desconocida', () => {
  for (const options of [{ place: 'IRZ' }, { buttonId: '999' }, { duplicate: true }, { page: '' }]) {
    assert.throws(() => vm.runInNewContext(`(${readPage.toString()})()`, { document: pageDocument(options) }));
  }
});

test('no intenta avanzar después de la última hoja', async () => {
  const tab = { playwright: {
    evaluate: async () => ({ page: 1 }),
    locator: () => ({ getAttribute: async () => 'true', click: async () => assert.fail('No debe hacer clic') }),
  } };
  await assert.rejects(goToPage(tab, 2), /ya no está disponible/);
  await assert.rejects(goToPage(tab, 0), /hoja válida/);
});
