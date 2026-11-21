# Roles por usuario — Diseño (Fase F)

**Estado**: documento de diseño. **Nada ejecutable**. Para aplicar hace falta
una fase posterior dedicada con SQL propio, cambios en RLS y auth.

## 1. Estado actual (auditado)

### Autenticación y propiedad

- **Admin global**: email hardcoded `cataconjuanjo@gmail.com` (variable
  `ADMIN_EMAIL` en `app/api/_lib/auth.js`). Ve y hace todo en todos los restaurantes.
- **Propietario de restaurante**: la fila `restaurantes.email` es el email
  del dueño. El patrón RLS canónico que replican TODAS las tablas sensibles
  del dashboard es:
  ```
  (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
  OR restaurante_id IN (SELECT id FROM restaurantes WHERE email = (auth.jwt() ->> 'email'))
  ```
- **No existe** tabla multiusuario: no hay `restaurante_usuarios`, ni
  `miembros_restaurante`, ni `restaurant_access`. Hoy, un restaurante tiene
  exactamente **un** usuario humano (el del `restaurantes.email`) + el admin.

### Plan gating

`app/lib/plans.js` define 5 planes con features:
- `basic`   (100 vinos)   — carta_qr, hub, personalización básica, maridaje cliente.
- `pro`     (200 vinos)   — + modo_camarero, bodega, precios_margenes.
- `bodega`  (1000 vinos)  — + informes.
- `sumiller` (5000 vinos) — + somm_* (explotación, histórico, simulador).
- `premium` ("Acompañado", 9999 vinos) — todo.

El gating se aplica a nivel de UI (feature flag) y de RLS (algunas tablas).

### Modos especiales

- **Modo camarero**: feature `modo_camarero` del plan pro+. No hay rol per se,
  es una UI alternativa (gestión de servicio en sala) a la que entran los
  mismos usuarios del restaurante.
- **Kiosko**: auth distinto (slug-based, sin JWT). No está sujeto al patrón
  RLS por email. Fuera del alcance de este diseño.
- **Consultoría / Cambiar restaurante**: admin (cataconjuanjo) puede conmutar
  entre restaurantes vía `?restaurante_id=…` en la URL. No hay tabla que
  limite qué restaurantes puede ver un consultor externo.

## 2. Problema que resuelve este diseño

Con el modelo actual, **todo lo que puede hacer el propietario lo puede
hacer cualquier persona que use su login**. No hay forma de:
- Dar acceso limitado a un gerente (sin que pueda cerrar meses).
- Un sumiller con acceso solo a bodega y catálogo de vinos.
- Un camarero que solo registra partes de servicio.
- Un consultor externo con acceso de **solo lectura** multi-restaurante.
- Trazar "quién hizo qué" a nivel de usuario (hoy `created_by` apunta al email).

## 3. Roles propuestos

| Rol             | Descripción                                                                             |
|-----------------|-----------------------------------------------------------------------------------------|
| `propietario`   | Dueño o socio. Cerrar mes, firmar cierres, cambiar plan, gestionar usuarios.            |
| `gerente`       | Gestión operativa del día a día. No cierra meses, no gestiona plan ni usuarios.         |
| `sumiller`      | Bodega + catálogo + precios + simulador + informes **lectura**. No toca personal/P&L.   |
| `camarero`      | Partes de servicio + lectura de carta. No ve económicas.                                |
| `consultor`     | **Solo lectura** global. Puede ver todo pero no editar nada. Opcional multi-restaurante.|

## 4. Matriz de permisos (acción × rol)

Marca:  ✓ puede  ·  ✗ no puede  ·  R lectura

| Acción / Rol                              | Propietario | Gerente | Sumiller | Camarero | Consultor |
|-------------------------------------------|:-----------:|:-------:|:--------:|:--------:|:---------:|
| Dashboard Explotación                     |      ✓      |    ✓    |    R     |    ✗     |     R     |
| Editar parámetros explotación (nóminas…)  |      ✓      |    ✓    |    ✗     |    ✗     |     ✗     |
| Cerrar mes                                |      ✓      |    ✗    |    ✗     |    ✗     |     ✗     |
| Firmar cierre con histórico               |      ✓      |    ✗    |    ✗     |    ✗     |     ✗     |
| Catálogo vinos (ver)                      |      ✓      |    ✓    |    ✓     |    R     |     R     |
| Catálogo vinos (crear/editar/borrar)      |      ✓      |    ✓    |    ✓     |    ✗     |     ✗     |
| Editar costes de vino                     |      ✓      |    ✓    |    ✓     |    ✗     |     ✗     |
| Editar PVP / IVA de vino                  |      ✓      |    ✓    |    ✓     |    ✗     |     ✗     |
| Simulador margen bodega                   |      ✓      |    ✓    |    ✓     |    ✗     |     R     |
| Guardar supuestos del simulador           |      ✓      |    ✓    |    ✓     |    ✗     |     ✗     |
| Motor de precios (ajustes)                |      ✓      |    ✓    |    ✓     |    ✗     |     R     |
| Partes de servicio (crear/editar)         |      ✓      |    ✓    |    ✓     |    ✓     |     ✗     |
| Partes de servicio (firmar cierre)        |      ✓      |    ✓    |    ✗     |    ✗     |     ✗     |
| Libro de compras (crear/editar)           |      ✓      |    ✓    |    ✗     |    ✗     |     ✗     |
| Exportar informe económico (Excel/PDF)    |      ✓      |    ✓    |    R     |    ✗     |     R     |
| Informe semanal (ver)                     |      ✓      |    ✓    |    ✓     |    R     |     R     |
| Gestión de usuarios/roles                 |      ✓      |    ✗    |    ✗     |    ✗     |     ✗     |
| Cambiar plan / suscripción                |      ✓      |    ✗    |    ✗     |    ✗     |     ✗     |
| Admin global (otros restaurantes)         |     ✗ *     |    ✗    |    ✗     |    ✗     |     ✓ **  |

\* El admin `cataconjuanjo@gmail.com` es una capa superior a "propietario" que
sí puede ver otros restaurantes. Se mantiene sin cambios.
\** Consultor puede tener acceso a varios restaurantes según `activos_en`.

## 5. Modelo de datos — SQL aditivo esbozado

**NO implementar en esta fase**. Esquema propuesto:

```sql
-- Tabla principal: un usuario en N restaurantes con un rol por restaurante.
CREATE TABLE IF NOT EXISTS public.restaurante_usuarios (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  uuid        NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  -- Dos formas de identificar al usuario (al menos uno debe estar):
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text,        -- fallback si el usuario aún no se registró
  rol             text        NOT NULL
                              CHECK (rol IN ('propietario','gerente','sumiller','camarero','consultor')),
  activo          boolean     NOT NULL DEFAULT true,
  invitado_por    uuid        REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurante_usuarios_tiene_identificador
    CHECK (user_id IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT restaurante_usuarios_unique_rol_por_rest
    UNIQUE NULLS NOT DISTINCT (restaurante_id, user_id, email)
);

-- Índice para el join canónico de RLS.
CREATE INDEX IF NOT EXISTS ru_restaurante_user_idx
  ON public.restaurante_usuarios(restaurante_id, user_id, activo);
CREATE INDEX IF NOT EXISTS ru_restaurante_email_idx
  ON public.restaurante_usuarios(restaurante_id, lower(email), activo);

-- Helper function para RLS (evita subqueries repetidos en policies).
CREATE OR REPLACE FUNCTION public.tiene_rol(_restaurante_id uuid, _roles text[])
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurante_usuarios ru
    WHERE ru.restaurante_id = _restaurante_id
      AND ru.activo = true
      AND ru.rol = ANY(_roles)
      AND (
        ru.user_id = auth.uid()
        OR lower(ru.email) = lower(auth.jwt() ->> 'email')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

## 6. Evolución de RLS (sin romper el patrón actual)

**Principio**: las policies actuales (admin + `restaurantes.email`) siguen
válidas → el propietario ve TODO como hoy. Se **añaden** cláusulas para los
otros roles. Ejemplo para `parametros_explotacion`:

```sql
-- SELECT: propietario y gerente ven todo; sumiller ve solo lectura (misma
-- policy — la escritura se controla con la policy de UPDATE por separado).
CREATE POLICY "auth_parametros_select_v2" ON public.parametros_explotacion
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'                    -- admin (idem)
    OR restaurante_id IN (SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email')) -- propietario (idem)
    OR public.tiene_rol(restaurante_id, ARRAY['gerente','sumiller','consultor'])   -- NUEVO
  );

-- UPDATE: propietario y gerente (no sumiller ni consultor).
CREATE POLICY "auth_parametros_update_v2" ON public.parametros_explotacion
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
    OR restaurante_id IN (SELECT id FROM public.restaurantes WHERE email = (auth.jwt() ->> 'email'))
    OR public.tiene_rol(restaurante_id, ARRAY['gerente'])
  );
```

Para tablas "duras" (`cierres_mensuales_bodega`) la policy de INSERT se
restringe a `propietario` para no permitir que gerente cierre meses.

## 7. Cambios en `plans.js`

`plans.js` se queda prácticamente igual. Añadimos una capa **ortogonal** a
las features del plan:
- Plan → qué FEATURES desbloquea el restaurante (bodega, informes, somm_*).
- Rol → qué puede HACER cada usuario sobre esas features.

Un `sumiller` en plan `premium` ve todas las pantallas que el plan desbloquea,
pero no puede guardar nóminas. Un `camarero` en plan `premium` solo ve la
pestaña de partes de servicio.

Función helper nueva (ejemplo):
```javascript
export function puedeAccion(restaurante, rol, accion) {
  if (!puedeUsar(restaurante, featureDeLaAccion(accion))) return false
  return MATRIZ_PERMISOS[rol].includes(accion)
}
```

## 8. Plan de migración por fases

### Fase R1 — Tabla + helper, sin aplicar policies nuevas  (riesgo: BAJO)
- Crear tabla `restaurante_usuarios` (vacía).
- Crear función `tiene_rol`.
- Seedear: cada restaurante existente recibe una fila con `rol='propietario'`
  copiada de `restaurantes.email` (script aditivo).
- Las policies actuales siguen activas. Nada cambia en producción.
- **Esfuerzo**: 2-3h. **Riesgo**: nulo.

### Fase R2 — UI de gestión de usuarios/roles (admin + propietario)  (riesgo: MEDIO)
- Nueva pantalla "Equipo" (ajustes del restaurante) donde el propietario
  invita a emails con un rol.
- Al invitar, se añade fila a `restaurante_usuarios`. El invitado al loguearse
  recibe acceso automáticamente.
- Aún no se enforza nada en RLS → funciona como "lista de usuarios teóricos".
- **Esfuerzo**: 8-12h. **Riesgo**: medio (UX, correo de invitación opcional).

### Fase R3 — Aplicar policies v2 por tabla  (riesgo: ALTO)
- Reescribir las policies de cada tabla sensible añadiendo `tiene_rol(...)`.
- Hacer en bloques: primero lectura (expandir), luego escritura (restringir).
- Tener suite exhaustiva de smoke tests por rol antes de aplicar en producción.
- Cada tabla se hace en su propia migración con up/down (misma estructura
  que las migraciones actuales de `supabase/migrations_pendientes/`).
- **Esfuerzo**: 12-20h. **Riesgo**: alto si se aplica sin suite de smoke.

### Fase R4 — Gating de UI por rol  (riesgo: BAJO)
- Añadir `puedeAccion(restaurante, rol, accion)` y usarlo para ocultar/
  deshabilitar botones y rutas según rol.
- Importante: la UI oculta pero NUNCA es la seguridad real; esa está en la
  RLS (fase R3).
- **Esfuerzo**: 6-10h. **Riesgo**: bajo.

### Fase R5 — Audit log y multi-restaurante para consultor  (opcional)
- Tabla `audit_log(user_id, restaurante_id, accion, tabla, row_id, timestamp)`.
- Consultor puede ser invitado a N restaurantes; un selector global cambia de contexto.
- **Esfuerzo**: 10-15h.

## 9. Riesgos y mitigaciones

| Riesgo                                                           | Mitigación                                                            |
|------------------------------------------------------------------|-----------------------------------------------------------------------|
| Policies v2 rompen un flujo existente del propietario            | Las cláusulas antiguas se mantienen → policies OR siempre permisivas.  |
| Un `camarero` ve accidentalmente nóminas                         | Smoke tests por rol en CI + revisión manual por tabla antes de aplicar.|
| Invitaciones a emails inexistentes en auth.users                 | Columna `email` + `tiene_rol` acepta ambos; se vincula al logueo.      |
| Admin pierde capacidad de debug entre restaurantes               | La cláusula `(auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'` se mantiene. |
| Duplicados en `restaurante_usuarios` (misma persona dos veces)   | `UNIQUE (restaurante_id, user_id, email)` con `NULLS NOT DISTINCT`.    |

## 10. Qué NO cambia

- `restaurantes.email` sigue siendo el "propietario principal". No se elimina.
- El admin global `cataconjuanjo@gmail.com` se mantiene exactamente igual.
- Las features de `plans.js` NO cambian; roles son una capa ortogonal.
- Kiosko tiene su propio esquema de auth y queda fuera.

---

Este documento es la referencia de diseño. Para implementar, pide una
fase R1 dedicada: tabla + helper + seed, sin cambios de RLS.
