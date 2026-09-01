/**
 * Partículas que permanecen en minúsculas (no son primera palabra).
 * Amplía con extraExcepcionesLower en las opciones si necesitas más.
 */
export const EXCEPCIONES_LOWER = new Set([
  // Español / portugués / catalán
  'de', 'del', 'de la', 'de los', 'de las',
  'dos', 'das', 'do', 'da', 'o', 'a',
  'y', 'e', 'i',
  // Francés
  'du', 'des', 'le', 'la', 'les', 'et', 'au', 'aux', 'en', 'sur',
  // Italiano / alemán / neerlandés
  'di', 'della', 'dei', 'degli', 'delle',
  'von', 'van', 'zu', 'und', 'des',
  'den', 'dem', 'beim',
])

/**
 * Tokens que permanecen siempre en MAYÚSCULAS (siglas y clasificaciones).
 * Amplía con extraExcepcionesUpper en las opciones si necesitas más.
 */
export const EXCEPCIONES_UPPER = new Set([
  'do', 'd.o.', 'd.o.ca.', 'doc', 'docg', 'dop', 'igt', 'igp',
  'aoc', 'aop', 'vdp', 'vdlt', 'vt', 'vcig', 'qpsr',
  's/do', 'ps', 'gt', 'nv', 's/c',
])

// Números romanos ≥2 chars (evita confundir I, V, X solos con iniciales)
const ROMANO = /^(M{0,4})(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i
const esRomano = tok => tok.length >= 2 && ROMANO.test(tok)

// Año vitícola 1900-2099
const esAnyo = tok => /^\d{4}$/.test(tok) && +tok >= 1900 && +tok <= 2099

// Sigla con puntos internos: D.O., I.G.P., D.O.C.A. …
const esSiglaPuntuada = tok =>
  tok.includes('.') && /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.]{1,}\.$/i.test(tok)

// Placeholder de texto entre comillas
const esPlaceholder = tok => /^\x00PH\d+\x00$/.test(tok)

/**
 * Capitaliza la primera letra real de un token.
 * Maneja prefijos no-letra: "(DOCE)" → "(Doce)", "Lagen)" → "Lagen)".
 */
function capitalize(word) {
  const m = word.match(/^([^a-záéíóúñüA-ZÁÉÍÓÚÑÜ]*)([a-záéíóúñüA-ZÁÉÍÓÚÑÜ])(.*)/is)
  if (!m) return word  // sin letras (dígitos puros, símbolos): intacto
  return m[1] + m[2].toUpperCase() + m[3].toLowerCase()
}

/**
 * Clave de excepción: elimina paréntesis/puntuación circundante,
 * conserva puntos y barras (necesarios para "d.o.", "s/do").
 */
function clave(tok) {
  return tok.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ\d./]/g, '').toLowerCase()
}

/**
 * Aplica Title Case a un nombre de vino con las siguientes reglas,
 * en orden de prioridad:
 *
 *   1. Texto entre comillas → preservar intacto
 *   2. Años 1900-2099       → sin cambio
 *   3. Siglas con puntos (D.O., I.G.P.) → MAYÚSCULAS
 *   4. EXCEPCIONES_UPPER    → MAYÚSCULAS (siempre, cualquier posición)
 *   5. Primera palabra real → capitalize
 *   6. EXCEPCIONES_LOWER    → minúsculas
 *   7. Números romanos ≥2   → MAYÚSCULAS
 *   8. Resto                → capitalize
 *
 * La tokenización parte también por guiones, aplicando las mismas reglas
 * a cada segmento: "CHÂTEAUNEUF-DU-PAPE" → "Châteauneuf-du-Pape".
 *
 * @param {string} nombre
 * @param {{ extraExcepcionesLower?: string[], extraExcepcionesUpper?: string[] }} opts
 */
export function titleCaseNombre(nombre, opts = {}) {
  if (!nombre) return ''

  const excLower = opts.extraExcepcionesLower
    ? new Set([...EXCEPCIONES_LOWER, ...opts.extraExcepcionesLower])
    : EXCEPCIONES_LOWER
  const excUpper = opts.extraExcepcionesUpper
    ? new Set([...EXCEPCIONES_UPPER, ...opts.extraExcepcionesUpper])
    : EXCEPCIONES_UPPER

  // Sustituir contenido entre comillas/guillemets por marcadores temporales
  const placeholders = []
  let s = nombre.trim().replace(/"[^"]*"|«[^»]*»/g, m => {
    placeholders.push(m)
    return `\x00PH${placeholders.length - 1}\x00`
  })

  // Tokenizar por espacios Y guiones, conservando ambos como delimitadores
  const tokens = s.split(/(\s+|-)/)
  let primeraPalabraReal = true

  const out = tokens.map(tok => {
    if (!tok) return tok                  // artefacto vacío de split
    if (/^\s+$/.test(tok)) return tok     // espacio: intacto
    if (tok === '-') return '-'           // guión: intacto

    if (esPlaceholder(tok)) {
      primeraPalabraReal = false
      return tok
    }

    const k = clave(tok)

    // Año: sin cambio (no consume primeraPalabraReal)
    if (esAnyo(tok)) return tok

    // Ordinal numeral (2nd, 1er, 3rd, 4th, 1º, 2ª, 1o, 2a): sufijo siempre minúscula
    const ordinalM = tok.match(/^(\d+)(er|nd|rd|th|[ºª]|[oa])$/i)
    if (ordinalM) return ordinalM[1] + ordinalM[2].toLowerCase()

    // Sigla puntuada: siempre mayúsculas
    if (esSiglaPuntuada(tok)) {
      primeraPalabraReal = false
      return tok.toUpperCase()
    }

    // Excepción upper: siempre mayúsculas
    if (excUpper.has(k)) {
      primeraPalabraReal = false
      return tok.toUpperCase()
    }

    // Primera palabra real: capitalize independientemente de excepciones lower
    if (primeraPalabraReal) {
      primeraPalabraReal = false
      return capitalize(tok)
    }

    // Partícula: minúsculas
    if (excLower.has(k)) return tok.toLowerCase()

    // Romano: mayúsculas
    if (esRomano(tok)) return tok.toUpperCase()

    return capitalize(tok)
  })

  // Reunir y restaurar texto entre comillas
  let result = out.join('')
  placeholders.forEach((ph, i) => {
    result = result.replace(`\x00PH${i}\x00`, ph)
  })
  return result
}
