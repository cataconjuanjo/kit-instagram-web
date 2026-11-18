/**
 * Regression: el bundle de servidor que genera el PDF del informe
 * (/api/somm/informe-mensual) NO debe importar módulos marcados con
 * 'use client'. Si lo hiciera, Next.js convierte los imports en
 * client-references y las funciones lanzan en runtime:
 *
 *   "Attempted to call <fn>() from the server but <fn> is on the
 *    client. It's not possible to invoke a client function from the
 *    server…"
 *
 * Ese error cae en el try/catch de cargarLogoPdf → logo=null → el PDF
 * se genera sin imagen (bug reproducido en el preview d48b846:
 * 9.4 KB, 0 objetos /Subtype /Image).
 *
 * El test:
 *  - Lee los dos ficheros server-path (pdfEstilos.js, isotipoBase64.js)
 *    y app/api/somm/informe-mensual/route.js.
 *  - Para cada import relativo en esos ficheros, abre el fichero
 *    destino y verifica que su primera línea no sea 'use client'.
 *  - Recurre en los imports transitorios hasta estabilizarse.
 *
 * Ejecutar: node --test scripts/pdfEstilosServerBoundary.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

function esUseClient(file) {
  if (!fs.existsSync(file)) return false
  const src = fs.readFileSync(file, 'utf8')
  // Ignorar BOM / comentarios iniciales no — Next sólo acepta la
  // directiva si está en la primera línea sin comentarios delante.
  const firstCode = src.trimStart().split('\n')[0].trim()
  return firstCode === "'use client'" || firstCode === '"use client"'
}

function resolverImport(desde, especificador) {
  if (!especificador.startsWith('.')) return null
  const base = path.dirname(desde)
  const sinExt = path.resolve(base, especificador)
  const candidatos = [
    sinExt,
    sinExt + '.js',
    sinExt + '.mjs',
    sinExt + '.jsx',
    path.join(sinExt, 'index.js'),
  ]
  for (const c of candidatos) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c
  }
  return null
}

function extraerImportsRelativos(src) {
  const out = []
  const re = /import\s+(?:[^'"]+?from\s+)?['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src)) !== null) {
    if (m[1].startsWith('.')) out.push(m[1])
  }
  return out
}

function cerrarGrafo(entrada) {
  const visitados = new Set()
  const pila = [entrada]
  while (pila.length > 0) {
    const f = pila.pop()
    if (visitados.has(f)) continue
    visitados.add(f)
    const src = fs.readFileSync(f, 'utf8')
    for (const spec of extraerImportsRelativos(src)) {
      const r = resolverImport(f, spec)
      if (r) pila.push(r)
    }
  }
  return visitados
}

describe("server bundle del PDF — ningún módulo transitivo con 'use client'", () => {
  const entradas = [
    path.join(ROOT, 'app/api/somm/informe-mensual/route.js'),
    path.join(ROOT, 'app/lib/pdfEstilos.js'),
    path.join(ROOT, 'app/lib/isotipoBase64.js'),
  ]

  for (const entrada of entradas) {
    it(`cerrando grafo desde ${path.relative(ROOT, entrada)}`, () => {
      assert.ok(fs.existsSync(entrada), `${entrada} no existe`)
      const grafo = cerrarGrafo(entrada)
      const useClient = [...grafo].filter(esUseClient)
      assert.equal(
        useClient.length,
        0,
        `Módulos con 'use client' en el grafo del server:\n` +
        useClient.map(f => '  ' + path.relative(ROOT, f)).join('\n'),
      )
    })
  }

  it("app/lib/excelEstilos.js explícitamente NO lleva 'use client'", () => {
    const f = path.join(ROOT, 'app/lib/excelEstilos.js')
    assert.ok(fs.existsSync(f))
    assert.equal(
      esUseClient(f),
      false,
      "excelEstilos.js volvió a marcarse como 'use client' — eso rompe " +
      'leerDimensionesPng en el bundle del PDF (bug fd9e83e). Si de verdad ' +
      "lo necesitas, mueve BRAND y leerDimensionesPng a otro módulo sin 'use client'.",
    )
  })
})
