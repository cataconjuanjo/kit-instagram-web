// Smoke test estático de la matriz endpoint → guard de catálogo privado.
//
// Verifica que CADA método exportado (GET/POST/PATCH/DELETE) de los
// endpoints que leen proveedor_catalogo_vinos / proveedores_vino llama al
// helper único `requireCatalogoConsultor`. Evita regresiones como la de
// /api/simulador/pedidos (solo POST tenía el gate; GET y PATCH quedaban
// abiertos y el admin pasaba por `requireRestaurantAccess`).
//
// Ejecutar: node --test scripts/catalogoGateMatrix.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const leer = (ruta) => readFileSync(resolve(root, ruta), 'utf8')

// Endpoints que leen el catálogo privado. Deben usar
// `requireCatalogoConsultor` en TODOS sus métodos exportados.
const ENDPOINTS_CATALOGO = [
  'app/api/catalogo-consultor/route.js',
  'app/api/proveedores-catalogo/route.js',
  'app/api/proveedores-visibles/route.js',
  'app/api/simulador/anadir-catalogo/route.js',
  'app/api/simulador/sustituir/route.js',
  'app/api/simulador/sugerir-carta/route.js',
  'app/api/simulador/pedidos/route.js',
  'app/api/simulador/proveedores-breakdown/route.js',
  'app/api/simulador/seleccionar-oferta/route.js',
  'app/api/simulador/descartar-sugerencias/route.js',
  'app/api/simulador/recalcular-copa-catalogo/route.js',
]

// Localiza los cuerpos de los métodos exportados `GET`, `POST`, `PATCH`,
// `DELETE`. Devuelve `{ metodo, cuerpo }[]`. Usa un escaneo de llaves
// simple (sin AST) que es suficiente para los handlers típicos de Next.
function extraerMetodosExportados(src) {
  const metodos = ['GET', 'POST', 'PATCH', 'DELETE']
  const resultado = []
  for (const metodo of metodos) {
    const re = new RegExp(`export\\s+async\\s+function\\s+${metodo}\\s*\\(`, 'g')
    const match = re.exec(src)
    if (!match) continue
    // Encontrar la llave que abre la función y recorrer hasta cerrarla.
    let i = src.indexOf('{', match.index)
    if (i < 0) continue
    let depth = 0
    let inicio = i
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) { resultado.push({ metodo, cuerpo: src.slice(inicio, i + 1) }); break }
      }
    }
  }
  return resultado
}

for (const ruta of ENDPOINTS_CATALOGO) {
  test(`${ruta}: cada método exportado usa requireCatalogoConsultor`, () => {
    const src = leer(ruta)
    const metodos = extraerMetodosExportados(src)
    assert.ok(metodos.length > 0, `${ruta}: no se detectaron métodos exportados`)
    for (const { metodo, cuerpo } of metodos) {
      assert.ok(
        cuerpo.includes('requireCatalogoConsultor('),
        `${ruta} ${metodo}: debe invocar requireCatalogoConsultor() (regresión F1 bloque fuga)`
      )
      // Defensa en profundidad: el fichero importa el helper.
      assert.ok(
        src.includes("requireCatalogoConsultor"),
        `${ruta}: falta import del helper`
      )
    }
  })
}

// Rutas admin-only del catálogo: no usan `requireCatalogoConsultor` porque
// son herramientas internas del consultor (bypass admin deliberado).
const ENDPOINTS_ADMIN = [
  'app/api/admin/proveedores/route.js',
  'app/api/admin/normalizar-catalogo/route.js',
]
for (const ruta of ENDPOINTS_ADMIN) {
  test(`${ruta}: admin-only (bypass deliberado)`, () => {
    const src = leer(ruta)
    assert.ok(
      /adminEmail|ADMIN_EMAIL|getAdminEmail/.test(src),
      `${ruta} debe validar el email admin`
    )
  })
}

// GET /api/simulador: strip canónico de claves del catálogo cuando el
// plan no tiene catalogo_consultor (ver simuladorPayload.js).
test('GET /api/simulador usa CLAVES_CATALOGO_CONSULTOR para strip', () => {
  const src = leer('app/api/simulador/route.js')
  assert.ok(src.includes('puedeUsarEditorCarta'), 'editor_carta gate')
  assert.ok(src.includes('CLAVES_CATALOGO_CONSULTOR'), 'usa la lista canónica de claves')
})
