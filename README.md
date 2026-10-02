# Informes clínicos — backend

Base de una API en JavaScript, Node.js (22 o superior), Express, PostgreSQL y Sequelize 6.
No incluye todavía rutas de negocio, autenticación operativa ni llamadas a proveedores de IA.
Las futuras llamadas HTTP pueden usar `fetch` nativo; no se instala Axios.

El primer extractor de lectura de Faro Gestión funciona sobre la pestaña existente
del navegador de Codex. Su ejecución, campos verificados y limitaciones están
documentados en [docs/faro-extraction.md](docs/faro-extraction.md).
El primer ciclo de respaldo en PostgreSQL y la consulta de los datos guardados
están en [docs/faro-first-cycle.md](docs/faro-first-cycle.md).

## Configuración e inicio

1. Ejecutar `npm ci`.
2. Copiar `.env.example` a `.env` si todavía no existe y completar `DB_USER` y `DB_PASSWORD`.
3. Verificar que PostgreSQL esté activo en `DB_HOST:DB_PORT`.
4. Ejecutar `npm run db:init` para crear la base y aplicar las migraciones.
5. Ejecutar `npm start`, o `npm run dev` para reiniciar al cambiar el código.

El servidor escucha por defecto en `http://127.0.0.1:3000` después de autenticar la conexión.
Cualquier URL devuelve JSON con estado 404 mientras no haya rutas de negocio.
El arranque no ejecuta `sync`, no altera tablas y no aplica migraciones automáticamente.

`db:create` se conecta a `DB_MAINTENANCE_NAME` (por defecto `postgres`) con las credenciales
configuradas y necesita permiso `CREATEDB`. Si la base ya existe, se conserva.
Si un administrador la crea previamente, alcanza con ejecutar `npm run db:migrate`.
En conexiones con `DB_SSL=true`, se verifica el certificado del servidor.
La configuración no incluye credenciales de proveedores de IA porque todavía no se usan.

## Modelo inicial

- `users`: cuentas de médica y asistente; solo estructura, sin login ni usuarios precargados.
- `patients`: ID UUID interno, ID externo textual por sistema de origen y nombre original.
- `attentions`: paciente, ID externo de atención, fecha del estudio y edad registrada.
- `procedures`: uno o varios procedimientos por atención; región y lateralidad opcionales.
- `clinical_inputs`: campos clínicos, `other`, `findings`, texto original completo y campos adicionales JSONB.
  `extraction_metadata` conserva estados por campo, advertencias, versión del extractor y comprobación
  de consistencia. Los registros previos quedan con NULL porque esos metadatos no se pueden reconstruir.
- `templates` / `template_versions`: selección de plantilla e instrucciones, estructura y variables por versión.
- `generations`: versión de plantilla, copia de los datos de entrada, prompt final, proveedor, modelo y resultado.
- `reports` / `report_versions`: informe, fecha propia, versiones del texto y aprobación de una versión concreta.
  Las versiones llevan `attentionId` para impedir vincular una generación de otra atención.
- `report_procedures`: procedimientos incluidos en un informe. Al insertar, indicar también `attentionId`;
  las claves compuestas garantizan que informe y procedimientos pertenezcan a la misma atención.
- `study_files`: relación preparada para imágenes y adjuntos; solo metadatos y clave de almacenamiento.

Los IDs UUID se generan en los modelos Sequelize. Las inserciones SQL directas deben proporcionarlos.
No se deduplica por nombre ni se calcula una fecha de nacimiento a partir de una edad aproximada.
La deduplicación de atenciones usa el ID externo cuando está disponible; si falta, deberá resolverla
el importador futuro. Los campos clínicos ausentes quedan en NULL: no equivalen a una respuesta negativa.
La observación clínica es un bloque por atención; su extracción por procedimiento se incorporará
cuando la estructura real de la fuente lo permita.

No hay datos clínicos reales precargados. `img/`, `.env`, `storage/` y los logs se excluyen de Git.
Se fija la dependencia transitiva `uuid` de Sequelize en la serie 11.1.1 o posterior de la versión 11,
compatible con CommonJS, para incorporar la corrección de seguridad de esa dependencia.
Las transiciones del informe, autorización de la médica, inmutabilidad de versiones aprobadas y
confirmación de envío se implementarán en los servicios de negocio, antes de habilitar esas operaciones.

## Comandos

```sh
npm run db:status  # Consultar migraciones aplicadas
npm test          # Validaciones de configuración y modelos; no requiere una conexión
npm run test:db   # Verificar esquema y relaciones contra la base configurada
```

Las pruebas de base utilizan datos sintéticos dentro de una transacción que siempre se revierte.
`npm run db:undo` revierte la última migración; la migración inicial elimina todas las tablas
de la aplicación. Reservar ese comando para bases de desarrollo descartables.

## Directorios

```text
src/
  app.js                  Aplicación HTTP sin rutas de negocio
  server.js               Conexión, escucha y cierre ordenado
  config/                 Variables de entorno y configuración del CLI
  database/connection.js  Instancia de Sequelize
  database/migrations/    Esquema versionado
  models/
    *.model.js            Un archivo por entidad: atributos, validaciones e índices
    associations.js       Relaciones entre los modelos
    index.js              Inicializa los modelos, registra relaciones y los exporta
scripts/                  Creación idempotente de la base
test/                     Verificaciones locales e integración con PostgreSQL
```

Referencia: [documentación oficial de Sequelize 6](https://sequelize.org/docs/v6/).

Cada archivo `*.model.js` exporta una función `defineNombre(sequelize)` y no importa otros
modelos ni la conexión global. `models/index.js` define todas las entidades sobre la misma
instancia, llama a `associateModels(models)` y conserva el punto de importación
`require('./models')`. Las relaciones se declaran únicamente en `associations.js`.
