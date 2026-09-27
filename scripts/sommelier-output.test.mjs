/**
 * Valida las reglas de calidad del output del sumiller virtual.
 * Ejecutar: node --test scripts/sommelier-output.test.mjs
 *
 * Comprueba:
 *  - Cada recomendación tiene ≤ 25 palabras en la frase (sin contar nombre ni precio)
 *  - No hay palabras del vocabulario vetado
 *  - No hay dos recomendaciones con el mismo texto
 *  - Cada recomendación menciona al menos una palabra del plato o su descripción
 *  - Una sola referencia de precio por línea, formato correcto
 *  - No hay frases que empiecen con minúscula después del rol
 *  - No hay verbos principales repetidos entre las 3 frases
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Vocabulario vetado ──────────────────────────────────────────────────────
const PALABRAS_VETADAS_ES = [
  'tanino', 'barrica', 'estructura', 'terroir', 'mineralidad',
  'untuosidad', 'redondo en boca', 'final persistente', 'expresivo',
  'complejo', 'ticket estimado', 'presupuesto de mesa', 'rango de precio',
  'comparte referencias de estilo', 'notas de', 'balsámico', 'balsámicos',
  'integrado', 'integrada', 'amargor elegante', 'fondo oscuro',
]
const PALABRAS_VETADAS_EN = [
  'tannin', 'barrel', 'structure', 'terroir', 'minerality',
  'unctuousness', 'round in the mouth', 'persistent finish', 'expressive',
  'complex', 'estimated spend', 'table budget', 'price range',
  'shares style references', 'notes of', 'balsamic', 'integrated',
  'elegant bitterness', 'dark background',
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function extraerFrase(linea) {
  const sinNombre = linea.replace(/^[^—–]+[—–]\s*/, '')
  const sinRol = sinNombre.replace(/^[^:]{1,30}:\s*/, '')
  const sinPrecio = sinRol.replace(/\s*\d+(?:[.,]\d+)?\s*€(?:\/\w+)?\s*\.?\s*$/, '').trim()
  return sinPrecio
}

function extraerParteTrasDash(linea) {
  // Part after "— Role: "
  const sinNombre = linea.replace(/^[^—–]+[—–]\s*/, '')
  return sinNombre
}

function contarPalabras(texto) {
  return texto.trim().split(/\s+/).filter(Boolean).length
}

function normalizarTextoTest(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function extraerVerboPrincipal(frase) {
  // Extract first verb-like word (3+ chars) that isn't a stop word
  const stop = new Set(['que', 'con', 'del', 'los', 'las', 'una', 'uno', 'para', 'por', 'sin', 'bien', 'muy', 'más', 'mas'])
  const tokens = normalizarTextoTest(frase).split(/\s+/).filter(t => t.length >= 3 && !stop.has(t))
  return tokens[0] || ''
}

// ── Función de validación principal ─────────────────────────────────────────

export function validarOutputSommelier(respuesta, {
  platos = [],
  idioma = 'es',
  soloCopa = false,
  verificarPrecio = false,
} = {}) {
  const lineas = String(respuesta || '')
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.includes('—') || l.includes('–'))

  assert.ok(lineas.length > 0, 'El sumiller debe devolver al menos una recomendación')

  const frases = lineas.map(extraerFrase)
  const vetadas = idioma === 'en' ? PALABRAS_VETADAS_EN : PALABRAS_VETADAS_ES

  frases.forEach((frase, idx) => {
    const norm = normalizarTextoTest(frase)

    // Longitud ≤ 25 palabras
    const palabras = contarPalabras(frase)
    assert.ok(
      palabras <= 25,
      `Línea ${idx + 1}: frase tiene ${palabras} palabras (máx 25). Texto: "${frase}"`
    )

    // Vocabulario vetado
    vetadas.forEach(veto => {
      assert.ok(
        !norm.includes(normalizarTextoTest(veto)),
        `Línea ${idx + 1}: contiene palabra vetada "${veto}". Texto: "${frase}"`
      )
    })

    // Mayúscula al inicio de la frase (después del rol)
    if (frase.length > 0) {
      const primeraLetra = frase[0]
      assert.ok(
        primeraLetra === primeraLetra.toUpperCase(),
        `Línea ${idx + 1}: la frase empieza con minúscula. Texto: "${frase}"`
      )
    }
  })

  // Sin duplicados
  const unicos = new Set(frases.map(f => normalizarTextoTest(f)))
  assert.equal(
    unicos.size,
    frases.length,
    `Hay recomendaciones con texto duplicado. Frases: ${frases.join(' | ')}`
  )

  // Anti-muletilla: los verbos principales no deben repetirse en las 3 frases
  if (frases.length >= 3) {
    const verbos = frases.map(extraerVerboPrincipal).filter(Boolean)
    const verbosUnicos = new Set(verbos)
    assert.ok(
      verbosUnicos.size >= Math.ceil(verbos.length * 0.66),
      `Las frases repiten demasiado el mismo verbo principal. Verbos: ${verbos.join(', ')}`
    )
  }

  // Precio: una sola referencia por línea en formato correcto
  if (verificarPrecio) {
    const formatoPrecioRe = soloCopa
      ? /\d+(?:[.,]\d+)?€\/(?:copa|glass)\s*\.?\s*$/i
      : /\d+(?:[.,]\d+)?€\s*\.?\s*$/i
    lineas.forEach((linea, idx) => {
      const matches = linea.match(/\d+(?:[.,]\d+)?\s*€(?:\/\w+)?/gi) || []
      assert.equal(
        matches.length,
        1,
        `Línea ${idx + 1}: debe haber exactamente 1 referencia de precio, hay ${matches.length}. Línea: "${linea}"`
      )
      assert.ok(
        formatoPrecioRe.test(linea),
        `Línea ${idx + 1}: formato de precio incorrecto (esperado al final, ${soloCopa ? '€/copa' : '€'}). Línea: "${linea}"`
      )
    })
  }

  // Menciona algún rasgo del plato (nombre O descripción)
  if (platos.length > 0) {
    const rasgoPlatos = platos.flatMap(p => {
      const nombre = normalizarTextoTest(p.nombre || p)
      const desc = normalizarTextoTest(p.descripcion || '')
      return [...nombre.split(/\s+/), ...desc.split(/\s+/)].filter(t => t.length >= 4)
    })

    frases.forEach((frase, idx) => {
      const norm = normalizarTextoTest(frase)
      const menciona = rasgoPlatos.some(rasgo => norm.includes(rasgo))
      assert.ok(
        menciona,
        `Línea ${idx + 1}: la frase no menciona ningún rasgo del plato. Platos: ${platos.map(p => p.nombre || p).join(', ')}. Frase: "${frase}"`
      )
    })
  }

  return true
}

// ── Tests con salida simulada ────────────────────────────────────────────────

describe('Sumiller output — reglas de calidad', () => {

  it('Caso rabo de toro (botella): sin palabras vetadas, menciona plato, ≤25 palabras', () => {
    const respuestaMock = [
      'Condado Oriza Reserva — Mi elección: Este tinto aguanta bien la salsa melosa del rabo sin taparse. 27€',
      'Habla del Silencio — Más frutal: Con fruta negra que contrasta bien con la grasa del guiso de rabo. 25€',
      'Finca Resalso — Más ajustado: Un tinto honesto para el rabo si no quieres gastar de más. 22€',
    ].join('\n\n')

    validarOutputSommelier(respuestaMock, { platos: [{ nombre: 'Rabo de toro' }] })
  })

  it('Caso croquetas + queso curado (botella)', () => {
    const respuestaMock = [
      'Bodegas Muga Blanco — Mi elección: Limpia la grasa de las croquetas y sigue bien con el queso. 25€',
      'Manzanilla La Gitana — Salino y seco: Seco y salino, perfecto para las croquetas y aguanta el curado. 12€',
      'Protos Verdejo — Más ajustado: Fresco y ligero, va bien tanto con las croquetas como con el queso. 18€',
    ].join('\n\n')

    validarOutputSommelier(respuestaMock, {
      platos: [{ nombre: 'Croquetas caseras' }, { nombre: 'Queso curado' }],
    })
  })

  it('Detecta palabras vetadas y falla', () => {
    const respuestaMala = [
      'Condado Oriza — Mi elección: Comparte referencias de estilo con tempranillo; tanino y barrica encajan con el rabo. 27€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaMala, { platos: [{ nombre: 'Rabo de toro' }] }),
      /vetada/
    )
  })

  it('Detecta frases duplicadas y falla', () => {
    const respuestaDuplicada = [
      'Vino A — Mi elección: Va muy bien con el rabo de toro. 20€',
      'Vino B — Más frutal: Va muy bien con el rabo de toro. 22€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaDuplicada, { platos: [{ nombre: 'Rabo de toro' }] }),
      /duplicado/
    )
  })

  it('Detecta frase larga (>25 palabras) y falla', () => {
    const respuestaLarga = [
      'Vino A — Mi elección: Este es un vino muy largo con muchas palabras que supera el límite establecido de veinticinco palabras para las frases del sumiller virtual. 20€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaLarga, { platos: [{ nombre: 'Rabo de toro' }] }),
      /palabras/
    )
  })

  it('Detecta inicio con minúscula y falla', () => {
    const respuestaMinuscula = [
      'Vino A — Mi elección: este tinto va bien con el rabo de toro. 20€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaMinuscula, { platos: [{ nombre: 'Rabo de toro' }] }),
      /minúscula/
    )
  })

  it('Acepta mención por descripción del plato (no solo por nombre)', () => {
    // "estofado" is not in the dish name "Rabo de toro" but IS in descripción
    const respuestaMock = [
      'Vino A — Mi elección: Aguanta bien el estofado sin tapar el sabor del guiso. 20€',
      'Vino B — Con más cuerpo: Sostiene la intensidad de la carne bien con la salsa del plato. 25€',
      'Vino C — Más ajustado: Acompaña la gelatina y la salsa sin pasarse. 18€',
    ].join('\n\n')

    validarOutputSommelier(respuestaMock, {
      platos: [{ nombre: 'Rabo de toro', descripcion: 'guiso de rabo estofado en salsa con verduras' }],
    })
  })

  it('Acepta formato precio correcto (botella)', () => {
    const respuestaMock = [
      'Vino A — Mi elección: Aguanta bien la grasa del rabo sin taparse. 27€',
      'Vino B — Más frutal: Fruta madura que contrasta con el guiso de rabo. 25€',
      'Vino C — Más ajustado: Tinto honesto para el rabo. 18€',
    ].join('\n\n')

    validarOutputSommelier(respuestaMock, {
      platos: [{ nombre: 'Rabo de toro' }],
      verificarPrecio: true,
      soloCopa: false,
    })
  })

  it('Detecta precio duplicado y falla', () => {
    const respuestaDoble = [
      'Vino A — Mi elección: Aguanta bien la grasa del rabo. 27€/botella 27€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaDoble, {
        platos: [{ nombre: 'Rabo de toro' }],
        verificarPrecio: true,
      }),
      /precio/
    )
  })

  it('Postres: texto dulce o postre en la frase y sin palabras vetadas', () => {
    // A correct output for a dessert should mention the dessert/sweet aspect
    const respuestaPostre = [
      'Moscatel Ochoa — Mi elección: Dulce y aromático, equilibra la tarta de queso sin taparla. 18€',
      'PX El Maestro Sierra — Más dulce: La densidad del Pedro Ximénez envuelve la tarta sin competir. 22€',
    ].join('\n\n')

    validarOutputSommelier(respuestaPostre, {
      platos: [{ nombre: 'Tarta de queso artesana' }],
    })
  })

  it('Paridad ES/EN: Braised oxtail pasa las mismas reglas estructurales que Rabo de toro', () => {
    const respuestaMock = [
      'Condado Oriza Reserva — My pick: Its smoky depth pairs naturally with the rich braised oxtail sauce. 27€',
      'Emilio Moro — More body: Ripe dark fruit and fresh acidity cut through the fat of the braised meat. 33€',
      'Carramimbre Roble — Best value: Toasted vanilla and juicy fruit hold up to the slow-cooked oxtail richness. 20€',
    ].join('\n\n')

    validarOutputSommelier(respuestaMock, {
      platos: [{ nombre: 'Braised oxtail', descripcion: 'slow-cooked braised beef in thick sauce' }],
      idioma: 'en',
    })
  })

  it('Detecta precio a mitad de línea como duplicado y falla', () => {
    const respuestaConPrecioMitad = [
      'Alvear PX 1927 — Mi elección: Dulce 4.5€/copa en copa, perfecto para la tarta de queso. 25€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaConPrecioMitad, {
        platos: [{ nombre: 'Tarta de queso artesana' }],
        verificarPrecio: true,
      }),
      /precio/
    )
  })

  it('Salida de 2 vinos (sin Más ajustado) es válida', () => {
    const respuesta2Vinos = [
      'Condado Oriza Reserva — Mi elección: Su punto ahumado aguanta bien el guiso del rabo sin aplastarlo. 27€',
      'Carramimbre Roble — Más ajustado: La vainilla del roble encaja con el fondo del guiso. 20€',
    ].join('\n\n')

    validarOutputSommelier(respuesta2Vinos, {
      platos: [{ nombre: 'Rabo de toro', descripcion: 'guiso de rabo estofado en salsa' }],
    })
  })

  it('Postres: Mi elección dulce pasa las reglas; sin palabras vetadas', () => {
    const respuestaPostre3 = [
      'Alvear PX 1927 — Mi elección: Su dulzor concentrado abraza la tarta de queso sin aplastarla. 25€',
      'Gran Barquero Tawny — Más frutal: La fruta madura del tawny equilibra la cremosidad del cheesecake. 22€',
      'Moscatel Ochoa — Más ajustado: Aromático y ligero, acompaña bien la tarta sin cansar. 15€',
    ].join('\n\n')

    validarOutputSommelier(respuestaPostre3, {
      platos: [{ nombre: 'Tarta de queso artesana', descripcion: 'cheesecake artesano dulce y cremoso' }],
    })
  })

})
