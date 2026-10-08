# Recorrido por hojas y respaldo de un lote de Faro

`scripts/collect-faro-batch.js` usa los botones Previo/Sgte de DataTables y
comprueba la página visible. Captura IDs de atención de cada hoja antes de abrir
informes; ignora las filas responsive secundarias y rechaza IDs duplicados,
botones inconsistentes o lugares diferentes de `ISM`.

El límite es de pacientes distintos, contados por ID externo del editor. Una
persona puede tener varias atenciones y cada una se conserva por su propio ID.
No se deduplica por nombre. `maxPages` limita las hojas permitidas; alcanzar el
final de la cola devuelve `exhausted: true`, aunque no se alcance el mínimo.

## Ejecutar dentro de Codex

Después del login, seleccionar la pestaña de la lista con `cua.getTab` y leer la
documentación del navegador. Dentro del mismo runtime `cua_repl`:

```js
let batchRequire = (await import('node:module')).createRequire(
  'C:/Users/neila/Desktop/Nueva carpeta/InformesClinicos/package.json',
);
let batchScript = batchRequire('./scripts/collect-faro-batch.js');
let batch = await batchScript.startBatch(tab, { maxPatients: 10, maxPages: 1 });
// Ejecutar un paso a la vez y detenerse cuando done sea true.
nodeRepl.write(await batchScript.collectNext(tab, batch));
```

`startBatch` aplica San Miguel. `collectNext` vuelve desde el editor, reaplica la
vista y restaura la hoja de la atención que corresponde. Trabaja en una sola
pestaña de forma secuencial; no ejecutar otro proceso que cambie el contexto del
editor. Una demora o discrepancia detiene el paso sin avanzar la cola.

Cada extracción tiene su archivo y el progreso se guarda en `manifest.json`,
dentro de un directorio nuevo en `local-extractions/`, excluido de Git. Si se
interrumpe el runtime, se puede cargar ese manifiesto con `fs.readFile` y seguir
pasándolo a `collectNext`. No reemplaza un respaldo existente.

## Importar y consultar PostgreSQL

```powershell
npm.cmd run scrape:import-batch -- local-extractions/NOMBRE_DEL_LOTE/manifest.json
```

El script `import-faro-batch.js` reutiliza el importador y engloba las atenciones
en una transacción. Al confirmar, conserva un comprobante de importación con los
contadores de registros nuevos. Luego consulta cada ID en PostgreSQL, compara
los atributos normalizados y genera `database-verification.json` con los nombres
consultados a la base. Si falla la corroboración después del commit, los datos
ya están importados: el comprobante permite distinguir ambas etapas.

Reimportar contenido idéntico reutiliza los registros. Un cambio en el texto
clínico o en el procedimiento sigue deteniendo la importación según las reglas
existentes. No valida, objeta ni envía informes en Faro.

## Ejecución comprobada

Se extrajeron las primeras 14 atenciones de la hoja 1 de San Miguel: 11 pacientes
distintos. PostgreSQL confirmó 10 pacientes y 13 atenciones creados durante el
lote; Luisa y su atención ya existían. Una reimportación creó cero registros.
Se consultaron y compararon las 14 atenciones, incluida la entrada clínica.

La comparación de fechas convierte los objetos `Date` de Sequelize a ISO antes
de contrastarlos con el JSON. La primera corroboración detectó esa diferencia
de representación después de confirmar la transacción; el reintento corregido
completó la comparación. `creation-audit.json` conserva la comprobación de fechas
de creación consultadas a PostgreSQL para distinguir los registros previos.

Se comprobó también navegación real 1 → 2 → 1: la primera hoja tiene 50 filas,
la segunda 8 y Sgte deshabilitado. No se extrajeron casos de la segunda hoja.
Las pruebas sintéticas cubren columnas reordenadas, filas secundarias, IDs
inconsistentes, otro centro, duplicados y bloqueo al final de la paginación.

Se conserva `verifiedAttentionIdentity: false`: el ID proviene de la lista y se
compara nombre, fecha y procedimiento con la cabecera. No se afirma haber leído
un ID independiente del contexto del editor.
