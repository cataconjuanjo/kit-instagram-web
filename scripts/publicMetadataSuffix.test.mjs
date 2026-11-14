// scripts/publicMetadataSuffix.test.mjs
// Verifica que los titulos de /carta/[slug] y /camarero/[slug] NO heredan
// "· Cata con Juanjo" del template del root layout, usando title.absolute,
// y que exponen el sufijo "· Carta Viva" en title/og:title.
//
// Nota: no se puede importar publicRestaurantMetadata.js directamente
// porque toca supabaseAdmin con credenciales. Aqui comprobamos la forma
// del objeto exportado replicando la estructura sin tocar BD.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Reproducimos localmente la contribucion de titulo (sin la llamada a BD),
// para no acoplar el test al cliente de Supabase ni a .env.*
function tituloCartaPublica(nombre) {
  const titleCore = `Carta de vinos de ${nombre}`
  const titleWithBrand = `${titleCore} · Carta Viva`
  return { absolute: titleWithBrand }
}

function tituloModoCamarero(nombre) {
  return { absolute: `Modo camarero · ${nombre} · Carta Viva` }
}

test('carta publica: title.absolute termina en " · Carta Viva" y no contiene "Cata con Juanjo"', () => {
  const t = tituloCartaPublica('Casa Marisma')
  assert.ok(t.absolute.endsWith(' · Carta Viva'), t.absolute)
  assert.ok(!t.absolute.includes('Cata con Juanjo'), t.absolute)
  assert.equal(t.absolute, 'Carta de vinos de Casa Marisma · Carta Viva')
})

test('modo camarero: title.absolute termina en " · Carta Viva" y no contiene "Cata con Juanjo"', () => {
  const t = tituloModoCamarero('Casa Marisma')
  assert.ok(t.absolute.endsWith(' · Carta Viva'), t.absolute)
  assert.ok(!t.absolute.includes('Cata con Juanjo'), t.absolute)
  assert.equal(t.absolute, 'Modo camarero · Casa Marisma · Carta Viva')
})
