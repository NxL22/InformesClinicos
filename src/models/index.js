const { sequelize } = require('../database/connection');
const { defineUser } = require('./user.model');
const { definePatient } = require('./patient.model');
const { defineAttention } = require('./attention.model');
const { defineProcedure } = require('./procedure.model');
const { defineClinicalInput } = require('./clinical-input.model');
const { defineTemplate } = require('./template.model');
const { defineTemplateVersion } = require('./template-version.model');
const { defineGeneration } = require('./generation.model');
const { defineReport } = require('./report.model');
const { defineReportVersion } = require('./report-version.model');
const { defineReportProcedure } = require('./report-procedure.model');
const { defineStudyFile } = require('./study-file.model');
const { associateModels } = require('./associations');

const models = {
  User: defineUser(sequelize),
  Patient: definePatient(sequelize),
  Attention: defineAttention(sequelize),
  Procedure: defineProcedure(sequelize),
  ClinicalInput: defineClinicalInput(sequelize),
  Template: defineTemplate(sequelize),
  TemplateVersion: defineTemplateVersion(sequelize),
  Generation: defineGeneration(sequelize),
  Report: defineReport(sequelize),
  ReportVersion: defineReportVersion(sequelize),
  ReportProcedure: defineReportProcedure(sequelize),
  StudyFile: defineStudyFile(sequelize),
};

associateModels(models);

module.exports = { sequelize, ...models };
