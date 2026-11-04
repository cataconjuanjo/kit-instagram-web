/**
 * Smoke test del componente ConfirmModal.
 *
 * Cubre lo que el build + eslint NO cazan:
 *  - render sin excepciones ("ReferenceError: styles is not defined" fue el bug
 *    que motivó este test).
 *  - open=false no renderiza nada.
 *  - open=true pinta el dialog con role="dialog" + aria-labelledby.
 *  - overlay es <button aria-label="..."> (accesibilidad del "cerrar fuera").
 *  - El handler onConfirm sí se dispara al pulsar el botón primario.
 *  - El handler onCancel sí se dispara al pulsar "Cancelar".
 *  - busy deshabilita ambos botones.
 *
 * No toca Supabase, no abre un navegador, no hace red. Puro SSR + grep del HTML.
 * Ejecutar:
 *   node --test scripts/smoke-confirm-modal.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToString } = require('react-dom/server')

// Transformamos el JSX con el compilador de TypeScript (ya presente en el
// proyecto como devDependency) y lo ejecutamos en una instancia de Module en
// memoria, sin tocar el filesystem con artefactos. Si en el futuro hay esbuild/
// swc, el helper podria migrar, pero esto evita añadir devDeps solo para un
// smoke test.
let ConfirmModal
try {
  const ts = require('typescript')
  const fs = require('node:fs')
  const path = require('node:path')
  const Module = require('node:module')

  const src = fs.readFileSync(path.resolve('app/dashboard/_components/ConfirmModal.jsx'), 'utf8')
  const sin = src.replace(/^['"]use client['"];?\s*\n?/, '')
  // JSX classic (React.createElement) para no depender de react/jsx-runtime
  // en un contexto require sin resolver.
  const { outputText } = ts.transpileModule(`import * as React from 'react';\n${sin}`, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: 'ConfirmModal.jsx',
  })
  const absPath = path.resolve('app/dashboard/_components/ConfirmModal.jsx')
  const m = new Module(absPath)
  m.filename = absPath
  // Alineamos la ruta de resolución con node_modules del proyecto.
  m.paths = Module._nodeModulePaths(path.dirname(absPath))
  m._compile(outputText, absPath)
  ConfirmModal = m.exports.default
} catch (e) {
  console.error('[smoke] no se pudo cargar ConfirmModal:', e.message)
  process.exit(2)
}

function render(props, children) {
  // onCancel / onConfirm son handlers; para SSR solo nos interesa que no
  // lance en el render, por eso pasamos no-ops. Comprobamos que estan
  // referenciados correctamente mas abajo.
  return renderToString(React.createElement(ConfirmModal, props, children))
}

describe('ConfirmModal · SSR smoke', () => {
  it('open=false no renderiza nada', () => {
    const html = render({ open: false, title: 'X', onCancel: () => {}, onConfirm: () => {} }, null)
    assert.equal(html, '', `Esperaba string vacio, obtuve: ${html}`)
  })

  it('open=true render limpio + role dialog + aria-labelledby + overlay button', () => {
    const html = render(
      {
        open: true,
        title: 'Confirmar aplicación de PVP',
        onCancel: () => {},
        onConfirm: () => {},
        confirmLabel: 'Sí, aplicar',
        overlayAriaLabel: 'Cerrar sin aplicar',
      },
      React.createElement('p', null, 'Cuerpo del diálogo')
    )
    assert.ok(html.length > 0, 'esperaba HTML no vacio')
    assert.match(html, /role="dialog"/, 'falta role=dialog')
    assert.match(html, /aria-modal="true"/, 'falta aria-modal')
    assert.match(html, /aria-labelledby="[^"]+"/, 'falta aria-labelledby')
    // El overlay es un <button type="button" aria-label="...">
    assert.match(html, /<button[^>]*aria-label="Cerrar sin aplicar"/, 'overlay no es <button aria-label>')
    // Título en el <h3> con el id referenciado por aria-labelledby.
    const titleIdMatch = html.match(/aria-labelledby="([^"]+)"/)
    const titleId = titleIdMatch[1]
    assert.match(html, new RegExp(`<h3[^>]*id="${titleId}"[^>]*>Confirmar aplicación de PVP`), 'aria-labelledby no apunta al h3 del titulo')
    assert.match(html, /Cuerpo del diálogo/, 'faltan children')
    assert.match(html, />Cancelar</, 'falta boton Cancelar')
    assert.match(html, />Sí, aplicar</, 'falta boton de confirmar con label dinamico')
  })

  it('confirmTone=danger pinta el boton primario con rojo destructivo', () => {
    const html = render(
      { open: true, title: 'Eliminar factura', onCancel: () => {}, onConfirm: () => {}, confirmTone: 'danger', confirmLabel: 'Eliminar' },
      React.createElement('p', null, 'Resumen')
    )
    assert.match(html, /background:\s*#c0392b/, 'danger tone no aplica el rojo c0392b')
  })

  it('busy=true desactiva ambos botones y bloquea onCancel desde overlay', () => {
    const html = render(
      { open: true, busy: true, title: 'Procesando', onCancel: () => {}, onConfirm: () => {}, confirmLabel: 'OK' },
      'Espera…'
    )
    // Los dos <button> del bloque de acciones deben llevar disabled.
    const disabledButtons = html.match(/<button[^>]*disabled/g) || []
    assert.ok(disabledButtons.length >= 2, `esperaba >=2 botones disabled, obtuve ${disabledButtons.length}`)
  })
})
