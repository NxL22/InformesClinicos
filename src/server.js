const { app } = require('./app');
const { config } = require('./config/env');
const { sequelize } = require('./database/connection');
require('./models');

let server;
let stopping = false;

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await sequelize.close();
    process.exitCode = exitCode;
  } finally {
    clearTimeout(timeout);
  }
  process.exit(exitCode);
}

async function start() {
  await sequelize.authenticate();
  console.log('Conexión a PostgreSQL verificada.');
  server = app.listen(config.port, config.host);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  console.log(`Servidor disponible en http://${config.host}:${config.port}`);
}

process.once('SIGINT', () => shutdown().catch(() => process.exit(1)));
process.once('SIGTERM', () => shutdown().catch(() => process.exit(1)));

start().catch(async (error) => {
  console.error(`No se pudo iniciar el servidor (${error.original?.code || error.code || error.name}). Revisá .env, PostgreSQL y el puerto HTTP.`);
  await shutdown(1);
});
