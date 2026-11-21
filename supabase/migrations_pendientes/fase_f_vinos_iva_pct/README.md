# Fase F — IVA de venta por vino

Añade la columna opcional `vinos.iva_pct numeric(4,2)` para permitir
que un vino concreto se netee con un IVA distinto del global del
restaurante (`restaurant_economic_settings.iva_venta_pct`, default
10 %). Útil para espumosos al 21 %, vinos exentos en operaciones
intracomunitarias, etc.

`NULL` = usa el IVA global del restaurante. `CHECK (iva_pct IS NULL
OR (iva_pct >= 0 AND iva_pct <= 30))` para evitar valores absurdos.

El código funciona ANTES y DESPUÉS de aplicar esta migración:
`agregarPeriodoBodega.js` y los consumidores leen la columna con
un helper `esColumnaInexistente` (mismo estilo que `esRelacionInexistente`);
si el `SELECT` falla con 42703 ("column does not exist"), hace un
reintento SIN la columna y cae al IVA global para todos los vinos.

## Ejecuta SOLO uno

- `fase_f_vinos_iva_pct.up.sql`   — crea la columna + CHECK + COMMENT.
  Idempotente (usa `IF NOT EXISTS` / `DO $$ … EXCEPTION $$`).
  Hace backup previo en `backup_privado.vinos_YYYYMMDD_HHMMSS` si la
  columna ya existía antes de aplicar.
- `fase_f_vinos_iva_pct.down.sql` — DESTRUCTIVO: borra la columna.
  Hace backup defensivo previo. No ejecutar en producción salvo
  petición explícita y con backup.

## Lo que afecta en el código

- `agregarPeriodoBodega.js`: añade `iva_pct` al JOIN de vinos. Si
  falla con 42703, reintenta sin la columna (cada `l.vino.iva_pct`
  queda undefined, fallback al global → mismo resultado que hoy).
- `_agruparLineas`: en el cálculo per-vino de `ingresos_neto` usa
  `l.vino.iva_pct ?? ivaPct` global. **Invariante**: si NINGÚN vino
  del mes tiene `iva_pct` distinto del global, el resultado es
  idéntico bit a bit al actual (test cubierto).
- `simuladorMargen.compararConReal`: ya soporta `pvp_sin_iva` /
  `pvp + iva_pct` por vino desde la Fase D; sin cambios aquí.
- UI (`PreciosPanel.js`): campo opcional "IVA de venta (%)" oculto
  con aviso "SQL pendiente" si la columna aún no existe.

## RLS

No se tocan políticas. La columna respeta las policies ya existentes
sobre `vinos` (admin + `restaurantes.email` del dueño).

## Verificación tras aplicar (solo lectura)

Ver bloque al final del reporte de la fase.
