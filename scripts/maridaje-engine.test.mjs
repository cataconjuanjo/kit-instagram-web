/**
 * Motor unit tests — no API, no Supabase.
 * Ejecutar: node --experimental-detect-module --test scripts/maridaje-engine.test.mjs
 *
 * Cubre:
 *  (a) contexto ES/EN — misma familia para platos equivalentes
 *  (b) postre → dulce top, fino/manzanilla fuera de candidatos
 *  (c) pescado (calamar) → tinto fuera de candidatos
 *  (d) Más ajustado siempre ≥ 60% del score de Mi elección
 *  (e) señal de presupuesto → Mi elección = vino más barato
 *  (f) 2 candidatos → máximo 2 vinos en la selección final
 *  (g) contextoDesdeCategoria — mapeo de categoria DB
 *  (h) exclusión dura por tipo (nota_cliente) — filtro ANTES del motor
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analizarMaridaje, contextoMaridaje, contextoDesdeCategoria } from '../app/lib/maridajeEngine.js'
import { seleccionarVinosConRoles, SCORE_MINIMO_RECOMENDACION } from '../app/lib/wineSelection.mjs'
import { detectarExclusionTipoVino } from '../app/lib/textFilters.mjs'

// ── Mock wines ────────────────────────────────────────────────────────────────
// minimal fields: id, nombre, tipo, precio_botella, uva, notas_cata
// No activo/stock set → pass the analizarMaridaje filter (activo !== false, stock !== 0)
const W_TINTO_JOVEN   = { id: 't1', nombre: 'Tinto Joven',   tipo: 'tinto',    precio_botella: 18, precio_copa: 3.5, uva: 'tempranillo',       notas_cata: 'fruta roja jugoso',            region: 'Rioja' }
const W_TINTO_RESERVA = { id: 't2', nombre: 'Tinto Reserva', tipo: 'tinto',    precio_botella: 35, precio_copa: 7,   uva: 'tempranillo cabernet', notas_cata: 'fruta negra especias roble',  region: 'Ribera del Duero' }
const W_BLANCO        = { id: 'b1', nombre: 'Blanco Fresco',  tipo: 'blanco',   precio_botella: 20, precio_copa: 4,   uva: 'verdejo',             notas_cata: 'citrico fresco mineral',      region: 'Rueda' }
const W_FINO          = { id: 'g1', nombre: 'Fino Seco',      tipo: 'generoso', precio_botella: 12, precio_copa: 2.5, uva: 'palomino',            notas_cata: 'fino salino seco amargo',     region: 'Jerez' }
const W_PX            = { id: 'd1', nombre: 'Pedro Ximenez',  tipo: 'dulce',    precio_botella: 22, precio_copa: 5,   uva: 'pedro ximenez',       notas_cata: 'dulce pasas higo miel',       region: 'Jerez' }

const MOCK_WINES = [W_TINTO_JOVEN, W_TINTO_RESERVA, W_BLANCO, W_FINO, W_PX]

// ── (a) Contexto ES/EN ────────────────────────────────────────────────────────
describe('(a) contexto ES/EN — paridad de platos equivalentes', () => {
  it('Rabo de toro y Braised oxtail → mismo contexto "carne"', () => {
    assert.equal(contextoMaridaje('Rabo de toro'), 'carne')
    assert.equal(contextoMaridaje('Braised oxtail'), 'carne')
  })

  it('Calamar a la plancha y Grilled squid → mismo contexto "pescado"', () => {
    assert.equal(contextoMaridaje('Calamar a la plancha'), 'pescado')
    assert.equal(contextoMaridaje('Grilled squid'), 'pescado')
  })

  it('Tarta de queso y Cheesecake → mismo contexto "postre"', () => {
    assert.equal(contextoMaridaje('Tarta de queso artesana'), 'postre')
    assert.equal(contextoMaridaje('Artisan cheesecake'), 'postre')
  })
})

// ── (b) Postre → dulce top, fino/manzanilla bloqueado ────────────────────────
describe('(b) postre → dulce top, generoso seco fuera de candidatos', () => {
  it('para tarta de queso el PX (dulce) está en candidatos', () => {
    const { candidatos } = analizarMaridaje('Tarta de queso artesana', MOCK_WINES)
    const ids = candidatos.map(c => c.vino.id)
    assert.ok(ids.includes('d1'), `El PX (dulce) debe estar en candidatos. Candidatos: ${ids.join(', ')}`)
  })

  it('para tarta de queso el fino (generoso seco) NO está en candidatos', () => {
    const { candidatos } = analizarMaridaje('Tarta de queso artesana', MOCK_WINES)
    const ids = candidatos.map(c => c.vino.id)
    assert.ok(!ids.includes('g1'), `El fino NO debe estar en candidatos para postre. Candidatos: ${ids.join(', ')}`)
  })

  it('para tarta de queso el dulce tiene el score más alto entre los candidatos', () => {
    const { candidatos } = analizarMaridaje('Tarta de queso artesana', MOCK_WINES)
    if (!candidatos.length) return // skip si no hay candidatos (won't happen with PX)
    const maxScore = Math.max(...candidatos.map(c => c.score))
    const pxScore = candidatos.find(c => c.vino.id === 'd1')?.score ?? -999
    assert.ok(
      pxScore >= maxScore * 0.99,
      `PX score (${pxScore.toFixed(1)}) debería ser el más alto (max=${maxScore.toFixed(1)})`
    )
  })
})

// ── (c) Pescado → tinto bloqueado ────────────────────────────────────────────
// Nota: "calamar a la plancha" activa metodo.brasa (plancha está en la lista)
// lo que justifica tinto según Chartier. Para testear el bloqueo de tinto
// usamos lubina hervida (sin técnica que justifique tinto).
describe('(c) pescado sin brasa → tinto fuera de candidatos', () => {
  it('para lubina hervida los tintos NO están en candidatos', () => {
    const { candidatos } = analizarMaridaje('Lubina hervida', MOCK_WINES)
    const tintos = candidatos.filter(c => c.vino.tipo === 'tinto')
    assert.equal(
      tintos.length,
      0,
      `No debe haber tintos para pescado sin brasa. Tintos: ${tintos.map(c => c.vino.nombre).join(', ')}`
    )
  })

  it('para lubina hervida el blanco o el fino están en candidatos', () => {
    const { candidatos } = analizarMaridaje('Lubina hervida', MOCK_WINES)
    const blancoOFino = candidatos.filter(c => c.vino.tipo === 'blanco' || c.vino.tipo === 'generoso')
    assert.ok(
      blancoOFino.length >= 1,
      `Debe haber al menos un blanco o generoso para lubina. Candidatos: ${candidatos.map(c => c.vino.nombre).join(', ')}`
    )
  })

  it('para calamar a la plancha el contexto sí es "pescado"', () => {
    // "plancha" activa metodo.brasa (justificación Chartier para tinto en pescado)
    // pero el contexto base sigue siendo "pescado"
    assert.equal(contextoMaridaje('Calamar a la plancha'), 'pescado')
  })
})

// ── (d) Más ajustado ≥ 60% del score de Mi elección ─────────────────────────
describe('(d) Más ajustado siempre ≥ 60% del threshold relativo', () => {
  it('vino con score < 60% del mejor no recibe rol Más ajustado', () => {
    const vino_caro  = { id: 'va', nombre: 'Vino A', tipo: 'tinto', precio_botella: 40, precio_copa: 8 }
    const vino_medio = { id: 'vb', nombre: 'Vino B', tipo: 'tinto', precio_botella: 25, precio_copa: 5 }
    const vino_debil = { id: 'vc', nombre: 'Vino C', tipo: 'tinto', precio_botella: 15, precio_copa: 3 }

    const candidatos = [
      { vino: vino_caro,  score: 40, compatible: true },
      { vino: vino_medio, score: 30, compatible: true },
      { vino: vino_debil, score: 5,  compatible: true },  // 5 < 40 * 0.6 = 24 → excluido
    ]
    const roles = seleccionarVinosConRoles(candidatos)
    const nombresConRol = roles.map(r => r.item.vino.id)
    assert.ok(!nombresConRol.includes('vc'), `Vino C (score 5) no debe aparecer. Roles: ${nombresConRol.join(', ')}`)
  })

  it('todos los roles tienen score ≥ 60% del Mi elección', () => {
    const candidatos = [
      { vino: { id: 'x1', nombre: 'X1', tipo: 'tinto', precio_botella: 40, precio_copa: 8 }, score: 38 },
      { vino: { id: 'x2', nombre: 'X2', tipo: 'tinto', precio_botella: 30, precio_copa: 6 }, score: 25 },
      { vino: { id: 'x3', nombre: 'X3', tipo: 'tinto', precio_botella: 20, precio_copa: 4 }, score: 22 },
    ]
    const roles = seleccionarVinosConRoles(candidatos)
    const eleccion = roles[0].item.score
    for (const r of roles) {
      assert.ok(
        r.item.score >= eleccion * 0.60,
        `Rol "${r.rol}" tiene score ${r.item.score} < ${(eleccion * 0.60).toFixed(1)} (60% de ${eleccion})`
      )
    }
  })
})

// ── (e) Señal de presupuesto → Mi elección = más barato ──────────────────────
describe('(e) señal de presupuesto → Mi elección = vino más económico', () => {
  it('con señalPresupuesto=true el vino más barato queda como Mi elección', () => {
    const candidatos = [
      { vino: { id: 'p1', nombre: 'Caro',    tipo: 'tinto', precio_botella: 40, precio_copa: 8 }, score: 38 },
      { vino: { id: 'p2', nombre: 'Medio',   tipo: 'tinto', precio_botella: 25, precio_copa: 5 }, score: 30 },
      { vino: { id: 'p3', nombre: 'Barato',  tipo: 'tinto', precio_botella: 15, precio_copa: 3 }, score: 22 },
    ]
    const roles = seleccionarVinosConRoles(candidatos, 'es', false, true)
    assert.equal(roles[0].vino?.id ?? roles[0].item?.vino?.id, 'p3',
      `Mi elección debe ser "Barato" (15€). Roles: ${roles.map(r => (r.vino || r.item?.vino)?.nombre).join(', ')}`)
  })

  it('techoPrecio filtra candidatos caros antes de seleccionar', () => {
    const candidatos = [
      { vino: { id: 'q1', nombre: 'Caro',   tipo: 'tinto', precio_botella: 45, precio_copa: 9 }, score: 40 },
      { vino: { id: 'q2', nombre: 'Medio',  tipo: 'tinto', precio_botella: 28, precio_copa: 6 }, score: 35 },
      { vino: { id: 'q3', nombre: 'Barato', tipo: 'tinto', precio_botella: 18, precio_copa: 4 }, score: 25 },
    ]
    const roles = seleccionarVinosConRoles(candidatos, 'es', false, true, 30)
    const idsSeleccionados = roles.map(r => r.item?.vino?.id ?? r.vino?.id)
    assert.ok(!idsSeleccionados.includes('q1'), `Vino de 45€ no debe aparecer con techo de 30€`)
  })
})

// ── (g) contextoDesdeCategoria — mapeo directo de categoria BD ───────────────
describe('(g) contextoDesdeCategoria — mapeo de categoria DB a contexto', () => {
  it('"Carnes" → "carne"', () => assert.equal(contextoDesdeCategoria('Carnes'), 'carne'))
  it('"Pescados y Mariscos" → "pescado"', () => assert.equal(contextoDesdeCategoria('Pescados y Mariscos'), 'pescado'))
  it('"Postres" → "postre"', () => assert.equal(contextoDesdeCategoria('Postres'), 'postre'))
  it('"Entrantes" → "aperitivo"', () => assert.equal(contextoDesdeCategoria('Entrantes'), 'aperitivo'))
  it('"Tapas para compartir" → "aperitivo"', () => assert.equal(contextoDesdeCategoria('Tapas para compartir'), 'aperitivo'))
  it('"Frituras" → "fritura"', () => assert.equal(contextoDesdeCategoria('Frituras'), 'fritura'))
  it('"Quesos" → "queso"', () => assert.equal(contextoDesdeCategoria('Quesos'), 'queso'))
  it('"Arroces" → null (sin contexto específico)', () => assert.equal(contextoDesdeCategoria('Arroces'), null))
  it('"Verduras" → null', () => assert.equal(contextoDesdeCategoria('Verduras'), null))
  it('vacío → null', () => assert.equal(contextoDesdeCategoria(''), null))
  it('"CARNES ROJAS" → "carne" (case insensitive)', () => assert.equal(contextoDesdeCategoria('CARNES ROJAS'), 'carne'))
})

// ── (f) 2 candidatos → máximo 2 vinos en resultado ───────────────────────────
describe('(f) 2 candidatos → resultado de máximo 2 vinos', () => {
  it('con 2 candidatos válidos el resultado tiene máximo 2 elementos', () => {
    const candidatos = [
      { vino: { id: 'f1', nombre: 'Vino1', tipo: 'tinto', precio_botella: 30, precio_copa: 6 }, score: 30 },
      { vino: { id: 'f2', nombre: 'Vino2', tipo: 'tinto', precio_botella: 20, precio_copa: 4 }, score: 25 },
    ]
    const roles = seleccionarVinosConRoles(candidatos)
    assert.ok(roles.length <= 2, `Con 2 candidatos no puede haber más de 2 roles. Longitud: ${roles.length}`)
  })

  it('con 1 candidato el resultado tiene exactamente 1 elemento', () => {
    const candidatos = [
      { vino: { id: 'f3', nombre: 'Solo', tipo: 'blanco', precio_botella: 20, precio_copa: 4 }, score: 20 },
    ]
    const roles = seleccionarVinosConRoles(candidatos)
    assert.equal(roles.length, 1)
    assert.equal(roles[0].rol, 'Mi elección')
  })

  it('con 0 candidatos el resultado es array vacío', () => {
    assert.deepEqual(seleccionarVinosConRoles([]), [])
    assert.deepEqual(seleccionarVinosConRoles(null), [])
  })
})

// ── (h) Exclusión dura por tipo — filtro ANTES del motor ─────────────────────
describe('(h) exclusión dura por tipo — filtro antes del motor', () => {
  it('"que no sea blanco" + ensaladilla → ningún blanco en candidatos', () => {
    const exclusion = detectarExclusionTipoVino('que no sea blanco')
    assert.ok(exclusion.includes('blanco'), `detectarExclusionTipoVino debe devolver 'blanco'. Obtenido: ${exclusion}`)
    const vinosFiltrados = MOCK_WINES.filter(v => !exclusion.includes(v.tipo))
    const { candidatos } = analizarMaridaje('Ensaladilla rusa', vinosFiltrados)
    const blancos = candidatos.filter(c => c.vino.tipo === 'blanco')
    assert.equal(
      blancos.length,
      0,
      `No debe haber blancos tras filtro. Candidatos: ${candidatos.map(c => `${c.vino.nombre}(${c.vino.tipo})`).join(', ')}`
    )
  })

  it('"que no sea tinto" + rabo de toro → ningún tinto en candidatos', () => {
    const exclusion = detectarExclusionTipoVino('que no sea tinto')
    assert.ok(exclusion.includes('tinto'), `detectarExclusionTipoVino debe devolver 'tinto'. Obtenido: ${exclusion}`)
    const vinosFiltrados = MOCK_WINES.filter(v => !exclusion.includes(v.tipo))
    const { candidatos } = analizarMaridaje('Rabo de toro', vinosFiltrados)
    const tintos = candidatos.filter(c => c.vino.tipo === 'tinto')
    assert.equal(
      tintos.length,
      0,
      `No debe haber tintos tras filtro. Candidatos: ${candidatos.map(c => `${c.vino.nombre}(${c.vino.tipo})`).join(', ')}`
    )
  })

  it('"sin espumoso" → espumoso excluido (detectarExclusionTipoVino)', () => {
    const exclusion = detectarExclusionTipoVino('sin espumoso')
    assert.ok(exclusion.includes('espumoso'), `debe excluir espumoso. Obtenido: ${exclusion}`)
  })

  it('"algo fresquito" → no excluye ningún tipo (preferencia suave)', () => {
    const exclusion = detectarExclusionTipoVino('algo fresquito')
    assert.deepEqual(exclusion, [], `preferencia suave no debe excluir nada. Obtenido: ${exclusion}`)
  })
})
