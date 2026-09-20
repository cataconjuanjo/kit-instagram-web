import { estimarPerfil, necesidadesEstructurales } from './maridajeEngine.js'
import { vinosCompatiblesConPlato } from './cartaCoverageUtils.js'

export { vinosCompatiblesConPlato }

function platoTexto(p) {
  return [p.nombre, p.categoria, p.descripcion].filter(Boolean).join(' ')
}

function vinoParaEngine(v, precioCampo) {
  const precio = Number(v[precioCampo]) > 0 ? Number(v[precioCampo]) : 20
  return { ...v, activo: true, stock: null, precio_botella: precio }
}

function esCompatible(n, p) {
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

// Zonas demasiado genéricas para sugerir como "D.O. sin representación"
const ZONAS_GENERICAS = new Set([
  'espana', 'espagne', 'spain',
  'francia', 'france',
  'italia', 'italy',
  'portugal',
  'alemania', 'germany',
  'austria',
])

function normZona(s) {
  let str = String(s || '').trim()
  // Toma el segmento final si hay prefijo de comunidad autónoma ("Galicia - Rías Baixas" → "Rías Baixas")
  const guion = str.lastIndexOf(' - ')
  if (guion !== -1) str = str.slice(guion + 3)
  // Quita prefijos D.O./DO/D.O.Ca/DOCa/D.O.P./DOP al inicio
  str = str.replace(/^d\.?o\.?(?:ca?|p)?\.?\s+/i, '')
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function _sugerenciasGapZona(activas, candidatos, limite = 8) {
  const zonasEnBorrador = new Set(activas.map(l => normZona(l.region)).filter(Boolean))
  const porZona = new Map()
  for (const v of candidatos) {
    const zona = normZona(v.region)
    if (!zona || ZONAS_GENERICAS.has(zona) || zonasEnBorrador.has(zona)) continue
    if (!porZona.has(zona)) porZona.set(zona, v)
  }
  return [...porZona.values()].slice(0, limite).map(vino => ({
    key: vino.id,
    vino,
    razon: `Zona/D.O. sin representación en el borrador: ${vino.region}`,
    prioridad: 1,
    tipo: 'zona',
  }))
}

/**
 * Genera sugerencias de vinos del catálogo del consultor.
 *
 * PRIORIDAD 1 (anadir): huecos de maridaje por plato.
 *   Level 1 — platos con 0 vinos compatibles en el borrador (urgente).
 *   Level 2 — platos con cobertura por debajo de la mediana.
 *   Greedy set-cover: cubre el máximo de platos con el mínimo de vinos.
 *
 * PRIORIDAD 2 (secundario): diversidad de zona/D.O.
 *   Solo cuando quedan slots disponibles (<8) tras el análisis de maridaje.
 *   Complementa el maridaje, nunca lo sustituye.
 *
 * @param {Array} lineas   - Líneas del borrador (carta activa + nueva)
 * @param {Array} catalogo - Vinos del catálogo del consultor
 * @param {Array} platos   - Platos del restaurante
 * @returns {{ anadir, sustituir, secundario, todosCubiertos, platosObjetivo, nivelDos }}
 */
export function generarSugerencias(lineas, catalogo, platos) {
  const activas = lineas.filter(l => l.estado !== 'fuera')
  const enBorrador = new Set(activas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))
  const vinosCarta = activas.map(l => vinoParaEngine(l, 'precio_botella'))
  const candidatos = catalogo.filter(v => !enBorrador.has(v.id))
  const platosActivos = (platos || []).filter(p => p.activo !== false)

  if (!catalogo.length) return { anadir: [], sustituir: [], secundario: [], todosCubiertos: false }

  let anadir = []
  let todosCubiertos = false
  let platosObjetivo, nivelDos

  // ── PRIORIDAD 1: análisis de maridaje por plato ──────────────────────────
  if (platosActivos.length > 0) {
    const coberturaCarta = platosActivos.map(p => ({
      plato: p,
      count: vinosCompatiblesConPlato(p, vinosCarta).length,
    }))

    const orphans = coberturaCarta.filter(x => x.count === 0).map(x => x.plato)
    todosCubiertos = orphans.length === 0

    if (candidatos.length > 0) {
      let targetPlatos, nivelDosLocal

      if (orphans.length > 0) {
        targetPlatos = orphans
        nivelDosLocal = false
      } else {
        // Nivel 2: platos con cobertura por debajo de la mediana.
        // Mediana en lugar de media: evita vacío cuando todos los platos tienen igual count.
        const sorted = [...coberturaCarta].sort((a, b) => a.count - b.count)
        const median = sorted[Math.floor(sorted.length / 2)].count
        let below = coberturaCarta.filter(x => x.count < median)
        if (!below.length) {
          below = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)))
        }
        targetPlatos = below.sort((a, b) => a.count - b.count).map(x => x.plato)
        nivelDosLocal = true
      }

      platosObjetivo = targetPlatos.length
      nivelDos = nivelDosLocal

      // Precomputar perfiles del catálogo
      const catalogoPerfil = new Map()
      for (const v of candidatos) {
        if (!v.id) continue
        const obj = vinoParaEngine(v, 'pvp_recomendado')
        try { catalogoPerfil.set(v.id, estimarPerfil(obj)) }
        catch { catalogoPerfil.set(v.id, { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3 }) }
      }

      const platoNecesidades = new Map()
      for (const p of targetPlatos) {
        try { platoNecesidades.set(p.id, necesidadesEstructurales(platoTexto(p))) }
        catch { platoNecesidades.set(p.id, {}) }
      }

      // Para cada candidato: qué platos objetivo cubre
      const coverageMap = new Map()
      for (const v of candidatos) {
        if (!v.id) continue
        const perfil = catalogoPerfil.get(v.id)
        if (!perfil) continue
        const cubiertos = new Set()
        for (const p of targetPlatos) {
          const n = platoNecesidades.get(p.id)
          if (n && esCompatible(n, perfil)) cubiertos.add(p.id)
        }
        if (cubiertos.size > 0) coverageMap.set(v.id, { vino: v, cubiertos })
      }

      // Greedy set-cover: máximo cubrimiento con mínimo número de vinos
      const resueltos = new Set()
      while (anadir.length < 8) {
        let bestId = null, bestNuevos = null
        for (const [id, { cubiertos }] of coverageMap) {
          const nuevos = [...cubiertos].filter(pid => !resueltos.has(pid))
          if (!bestNuevos || nuevos.length > bestNuevos.length) { bestId = id; bestNuevos = nuevos }
        }
        if (!bestId || bestNuevos.length === 0) break

        const { vino } = coverageMap.get(bestId)
        const nombresPlatos = bestNuevos.slice(0, 3)
          .map(pid => targetPlatos.find(p => p.id === pid)?.nombre)
          .filter(Boolean).join(', ')
        const masPlatos = bestNuevos.length > 3 ? ` y ${bestNuevos.length - 3} más` : ''

        anadir.push({
          key: vino.id,
          vino,
          razon: nivelDosLocal
            ? `Amplía cobertura de ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} con poca oferta: ${nombresPlatos}${masPlatos}`
            : `Cubre ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} sin vino compatible: ${nombresPlatos}${masPlatos}`,
          prioridad: bestNuevos.length,
          tipo: 'maridaje',
        })

        bestNuevos.forEach(pid => resueltos.add(pid))
        coverageMap.delete(bestId)
      }
    }
  }

  // ── PRIORIDAD 2: diversidad de zona/D.O. (secundario) ────────────────────
  // Complementa el maridaje cuando quedan slots libres, o cuando no hay platos.
  // Nunca reemplaza los gaps de maridaje — siempre va en array separado.
  const slotsLibres = Math.max(0, 8 - anadir.length)
  const secundario = candidatos.length > 0 && slotsLibres > 0
    ? _sugerenciasGapZona(activas, candidatos, slotsLibres)
    : []

  return { anadir, sustituir: [], secundario, todosCubiertos, platosObjetivo, nivelDos }
}
