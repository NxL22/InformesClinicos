const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function port(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} debe ser un puerto entre 1 y 65535.`);
  }
  return parsed;
}

function readConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV debe ser development, test o production.');
  }
  if (env.DB_SSL && !['true', 'false'].includes(env.DB_SSL)) {
    throw new Error('DB_SSL debe ser true o false.');
  }
  return {
    nodeEnv,
    host: env.HOST || '127.0.0.1',
    port: port(env.PORT || '3000', 'PORT'),
    database: {
      host: env.DB_HOST || '127.0.0.1',
      port: port(env.DB_PORT || '5432', 'DB_PORT'),
      database: env.DB_NAME || 'informes_clinicos',
      username: env.DB_USER || 'postgres',
      password: env.DB_PASSWORD || '',
      maintenanceDatabase: env.DB_MAINTENANCE_NAME || 'postgres',
      ssl: env.DB_SSL === 'true',
    },
  };
}

module.exports = { readConfig, config: readConfig() };
