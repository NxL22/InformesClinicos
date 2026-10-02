'use strict';

// Función autocontenida para tab.playwright.evaluate: únicamente lee el DOM.
// Los IDs y etiquetas se observaron en el informe abierto, dentro de Codex.
function readFaroDocument() {
  function one(selector) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 1) throw new Error('El documento contiene selectores duplicados.');
    return elements[0] || null;
  }
  function read(selector) {
    const element = one(selector);
    return element ? { found: true, value: element.textContent } : { found: false };
  }
  const header = one('table.tabla-encabezado');
  const labels = Array.from(header?.rows[0]?.cells || []).map((cell) => cell.textContent.trim());
  const expected = ['Nombre', 'ID paciente', 'Edad paciente', 'Procedimiento',
    'Fecha estudio', 'Fecha informe', 'Atendido en'];
  if (JSON.stringify(labels) !== JSON.stringify(expected)) {
    throw new Error('La cabecera del portal cambió o no hay un informe cargado.');
  }
  const fields = {
    fullName: read('#encabezadopaciente'),
    externalPatientId: read('#encabezadoid'),
    ageAtStudy: read('#encabezadoedad'),
    studyDate: read('#encabezadofechaestudio'),
    reportDate: read('#encabezadofechainforme'),
    centerName: read('#encabezadolugaratencion'),
    rawText: read('#encabezadoobsatencion'),
    externalAttentionId: { found: false },
    externalReportId: { found: false },
  };
  if (!fields.fullName.value?.trim() || !fields.externalPatientId.value?.trim()) {
    throw new Error('El informe todavía no tiene la cabecera cargada.');
  }
  return {
    fields,
    procedureDescription: read('#encabezadodescripcion'),
    attentionPosition: read('#indicadorPosicion'),
    editorText: read('#textos'),
  };
}

module.exports = { readFaroDocument };
