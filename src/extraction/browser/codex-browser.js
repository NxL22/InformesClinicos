'use strict';

const REPORT_URL = 'https://farogestion.cl/modulorad/editor/editormulti.html';

// Recibe la integración ya inicializada. No abre perfiles ni lee cookies.
async function getReportTab(cua) {
  const tabs = await cua.listTabs({ browser: 'iab', emit: false });
  const candidates = tabs.filter((tab) => {
    try {
      const url = new URL(tab.url);
      return url.origin === 'https://farogestion.cl'
        && url.pathname === '/modulorad/editor/editormulti.html';
    } catch { return false; }
  });
  if (candidates.length !== 1) {
    throw new Error(`Se requiere una pestaña del informe seleccionada sin ambigüedad; coincidencias: ${candidates.length}.`);
  }
  return cua.getTab(candidates[0].id, { browser: 'iab' });
}

module.exports = { REPORT_URL, getReportTab };
