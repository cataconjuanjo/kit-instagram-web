# ADAPTACIÓN — Conceptos de auditoría → esquema real

> Generado: 2026-09-12. Rama: refactor/catalogo-canonico.
> Propósito: diccionario de traducción entre los términos que usa el consultor
> y los nombres reales de tablas/columnas en Supabase.

---

## Tabla de correspondencias

| Concepto (auditoría / consultor) | Tabla real | Columna real | Notas |
|---|---|---|---|
| **Proveedor** | `proveedores_vino` | `id`, `nombre` | Una fila por empresa distribuidora |
| **Zona de reparto del proveedor** | `proveedores_vino` | `zona` | Texto libre — sin estructura; ver F5 |
| **Referencia de catálogo** | `proveedor_catalogo_vinos` | `id` | Una fila = una línea de tarifa de un proveedor. No es un "vino maestro". |
| **Vino maestro / producto canónico** | _(no existe)_ | _(no existe)_ | F1 CRÍTICO: no hay entidad. `catalogoGrouping.mjs` agrupa en memoria pero nunca persiste. |
| **Favorito** | `proveedor_catalogo_vinos` | `favorito` (boolean) | Un flag por referencia (por proveedor), no por vino canónico. |
| **Bodega** | `proveedor_catalogo_vinos` | `bodega` | Texto libre, sin alias; ver F2 |
| **Zona / DOP-IGP normalizada** | `proveedor_catalogo_vinos` | `do_igp` | Resultado de normalizar_denominaciones_v1. Campo `zona` es el valor previo (texto libre). |
| **Zona (valor original/legado)** | `proveedor_catalogo_vinos` | `zona` | Texto libre, ~90 grafías para ~35 zonas reales; ver F3 |
| **Zona para revisar** | `proveedor_catalogo_vinos` | `zona_revisar` (boolean) | `true` cuando la DOP no pudo normalizarse automáticamente |
| **Formato** | `proveedor_catalogo_vinos` | `formato` | Texto libre (e.g. "75 cl", "0,75 L", "Botella") |
| **Tamaño normalizado** | `proveedor_catalogo_vinos` | `tamanyo` | Derivado de `formato` por normalizar_catalogo_v1 |
| **Añada** | `proveedor_catalogo_vinos` | `anada` | Texto libre; a veces en el `nombre` del vino en lugar de aquí |
| **Coste (catálogo proveedor)** | `proveedor_catalogo_vinos` | `coste_estimado` | Solo visible al admin (service role). Unidad: €/botella o €/caja según `unidades_por_caja` |
| **PVP botella recomendado (catálogo)** | `proveedor_catalogo_vinos` | `pvp_recomendado` | Calculado y guardado al importar; recalculado en API antes de servir al restaurante |
| **PVP copa recomendado (catálogo)** | `proveedor_catalogo_vinos` | `pvp_copa` | Misma advertencia: dos implementaciones divergentes (ver F6 y AUDITORIA §3) |
| **Disponibilidad / agotado** | `proveedor_catalogo_vinos` | `disponibilidad` | Texto libre ("Disponible", "Agotado", etc.) |
| **Restaurante** | `restaurantes` | `id`, `nombre`, `email` | Tabla base del sistema; no está en los SQL del repo |
| **Línea de carta (vino propio)** | `vinos` | `id` | Una fila = un vino en la carta de un restaurante. Tabla no incluida en SQL del repo. |
| **Coste (carta del restaurante)** | `vinos` | `coste_compra` | Editable por el restaurante; nulo en las 88 entradas de Lo de Carmen sin completar |
| **PVP botella (carta del restaurante)** | `vinos` | `precio_botella` | Precio de venta final, editable |
| **PVP copa (carta del restaurante)** | `vinos` | `precio_copa` | Precio de venta final, editable |
| **Proveedor de un vino de carta** | `vinos` | `proveedor` | Texto libre (nombre del proveedor), sin FK a `proveedores_vino` |
| **Línea de borrador / simulador** | `carta_simulacion` | `id` | Una fila = un vino en el borrador del simulador. Puede venir de `vinos` o de `proveedor_catalogo_vinos`. |
| **Coste en simulador** | `carta_simulacion` | `coste_compra` | Snapshot del coste al añadir al borrador |
| **PVP botella en simulador** | `carta_simulacion` | `precio_botella` | Editable en el simulador |
| **PVP copa en simulador** | `carta_simulacion` | `precio_copa` | Editable en el simulador |
| **PVP botella snapshot (catálogo)** | `carta_simulacion` | `pvp_recomendado_catalogo` | Snapshot del PVP calculado en el momento de añadir |
| **PVP copa snapshot (catálogo)** | `carta_simulacion` | `pvp_copa_catalogo` | Snapshot del PVP copa calculado en el momento de añadir |
| **Propuesta del consultor** | `consultor_propuestas` | `id` | Alta o baja sugerida; texto, no FK a vino canónico |
| **Ajustes económicos del restaurante** | `restaurant_economic_settings` | `id` | Copas/botella, margen objetivo, IVA, etc. Una fila por restaurante. |
| **Denominación de origen (tabla ref)** | `ref_denominaciones_es` | `nombre_oficial`, `nombre_norm` | Tabla de referencia solo España; creada por normalizar_denominaciones_v1.sql |
| **País** | `proveedor_catalogo_vinos` | `pais` | Añadido por normalizar_denominaciones_v1 |
| **Comunidad autónoma** | `proveedor_catalogo_vinos` | `comunidad_autonoma` | Añadido por normalizar_denominaciones_v1 |
| **Unidades por caja** | `proveedor_catalogo_vinos` | `unidades_por_caja` | Para calcular coste por botella cuando el catálogo da precio de caja |
| **Referencia del proveedor** | `proveedor_catalogo_vinos` | `referencia_proveedor` | Código interno del proveedor; distinto de `referencia` (código de bodega) |

---

## Conceptos de la auditoría SIN equivalente en el esquema actual

| Concepto (auditoría) | Hallazgo | Impacto |
|---|---|---|
| **Vino maestro / entidad canónica** | No existe ninguna tabla `vinos_maestro` ni FK equivalente. `proveedor_catalogo_vinos` es una tabla de ofertas, no de productos. | F1 CRÍTICO: el mismo vino aparece como filas independientes por proveedor sin relación entre sí. |
| **Grupo de ofertas de un mismo vino** | `catalogoGrouping.mjs` agrupa en memoria por clave textual `productor|producto|añada|formato|tipo`, pero nunca persiste esos grupos en BD. | Deduplicación solo existe en RAM durante una sesión; no hay columna `vino_maestro_id`. |
| **Favorito a nivel de vino canónico** | `favorito` vive en la oferta concreta (`proveedor_catalogo_vinos`), no en el grupo. Si el mismo vino está en dos proveedores hay que marcarlo favorito dos veces. | Favoritos inconsistentes entre proveedores; riesgo de pérdida al reimportar. |
| **Ámbito de reparto del proveedor** | `proveedores_vino.zona` es texto libre; no existe columna estructurada (`provincias_reparto text[]` o tabla de cobertura). | F5 ALTO: imposible consultar "¿qué proveedores reparten en Granada?". |
| **Alias/normalización de bodega** | No existe tabla `bodegas` ni columna de alias. "Ponce Manchuela", "Bodegas Ponce" y "PONCE" son bodegas distintas en BD. | F2 CRÍTICO: imposible agrupar referencias por productor real. |
| **Reconciliación de favoritos en reimportación** | No existe ningún mecanismo de preservación de `favorito=true` al ejecutar `--replace`. El DELETE borra los flags antes del INSERT. | F0 CRÍTICO: ya ha ocurrido. 386 favoritos en riesgo en cada reimportación. |
| **Enlace carta ↔ catálogo (para vinos propios)** | `vinos.proveedor` es texto libre sin FK a `proveedores_vino.id`. No hay `proveedor_id` en `vinos`. | F7 ALTO: imposible saber si un vino de carta tiene oferta activa en catálogo, ni a qué precio. |
| **Formato normalizado (enumerado)** | No existe enumerado; `formato` y `tamanyo` son text libre. | F8: formato libre genera ~N grafías para los mismos formatos reales. |
| **Añada normalizada (año integer)** | `anada` es text. No hay columna `anada_year integer`. | F8: imposible filtrar o agrupar por cosecha de forma fiable. |
