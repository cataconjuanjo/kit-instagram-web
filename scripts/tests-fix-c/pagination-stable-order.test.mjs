// Regresión: toda query que pagina con .range() sobre tablas del catálogo
// debe llevar un criterio de orden único (.order('id') como último), o
// bien pasar por el helper seleccionarTodo() que ya lo fuerza.
//
// Causa raíz histórica: bloque 11/12/13. Sin tiebreaker por id, PostgREST
// podía devolver filas solapadas entre páginas cuando los criterios de
// orden tenían empates (created_at idéntico por imports en bloque,
// mismo nombre repetido, etc.). Resultado: refs duplicadas que el cliente
// deduplicaba por id -> 210 refs "desaparecían" en silencio del listado
// de "Todos los proveedores". En el CLI de ingesta, el mismo síntoma
// generaba falsas bajas y favoritos huérfanos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

// Ficheros vigilados: paginan y tocan tablas del catálogo.
// Al añadir otro paginated reader catalog-sensitive, listarlo aquí.
const FICHEROS = [
  'app/api/admin/proveedores/route.js',
  'app/api/proveedores-catalogo/route.js',
  'app/api/catalogo-consultor/route.js',
  'scripts/importar-tarifa.js',
]

function leer(p) {
  return readFileSync(path.join(ROOT, p), 'utf8')
}

// Para cada aparición de ".range(" en el fichero, verifica que en las
// ~12 líneas inmediatamente anteriores hay un ".order('id')" o que la
// invocación proviene de seleccionarTodo().
function cadaRangeTieneTiebreaker(contenido) {
  const lineas = contenido.split('\n')
  const fallos = []
  for (let i = 0; i < lineas.length; i++) {
    if (!/\.range\(/.test(lineas[i])) continue
    const inicio = Math.max(0, i - 12)
    const ventana = lineas.slice(inicio, i + 1).join('\n')
    const tieneId = /\.order\(\s*['"]id['"]/.test(ventana)
    const viaHelper = /seleccionarTodo\s*\(/.test(ventana)
    if (!tieneId && !viaHelper) {
      fallos.push({ linea: i + 1, texto: lineas[i].trim() })
    }
  }
  return fallos
}

for (const fichero of FICHEROS) {
  test(`${fichero}: toda .range() tiene .order('id') cercano`, () => {
    const contenido = leer(fichero)
    const fallos = cadaRangeTieneTiebreaker(contenido)
    assert.equal(fallos.length, 0,
      `Faltan tiebreakers en ${fichero}:\n` + fallos.map(f => `  linea ${f.linea}: ${f.texto}`).join('\n'))
  })
}

test('seleccionarTodo fuerza .order("id") antes de paginar', () => {
  const contenido = leer('app/api/admin/proveedores/route.js')
  // La función debe contener una línea tipo: query.order('id') antes
  // del while/range.
  const bloque = contenido.match(/async function seleccionarTodo[\s\S]{0,800}?\n\}/)
  assert.ok(bloque, 'seleccionarTodo no encontrado')
  assert.match(bloque[0], /\.order\(\s*['"]id['"]\s*\)/,
    'seleccionarTodo debe añadir .order("id") para desempate estable')
})
