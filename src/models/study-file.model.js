const { DataTypes } = require('sequelize');

function defineStudyFile(sequelize) {
  return sequelize.define(
    'StudyFile',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      attentionId: { type: DataTypes.UUID, allowNull: false },
      procedureId: DataTypes.UUID,
      kind: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [['image', 'video', 'medical_order', 'questionnaire', 'other']] },
      },
      storageKey: { type: DataTypes.TEXT, allowNull: false },
      originalName: DataTypes.TEXT,
      mimeType: DataTypes.STRING,
      byteSize: { type: DataTypes.BIGINT, validate: { min: 0 } },
      sha256: DataTypes.STRING(64),
      externalFileId: DataTypes.STRING,
      sourceMetadata: DataTypes.JSONB,
    },
    { tableName: 'study_files', indexes: [{ fields: ['attention_id'] }] },
  );
}

module.exports = { defineStudyFile };
