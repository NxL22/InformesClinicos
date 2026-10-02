const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { normalizeReport } = require('../src/extraction/normalize-report');
const { attachWorklist } = require('../src/extraction/faro/collect-attention');
const { importFaroAttention, getFaroAttention } = require('../src/services/imports/faro-import.service');
const models = require('../src/models');
const { sequelize, Patient, Attention, Procedure, ClinicalInput, Template, TemplateVersion,
  Generation, Report, ReportVersion, ReportProcedure, StudyFile } = models;
after(() => sequelize.close());

test('importación atómica, reintento sin duplicados y lectura del respaldo', async () => {
  const transaction = await sequelize.transaction();
  const dbOptions = { transaction };
  const patientKey = `synthetic-${randomUUID()}`;
  const attentionKey = `synthetic-${randomUUID()}`;
  try {
    const field = (value) => ({ found: true, value });
    const extraction = normalizeReport({
      sourceUrl: 'https://farogestion.cl/modulorad/editor/editormulti.html',
      extractedAt: '2026-10-01T12:00:00.000Z',
      fields: {
        fullName: field('Paciente^Sintético'), externalPatientId: field(patientKey),
        studyDate: field('2026-09-30'), symptoms: field(''), other: field('no'),
        rawText: field('Sintomatología:\nOtros: no\nHallazgos: Texto sintético'),
        findings: field('Texto sintético'),
      },
      procedures: { found: true, value: [{ name: field('Procedimiento sintético') }] },
    });
    extraction.verification = { identicalReads: true, verifiedAttentionIdentity: false };
    attachWorklist(extraction, {
      externalAttentionId: attentionKey, fullName: 'Paciente Sintético',
      attendedAtText: '2026-09-30 12:00:00', procedureName: 'Procedimiento sintético',
      priority: 'Normal', modality: 'Sintética', placeCode: 'TEST',
    });
    const first = await importFaroAttention(extraction, dbOptions);
    const second = await importFaroAttention(extraction, dbOptions);
    assert.deepEqual(second, first);
    assert.equal(await Patient.count({ where: { externalPatientId: patientKey }, ...dbOptions }), 1);
    assert.equal(await Procedure.count({ where: { attentionId: first.attentionId }, ...dbOptions }), 1);
    assert.equal(await ClinicalInput.count({ where: { attentionId: first.attentionId }, ...dbOptions }), 1);
    const loaded = await getFaroAttention(attentionKey, dbOptions);
    assert.equal(loaded.patient.externalPatientId, patientKey);
    assert.equal(loaded.attention.externalAttentionId, attentionKey);
    assert.equal(loaded.clinicalInput.other, 'no');
    assert.equal(loaded.clinicalInput.symptoms, null);
    assert.equal(loaded.clinicalInput.extractionMetadata.fieldStates.symptoms.state, 'empty');
    assert.equal(loaded.attention.sourceMetadata.reportDateOrigin, 'browser_current_date');

    const changed = structuredClone(extraction);
    changed.normalized.clinicalInput.rawText = 'Nuevo texto sintético';
    await assert.rejects(importFaroAttention(changed, dbOptions), /Cambió el contenido clínico/);
    assert.equal((await getFaroAttention(attentionKey, dbOptions)).clinicalInput.rawText, loaded.clinicalInput.rawText);

    const wrongPatient = structuredClone(extraction);
    const rejectedKey = `synthetic-${randomUUID()}`;
    wrongPatient.normalized.patient.externalPatientId = rejectedKey;
    await assert.rejects(importFaroAttention(wrongPatient, dbOptions), /otro paciente/);
    assert.equal(await Patient.count({ where: { externalPatientId: rejectedKey }, ...dbOptions }), 0);
  } finally { await transaction.rollback(); }
});

test('esquema migrado compatible con todos los modelos', async () => {
  await sequelize.authenticate();
  const qi = sequelize.getQueryInterface();
  for (const model of Object.values(sequelize.models)) {
    const columns = await qi.describeTable(model.tableName);
    for (const attribute of Object.values(model.rawAttributes)) {
      assert.ok(columns[attribute.field], `${model.tableName}.${attribute.field} debe existir`);
    }
  }
});

test('recorrido clínico y restricciones entre atenciones, sin conservar datos de prueba', async () => {
  const transaction = await sequelize.transaction();
  const options = { transaction };
  async function rejected(operation, expectedCode) {
    const expectedCodes = Array.isArray(expectedCode) ? expectedCode : [expectedCode];
    // Cada violación usa un savepoint para no invalidar la transacción completa.
    await assert.rejects(sequelize.transaction({ transaction }, async (savepoint) => {
      await operation({ transaction: savepoint });
    }), (error) => expectedCodes.includes(error.original?.code));
  }
  try {
    const patient = await Patient.create({ externalPatientId: `test-${randomUUID()}`, fullName: 'Paciente sintético' }, options);
    const attention = await Attention.create({ patientId: patient.id, studyDate: '2026-09-23', ageAtStudy: '35 años 11 meses' }, options);
    const anotherAttention = await Attention.create({ patientId: patient.id, studyDate: '2026-09-24' }, options);
    const procedure = await Procedure.create({ attentionId: attention.id, name: 'Ecografía bilateral' }, options);
    const secondProcedure = await Procedure.create({ attentionId: attention.id, name: 'Otro procedimiento' }, options);
    const foreignProcedure = await Procedure.create({ attentionId: anotherAttention.id, name: 'Procedimiento de otra atención' }, options);
    const candidate = normalizeReport({
      fields: {
        rawText: { found: true, value: 'Síntomas:\nOtros: no' },
        symptoms: { found: true, value: '' },
        other: { found: true, value: 'no' },
      },
    }).normalized.clinicalInput;
    const input = await ClinicalInput.create({ ...candidate, attentionId: attention.id }, options);
    await input.reload(options);
    assert.equal(input.diagnosis, null);
    assert.equal(input.symptoms, null);
    assert.equal(input.other, 'no');
    assert.deepEqual(input.extractionMetadata, candidate.extractionMetadata);
    assert.equal(input.extractionMetadata.fieldStates.diagnosis.state, 'missing');
    assert.equal(input.extractionMetadata.fieldStates.symptoms.state, 'empty');
    assert.equal(input.extractionMetadata.fieldStates.other.state, 'value');
    assert.ok(input.extractionMetadata.warnings.some((item) => item.field === 'externalAttentionId'));
    const template = await Template.create({ name: 'Plantilla de prueba' }, options);
    const templateVersion = await TemplateVersion.create({ templateId: template.id, version: 1,
      instructions: 'Instrucciones de prueba', outputStructure: { sections: ['hallazgos'] } }, options);
    const generation = await Generation.create({ attentionId: attention.id, templateVersionId: templateVersion.id,
      provider: 'test', model: 'test', inputSnapshot: { other: 'texto de prueba' }, finalPrompt: 'Prompt de prueba' }, options);
    const report = await Report.create({ attentionId: attention.id, reportDate: '2026-09-25' }, options);
    await ReportVersion.create({ attentionId: attention.id, reportId: report.id, generationId: generation.id, version: 1, content: 'Borrador de prueba' }, options);
    for (const item of [procedure, secondProcedure]) {
      await ReportProcedure.create({ attentionId: attention.id, reportId: report.id, procedureId: item.id }, options);
    }
    const loaded = await Report.findByPk(report.id, { ...options, include: ['procedures', 'versions'] });
    assert.equal(loaded.procedures.length, 2);
    assert.equal(loaded.versions.length, 1);
    assert.equal(loaded.reportDate, '2026-09-25');
    await rejected((o) => ReportProcedure.create({ attentionId: attention.id, reportId: report.id, procedureId: foreignProcedure.id }, o), '23503');
    await rejected((o) => StudyFile.create({ attentionId: attention.id, procedureId: foreignProcedure.id, kind: 'image', storageKey: 'test/image' }, o), '23503');
    await rejected((o) => Patient.create({ externalPatientId: patient.externalPatientId, fullName: 'Duplicado' }, o), '23505');
    await rejected((o) => TemplateVersion.create({ templateId: template.id, version: 1,
      instructions: 'Duplicada', outputStructure: {} }, o), '23505');
    await rejected((o) => ReportVersion.create({ attentionId: attention.id, reportId: report.id, version: 2, content: 'Prueba', approvedAt: new Date() }, o), '23514');
    // PostgreSQL 18 informa RESTRICT con 23001; versiones anteriores usan 23503.
    await rejected((o) => patient.destroy(o), ['23503', '23001']);
  } finally {
    await transaction.rollback();
  }
});
