const { DataTypes } = require('sequelize');

function defineGeneration(sequelize) {
  return sequelize.define(
    'Generation',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      attentionId: { type: DataTypes.UUID, allowNull: false },
      templateVersionId: { type: DataTypes.UUID, allowNull: false },
      requestedById: DataTypes.UUID,
      provider: { type: DataTypes.STRING, allowNull: false },
      model: { type: DataTypes.STRING, allowNull: false },
      inputSnapshot: { type: DataTypes.JSONB, allowNull: false },
      finalPrompt: { type: DataTypes.TEXT, allowNull: false },
      responseText: DataTypes.TEXT,
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'running', 'completed', 'failed']] },
      },
      errorCode: DataTypes.STRING,
      providerRequestId: DataTypes.STRING,
      completedAt: DataTypes.DATE,
    },
    { tableName: 'generations', indexes: [{ fields: ['attention_id'] }] },
  );
}

module.exports = { defineGeneration };
