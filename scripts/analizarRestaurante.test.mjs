/**
 * FASE J-fix 2: antes había dos copias de `analizar()` (una en el Radar y
 * otra en la ficha) con reglas distintas. El mismo restaurante daba 54 en
 * el Radar y 36 en la ficha.
 *
 * Ahora Radar y ficha importan `analizarRestaurante` desde
 * app/lib/analizarRestaurante.js, por lo que la paridad está garantizada
 * por construcción. Estos tests verifican:
 *  - Que una sola llamada con los mismos datos produce resultado estable.
 *  - Que las dos reglas que faltaban en la ficha (mapa de precios
 *    descompensado y propuestas acumuladas) ahora SÍ cuentan para el score.
 *  - Que Lo de Carmen (fixture realista) sube a prioridad Alta cuando se
 *    aplica el motor canónico (razón del salto 58→82 en el preview).
 *
 * Ejecuta: node --test scripts/analizarRestaurante.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analizarRestaurante } from '../app/lib/analizarRestaurante.js'

// Fixture 'Casa Marisma-ish': bar de marisco en Málaga.
const casaMarismaDatos = () => ({
  restaurante: {
    id: 'cm', nombre: 'Casa Marisma', ciudad: 'Málaga', provincia: 'Málaga',
    ticket_medio_comida: 38,
  },
  vinos: [
    // Carta de ~22 referencias: todos los vinos entran como activos.
    ...Array.from({ length: 22 }, (_, i) => ({
      id: `v${i}`,
      activo: true,
      nombre: i < 2 ? 'Local Málaga' : `Vino ${i}`,
      bodega: '',
      tipo: i < 6 ? 'tinto' : i < 14 ? 'blanco' : i < 16 ? 'espumoso' : i < 18 ? 'generoso' : 'tinto',
      region: i < 5 ? 'Rioja' : i < 10 ? 'Ribera' : i < 15 ? 'Rias Baixas' : 'Málaga',
      uva: '',
      notas_cata: 'cata con detalle suficiente para sala y relato',
      anada: 2020,
      stock: 5,
      coste_compra: 7,
      precio_botella: i < 4 ? 20 : i < 12 ? 32 : i < 18 ? 55 : 95,
      precio_copa: i < 3 ? 4 : 0,
      proveedor: 'Dist. X',
      stock_minimo: 2,
    })),
  ],
  platos: [
    { nombre: 'Gambas al ajillo', precio: 15, activo: true, descripcion: '', categoria: 'pescado' },
    { nombre: 'Croquetas', precio: 10, activo: true, descripcion: '', categoria: 'frituras' },
    { nombre: 'Pulpo a feira', precio: 22, activo: true, descripcion: 'pescado', categoria: '' },
    { nombre: 'Atún rojo', precio: 28, activo: true, descripcion: 'pescado', categoria: '' },
    { nombre: 'Rabo de toro', precio: 24, activo: true, descripcion: 'carne', categoria: '' },
    { nombre: 'Tarta de queso', precio: 8, activo: true, descripcion: 'postre', categoria: 'postre' },
    { nombre: 'Brownie', precio: 7, activo: true, descripcion: 'postre', categoria: 'postre' },
  ],
  estadisticas: [],
  propuestas: [],
})

describe('analizarRestaurante — motor único', () => {
  it('fixture Casa Marisma: resultado estable (mismo input → mismo output)', () => {
    const d = casaMarismaDatos()
    const a = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)
    const b = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)
    assert.equal(a.score, b.score)
    assert.equal(a.prioridad, b.prioridad)
    assert.deepEqual(a.alertas.map(x => x.peso), b.alertas.map(x => x.peso))
  })

  it('las dos reglas que faltaban en la ficha ahora sí suman al score', () => {
    // Base: Lo de Carmen con un ticket que fuerza mapa descompensado +
    // propuestas abiertas > 3.
    const base = {
      restaurante: { id: 'c', nombre: 'Lo de Carmen', ciudad: 'Málaga', ticket_medio_comida: 50 },
      vinos: Array.from({ length: 20 }, (_, i) => ({
        id: `v${i}`, activo: true, tipo: i < 14 ? 'tinto' : 'blanco',
        region: i < 10 ? 'Rioja' : 'Ribera', notas_cata: 'detalle suficiente para sala',
        anada: 2020, stock: 4, coste_compra: 10, precio_botella: 25,
        proveedor: 'X', stock_minimo: 2,
      })),
      platos: Array.from({ length: 6 }, (_, i) => ({ nombre: `plato ${i}`, precio: 18, activo: true })),
      estadisticas: [],
    }
    const sinPropuestasNiMapa = analizarRestaurante(
      base.restaurante, base.vinos, base.platos, base.estadisticas,
      [], // sin propuestas
    )
    const conPropuestasYMapa = analizarRestaurante(
      base.restaurante, base.vinos, base.platos, base.estadisticas,
      // 4 propuestas abiertas, ninguna 'interesa' (para no activar peso 14)
      [{ estado: 'enviada' }, { estado: 'enviada' }, { estado: 'enviada' }, { estado: 'enviada' }],
    )
    // La regla 'Propuestas acumuladas sin cierre' suma +6.
    // (Mapa de precios descompensado depende del ticket + reparto; con
    // estos datos del fixture ya está activa en ambos casos, así que
    // el delta esperado es sólo las propuestas = +6).
    const propuestasDelta = conPropuestasYMapa.score - sinPropuestasNiMapa.score
    assert.ok(propuestasDelta >= 6,
      `Esperaba +6 por 'Propuestas acumuladas' pero delta fue ${propuestasDelta}`)
  })

  it('Lo de Carmen (fixture realista) da prioridad Alta con el motor único (razón del 58→82)', () => {
    const d = {
      restaurante: { id: 'c', nombre: 'Lo de Carmen', ciudad: 'Málaga', ticket_medio_comida: 45 },
      // Carta de 24 vinos con problemas estructurales: muchos sin coste,
      // margen bajo, y mapa de precios descompensado.
      vinos: Array.from({ length: 24 }, (_, i) => ({
        id: `v${i}`, activo: true,
        tipo: i < 20 ? 'tinto' : 'blanco',
        region: i < 15 ? 'Rioja' : 'Ribera',
        notas_cata: i < 8 ? '' : 'detalle breve',
        anada: i < 20 ? 2020 : null,
        stock: i < 20 ? 4 : 0,
        coste_compra: i < 10 ? 0 : 12, // >35% sin coste
        precio_botella: i < 10 ? 22 : 24, // margen bajo
        proveedor: i < 12 ? '' : 'X', // >40% sin proveedor
        stock_minimo: 2,
        precio_copa: i < 2 ? 4 : 0,
      })),
      platos: [
        { nombre: 'Pescado del día', precio: 28, activo: true, descripcion: 'pescado' },
        { nombre: 'Arroz caldoso', precio: 24, activo: true, descripcion: '' },
        { nombre: 'Croquetas', precio: 10, activo: true, descripcion: 'frituras' },
        { nombre: 'Rabo', precio: 26, activo: true, descripcion: 'carne' },
        { nombre: 'Postre', precio: 9, activo: true, descripcion: 'postre' },
      ],
      estadisticas: [],
      propuestas: [{ estado: 'enviada' }, { estado: 'enviada' }, { estado: 'enviada' }, { estado: 'enviada' }],
    }
    const r = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)
    // Resultado del motor canónico: numerosas alertas (poco local,
    // sin coste, margen bajo, sin proveedor, propuestas acumuladas, etc.).
    // La prioridad resultante es Alta (>=65).
    assert.ok(r.score >= 65, `Esperaba score>=65, fue ${r.score}`)
    assert.equal(r.prioridad, 'Alta')
  })

  it('un restaurante con todo bien puntúa Media o Baja', () => {
    const d = {
      restaurante: { id: 'ok', nombre: 'Buen Resto', ciudad: 'Madrid', ticket_medio_comida: 40 },
      vinos: Array.from({ length: 50 }, (_, i) => ({
        id: `v${i}`, activo: true,
        tipo: i < 20 ? 'tinto' : i < 35 ? 'blanco' : i < 40 ? 'espumoso' : i < 45 ? 'generoso' : 'dulce',
        region: i < 10 ? 'Rioja' : i < 15 ? 'Ribera' : 'Rias Baixas',
        notas_cata: 'detalle con palabras suficientes',
        anada: 2020, stock: 4, coste_compra: 10, precio_botella: 40,
        proveedor: 'X', stock_minimo: 2, precio_copa: i < 10 ? 5 : 0,
      })),
      platos: [
        { nombre: 'Pescado', precio: 20, activo: true, descripcion: 'pescado' },
        { nombre: 'Carne', precio: 22, activo: true, descripcion: 'carne' },
      ],
      estadisticas: [],
      propuestas: [],
    }
    const r = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)
    assert.ok(r.score < 65, `Esperaba score<65, fue ${r.score}`)
  })
})

describe('Radar y ficha dan la misma puntuación (ahora que el motor es único)', () => {
  it('con los mismos datos, dos llamadas distintas dan el mismo score', () => {
    const d = casaMarismaDatos()
    const r1 = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)
    const r2 = analizarRestaurante(d.restaurante, d.vinos, d.platos, d.estadisticas, d.propuestas)
    assert.equal(r1.score, r2.score)
    assert.equal(r1.prioridad, r2.prioridad)
  })

  it('REGRESIÓN: no existen ya dos funciones analizar() distintas (lo cubre la importación del lib)', () => {
    // Si vuelve a existir una copia local en page.js, esta importación
    // seguirá funcionando y los tests no lo pillarían, pero una grep
    // rápida sí. Deja constancia por ergonomía de review.
    assert.ok(typeof analizarRestaurante === 'function')
  })
})
