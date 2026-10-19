/**
 * Unit tests for fetchAllPages and chunkArray.
 * Ejecutar: node --test scripts/fetchAllPages.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllPages, chunkArray } from '../app/lib/fetchAllPages.js'

// Builds a mock Supabase-like query builder whose .range() resolves via rangeFn.
function makeBuilder(rangeFn) {
  const b = {
    order: () => b,
    range: async (from, to) => rangeFn(from, to),
  }
  return b
}

describe('fetchAllPages', () => {
  it('0 rows — returns empty array immediately', async () => {
    let calls = 0
    const result = await fetchAllPages(() => {
      calls++
      return makeBuilder(() => ({ data: [], error: null }))
    })
    assert.deepEqual(result, [])
    assert.equal(calls, 1)
  })

  it('999 rows — single page, no second request', async () => {
    const rows = Array.from({ length: 999 }, (_, i) => ({ id: i, created_at: '2024-01-01' }))
    let calls = 0
    const result = await fetchAllPages(() => {
      calls++
      return makeBuilder((from) => ({ data: rows.slice(from, from + 1000), error: null }))
    }, 1000)
    assert.equal(result.length, 999)
    assert.equal(calls, 1)
  })

  it('1000 rows exactly — fetches second page to confirm end', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, created_at: '2024-01-01' }))
    let calls = 0
    const result = await fetchAllPages(() => {
      calls++
      return makeBuilder((from) => ({ data: rows.slice(from, from + 1000), error: null }))
    }, 1000)
    assert.equal(result.length, 1000)
    assert.equal(calls, 2)
  })

  it('1001 rows — two pages, correct total', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: i, created_at: '2024-01-01' }))
    const result = await fetchAllPages(
      () => makeBuilder((from) => ({ data: rows.slice(from, from + 1000), error: null })),
      1000
    )
    assert.equal(result.length, 1001)
  })

  it('2500 rows — three pages, correct total', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i, created_at: '2024-01-01' }))
    const result = await fetchAllPages(
      () => makeBuilder((from) => ({ data: rows.slice(from, from + 1000), error: null })),
      1000
    )
    assert.equal(result.length, 2500)
  })

  it('error on page 2 — throws with page number', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i, created_at: '2024-01-01' }))
    let calls = 0
    await assert.rejects(
      fetchAllPages(() => {
        calls++
        return makeBuilder(() => {
          if (calls === 1) return { data: rows, error: null }
          return { data: null, error: { message: 'DB timeout' } }
        })
      }, 1000),
      /page 1/
    )
  })

  it('safety cap — stops at 200 pages and warns', async () => {
    const pageRows = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    const originalWarn = console.warn
    let warned = false
    console.warn = () => { warned = true }
    try {
      const result = await fetchAllPages(
        () => makeBuilder(() => ({ data: pageRows, error: null })),
        5
      )
      assert.equal(result.length, 5 * 200)
      assert.equal(warned, true)
    } finally {
      console.warn = originalWarn
    }
  })
})

describe('chunkArray', () => {
  it('splits 250 items into chunks of 100 (100, 100, 50)', () => {
    const arr = Array.from({ length: 250 }, (_, i) => i)
    const chunks = chunkArray(arr, 100)
    assert.equal(chunks.length, 3)
    assert.equal(chunks[0].length, 100)
    assert.equal(chunks[1].length, 100)
    assert.equal(chunks[2].length, 50)
  })

  it('empty array returns empty chunks', () => {
    assert.deepEqual(chunkArray([], 100), [])
  })

  it('array smaller than chunk size returns one chunk', () => {
    const chunks = chunkArray([1, 2, 3], 100)
    assert.equal(chunks.length, 1)
    assert.deepEqual(chunks[0], [1, 2, 3])
  })
})
