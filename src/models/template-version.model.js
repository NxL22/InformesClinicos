const { DataTypes } = require('sequelize');

function defineTemplateVersion(sequelize) {
  return sequelize.define(
    'TemplateVersion',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      templateId: { type: DataTypes.UUID, allowNull: false },
      version: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
      instructions: { type: DataTypes.TEXT, allowNull: false },
      outputStructure: { type: DataTypes.JSONB, allowNull: false },
      inputVariables: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    },
    {
      tableName: 'template_versions',
      indexes: [{ unique: true, fields: ['template_id', 'version'] }],
    },
  );
}

module.exports = { defineTemplateVersion };
