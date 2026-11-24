// Test de la lógica de packs/cajas del CLI scripts/pdf-a-json.js.
// Replicamos la pequeña función de reparto para validarla aisladamente.
// Fixture: "200 Monges Impar Caja Madera 4 Botellas 50cl" como coste_caja=120,
// unidades_por_caja=4 → coste_botella = 30.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// La lógica de packs está inline en pdf-a-json.js. La re-expresamos aquí porque
// el módulo es CommonJS + dependencias (pdf-parse, anthropic) y no se puede
// importar directo sin instalar. Si el CLI cambia, este test sigue valiendo
// como contrato: packs se reparten en divisiones estrictas.
function repartirPack(linea) {
  const unidades = Number(linea.unidades_por_caja) > 0 ? Number(linea.unidades_por_caja) : 1
  let coste = Number(linea.coste_botella) > 0 ? Number(linea.coste_botella) : null
  if (!coste && Number(linea.coste_caja) > 0 && unidades > 1) {
    coste = Number(linea.coste_caja) / unidades
  }
  return { coste, unidades }
}

test('caja de 4 botellas reparte el coste', () => {
  const r = repartirPack({ coste_caja: 120, unidades_por_caja: 4 })
  assert.equal(r.unidades, 4)
  assert.equal(r.coste, 30)
})

test('botella individual deja coste tal cual', () => {
  const r = repartirPack({ coste_botella: 18.5, unidades_por_caja: 1 })
  assert.equal(r.coste, 18.5)
})

test('si llega coste_botella con unidades_por_caja>1, se respeta coste_botella', () => {
  // El prompt del LLM impone "nunca rellenes los dos". Si por error llegan
  // ambos, prevalece coste_botella porque es más específico.
  const r = repartirPack({ coste_caja: 100, coste_botella: 25, unidades_por_caja: 4 })
  assert.equal(r.coste, 25)
})

test('sin precio devuelve null', () => {
  const r = repartirPack({ unidades_por_caja: 1 })
  assert.equal(r.coste, null)
})

test('pdf-a-json.js contiene el prompt de packs', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(resolve(here, '..', 'pdf-a-json.js'), 'utf8')
  assert.ok(src.includes('unidades_por_caja'),
    'el prompt debe mencionar unidades_por_caja')
  assert.ok(src.includes('Caja N Botellas'),
    'el prompt debe mencionar la pista "Caja N Botellas"')
  assert.ok(src.includes('1500'),
    'el prompt debe incluir formato magnum (1500)')
  assert.ok(src.includes('divide los precios por 1.21'),
    'el prompt debe dar la regla de IVA incluido')
})
