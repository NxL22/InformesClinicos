const { Client } = require('pg');
const { config } = require('../src/config/env');

async function main() {
  const db = config.database;
  const client = new Client({
    host: db.host,
    port: db.port,
    user: db.username,
    password: db.password,
    database: db.maintenanceDatabase,
    ssl: db.ssl ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db.database]);
    if (rowCount) {
      console.log('La base de datos configurada ya existe.');
      return;
    }
    // Los identificadores SQL no admiten parámetros: se citan y escapan explícitamente.
    const quotedName = '"' + db.database.replaceAll('"', '""') + '"';
    try {
      await client.query(`CREATE DATABASE ${quotedName}`);
      console.log('Base de datos creada.');
    } catch (error) {
      if (error.code !== '42P04') throw error;
      console.log('La base de datos ya fue creada por otro proceso.');
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`No se pudo crear la base de datos (${error.code || error.name}). Revisá la conexión en .env y el permiso CREATEDB del usuario.`);
  process.exitCode = 1;
});
