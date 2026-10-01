import { supabaseAdmin } from '../../lib/supabaseAdmin'

// Una sola fuente de verdad para qué planes tienen qué capacidades.
// Replica la semántica existente: trial y premium son equivalentes.
const PLAN_CAPACIDADES = {
  trial:   new Set(['autoFeaturedByMargin']),
  premium: new Set(['autoFeaturedByMargin']),
  basico:  new Set(),
}

/**
 * Comprueba si el plan de una tienda incluye una capacidad concreta.
 * Usa siempre esta función en lugar de comparar el nombre del plan directamente.
 */
export function planTieneCapacidad(tienda, capacidad) {
  const plan = tienda?.plan ?? 'basico'
  return PLAN_CAPACIDADES[plan]?.has(capacidad) ?? false
}

// PVP que ve el cliente final: precio_oferta cuando existe y > 0, si no precio_pvp.
function pvpEfectivo(v) {
  const oferta = Number(v.precio_oferta)
  return oferta > 0 ? oferta : Number(v.precio_pvp)
}

function margenAbsoluto(v) {
  return pvpEfectivo(v) - Number(v.precio_coste)
}

function margenPct(v) {
  const pvp = pvpEfectivo(v)
  return pvp > 0 ? (pvp - Number(v.precio_coste)) / pvp : 0
}

/**
 * Calcula los IDs de los vinos a mostrar en el carrusel automático, ordenados
 * por mejor margen absoluto (€/botella). El cálculo ocurre completamente en
 * servidor — precio_coste y margen nunca salen de esta función.
 *
 * Algoritmo de dos pasadas:
 *   Pasada 1: recorre el ranking y toma cada vino si su tipo aún no alcanzó maxTipo.
 *   Pasada 2: si quedan huecos, completa con los siguientes del ranking sin límite de tipo.
 * El resultado final se ordena por ranking global (mejor margen primero).
 *
 * @param {string} tiendaId
 * @param {number} n        - máx. vinos a devolver (3–12)
 * @param {number} maxTipo  - máx. vinos por tipo en pasada 1
 * @returns {Promise<string[]>} IDs ordenados por ranking global (mejor margen primero)
 */
export async function getAutoFeaturedIds(tiendaId, n = 8, maxTipo = 3) {
  const { data, error } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, tipo, precio_pvp, precio_oferta, precio_coste')
    .eq('tienda_id', tiendaId)
    .eq('activo', true)
    .eq('categoria', 'vino')
    .gt('stock', 0)
    .gt('precio_coste', 0)

  if (error || !data?.length) return []

  // Filtro JS: PVP efectivo > 0 y margen > 0 (excluir ventas bajo coste o a coste)
  const elegibles = data.filter(v => {
    const pvp = pvpEfectivo(v)
    return pvp > 0 && (pvp - Number(v.precio_coste)) > 0
  })

  if (!elegibles.length) return []

  // Ordenar: margen absoluto desc → margen % desc → id lexicográfico (desempate determinista)
  elegibles.sort((a, b) => {
    const diffAbs = margenAbsoluto(b) - margenAbsoluto(a)
    if (diffAbs !== 0) return diffAbs
    const diffPct = margenPct(b) - margenPct(a)
    if (diffPct !== 0) return diffPct
    return String(a.id).localeCompare(String(b.id))
  })

  const selectedIds = new Set()
  const cuentaTipo = {}

  // Pasada 1: respetar límite por tipo
  for (const v of elegibles) {
    if (selectedIds.size >= n) break
    const tipo = v.tipo || 'otros'
    const cnt = cuentaTipo[tipo] ?? 0
    if (cnt < maxTipo) {
      selectedIds.add(v.id)
      cuentaTipo[tipo] = cnt + 1
    }
  }

  // Pasada 2: completar huecos ignorando el límite de tipo
  if (selectedIds.size < n) {
    for (const v of elegibles) {
      if (selectedIds.size >= n) break
      if (!selectedIds.has(v.id)) selectedIds.add(v.id)
    }
  }

  // Resultado en orden de ranking global (elegibles ya está ordenado)
  return elegibles
    .filter(v => selectedIds.has(v.id))
    .map(v => String(v.id))
}
