/**
 * Test para detectWordConcat — casos reales encontrados en el catálogo ECI.
 * Ejecutar: node scripts/test-word-concat.js
 */

'use strict'

// ── Copia de la función a testear ────────────────────────────────────────────
function detectWordConcat(text) {
  const low = text.toLowerCase()

  if (/\bdela[s]?\b/.test(low))    return true
  if (/\bdelos\b/.test(low))       return true
  if (/\bsinque\b/.test(low))      return true
  if (/\bqueninguno\b/.test(low))  return true
  if (/\bsaly\b/.test(low))        return true
  if (/\bsue[sl]\b/.test(low))     return true

  const tokens = low.replace(/[.,;:!?'"()¿¡«»]/g, ' ').split(/\s+/).filter(Boolean)
  for (const t of tokens) {
    if (t.length < 4) continue
    if (t.length >= 7 && /^del[a-z]{2,}/.test(t) &&
        !/^del(ante|anta|gad|icad|iciosa|iciosos|egad|iber|eitar|inear|ict|ito|icia)/.test(t)) return true
    if (/^la(grasa|mineral|burbuja|acidez|textura|untuosidad|curación|intensidad|crianza|fruta|sal[a-z]|almendra|acidez)/.test(t)) return true
    if (/^su(potencia|cuerpo|sabor|aroma|grasa|mineral|acidez|textura|curación|intensidad|retrogusto)/.test(t)) return true
    if (/^el(tanino|vino|foie|cuerpo|cacao|sabor|aroma|queso)/.test(t)) return true
    if (t.length >= 7 && /^la[aeiou][a-z]{3,}/.test(t)) return true
    if (t.length >= 6 && /^[a-záéíóúüñ]{4,}su$/.test(t)) return true
    if (t.length >= 8 && /^[a-záéíóúüñ]{5,}[aeio]la$/.test(t)) return true
    if (t.length >= 9 && /^[a-záéíóúüñ]{6,}con$/.test(t)) return true
  }
  return false
}

// ── Casos ────────────────────────────────────────────────────────────────────
const SHOULD_DETECT = [
  // Casos reales del catálogo ECI (v2 run, oct-2026)
  'la untuosidad dela leche cruda equilibra el cuerpo',
  'realzando su saly tostado en el aperitivo',
  'su acidez limpiala grasa del pimentón',
  'la almendra tostada resuena con laalmendra marcona frita',
  'cuya sal realzala fruta madura del vino',
  'equilibrando supotencia láctica en boca',
  'el acabado largo enlazacon la amargura del cacao',
  'la grasa delfoie de pato Castaing',
  'integra lagrasa infiltrada del lomo',
  'sin queninguno eclipse al otro',
  'el vino potenciasu expresión mineral',
  'eltanino limpia la grasa del ibérico',
  'la salinidad limpiala curación',
  'la acidez limpiacon la untuosidad',  // enlazacon pattern
  // Casos anteriores (v1)
  'yodo delas navajas amplifica el mineral',
  'sin aplastarsu delicadeza marina',
]

const SHOULD_NOT_DETECT = [
  // Frases correctas sin palabras pegadas
  'el tanino pulido integra la sal y la grasa curada del embutido ibérico',
  'la acidez del fino corta la grasa del jamón de bellota',
  'la burbuja fina limpia la untuosidad del foie',
  'la mineralidad del Godello realza el yodo del marisco',
  'el dulzor del semidulce equilibra la grasa del foie',
  'la curación intensa de la cecina necesita tanino',
  'el retrogusto largo dialoga con las especias del vino',
  // Palabras reales que empiezan/terminan como concats pero son correctas
  'la estrella del plato es la botella de vino',
  'el paladar necesita tiempo para integrar la canela',
  'la vainilla de la barrica redondea la textura',
  'la textura melosa del viura encuentra contraste',
  'con elegancia y sin prisa',
  'delantera y robusta al mismo tiempo',
  'su potencia aromática es extraordinaria',  // "su potencia" con espacio → OK
  'la grasa de la paleta se equilibra',        // "la grasa" con espacio → OK
]

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

console.log('\n▶ test-word-concat.js\n')

console.log('── Deben DETECTAR concat (esperado: true) ──')
for (const text of SHOULD_DETECT) {
  const result = detectWordConcat(text)
  const ok = result === true
  if (ok) passed++; else failed++
  console.log(`  ${ok ? '✓' : '✗'} ${result ? 'DETECT' : 'miss  '} | ${text.slice(0, 80)}`)
}

console.log('\n── Deben PASAR sin concat (esperado: false) ──')
for (const text of SHOULD_NOT_DETECT) {
  const result = detectWordConcat(text)
  const ok = result === false
  if (ok) passed++; else failed++
  console.log(`  ${ok ? '✓' : '✗'} ${result ? 'false+ ' : 'ok     '} | ${text.slice(0, 80)}`)
}

console.log(`\n─────────────────────────────`)
console.log(`  ${passed} passed / ${failed} failed`)
if (failed === 0) console.log('  ✓ Todos los tests pasan\n')
else             console.log('  ✗ Hay fallos — revisar patrones\n')

process.exit(failed > 0 ? 1 : 0)
