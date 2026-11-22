/**
 * Fase G3 — decisor puro `estadoConteoInicial` sobre la respuesta
 * del endpoint GET /api/conteos.
 *
 * Reglas:
 *   - 'hecho' si control_stock_desde está fijado O si hay un item
 *     del array `conteos` con tipo='inicial' en estado 'cerrado' o
 *     con `cerrado_en` != null.
 *   - 'pendiente' si la respuesta llega bien formada pero no cumple
 *     ninguna de las dos señales anteriores.
 *   - 'desconocido' si la respuesta es null/falsy, no es objeto, o
 *     no trae ni `conteos` ni `control_stock_desde` → la UI NO
 *     muestra el paso del checklist (política: no avisar con dato
 *     desconocido).
 *
 * Ejecutar: node --test scripts/conteoInicialDecisor.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { estadoConteoInicial } from '../app/lib/conteoInicial.js'

describe('estadoConteoInicial — hecho', () => {
  it('fixture REAL del preview Ensayo Onboarding → hecho', () => {
    // GET /api/conteos devolvió literalmente esto según el usuario.
    const r = {
      conteos: [{ tipo: 'inicial', estado: 'cerrado', cerrado_en: '2026-11-21T10:00:00Z' }],
      borrador: null,
      control_stock_desde: '2026-11-21',
    }
    assert.equal(estadoConteoInicial(r), 'hecho')
  })

  it('control_stock_desde solo (sin lista explícita) → hecho', () => {
    assert.equal(
      estadoConteoInicial({ control_stock_desde: '2026-11-21', conteos: [], borrador: null }),
      'hecho',
    )
  })

  it('conteo inicial cerrado aunque control_stock_desde sea null → hecho', () => {
    assert.equal(
      estadoConteoInicial({
        control_stock_desde: null,
        conteos: [{ tipo: 'inicial', estado: 'cerrado' }],
        borrador: null,
      }),
      'hecho',
    )
  })

  it('redundancia: conteo inicial con cerrado_en != null (estado faltante) → hecho', () => {
    assert.equal(
      estadoConteoInicial({
        control_stock_desde: null,
        conteos: [{ tipo: 'inicial', cerrado_en: '2026-11-21T10:00:00Z' }],
        borrador: null,
      }),
      'hecho',
    )
  })
})

describe('estadoConteoInicial — pendiente', () => {
  it('sin conteos y sin fecha → pendiente', () => {
    assert.equal(
      estadoConteoInicial({ control_stock_desde: null, conteos: [], borrador: null }),
      'pendiente',
    )
  })

  it('hay conteo inicial en estado borrador → pendiente', () => {
    assert.equal(
      estadoConteoInicial({
        control_stock_desde: null,
        conteos: [{ tipo: 'inicial', estado: 'borrador' }],
        borrador: { id: 'x' },
      }),
      'pendiente',
    )
  })

  it('hay conteos pero NINGUNO es tipo inicial (solo periódicos) → pendiente', () => {
    assert.equal(
      estadoConteoInicial({
        control_stock_desde: null,
        conteos: [{ tipo: 'periodico', estado: 'cerrado' }],
        borrador: null,
      }),
      'pendiente',
    )
  })

  it('control_stock_desde cadena vacía no cuenta como hecho', () => {
    assert.equal(
      estadoConteoInicial({ control_stock_desde: '', conteos: [], borrador: null }),
      'pendiente',
    )
  })
})

describe('estadoConteoInicial — desconocido (nunca mostrar)', () => {
  it('respuesta null / undefined → desconocido', () => {
    assert.equal(estadoConteoInicial(null), 'desconocido')
    assert.equal(estadoConteoInicial(undefined), 'desconocido')
  })

  it('no es objeto → desconocido', () => {
    assert.equal(estadoConteoInicial('ok'), 'desconocido')
    assert.equal(estadoConteoInicial(42), 'desconocido')
  })

  it('objeto SIN conteos ni control_stock_desde → desconocido', () => {
    assert.equal(estadoConteoInicial({ otraCosa: true }), 'desconocido')
  })

  it('conteos no es array → desconocido', () => {
    assert.equal(estadoConteoInicial({ conteos: 'malformada' }), 'desconocido')
  })
})

describe('contract — nunca falsos positivos', () => {
  it('conteos con item inicial pero sin estado ni cerrado_en → pendiente (no hecho)', () => {
    assert.equal(
      estadoConteoInicial({
        control_stock_desde: null,
        conteos: [{ tipo: 'inicial' }],   // sin estado/cerrado_en
        borrador: null,
      }),
      'pendiente',
    )
  })
})
