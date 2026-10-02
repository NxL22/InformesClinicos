'use strict';

const { extractReport } = require('./extract-report');

function readWorklistRow(selection) {
  const table = document.querySelector('#atenciones');
  if (!table) throw new Error('No está abierta la lista de trabajo.');
  const headers = Array.from(table.tHead.rows[0].cells).map((cell) => cell.textContent.trim());
  function cell(row, label) {
    const index = headers.indexOf(label);
    if (index < 0) throw new Error('Falta una columna necesaria de la lista.');
    return row.cells[index]?.textContent.trim() || '';
  }
  const rows = Array.from(table.tBodies[0].rows).filter((row) => row.querySelector('.btn-informe'));
  const matches = rows.filter((row) => selection.externalAttentionId
    ? cell(row, 'ID') === selection.externalAttentionId : cell(row, 'Nombre') === selection.fullName);
  if (matches.length !== 1) throw new Error('La selección no identifica una única atención visible.');
  const row = matches[0];
  const externalAttentionId = cell(row, 'ID');
  if (!/^\d+$/.test(externalAttentionId)
    || row.querySelector('.btn-informe').getAttribute('data-id') !== externalAttentionId) {
    throw new Error('El ID de la fila no coincide con el botón Informe.');
  }
  return {
    externalAttentionId, fullName: cell(row, 'Nombre'),
    attendedAtText: cell(row, 'Atención'), procedureName: cell(row, 'Examen'),
    placeCode: cell(row, 'Lugar'), modality: cell(row, 'Modalidad'), priority: cell(row, 'Prioridad'),
  };
}

// La comparación permite el separador ^ observado; no modifica el nombre guardado.
const comparableName = (value) => value.replace(/\^/g, ' ').replace(/\s+/g, ' ').trim();

function attachWorklist(result, row) {
  const data = result.normalized;
  if (comparableName(data.patient.fullName) !== comparableName(row.fullName)
    || data.attention.studyDate !== row.attendedAtText.slice(0, 10)
    || data.procedures.length !== 1 || data.procedures[0].name !== row.procedureName) {
    throw new Error('La cabecera del informe no coincide con la fila seleccionada.');
  }
  result.raw.worklistRow = structuredClone(row);
  result.raw.fields.externalAttentionId = { found: true, value: row.externalAttentionId };
  data.attention.externalAttentionId = row.externalAttentionId;
  data.attention.priority = row.priority;
  // Conservamos la hora sin asignarle una zona horaria que el portal no declara.
  data.attention.sourceMetadata = {
    worklistRow: structuredClone(row),
    displayedReportDate: data.report.reportDate,
    reportDateOrigin: 'browser_current_date',
  };
  result.fieldStates.externalAttentionId = { state: 'value', source: 'worklist' };
  result.warnings = result.warnings.filter((item) => !(item.field === 'externalAttentionId' && item.code === 'missing_field'));
  result.verification.rowMatchesHeader = true;
  // El ID proviene de la lista; no afirmamos haber leído el ID del contexto del editor.
  data.clinicalInput.extractionMetadata = {
    fieldStates: structuredClone(result.fieldStates), warnings: structuredClone(result.warnings),
    extractorVersion: 'faro-gestion/1.1.0', verification: structuredClone(result.verification),
  };
  return result;
}

async function collectAttention(tab, selection) {
  if (new URL(await tab.url()).pathname !== '/modulorad/listatrabajo.html'
    || new URL(await tab.url()).origin !== 'https://farogestion.cl') {
    throw new Error('Primero debe abrirse la lista de trabajo de Faro Gestión.');
  }
  const row = await tab.playwright.evaluate(readWorklistRow, selection);
  const button = tab.playwright.locator(`#atenciones .btn-informe[data-id="${row.externalAttentionId}"]`);
  if (await button.count() !== 1) throw new Error('El botón Informe no es único.');
  await button.click();
  await tab.playwright.waitForURL('https://farogestion.cl/modulorad/editor/editormulti.html', { timeoutMs: 15000 });
  const words = row.fullName.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  await tab.playwright.getByText(new RegExp(`^${words.join('[\\s^]+')}$`)).waitFor({ state: 'visible', timeoutMs: 15000 });
  await tab.playwright.locator('#encabezadoobsatencion').waitFor({ state: 'visible', timeoutMs: 15000 });
  return attachWorklist(await extractReport(tab), row);
}

module.exports = { readWorklistRow, attachWorklist, collectAttention };
