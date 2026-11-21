# Fase C — Tabla `simulador_margen_bodega`

Persiste los supuestos manuales del simulador de margen mínimo de
bodega (materiales, suministros, otros, beneficio objetivo y
ventas previstas si el usuario las fija).

El código funciona **antes y después** de aplicar esta migración:
sin la tabla, el simulador degrada a sesión y muestra un aviso
"SQL pendiente — no se están guardando los supuestos".

## Ejecuta SOLO uno

- `fase_c_simulador_margen.up.sql` — crea la tabla + RLS. Idempotente.
- `fase_c_simulador_margen.down.sql` — borra la tabla. Destructivo:
  pierde todos los supuestos guardados. **No ejecutar en producción
  salvo que se haya hecho backup previo.**

Hace backup en `backup_privado.simulador_margen_bodega_YYYYMMDD` si
la tabla ya existía antes de aplicar, antes de recrearla idempotente.

## Tabla

```
simulador_margen_bodega(
  restaurante_id uuid PK FK restaurantes.id ON DELETE CASCADE,
  supuestos      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now()
)
```

`supuestos` guarda un objeto con las claves manuales:
```
{
  materiales:            number | null,
  suministros:           number | null,
  otros:                 number | null,
  beneficio_objetivo:    number | null,
  ventas_previstas_fijo: number | null   // si el usuario sobreescribe
}
```

El resto de campos (personal, alquiler, roturas_invitaciones,
ventas_previstas) se precalculan desde datos reales en cada carga
y NO se persisten.

## RLS

Mismo patrón que `carta_simulacion` /
`parametros_explotacion`:
admin `cataconjuanjo@gmail.com` + `restaurantes.email = jwt.email`.

## Verificación tras aplicar (solo lectura)

```sql
-- Debe existir y responder 0 filas sin error.
SELECT count(*) FROM public.simulador_margen_bodega;

-- RLS activa con 4 políticas.
SELECT policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'simulador_margen_bodega'
ORDER BY policyname;
-- Esperado: 4 filas
--   auth_simulador_margen_bodega_delete
--   auth_simulador_margen_bodega_insert
--   auth_simulador_margen_bodega_select
--   auth_simulador_margen_bodega_update

-- Backup si se aplicó sobre una tabla previa:
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'backup_privado'
  AND table_name LIKE 'simulador_margen_bodega_%'
ORDER BY table_name DESC
LIMIT 5;
```
