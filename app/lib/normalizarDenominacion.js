// ---------------------------------------------------------------------------
// normalizarDenominacion — mapea zona libre → pais / comunidad_autonoma / do_igp
// Solo España en esta fase (v2). Las zonas no españolas se devuelven con
// confianza: 'fuera_de_ambito' sin asignar ningún campo.
// ---------------------------------------------------------------------------

// Prefijos administrativos que los proveedores anteponen al nombre de la DOP:
// "D.O. Rioja", "DOP Rioja", "D.O.Ca. Rioja", "DOCa Rioja", "IGP Castilla", etc.
// Requiere espacio tras el prefijo para no mutilar palabras como "Douro" o "Dominio".
// Se aplica al inicio de la clave normalizada (ya en lowercase, sin acentos).
const RE_PREFIJOS = /^(?:d\.?o\.?\s*(?:(?:ca|q|p)\.?)?\s+|(?:dop|doca|doq|doc)\s+|igp?\s+|i\.g\.p\.?\s+|v\.t\.?\s+|vinos?\s+de\s+la\s+tierra\s+(?:de\s+)?)/

/**
 * Elimina acentos de una cadena mediante descomposición NFD.
 */
function sinAcentos(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Genera la clave de búsqueda: sin acentos, lowercase, sin prefijos admin.
 * Se aplica tanto al campo zona del catálogo como a nombre_norm de la tabla ref.
 *
 * Ejemplos:
 *   "D.O.Ca. Rioja"        → "rioja"
 *   "D.O. Rías Baixas"     → "rias baixas"
 *   "Vino de la Tierra de Castilla" → "castilla"
 *   "IGP Castilla y León"  → "castilla y leon"
 */
export function claveNorm(str) {
  if (!str) return ''
  let s = sinAcentos(str).toLowerCase().trim()
  // Quitar prefijos repetidos (ej. "D.O. D.O. Rioja" → "rioja")
  let prev
  do {
    prev = s
    s = s.replace(RE_PREFIJOS, '').trim()
  } while (s !== prev)
  return s.replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Variantes del nombre de España usadas por distintos proveedores
// ---------------------------------------------------------------------------
const PAIS_ES_NORM = new Set(['espana', 'spain', 'espagne', 'espanya', 'es', 'spain '])

// ---------------------------------------------------------------------------
// Mapa CCAA → nombre canónico
// (Solo CCAAs que NO coinciden con ningún nombre de DOP/IGP)
// Nota: "Rioja", "Navarra", "Valencia", "Murcia", "Castilla y León", "Castilla",
// "Extremadura" son también DOPs/IGPs y se resuelven antes (exacto) sin llegar aquí.
// ---------------------------------------------------------------------------
const CCAA_CANON = {
  'andalucia': 'Andalucía',
  'aragon': 'Aragón',
  'asturias': 'Principado de Asturias',
  'principado de asturias': 'Principado de Asturias',
  'baleares': 'Islas Baleares',
  'islas baleares': 'Islas Baleares',
  'illes balears': 'Islas Baleares',
  'canarias': 'Canarias',
  'islas canarias': 'Canarias',
  'cantabria': 'Cantabria',
  'castilla y leon': 'Castilla y León',       // también IGP → resuelto por exacto
  'castilla leon': 'Castilla y León',
  'castilla la mancha': 'Castilla-La Mancha',
  'cataluna': 'Cataluña',
  'catalonia': 'Cataluña',
  'catalunya': 'Cataluña',
  'galicia': 'Galicia',
  'la rioja': 'La Rioja',
  'comunidad de madrid': 'Comunidad de Madrid',
  'region de murcia': 'Región de Murcia',
  'comunidad foral de navarra': 'Comunidad Foral de Navarra',
  'pais vasco': 'País Vasco',
  'euskadi': 'País Vasco',
  'comunidad valenciana': 'Comunidad Valenciana',
  'extremadura': 'Extremadura',               // también IGP → resuelto por exacto
}

// ---------------------------------------------------------------------------
// Países no españoles para identificar zonas fuera del alcance de esta fase.
// Incluye países, regiones vinícolas extranjeras y demonyms comunes.
// Comprobado ANTES del bloque de contención para evitar falsos positivos
// (ej: "usa" dentro de "valdepusa", "rsa" dentro de un nombre de bodega).
// ---------------------------------------------------------------------------
const PAISES_NO_ES = new Set([
  // Países (varios idiomas y siglas)
  'francia', 'france', 'frankreich',
  'italia', 'italy', 'italien',
  'alemania', 'germany', 'deutschland',
  'portugal',
  'estados unidos', 'usa', 'us', 'united states', 'eeuu',
  'rsa', 'south africa', 'sudafrica',
  'argentina', 'chile', 'uruguay', 'peru',
  'australia', 'nueva zelanda', 'new zealand',
  'austria',
  'hungria', 'hungary',
  'grecia', 'greece',
  'libano', 'lebanon',
  'japon', 'japan',
  'rumania', 'romania',
  'eslovenia', 'slovenia',
  'croacia', 'croatia',
  'bulgaria',
  'georgia',
  'marruecos', 'morocco',
  'sudafrica', 'afrique du sud',
  // Regiones francesas
  'borgoña', 'borgona', 'bourgogne', 'burgundy',
  'burdeos', 'bordeaux',
  'champagne',
  'alsacia', 'alsace',
  'rodano', 'rhone',
  'loira', 'loire',
  'languedoc', 'roussillon',
  'provenza', 'provence',
  'beaujolais',
  'jura',
  'savoie', 'saboya',
  'sudouest', 'sud-ouest',
  // Regiones italianas (todas las 20 regioni — fase 2)
  'piemonte', 'piamonte', 'piedmont',
  'lombardia', 'lombardy',
  'veneto', 'venetia',
  'toscana', 'tuscany',
  'sicilia', 'sicily',
  'campania',
  'puglia', 'apulia',
  'sardegna', 'sardena', 'sardinia', 'cerdena',
  'emilia romagna', 'emilia-romagna',
  'friuli venezia giulia', 'friuli',
  'trentino alto adige', 'trentino', 'alto adige', 'sudtirol',
  'abruzzo',
  'umbria',
  'lazio', 'lacio',
  "valle d'aosta", 'valle daosta', 'val d aoste',
  'liguria',
  'marche',
  'molise',
  'basilicata',
  'calabria',
  // Regiones portuguesas
  'alentejo',
  'vinho verde',
  'douro',
  'dao',
  'Lisboa', 'lisboa',
  'setubal',
  'algarve',
  // Regiones alemanas
  'mosel', 'mosela',
  'pfalz', 'palatinado',
  'rheingau',
  'rheinhessen',
  'franken',
  'baden',
  'wurttemberg',
  'nahe',
  'ahr',
  // Regiones de otros países
  'barossa',
  'napa valley', 'napa',
  'sonoma',
  'mendoza',
  'maipo', 'colchagua', 'casablanca', 'maule',
  'tokaj', 'tokaji',
  'wachau',
  'burgenland',
  'prioris', // no confundir con Priorat (España)
  // Categorías no geográficas frecuentes en campo zona
  'licores y aguardientes', 'licores', 'destilados', 'aguardientes',
  'espumoso', 'espumosos',
  'otros vinos',  // etiqueta de proveedor, no zona
])

// ---------------------------------------------------------------------------
// Menciones sectoriales conocidas: no son DOP oficiales pero tampoco son basura.
// Se etiquetan como 'caso_especial' para revisión manual separada.
// ---------------------------------------------------------------------------
const CASOS_ESPECIALES_SECTOR = new Set([
  'corpinnat',
  'rioja de parcela',
])

// ---------------------------------------------------------------------------
// construirMapaDenominaciones
// Construye el Map de lookup a partir de los registros de ref_denominaciones_es.
// ---------------------------------------------------------------------------
export function construirMapaDenominaciones(refs) {
  const mapa = new Map()
  for (const r of refs) {
    if (r.nombre_norm && !mapa.has(r.nombre_norm)) {
      mapa.set(r.nombre_norm, {
        pais: r.pais || 'España',
        comunidad_autonoma: r.comunidad_autonoma,
        do_igp: r.nombre_oficial,
        tipo_reg: r.tipo,
      })
    }
  }
  return mapa
}

// ---------------------------------------------------------------------------
// resolverZona — algoritmo principal de normalización
// ---------------------------------------------------------------------------

/**
 * @param {string} zona - valor de la columna zona del catálogo
 * @param {Map}    mapa - resultado de construirMapaDenominaciones()
 * @returns {{
 *   pais: string|null,
 *   comunidad_autonoma: string|null,
 *   do_igp: string|null,
 *   confianza: 'exacto'|'contencion'|'ccaa_sin_do'|'pais_sin_ccaa'|
 *              'fuera_de_ambito'|'caso_especial'|'no_es_zona'|'sin_resolver',
 *   motivo: string,
 *   zona_revisar: boolean
 * }}
 */
export function resolverZona(zona, mapa) {
  if (!zona || !zona.trim()) {
    return _out(null, null, null, 'sin_resolver', 'zona vacía', false)
  }

  const z = zona.trim()

  // ── 1. ¿Es texto libre / no es zona geográfica? ───────────────────────────
  //    Señales: verbo de elaboración, longitud extrema, puntuación interna + verbo
  if (
    z.length > 70 ||
    /\b(elaborado|producido|criado|cultivado|envejecido|seleccionado|procedente)\b/i.test(z) ||
    /[,;]\s*[a-záéíóúñü]/i.test(z)
  ) {
    return _out(null, null, null, 'no_es_zona', `texto libre no geográfico: "${z}"`, true)
  }

  const clave = claveNorm(z)

  // ── 2. Caso especial del sector ───────────────────────────────────────────
  if (CASOS_ESPECIALES_SECTOR.has(clave)) {
    return _out(null, null, null, 'caso_especial', `mención sectorial no DOP: "${z}"`, true)
  }

  // ── 3. Match exacto contra tabla DOP/IGP ─────────────────────────────────
  if (mapa.has(clave)) {
    const r = mapa.get(clave)
    return _out(r.pais, r.comunidad_autonoma, r.do_igp, 'exacto', `match exacto → ${r.do_igp}`, false)
  }

  // ── 4. ¿Es "España" o variante del nombre del país? ─────────────────────
  if (PAIS_ES_NORM.has(clave)) {
    return _out('España', null, null, 'pais_sin_ccaa', 'solo país, sin DOP/CCAA', false)
  }

  // ── 5. ¿Zona fuera del alcance de España (otro país / región extranjera)? ──
  //    Comprobado ANTES de contención para evitar falsos positivos con códigos
  //    cortos como "usa" ⊂ "valdepusa", "rsa" ⊂ nombres de bodega, etc.
  if (PAISES_NO_ES.has(clave)) {
    return _out(null, null, null, 'fuera_de_ambito', `zona no española: "${z}"`, false)
  }

  // ── 6. Intentar split por separadores (ej. "Andalucía - Manzanilla") ─────
  //    Útil para filas que el v1 no separó (sospechaZona = true).
  const partesSep = z.split(/\s*(?:·|–|—|\/)\s*|\s+-\s+/).map(p => p.trim()).filter(Boolean)
  if (partesSep.length > 1) {
    for (const parte of partesSep) {
      const cp = claveNorm(parte)
      if (mapa.has(cp)) {
        const r = mapa.get(cp)
        return _out(r.pais, r.comunidad_autonoma, r.do_igp, 'exacto', `match exacto en parte "${parte}" de zona combinada`, false)
      }
      if (PAIS_ES_NORM.has(cp)) continue // ignorar la parte "España" y seguir buscando DO
    }
    // Segunda pasada: containment sobre cada parte
    for (const parte of partesSep) {
      const cp = claveNorm(parte)
      const hits = _contencion(cp, mapa)
      if (hits.length === 1) {
        const r = hits[0]
        return _out(r.pais, r.comunidad_autonoma, r.do_igp, 'contencion',
          `contención única "${r.do_igp}" en parte "${parte}" de zona combinada`, false)
      }
    }
  }

  // ── 7. ¿Es una CCAA conocida? ────────────────────────────────────────────
  if (CCAA_CANON[clave]) {
    return _out('España', CCAA_CANON[clave], null, 'ccaa_sin_do',
      `CCAA sin DOP/IGP específica: ${CCAA_CANON[clave]}`, false)
  }

  // ── 8. Match por contención (zona contra todas las claves DOP) ────────────
  const hitsGlobal = _contencion(clave, mapa)
  if (hitsGlobal.length === 1) {
    const r = hitsGlobal[0]
    return _out(r.pais, r.comunidad_autonoma, r.do_igp, 'contencion',
      `contención única → ${r.do_igp}`, false)
  }
  if (hitsGlobal.length > 1) {
    // Ambiguo: elige el match más específico (clave más larga) y lo marca para revisión
    const sorted = hitsGlobal.slice().sort((a, b) => b.clave.length - a.clave.length)
    const elegido = sorted[0]
    const alternativas = sorted.slice(1).map(x => x.do_igp).join(', ')
    return _out(elegido.pais, elegido.comunidad_autonoma, elegido.do_igp, 'contencion',
      `contención ambigua — elegido "${elegido.do_igp}"; alternativas: ${alternativas}`, true)
  }

  // ── 9. Sin resolver ───────────────────────────────────────────────────────
  return _out(null, null, null, 'sin_resolver', `sin coincidencia para "${z}"`, true)
}

// Busca hits por contención entre clave y las claves del mapa
function _contencion(clave, mapa) {
  const hits = []
  for (const [k, v] of mapa.entries()) {
    if (clave.length >= 4 && (clave.includes(k) || k.includes(clave))) {
      hits.push({ clave: k, ...v })
    }
  }
  return hits
}

function _out(pais, comunidad_autonoma, do_igp, confianza, motivo, zona_revisar) {
  return { pais, comunidad_autonoma, do_igp, confianza, motivo, zona_revisar }
}
