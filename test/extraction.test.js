const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDate, normalizeReport } = require('../src/extraction/normalize-report');
const { parseObservations } = require('../src/extraction/faro/parse-observations');
const { extractReport } = require('../src/extraction/faro/extract-report');
const { getReportTab } = require('../src/extraction/browser/codex-browser');
const { attachWorklist } = require('../src/extraction/faro/collect-attention');

const field = (value) => ({ found: true, value });
function syntheticReport() {
  return {
    sourceUrl: 'https://farogestion.cl/modulorad/editor/editormulti.html',
    extractedAt: '2026-10-01T12:00:00.000Z',
    fields: {
      fullName: field('Paciente sintético'), externalPatientId: field('000123'),
      externalAttentionId: field('000456'), ageAtStudy: field('35 años 11 meses'),
      studyDate: field('30/09/2026'), reportDate: field('01/10/2026'),
      other: field('Primera línea\nSegunda línea'), findings: field('Hallazgo sintético\nOtra línea'),
      rawText: field('Otros: Primera línea\nSegunda línea\nHallazgos: Hallazgo sintético\nOtra línea'),
      regularMedications: field('no'), symptoms: field(''),
    },
    procedures: { found: true, value: [
      { name: field('Ecografía bilateral') }, { name: field('Otro procedimiento sintético') },
    ] },
    additionalFields: [{ label: 'Etiqueta sintética', field: field('no') }],
  };
}

test('conserva ceros, texto completo, fechas distintas y todos los procedimientos', () => {
  const input = syntheticReport();
  const result = normalizeReport(input);
  const { patient, attention, procedures, clinicalInput, report } = result.normalized;
  assert.equal(patient.externalPatientId, '000123');
  assert.equal(attention.externalAttentionId, '000456');
  assert.equal(attention.studyDate, '2026-09-30');
  assert.equal(report.reportDate, '2026-10-01');
  assert.equal(procedures.length, 2);
  assert.equal(procedures[0].name, 'Ecografía bilateral');
  assert.equal(procedures[0].laterality, null);
  for (const name of ['other', 'findings', 'rawText']) assert.equal(clinicalInput[name], input.fields[name].value);
  assert.equal(attention.ageAtStudy, input.fields.ageAtStudy.value);
  assert.equal(Object.hasOwn(patient, 'birthDate'), false);
  assert.deepEqual(result.raw, input);
  result.raw.fields.fullName.value = 'Otro texto sintético';
  assert.equal(input.fields.fullName.value, 'Paciente sintético');
});

test('distingue faltante, vacío y negativo explícito', () => {
  const result = normalizeReport(syntheticReport());
  assert.equal(result.fieldStates.diagnosis.state, 'missing');
  assert.equal(result.fieldStates.symptoms.state, 'empty');
  assert.equal(result.fieldStates.regularMedications.state, 'value');
  assert.equal(result.normalized.clinicalInput.regularMedications, 'no');
  assert.deepEqual(result.normalized.clinicalInput.additionalFields, [{ label: 'Etiqueta sintética', value: 'no' }]);
  const metadata = result.normalized.clinicalInput.extractionMetadata;
  assert.equal(metadata.fieldStates.diagnosis.state, 'missing');
  assert.equal(metadata.fieldStates.symptoms.state, 'empty');
  assert.equal(metadata.fieldStates.regularMedications.state, 'value');
  assert.equal(result.normalized.clinicalInput.diagnosis, null);
  assert.equal(result.normalized.clinicalInput.symptoms, null);
  assert.equal(metadata.extractorVersion, null);
  assert.equal(metadata.verification, null);
});

test('rechaza fechas imposibles o ambiguas sin corregirlas silenciosamente', () => {
  assert.equal(normalizeDate('29/02/2024'), '2024-02-29');
  for (const text of ['29/02/2025', '31/04/2026', '2026-13-01', '01/10/26']) {
    assert.equal(normalizeDate(text), null);
  }
  const input = syntheticReport();
  input.fields.studyDate = field('31/04/2026');
  const result = normalizeReport(input);
  assert.equal(result.fieldStates.studyDate.state, 'value');
  assert.equal(result.normalized.attention.studyDate, null);
  assert.ok(result.warnings.some((item) => item.field === 'studyDate' && item.code === 'unrecognized_date'));
});

test('no fabrica identificadores ni admite IDs convertidos a número', () => {
  const input = syntheticReport();
  delete input.fields.externalAttentionId;
  const result = normalizeReport(input);
  assert.equal(result.normalized.attention.externalAttentionId, null);
  assert.ok(result.warnings.some((item) => item.field === 'externalAttentionId'));
  assert.equal(Object.hasOwn(result.normalized.attention, 'patientId'), false);
  assert.equal(Object.hasOwn(result.normalized.procedures[0], 'attentionId'), false);
  input.fields.externalPatientId = field(123);
  assert.throws(() => normalizeReport(input), TypeError);
});

test('advierte sobre origen y fecha de extracción sin revelar valores', () => {
  const input = syntheticReport();
  input.sourceUrl = 'https://example.invalid';
  input.extractedAt = '';
  const result = normalizeReport(input);
  assert.equal(result.normalized.clinicalInput.sourceUrl, null);
  assert.equal(result.normalized.clinicalInput.extractedAt, null);
  assert.ok(result.warnings.some((item) => item.field === 'sourceUrl'));
  assert.ok(result.warnings.some((item) => item.field === 'extractedAt'));
  assert.ok(result.warnings.every((item) => !Object.hasOwn(item, 'value')));
});

test('reconoce etiquetas observadas y conserva prosa con dos puntos dentro de hallazgos', () => {
  const original = field('Diagnóstico: Texto sintético\nSintomatología:\nOtros: no\nHallazgos: Primera línea\nMedición sintética: 12\nOtra línea');
  const result = parseObservations(original);
  assert.equal(result.fields.diagnosis.value, 'Texto sintético');
  assert.equal(result.fields.symptoms.value, '');
  assert.equal(result.fields.other.value, 'no');
  assert.equal(result.fields.findings.value, 'Primera línea\nMedición sintética: 12\nOtra línea');
  assert.equal(result.fields.medicalHistory.found, false);
  assert.deepEqual(result.additionalFields, [{ label: 'Medición sintética', field: field('12\nOtra línea') }]);
  assert.ok(result.warnings.some((item) => item.code === 'unrecognized_label_or_clinical_prose'));
});

test('no elige un valor cuando hay etiquetas repetidas', () => {
  const result = parseObservations(field('Otros: Texto A\nOtros: Texto B'));
  assert.equal(result.fields.other.found, false);
  assert.deepEqual(result.additionalFields.map((item) => item.field.value), ['Texto A', 'Texto B']);
  assert.ok(result.warnings.some((item) => item.field === 'other' && item.code === 'ambiguous_repeated_label'));
});

function syntheticDocument() {
  const snapshot = syntheticReport();
  return {
    fields: { ...snapshot.fields, rawText: field('Otros: no\nHallazgos: Línea sintética\nOtra línea') },
    procedureDescription: field('Ecografía bilateral'),
    attentionPosition: field('Atención 1 de 2'), editorText: field(''),
  };
}

function syntheticTab(readings, urls = [syntheticReport().sourceUrl, syntheticReport().sourceUrl]) {
  return {
    url: async () => urls.shift(),
    playwright: {
      locator: () => ({ waitFor: async () => {} }),
      evaluate: async () => readings.shift(),
    },
  };
}

test('integra lectura y normalización sin dividir un procedimiento bilateral', async () => {
  const document = syntheticDocument();
  const result = await extractReport(syntheticTab([structuredClone(document), document]));
  assert.equal(result.normalized.procedures.length, 1);
  assert.equal(result.normalized.procedures[0].name, 'Ecografía bilateral');
  assert.equal(result.normalized.clinicalInput.findings, 'Línea sintética\nOtra línea');
  assert.equal(result.fieldStates.editorText.state, 'empty');
  assert.equal(result.verification.identicalReads, true);
  assert.equal(result.verification.verifiedAttentionIdentity, false);
  assert.ok(result.warnings.some((item) => item.code === 'no_verified_attention_identity'));
  const metadata = result.normalized.clinicalInput.extractionMetadata;
  assert.deepEqual(metadata.fieldStates, result.fieldStates);
  assert.deepEqual(metadata.warnings, result.warnings);
  assert.deepEqual(metadata.verification, result.verification);
  assert.match(metadata.extractorVersion, /^faro-gestion\//);
  assert.equal(metadata.fieldStates.editorText.state, 'empty');
  assert.ok(metadata.warnings.some((item) => item.code === 'multiple_procedure_layout_not_verified'));
  // La copia destinada a persistencia no cambia al modificar la salida de diagnóstico.
  result.fieldStates.editorText.state = 'value';
  result.warnings.push({ field: 'test', code: 'synthetic_warning' });
  result.verification.identicalReads = false;
  assert.equal(metadata.fieldStates.editorText.state, 'empty');
  assert.equal(metadata.verification.identicalReads, true);
  assert.ok(!metadata.warnings.some((item) => item.code === 'synthetic_warning'));
});

test('descarta una extracción si cambia la cabecera, observaciones o posición', async () => {
  for (const changedField of ['fullName', 'rawText', 'attentionPosition']) {
    const first = syntheticDocument();
    const second = structuredClone(first);
    if (changedField === 'attentionPosition') second.attentionPosition = field('Atención 2 de 2');
    else second.fields[changedField] = field('Dato sintético diferente');
    await assert.rejects(extractReport(syntheticTab([first, second])), /cambió durante la lectura/);
  }
});

test('descarta cambios de URL y rechaza una pestaña ajena al portal', async () => {
  const first = syntheticDocument();
  const tab = syntheticTab([first, structuredClone(first)], [syntheticReport().sourceUrl, 'https://example.invalid']);
  await assert.rejects(extractReport(tab), /cambió durante la lectura/);
  await assert.rejects(extractReport(syntheticTab([], ['https://example.invalid'])), /no corresponde/);
});

test('selecciona solo el navegador de Codex y rechaza pestañas ambiguas', async () => {
  let selected;
  const cua = {
    listTabs: async (options) => {
      assert.equal(options.browser, 'iab');
      return [{ id: 'report', url: syntheticReport().sourceUrl }, { id: 'other', url: 'https://example.invalid' }];
    },
    getTab: async (id, options) => { selected = { id, options }; return selected; },
  };
  await getReportTab(cua);
  assert.equal(selected.id, 'report');
  assert.equal(selected.options.browser, 'iab');
  cua.listTabs = async () => [{ id: 'a', url: syntheticReport().sourceUrl }, { id: 'b', url: syntheticReport().sourceUrl }];
  await assert.rejects(getReportTab(cua), /coincidencias: 2/);
});

test('vincula el ID de la lista sin afirmar identidad comprobada en la sesión', async () => {
  const document = syntheticDocument();
  const result = await extractReport(syntheticTab([structuredClone(document), document]));
  const row = {
    externalAttentionId: '000456', fullName: 'Paciente sintético',
    attendedAtText: '2026-09-30 12:00:00', procedureName: 'Ecografía bilateral', priority: 'Normal',
  };
  attachWorklist(result, row);
  assert.equal(result.normalized.attention.externalAttentionId, '000456');
  assert.equal(result.fieldStates.externalAttentionId.source, 'worklist');
  assert.equal(result.verification.rowMatchesHeader, true);
  assert.equal(result.verification.verifiedAttentionIdentity, false);
  assert.ok(!result.warnings.some((item) => item.field === 'externalAttentionId'));
  assert.deepEqual(result.normalized.clinicalInput.extractionMetadata.verification, result.verification);
  for (const change of [{ fullName: 'Otro paciente sintético' }, { procedureName: 'Otro procedimiento' }, { attendedAtText: '2026-10-01 12:00:00' }]) {
    assert.throws(() => attachWorklist(result, { ...row, ...change }), /no coincide/);
  }
});
