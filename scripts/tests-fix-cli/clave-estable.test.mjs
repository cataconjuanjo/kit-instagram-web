// Test de regresión: el CLI usa codigo_articulo como clave de matching
// con confianza 1.0 y claveDura como fallback 0.85, no por debajo.
// Lectura del fuente: scripts/importar-tarifa.js.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const cliSrc = readFileSync(resolve(here, '..', 'importar-tarifa.js'), 'utf8')

test('codigo_articulo match tiene confianza 1.0', () => {
  assert.ok(cliSrc.match(/mapCodigo\.has\(obj\.codigo_articulo\)[\s\S]{0,200}confianza\s*=\s*1\.0/),
    'match por codigo_articulo debe tener confianza 1.0')
})

test('fallback claveDura tiene confianza 0.85', () => {
  assert.ok(cliSrc.match(/mapClaveDura\.has\(clave\)[\s\S]{0,200}confianza\s*=\s*0\.85/),
    'match por claveDura debe tener confianza 0.85')
})

test('idempotencia por fichero_hash: aborta si ya se cargó', () => {
  assert.ok(cliSrc.includes('.eq(\'fichero_hash\', pdfHashEntrada)') ||
            cliSrc.includes("eq('fichero_hash', pdfHashEntrada)"),
    'debe buscar tarifa previa por fichero_hash')
  assert.ok(cliSrc.includes('ya se cargó'),
    'debe mencionar el motivo del aborto')
})

test('acepta formato { vinos: [...] } ademas de array', () => {
  assert.ok(cliSrc.includes('crudo.vinos'),
    'debe aceptar el objeto wrapper de pdf-a-json.js')
  assert.ok(cliSrc.includes('pdf_sha256'),
    'debe leer pdf_sha256 del wrapper')
})

test('dry-run por defecto', () => {
  assert.ok(cliSrc.includes("const apply       = hasFlag('--apply')"),
    'apply debe venir de --apply flag, no por defecto')
  assert.ok(cliSrc.match(/if\s*\(!apply\)[\s\S]{0,200}Dry-run/),
    'si no hay --apply, debe salir en modo dry-run')
})

test('re-mapeo de favoritos y aviso de huérfanos', () => {
  assert.ok(cliSrc.includes('Favorito huérfano') || cliSrc.includes('huérfanos'),
    'debe emitir aviso de huérfanos')
  assert.ok(cliSrc.includes('favoritosPrevios'),
    'debe capturar favoritos previos para re-mapear')
})

test('resumen de ingesta final presente', () => {
  assert.ok(cliSrc.includes('Resumen de ingesta'))
  assert.ok(cliSrc.includes('Refs guardadas'))
  assert.ok(cliSrc.includes('Packs detectados'))
  assert.ok(cliSrc.includes('Favoritos re-mapeados'))
})
