const express = require('express');
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Las rutas de negocio se incorporarán en la siguiente etapa.
app.use((_req, res) => res.status(404).json({ error: 'Ruta no disponible' }));
app.use((error, _req, res, _next) => {
  const status = error.status === 400 || error.status === 413 ? error.status : 500;
  res.status(status).json({ error: status === 500 ? 'Error interno' : 'Solicitud inválida' });
});

module.exports = { app };
