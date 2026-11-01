/**
 * yoyAgregacion.js — helper puro para comparativas Year-over-Year.
 *
 * Sin DOM, sin Supabase. Toma filas ya cargadas por el llamador
 * (típicamente historico_mensual del año actual y del año anterior)
 * y devuelve la comparativa like-for-like.
 *
 * Criterio de "mes comparable" (H4d — F3-H4):
 *   historico_mensual NO tiene estado 'cerrado'/'abierto' explícito.
 *   Convención: una fila presente en historico_mensual se considera
 *   cerrada EXCEPTO el mes en curso del año actual (`mesActualHoy`),
 *   que puede estar siendo escrito en caliente desde Explotación y
 *   NO entra en el YTD. El llamador puede pasar `mesActualHoy` si
 *   quiere forzarlo; por defecto se calcula desde Date.now().
 *
 * Reglas (idénticas a las ya en uso en analitica-somm:131,150 y
 * CierreMensual:58):
 *   - delta  = actual - prev
 *   - deltaPct = delta / |prev| * 100     si prev != 0 && prev != null
 *                null                      si prev es 0 o null
 *   - Para métricas 'ratio' (pct_mp, etc.) delta se expresa en puntos
 *     porcentuales y deltaPct queda en null (no tiene sentido Δ% sobre
 *     un %).
 */

function esFinito(n) { return typeof n === 'number' && Number.isFinite(n) }
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

/**
 * Devuelve el mes (1..12) actual, en el huso del servidor. Expuesto
 * para que llamadores server-side puedan sobreescribir en SSR / tests.
 */
export function mesActualDefault() {
  const d = new Date()
  return { anio: d.getFullYear(), mes: d.getMonth() + 1 }
}

/**
 * mesesComparables(filasActual, filasPrev, { mesActualHoy, anioActual })
 * Devuelve el array de meses (1..12) donde hay dato Y están "cerrados"
 * en AMBOS años. mesActualHoy excluye el mes en curso del año actual.
 *
 *   filasActual, filasPrev: [{ anio, mes, ingresos, consumo_mp, ... }]
 *   mesActualHoy?: { anio, mes }   (default: mesActualDefault())
 *   anioActual?:   number           (default: filasActual[0]?.anio)
 */
export function mesesComparables(filasActual, filasPrev, opts = {}) {
  const hoy = opts.mesActualHoy || mesActualDefault()
  const anioActual = opts.anioActual
    ?? (filasActual?.length ? filasActual[0].anio : null)

  const mesesEnActual = new Set((filasActual || []).map(r => Number(r.mes)))
  const mesesEnPrev   = new Set((filasPrev   || []).map(r => Number(r.mes)))

  const comunes = []
  for (let m = 1; m <= 12; m++) {
    if (!mesesEnActual.has(m) || !mesesEnPrev.has(m)) continue
    // Excluir mes en curso del año actual (no cerrado)
    if (anioActual != null && anioActual === hoy.anio && m === hoy.mes) continue
    comunes.push(m)
  }
  return comunes
}

/**
 * Devuelve el objeto fila por mes (lookup rápido).
 */
function indexarPorMes(filas) {
  const idx = {}
  for (const r of (filas || [])) idx[Number(r.mes)] = r
  return idx
}

/**
 * calcularYoY({ actual, prev, metricas, opts })
 *   actual, prev: arrays de filas con { anio, mes, [metricas...] }
 *   metricas:     [{ key, tipo?: 'importe'|'ratio' }]   tipo default: 'importe'
 *   opts:         { mesActualHoy, anioActual }
 *
 * Devuelve:
 *   {
 *     meses: [1,2,...],                // meses comparables usados
 *     porMes: {
 *       [key]: {
 *         [mes]: { valor, valorPrev, delta, deltaPct }
 *       }
 *     },
 *     ytd: {
 *       [key]: { valor, valorPrev, delta, deltaPct, meses, tipo }
 *     }
 *   }
 *
 * Para 'ratio' se calcula un promedio simple sobre meses comparables
 * (no ponderado), ya que no es sumable; delta queda en PUNTOS
 * PORCENTUALES y deltaPct = null.
 */
export function calcularYoY({ actual, prev, metricas = [], ...opts }) {
  const meses = mesesComparables(actual, prev, opts)
  const idxA = indexarPorMes(actual)
  const idxP = indexarPorMes(prev)

  const porMes = {}
  const ytd    = {}

  for (const met of metricas) {
    const key  = met.key
    const tipo = met.tipo || 'importe'
    porMes[key] = {}

    // por-mes (NO filtrado por mesesComparables: incluye todos los
    // meses del año actual aunque no cuadren; marcados sin prev)
    const todosMesesActual = (actual || []).map(r => Number(r.mes))
    for (const m of todosMesesActual) {
      const a = idxA[m]
      const p = idxP[m]
      const valor     = esFinito(a?.[key]) ? Number(a[key]) : null
      const valorPrev = esFinito(p?.[key]) ? Number(p[key]) : null
      porMes[key][m] = celdaYoY(valor, valorPrev, tipo)
    }

    // YTD: solo meses comparables
    if (tipo === 'ratio') {
      // promedio simple en meses comparables
      const vals = meses.map(m => Number(idxA[m]?.[key])).filter(esFinito)
      const prevs = meses.map(m => Number(idxP[m]?.[key])).filter(esFinito)
      const prom = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
      const valor     = prom(vals)
      const valorPrev = prom(prevs)
      const delta = (valor != null && valorPrev != null) ? r2(valor - valorPrev) : null
      ytd[key] = {
        valor:     valor     != null ? r2(valor)     : null,
        valorPrev: valorPrev != null ? r2(valorPrev) : null,
        delta, deltaPct: null, meses, tipo,
      }
    } else {
      // importe: suma sobre meses comparables
      let valor = 0, valorPrev = 0, tengoAct = false, tengoPrev = false
      for (const m of meses) {
        const va = Number(idxA[m]?.[key])
        const vp = Number(idxP[m]?.[key])
        if (esFinito(va)) { valor     += va; tengoAct  = true }
        if (esFinito(vp)) { valorPrev += vp; tengoPrev = true }
      }
      const vActual = tengoAct  ? r2(valor)     : null
      const vPrev   = tengoPrev ? r2(valorPrev) : null
      const delta   = (vActual != null && vPrev != null) ? r2(vActual - vPrev) : null
      const deltaPct = (vPrev != null && vPrev !== 0 && delta != null)
        ? r2(delta / Math.abs(vPrev) * 100) : null
      ytd[key] = {
        valor: vActual, valorPrev: vPrev, delta, deltaPct, meses, tipo,
      }
    }
  }

  return { meses, porMes, ytd }
}

function celdaYoY(valor, valorPrev, tipo) {
  if (tipo === 'ratio') {
    const delta = (valor != null && valorPrev != null) ? r2(valor - valorPrev) : null
    return {
      valor:     valor     != null ? r2(valor)     : null,
      valorPrev: valorPrev != null ? r2(valorPrev) : null,
      delta, deltaPct: null,
    }
  }
  // importe
  const delta = (valor != null && valorPrev != null) ? r2(valor - valorPrev) : null
  const deltaPct = (valorPrev != null && valorPrev !== 0 && delta != null)
    ? r2(delta / Math.abs(valorPrev) * 100) : null
  return {
    valor:     valor     != null ? r2(valor)     : null,
    valorPrev: valorPrev != null ? r2(valorPrev) : null,
    delta, deltaPct,
  }
}
