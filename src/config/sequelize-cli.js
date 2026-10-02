const { config } = require('./env');
const { database } = config;

const connection = {
  dialect: 'postgres',
  host: database.host,
  port: database.port,
  database: database.database,
  username: database.username,
  password: database.password,
  logging: false,
  dialectOptions: database.ssl ? { ssl: { rejectUnauthorized: true } } : {},
};

module.exports = { [config.nodeEnv]: connection };
