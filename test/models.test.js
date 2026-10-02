const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');
after(() => models.sequelize.close());

test('conserva ceros del identificador externo y texto clínico fuera de hallazgos', async () => {
  const patient = models.Patient.build({ externalPatientId: '0012345', fullName: 'Paciente sintético' });
  await patient.validate();
  assert.equal(patient.externalPatientId, '0012345');
  const input = models.ClinicalInput.build({
    attentionId: '00000000-0000-4000-8000-000000000001',
    other: 'Observación adicional', rawText: 'Otros: Observación adicional',
  });
  await input.validate();
  assert.equal(input.findings, undefined);
  assert.equal(input.other, 'Observación adicional');
});

test('el informe admite varios procedimientos y aprobación por versión', () => {
  assert.equal(models.Report.associations.procedures.associationType, 'BelongsToMany');
  assert.equal(models.Report.associations.versions.associationType, 'HasMany');
  assert.ok(models.ReportVersion.rawAttributes.approvedById);
  assert.ok(models.Generation.rawAttributes.templateVersionId);
});
