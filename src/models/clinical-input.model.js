const { DataTypes } = require('sequelize');

function defineClinicalInput(sequelize) {
  return sequelize.define(
    'ClinicalInput',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      attentionId: { type: DataTypes.UUID, allowNull: false, unique: true },
      diagnosis: DataTypes.TEXT,
      symptoms: DataTypes.TEXT,
      medicalHistory: DataTypes.TEXT,
      regularMedications: DataTypes.TEXT,
      previousSurgeries: DataTypes.TEXT,
      previousExams: DataTypes.TEXT,
      other: DataTypes.TEXT,
      findings: DataTypes.TEXT,
      rawText: { type: DataTypes.TEXT, allowNull: false },
      additionalFields: DataTypes.JSONB,
      sourceUrl: DataTypes.TEXT,
      extractedAt: DataTypes.DATE,
    },
    { tableName: 'clinical_inputs' },
  );
}

module.exports = { defineClinicalInput };
