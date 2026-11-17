/**
 * Unit tests for app/lib/facturaIA.js
 * Ejecutar: node --test scripts/facturaIA.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectarRetencion,
  validarFactura,
  componerNotasFacturaIA,
  NOTA_IA,
  preseleccionarProveedor,
} from '../app/lib/facturaIA.js'

describe('detectarRetencion', () => {
  it('base 41,03 €, diferencia 6,15 € → 15 % (caso real del encargo)', () => {
    assert.deepEqual(detectarRetencion(41.03, 6.15), { pct: 15, importe: 6.15 })
  })

  it('reconoce retenciones típicas 15 / 7 / 19 / 1 %', () => {
    assert.equal(detectarRetencion(100, 15)?.pct, 15)
    assert.equal(detectarRetencion(100, 7)?.pct, 7)
    assert.equal(detectarRetencion(100, 19)?.pct, 19)
    assert.equal(detectarRetencion(100, 1)?.pct, 1)
  })

  it('aplica tolerancia de ±0,02 €', () => {
    assert.equal(detectarRetencion(100, 15.02)?.pct, 15)
    assert.equal(detectarRetencion(100, 14.98)?.pct, 15)
    assert.equal(detectarRetencion(100, 14.90), null)
  })

  it('devuelve null para valores no válidos', () => {
    assert.equal(detectarRetencion(-10, 1.5), null)
    assert.equal(detectarRetencion(100, -5), null)
    assert.equal(detectarRetencion(100, 0), null)
    assert.equal(detectarRetencion('x', 15), null)
    assert.equal(detectarRetencion(100, NaN), null)
  })
})

describe('validarFactura — aviso de retención IRPF', () => {
  it('base 41,03 + IVA 8,62 → total 43,50 emite aviso de retención 15 %', () => {
    const avisos = validarFactura({
      fecha: '2026-11-01',
      base_imponible: 41.03,
      iva_pct: 21,
      iva_importe: 8.62,
      total: 43.50,
      lineas: [],
    })
    const aviso = avisos.find(a => a.includes('retención de IRPF'))
    assert.ok(aviso, `Debe contener aviso de retención. Avisos: ${JSON.stringify(avisos)}`)
    assert.equal(
      aviso,
      'Parece haber una retención de IRPF de 6.15 € (15 %). ' +
      'La compra se registra por base + IVA; revisa el total.',
    )
    assert.ok(!avisos.some(a => a.includes('≠ total')),
      'No debe emitir el aviso genérico de descuadre cuando es retención')
  })

  it('total mayor que base+IVA → descuadre genérico (no es retención)', () => {
    const avisos = validarFactura({
      fecha: '2026-11-01',
      base_imponible: 100,
      iva_pct: 21,
      iva_importe: 21,
      total: 150,
      lineas: [],
    })
    assert.ok(avisos.some(a => a.includes('≠ total')))
    assert.ok(!avisos.some(a => a.includes('IRPF')))
  })

  it('base+IVA = total exacto → sin avisos de descuadre ni retención', () => {
    const avisos = validarFactura({
      fecha: '2026-11-01',
      base_imponible: 100,
      iva_pct: 21,
      iva_importe: 21,
      total: 121,
      lineas: [],
    })
    assert.ok(!avisos.some(a => a.includes('≠ total')))
    assert.ok(!avisos.some(a => a.includes('IRPF')))
  })

  it('retención 7 % también detectada', () => {
    const avisos = validarFactura({
      fecha: '2026-11-01',
      base_imponible: 1000,
      iva_pct: 21,
      iva_importe: 210,
      total: 1140,
      lineas: [],
    })
    assert.ok(avisos.some(a => a.includes('(7 %)')))
  })
})

describe('componerNotasFacturaIA', () => {
  it('sin notas previas → sólo el prefijo', () => {
    assert.equal(componerNotasFacturaIA(null), NOTA_IA)
    assert.equal(componerNotasFacturaIA(''), NOTA_IA)
    assert.equal(componerNotasFacturaIA('   '), NOTA_IA)
  })

  it('con notas previas → prefijo + notas', () => {
    assert.equal(componerNotasFacturaIA('Palet dañado'), `${NOTA_IA}. Palet dañado`)
  })

  it('trunca a 500 caracteres conservando el prefijo', () => {
    const out = componerNotasFacturaIA('x'.repeat(600))
    assert.equal(out.length, 500)
    assert.ok(out.startsWith(NOTA_IA))
  })
})

describe('preseleccionarProveedor', () => {
  const lista = ['Bodegas Mar', 'Alboio Distribución', 'Hermanos Pérez S.L.']

  it('match por NIF (prioridad sobre nombre)', () => {
    const r = preseleccionarProveedor(
      { proveedor: { nombre: 'Alboio Distribución', nif: 'B-12.345.678' } },
      [{ nombre: 'Bodegas Mar', nif: 'B12345678' }, { nombre: 'Alboio Distribución', nif: null }],
    )
    assert.equal(r.nombre, 'Bodegas Mar')
    assert.equal(r.origen, 'nif')
  })

  it('match por nombre normalizado exacto (sin diacríticos)', () => {
    const r = preseleccionarProveedor({ proveedor: { nombre: 'ALBOIO distribucion' } }, lista)
    assert.equal(r.nombre, 'Alboio Distribución')
    assert.equal(r.origen, 'nombre_exacto')
  })

  it('match parcial ≥ 0.75', () => {
    const r = preseleccionarProveedor({ proveedor: { nombre: 'Hermanos Pérez' } }, lista)
    assert.equal(r.origen, 'nombre_parcial')
  })

  it('sin match ni candidatos', () => {
    const r = preseleccionarProveedor({ proveedor: { nombre: 'Marca XYZ' } }, lista)
    assert.equal(r.nombre, null)
    assert.deepEqual(r.candidatos, [])
  })
})
