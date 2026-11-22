/**
 * Decisor de "¿se hizo el conteo inicial?" — lógica pura y testeable.
 *
 * Entrada: la respuesta del endpoint GET /api/conteos. Esa respuesta
 * es la MISMA fuente de verdad que usa Bodega > Conteo para decidir
 * "Primer conteo pendiente" (ver app/dashboard/bodega/ConteoInventario.js
 * línea 196 y app/api/conteos/route.js línea 34).
 *
 * Tres estados posibles:
 *   - 'hecho'       → el conteo inicial existe cerrado (muestra el
 *                     ítem del checklist como Listo / lo oculta).
 *   - 'pendiente'   → hay vinos pero no hay conteo inicial cerrado;
 *                     SE MUESTRA el paso del checklist.
 *   - 'desconocido' → la llamada falló o la respuesta no es
 *                     interpretable; NO se muestra nada (política
 *                     "nunca avisar con dato desconocido").
 *
 * Criterios para 'hecho' (OR — cualquiera basta):
 *   (a) `control_stock_desde` != null (fijado por el backend al
 *       cerrar el conteo inicial — es la clave canónica).
 *   (b) algún item en `conteos` con tipo='inicial' Y estado='cerrado'.
 *   (c) redundancia: `cerrado_en` != null en un item 'inicial' — por
 *       si el `estado` viniese como null en algún esquema antiguo.
 */
export function estadoConteoInicial(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') return 'desconocido'

  // (a) control_stock_desde canónico.
  if (respuesta.control_stock_desde != null && respuesta.control_stock_desde !== '') {
    return 'hecho'
  }

  // (b)/(c) iterar la lista de conteos.
  const lista = Array.isArray(respuesta.conteos) ? respuesta.conteos : null
  if (lista === null) {
    // Respuesta sin la clave `conteos` ni `control_stock_desde` → no
    // podemos decidir.
    return 'desconocido'
  }

  for (const c of lista) {
    if (!c || c.tipo !== 'inicial') continue
    if (c.estado === 'cerrado') return 'hecho'
    if (c.cerrado_en != null && c.cerrado_en !== '') return 'hecho'
  }
  return 'pendiente'
}
