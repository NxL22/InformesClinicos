const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const models = require('../src/models');
const { sequelize, Patient, Attention, Procedure, ClinicalInput, Template, TemplateVersion,
  Generation, Report, ReportVersion, ReportProcedure, StudyFile } = models;
after(() => sequelize.close());

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
    // Cada violación usa un savepoint para no invalidar la transacción completa.
    await assert.rejects(sequelize.transaction({ transaction }, async (savepoint) => {
      await operation({ transaction: savepoint });
    }), (error) => error.original?.code === expectedCode);
  }
  try {
    const patient = await Patient.create({ externalPatientId: `test-${randomUUID()}`, fullName: 'Paciente sintético' }, options);
    const attention = await Attention.create({ patientId: patient.id, studyDate: '2026-09-23', ageAtStudy: '35 años 11 meses' }, options);
    const anotherAttention = await Attention.create({ patientId: patient.id, studyDate: '2026-09-24' }, options);
    const procedure = await Procedure.create({ attentionId: attention.id, name: 'Ecografía bilateral' }, options);
    const secondProcedure = await Procedure.create({ attentionId: attention.id, name: 'Otro procedimiento' }, options);
    const foreignProcedure = await Procedure.create({ attentionId: anotherAttention.id, name: 'Procedimiento de otra atención' }, options);
    await ClinicalInput.create({ attentionId: attention.id, rawText: 'Otros: texto de prueba', other: 'texto de prueba' }, options);
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
    await rejected((o) => patient.destroy(o), '23503');
  } finally {
    await transaction.rollback();
  }
});
