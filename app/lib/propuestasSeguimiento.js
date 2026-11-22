// FASE K — Bloque 2: helpers puros para el seguimiento de propuestas.
// Todo el cálculo de totales (€ estimado, € capturado, por estado) pasa
// por aquí para que Radar, ficha e informe compartan exactamente la
// misma cifra (lección de fase J: una verdad por cifra).

export const ESTADOS_SEGUIMIENTO = ['propuesta', 'enviada', 'aceptada', 'rechazada', 'implantada']
export const TRANSICIONES_VALIDAS = {
  propuesta: ['enviada', 'rechazada'],
  enviada: ['aceptada', 'rechazada'],
  aceptada: ['implantada', 'rechazada'],
  rechazada: [],
  implantada: [],
}

export function puedeTransicionar(estadoActual, siguiente) {
  const lista = TRANSICIONES_VALIDAS[estadoActual] || []
  return lista.includes(siguiente)
}

function toNumber(x) {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

// Dado:
//   seguimientos: array del endpoint /api/admin/propuestas-seguimiento
//   excluirRestauranteIds: Set de ids a ignorar (demos)
// Devuelve: { porEstado: {propuesta,enviada,aceptada,implantada,rechazada},
//             estimado, capturado, total }
export function agregarSeguimiento(seguimientos = [], excluirRestauranteIds = new Set()) {
  const base = {
    porEstado: { propuesta: 0, enviada: 0, aceptada: 0, implantada: 0, rechazada: 0 },
    estimado: 0,
    capturado: 0,
    total: 0,
  }
  for (const s of seguimientos) {
    if (!s) continue
    if (excluirRestauranteIds.has(String(s.restaurante_id))) continue
    base.total++
    const estado = ESTADOS_SEGUIMIENTO.includes(s.estado) ? s.estado : 'propuesta'
    base.porEstado[estado] = (base.porEstado[estado] || 0) + 1
    // El estimado sólo cuenta si la propuesta se envió o fue más allá.
    if (['enviada', 'aceptada', 'implantada'].includes(estado)) {
      base.estimado += toNumber(s.importe_estimado_eur)
    }
    if (estado === 'implantada') {
      base.capturado += toNumber(s.importe_capturado_eur)
    }
  }
  base.estimado = Math.round(base.estimado)
  base.capturado = Math.round(base.capturado)
  return base
}

// Dada una lista de propuestas (de /api/admin/propuestas) y de
// seguimientos (de /api/admin/propuestas-seguimiento), devuelve un mapa
// id-de-propuesta → seguimiento para pintar en la UI. Las propuestas
// sin seguimiento registrado devuelven { estado: 'propuesta', ... }.
export function indiceSeguimiento(seguimientos = []) {
  const mapa = {}
  for (const s of seguimientos) {
    if (s?.propuesta_id) mapa[String(s.propuesta_id)] = s
  }
  return mapa
}

// Pasos visibles en la UI (línea de pasos "Propuesta → Enviada → Aceptada → Implantada").
export const PASOS_UI = [
  { id: 'propuesta', label: 'Propuesta' },
  { id: 'enviada', label: 'Enviada' },
  { id: 'aceptada', label: 'Aceptada' },
  { id: 'implantada', label: 'Implantada' },
]

export function indiceDePaso(estado) {
  const i = PASOS_UI.findIndex(p => p.id === estado)
  return i >= 0 ? i : 0
}
