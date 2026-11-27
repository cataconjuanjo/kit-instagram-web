/**
 * Utilidades puras para la "Carta imprimible A4" (/admin/carta-pdf/[slug]).
 *
 * Funciones aisladas, sin acceso a DOM ni a red, para que el test unitario
 * en `__tests__/cartaPdfUtils.test.js` pueda cubrir el 100% sin montar
 * componentes React.
 *
 * Decisiones fijas:
 *   - Precio con "€" SIEMPRE (p.ej. "47 €", "12,50 €", "1.235 €").
 *   - Un vino sin `precio_botella` se OMITE del render del PDF, pero se
 *     devuelve en un array aparte `omitidos[]` para poder reportarlo al
 *     sommelier antes de imprimir.
 *   - El orden de secciones sigue `ordenTiposVino()` de winePresentation.js.
 *   - Dentro de cada sección: orden alfabético por `nombre` (estable).
 */

import { ordenTiposVino, etiquetasTipoVino } from './winePresentation.js'

const PLURALES = etiquetasTipoVino().plural

/**
 * Formatea un precio como "47 €" / "12,50 €" / "1.234 €" / "10.035 €".
 * Devuelve null si el valor no es un número finito positivo (no "— €").
 *
 * Reglas (convención es-ES del repo, ver app/lib/formatoEs.js):
 *   - 4 cifras SIN separador de miles.
 *   - 5+ cifras CON separador.
 *   - Si es entero → 0 decimales. Si tiene céntimos → 2 decimales con coma.
 *   - Espacio fino (U+00A0) antes del €.
 *
 * @param {number|string|null|undefined} valor
 * @returns {string|null}
 */
export function formatearPrecioPdf(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null

  const entero = Math.trunc(Math.abs(n))
  const useGrouping = entero >= 10000
  const esEntero = Number.isInteger(n)
  const decimales = esEntero ? 0 : 2

  const fmt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping,
  })
  return fmt.format(n) + ' €'
}

/**
 * Normaliza la lista de vinos y los agrupa por tipo en el orden canónico.
 *
 * @param {Array<object>} vinos  Lista plana (puede venir del API público
 *                               o del supabase client del dashboard).
 * @returns {{
 *   secciones: Array<{ tipo: string, label: string, vinos: Array<object> }>,
 *   total: number,
 *   omitidos: Array<object>,
 * }}
 */
export function agruparVinosPorSeccion(vinos) {
  const lista = Array.isArray(vinos) ? vinos : []
  const porTipo = new Map()
  const omitidos = []

  for (const vino of lista) {
    if (!vino || vino.activo === false) continue
    const precioBotella = toNumero(vino.precio_botella)
    if (!precioBotella) {
      omitidos.push(vino)
      continue
    }
    const tipo = String(vino.tipo || '').toLowerCase()
    if (!porTipo.has(tipo)) porTipo.set(tipo, [])
    porTipo.get(tipo).push(vino)
  }

  const orden = ordenTiposVino()
  const tiposConocidos = new Set(orden)
  const secciones = []
  let total = 0

  // 1) Tipos canónicos en orden
  for (const tipo of orden) {
    const items = porTipo.get(tipo)
    if (!items || items.length === 0) continue
    items.sort((a, b) => cmpNombre(a, b))
    secciones.push({ tipo, label: PLURALES[tipo] || tipo, vinos: items })
    total += items.length
  }

  // 2) Tipos extra (no canónicos) al final, orden alfabético por tipo
  const extras = [...porTipo.keys()].filter(t => !tiposConocidos.has(t)).sort()
  for (const tipo of extras) {
    const items = porTipo.get(tipo)
    if (!items || items.length === 0) continue
    items.sort((a, b) => cmpNombre(a, b))
    const label = tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : 'Otros'
    secciones.push({ tipo: tipo || 'otros', label, vinos: items })
    total += items.length
  }

  return { secciones, total, omitidos }
}

/**
 * Para la línea secundaria del vino: "uva · país, DO" sin vacíos ni dobles
 * separadores. Si no hay datos devuelve ''.
 *
 * Reglas:
 *   - uva(s) van primero (string, puede contener ", " para blends).
 *   - después "país, DO" o sólo DO si no se sabe país.
 *   - `region` del DB suele contener la DO ("D.O. Rioja", "Ribera del Duero"...).
 */
export function lineaOrigenVino(vino) {
  if (!vino) return ''
  const uva = String(vino.uva || '').trim()
  const region = String(vino.region || '').trim()
  const trozos = []
  if (uva) trozos.push(uva)
  if (region) trozos.push(region)
  return trozos.join(' · ')
}

/**
 * Luminancia relativa WCAG (0..1) de un color hex. Util para calcular contraste.
 * @param {string} hex  "#rrggbb" o "#rgb"
 * @returns {number|null}
 */
export function luminanciaRelativa(hex) {
  const rgb = parseHex(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Ratio de contraste WCAG entre dos colores. Devuelve número ≥ 1 (1 = idéntico,
 * 21 = negro sobre blanco). WCAG AA exige ≥ 4.5 para texto normal.
 */
export function ratioContraste(hexA, hexB) {
  const la = luminanciaRelativa(hexA)
  const lb = luminanciaRelativa(hexB)
  if (la === null || lb === null) return null
  const [L1, L2] = la >= lb ? [la, lb] : [lb, la]
  return (L1 + 0.05) / (L2 + 0.05)
}

/**
 * Decide un color de texto legible ("#111111" o "#f6f4f0") dado el color de
 * fondo. Se usa para calcular el color de texto del PDF automáticamente
 * sin persistirlo en la base. En caso de hex inválido devuelve "#111111".
 */
export function colorTextoSegunFondo(hexFondo, { claro = '#f6f4f0', oscuro = '#111111' } = {}) {
  const lum = luminanciaRelativa(hexFondo)
  if (lum === null) return oscuro
  // Umbral 0.5 funciona bien para la mayoría de paletas; ligero sesgo al
  // texto oscuro en grises medios para evitar ambigüedades.
  return lum > 0.5 ? oscuro : claro
}

// ── helpers privados ─────────────────────────────────────────────────────

function toNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function cmpNombre(a, b) {
  const na = String(a?.nombre || '').toLocaleLowerCase('es-ES')
  const nb = String(b?.nombre || '').toLocaleLowerCase('es-ES')
  return na.localeCompare(nb, 'es-ES')
}

function parseHex(hex) {
  if (typeof hex !== 'string') return null
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
