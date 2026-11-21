/**
 * Fase E-2 — el payload enviado a guardarSupuestos NO debe incluir
 * ventas_previstas_fijo si el usuario NO ha editado ese campo y NO
 * había un fijo guardado previamente.
 *
 * El componente no es trivial de montar en Node, así que replicamos
 * la LÓGICA PURA que decide qué va al payload (idéntica a `onGuardar`
 * en app/dashboard/bodega/SimuladorMargenBodega.js). Si alguien
 * cambia esa lógica, hay que cambiar también estos tests.
 *
 * Reglas:
 *   - materiales/suministros/otros/beneficio_objetivo: siempre en el
 *     payload (los descarta `limpiarSupuestos` si están vacíos).
 *   - ventas_previstas_fijo: SOLO si overrides.ventas_previstas !== undefined
 *     O supuestosGuardados.ventas_previstas_fijo != null.
 *
 * Ejecutar: node --test scripts/simuladorMargenGuardado.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { limpiarSupuestos } from '../app/lib/simuladorMargen.js'

// Réplica fiel de la función onGuardar del componente.
function construirPayloadGuardar({ form, overrides, supuestosGuardados }) {
  const payload = {
    materiales:         form.materiales,
    suministros:        form.suministros,
    otros:              form.otros,
    beneficio_objetivo: form.beneficio_objetivo,
  }
  const editadoEnSesion = overrides.ventas_previstas !== undefined
  const yaGuardadoFijo  = supuestosGuardados?.ventas_previstas_fijo != null
  if (editadoEnSesion || yaGuardadoFijo) {
    payload.ventas_previstas_fijo = form.ventas_previstas
  }
  return payload
}

describe('onGuardar — ventas_previstas se guarda SOLO si es manual', () => {
  it('sin edit y sin fijo previo → payload NO lleva ventas_previstas_fijo', () => {
    // El usuario abrió el simulador en octubre, el campo ventas se
    // precargó con 9.621,82 del snapshot, NO la tocó, y le dio a Guardar.
    const payload = construirPayloadGuardar({
      form: {
        materiales: '', suministros: '', otros: '', beneficio_objetivo: '',
        ventas_previstas: '9621,82',  // precargado del mes
      },
      overrides: {},                   // ← ninguna edición
      supuestosGuardados: null,
    })
    assert.equal('ventas_previstas_fijo' in payload, false,
      'no debería persistirse un valor precargado que el usuario no tocó')
    // Materiales y demás sí están en el payload (vacíos → limpiarSupuestos los tira):
    assert.ok('materiales' in payload)
  })

  it('con edit explícito → payload SÍ lleva ventas_previstas_fijo (el valor editado)', () => {
    const payload = construirPayloadGuardar({
      form: {
        materiales: '', suministros: '', otros: '', beneficio_objetivo: '',
        ventas_previstas: '12000,00',
      },
      overrides: { ventas_previstas: '12000,00' },  // ← user editó
      supuestosGuardados: null,
    })
    assert.equal(payload.ventas_previstas_fijo, '12000,00')
  })

  it('con fijo YA guardado y sin edit en esta sesión → mantiene el fijo guardado', () => {
    // Usuario había fijado 15.000 en sesión anterior; abre, no toca
    // y guarda. El fijo debe preservarse (no borrarse por el guardado).
    const payload = construirPayloadGuardar({
      form: {
        materiales: '', suministros: '', otros: '', beneficio_objetivo: '',
        ventas_previstas: '15000,00',
      },
      overrides: {},
      supuestosGuardados: { ventas_previstas_fijo: 15000 },
    })
    assert.equal(payload.ventas_previstas_fijo, '15000,00')
  })

  it('tras "Restablecer al dato real" (sin edit, sin fijo) → payload limpio', () => {
    // restablecerCampo ya limpia supuestosGuardados.ventas_previstas_fijo
    // a null y borra el override. Un guardar inmediato NO debe
    // recongelar el valor.
    const payload = construirPayloadGuardar({
      form: {
        materiales: '', suministros: '', otros: '', beneficio_objetivo: '',
        ventas_previstas: '9621,82',   // vuelve a la precarga del mes
      },
      overrides: {},
      supuestosGuardados: { ventas_previstas_fijo: null },
    })
    assert.equal('ventas_previstas_fijo' in payload, false)
  })

  it('materiales/suministros/otros/beneficio se envían siempre (vacíos los tira limpiarSupuestos)', () => {
    const payload = construirPayloadGuardar({
      form: {
        materiales: '20', suministros: '40,50', otros: '', beneficio_objetivo: '5000',
        ventas_previstas: '9621,82',
      },
      overrides: {},
      supuestosGuardados: null,
    })
    assert.equal(payload.materiales,        '20')
    assert.equal(payload.suministros,       '40,50')
    assert.equal(payload.otros,             '')   // → limpiarSupuestos lo descarta
    assert.equal(payload.beneficio_objetivo,'5000')
  })

  it('end-to-end con limpiarSupuestos: lo que llega a la BD es coherente', () => {
    // No edit + no fijo previo → el objeto limpio para upsert NO tiene
    // ventas_previstas_fijo, aunque sí tiene materiales/beneficio con datos.
    const payload = construirPayloadGuardar({
      form: {
        materiales: '20', suministros: '', otros: '', beneficio_objetivo: '5000',
        ventas_previstas: '9621,82',
      },
      overrides: {},
      supuestosGuardados: null,
    })
    const limpio = limpiarSupuestos(payload)
    assert.deepEqual(limpio, { materiales: 20, beneficio_objetivo: 5000 },
      'upsert solo debe llevar los campos manuales no vacíos')
    assert.equal('ventas_previstas_fijo' in limpio, false)
  })

  it('end-to-end con edit: el fijo editado SÍ llega a la BD', () => {
    const payload = construirPayloadGuardar({
      form: {
        materiales: '', suministros: '', otros: '', beneficio_objetivo: '',
        ventas_previstas: '12000',
      },
      overrides: { ventas_previstas: '12000' },
      supuestosGuardados: null,
    })
    const limpio = limpiarSupuestos(payload)
    assert.equal(limpio.ventas_previstas_fijo, 12000)
  })
})
