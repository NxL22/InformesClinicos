const { DataTypes } = require('sequelize');

function definePatient(sequelize) {
  return sequelize.define(
    'Patient',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      sourceSystem: { type: DataTypes.STRING, allowNull: false, defaultValue: 'external_portal' },
      externalPatientId: { type: DataTypes.STRING, allowNull: false },
      fullName: { type: DataTypes.TEXT, allowNull: false },
      birthDate: DataTypes.DATEONLY,
    },
    {
      tableName: 'patients',
      indexes: [{ unique: true, fields: ['source_system', 'external_patient_id'] }],
    },
  );
}

module.exports = { definePatient };
