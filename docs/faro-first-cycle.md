# Primer ciclo de extracción y respaldo

Implementado y ejecutado para una atención seleccionada explícitamente. El navegador
de Codex conserva el inicio de sesión; PostgreSQL usa el .env local del proyecto.
No se hacen llamadas directas a endpoints de sesión del portal.

## Código y responsabilidades

- `src/extraction/faro/collect-attention.js`: lee la fila por nombre exacto o ID,
  abre Informe por `data-id`, espera el detalle y compara nombre, fecha y procedimiento.
- `src/services/imports/faro-import.service.js`: importación transaccional y consulta
  de paciente, atención, procedimientos e información clínica desde PostgreSQL.
- `scripts/import-faro-attention.js`: carga un JSON local de extracción en la base.
- `scripts/get-faro-attention.js`: lee la base y exporta la respuesta como JSON local.

La separación permite volver a intentar la carga desde el respaldo sin abrir de
nuevo el portal. No hay un proceso independiente que controle Codex desde npm:
el paso de navegador se ejecuta dentro de la integración cua_repl ya conectada.

## Ejecutar la lectura

Con la lista de trabajo abierta en el navegador interno de Codex, seleccionar la
pestaña existente como primer paso del runtime y leer su documentación:

```js
let cycleTab = await cua.getTab(
  { url: 'https://farogestion.cl/modulorad/listatrabajo.html' },
  { browser: 'iab' },
);
```

Luego, en el mismo runtime:

```js
let moduleApi = await import('node:module');
let requireProject = moduleApi.createRequire(
  'C:/Users/neila/Desktop/Nueva carpeta/InformesClinicos/package.json',
);
let collector = requireProject('./src/extraction/faro/collect-attention.js');
let result = await collector.collectAttention(cycleTab, {
  fullName: 'NOMBRE EXACTO DE LA FILA',
  // En los siguientes ciclos, preferir externalAttentionId: 'ID_ATENCION'.
});
let fs = await import('node:fs/promises');
await fs.mkdir('C:/Users/neila/Desktop/Nueva carpeta/InformesClinicos/local-extractions', { recursive: true });
await fs.writeFile(
  'C:/Users/neila/Desktop/Nueva carpeta/InformesClinicos/local-extractions/first-run.json',
  JSON.stringify(result, null, 2), 'utf8',
);
```

Los nombres del ejemplo son marcadores, no datos de pacientes. Para ciclos posteriores,
usar un nombre de respaldo distinto; `first-run.json` identifica esta primera captura.
Si hay varias filas con el mismo nombre, el lector se detiene: seleccionar por ID.
Solo trabaja con filas renderizadas, sin paginar ni recorrer masivamente la lista.
El botón puede activar el contexto y los bloqueos normales del portal; nunca se
pulsa Validar, Objetar o Enviar. Las imágenes que abre el portal no se descargan.

## Importar y consultar

Desde la raíz del proyecto, después de aplicar las migraciones:

```powershell
npm.cmd run scrape:import -- local-extractions/first-run.json
npm.cmd run scrape:get -- ID_ATENCION
```

El primer comando confirma la transacción. El segundo consulta mediante Sequelize
los registros reales de PostgreSQL y escribe `local-extractions/database-get.json`.
Ese archivo es la respuesta de consulta local, no una ruta HTTP. Una API pública
para datos clínicos necesita la autenticación y autorización de la etapa correspondiente.
La exportación de consulta se reemplaza al ejecutar otra consulta; el respaldo original
permanece separado. Ambos archivos están excluidos de Git.

La respuesta de consulta tiene esta estructura:

```text
patient        → UUID interno, ID externo textual, nombre original y demás atributos
attention      → UUID, patientId, ID externo de atención, fecha, edad, centro y origen
procedures[]   → procedimiento vinculado a la atención
clinicalInput  → ocho campos clínicos, texto completo, adicionales y metadatos
```

## Reintentos y límites

Paciente se identifica por `sourceSystem + externalPatientId`; atención por
`sourceSystem + externalAttentionId`. No se crean claves a partir del nombre.
El proceso conserva una atención por ID y un bloque clínico por atención. Reimportar
el mismo contenido reutiliza los registros, sin duplicarlos. Un ID de atención
vinculado a otro paciente, un procedimiento distinto o un cambio en el texto clínico
provocan rollback. El historial de cambios clínicos queda para una etapa posterior;
no se sobreescribe silenciosamente el primer respaldo.

Este ciclo admite un procedimiento porque es la estructura comprobada en el portal.
No se infiere región, lateralidad ni modalidad desde la descripción. Modalidad,
fecha/hora textual, prioridad y código del lugar de la lista se conservan como origen.
No se crea Report ni ReportVersion: el editor estaba vacío y su fecha mostrada se
genera desde la fecha actual del navegador. Esa fecha se guarda como procedencia
en `Attention.sourceMetadata`, no como fecha de un informe definitivo.

El ID de atención proviene de la fila y se comprueba la coincidencia de la cabecera.
Se conserva `rowMatchesHeader: true` y `verifiedAttentionIdentity: false`: no se leyó
un ID independiente en el editor. Ejecutar secuencialmente, sin navegar ni cambiar
el caso durante la lectura. Falta comprobar identidad de contexto para el recorrido masivo.

Si dos procesos intentan crear el mismo ID simultáneamente, los índices únicos
impiden duplicados; uno puede fallar y necesitar reintento. Este primer ciclo no
implementa trabajos concurrentes ni un planificador.

## Verificaciones

`npm test` comprueba lectura, normalización y correspondencia con la fila usando
datos sintéticos. `npm run test:db` comprueba transacción, reimportación sin duplicados,
rollback y consulta relacionada dentro de una transacción de prueba que se revierte.
La ejecución real guardó el caso autorizado y se contrastó la consulta con la
extracción original. No hay fixtures clínicos reales versionados.
