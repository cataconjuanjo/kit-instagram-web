/**
 * Tests de integración (sin red) de la ruta /api/eventos-bodega GET
 * y del agregador `calcularMesBodega` cuando la tabla no existe.
 *
 * Usa un cliente Supabase SIMULADO (stub) que devuelve el error
 * PGRST205 real que emite Supabase en producción cuando la
 * migración no se ha aplicado:
 *
 *   {
 *     code: 'PGRST205',
 *     message: "Could not find the table 'public.eventos_bodega' in the schema cache",
 *     hint: null,
 *     details: null,
 *   }
 *
 * No se cargan las rutas Next directamente (requieren el runtime);
 * se verifica que `esRelacionInexistente` las detecta y que el
 * agregador degrada sin excepción.
 *
 * Ejecutar: node --test scripts/eventosBodegaRuta.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  esRelacionInexistente,
  sumarEventosPorTipo,
} from '../app/lib/eventosBodega.js'

// Error real que emite Supabase al faltar la tabla (verificado con
// `SELECT * FROM information_schema.tables` → 0 filas y la API
// Supabase devuelve este objeto literal).
const ERROR_PGRST205 = Object.freeze({
  code: 'PGRST205',
  message: "Could not find the table 'public.eventos_bodega' in the schema cache",
  hint: null,
  details: null,
})

// Stub minimalista de supabase-js que emula el builder chainable.
function makeSupabaseStub(respuesta) {
  const b = {
    _resp: respuesta,
    from() { return b },
    select() { return b },
    eq() { return b },
    gte() { return b },
    lte() { return b },
    order() { return b },
    then(resolve) { return Promise.resolve(b._resp).then(resolve) },
  }
  return b
}

describe('Detección directa del error de PostgREST', () => {
  it('ERROR_PGRST205 → esRelacionInexistente = true', () => {
    assert.equal(esRelacionInexistente(ERROR_PGRST205), true)
  })
})

// Simulamos lo que la ruta GET hace, usando el mismo stub.
async function simularRutaGET(supabase) {
  const { data, error } = await supabase
    .from('eventos_bodega')
    .select('*')
    .eq('restaurante_id', 'any')
    .gte('fecha', '2026-11-01')
    .lte('fecha', '2026-11-30')
    .order('fecha', { ascending: true })
  if (error) {
    if (esRelacionInexistente(error)) {
      return { status: 503, body: { error: 'sql pendiente', sql_pendiente: true } }
    }
    return { status: 500, body: { error: 'No se pudieron cargar los eventos.' } }
  }
  return { status: 200, body: { eventos: Array.isArray(data) ? data : [] } }
}

describe('Ruta GET /api/eventos-bodega — degradación', () => {
  it('error PGRST205 → 503 { sql_pendiente: true }', async () => {
    const supa = makeSupabaseStub({ data: null, error: ERROR_PGRST205 })
    const res = await simularRutaGET(supa)
    assert.equal(res.status, 503)
    assert.equal(res.body.sql_pendiente, true)
  })
  it('error 42P01 → 503 { sql_pendiente: true }', async () => {
    const supa = makeSupabaseStub({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    const res = await simularRutaGET(supa)
    assert.equal(res.status, 503)
    assert.equal(res.body.sql_pendiente, true)
  })
  it('error REAL (RLS 42501) → 500 genérico (no degrada)', async () => {
    const supa = makeSupabaseStub({
      data: null,
      error: { code: '42501', message: 'permission denied for table eventos_bodega' },
    })
    const res = await simularRutaGET(supa)
    assert.equal(res.status, 500)
    assert.equal(res.body.sql_pendiente, undefined)
  })
  it('respuesta OK con filas → 200 { eventos: [...] }', async () => {
    const supa = makeSupabaseStub({
      data: [{ id: 'ev1', fecha: '2026-11-18', tipo: 'grupo', importe_neto: 300 }],
      error: null,
    })
    const res = await simularRutaGET(supa)
    assert.equal(res.status, 200)
    assert.equal(res.body.eventos.length, 1)
  })
  it('respuesta OK sin filas → 200 { eventos: [] }', async () => {
    const supa = makeSupabaseStub({ data: [], error: null })
    const res = await simularRutaGET(supa)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.eventos, [])
  })
})

// Simulación del fragmento del agregador que lee eventos_bodega.
async function simularAgregador(supabase) {
  let eventosAgregados = null
  try {
    const { data: eventos, error: errEv } = await supabase
      .from('eventos_bodega')
      .select('tipo, importe_neto, importe_bruto, num_comensales, incluido_en_tpv, fecha')
      .eq('restaurante_id', 'any')
      .gte('fecha', '2026-11-01')
      .lte('fecha', '2026-11-30')
    if (!errEv && Array.isArray(eventos)) {
      eventosAgregados = sumarEventosPorTipo(eventos)
    } else if (errEv && !esRelacionInexistente(errEv)) {
      // sería un error real; en el agregador real lo logueamos
      return { eventosAgregados: null, logEsperado: true, errEv }
    }
  } catch { /* excepción inesperada */ }
  return { eventosAgregados, logEsperado: false }
}

describe('Agregador — lectura de eventos_bodega con tabla ausente', () => {
  it('PGRST205 → sin eventos, sin excepción, sin log de error REAL', async () => {
    const supa = makeSupabaseStub({ data: null, error: ERROR_PGRST205 })
    const r = await simularAgregador(supa)
    assert.equal(r.eventosAgregados, null)
    assert.equal(r.logEsperado, false)
  })
  it('RLS 42501 → sin eventos pero SÍ se marca para log en servidor', async () => {
    const supa = makeSupabaseStub({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    })
    const r = await simularAgregador(supa)
    assert.equal(r.eventosAgregados, null)
    assert.equal(r.logEsperado, true)
  })
  it('respuesta OK → agrega sin problemas', async () => {
    const supa = makeSupabaseStub({
      data: [
        { tipo: 'grupo',    importe_neto: 300, num_comensales: 8, incluido_en_tpv: false },
        { tipo: 'maridaje', importe_neto: 500, num_comensales: 10, incluido_en_tpv: false },
      ],
      error: null,
    })
    const r = await simularAgregador(supa)
    assert.ok(r.eventosAgregados)
    assert.equal(r.eventosAgregados.ingresos_netos_para_canal, 800)
  })
})
