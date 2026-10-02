function hasManyWithInverse(parent, child, foreignKey, as, inverseAs) {
  parent.hasMany(child, { foreignKey, as, onDelete: 'RESTRICT' });
  child.belongsTo(parent, { foreignKey, as: inverseAs, onDelete: 'RESTRICT' });
}

// Se invoca cuando todos los modelos ya están definidos, evitando dependencias circulares.
function associateModels(models) {
  const {
    User,
    Patient,
    Attention,
    Procedure,
    ClinicalInput,
    Template,
    TemplateVersion,
    Generation,
    Report,
    ReportVersion,
    ReportProcedure,
    StudyFile,
  } = models;

  // Pacientes, atenciones e información clínica.
  hasManyWithInverse(Patient, Attention, 'patientId', 'attentions', 'patient');
  hasManyWithInverse(Attention, Procedure, 'attentionId', 'procedures', 'attention');
  Attention.hasOne(ClinicalInput, {
    foreignKey: 'attentionId',
    as: 'clinicalInput',
    onDelete: 'RESTRICT',
  });
  ClinicalInput.belongsTo(Attention, {
    foreignKey: 'attentionId',
    as: 'attention',
    onDelete: 'RESTRICT',
  });

  // Plantillas y generaciones.
  hasManyWithInverse(Template, TemplateVersion, 'templateId', 'versions', 'template');
  hasManyWithInverse(Attention, Generation, 'attentionId', 'generations', 'attention');
  hasManyWithInverse(
    TemplateVersion,
    Generation,
    'templateVersionId',
    'generations',
    'templateVersion',
  );
  hasManyWithInverse(User, Generation, 'requestedById', 'generations', 'requestedBy');

  // Informes, sus versiones y responsables.
  hasManyWithInverse(Attention, Report, 'attentionId', 'reports', 'attention');
  hasManyWithInverse(Report, ReportVersion, 'reportId', 'versions', 'report');
  hasManyWithInverse(Generation, ReportVersion, 'generationId', 'reportVersions', 'generation');
  hasManyWithInverse(User, ReportVersion, 'createdById', 'createdReportVersions', 'createdBy');
  hasManyWithInverse(User, ReportVersion, 'approvedById', 'approvedReportVersions', 'approvedBy');
  ReportVersion.belongsTo(Attention, {
    foreignKey: 'attentionId',
    as: 'attention',
    onDelete: 'RESTRICT',
  });

  // Procedimientos incluidos en cada informe.
  ReportProcedure.belongsTo(Attention, {
    foreignKey: 'attentionId',
    as: 'attention',
    onDelete: 'RESTRICT',
  });
  Report.belongsToMany(Procedure, {
    through: ReportProcedure,
    foreignKey: 'reportId',
    otherKey: 'procedureId',
    as: 'procedures',
    onDelete: 'RESTRICT',
  });
  Procedure.belongsToMany(Report, {
    through: ReportProcedure,
    foreignKey: 'procedureId',
    otherKey: 'reportId',
    as: 'reports',
    onDelete: 'RESTRICT',
  });

  // Imágenes y adjuntos.
  hasManyWithInverse(Attention, StudyFile, 'attentionId', 'files', 'attention');
  hasManyWithInverse(Procedure, StudyFile, 'procedureId', 'files', 'procedure');
}

module.exports = { associateModels };
