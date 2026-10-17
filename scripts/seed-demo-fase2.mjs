#!/usr/bin/env node
/**
 * seed-demo-fase2.mjs — Fase 2 (v3)
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-demo-fase2.mjs
 *   node --env-file=.env.local scripts/seed-demo-fase2.mjs --confirm --nombre "Casa Marisma"
 *
 * Requisitos: SEED_DEMO_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { fileURLToPath } from 'url'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── flags ─────────────────────────────────────────────────────────────────────
const DRY_RUN    = !process.argv.includes('--confirm')
const NOMBRE_IDX = process.argv.indexOf('--nombre')
const NOMBRE     = NOMBRE_IDX !== -1 ? process.argv[NOMBRE_IDX + 1] : null

if (!DRY_RUN && !NOMBRE) {
  console.error('ERROR: --confirm requiere --nombre "<nombre del restaurante DEMO>"')
  process.exit(1)
}

// ── DEMO_ID + denylist ────────────────────────────────────────────────────────
const DEMO_ID = process.env.SEED_DEMO_ID
if (!DEMO_ID) { console.error('ERROR: SEED_DEMO_ID no está definido'); process.exit(1) }

const UUID_DENYLIST = new Set([
  'a1000000-0000-4000-8000-000000000000',
  'b2000000-0000-4000-8000-000000000000',
  'c3000000-0000-4000-8000-000000000000',
  'e5000000-0000-4000-8000-000000000000',
])
if (UUID_DENYLIST.has(DEMO_ID)) {
  console.error(`ERROR: SEED_DEMO_ID ${DEMO_ID} está en la denylist`)
  process.exit(1)
}

const NAME_DENYLIST = ['lo de carmen', 'araboka', 'la taberna', 'modo sumiller']

// ── Helpers ───────────────────────────────────────────────────────────────────
function showTable(label, rows, maxRows = 3) {
  console.log(`\n  ${label} — ${rows.length} fila(s)`)
  for (const r of rows.slice(0, maxRows)) console.log('   ', JSON.stringify(r))
  if (rows.length > maxRows) console.log(`    … ${rows.length - maxRows} más`)
}

function margenPct(pvp, coste) {
  if (!pvp || !coste) return null
  const pvpNeto = pvp / 1.1
  return Math.round((pvpNeto - coste) / pvpNeto * 100)
}

// Genera notas de cata profesionales SIN marcadores.
// Cada rama embebe las palabras clave exactas que inferirPerfilesVino() detecta:
//   'alta acidez','vibrante','tension' → alta_acidez
//   'mineral','salino','marino','yodado' → mineral_salino
//   'almendra','avellana','nuez','toffee','caramelo' → oxidativo
//   'tanino firme','tanino marcado' → tanino_medio_alto
//   'tanino amable','tanino suave','tanino redondo','sedoso' → tanino_bajo
//   'con cuerpo','voluminoso' → con_cuerpo
//   'ligero' → cuerpo_ligero  (evitar en vinos dulces/generosos)
//   'brioche','pan tostado' → lias_autolisis
//   'mantequilla','nata' → malolactica
//   'semidulce' → dulce  (útil para Cream/generoso semidulce)
//   'fruta seca','fruta cocida','fruta confitada','uva pasa' → fruta_seca_cocida
function generarNotasCata(tipo, uva, region, nombre) {
  const t   = (tipo   || '').toLowerCase()
  const u   = (uva    || '').toLowerCase()
  const r   = (region || '').toLowerCase()
  const n   = (nombre || '').toLowerCase()
  const all = [n, u, r].join(' ')

  // ── Generoso ────────────────────────────────────────────────────────────────
  if (t === 'generoso') {
    if (/cream/.test(all))
      // semidulce → dulce; fruta confitada → fruta_seca_cocida; toffee → oxidativo
      return 'Generoso semidulce de crianza oxidativa. Dulce y untuoso, con cuerpo. Notas de almendra tostada, avellana, toffee y caramelo. Fruta seca y fruta confitada. Persistente y muy sabroso.'
    if (/manzanilla/.test(all))
      // alta acidez, mineral, almendra → alta_acidez, mineral_salino, oxidativo
      return 'Manzanilla de crianza biológica bajo flor en Sanlúcar. Alta acidez vibrante y salinidad marcada, mineral, con toque marino y yodado. Notas de almendra fresca y avellana verde. Alcohol alto, seco y muy largo.'
    if (/amontillado/.test(all))
      // alta acidez, avellana → alta_acidez, oxidativo
      return 'Amontillado con crianza mixta biológica y oxidativa. Alta acidez vibrante con cuerpo y alcohol alto. Notas de avellana tostada, nuez y caramelo oxidativo. Seco, sabroso y muy persistente.'
    if (/oloroso/.test(all))
      // con cuerpo, nuez → con_cuerpo, oxidativo
      return 'Oloroso con crianza oxidativa compleja y prolongada. Con cuerpo y alcohol alto, voluminoso. Notas de nuez, frutos secos tostados, toffee y caramelo. Seco, largo y muy sabroso.'
    if (/palo cortado/.test(all))
      // alta acidez + con cuerpo + almendra
      return 'Palo Cortado de crianza única, raro y complejo. Alta acidez vibrante con cuerpo y alcohol alto. Notas de almendra, avellana, fruta seca y especiado. Seco, elegante y muy largo.'
    // Fino genérico
    return 'Fino de crianza biológica bajo flor en Jerez. Alta acidez y salinidad marcada, mineral. Notas de almendra fresca y avellana. Alcohol alto, seco y fin muy nítido.'
  }

  // ── Dulce ────────────────────────────────────────────────────────────────────
  if (t === 'dulce') {
    if (/pedro ximenez|px/.test(all))
      // dulce (from tipo), con cuerpo, uva pasa → fruta_seca_cocida, oxidativo
      return 'Pedro Ximénez de crianza oxidativa lenta. Dulce y untuoso, con cuerpo concentrado. Notas de uva pasa, fruta seca y cocida, fruta confitada, caramelo y toffee. Persistente y muy largo.'
    if (/moscatel|muscat/.test(all))
      // dulce (from tipo), fruta tropical, flores blancas, fruta confitada → NO alta_acidez
      return 'Moscatel de Alejandría, dulce y con cuerpo. Fruta tropical de lichi y mango, flores blancas de azahar. Fruta confitada y notas de fruta seca al final. Buena acidez fresca para equilibrar el dulzor. Persistente y muy expresivo.'
    return 'Vino dulce de concentración. Dulce y untuoso, con cuerpo. Notas de fruta seca, fruta cocida, fruta confitada, toffee y caramelo. Persistente.'
  }

  // ── Espumoso ─────────────────────────────────────────────────────────────────
  if (t === 'espumoso') {
    return 'Espumoso con crianza sobre lías. Burbuja fina y persistente, alta acidez vibrante. Fruta verde de manzana y pera, fruta cítrica de lima. Notas de brioche y pan tostado por la autolisis. Seco y tenso.'
  }

  // ── Rosado ───────────────────────────────────────────────────────────────────
  if (t === 'rosado') {
    return 'Rosado fresco y vibrante, alta acidez limpia. Fruta roja fresca de fresa, frambuesa y cereza roja. Seco, con final limpio y muy frutal.'
  }

  // ── Naranja (maceración con pieles) ──────────────────────────────────────────
  if (t === 'naranja') {
    // alta_acidez, tanino_medio_alto (tanino firme), mineral_salino, oxidativo (almendra), especiado, fruta_citrica, con_cuerpo
    return 'Vino naranja de maceración con pieles. Alta acidez vibrante con tanino firme y marcado. Mineral y salino. Notas de almendra, especiado y fruta cítrica de naranja y lima. Con cuerpo y persistente.'
  }

  // ── Tinto ────────────────────────────────────────────────────────────────────
  if (t === 'tinto') {
    // Nebbiolo: siempre tanino_medio_alto + alta_acidez + con_cuerpo + evolucion_botella
    if (/nebbiolo/.test(u))
      return 'Nebbiolo de perfil sobrio y austero. Tanino firme y marcado con alta acidez vibrante. Con cuerpo y evolucion en botella. Notas de cuero, tierra y cereza seca. Especiado y muy persistente.'
    // Priorat: tanino_medio_alto + con_cuerpo + alcohol_alto + roble
    if (/priorat/.test(r))
      return 'Tinto del Priorat concentrado. Con cuerpo amplio y tanino firme y marcado. Fruta negra de zarzamora y ciruela negra. Especiado con pimienta y regaliz, roble integrado. Alcohol alto y muy largo.'
    // Toro: tanino_medio_alto + con_cuerpo + alcohol_alto
    if (/toro/.test(r))
      return 'Tinto de Toro con tanino firme y marcado. Con cuerpo amplio y alcohol alto. Fruta negra de ciruela y mora. Profundo, con notas especiadas y minerales. Largo y robusto.'
    // Ribera del Duero: tanino_medio_alto + con_cuerpo (sin requerir crianza en nombre)
    if (/ribera del duero|ribera del duero/.test(r) || /ribera/.test(r) && /duero|arlanza/.test(r))
      return 'Tinto de Ribera del Duero con fruta negra de cereza negra y ciruela. Tanino firme y marcado, con cuerpo. Notas de barrica de cedro y café. Largo y bien estructurado.'
    // Rioja con crianza: tanino_medio_alto + con_cuerpo + roble
    if (/rioja/.test(r) && /crianza|reserva/.test(n))
      return 'Tinto riojano con crianza en barrica. Fruta roja madura, notas de vainilla, roble y café tostado. Tanino firme y marcado, con cuerpo. Largo, equilibrado y clásico.'
    // Otros con crianza en nombre: tanino_medio_alto + con_cuerpo
    if (/crianza|reserva|gran reserva/.test(n))
      return 'Tinto con crianza en barrica. Fruta negra de madurez media. Tanino firme y marcado, con cuerpo. Notas de roble, barrica, especiado y vainilla. Persistente y bien estructurado.'
    // Gredos o Garnacha de altura: tanino_bajo + alta_acidez + mineral_salino + cuerpo_ligero
    if (/gredos/.test(r) || (/garnacha|grenache/.test(u) && /gredos|sierra|madrid|cebreros|avila/.test(r)))
      return 'Garnacha de las sierras de Gredos. Alta acidez vibrante, tanino amable y bajo. Mineral y salino, perfil fresco. Fruta roja de frambuesa y cereza roja. Cuerpo ligero, sin paso por madera.'
    // Garnacha general: tanino_bajo + alta_acidez + fruta_roja
    if (/garnacha|grenache/.test(u))
      return 'Garnacha de carácter frutal. Fruta roja de fresa y cereza roja. Tanino amable y bajo, alta acidez natural. Seco y sin paso por madera.'
    // Mencía / Bierzo: tanino_bajo + alta_acidez + cuerpo_ligero + mineral_salino
    if (/mencia|mencía/.test(u) || /bierzo/.test(r))
      return 'Mencía de Bierzo fresca y mineral. Alta acidez vibrante. Fruta roja y notas florales. Tanino amable y sedoso. Seco y mineral.'
    // Tempranillo / Rioja sin crianza: tanino_bajo + fruta_roja
    if (/tempranillo/.test(u) || /rioja/.test(r))
      return 'Tinto frutal de Rioja. Fruta roja de cereza y fresa. Tanino amable y bajo. Seco y equilibrado.'
    // Genérico joven: tanino_bajo + fruta_roja (sin 'ligero'/'perfil fresco' que alteran estimarPerfil)
    return 'Tinto joven frutal. Fruta roja de fresa y cereza. Tanino amable y bajo. Seco, fácil de beber.'
  }

  // ── Blanco ───────────────────────────────────────────────────────────────────
  // REGLA: blancos NUNCA llevan tanino. Las notas deben evitar 'tanino', 'sedoso', 'astringente'.
  if (t === 'blanco') {
    if (/albarino|albariño/.test(u) || /rias baixas|rías baixas/.test(r))
      return 'Albariño de Rías Baixas con alta acidez vibrante. Fruta cítrica de lima, limón y pomelo, con toque de melocotón. Mineral y salino, frescura oceánica. Seco y largo.'
    if (/txakoli|txakolina/.test(all))
      return 'Txakolina con alta acidez vibrante y salinidad marcada. Fruta cítrica de lima y fruta verde de pera. Mineral y marino. Alcohol bajo. Seco y muy refrescante.'
    if (/verdejo/.test(u) || /rueda/.test(r))
      return 'Verdejo de Rueda con alta acidez y perfil herbáceo. Fruta verde de manzana y pera, fruta cítrica de lima. Notas de hierba fresca. Seco y afrutado.'
    if (/chardonnay/.test(u) && /crianza|barrica|reserva|fermentado/.test(n))
      return 'Chardonnay con crianza en roble. Con cuerpo y voluminoso. Fruta de hueso de melocotón y albaricoque. Mantequilla y nata por la maloláctica. Barrica de vainilla y cedro. Seco y persistente.'
    if (/chardonnay/.test(u))
      return 'Chardonnay fresco y afrutado, alta acidez vibrante. Fruta de hueso de melocotón y fruta tropical. Seco y fácil de beber.'
    if (/godello/.test(u) || /valdeorras|ribeira sacra/.test(r))
      return 'Godello con alta acidez vibrante y con cuerpo. Fruta cítrica de lima y melocotón. Mineral y salino. Tensión en boca. Seco y largo.'
    if (/palomino/.test(u) || /jerez/.test(r))
      return 'Palomino seco de Jerez. Alta acidez, mineral y salino. Fruta cítrica de lima con hierba fresca. Seco y sabroso.'
    // Priorat blanco: con_cuerpo + alcohol_alto + mineral_salino. SIN tanino.
    if (/priorat/.test(r) || /priorat/.test(n))
      return 'Blanco del Priorat con cuerpo y alcohol alto. Mineral y salino. Fruta de hueso de melocotón y albaricoque maduro. Seco y muy persistente.'
    return 'Blanco fresco con alta acidez vibrante. Fruta cítrica de lima y pomelo, mineral y salino. Seco, con notas de fruta verde de manzana.'
  }

  return 'Vino seco con alta acidez y fruta cítrica de lima y pomelo. Fresco y equilibrado.'
}

// Frase corta con keywords clave para enriquecer notas de catálogo sin perfiles.
function frasePerfilPorTipo(tipo, uva, region, nombre) {
  const t = (tipo||'').toLowerCase()
  const u = (uva||'').toLowerCase()
  const r = (region||'').toLowerCase()
  const n = (nombre||'').toLowerCase()
  const all = [n, u, r].join(' ')
  if (t === 'generoso') {
    if (/cream|semidulce/.test(all)) return 'Semidulce y untuoso, con cuerpo. Notas de toffee, caramelo y fruta confitada.'
    if (/amontillado/.test(all)) return 'Alta acidez vibrante. Notas de avellana, nuez y caramelo oxidativo. Alcohol alto.'
    if (/oloroso/.test(all)) return 'Con cuerpo y alcohol alto. Notas de nuez, frutos secos y toffee.'
    if (/palo cortado/.test(all)) return 'Alta acidez con cuerpo. Notas de almendra, avellana y fruta seca. Alcohol alto.'
    return 'Alta acidez y salinidad marcada, mineral. Notas de almendra y avellana. Alcohol alto.'
  }
  if (t === 'dulce') {
    if (/pedro ximenez|px/.test(all)) return 'Dulce y untuoso, con cuerpo. Notas de uva pasa, fruta seca y cocida, toffee y caramelo.'
    if (/moscatel|muscat/.test(all)) return 'Dulce y con cuerpo. Fruta tropical de lichi y mango. Flores blancas y fruta confitada.'
    return 'Dulce y con cuerpo. Notas de fruta seca, fruta cocida, toffee y caramelo.'
  }
  if (t === 'espumoso') return 'Alta acidez vibrante. Notas de brioche y pan tostado por la autolisis sobre lías.'
  if (t === 'rosado') return 'Alta acidez limpia. Fruta roja de fresa y frambuesa.'
  if (t === 'naranja') return 'Alta acidez con tanino firme y marcado. Mineral y salino. Notas de almendra.'
  if (t === 'tinto') {
    if (/ribera|rioja|priorat|toro/.test(r) || /crianza|reserva/.test(n))
      return 'Tanino firme y marcado, con cuerpo. Barrica de cedro, café y vainilla.'
    if (/garnacha|grenache|mencia|mencía/.test(u))
      return 'Alta acidez. Fruta roja de fresa y cereza roja. Tanino amable y bajo.'
    return 'Fruta roja de fresa y frambuesa. Tanino amable y bajo. Perfil fresco.'
  }
  if (t === 'blanco') {
    if (/albarin/.test(u) || /rias baixas|galicia/.test(r)) return 'Alta acidez vibrante. Mineral y salino. Fruta cítrica de lima y pomelo.'
    if (/chardonnay/.test(u) && /crianza|barrica/.test(n)) return 'Con cuerpo. Mantequilla y nata por la maloláctica. Barrica de vainilla y cedro.'
    if (/verdejo/.test(u) || /rueda/.test(r)) return 'Alta acidez. Fruta verde de manzana y pera. Hierba fresca.'
    return 'Alta acidez vibrante. Mineral y salino. Fruta cítrica de lima y pomelo.'
  }
  return 'Alta acidez y fruta cítrica de lima. Fresco y equilibrado.'
}

// Tintos con perfil estructurado que nunca deben resultar en cuerpo_ligero.
const TINTOS_ESTRUCTURADOS_RE = [
  /pintia/i, /alto los zorros/i, /camins/i, /san lorenzo/i,
  /parada de atauta/i, /poderi colla/i, /grand rousseau/i,
]

// Valida tags de un vino. Devuelve array de errores (vacío = ok).
// (i)   blanco/espumoso/dulce/generoso sin tanino_*
// (ii)  rosado sin tanino_medio_alto
// (iii) espumoso con alta_acidez o lias_autolisis
// (iv)  ≥2 tags significativos (no seco/dulce)
// (v)   tinto de lista estructurada sin cuerpo_ligero
function validarTagsVino(tipo, tags, nombre) {
  const t = (tipo || '').toLowerCase()
  const errs = []
  const has = id => tags.includes(id)
  const sig = tags.filter(id => !['seco', 'dulce'].includes(id))
  if (['blanco', 'espumoso', 'dulce', 'generoso'].includes(t) && (has('tanino_bajo') || has('tanino_medio_alto')))
    errs.push(`(i) [tipo=${t}] con tanino → ${nombre}`)
  if (t === 'rosado' && has('tanino_medio_alto'))
    errs.push(`(ii) [rosado] con tanino_medio_alto → ${nombre}`)
  if (t === 'espumoso' && !has('lias_autolisis') && !has('alta_acidez'))
    errs.push(`(iii) [espumoso] sin alta_acidez ni lias_autolisis → ${nombre}`)
  if (sig.length < 2)
    errs.push(`(iv) tags insuficientes (${sig.length}/≥2 sig) → ${nombre}`)
  if (t === 'tinto' && has('cuerpo_ligero') && TINTOS_ESTRUCTURADOS_RE.some(re => re.test(nombre)))
    errs.push(`(v) [tinto estructurado] con cuerpo_ligero → ${nombre}`)
  if (has('tanino_bajo') && has('tanino_medio_alto'))
    errs.push(`tanino_bajo + tanino_medio_alto → ${nombre}`)
  if (has('alta_acidez') && has('baja_acidez'))
    errs.push(`alta_acidez + baja_acidez → ${nombre}`)
  if (has('seco') && has('dulce'))
    errs.push(`seco + dulce → ${nombre}`)
  if (has('cuerpo_ligero') && has('con_cuerpo'))
    errs.push(`cuerpo_ligero + con_cuerpo → ${nombre}`)
  if (has('alcohol_bajo') && has('alcohol_alto'))
    errs.push(`alcohol_bajo + alcohol_alto → ${nombre}`)
  return errs
}

// Enriquece una nota de catálogo real cuando tiene < 2 perfiles inferidos.
// Para blancos/espumosos: si la nota del catálogo produce tags de tanino, se
// sustituye por la nota generada (evita notas en otro idioma con 'sedoso', etc.).
function enriquecerNotaConPerfil(nota, tipo, uva, region, nombre, inferirFn) {
  const t = (tipo || '').toLowerCase()
  if (!nota) return generarNotasCata(tipo, uva, region, nombre)
  let notaFinal = nota
  let tags = inferirFn({ notas_cata: notaFinal, tipo: t, uva: uva||'', region: region||'', nombre: nombre||'' })
  // Blancos/espumosos/rosados NO deben llevar tanino: si la nota lo activa, sustituir
  if (['blanco', 'espumoso', 'rosado'].includes(t) && (tags.includes('tanino_bajo') || tags.includes('tanino_medio_alto'))) {
    notaFinal = generarNotasCata(tipo, uva, region, nombre)
    tags = inferirFn({ notas_cata: notaFinal, tipo: t, uva: uva||'', region: region||'', nombre: nombre||'' })
  }
  // Enriquecer si < 2 tags
  if (tags.length < 2) {
    const frase = frasePerfilPorTipo(tipo, uva, region, nombre)
    notaFinal = notaFinal + (frase ? ' ' + frase : '')
  }
  return notaFinal
}

// ── Overrides manuales: vinos con datos de catálogo dudosos o perfil singular ──
// Prioridad máxima en S2. Tags y nota son canónicos; bypasan inferirPerfilesVino.
const NOMBRE_OVERRIDES = [
  // Espumosos
  { match: /laherte/i,
    tags: ['seco', 'alta_acidez', 'lias_autolisis', 'fruta_citrica', 'fruta_verde', 'mineral_salino'],
    nota: 'Champagne de viticultor sobre lías prolongadas. Alta acidez vibrante y burbuja fina persistente. Fruta verde de manzana y pera, fruta cítrica de lima y limón. Mineral y salino. Notas de brioche y pan tostado por la autolisis. Seco, brut nature sin dosaje.',
    aviso: null },
  // Blancos con zona conflictiva (region=Priorat → inferirPerfilesVino asignaría tanino desde uvaRegionNombre)
  { match: /pedra de guix/i,
    tags: ['seco', 'con_cuerpo', 'alcohol_alto', 'fruta_hueso', 'mineral_salino'],
    nota: 'Blanco del Priorat con fermentación y crianza. Con cuerpo y alcohol alto. Fruta de hueso de melocotón y albaricoque maduro. Mineral y salino. Seco y muy persistente.',
    aviso: null },
  // Tintos Ribera sin "crianza/reserva" en nombre
  { match: /parada de atauta/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra', 'roble'],
    nota: 'Tinto de Ribera del Duero con fruta negra de cereza negra y ciruela. Tanino firme y marcado, con cuerpo. Notas de barrica de cedro y café. Largo y bien estructurado.',
    aviso: null },
  // Nebbiolo italiano
  { match: /poderi colla|colla nebbiolo/i,
    tags: ['seco', 'tanino_medio_alto', 'alta_acidez', 'fruta_roja', 'floral', 'evolucion_botella'],
    nota: 'Nebbiolo de perfil sobrio y austero. Tanino firme y marcado con alta acidez vibrante. Fruta roja de cereza seca y notas florales de violeta. Evolucion en botella, cuero y tierra. Seco y muy persistente.',
    aviso: null },
  // Dato de catálogo incoherente: uva≠tipo
  { match: /grand rousseau/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra'],
    nota: 'Tinto de carácter potente y con cuerpo. Fruta negra de ciruela negra y mora. Tanino firme y marcado. Especiado y persistente. Seco y bien estructurado.',
    aviso: '[AVISO catálogo] Grand Rousseau: campo uva=Sauvignon Blanc pero tipo=tinto — dato incoherente en catálogo proveedor. Tratado como tinto.' },
  // Zona errónea en catálogo
  { match: /salvajes de gredos/i,
    tags: ['seco', 'tanino_bajo', 'alta_acidez', 'fruta_roja', 'mineral_salino'],
    nota: 'Garnacha de las sierras de Gredos. Alta acidez vibrante, tanino amable y bajo. Mineral y salino, perfil de montaña. Fruta roja de frambuesa y cereza roja. Sin paso por madera. Seco.',
    aviso: '[AVISO catálogo] Salvajes de Gredos: zona en catálogo indica Priorat, pero es garnacha de Gredos (Madrid). Perfil corregido a garnacha de montaña.' },
  // Tintos estructurados explícitos
  { match: /pintia/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra', 'roble', 'alcohol_alto'],
    nota: 'Tinto de Toro con tanino firme y marcado. Con cuerpo amplio y alcohol alto. Fruta negra de ciruela y mora. Notas de barrica de cedro y café. Largo y robusto.',
    aviso: null },
  { match: /alto los zorros/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra'],
    nota: 'Tinto potente con cuerpo y tanino firme y marcado. Fruta negra de ciruela negra y cereza negra. Especiado y persistente. Seco y bien estructurado.',
    aviso: null },
  { match: /camins/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra', 'mineral_salino'],
    nota: 'Tinto del Priorat concentrado. Con cuerpo amplio y tanino firme y marcado. Fruta negra de zarzamora y ciruela negra. Mineral y salino. Especiado y roble integrado. Largo.',
    aviso: null },
  { match: /san lorenzo/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra', 'roble'],
    nota: 'Tinto con crianza en barrica. Fruta negra de madurez plena. Tanino firme y marcado, con cuerpo. Notas de roble, barrica, especiado y vainilla. Persistente y bien estructurado.',
    aviso: null },
]

// Resuelve nota canónica + tags para un vino sin perfil.
// Prioridad: override → nota catálogo → generada por tipo/uva.
// La inferencia de tags usa solo el texto de la nota (sin uva/region) para evitar
// falsos positivos de zona (p.ej. region=Priorat en blancos → tanino_medio_alto).
function resolverNotaYTags(v, rawCatNota) {
  const nombre = v.nombre || ''
  const tipo   = (v.tipo || '').toLowerCase()
  const uva    = v.uva || ''

  // 1. Override manual: tags y nota son canónicos, se usan sin inferencia
  for (const ov of NOMBRE_OVERRIDES) {
    if (ov.match.test(nombre)) {
      return { nota: ov.nota, tags: ov.tags, origen: 'override', aviso: ov.aviso }
    }
  }

  // Inferencia de texto puro (uva/region vacíos → sin falsos positivos de zona)
  const inferirDeTexto = nota =>
    inferirPerfilesVino({ notas_cata: nota, tipo, uva: '', region: '', nombre: '' })

  // 2. Nota del catálogo de proveedor
  if (rawCatNota) {
    let nota = rawCatNota
    let tags = inferirDeTexto(nota)
    // Sanitizar: no-tinto nunca debe tener tanino
    if (['blanco', 'espumoso', 'rosado', 'dulce', 'generoso'].includes(tipo) &&
        (tags.includes('tanino_bajo') || tags.includes('tanino_medio_alto'))) {
      nota = generarNotasCata(v.tipo, uva, v.region, nombre)
      tags = inferirDeTexto(nota)
    }
    // Enriquecer si < 2 tags significativos
    if (tags.filter(id => !['seco', 'dulce'].includes(id)).length < 2) {
      const frase = frasePerfilPorTipo(tipo, uva, v.region, nombre)
      if (frase) { nota = nota + ' ' + frase; tags = inferirDeTexto(nota) }
    }
    const enriquecido = nota !== rawCatNota
    return { nota, tags, origen: enriquecido ? 'cat+enrich' : 'catálogo', aviso: null }
  }

  // 3. Generar desde tipo/uva/crianza
  const nota = generarNotasCata(v.tipo, uva, v.region, nombre)
  const tags = inferirDeTexto(nota)
  let origen
  if (['espumoso', 'rosado', 'generoso', 'dulce', 'naranja'].includes(tipo)) origen = 'regla-tipo'
  else if (uva) origen = 'regla-uva'
  else origen = 'generico'
  return { nota, tags, origen, aviso: null }
}

// ── 36 platos de Casa Marisma ─────────────────────────────────────────────────
const PLATOS = [
  // Entrantes fríos (5)
  { nombre: 'Salmorejo cordobés con jamón ibérico y huevo de codorniz',
    descripcion: 'Salmorejo tradicional de Córdoba con guarnición de jamón ibérico y huevo de codorniz pochado', categoria: 'Entrantes fríos', precio: 10 },
  { nombre: 'Gazpacho de tomate con langostino y pepino',
    descripcion: 'Gazpacho andaluz clásico servido frío con langostino salteado y pepino crujiente', categoria: 'Entrantes fríos', precio: 11 },
  { nombre: 'Ensalada de pulpo con patata y pimentón de la Vera',
    descripcion: 'Pulpo cocido laminado sobre base de patata tibia con vinagreta de pimentón ahumado y cebolla roja', categoria: 'Entrantes fríos', precio: 16 },
  { nombre: 'Anchoas del Cantábrico con pan con tomate',
    descripcion: 'Anchoas en salazón artesanal sobre tostadas con tomate restregado y aceite de oliva virgen extra', categoria: 'Entrantes fríos', precio: 14 },
  { nombre: 'Ceviche de corvina con leche de tigre al fino',
    descripcion: 'Corvina marinada en leche de tigre con notas de fino de Jerez, aguacate, cilantro y chili', categoria: 'Entrantes fríos', precio: 16 },
  // Entrantes calientes (7)
  { nombre: 'Tortillitas de camarones estilo Cádiz',
    descripcion: 'Tortillitas crujientes de camarones de la bahía gaditana con masa ligera y reborde de perejil fresco', categoria: 'Entrantes calientes', precio: 12 },
  { nombre: 'Croquetas de choco en su tinta (6 unidades)',
    descripcion: 'Croquetas artesanas de choco en su tinta con bechamel cremosa y pan rallado crujiente', categoria: 'Entrantes calientes', precio: 12 },
  { nombre: 'Boquerones en adobo gaditano con limón',
    descripcion: 'Boquerones macerados en adobo de vinagre, ajo y especias, fritos en aceite de oliva virgen extra', categoria: 'Entrantes calientes', precio: 11 },
  { nombre: 'Ortiguillas de mar rebozadas con mayonesa de lima',
    descripcion: 'Anémonas de mar rebozadas en tempura ligera con mayonesa casera de lima y cilantro', categoria: 'Entrantes calientes', precio: 14 },
  { nombre: 'Gambas al pil-pil con guindilla y ajo',
    descripcion: 'Gambas salteadas en aceite de oliva con ajo laminado, guindilla y pimentón dulce al momento', categoria: 'Entrantes calientes', precio: 18 },
  { nombre: 'Chipirón a la plancha con ali-oli de ajo negro',
    descripcion: 'Chipirones enteros a la plancha con ali-oli cremoso de ajo negro fermentado y sal en escamas', categoria: 'Entrantes calientes', precio: 16 },
  { nombre: 'Pulpo a la brasa con cachelos y pimentón',
    descripcion: 'Tentáculo de pulpo a la brasa sobre cama de patata gallega cocida, pimentón de la Vera y aceite virgen extra', categoria: 'Entrantes calientes', precio: 22 },
  // Del mar (9)
  { nombre: 'Lubina a la sal con verduras de temporada',
    descripcion: 'Lubina entera cocida en costra de sal gruesa, abierta en mesa, con verduras asadas al tomillo', categoria: 'Del mar', precio: 28 },
  { nombre: 'Atún rojo de almadraba a la plancha (160g)',
    descripcion: 'Medallón de atún rojo de almadraba marcado en plancha de piedra con salsa de soja y jengibre', categoria: 'Del mar', precio: 32 },
  { nombre: 'Gamba blanca de Huelva a la plancha',
    descripcion: 'Gambas blancas de Huelva a la plancha con sal marina de la marisma y limón confitado', categoria: 'Del mar', precio: 36 },
  { nombre: 'Rape a la plancha con patatas a lo pobre y pimentón',
    descripcion: 'Lomo de rape a la plancha sobre cama de patatas confitadas con cebolla, pimiento verde y pimentón', categoria: 'Del mar', precio: 26 },
  { nombre: 'Dorada con ajoblanco y uva moscatel',
    descripcion: 'Dorada al horno con salsa fría de ajoblanco malagueño, uva moscatel y aceite de almendra', categoria: 'Del mar', precio: 24 },
  { nombre: 'Calamar de potera a la plancha con salsa de su tinta',
    descripcion: 'Calamar entero a la plancha con reducción de su tinta, aceite de oliva y flor de sal', categoria: 'Del mar', precio: 22 },
  { nombre: 'Almejas a la marinera con manzanilla de Sanlúcar',
    descripcion: 'Almejas de carril abiertas al vapor en salsa marinera de manzanilla, ajo, tomate y perejil', categoria: 'Del mar', precio: 22 },
  { nombre: 'Urta a la roteña con tomate y pimiento',
    descripcion: 'Urta al horno a la roteña con salsa de tomate, pimiento rojo asado y cebolla caramelizada', categoria: 'Del mar', precio: 26 },
  { nombre: 'Mero en salsa verde con almejas',
    descripcion: 'Medallón de mero en salsa verde de perejil, ajo y vino blanco con almejas y guisantes', categoria: 'Del mar', precio: 28 },
  // Arroces (4)
  { nombre: 'Arroz caldoso de mariscos',
    descripcion: 'Arroz caldoso con gamba blanca, mejillón, almeja, calamar y cigala en caldo concentrado de mariscos', categoria: 'Arroces', precio: 22 },
  { nombre: 'Arroz meloso de bogavante',
    descripcion: 'Arroz meloso con bogavante vivo, azafrán de La Mancha y sofrito de tomate y ñora', categoria: 'Arroces', precio: 38 },
  { nombre: 'Fideuá marinera con alioli casero',
    descripcion: 'Fideos finos con sepia, gamba, mejillón y toque de pimentón servidos con alioli casero', categoria: 'Arroces', precio: 20 },
  { nombre: 'Arroz negro con sepia y ali-oli de ajo asado',
    descripcion: 'Arroz negro meloso con sepia en su tinta, caldo casero de mariscos y ali-oli de ajo asado al horno', categoria: 'Arroces', precio: 22 },
  // De la tierra (4)
  { nombre: 'Presa ibérica a la brasa con chimichurri de hierbas',
    descripcion: 'Presa de cerdo ibérico bellota a la brasa al punto rosado con chimichurri de perejil, orégano y ajo', categoria: 'De la tierra', precio: 22 },
  { nombre: 'Carrillera de ternera al vino de Jerez con puré trufado',
    descripcion: 'Carrillera braseada durante 5 horas en vino de Jerez oloroso con puré de patata al aceite de trufa', categoria: 'De la tierra', precio: 20 },
  { nombre: 'Secreto ibérico con patatas fritas y pimientos de padrón',
    descripcion: 'Secreto de cerdo ibérico a la brasa con patatas fritas en aceite de oliva y pimientos de padrón', categoria: 'De la tierra', precio: 22 },
  { nombre: 'Costilla de cerdo lacada con miel, mostaza y cerveza negra',
    descripcion: 'Costilla de cerdo adobada y cocinada a baja temperatura, lacada con reducción de miel, mostaza y cerveza', categoria: 'De la tierra', precio: 18 },
  // Tablas (3)
  { nombre: 'Tabla de jamón ibérico de bellota (80g)',
    descripcion: 'Jamón ibérico de bellota cortado a cuchillo, presentado en tabla de madera con pan de cristal tostado', categoria: 'Tablas', precio: 22 },
  { nombre: 'Tabla de quesos andaluces con membrillo y nueces',
    descripcion: 'Selección de quesos artesanos de Andalucía: queso de cabra, semicurado y curado con membrillo casero', categoria: 'Tablas', precio: 16 },
  { nombre: 'Tabla ibérica mixta (jamón, chorizo, lomo y salchichón)',
    descripcion: 'Selección de embutidos ibéricos de bellota cortados a máquina con regañás de aceite de oliva', categoria: 'Tablas', precio: 18 },
  // Postres (4)
  { nombre: 'Tarta de queso al horno',
    descripcion: 'Tarta de queso cremosa y semi-cuajada, al horno, sobre base de galleta y coulis de frutos rojos', categoria: 'Postres', precio: 9 },
  { nombre: 'Torrijas con helado de vainilla y miel de caña',
    descripcion: 'Torrijas de pan brioche empapadas en leche y canela, fritas en aceite, con helado de vainilla y miel de caña de azúcar', categoria: 'Postres', precio: 8 },
  { nombre: 'Tocino de cielo artesano con nata montada',
    descripcion: 'Tocino de cielo de receta tradicional gaditana, elaborado con yemas y almíbar, acompañado de nata montada', categoria: 'Postres', precio: 7 },
  { nombre: 'Piononos de Santa Fe',
    descripcion: 'Pastelillos granadinos de bizcocho empapado en almíbar, enrollado y cubierto de crema tostada. Especialidad andaluza', categoria: 'Postres', precio: 8 },
]
// total: 5+7+9+4+4+3+4 = 36

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPA_URL || !SUPA_KEY) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidos')
    process.exit(1)
  }
  const sb = createClient(SUPA_URL, SUPA_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Cargar inferirPerfilesVino (puro ESM, sin deps de browser) ─────────────
  let inferirPerfilesVino = () => []
  try {
    const wpt = await import('../app/lib/wineProfileTags.js')
    inferirPerfilesVino = wpt.inferirPerfilesVino
    console.log('[OK] wineProfileTags cargado — inferirPerfilesVino disponible')
  } catch (err) {
    console.warn(`[WARN] wineProfileTags no disponible (${err.message}) — perfiles_inferidos: []`)
  }

  // ── Verificación nombre + denylist ────────────────────────────────────────
  const { data: rest } = await sb.from('restaurantes').select('nombre').eq('id', DEMO_ID).maybeSingle()
  const dbName = (rest?.nombre ?? '').trim()
  for (const denied of NAME_DENYLIST) {
    if (dbName.toLowerCase().includes(denied)) {
      console.error(`ERROR: el restaurante "${dbName}" (${DEMO_ID}) está protegido.`)
      process.exit(1)
    }
  }
  if (!DRY_RUN && dbName.toLowerCase() !== (NOMBRE || '').trim().toLowerCase()) {
    console.error(`ERROR: --nombre "${NOMBRE}" no coincide con la BD: "${dbName}"`)
    process.exit(1)
  }

  const mode = DRY_RUN ? '[DRY-RUN]' : `[CONFIRM — ${dbName}]`
  console.log(`\n${mode} seed-demo-fase2 v5  DEMO_ID=${DEMO_ID}  restaurante="${dbName}"\n`)

  // ── Query única de vinos ─────────────────────────────────────────────────
  const { data: vinos, error: vinosErr } = await sb
    .from('vinos')
    .select('id, nombre, tipo, uva, region, notas_cata, bodega, proveedor, catalogo_vino_id, stock, stock_minimo, coste_compra, coste_medio_pmp, precio_botella, precio_copa, activo')
    .eq('restaurante_id', DEMO_ID)
    .eq('activo', true)
  if (vinosErr) throw new Error(`vinos: ${vinosErr.message}`)
  const todosVinos = vinos || []

  // IDs del catálogo ya presentes en la carta (para no repetir en propuestas/nuevo)
  const catalogoEnCartaIds = new Set(todosVinos.map(v => v.catalogo_vino_id).filter(Boolean))

  // ── Métricas derivadas ────────────────────────────────────────────────────
  const vinosConMargenCalc = todosVinos
    .filter(v => Number(v.precio_botella) > 0 && Number(v.coste_compra) > 0)
    .map(v => {
      const pvpNeto = Number(v.precio_botella) / 1.1
      const coste   = Number(v.coste_compra)
      return { ...v, _margen: (pvpNeto - coste) / pvpNeto * 100 }
    })
    .sort((a, b) => a._margen - b._margen)

  const vinosConPrecio    = todosVinos.filter(v => Number(v.precio_botella) > 0)
  const vinosBajoMargen   = vinosConMargenCalc.filter(v => v._margen < 60)
  const vinosConStock     = todosVinos.filter(v => Number(v.stock) > 0)
  const vinosSinCoste     = todosVinos.filter(v => !Number(v.coste_compra))
  const vinosSinProveedor = todosVinos.filter(v => !v.proveedor)
  const vinosBajoMinimo   = todosVinos.filter(v => Number(v.stock_minimo) > 0 && Number(v.stock) <= Number(v.stock_minimo))

  // ── Detección de huecos reales de carta ───────────────────────────────────
  const tieneGeneroso = todosVinos.some(v => v.tipo === 'generoso')
  const tieneEspumoso = todosVinos.some(v => v.tipo === 'espumoso')
  const tieneDulce    = todosVinos.some(v => v.tipo === 'dulce')
  const tieneRosado   = todosVinos.some(v => v.tipo === 'rosado')
  const generosos     = todosVinos.filter(v => v.tipo === 'generoso')
  // ¿Hay generoso complejo (oloroso/amontillado/palo cortado) para estofados?
  const tieneGenerosoComplejo = generosos.some(v =>
    /(oloroso|amontillado|palo cortado)/.test((v.nombre||'').toLowerCase()))
  // ¿Hay blanco con cuerpo (chardonnay/godello en barrica) para arroces?
  const tieneBlancoConCuerpo = todosVinos.some(v =>
    v.tipo === 'blanco' && /(chardonnay|godello)/.test((v.uva||'').toLowerCase()) &&
    /(barrica|crianza|reserva|fermentado)/.test((v.nombre||'').toLowerCase()))

  // Huecos funcionales (no solo por tipo)
  const huecosFuncionales = [
    !tieneDulce            && 'dulce (PX/Moscatel para 4 postres)',
    !tieneGenerosoComplejo && tieneGeneroso && 'oloroso/amontillado para estofados',
    !tieneBlancoConCuerpo  && 'blanco con cuerpo para arroces',
    !tieneRosado           && 'rosado',
  ].filter(Boolean)

  // Proveedor concentración
  const provMap = {}
  for (const v of todosVinos) if (v.proveedor) provMap[v.proveedor] = (provMap[v.proveedor] || 0) + 1
  const provSort    = Object.entries(provMap).sort((a, b) => b[1] - a[1])
  const provPrinc   = provSort[0]?.[0] || null
  const provPrincPct = provSort[0] ? Math.round(provSort[0][1] / todosVinos.length * 100) : 0

  // Columnas reales de proveedor_catalogo_vinos (schema en add_proveedores_catalogos.sql):
  //   coste_estimado, pvp_recomendado, pvp_copa, zona (de normalizar_catalogo_v1.sql), region
  //   proveedor_id → proveedores_vino(id, nombre) — se resuelve con fetchProveedorNombres()
  const CAT_SELECT = 'id, nombre, bodega, tipo, region, uva, anada, coste_estimado, pvp_recomendado, pvp_copa, zona, disponibilidad, proveedor_id'

  // Cache de nombres de proveedores (proveedor_id → nombre)
  let _proveedorNombres = null
  async function fetchProveedorNombres() {
    if (_proveedorNombres) return _proveedorNombres
    const { data } = await sb.from('proveedores_vino').select('id, nombre')
    _proveedorNombres = Object.fromEntries((data || []).map(p => [p.id, p.nombre]))
    return _proveedorNombres
  }
  function catProveedorNombre(row) {
    if (!row?.proveedor_id) return 'Consultar catálogo'
    return (_proveedorNombres || {})[row.proveedor_id] || 'Consultar catálogo'
  }
  function catZona(row) { return row?.zona || row?.region || '—' }
  function catPvp(row)  { return Number(row?.pvp_recomendado) || 0 }
  function catCoste(row){ return Number(row?.coste_estimado) || 0 }
  function catMargen(row) { return margenPct(catPvp(row), catCoste(row)) }

  // Helper: busca en catálogo un vino del tipo indicado que no esté ya en carta
  async function buscarEnCatalogoSinRepetir(tipo, extraIlike = null) {
    let q = sb.from('proveedor_catalogo_vinos')
      .select(CAT_SELECT)
      .eq('activo', true)
      .ilike('tipo', `%${tipo}%`)
      .limit(10)
    if (extraIlike) q = q.ilike('nombre', `%${extraIlike}%`)
    const { data } = await q
    return (data || []).find(c => !catalogoEnCartaIds.has(c.id)) || null
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S0: Actualizar restaurante
  // ═══════════════════════════════════════════════════════════════════════════
  const restUpdate = {
    slug: 'casa-marisma', color_primario: '#1a4a3a', color_acento: '#c8a96e',
    color_fondo: '#faf8f3', tipografia: 'serif', carta_publica_activa: true,
    carta_pie_texto: 'Alérgenos disponibles bajo solicitud. Precio con IVA incluido.',
    ticket_medio_comida: 46,
  }
  console.log('[S0] Restaurante — slug, colores, carta_publica=true, ticket=46€')
  console.log('  ', JSON.stringify(restUpdate))
  if (!DRY_RUN) {
    const { error } = await sb.from('restaurantes').update(restUpdate).eq('id', DEMO_ID)
    if (error) throw new Error(`S0: ${error.message}`)
    console.log('   ✓')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S1: Platos — DELETE + INSERT 36 platos
  // ═══════════════════════════════════════════════════════════════════════════
  const cats = [...new Set(PLATOS.map(p => p.categoria))]
  console.log('\n[S1] Platos — 36 platos (5+7+9+4+4+3+4)...')
  console.log('\n  categoria                    n  precio_rango')
  console.log('  ' + '─'.repeat(45))
  for (const c of cats) {
    const ps = PLATOS.filter(p => p.categoria === c)
    const min = Math.min(...ps.map(p => p.precio))
    const max = Math.max(...ps.map(p => p.precio))
    console.log(`  ${c.padEnd(28)} ${String(ps.length).padStart(2)}  ${min}–${max}€`)
  }
  console.log(`  ${'─'.repeat(45)}\n  ${'TOTAL'.padEnd(30)} ${PLATOS.length}`)

  const platoRows = PLATOS.map(p => ({
    restaurante_id: DEMO_ID, nombre: p.nombre, descripcion: p.descripcion,
    categoria: p.categoria, precio: p.precio, activo: true,
  }))
  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('platos').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S1 delete: ${delErr.message}`)
    const { error: insErr } = await sb.from('platos').insert(platoRows)
    if (insErr) throw new Error(`S1 insert: ${insErr.message}`)
    console.log(`\n   ✓ ${platoRows.length} platos insertados`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S2: Perfiles de vino — sin marcadores, texto natural con keywords del motor.
  //
  // Prioridad para cada vino sin perfil:
  //   1) nota real de proveedor_catalogo_vinos.notas  (fuente = 'catálogo')
  //      → enriquecida si < 2 tags inferidos
  //   2) nota generada por generarNotasCata()          (fuente = 'ficticio')
  //
  // Dry-run: imprime los tags que inferirPerfilesVino() detecta en la nota final.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S2] Perfiles de vino (sin marcadores, texto natural con keywords motor)...')

  const catIds = [...new Set(todosVinos.map(v => v.catalogo_vino_id).filter(Boolean))]
  const { data: catNotasRows } = catIds.length
    ? await sb.from('proveedor_catalogo_vinos').select('id, notas').in('id', catIds)
    : { data: [] }
  const catNotasMap = Object.fromEntries(
    (catNotasRows || []).filter(r => r.notas && r.notas.length >= 12).map(r => [r.id, r.notas])
  )

  const vinosSinPerfil = todosVinos.filter(v => !v.notas_cata || v.notas_cata.length < 12)
  const updates2 = []
  let realCount = 0, ficticioCount = 0, enriquecidoCount = 0, overrideCount = 0

  console.log(`\n  Total vinos activos: ${todosVinos.length}`)
  console.log(`  Con perfil existente (≥12 chars): ${todosVinos.length - vinosSinPerfil.length}`)
  console.log(`  Sin perfil → a actualizar: ${vinosSinPerfil.length}`)

  const s2ValidationErrors = []
  const s2Avisos = []

  if (vinosSinPerfil.length > 0) {
    console.log('\n  ' + 'nombre'.padEnd(32) + 'tipo'.padEnd(9) + 'uva'.padEnd(14) + 'origen'.padEnd(12) + 'tags')
    console.log('  ' + '─'.repeat(110))
    for (const v of vinosSinPerfil) {
      const rawCatNota = v.catalogo_vino_id ? catNotasMap[v.catalogo_vino_id] : null
      const { nota, tags, origen, aviso } = resolverNotaYTags(v, rawCatNota)
      if (aviso) s2Avisos.push(aviso)
      if (origen === 'catálogo') realCount++
      else if (origen === 'cat+enrich') { realCount++; enriquecidoCount++ }
      else if (origen === 'override') overrideCount++
      else ficticioCount++
      const errs = validarTagsVino(v.tipo, tags, v.nombre)
      s2ValidationErrors.push(...errs)
      const uvaStr    = (v.uva || '—').slice(0, 13).padEnd(14)
      const origenStr = origen.padEnd(12)
      const errFlag   = errs.length ? ' ← ✗' : ''
      console.log('  ' + (v.nombre || '').slice(0, 31).padEnd(32) + (v.tipo || '—').slice(0, 8).padEnd(9) + uvaStr + origenStr + tags.join(', ') + errFlag)
      updates2.push({ id: v.id, notas_cata: nota })
    }
    console.log(`\n  Orígenes: override=${overrideCount} · cat=${realCount}[${enriquecidoCount} enr] · gen=${ficticioCount}`)
    if (s2Avisos.length > 0) {
      console.log('\n  Avisos de catálogo:')
      for (const a of s2Avisos) console.log(`    ⚠  ${a}`)
    }
  }

  if (s2ValidationErrors.length > 0) {
    console.log('\n  [S2 ERRORES DE VALIDACIÓN]')
    for (const e of s2ValidationErrors) console.log(`    ✗ ${e}`)
    console.log('\n  Abortando: corregir perfiles antes de aplicar el seed.')
    process.exit(2)
  }

  if (!DRY_RUN) {
    for (const u of updates2) {
      const { error } = await sb.from('vinos').update({ notas_cata: u.notas_cata }).eq('id', u.id).eq('restaurante_id', DEMO_ID)
      if (error) throw new Error(`S2 vino ${u.id}: ${error.message}`)
    }
    console.log(`\n   ✓ ${updates2.length} notas_cata actualizadas`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S3: carta_simulacion
  //   • actual: TODOS los vinos activos de la carta (sin límite de 14)
  //   • fuera:  vino de menor margen bruto (candidato lógico a sustitución)
  //   • nuevo 1: vino del catálogo del mismo tipo que fuera (ilike para variantes
  //              de capitalización: 'Tinto', 'tinto crianza', etc.)
  //   • nuevo 2: vino del catálogo que cubre el primer hueco real de carta
  //              (dulce → oloroso → blanco con cuerpo → cualquier activo)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S3] carta_simulacion (todos los vinos en actual; 2 nuevo del catálogo)...')

  const vinoFuera   = vinosConMargenCalc.length > 0 ? vinosConMargenCalc[0] : null
  const vinosActual = vinoFuera ? todosVinos.filter(v => v.id !== vinoFuera.id) : todosVinos

  const tipoFuera = vinoFuera?.tipo || 'blanco'
  // ilike para tipo: captura 'Tinto', 'tinto', 'Tinto Crianza', 'tinto joven', etc.
  await fetchProveedorNombres()
  const { data: catVinos1 } = await sb.from('proveedor_catalogo_vinos')
    .select(CAT_SELECT)
    .eq('activo', true).ilike('tipo', `%${tipoFuera}%`).limit(10)
  const catNuevo1 = (catVinos1 || []).find(c => !catalogoEnCartaIds.has(c.id)) || null

  // nuevo 2: cubre hueco real (no puede repetir catNuevo1)
  const yaUsado1 = catNuevo1 ? new Set([...catalogoEnCartaIds, catNuevo1.id]) : catalogoEnCartaIds
  let catNuevo2 = null
  const tipoHueco2 = !tieneDulce ? 'dulce' : !tieneGenerosoComplejo && tieneGeneroso ? 'generoso' : !tieneBlancoConCuerpo ? 'blanco' : null
  const extraHueco2 = !tieneDulce ? null : !tieneGenerosoComplejo && tieneGeneroso ? 'oloroso' : !tieneBlancoConCuerpo ? 'barrica' : null
  if (tipoHueco2) {
    let q2 = sb.from('proveedor_catalogo_vinos')
      .select(CAT_SELECT)
      .eq('activo', true).ilike('tipo', `%${tipoHueco2}%`).limit(10)
    if (extraHueco2) q2 = q2.ilike('nombre', `%${extraHueco2}%`)
    const { data: catVinos2 } = await q2
    catNuevo2 = (catVinos2 || []).find(c => !yaUsado1.has(c.id)) || null
    // fallback: any activo not in carta
    if (!catNuevo2) {
      const { data: fb } = await sb.from('proveedor_catalogo_vinos')
        .select(CAT_SELECT)
        .eq('activo', true).limit(20)
      catNuevo2 = (fb || []).find(c => !yaUsado1.has(c.id)) || null
    }
  }

  const catListNuevos = [catNuevo1, catNuevo2].filter(Boolean)

  if (vinoFuera) {
    const m = margenPct(Number(vinoFuera.precio_botella), Number(vinoFuera.coste_compra))
    console.log(`\n  fuera:  "${vinoFuera.nombre}" tipo=${vinoFuera.tipo} margen=${m !== null ? m + '%' : 'sin precio'} (menor de carta)`)
  }
  console.log(`  actual: ${vinosActual.length} vinos (TODOS los activos excepto fuera)`)
  console.log(`  nuevos: ${catListNuevos.length} del catálogo (columnas: pvp_recomendado, coste_estimado, zona)`)
  if (catNuevo1) {
    const pn1 = catProveedorNombre(catNuevo1)
    console.log(`    nuevo1: "${catNuevo1.nombre}" (${catNuevo1.bodega||'—'}) tipo=${catNuevo1.tipo} proveedor=${pn1} coste=${catCoste(catNuevo1)}€ PVP=${catPvp(catNuevo1)}€ margen=${catMargen(catNuevo1) ?? '—'}% → mismo estilo que fuera`)
  }
  if (catNuevo2) {
    const pn2 = catProveedorNombre(catNuevo2)
    console.log(`    nuevo2: "${catNuevo2.nombre}" (${catNuevo2.bodega||'—'}) tipo=${catNuevo2.tipo} proveedor=${pn2} coste=${catCoste(catNuevo2)}€ PVP=${catPvp(catNuevo2)}€ margen=${catMargen(catNuevo2) ?? '—'}% → hueco: ${tipoHueco2||'—'}`)
  }
  if (catListNuevos.length < 2) console.log('  [WARN] catálogo devolvió < 2 vinos — revisa datos en proveedor_catalogo_vinos (columnas: tipo, activo, pvp_recomendado, coste_estimado)')

  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('carta_simulacion').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S3 delete: ${delErr.message}`)

    let fueraId = null
    if (vinoFuera) {
      const { data: fd, error: fe } = await sb.from('carta_simulacion').insert({
        restaurante_id: DEMO_ID, vino_id: vinoFuera.id,
        nombre: vinoFuera.nombre, tipo: vinoFuera.tipo || null, region: vinoFuera.region || null,
        precio_botella: vinoFuera.precio_botella || null, coste_compra: vinoFuera.coste_compra || null,
        estado: 'fuera',
      }).select('id').single()
      if (fe) throw new Error(`S3 fuera: ${fe.message}`)
      fueraId = fd.id
    }

    if (vinosActual.length > 0) {
      const simActualRows = vinosActual.map(v => ({
        restaurante_id: DEMO_ID, vino_id: v.id, nombre: v.nombre || 'Sin nombre',
        tipo: v.tipo || null, region: v.region || null,
        precio_botella: v.precio_botella || null, coste_compra: v.coste_compra || null,
        estado: 'actual',
      }))
      const { error: ae } = await sb.from('carta_simulacion').insert(simActualRows)
      if (ae) throw new Error(`S3 actuals: ${ae.message}`)
    }

    for (let i = 0; i < catListNuevos.length; i++) {
      const c = catListNuevos[i]
      const { error: ne } = await sb.from('carta_simulacion').insert({
        restaurante_id: DEMO_ID, catalogo_vino_id: c.id,
        nombre: c.nombre || 'Vino nuevo', bodega: c.bodega || null,
        tipo: c.tipo || null, region: c.region || null,
        anada: c.anada ? String(c.anada) : null,
        precio_botella: catPvp(c) || null, precio_copa: c.pvp_copa || null,
        coste_compra: catCoste(c) || null, estado: 'nuevo',
        sustituye_a: i === 0 ? fueraId : null,
      })
      if (ne) throw new Error(`S3 nuevo ${c.id}: ${ne.message}`)
    }
    console.log(`\n   ✓ ${vinosActual.length} actual + ${vinoFuera ? 1 : 0} fuera + ${catListNuevos.length} nuevo`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S4: inventory_snapshots — Jun, Ago, Sep 2026
  //   Jun y Ago: stockFx relativo al stock real para simular estacionalidad
  //   Sep: stock REAL de la BD (para cuadrar con el saldo real de bodega)
  //   Usa TODAS las refs activas (sin slice).
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S4] inventory_snapshots — Jun/Ago/Sep 2026 (todas las refs activas)...')

  const PERIODOS_INV = [
    { label: 'Jun 2026', inicio: '2026-06-01T00:00:00Z', fin: '2026-06-30T23:59:59Z',
      stockFn: (v) => Math.round(Math.max(Number(v.stock)||0, 6) * 1.0),
      estadoFn: (_v, i) => i % 8 === 0 ? 'bajo_minimo' : i % 11 === 0 ? 'lento' : 'normal' },
    { label: 'Ago 2026', inicio: '2026-08-01T00:00:00Z', fin: '2026-08-31T23:59:59Z',
      stockFn: (v) => Math.round(Math.max(Number(v.stock)||0, 6) * 0.6),
      estadoFn: (_v, i) => i % 4 === 0 ? 'bajo_minimo' : i % 7 === 0 ? 'inmovilizado' : 'normal' },
    { label: 'Sep 2026', inicio: '2026-09-01T00:00:00Z', fin: '2026-09-30T23:59:59Z',
      stockFn: (v) => Number(v.stock) || 0,  // stock REAL de la BD
      estadoFn: (v, _i) => {
        const s = Number(v.stock)||0; const m = Number(v.stock_minimo)||3
        return s === 0 ? 'sin_datos' : s <= m ? 'bajo_minimo' : 'normal'
      }},
  ]

  if (!DRY_RUN) {
    const { error: de } = await sb.from('inventory_snapshots').delete().eq('restaurante_id', DEMO_ID)
    if (de) throw new Error(`S4 delete: ${de.message}`)
  }

  let totalInmovilizadosLastSnap = 0
  let totalBajosLastSnap = 0

  console.log('\n  período     refs   unid   coste€   inmov  bajos  exceso')
  console.log('  ' + '─'.repeat(60))

  for (const pd of PERIODOS_INV) {
    const items = todosVinos.map((v, i) => {
      const stockAct  = pd.stockFn(v)
      const stockMin  = Number(v.stock_minimo) || 3
      const coste     = Number(v.coste_medio_pmp || v.coste_compra) || 0
      const pvp       = Number(v.precio_botella) || 0
      const valCoste  = Math.round(stockAct * coste * 100) / 100
      const ventasU   = Math.round(Math.max(Number(v.stock)||0, 6) * 0.4 * (pd.label === 'Jun 2026' ? 1.0 : pd.label === 'Ago 2026' ? 0.6 : 0.8))
      const diasCob   = ventasU > 0 ? Math.round(stockAct / (ventasU / 30)) : null
      const estadoBase = pd.estadoFn(v, i)
      const estado    = stockAct < stockMin ? 'bajo_minimo' : estadoBase
      return {
        restaurante_id: DEMO_ID, vino_id: v.id, proveedor: v.proveedor || null,
        stock_actual: stockAct, stock_minimo: stockMin, ventas_unidades: ventasU,
        coste_compra: coste, precio_botella: pvp, valor_stock_coste: valCoste,
        dias_cobertura: diasCob, estado_inventario: estado,
        motivo: estado === 'inmovilizado' ? 'Sin rotación en 60+ días' :
                estado === 'exceso'       ? 'Stock superior a 3 meses de cobertura' :
                estado === 'bajo_minimo'  ? 'Por debajo del stock mínimo' : null,
      }
    })

    const totalUnid   = items.reduce((s, it) => s + it.stock_actual, 0)
    const totalCoste  = items.reduce((s, it) => s + it.valor_stock_coste, 0)
    const totalVenta  = items.reduce((s, it) => s + (it.stock_actual * it.precio_botella), 0)
    const inmovilizados = items.filter(it => it.estado_inventario === 'inmovilizado')
    const bajos         = items.filter(it => it.estado_inventario === 'bajo_minimo')
    const excesos       = items.filter(it => it.estado_inventario === 'exceso')
    const lentas        = items.filter(it => it.estado_inventario === 'lento')
    const mermaU        = Math.round(totalUnid * 0.01)

    if (pd.label === 'Sep 2026') {
      totalInmovilizadosLastSnap = inmovilizados.length
      totalBajosLastSnap = bajos.length
      // Cuadre con saldo real de bodega
      console.log(`\n  [CUADRE SEP 2026]`)
      console.log(`  valor a coste calculado: ${totalCoste.toFixed(2)}€`)
      console.log(`  bodega informa hoy:       7.407 €  (diff = ${(totalCoste - 7407).toFixed(2)}€ ← movimientos de octubre)`)
      console.log(`  bajo mínimo calculado:   ${bajos.length}  (bodega informa: 5)`)
    }

    const pMap = {}
    for (const it of items) if (it.proveedor) pMap[it.proveedor] = (pMap[it.proveedor] || 0) + 1
    const pprinc = Object.entries(pMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const pPct   = pprinc ? Math.round(pMap[pprinc] / items.length * 100) : 0

    console.log(`  ${pd.label.padEnd(11)} ${String(items.length).padStart(5)} ${String(totalUnid).padStart(6)} ${String(Math.round(totalCoste)).padStart(8)} ${String(inmovilizados.length).padStart(6)} ${String(bajos.length).padStart(6)} ${String(excesos.length).padStart(7)}`)

    if (!DRY_RUN) {
      const { data: sd, error: se } = await sb.from('inventory_snapshots').insert({
        restaurante_id: DEMO_ID, periodo_inicio: pd.inicio, periodo_fin: pd.fin,
        referencias_activas: items.length, unidades_totales: totalUnid,
        valor_coste_total: Math.round(totalCoste * 100) / 100,
        valor_venta_total: Math.round(totalVenta * 100) / 100,
        stock_inmovilizado_refs: inmovilizados.length,
        stock_inmovilizado_valor: Math.round(inmovilizados.reduce((s, it) => s + it.valor_stock_coste, 0) * 100) / 100,
        referencias_lentas: lentas.length, exceso_stock_refs: excesos.length,
        proveedor_principal: pprinc, proveedor_principal_pct: pPct,
        merma_unidades: mermaU, tasa_merma_pct: totalUnid > 0 ? Math.round(mermaU / totalUnid * 10000) / 100 : 0,
      }).select('id').single()
      if (se) throw new Error(`S4 snapshot ${pd.label}: ${se.message}`)
      const { error: ie } = await sb.from('inventory_snapshot_items').insert(items.map(it => ({ ...it, snapshot_id: sd.id })))
      if (ie) throw new Error(`S4 items ${pd.label}: ${ie.message}`)
    }
  }
  if (!DRY_RUN) console.log(`\n   ✓ 3 snapshots + ${todosVinos.length * 3} items`)

  // ═══════════════════════════════════════════════════════════════════════════
  // S5: opportunity_snapshot — 5 oportunidades derivadas de carta REAL
  //
  // Regla: NO se propone lo que ya existe en cantidad suficiente.
  // Gap detection → huecosFuncionales + datos de margen/stock.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S5] opportunity_snapshot — derivado de huecos reales de carta...')
  console.log(`\n  Huecos funcionales detectados: ${huecosFuncionales.length ? huecosFuncionales.join(', ') : 'ninguno relevante'}`)

  const MARGEN_COPA  = 3.0

  // Fórmula 1: dulce para postres
  // Base: 4 copas/día (1 por postre × 4 postres) × 5 días × 3€ × 52 × 50% adopción
  // = 4 × 5 × 3 × 52 × 0.5 = 1560€/año  (< 2% de 118k ventas anuales estimadas → creíble)
  const impDulce = !tieneDulce
    ? Math.round(4 * 5 * MARGEN_COPA * 52 * 0.50)   // 1560€
    : Math.round(2 * 5 * MARGEN_COPA * 52 * 0.40)   // 624€ si ampliar

  // Fórmula 2: margen bajo — potencial de subida de PVP
  // +10% en PVP × rotación estimada 2 uds/semana × 52 semanas (conservador)
  const imp2Vinos = vinosBajoMargen.slice(0, 5)
  const imp2 = imp2Vinos.length > 0
    ? Math.round(imp2Vinos.reduce((s, v) => s + Number(v.precio_botella) * 0.10 * 2 * 52 * 0.5, 0))
    : 480

  // Fórmula 3: capital inmovilizado — SOLO si hay referencias inmovilizadas
  const impCapital = Math.round(totalInmovilizadosLastSnap * 4 * 7.5)

  // Fórmula 4: blanco con cuerpo para arroces
  // 4 arroces × 1 botella/día en arroces × 8€ margen × 52 × 40% adopción
  // = 1 × 5 × 8 × 52 × 0.40 = 832€/año (< 1% de 118k → creíble)
  const impBlancoArroces = !tieneBlancoConCuerpo
    ? Math.round(1 * 5 * 8 * 52 * 0.40)   // 832€
    : Math.round(1 * 3 * 8 * 52 * 0.30)   // 374€ si optimizar

  // Fórmula 5: diversificación proveedor (ahorro 3% en negociación)
  const impProveedor = provPrincPct > 40
    ? Math.round(imp2Vinos.reduce((s, v) => s + Number(v.coste_compra || 0) * 0.03 * 24, 0) || 650)
    : 500

  // Ítem 3 solo se incluye si hay referencias inmovilizadas
  const items3Capital = totalInmovilizadosLastSnap > 0 ? [{
    area: 'Gestión de stock',
    titulo: `Liberar capital inmovilizado (${totalInmovilizadosLastSnap} refs en Sep)`,
    detalle: `Snapshot de Sep 2026 detecta ${totalInmovilizadosLastSnap} referencias sin rotación en 60+ días. Capital bloqueado estimado: ${impCapital}€ a coste. Los vinos bajo mínimo requieren reposición urgente.`,
    accion: 'Copa del día o menú degustación con vinos inmovilizados; reposición de bajo mínimo',
    impacto_estimado: Math.max(impCapital, 300),
    tipo_impacto: 'capital',
    horizonte: 'medio_plazo',
    dificultad: 'media',
    confianza_pct: 72,
    prioridad: 'media',
    formula: `${totalInmovilizadosLastSnap} refs × 4 uds × 7.5€ coste = ${impCapital}€`,
  }] : []

  const oppItems = [
    {
      area: 'Carta de vinos',
      titulo: !tieneDulce
        ? 'Incorporar vino dulce (PX/Moscatel) — los 4 postres quedan sin maridaje'
        : 'Ampliar vinos dulces para maridaje de postres',
      detalle: !tieneDulce
        ? `La carta tiene 4 postres y NINGÚN vino dulce. El motor penaliza -80 pts todos los vinos secos en contexto postre → devuelve vacío. Un PX o Moscatel por copa (4.50€, ~70% margen) activa la venta cruzada postre+copa.`
        : `Existe vino dulce pero la oferta es limitada. Ampliar a PX + Moscatel mejora cobertura de postres.`,
      accion: 'Añadir Pedro Ximénez y/o Moscatel por copa — ver propuesta S6',
      impacto_estimado: impDulce,
      tipo_impacto: 'ventas',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 88,
      prioridad: 'alta',
      formula: `4 copas/día × 5 días × ${MARGEN_COPA}€ margen × 52 sem × 50% adopción = ${impDulce}€/año`,
    },
    {
      area: 'Precios',
      titulo: `Revisar PVP en ${vinosBajoMargen.length} vinos con margen < 60%`,
      detalle: `${vinosBajoMargen.length} referencias tienen margen bruto < 60% (sin IVA). Ajuste de +10% en PVP recupera margen sin impacto visible al cliente.`,
      accion: 'Revisar precios en /dashboard/vinos?filtro=pendientes e incrementar PVP un 10%',
      impacto_estimado: imp2,
      tipo_impacto: 'margen',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 78,
      prioridad: 'alta',
      formula: `${imp2Vinos.length} vinos <60% × +10% PVP × 2 uds/sem × 52 sem × 50% = ${imp2}€/año`,
    },
    ...items3Capital,
    {
      area: 'Carta de vinos',
      titulo: !tieneBlancoConCuerpo
        ? 'Añadir blanco con cuerpo (Chardonnay/Godello barrica) para arroces'
        : 'Optimizar blanco con cuerpo en carta para arroces',
      detalle: !tieneBlancoConCuerpo
        ? `La carta tiene 4 arroces que piden blanco con cuerpo y maloláctica. Los albariños son más ligeros; un Chardonnay en barrica o Godello con crianza sube ticket y margen por botella.`
        : `Existe blanco con cuerpo; optimizar precio y rotación para maximizar el ticket en arroces.`,
      accion: 'Incorporar Chardonnay fermentado en barrica o Godello D.O. Valdeorras — ver propuesta S6',
      impacto_estimado: impBlancoArroces,
      tipo_impacto: 'ventas',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 75,
      prioridad: 'media',
      formula: `1 botella/día × 5 días × 8€ margen × 52 sem × 40% adopción = ${impBlancoArroces}€/año`,
    },
    {
      area: 'Proveedores',
      titulo: `Diversificar — ${provPrinc || 'principal'} al ${provPrincPct}% de la bodega`,
      detalle: provPrincPct > 40
        ? `${provPrinc} aporta el ${provPrincPct}% de las referencias. Alta concentración limita la negociación de rappels y aumenta el riesgo de desabastecimiento.`
        : `Distribución de proveedores razonablemente diversificada. Optimizar condiciones con el principal.`,
      accion: `Negociar rappel anual con ${provPrinc || 'proveedor principal'}; explorar 2 referencias alternativas`,
      impacto_estimado: impProveedor,
      tipo_impacto: 'riesgo',
      horizonte: 'estrategico',
      dificultad: 'alta',
      confianza_pct: 60,
      prioridad: provPrincPct > 40 ? 'media' : 'baja',
      formula: `3% ahorro negociación × coste anual referencias ≈ ${impProveedor}€/año estimado`,
    },
  ]

  const oppSnap = {
    restaurante_id: DEMO_ID,
    periodo_inicio: '2026-09-01T00:00:00Z', periodo_fin: '2026-09-30T23:59:59Z',
    recuperacion_anual_estimada: oppItems.reduce((s, it) => s + it.impacto_estimado, 0),
    impacto_acciones_rapidas:    oppItems.filter(it => it.horizonte === 'accion_rapida').reduce((s, it) => s + it.impacto_estimado, 0),
    impacto_medio_plazo:         oppItems.filter(it => it.horizonte === 'medio_plazo').reduce((s, it) => s + it.impacto_estimado, 0),
    impacto_estrategico:         oppItems.filter(it => it.horizonte === 'estrategico').reduce((s, it) => s + it.impacto_estimado, 0),
    capital_liberable_estimado:  oppItems.filter(it => it.tipo_impacto === 'capital').reduce((s, it) => s + it.impacto_estimado, 0),
    confianza_media_pct: Math.round(oppItems.reduce((s, it) => s + it.confianza_pct, 0) / oppItems.length * 100) / 100,
    oportunidades_total: oppItems.length,
    resumen: `Recuperación estimada: ${oppItems.reduce((s, it) => s + it.impacto_estimado, 0)}€/año. Prioridad 1: vino dulce (${tieneDulce ? 'ampliar' : 'FALTA — postres sin maridaje'}).`,
  }

  console.log(`\n  Recuperación estimada (fórmula): ${oppSnap.recuperacion_anual_estimada}€/año`)
  console.log('\n  prioridad  horizonte         impacto€  titulo')
  console.log('  ' + '─'.repeat(72))
  for (const it of oppItems) {
    console.log(`  ${it.prioridad.padEnd(9)}  ${it.horizonte.padEnd(16)}  ${String(it.impacto_estimado).padStart(8)}  ${it.titulo.slice(0, 42)}`)
  }

  if (!DRY_RUN) {
    const { error: de } = await sb.from('opportunity_snapshots').delete().eq('restaurante_id', DEMO_ID)
    if (de) throw new Error(`S5 delete: ${de.message}`)
    const { data: sd, error: se } = await sb.from('opportunity_snapshots').insert(oppSnap).select('id').single()
    if (se) throw new Error(`S5 snapshot: ${se.message}`)
    const { error: ie } = await sb.from('opportunity_items').insert(
      oppItems.map(it => ({ ...it, snapshot_id: sd.id, restaurante_id: DEMO_ID }))
    )
    if (ie) throw new Error(`S5 items: ${ie.message}`)
    console.log(`\n   ✓ 1 snapshot + ${oppItems.length} oportunidades`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S6: consultor_propuestas — 5 propuestas sobre huecos reales
  //
  // Solo propone vinos que NO estén ya en la carta (via catalogoEnCartaIds).
  // Consulta proveedor_catalogo_vinos por tipo/ilike; si no hay match se usa
  // un nombre de referencia descriptivo en el campo 'vino'.
  // catalogo_vino_id: se trackea localmente (display) pero NO se inserta en BD
  // porque la tabla consultor_propuestas no tiene esa columna.
  // Si se añadiera en el futuro: ALTER TABLE consultor_propuestas ADD COLUMN
  //   catalogo_vino_id uuid REFERENCES proveedor_catalogo_vinos(id);
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S6] consultor_propuestas (huecos reales, sin repetir carta actual)...')

  await fetchProveedorNombres()
  const [catDulceRow, catBlancoConCuerpoRow, catGenComplejoRow, catEspumosoRow] = await Promise.all([
    buscarEnCatalogoSinRepetir('dulce'),
    (async () => {
      const r = await buscarEnCatalogoSinRepetir('blanco', 'barrica')
      return r || await buscarEnCatalogoSinRepetir('blanco', 'crianza')
    })(),
    (async () => {
      const r = await buscarEnCatalogoSinRepetir('generoso', 'oloroso')
      return r || await buscarEnCatalogoSinRepetir('generoso', 'amontillado')
    })(),
    buscarEnCatalogoSinRepetir('espumoso'),
  ])
  const catTintoBajoMargenRow = vinosBajoMargen[0]?.catalogo_vino_id
    ? await (async () => { const { data } = await sb.from('proveedor_catalogo_vinos').select(CAT_SELECT).eq('id', vinosBajoMargen[0].catalogo_vino_id).maybeSingle(); return data })()
    : await buscarEnCatalogoSinRepetir(vinosBajoMargen[0]?.tipo || 'tinto')

  // Helper para mostrar el vino real del catálogo
  function mostrarCatRow(label, row) {
    if (!row) { console.log(`    ${label}: — sin match en catálogo`); return }
    const pn  = catProveedorNombre(row)
    const pvp = catPvp(row)
    const cst = catCoste(row)
    const mg  = catMargen(row)
    console.log(`    ${label}: "${row.nombre}" (${row.bodega||'—'}) · zona: ${catZona(row)} · proveedor: ${pn}`)
    console.log(`       coste: ${cst}€ · PVP sugerido: ${pvp}€ · margen: ${mg !== null ? mg + '%' : '—'}`)
  }

  const propuestasRows = [
    {
      restaurante_id: DEMO_ID,
      titulo: catDulceRow
        ? `Incorporar ${catDulceRow.nombre} (${catDulceRow.bodega||'—'}) — PX/dulce para postres`
        : 'Incorporar Pedro Ximénez para maridaje de postres',
      vino:               catDulceRow?.nombre || 'Pedro Ximénez Gran Barquero',
      tipo:               'Dulce',
      zona:               catZona(catDulceRow) || 'Montilla-Moriles D.O.',
      proveedor_sugerido: catProveedorNombre(catDulceRow),
      coste_estimado:     catCoste(catDulceRow) || 6.50,
      precio_recomendado: catPvp(catDulceRow) || 4.50,
      margen_objetivo:    catMargen(catDulceRow) ?? 70,
      plato_objetivo: 'Tarta de queso al horno, torrijas, tocino de cielo, piononos',
      motivo: `La carta tiene 4 postres y ningún vino dulce. El motor penaliza -80 pts todos los vinos secos en contexto postre → devuelve vacío. Un PX por copa (~70% margen) activa venta cruzada postre+copa. Prioridad 1 del onboarding de maridaje.`,
      prioridad: 'alta', estado: 'propuesta',
      catalogo_vino_id: catDulceRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: catBlancoConCuerpoRow
        ? `Añadir ${catBlancoConCuerpoRow.nombre} (${catBlancoConCuerpoRow.bodega||'—'}) — blanco con cuerpo para arroces`
        : 'Añadir Chardonnay fermentado en barrica para arroces',
      vino:               catBlancoConCuerpoRow?.nombre || 'Chardonnay fermentado en barrica',
      tipo:               'Blanco',
      zona:               catZona(catBlancoConCuerpoRow) || 'D.O. Penedès',
      proveedor_sugerido: catProveedorNombre(catBlancoConCuerpoRow),
      coste_estimado:     catCoste(catBlancoConCuerpoRow) || 7.80,
      precio_recomendado: catPvp(catBlancoConCuerpoRow) || 28,
      margen_objetivo:    catMargen(catBlancoConCuerpoRow) ?? 65,
      plato_objetivo: 'Arroz caldoso de mariscos, arroz meloso de bogavante, fideuá marinera',
      motivo: `Los 4 arroces piden maloláctica y volumen en boca que el albariño no aporta. Chardonnay en barrica: mantequilla+nata contrarresta azafrán y sofrito. Sube ticket de arroz de 22€ a 26€ con recomendación activa.`,
      prioridad: 'alta', estado: 'interesa',
      catalogo_vino_id: catBlancoConCuerpoRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: catGenComplejoRow
        ? `Incorporar ${catGenComplejoRow.nombre} (${catGenComplejoRow.bodega||'—'}) — generoso complejo para estofados`
        : 'Incorporar oloroso/amontillado para carrillera y estofados',
      vino:               catGenComplejoRow?.nombre || 'Oloroso Seco VOS Sacristía',
      tipo:               'Generoso',
      zona:               catZona(catGenComplejoRow) || 'Jerez D.O.',
      proveedor_sugerido: catProveedorNombre(catGenComplejoRow),
      coste_estimado:     catCoste(catGenComplejoRow) || 5.50,
      precio_recomendado: catPvp(catGenComplejoRow) || 5.50,
      margen_objetivo:    catMargen(catGenComplejoRow) ?? 68,
      plato_objetivo: 'Carrillera de ternera al Jerez, costilla lacada, rabo de toro estofado',
      motivo: `La carta tiene finos y manzanillas pero no generoso complejo. El oloroso/amontillado conecta con los platos cocinados al Jerez (carrillera) y con umami intenso. Chartier: misma familia aromática que carnes braseadas con reducción.`,
      prioridad: 'media', estado: 'propuesta',
      catalogo_vino_id: catGenComplejoRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: vinosBajoMargen[0]
        ? `Sustituir "${(vinosBajoMargen[0].nombre||'').slice(0, 28)}" (margen ${Math.round(vinosBajoMargen[0]._margen)}%) por alternativa de catálogo`
        : 'Revisar vinos con margen < 60%',
      vino:               catTintoBajoMargenRow?.nombre || (vinosBajoMargen[0]?.tipo ? `Alternativa de ${vinosBajoMargen[0].tipo}` : 'Alternativa de tinto'),
      tipo:               catTintoBajoMargenRow?.tipo || vinosBajoMargen[0]?.tipo || 'Tinto',
      zona:               catZona(catTintoBajoMargenRow) || '—',
      proveedor_sugerido: catProveedorNombre(catTintoBajoMargenRow),
      coste_estimado:     catCoste(catTintoBajoMargenRow) || Number(vinosBajoMargen[0]?.coste_compra) || 6,
      precio_recomendado: catPvp(catTintoBajoMargenRow) || (Number(vinosBajoMargen[0]?.precio_botella) ? Math.round(Number(vinosBajoMargen[0].precio_botella) * 1.1) : 22),
      margen_objetivo:    catMargen(catTintoBajoMargenRow) ?? 65,
      plato_objetivo: 'Presa ibérica a la brasa, secreto ibérico, rabo de toro estofado',
      motivo: `El vino de menor margen (${Math.round(vinosBajoMargen[0]?._margen || 0)}%) se sustituye por alternativa del mismo tipo con mejor estructura de coste. Impacto inmediato en margen sin cambio visible en carta.`,
      prioridad: 'media', estado: 'interesa',
      catalogo_vino_id: catTintoBajoMargenRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: catEspumosoRow
        ? `Añadir ${catEspumosoRow.nombre} (${catEspumosoRow.bodega||'—'}) — espumoso diferencial para aperitivo`
        : 'Añadir espumoso rosado para aperitivo diferencial',
      vino:               catEspumosoRow?.nombre || 'Cava Rosado Brut Nature',
      tipo:               'Espumoso',
      zona:               catZona(catEspumosoRow) || 'Cava D.O.',
      proveedor_sugerido: catProveedorNombre(catEspumosoRow),
      coste_estimado:     catCoste(catEspumosoRow) || 6.20,
      precio_recomendado: catPvp(catEspumosoRow) || 24,
      margen_objetivo:    catMargen(catEspumosoRow) ?? 64,
      plato_objetivo: 'Entrantes fríos, boquerones, ceviche, tortillitas',
      motivo: `La carta ya tiene espumosos blancos. Un espumoso rosado diferencia el aperitivo y armoniza con entrantes fríos y frutos del mar. Estado descartada: revisar tras incorporar el dulce (prioridad 1).`,
      prioridad: 'baja', estado: 'descartada',
      catalogo_vino_id: catEspumosoRow?.id || null,
    },
  ]

  console.log('\n  prioridad  estado       cat_id?  titulo')
  console.log('  ' + '─'.repeat(80))
  for (const p of propuestasRows) {
    const catTag = p.catalogo_vino_id ? '✓ real' : '— sin cat'
    console.log(`  ${p.prioridad.padEnd(9)}  ${p.estado.padEnd(11)}  ${catTag.padEnd(9)}  ${p.titulo.slice(0, 50)}`)
  }
  console.log('\n  Vinos reales del catálogo encontrados:')
  mostrarCatRow('dulce (p1)     ', catDulceRow)
  mostrarCatRow('blanco cuerpo (p2)', catBlancoConCuerpoRow)
  mostrarCatRow('gen. complejo (p3)', catGenComplejoRow)
  mostrarCatRow('bajo margen (p4)', catTintoBajoMargenRow)
  mostrarCatRow('espumoso (p5)  ', catEspumosoRow)
  console.log('\n  NOTA: catalogo_vino_id se trackea localmente; NO se inserta en BD.')
  console.log('  Para guardarlo: ALTER TABLE consultor_propuestas ADD COLUMN catalogo_vino_id uuid REFERENCES proveedor_catalogo_vinos(id);')

  if (!DRY_RUN) {
    const { error: de } = await sb.from('consultor_propuestas').delete().eq('restaurante_id', DEMO_ID)
    if (de) throw new Error(`S6 delete: ${de.message}`)
    const rowsToInsert = propuestasRows.map(({ catalogo_vino_id: _c, ...rest }) => rest)
    const { error: ie } = await sb.from('consultor_propuestas').insert(rowsToInsert)
    if (ie) throw new Error(`S6 insert: ${ie.message}`)
    console.log(`\n   ✓ ${propuestasRows.length} propuestas insertadas`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S7: cabecera_compras — corregir proveedor genérico
  //
  // CAMPO AFECTADO: solo cabecera_compras.proveedor
  //   • NO toca importe, fecha, estado, lineas_compra ni movimientos_stock
  //
  // ANÁLISIS DE USO (leído del código):
  //   • Se MUESTRA en la lista de compras del dashboard (historial de pedidos)
  //   • NO alimenta el pedido sugerido (ese usa vinos.proveedor directamente)
  //   • NO aparece en el PDF de cierre mensual (solo sumas de lineas_compra.importe_neto)
  //   ⇒ Usar "Varios proveedores" es seguro y más preciso que votar por mayoría,
  //     ya que cada cabecera puede incluir líneas de múltiples distribuidores.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S7] cabecera_compras — corregir proveedor genérico (solo campo proveedor)...')

  const { data: cabs } = await sb.from('cabecera_compras')
    .select('id, fecha, proveedor').eq('restaurante_id', DEMO_ID).ilike('proveedor', 'Proveedor Demo%')

  if (!cabs || cabs.length === 0) {
    console.log('  Sin cabeceras con proveedor genérico. Omitido.')
  } else {
    const PROVEEDOR_VARIOS = 'Varios proveedores'
    console.log(`\n  ${cabs.length} cabeceras con proveedor genérico → asignando "${PROVEEDOR_VARIOS}"`)
    console.log(`  Motivo: cada pedido puede mezclar líneas de múltiples distribuidores.`)
    console.log(`  Impacto: visible en historial de compras; NO afecta pedido sugerido ni PDF de cierre.`)
    console.log('\n  id_parcial   fecha       antiguo')
    console.log('  ' + '─'.repeat(50))
    for (const cab of cabs) {
      console.log(`  …${cab.id.slice(-8)}   ${(cab.fecha || '').slice(0, 10)}   "${cab.proveedor}"`)
    }
    if (!DRY_RUN) {
      for (const cab of cabs) {
        const { error } = await sb.from('cabecera_compras')
          .update({ proveedor: PROVEEDOR_VARIOS })
          .eq('id', cab.id).eq('restaurante_id', DEMO_ID)
        if (error) throw new Error(`S7 ${cab.id}: ${error.message}`)
      }
      console.log(`\n   ✓ ${cabs.length} cabeceras → "${PROVEEDOR_VARIOS}" (solo campo proveedor)`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMO MARIDAJE: 15 platos representativos × top-3 del motor
  //
  // Consultas diseñadas para activar el contextoVenta() correcto:
  //   fritura → 'frita'/'frito'          pescado → 'marisco'/'gamba'/'atun'/'almejas'
  //   carne   → 'presa'/'rabo'/'secreto'  aperitivo/jamón → 'jamon' (esJamonCurado)
  //   postre  → 'tarta'/'torrija'
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[DEMO] Maridaje — 15 platos con motor al vuelo (wineProfileTags + estimarPerfil)...')

  try {
    const { analizarMaridaje } = await import('../app/lib/maridajeEngine.js')

    // En dry-run las notas aún no están actualizadas; aplicamos la generada en memoria.
    const notasGeneradas = new Map()
    for (const v of todosVinos) {
      if (!v.notas_cata || v.notas_cata.length < 12) {
        const rawCat = v.catalogo_vino_id ? catNotasMap[v.catalogo_vino_id] : null
        const nota = rawCat
          ? enriquecerNotaConPerfil(rawCat, v.tipo, v.uva, v.region, v.nombre, inferirPerfilesVino)
          : generarNotasCata(v.tipo, v.uva, v.region, v.nombre)
        notasGeneradas.set(v.id, nota)
      }
    }
    const vinosParaMotor = todosVinos.map(v => ({
      ...v,
      activo: true,
      stock: Math.max(Number(v.stock) || 0, 6),
      notas_cata: notasGeneradas.get(v.id) || v.notas_cata || '',
    }))

    const PLATOS_DEMO = [
      // fritura: 'frita' → contexto=fritura; acidezMin=4, taninosMax=2
      { plato: 'Tortillitas de camarones, masa frita crujiente en aceite de oliva',    ctx: 'fritura' },
      // pescado marisco: 'gamba' → contexto=pescado; taninosMax=2
      { plato: 'Gambas blancas cocidas al vapor con sal marina de la bahía',           ctx: 'pescado' },
      // pescado marisco: 'marisco' → pescado; sin plancha para no activar brasa
      { plato: 'Langostinos salteados, marisco del día con sal gruesa y limón',         ctx: 'pescado' },
      // pescado marisco: 'almejas' → pescado
      { plato: 'Almejas a la marinera con salsa de manzanilla, ajo y perejil',        ctx: 'pescado' },
      // pescado: 'marisco' → pescado; mineral/yodado activan mineralidad
      { plato: 'Ostras frescas, marisco vivo, mineral y yodado, servidas con hielo',   ctx: 'pescado' },
      // fritura: 'frito' → contexto=fritura
      { plato: 'Pescaíto frito de la bahía: boquerones, calamares fritos y gambas',   ctx: 'fritura' },
      // pescado: 'atun' → pescado; 'guiso' activa umami → acidezMin=3
      { plato: 'Atún encebollado al estilo gaditano, guiso con tomate y laurel',       ctx: 'pescado' },
      // pescado: 'pescado' → pescado; 'sofrito' activa umami → acidezMin=3
      { plato: 'Urta a la roteña al horno, pescado entero con sofrito de tomate',      ctx: 'pescado' },
      // pescado: 'marisco' en sepia/arroz negro → pescado; tinto penalizado -85
      { plato: 'Arroz negro meloso con sepia y marisco, ali-oli de ajo asado',        ctx: 'pescado' },
      // pescado: 'marisco' → pescado
      { plato: 'Arroz caldoso de bogavante y marisco con azafrán y sofrito',          ctx: 'pescado' },
      // carne: 'presa' → carne; brasa: taninosMin=3, cuerpoMin=3
      { plato: 'Presa ibérica a la brasa con chimichurri de hierbas',                 ctx: 'carne' },
      // carne: 'rabo' → carne; 'estofado' → umami: acidezMin=3
      { plato: 'Rabo de toro estofado con vino tinto, verduras y puré de patata',     ctx: 'carne' },
      // aperitivo/jamón: 'jamon' → esJamonCurado → taninosMax=2; tinto penalizado -95
      { plato: 'Tabla de jamón ibérico de bellota cortado a cuchillo',                ctx: 'jamón' },
      // postre: 'tarta' → postre; seco penalizado -80; solo dulce compatible
      { plato: 'Tarta de queso al horno con coulis de frutos rojos',                  ctx: 'postre' },
      // postre: 'torrija' → postre; seco penalizado -80
      { plato: 'Torrijas con helado de vainilla y miel de caña',                      ctx: 'postre' },
    ]

    if (vinosParaMotor.length === 0) {
      console.log('  Sin vinos — omitido.')
    } else {
      // ── Ejecutar motor para todos los platos ─────────────────────────────
      const resultados = new Map()
      for (const { plato, ctx } of PLATOS_DEMO) {
        let res
        try { res = analizarMaridaje(plato, vinosParaMotor) } catch { res = { recomendados: [] } }
        resultados.set(plato, { ctx, recs: (res.recomendados || []).slice(0, 3) })
      }

      // ── Tabla extendida: motivo, PVP y margen ─────────────────────────────
      const fmtRec = (item) => {
        if (!item?.vino) return '— (vacío)'.padEnd(40)
        const pvp   = Number(item.vino.precio_botella) || 0
        const coste = Number(item.vino.coste_compra) || 0
        const mg    = pvp && coste ? margenPct(pvp, coste) : null
        const nombre  = (item.vino.nombre || '?').slice(0, 13)
        const motivo  = (item.motivo || '').slice(0, 16)
        const precios = `${pvp ? pvp + '€' : '—'}${mg !== null ? '/' + mg + '%' : ''}`
        return `${nombre.padEnd(14)}${precios.padEnd(9)}[${motivo}]`.slice(0, 40).padEnd(40)
      }
      console.log('\n  plato                                  ctx       top-1 (nombre PVP/mg [motivo])           top-2                                     top-3')
      console.log('  ' + '─'.repeat(150))
      for (const { plato, ctx } of PLATOS_DEMO) {
        const { recs } = resultados.get(plato)
        console.log(`  ${plato.slice(0, 38).padEnd(38)} ${ctx.padEnd(9)} ${fmtRec(recs[0])}  ${fmtRec(recs[1])}  ${fmtRec(recs[2])}`)
      }

      // ── Aserciones (i)–(iv) ───────────────────────────────────────────────
      const asercionFails = []

      // (i) presa vs rabo: top-3 conjuntos distintos
      const presaEntry = PLATOS_DEMO.find(p => p.plato.includes('Presa'))
      const raboEntry  = PLATOS_DEMO.find(p => p.plato.includes('Rabo'))
      const presaRecs  = presaEntry ? (resultados.get(presaEntry.plato)?.recs || []) : []
      const raboRecs   = raboEntry  ? (resultados.get(raboEntry.plato)?.recs  || []) : []
      const presaIds   = presaRecs.map(r => r?.vino?.id).filter(Boolean)
      const raboIds    = raboRecs.map(r => r?.vino?.id).filter(Boolean)
      const intersect  = presaIds.filter(id => raboIds.includes(id))
      const pasaI = presaIds.length > 0 && raboIds.length > 0 && intersect.length < Math.min(presaIds.length, raboIds.length)
      if (!pasaI) asercionFails.push(`(i) presa y rabo comparten todo el top-3 (intersección ${intersect.length}/${Math.max(presaIds.length, raboIds.length)})`)

      // (ii) ≥5 sets top-3 distintos entre los 8 platos pescado/frito
      const platosMarisco = PLATOS_DEMO.filter(p => p.ctx === 'pescado' || p.ctx === 'fritura')
      const setsMarisco   = new Set(
        platosMarisco.map(p => (resultados.get(p.plato)?.recs || []).map(r => r?.vino?.id || '').join('|'))
      )
      const pasaII = setsMarisco.size >= 5
      if (!pasaII) asercionFails.push(`(ii) solo ${setsMarisco.size}/≥5 sets top-3 distintos entre ${platosMarisco.length} platos marisco/frito`)

      // (iii) ningún tinto en top-3 de arroces y marisco puro (no carne, no fritura)
      const platosNoTinto = PLATOS_DEMO.filter(p =>
        p.plato.toLowerCase().includes('arroz') ||
        p.plato.startsWith('Gambas') || p.plato.startsWith('Langostinos') ||
        p.plato.startsWith('Almejas') || p.plato.startsWith('Ostras')
      )
      const tintoEnNoTinto = []
      for (const p of platosNoTinto) {
        const recs = resultados.get(p.plato)?.recs || []
        for (const r of recs) {
          if ((r?.vino?.tipo || '').toLowerCase() === 'tinto')
            tintoEnNoTinto.push(`${p.plato.slice(0, 28)} → ${r.vino.nombre} (pos ${recs.indexOf(r) + 1})`)
        }
      }
      const pasaIII = tintoEnNoTinto.length === 0
      if (!pasaIII) asercionFails.push(`(iii) tinto en arroces/marisco:\n      ${tintoEnNoTinto.join('\n      ')}`)

      // (iv) postres: solo dulce/generoso en top-3
      const platosPostre = PLATOS_DEMO.filter(p => p.ctx === 'postre')
      const noAptoPostre = []
      for (const p of platosPostre) {
        const recs = resultados.get(p.plato)?.recs || []
        for (const r of recs) {
          const tipo = (r?.vino?.tipo || '').toLowerCase()
          if (!['dulce', 'generoso'].includes(tipo))
            noAptoPostre.push(`${p.plato.slice(0, 28)} → ${r.vino.nombre} tipo=${tipo}`)
        }
      }
      const pasaIV = noAptoPostre.length === 0 || platosPostre.every(p => (resultados.get(p.plato)?.recs || []).length === 0)
      if (!pasaIV) asercionFails.push(`(iv) vinos no dulce/oxidativo en postres:\n      ${noAptoPostre.join('\n      ')}`)

      console.log('\n  ── Aserciones ──')
      console.log(`  (i)   presa vs rabo top-3 distintos:      ${pasaI   ? '✓' : '✗'}  intersección=${intersect.length}`)
      console.log(`  (ii)  ≥5 sets distintos en marisco/frito: ${pasaII  ? '✓' : '✗'}  sets=${setsMarisco.size}/${platosMarisco.length}`)
      console.log(`  (iii) sin tinto en arroces/marisco:       ${pasaIII ? '✓' : '✗'}${!pasaIII ? `  (${tintoEnNoTinto.length} casos)` : ''}`)
      console.log(`  (iv)  postres solo dulce/oxidativo:       ${pasaIV  ? '✓' : '✗'}${!pasaIV  ? `  (${noAptoPostre.length} casos)` : ''}`)
      if (asercionFails.length === 0) {
        console.log('\n  ✓ Todas las aserciones (i–iv) superadas.')
      } else {
        console.log(`\n  [WARN] ${asercionFails.length} aserción(es) fallaron:`)
        for (const f of asercionFails) console.log(`    ✗ ${f}`)
      }
      console.log('\n  Nota motor: comercial pesa max ±3 pts (capped) para que el margen no voltee la compatibilidad.')
    }
  } catch (err) {
    console.log(`  (motor no disponible: ${err.message})`)
    console.log('  Análisis estático esperado:')
    console.log('    fritura        → generoso seco (manzanilla, fino) > espumoso > blanco salino')
    console.log('    marisco        → blanco atlántico (albariño) > generoso > espumoso > rosado')
    console.log('    almejas/ostras → manzanilla/fino (maridaje canónico) > espumoso')
    console.log('    arroz negro    → blanco con cuerpo > espumoso; NUNCA tinto (-85 pts)')
    console.log('    presa ibérica  → tinto Ribera/Priorat (taninos≥3, cuerpo≥3)')
    console.log('    rabo estofado  → tinto con acidez (Rioja/Mencía); diferente de presa')
    console.log('    jamón ibérico  → fino/manzanilla > cava > blanco salino; tinto -95 pts')
    console.log('    postre dulce   → solo dulce compatible; seco -80 pts; VACÍO si no hay PX/Moscatel')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ONBOARDING: Análisis antes/después del seed
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[ONBOARDING] Progreso estimado antes/después del seed...')

  const cartaPublicablePre  = vinosConPrecio.length > 0 && todosVinos.length > 0
  const bodegaPre           = vinosSinCoste.length === 0 && vinosSinProveedor.length === 0 && vinosConStock.length === todosVinos.length
  const cartaPublicablePost = cartaPublicablePre
  const bodegaPost          = bodegaPre

  const tareas = [
    { id: 'vinos',                pre: cartaPublicablePre,  post: cartaPublicablePost, desc: 'Carta con vinos y precios' },
    { id: 'platos',               pre: false,               post: true,                desc: 'Platos cargados' },
    { id: 'descripciones_platos', pre: false,               post: true,                desc: 'Platos descritos para maridaje' },
    { id: 'bodega',               pre: bodegaPre,           post: bodegaPost,          desc: 'Coste, proveedor y stock completos' },
    { id: 'qr',                   pre: false,               post: true,                desc: 'Carta pública activa (QR)' },
  ]

  const pctAntes   = Math.round(tareas.filter(t => t.pre).length  / tareas.length * 100)
  const pctDespues = Math.round(tareas.filter(t => t.post).length / tareas.length * 100)

  console.log('\n  paso                           antes  después  cambio')
  console.log('  ' + '─'.repeat(60))
  for (const t of tareas) {
    const change = !t.pre && t.post ? '→ DONE' : t.pre && !t.post ? '→ ROTO' : ''
    console.log(`  ${t.desc.padEnd(32)} ${(t.pre ? '✓' : '✗').padEnd(6)} ${(t.post ? '✓' : '✗').padEnd(8)} ${change}`)
  }
  console.log(`\n  Progreso: ${pctAntes}% antes → ${pctDespues}% después`)

  const pendientes = tareas.filter(t => !t.post)
  if (pendientes.length === 0) {
    console.log('  Todos los pasos completados tras el seed.')
  } else {
    console.log('  Pendiente para 100%:')
    for (const t of pendientes) {
      if (t.id === 'bodega')
        console.log(`    • ${t.desc}: coste (${vinosSinCoste.length} vinos), proveedor (${vinosSinProveedor.length}), stock (${todosVinos.length - vinosConStock.length})`)
      else if (t.id === 'vinos')
        console.log(`    • ${t.desc}: vinosConPrecio=${vinosConPrecio.length}/${todosVinos.length}`)
      else
        console.log(`    • ${t.desc}`)
    }
    console.log('  Fase 3 propuesta: completar datos de bodega (coste+proveedor+stock).')
  }
  if (!tieneDulce) {
    console.log(`\n  [ALERTA FUNCIONAL] Sin vino dulce en carta: 4 postres NO tienen maridaje posible.`)
    console.log(`  Motor retorna [] para contexto "postre". Incorporar PX o Moscatel es prioridad 1 del onboarding de maridaje.`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Resumen final
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(66))
  console.log(DRY_RUN ? 'DRY-RUN — RESUMEN (nada escrito en BD)' : 'CONFIRM — RESUMEN DE CAMBIOS APLICADOS')
  console.log('═'.repeat(66))
  console.log(`  S0  restaurante: slug=casa-marisma, colores, carta_publica=true`)
  console.log(`  S1  platos: ${PLATOS.length} en ${cats.length} categorías`)
  console.log(`  S2  perfiles: ${updates2.length} actualizados (override=${overrideCount} cat=${realCount}[${enriquecidoCount}enr] gen=${ficticioCount})`)
  console.log(`  S3  simulador: ${vinosActual.length} actual + ${vinoFuera ? 1 : 0} fuera + ${catListNuevos.length} nuevo (ilike tipo)`)
  console.log(`  S4  inventario: 3 snapshots × ${todosVinos.length} refs; Sep=stock real`)
  console.log(`  S5  oportunidades: ${oppItems.length} items · ${oppSnap.recuperacion_anual_estimada}€`)
  console.log(`  S6  propuestas: ${propuestasRows.length} (huecos: ${huecosFuncionales.length ? huecosFuncionales.join(', ') : 'stock/margen'})`)
  console.log(`  S7  cabecera_compras: solo campo proveedor → "Varios proveedores"`)
  console.log(`  ONBOARDING: ${pctAntes}% → ${pctDespues}%`)
  if (!tieneDulce) console.log(`  ⚠  DULCE AUSENTE — postres sin maridaje`)
  console.log(`\n  ${DRY_RUN
    ? 'Para aplicar:\n  node --env-file=.env.local scripts/seed-demo-fase2.mjs --confirm --nombre "Casa Marisma"'
    : '✓ Completado.'}`)
}

main().catch(err => {
  console.error('\nERROR:', err.message)
  process.exit(1)
})
