/**
 * Tests de normalización de región y tipo de vino.
 * Reproduce los bugs de comparación que causaban huecos fantasma:
 *   - "La Rioja" vs "Rioja"   (artículo en catálogo vs carta)
 *   - "Tintos" vs "tinto"     (plural en catálogo vs singular en carta)
 *   - "Tinto" vs "tinto"      (mayúscula en carta vs minúscula en catálogo)
 *
 * Ejecutar: node scripts/test-wine-normalize.mjs
 */
import assert from 'assert/strict'
import { normWine, normWineRegion, normWineTipo } from '../app/lib/textNormalize.js'

let passed = 0
let failed = 0

function ok(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ FALLO: ${label}`)
    failed++
  }
}

function eq(actual, expected, label) {
  const cond = actual === expected
  if (cond) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.error(`  ✗ FALLO: ${label}`)
    console.error(`      esperado: ${JSON.stringify(expected)}`)
    console.error(`      obtenido: ${JSON.stringify(actual)}`)
    failed++
  }
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 1 — normWine: base (regresión, no deben romperse)
// ════════════════════════════════════════════════════════════════
console.log('\nnormWine — casos base\n')

eq(normWine('Rioja'),       'rioja',       'Rioja → rioja')
eq(normWine('RIOJA'),       'rioja',       'RIOJA → rioja (case)')
eq(normWine('Rías Baixas'), 'rias baixas', 'Rías Baixas → rias baixas (tilde)')
eq(normWine('D.O. Bierzo'), 'bierzo',      'D.O. Bierzo → bierzo (prefijo D.O.)')
eq(normWine('D.O.C. Rioja'), 'rioja',       'D.O.C. Rioja → rioja')
eq(normWine('D.O.Ca. Rioja'),'rioja',      'D.O.Ca. Rioja → rioja (Calificada)')
eq(normWine('  Rioja  '),   'rioja',       'trim aplicado')
eq(normWine(''),            '',            'cadena vacía → vacía')
eq(normWine(null),          '',            'null → vacía')
eq(normWine(undefined),     '',            'undefined → vacía')

// ════════════════════════════════════════════════════════════════
// BLOQUE 2 — normWineRegion: artículos iniciales
// Bug original: normWine("La Rioja") → "la rioja" ≠ normWine("Rioja") → "rioja"
// ════════════════════════════════════════════════════════════════
console.log('\nnormWineRegion — artículos iniciales\n')

eq(normWineRegion('La Rioja'),   'rioja',       'La Rioja → rioja')
eq(normWineRegion('Rioja'),      'rioja',       'Rioja → rioja (sin artículo, igual resultado)')
ok(
  normWineRegion('La Rioja') === normWineRegion('Rioja'),
  '"La Rioja" y "Rioja" producen el mismo token — gap falso eliminado'
)

eq(normWineRegion('El Bierzo'),  'bierzo',      'El Bierzo → bierzo')
eq(normWineRegion('Bierzo'),     'bierzo',      'Bierzo → bierzo (sin artículo)')
ok(
  normWineRegion('El Bierzo') === normWineRegion('Bierzo'),
  '"El Bierzo" y "Bierzo" producen el mismo token'
)

eq(normWineRegion('Las Merindades'), 'merindades', 'Las Merindades → merindades')
eq(normWineRegion('Los Barrios'),    'barrios',    'Los Barrios → barrios')

// Regiones sin artículo no deben cambiar
eq(normWineRegion('Rías Baixas'),    'rias baixas',    'Rías Baixas sin tocar')
eq(normWineRegion('Ribera del Duero'), 'ribera del duero', 'Ribera del Duero sin tocar')
eq(normWineRegion('D.O. Bierzo'),    'bierzo',          'D.O. Bierzo → bierzo (prefijo + artículo)')
eq(normWineRegion('D.O.Ca. La Rioja'), 'rioja',         'D.O.Ca. La Rioja → rioja (Calificada + artículo)')

// "de/del" al inicio también se eliminan
eq(normWineRegion('de la Tierra de Castilla'), 'la tierra de castilla', '"de" inicial eliminado')

// ════════════════════════════════════════════════════════════════
// BLOQUE 3 — normWineTipo: plurales y casing
// Bug original: normWine("Tintos") → "tintos" ≠ normWine("tinto") → "tinto"
// ════════════════════════════════════════════════════════════════
console.log('\nnormWineTipo — plural y casing\n')

eq(normWineTipo('tinto'),    'tinto',    'tinto → tinto (sin cambio)')
eq(normWineTipo('Tinto'),    'tinto',    'Tinto → tinto (mayúscula)')
eq(normWineTipo('Tintos'),   'tinto',    'Tintos → tinto (plural eliminado)')
eq(normWineTipo('TINTOS'),   'tinto',    'TINTOS → tinto (mayúsculas + plural)')
ok(
  normWineTipo('Tintos') === normWineTipo('tinto'),
  '"Tintos" y "tinto" producen el mismo token — gap falso eliminado'
)

eq(normWineTipo('blanco'),   'blanco',   'blanco → blanco')
eq(normWineTipo('Blancos'),  'blanco',   'Blancos → blanco')
ok(
  normWineTipo('Blancos') === normWineTipo('blanco'),
  '"Blancos" y "blanco" producen el mismo token'
)

eq(normWineTipo('rosado'),   'rosado',   'rosado → rosado')
eq(normWineTipo('Rosados'),  'rosado',   'Rosados → rosado')

eq(normWineTipo('espumoso'),  'espumoso',  'espumoso → espumoso (no altera singulares en -oso)')
eq(normWineTipo('espumosos'), 'espumoso',  'espumosos → espumoso')
eq(normWineTipo('Espumosos'), 'espumoso',  'Espumosos → espumoso')

eq(normWineTipo('generoso'),  'generoso',  'generoso → generoso')
eq(normWineTipo('Generosos'), 'generoso',  'Generosos → generoso')

eq(normWineTipo('dulce'),     'dulce',     'dulce → dulce (no termina en -os, sin cambio)')
eq(normWineTipo('naranja'),   'naranja',   'naranja → naranja')
eq(normWineTipo('sin_alcohol'), 'sin_alcohol', 'sin_alcohol → sin_alcohol')

// ════════════════════════════════════════════════════════════════
// BLOQUE 4 — Flujo gapAnalisis: simulación del cálculo de huecos
// Reproduce el caso real: catálogo con "La Rioja", carta con "Rioja"
// ════════════════════════════════════════════════════════════════
console.log('\nFlujo gapAnalisis — integración\n')

function simularGapAnalisis(vinosActivos, catalogoVinos) {
  const REGIONES_GENERICAS = new Set([
    'espana', 'spain', 'portugal', 'france', 'francia',
    'italia', 'italy', 'alemania', 'germany',
    'argentina', 'chile', 'australia', 'usa',
  ])

  const cartaMap = {}
  const tipoCounts = {}
  for (const v of vinosActivos) {
    const tipo = normWineTipo(v.tipo)
    const region = normWineRegion(v.region)
    if (!tipo) continue
    tipoCounts[tipo] = (tipoCounts[tipo] || 0) + 1
    if (!region || REGIONES_GENERICAS.has(region)) continue
    const key = `${tipo}||${region}`
    cartaMap[key] = (cartaMap[key] || 0) + 1
  }

  const catMap = {}
  for (const c of catalogoVinos) {
    const tipo = normWineTipo(c.tipo)
    const region = normWineRegion(c.region)
    if (!tipo || !region || REGIONES_GENERICAS.has(region)) continue
    const key = `${tipo}||${region}`
    if (!catMap[key]) catMap[key] = { count: 0 }
    catMap[key].count++
  }

  const gaps = []
  for (const [key, { count: nCat }] of Object.entries(catMap)) {
    if (nCat < 2) continue
    const [normedTipo] = key.split('||')
    if (!tipoCounts[normedTipo]) continue
    const nCarta = cartaMap[key] || 0
    if (nCarta >= nCat) continue
    gaps.push({ key, nCat, nCarta })
  }
  return gaps
}

// Caso 1: catálogo "La Rioja", carta "Rioja" — antes eran keys distintas → gap falso, ahora no.
// Carta y catálogo tienen el mismo número de vinos; solo difieren en el artículo de la región.
{
  const carta = [
    { tipo: 'tinto', region: 'Rioja' },
    { tipo: 'tinto', region: 'Rioja' },
    { tipo: 'tinto', region: 'Rioja' },
  ]
  const catalogo = [
    { tipo: 'tinto', region: 'La Rioja' },
    { tipo: 'tinto', region: 'La Rioja' },
    { tipo: 'tinto', region: 'La Rioja' },
  ]
  const gaps = simularGapAnalisis(carta, catalogo)
  ok(gaps.length === 0, 'Caso "La Rioja" vs "Rioja": no produce gap falso')
}

// Caso 2: catálogo "Tintos", carta "tinto" — antes eran keys distintas → gap falso, ahora no.
// Carta y catálogo tienen los mismos 2 tintos de Rioja; solo difiere el plural/casing.
{
  const carta = [
    { tipo: 'tinto',  region: 'Rioja' },
    { tipo: 'tinto',  region: 'Rioja' },
    { tipo: 'blanco', region: 'Rueda' },
  ]
  const catalogo = [
    { tipo: 'Tintos', region: 'Rioja' },
    { tipo: 'Tintos', region: 'Rioja' },
  ]
  const gaps = simularGapAnalisis(carta, catalogo)
  ok(gaps.length === 0, 'Caso "Tintos" vs "tinto": no produce gap falso')
}

// Caso 3: gap real (el tipo SÍ existe en carta pero faltan unidades de esa región) debe detectarse.
// gapAnalisis solo señala gaps de tipos ya representados en la carta (filtro tipoCounts).
// Carta: 1 blanco de Rueda · Catálogo: 2 blancos de Rueda → gap real de 1.
{
  const carta = [
    { tipo: 'blanco', region: 'Rueda' },
  ]
  const catalogo = [
    { tipo: 'blanco', region: 'Rueda' },
    { tipo: 'blanco', region: 'Rueda' },
  ]
  const gaps = simularGapAnalisis(carta, catalogo)
  ok(gaps.length === 1, 'Gap real (falta blanco de Rueda) se detecta correctamente')
}

// Caso 4: gap falso por artículo en región NO debe aparecer
{
  const carta = [
    { tipo: 'tinto', region: 'Rioja' },
    { tipo: 'tinto', region: 'Rioja' },
    { tipo: 'tinto', region: 'Rioja' },
  ]
  const catalogo = [
    { tipo: 'tinto', region: 'D.O.Ca. La Rioja' },
    { tipo: 'tinto', region: 'D.O.Ca. La Rioja' },
  ]
  const gaps = simularGapAnalisis(carta, catalogo)
  ok(gaps.length === 0, '"D.O.Ca. La Rioja" vs "Rioja": no produce gap falso')
}

// Caso 5: región genérica (España) se excluye correctamente
{
  const carta    = [{ tipo: 'tinto', region: 'España' }]
  const catalogo = [{ tipo: 'tinto', region: 'España' }, { tipo: 'tinto', region: 'España' }]
  const gaps = simularGapAnalisis(carta, catalogo)
  ok(gaps.length === 0, 'Región genérica "España" excluida del análisis de huecos')
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 5 — Flujo recomendacionesSustitucion: filtro tipo+región
// ════════════════════════════════════════════════════════════════
console.log('\nFlujo recomendacionesSustitucion — integración\n')

function vinoTienAlternativaEnCatalogo(vino, catalogo) {
  const tipoNorm   = normWineTipo(vino.tipo)
  const regionNorm = normWineRegion(vino.region)
  return catalogo.some(c =>
    normWineTipo(c.tipo)   === tipoNorm &&
    normWineRegion(c.region) === regionNorm
  )
}

// "Tinto" de "Rioja" debe encontrar alternativa en catálogo con "Tintos" de "La Rioja"
ok(
  vinoTienAlternativaEnCatalogo(
    { tipo: 'Tinto', region: 'Rioja' },
    [{ tipo: 'Tintos', region: 'La Rioja' }]
  ),
  '"Tinto / Rioja" encuentra alternativa "Tintos / La Rioja" en catálogo'
)

// Sin alternativa real → false
ok(
  !vinoTienAlternativaEnCatalogo(
    { tipo: 'tinto', region: 'Rioja' },
    [{ tipo: 'blanco', region: 'Rueda' }]
  ),
  'Sin alternativa de mismo tipo/región → false correcto'
)

// ════════════════════════════════════════════════════════════════
// RESUMEN
// ════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(48)}`)
if (failed === 0) {
  console.log(`✓ ${passed} tests pasan\n`)
} else {
  console.log(`✓ ${passed} pasan  ✗ ${failed} fallan\n`)
  process.exit(1)
}
