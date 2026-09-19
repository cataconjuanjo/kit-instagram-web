import { estimarPerfil, necesidadesEstructurales } from './maridajeEngine'
import { vinosCompatiblesConPlato } from './cartaCoverageUtils'

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

function normZona(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Sugiere vinos del catálogo de zonas/D.O. no representadas en el borrador.
// Se usa cuando el motor de maridaje no encuentra candidatos (sin platos,
// o catálogo con perfil idéntico al borrador).
function _sugerenciasGapZona(activas, candidatos) {
  const zonasEnBorrador = new Set(activas.map(l => normZona(l.region)).filter(Boolean))
  const porZona = new Map()
  for (const v of candidatos) {
    const zona = normZona(v.region)
    if (!zona || zonasEnBorrador.has(zona)) continue
    if (!porZona.has(zona)) porZona.set(zona, v)
  }
  return [...porZona.values()].slice(0, 8).map(vino => ({
    key: vino.id,
    vino,
    razon: `Zona/D.O. sin representación en el borrador: ${vino.region}`,
    prioridad: 1,
  }))
}

/**
 * Genera sugerencias de vinos del catálogo del consultor.
 *
 * Nivel 1 (huecos reales): platos con 0 vinos compatibles en la carta simulada.
 *   → Busca en el catálogo vinos que cubran esos platos y los propone vía greedy set-cover.
 *
 * Nivel 2 (cobertura baja): platos con cobertura por debajo de la mediana.
 *   → Usa mediana (no media) para evitar que cobertura uniforme devuelva targetPlatos vacío.
 *   → Si todos los platos tienen igual cobertura, usa la mitad inferior como objetivo.
 *
 * Fallback zona/D.O.: cuando no hay platos configurados o el análisis de maridaje
 *   no encuentra ningún candidato, propone vinos de zonas ausentes en el borrador.
 *
 * @param {Array} lineas   - Líneas del borrador del simulador (carta activa + nueva)
 * @param {Array} catalogo - Vinos del catálogo del consultor
 * @param {Array} platos   - Platos activos del restaurante
 */
export function generarSugerencias(lineas, catalogo, platos) {
  const activas = lineas.filter(l => l.estado !== 'fuera')
  const enBorrador = new Set(activas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))
  const vinosCarta = activas.map(l => vinoParaEngine(l, 'precio_botella'))
  const candidatos = catalogo.filter(v => !enBorrador.has(v.id))
  const platosActivos = (platos || []).filter(p => p.activo !== false)

  if (!catalogo.length) return { anadir: [], sustituir: [] }

  let anadir = []
  let platosObjetivo, nivelDos

  // ── Paso A: análisis por huecos de maridaje (requiere platos) ────────────
  if (platosActivos.length > 0 && candidatos.length > 0) {
    console.log('[sugerirCarta] A: platosActivos=', platosActivos.length, 'candidatos=', candidatos.length)

    // Cobertura actual: cuántos vinos de la carta son compatibles con cada plato.
    // vinosCompatiblesConPlato (de cartaCoverageUtils) es la función canónica compartida.
    const coberturaCarta = platosActivos.map(p => ({
      plato: p,
      count: vinosCompatiblesConPlato(p, vinosCarta).length,
    }))

    // ── Selección de platos objetivo ──────────────────────────────────────
    const orphans = coberturaCarta.filter(x => x.count === 0).map(x => x.plato)
    console.log('[sugerirCarta] A: orphans=', orphans.length, orphans.map(p => p.nombre))
    let targetPlatos

    if (orphans.length > 0) {
      // Nivel 1: platos sin ningún vino compatible
      targetPlatos = orphans
      nivelDos = false
    } else {
      // Nivel 2: platos con cobertura por debajo de la mediana.
      // La mediana evita el bug de la media: si todos los platos tienen el mismo
      // count, mean == count para todos → filter(x.count < mean) = [] → vacío silencioso.
      const sorted = [...coberturaCarta].sort((a, b) => a.count - b.count)
      const median = sorted[Math.floor(sorted.length / 2)].count
      let below = coberturaCarta.filter(x => x.count < median)
      if (!below.length) {
        // Cobertura completamente uniforme: usar la mitad inferior para buscar diversidad
        below = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)))
      }
      targetPlatos = below.sort((a, b) => a.count - b.count).map(x => x.plato)
      nivelDos = true
    }

    platosObjetivo = targetPlatos.length
    console.log('[sugerirCarta] A: targetPlatos=', targetPlatos.length, 'nivelDos=', nivelDos)

    // ── Precomputar perfiles del catálogo para el mapa de cobertura ───────
    const catalogoPerfil = new Map()
    let sinId = 0
    for (const v of candidatos) {
      if (!v.id) { sinId++; continue }
      const obj = vinoParaEngine(v, 'pvp_recomendado')
      try { catalogoPerfil.set(v.id, estimarPerfil(obj)) }
      catch { catalogoPerfil.set(v.id, { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3 }) }
    }
    console.log('[sugerirCarta] A: catalogoPerfil.size=', catalogoPerfil.size, 'sinId=', sinId)

    const platoNecesidades = new Map()
    for (const p of targetPlatos) {
      try { platoNecesidades.set(p.id, necesidadesEstructurales(platoTexto(p))) }
      catch { platoNecesidades.set(p.id, {}) }
    }
    if (targetPlatos.length > 0) {
      const p0 = targetPlatos[0]
      console.log('[sugerirCarta] A: necesidades plato[0]', p0.nombre, '→', JSON.stringify(platoNecesidades.get(p0.id)))
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
    console.log('[sugerirCarta] A: coverageMap.size=', coverageMap.size)
    // Diagnóstico: mostrar perfil del primer candidato tinto y si pasa el primer plato objetivo
    const primerTinto = candidatos.find(v => v.tipo === 'tinto' && v.id)
    if (primerTinto && targetPlatos.length > 0) {
      const obj = vinoParaEngine(primerTinto, 'pvp_recomendado')
      let perfil
      try { perfil = estimarPerfil(obj) } catch { perfil = null }
      const p0 = targetPlatos[0]
      const n0 = platoNecesidades.get(p0.id)
      console.log('[sugerirCarta] A: primerTinto=', primerTinto.nombre, 'perfil=', JSON.stringify(perfil), 'necesidades=', JSON.stringify(n0), 'esCompatible=', perfil && n0 ? esCompatible(n0, perfil) : 'N/A')
    }

    // ── Greedy set-cover ─────────────────────────────────────────────────
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
        razon: nivelDos
          ? `Amplía cobertura de ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} con poca oferta: ${nombresPlatos}${masPlatos}`
          : `Cubre ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} sin vino compatible: ${nombresPlatos}${masPlatos}`,
        prioridad: bestNuevos.length,
      })

      bestNuevos.forEach(pid => resueltos.add(pid))
      coverageMap.delete(bestId)
    }
  }

  // ── Paso B: fallback zona/D.O. ───────────────────────────────────────────
  // Activa cuando: no hay platos configurados, o el motor de maridaje no encontró
  // candidatos del catálogo que cubran ningún plato objetivo.
  console.log('[sugerirCarta] pasoA.anadir=', anadir.length, '→ fallback?', anadir.length === 0 && candidatos.length > 0)
  if (anadir.length === 0 && candidatos.length > 0) {
    anadir = _sugerenciasGapZona(activas, candidatos)
    platosObjetivo = undefined
    nivelDos = undefined
  }

  return { anadir, sustituir: [], platosObjetivo, nivelDos }
}
