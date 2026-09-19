/**
 * Tests para generarSugerencias (app/lib/sugerirCarta.js).
 * Ejecutar: node --test scripts/sugerir-carta.test.mjs
 *
 * Usa el motor de maridaje real (estimarPerfil / necesidadesEstructurales)
 * para verificar comportamiento end-to-end sin mocks de base de datos.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { generarSugerencias, vinosCompatiblesConPlato } from '../app/lib/sugerirCarta.js'

// ── Fixtures ────────────────────────────────────────────────────────────────

const SOLOMILLO = {
  id: 'p-solomillo',
  nombre: 'Solomillo al Pedro Ximénez con Manzanilla',
  categoria: 'Carnes',
  activo: true,
}

const OSTRAS = {
  id: 'p-ostras',
  nombre: 'Ostras frescas al natural',
  categoria: 'Mariscos',
  activo: true,
}

// Vinos que NO cubren carne (espumosos/blancos — taninos bajos)
const LINEAS_SIN_TINTO = [
  { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', nombre: 'Cava Brut Nature', tipo: 'espumoso', region: 'Cava',       uva: 'Macabeo',   precio_botella: 12 },
  { id: 'l2', estado: 'actual', catalogo_vino_id: 'c2', nombre: 'Albariño',         tipo: 'blanco',   region: 'Rías Baixas', uva: 'Albariño',  precio_botella: 15 },
]

// Tinto Ribera del Duero — debe satisfacer taninosMin≥3, cuerpoMin≥3, acidezMin≥2
const TINTO_RIBERA = {
  id: 'cat-tinto',
  nombre: 'Ribera del Duero Crianza',
  tipo: 'tinto',
  region: 'Ribera del Duero',
  uva: 'Tempranillo',
  bodega: 'Bodegas Test',
  coste_estimado: 8,
  pvp_recomendado: 24,
}

const TXAKOLI = {
  id: 'cat-txakoli',
  nombre: 'Txakolina Blanco',
  tipo: 'blanco',
  region: 'Txakolina',
  uva: 'Hondarrabi Zuri',
  bodega: 'Bodegas Test',
  coste_estimado: 9,
  pvp_recomendado: 22,
}

// ── Test 1: bug raíz — plato sin cobertura genera sugerencia ────────────────
test('plato con 0 vinos compatibles → debe sugerir vino del catálogo que lo cubra', () => {
  const result = generarSugerencias(
    LINEAS_SIN_TINTO,
    [TINTO_RIBERA, TXAKOLI],
    [SOLOMILLO, OSTRAS],
  )

  assert.ok(result.anadir.length > 0, 'debe generar al menos una sugerencia')

  const sugiereTinto = result.anadir.some(s => s.vino.id === TINTO_RIBERA.id)
  assert.ok(sugiereTinto, 'debe sugerir el tinto Ribera para el solomillo sin cobertura')

  const razon = result.anadir.find(s => s.vino.id === TINTO_RIBERA.id)?.razon || ''
  assert.ok(
    razon.toLowerCase().includes('solomillo') || razon.includes('1 plato'),
    `razón debe referenciar el plato huérfano, fue: "${razon}"`,
  )
})

// ── Test 2: bug de la media — todos los platos con igual cobertura ──────────
test('cobertura uniforme (todos los platos igual de cubiertos) → no debe devolver vacío', () => {
  // Borrador con un tinto genérico que cubre todos los platos de carne uniformemente
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', nombre: 'Rioja Crianza', tipo: 'tinto', region: 'Rioja', uva: 'Tempranillo', precio_botella: 14 },
  ]
  // Dos platos de carne con el mismo nivel de cobertura (count=1 cada uno)
  const platos = [
    { id: 'p1', nombre: 'Entrecot a la brasa',    categoria: 'Carnes', activo: true },
    { id: 'p2', nombre: 'Solomillo a la pimienta', categoria: 'Carnes', activo: true },
  ]
  // Catálogo: otro tinto de zona diferente
  const catalogo = [
    { id: 'cat1', nombre: 'Toro Reserva', tipo: 'tinto', region: 'Toro', uva: 'Tinta de Toro', bodega: 'X', pvp_recomendado: 20 },
  ]

  const result = generarSugerencias(lineas, catalogo, platos)

  // Con la media, count=1=mean → filter(x.count < mean) = [] → retorno vacío (bug).
  // Con la mediana + bottom-half, debe encontrar candidatos de nivel 2.
  assert.ok(result.anadir.length > 0, 'cobertura uniforme no debe devolver vacío — bug de la media')
})

// ── Test 3: sin platos → fallback zona/D.O. ─────────────────────────────────
test('sin platos configurados → fallback a sugerencias por zona ausente', () => {
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', tipo: 'tinto', region: 'Rioja',     nombre: 'Rioja',   precio_botella: 12 },
    { id: 'l2', estado: 'actual', catalogo_vino_id: 'c2', tipo: 'blanco', region: 'Rueda',    nombre: 'Verdejo', precio_botella: 10 },
    { id: 'l3', estado: 'actual', catalogo_vino_id: 'c3', tipo: 'rosado', region: 'Navarra',  nombre: 'Rosado',  precio_botella: 9  },
    { id: 'l4', estado: 'actual', catalogo_vino_id: 'c4', tipo: 'espumoso', region: 'Cava',   nombre: 'Cava',    precio_botella: 11 },
    { id: 'l5', estado: 'actual', catalogo_vino_id: 'c5', tipo: 'generoso', region: 'Jerez',  nombre: 'Fino',    precio_botella: 8  },
    { id: 'l6', estado: 'actual', catalogo_vino_id: 'c6', tipo: 'dulce',   region: 'Montilla-Moriles', nombre: 'PX', precio_botella: 14 },
  ]
  const catalogo = [
    { id: 'cat1', nombre: 'Mencía Ribeira Sacra', tipo: 'tinto',  region: 'Ribeira Sacra', bodega: 'X', pvp_recomendado: 22 },
    { id: 'cat2', nombre: 'Txakolina',            tipo: 'blanco', region: 'Txakolina',     bodega: 'X', pvp_recomendado: 18 },
  ]

  const result = generarSugerencias(lineas, catalogo, [])

  assert.ok(
    result.anadir.length > 0,
    'sin platos debe proponer zonas no representadas aunque todos los tipos estén cubiertos',
  )
  assert.ok(
    result.anadir.every(s => ['Ribeira Sacra', 'Txakolina'].includes(s.vino.region)),
    'debe sugerir exactamente los vinos de las zonas ausentes',
  )
  assert.ok(
    result.anadir[0].razon.toLowerCase().includes('zona'),
    'la razón debe mencionar "zona"',
  )
})

// ── Test 4: catálogo vacío → respuesta vacía sin error ──────────────────────
test('catálogo vacío → retorna vacío sin lanzar excepción', () => {
  const result = generarSugerencias(LINEAS_SIN_TINTO, [], [SOLOMILLO])
  assert.deepStrictEqual(result, { anadir: [], sustituir: [] })
})

// ── Test 5: vinosCompatiblesConPlato como función pública ───────────────────
test('vinosCompatiblesConPlato — tinto cubre solomillo, blanco no', () => {
  const vinos = [
    { id: 'tinto', nombre: 'Ribera Crianza', tipo: 'tinto',  region: 'Ribera del Duero', uva: 'Tempranillo' },
    { id: 'blanco', nombre: 'Albariño',      tipo: 'blanco', region: 'Rías Baixas',      uva: 'Albariño' },
  ]

  const compatibles = vinosCompatiblesConPlato(SOLOMILLO, vinos)

  assert.ok(compatibles.some(v => v.id === 'tinto'), 'tinto debe ser compatible con solomillo (carne)')
  assert.ok(!compatibles.some(v => v.id === 'blanco'), 'blanco no debe ser compatible con solomillo (taninos < 3)')
})
