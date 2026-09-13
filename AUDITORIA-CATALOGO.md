# AUDITORÍA TÉCNICA — SUBSISTEMA DE CATÁLOGO (CARTA VIVA)

> Generado: 2026-09-09  
> Alcance: proveedores → favoritos → simulador/catálogo de restaurante  
> Nota: las métricas de sección 5 son queries ejecutables; no se pudo conectar
> directamente a Supabase por protección de credenciales. Ejecutar en SQL Editor.

---

## 1. ESQUEMA

### 1.1 `proveedores_vino`

```sql
CREATE TABLE public.proveedores_vino (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                text        NOT NULL,
  contacto              text,
  email                 text,
  telefono              text,
  zona                  text,          -- texto libre, no normalizado
  notas                 text,
  visible_restaurantes  boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX proveedores_vino_nombre_idx ON public.proveedores_vino (nombre);

ALTER TABLE public.proveedores_vino ENABLE ROW LEVEL SECURITY;
-- Sin políticas RLS públicas. Sólo accesible via service role key.
```

### 1.2 `proveedor_catalogo_vinos`

```sql
-- DDL base (add_proveedores_catalogos.sql)
CREATE TABLE public.proveedor_catalogo_vinos (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id          uuid        NOT NULL REFERENCES proveedores_vino(id) ON DELETE CASCADE,
  nombre                text        NOT NULL,
  bodega                text,
  tipo                  text,
  tipo_raw              text,          -- valor original antes de normalizar
  region                text,
  uva                   text,
  anada                 text,
  referencia            text,
  formato               text,
  coste_estimado        numeric(10,2) DEFAULT 0,
  pvp_recomendado       numeric(10,2) DEFAULT 0,
  disponibilidad        text,
  notas                 text,
  activo                boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- columnas añadidas por migraciones posteriores:
  pvp_copa              numeric(10,2) DEFAULT 0,   -- add_catalogo_pvp_copa.sql
  favorito              boolean DEFAULT false,       -- add_favoritos_catalogo.sql

  -- columnas de enriquecimiento (scripts de importación):
  zona                  text,          -- DOP/IGP normalizada (a veces duplica region)
  tamanyo               text,
  unidades_por_caja     integer,
  referencia_proveedor  text,
  almacen_proveedor     text,
  graduacion            text,
  do_igp                text,          -- denominación de origen normalizada
  pais                  text,
  comunidad_autonoma    text,
  zona_revisar          boolean        -- true cuando la DOP no pudo normalizarse
);

CREATE INDEX proveedor_catalogo_vinos_proveedor_idx
  ON public.proveedor_catalogo_vinos (proveedor_id, activo);

ALTER TABLE public.proveedor_catalogo_vinos ENABLE ROW LEVEL SECURITY;
-- Sin políticas RLS públicas. Sólo accesible via service role key.
```

**¿Quién puede leer `coste_estimado`?**  
Solo el admin autenticado con `SUPABASE_SERVICE_ROLE_KEY`. El endpoint
`/api/admin/proveedores` valida que el email del token JWT sea `NEXT_PUBLIC_ADMIN_EMAIL`
antes de usar el cliente service role. Ninguna política RLS permite al restaurante
leer costes directamente; la API `/api/catalogo-consultor` devuelve `coste_estimado`
al restaurante sólo si `plan` incluye `catalogo_consultor`.

### 1.3 `carta_simulacion`

```sql
-- add_carta_simulacion.sql + add_copa_decision_columns.sql + add_origen_carta_simulacion.sql
CREATE TABLE public.carta_simulacion (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id            uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,

  -- Exactamente uno de los dos debe estar relleno (CONSTRAINT).
  vino_id                   uuid        REFERENCES vinos(id) ON DELETE CASCADE,
  catalogo_vino_id          uuid        REFERENCES proveedor_catalogo_vinos(id) ON DELETE CASCADE,

  -- Snapshot inmutable en el momento de añadir al borrador.
  nombre                    text        NOT NULL,
  bodega                    text,
  tipo                      text,
  region                    text,
  anada                     text,
  formato                   text,

  -- Precios editables dentro del simulador.
  precio_botella            numeric(10,2),
  precio_copa               numeric(10,2),
  coste_compra              numeric(10,2),

  -- Snapshots del catálogo al añadir (add_copa_decision_columns.sql).
  pvp_recomendado_catalogo  numeric(10,2),  -- PVP botella calculado desde coste
  pvp_copa_catalogo         numeric(10,2),  -- PVP copa calculado desde coste
  ofrecido_por_copa         boolean,        -- NULL=pendiente, true=sí, false=no

  -- Trazabilidad de sustitución (add_simulador_sustituye_a.sql).
  sustituye_a               uuid,
  origen                    text,

  estado                    text        NOT NULL DEFAULT 'actual'
                                        CHECK (estado IN ('actual', 'nuevo', 'fuera')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT carta_simulacion_origen_exclusivo CHECK (
    (vino_id IS NOT NULL AND catalogo_vino_id IS NULL) OR
    (vino_id IS NULL     AND catalogo_vino_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX carta_simulacion_vino_uidx
  ON carta_simulacion (restaurante_id, vino_id)       WHERE vino_id IS NOT NULL;
CREATE UNIQUE INDEX carta_simulacion_catalogo_uidx
  ON carta_simulacion (restaurante_id, catalogo_vino_id) WHERE catalogo_vino_id IS NOT NULL;

ALTER TABLE carta_simulacion ENABLE ROW LEVEL SECURITY;

-- RLS: admin O propietario del restaurante.
CREATE POLICY "auth_carta_simulacion_select" ON carta_simulacion FOR SELECT TO authenticated
  USING ( (auth.jwt() ->> 'email') = 'cataconjuanjo@gmail.com'
       OR restaurante_id IN (SELECT id FROM restaurantes WHERE email = (auth.jwt() ->> 'email')) );
-- (idem para INSERT, UPDATE, DELETE)
```

### 1.4 `consultor_propuestas`

```sql
-- add_consultor_propuestas.sql
CREATE TABLE public.consultor_propuestas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  titulo              text        NOT NULL,
  vino                text,
  tipo                text,
  zona                text,
  proveedor_sugerido  text,
  coste_estimado      numeric(10,2) DEFAULT 0,
  precio_recomendado  numeric(10,2) DEFAULT 0,
  margen_objetivo     integer DEFAULT 0,
  plato_objetivo      text,
  motivo              text,
  prioridad           text        NOT NULL DEFAULT 'media'
                                  CHECK (prioridad IN ('alta', 'media', 'baja')),
  estado              text        NOT NULL DEFAULT 'propuesta'
                                  CHECK (estado IN ('propuesta', 'interesa', 'descartada', 'incorporada')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE consultor_propuestas ENABLE ROW LEVEL SECURITY;
-- Políticas en add_dashboard_policies.sql (admin O restaurante propietario).
```

### 1.5 `restaurant_economic_settings`

```sql
-- add_economic_traceability.sql
CREATE TABLE public.restaurant_economic_settings (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id              uuid        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE UNIQUE,
  formula_version             text        NOT NULL DEFAULT 'economic-trace-v1',
  iva_venta_pct               numeric(6,2) NOT NULL DEFAULT 10,
  pvp_incluye_iva             boolean     NOT NULL DEFAULT true,
  coste_incluye_iva           boolean     NOT NULL DEFAULT false,
  formato_botella_ml          integer     NOT NULL DEFAULT 750,
  copas_por_botella           numeric(6,2) NOT NULL DEFAULT 5,
  merma_copa_pct              numeric(6,2) NOT NULL DEFAULT 10,
  margen_objetivo_botella_pct numeric(6,2) NOT NULL DEFAULT 65,
  margen_objetivo_copa_pct    numeric(6,2) NOT NULL DEFAULT 70,
  precio_minimo_copa          numeric(10,2) NOT NULL DEFAULT 4.50,
  stock_seguridad_default     numeric(10,2) NOT NULL DEFAULT 2,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE restaurant_economic_settings ENABLE ROW LEVEL SECURITY;
-- RLS SELECT: propietario del restaurante (email match).
-- El admin accede vía service role key.
```

**Resumen de políticas RLS y acceso a costes:**

| Tabla                        | RLS | Admin (service role) | Restaurante autenticado |
|------------------------------|-----|----------------------|------------------------|
| `proveedores_vino`           | ✓   | Sí (todo)            | No (sin política)      |
| `proveedor_catalogo_vinos`   | ✓   | Sí (todo)            | No (sin política)      |
| `carta_simulacion`           | ✓   | Sí (todo)            | Solo sus filas         |
| `consultor_propuestas`       | ✓   | Sí (todo)            | Solo sus filas         |
| `restaurant_economic_settings` | ✓ | Sí (todo)            | Solo sus filas         |

`coste_estimado` solo llega al restaurante si el plan lo incluye y la API lo elige enviar.

---

## 2. FLUJOS

### 2a. `/admin/proveedores` vista=catalogo (fondo común, ~9.098 refs)

**Fichero:** `app/admin/proveedores/page.js`  
**Función de carga:** `cargarCatalogo()` (línea 318)  
**Query builder:**

```js
// app/api/admin/proveedores/route.js:192-217  GET handler
const SELECT_CATALOGO_VINO = [
  'id', 'proveedor_id', 'nombre', 'bodega', 'tipo', 'tipo_raw', 'region', 'uva',
  'anada', 'referencia', 'formato', 'coste_estimado', 'pvp_recomendado', 'pvp_copa',
  'disponibilidad', 'notas', 'activo', 'favorito', 'created_at', 'updated_at',
  'proveedores_vino(nombre)',
  'zona', 'tamanyo', 'unidades_por_caja', 'referencia_proveedor', 'almacen_proveedor',
  'graduacion', 'do_igp', 'pais', 'comunidad_autonoma', 'zona_revisar',
].join(', ')

supabase.from('proveedor_catalogo_vinos')
  .select(SELECT_CATALOGO_VINO)
  .order('created_at', { ascending: false })
// Paginado manual con .range() en chunks de 1000 (seleccionarTodo)
```

El precio se calcula en cliente con `calcularBotella(costeVino)` y `calcularCopa(pvpBotella)`.
**Los cálculos son locales** — no se leen de `pvp_recomendado` ni de `pvp_copa` de la BD.

### 2b. `/admin/proveedores` vista=gestion

Mismo endpoint, mismo GET. La diferencia es solo visual: `vistaProveedores === 'gestion'` muestra
el formulario de edición y la lista por proveedor con acordeón. El estado `vistaProveedores` se lee
de `searchParams.get('vista')` (línea 296).

### 2c. Marcado de favorito (☆)

**Fichero:** `app/admin/proveedores/page.js:551` función `toggleFavorito()`

```js
// PATCH /api/admin/proveedores  con body: { kind: 'favorito', id, favorito: boolean }
// route.js:315-323
supabase.from('proveedor_catalogo_vinos')
  .update({ favorito: Boolean(body.favorito), updated_at: new Date().toISOString() })
  .eq('id', body.id)
  .select('id, favorito')
```

**Escribe en:** columna `proveedor_catalogo_vinos.favorito` (boolean).  
Fallback silencioso a localStorage si el PATCH falla (migración no aplicada en ese momento).

### 2d. `/admin/simulador-cartas` — altas desde catálogo y margen 71-72%

**Fichero:** `app/admin/simulador-cartas/page.js`  
**Función:** `generarSimulacion()` (línea 220)

```js
// Candidatos del catálogo filtrados por:
const candidatos = vinosCatalogo
  .filter(v => v.activo !== false)
  .filter(v => !proveedorId || String(v.proveedor_id) === String(proveedorId))
  .filter(v => !soloConCoste || numero(v.coste_estimado) > 0)
  .filter(v => !soloFavoritos || v.favorito)              // por defecto solo favoritos
  .filter(v => !clavesActuales.has(claveVino(v)))         // excluye ya en carta
  .sort((a, b) => b.score - a.score)
```

**Score de candidato** (`scoreCatalogo()` línea 186):

```js
score += 30                              // si tiene coste
score += 12                              // si es favorito
score += Math.max(0, margen - 50)        // eg: margen=72 → score += 22
score += huecos[tipo] * 180             // gap de tipo
score -= 30                              // si agotado
```

**¿De dónde sale "71-72 %"?**  
No es un parámetro configurado. Es el margen resultante de calcular PVP sugerido con
la regla `coste > 11 → pvpNeto = coste + 20` y luego añadir IVA, para costes medios-altos.
Ejemplo: coste=26.36 → pvpNeto=46.36 → pvpIVA=51 → pvpNetoVenta=51/1.1=46.36 →
margen = (46.36 - 26.36)/46.36 = 43.1%. 

Realmente el margen que muestra la UI en `razonesAlta()` (línea 213): `"margen objetivo ${porcentaje(margen)}"` es el `margenBotella` que devuelve `calcularPreciosSugeridos` — es decir el margen real calculado desde el coste, **no** el objetivo de escenario (62/65/68 %).

Los escenarios `ESCENARIOS.conservador/optimizado/ambicioso` tienen `objetivoMargen: 62/65/68`
pero ese campo sólo se usa para calcular cuántas bajas/altas generar en la simulación;
no filtra el catálogo por margen.

### 2e. Panel CATÁLOGO dentro de `/dashboard/bodega`

**Fichero:** `app/dashboard/bodega/page.js:228-259`  
**Trigger:** `panelAbierto === 'catalogo'` (lazy, solo primera vez)  
**Query:**

```js
// GET /api/catalogo-consultor?restaurante_id=...
// app/api/catalogo-consultor/route.js:49-63
supabase.from('proveedor_catalogo_vinos')
  .select('id, nombre, bodega, tipo, region, uva, anada, referencia, formato, ' +
          'coste_estimado, pvp_recomendado, pvp_copa, disponibilidad, proveedor_id, ...')
  .eq('favorito', true)       // ← SOLO favoritos
  .eq('activo', true)
  .in('proveedor_id', providerIds)  // ← solo proveedores con visible_restaurantes=true
  .order('nombre').order('id')
  .range(desde, desde + 999)  // paginado
```

Después, **recalcula** pvp_recomendado y pvp_copa desde coste con los ajustes económicos
del restaurante (ver Sección 3 para el impacto).

La pantalla (líneas 1327-1328) muestra `vino.pvp_recomendado` y `vino.pvp_copa`
**que son los valores recalculados por la API**, no los almacenados en BD.

### 2f. Bloque "HUECOS EN CARTA" — algoritmo exacto

**Fichero:** `app/dashboard/bodega/page.js:354-416` useMemo `gapAnalisis`

```js
// 1. Normalizar tipos y regiones de la carta actual
for (const v of vinosActivos) {
  const tipo   = normWineTipo(v.tipo)       // textNormalize.js
  const region = normWineRegion(v.region)
  tipoCounts[tipo]++
  cartaMap[`${tipo}||${region}`]++
}

// 2. Normalizar tipos y regiones del catálogo (solo favoritos visibles)
for (const c of catalogoVinos) {
  catMap[`${tipo}||${region}`].count++
}

// 3. Puntuar cada combo del catálogo no cubierto en carta
score = (nCat - nCarta) * (1 + tipoFraccion)
// nCat = referencias de ese combo en catálogo
// nCarta = referencias de ese combo en carta actual del restaurante
// tipoFraccion = peso del tipo en la carta

// 4. Devuelve top 3 por score, excluyendo:
//    - regiones genéricas (países: 'espana', 'france', etc.)
//    - combos con menos de 2 candidatos en catálogo
//    - combos sin representación del tipo en carta
```

**El campo que agrupa la zona es `region`** de cada vino, normalizado con `normWineRegion()`
de `app/lib/textNormalize.js`. No usa `do_igp` ni `zona`.

### 2g. Botón "+ Simular" del catálogo del restaurante

**Fichero:** `app/dashboard/bodega/page.js:835` función `anadirAlSimulador(vino)`

```js
// POST /api/simulador/anadir-catalogo
fetch('/api/simulador/anadir-catalogo', {
  method: 'POST',
  body: JSON.stringify({ restaurante_id: restaurante.id, catalogo_vino_id: vino.id, force })
})
```

**Lo que escribe** (`app/api/simulador/anadir-catalogo/route.js:133-152`):

```js
// INSERT en carta_simulacion:
{
  restaurante_id,
  catalogo_vino_id,          // FK a la referencia del catálogo
  nombre, bodega, tipo, region, anada, formato,  // snapshot inmutable
  precio_botella: null,      // el restaurante lo decide después
  precio_copa:    null,      // idem
  coste_compra:   coste,     // costePorBotella(catalogVino) — divide por unidades_por_caja
  pvp_recomendado_catalogo,  // PVP botella calculado desde coste + ajustes del restaurante
  pvp_copa_catalogo,         // PVP copa calculado desde coste + ajustes del restaurante
  estado: 'nuevo',
}
```

Protecciones anti-duplicado: bloqueo duro si el mismo `catalogo_vino_id` ya está; aviso
no bloqueante (require `force=true`) si mismo `nombre+bodega` con diferente referencia;
bloqueo duro si `agruparOfertasCatalogo` detecta que es el mismo producto aunque diferente proveedor.

### 2h. "Guardar propuesta" del panel → "Propuestas recibidas" del cliente

**Función de guardado:** `app/admin/simulador-cartas/page.js:801` `guardarPropuestas()`

```js
// POST /api/admin/propuestas  por cada baja + alta de la simulación editada
const propuesta = {
  restaurante_id,
  titulo: `Incorporar ${item.vino.nombre}`,  // o "Revisar o retirar..."
  vino, tipo, zona, proveedor_sugerido,
  coste_estimado, precio_recomendado, margen_objetivo,
  motivo: item.razones.join('. '),
  prioridad: item.score >= 44 ? 'alta' : 'media',
  estado: 'propuesta'
}
// → INSERT en consultor_propuestas
```

**Panel del cliente:** `app/dashboard/bodega/page.js:189`

```js
supabase.from('consultor_propuestas')
  .select(SELECT_CLIENT_PROPUESTA_ADMIN)
  .eq('restaurante_id', rest.id)
  .neq('estado', 'descartada')
  .order('created_at', { ascending: false })
```

El cliente ve las propuestas en el panel "Propuestas" (líneas 1101-1135) y puede responder
"Me interesa", "Incorporada", o "Descartar" — que actualiza `consultor_propuestas.estado`.

---

## 3. PRECIO — ANÁLISIS COMPLETO

### Funciones de cálculo de PVP

Hay **dos** implementaciones de `calcularCopa` con resultados distintos:

---

#### Función 1: `calcularPreciosSugeridos()` — CANÓNICA

**Fichero:** `app/lib/pricingUtils.js:129-167`

```js
export function calcularPreciosSugeridos(coste, ajustes) {
  const config = normalizarAjustesPrecios(ajustes)
  const costeNeto = costeNetoCompra(costeNormalizado, config)
  // Botella:
  const { pvpNeto } = calcularPvpNetoBotellaCatalogo(costeNeto)
  // Regla: coste<=6→×3.5 | coste<=11→×2+9 | coste>11→+20
  const baseBotella = pvpIncluyeIva ? anadirIva(pvpNeto, ivaVentaPct) : pvpNeto
  const botella = Math.round(baseBotella)             // redondea al euro más cercano
  // Copa:
  const copas = copasVendibles(config)                // = copasPorBotella × (1 - mermaPct/100)
  const baseCopa = botella / copas                    // ÷ 4.5 con defaults
  const copa = Math.round(baseCopa * 2) / 2           // redondea a 0.50 más cercano
  return { botella, copa, margenBotella, margenCopas, ... }
}
```

**Pantallas que la usan:**
- `/api/catalogo-consultor/route.js:76` → catálogo del restaurante (`/dashboard/bodega`)
- `/api/simulador/anadir-catalogo/route.js:125` → botón "Simular"
- `/api/simulador/recalcular-copa-catalogo/route.js` → recálculo masivo
- `app/admin/simulador-cartas/page.js:95` función local `pvpBotella()` (solo botella)

---

#### Función 2: `calcularBotella()` + `calcularCopa()` — ADMIN LOCAL

**Fichero:** `app/admin/proveedores/page.js:522-538`

```js
function calcularBotella(coste) {
  const calculo = calcularPreciosSugeridos(c, {})  // sin config de restaurante
  return { pvp: calculo.botella, ... }
}

function calcularCopa(pvpBotella) {
  const pvp = Math.round((pvpBotella / 5) * 2) / 2  // ← HARDCODED /5, sin merma
  return { pvp, ratioPct, copasHastaEmpatar }
}
```

**Pantallas que la usan:**
- Solo `/admin/proveedores` (filtros por rango de copa, columna PVP copa mostrada)

---

### Por qué "A Bruxa 2023" muestra copa 10,00 € en admin y 11,50 € en catálogo del restaurante

Con PVP botella calculado = **51 €** (coste estimado ~26,36 €, regla "+20 EUR", IVA incluido):

| Contexto | Función | Divisor | Cálculo | Resultado |
|----------|---------|---------|---------|-----------|
| `/admin/proveedores` | `calcularCopa(51)` local | 5 (hardcoded) | `round(51/5 × 2)/2 = round(20.4)/2` | **10,00 €** |
| `/dashboard/bodega` catálogo | `calcularPreciosSugeridos(coste, econConfig)` | 4,5 (`copasVendibles = 5×0.9`) | `round(51/4.5 × 2)/2 = round(22.67)/2` | **11,50 €** |

**La causa raíz:** `calcularCopa()` en `admin/proveedores/page.js` divide por 5 fijo y
no aplica la merma del 10 % por defecto que sí aplica `copasVendibles()` en la función
canónica. Son dos implementaciones divergentes del mismo cálculo.

---

## 4. IMPORTACIÓN

### 4.1 Script local XLSX → Supabase

**Fichero:** `scripts/import-catalogos-proveedores-to-supabase.js`

```
Uso: node scripts/import-catalogos-proveedores-to-supabase.js [output/catalogos] [--replace] [--dry-run] [--only <nombre>]
```

- **Fuentes configuradas:** Sommeliervinos, Vins Alemanys, Must of Wines / L'Excellence, Bodegas Mar Malaga
- **Lee:** XLSX generados desde los PDFs de tarifa
- **Campos mapeados:** `nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, disponibilidad, notas`
- **Normaliza:** `normalizarCamposVino()` → tipo, región, DOP/IGP vía `ref_denominaciones_es`
- **Ante referencia ya existente:**
  - Sin `--replace`: INSERT puro. **No hay upsert por clave**. Se crean duplicados si el script corre dos veces.
  - Con `--replace`: DELETE todas las filas del proveedor (`eq('proveedor_id', id)`) + INSERT todo.
- **Referencias de tarifa anterior que no vienen en la nueva:** Permanecen en BD a menos que se use `--replace`.
- **`favorito` con `--replace`:** **Se pierden irrecuperablemente** — el DELETE cascade elimina las filas con favorito=true y los nuevos INSERT asignan nuevos UUIDs.

### 4.2 Script API (para PDFs sin XLSX)

**Fichero:** `importar-vins-des-dieux.mjs` (raíz del proyecto)

```
Uso: node importar-vins-des-dieux.mjs datos.json [--dry-run] [--chunk=200] [--reemplazar] [--solo-core]
```

- **Hace:** POST /api/admin/proveedores con `kind: 'vinos_bulk'`
- **Estrategia sin `--reemplazar`:** INSERT puro (puede duplicar)
- **Estrategia con `--reemplazar`:** `body.reemplazar: true` → DELETE proveedor_id + INSERT
- **Campos CORE:** `nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, disponibilidad, notas, activo`
- **Campos EXTRA:** `zona, pais, tamanyo, pvp_copa`
- **Chunk:** inserta en lotes de 200 referencias

### 4.3 Importación desde UI (PDF)

**Ruta de API:** `app/api/admin/importar-proveedor-pdf/route.js`

Sube el PDF al endpoint, extrae el texto con Claude/parser, muestra preview en UI, y el admin confirma. Guarda vía POST /api/admin/proveedores con `kind: 'vinos_bulk'` + `reemplazar: false` por defecto.

### 4.4 Validaciones en todos los flujos

- **`payloadVino()`** (`route.js:168`) valida: nombre no vacío, proveedor_id presente
- **`repararMojibake()`** detecta y repara codificación Windows-1252 mal interpretada como UTF-8
- **`normalizarCamposVino()`** normaliza tipo → enumerado interno; región → DOP cuando posible
- **No hay constraint de unicidad** a nivel de referencia (nombre+bodega+proveedor); todo duplica

---

## 5. MÉTRICAS

> **Ejecutar en Supabase SQL Editor** (Settings → SQL Editor).
> Las queries usan los nombres reales de columnas según el DDL auditado.

### 5.1 Total referencias y total por proveedor

```sql
SELECT
  p.nombre AS proveedor,
  COUNT(c.id) AS total_refs
FROM proveedor_catalogo_vinos c
JOIN proveedores_vino p ON p.id = c.proveedor_id
GROUP BY p.nombre
ORDER BY total_refs DESC;

-- Total global:
SELECT COUNT(*) AS total_referencias FROM proveedor_catalogo_vinos;
```

### 5.2 Valores DISTINCT en el campo de zona (do_igp)

```sql
SELECT do_igp, COUNT(*) AS n
FROM proveedor_catalogo_vinos
WHERE do_igp IS NOT NULL AND do_igp <> ''
GROUP BY do_igp
ORDER BY n DESC;

SELECT COUNT(DISTINCT do_igp) AS zonas_distintas
FROM proveedor_catalogo_vinos
WHERE do_igp IS NOT NULL AND do_igp <> '';
```

### 5.3 Valores DISTINCT en el campo de bodega

```sql
SELECT COUNT(DISTINCT bodega) AS bodegas_distintas
FROM proveedor_catalogo_vinos
WHERE bodega IS NOT NULL AND bodega <> '';
```

### 5.4 Valores DISTINCT en el campo de formato

```sql
SELECT formato, COUNT(*) AS n
FROM proveedor_catalogo_vinos
WHERE formato IS NOT NULL AND formato <> ''
GROUP BY formato
ORDER BY n DESC;

SELECT COUNT(DISTINCT formato) AS formatos_distintos
FROM proveedor_catalogo_vinos
WHERE formato IS NOT NULL AND formato <> '';
```

### 5.5 Candidatos a duplicado (pg_trgm, similarity ≥ 0.82)

```sql
-- Requiere: CREATE EXTENSION IF NOT EXISTS pg_trgm;
--           CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

WITH normalizado AS (
  SELECT
    id,
    proveedor_id,
    coste_estimado,
    nombre,
    bodega,
    -- Elimina añada (4 dígitos), minúsculas, sin acentos, sin puntuación
    regexp_replace(
      lower(unaccent(nombre)),
      '\m(19|20)\d{2}\M|\W+', ' ', 'g'
    ) AS nombre_norm,
    lower(unaccent(COALESCE(bodega, ''))) AS bodega_norm
  FROM proveedor_catalogo_vinos
  WHERE activo = true
),
pares AS (
  SELECT
    a.id AS id_a, b.id AS id_b,
    a.nombre AS nombre_a, b.nombre AS nombre_b,
    a.bodega AS bodega_a, b.bodega AS bodega_b,
    a.proveedor_id AS proveedor_a, b.proveedor_id AS proveedor_b,
    a.coste_estimado AS coste_a, b.coste_estimado AS coste_b,
    similarity(a.nombre_norm, b.nombre_norm) AS sim_nombre
  FROM normalizado a
  JOIN normalizado b ON a.id < b.id
                     AND a.proveedor_id <> b.proveedor_id  -- distintos proveedores
                     AND similarity(a.nombre_norm, b.nombre_norm) >= 0.82
)
SELECT
  nombre_a, bodega_a, proveedor_a, coste_a,
  nombre_b, bodega_b, proveedor_b, coste_b,
  round(sim_nombre::numeric, 3) AS similitud,
  CASE
    WHEN coste_a > 0 AND coste_b > 0
    THEN round(abs(coste_a - coste_b) / NULLIF(LEAST(coste_a, coste_b), 0) * 100, 1)
    ELSE NULL
  END AS diferencia_coste_pct
FROM pares
ORDER BY diferencia_coste_pct DESC NULLS LAST
LIMIT 100;
```

### 5.6 Referencias sin coste y de qué proveedores

```sql
SELECT
  p.nombre AS proveedor,
  COUNT(c.id) AS sin_coste
FROM proveedor_catalogo_vinos c
JOIN proveedores_vino p ON p.id = c.proveedor_id
WHERE c.coste_estimado IS NULL OR c.coste_estimado = 0
GROUP BY p.nombre
ORDER BY sin_coste DESC;

SELECT COUNT(*) AS total_sin_coste
FROM proveedor_catalogo_vinos
WHERE coste_estimado IS NULL OR coste_estimado = 0;
```

### 5.7 Columna de añada: existencia e informada

```sql
-- La columna existe: anada text (nullable).
-- ¿Cuántas filas la tienen informada?
SELECT
  COUNT(*) FILTER (WHERE anada IS NOT NULL AND anada <> '') AS con_anada,
  COUNT(*) FILTER (WHERE anada IS NULL OR anada = '')       AS sin_anada,
  COUNT(*)                                                   AS total
FROM proveedor_catalogo_vinos;

-- ¿Cuántas tienen año en el nombre (sin columna anada)?
SELECT COUNT(*) AS anada_en_nombre_sin_columna
FROM proveedor_catalogo_vinos
WHERE (anada IS NULL OR anada = '')
  AND nombre ~ '\m(19|20)\d{2}\M';
```

### 5.8 Columna de disponibilidad/agotado

```sql
-- La columna existe: disponibilidad text (nullable).
SELECT
  COALESCE(NULLIF(disponibilidad, ''), '(vacío)') AS valor,
  COUNT(*) AS n
FROM proveedor_catalogo_vinos
GROUP BY valor
ORDER BY n DESC
LIMIT 30;
```

### 5.9 Número de favoritos y a qué tabla apuntan

```sql
-- Los favoritos son un booleano en proveedor_catalogo_vinos.
SELECT
  COUNT(*) FILTER (WHERE favorito = true)  AS favoritos_activos,
  COUNT(*) FILTER (WHERE favorito = false OR favorito IS NULL) AS no_favoritos,
  COUNT(*) AS total
FROM proveedor_catalogo_vinos;

-- Los favoritos apuntan a proveedor_catalogo_vinos.id,
-- NO a una entidad vino separada. La FK en carta_simulacion también apunta aquí:
SELECT COUNT(*) AS lineas_simulacion_desde_catalogo
FROM carta_simulacion
WHERE catalogo_vino_id IS NOT NULL;
```

### 5.10 "Lo de Carmen": carta y campos faltantes

```sql
-- Buscar el restaurante
SELECT id, nombre, email FROM restaurantes WHERE nombre ILIKE '%carmen%';

-- Con el id obtenido, sustituir <RESTAURANTE_ID>:
SELECT
  COUNT(*) AS total_lineas_carta,
  COUNT(*) FILTER (WHERE coste_compra > 0)  AS con_coste,
  COUNT(*) FILTER (WHERE coste_compra IS NULL OR coste_compra = 0) AS sin_coste,
  COUNT(*) FILTER (WHERE proveedor IS NOT NULL AND proveedor <> '') AS con_proveedor,
  COUNT(*) FILTER (WHERE proveedor IS NULL OR proveedor = '') AS sin_proveedor,
  COUNT(*) FILTER (WHERE precio_botella > 0) AS con_pvp,
  COUNT(*) FILTER (WHERE precio_botella IS NULL OR precio_botella = 0) AS sin_pvp
FROM vinos
WHERE restaurante_id = '<RESTAURANTE_ID>'
  AND activo = true;
```

**Por qué 88 entradas no tienen coste/proveedor/PVP:**  
Los vinos se dan de alta inicialmente desde la carta impresa (nombre + tipo únicamente).
Los campos de gestión (`coste_compra`, `proveedor`, `precio_botella`) se rellenan
manualmente desde la ficha de bodega. Las 88 entradas representan referencias importadas
o añadidas manualmente sin completar el ciclo de alta en el módulo de bodega.

---

## 6. LECTURA — TRES IMPEDIMENTOS ESTRUCTURALES

### 6a. Imposible deduplicar el mismo vino entre proveedores

**Problema:** No existe ninguna entidad "vino maestro" persistente en la BD.
`proveedor_catalogo_vinos` tiene una fila por oferta de proveedor, sin FK a un
vino canónico compartido.

La agrupación heurística de `catalogoGrouping.mjs:179` (`agruparOfertasCatalogo()`)
construye grupos en memoria usando claves de texto (productor|producto|añada|formato|tipo)
pero **no persiste esos grupos en la BD**. El campo `favorito` vive en la oferta concreta,
no en el grupo.

**Consecuencia:** Cuando el mismo vino aparece en dos proveedores (Sommeliervinos y Vins
Alemanys), el consultor tiene que marcar favorito dos veces (una por proveedor). Si marca
solo una y luego recarga la tarifa, puede perder ese favorito.

**Fichero y línea clave:** La ausencia está en `add_proveedores_catalogos.sql` — falta
una tabla `vinos_maestro` y una FK `vino_maestro_id` en `proveedor_catalogo_vinos`.
El campo `STABLE_ID_FIELDS` en `catalogoGrouping.mjs:1-13` anticipa esta necesidad
pero nunca se escribe en BD.

### 6b. Imposible filtrar proveedores por provincia de reparto

**Problema:** `proveedores_vino.zona` (`add_proveedores_catalogos.sql:11`) es `text` libre.
No existe columna de tipo estructurado (array de provincias, geometría, código postal).

La UI de gestión (`app/admin/proveedores/page.js:462`) usa `filtroZona` sobre `do_igp`
de los **vinos** (denominación de origen), no sobre la zona de reparto del proveedor.

**Consecuencia:** No es posible consultar "¿qué proveedores reparten en Granada?" ni
filtrar el catálogo por cobertura geográfica.

**Fichero clave:** `add_proveedores_catalogos.sql:11` — `zona text` necesitaría ser
`provincias_reparto text[]` o una tabla de cobertura proveedor↔provincia.

### 6c. Recarga mensual de tarifa deja favoritos huérfanos

**Problema:** El flujo de actualización de tarifa (script `--replace` o UI con
"Reemplazar catálogo") hace:

1. `DELETE FROM proveedor_catalogo_vinos WHERE proveedor_id = X` (línea 248-251 del script)
2. `INSERT INTO proveedor_catalogo_vinos (...)` con nuevos UUIDs

Los `favorito = true` de las filas eliminadas desaparecen. Las nuevas filas empiezan
con `favorito = false`. No hay mecanismo de reconciliación: el script no intenta
hacer match por `(nombre, bodega, formato)` para transferir el flag.

**Fichero clave — la deleción:** `scripts/import-catalogos-proveedores-to-supabase.js:247-253`
```js
const { count, error } = await supabase
  .from('proveedor_catalogo_vinos')
  .delete({ count: 'exact' })
  .eq('proveedor_id', provider.id)   // ← borra TODO, incluyendo favoritos
```

**Fichero clave — la ausencia de upsert:** `route.js:243-257` — el endpoint
`vinos_bulk` con `reemplazar: true` también borra antes de insertar, sin ningún
paso de preservación de favoritos.

**Solución mínima:** Antes de borrar, guardar `SELECT id, nombre, bodega, formato`
donde `favorito = true`. Tras el INSERT, hacer UPDATE de las filas donde
`(nombre, bodega, formato)` coincide con las guardadas. Añadirlo al script y al
endpoint como paso previo al DELETE.

---

## 7. ESTADO POR BLOQUE (actualizado bloque 10 — 2026-09-13)

| Hallazgo | Bloque | Estado | Notas |
|----------|--------|--------|-------|
| `proveedores_vino.zona` era texto libre, sin cobertura geográfica estructurada | 8 | **RESUELTO** | Añadidas `ambito_reparto` + tabla `proveedor_provincia`. Filtro geográfico activo en catálogo-consultor. |
| Recarga de tarifa con `--replace` deja favoritos huérfanos | 9 | **PARCIAL** | Bloque 9 introduce ingesta versionada (`tarifa` + `linea_cruda`) que evita el DELETE masivo. El script legacy `import-catalogos-proveedores-to-supabase.js` todavía hace DELETE; pendiente deprecarlo. |
| `proveedor_catalogo_vinos` sin FK canónica a `vino_anada` | 5-9 | **RESUELTO** | Modelo canónico `vino` → `vino_anada` → `oferta` activo desde bloque 5. `oferta.tarifa_id` añadida en bloque 9. |
| `vinos` (carta restaurante) sin enlace al catálogo canónico | 10 | **PARCIAL** | Añadidas columnas `vino_anada_id` + `oferta_id` a `vinos`. Script `enlazar-cartas.js` listo. Enlace pendiente de ejecutar con `--apply` y verificar en `/dashboard/bodega`. Las líneas sin proveedor activo en catálogo quedan sin `oferta_id` — correcto por diseño. |
| `vinos.coste_compra` a 0 en 88 líneas de Lo de Carmen | 10 | **PARCIAL** | El script `enlazar-cartas.js --apply` rellena `coste_compra` desde `oferta.coste` para las líneas que casen por clave dura. Las que no casen (proveedor no en catálogo, bodega desconocida) siguen a 0. Resultado esperado: valor parcial no nulo en `/dashboard/bodega`. |
| Dos implementaciones de `calcularCopa` con resultados distintos | — | **PENDIENTE** | `/admin/proveedores` usa divisor 5 hardcoded; resto usa `copasVendibles()` con merma. Divergencia documentada en sección 3. |
| No hay constraint de unicidad en `proveedor_catalogo_vinos` | — | **PENDIENTE** | Sin upsert por clave natural; scripts de importación crean duplicados si se ejecutan dos veces. Pendiente añadir índice único `(proveedor_id, referencia)` con referencia estable. |
| `vinos_maestro` ausente — mismo vino en varios proveedores sin relación | 5 | **RESUELTO** | La tabla canónica `vino` cumple esta función. FK vía `oferta.vino_anada_id`. |

### Próximas verificaciones pendientes

- Ejecutar `sql/0009_tarifas.sql` (PASADA 1 + PASADA 2) en Supabase SQL Editor.
- Ejecutar `sql/0010_carta_enlace.sql` en Supabase SQL Editor.
- Ejecutar `node scripts/enlazar-cartas.js` (dry-run) y revisar informe.
- Ejecutar `node scripts/enlazar-cartas.js --apply` y verificar `/dashboard/bodega` de Lo de Carmen.
- Anotar en este fichero los números reales del informe (N enlazadas / N sin proveedor / N sin match).

---

*Fin de la auditoría. Las secciones de métricas requieren ejecución manual en
Supabase SQL Editor con credenciales de service role.*
