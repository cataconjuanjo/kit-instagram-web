/**
 * Tests de segmentarPorEstado (app/components/charts/segmentos.js).
 * Ejecutar: node --test scripts/segmentos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { segmentarPorEstado } from '../app/components/charts/segmentos.js'

function p(i, estado) { return { i, x: i * 10, y: 100, mes: `2026-${String(i+1).padStart(2,'0')}`, estado, v: 10 } }

describe('segmentarPorEstado', () => {
  it('array vacío o 1 punto → sin segmentos', () => {
    assert.deepStrictEqual(segmentarPorEstado([]), [])
    assert.deepStrictEqual(segmentarPorEstado([p(0, 'cerrado')]), [])
  })

  it('todos cerrados → un único segmento sólido', () => {
    const pts = [p(0,'cerrado'), p(1,'cerrado'), p(2,'cerrado')]
    const seg = segmentarPorEstado(pts)
    assert.strictEqual(seg.length, 1)
    assert.strictEqual(seg[0].dashed, false)
    assert.strictEqual(seg[0].pts.length, 3)
  })

  it('todos estimados → un único segmento discontinuo', () => {
    const pts = [p(0,'estimado'), p(1,'estimado'), p(2,'estimado')]
    const seg = segmentarPorEstado(pts)
    assert.strictEqual(seg.length, 1)
    assert.strictEqual(seg[0].dashed, true)
  })

  it('cerrado→cerrado→estimado: 2 segmentos (sólido entre cerrados, discontinuo al estimado)', () => {
    const pts = [p(0,'cerrado'), p(1,'cerrado'), p(2,'estimado')]
    const seg = segmentarPorEstado(pts)
    assert.strictEqual(seg.length, 2)
    assert.strictEqual(seg[0].dashed, false)
    assert.deepStrictEqual(seg[0].pts.map(x=>x.i), [0,1])
    assert.strictEqual(seg[1].dashed, true)
    assert.deepStrictEqual(seg[1].pts.map(x=>x.i), [1,2])  // cerrado→estimado es discontinuo
  })

  it('estimado→cerrado→cerrado: 2 segmentos (discontinuo al salir del estimado, sólido entre cerrados)', () => {
    const pts = [p(0,'estimado'), p(1,'cerrado'), p(2,'cerrado')]
    const seg = segmentarPorEstado(pts)
    assert.strictEqual(seg.length, 2)
    assert.strictEqual(seg[0].dashed, true)
    assert.deepStrictEqual(seg[0].pts.map(x=>x.i), [0,1])
    assert.strictEqual(seg[1].dashed, false)
    assert.deepStrictEqual(seg[1].pts.map(x=>x.i), [1,2])
  })

  it('cerrado×3 + estimado al final: sólido en los 3 primeros tramos, discontinuo solo el último', () => {
    const pts = [p(0,'cerrado'), p(1,'cerrado'), p(2,'cerrado'), p(3,'estimado')]
    const seg = segmentarPorEstado(pts)
    assert.strictEqual(seg.length, 2)
    assert.strictEqual(seg[0].dashed, false)
    assert.deepStrictEqual(seg[0].pts.map(x=>x.i), [0,1,2])
    assert.strictEqual(seg[1].dashed, true)
    assert.deepStrictEqual(seg[1].pts.map(x=>x.i), [2,3])
  })

  it('cerrado→estimado→cerrado→cerrado: 2 segmentos (tramos dashed consecutivos se fusionan)', () => {
    const pts = [p(0,'cerrado'), p(1,'estimado'), p(2,'cerrado'), p(3,'cerrado')]
    const seg = segmentarPorEstado(pts)
    assert.strictEqual(seg.length, 2)
    assert.strictEqual(seg[0].dashed, true)
    assert.deepStrictEqual(seg[0].pts.map(x=>x.i), [0,1,2])  // cerrado→estimado→cerrado todo dashed
    assert.strictEqual(seg[1].dashed, false)
    assert.deepStrictEqual(seg[1].pts.map(x=>x.i), [2,3])   // cerrado→cerrado sólido
  })
})
