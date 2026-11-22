/**
 * FASE J2 — tests de las pestañas reales de la ficha.
 *
 * Garantiza:
 *  - El resolvedor de ?tab=X cae en 'resumen' si falta o si el valor es
 *    desconocido; respeta cualquier tab de la lista oficial.
 *  - Cada pestaña declara qué campos consume del analisis, y esos campos
 *    EXISTEN en el output de analizarRestaurante (si no, un .map explota
 *    en el preview como pasó en fase J-fix 3).
 *
 * Ejecuta: node --test scripts/fichaTabs.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TABS_VALIDOS, TAB_POR_DEFECTO, resolverTab, CAMPOS_POR_PESTANA } from '../app/lib/fichaTabs.js'
import { analizarRestaurante } from '../app/lib/analizarRestaurante.js'

describe('resolverTab', () => {
  it('resuelve cada tab válido al mismo valor', () => {
    for (const tab of TABS_VALIDOS) {
      assert.equal(resolverTab(tab), tab)
    }
  })
  it('param vacío → por defecto', () => {
    assert.equal(resolverTab(''), TAB_POR_DEFECTO)
    assert.equal(resolverTab(null), TAB_POR_DEFECTO)
    assert.equal(resolverTab(undefined), TAB_POR_DEFECTO)
  })
  it('param inválido → por defecto (no se filtra como XSS tampoco)', () => {
    assert.equal(resolverTab('cosas'), TAB_POR_DEFECTO)
    assert.equal(resolverTab('<script>'), TAB_POR_DEFECTO)
    assert.equal(resolverTab('RESUMEN'), 'resumen') // tolerante a mayúsculas
  })
  it('todas las 7 pestañas esperadas están en la lista oficial', () => {
    const esperadas = ['resumen', 'inteligencia', 'hallazgos', 'matching', 'propuestas', 'seleccion', 'informe']
    assert.deepEqual(TABS_VALIDOS, esperadas)
    assert.equal(TAB_POR_DEFECTO, 'resumen')
  })
})

// Fixture 'Casa Marisma-ish': se repite la lógica del test del motor
// pero aquí sólo usamos el output para comprobar contrato.
function casaMarisma() {
  return {
    restaurante: { id: 'cm', nombre: 'Casa Marisma', ciudad: 'Málaga', ticket_medio_comida: 38 },
    vinos: Array.from({ length: 22 }, (_, i) => ({
      id: `v${i}`, activo: true, nombre: `Vino ${i}`, tipo: i < 6 ? 'tinto' : i < 14 ? 'blanco' : 'espumoso',
      region: 'Rias Baixas', notas_cata: 'detalle suficiente', anada: 2020, stock: 5,
      coste_compra: 7, precio_botella: 25, precio_copa: i < 3 ? 4 : 0, proveedor: 'X', stock_minimo: 2,
    })),
    platos: [
      { nombre: 'Pescado', precio: 18, activo: true, descripcion: 'pescado' },
      { nombre: 'Carne', precio: 22, activo: true, descripcion: 'carne' },
    ],
    estadisticas: [],
    propuestas: [{ estado: 'enviada' }],
  }
}

describe('Contrato por pestaña: cada campo que la pestaña lee existe en el analisis', () => {
  const d = casaMarisma()
  const analisis = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)

  for (const [pestana, contrato] of Object.entries(CAMPOS_POR_PESTANA)) {
    it(`"${pestana}": todos los campos directos existen`, () => {
      for (const campo of contrato.directos || []) {
        assert.ok(campo in analisis, `pestaña ${pestana}: falta analisis.${campo}`)
      }
    })

    if (contrato.metricas) {
      it(`"${pestana}": sub-claves de metricas existen`, () => {
        for (const k of contrato.metricas) {
          assert.ok(k in analisis.metricas, `pestaña ${pestana}: falta analisis.metricas.${k}`)
        }
      })
    }
    if (contrato.diagnostico) {
      it(`"${pestana}": sub-claves de diagnostico existen`, () => {
        for (const k of contrato.diagnostico) {
          assert.ok(k in analisis.diagnostico, `pestaña ${pestana}: falta analisis.diagnostico.${k}`)
        }
      })
    }
    if (contrato.wineMapping) {
      it(`"${pestana}": wineMapping tiene las claves que la ficha pinta`, () => {
        for (const k of contrato.wineMapping) {
          assert.ok(k in (analisis.diagnostico.wineMapping || {}), `pestaña ${pestana}: falta analisis.diagnostico.wineMapping.${k}`)
        }
      })
    }
    if (contrato.gamaItem) {
      it(`"${pestana}": cada gama tiene los campos que la ficha renderiza`, () => {
        for (const gama of (analisis.diagnostico.wineMapping?.gamas || [])) {
          for (const k of contrato.gamaItem) {
            assert.ok(k in gama, `pestaña ${pestana}: falta gama.${k} en "${gama.label}"`)
          }
        }
      })
    }
  }
})

describe('REGRESIÓN J-fix 3: la ficha ya no accede a undefined.length en wineMapping', () => {
  const d = casaMarisma()
  const analisis = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)
  it('wineMapping.gamas[*].vinosDetalle es array (nunca undefined)', () => {
    for (const gama of analisis.diagnostico.wineMapping.gamas) {
      assert.ok(Array.isArray(gama.vinosDetalle), `vinosDetalle NO es array en "${gama.label}"`)
    }
  })
  it('wineMapping.reequilibrio.movimientos es array cuando reequilibrio existe', () => {
    const r = analisis.diagnostico.wineMapping.reequilibrio
    if (r) assert.ok(Array.isArray(r.movimientos))
  })
})
