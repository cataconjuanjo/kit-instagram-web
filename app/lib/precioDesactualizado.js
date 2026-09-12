/**
 * precioDesactualizado.js
 * Detecta si un favorito del catálogo tiene un hermano no-favorito (mismo
 * proveedor + nombre + bodega + formato, normalizados) con coste distinto.
 *
 * Exportado por separado para poder testearlo sin levantar el servidor.
 */

export function normTexto(v) {
  return String(v || '').toLocaleLowerCase('es-ES').normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function clave(proveedor_id, nombre, bodega, formato) {
  return [proveedor_id, normTexto(nombre), normTexto(bodega), normTexto(formato)].join('||')
}

/**
 * Construye el mapa de costes de hermanos no-favoritos.
 * hermanos: array de { proveedor_id, nombre, bodega, formato, coste_estimado }
 */
export function construirHermanosMap(hermanos) {
  const map = new Map()
  for (const h of hermanos) {
    const key = clave(h.proveedor_id, h.nombre, h.bodega, h.formato)
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(Number(h.coste_estimado) || 0)
  }
  return map
}

/**
 * Devuelve true si el favorito tiene algún hermano no-favorito con mismo
 * (proveedor_id, nombre_norm, bodega_norm, formato_norm) y distinto coste.
 * favorito: { proveedor_id, nombre, bodega, formato, coste_estimado }
 * hermanosMap: resultado de construirHermanosMap()
 */
export function esPrecioDesactualizado(favorito, hermanosMap) {
  const key = clave(favorito.proveedor_id, favorito.nombre, favorito.bodega, favorito.formato)
  const siblings = hermanosMap.get(key)
  if (!siblings) return false
  const costeActual = Number(favorito.coste_estimado) || 0
  return [...siblings].some(c => c !== costeActual)
}
