/**
 * Valida las reglas de calidad del output del sumiller virtual.
 * Ejecutar: node --test scripts/sommelier-output.test.mjs
 *
 * Comprueba:
 *  - Cada recomendación tiene ≤ 25 palabras en la frase (sin contar nombre ni precio)
 *  - No hay palabras del vocabulario vetado
 *  - No hay dos recomendaciones con el mismo texto
 *  - Cada recomendación menciona al menos una palabra del plato o un rasgo de plato
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ── Vocabulario vetado ──────────────────────────────────────────────────────
const PALABRAS_VETADAS_ES = [
  'tanino', 'barrica', 'estructura', 'terroir', 'mineralidad',
  'untuosidad', 'redondo en boca', 'final persistente', 'expresivo',
  'complejo', 'ticket estimado', 'presupuesto de mesa', 'rango de precio',
  'comparte referencias de estilo',
]
const PALABRAS_VETADAS_EN = [
  'tannin', 'barrel', 'structure', 'terroir', 'minerality',
  'unctuousness', 'round in the mouth', 'persistent finish', 'expressive',
  'complex', 'estimated spend', 'table budget', 'price range',
  'shares style references',
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function extraerFrase(linea) {
  // Formato: "Nombre vino — [Rol: ]frase. 27€"
  // Quita nombre (hasta —), quita etiqueta de rol (Mi elección:, Más frutal:, etc.), quita precio final
  const sinNombre = linea.replace(/^[^—–]+[—–]\s*/, '')
  const sinRol = sinNombre.replace(/^[^:]{1,30}:\s*/, '')  // quita "Mi elección: ", "Más frutal: ", etc.
  const sinPrecio = sinRol.replace(/\s*\d+(?:[.,]\d+)?€(?:\/copa|\/glass)?\s*\.?\s*$/, '').trim()
  return sinPrecio
}

function contarPalabras(texto) {
  return texto.trim().split(/\s+/).filter(Boolean).length
}

function normalizarTextoTest(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ── Función de validación principal ─────────────────────────────────────────

export function validarOutputSommelier(respuesta, { platos = [], idioma = 'es' } = {}) {
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
  })

  // Sin duplicados
  const unicos = new Set(frases.map(f => normalizarTextoTest(f)))
  assert.equal(
    unicos.size,
    frases.length,
    `Hay recomendaciones con texto duplicado. Frases: ${frases.join(' | ')}`
  )

  // Menciona algún rasgo del plato
  if (platos.length > 0) {
    const rasgoPlatos = platos.flatMap(p => {
      const nombre = normalizarTextoTest(p.nombre || p)
      return nombre.split(/\s+/).filter(t => t.length >= 4)
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
      'Condado Oriza Reserva — Mi elección: este tinto aguanta bien la salsa melosa del rabo sin taparse. 27€',
      'Habla del Silencio — Más frutal: con fruta negra que contrasta bien con la grasa del guiso de rabo. 25€',
      'Finca Resalso — Más ajustado: un tinto honesto para el rabo si no quieres gastar de más. 22€',
    ].join('\n\n')

    validarOutputSommelier(respuestaMock, { platos: [{ nombre: 'Rabo de toro' }] })
  })

  it('Caso croquetas + queso curado (botella)', () => {
    const respuestaMock = [
      'Bodegas Muga Blanco — Mi elección: limpia la grasa de las croquetas y sigue bien con el queso. 25€',
      'Manzanilla La Gitana — Más salino: seco y salino, perfecto para las croquetas y aguanta el curado. 12€',
      'Protos Verdejo — Más ajustado: fresco y ligero, va bien tanto con las croquetas como con el queso. 18€',
    ].join('\n\n')

    validarOutputSommelier(respuestaMock, {
      platos: [{ nombre: 'Croquetas caseras' }, { nombre: 'Queso curado' }],
    })
  })

  it('Detecta palabras vetadas y falla', () => {
    const respuestaMala = [
      'Condado Oriza — comparte referencias de estilo con tempranillo, tanino, barrica; encaja con el ticket estimado de la mesa. 27€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaMala, { platos: [{ nombre: 'Rabo de toro' }] }),
      /vetada/
    )
  })

  it('Detecta frases duplicadas y falla', () => {
    const respuestaDuplicada = [
      'Vino A — Mi elección: va muy bien con el rabo de toro. 20€',
      'Vino B — Más frutal: va muy bien con el rabo de toro. 22€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaDuplicada, { platos: [{ nombre: 'Rabo de toro' }] }),
      /duplicado/
    )
  })

  it('Detecta frase larga (>25 palabras) y falla', () => {
    const respuestaLarga = [
      'Vino A — Mi elección: este es un vino muy largo con muchas palabras que supera el límite establecido de veinticinco palabras para las frases del sumiller virtual. 20€',
    ].join('\n\n')

    assert.throws(
      () => validarOutputSommelier(respuestaLarga, { platos: [{ nombre: 'Rabo de toro' }] }),
      /palabras/
    )
  })

})
