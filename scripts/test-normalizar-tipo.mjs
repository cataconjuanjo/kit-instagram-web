/**
 * Tests unitarios de normalizarTipo y normalizarZona.
 * Usa el test runner nativo de Node.js (v18+).
 *
 * Uso:
 *   node scripts/test-normalizar-tipo.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarTipo, normalizarZona, TIPOS_VINO, TIPOS_AMBIGUOS } from '../app/lib/normalizarTipo.js'

// ── TIPOS_VINO ───────────────────────────────────────────────────────────────
test('TIPOS_VINO contiene los 9 slugs canónicos en orden', () => {
  assert.deepStrictEqual(TIPOS_VINO, [
    'tinto', 'blanco', 'rosado', 'espumoso',
    'generoso', 'dulce', 'naranja', 'sin_alcohol', 'sidra',
  ])
})

// ── normalizarTipo — casos felices ───────────────────────────────────────────
test('Slugs canónicos en minúscula pasan sin cambio', () => {
  for (const slug of TIPOS_VINO) {
    assert.strictEqual(normalizarTipo(slug), slug, `slug: ${slug}`)
  }
})

test('Mayúsculas iniciales se normalizan correctamente', () => {
  assert.strictEqual(normalizarTipo('Tinto'), 'tinto')
  assert.strictEqual(normalizarTipo('Blanco'), 'blanco')
  assert.strictEqual(normalizarTipo('Rosado'), 'rosado')
  assert.strictEqual(normalizarTipo('Espumoso'), 'espumoso')
})

test('Sinónimos de tinto', () => {
  assert.strictEqual(normalizarTipo('rojo'), 'tinto')
  assert.strictEqual(normalizarTipo('Red'), 'tinto')
  assert.strictEqual(normalizarTipo('Crianza'), 'tinto')
  assert.strictEqual(normalizarTipo('Reserva'), 'tinto')
  assert.strictEqual(normalizarTipo('Gran Reserva'), 'tinto')
  assert.strictEqual(normalizarTipo('tinto joven'), 'tinto')
})

test('Sinónimos de espumoso (cava, champagne, pet nat…)', () => {
  assert.strictEqual(normalizarTipo('Cava'), 'espumoso')
  assert.strictEqual(normalizarTipo('Champagne'), 'espumoso')
  assert.strictEqual(normalizarTipo('champán'), 'espumoso')    // acento
  assert.strictEqual(normalizarTipo('Prosecco'), 'espumoso')
  assert.strictEqual(normalizarTipo('crémant'), 'espumoso')    // acento
  assert.strictEqual(normalizarTipo('pét-nat'), 'espumoso')    // guión+acento
  assert.strictEqual(normalizarTipo('pet nat'), 'espumoso')
  assert.strictEqual(normalizarTipo('Brut'), 'espumoso')
  assert.strictEqual(normalizarTipo('Brut Nature'), 'espumoso')
})

test('Sinónimos de generoso', () => {
  assert.strictEqual(normalizarTipo('Fino'), 'generoso')
  assert.strictEqual(normalizarTipo('Manzanilla'), 'generoso')
  assert.strictEqual(normalizarTipo('Amontillado'), 'generoso')
  assert.strictEqual(normalizarTipo('Oloroso'), 'generoso')
  assert.strictEqual(normalizarTipo('Palo Cortado'), 'generoso')
  assert.strictEqual(normalizarTipo('Jerez'), 'generoso')
  assert.strictEqual(normalizarTipo('Sherry'), 'generoso')
  assert.strictEqual(normalizarTipo('Vermut'), 'generoso')
})

test('Sinónimos de dulce', () => {
  assert.strictEqual(normalizarTipo('PX'), 'dulce')
  assert.strictEqual(normalizarTipo('Pedro Ximénez'), 'dulce')
  assert.strictEqual(normalizarTipo('Late Harvest'), 'dulce')
  assert.strictEqual(normalizarTipo('Vendimia Tardía'), 'dulce')
})

test('Sinónimos de naranja', () => {
  assert.strictEqual(normalizarTipo('Orange'), 'naranja')
  assert.strictEqual(normalizarTipo('Orange Wine'), 'naranja')
  assert.strictEqual(normalizarTipo('Ánfora'), 'naranja')      // acento
})

test('Sinónimos de sin_alcohol', () => {
  assert.strictEqual(normalizarTipo('sin alcohol'), 'sin_alcohol')
  assert.strictEqual(normalizarTipo('Sin Alcohol'), 'sin_alcohol')
  assert.strictEqual(normalizarTipo('desalcoholizado'), 'sin_alcohol')
  assert.strictEqual(normalizarTipo('0.0'), 'sin_alcohol')
  assert.strictEqual(normalizarTipo('0,0'), 'sin_alcohol')
})

test('Sinónimos de sidra', () => {
  assert.strictEqual(normalizarTipo('Sidra'), 'sidra')
  assert.strictEqual(normalizarTipo('cider'), 'sidra')
  assert.strictEqual(normalizarTipo('Sagardo'), 'sidra')
})

// ── normalizarTipo — nulos y sin mapeo ────────────────────────────────────────
test('Valores vacíos devuelven null', () => {
  assert.strictEqual(normalizarTipo(''), null)
  assert.strictEqual(normalizarTipo(null), null)
  assert.strictEqual(normalizarTipo(undefined), null)
})

test('Tipos inventados devuelven null (sin_mapeo)', () => {
  assert.strictEqual(normalizarTipo('Garnacha'), null)
  assert.strictEqual(normalizarTipo('Tintoralba'), null)
  assert.strictEqual(normalizarTipo('Vino de pasto'), null)
})

// ── TIPOS_AMBIGUOS — moscatel no está en el mapa principal ───────────────────
test('moscatel no se mapea automáticamente (ambigüedad generoso/dulce)', () => {
  assert.strictEqual(normalizarTipo('moscatel'), null)
  assert.ok('moscatel' in TIPOS_AMBIGUOS)
})

// ── normalizarZona ───────────────────────────────────────────────────────────
test('D.O Jumilla — corrige punto faltante', () => {
  const { display, slug } = normalizarZona('D.O Jumilla')
  assert.strictEqual(display, 'D.O. Jumilla')
  assert.strictEqual(slug, 'jumilla')
})

test('DO Rioja — añade puntos', () => {
  const { display, slug } = normalizarZona('DO Rioja')
  assert.strictEqual(display, 'D.O. Rioja')
  assert.strictEqual(slug, 'rioja')
})

test('DOCa Rioja — normaliza a D.O.Ca.', () => {
  const { display, slug } = normalizarZona('DOCa Rioja')
  assert.strictEqual(display, 'D.O.Ca. Rioja')
  assert.strictEqual(slug, 'rioja')
})

test('D.O.Ca. Rioja — ya correcto, no cambia', () => {
  const { display, slug } = normalizarZona('D.O.Ca. Rioja')
  assert.strictEqual(display, 'D.O.Ca. Rioja')
  assert.strictEqual(slug, 'rioja')
})

test('IGP Vinos de Madrid', () => {
  const { display, slug } = normalizarZona('IGP Vinos de Madrid')
  assert.strictEqual(display, 'I.G.P. Vinos De Madrid')
  assert.strictEqual(slug, 'vinos-de-madrid')
})

test('Zona sin prefijo — title-case sin modificar prefijo', () => {
  const { display, slug } = normalizarZona('jerez de la frontera')
  assert.strictEqual(display, 'Jerez De La Frontera')
  assert.strictEqual(slug, 'jerez-de-la-frontera')
})

test('Zona vacía devuelve strings vacíos', () => {
  assert.deepStrictEqual(normalizarZona(''), { display: '', slug: '' })
  assert.deepStrictEqual(normalizarZona(null), { display: '', slug: '' })
})

test('Slug elimina acentos y caracteres especiales', () => {
  const { slug } = normalizarZona('D.O. Málaga')
  assert.strictEqual(slug, 'malaga')
})
