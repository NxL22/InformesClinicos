'use strict';

const { readFaroDocument } = require('./read-document');
const { parseObservations } = require('./parse-observations');
const { normalizeReport } = require('../normalize-report');

const EXTRACTOR_VERSION = 'faro-gestion/1.0.0';

function isReportUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://farogestion.cl'
      && url.pathname === '/modulorad/editor/editormulti.html';
  } catch { return false; }
}

async function extractReport(tab) {
  const sourceUrl = await tab.url();
  if (!isReportUrl(sourceUrl)) throw new Error('La pestaña no corresponde al editor de Faro Gestión.');
  await tab.playwright.locator('#encabezadoid').waitFor({ state: 'visible', timeoutMs: 10000 });

  // Cada captura lee todos los campos sincrónicamente en una única evaluación del DOM.
  // Dos lecturas detectan cambios visibles; no convierten la cabecera en una clave única.
  const first = await tab.playwright.evaluate(readFaroDocument);
  const second = await tab.playwright.evaluate(readFaroDocument);
  if (sourceUrl !== await tab.url() || JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('El informe cambió durante la lectura. Se descarta la extracción.');
  }
  const parsed = parseObservations(second.fields.rawText);
  const description = second.procedureDescription;
  const result = normalizeReport({
    ...second,
    fields: { ...second.fields, ...parsed.fields },
    // El documento observado tiene una descripción textual. No dividimos por comas,
    // saltos o la palabra "bilateral" sin evidencia de cómo representa varios estudios.
    procedures: {
      found: description.found,
      value: description.found && description.value.trim() ? [{ name: description }] : [],
    },
    additionalFields: parsed.additionalFields,
    sourceUrl,
    extractedAt: new Date().toISOString(),
  });
  result.fieldStates.editorText = {
    state: !second.editorText.found ? 'missing' : second.editorText.value.trim() ? 'value' : 'empty',
  };
  result.warnings.push(...parsed.warnings,
    { field: 'externalReportId', code: 'missing_field' },
    { field: 'consistency', code: 'no_verified_attention_identity' },
    { field: 'procedures', code: 'multiple_procedure_layout_not_verified' });
  result.verification = { identicalReads: true, verifiedAttentionIdentity: false };
  // Capturamos los metadatos al final para incluir avisos del parser y del portal.
  result.normalized.clinicalInput.extractionMetadata = {
    fieldStates: structuredClone(result.fieldStates),
    warnings: structuredClone(result.warnings),
    extractorVersion: EXTRACTOR_VERSION,
    verification: structuredClone(result.verification),
  };
  return result;
}

module.exports = { extractReport };
