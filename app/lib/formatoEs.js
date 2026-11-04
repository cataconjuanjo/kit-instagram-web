/**
 * Helper canónico de formato es-ES para la app (release/ui-pulido-v1).
 *
 * Convención:
 *   - 4 cifras SIN separador de miles ("8025"), 5+ CON ("10.035").
 *   - Decimales con coma, nunca punto.
 *   - "EUR" se muestra como "€", precedido de un espacio fino ("1.234 €").
 *   - null / NaN / "" / undefined → "—".
 *   - En tablas: importes con parte decimal .00 pueden mostrarse en 0 decimales.
 *   - Fuera de tabla: 2 decimales por defecto para importes con céntimos.
 *
 * Funciones puras: no leen DOM, no formatean nunca el valor de edición
 * mientras el usuario escribe (eso lo decide el componente, en onBlur).
 */

const PLACEHOLDER = '—'

function toNumeroFinito(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  return n
}

/**
 * Elige el separador de miles según la regla "4 cifras sin, 5+ con".
 * Trabaja sobre la PARTE ENTERA del número (ignorando signo y decimales).
 */
function usaSeparadorMiles(numero) {
  const abs = Math.abs(numero)
  const entero = Math.trunc(abs)
  return entero >= 10000
}

/**
 * Formatea un importe en euros.
 * @param {number|string|null} valor
 * @param {object} opts
 * @param {number} opts.decimales   Decimales a mostrar (default: 0 en tabla, 2 fuera).
 * @param {boolean} opts.enTabla    Si true, usa 0 decimales por defecto cuando el valor es entero.
 * @param {boolean} opts.signo      Si true, antepone "+" en positivos (útil para Δ).
 * @returns {string}
 */
export function formatoMoneda(valor, opts = {}) {
  const n = toNumeroFinito(valor)
  if (n === null) return PLACEHOLDER

  const { signo = false } = opts
  let decimales = opts.decimales
  if (decimales === undefined || decimales === null) {
    if (opts.enTabla) decimales = Number.isInteger(n) ? 0 : 2
    else decimales = Number.isInteger(n) ? 0 : 2
  }

  const useGrouping = usaSeparadorMiles(n)
  const fmt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping,
  })

  let out = fmt.format(n)
  if (signo && n > 0) out = '+' + out
  // Espacio normal + € (consistente con "10.035 €").
  return out + ' €'
}

/**
 * Formatea un número decimal (sin unidad).
 */
export function formatoDecimal(valor, decimales = 2, opts = {}) {
  const n = toNumeroFinito(valor)
  if (n === null) return PLACEHOLDER
  const { signo = false } = opts
  const useGrouping = usaSeparadorMiles(n)
  const fmt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping,
  })
  let out = fmt.format(n)
  if (signo && n > 0) out = '+' + out
  return out
}

/**
 * Formatea un porcentaje.
 * El valor se interpreta como "ya en %", no en decimal (ej. 29.78 → "29,78 %").
 */
export function formatoPorcentaje(valor, decimales = 1, opts = {}) {
  const n = toNumeroFinito(valor)
  if (n === null) return PLACEHOLDER
  const { signo = false } = opts
  const fmt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: usaSeparadorMiles(n),
  })
  let out = fmt.format(n)
  if (signo && n > 0) out = '+' + out
  return out + ' %'
}

/**
 * Variación relativa en %. Útil para Δ MoM / YoY.
 * Siempre con signo.
 */
export function formatoVariacion(valor, decimales = 1) {
  return formatoPorcentaje(valor, decimales, { signo: true })
}

/**
 * Puntos porcentuales (p. ej. "+1,2 p.p."). Formato breve.
 */
export function formatoPuntosPorcentuales(valor, decimales = 1) {
  const n = toNumeroFinito(valor)
  if (n === null) return PLACEHOLDER
  const fmt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
  const out = fmt.format(n)
  const prefijo = n > 0 ? '+' : ''
  return prefijo + out + ' p.p.'
}

/**
 * Multiplicador (p. ej. "1,25x", "121,27x").
 */
export function formatoMultiplicador(valor, decimales = 2) {
  const n = toNumeroFinito(valor)
  if (n === null) return PLACEHOLDER
  const fmt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: usaSeparadorMiles(n),
  })
  return fmt.format(n) + 'x'
}

/**
 * Formato breve "YYYY-MM" → "Oct 2026".
 */
export function formatoMesCorto(ymStr) {
  if (!ymStr || typeof ymStr !== 'string') return ''
  const [y, m] = ymStr.split('-')
  const idx = parseInt(m, 10) - 1
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  if (!MESES[idx] || !y) return ymStr
  return `${MESES[idx]} ${y}`
}

/**
 * Formato "1/1/2025" → "1 ene 2025". Acepta ISO o Date.
 */
export function formatoFechaCorta(fecha) {
  if (!fecha) return PLACEHOLDER
  let d
  if (fecha instanceof Date) d = fecha
  else if (typeof fecha === 'string') {
    // Admite "YYYY-MM-DD", "YYYY-MM-DDTHH:...", "D/M/YYYY".
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(fecha)) {
      const [dd, mm, yyyy] = fecha.split('/')
      d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
    } else {
      d = new Date(fecha)
    }
  } else {
    return PLACEHOLDER
  }
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return PLACEHOLDER
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

export const PLACEHOLDER_VACIO = PLACEHOLDER
