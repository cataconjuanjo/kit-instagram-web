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

- `add_facturas_bucket_webp.up.sql` — añade `image/webp` al array
  `allowed_mime_types` del bucket `facturas-bodega` (Fase 5). El
  código del cliente y de `/api/facturas/extraer` ya aceptan WebP;
  si el bucket aún no permite ese MIME, la API responde 415 amistoso
  "Formato no admitido todavía" en lugar de 500. Sin la migración,
  PDF/PNG/JPEG siguen funcionando con normalidad.

- `relax_historico_mensual_stock_compras.up.sql` — libera las 4
  columnas `valor_stock_bodega / stock_inicial_valor /
  stock_final_valor / compras_total` de `historico_mensual` a
  NULL (DROP NOT NULL + DROP DEFAULT) y rellena con NULL las filas
  donde las cuatro valgan 0 (= "Sin dato" heredado del default).
  El código ya trata `null` y `todos-a-0` como "Sin dato" con la
  misma regla, por lo que funciona antes y después de aplicar la
  migración.

- `add_resto_ingresos.up.sql` — añade la columna
  `resto_ingresos numeric NOT NULL DEFAULT 0` a
  `parametros_explotacion`. Sin esta columna, la Explotación sigue
  funcionando exactamente igual que antes (TOTAL INGRESOS = Ventas
  Netas). Con la columna, la UI muestra la nueva línea y los
  cálculos usan TOTAL INGRESOS como denominador. El código degrada
  en runtime si la columna no existe (igual que `imputacion_pct`).

- `add_eventos_bodega.up.sql` — nueva tabla `public.eventos_bodega`
  para la Fase A (cabecera de maridajes y grupos). ACTUALIZADO
  respecto a la versión original del PR #44 (nunca aplicada):
  añade `incluido_en_tpv boolean NOT NULL DEFAULT false` (evita
  doble conteo con ventas TPV), `menu_nombre text` (nombre libre
  del menú), `importe_bruto numeric(12,2)` (con IVA, nullable) y
  `created_by text` (email del creador, auditoría). Aditiva
  (CREATE TABLE IF NOT EXISTS), con RLS que replica el patrón
  `auth_carta_historial_*` (admin cataconjuanjo@gmail.com +
  `restaurantes.email` = dueño). El código de la Fase A funciona
  sin la tabla: la pestaña "Eventos" muestra aviso "SQL pendiente"
  y el agregador/Excel no cambian de comportamiento.

AVISO IMPORTANTE: los ficheros `.up.sql` y `.down.sql` están
SEPARADOS. **Ejecuta SÓLO UNO**. El `.down.sql` elimina la tabla y
pierde todos los datos; siempre haz backup en `backup_privado`
antes.
