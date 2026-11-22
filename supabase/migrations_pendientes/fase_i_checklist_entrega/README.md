# Fase I — Checklist de entrega

Añade la columna aditiva `restaurantes.checklist_entrega jsonb NOT
NULL DEFAULT '{}'::jsonb` para persistir las CONFIRMACIONES MANUALES
del propietario sobre ítems del checklist de Ajustes que no tienen
señal automática derivable:

- `qr_probado_en`    → "¿El QR funciona bien en móvil?"
- `mapa_revisado_en` → "¿He revisado el mapa estrella/joya al menos una vez?"

Los otros dos ítems del checklist (Inventario preparado, Referencias
completas) NO usan esta columna: su estado se deriva de señales
reales (conteo inicial cerrado y vinos activos con precio+coste).

## Formato del JSONB

```jsonc
{
  "qr_probado_en":   "2026-11-22T10:00:00Z",   // ISO date string → Listo
  "mapa_revisado_en":"2026-11-22T10:05:00Z"
}
```

- Claves permitidas (validadas por el endpoint, no por la BD):
  `qr_probado_en`, `mapa_revisado_en`. Ver
  `app/lib/checklistEntrega.js:CLAVES_CONFIRMACION_MANUAL`.
- Valor = ISO date string cuando está marcado; clave ausente cuando
  está desmarcado (el endpoint borra la clave con `#- clave` en lugar
  de `null`).
- Default `{}` = ningún ítem confirmado todavía.

## Ejecuta SOLO uno

- `fase_i_checklist_entrega.up.sql`   — crea la columna.
  Idempotente (usa `IF NOT EXISTS`). Hace backup previo en
  `backup_privado.restaurantes_checklist_YYYYMMDD_HHMMSS` si la
  columna ya existía.
- `fase_i_checklist_entrega.down.sql` — DESTRUCTIVO: borra la columna
  y pierde las confirmaciones. Hace backup defensivo previo. El código
  tolera la ausencia de la columna (degrada: ítems manuales siempre
  "Pendiente"), así que el rollback no rompe la app pero obliga a
  re-marcar.

## Lo que afecta en el código

- `app/api/checklist-entrega/route.js` (POST) — Escribe / borra la
  clave bajo validación: sólo permite claves de
  `CLAVES_CONFIRMACION_MANUAL`. Si la columna no existe, responde
  502 explicando que la migración está pendiente (sin romper Ajustes).
- `app/dashboard/ajustes/page.js` — Carga `checklist_entrega` del
  restaurante y pinta "Marcar como hecho" / "Desmarcar" por ítem
  manual. Si el fetch falla, los ítems manuales siguen apareciendo
  pendientes (comportamiento previo).

## RLS

La columna respeta las policies ya existentes sobre `restaurantes`.
No se añaden ni modifican policies; las escrituras pasan por
`service_role` tras `requireRestaurantAccess`.

## Verificación tras aplicar (solo lectura)

```sql
-- 1) Columna creada con tipo y default esperados
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'restaurantes'
  and column_name = 'checklist_entrega';

-- 2) Todas las filas tienen {} por defecto
select count(*) as sin_marcas
from public.restaurantes
where checklist_entrega = '{}'::jsonb;

-- 3) Backup si existía (vacío si es la primera aplicación)
select table_name from information_schema.tables
where table_schema = 'backup_privado'
  and table_name like 'restaurantes_checklist_%';
```
