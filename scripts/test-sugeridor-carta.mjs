/**
 * Tests para generarSugerencias() — modal "Propuesta automática" del Simulador.
 *
 * La función se reproduce inline con inyección de analizarFn para poder
 * controlar cobertura de forma determinista sin depender del motor real.
 *
 * Escenarios:
 *   (a) Greedy set-cover no sugiere un segundo vino redundante si el primero ya cubrió todo
 *   (b) Sin huérfanos: cae al segundo nivel (platos con poca cobertura vs. media)
 *   (c) Fino/Generoso y Galicia-Rías Baixas no pueden aparecer — no hay comparación de tipo/región
 *
 * Ejecutar: node scripts/test-sugeridor-carta.mjs
 */

let passed = 0
let failed = 0

function ok(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); passed++ }
  else { console.error(`  ✗ FALLO: ${label}`); failed++ }
}

// ── Reproducción del algoritmo (copia fiel de app/lib/sugerirCarta.js) ────────

function platoTexto(p) {
  return [p.nombre, p.categoria, p.descripcion].filter(Boolean).join(' ')
}

function vinoParaEngine(v, precioCampo) {
  const precio = Number(v[precioCampo]) > 0 ? Number(v[precioCampo]) : 20
  return { ...v, activo: true, stock: null, precio_botella: precio }
}

function generarSugerencias(lineas, catalogo, platos, { analizarFn }) {
  const activas = lineas.filter(l => l.estado !== 'fuera')
  const enBorrador = new Set(activas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))
  const vinosCarta = activas.map(l => vinoParaEngine(l, 'precio_botella'))
  const platosActivos = (platos || []).filter(p => p.activo !== false)

  if (!platosActivos.length || !catalogo.length) return { anadir: [], sustituir: [] }

  const coberturaCarta = platosActivos.map(p => {
    if (!vinosCarta.length) return { plato: p, count: 0 }
    try {
      const a = analizarFn(platoTexto(p), vinosCarta)
      return { plato: p, count: a.candidatos.length }
    } catch { return { plato: p, count: 0 } }
  })

  const orphans = coberturaCarta.filter(x => x.count === 0).map(x => x.plato)
  let targetPlatos, isSecondLevel

  if (orphans.length > 0) {
    targetPlatos = orphans
    isSecondLevel = false
  } else {
    const mean = coberturaCarta.reduce((s, x) => s + x.count, 0) / coberturaCarta.length
    targetPlatos = coberturaCarta
      .filter(x => x.count < mean)
      .sort((a, b) => a.count - b.count)
      .map(x => x.plato)
    isSecondLevel = true
  }

  if (!targetPlatos.length) return { anadir: [], sustituir: [] }

  const candidatos = catalogo.filter(v => !enBorrador.has(v.id))
  const coverageMap = new Map()
  for (const v of candidatos) {
    const vinoObj = vinoParaEngine(v, 'pvp_recomendado')
    const cubiertos = new Set()
    for (const p of targetPlatos) {
      try {
        const a = analizarFn(platoTexto(p), [vinoObj])
        if (a.candidatos.length > 0) cubiertos.add(p.id)
      } catch {}
    }
    if (cubiertos.size > 0) coverageMap.set(v.id, { vino: v, cubiertos })
  }

  const sugsAnadir = []
  const resueltos = new Set()

  while (sugsAnadir.length < 8) {
    let bestId = null, bestNuevos = null
    for (const [id, { cubiertos }] of coverageMap) {
      const nuevos = [...cubiertos].filter(pid => !resueltos.has(pid))
      if (!bestNuevos || nuevos.length > bestNuevos.length) {
        bestId = id
        bestNuevos = nuevos
      }
    }
    if (!bestId || bestNuevos.length === 0) break

    const { vino } = coverageMap.get(bestId)
    const nombresPlatos = bestNuevos
      .slice(0, 3)
      .map(pid => targetPlatos.find(p => p.id === pid)?.nombre)
      .filter(Boolean)
      .join(', ')
    const masPlatos = bestNuevos.length > 3 ? ` y ${bestNuevos.length - 3} más` : ''

    sugsAnadir.push({
      key: vino.id,
      vino,
      razon: isSecondLevel
        ? `Amplía cobertura de ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} con poca oferta: ${nombresPlatos}${masPlatos}`
        : `Cubre ${bestNuevos.length} plato${bestNuevos.length !== 1 ? 's' : ''} sin vino: ${nombresPlatos}${masPlatos}`,
      prioridad: bestNuevos.length,
    })

    bestNuevos.forEach(pid => resueltos.add(pid))
    coverageMap.delete(bestId)
  }

  return { anadir: sugsAnadir, sustituir: [] }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// _cartaWine: true permite que el mock distinga carta vs catálogo
function linea(id, tipo, region, estado = 'actual') {
  return { id, tipo, region, estado, catalogo_vino_id: null, precio_botella: 20, _cartaWine: true }
}

function catVino(id, nombre, tipo, region) {
  return { id, nombre, tipo, region, pvp_recomendado: 20 }
}

function plato(id, nombre, categoria = 'principal') {
  return { id, nombre, categoria, activo: true }
}

/**
 * Construye un mock determinista para analizarFn.
 *
 * @param {Function} cartaCountFn  (texto) → número de vinos de carta compatibles
 * @param {Function} catalogCompatFn (vinoId, texto) → boolean — ¿este candidato cubre este plato?
 */
function makeMock(cartaCountFn, catalogCompatFn) {
  return function analizarFn(texto, wines) {
    // Carta: al menos uno de los vinos tiene _cartaWine = true
    if (wines.some(w => w._cartaWine)) {
      const count = cartaCountFn(texto)
      return {
        candidatos: Array.from({ length: count }, (_, i) => ({ compatible: true, score: 80 - i })),
        recomendados: [],
      }
    }
    // Catálogo: único vino sin _cartaWine
    const vino = wines[0]
    const compatible = catalogCompatFn(vino.id, texto)
    return {
      candidatos: compatible ? [{ vino, compatible: true, score: 80 }] : [],
      recomendados: [],
    }
  }
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 1 — Caso (a): greedy no sugiere segundo vino redundante
//
// 2 platos postres → huérfanos (la carta solo tiene 1 tinto, no compatible con postres)
// Catálogo: vino A (dulce) y vino B (dulce) cubren ambos postres
// Greedy: elige A (cubre 2), marca ambos como resueltos → B aporta 0 → no se sugiere
// ════════════════════════════════════════════════════════════════
console.log('\n(a) greedy set-cover — sin sugerencias redundantes\n')

{
  const carta = [linea('l1', 'tinto', 'Rioja')]
  const cat = [
    catVino('v1', 'Moscatel de Chiclana', 'dulce', 'Cádiz'),
    catVino('v2', 'Pedro Ximénez Noe',    'dulce', 'Montilla-Moriles'),
  ]
  const platos = [
    plato(1, 'Tarta de chocolate', 'postre'),
    plato(2, 'Fresas con nata',    'postre'),
    plato(3, 'Croquetas',          'entrante'),
  ]

  const analizarFn = makeMock(
    (texto) => texto.includes('entrante') ? 1 : 0, // postres: 0 carta wines; entrantes: 1
    (vinoId, texto) => ['v1', 'v2'].includes(vinoId) && texto.includes('postre'), // ambos dulces cubren postres
  )

  const res = generarSugerencias(carta, cat, platos, { analizarFn })

  ok(res.anadir.length === 1, 'Greedy sugiere exactamente 1 vino (v2 ya no aporta nada nuevo)')
  ok(['v1', 'v2'].includes(res.anadir[0].key), 'El vino sugerido es v1 o v2 (ambos equivalentes)')
  ok(res.anadir[0].razon.includes('2 platos sin vino'), `Motivo dice "2 platos sin vino": "${res.anadir[0].razon}"`)
  ok(
    res.anadir[0].razon.includes('Tarta de chocolate') || res.anadir[0].razon.includes('Fresas con nata'),
    'Motivo incluye nombre de al menos un plato huérfano'
  )
  ok(res.sustituir.length === 0, 'sustituir siempre vacío')
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 2 — Caso (a): greedy con solapamiento parcial
//
// 3 platos huérfanos. Vino A cubre [1,2], B cubre [2,3], C cubre [1,3].
// Greedy (orden Map = inserción): A → cubre [1,2] → quedan [3] → B o C → 2 sugerencias.
// El 3er vino no añade ningún plato nuevo → no se incluye.
// ════════════════════════════════════════════════════════════════
console.log('\n(a) greedy con solapamiento parcial — 3 platos, 2 sugerencias\n')

{
  const carta = [linea('l1', 'tinto', 'Rioja')]
  const cat = [
    catVino('A', 'Vino A', 'blanco', 'Rueda'),
    catVino('B', 'Vino B', 'blanco', 'Galicia'),
    catVino('C', 'Vino C', 'blanco', 'Ribeiro'),
  ]
  const platos = [plato(1, 'Plato 1'), plato(2, 'Plato 2'), plato(3, 'Plato 3')]

  const coberturas = {
    A: ['Plato 1', 'Plato 2'],
    B: ['Plato 2', 'Plato 3'],
    C: ['Plato 1', 'Plato 3'],
  }

  const analizarFn = makeMock(
    () => 0, // todos los platos son huérfanos en carta
    (vinoId, texto) => (coberturas[vinoId] || []).some(nombre => texto.includes(nombre)),
  )

  const res = generarSugerencias(carta, cat, platos, { analizarFn })

  ok(res.anadir.length === 2, `Greedy necesita exactamente 2 vinos para cubrir 3 platos (obtuvo ${res.anadir.length})`)

  // Los 2 vinos sugeridos deben cubrir los 3 platos distintos en total
  const platosNombres = ['Plato 1', 'Plato 2', 'Plato 3']
  const cubiertosPor = (key) => coberturas[key] || []
  const cubiertos = new Set(res.anadir.flatMap(s => cubiertosPor(s.key)))
  ok(
    platosNombres.every(n => cubiertos.has(n)),
    `Las 2 sugerencias cubren los 3 platos (cubiertos: ${[...cubiertos]})`
  )

  const keys = res.anadir.map(s => s.key)
  const terceroEsRedundante = ['A', 'B', 'C'].filter(k => !keys.includes(k))
  ok(terceroEsRedundante.length === 1, `El tercer vino (${terceroEsRedundante}) se omite por ser redundante`)
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 3 — Caso (b): sin huérfanos → segundo nivel
//
// Carta: 2 tintos + 1 blanco. Principales tienen 2 tintos (alta cobertura).
// Entrantes tienen 1 blanco (baja cobertura). Media = (2+2+1+1)/4 = 1.5.
// Entrantes (count=1) < media → son los objetivos del segundo nivel.
// Catálogo: 1 espumoso que cubre los entrantes.
// ════════════════════════════════════════════════════════════════
console.log('\n(b) segundo nivel — todos los platos tienen algún vino, caemos a baja cobertura\n')

{
  const carta = [
    linea('l1', 'tinto', 'Rioja'),
    linea('l2', 'tinto', 'Ribera del Duero'),
    linea('l3', 'blanco', 'Rueda'),
  ]
  const cat = [catVino('cx1', 'Cava Brut Nature', 'espumoso', 'Cava')]
  const platos = [
    plato(10, 'Rabo de toro',      'principal'),
    plato(11, 'Carrillada ibérica','principal'),
    plato(12, 'Croquetas',         'entrante'),
    plato(13, 'Berberechos',       'entrante'),
  ]

  // principales: 2 tintos compatible → count=2
  // entrantes: 1 blanco compatible → count=1
  // media = (2+2+1+1)/4 = 1.5 → entrantes están por debajo
  const analizarFn = makeMock(
    (texto) => texto.includes('principal') ? 2 : 1,
    (vinoId, texto) => vinoId === 'cx1' && texto.includes('entrante'),
  )

  const res = generarSugerencias(carta, cat, platos, { analizarFn })

  ok(res.anadir.length > 0, 'Hay sugerencias aunque no haya huérfanos (segundo nivel activo)')
  ok(res.anadir[0].razon.includes('poca oferta'), `Motivo indica segundo nivel: "${res.anadir[0].razon}"`)
  ok(
    res.anadir[0].razon.includes('Croquetas') || res.anadir[0].razon.includes('Berberechos'),
    'Motivo menciona platos de baja cobertura'
  )
  ok(
    !res.anadir.some(s => s.razon.includes('Rabo') || s.razon.includes('Carrillada')),
    'Platos con alta cobertura (Rabo de toro, Carrillada) no aparecen en la propuesta'
  )
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 4 — Caso (c): Fino/Generoso y Galicia-Rías Baixas
//
// La nueva lógica no compara tipo ni región como strings.
// Un catálogo con 'fino' y 'Galicia - Rías Baixas' que no cubre ningún plato
// → no aparece en la propuesta, y ningún motivo menciona "Sin Fino" o "Galicia".
// ════════════════════════════════════════════════════════════════
console.log('\n(c) Fino/Generoso y Galicia-Rías Baixas no generan falso positivo\n')

{
  const carta = [
    linea('l1', 'tinto',    'Rioja'),
    linea('l2', 'generoso', 'Jerez'), // Gran Barquero Fino (tipo=generoso en la carta)
  ]
  const cat = [
    catVino('fino1',    'Arroyuelo Fino',    'fino',   'Jerez-Xérès-Sherry'),      // Bug 1 original
    catVino('albamar1', 'Albamar Albariño',  'blanco', 'Galicia - Rías Baixas'),   // Bug 2 original
  ]
  const platos = [
    plato(20, 'Jamón ibérico', 'aperitivo'),
    plato(21, 'Queso manchego','aperitivo'),
  ]

  // Todos los platos tienen buena cobertura de carta (no hay huérfanos)
  // Los candidatos del catálogo no cubren ningún plato (coverage=0)
  const analizarFn = makeMock(
    () => 2,  // todos los platos: 2 carta wines compatibles
    () => false, // ningún candidato cubre nada
  )

  const res = generarSugerencias(carta, cat, platos, { analizarFn })

  ok(!res.anadir.some(s => s.key === 'fino1'),
    '"Arroyuelo Fino" (tipo=fino) no aparece — el tipo ya no se compara como string')
  ok(!res.anadir.some(s => s.key === 'albamar1'),
    '"Albamar" (Galicia - Rías Baixas) no aparece — la región ya no se compara como string')
  ok(!res.anadir.some(s => s.razon?.includes('Sin Fino')),
    'Ningún motivo contiene "Sin Fino en la carta"')
  ok(!res.anadir.some(s => s.razon?.includes('Galicia')),
    'Ningún motivo contiene "Sin Blanco de Galicia"')
}

// ════════════════════════════════════════════════════════════════
// BLOQUE 5 — Casos borde
// ════════════════════════════════════════════════════════════════
console.log('\nCasos borde\n')

{
  const mockVacio = makeMock(() => 0, () => false)
  const ps = [plato(1, 'Croquetas')]
  const carta = [linea('l1', 'tinto', 'Rioja')]

  const r1 = generarSugerencias(carta, [], ps, { analizarFn: mockVacio })
  ok(r1.anadir.length === 0 && r1.sustituir.length === 0, 'Catálogo vacío → resultado vacío')

  const r2 = generarSugerencias(carta, [catVino('v1', 'Test', 'blanco', 'Rueda')], [], { analizarFn: mockVacio })
  ok(r2.anadir.length === 0, 'Sin platos → resultado vacío')

  // Vino ya en borrador → no se sugiere aunque cubra platos
  const cartaConBorrador = [{ ...linea('l1', 'tinto', 'Rioja'), catalogo_vino_id: 'v_cat' }]
  const mockCubre = makeMock(() => 0, () => true)
  const r3 = generarSugerencias(
    cartaConBorrador,
    [catVino('v_cat', 'Ya en borrador', 'blanco', 'Rueda')],
    [plato(1, 'Croquetas')],
    { analizarFn: mockCubre }
  )
  ok(r3.anadir.length === 0, 'Vino ya en borrador no se sugiere aunque sea compatible')
}

// ════════════════════════════════════════════════════════════════
// RESUMEN
// ════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`)
if (failed === 0) {
  console.log(`✓ ${passed} tests pasan\n`)
} else {
  console.log(`✓ ${passed} pasan  ✗ ${failed} fallan\n`)
  process.exit(1)
}
