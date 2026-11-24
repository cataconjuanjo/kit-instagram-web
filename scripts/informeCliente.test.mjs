/**
 * FASE K — Bloque 3: tests del informe de cliente de 1 página.
 *
 * Garantiza:
 *  - No contiene jerga interna (score, snapshot, fase N, /dashboard/).
 *  - Las 3 prioridades vienen limpiadas por limpiarRutasTecnicas.
 *  - La cifra principal se formatea en EUR.
 *  - El seguimiento se renderiza SOLO si hay datos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeCliente, auditarInformeCliente } from '../app/lib/informeCliente.js'

describe('construirInformeCliente', () => {
  it('monta la estructura mínima con la cifra principal', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'Casa Marisma', ciudad: 'Málaga' },
      oportunidadEuros: 2850,
      prioridades: [
        { titulo: 'Poca estrategia por copa', detalle: 'Ve a /dashboard/vinos?filtro=pendientes' },
        { titulo: 'Margen bajo en 12 referencias', detalle: 'Revisar compras' },
      ],
    })
    assert.equal(r.titulo, 'Cata con Juanjo · Informe de carta')
    assert.equal(r.restaurante.nombre, 'Casa Marisma')
    assert.ok(r.cifraPrincipal.valor && r.cifraPrincipal.valor.includes('€'))
    assert.ok(r.cifraPrincipal.frase.length > 0)
    assert.equal(r.prioridades.length, 2)
  })

  it('las prioridades son como máximo 3', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      prioridades: Array.from({ length: 10 }, (_, i) => ({ titulo: `T${i}` })),
    })
    assert.equal(r.prioridades.length, 3)
  })

  it('oportunidad cero o nula se presenta con frase alternativa', () => {
    const r = construirInformeCliente({ restaurante: { nombre: 'X' }, oportunidadEuros: 0 })
    assert.equal(r.cifraPrincipal.valor, null)
    assert.ok(r.cifraPrincipal.frase.includes('pendiente de cuantificar'))
  })

  it('el seguimiento sólo se incluye si viene', () => {
    const r1 = construirInformeCliente({ restaurante: { nombre: 'X' } })
    assert.equal(r1.seguimiento, null)
    const r2 = construirInformeCliente({
      restaurante: { nombre: 'X' },
      seguimiento: { porEstado: { enviada: 1, aceptada: 2, implantada: 1, propuesta: 0, rechazada: 0 }, capturado: 450 },
    })
    assert.equal(r2.seguimiento.enviadas, 4) // enviada + aceptada + implantada
    assert.equal(r2.seguimiento.aceptadas, 3)
    assert.equal(r2.seguimiento.implantadas, 1)
    assert.ok(r2.seguimiento.capturado && r2.seguimiento.capturado.includes('€'))
  })
})

describe('auditarInformeCliente — SIN jerga interna', () => {
  it('no permite "score", "snapshot", "fase N", "/dashboard/" ni "motor persistente"', () => {
    // Un informe limpio pasa.
    const limpio = construirInformeCliente({
      restaurante: { nombre: 'Casa Marisma' },
      oportunidadEuros: 2850,
      prioridades: [{ titulo: 'Carta corta', detalle: 'Añadir 5 referencias' }],
    })
    assert.equal(auditarInformeCliente(limpio).limpio, true)

    // Si se cuela jerga por error, auditar lo detecta.
    const sucio = {
      cifraPrincipal: { frase: 'score 72' },
      prioridades: [{ titulo: 'Ir a /dashboard/vinos' }],
    }
    const r = auditarInformeCliente(sucio)
    assert.equal(r.limpio, false)
    assert.ok(r.banderas.length >= 2)
  })

  it('limpiarTextoCliente elimina las rutas técnicas de .accion/.detalle', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      prioridades: [{ titulo: 'Entra en /dashboard/vinos?filtro=pendientes', detalle: 'Ver /dashboard/platos?filtro=X' }],
    })
    const txt = JSON.stringify(r)
    assert.ok(!/\/dashboard\//i.test(txt), 'El informe no debe contener /dashboard/')
  })
})

describe('Filtrado de señales INTERNAS (fase K-fix)', () => {
  it('"Cliente caliente con propuestas abiertas" NO aparece en las prioridades del cliente', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'Casa Marisma' },
      oportunidadEuros: 2850,
      prioridades: [
        { titulo: 'Cliente caliente con propuestas abiertas', detalle: '2 propuestas marcadas como interesan', servicio: 'Seguimiento comercial' },
        { titulo: 'Vinos sin coste de compra', detalle: '18 referencias sin coste', euros: 1200 },
        { titulo: 'Margen bajo en 7 referencias', detalle: 'bajan del 55%' },
      ],
    })
    assert.equal(r.prioridades.length, 2)
    const txt = JSON.stringify(r)
    assert.ok(!/cliente caliente/i.test(txt))
    assert.ok(!/propuestas? abiertas?/i.test(txt))
  })

  it('"Propuestas acumuladas sin cierre" tampoco entra', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      prioridades: [
        { titulo: 'Propuestas acumuladas sin cierre', detalle: '4 propuestas abiertas', servicio: 'Seguimiento de propuestas' },
        { titulo: 'Vinos sin precio', detalle: '3 referencias sin precio' },
      ],
    })
    assert.equal(r.prioridades.length, 1)
    assert.equal(r.prioridades[0].titulo, 'Vinos de la carta sin precio')
  })

  it('"Sin contacto en más de 14 días" tampoco entra', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      prioridades: [
        { titulo: 'Sin contacto en más de 14 días', detalle: 'Últimos 14 días sin registro' },
        { titulo: 'Poca estrategia por copa', detalle: '3 referencias por copa sobre 40' },
      ],
    })
    assert.equal(r.prioridades.length, 1)
    assert.ok(/copa/i.test(r.prioridades[0].titulo))
  })

  it('Menos de 3 prioridades tras filtrar: muestra las que haya', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      prioridades: [
        { titulo: 'Cliente caliente con propuestas abiertas' },
        { titulo: 'Propuestas acumuladas sin cierre' },
        { titulo: 'Sin contacto en más de 14 días' },
        { titulo: 'Vinos sin coste de compra registrado' },
      ],
    })
    assert.equal(r.prioridades.length, 1)
  })

  it('Títulos crudos del motor se reescriben en lenguaje de dueño', () => {
    const casos = [
      { in: 'Vinos sin precio', out: 'Vinos de la carta sin precio' },
      { in: 'No se está midiendo rentabilidad real', out: 'Vinos sin coste de compra registrado' },
      { in: 'Margen bajo en referencias con datos', out: 'Vinos con margen bajo' },
      { in: 'Poca estrategia por copa', out: 'Pocos vinos ofrecidos por copa' },
      { in: 'Vino local débil', out: 'Poca presencia de bodegas locales' },
      { in: 'Postres sin vino de cierre', out: 'Falta vino de cierre para postres' },
      { in: 'Mapa de precios descompensado', out: 'Mapa de precios desequilibrado' },
    ]
    for (const c of casos) {
      const r = construirInformeCliente({
        restaurante: { nombre: 'X' },
        prioridades: [{ titulo: c.in, detalle: 'detalle' }],
      })
      assert.equal(r.prioridades[0]?.titulo, c.out, `Esperaba "${c.out}" para "${c.in}"`)
    }
  })

  it('El auditor también detecta "cliente caliente", "propuestas abiertas" y "alerta"', () => {
    const malo = {
      cifraPrincipal: { frase: 'ver alertas abiertas' },
      prioridades: [{ titulo: 'Cliente caliente con propuestas abiertas' }],
    }
    const r = auditarInformeCliente(malo)
    assert.equal(r.limpio, false)
    assert.ok(r.banderas.some(b => /cliente caliente/.test(b)))
    assert.ok(r.banderas.some(b => /propuestas/.test(b)))
    assert.ok(r.banderas.some(b => /alerta/.test(b)))
  })

  it('Informe real de Casa Marisma (ejemplo del preview) queda limpio', () => {
    // Simulación: le llegan las 3 alertas que aparecían en el preview
    // (la primera era "Cliente caliente ..."). El informe final no
    // contiene ninguna de esas cadenas.
    const r = construirInformeCliente({
      restaurante: { nombre: 'Casa Marisma', ciudad: 'Málaga' },
      oportunidadEuros: 2850,
      prioridades: [
        { titulo: 'Cliente caliente con propuestas abiertas', detalle: '2 propuestas marcadas como interesan.', servicio: 'Seguimiento comercial' },
        { titulo: 'Poca estrategia por copa', detalle: '3 referencias por copa sobre 22.', servicio: 'Programa de vinos por copa' },
        { titulo: 'No se mide rentabilidad real', detalle: '15 vinos sin coste de compra.', servicio: 'Auditoría de margen' },
      ],
    })
    const audit = auditarInformeCliente(r)
    assert.equal(audit.limpio, true, `Banderas inesperadas: ${audit.banderas.join('; ')}`)
    assert.equal(r.prioridades.length, 2)
    assert.ok(/copa/i.test(r.prioridades[0].titulo))
    assert.ok(/coste/i.test(r.prioridades[1].titulo))
  })
})

describe('Rama palancas (fase L): € por prioridad y suma cuadra con el total', () => {
  it('la cifra principal es la suma de las palancas mostradas (no la cruda)', () => {
    const palancas = [
      { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false },
      { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', euros: 630, esInterna: false },
      { id: 'propuestas_abiertas', titulo: 'Cerrar propuestas comerciales abiertas', euros: 240, esInterna: true },
    ]
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      palancas,
    })
    // 'propuestas_abiertas' es interna → se filtra. Total = 540+630.
    assert.equal(r.prioridades.length, 2)
    const extraidos = r.prioridades.map(p => Number(String(p.euros || '').replace(/[^\d]/g, '')))
    const sumaPrioridades = extraidos.reduce((s, n) => s + n, 0)
    const total = Number(String(r.cifraPrincipal.valor || '').replace(/[^\d]/g, ''))
    assert.equal(sumaPrioridades, total, 'La suma de prioridades debe cuadrar con el total')
  })

  it('una palanca con euros = 0 no aparece (no se muestra "0 €")', () => {
    const palancas = [
      { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false },
      { id: 'sin_coste', titulo: 'Vinos sin coste registrado', euros: 0, esInterna: false },
    ]
    const r = construirInformeCliente({ restaurante: { nombre: 'X' }, palancas })
    assert.equal(r.prioridades.length, 1)
    // Ninguna prioridad debe tener "0 €" como su cifra.
    for (const p of r.prioridades) {
      assert.notEqual(p.euros, '0 €')
    }
  })

  it('con 3+ palancas útiles muestra hasta 3', () => {
    const palancas = [
      { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 500, esInterna: false },
      { id: 'sin_coste', titulo: 'Vinos sin coste registrado', euros: 400, esInterna: false },
      { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', euros: 300, esInterna: false },
      { id: 'otra', titulo: 'Otra palanca', euros: 200, esInterna: false },
    ]
    const r = construirInformeCliente({ restaurante: { nombre: 'X' }, palancas })
    assert.equal(r.prioridades.length, 3)
  })

  it('el informe con palancas pasa auditarInformeCliente', () => {
    const palancas = [
      { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false },
      { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', euros: 630, esInterna: false },
      { id: 'propuestas_abiertas', titulo: 'Cerrar propuestas comerciales abiertas', euros: 240, esInterna: true },
    ]
    const r = construirInformeCliente({ restaurante: { nombre: 'Casa Marisma', ciudad: 'Málaga' }, palancas })
    const audit = auditarInformeCliente(r)
    assert.equal(audit.limpio, true, `Banderas: ${audit.banderas.join('; ')}`)
  })

  it('palancas vacías: no hay prioridades y cifra principal null', () => {
    const r = construirInformeCliente({ restaurante: { nombre: 'X' }, palancas: [] })
    assert.equal(r.prioridades.length, 0)
    assert.equal(r.cifraPrincipal.valor, null)
  })
})

describe('FASE L-fix: conteo coherente + partida de datos sin importe', () => {
  it('con 2 prioridades, la frase dice "las 2 prioridades" (no "las 3")', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      palancas: [
        { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false, soloDatos: false },
        { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', euros: 630, esInterna: false, soloDatos: false },
      ],
    })
    assert.equal(r.prioridades.length, 2)
    assert.ok(/las 2 prioridades/.test(r.cifraPrincipal.frase),
      `Esperaba "las 2 prioridades", frase fue: ${r.cifraPrincipal.frase}`)
    assert.ok(!/las 3 prioridades/.test(r.cifraPrincipal.frase))
  })

  it('con 1 prioridad, la frase dice "la prioridad" (singular)', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      palancas: [
        { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false, soloDatos: false },
      ],
    })
    assert.equal(r.prioridades.length, 1)
    assert.ok(/la prioridad detectada/.test(r.cifraPrincipal.frase),
      `Esperaba "la prioridad detectada", frase fue: ${r.cifraPrincipal.frase}`)
  })

  it('con 3 prioridades, la frase dice "las 3 prioridades"', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      palancas: [
        { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false, soloDatos: false },
        { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', euros: 630, esInterna: false, soloDatos: false },
        { id: 'sin_coste', titulo: 'Completar costes', euros: 4800, esInterna: false, soloDatos: true },
      ],
    })
    assert.equal(r.prioridades.length, 3)
    assert.ok(/las 3 prioridades/.test(r.cifraPrincipal.frase))
  })

  it('con 0 prioridades, no hay cifra y usa la frase alternativa', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      palancas: [],
    })
    assert.equal(r.prioridades.length, 0)
    assert.equal(r.cifraPrincipal.valor, null)
    assert.ok(/pendiente de cuantificar/i.test(r.cifraPrincipal.frase))
  })

  it('sin_coste nunca aporta importe a la cifra principal del informe', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      palancas: [
        { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false, soloDatos: false },
        { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', euros: 630, esInterna: false, soloDatos: false },
        { id: 'sin_coste', titulo: 'Completar costes', euros: 4800, esInterna: false, soloDatos: true },
      ],
    })
    // Cifra principal = 540 + 630 = 1170; NO incluye los 4800 de sin_coste.
    const total = Number(String(r.cifraPrincipal.valor || '').replace(/[^\d]/g, ''))
    assert.equal(total, 1170)
    // Y sumando solo las prioridades con euros !== null, también 1170.
    const suma = r.prioridades
      .filter(p => p.euros)
      .reduce((s, p) => s + Number(String(p.euros).replace(/[^\d]/g, '')), 0)
    assert.equal(suma, 1170)
  })

  it('CASO Lo de Carmen: solo sin_coste → sin cifra principal, partida de datos sin "€"', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'Lo de Carmen', ciudad: 'Málaga' },
      palancas: [
        { id: 'sin_coste', titulo: 'Completar los costes de compra para medir el margen real', euros: 4800, esInterna: false, soloDatos: true },
      ],
    })
    assert.equal(r.cifraPrincipal.valor, null)
    assert.ok(/pendiente de cuantificar/i.test(r.cifraPrincipal.frase))
    assert.equal(r.prioridades.length, 1)
    assert.equal(r.prioridades[0].soloDatos, true)
    assert.equal(r.prioridades[0].euros, null, 'La partida de datos NO debe llevar "€"')
    // Y en ningún caso aparece "0 €" ni "undefined".
    const txt = JSON.stringify(r)
    assert.ok(!/undefined/i.test(txt))
    for (const p of r.prioridades) assert.notEqual(p.euros, '0 €')
  })

  it('la partida de datos va DESPUÉS de las con importe en la lista', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      palancas: [
        { id: 'sin_coste', titulo: 'Completar costes', euros: 4800, esInterna: false, soloDatos: true },
        { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false, soloDatos: false },
      ],
    })
    assert.equal(r.prioridades[0].soloDatos, false, 'La primera debe ser con importe')
    assert.equal(r.prioridades[1].soloDatos, true, 'La partida de datos debe ir al final')
  })

  it('con palancas, el informe pasa auditarInformeCliente', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'Lo de Carmen' },
      palancas: [
        { id: 'margen_bajo', titulo: 'Vinos con margen bajo', euros: 540, esInterna: false, soloDatos: false },
        { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', euros: 90, esInterna: false, soloDatos: false },
        { id: 'sin_coste', titulo: 'Completar costes', euros: 4800, esInterna: false, soloDatos: true },
      ],
    })
    const audit = auditarInformeCliente(r)
    assert.equal(audit.limpio, true, `Banderas: ${audit.banderas.join('; ')}`)
  })
})

describe('Degradación del informe cuando faltan datos', () => {
  it('sin oportunidad y sin prioridades, sigue produciendo objeto válido', () => {
    const r = construirInformeCliente({ restaurante: { nombre: 'X' } })
    assert.equal(r.prioridades.length, 0)
    assert.equal(typeof r.titulo, 'string')
    assert.equal(typeof r.fecha, 'string')
  })

  it('sin restaurante usa fallback "Restaurante"', () => {
    const r = construirInformeCliente({})
    assert.equal(r.restaurante.nombre, 'Restaurante')
  })
})
