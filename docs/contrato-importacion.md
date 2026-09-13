# Contrato de importación de tarifas

Versión 1.0 — vigente desde bloque 9 (2026-09-13).

## Propósito

Define el único formato de entrada que acepta `scripts/importar-tarifa.js` para todos
los proveedores. Un contrato único evita que cada proveedor tenga su propia lógica de
parseo y garantiza que los campos estructurados sean siempre los mismos.

## Formato del fichero

**JSON array** de objetos, uno por línea de producto. El schema completo está en
`schemas/tarifa.schema.json`.

```json
[
  {
    "proveedor":      "uuid-del-proveedor",
    "codigo_articulo": "VB-12345",
    "nombre_crudo":   "A Bruxa Compostelana 2023",
    "bodega_cruda":   "Bodegas Zárate",
    "zona_cruda":     "Rías Baixas",
    "tipo":           "blanco",
    "formato_crudo":  "75cl",
    "anada":          "2023",
    "coste":          26.65,
    "disponibilidad": "disponible"
  }
]
```

## Campos obligatorios

| Campo          | Tipo          | Descripción |
|----------------|---------------|-------------|
| `proveedor`    | UUID string   | ID del proveedor en `proveedores_vino` |
| `codigo_articulo` | string     | Código interno del proveedor. Es la clave de resolución más estable entre tarifas |
| `nombre_crudo` | string        | Nombre tal cual aparece en el PDF/Excel del proveedor |
| `bodega_cruda` | string        | Nombre de la bodega tal cual aparece en el fichero |
| `zona_cruda`   | string        | Zona/denominación tal cual aparece en el fichero |
| `tipo`         | enum          | Valor canónico: `tinto`, `blanco`, `rosado`, `espumoso`, `dulce`, `generoso`, `otros` |
| `formato_crudo`| string        | Tamaño de botella. El script lo convierte a ml. Ver formatos aceptados. |
| `anada`        | string\|null  | Cuatro dígitos (`"2021"`) o `null` / cadena vacía para sin añada |
| `coste`        | number        | Precio de compra en EUR sin IVA. Rango válido: (0, 2000] |
| `disponibilidad` | string      | Estado de stock según el proveedor |

## Campo `notas` — la regla más importante

**Todo lo que no encaje en los campos anteriores va a `notas` como texto libre.**

Nunca crees columnas nuevas para datos no estructurados. Esto evitó que "vinos son fruto
de un gran esfuerzo" acabara guardado como denominación de origen. Si un proveedor
incluye un campo raro (número de expediente, lote de envasado, comentario de sumiller),
serializalo en `notas`:

```json
{
  "notas": "lote: 2026-A | expediente: 1234 | comentario: producción limitada"
}
```

## Formatos de botella aceptados en `formato_crudo`

El script convierte `formato_crudo` a mililitros. Son válidos:

| Entrada         | ML resultante |
|-----------------|---------------|
| `750ml`, `75cl`, `0,75l`, `0.75` | 750 |
| `375ml`, `37,5cl`, `media`       | 375 |
| `1500ml`, `150cl`, `1,5l`, `magnum` | 1500 |
| `3000ml`, `3l`, `jeroboam`       | 3000 |
| `500ml`, `50cl`                  | 500 |

Un formato no convertible genera un error de validación y **bloquea esa línea**
(no el resto de la tarifa).

## Validaciones que aplica el script

1. **Coste**: numérico, mayor que 0 y menor que 2.000 €.
2. **Formato**: convertible a ml según la tabla anterior.
3. **Añada**: cuatro dígitos entre 1900 y 2099, o nula.
4. **`codigo_articulo` único** dentro de la tarifa (dos líneas con el mismo código
   generan un error de validación; la segunda se marca `ignorada`).
5. **Zona canónica**: `zona_cruda` se valida contra el maestro `ref_denominaciones_es`.
   Si no se reconoce, **esa línea queda en `pendiente_mapeo`** y se excluye del
   diff/publicación de ese mes. El resto de la tarifa sigue su curso normal.

## Flujo de resolución (matching con ofertas anteriores)

```
1. codigo_articulo del proveedor  →  oferta existente del mismo proveedor  (confianza 1.0)
2. clave dura (nombre+bodega+formato+añada normalizados)                    (confianza 0.85)
3. cola de revisión  →  linea_cruda.estado = 'pendiente_revision'          (confianza < 0.6)
```

## Uso del script

```bash
# Revisar diff sin escribir nada (por defecto)
node scripts/importar-tarifa.js \
  --proveedor <uuid> \
  --fichero tarifas/proveedor-2026-10.json \
  --periodo 2026-10-01

# Publicar (escribe en DB, archiva tarifa anterior)
node scripts/importar-tarifa.js \
  --proveedor <uuid> \
  --fichero tarifas/proveedor-2026-10.json \
  --periodo 2026-10-01 \
  --apply
```

El informe de impacto se imprime siempre. Con `--apply` es el informe definitivo del mes.
