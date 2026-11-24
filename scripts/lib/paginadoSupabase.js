'use strict'

/**
 * fetchPaginado(contexto, fetcher, { pageSize }) → Array
 *
 * Paginado seguro para supabase-js:
 *  - el caller provee `fetcher(desde, pageSize)` que devuelve el resultado
 *    de `await supabase.from(...)....range(desde, desde + pageSize - 1)`.
 *  - si `fetcher` devuelve `{ error }`, lanzamos excepción con contexto
 *    (tabla, página, mensaje) para abortar ANTES de cualquier escritura.
 *    Esto distingue "página vacía" (data=[]) de "error" (data=null, error).
 *  - el helper NO añade .order('id'): el caller es responsable del orden
 *    determinista (test de regresión del bloque 14 lo vigila).
 *
 * Diseñado para el CLI `scripts/importar-tarifa.js` después de que
 * el bloque 13 descubriera que el fallback `if (!po || po.length === 0)
 * break` trataba cualquier error de Supabase como "no hay más filas",
 * produciendo falsas bajas y favoritos huérfanos.
 */
async function fetchPaginado(contexto, fetcher, { pageSize = 1000 } = {}) {
  const rows = []
  let desde = 0

  while (true) {
    const resultado = await fetcher(desde, pageSize)
    if (!resultado || typeof resultado !== 'object') {
      throw new Error(`[paginado] fetcher no devolvió objeto en ${contexto} desde=${desde}`)
    }
    const { data, error } = resultado
    if (error) {
      const detalle = (error && typeof error === 'object')
        ? (error.message || error.code || JSON.stringify(error))
        : String(error)
      const err = new Error(
        `[paginado] fallo leyendo ${contexto} en desde=${desde} (pageSize=${pageSize}): ${detalle}`
      )
      err.cause = error
      throw err
    }
    const pagina = Array.isArray(data) ? data : []
    rows.push(...pagina)
    // Página vacía o incompleta = última página. Error ya se ha tratado arriba.
    if (pagina.length < pageSize) break
    desde += pageSize
  }

  return rows
}

module.exports = { fetchPaginado }
