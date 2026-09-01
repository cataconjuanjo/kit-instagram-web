import { estimarPerfil, necesidadesEstructurales } from './maridajeEngine'

function platoTexto(p) {
  return [p.nombre, p.categoria, p.descripcion].filter(Boolean).join(' ')
}

function vinoParaEngine(v, precioCampo) {
  const precio = Number(v[precioCampo]) > 0 ? Number(v[precioCampo]) : 20
  return { ...v, activo: true, stock: null, precio_botella: precio }
}

// Comprueba si un perfil estructural de vino satisface las necesidades de un plato.
// Alternativa O(1) a llamar al motor completo por par (plato × vino).
function esCompatible(necesidades, perfil) {
  const n = necesidades
  const p = perfil
  if (n.taninosMax !== undefined && p.taninos > n.taninosMax) return false
  if (n.taninosMin !== undefined && p.taninos < n.taninosMin) return false
  if (n.acidezMin  !== undefined && p.acidez  < n.acidezMin)  return false
  if (n.acidezMax  !== undefined && p.acidez  > n.acidezMax)  return false
  if (n.alcoholMax !== undefined && p.alcohol > n.alcoholMax) return false
  if (n.alcoholMin !== undefined && p.alcohol < n.alcoholMin) return false
  if (n.cuerpoMax  !== undefined && p.cuerpo  > n.cuerpoMax)  return false
  if (n.cuerpoMin  !== undefined && p.cuerpo  < n.cuerpoMin)  return false
  return true
}

/**
 * Genera sugerencias de vinos del catálogo del consultor basándose en cobertura de maridaje.
 *
 * Nivel 1 (platos huérfanos): platos sin ningún vino compatible en la carta actual.
 * Nivel 2 (fallback): si todos los platos tienen algún vino, platos con cobertura por debajo de la media.
 *
 * Ranking greedy set-cover: en cada paso elige el candidato que cubre más platos *aún sin resolver*,
 * los marca como resueltos, y repite — evitando sugerencias redundantes.
 *
 * El matching usa perfiles estructurales precomputados (O(platos + vinos) en lugar de
 * O(platos × vinos) llamadas al motor completo), reduciendo el cómputo de ~40s a < 200ms.
 *
 * @param {Array}  lineas   - Líneas del borrador del simulador (carta activa + nueva)
 * @param {Array}  catalogo - Vinos del catálogo del consultor
 * @param {Array}  platos   - Platos activos del restaurante
 */
export function generarSugerencias(lineas, catalogo, platos) {
  const activas = lineas.filter(l => l.estado !== 'fuera')
  const enBorrador = new Set(activas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))
  const vinosCarta = activas.map(l => vinoParaEngine(l, 'precio_botella'))
  const platosActivos = (platos || []).filter(p => p.activo !== false)

  if (!platosActivos.length || !catalogo.length) return { anadir: [], sustituir: [] }

  // ── Precomputar perfiles una sola vez ─────────────────────────────────────
  const platoNecesidades = new Map()
  for (const p of platosActivos) {
    try { platoNecesidades.set(p.id, necesidadesEstructurales(platoTexto(p))) }
    catch { platoNecesidades.set(p.id, {}) }
  }

  const vinoCartaPerfil = new Map()
  for (const v of vinosCarta) {
    try { vinoCartaPerfil.set(v.id, estimarPerfil(v)) }
    catch { vinoCartaPerfil.set(v.id, { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3 }) }
  }

  const catalogoPerfil = new Map()
  for (const v of catalogo) {
    const obj = vinoParaEngine(v, 'pvp_recomendado')
    try { catalogoPerfil.set(v.id, estimarPerfil(obj)) }
    catch { catalogoPerfil.set(v.id, { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3 }) }
  }

  // ── Paso 1: cobertura de carta por plato ──────────────────────────────────
  const coberturaCarta = platosActivos.map(p => {
    if (!vinosCarta.length) return { plato: p, count: 0 }
    const n = platoNecesidades.get(p.id)
    const count = vinosCarta.filter(v => {
      const perfil = vinoCartaPerfil.get(v.id)
      return perfil && esCompatible(n, perfil)
    }).length
    return { plato: p, count }
  })

  // ── Paso 2: selección de platos objetivo ──────────────────────────────────
  const orphans = coberturaCarta.filter(x => x.count === 0).map(x => x.plato)
  let targetPlatos, isSecondLevel

  if (orphans.length > 0) {
    targetPlatos = orphans
    isSecondLevel = false
  } else {
    const mean = coberturaCarta.reduce((s, x) => s + x.count, 0) / coberturaCarta.length
    targetPlatos = coberturaCarta
      .filter(x => x.count < mean)
      .sort((a, b) => a.count - b.count)
      .map(x => x.plato)
    isSecondLevel = true
  }

  if (!targetPlatos.length) return { anadir: [], sustituir: [] }

  // ── Paso 3: mapa de cobertura de candidatos del catálogo ─────────────────
  const candidatos = catalogo.filter(v => !enBorrador.has(v.id))
  const coverageMap = new Map()

  for (const v of candidatos) {
    const perfil = catalogoPerfil.get(v.id)
    if (!perfil) continue
    const cubiertos = new Set()
    for (const p of targetPlatos) {
      const n = platoNecesidades.get(p.id)
      if (n && esCompatible(n, perfil)) cubiertos.add(p.id)
    }
    if (cubiertos.size > 0) coverageMap.set(v.id, { vino: v, cubiertos })
  }

  // ── Paso 4: greedy set-cover ──────────────────────────────────────────────
  const sugsAnadir = []
  const resueltos = new Set()

  while (sugsAnadir.length < 8) {
    let bestId = null, bestNuevos = null
    for (const [id, { cubiertos }] of coverageMap) {
      const nuevos = [...cubiertos].filter(pid => !resueltos.has(pid))
      if (!bestNuevos || nuevos.length > bestNuevos.length) {
        bestId = id
        bestNuevos = nuevos
      }
    }
    if (!bestId || bestNuevos.length === 0) break

    const { vino } = coverageMap.get(bestId)
    const nombresPlatos = bestNuevos
      .slice(0, 3)
      .map(pid => targetPlatos.find(p => p.id === pid)?.nombre)
      .filter(Boolean)
      .join(', ')
    const masPlatos = bestNuevos.length > 3 ? ` y ${bestNuevos.length - 3} más` : ''

    sugsAnadir.push({
      key: vino.id,
      vino,
      razon: isSecondLevel
        ? `Amplía cobertura de ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} con poca oferta: ${nombresPlatos}${masPlatos}`
        : `Cubre ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} sin vino: ${nombresPlatos}${masPlatos}`,
      prioridad: bestNuevos.length,
    })

    bestNuevos.forEach(pid => resueltos.add(pid))
    coverageMap.delete(bestId)
  }

  return { anadir: sugsAnadir, sustituir: [] }
}
