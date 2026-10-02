const { DataTypes } = require('sequelize');

function defineReportProcedure(sequelize) {
  return sequelize.define(
    'ReportProcedure',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      attentionId: { type: DataTypes.UUID, allowNull: false },
      reportId: { type: DataTypes.UUID, allowNull: false },
      procedureId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'report_procedures',
      indexes: [{ unique: true, fields: ['report_id', 'procedure_id'] }],
    },
  );
}

module.exports = { defineReportProcedure };
