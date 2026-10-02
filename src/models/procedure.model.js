const { DataTypes } = require('sequelize');

function defineProcedure(sequelize) {
  return sequelize.define(
    'Procedure',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      attentionId: { type: DataTypes.UUID, allowNull: false },
      externalProcedureId: DataTypes.STRING,
      name: { type: DataTypes.TEXT, allowNull: false },
      anatomicalRegion: DataTypes.STRING,
      laterality: DataTypes.STRING(30),
      modality: DataTypes.STRING(30),
    },
    { tableName: 'procedures', indexes: [{ fields: ['attention_id'] }] },
  );
}

module.exports = { defineProcedure };
