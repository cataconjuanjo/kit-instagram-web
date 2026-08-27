/**
 * Tests para coincideReferencia (buscador "Referencias de catálogo" en /admin/proveedores?vista=catalogo).
 * Ejecutar: node scripts/test-proveedores-search.mjs
 */

// ---- Funciones copiadas de app/admin/proveedores/page.js ----

function normalizar(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function coincideReferencia(vino, busqueda) {
  const consulta = normalizar(busqueda)
  if (!consulta) return true
  const terminos = consulta.split(' ').filter(Boolean)
  if (!terminos.length) return true
  const texto = normalizar([
    vino.nombre,
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva,
    vino.referencia,
  ].filter(Boolean).join(' '))
  return terminos.every(termino => texto.includes(termino))
}

// ---- Datos de prueba ----

const MATAS_ALTAS = { id: 1, nombre: 'Matas Altas', bodega: 'Clos Mogador', tipo: 'Tinto', region: 'Priorat', uva: 'Garnacha', referencia: 'CMA-2020' }
const MATAS_ALTAS_BLANCO = { id: 2, nombre: 'Matas Altas Blanco', bodega: 'Clos Mogador', tipo: 'Blanco', region: 'Priorat', uva: 'Garnacha Blanca', referencia: 'CMA-B-2021' }
const BEAUNE_MAGNUM = { id: 3, nombre: 'Beaune Champs Pimont 1 Cru Magnum', bodega: 'Louis Jadot', tipo: 'Tinto', region: 'Borgoña', uva: 'Pinot Noir', referencia: 'BCP1CM' }
const BOURGOGNE_SIMONE = { id: 4, nombre: 'Bourgogne Pinot Noir Cuvée Simone Magnum', bodega: 'Domaine Chanson', tipo: 'Tinto', region: 'Borgoña', uva: 'Pinot Noir', referencia: 'BPNCSM' }
const ALCAB = { id: 5, nombre: 'ALCAB Sin sulfuros añadidos', bodega: 'Alcab Bodegas', tipo: 'Tinto', region: 'Castilla', uva: 'Tempranillo', referencia: 'ALCAB-SS' }
const ALTER_EGO = { id: 6, nombre: 'Alter Ego de Palmer', bodega: 'Château Palmer', tipo: 'Tinto', region: 'Margaux', uva: 'Merlot', referencia: 'AEP-2018' }
const ALBARINO_RIAS = { id: 7, nombre: 'Albariño de Rías', bodega: 'Bodegas Gallegas', tipo: 'Blanco', region: 'Rías Baixas', uva: 'Albariño', referencia: 'ALB-RB' }
const GARNACHA_ALTA = { id: 8, nombre: 'Garnacha Viñas Altas', bodega: 'Bodegas del Norte', tipo: 'Tinto', region: 'Aragón', uva: 'Garnacha', referencia: 'GVA-19' }

const TODOS = [MATAS_ALTAS, MATAS_ALTAS_BLANCO, BEAUNE_MAGNUM, BOURGOGNE_SIMONE, ALCAB, ALTER_EGO, ALBARINO_RIAS, GARNACHA_ALTA]

// ---- Utilidad de test ----

let passed = 0
let failed = 0

function filtrar(busqueda) {
  return TODOS.filter(v => coincideReferencia(v, busqueda))
}

function expect(descripcion, obtenido, esperados) {
  const idsObtenidos = obtenido.map(v => v.id).sort()
  const idsEsperados = [...esperados].sort()
  const ok = idsObtenidos.length === idsEsperados.length && idsObtenidos.every((id, i) => id === idsEsperados[i])
  if (ok) {
    console.log(`  ✓ ${descripcion}`)
    passed++
  } else {
    const nombresObtenidos = obtenido.map(v => v.nombre)
    const nombresEsperados = idsEsperados.map(id => TODOS.find(v => v.id === id)?.nombre)
    console.error(`  ✗ ${descripcion}`)
    console.error(`    Esperado:  [${nombresEsperados.join(', ')}]`)
    console.error(`    Obtenido:  [${nombresObtenidos.join(', ')}]`)
    failed++
  }
}

function expectVacio(descripcion, obtenido) {
  expect(descripcion, obtenido, [])
}

// ---- Tests ----

console.log('\nbuscador "Referencias de catálogo" — coincideReferencia()\n')

console.log('Casos del bug report:')
expect(
  '"matas altas" → solo Matas Altas y Matas Altas Blanco',
  filtrar('matas altas'),
  [1, 2]
)
expect(
  '"matas" → Matas Altas y Matas Altas Blanco (nombre exacto matchea)',
  filtrar('matas'),
  [1, 2]
)
expect(
  '"matas altas" → NO incluye Beaune ni Bourgogne',
  filtrar('matas altas').filter(v => [3, 4].includes(v.id)),
  []
)
expect(
  '"altas" → NO devuelve ALCAB ni Alter Ego (sin relación)',
  filtrar('altas').filter(v => [5, 6].includes(v.id)),
  []
)

console.log('\nBúsqueda por bodega:')
expect('"jadot" → Beaune (bodega Louis Jadot)', filtrar('jadot'), [3])
expect('"clos mogador" → los dos Matas Altas', filtrar('clos mogador'), [1, 2])
expect('"chanson" → Bourgogne (bodega Domaine Chanson)', filtrar('chanson'), [4])

console.log('\nBúsqueda por zona / D.O.:')
expect('"priorat" → los dos Matas Altas', filtrar('priorat'), [1, 2])
expect('"borgona" → Beaune y Bourgogne', filtrar('borgona'), [3, 4])
expect('"rias baixas" → Albariño', filtrar('rias baixas'), [7])

console.log('\nBúsqueda por uva:')
expect('"garnacha" → Matas Altas, Matas Altas Blanco (Garnacha Blanca), Garnacha Viñas Altas', filtrar('garnacha'), [1, 2, 8])
expect('"pinot noir" → Beaune y Bourgogne', filtrar('pinot noir'), [3, 4])
expect('"albarino" → Albariño (sin tilde)', filtrar('albarino'), [7])

console.log('\nBúsqueda por referencia:')
expect('"CMA-2020" (referencia exacta, mayúsculas) → Matas Altas', filtrar('CMA-2020'), [1])
expect('"alcab-ss" (referencia) → ALCAB', filtrar('alcab-ss'), [5])

console.log('\nBúsqueda multi-término cruzando campos:')
expect('"blanco priorat" → Matas Altas Blanco', filtrar('blanco priorat'), [2])
expect('"tinto margaux" → Alter Ego', filtrar('tinto margaux'), [6])

console.log('\nBúsqueda vacía (sin filtro):')
expect('busqueda "" → todos los vinos', filtrar(''), TODOS.map(v => v.id))
expect('busqueda "  " (espacios) → todos los vinos', filtrar('   '), TODOS.map(v => v.id))

console.log('\nNormalización (acentos y mayúsculas):')
expect('"MATAS" mayúsculas → Matas Altas', filtrar('MATAS'), [1, 2])
expect('"albarino" sin tilde → Albariño', filtrar('albarino'), [7])
expect('"borgona" sin tilde → Borgoña', filtrar('borgona'), [3, 4])

console.log('\nSin resultados esperados:')
expectVacio('"rioja" → ninguno (no hay vinos de Rioja en el set)', filtrar('rioja'))
expectVacio('"syrah" → ninguno (no hay syrah en el set)', filtrar('syrah'))

// ---- Resumen ----

console.log(`\n${'─'.repeat(50)}`)
console.log(`Total: ${passed + failed} tests  |  ✓ ${passed} ok  |  ${failed > 0 ? `✗ ${failed} failed` : '0 failed'}`)
if (failed > 0) process.exit(1)
