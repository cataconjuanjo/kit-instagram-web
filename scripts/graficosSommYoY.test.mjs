/**
 * Tests puros de app/lib/graficosSommYoY.js
 * (validación de comparar_con y cálculo de comparables).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsearComparar, calcularComparables } from '../app/lib/graficosSommYoY.js'

// ── parsearComparar ─────────────────────────────────────────────────────────

describe('parsearComparar', () => {
  it('null, undefined, "" → undefined (modo clásico)', () => {
    assert.strictEqual(parsearComparar(null, 2026),      undefined)
    assert.strictEqual(parsearComparar(undefined, 2026), undefined)
    assert.strictEqual(parsearComparar('', 2026),        undefined)
  })

  it('valor válido devuelve entero', () => {
    assert.strictEqual(parsearComparar('2025', 2026), 2025)
    assert.strictEqual(parsearComparar('2000', 2001), 2000)
  })

  it('rechaza no-entero (float, texto, espacios)', () => {
    assert.throws(() => parsearComparar('2024.5', 2026))
    assert.throws(() => parsearComparar('2024abc', 2026))
    assert.throws(() => parsearComparar('2024 ', 2026))
    assert.throws(() => parsearComparar('abc', 2026))
  })

  it('rechaza < 2000', () => {
    assert.throws(() => parsearComparar('1999', 2026))
    assert.throws(() => parsearComparar('0',    2026))
  })

  it('rechaza >= anio', () => {
    assert.throws(() => parsearComparar('2026', 2026))
    assert.throws(() => parsearComparar('2027', 2026))
  })
})

// ── calcularComparables ─────────────────────────────────────────────────────

function entry(mes, estado = 'cerrado') { return { mes, estado } }

describe('calcularComparables', () => {
  it('intersección simple: todos cerrados en ambos años', () => {
    const a = [entry('2026-01'), entry('2026-02'), entry('2026-03')]
    const p = [entry('2025-01'), entry('2025-02'), entry('2025-03')]
    const r = calcularComparables(a, p)
    assert.deepStrictEqual(r, [1, 2, 3])
  })

  it('excluye mes abierto del año actual (estado = estimado)', () => {
    const a = [entry('2026-01'), entry('2026-02'), entry('2026-10', 'estimado')]
    const p = [entry('2025-01'), entry('2025-02'), entry('2025-10')]
    const r = calcularComparables(a, p)
    assert.deepStrictEqual(r, [1, 2])
  })

  it('excluye mes abierto del año prev (nunca comparable)', () => {
    const a = [entry('2026-01'), entry('2026-02')]
    const p = [entry('2025-01'), entry('2025-02', 'estimado')]
    const r = calcularComparables(a, p)
    assert.deepStrictEqual(r, [1])
  })

  it('año prev sin filas → []', () => {
    const a = [entry('2026-01'), entry('2026-02')]
    assert.deepStrictEqual(calcularComparables(a, []), [])
    assert.deepStrictEqual(calcularComparables(a, null), [])
  })

  it('huecos: solo meses presentes como cerrados en AMBOS cuentan', () => {
    const a = [entry('2026-01'), entry('2026-02'), entry('2026-03')]
    const p = [entry('2025-01'), /* feb falta */  entry('2025-03')]
    assert.deepStrictEqual(calcularComparables(a, p), [1, 3])
  })

  it('ambos vacíos / null', () => {
    assert.deepStrictEqual(calcularComparables([], []), [])
    assert.deepStrictEqual(calcularComparables(null, null), [])
  })

  it('ignora filas con mes mal formado', () => {
    const a = [{ mes: 'xxx', estado: 'cerrado' }, entry('2026-05')]
    const p = [entry('2025-05')]
    assert.deepStrictEqual(calcularComparables(a, p), [5])
  })
})
