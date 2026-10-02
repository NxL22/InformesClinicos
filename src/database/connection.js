const { Sequelize } = require('sequelize');
const { config } = require('../config/env');
const { database } = config;

const sequelize = new Sequelize(database.database, database.username, database.password, {
  dialect: 'postgres',
  host: database.host,
  port: database.port,
  logging: false,
  dialectOptions: database.ssl ? { ssl: { rejectUnauthorized: true } } : {},
  pool: { max: 5, min: 0, acquire: 10000, idle: 10000 },
  define: { underscored: true, timestamps: true },
});

module.exports = { sequelize };
