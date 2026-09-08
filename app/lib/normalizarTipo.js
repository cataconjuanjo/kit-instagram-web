// ---------------------------------------------------------------------------
// normalizarTipo — canonical wine type slugs and normalization functions
// ---------------------------------------------------------------------------

export const TIPOS_VINO = [
  'tinto', 'blanco', 'rosado', 'espumoso',
  'generoso', 'dulce', 'naranja', 'sin_alcohol', 'sidra',
]

// Normaliza un string: sin acentos, minúsculas, hyphens→espacio, espacios colapsados
function _norm(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quitar diacríticos
    .replace(/[-_]/g, ' ')             // guión/subrayado → espacio
    .replace(/\s+/g, ' ')              // colapsar espacios
    .trim()
}

// Mapa de sinónimos: valor normalizado → slug canónico.
// Notas sobre ambigüedades:
//   - moscatel: excluido (puede ser generoso o dulce según elaboración)
//   - vermut: aquí en generoso (elaborado sobre base de vino con maceración)
const SINONIMOS = {
  tinto: [
    'tinto', 'rojo', 'red',
    'tinto joven', 'crianza', 'reserva', 'gran reserva',
  ],
  blanco: [
    'blanco', 'white', 'blanc',
    'blanco barrica', 'blanco sin sulfitos',
  ],
  rosado: [
    'rosado', 'rose', 'clarete',
  ],
  espumoso: [
    'espumoso', 'cava', 'champagne', 'champan',
    'prosecco', 'cremant', 'corpinnat', 'franciacorta', 'sekt',
    'pet nat', 'petnat',
    'brut', 'brut nature', 'espumoso brut',
    'ancestral',
    'frizante', 'frizzante',
    'espumoso corpinnat',
    'espumoso rose', 'espumoso rosado',
  ],
  generoso: [
    'generoso', 'fino', 'manzanilla', 'amontillado', 'oloroso',
    'palo cortado', 'jerez', 'sherry',
    'vino de licor', 'vermut',
    'cream', 'medium',
    'oporto', 'porto', 'port',
    'vino de pasto',
  ],
  dulce: [
    'dulce', 'px', 'pedro ximenez',
    'vino dulce', 'naturalmente dulce',
    'vendimia tardia', 'late harvest',
  ],
  naranja: [
    'naranja', 'orange', 'orange wine', 'brisado', 'anfora',
    'orange oxidativo',
  ],
  sin_alcohol: [
    'sin alcohol', 'desalcoholizado', '0.0', '0,0', 'sin',
  ],
  sidra: [
    'sidra', 'cider', 'sagardo',
  ],
}

// AMBIGÜEDADES — no mapeadas automáticamente; el script de dry-run las detecta
// y las reporta aparte para revisión manual antes de cualquier migración.
export const TIPOS_AMBIGUOS = {
  moscatel: ['generoso', 'dulce'],
}

// Mapa invertido: string normalizado → slug canónico (construido en módulo load)
const _mapaInverso = new Map()
for (const [slug, sinonimos] of Object.entries(SINONIMOS)) {
  for (const sin of sinonimos) {
    _mapaInverso.set(_norm(sin), slug)
  }
}
// Los slugs canónicos se mapean a sí mismos
for (const slug of TIPOS_VINO) {
  if (!_mapaInverso.has(_norm(slug))) {
    _mapaInverso.set(_norm(slug), slug)
  }
}

/**
 * Normaliza un tipo de vino libre a su slug canónico.
 * Devuelve null si el valor no tiene mapeo conocido (a reportar como sin_mapeo).
 *
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizarTipo(raw) {
  if (!raw) return null
  return _mapaInverso.get(_norm(raw)) ?? null
}

// ---------------------------------------------------------------------------
// normalizarZona — estandariza el prefijo D.O. / I.G.P. / etc.
// ---------------------------------------------------------------------------

const PREFIJOS_ZONA = [
  // Más específico primero para evitar match parcial de DO sobre DOCa/DOP
  [/^D\.O\.Ca\.?\s+/i,       'D.O.Ca.'],
  [/^D\.?O\.?Ca\s+/i,        'D.O.Ca.'],
  [/^DOCa\s+/i,              'D.O.Ca.'],
  [/^D\.?O\.?P\.?\s+/i,      'D.O.P.'],
  [/^DOP\s+/i,               'D.O.P.'],
  [/^I\.G\.P\.?\s+/i,        'I.G.P.'],
  [/^I\.?G\.?P\s+/i,         'I.G.P.'],
  [/^IGP\s+/i,               'I.G.P.'],
  [/^Vino de la Tierra\s*/i, 'Vino de la Tierra'],
  [/^V\.T\.?\s+/i,           'Vino de la Tierra'],
  [/^VT\s+/i,                'Vino de la Tierra'],
  [/^D\.O\.\s+/i,            'D.O.'],
  [/^D\.O\s+/i,              'D.O.'],  // sin punto final: "D.O Jumilla"
  [/^DO\s+/i,                'D.O.'],  // sin puntos, con espacio (para no capturar DOCa)
]

/**
 * Normaliza el display de una zona/D.O.:
 *   - Estandariza el prefijo (DO, D.O → D.O.)
 *   - Title-case del nombre
 *   - Elimina dobles espacios
 *
 * Devuelve { display, slug } donde slug es el nombre sin prefijo, sin acentos,
 * en minúsculas con guiones (útil para agrupar en la carta).
 *
 * @param {string} raw
 * @returns {{ display: string, slug: string }}
 */
export function normalizarZona(raw) {
  if (!raw) return { display: '', slug: '' }

  const s = String(raw).trim()
  if (!s) return { display: '', slug: '' }

  let prefijo = ''
  let nombre = s

  for (const [re, norm] of PREFIJOS_ZONA) {
    const match = s.match(re)
    if (match) {
      prefijo = norm
      nombre = s.slice(match[0].length).trim()
      break
    }
  }

  // Title-case simple sobre el nombre de la zona
  nombre = nombre
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  const display = prefijo ? `${prefijo} ${nombre}` : nombre

  // slug: nombre sin prefijo, sin acentos, minúsculas, guiones
  const slug = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return { display, slug }
}
