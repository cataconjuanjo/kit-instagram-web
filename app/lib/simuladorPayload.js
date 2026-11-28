// Helper puro para proyectar las líneas del simulador según el plan del
// restaurante. Extraído de app/api/simulador/route.js para poder testear
// la matriz plan → claves expuestas sin levantar servidor ni base.
//
// Reglas:
//   - Con `catalogo_consultor` (premium/admin): se devuelve la línea
//     entera + enriquecimiento con nombre de proveedor.
//   - Sin `catalogo_consultor`: se eliminan TODAS las claves que vengan
//     del catálogo privado del consultor (catalogo_vino_id, proveedor_id,
//     proveedor_nombre, pvp_recomendado_catalogo, pvp_copa_catalogo).
//     El coste_compra del propio restaurante se conserva (es su
//     snapshot, no dato del consultor).

export const CLAVES_CATALOGO_CONSULTOR = Object.freeze([
  'catalogo_vino_id',
  'proveedor_id',
  'proveedor_nombre',
  'pvp_recomendado_catalogo',
  'pvp_copa_catalogo',
])

export function proyectarLineaSimulador(linea, { puedeVerCatalogo }) {
  if (!linea) return linea
  if (puedeVerCatalogo) return linea
  const copia = { ...linea }
  for (const clave of CLAVES_CATALOGO_CONSULTOR) delete copia[clave]
  return copia
}

export function proyectarLineasSimulador(lineas = [], opciones = {}) {
  return (lineas || []).map(linea => proyectarLineaSimulador(linea, opciones))
}
