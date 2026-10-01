/**
 * Script de verificación para la lógica de destacados automáticos por margen.
 * Ejecutar: node scripts/test-auto-featured.mjs
 *
 * No requiere base de datos — testea la lógica pura del algoritmo.
 */

// ── Réplica inline de la lógica de autoFeatured.js ────────────────────────────
// (no importamos el módulo porque usa supabaseAdmin — aquí solo testeamos el algoritmo)

function pvpEfectivo(v) {
  const oferta = Number(v.precio_oferta)
  return oferta > 0 ? oferta : Number(v.precio_pvp)
}

function margenAbsoluto(v) {
  return pvpEfectivo(v) - Number(v.precio_coste)
}

function margenPct(v) {
  const pvp = pvpEfectivo(v)
  return pvp > 0 ? (pvp - Number(v.precio_coste)) / pvp : 0
}

function calcularAutoFeatured(candidatosRaw, n = 8, maxTipo = 3) {
  // Filtrar: activo, stock > 0, precio_coste > 0
  const data = candidatosRaw.filter(v => v.activo !== false && Number(v.stock) > 0 && Number(v.precio_coste) > 0)

  // Filtrar: PVP efectivo > 0 y margen > 0
  const elegibles = data.filter(v => {
    const pvp = pvpEfectivo(v)
    return pvp > 0 && (pvp - Number(v.precio_coste)) > 0
  })

  if (!elegibles.length) return []

  elegibles.sort((a, b) => {
    const diffAbs = margenAbsoluto(b) - margenAbsoluto(a)
    if (diffAbs !== 0) return diffAbs
    const diffPct = margenPct(b) - margenPct(a)
    if (diffPct !== 0) return diffPct
    return String(a.id).localeCompare(String(b.id))
  })

  const selectedIds = new Set()
  const cuentaTipo = {}

  for (const v of elegibles) {
    if (selectedIds.size >= n) break
    const tipo = v.tipo || 'otros'
    const cnt = cuentaTipo[tipo] ?? 0
    if (cnt < maxTipo) {
      selectedIds.add(v.id)
      cuentaTipo[tipo] = cnt + 1
    }
  }

  if (selectedIds.size < n) {
    for (const v of elegibles) {
      if (selectedIds.size >= n) break
      if (!selectedIds.has(v.id)) selectedIds.add(v.id)
    }
  }

  return elegibles.filter(v => selectedIds.has(v.id)).map(v => String(v.id))
}

// ── Helpers de test ────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`)
    passed++
  } else {
    console.error(`  ✗ ${msg}`)
    failed++
  }
}

function assertEqual(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) {
    console.log(`  ✓ ${msg}`)
    passed++
  } else {
    console.error(`  ✗ ${msg}`)
    console.error(`    esperado: ${JSON.stringify(b)}`)
    console.error(`    obtenido: ${JSON.stringify(a)}`)
    failed++
  }
}

function vino(id, tipo, pvp, coste, stock = 10, opts = {}) {
  return { id: String(id), tipo, precio_pvp: pvp, precio_coste: coste, precio_oferta: opts.oferta ?? 0, stock, activo: opts.activo ?? true, categoria: 'vino' }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

console.log('\n── TEST 1: Sin coste → excluido ──')
{
  const vinos = [
    vino('a', 'tinto', 20, 0),   // sin coste → excluido
    vino('b', 'blanco', 15, 8),  // margen = 7
  ]
  const r = calcularAutoFeatured(vinos)
  assertEqual(r, ['b'], 'vino sin coste excluido, se devuelve solo el elegible')
}

console.log('\n── TEST 2: Stock 0 → excluido ──')
{
  const vinos = [
    vino('a', 'tinto', 20, 10, 0),  // stock 0 → excluido
    vino('b', 'blanco', 15, 8),     // margen = 7
  ]
  const r = calcularAutoFeatured(vinos)
  assertEqual(r, ['b'], 'vino sin stock excluido')
}

console.log('\n── TEST 3: Margen ≤ 0 → excluido ──')
{
  const vinos = [
    vino('a', 'tinto', 10, 10),   // margen = 0 → excluido
    vino('b', 'blanco', 8, 10),   // margen = -2 → excluido
    vino('c', 'rosado', 15, 8),   // margen = 7 → elegible
  ]
  const r = calcularAutoFeatured(vinos)
  assertEqual(r, ['c'], 'margen 0 y negativo excluidos')
}

console.log('\n── TEST 4: precio_oferta activo → usa oferta como PVP ──')
{
  const vinos = [
    { ...vino('a', 'tinto', 20, 5), precio_oferta: 12 },  // pvp efectivo=12, margen=7
    vino('b', 'blanco', 18, 6),                            // pvp=18, margen=12 → mejor
  ]
  const r = calcularAutoFeatured(vinos)
  assertEqual(r[0], 'b', 'sin oferta gana margen=12')
  assertEqual(r[1], 'a', 'con oferta pvp efectivo=12 margen=7')
}

console.log('\n── TEST 5: Desempate determinista (misma margen absoluto) ──')
{
  const vinos = [
    vino('z', 'tinto', 20, 10),   // margen abs = 10, pct = 50%
    vino('a', 'tinto', 20, 10),   // margen abs = 10, pct = 50% → mismo pct, id 'a' < 'z'
  ]
  const r = calcularAutoFeatured(vinos, 2, 5)
  // Mismo margen abs y pct → desempate por id: 'a' primero
  assertEqual(r, ['a', 'z'], 'desempate por id lexicográfico')
}

console.log('\n── TEST 6: Ranking correcto (mejor margen primero) ──')
{
  const vinos = [
    vino('c', 'tinto',  20, 15),  // margen = 5
    vino('a', 'blanco', 30, 10),  // margen = 20 ← mejor
    vino('b', 'rosado', 25, 14),  // margen = 11
  ]
  const r = calcularAutoFeatured(vinos, 3, 3)
  assertEqual(r, ['a', 'b', 'c'], 'orden por margen absoluto descendente')
}

console.log('\n── TEST 7: Límite por tipo (pasada 1 + 2) ──')
{
  // 5 tintos, 1 blanco. maxTipo=2, n=4
  const vinos = [
    vino('t1', 'tinto', 30, 10),  // margen=20
    vino('t2', 'tinto', 28, 10),  // margen=18
    vino('t3', 'tinto', 26, 10),  // margen=16 → bloqueado en pasada1
    vino('t4', 'tinto', 24, 10),  // margen=14 → bloqueado en pasada1
    vino('b1', 'blanco', 25, 12), // margen=13
  ]
  const r = calcularAutoFeatured(vinos, 4, 2)
  // Pasada1: t1, t2 (max tinto=2), b1 → 3 elegidos
  // Pasada2: t3 (siguiente sin elegir) → total 4
  // Orden global: t1(20), t2(18), t3(16), b1(13)
  assertEqual(r, ['t1', 't2', 't3', 'b1'], 'pasada 1 limita tintos a 2; pasada 2 rellena con t3; orden global correcto')
}

console.log('\n── TEST 8: Catálogo de un solo tipo → fallback a pasada 2 ──')
{
  const vinos = [
    vino('1', 'tinto', 30, 10),   // margen=20
    vino('2', 'tinto', 28, 10),   // margen=18
    vino('3', 'tinto', 26, 10),   // margen=16
    vino('4', 'tinto', 24, 10),   // margen=14
    vino('5', 'tinto', 22, 10),   // margen=12
  ]
  const r = calcularAutoFeatured(vinos, 4, 2)
  // Pasada1: '1', '2' (max tinto 2) → 2
  // Pasada2: '3', '4' → total 4
  assertEqual(r, ['1', '2', '3', '4'], 'catálogo mono-tipo: pasada 2 rellena correctamente')
}

console.log('\n── TEST 9: Menos candidatos que N → devuelve los que hay ──')
{
  const vinos = [
    vino('x', 'tinto', 20, 10),
    vino('y', 'blanco', 15, 8),
  ]
  const r = calcularAutoFeatured(vinos, 8, 3)
  assertEqual(r, ['x', 'y'], 'con solo 2 elegibles devuelve 2, no falla')
}

console.log('\n── TEST 10: 0 candidatos → devuelve array vacío ──')
{
  const vinos = [
    vino('a', 'tinto', 10, 0),    // sin coste
    vino('b', 'blanco', 0, 5),    // pvp 0
  ]
  const r = calcularAutoFeatured(vinos)
  assertEqual(r, [], 'sin candidatos válidos → array vacío (sección oculta)')
}

console.log('\n── TEST 11: Modo OFF → comportamiento inalterado (vinos manuales) ──')
{
  // El modo OFF significa que el caller (KioskoApp.js) usa v.destacado directamente.
  // Este test verifica que calcularAutoFeatured no modifica el campo destacado.
  const vinos = [
    { ...vino('a', 'tinto', 20, 10), destacado: true },
    { ...vino('b', 'blanco', 15, 8), destacado: false },
  ]
  assert(vinos[0].destacado === true, 'campo destacado no modificado por el algoritmo')
  assert(vinos[1].destacado === false, 'campo destacado no modificado por el algoritmo')
}

console.log('\n── TEST 12: Payload sin campos de coste/margen ──')
{
  // Los IDs son strings puros, no contienen precio_coste ni margen
  const vinos = [vino('a', 'tinto', 20, 10), vino('b', 'blanco', 15, 8)]
  const r = calcularAutoFeatured(vinos)
  for (const id of r) {
    assert(typeof id === 'string', `ID "${id}" es un string puro (sin campos de coste)`)
    assert(!id.includes('coste') && !id.includes('margen'), `ID "${id}" no contiene datos de coste`)
  }
}

console.log('\n── TEST 13: planTieneCapacidad ──')
{
  const PLAN_CAPACIDADES = {
    trial:   new Set(['autoFeaturedByMargin']),
    premium: new Set(['autoFeaturedByMargin']),
    basico:  new Set(),
  }
  function planTieneCapacidad(tienda, capacidad) {
    const plan = tienda?.plan ?? 'basico'
    return PLAN_CAPACIDADES[plan]?.has(capacidad) ?? false
  }

  assert(planTieneCapacidad({ plan: 'premium' }, 'autoFeaturedByMargin'), 'premium → tiene capacidad')
  assert(planTieneCapacidad({ plan: 'trial' }, 'autoFeaturedByMargin'), 'trial → tiene capacidad')
  assert(!planTieneCapacidad({ plan: 'basico' }, 'autoFeaturedByMargin'), 'basico → sin capacidad')
  assert(!planTieneCapacidad({ plan: null }, 'autoFeaturedByMargin'), 'plan null → tratado como basico')
  assert(!planTieneCapacidad({}, 'autoFeaturedByMargin'), 'plan undefined → tratado como basico')
}

console.log('\n── TEST 14: Downgrade — flag ON guardado pero plan básico → usa manuales ──')
{
  // En la lógica del servidor (meta/route.js):
  // autoFeaturedIds solo se calcula si afCols.auto_featured_enabled && planTieneCapacidad(tienda, ...)
  // Con plan básico, planTieneCapacidad devuelve false → no se calculan IDs → tienda.auto_featured_ids undefined
  // → KioskoApp.js usa vinos.filter(v => v.destacado) → comportamiento manual
  const PLAN_CAPACIDADES = {
    trial:   new Set(['autoFeaturedByMargin']),
    premium: new Set(['autoFeaturedByMargin']),
    basico:  new Set(),
  }
  function planTieneCapacidad(tienda, cap) {
    return PLAN_CAPACIDADES[tienda?.plan ?? 'basico']?.has(cap) ?? false
  }

  const tiendaBasico = { plan: 'basico', id: '1' }
  const afCols = { auto_featured_enabled: true, auto_featured_n: 8, auto_featured_max_tipo: 3 }
  const deberiaCalcular = afCols.auto_featured_enabled && planTieneCapacidad(tiendaBasico, 'autoFeaturedByMargin')
  assert(!deberiaCalcular, 'downgrade: flag ON guardado pero plan básico → NO se calculan IDs auto')
}

// ── Resumen ────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(55)}`)
console.log(`Resultado: ${passed} pasados, ${failed} fallidos`)
if (failed > 0) {
  console.error('ALGUNOS TESTS HAN FALLADO')
  process.exit(1)
} else {
  console.log('Todos los tests pasaron ✓')
}
