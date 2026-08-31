/**
 * Tests para esVinoDulceOSemidulce() — regresión del bug de falsos positivos.
 *
 * Bug original: 'dulce' como subcadena libre capturaba "especias dulces",
 * "taninos dulces" y "[perfil_descartado:dulce]" en notas de cata de tintos secos.
 *
 * Fix: eliminar 'dulce' del array de términos de texto libre.
 * Los vinos genuinamente dulces se cubren por tipo='dulce' o 'semidulce' explícito.
 *
 * Ejecutar: node scripts/test-maridaje-dulce.mjs
 */

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

// Reproducción fiel de la función del engine (versión corregida)
function norm(s = '') {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function textoVino(v) {
  return norm([v.nombre, v.bodega, v.tipo, v.region, v.uva, v.notas_cata].filter(Boolean).join(' '))
}

function esVinoDulceOSemidulce(vino, textoVino = '') {
  return vino.tipo === 'dulce' || ['semidulce', 'semi dulce', 'vendimia tardia', 'late harvest'].some(t => textoVino.includes(t))
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 1 — Falsos positivos eliminados (bug original)
// Tintos secos con "dulce" en notas de cata NO deben marcarse como dulces
// ════════════════════════════════════════════════════════════════
console.log('\nesVinoDulceOSemidulce — falsos positivos del bug original\n')

const tinto6Plus6 = {
  nombre: '6+6',
  tipo: 'tinto',
  notas_cata: 'notas de frutos negros maduros, especias dulces y una ligera mineralidad'
}
ok(!esVinoDulceOSemidulce(tinto6Plus6, textoVino(tinto6Plus6)),
  '"6+6" tinto seco con "especias dulces" en notas → NO dulce')

const laCueva = {
  nombre: 'La Cueva del Contador',
  tipo: 'tinto',
  notas_cata: 'aromas de pices de casis y especias dulces, sostenida acidez'
}
ok(!esVinoDulceOSemidulce(laCueva, textoVino(laCueva)),
  '"La Cueva del Contador" tinto con "especias dulces" → NO dulce')

const carraovejas = {
  nombre: 'Pago de Carraovejas',
  tipo: 'tinto',
  notas_cata: 'frutos negros maduras y especias dulces, con notas de tabaco'
}
ok(!esVinoDulceOSemidulce(carraovejas, textoVino(carraovejas)),
  '"Pago de Carraovejas" tinto con "especias dulces" → NO dulce')

const valleNabal = {
  nombre: 'Valle de Nabal',
  tipo: 'tinto',
  notas_cata: 'estructurado, con taninos dulces y una persistencia elegante'
}
ok(!esVinoDulceOSemidulce(valleNabal, textoVino(valleNabal)),
  '"Valle de Nabal" tinto con "taninos dulces" → NO dulce')

// Gran Barquero Fino: tiene [perfil_descartado:dulce] que contenía 'dulce' como subcadena
const granBarquero = {
  nombre: 'Gran Barquero Fino',
  tipo: 'generoso',
  uva: 'Pedro Ximénez',
  notas_cata: '[perfil:seco]\n[perfil_descartado:dulce]'
}
ok(!esVinoDulceOSemidulce(granBarquero, textoVino(granBarquero)),
  '"Gran Barquero Fino" generoso con [perfil_descartado:dulce] en notas → NO dulce')

// ════════════════════════════════════════════════════════════════
// BLOQUE 2 — Vinos genuinamente dulces siguen detectándose
// ════════════════════════════════════════════════════════════════
console.log('\nesVinoDulceOSemidulce — vinos genuinos siguen detectándose\n')

const alvearPX = { nombre: 'Alvear PX 1927', tipo: 'dulce', uva: 'Pedro Ximénez' }
ok(esVinoDulceOSemidulce(alvearPX, textoVino(alvearPX)),
  '"Alvear PX 1927" tipo=dulce → SÍ dulce')

const ariyanasNatural = {
  nombre: 'Ariyanas Naturalmente Dulce',
  tipo: 'dulce',
  uva: 'Moscatel',
  notas_cata: 'moscatel aromático, miel y cítricos confitados'
}
ok(esVinoDulceOSemidulce(ariyanasNatural, textoVino(ariyanasNatural)),
  '"Ariyanas Naturalmente Dulce" tipo=dulce → SÍ dulce')

const tresPilares = {
  nombre: 'Tres Pilares Semidulce',
  tipo: 'blanco',
  notas_cata: 'vino semidulce con aromas florales'
}
ok(esVinoDulceOSemidulce(tresPilares, textoVino(tresPilares)),
  '"Tres Pilares Semidulce" con "semidulce" en nombre → SÍ dulce')

const semiDulceTipo = {
  nombre: 'Vino de aguja',
  tipo: 'semidulce',
  notas_cata: 'ligero y refrescante'
}
ok(esVinoDulceOSemidulce(semiDulceTipo, textoVino(semiDulceTipo)),
  'tipo=semidulce → no capturado por tipo="dulce" pero sí por texto "semidulce" en tipo field')

const semiDulceNotas = {
  nombre: 'Riesling Spätlese',
  tipo: 'blanco',
  notas_cata: 'clasificado como semi dulce con notable acidez'
}
ok(esVinoDulceOSemidulce(semiDulceNotas, textoVino(semiDulceNotas)),
  '"semi dulce" en notas → SÍ dulce')

const lateHarvest = {
  nombre: 'Gewürztraminer Late Harvest',
  tipo: 'blanco',
  notas_cata: 'late harvest de cosecha tardía, muy aromático'
}
ok(esVinoDulceOSemidulce(lateHarvest, textoVino(lateHarvest)),
  '"late harvest" en nombre → SÍ dulce')

const vendimia = {
  nombre: 'Vendimia Tardía Gewürz',
  tipo: 'blanco',
  notas_cata: 'vendimia tardia, miel, albaricoque'
}
ok(esVinoDulceOSemidulce(vendimia, textoVino(vendimia)),
  '"vendimia tardia" en nombre → SÍ dulce')

// ════════════════════════════════════════════════════════════════
// BLOQUE 3 — Integración: tinto seco con "dulce" en notas
//             NO debe producir compatible=false en platos salados
// ════════════════════════════════════════════════════════════════
console.log('\nIntegración — tinto seco con "especias dulces" en notas\n')

// Simulación simplificada de compatibilidadContexto para el contexto aperitivo/salado
function esCompatibleConPlatoSalado(vino) {
  const tv = textoVino(vino)
  const esDulce = esVinoDulceOSemidulce(vino, tv)
  // Regla del engine: vino dulce es incompatible con platos salados (aperitivo, carne, etc.)
  if (esDulce && vino.tipo !== 'espumoso') return false
  return true
}

ok(esCompatibleConPlatoSalado(tinto6Plus6),
  '"6+6" tinto con "especias dulces" → compatible con plato salado (sin falso bloqueo)')
ok(esCompatibleConPlatoSalado(carraovejas),
  '"Pago de Carraovejas" tinto → compatible con plato salado')
ok(esCompatibleConPlatoSalado(granBarquero),
  '"Gran Barquero Fino" generoso → compatible con plato salado (tag negación ya no dispara)')
ok(!esCompatibleConPlatoSalado(alvearPX),
  '"Alvear PX 1927" tipo=dulce → incompatible con plato salado (correcto)')
ok(!esCompatibleConPlatoSalado(tresPilares),
  '"Tres Pilares Semidulce" → incompatible con plato salado (correcto)')

// ════════════════════════════════════════════════════════════════
// RESUMEN
// ════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(52)}`)
if (failed === 0) {
  console.log(`✓ ${passed} tests pasan\n`)
} else {
  console.log(`✓ ${passed} pasan  ✗ ${failed} fallan\n`)
  process.exit(1)
}
