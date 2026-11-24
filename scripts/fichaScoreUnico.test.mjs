/**
 * FASE J2 — Bloque 3: una sola puntuación por restaurante en la ficha.
 *
 * El motor único (analizarRestaurante) es la fuente del score y la
 * prioridad. El snapshot del plan guardado (consultoriaFase1.consultor.
 * diagnostic.score) se debe presentar SÓLO como contexto histórico, no
 * como score actual. Este test lee el fichero de la ficha y verifica
 * que no renderiza el score del snapshot.
 *
 * Ejecuta: node --test scripts/fichaScoreUnico.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const FICHA = path.join(process.cwd(), 'app', 'admin', 'restaurante', '[id]', 'page.js')

describe('Ficha: una sola puntuación visible', () => {
  const src = fs.readFileSync(FICHA, 'utf8')

  it('no renderiza <strong>{...diagnostic.score}</strong> (snapshot presentado como actual)', () => {
    // Antes aparecía: <strong>{consultoriaFase1.consultor.diagnostic.score}</strong>
    // Lo eliminamos en fase J2 — solo queda calcPuntuacion(analisis).score en el header.
    const malo = /<strong>\s*\{[^}]*diagnostic\.score[^}]*\}\s*<\/strong>/
    assert.ok(!malo.test(src), 'La ficha sigue renderizando el score persistido como actual.')
  })

  it('renderiza el score del motor único via calcPuntuacion(analisis)', () => {
    // Acepta espacios/saltos arbitrarios entre llaves y la llamada:
    //   <span>{calcPuntuacion(analisis).score}</span>
    // El JSX real puede tener saltos de línea, por eso una regex suelta:
    const esperado = /calcPuntuacion\s*\(\s*analisis\s*\)\.score/
    assert.ok(esperado.test(src), 'No encontré calcPuntuacion(analisis).score en la ficha.')
  })

  it('cuando se renderiza el snapshot histórico, lleva etiqueta de fecha', () => {
    // Si existe el bloque consultant-plan-status, debe acompañarse de la
    // dateline con fecha. Fase L renombró el texto a "Plan histórico ·
    // guardado el <fecha>", así que aceptamos cualquiera de las dos
    // redacciones (histórica o actual).
    const haySnapshot = /consultant-plan-status/.test(src)
    if (!haySnapshot) return // si se elimina todo el plan guardado, mejor.
    const hayDateline = /consultant-plan-dateline/.test(src) && /guardado el /.test(src)
    assert.ok(hayDateline, 'El snapshot del plan guardado se muestra sin etiqueta "guardado el ...".')
  })

  it('el bloque consultant-plan-status ya no incluye Score', () => {
    // Buscamos el span "Score" seguido de <strong>{...diagnostic.score}</strong>
    // dentro del plan consultor.
    const bloque = src.match(/consultant-plan-status[\s\S]{0,800}?<\/div>/m)
    if (bloque) {
      assert.ok(!/<span>Score<\/span>/.test(bloque[0]),
        'El bloque consultant-plan-status aún muestra "Score" del snapshot.')
    }
  })
})
