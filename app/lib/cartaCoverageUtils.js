import { estimarPerfil, necesidadesEstructurales } from './maridajeEngine'

function platoTexto(p) {
  return [p.nombre, p.categoria, p.descripcion].filter(Boolean).join(' ')
}

function vinoParaEngine(linea) {
  const precio = Number(linea.precio_botella) > 0 ? Number(linea.precio_botella) : 20
  return { ...linea, activo: true, stock: null, precio_botella: precio }
}

function esCompatible(necesidades, perfil) {
  const n = necesidades, p = perfil
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

function precomputarPerfiles(vinos) {
  const map = new Map()
  for (const v of vinos) {
    try { map.set(v.id, estimarPerfil(v)) }
    catch { map.set(v.id, { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3 }) }
  }
  return map
}

/**
 * Computa cobertura de platos: para cada plato activo, cuántos vinos lo cubren
 * en la carta "antes" (actual publicada) y "después" (borrador simulado).
 *
 * Antes  = estado 'actual' + 'fuera'  (la carta real hoy)
 * Después = estado 'actual' + 'nuevo' (lo que quedaría al publicar)
 *
 * Usa perfiles estructurales precomputados (O(platos+vinos)) — mismo patrón
 * que sugerirCarta.js para mantener el cómputo < 300ms incluso con 10k pares.
 *
 * @param {Array} lineas - filas de carta_simulacion
 * @param {Array} platos - platos activos del restaurante
 * @returns {Array} [{ plato, antes, despues }]
 */
export function computarCobertura(lineas, platos) {
  const platosActivos = (platos || []).filter(p => p.activo !== false)
  if (!platosActivos.length) return []

  const vinosAntes   = lineas.filter(l => l.estado === 'actual' || l.estado === 'fuera').map(vinoParaEngine)
  const vinosDespues = lineas.filter(l => l.estado === 'actual' || l.estado === 'nuevo').map(vinoParaEngine)

  const perfilesAntes   = precomputarPerfiles(vinosAntes)
  const perfilesDespues = precomputarPerfiles(vinosDespues)

  return platosActivos.map(plato => {
    let necesidades = {}
    try { necesidades = necesidadesEstructurales(platoTexto(plato)) } catch { /* fallback vacío */ }

    const antes   = vinosAntes.filter(v   => esCompatible(necesidades, perfilesAntes.get(v.id)   || {})).length
    const despues = vinosDespues.filter(v => esCompatible(necesidades, perfilesDespues.get(v.id) || {})).length

    return { plato, antes, despues }
  })
}

/**
 * Agrega lineas enriquecidas por proveedor.
 * Las lineas deben tener proveedor_id, proveedor_nombre, proveedor_email,
 * proveedor_contacto (añadidos por el endpoint /api/simulador/proveedores-breakdown).
 *
 * Feature B llama a esta función con lineas filtradas a estado='nuevo'.
 * Feature C la llama con filtro según el toggle actual/simulada.
 *
 * @param {Array} lineas - lineas enriquecidas con datos de proveedor
 * @returns {Array} grupos ordenados por nº de referencias desc
 */
export function getProveedorBreakdown(lineas) {
  const grupos = new Map()

  for (const linea of lineas) {
    const key = linea.proveedor_id
      || (linea.proveedor_nombre ? `txt:${linea.proveedor_nombre}` : '__sin_proveedor__')

    if (!grupos.has(key)) {
      grupos.set(key, {
        proveedor: {
          id: linea.proveedor_id || null,
          nombre: linea.proveedor_nombre || 'Sin proveedor asignado',
          email: linea.proveedor_email || null,
          contacto: linea.proveedor_contacto || null,
          telefono: linea.proveedor_telefono || null,
          tipo: linea.proveedor_tipo || 'desconocido',
        },
        lineas: [],
        totalRefs: 0,
        inversionEstimada: 0,
        sinCoste: 0,
      })
    }

    const grupo = grupos.get(key)
    grupo.lineas.push(linea)
    grupo.totalRefs++
    const coste = Number(linea.coste_compra)
    if (coste > 0) {
      grupo.inversionEstimada += coste * 6
    } else {
      grupo.sinCoste++
    }
  }

  return Array.from(grupos.values()).sort((a, b) => b.totalRefs - a.totalRefs)
}

/**
 * Calcula el índice de concentración basado en cuota del proveedor principal.
 * Devuelve semáforo y etiqueta para mostrar en la UI.
 *
 * @param {Array} grupos - salida de getProveedorBreakdown
 * @param {number} totalRefs - total de referencias consideradas
 */
export function calcularConcentracion(grupos, totalRefs) {
  if (!totalRefs || !grupos.length) return { nivel: 'neutral', etiqueta: 'Sin datos', topPct: 0, hhi: 0 }

  const topPct = Math.round((grupos[0].totalRefs / totalRefs) * 100)

  // HHI simplificado sobre cuota de referencias (0-10000)
  const hhi = Math.round(
    grupos.reduce((sum, g) => {
      const s = g.totalRefs / totalRefs
      return sum + s * s * 10000
    }, 0)
  )

  // Umbrales: top proveedor < 30% = diversificada, 30-50% = moderada, > 50% = concentrada
  const TOP_BUENA   = 30
  const TOP_MODERADA = 50

  let nivel, etiqueta
  if (topPct < TOP_BUENA) {
    nivel = 'verde'; etiqueta = 'Diversificación buena'
  } else if (topPct < TOP_MODERADA) {
    nivel = 'ambar'; etiqueta = 'Diversificación moderada'
  } else {
    nivel = 'rojo'; etiqueta = 'Concentración alta'
  }

  return { nivel, etiqueta, topPct, hhi }
}
