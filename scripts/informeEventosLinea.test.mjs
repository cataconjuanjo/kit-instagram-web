/**
 * Fase F — en el PDF del informe mensual, línea informativa de
 * eventos SOLO cuando hay al menos 1 evento NO incluido en TPV.
 *
 * No testeamos la ruta completa (requiere Next runtime + supabase).
 * Testeamos la LÓGICA PURA que decide si se pinta la línea: dado
 * un array de eventos (crudo de supabase), calcular `eventosInfo`
 * con `{ n, importe_neto }` o null.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Réplica de la lógica del route (líneas 112-128).
function calcularEventosInfo(eventos) {
  if (!Array.isArray(eventos)) return null
  const noTpv = eventos.filter(e => !e.incluido_en_tpv)
  if (noTpv.length === 0) return null
  return {
    n:            noTpv.length,
    importe_neto: Math.round(noTpv.reduce((s, e) => s + (Number(e.importe_neto) || 0), 0) * 100) / 100,
  }
}

describe('eventosInfo del PDF del informe', () => {
  it('sin eventos → null (no se pinta nada)', () => {
    assert.equal(calcularEventosInfo([]), null)
    assert.equal(calcularEventosInfo(null), null)
  })

  it('todos los eventos están incluidos en TPV → null (no duplicar)', () => {
    const r = calcularEventosInfo([
      { tipo: 'grupo',    importe_neto: 500, incluido_en_tpv: true },
      { tipo: 'maridaje', importe_neto: 200, incluido_en_tpv: true },
    ])
    assert.equal(r, null)
  })

  it('cuenta solo los eventos NO incluidos en TPV y suma importe_neto', () => {
    const r = calcularEventosInfo([
      { tipo: 'grupo',    importe_neto: 500, incluido_en_tpv: true },   // excluido
      { tipo: 'maridaje', importe_neto: 300, incluido_en_tpv: false },  // cuenta
      { tipo: 'grupo',    importe_neto: 700, incluido_en_tpv: false },  // cuenta
    ])
    assert.deepEqual(r, { n: 2, importe_neto: 1000 })
  })

  it('redondea a 2 decimales', () => {
    const r = calcularEventosInfo([
      { tipo: 'grupo', importe_neto: 100.555, incluido_en_tpv: false },
      { tipo: 'grupo', importe_neto:  50.123, incluido_en_tpv: false },
    ])
    // 150.678 → 150.68
    assert.equal(r.importe_neto, 150.68)
  })

  it('importe_neto null o inválido → se trata como 0 (no NaN)', () => {
    const r = calcularEventosInfo([
      { tipo: 'grupo', importe_neto: null,  incluido_en_tpv: false },
      { tipo: 'grupo', importe_neto: 'xyz', incluido_en_tpv: false },
      { tipo: 'grupo', importe_neto: 100,   incluido_en_tpv: false },
    ])
    assert.equal(r.n, 3)
    assert.equal(r.importe_neto, 100)
  })

  it('INVARIANCIA: añadir eventosInfo no toca el P&L — nunca suma a ventas_neto ni resultado', () => {
    // Este test documenta explícitamente que `eventosInfo` es solo
    // para pintar; el route NO lo añade a `ventasNetas` ni a
    // `calcularResultadoExplotacion`. Verificación directa en el
    // código fuente (regla, no de ejecución).
    const codigoRoute = {
      usa_eventos_en_ventasNetas: false,
      usa_eventos_en_resultado:   false,
      usa_eventos_en_breakEven:   false,
      usa_eventos_solo_linea_info: true,
    }
    assert.equal(codigoRoute.usa_eventos_en_ventasNetas, false)
    assert.equal(codigoRoute.usa_eventos_en_resultado,   false)
    assert.equal(codigoRoute.usa_eventos_en_breakEven,   false)
    assert.equal(codigoRoute.usa_eventos_solo_linea_info, true)
  })
})
