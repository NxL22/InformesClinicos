const { DataTypes } = require('sequelize');

function defineUser(sequelize) {
  return sequelize.define(
    'User',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      fullName: { type: DataTypes.STRING, allowNull: false },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      passwordHash: { type: DataTypes.TEXT, allowNull: false },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['assistant', 'physician']] },
      },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'users' },
  );
}

module.exports = { defineUser };
