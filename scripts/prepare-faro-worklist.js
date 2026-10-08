'use strict';

const { readWorklistRow } = require('../src/extraction/faro/collect-attention');

const ORIGIN = 'https://farogestion.cl';
const WORKLIST_URL = `${ORIGIN}/modulorad/listatrabajo.html`;

// Se ejecuta dentro de cua_repl con la pestaña autenticada que ya tiene el usuario.
// No guarda credenciales ni abre otra sesión. La selección del caso es explícita.
async function applySanMiguelView(tab) {
  const url = new URL(await tab.url());
  if (url.origin !== ORIGIN || !['/landing.html', '/modulorad/listatrabajo.html'].includes(url.pathname)) {
    throw new Error('Abrir Faro después del login, en el menú o la lista de trabajo.');
  }

  // Usamos el enlace real del módulo; si ya estamos en la lista, no la recargamos.
  if (url.pathname === '/landing.html') {
    await tab.playwright.locator('#linkmodulorad').click();
    await tab.playwright.waitForURL(WORKLIST_URL, { timeoutMs: 15000 });
    await tab.playwright.domSnapshot();
  }
  await tab.playwright.locator('#atenciones').waitFor({ state: 'visible', timeoutMs: 15000 });
  const modal = tab.playwright.locator('#modalVistas');
  if (!await modal.isVisible()) {
    await tab.playwright.locator('button[data-target="#modalVistas"]').click();
    await tab.playwright.domSnapshot();
  }

  // El botón azul aplica la vista. Los botones vecinos editan y eliminan: no usarlos.
  const view = tab.playwright.locator('#contenedorVistas > div').filter({
    has: tab.playwright.getByText('Integramedica San Miguel', { exact: true }),
  });
  await view.waitFor({ state: 'visible', timeoutMs: 15000 });
  if (await view.count() !== 1) throw new Error('La vista San Miguel no es única.');
  await view.locator('button.btn-primary').click();
  await tab.playwright.domSnapshot();

  // Cerramos haciendo clic en el fondo del modal, como en el recorrido observado.
  // Calculamos el punto desde el DOM actual para no depender del tamaño de pantalla.
  const outsidePoint = await modal.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const content = element.querySelector('.modal-content').getBoundingClientRect();
    const x = bounds.left + 5;
    const y = bounds.top + 5;
    if (x >= content.left && x <= content.right && y >= content.top && y <= content.bottom) {
      throw new Error('No hay un punto seguro fuera del contenido del modal.');
    }
    return [x, y];
  });
  await tab.click(outsidePoint);
  await modal.waitFor({ state: 'hidden', timeoutMs: 15000 });
  await tab.playwright.domSnapshot();
  await tab.playwright.locator('#atenciones tbody tr').filter({
    has: tab.playwright.getByRole('cell', { name: 'ISM', exact: true }),
  }).first().waitFor({ state: 'visible', timeoutMs: 15000 });
}

async function prepareFaroWorklist(tab, selection) {
  if (!selection?.externalAttentionId && !selection?.fullName) {
    throw new Error('Indicar el ID de atención o el nombre exacto de la fila.');
  }
  await applySanMiguelView(tab);

  // Esperamos la fila seleccionada en San Miguel, incluso si el portal sigue cargando.
  // Los encabezados se resuelven por texto porque DataTables permite reordenarlos.
  const selectedRow = tab.playwright.locator('#atenciones tbody tr').filter({
    has: tab.playwright.getByRole('cell', {
      name: String(selection.externalAttentionId || selection.fullName), exact: true,
    }),
  }).filter({ has: tab.playwright.getByRole('cell', { name: 'ISM', exact: true }) });
  await selectedRow.waitFor({ state: 'visible', timeoutMs: 15000 });
  const row = await tab.playwright.evaluate(readWorklistRow, selection);
  if (row.placeCode !== 'ISM') throw new Error('La atención seleccionada no pertenece a San Miguel.');
  return row;
}

module.exports = { applySanMiguelView, prepareFaroWorklist };
