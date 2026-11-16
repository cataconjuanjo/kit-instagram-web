# Migraciones pendientes de aplicar

Los SQL de esta carpeta **NO** se ejecutan automáticamente. Están aquí
pendientes de revisión y aplicación manual contra la base de datos (preview
y producción comparten BD, así que aplicar afecta a ambos entornos).

## Convención

Cada migración consta de tres archivos:

- `<nombre>.up.sql` — script de aplicación.
- `<nombre>.down.sql` — rollback.
- Cualquier nota adicional se incluye como comentario dentro de los `.sql`.

## Antes de aplicar

1. Hacer backup de las tablas afectadas (cada `.up.sql` incluye la query).
2. Ejecutar la comprobación previa descrita en el `.up.sql`.
3. Aplicar el `.up.sql` en el SQL Editor de Supabase.
4. Ejecutar la comprobación posterior.
5. Si algo falla, aplicar el `.down.sql` correspondiente.

## Pendientes actuales

- `add_imputacion_pct.up.sql` — añade la columna `imputacion_pct jsonb`
  a `parametros_explotacion` (Fase 4, imputación a la bodega por
  concepto). El código funciona con y sin la columna aplicada.
