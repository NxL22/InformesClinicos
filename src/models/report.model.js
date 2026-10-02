const { DataTypes } = require('sequelize');

function defineReport(sequelize) {
  return sequelize.define(
    'Report',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      attentionId: { type: DataTypes.UUID, allowNull: false },
      externalReportId: DataTypes.STRING,
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'draft',
        validate: {
          isIn: [['draft', 'in_review', 'approved', 'send_pending', 'sent', 'rejected']],
        },
      },
      reportDate: DataTypes.DATEONLY,
      sentAt: DataTypes.DATE,
    },
    { tableName: 'reports', indexes: [{ fields: ['attention_id'] }] },
  );
}

module.exports = { defineReport };
