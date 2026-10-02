const { DataTypes } = require('sequelize');

function defineAttention(sequelize) {
  return sequelize.define(
    'Attention',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      patientId: { type: DataTypes.UUID, allowNull: false },
      sourceSystem: { type: DataTypes.STRING, allowNull: false, defaultValue: 'external_portal' },
      externalAttentionId: DataTypes.STRING,
      studyDate: { type: DataTypes.DATEONLY, allowNull: false },
      ageAtStudy: DataTypes.STRING,
      ageYears: { type: DataTypes.INTEGER, validate: { min: 0 } },
      ageMonths: { type: DataTypes.INTEGER, validate: { min: 0, max: 11 } },
      centerName: DataTypes.STRING,
      priority: DataTypes.STRING,
      sourceMetadata: DataTypes.JSONB,
    },
    {
      tableName: 'attentions',
      indexes: [
        { fields: ['patient_id', 'study_date'] },
        { unique: true, fields: ['source_system', 'external_attention_id'] },
      ],
    },
  );
}

module.exports = { defineAttention };
