// Regresión: si Supabase devuelve un error en cualquier página del
// paginado del CLI, el helper debe lanzar excepción (no interpretarlo
// como "no hay más filas"). Esto evita falsas bajas y favoritos huérfanos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { fetchPaginado } = require('../lib/paginadoSupabase.js')

const here = dirname(fileURLToPath(import.meta.url))
const cliSrc = readFileSync(resolve(here, '..', 'importar-tarifa.js'), 'utf8')

test('fetchPaginado lanza con contexto si la segunda página devuelve error', async () => {
  let llamadas = 0
  const paginas = [
    { data: new Array(1000).fill(0).map((_, i) => ({ id: i })), error: null },
    { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
  ]
  const fetcher = async (_desde, _lim) => paginas[llamadas++]

  await assert.rejects(
    () => fetchPaginado('oferta (tarifa_id=abc)', fetcher, { pageSize: 1000 }),
    (err) => {
      assert.match(err.message, /paginado/i, 'mensaje debe identificar el helper')
      assert.match(err.message, /oferta \(tarifa_id=abc\)/, 'mensaje debe incluir el contexto')
      assert.match(err.message, /desde=1000/, 'mensaje debe incluir el offset de la página que falló')
      assert.match(err.message, /statement timeout/, 'mensaje debe incluir el detalle del error de Supabase')
      assert.equal(err.cause?.code, '57014', 'err.cause preserva el error original')
      return true
    }
  )
  assert.equal(llamadas, 2, 'aborta en la segunda página, no sigue paginando')
})

test('fetchPaginado distingue página vacía (data=[]) de error', async () => {
  const paginas = [
    { data: new Array(1000).fill(0).map((_, i) => ({ id: i })), error: null },
    { data: [], error: null },
  ]
  let llamadas = 0
  const fetcher = async () => paginas[llamadas++]
  const rows = await fetchPaginado('tabla-x', fetcher, { pageSize: 1000 })
  assert.equal(rows.length, 1000, 'página vacía = fin normal, no error')
})

test('fetchPaginado aborta si fetcher devuelve algo distinto a {data,error}', async () => {
  const fetcher = async () => null
  await assert.rejects(
    () => fetchPaginado('ctx', fetcher),
    /fetcher no devolvió objeto/
  )
})

test('CLI usa fetchPaginado en los tres sitios paginados (prevOfertas, favoritosPrevios, actuales)', () => {
  // Static check anti-regresión: si alguien vuelve a inline-ar el while
  // sin `if (error) throw`, este test lo pilla.
  const usos = cliSrc.match(/await\s+fetchPaginado\s*\(/g) || []
  assert.ok(usos.length >= 3, `se esperaban >= 3 llamadas a fetchPaginado, encontradas ${usos.length}`)

  // Y no deben quedar bucles paginados ad-hoc que sólo miren data.
  const inlineLoop = /while\s*\(\s*true\s*\)[\s\S]{0,400}?const\s*\{\s*data[^}]*\}\s*=\s*await\s+supabase[\s\S]{0,400}?if\s*\(\s*!\w+\s*\|\|\s*\w+\.length\s*===\s*0\s*\)\s*break/
  assert.ok(!inlineLoop.test(cliSrc),
    'queda un bucle paginado ad-hoc en el CLI: sustitúyelo por fetchPaginado()')
})

test('fetchPaginado no se añade al helper pero el CLI mantiene .order(\'id\') en cada caller', () => {
  // Cada llamada a fetchPaginado en el CLI debe mantener .order('id')
  // dentro del fetcher (el helper NO lo añade por diseño).
  const bloques = cliSrc.split('fetchPaginado(').slice(1)
  for (const bloque of bloques) {
    const ventana = bloque.slice(0, 600) // suficiente para el fetcher
    assert.match(ventana, /\.order\(\s*['"]id['"]\s*\)/,
      `una llamada a fetchPaginado en el CLI no tiene .order('id') en su fetcher: ${ventana.slice(0, 200)}`)
  }
})
