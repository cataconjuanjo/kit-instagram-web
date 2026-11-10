-- P1-3: importación inicial del catálogo de ubicaciones desde los valores
-- distintos ya existentes en vinos_tienda.ubicacion_estanteria.
-- Aditivo y READ-ONLY sobre el campo original: NO modifica
-- vinos_tienda.ubicacion_estanteria; solo INSERT en kiosko_ubicaciones.
-- Idempotente: usa ON CONFLICT (tienda_id, nombre_key) DO NOTHING.
--
-- Orden de aplicación:
--   1) kiosko_ubicaciones.sql  (crea la tabla)
--   2) este archivo             (puebla por tienda)
--
-- Cómo comprobar el resultado:
--   SELECT nombre, nombre_key FROM kiosko_ubicaciones
--   WHERE tienda_id = '<tienda_id>' ORDER BY nombre;
--   SELECT DISTINCT ubicacion_estanteria FROM vinos_tienda
--   WHERE tienda_id = '<tienda_id>' AND ubicacion_estanteria IS NOT NULL;
-- Ambos SELECT deben coincidir en número de filas y los nombres originales
-- deben seguir intactos en vinos_tienda.

INSERT INTO kiosko_ubicaciones (tienda_id, nombre, nombre_key, orden, activa)
SELECT
  vt.tienda_id,
  MIN(vt.ubicacion_estanteria) AS nombre,               -- conserva el primer nombre original
  lower(
    regexp_replace(
      translate(
        trim(vt.ubicacion_estanteria),
        'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
        'aeiouAEIOUaeiouAEIOUaeiouAEIOUnNcC'
      ),
      '\s+', ' ', 'g'
    )
  ) AS nombre_key,
  100 AS orden,
  true AS activa
FROM vinos_tienda vt
WHERE vt.ubicacion_estanteria IS NOT NULL
  AND trim(vt.ubicacion_estanteria) <> ''
GROUP BY vt.tienda_id,
         lower(
           regexp_replace(
             translate(
               trim(vt.ubicacion_estanteria),
               'áéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜñÑçÇ',
               'aeiouAEIOUaeiouAEIOUaeiouAEIOUnNcC'
             ),
             '\s+', ' ', 'g'
           )
         )
ON CONFLICT (tienda_id, nombre_key) DO NOTHING;
