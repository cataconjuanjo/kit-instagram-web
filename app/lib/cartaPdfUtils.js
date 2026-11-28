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
import { t } from '../components/cartaImprimible/i18n/index.js'

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
export function formatearPrecioPdf(valor, opts = {}) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null

  const { conEuro = true } = opts
  const entero = Math.trunc(Math.abs(n))
  const useGrouping = entero >= 10000
  const esEntero = Number.isInteger(n)
  const decimales = esEntero ? 0 : 2

  const fmt = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping,
  })
  if (!conEuro) return fmt.format(n)
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
 * Para la línea secundaria del vino: "uva(s) · país, DO" por defecto, con
 * mayúscula inicial (el CSS aplica `::first-letter { text-transform:
 * uppercase }` sobre el contenedor). Si no hay datos devuelve ''.
 *
 * Reglas:
 *   - uva(s) van primero (string, puede contener ", " para blends).
 *   - después `region` (DB suele guardar "D.O. Rioja", "Francia", etc.).
 *   - bodega y añada se omiten por defecto (ruido en carta de cliente);
 *     el sommelier puede activarlas en el panel (toggle, default off).
 *
 * @param {object} vino
 * @param {object} [opts]
 * @param {boolean} [opts.incluirBodega=false]
 * @param {boolean} [opts.incluirAnada=false]
 */
export function lineaOrigenVino(vino, opts = {}) {
  if (!vino) return ''
  const { incluirBodega = false, incluirAnada = false } = opts
  const uva = String(vino.uva || '').trim()
  const region = String(vino.region || '').trim()
  const bodega = String(vino.bodega || '').trim()
  const anada = String(vino.anada || '').trim()
  const trozos = []
  if (incluirBodega && bodega) trozos.push(bodega)
  if (uva) trozos.push(uva)
  if (region) trozos.push(region)
  if (incluirAnada && anada) trozos.push(anada)
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

// ─────────────────────────────────────────────────────────────────────────
// CARTA PDF v2 — normalización de opciones + ordenaciones
// ─────────────────────────────────────────────────────────────────────────

/**
 * Catálogo de fuentes disponibles (id → metadata). El componente
 * CartaImprimible usa el `varName` como fallback cuando no se pasa un
 * fuente específico. El `factorAncho` es un multiplicador suave del
 * font-size para fuentes anchas que podrían romper la paginación
 * (<1 encoge, >1 agranda; 1 = neutro).
 */
export const CATALOGO_FUENTES_ID = new Set([
  // Serif clásicas
  'eb-garamond', 'cormorant-garamond', 'playfair-display', 'libre-baskerville',
  'lora', 'spectral', 'crimson-pro', 'libre-caslon-text', 'bodoni-moda',
  'dm-serif-display', 'cinzel',
  // Sans
  'inter', 'montserrat', 'raleway', 'josefin-sans', 'lato', 'work-sans',
  'poppins', 'oswald',
  // Mono
  'jetbrains-mono', 'ibm-plex-mono', 'space-mono', 'courier-prime',
  // Manuscrita (idónea solo para título)
  'caveat',
])

export const CATALOGO_POSICIONES_LOGO = new Set([
  'cabecera-izq', 'cabecera-centro', 'cabecera-der',
  'pie-izq', 'pie-centro', 'pie-der',
  'marca-agua',
])

export const CATALOGO_POSICIONES_QR = new Set([
  'pie-izq', 'pie-centro', 'pie-der', 'cabecera-der',
])

/**
 * Decide si añadir la nota "Precios en euros, IVA incluido" al pie:
 * SOLO cuando el formato es sin_euro, nota_euros está activada y el
 * texto de pie del restaurante no menciona ya "IVA" (case-insensitive,
 * detecta también "I.V.A.").
 *
 * @returns {string|null} la nota a añadir o null si no procede.
 */
export function notaIvaParaPie({ precio_formato, nota_euros, carta_pie_texto }) {
  if (precio_formato !== 'sin_euro') return null
  if (nota_euros === false) return null
  const pie = String(carta_pie_texto || '')
  // Detecta "iva" (palabra) o "i.v.a." con los puntos opcionales.
  // Normalizamos puntos → letra para que `\b` reconozca la palabra.
  const normalizado = pie.replace(/i\.?v\.?a\.?/gi, 'iva')
  if (/\biva\b/i.test(normalizado)) return null
  return t('pdf.nota.iva')
}

export const COPA_MODOS = new Set(['no', 'junto', 'seccion', 'ambos'])
export const ORDEN_VINOS = new Set(['alfabetico', 'region', 'precio_asc', 'uva', 'anada'])
export const ORDEN_SECUNDARIO = new Set(['precio_asc', 'alfabetico'])
export const PRECIO_FORMATOS = new Set(['con_euro', 'sin_euro'])
export const DENSIDADES = new Set(['auto', 'normal', 'compacto', 'compacto-extra'])

/**
 * Devuelve el objeto de opciones v2 con TODOS los campos rellenados con
 * defaults equivalentes al comportamiento v1.
 *
 * Reglas de compatibilidad (regla de oro: {} debe producir el mismo PDF
 * que antes de la migración):
 *   - fuente_titulo  = 'actual' (serif actual, que mapea a eb-garamond)
 *   - fuente_cuerpo  = 'actual' (mono actual, jetbrains-mono)
 *   - logos          = []       (se infiere logo_url en cabecera-izq
 *                                desde el componente si está vacío)
 *   - qr             = { activo: true,  posicion: 'pie-der',
 *                        tamano_mm: 18, texto: 'Maridajes…', color_auto: true }
 *                      (brief marca "default ON" para el QR)
 *   - credito        = true     (brief marca "default ON")
 *   - copa_modo      = 'no'     (equivalente al toggle actual "mostrar copa" = false)
 *   - orden_vinos    = 'alfabetico'
 *   - orden_secundario = 'precio_asc'
 *   - subtitulos_region = false
 *   - precio_formato = 'con_euro'
 *   - nota_euros     = true     (solo aplica si precio_formato='sin_euro')
 *   - densidad_forzada = 'auto' (activa compacto > 60 vinos)
 *
 * @param {unknown} raw  Valor de la columna `carta_pdf_opciones` (jsonb)
 *                       o fragmento recibido por la API admin.
 */
export function normalizarOpcionesCartaPdf(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {}

  function enumConDefault(valor, setValido, def) {
    const s = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
    return setValido.has(s) ? s : def
  }

  function fuenteValida(valor, def) {
    if (valor === 'actual') return 'actual'
    const s = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
    return CATALOGO_FUENTES_ID.has(s) ? s : def
  }

  function boolDefault(valor, def) {
    if (typeof valor === 'boolean') return valor
    if (valor === 'true') return true
    if (valor === 'false') return false
    return def
  }

  function numEntre(valor, min, max, def) {
    const n = Number(valor)
    if (!Number.isFinite(n)) return def
    return Math.min(max, Math.max(min, Math.round(n)))
  }

  function urlSegura(valor) {
    if (typeof valor !== 'string') return null
    const s = valor.trim().slice(0, 2048)
    if (!s) return null
    if (s.startsWith('/') && !s.startsWith('//')) return s
    try {
      const u = new URL(s)
      return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null
    } catch { return null }
  }

  // ── logos ───────────────────────────────────────────────────────────
  // Filtramos primero, luego truncamos a 4 — si hiciéramos slice antes,
  // una entrada inválida en las primeras 4 posiciones nos quitaría un
  // logo válido que viene en la posición 5.
  const logosRaw = Array.isArray(r.logos) ? r.logos : []
  const logos = logosRaw.map(l => {
    if (!l || typeof l !== 'object') return null
    const url = urlSegura(l.url)
    if (!url) return null
    return {
      url,
      posicion: enumConDefault(l.posicion, CATALOGO_POSICIONES_LOGO, 'cabecera-izq'),
      tamano_mm: numEntre(l.tamano_mm, 8, 60, 14),
      opacidad: l.posicion === 'marca-agua'
        ? numEntre(l.opacidad, 5, 20, 8)
        : 100,
    }
  }).filter(Boolean).slice(0, 4)

  // ── qr ──────────────────────────────────────────────────────────────
  const qrRaw = (r.qr && typeof r.qr === 'object') ? r.qr : {}
  const qr = {
    activo: boolDefault(qrRaw.activo, true),
    // Default 'cabecera-der' + 16mm: el QR vive en el hero (fuera del
    // multicol) por lo que NO consume altura del cuerpo. Con defaults
    // + Casa Marisma 50 vinos el PDF sigue en 2 páginas (REGLA DE ORO).
    // Las posiciones de pie siguen disponibles; el admin avisa de que
    // en el pie pueden añadir una página en cartas largas.
    posicion: enumConDefault(qrRaw.posicion, CATALOGO_POSICIONES_QR, 'cabecera-der'),
    tamano_mm: numEntre(qrRaw.tamano_mm, 10, 40, 16),
    // Texto por defecto corto para entrar en 1 línea bajo el QR en el
    // hero (~70 mm). El brief permite 2 líneas solo si el texto
    // personalizado excede ese ancho; esa decisión se toma en CSS con
    // max-width y line-clamp.
    texto: typeof qrRaw.texto === 'string'
      ? qrRaw.texto.trim().slice(0, 140)
      : t('pdf.qr.cta_default'),
    color_auto: boolDefault(qrRaw.color_auto, true),
  }

  return {
    fuente_titulo: fuenteValida(r.fuente_titulo, 'actual'),
    fuente_cuerpo: fuenteValida(r.fuente_cuerpo, 'actual'),
    logos,
    qr,
    // Crédito "Carta Viva × @cataconjuanjo" NO es desactivable: es la
    // contraprestación comercial por el uso de la herramienta. Se fuerza
    // true aquí, se ignora el valor guardado. El panel admin no muestra
    // el toggle y el PATCH /api/admin/carta-pdf-config descarta la clave.
    credito: true,
    copa_modo: enumConDefault(r.copa_modo, COPA_MODOS, 'no'),
    orden_vinos: enumConDefault(r.orden_vinos, ORDEN_VINOS, 'alfabetico'),
    orden_secundario: enumConDefault(r.orden_secundario, ORDEN_SECUNDARIO, 'precio_asc'),
    subtitulos_region: boolDefault(r.subtitulos_region, false),
    precio_formato: enumConDefault(r.precio_formato, PRECIO_FORMATOS, 'con_euro'),
    nota_euros: boolDefault(r.nota_euros, true),
    densidad_forzada: enumConDefault(r.densidad_forzada, DENSIDADES, 'auto'),
  }
}

// ── Orden editorial por regiones ────────────────────────────────────────
// Lista ordenada: menor índice = antes en la carta. Las claves son
// patrones (sin acentos, minúsculas) que coinciden como substring de
// vino.region.
const REGIONES_EDITORIAL = [
  // España norte
  'rioja', 'rias baixas', 'ribeiro', 'ribeira sacra', 'bierzo', 'valdeorras',
  'navarra', 'somontano', 'txakol',
  // España centro-norte
  'ribera del duero', 'toro', 'rueda', 'cigales', 'tierra de leon',
  // España mediterraneo
  'priorat', 'montsant', 'penedes', 'cava', 'tarragona', 'terra alta',
  'valencia', 'alicante', 'jumilla', 'yecla',
  // España sur
  'malaga', 'sierras de malaga', 'jerez', 'manzanilla', 'montilla', 'condado',
  // España otros
  'canarias', 'mallorca',
  'la mancha', 'extremadura',
  // Francia
  'champagne', 'borgo', 'burde', 'bordeaux', 'bourgogne',
  'rodano', 'rhône', 'rhone', 'loira', 'loire', 'alsacia', 'languedoc',
  // Italia / Portugal / otros
  'piamonte', 'piemonte', 'toscana', 'veneto', 'sicilia',
  'douro', 'oporto', 'vinho verde',
  'alemania', 'austria', 'nuevo mundo', 'chile', 'argentina', 'california',
  'australia', 'sudafrica',
]

function normalizarTexto(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function indiceRegionEditorial(regionTexto) {
  const t = normalizarTexto(regionTexto)
  if (!t) return 9999
  for (let i = 0; i < REGIONES_EDITORIAL.length; i++) {
    if (t.includes(REGIONES_EDITORIAL[i])) return i
  }
  return 5000 // después de las conocidas pero antes de "otros"
}

/**
 * Agrupa vinos de una sección por región, ordenadas según índice
 * editorial. Dentro del grupo: `ordenSecundario` (precio_asc|alfabetico).
 * Vinos sin región → grupo "Otros" al final.
 *
 * @returns {Array<{region:string, vinos:Array}>}
 */
export function agruparPorRegion(vinos, ordenSecundario = 'precio_asc') {
  const porRegion = new Map()
  for (const v of vinos) {
    const key = (v.region && String(v.region).trim()) || 'Otros'
    if (!porRegion.has(key)) porRegion.set(key, [])
    porRegion.get(key).push(v)
  }
  const grupos = [...porRegion.entries()]
    .map(([region, items]) => ({ region, items, idx: indiceRegionEditorial(region) }))
    .sort((a, b) => a.idx - b.idx || a.region.localeCompare(b.region, 'es-ES'))

  const cmpSecundario = (a, b) => {
    if (ordenSecundario === 'precio_asc') {
      const pa = Number(a.precio_botella) || Infinity
      const pb = Number(b.precio_botella) || Infinity
      if (pa !== pb) return pa - pb
    }
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es-ES')
  }
  for (const g of grupos) g.items.sort(cmpSecundario)
  return grupos.map(g => ({ region: g.region, vinos: g.items }))
}

/**
 * Ordena vinos dentro de una sección según el modo editorial.
 * Devuelve: lista plana ordenada + (opcional) grupos para el renderer.
 */
export function ordenarVinosSeccion(vinos, orden = 'alfabetico', ordenSec = 'precio_asc') {
  const arr = [...vinos]
  if (orden === 'region') {
    // El renderer puede querer los grupos para pintar sub-cabeceras.
    const grupos = agruparPorRegion(arr, ordenSec)
    return { lista: grupos.flatMap(g => g.vinos), grupos }
  }
  if (orden === 'precio_asc') {
    arr.sort((a, b) => (Number(a.precio_botella) || Infinity) - (Number(b.precio_botella) || Infinity))
    return { lista: arr, grupos: null }
  }
  if (orden === 'uva') {
    arr.sort((a, b) => String(a.uva || 'zz').localeCompare(String(b.uva || 'zz'), 'es-ES')
      || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es-ES'))
    return { lista: arr, grupos: null }
  }
  if (orden === 'anada') {
    arr.sort((a, b) => {
      const aa = String(a.anada || '0').replace(/\D/g, '')
      const bb = String(b.anada || '0').replace(/\D/g, '')
      return (Number(bb) || 0) - (Number(aa) || 0) // añadas nuevas primero
    })
    return { lista: arr, grupos: null }
  }
  arr.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es-ES'))
  return { lista: arr, grupos: null }
}

/**
 * Para el modo "seccion" de copa, extrae una sección virtual con los
 * vinos que tengan precio_copa > 0. En modo "seccion" el vino aparece
 * SOLO en POR COPA (quita de su sección original). En "ambos" aparece
 * en POR COPA Y en su sección (con precio botella).
 *
 * Devuelve { seccionCopa, idsExcluir } donde idsExcluir se descuenta del
 * listado normal según el modo.
 */
export function extraerSeccionCopa(vinos, copaModo) {
  if (copaModo !== 'seccion' && copaModo !== 'ambos') {
    return { seccionCopa: null, idsExcluir: new Set() }
  }
  const conCopa = vinos.filter(v => Number(v.precio_copa) > 0)
  if (conCopa.length === 0) return { seccionCopa: null, idsExcluir: new Set() }

  const ordenados = [...conCopa].sort((a, b) => {
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es-ES')
  })
  const seccionCopa = { tipo: 'copa', label: t('pdf.seccion.copa'), vinos: ordenados }
  const idsExcluir = copaModo === 'seccion' ? new Set(ordenados.map(v => v.id)) : new Set()
  return { seccionCopa, idsExcluir }
}

