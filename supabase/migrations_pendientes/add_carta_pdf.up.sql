-- ─────────────────────────────────────────────────────────────────────────
-- Carta Viva PDF — columnas de presentación y preferencias de impresión
-- en `restaurantes`
-- ─────────────────────────────────────────────────────────────────────────
--
-- MOTIVO
--   La nueva feature "Carta imprimible A4" permite al sommelier/propietario
--   descargar su carta de vinos como PDF. Reutiliza el branding ya existente
--   en `restaurantes` (color_fondo, color_acento, tipografia, logo_url,
--   carta_pie_texto) y sólo añade:
--
--   - `carta_descripcion`  (texto opcional de presentación que va bajo el
--     logo en la primera página — p.ej. "Una selección pensada para cenas
--     relajadas y buena conversación").
--   - `carta_mostrar_copa` (toggle para ocultar la columna COPA en la
--     carta impresa cuando el restaurante sólo vende por botella).
--
--   NO tocamos color_fondo/color_acento/tipografia/logo_url/carta_pie_texto:
--   ya existen y se reutilizan tal cual. El color de texto del PDF se
--   deriva automáticamente del contraste con color_fondo en el cliente
--   (no se persiste): si fondo es oscuro → texto claro, y viceversa.
--
-- CARACTERÍSTICAS
--   - ADD COLUMN IF NOT EXISTS: aditiva e idempotente (expand-only, R2).
--   - Ambas columnas son opcionales:
--       `carta_descripcion` NULL por defecto → no se imprime nada.
--       `carta_mostrar_copa` DEFAULT true → compat. retro: todos los
--       restaurantes siguen imprimiendo la columna de copa como hasta
--       ahora. Sólo quien lo desactive explícitamente verá el cambio.
--   - No se toca RLS ni ninguna policy. Las policies existentes de
--     `restaurantes` usan `email`/`auth.jwt()` sobre la fila entera
--     y cubren automáticamente las nuevas columnas.
--   - No se toca ningún trigger ni índice.
--
-- COMPATIBILIDAD CON EL CÓDIGO
--   La app degrada si las columnas NO existen:
--     - La página `/admin/carta-pdf/[slug]` lee los campos con
--       `?? defaults` y si la lectura falla con 42703 asume defaults
--       (carta_descripcion = '', carta_mostrar_copa = true).
--     - El upsert en `/api/admin/carta-pdf-config` sólo incluye las
--       claves si el restaurante responde que existen; si Postgres
--       devuelve 42703 el PATCH se repite sin esas claves.
--
-- BACKUP PREVIO (obligatorio; esquema privado `backup_privado`, nunca `public`):
--
--     CREATE SCHEMA IF NOT EXISTS backup_privado;
--     DROP TABLE IF EXISTS backup_privado.restaurantes_pre_carta_pdf;
--     CREATE TABLE backup_privado.restaurantes_pre_carta_pdf AS
--       SELECT * FROM public.restaurantes;
--     -- Verifica que el recuento coincide:
--     SELECT count(*) FROM public.restaurantes;
--     SELECT count(*) FROM backup_privado.restaurantes_pre_carta_pdf;
--
-- COMPROBACIÓN PREVIA (debe devolver 0 filas; si devuelve 1 o 2, alguna
-- columna ya existe y el ADD COLUMN IF NOT EXISTS es no-op):
--     SELECT column_name, data_type, column_default, is_nullable
--       FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND table_name   = 'restaurantes'
--        AND column_name IN ('carta_descripcion', 'carta_mostrar_copa');
--
-- COMPROBACIÓN POSTERIOR (debe devolver 2 filas):
--     SELECT column_name, data_type, column_default, is_nullable
--       FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND table_name   = 'restaurantes'
--        AND column_name IN ('carta_descripcion', 'carta_mostrar_copa')
--      ORDER BY column_name;
--     -- carta_descripcion   text     NULL    YES
--     -- carta_mostrar_copa  boolean  true    NO
--
-- COMPROBACIÓN POSTERIOR DE DATOS (ninguna fila debe haber perdido
-- nada; las filas existentes reciben defaults):
--     SELECT
--       count(*)                                                  AS filas,
--       count(*) FILTER (WHERE carta_mostrar_copa IS TRUE)        AS con_copa,
--       count(*) FILTER (WHERE carta_descripcion IS NULL)         AS sin_desc
--       FROM public.restaurantes;
--     -- "filas" debe coincidir con "con_copa" y con "sin_desc" (hasta
--     -- que algún restaurante los personalice). Si ya hay alguno
--     -- personalizado via sql manual, ajusta la expectativa.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS carta_descripcion text;

ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS carta_mostrar_copa boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.restaurantes.carta_descripcion IS
  'Texto opcional de presentación que aparece bajo el logo en la primera página de la carta PDF imprimible. Máx. recomendado 600 caracteres. NULL ≡ no se imprime.';

COMMENT ON COLUMN public.restaurantes.carta_mostrar_copa IS
  'Si TRUE, la carta PDF imprimible muestra la columna COPA además de BOTELLA. Si FALSE, oculta COPA (restaurantes que sólo venden por botella). Default TRUE para compatibilidad retro.';
