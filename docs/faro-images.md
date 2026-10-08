# Imágenes del visor OHIF en almacenamiento local

Se guardaron 64 JPG vinculados a la atención autorizada de Luisa en `study_files`.
El ID visible en OHIF coincidió con el ID externo del paciente en PostgreSQL.
La serie mostró 64 posiciones; se recorrieron de 1 a 64 usando el control vertical.

## Qué se conserva

Son capturas del área renderizada del viewport, recortadas desde un screenshot
de Codex con los límites del `canvas.cornerstone-canvas` observado. En esta
ejecución tienen 940 × 826 píxeles, 64 checksums diferentes y 10 446 306 bytes
en total. Conservan los textos y controles superpuestos dentro del viewport.
La apariencia incluye el Window/Level y zoom de ese momento.

**No son DICOM originales ni una exportación de los píxeles originales del estudio.**
Son derivados para visualización. `diagnosticOriginal: false` y
`exportMethod: 'ohif_viewport_screenshot'` quedan registrados como procedencia.
Trabajar después con información médica original requiere una adquisición DICOM
separada; el JPG tiene compresión con pérdida y no conserva sus metadatos.

El intento de Save en Capture no entregó un archivo mediante la integración.
El recurso PNG expuesto por el SVG era transparente: se descartó tras comprobar
sus píxeles y la pantalla. Los manifiestos de esos intentos quedan únicamente en
el directorio local de capturas; no se importaron al bucket ni a PostgreSQL.

## Bucket local y metadatos

Se usa una carpeta bajo `storage/study-images/UUID_ATENCION/UID_ESTUDIO/`.
No es un bucket cloud. No se publica con Express ni se crea una URL pública.
`storage/` y `local-extractions/` están excluidos de Git. Las claves no incluyen
nombres de pacientes; los JPG pueden contener datos identificatorios impresos
por el equipo médico. El cliente futuro necesitará acceso autenticado a esos archivos.

Cada `StudyFile` conserva `storageKey`, `mimeType: image/jpeg`, bytes, SHA-256,
ID externo de archivo (UID de estudio + índice) y procedencia: URL, índice,
cantidad esperada, resolución y método. Se reutiliza el esquema existente,
sin migraciones. `procedureId` queda sin asignar: el vínculo comprobado es la atención.

## Recopilar desde Codex

Seleccionar la pestaña OHIF existente con `cua.getTab` y leer la documentación
de la integración. Expandir Patient para que el ID sea visible. Usar el ID externo
del paciente consultado en la base, sin deducirlo desde el nombre.

```js
let imagesRequire = (await import('node:module')).createRequire(
  'C:/Users/neila/Desktop/Nueva carpeta/InformesClinicos/package.json',
);
let collector = imagesRequire('./scripts/collect-faro-images.js');
let collection = await collector.startImageCollection(tab, {
  externalAttentionId: 'ID_ATENCION', externalPatientId: 'ID_PACIENTE', expectedImages: 64,
});
// Repetir secuencialmente en bloques breves hasta done: true.
nodeRepl.write(await collector.collectNextImage(tab, collection));
```

Los IDs del ejemplo son marcadores. El proceso comprueba dominio, estudio,
paciente, máximo del slider, índice visible y viewport único. Guarda un archivo
por índice y `manifest.json` con el progreso, sin sobrescribir capturas anteriores.
No cambiar paciente, layout, zoom o Window/Level durante el recorrido.

## Importar y corroborar

```powershell
npm.cmd run scrape:import-images -- local-extractions/NOMBRE_COLECCION/manifest.json
```

`faro-images.service.js` valida el lote completo: identidad del paciente,
continuidad de índices, JPEG real, dimensiones, bytes y checksums. Escribe los
bytes validados al almacenamiento y registra el lote en una transacción.
No reemplaza un archivo ni una fila con contenido diferente.

La transacción de PostgreSQL no engloba el sistema de archivos: un fallo posterior
a escribir archivos puede dejar archivos sin registro. Se conservan para reintentar
la misma importación. Una reimportación idéntica reutiliza los archivos y las filas.
Una nueva captura con diferente contenido necesita revisión; no se sobreescribe.

La verificación posterior consulta `study_files` y relee los archivos, comprobando
checksums y tamaños. El resultado queda en `storage-verification.json`. Se ejecutó
también una reimportación y una consulta independiente: siguen existiendo exactamente
64 registros de imagen, sin duplicados.

Sharp valida y procesa JPG usando su codec existente. Referencia técnica:
[documentación oficial de salida JPEG](https://sharp.pixelplumbing.com/api-output/#jpeg).
Las pruebas sintéticas cubren colección incompleta, índices repetidos, otro estudio,
otro dominio, UID con rutas y checksum inválido.
