# Normalización del catálogo de proveedores

Estado a 2026-09-01. Documento de referencia para retomar el trabajo sin releer el histórico de conversaciones.

---

## 1. Columnas nuevas en `proveedor_catalogo_vinos`

Añadidas mediante `supabase/normalizar_catalogo_v1.sql` (ejecutar en el SQL Editor de Supabase si se crea una instancia nueva — es idempotente gracias a `IF NOT EXISTS`).

### Columnas de respaldo (`_raw`)

Guardan el valor original antes de cualquier transformación. Permiten rollback campo a campo sin necesidad de restaurar un backup completo.

| Columna | Tipo | Qué guarda |
|---|---|---|
| `nombre_raw` | text | Valor original de `nombre` cuando titleCase lo modificó |
| `region_raw` | text | Valor original de `region` cuando se extrajo la zona |
| `tipo_raw` | text | Valor original de `tipo` cuando se rellenó desde la región (raro) |
| `formato_raw` | text | Valor original de `formato` cuando se descompuso en columnas |

Si `nombre_raw IS NULL`, el nombre actual ya era correcto y no se tocó. Mismo criterio para el resto de `_raw`.

### Columnas derivadas de `region`

| Columna | Tipo | Qué guarda |
|---|---|---|
| `zona` | text | Parte izquierda de `region` tras extraer el separador (`·`, `/`, `-`). Ej.: `"BORDEAUX · Tinto"` → `zona = "BORDEAUX"` |

El campo `tipo` de la tabla original se puede rellenar desde la parte derecha de `region` si estaba vacío (ver `splitZonaTipo`).

### Columnas derivadas de `formato`

| Columna | Tipo | Qué guarda |
|---|---|---|
| `tamanyo` | text | Volumen o nombre de formato. Ej.: `"75 cl"`, `"magnum"`, `"doble magnum 300 cl"` |
| `unidades_por_caja` | integer | Unidades por caja. Ej.: `6`, `3`, `12` |
| `referencia_proveedor` | text | Código SKU del proveedor extraído del formato. Ej.: `"722035"`, `"11MONB32213"` |
| `almacen_proveedor` | text | Código de almacén/delegación de Soto: `"Mad"`, `"Est"`, `"Luxe"`. Ver sección Pendiente. |
| `graduacion` | text | Grado alcohólico cuando viene fusionado con u/c. Ej.: `"19.5°"`, `"40°"` |

---

## 2. Dónde vive la lógica de normalización

### `app/lib/normalizarNombre.js`

Exporta `titleCaseNombre(nombre, opts?)`.

**Reglas aplicadas por orden de prioridad:**

1. Texto entre comillas/guillemets → preservar intacto (placeholder temporal)
2. Años 1900–2099 (`/^\d{4}$/`) → sin cambio, no consume "primera palabra"
3. Ordinales `<dígitos><er|nd|rd|th|º|ª|o|a>` → sufijo en minúscula siempre (`"2ND"` → `"2nd"`, `"1ER"` → `"1er"`)
4. Siglas con puntos internos (`D.O.`, `I.G.P.`, `D.O.C.A.`) → MAYÚSCULAS
5. `EXCEPCIONES_UPPER` → MAYÚSCULAS siempre, cualquier posición
6. Primera palabra real → capitalize (independientemente de excepciones lower)
7. `EXCEPCIONES_LOWER` → minúsculas
8. Números romanos ≥ 2 chars → MAYÚSCULAS
9. Resto → capitalize

**`EXCEPCIONES_LOWER`** (partículas que quedan en minúscula):
`de, del, de la, de los, de las, dos, das, do, da, o, a, y, e, i, du, des, le, la, les, et, au, aux, en, sur, di, della, dei, degli, delle, von, van, zu, und, des, den, dem, beim`

**`EXCEPCIONES_UPPER`** (siglas siempre en mayúscula):
`do, d.o., d.o.ca., doc, docg, dop, igt, igp, aoc, aop, vdp, vdlt, vt, vcig, qpsr, s/do, ps, gt, nv, s/c`

La tokenización parte por espacios **y guiones**, aplicando las mismas reglas a cada segmento: `"CHÂTEAUNEUF-DU-PAPE"` → `"Châteauneuf-du-Pape"`.

---

### `app/lib/normalizarCatalogo.js`

Exporta tres funciones.

#### `splitZonaTipo(region)`

Separa `"ZONA · tipo"` en `{ zona, tipo, revisarAnada }`.

Separadores reconocidos: `' · '`, `' / '`, `' - '`.

**Casos especiales:**
- Separador `' - '` con parte izquierda de solo dígitos (`"7 - EMILIA ROMAGNA"`) → zona = parte derecha, número descartado.
- Parte derecha = año 4 dígitos `(19|20)\d{2}` → `tipo = ''`, `revisarAnada = true`. **No se guarda el año como tipo de vino.**

Si no hay separador reconocido, `zona = region.trim()` y `tipo = ''`.

#### `sospechaZona(zona)`

Devuelve `true` si la zona extraída parece sospechosa y no debe aplicarse automáticamente. Predicados: longitud > 40, sin ninguna mayúscula, empieza por dígito-guión, contiene palabras de eslogan (`elaborado`, `criado`…), o es solo dígitos.

#### `splitFormato(formato)`

Descompone `"75cl · 6 u/c Mad · 722035"` en columnas. Divide por `·`, `•`, `|` y procesa cada parte por patrón:

| Patrón | Ejemplo | Extrae |
|---|---|---|
| Volumen (`cl`, `ml`, `l`, `litros`) | `"75 cl"`, `"0.75 L"` | `tamanyo` |
| Nombre de formato | `"magnum"`, `"doble magnum"` | `tamanyo` |
| `<grado>º<uds> u/c [almacén]` | `"19,5º6 u/c Est"` | `graduacion`, `unidades_por_caja`, `almacen_proveedor` |
| `<N> u/c [almacén]` | `"6 u/c Mad"`, `"3 u/c Est"` | `unidades_por_caja`, `almacen_proveedor` |
| Unidades convencionales | `"caja 6"`, `"6 uds"`, `"x12"` | `unidades_por_caja` |
| Referencia alfanumérica | `"722035"`, `"REF001"` | `referencia_proveedor` |

**`revisar = true`** en dos situaciones:
- **`revisarMsg = 'código almacén ambiguo'`**: se detectó almacén (ej. `"6 u/c Mad"`) pero el código es de una sola palabra → se escriben `tamanyo`, `unidades_por_caja`, `graduacion`, `referencia_proveedor`, pero **no** `almacen_proveedor`.
- **`revisarMsg = 'posible unidades=N'` / `'sin clasificar: ...'`**: patrón no reconocido → no se escribe **ningún** campo derivado del formato.

---

### `app/lib/normalizarVino.js`

Exporta `normalizarCamposVino(row)`.

**Fuente de verdad compartida** entre el API admin y los scripts de importación. Recibe `{ nombre, tipo, region, formato }` (strings ya limpios) y devuelve el objeto completo con todos los campos normalizados y sus `_raw` correspondientes, listo para hacer spread en el payload de inserción o actualización.

```js
const norm = normalizarCamposVino({ nombre, tipo, region, formato })
// norm contiene: nombre, nombre_raw, tipo, region, region_raw, zona,
//                formato, formato_raw, tamanyo, unidades_por_caja,
//                referencia_proveedor, graduacion, almacen_proveedor
```

Sigue exactamente las mismas reglas de aplicación que la migración one-shot:
- `nombre_raw` solo se escribe si el nombre cambia.
- `zona` solo se escribe si `!sospechaZona(z)` y el split produjo algo diferente a la región original.
- `almacen_proveedor` se escribe solo si `!revisar` (código limpio); para `'código almacén ambiguo'` queda `null` intencionadamente.

---

## 3. Scripts de importación — todos pasan por `normalizarCamposVino()`

Los tres scripts de importación masiva usan `await import('../app/lib/normalizarVino.js')` al inicio de `main()` y aplican `normalizarCamposVino()` a cada fila antes de insertar:

| Script | Proveedor(es) | Cómo normaliza |
|---|---|---|
| `scripts/import-exclusivas-soto-to-supabase.js` | Exclusivas Soto (vía `parseAll()`) | `norm = normalizarCamposVino(row); return { ...row, ...norm, proveedor_id, ... }` |
| `scripts/import-exclusivas-soto-clean-csv-to-supabase.js` | Exclusivas Soto (CSV limpios) | Igual que arriba |
| `scripts/import-catalogos-proveedores-to-supabase.js` | Sommeliervinos, Vins Alemanys, L'Excellence, Bodegas Mar Málaga | `normalizarCamposVino` recibida como parámetro en `payloadRows()` |

El API admin (`app/api/admin/proveedores/route.js`) también pasa por `normalizarCamposVino()` a través de `payloadVino()`.

### Regla para scripts de importación nuevos

> **Cualquier script o ruta API que inserte o actualice filas en `proveedor_catalogo_vinos` debe llamar a `normalizarCamposVino()` antes del INSERT/UPDATE.** No insertar campos `nombre`, `tipo`, `region` o `formato` directamente desde la fuente sin pasar por esta función, o los datos normalizados de las columnas derivadas quedarán a `null`.

---

## 4. Pendientes

### 4.1 Confirmar con Exclusivas Soto: códigos `Est. Mad` y `Luxe`

**Contexto:** 435 filas tienen `tamanyo`, `unidades_por_caja` y demás columnas rellenas, pero `almacen_proveedor = NULL` porque el código del almacén tenía puntuación o combinaciones ambiguas (`"6 u/c Mad."`, `"1 u/c Est. Mad"`, `"1 u/c Est. Luxe"`).

**Pregunta pendiente:** ¿`"Est. Mad"` es una sola ubicación ("Estación Madrid") o el vino está disponible en dos almacenes distintos ("Est" y "Mad")? La respuesta determina si `almacen_proveedor` debe ser un string o si en el futuro conviene un array.

**Correlación observada en datos:**

| Código | Filas | Coste medio | Perfil |
|---|---|---|---|
| `Mad` | 348 | 170.90 € | Bordeaux, California, grandes tintos |
| `Est` | 87 | 117.09 € | Champagne, destilados, Ports, Grappas |
| `Est. Mad` | 49 | 297.68 € | Rioja/Ribera premium, Esperit Roca |
| `Est. Luxe` | 23 | 477.17 € | Línea PARADIS, Tokaji, Port vintage |

**Snippet de update a ejecutar una vez confirmado el significado:**

```sql
-- Opción A: "Est. Mad" es una sola ubicación (string único)
UPDATE proveedor_catalogo_vinos
SET almacen_proveedor = 'Est. Mad', updated_at = now()
WHERE formato_raw ILIKE '%u/c Est. Mad%'
  AND almacen_proveedor IS NULL;

-- Opción B: si se decide normalizar "Mad." → "Mad" (quitar el punto)
UPDATE proveedor_catalogo_vinos
SET almacen_proveedor = 'Mad', updated_at = now()
WHERE (formato_raw ILIKE '%u/c Mad.%' OR formato_raw ILIKE '%C Mad.%')
  AND almacen_proveedor IS NULL;

-- Para "Est. Luxe" → almacen 'Est. Luxe' (o 'Luxe' si se decide separar)
UPDATE proveedor_catalogo_vinos
SET almacen_proveedor = 'Est. Luxe', updated_at = now()
WHERE formato_raw ILIKE '%u/c Est. Luxe%'
  AND almacen_proveedor IS NULL;
```

> Nota: Los 176 casos "sin clasificar" tienen `formato_raw = NULL` (el apply script no los tocó). Para esos hay que leer el campo `formato` directamente.

---

### 4.2 Decisión de estilo: `"Rosso SP"` y `"D'Abruzzo"`

Dos casos cosméticos que no bloquean nada:

- `"Rosso Sp"` → ¿debería ser `"Rosso SP"` (sigla)? Si sí, añadir `'sp'` a `EXCEPCIONES_UPPER` en `normalizarNombre.js`.
- `"D'abruzzo"` → ¿debería ser `"D'Abruzzo"` (apellido compuesto con apóstrofe)? El tokenizador actual no parte por apóstrofes; hay que añadir `"'"` como delimitador si se confirma que es un patrón recurrente.

Ninguno de los dos requiere retroactividad urgente porque las filas afectadas tienen `nombre_raw` guardado y se puede recalcular.

---

### 4.3 Los 176 casos de formato sin clasificar

124 casos `"sin clasificar"` + 52 casos `"posible unidades"` que `splitFormato()` no reconoció y el apply script dejó intactos (sin `formato_raw`, sin columnas derivadas).

Patrones conocidos que los generan:

```
"u/c Est. Mad"   → "1 u/c Est. Mad" — doble código con punto
"u/c Est."       → "Est. 3 u" — orden invertido (almacén antes que unidades)
"u/c Mad."       → "C Mad. 3 u" — "Caja Mad. N u"
"u/c Mad.N"      → "1 u/c Mad.1" — código + número de lote/posición
```

El CSV de referencia donde están listados todos se generó durante el dry-run v2:

```
informe-normalizacion-v2.csv    (en la raíz del proyecto, no commiteado)
informe-revisar-formato.csv     (ídem)
```

Para procesarlos: añadir los patrones correspondientes a `splitFormato()` en `normalizarCatalogo.js` y correr de nuevo `normalizar-catalogo-apply.mjs` **filtrando solo las filas donde `formato_raw IS NULL` y `formato` contiene el patrón en cuestión** — así no se retocan las filas ya migradas.

---

## 5. Números finales de la migración

| Concepto | Valor |
|---|---|
| Filas totales en tabla | **8.219** |
| Filas actualizadas en la migración one-shot | **6.590** |
| Filas con nombre normalizado (`nombre_raw` no null) | ~4.916 |
| Nombres recalculados post-fix ordinales | **150** (1er Cru → correcto) |
| Filas con zona extraída (`zona` no null) | ~6.590 |
| Filas con tamaño extraído (`tamanyo` no null) | incluidas en 6.590 |
| Casos formato pendiente de revisión | **611** (435 almacén ambiguo + 176 sin clasificar) |
| Filas con datos corruptos o perdidos | **0** — todo valor original preservado en `_raw` |
| Tipo = año de 4 dígitos (bug corregido) | **0** |

### Scripts relevantes

| Script | Propósito |
|---|---|
| `scripts/backup-catalogo.mjs` | Backup completo → JSON local antes de cualquier migración |
| `scripts/normalizar-catalogo-dry-run.mjs` | Simula la normalización y genera CSV de cambios (solo lectura) |
| `scripts/normalizar-catalogo-apply.mjs` | Aplica la migración one-shot (ya ejecutado el 2026-09-01) |
| `scripts/verificar-migracion.mjs` | Verifica post-migración: conteos, muestras, casos pendientes |
| `scripts/fix-ordinales-nombres.mjs` | Fix específico para ordinales mal capitalizados (ya ejecutado) |
| `scripts/test-normalizacion.mjs` | Suite de tests unitarios sin conexión a BD |
