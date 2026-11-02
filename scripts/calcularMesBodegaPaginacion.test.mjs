/**
 * Unit tests para paginación en calcularMesBodega.
 *
 * No tocan BD: usan un mock de supabase que:
 *  - Para botellas_abiertas: simula 2500 filas repartidas en 3 páginas
 *    (1000 + 1000 + 500) y comprueba que calcularMesBodega las lee TODAS
 *    y calcula merma_copa_eur en consecuencia.
 *  - Para el resto de tablas devuelve vacío/single mínimo.
 *  - Verifica también el caso "<1000 filas" (comportamiento idéntico).
 *
 * Ejecutar: node --test scripts/calcularMesBodegaPaginacion.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcularMesBodega, _agruparLineas } from '../app/lib/agregarPeriodoBodega.js'

const RID = '00000000-0000-0000-0000-000000000001'
const MES = '2026-10'

// ── Mock supabase ────────────────────────────────────────────────────────────
// botellasRows: array completo que la tabla debería devolver (sin truncar).
// otras llamadas: devuelven vacío/datos triviales.
function makeSupabase({ botellasRows = [] }) {
  const callLog = { botellas_pages: [] }

  function builderFor(table) {
    // Cada "nodo" del builder guarda filtros aplicados; .single()/.range()
    // resuelven el pedido.
    const state = { table, filters: [] }
    const self = {
      _state: state,
      select(cols) { state.cols = cols; return self },
      eq(col, val)  { state.filters.push(['eq', col, val]); return self },
      in(col, vals) { state.filters.push(['in', col, vals]); return self },
      is(col, val)  { state.filters.push(['is', col, val]); return self },
      gte(col, val) { state.filters.push(['gte', col, val]); return self },
      lte(col, val) { state.filters.push(['lte', col, val]); return self },
      lt(col, val)  { state.filters.push(['lt',  col, val]); return self },
      order() { return self },
      async single() {
        if (table === 'restaurant_economic_settings') {
          return { data: { iva_venta_pct: 10, copas_por_botella: 5, merma_copa_pct: 0,
                            fuente_ventas: 'parte', gastos_mensuales: [] }, error: null }
        }
        return { data: null, error: null }
      },
      async range(from, to) {
        if (table === 'botellas_abiertas') {
          callLog.botellas_pages.push([from, to])
          const slice = botellasRows.slice(from, to + 1)
          return { data: slice, error: null }
        }
        // El resto de tablas: siempre vacío (0 filas → fetchAllPages corta en 1 llamada).
        return { data: [], error: null }
      },
    }
    return self
  }

  return {
    from(table) { return builderFor(table) },
    _callLog: callLog,
  }
}

// Genera N botellas cerradas con copas_teoricas=5, copas_servidas=4, coste_copa=2
// → cada una aporta merma=(5-4)*2=2 €. N=2500 → total 5000€.
function fakeBotellas(n) {
  return Array.from({ length: n }, (_, i) => ({
    vino_id: `v-${i % 10}`,
    copas_servidas: 4,
    copas_teoricas: 5,
    coste_copa: 2,
    vinos: { nombre: `Vino ${i % 10}` },
    created_at: '2026-10-15T10:00:00Z',
    id: `b-${i}`,
  }))
}

describe('calcularMesBodega — paginación de botellas_abiertas', () => {
  it('2500 filas: pagina en 3 llamadas y acumula merma correctamente', async () => {
    const botellas = fakeBotellas(2500)
    const supabase = makeSupabase({ botellasRows: botellas })

    const res = await calcularMesBodega({ restaurante_id: RID, mes: MES, supabase })

    // 3 páginas: [0..999], [1000..1999], [2000..2999] (última devuelve 500 < 1000, corta)
    assert.equal(supabase._callLog.botellas_pages.length, 3,
      'debe hacer 3 llamadas .range() para 2500 filas')
    assert.deepEqual(supabase._callLog.botellas_pages[0], [0, 999])
    assert.deepEqual(supabase._callLog.botellas_pages[1], [1000, 1999])
    assert.deepEqual(supabase._callLog.botellas_pages[2], [2000, 2999])

    // merma_copa_eur = 2500 * (5-4) * 2 = 5000€
    assert.equal(res.merma_copa_eur, 5000,
      `merma_copa_eur esperada 5000€, obtenida ${res.merma_copa_eur}`)
  })

  it('500 filas (<1000): una sola llamada, comportamiento idéntico al previo', async () => {
    const botellas = fakeBotellas(500)
    const supabase = makeSupabase({ botellasRows: botellas })

    const res = await calcularMesBodega({ restaurante_id: RID, mes: MES, supabase })

    assert.equal(supabase._callLog.botellas_pages.length, 1,
      'con <1000 filas debe hacer una única llamada .range()')
    assert.equal(res.merma_copa_eur, 1000,
      `merma_copa_eur esperada 1000€, obtenida ${res.merma_copa_eur}`)
  })

  it('1000 filas exactas: hace 2 llamadas (la 2ª confirma fin), merma correcta', async () => {
    const botellas = fakeBotellas(1000)
    const supabase = makeSupabase({ botellasRows: botellas })

    const res = await calcularMesBodega({ restaurante_id: RID, mes: MES, supabase })

    assert.equal(supabase._callLog.botellas_pages.length, 2,
      'con 1000 exactas fetchAllPages hace 2 llamadas para confirmar fin')
    assert.equal(res.merma_copa_eur, 2000)
  })

  it('0 filas: una llamada, merma=0', async () => {
    const supabase = makeSupabase({ botellasRows: [] })
    const res = await calcularMesBodega({ restaurante_id: RID, mes: MES, supabase })
    assert.equal(supabase._callLog.botellas_pages.length, 1)
    assert.equal(res.merma_copa_eur, 0)
  })
})

describe('_agruparLineas — función pura (regresión)', () => {
  it('suma ingresos y botellas vendidas correctamente', () => {
    const lineas = [
      { tipo: 'venta_botella', cantidad: 2, precio_unitario: 20, vino_id: 'v1',
        vino: { id: 'v1', nombre: 'V1', coste_medio_pmp: 8 } },
      { tipo: 'venta_copa', cantidad: 1, copas_vendidas: 3, precio_unitario: 5, vino_id: 'v1',
        vino: { id: 'v1', nombre: 'V1', coste_medio_pmp: 8 } },
    ]
    const r = _agruparLineas(lineas, { copas_por_botella: 5, merma_copa_pct: 0 })
    // 2 bot × 20€ + 3 copas × 5€ = 55€
    assert.equal(r.resumen.ingresos_venta, 55)
    assert.equal(r.resumen.botellas_vendidas, 2)
    assert.equal(r.resumen.copas_vendidas, 3)
  })
})
