# Faro Gestión: identificación y apertura desde la lista de trabajo

Inspección de lectura realizada dentro del navegador de Codex. Se abrió únicamente
el botón Informe de la fila indicada por el usuario. No se validó, objetó ni envió
el informe. No se guardaron datos clínicos, cookies ni información de sesión.

## Identificar una fila y sus celdas

La tabla es `#atenciones`, renderizada por DataTables. Su código crea cada fila
con la clase `row-` seguida de `data.idatencion`. La celda ID tiene la clase
`idatencion-cell` y el botón Informe contiene ese mismo ID en `data-id`:

```html
<!-- Ejemplo estructural: ID_ATENCION es un marcador, no un dato real. -->
<tr class="row-ID_ATENCION">
  <td class="idatencion-cell">ID_ATENCION</td>
  <!-- Otras celdas -->
  <td><button class="btn-informe" data-id="ID_ATENCION"></button></td>
</tr>
```

Se comprobó que el ID de la celda coincide con `data-id` del botón en las filas
renderizadas que contienen Informe. Este es un ID de atención, distinto del ID
del paciente que aparece en el editor. No usar nombre ni posición de fila como clave.

Las columnas del DOM observado, en orden actual, son:

| Índice | Columna | Significado |
| --- | --- | --- |
| 0 | Prioridad | Prioridad del caso |
| 1 | ID | Identificador externo de atención |
| 2 | Atención | Fecha y hora mostradas en la lista |
| 3 | Resta | Tiempo mostrado por el portal |
| 4 | Lugar | Código del lugar; no asumir que equivale al nombre completo del centro |
| 5 | Modalidad | Modalidad mostrada |
| 6 | Examen | Descripción del procedimiento |
| 7 | Edad | Edad mostrada en la lista; el editor tiene una descripción más detallada |
| 8 | Nombre | Nombre mostrado en la lista |
| 9 | Obs. | Indicador de existencia de observaciones; no es el texto clínico |
| 10 | Informe | `.btn-informe[data-id]` |
| 11 | Descarga | `.btn-descarga` |
| 12 | Descarga | `.btn-descarga2` |
| 13 | Visor | `.btn-visor[data-id]` |
| 14 | Horos | `.btn-horos` |
| 15 | Radiant | `.btn-radiant`; oculto en el DOM observado |
| 16 | Selec. | `.registro-checkbox[data-id]`; oculto en el DOM observado |

Estos índices documentan esta vista, no son selectores permanentes. El código
habilita `colReorder: true` y `responsive: true`: se pueden reordenar columnas
y crear filas secundarias `child`. Para leer datos, resolver columnas desde sus
encabezados actuales; para abrir Informe, usar el botón y su `data-id`.
Las columnas Descarga se distinguen por sus clases, porque comparten etiqueta.
El manejador del portal resuelve una fila `child` a su fila principal previa.

## Flujo del clic observado

El JavaScript del documento lista estos pasos:

1. El evento delegado en `#atenciones tbody` captura `.btn-informe`.
2. Resuelve la fila y obtiene `idatencion` y `uidexterno` de DataTables.
3. Comprueba que el rol sea Informante.
4. Envía `POST verificar_bloqueo.php`, con `idatencion` como formulario URL encoded.
   Si la respuesta indica bloqueo, muestra un modal y no continúa.
5. Si corresponde, el código solicita el UID mediante `obtener_study_iuid.php`.
6. Construye listas paralelas de IDs y UIDs desde la fila seleccionada hasta el
   final de las filas filtradas por DataTables. Esta selección condiciona la
   navegación Anterior/Siguiente del editor.
7. Completa `#atencionForm` con `idatencion`, `uidexterno`, `registrosPendientes`
   y `uidexternosPendientes`. Los dos últimos son listas serializadas como JSON.
8. Envía ese formulario mediante POST a `guardaidatencion.php`, o a
   `guardaidatencionAdmin.php` en la rama administrativa. No tiene `target`.

El clic real terminó en `/modulorad/editor/editormulti.html` en la misma pestaña.
Se creó una pestaña adicional en el visor de imágenes, ruta `/ohif/viewer`, con
el parámetro `StudyInstanceUIDs`. No se inspeccionaron ni descargaron las imágenes.
En esta ejecución hubo una navegación de la pestaña original y una pestaña nueva,
no dos pestañas nuevas.

No se capturó tráfico de red ni se inspeccionó el PHP del servidor. Por ello no
se afirma si el paso entre el formulario y el editor usa HTTP 302 o navegación
JavaScript, ni qué escrituras o bloqueos internos realiza el servidor.

## Cómo el editor obtiene el caso

La URL del editor observada no contiene ID de atención. El código HTML del editor
ejecuta al cargar:

```text
GET obtieneidatencionsesion.php
  → data.idatencion
  → data.uidexterno
  → data.registrosPendientes
  → data.posicionActual
```

El código contempla además una variante con `?ctx=...` para contexto de alerta;
esa variante no se usó en esta navegación. No se leyó directamente el endpoint
de sesión ni se exportó su respuesta; la descripción proviene del código del DOM.

Después, `llenarcamposformulario` envía `POST backendmulti.php` con `idatencion`
y `medicoradiologo`. El código rellena nombre, identificador del paciente,
procedimiento, fecha del estudio y observaciones desde la respuesta. El informe
seleccionado apareció cargado y se comprobó que correspondía al paciente indicado.

```text
Fila identificada por idatencion
  → botón Informe con data-id
  → comprobación de bloqueo
  → POST guardaidatencion[Admin].php
  → editor con URL común
  → obtieneidatencionsesion.php recupera el contexto
  → POST backendmulti.php carga el caso
```

## Consecuencias para la automatización futura

- Capturar el ID de atención de la fila antes del clic. Su destino en el proyecto
  es `Attention.externalAttentionId`, con `sourceSystem: 'faro_gestion'`.
- Elegir un único botón Informe mediante `data-id`, sin buscar por nombre o índice.
- Comprobar bloqueo y esperar campos efectivamente cargados, no solo cambio de URL.
- Conservar la relación entre fila seleccionada e informe; la URL común no la prueba.
- Antes de declarar identidad verificada, comprobar el ID que realmente cargó el
  editor mediante una integración de lectura autorizada. En esta revisión se
  identificó el mecanismo, pero no se leyó ese ID desde el contexto de sesión.
- Recorrer casos de forma secuencial hasta comprobar el aislamiento de contexto:
  abrir varias pestañas del editor puede interferir si comparten la atención de sesión.
- Distinguir lista filtrada, página visible y conjunto total. No suponer que la
  página visible incluye todos los casos ni que la posición es un identificador.

No se implementó un recorrido masivo ni se modificó el extractor en esta revisión.
El ID externo de informe continúa sin identificarse.

## Precisión adicional: fecha de informe

El código inspeccionado asigna `#encabezadofechainforme` desde `new Date()` en la
zona horaria local del navegador. Lo encontrado en esa celda es una fecha de interfaz;
no se ha comprobado que sea la fecha de un informe previamente guardado. Conservar
esa procedencia antes de tratarla como fecha definitiva en la persistencia futura.
