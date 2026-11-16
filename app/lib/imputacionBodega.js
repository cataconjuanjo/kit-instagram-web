/**
 * imputacionBodega.js — Imputación por concepto a la bodega (% bodega).
 *
 * Función pura. Transforma los importes TOTAL del periodo guardados en
 * parametros_explotacion en los importes IMPUTADOS a la bodega, aplicando
 * un porcentaje por concepto (% bodega).
 *
 * MODELO DE DATOS
 *
 *   parametros_explotacion.imputacion_pct jsonb (SQL pendiente).
 *   Estructura:
 *     {
 *       "nominas_brutas":          30,
 *       "ss_empresa":              30,
 *       "extras_personal":         30,
 *       "retenciones_irpf":        30,
 *       "comisiones_datafono":   100,
 *       "mantenimiento_datafono":100,
 *       "resto_comisiones":      100,
 *       "partidas_gastos":    { "<id>": 50, "<id>": 30, ... },
 *       "partidas_alquiler":  { "<id>": 30, ... }
 *     }
 *
 *   Materia prima y facturación NO se imputan:
 *     - consumo_mp es 100 % bodega por definición (es el vino consumido).
 *     - facturacion_total son los ingresos del vino.
 *
 * REGLAS
 *
 *   - pct ausente, null, undefined, NaN, string, Infinity → 100 (default).
 *   - pct se clamp'ea a [0, 100].
 *   - Los números se tratan con numLegit (typeof === 'number' && isFinite),
 *     sin coerción. importe null/undefined → se trata como 0.
 *   - El valor devuelto no se redondea aquí (redondea el consumer al
 *     presentar). Esto evita duplicar los redondeos del dominio
 *     (sommExplotacion.js r2/r4).
 */

/** typeof === 'number' && isFinite. Lo demás → null. */
function numLegit(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null
}

/** Normaliza un pct a [0,100]. Valor inválido → 100. */
export function normalizarPct(pct) {
  const n = numLegit(pct)
  if (n == null) return 100
  if (n < 0)   return 0
  if (n > 100) return 100
  return n
}

/**
 * Importe imputado a la bodega. pct default 100 → devuelve importeTotal.
 *
 * @param {{ importeTotal: number|null|undefined, pct: number|null|undefined }} input
 * @returns {number} importe imputado
 */
export function imputar({ importeTotal, pct } = {}) {
  const tot = numLegit(importeTotal) ?? 0
  const p   = normalizarPct(pct)
  return tot * p / 100
}

/**
 * Devuelve una copia del objeto `params` con los importes imputables ya
 * imputados a la bodega. Deja intactos los demás campos. Pensado para que
 * los consumers de calcularTotalPersonal/Gastos/Alquiler/Bancarios lo usen
 * como drop-in replacement sin cambiar las funciones de agregación.
 *
 * Sin `imputacion_pct` en la fila (columna no aplicada todavía, o nunca
 * se introdujo nada) devuelve una copia IDÉNTICA a `params` para los
 * campos imputables → ningún número cambia respecto al comportamiento
 * actual.
 *
 * Materia prima y facturación quedan sin tocar.
 *
 * @param {object|null|undefined} params fila cruda de parametros_explotacion
 * @returns {object} copia con los campos imputables ya imputados
 */
export function imputarParametros(params) {
  if (!params || typeof params !== 'object') return {}
  const ip = (params.imputacion_pct && typeof params.imputacion_pct === 'object')
    ? params.imputacion_pct
    : {}
  const out = { ...params }

  // Campos escalares del personal y bancarios
  const camposEscalares = [
    'nominas_brutas',
    'ss_empresa',
    'extras_personal',
    'retenciones_irpf',
    'comisiones_datafono',
    'mantenimiento_datafono',
    'resto_comisiones',
  ]
  for (const k of camposEscalares) {
    const total = numLegit(params[k])
    out[k] = (total == null)
      ? params[k]                         // null / undefined → tal cual
      : imputar({ importeTotal: total, pct: ip[k] })
  }

  // partidas_gastos: array de { id, categoria, importe, amortizar_meses }
  //   imputacion_pct.partidas_gastos = { "<id>": pct, ... }
  if (Array.isArray(params.partidas_gastos)) {
    const mapa = (ip.partidas_gastos && typeof ip.partidas_gastos === 'object')
      ? ip.partidas_gastos
      : {}
    out.partidas_gastos = params.partidas_gastos.map(p => ({
      ...p,
      importe: imputar({ importeTotal: numLegit(p?.importe) ?? 0, pct: mapa[p?.id] }),
    }))
  }

  // partidas_alquiler: array de { id, concepto, importe }
  if (Array.isArray(params.partidas_alquiler)) {
    const mapa = (ip.partidas_alquiler && typeof ip.partidas_alquiler === 'object')
      ? ip.partidas_alquiler
      : {}
    out.partidas_alquiler = params.partidas_alquiler.map(p => ({
      ...p,
      importe: imputar({ importeTotal: numLegit(p?.importe) ?? 0, pct: mapa[p?.id] }),
    }))
  }

  return out
}

/**
 * Devuelve el `pct` canónico para un concepto. Para partidas (gastos /
 * alquiler) se pasa el id como `subkey`. Nunca devuelve null; cuando
 * falta, 100 (comportamiento equivalente al actual "ya son fracción bodega").
 *
 * @param {object|null|undefined} imputacion_pct
 * @param {string} concepto  nombre del campo escalar o 'partidas_gastos' / 'partidas_alquiler'
 * @param {string|number|undefined} subkey  id de partida cuando procede
 * @returns {number} pct en [0, 100]
 */
export function getPct(imputacion_pct, concepto, subkey) {
  if (!imputacion_pct || typeof imputacion_pct !== 'object') return 100
  if (subkey == null) return normalizarPct(imputacion_pct[concepto])
  const sub = imputacion_pct[concepto]
  if (!sub || typeof sub !== 'object') return 100
  return normalizarPct(sub[subkey])
}
