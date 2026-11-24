// Test de regresión del fix A reducido + E en /api/admin/importar-proveedor-pdf.
// Verifica (lectura del fuente):
//   - maxDuration=300 y dynamic='force-dynamic' exportados.
//   - helper respuestaTruncada() devuelve 413 con EXTRACCION_TRUNCADA.
//   - stop_reason==='max_tokens' disparara respuestaTruncada().
//   - vinos.length >= LIMITE_REFS_PANEL en LLM y heurístico dispara respuestaTruncada().
//   - El mensaje de archivo grande apunta al CLI.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routeSrc = readFileSync(
  resolve(here, '..', '..', 'app', 'api', 'admin', 'importar-proveedor-pdf', 'route.js'),
  'utf8'
)

test('maxDuration=300 y dynamic=force-dynamic exportados', () => {
  assert.ok(routeSrc.includes('export const maxDuration = 300'))
  assert.ok(routeSrc.includes("export const dynamic = 'force-dynamic'"))
})

test('helper respuestaTruncada devuelve 413 con codigo EXTRACCION_TRUNCADA', () => {
  const idx = routeSrc.indexOf('function respuestaTruncada')
  assert.ok(idx > 0, 'debe existir el helper')
  const bloque = routeSrc.slice(idx, idx + 400)
  assert.ok(bloque.includes("'EXTRACCION_TRUNCADA'"))
  assert.ok(bloque.includes('status: 413'))
})

test('stop_reason=max_tokens dispara respuestaTruncada', () => {
  assert.ok(routeSrc.match(/message\.stop_reason\s*===\s*'max_tokens'[\s\S]{0,100}respuestaTruncada\(\)/),
    'debe existir la rama max_tokens → respuestaTruncada')
})

test('LIMITE_REFS_PANEL=180 y gate heurístico/LLM', () => {
  assert.ok(routeSrc.includes('const LIMITE_REFS_PANEL = 180'))
  // LLM gate
  assert.ok(routeSrc.match(/vinos\.length\s*>=\s*LIMITE_REFS_PANEL[\s\S]{0,100}respuestaTruncada\(\)/),
    'debe existir el gate contra el tope en el extractor LLM')
  // Heurístico gate
  const bloqueHeur = routeSrc.slice(routeSrc.indexOf('extraerCatalogoHeuristico(textoFuente)'))
  assert.ok(bloqueHeur.match(/vinos\.length\s*>=\s*LIMITE_REFS_PANEL[\s\S]{0,100}respuestaTruncada\(\)/),
    'debe existir el gate contra el tope en el extractor heurístico')
})

test('mensaje de archivo grande apunta al CLI importar-tarifa.js', () => {
  assert.ok(routeSrc.includes('scripts/importar-tarifa.js'),
    'el mensaje de error debe guiar al CLI para catálogos grandes')
})
