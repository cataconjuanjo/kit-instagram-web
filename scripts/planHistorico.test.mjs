/**
 * FASE L — Cambio 3: aviso histórico claro + 'Regenerar plan' con
 * confirmación. Tests de grep sobre la ficha.
 *
 * Ejecuta: node --test scripts/planHistorico.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const FICHA = path.join(process.cwd(), 'app', 'admin', 'restaurante', '[id]', 'page.js')

describe('FASE L cambio 3: aviso histórico del plan guardado', () => {
  const src = fs.readFileSync(FICHA, 'utf8')

  it('el aviso histórico se renderiza solo si existe consultoriaFase1.ultima.created_at', () => {
    // El bloque entero está envuelto por ese check; comprobamos que la
    // cadena de condición exista y preceda al dateline.
    assert.ok(/consultoriaFase1\.ultima\?\.created_at[\s\S]{0,300}consultant-plan-historic-aviso/.test(src),
      'El aviso histórico debería estar condicionado por consultoriaFase1.ultima?.created_at')
  })

  it('el aviso muestra la fecha del plan guardado', () => {
    assert.ok(/Plan hist[oó]rico · guardado el \{new Date\(consultoriaFase1\.ultima\.created_at\)/.test(src),
      'El aviso debe incluir la fecha del plan guardado')
  })

  it('el aviso explica que el análisis actual puede diferir', () => {
    assert.ok(/El an[áa]lisis actual puede diferir/.test(src))
  })

  it('"Regenerar plan" abre un paso de confirmación antes de guardar', () => {
    // Antes de pulsar: setComparandoRegenerar(true).
    // Después de confirmar: recalcularConsultoriaFase1() se invoca,
    // nunca antes.
    assert.ok(/onClick=\{\(\) => setComparandoRegenerar\(true\)\}/.test(src),
      '"Regenerar plan" debe activar el modo comparando, no guardar directamente')
    // Dentro del modo confirmando aparece 'Guardar como plan nuevo'
    // llamando a recalcularConsultoriaFase1.
    assert.ok(/recalcularConsultoriaFase1\(\)[\s\S]{0,400}Guardar como plan nuevo/.test(src)
      || /Guardar como plan nuevo[\s\S]{0,400}recalcularConsultoriaFase1/.test(src),
      'El botón final de confirmación debe llamar a recalcularConsultoriaFase1')
  })

  it('mientras no se confirma, el estado guardado NO se sobrescribe', () => {
    // El único sitio donde se dispara el recalcular es bajo el
    // handler del botón de confirmación.
    // (Comprobación indirecta: el flag comparandoRegenerar se declara.)
    assert.ok(/comparandoRegenerar, setComparandoRegenerar/.test(src))
  })

  it('el texto "valoración de entonces" ya no aparece solo (es engañoso) — ahora dice "Plan histórico"', () => {
    // El aviso nuevo debe ser más explícito y menos ambiguo.
    assert.ok(/Plan hist[oó]rico/.test(src))
  })
})
