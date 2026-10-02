'use strict';

// Estas etiquetas corresponden al bloque observado; no interpretamos abreviaturas.
const LABELS = new Map([
  ['diagnostico', 'diagnosis'], ['sintomatologia', 'symptoms'],
  ['antecedentes morbidos importantes', 'medicalHistory'],
  ['medicamentos que toma en forma habitual', 'regularMedications'],
  ['cirugias previas', 'previousSurgeries'], ['examenes previos', 'previousExams'],
  ['otros', 'other'], ['hallazgos', 'findings'],
]);
const labelKey = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function parseObservations(rawText) {
  const fields = Object.fromEntries(Array.from(LABELS.values()).map((name) => [name, { found: false }]));
  const additionalFields = [];
  const warnings = [];
  if (!rawText.found) return { fields, additionalFields, warnings };
  const sections = [];
  let section = null;
  let additionalSection = null;
  // El original permanece intacto; separar líneas solo sirve para reconocer etiquetas.
  const lines = rawText.value.split(/\r?\n/);
  for (const line of lines) {
    const match = /^([^:\r\n]{1,100}):[ \t]?(.*)$/.exec(line);
    const name = match ? LABELS.get(labelKey(match[1])) : null;
    if (name) {
      section = { name, label: match[1], lines: [match[2]] };
      sections.push(section);
      additionalSection = null;
    } else {
      if (section) section.lines.push(line);
      if (match) {
        // Una línea con ':' también puede ser prosa clínica: no la cortamos del campo.
        additionalSection = { label: match[1], field: { found: true, value: match[2] } };
        additionalFields.push(additionalSection);
        warnings.push({ field: 'additionalFields', code: 'unrecognized_label_or_clinical_prose' });
      } else if (additionalSection) {
        additionalSection.field.value += `\n${line}`;
      } else if (!section && line.trim()) {
        additionalSection = { label: 'Texto sin etiqueta reconocida', field: { found: true, value: line } };
        additionalFields.push(additionalSection);
      }
    }
  }
  for (const name of LABELS.values()) {
    const matches = sections.filter((item) => item.name === name);
    if (matches.length === 1) fields[name] = { found: true, value: matches[0].lines.join('\n') };
    if (matches.length > 1) {
      // No elegimos silenciosamente entre valores repetidos y potencialmente distintos.
      warnings.push({ field: name, code: 'ambiguous_repeated_label' });
      for (const item of matches) additionalFields.push({ label: item.label, field: { found: true, value: item.lines.join('\n') } });
    }
  }
  return { fields, additionalFields, warnings };
}

module.exports = { parseObservations };
