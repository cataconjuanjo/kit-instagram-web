# Fase K — Migraciones aditivas del consultor

Dos tablas nuevas que alimentan el registro de contactos y el seguimiento
comercial de las propuestas. Ambas son **aditivas** (sólo crean cosas) y
**idempotentes** (IF NOT EXISTS). El código despliega antes de que
apliques el SQL y degrada con elegancia: la UI muestra "pendiente de
activar" y no rompe Radar ni ficha.

## Qué se crea

### 01_contactos.up.sql

- `public.consultor_contactos`
  - `id uuid pk default gen_random_uuid()`
  - `restaurante_id uuid NOT NULL` → FK a `restaurantes(id) ON DELETE CASCADE`
  - `ocurrido_en timestamptz NOT NULL default now()`
  - `canal text NOT NULL CHECK (canal IN ('llamada','visita','whatsapp','email','otro'))`
  - `resumen text NOT NULL CHECK (length(resumen) <= 1000)`
  - `proximo_contacto date NULL`
  - `creado_por uuid NULL`
  - `created_at timestamptz NOT NULL default now()`
- Índices: `(restaurante_id, ocurrido_en DESC)` y `(proximo_contacto)` parcial.
- RLS activada sin políticas: acceso sólo vía `/api/admin/contactos` con
  service_role tras `validarAdmin`.

### 02_propuesta_seguimiento.up.sql

- `public.consultor_propuesta_seguimiento`
  - `id uuid pk`
  - `propuesta_id uuid NOT NULL UNIQUE` → FK a
    `consultor_propuestas(id) ON DELETE CASCADE`
  - `restaurante_id uuid NOT NULL` → FK a
    `restaurantes(id) ON DELETE CASCADE`
  - `estado text NOT NULL default 'propuesta' CHECK` en
    `('propuesta','enviada','aceptada','rechazada','implantada')`
  - `enviada_en timestamptz NULL`
  - `aceptada_en timestamptz NULL`
  - `implantada_en timestamptz NULL`
  - `importe_estimado_eur numeric(12,2) NULL`
  - `importe_capturado_eur numeric(12,2) NULL`
  - `nota text NULL`
  - `created_at`, `updated_at`
- Trigger `set_updated_at_consultor_prop_seg` para mantener `updated_at`.
- Índices: `(restaurante_id)` y `(restaurante_id, estado)`.
- RLS activada sin políticas: acceso sólo vía
  `/api/admin/propuestas-seguimiento` con service_role.
- `propuesta_id` es uuid porque `consultor_propuestas.id` es uuid
  (verificado en `app/api/admin/propuestas/route.js` y en el SELECT de
  `SELECT_PROPUESTA_ADMIN`).

## Cómo aplicarlas

```sql
-- En Supabase SQL editor o psql:
\i supabase/migrations_pendientes/fase_k_consultor/01_contactos.up.sql
\i supabase/migrations_pendientes/fase_k_consultor/02_propuesta_seguimiento.up.sql
```

(En Vercel/CI, pasarlos al mismo flujo que ya uses para fase_i.)

## Cómo verificar que están aplicadas

```sql
-- Ambas deben devolver 1 fila cada una:
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('consultor_contactos', 'consultor_propuesta_seguimiento');

-- Columnas esperadas:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'consultor_contactos'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'consultor_propuesta_seguimiento'
ORDER BY ordinal_position;

-- Trigger esperado:
SELECT trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'consultor_propuesta_seguimiento';
```

## Degradación si NO están aplicadas

- `/api/admin/contactos` detecta el error "relation does not exist" y
  responde `{ ok: true, items: [], pendiente_migracion: true }` en GET
  y 503 con `{ pendiente_migracion: true }` en POST/DELETE.
- `/api/admin/propuestas-seguimiento` hace lo mismo.
- La ficha muestra el bloque de contactos con una línea "Pendiente de
  activar en servidor — pídele al admin que aplique la migración de
  fase K" y la pestaña Propuestas no renderiza el panel de seguimiento.
- Radar y Mi día no emiten tareas de contacto. Los valores
  "Último contacto: hace N días" caen al proxy anterior (número de
  propuestas abiertas + incidencias) para no mostrar "Sin contactos"
  si la tabla aún no existe.

## Cómo revertir (sólo en desarrollo)

```sql
\i supabase/migrations_pendientes/fase_k_consultor/02_propuesta_seguimiento.down.sql
\i supabase/migrations_pendientes/fase_k_consultor/01_contactos.down.sql
```

Ambos down.sql guardan backup previo en
`backup_privado.<tabla>_predown_<timestamp>`.

## Qué NO hacen

- NO modifican `consultor_propuestas` ni ninguna tabla existente.
- NO escriben datos, sólo crean estructura.
- NO crean políticas RLS para anon/authenticated (intencional).
- NO dependen de otra migración de fase K ni siquiera entre sí.
