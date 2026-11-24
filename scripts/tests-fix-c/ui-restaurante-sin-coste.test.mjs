// Test de regresión: la UI del lado restaurante no debe pintar "coste 0 EUR"
// ni usar coste_estimado sin una guardia. El endpoint /api/proveedores-catalogo
// oculta coste_estimado salvo para el consultor; las vistas que lo lean deben
// ocultar el bloque cuando el valor no viene.
//
// Es un test grosero por grep sobre el fuente, no sobre render.
// Fixture conceptual: Casa Marisma recibe el payload del endpoint sin coste.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const FICHEROS = [
  resolve(here, '..', '..', 'app', 'dashboard', 'catalogo', 'page.js'),
]

for (const file of FICHEROS) {
  const relativo = file.split(/[\\/]app[\\/]/).pop()

  test(`${relativo}: no pinta "0 EUR" ni "0 €" junto a coste sin guardia`, () => {
    const src = readFileSync(file, 'utf8')
    // No pueden aparecer literales "€0" ni "EUR 0" pegados al texto "coste".
    // Usamos regex que mire 40 chars antes y después.
    const literales = [/0\s*EUR[^}]{0,40}coste/i, /coste[^}]{0,40}0\s*EUR/i, /€\s*0[^}]{0,40}coste/i, /coste[^}]{0,40}€\s*0/i]
    for (const re of literales) {
      assert.ok(!re.test(src), `literal sospechoso en ${relativo}: ${re}`)
    }
  })

  test(`${relativo}: cada uso de coste_estimado tiene una guardia cercana`, () => {
    const src = readFileSync(file, 'utf8')
    const lineas = src.split('\n')
    lineas.forEach((linea, idx) => {
      if (!linea.includes('coste_estimado')) return
      // Lineas de comentario quedan exentas.
      const limpia = linea.trim()
      if (limpia.startsWith('//') || limpia.startsWith('*')) return
      // Debe tener al menos una guardia en la propia línea o en las dos inmediatas anteriores.
      const bloque = [lineas[idx - 2] || '', lineas[idx - 1] || '', linea].join('\n')
      const tieneGuardia = /\?\.|\?\?|==\s*null|===\s*undefined|!=\s*null|!==\s*undefined|\|\|\s*0|>\s*0|if\s*\(|\&\&\s*\(|&&\s*</.test(bloque)
      assert.ok(tieneGuardia, `coste_estimado sin guardia cercana en ${relativo}:${idx + 1}: ${linea.trim()}`)
    })
  })
}
