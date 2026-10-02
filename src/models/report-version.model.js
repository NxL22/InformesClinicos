const { DataTypes } = require('sequelize');

function defineReportVersion(sequelize) {
  return sequelize.define(
    'ReportVersion',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      attentionId: { type: DataTypes.UUID, allowNull: false },
      reportId: { type: DataTypes.UUID, allowNull: false },
      generationId: DataTypes.UUID,
      version: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
      content: { type: DataTypes.TEXT, allowNull: false },
      createdById: DataTypes.UUID,
      approvedById: DataTypes.UUID,
      approvedAt: DataTypes.DATE,
      reviewNotes: DataTypes.TEXT,
    },
    { tableName: 'report_versions', indexes: [{ unique: true, fields: ['report_id', 'version'] }] },
  );
}

module.exports = { defineReportVersion };
