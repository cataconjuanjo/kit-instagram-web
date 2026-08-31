import { analizarMaridaje } from './maridajeEngine'

function platoTexto(p) {
  return [p.nombre, p.categoria, p.descripcion].filter(Boolean).join(' ')
}

function vinoParaEngine(v, precioCampo) {
  const precio = Number(v[precioCampo]) > 0 ? Number(v[precioCampo]) : 20
  return { ...v, activo: true, stock: null, precio_botella: precio }
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
 * @param {Array}  lineas   - Líneas del borrador del simulador (carta activa + nueva)
 * @param {Array}  catalogo - Vinos del catálogo del consultor
 * @param {Array}  platos   - Platos activos del restaurante
 * @param {Object} [opts]   - { analizarFn } para inyección en tests
 */
export function generarSugerencias(lineas, catalogo, platos, { analizarFn = analizarMaridaje } = {}) {
  const activas = lineas.filter(l => l.estado !== 'fuera')
  const enBorrador = new Set(activas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))
  const vinosCarta = activas.map(l => vinoParaEngine(l, 'precio_botella'))
  const platosActivos = (platos || []).filter(p => p.activo !== false)

  if (!platosActivos.length || !catalogo.length) return { anadir: [], sustituir: [] }

  // ── Paso 1: cobertura de carta por plato ──────────────────────────────────
  const coberturaCarta = platosActivos.map(p => {
    if (!vinosCarta.length) return { plato: p, count: 0 }
    try {
      const a = analizarFn(platoTexto(p), vinosCarta)
      return { plato: p, count: a.candidatos.length }
    } catch { return { plato: p, count: 0 } }
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
    const vinoObj = vinoParaEngine(v, 'pvp_recomendado')
    const cubiertos = new Set()
    for (const p of targetPlatos) {
      try {
        const a = analizarFn(platoTexto(p), [vinoObj])
        if (a.candidatos.length > 0) cubiertos.add(p.id)
      } catch {}
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
