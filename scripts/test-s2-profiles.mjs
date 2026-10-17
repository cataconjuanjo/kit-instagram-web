#!/usr/bin/env node
/**
 * test-s2-profiles.mjs — Verifica las funciones puras de S2 sin acceso a BD.
 * Run: node scripts/test-s2-profiles.mjs
 *
 * Cubre: 6 overrides obligatorios (spec 1a) + 4 tipos genéricos (espumoso, blanco, rosado, dulce).
 */
import { inferirPerfilesVino } from '../app/lib/wineProfileTags.js'

// ── Pure functions (copiadas de seed-demo-fase2.mjs) ──────────────────────────

function generarNotasCata(tipo, uva, region, nombre) {
  const t   = (tipo   || '').toLowerCase()
  const u   = (uva    || '').toLowerCase()
  const r   = (region || '').toLowerCase()
  const n   = (nombre || '').toLowerCase()
  const all = [n, u, r].join(' ')

  if (t === 'generoso') {
    if (/cream/.test(all))
      return 'Generoso semidulce de crianza oxidativa. Dulce y untuoso, con cuerpo. Notas de almendra tostada, avellana, toffee y caramelo. Fruta seca y fruta confitada. Persistente y muy sabroso.'
    if (/manzanilla/.test(all))
      return 'Manzanilla de crianza biológica bajo flor en Sanlúcar. Alta acidez vibrante y salinidad marcada, mineral, con toque marino y yodado. Notas de almendra fresca y avellana verde. Alcohol alto, seco y muy largo.'
    if (/amontillado/.test(all))
      return 'Amontillado con crianza mixta biológica y oxidativa. Alta acidez vibrante con cuerpo y alcohol alto. Notas de avellana tostada, nuez y caramelo oxidativo. Seco, sabroso y muy persistente.'
    if (/oloroso/.test(all))
      return 'Oloroso con crianza oxidativa compleja y prolongada. Con cuerpo y alcohol alto, voluminoso. Notas de nuez, frutos secos tostados, toffee y caramelo. Seco, largo y muy sabroso.'
    return 'Fino de crianza biológica bajo flor en Jerez. Alta acidez y salinidad marcada, mineral. Notas de almendra fresca y avellana. Alcohol alto, seco y fin muy nítido.'
  }

  if (t === 'dulce') {
    if (/pedro ximenez|px/.test(all))
      return 'Pedro Ximénez de crianza oxidativa lenta. Dulce y untuoso, con cuerpo concentrado. Notas de uva pasa, fruta seca y cocida, fruta confitada, caramelo y toffee. Persistente y muy largo.'
    if (/moscatel|muscat/.test(all))
      return 'Moscatel de Alejandría, dulce y con cuerpo. Fruta tropical de lichi y mango, flores blancas de azahar. Fruta confitada y notas de fruta seca al final. Buena acidez fresca para equilibrar el dulzor. Persistente y muy expresivo.'
    return 'Vino dulce de concentración. Dulce y untuoso, con cuerpo. Notas de fruta seca, fruta cocida, fruta confitada, toffee y caramelo. Persistente.'
  }

  if (t === 'espumoso')
    return 'Espumoso con crianza sobre lías. Burbuja fina y persistente, alta acidez vibrante. Fruta verde de manzana y pera, fruta cítrica de lima. Notas de brioche y pan tostado por la autolisis. Seco y tenso.'

  if (t === 'rosado')
    return 'Rosado fresco y vibrante, alta acidez limpia. Fruta roja fresca de fresa, frambuesa y cereza roja. Seco, con final limpio y muy frutal.'

  if (t === 'tinto') {
    if (/nebbiolo/.test(u))
      return 'Nebbiolo de perfil sobrio y austero. Tanino firme y marcado con alta acidez vibrante. Con cuerpo y evolucion en botella. Notas de cuero, tierra y cereza seca. Especiado y muy persistente.'
    if (/priorat/.test(r))
      return 'Tinto del Priorat concentrado. Con cuerpo amplio y tanino firme y marcado. Fruta negra de zarzamora y ciruela negra. Especiado con pimienta y regaliz, roble integrado. Alcohol alto y muy largo.'
    if (/toro/.test(r))
      return 'Tinto de Toro con tanino firme y marcado. Con cuerpo amplio y alcohol alto. Fruta negra de ciruela y mora. Profundo, con notas especiadas y minerales. Largo y robusto.'
    if (/ribera del duero|ribera del duero/.test(r) || /ribera/.test(r) && /duero|arlanza/.test(r))
      return 'Tinto de Ribera del Duero con fruta negra de cereza negra y ciruela. Tanino firme y marcado, con cuerpo. Notas de barrica de cedro y café. Largo y bien estructurado.'
    if (/garnacha|grenache/.test(u))
      return 'Garnacha de carácter frutal. Fruta roja de fresa y cereza roja. Tanino amable y bajo, alta acidez natural. Seco y sin paso por madera.'
    if (/mencia|mencía/.test(u) || /bierzo/.test(r))
      return 'Mencía de Bierzo fresca y mineral. Alta acidez vibrante. Fruta roja y notas florales. Tanino amable y sedoso. Seco y mineral.'
    if (/tempranillo/.test(u) || /rioja/.test(r))
      return 'Tinto frutal de Rioja. Fruta roja de cereza y fresa. Tanino amable y bajo. Seco y equilibrado.'
    return 'Tinto joven frutal. Fruta roja de fresa y cereza. Tanino amable y bajo. Seco, fácil de beber.'
  }

  if (t === 'blanco') {
    if (/albarino|albariño/.test(u) || /rias baixas|rías baixas/.test(r))
      return 'Albariño de Rías Baixas con alta acidez vibrante. Fruta cítrica de lima, limón y pomelo, con toque de melocotón. Mineral y salino, frescura oceánica. Seco y largo.'
    if (/godello/.test(u) || /valdeorras|ribeira sacra/.test(r))
      return 'Godello con alta acidez vibrante y con cuerpo. Fruta cítrica de lima y melocotón. Mineral y salino. Tensión en boca. Seco y largo.'
    if (/chardonnay/.test(u) && /crianza|barrica|reserva|fermentado/.test(n))
      return 'Chardonnay con crianza en roble. Con cuerpo y voluminoso. Fruta de hueso de melocotón y albaricoque. Mantequilla y nata por la maloláctica. Barrica de vainilla y cedro. Seco y persistente.'
    if (/chardonnay/.test(u))
      return 'Chardonnay fresco y afrutado, alta acidez vibrante. Fruta de hueso de melocotón y fruta tropical. Seco y fácil de beber.'
    if (/priorat/.test(r) || /priorat/.test(n))
      return 'Blanco del Priorat con cuerpo y alcohol alto. Mineral y salino. Fruta de hueso de melocotón y albaricoque maduro. Seco y muy persistente.'
    return 'Blanco fresco con alta acidez vibrante. Fruta cítrica de lima y pomelo, mineral y salino. Seco, con notas de fruta verde de manzana.'
  }

  return 'Vino seco con alta acidez y fruta cítrica de lima y pomelo. Fresco y equilibrado.'
}

function frasePerfilPorTipo(tipo, uva, region, nombre) {
  const t = (tipo||'').toLowerCase()
  const u = (uva||'').toLowerCase()
  const r = (region||'').toLowerCase()
  const n = (nombre||'').toLowerCase()
  const all = [n, u, r].join(' ')
  if (t === 'espumoso') return 'Alta acidez vibrante. Notas de brioche y pan tostado por la autolisis sobre lías.'
  if (t === 'rosado') return 'Alta acidez limpia. Fruta roja de fresa y frambuesa.'
  if (t === 'dulce') {
    if (/pedro ximenez|px/.test(all)) return 'Dulce y untuoso, con cuerpo. Notas de uva pasa, fruta seca y cocida, toffee y caramelo.'
    return 'Dulce y con cuerpo. Notas de fruta seca, fruta cocida, toffee y caramelo.'
  }
  if (t === 'tinto') {
    if (/ribera|rioja|priorat|toro/.test(r) || /crianza|reserva/.test(n))
      return 'Tanino firme y marcado, con cuerpo. Barrica de cedro, café y vainilla.'
    if (/garnacha|grenache|mencia|mencía/.test(u))
      return 'Alta acidez. Fruta roja de fresa y cereza roja. Tanino amable y bajo.'
    return 'Fruta roja de fresa y frambuesa. Tanino amable y bajo.'
  }
  if (t === 'blanco') {
    if (/albarin/.test(u) || /rias baixas|galicia/.test(r)) return 'Alta acidez vibrante. Mineral y salino. Fruta cítrica de lima y pomelo.'
    return 'Alta acidez vibrante. Mineral y salino. Fruta cítrica de lima y pomelo.'
  }
  return 'Alta acidez y fruta cítrica de lima. Fresco y equilibrado.'
}

const NOMBRE_OVERRIDES = [
  { match: /laherte/i,
    tags: ['seco', 'alta_acidez', 'lias_autolisis', 'fruta_citrica', 'fruta_verde', 'mineral_salino'],
    nota: 'Champagne de viticultor sobre lías prolongadas. Alta acidez vibrante y burbuja fina persistente. Fruta verde de manzana y pera, fruta cítrica de lima y limón. Mineral y salino. Notas de brioche y pan tostado por la autolisis. Seco, brut nature sin dosaje.',
    aviso: null },
  { match: /pedra de guix/i,
    tags: ['seco', 'con_cuerpo', 'alcohol_alto', 'fruta_hueso', 'mineral_salino'],
    nota: 'Blanco del Priorat con fermentación y crianza. Con cuerpo y alcohol alto. Fruta de hueso de melocotón y albaricoque maduro. Mineral y salino. Seco y muy persistente.',
    aviso: null },
  { match: /parada de atauta/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra', 'roble'],
    nota: 'Tinto de Ribera del Duero con fruta negra de cereza negra y ciruela. Tanino firme y marcado, con cuerpo. Notas de barrica de cedro y café. Largo y bien estructurado.',
    aviso: null },
  { match: /poderi colla|colla nebbiolo/i,
    tags: ['seco', 'tanino_medio_alto', 'alta_acidez', 'fruta_roja', 'floral', 'evolucion_botella'],
    nota: 'Nebbiolo de perfil sobrio y austero. Tanino firme y marcado con alta acidez vibrante. Fruta roja de cereza seca y notas florales de violeta. Evolucion en botella, cuero y tierra. Seco y muy persistente.',
    aviso: null },
  { match: /grand rousseau/i,
    tags: ['seco', 'tanino_medio_alto', 'con_cuerpo', 'fruta_negra'],
    nota: 'Tinto de carácter potente y con cuerpo. Fruta negra de ciruela negra y mora. Tanino firme y marcado. Especiado y persistente. Seco y bien estructurado.',
    aviso: '[AVISO catálogo] Grand Rousseau: campo uva=Sauvignon Blanc pero tipo=tinto.' },
  { match: /salvajes de gredos/i,
    tags: ['seco', 'tanino_bajo', 'alta_acidez', 'fruta_roja', 'mineral_salino'],
    nota: 'Garnacha de las sierras de Gredos. Alta acidez vibrante, tanino amable y bajo. Mineral y salino, perfil de montaña. Fruta roja de frambuesa y cereza roja. Sin paso por madera. Seco.',
    aviso: '[AVISO catálogo] Salvajes de Gredos: zona en catálogo indica Priorat, pero es garnacha de Gredos.' },
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

function resolverNotaYTags(v, rawCatNota) {
  const nombre = v.nombre || ''
  const tipo   = (v.tipo || '').toLowerCase()
  const uva    = v.uva || ''

  for (const ov of NOMBRE_OVERRIDES) {
    if (ov.match.test(nombre)) {
      return { nota: ov.nota, tags: ov.tags, origen: 'override', aviso: ov.aviso }
    }
  }

  const inferirDeTexto = nota =>
    inferirPerfilesVino({ notas_cata: nota, tipo, uva: '', region: '', nombre: '' })

  if (rawCatNota) {
    let nota = rawCatNota
    let tags = inferirDeTexto(nota)
    if (['blanco', 'espumoso', 'rosado', 'dulce', 'generoso'].includes(tipo) &&
        (tags.includes('tanino_bajo') || tags.includes('tanino_medio_alto'))) {
      nota = generarNotasCata(v.tipo, uva, v.region, nombre)
      tags = inferirDeTexto(nota)
    }
    if (tags.filter(id => !['seco', 'dulce'].includes(id)).length < 2) {
      const frase = frasePerfilPorTipo(tipo, uva, v.region, nombre)
      if (frase) { nota = nota + ' ' + frase; tags = inferirDeTexto(nota) }
    }
    return { nota, tags, origen: nota !== rawCatNota ? 'cat+enrich' : 'catálogo', aviso: null }
  }

  const nota = generarNotasCata(v.tipo, uva, v.region, nombre)
  const tags = inferirDeTexto(nota)
  let origen
  if (['espumoso', 'rosado', 'generoso', 'dulce', 'naranja'].includes(tipo)) origen = 'regla-tipo'
  else if (uva) origen = 'regla-uva'
  else origen = 'generico'
  return { nota, tags, origen, aviso: null }
}

const TINTOS_ESTRUCTURADOS_RE = [
  /pintia/i, /alto los zorros/i, /camins/i, /san lorenzo/i,
  /parada de atauta/i, /poderi colla/i, /grand rousseau/i,
]

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

// ── Casos de test ─────────────────────────────────────────────────────────────

const CASOS = [
  // ── 6 overrides obligatorios (spec 1a) ─────────────────────────────────────
  {
    label: 'Laherte Freres Ultradition (espumoso)',
    vino: { nombre: 'Laherte Freres Ultradition', tipo: 'espumoso', uva: 'Chardonnay', region: 'Champagne' },
    rawCatNota: null,
    checks: [
      { desc: 'sin tanino', ok: r => !r.tags.includes('tanino_bajo') && !r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene alta_acidez', ok: r => r.tags.includes('alta_acidez') },
      { desc: 'tiene lias_autolisis', ok: r => r.tags.includes('lias_autolisis') },
      { desc: 'origen=override', ok: r => r.origen === 'override' },
      { desc: '≥2 tags sig', ok: r => r.tags.filter(t => !['seco','dulce'].includes(t)).length >= 2 },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('espumoso', r.tags, r.origen).length === 0 },
    ],
  },
  {
    label: 'Terroir Al Límit Pedra de Guix Blanco 2014 (blanco, region=Priorat)',
    vino: { nombre: 'Terroir Al Límit Pedra de Guix Blanco 2014', tipo: 'blanco', uva: 'Garnacha Blanca', region: 'Priorat' },
    rawCatNota: 'Vin blanc du Priorat, vinification oxidative, tannico et soyeux.',
    checks: [
      { desc: 'sin tanino', ok: r => !r.tags.includes('tanino_bajo') && !r.tags.includes('tanino_medio_alto') },
      { desc: 'origen=override', ok: r => r.origen === 'override' },
      { desc: '≥2 tags sig', ok: r => r.tags.filter(t => !['seco','dulce'].includes(t)).length >= 2 },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('blanco', r.tags, r.vino?.nombre ?? '').length === 0 },
    ],
  },
  {
    label: 'Parada de Atauta 2021 (tinto Ribera, sin crianza en nombre)',
    vino: { nombre: 'Parada de Atauta 2021', tipo: 'tinto', uva: 'Tempranillo', region: 'Ribera del Duero' },
    rawCatNota: null,
    checks: [
      { desc: 'tiene tanino_medio_alto', ok: r => r.tags.includes('tanino_medio_alto') },
      { desc: 'sin tanino_bajo', ok: r => !r.tags.includes('tanino_bajo') },
      { desc: 'tiene con_cuerpo', ok: r => r.tags.includes('con_cuerpo') },
      { desc: 'origen=override', ok: r => r.origen === 'override' },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('tinto', r.tags, 'Parada de Atauta').length === 0 },
    ],
  },
  {
    label: 'Poderi Colla Nebbiolo d\'Alba (italiano, tanino alto)',
    vino: { nombre: 'Poderi Colla Nebbiolo d\'Alba', tipo: 'tinto', uva: 'Nebbiolo', region: 'Piamonte' },
    rawCatNota: null,
    checks: [
      { desc: 'tiene tanino_medio_alto', ok: r => r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene alta_acidez', ok: r => r.tags.includes('alta_acidez') },
      { desc: 'origen=override', ok: r => r.origen === 'override' },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('tinto', r.tags, 'Poderi Colla Nebbiolo').length === 0 },
    ],
  },
  {
    label: 'Grand Rousseau (tinto con uva=Sauvignon Blanc en catálogo)',
    vino: { nombre: 'Grand Rousseau', tipo: 'tinto', uva: 'Sauvignon Blanc', region: 'Languedoc' },
    rawCatNota: 'Blanc de Sauvignon frais et minéral, cítrico y herbáceo.',
    checks: [
      { desc: 'tiene tanino_medio_alto', ok: r => r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene aviso de catálogo', ok: r => r.aviso !== null },
      { desc: 'origen=override', ok: r => r.origen === 'override' },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('tinto', r.tags, 'Grand Rousseau').length === 0 },
    ],
  },
  {
    label: 'Salvajes de Gredos (garnacha, zona=Priorat en catálogo)',
    vino: { nombre: 'Salvajes de Gredos', tipo: 'tinto', uva: 'Garnacha', region: 'Priorat' },
    rawCatNota: null,
    checks: [
      { desc: 'tiene tanino_bajo', ok: r => r.tags.includes('tanino_bajo') },
      { desc: 'sin tanino_medio_alto', ok: r => !r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene aviso de catálogo', ok: r => r.aviso !== null },
      { desc: 'sin cuerpo_ligero (es tinto med)', ok: r => !r.tags.includes('cuerpo_ligero') },
      { desc: 'origen=override', ok: r => r.origen === 'override' },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('tinto', r.tags, 'Salvajes de Gredos').length === 0 },
    ],
  },

  // ── 4 tipos genéricos ───────────────────────────────────────────────────────
  {
    label: 'Espumoso genérico sin nota (sin catálogo)',
    vino: { nombre: 'Cava Brut Reserva', tipo: 'espumoso', uva: '', region: 'Cava' },
    rawCatNota: null,
    checks: [
      { desc: 'sin tanino', ok: r => !r.tags.includes('tanino_bajo') && !r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene alta_acidez o lias_autolisis', ok: r => r.tags.includes('alta_acidez') || r.tags.includes('lias_autolisis') },
      { desc: '≥2 tags sig', ok: r => r.tags.filter(t => !['seco','dulce'].includes(t)).length >= 2 },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('espumoso', r.tags, 'Cava Brut Reserva').length === 0 },
    ],
  },
  {
    label: 'Blanco Albariño genérico',
    vino: { nombre: 'Itsasmendi Blanco', tipo: 'blanco', uva: 'Albariño', region: 'Rias Baixas' },
    rawCatNota: null,
    checks: [
      { desc: 'sin tanino', ok: r => !r.tags.includes('tanino_bajo') && !r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene alta_acidez', ok: r => r.tags.includes('alta_acidez') },
      { desc: 'tiene mineral_salino', ok: r => r.tags.includes('mineral_salino') },
      { desc: '≥2 tags sig', ok: r => r.tags.filter(t => !['seco','dulce'].includes(t)).length >= 2 },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('blanco', r.tags, 'Itsasmendi Blanco').length === 0 },
    ],
  },
  {
    label: 'Rosado genérico',
    vino: { nombre: 'Rosado de Garnacha', tipo: 'rosado', uva: 'Garnacha', region: 'Navarra' },
    rawCatNota: null,
    checks: [
      { desc: 'sin tanino_medio_alto', ok: r => !r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene fruta_roja', ok: r => r.tags.includes('fruta_roja') },
      { desc: '≥2 tags sig', ok: r => r.tags.filter(t => !['seco','dulce'].includes(t)).length >= 2 },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('rosado', r.tags, 'Rosado de Garnacha').length === 0 },
    ],
  },
  {
    label: 'Dulce PX genérico',
    vino: { nombre: 'Pedro Ximénez Reserva', tipo: 'dulce', uva: 'Pedro Ximénez', region: 'Montilla-Moriles' },
    rawCatNota: null,
    checks: [
      { desc: 'sin tanino', ok: r => !r.tags.includes('tanino_bajo') && !r.tags.includes('tanino_medio_alto') },
      { desc: 'tiene dulce', ok: r => r.tags.includes('dulce') },
      { desc: 'tiene oxidativo o fruta_seca_cocida', ok: r => r.tags.includes('oxidativo') || r.tags.includes('fruta_seca_cocida') },
      { desc: 'sin errores de validación', ok: r => validarTagsVino('dulce', r.tags, 'Pedro Ximénez Reserva').length === 0 },
    ],
  },
]

// ── Runner ────────────────────────────────────────────────────────────────────

let totalChecks = 0, passedChecks = 0
const failedCases = []

console.log('\n── test-s2-profiles.mjs ─────────────────────────────────────────')
for (const caso of CASOS) {
  const result = resolverNotaYTags(caso.vino, caso.rawCatNota || null)
  result.vino = caso.vino  // attach for checks that need it
  const caseErrs = []
  for (const check of caso.checks) {
    totalChecks++
    const ok = check.ok(result)
    if (ok) passedChecks++
    else caseErrs.push(`  ✗ ${check.desc}`)
  }
  const symbol = caseErrs.length === 0 ? '✓' : '✗'
  console.log(`\n${symbol} ${caso.label}`)
  console.log(`  origen=${result.origen}  tags=[${result.tags.join(', ')}]`)
  if (result.aviso) console.log(`  aviso: ${result.aviso.slice(0, 80)}`)
  if (caseErrs.length) failedCases.push({ label: caso.label, errs: caseErrs })
  for (const e of caseErrs) console.log(e)
}

console.log(`\n────────────────────────────────────────────────────────────────`)
console.log(`${passedChecks}/${totalChecks} checks pasados`)
if (failedCases.length === 0) {
  console.log('✓ Todos los casos superados.')
  process.exit(0)
} else {
  console.log(`✗ ${failedCases.length} caso(s) con fallos:`)
  for (const c of failedCases) console.log(`  - ${c.label}`)
  process.exit(1)
}
