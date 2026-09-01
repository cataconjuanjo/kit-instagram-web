-- Migración: añadir columnas de normalización a proveedor_catalogo_vinos
-- Usar en Supabase SQL Editor o ejecutar via script con pg.
-- Repetible: usa IF NOT EXISTS en todos los casos.

alter table public.proveedor_catalogo_vinos
  -- Respaldo de valores originales (para rollback)
  add column if not exists nombre_raw          text,
  add column if not exists region_raw          text,
  add column if not exists tipo_raw            text,
  add column if not exists formato_raw         text,

  -- Columnas nuevas derivadas de zona/tipo
  add column if not exists zona                text,

  -- Columnas nuevas derivadas de formato
  add column if not exists tamanyo             text,
  add column if not exists unidades_por_caja   integer,
  add column if not exists referencia_proveedor text,
  add column if not exists almacen_proveedor   text,
  add column if not exists graduacion          text;
