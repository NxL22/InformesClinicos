const { DataTypes } = require('sequelize');

function defineTemplate(sequelize) {
  return sequelize.define(
    'Template',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false },
      procedureName: DataTypes.STRING,
      anatomicalRegion: DataTypes.STRING,
      laterality: DataTypes.STRING(30),
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'templates' },
  );
}

module.exports = { defineTemplate };
