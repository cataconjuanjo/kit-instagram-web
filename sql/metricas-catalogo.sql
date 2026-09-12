-- metricas-catalogo.sql
-- Consultas de lectura sobre el catálogo de Carta Viva.
-- Tabla principal: proveedor_catalogo_vinos  (una fila = una línea de tarifa)
-- Tabla de proveedores: proveedores_vino
-- Sin credenciales. Pegar en el SQL Editor de Supabase.
-- Generado: 2026-09-12  Rama: refactor/catalogo-canonico  Bloque 3.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.1  Total de referencias y total por proveedor
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  pv.nombre                        AS proveedor,
  count(*)                         AS referencias,
  count(*) FILTER (WHERE c.favorito = true)  AS favoritos,
  count(*) FILTER (WHERE c.coste_estimado IS NULL OR c.coste_estimado = 0) AS sin_coste
FROM proveedor_catalogo_vinos c
JOIN proveedores_vino pv ON pv.id = c.proveedor_id
GROUP BY pv.id, pv.nombre
ORDER BY referencias DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.2  Valores DISTINCT del campo zona, con recuento
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(DISTINCT zona) AS zonas_distintas,
  count(*)             AS total_filas
FROM proveedor_catalogo_vinos;

SELECT
  coalesce(zona, '(null)')  AS zona,
  count(*)                   AS n
FROM proveedor_catalogo_vinos
GROUP BY zona
ORDER BY n DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.3  Valores DISTINCT del campo bodega; 50 más frecuentes
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(DISTINCT bodega) AS bodegas_distintas
FROM proveedor_catalogo_vinos;

SELECT
  coalesce(bodega, '(null)') AS bodega,
  count(*)                    AS n
FROM proveedor_catalogo_vinos
GROUP BY bodega
ORDER BY n DESC
LIMIT 50;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.4  Valores DISTINCT del campo formato, con recuento
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(DISTINCT formato) AS formatos_distintos
FROM proveedor_catalogo_vinos;

SELECT
  coalesce(formato, '(null)') AS formato,
  count(*)                     AS n
FROM proveedor_catalogo_vinos
GROUP BY formato
ORDER BY n DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.5  Candidatos a duplicado entre proveedores distintos (pg_trgm + unaccent)
--      Requiere: CREATE EXTENSION IF NOT EXISTS pg_trgm;
--                CREATE EXTENSION IF NOT EXISTS unaccent;
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

WITH normalizado AS (
  SELECT
    c.id,
    c.proveedor_id,
    c.nombre,
    c.bodega,
    c.formato,
    c.coste_estimado,
    lower(unaccent(
      regexp_replace(c.nombre, '\m(19|20)\d{2}\M', '', 'g')
    )) AS nombre_norm,
    lower(unaccent(coalesce(c.bodega, ''))) AS bodega_norm
  FROM proveedor_catalogo_vinos c
  WHERE c.activo = true
    AND c.coste_estimado > 0
)
SELECT
  a.nombre          AS nombre_a,
  a.bodega          AS bodega_a,
  pa.nombre         AS proveedor_a,
  a.formato         AS formato_a,
  a.coste_estimado  AS coste_a,
  b.nombre          AS nombre_b,
  b.bodega          AS bodega_b,
  pb.nombre         AS proveedor_b,
  b.formato         AS formato_b,
  b.coste_estimado  AS coste_b,
  round((b.coste_estimado - a.coste_estimado)::numeric, 2)                                           AS diff_eur,
  round((abs(b.coste_estimado - a.coste_estimado)
         / nullif(a.coste_estimado, 0) * 100)::numeric, 1)                                           AS diff_pct,
  round(similarity(a.nombre_norm, b.nombre_norm)::numeric, 3)                                        AS sim_nombre
FROM normalizado a
JOIN normalizado b
  ON  a.id < b.id
  AND a.proveedor_id <> b.proveedor_id
  AND similarity(a.nombre_norm, b.nombre_norm) >= 0.82
JOIN proveedores_vino pa ON pa.id = a.proveedor_id
JOIN proveedores_vino pb ON pb.id = b.proveedor_id
ORDER BY abs(b.coste_estimado - a.coste_estimado) DESC
LIMIT 200;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.6  Agregado de 3.5: vinos únicos estimados y spread de precios por grupo
-- ─────────────────────────────────────────────────────────────────────────────
WITH normalizado AS (
  SELECT
    id,
    proveedor_id,
    coste_estimado,
    lower(unaccent(
      regexp_replace(nombre, '\m(19|20)\d{2}\M', '', 'g')
    )) AS nombre_norm
  FROM proveedor_catalogo_vinos
  WHERE activo = true AND coste_estimado > 0
),
grupos AS (
  -- Componentes conectadas: agrupar todas las filas que comparten nombre_norm
  -- entre proveedores distintos (aproximación conservadora por grupo exacto)
  SELECT
    nombre_norm,
    count(*)                                         AS n_filas,
    count(DISTINCT proveedor_id)                     AS n_proveedores,
    min(coste_estimado)                              AS coste_min,
    max(coste_estimado)                              AS coste_max,
    round((max(coste_estimado) - min(coste_estimado))::numeric, 2) AS spread_eur
  FROM normalizado
  GROUP BY nombre_norm
  HAVING count(DISTINCT proveedor_id) > 1
)
SELECT
  (SELECT count(*) FROM proveedor_catalogo_vinos WHERE activo = true) AS total_filas_activas,
  count(*)                              AS grupos_en_mas_de_un_proveedor,
  sum(n_filas)                          AS filas_en_esos_grupos,
  round(avg(spread_eur)::numeric, 2)    AS spread_medio_eur,
  sum(spread_eur)                       AS spread_total_acumulado_eur,
  max(spread_eur)                       AS spread_maximo_eur
FROM grupos;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.7  Referencias sin coste, con desglose por proveedor
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  pv.nombre       AS proveedor,
  count(*)        AS sin_coste
FROM proveedor_catalogo_vinos c
JOIN proveedores_vino pv ON pv.id = c.proveedor_id
WHERE c.coste_estimado IS NULL OR c.coste_estimado = 0
GROUP BY pv.id, pv.nombre
ORDER BY sin_coste DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.8  Columna de añada: existencia, cobertura y años embebidos en nombre
-- ─────────────────────────────────────────────────────────────────────────────
-- ¿Existe la columna?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'proveedor_catalogo_vinos'
  AND column_name = 'anada';

-- ¿En cuántas filas está informada?
SELECT
  count(*)                                               AS total,
  count(*) FILTER (WHERE anada IS NOT NULL AND anada <> '') AS con_anada,
  count(*) FILTER (WHERE anada IS NULL OR anada = '')        AS sin_anada
FROM proveedor_catalogo_vinos;

-- ¿Cuántas tienen año embebido en el nombre pero sin anada?
SELECT count(*) AS nombre_con_anada_embebida_sin_campo
FROM proveedor_catalogo_vinos
WHERE (anada IS NULL OR anada = '')
  AND nombre ~ '\m(19|20)\d{2}\M';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.9  Columna de disponibilidad: existencia y valores que toma
-- ─────────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'proveedor_catalogo_vinos'
  AND column_name = 'disponibilidad';

SELECT
  coalesce(disponibilidad, '(null)') AS disponibilidad,
  count(*) AS n
FROM proveedor_catalogo_vinos
GROUP BY disponibilidad
ORDER BY n DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.10 Código de artículo del proveedor: columnas existentes y cobertura
-- ─────────────────────────────────────────────────────────────────────────────
-- Columnas candidatas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'proveedor_catalogo_vinos'
  AND column_name IN ('referencia', 'referencia_proveedor', 'formato', 'notas');

-- Cobertura de referencia y referencia_proveedor
SELECT
  count(*)                                                           AS total,
  count(*) FILTER (WHERE referencia IS NOT NULL AND referencia <> '')           AS con_referencia,
  count(*) FILTER (WHERE referencia_proveedor IS NOT NULL AND referencia_proveedor <> '') AS con_referencia_proveedor
FROM proveedor_catalogo_vinos;

-- Ejemplos de referencia_proveedor por proveedor (10 ejemplos distintos)
SELECT DISTINCT ON (proveedor_id)
  pv.nombre AS proveedor,
  c.referencia_proveedor
FROM proveedor_catalogo_vinos c
JOIN proveedores_vino pv ON pv.id = c.proveedor_id
WHERE c.referencia_proveedor IS NOT NULL AND c.referencia_proveedor <> ''
ORDER BY proveedor_id, referencia_proveedor
LIMIT 10;

-- Ejemplos de referencia por proveedor (10 ejemplos distintos)
SELECT DISTINCT ON (proveedor_id)
  pv.nombre AS proveedor,
  c.referencia
FROM proveedor_catalogo_vinos c
JOIN proveedores_vino pv ON pv.id = c.proveedor_id
WHERE c.referencia IS NOT NULL AND c.referencia <> ''
ORDER BY proveedor_id, referencia
LIMIT 10;

-- ¿Hay patrones de código en el campo formato?
-- (busca cadenas alfanuméricas con guión tipo VDD-0726 o BMM-088)
SELECT
  formato,
  count(*) AS n
FROM proveedor_catalogo_vinos
WHERE formato ~ '[A-Z]{2,4}-\d{2,6}'
GROUP BY formato
ORDER BY n DESC
LIMIT 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.11 Favoritos: recuento y tabla a la que apuntan
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  pv.nombre      AS proveedor,
  count(*)       AS favoritos
FROM proveedor_catalogo_vinos c
JOIN proveedores_vino pv ON pv.id = c.proveedor_id
WHERE c.favorito = true
GROUP BY pv.id, pv.nombre
ORDER BY favoritos DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.12 Lo de Carmen: carta de vinos
-- ─────────────────────────────────────────────────────────────────────────────
-- Buscar restaurante_id de Lo de Carmen
SELECT id, nombre, slug FROM restaurantes WHERE nombre ILIKE '%carmen%';

-- Métricas de la carta (sustituir <ID> por el id obtenido arriba)
SELECT
  count(*)                                                      AS total_lineas,
  count(*) FILTER (WHERE coste_compra IS NOT NULL AND coste_compra > 0) AS con_coste,
  count(*) FILTER (WHERE proveedor IS NOT NULL AND proveedor <> '')    AS con_proveedor,
  count(*) FILTER (WHERE precio_botella IS NOT NULL AND precio_botella > 0) AS con_pvp_botella,
  count(*) FILTER (WHERE precio_copa    IS NOT NULL AND precio_copa    > 0) AS con_pvp_copa
FROM vinos
WHERE restaurante_id = '<ID>';
