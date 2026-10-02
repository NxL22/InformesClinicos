# Extractor de Faro Gestión

Primer extractor de lectura implementado y ejecutado contra el informe abierto.
La integración verificada es el navegador interno de Codex, usando su API Playwright.
Por indicación del usuario, se trabaja dentro de Codex; no se utiliza Chrome externo.
El extractor no persiste por sí mismo. El ciclo de respaldo separado está documentado
en [faro-first-cycle.md](faro-first-cycle.md). No se llama a IA ni se descargan imágenes.

## Conexión y ejecución

Abrir el informe y completar el inicio de sesión manualmente dentro del navegador
de Codex. La pestaña debe estar en
`https://farogestion.cl/modulorad/editor/editormulti.html`, con el informe cargado.

Desde `cua_repl`, inicializar la pestaña existente como primer paso del runtime:

```js
let tab = await cua.getTab(
  { url: 'https://farogestion.cl/modulorad/editor/editormulti.html' },
  { browser: 'iab' },
);
```

Leer la documentación que devuelve la integración antes de continuar. Luego cargar
los módulos CommonJS y ejecutar (ruta de esta computadora):

```js
let moduleApi = await import('node:module');
let projectRequire = moduleApi.createRequire(
  'C:/Users/neila/Desktop/Nueva carpeta/InformesClinicos/package.json',
);
let faroExtractor = projectRequire('./src/extraction/faro/extract-report.js');
let extraction = await faroExtractor.extractReport(tab);
// Mostrar estados y advertencias, nunca extraction completa: contiene datos clínicos.
nodeRepl.write({ fieldStates: extraction.fieldStates, warnings: extraction.warnings });
```

No son comandos de terminal: `cua`, la pestaña y `nodeRepl` pertenecen a la integración
del navegador de Codex. No hay un conector CLI autónomo comprobado. No exportar cookies,
perfiles o estados de sesión, ni habilitar un puerto CDP para sustituir esta conexión.
Para volver a seleccionar la pestaña en un runtime ya inicializado puede usarse
`getReportTab(cua)` de `src/extraction/browser/codex-browser.js`: exige una única
coincidencia y falla si hay varios informes, evitando elegir uno arbitrariamente.

El fallo inicial `failed to write kernel assets` se resolvió después de reiniciar Codex.
La conexión dentro del navegador interno y la extracción posterior sí se verificaron.

## Organización

- `browser/codex-browser.js`: acceso a la pestaña existente mediante la integración.
- `faro/read-document.js`: captura sincrónica del DOM con los selectores observados.
- `faro/parse-observations.js`: etiquetas clínicas, texto multilineal y campos adicionales.
- `faro/extract-report.js`: dos capturas completas, comparación y normalización.
- `normalize-report.js`: candidatos de atributos para Patient, Attention, Procedure,
  ClinicalInput y los atributos de Report que conservan la fecha e ID del informe.

Todos esos archivos están bajo `src/extraction/`. Ninguno importa Sequelize.

## Campos y estructura observados

La cabecera usa `table.tabla-encabezado` y estos IDs:

| Campo | Selector | Verificación real |
| --- | --- | --- |
| Nombre original | `#encabezadopaciente` | Encontrado con valor |
| ID paciente textual | `#encabezadoid` | Encontrado; ceros iniciales conservados |
| Edad del estudio | `#encabezadoedad` | Encontrada como texto original |
| Descripción de procedimiento | `#encabezadodescripcion` | Una descripción encontrada |
| Fecha de estudio | `#encabezadofechaestudio` | Encontrada y normalizada |
| Fecha de informe mostrada | `#encabezadofechainforme` | Generada desde la fecha local del navegador; no verificada como fecha guardada |
| Centro | `#encabezadolugaratencion` | Encontrado |
| Observaciones completas | `#encabezadoobsatencion` | Texto completo y saltos conservados |
| Editor del informe | `#textos` | Encontrado vacío |
| Posición en lista | `#indicadorPosicion` | Encontrada; no es ID de atención |
| ID externo atención | Sin selector identificado | Faltante |
| ID externo informe | Sin selector identificado | Faltante |

Las observaciones son texto HTML, con etiquetas de Diagnóstico, Sintomatología,
Antecedentes Mórbidos importantes, Medicamentos que toma en forma habitual,
Cirugías Previas, Exámenes Previos, Otros y Hallazgos. Los ocho campos tenían valor.
Se verificó la preservación de negativos explícitos y de Hallazgos multilineales.
No había iframes en el documento inspeccionado. El editor vacío se conserva por
separado en `raw.editorText`; no se confunde con Hallazgos de las observaciones.

## Resultado y límites

`extractReport(tab)` devuelve `raw`, `normalized`, `fieldStates`, `warnings`
y `verification`. `raw` conserva también la descripción íntegra, la posición y el editor.
Los estados por campo son `value`, `empty` y `missing`. Los formatos inválidos
conservan su original y generan una advertencia, sin fabricar una normalización.
Un `no` explícito permanece como valor. No se calcula nacimiento desde la edad,
ni se deduce anatomía, lateralidad o modalidad sin datos explícitos.

`normalized.clinicalInput.extractionMetadata` prepara esos metadatos para la columna
JSONB `clinical_inputs.extraction_metadata`: estados de todos los campos, advertencias
finales, `extractorVersion` y `verification`. Se arma al terminar la extracción para
incluir también los avisos del parser, IDs faltantes y límites de consistencia.
La normalización aislada deja versión y verificación en NULL porque no ejecutó el
lector del portal. Los registros anteriores a la nueva migración conservan NULL
en la columna; no se les atribuyen estados retrospectivamente.

Los datos normalizados son candidatos de atributos: no tienen UUID de relaciones,
no se insertan y no constituyen una clave de deduplicación. La URL del editor
es una referencia de origen, nunca un identificador de paciente o atención.

Dos lecturas sincrónicas completas resultaron idénticas en el informe real. Se
rechazan cambios de URL, cabecera, descripción, observaciones, posición o editor.
Sin un ID externo comprobado, esto detecta cambios visibles, pero no garantiza
identidad de atención: un cambio entre registros con contenido idéntico no se puede
detectar. Tampoco garantiza que el portal no esté mostrando datos parcialmente
cargados que permanezcan iguales durante ambas lecturas. No navegar ni editar
durante la extracción. La salida informa `verifiedAttentionIdentity: false`.

El informe observado tenía una descripción textual de procedimiento. Todavía no
se verificó cómo Faro representa varios procedimientos. Se conserva esa descripción
íntegra como una entrada; no se divide por comas, saltos ni por la palabra bilateral.
La advertencia correspondiente permanece. El normalizador sí conserva múltiples
entradas cuando la lectura futura pueda identificarlas explícitamente.

Las etiquetas repetidas no se resuelven arbitrariamente: quedan en campos adicionales
y se advierte la ambigüedad. Una etiqueta desconocida con dos puntos puede ser prosa
clínica; se conserva en el campo clínico original y también como candidato adicional.
Se advierte esta ambigüedad, evitando truncar el texto relevante.

## Pruebas y datos locales

`npm run test:extraction` ejecuta pruebas sintéticas de normalización, fechas,
ceros iniciales, vacíos, negativos, texto multilineal, duplicados y cambios de atención.
`npm test` incluye esas pruebas y las validaciones previas de configuración/modelos.
No se necesitan navegador ni base de datos para esas pruebas.

La verificación real se realizó en memoria, sin fixtures clínicos, capturas o HTML
guardados. Si se guardan resultados futuros, usar `local-extractions/` o `storage/`
y comprobar la exclusión con `git check-ignore`. No imprimir valores reales en logs.
No guardar cookies, perfiles o credenciales en el repositorio público.

## Siguiente etapa

La identificación de filas por `idatencion` y el flujo POST hacia el editor están
documentados en [faro-worklist-navigation.md](faro-worklist-navigation.md). El ID
está disponible en la lista; aún falta verificar que el editor cargó ese mismo ID.

Resolver los identificadores externos y comprobar consistencia durante cambios
reales de atención antes de incorporar navegación desde la lista de trabajo.
Después: persistencia en PostgreSQL, deduplicación por identificadores externos,
verificación de múltiples procedimientos y extracción de imágenes.
