'use strict';

// La lectura del portal entrega cada campo como { found, value }.
// Este módulo no conoce selectores ni accede al navegador o a PostgreSQL.
const FIELD_NAMES = [
  'fullName', 'externalPatientId', 'ageAtStudy', 'externalAttentionId',
  'studyDate', 'reportDate', 'centerName', 'externalReportId',
  'diagnosis', 'symptoms', 'medicalHistory', 'regularMedications',
  'previousSurgeries', 'previousExams', 'other', 'findings', 'rawText',
];
const CLINICAL_NAMES = FIELD_NAMES.slice(8);

function normalizeDate(value) {
  if (value === null) return null;
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!iso && !local) return null;
  const [year, month, day] = iso ? iso.slice(1) : [local[3], local[2], local[1]];
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (!Number(year) || !Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === `${year}-${month}-${day}`
    ? `${year}-${month}-${day}` : null;
}

function normalizeReport(snapshot) {
  const raw = structuredClone(snapshot);
  const fieldStates = {};
  const warnings = [];
  const warn = (field, code) => warnings.push({ field, code });

  // Los avisos describen problemas, nunca incluyen el valor clínico o identificable.
  function read(field, path, required = false) {
    if (!field || field.found === false) {
      fieldStates[path] = { state: 'missing' };
      if (required) warn(path, 'missing_field');
      return null;
    }
    if (field.found !== true || typeof field.value !== 'string') {
      throw new TypeError(`El campo ${path} requiere { found: boolean, value: string }.`);
    }
    const empty = field.value.trim() === '';
    fieldStates[path] = { state: empty ? 'empty' : 'value' };
    if (empty && required) warn(path, 'empty_field');
    // Se conserva el texto original, incluidos saltos de línea y respuestas como "no".
    return empty ? null : field.value;
  }

  const values = {};
  for (const name of FIELD_NAMES) {
    values[name] = read(raw.fields?.[name], name,
      ['fullName', 'externalPatientId', 'externalAttentionId', 'studyDate', 'rawText'].includes(name));
  }
  for (const name of ['studyDate', 'reportDate']) {
    const date = normalizeDate(values[name]);
    if (values[name] !== null && date === null) warn(name, 'unrecognized_date');
    values[name] = date;
  }

  const procedures = [];
  const procedureField = raw.procedures;
  if (!procedureField || procedureField.found === false) {
    fieldStates.procedures = { state: 'missing' };
    warn('procedures', 'missing_field');
  } else {
    if (procedureField.found !== true || !Array.isArray(procedureField.value)) {
      throw new TypeError('procedures requiere { found: boolean, value: array }.');
    }
    fieldStates.procedures = { state: procedureField.value.length ? 'value' : 'empty' };
    if (!procedureField.value.length) warn('procedures', 'empty_field');
    for (const [index, item] of procedureField.value.entries()) {
      const procedure = {};
      for (const name of ['name', 'externalProcedureId', 'anatomicalRegion', 'laterality', 'modality']) {
        procedure[name] = read(item[name], `procedures.${index}.${name}`, name === 'name');
      }
      // Una descripción bilateral sigue siendo un procedimiento; no inferimos anatomía.
      procedures.push(procedure);
    }
  }

  const additionalFields = (raw.additionalFields || []).map((item, index) => {
    if (typeof item.label !== 'string') throw new TypeError('Cada campo adicional requiere una etiqueta textual.');
    return { label: item.label, value: read(item.field, `additionalFields.${index}`) };
  });
  let extractedAt = null;
  if (typeof raw.extractedAt === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw.extractedAt)
    && normalizeDate(raw.extractedAt.slice(0, 10)) !== null
    && Number.isFinite(Date.parse(raw.extractedAt))) {
    extractedAt = new Date(raw.extractedAt).toISOString();
  } else warn('extractedAt', 'missing_or_invalid_timestamp');

  let sourceUrl = null;
  try {
    const url = new URL(raw.sourceUrl);
    if (url.origin === 'https://farogestion.cl' && url.pathname === '/modulorad/editor/editormulti.html'
      && !url.username && !url.password) sourceUrl = url.href;
  } catch { /* Un origen ausente o inválido queda registrado como advertencia. */ }
  if (sourceUrl === null) warn('sourceUrl', 'missing_or_unexpected_source');

  // Son candidatos de atributos, no instancias Sequelize ni registros listos para insertar.
  // patientId y attentionId se resolverán al persistir; nunca se inventan claves locales.
  const patient = { sourceSystem: 'faro_gestion', externalPatientId: values.externalPatientId, fullName: values.fullName };
  const attention = {
    sourceSystem: 'faro_gestion', externalAttentionId: values.externalAttentionId,
    studyDate: values.studyDate, ageAtStudy: values.ageAtStudy, centerName: values.centerName,
  };
  const clinicalInput = Object.fromEntries(CLINICAL_NAMES.map((name) => [name, values[name]]));
  Object.assign(clinicalInput, { additionalFields, sourceUrl, extractedAt });
  // Aunque vacío y faltante se mapean a NULL, sus estados quedan disponibles al persistir.
  clinicalInput.extractionMetadata = {
    fieldStates: structuredClone(fieldStates),
    warnings: structuredClone(warnings),
    extractorVersion: null,
    verification: null,
  };
  const report = { externalReportId: values.externalReportId, reportDate: values.reportDate };
  return {
    raw,
    normalized: { patient, attention, procedures, clinicalInput, report },
    fieldStates,
    warnings,
  };
}

module.exports = { normalizeDate, normalizeReport };
