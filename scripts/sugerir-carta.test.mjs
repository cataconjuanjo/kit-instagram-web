/**
 * Tests para generarSugerencias (app/lib/sugerirCarta.js).
 * Ejecutar: npm run test:sugerir-carta
 *
 * Verifica el criterio de producto: maridaje por plato primero (anadir),
 * diversidad de zona después (secundario), nunca al revés.
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

const LUBINA = {
  id: 'p-lubina',
  nombre: 'Lubina a la sal con verduras',
  categoria: 'Pescados',
  activo: true,
}

const OSTRAS = {
  id: 'p-ostras',
  nombre: 'Ostras frescas al natural',
  categoria: 'Mariscos',
  activo: true,
}

// Borrador sin tinto — no cubre carnes
const LINEAS_SIN_TINTO = [
  { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', nombre: 'Cava Brut Nature', tipo: 'espumoso', region: 'Cava',       uva: 'Macabeo',   precio_botella: 12 },
  { id: 'l2', estado: 'actual', catalogo_vino_id: 'c2', nombre: 'Albariño',         tipo: 'blanco',   region: 'Rías Baixas', uva: 'Albariño',  precio_botella: 15 },
]

// Tinto Ribera del Duero — satisface {taninosMin:3, cuerpoMin:3, acidezMin:2}
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

// Blanco Txakoli — no satisface carnes pero sí pescados
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

// ── Test 1: plato sin cobertura → sugerencia con motivo de plato ─────────────
test('plato con 0 vinos compatibles → sugerencia principal con razón de plato', () => {
  const result = generarSugerencias(
    LINEAS_SIN_TINTO,
    [TINTO_RIBERA, TXAKOLI],
    [SOLOMILLO, OSTRAS],
  )

  assert.ok(result.anadir.length > 0, 'debe generar sugerencias de maridaje')

  const sugiereTinto = result.anadir.some(s => s.vino.id === TINTO_RIBERA.id)
  assert.ok(sugiereTinto, 'debe sugerir el tinto Ribera para el solomillo sin cobertura')

  const entrada = result.anadir.find(s => s.vino.id === TINTO_RIBERA.id)
  assert.ok(
    entrada.razon.toLowerCase().includes('solomillo') || entrada.razon.includes('1 plato'),
    `razón debe referenciar el plato, fue: "${entrada.razon}"`,
  )
  assert.equal(entrada.tipo, 'maridaje', 'tipo debe ser "maridaje"')
})

// ── Test 2: varios platos sin cobertura → sugerencias para cada uno ──────────
test('varios platos sin cobertura → se intenta cubrir todos, no solo el primero', () => {
  // Borrador vacío: ni carnes ni pescados cubiertos
  const borradorVacio = []
  const catalogoConAmbos = [TINTO_RIBERA, TXAKOLI]
  const platos = [SOLOMILLO, LUBINA]

  const result = generarSugerencias(borradorVacio, catalogoConAmbos, platos)

  // El tinto debe cubrir solomillo, el txakoli debe cubrir lubina
  const tieneCoberturaCarne  = result.anadir.some(s => s.vino.id === TINTO_RIBERA.id)
  const tieneCoberturaPescado = result.anadir.some(s => s.vino.id === TXAKOLI.id)

  assert.ok(tieneCoberturaCarne,   'debe sugerir tinto para el plato de carne sin cobertura')
  assert.ok(tieneCoberturaPescado, 'debe sugerir blanco para el plato de pescado sin cobertura')
  assert.equal(result.anadir.length, 2, 'debe sugerir un vino por cada plato sin cobertura')
})

// ── Test 3: bug de la media — todos los platos con igual cobertura ────────────
test('cobertura uniforme (todos los platos igual de cubiertos) → no debe devolver vacío', () => {
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', nombre: 'Rioja Crianza', tipo: 'tinto', region: 'Rioja', uva: 'Tempranillo', precio_botella: 14 },
  ]
  const platos = [
    { id: 'p1', nombre: 'Entrecot a la brasa',    categoria: 'Carnes', activo: true },
    { id: 'p2', nombre: 'Solomillo a la pimienta', categoria: 'Carnes', activo: true },
  ]
  const catalogo = [
    { id: 'cat1', nombre: 'Toro Reserva', tipo: 'tinto', region: 'Toro', uva: 'Tinta de Toro', bodega: 'X', pvp_recomendado: 20 },
  ]

  const result = generarSugerencias(lineas, catalogo, platos)

  assert.ok(result.anadir.length > 0, 'cobertura uniforme no debe devolver anadir vacío — bug de la media')
  assert.ok(result.todosCubiertos, 'todosCubiertos debe ser true cuando todos los platos tienen ≥1 vino')
})

// ── Test 4: todos cubiertos → todosCubiertos true, mensaje sobre platos ──────
test('todos los platos cubiertos → todosCubiertos:true, sugerencias nivel 2 en anadir', () => {
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', tipo: 'tinto', region: 'Rioja', nombre: 'Rioja', precio_botella: 12 },
  ]
  const platos = [
    { id: 'p1', nombre: 'Chuletón de vaca', categoria: 'Carnes', activo: true },
  ]
  const catalogo = [
    { id: 'cat-ribera', nombre: 'Ribera Reserva', tipo: 'tinto', region: 'Ribera del Duero', uva: 'Tempranillo', bodega: 'X', pvp_recomendado: 30 },
  ]

  const result = generarSugerencias(lineas, catalogo, platos)

  assert.ok(result.todosCubiertos, 'todosCubiertos debe ser true')
  // anadir puede tener sugerencias nivel 2 (ampliar cobertura del plato ya cubierto)
  // secundario puede tener zonas sin representar
  // Lo importante: NO hay sugerencias sin relación con platos en `anadir`
  if (result.anadir.length > 0) {
    assert.ok(
      result.anadir.every(s => s.tipo === 'maridaje'),
      'todas las entradas de anadir deben ser de tipo maridaje',
    )
  }
})

// ── Test 5: sin platos configurados → zona en secundario, no en anadir ───────
test('sin platos configurados → sugerencias de zona van a secundario, anadir vacío', () => {
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', tipo: 'tinto',   region: 'Rioja',    nombre: 'Rioja',   precio_botella: 12 },
    { id: 'l2', estado: 'actual', catalogo_vino_id: 'c2', tipo: 'blanco',  region: 'Rueda',    nombre: 'Verdejo', precio_botella: 10 },
    { id: 'l3', estado: 'actual', catalogo_vino_id: 'c3', tipo: 'rosado',  region: 'Navarra',  nombre: 'Rosado',  precio_botella: 9  },
    { id: 'l4', estado: 'actual', catalogo_vino_id: 'c4', tipo: 'espumoso',region: 'Cava',     nombre: 'Cava',    precio_botella: 11 },
    { id: 'l5', estado: 'actual', catalogo_vino_id: 'c5', tipo: 'generoso',region: 'Jerez',    nombre: 'Fino',    precio_botella: 8  },
  ]
  const catalogo = [
    { id: 'cat1', nombre: 'Mencía Ribeira Sacra', tipo: 'tinto',  region: 'Ribeira Sacra', bodega: 'X', pvp_recomendado: 22 },
    { id: 'cat2', nombre: 'Txakolina',            tipo: 'blanco', region: 'Txakolina',     bodega: 'X', pvp_recomendado: 18 },
  ]

  const result = generarSugerencias(lineas, catalogo, [])

  assert.equal(result.anadir.length, 0, 'sin platos, anadir debe estar vacío')
  assert.ok(result.secundario.length > 0, 'sin platos debe proponer zonas en secundario')
  assert.ok(
    result.secundario.every(s => ['Ribeira Sacra', 'Txakolina'].includes(s.vino.region)),
    'secundario debe sugerir exactamente los vinos de las zonas ausentes',
  )
  assert.ok(
    result.secundario.every(s => s.tipo === 'zona'),
    'todas las entradas de secundario deben ser de tipo zona',
  )
  assert.ok(
    result.secundario[0].razon.toLowerCase().includes('zona'),
    'la razón debe mencionar "zona"',
  )
})

// ── Tests 11–14: normZona — falsos positivos de zona ─────────────────────────

// Test 11: "Galicia - Rías Baixas" no debe sugerirse cuando el borrador ya tiene "Rías Baixas"
test('normZona: "Galicia - Rías Baixas" coincide con "Rías Baixas" en el borrador', () => {
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', tipo: 'blanco', region: 'Rías Baixas', nombre: 'Albariño', precio_botella: 15 },
  ]
  const catalogo = [
    { id: 'cat-galicia', nombre: 'Albariño Galicia', tipo: 'blanco', region: 'Galicia - Rías Baixas', bodega: 'X', pvp_recomendado: 18 },
  ]
  const result = generarSugerencias(lineas, catalogo, [])
  assert.ok(
    !result.secundario.some(s => s.vino.id === 'cat-galicia'),
    '"Galicia - Rías Baixas" no debe aparecer si "Rías Baixas" ya está en el borrador',
  )
})

// Test 12: "D.O. Ribera del Duero" no debe sugerirse cuando el borrador ya tiene "Ribera del Duero"
test('normZona: "D.O. Ribera del Duero" coincide con "Ribera del Duero" en el borrador', () => {
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', tipo: 'tinto', region: 'Ribera del Duero', nombre: 'Crianza', precio_botella: 14 },
  ]
  const catalogo = [
    { id: 'cat-do-ribera', nombre: 'Ribera Reserva DO', tipo: 'tinto', region: 'D.O. Ribera del Duero', bodega: 'X', pvp_recomendado: 28 },
  ]
  const result = generarSugerencias(lineas, catalogo, [])
  assert.ok(
    !result.secundario.some(s => s.vino.id === 'cat-do-ribera'),
    '"D.O. Ribera del Duero" no debe aparecer si "Ribera del Duero" ya está en el borrador',
  )
})

// Test 13: "Andalucía - Málaga" no debe sugerirse cuando el borrador ya tiene "Málaga"
test('normZona: "Andalucía - Málaga" coincide con "Málaga" en el borrador', () => {
  const lineas = [
    { id: 'l1', estado: 'actual', catalogo_vino_id: 'c1', tipo: 'generoso', region: 'Málaga', nombre: 'Moscatel', precio_botella: 10 },
  ]
  const catalogo = [
    { id: 'cat-and-malaga', nombre: 'Málaga Dulce', tipo: 'generoso', region: 'Andalucía - Málaga', bodega: 'X', pvp_recomendado: 14 },
  ]
  const result = generarSugerencias(lineas, catalogo, [])
  assert.ok(
    !result.secundario.some(s => s.vino.id === 'cat-and-malaga'),
    '"Andalucía - Málaga" no debe aparecer si "Málaga" ya está en el borrador',
  )
})

// Test 14: "España" como región genérica nunca debe aparecer en secundario
test('normZona: zona genérica "España" nunca se sugiere en secundario', () => {
  const lineas = []
  const catalogo = [
    { id: 'cat-espana', nombre: 'Vino España', tipo: 'tinto', region: 'España', bodega: 'X', pvp_recomendado: 8 },
    { id: 'cat-rioja',  nombre: 'Rioja Joven',  tipo: 'tinto', region: 'Rioja',  bodega: 'Y', pvp_recomendado: 12 },
  ]
  const result = generarSugerencias(lineas, catalogo, [])
  assert.ok(
    !result.secundario.some(s => s.vino.id === 'cat-espana'),
    '"España" como zona genérica no debe aparecer en secundario',
  )
  assert.ok(
    result.secundario.some(s => s.vino.id === 'cat-rioja'),
    '"Rioja" sí debe aparecer como zona nueva en secundario',
  )
})

// ── Test 6: catálogo vacío → respuesta vacía sin error ───────────────────────
test('catálogo vacío → retorna vacío sin lanzar excepción', () => {
  const result = generarSugerencias(LINEAS_SIN_TINTO, [], [SOLOMILLO])
  assert.deepStrictEqual(result, { anadir: [], sustituir: [], secundario: [], todosCubiertos: false })
})

// ── Test 7: vinosCompatiblesConPlato como función pública ────────────────────
test('vinosCompatiblesConPlato — tinto cubre solomillo, blanco no', () => {
  const vinos = [
    { id: 'tinto',  nombre: 'Ribera Crianza', tipo: 'tinto',  region: 'Ribera del Duero', uva: 'Tempranillo' },
    { id: 'blanco', nombre: 'Albariño',       tipo: 'blanco', region: 'RíasAixas',        uva: 'Albariño' },
  ]

  const compatibles = vinosCompatiblesConPlato(SOLOMILLO, vinos)

  assert.ok(compatibles.some(v => v.id === 'tinto'),   'tinto debe ser compatible con solomillo (carne)')
  assert.ok(!compatibles.some(v => v.id === 'blanco'), 'blanco no debe ser compatible con solomillo (taninos < 3)')
})

// ── Test 8: descripción con método secundario no rompe cobertura de carne ────
test('solomillo con "espárragos" en descripción: taninosMin:3 no queda anulado por taninosMax:2', () => {
  const solomilloConDesc = {
    id: 'p-sol-desc',
    nombre: 'Solomillo al Pedro Ximénez con Manzanilla',
    categoria: 'Carnes',
    descripcion: 'Con espárragos trigueros y reducción de Pedro Ximénez',
    activo: true,
  }
  const tintoRibera = { id: 'tinto', nombre: 'Ribera Crianza', tipo: 'tinto', region: 'Ribera del Duero', uva: 'Tempranillo' }

  const compatibles = vinosCompatiblesConPlato(solomilloConDesc, [tintoRibera])
  assert.ok(compatibles.length > 0, '"espárragos" en descripción no debe crear rango taninosMin>taninosMax imposible')
})

// ── Test 9: descripción con 'picante' secundario no crea rango imposible ─────
test('solomillo con "picante" en descripción: tinto sigue siendo compatible', () => {
  const solomilloPicante = {
    id: 'p-sol-picante',
    nombre: 'Solomillo al Pedro Ximénez con Manzanilla',
    categoria: 'Carnes',
    descripcion: 'Con toque picante y reducción intensa',
    activo: true,
  }
  const tintoRibera = { id: 'tinto', nombre: 'Ribera Crianza', tipo: 'tinto', region: 'Ribera del Duero', uva: 'Tempranillo' }

  const compatibles = vinosCompatiblesConPlato(solomilloPicante, [tintoRibera])
  assert.ok(compatibles.length > 0, '"picante" en descripción de solomillo no debe bloquear el tinto')
})

// ── Test 10: generarSugerencias con solomillo con descripción → anadir no vacío
test('generarSugerencias: solomillo con descripción de guarnición vegetal genera sugerencia de tinto', () => {
  const solomilloConDesc = {
    id: 'p-sol-desc2',
    nombre: 'Solomillo al Pedro Ximénez con Manzanilla',
    categoria: 'Carnes',
    descripcion: 'Con espárragos trigueros a la parrilla',
    activo: true,
  }
  const result = generarSugerencias([], [TINTO_RIBERA, TXAKOLI], [solomilloConDesc])

  assert.ok(result.anadir.length > 0, 'debe sugerir tintos aunque la descripción mencione espárragos')
  assert.ok(result.anadir.some(s => s.vino.id === TINTO_RIBERA.id), 'debe sugerir el tinto Ribera para la carne')
})
