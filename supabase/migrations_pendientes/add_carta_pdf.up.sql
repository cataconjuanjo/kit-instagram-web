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
--   - `carta_mostrar_copa` (toggle para MOSTRAR la columna COPA en la
--     carta impresa; por defecto está desactivado — la gran mayoría de
--     restaurantes imprime su carta sin precio por copa).
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
--       `carta_mostrar_copa` DEFAULT false → la carta imprimible NO
--       muestra la columna COPA salvo que el sommelier lo active desde
--       el panel. Es el comportamiento "carta clásica a la botella".
--   - No se toca RLS ni ninguna policy. Las policies existentes de
--     `restaurantes` usan `email`/`auth.jwt()` sobre la fila entera
--     y cubren automáticamente las nuevas columnas.
--   - No se toca ningún trigger ni índice.
--
-- COMPATIBILIDAD CON EL CÓDIGO
--   La app degrada si las columnas NO existen:
--     - La página `/admin/carta-pdf/[slug]` lee con fallback: si la
--       lectura falla con 42703 reintenta sin esas columnas y asume
--       defaults (carta_descripcion = '', carta_mostrar_copa = false).
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
--     -- carta_mostrar_copa  boolean  false   NO
--
-- COMPROBACIÓN POSTERIOR DE DATOS (ninguna fila debe haber perdido
-- nada; las filas existentes reciben defaults):
--     SELECT
--       count(*)                                                  AS filas,
--       count(*) FILTER (WHERE carta_mostrar_copa IS FALSE)       AS sin_copa,
--       count(*) FILTER (WHERE carta_descripcion IS NULL)         AS sin_desc
--       FROM public.restaurantes;
--     -- "filas" debe coincidir con "sin_copa" y con "sin_desc" (hasta
--     -- que algún restaurante los personalice). Si ya hay alguno
--     -- personalizado via sql manual, ajusta la expectativa.
--
-- IDEMPOTENCIA (ajuste de DEFAULT si una versión previa aplicó TRUE):
--   Si aplicaste una versión anterior de esta migración con DEFAULT true,
--   el bloque ALTER COLUMN SET DEFAULT false de abajo corrige el default
--   sin tocar los valores actuales de las filas. Esto se hace a propósito
--   para no violar R2 (no UPDATE masivo). Un restaurante que haya
--   quedado con carta_mostrar_copa = true seguirá con true hasta que un
--   operador lo cambie explícitamente desde el panel.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS carta_descripcion text;

ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS carta_mostrar_copa boolean NOT NULL DEFAULT false;

-- Corrige el default si una aplicación previa lo dejó en TRUE.
-- No modifica filas existentes (ver nota IDEMPOTENCIA arriba).
ALTER TABLE public.restaurantes
  ALTER COLUMN carta_mostrar_copa SET DEFAULT false;

-- Nueva columna añadida en el bloque "bug impresión + ajustes carta PDF":
-- toggle para incluir bodega y añada en la línea secundaria de cada vino.
-- Default FALSE: la línea por defecto es sólo "uva · región".
ALTER TABLE public.restaurantes
  ADD COLUMN IF NOT EXISTS carta_incluir_bodega_anada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.restaurantes.carta_descripcion IS
  'Texto opcional de presentación que aparece bajo el logo en la primera página de la carta PDF imprimible. Máx. recomendado 600 caracteres. NULL ≡ no se imprime.';

COMMENT ON COLUMN public.restaurantes.carta_mostrar_copa IS
  'Si TRUE, la carta PDF imprimible muestra la columna COPA además de BOTELLA. Default FALSE: el comportamiento habitual es imprimir solo precio por botella; los restaurantes que vendan por copa pueden activarlo desde el panel.';

COMMENT ON COLUMN public.restaurantes.carta_incluir_bodega_anada IS
  'Si TRUE, la segunda línea de cada vino en la carta PDF incluye "bodega · uva · región · añada". Si FALSE (default), solo "uva · región". Toggle opcional del sommelier.';
