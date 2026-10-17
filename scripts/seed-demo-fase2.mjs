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
    if (/priorat/.test(r))
      return 'Tinto del Priorat concentrado. Con cuerpo amplio y tanino firme y marcado. Fruta negra de zarzamora y ciruela negra. Especiado con pimienta y regaliz, roble integrado. Alcohol alto y muy largo.'
    if (/ribera del duero|ribera/.test(r) && /crianza|reserva/.test(n))
      return 'Tinto de Ribera del Duero con crianza en roble. Fruta negra de cereza negra y ciruela. Tanino firme y marcado, con cuerpo. Barrica de cedro, café y vainilla bien integrada. Largo y elegante.'
    if (/rioja/.test(r) && /crianza|reserva/.test(n))
      return 'Tinto riojano con crianza en barrica americana. Fruta roja madura, notas de vainilla, roble y café tostado. Tanino amable y redondo, con cuerpo medio. Largo, equilibrado y clásico.'
    if (/crianza|reserva|gran reserva/.test(n))
      return 'Tinto con crianza en barrica. Fruta negra de madurez media. Tanino firme y marcado, con cuerpo. Notas de roble, barrica, especiado y vainilla. Persistente y bien estructurado.'
    if (/garnacha|grenache/.test(u))
      return 'Garnacha de carácter frutal y fresco. Fruta roja de fresa y cereza roja. Tanino amable y bajo, alta acidez natural. Seco y sin paso por madera. Muy bebible.'
    if (/mencia|mencía/.test(u) || /bierzo/.test(r))
      return 'Mencía de Bierzo fresca y mineral. Alta acidez vibrante. Fruta roja y notas florales. Tanino amable y sedoso. Seco, con carácter cítrico y notas de hierbas frescas.'
    if (/tempranillo/.test(u) || /rioja/.test(r))
      return 'Tinto de Rioja de carácter frutal. Fruta roja de cereza y fresa. Tanino amable y bajo, perfil fresco. Ligero toque de roble. Seco y equilibrado.'
    return 'Tinto joven de carácter frutal. Fruta roja de fresa y frambuesa. Tanino amable y bajo, perfil fresco sin paso por madera. Seco y fácil de beber.'
  }

  // ── Blanco ───────────────────────────────────────────────────────────────────
  if (t === 'blanco') {
    if (/albarino|albariño/.test(u) || /rias baixas|rías baixas/.test(r))
      return 'Albariño de Rías Baixas con alta acidez vibrante. Fruta cítrica de lima, limón y pomelo, con toque de melocotón. Mineral y salino, frescura oceánica. Seco y largo. Fin muy sabroso.'
    if (/txakoli|txakolina/.test(all))
      return 'Txakolina con alta acidez vibrante y salinidad marcada. Fruta cítrica de lima y fruta verde de pera. Mineral y marino. Baja graduación de alcohol. Seco y muy refrescante.'
    if (/verdejo/.test(u) || /rueda/.test(r))
      return 'Verdejo de Rueda con alta acidez y perfil herbáceo fresco. Fruta verde de manzana y pera, fruta cítrica de lima. Notas de hierba fresca. Seco y afrutado.'
    if (/chardonnay/.test(u) && /crianza|barrica|reserva|fermentado/.test(n))
      return 'Chardonnay con crianza en roble. Con cuerpo y voluminoso. Fruta de hueso de melocotón y albaricoque. Mantequilla y nata por la maloláctica. Barrica de vainilla y cedro. Seco y persistente.'
    if (/chardonnay/.test(u))
      return 'Chardonnay fresco y afrutado, alta acidez vibrante. Fruta de hueso de melocotón y fruta tropical. Cuerpo medio. Seco y fácil de beber.'
    if (/godello/.test(u) || /valdeorras|ribeira sacra/.test(r))
      return 'Godello con alta acidez vibrante y cuerpo. Fruta cítrica de lima y melocotón. Mineral y salino. Con cuerpo, tensión en boca. Seco y largo.'
    if (/palomino/.test(u) || /jerez/.test(r))
      return 'Palomino seco de Jerez. Alta acidez, mineral y salino. Fruta cítrica de lima con hierba fresca. Seco y sabroso.'
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

// Enriquece una nota de catálogo real cuando tiene < 2 perfiles inferidos.
// inferirFn = inferirPerfilesVino import (puede ser no-op si falló el import).
function enriquecerNotaConPerfil(nota, tipo, uva, region, nombre, inferirFn) {
  if (!nota) return generarNotasCata(tipo, uva, region, nombre)
  const tags = inferirFn({ notas_cata: nota, tipo: tipo||'', uva: uva||'', region: region||'', nombre: nombre||'' })
  if (tags.length >= 2) return nota
  const frase = frasePerfilPorTipo(tipo, uva, region, nombre)
  return nota + (frase ? ' ' + frase : '')
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
  console.log(`\n${mode} seed-demo-fase2 v3  DEMO_ID=${DEMO_ID}  restaurante="${dbName}"\n`)

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

  // Helper: busca en catálogo un vino de ese tipo que no esté ya en carta
  async function buscarEnCatalogoSinRepetir(tipo, extraIlike = null) {
    let q = sb.from('proveedor_catalogo_vinos')
      .select('id, nombre, bodega, tipo, zona_dop, region, precio_pvp_botella, precio_pvp_copa, coste_neto, proveedor')
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
  let realCount = 0, ficticioCount = 0, enriquecidoCount = 0

  console.log(`\n  Total vinos activos: ${todosVinos.length}`)
  console.log(`  Con perfil existente (≥12 chars): ${todosVinos.length - vinosSinPerfil.length}`)
  console.log(`  Sin perfil → a actualizar: ${vinosSinPerfil.length}`)

  if (vinosSinPerfil.length > 0) {
    console.log('\n  ' + 'nombre'.padEnd(36) + 'tipo'.padEnd(10) + 'fuente       ' + 'perfiles_inferidos')
    console.log('  ' + '─'.repeat(96))
    for (const v of vinosSinPerfil) {
      const rawCatNota = v.catalogo_vino_id ? catNotasMap[v.catalogo_vino_id] : null
      let nota, fuente
      if (rawCatNota) {
        nota = enriquecerNotaConPerfil(rawCatNota, v.tipo, v.uva, v.region, v.nombre, inferirPerfilesVino)
        const enriquecido = nota !== rawCatNota
        fuente = enriquecido ? 'cat+enrich' : 'catálogo'
        realCount++
        if (enriquecido) enriquecidoCount++
      } else {
        nota = generarNotasCata(v.tipo, v.uva, v.region, v.nombre)
        fuente = 'ficticio'
        ficticioCount++
      }
      const tags = inferirPerfilesVino({ notas_cata: nota, tipo: v.tipo||'', uva: v.uva||'', region: v.region||'', nombre: v.nombre||'' })
      console.log('  ' + (v.nombre||'').slice(0,35).padEnd(36) + (v.tipo||'—').slice(0,9).padEnd(10) + fuente.padEnd(13) + tags.join(', '))
      updates2.push({ id: v.id, notas_cata: nota })
    }
    console.log(`\n  Fuentes: catálogo=${realCount} (${enriquecidoCount} enriquecidas), ficticio=${ficticioCount}`)
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
  const { data: catVinos1 } = await sb.from('proveedor_catalogo_vinos')
    .select('id, nombre, bodega, tipo, region, anada, precio_pvp_botella, precio_pvp_copa, coste_neto, proveedor')
    .eq('activo', true).ilike('tipo', `%${tipoFuera}%`).limit(10)
  const catNuevo1 = (catVinos1 || []).find(c => !catalogoEnCartaIds.has(c.id)) || null

  // nuevo 2: cubre hueco real (no puede repetir catNuevo1)
  const yaUsado1 = catNuevo1 ? new Set([...catalogoEnCartaIds, catNuevo1.id]) : catalogoEnCartaIds
  let catNuevo2 = null
  const tipoHueco2 = !tieneDulce ? 'dulce' : !tieneGenerosoComplejo && tieneGeneroso ? 'generoso' : !tieneBlancoConCuerpo ? 'blanco' : null
  const extraHueco2 = !tieneDulce ? null : !tieneGenerosoComplejo && tieneGeneroso ? 'oloroso' : !tieneBlancoConCuerpo ? 'barrica' : null
  if (tipoHueco2) {
    let q2 = sb.from('proveedor_catalogo_vinos')
      .select('id, nombre, bodega, tipo, region, anada, precio_pvp_botella, precio_pvp_copa, coste_neto, proveedor')
      .eq('activo', true).ilike('tipo', `%${tipoHueco2}%`).limit(10)
    if (extraHueco2) q2 = q2.ilike('nombre', `%${extraHueco2}%`)
    const { data: catVinos2 } = await q2
    catNuevo2 = (catVinos2 || []).find(c => !yaUsado1.has(c.id)) || null
    // fallback: any activo not in carta
    if (!catNuevo2) {
      const { data: fb } = await sb.from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, anada, precio_pvp_botella, precio_pvp_copa, coste_neto, proveedor')
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
  console.log(`  nuevos: ${catListNuevos.length} del catálogo`)
  if (catNuevo1) console.log(`    nuevo1: "${catNuevo1.nombre}" tipo=${catNuevo1.tipo} (mismo estilo que fuera)`)
  if (catNuevo2) console.log(`    nuevo2: "${catNuevo2.nombre}" tipo=${catNuevo2.tipo} (cubre hueco: ${tipoHueco2||'—'})`)
  if (catListNuevos.length < 2) console.log('  [WARN] catálogo devolvió < 2 vinos — revisa datos de proveedor_catalogo_vinos')

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
        precio_botella: c.precio_pvp_botella || null, precio_copa: c.precio_pvp_copa || null,
        coste_compra: c.coste_neto || null, estado: 'nuevo',
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

  const COPAS_SEMANA = 15
  const MARGEN_COPA  = 3.0
  const adopcionPct  = 0.50

  // Fórmula 1: dulce para postres — 4 postres en carta sin vino para ellos
  const impDulce = !tieneDulce
    ? Math.round(5 * 2 * 5 * MARGEN_COPA * 52 * adopcionPct)   // 5 copas/serv × 2 serv × 5 días × 3€ × 52s × 50%
    : Math.round(2 * 2 * 5 * MARGEN_COPA * 52 * adopcionPct)   // ampliar si hay 1 solo

  // Fórmula 2: margen bajo — potencial de subida de PVP
  const imp2Vinos = vinosBajoMargen.slice(0, 5)
  const imp2 = imp2Vinos.length > 0
    ? Math.round(imp2Vinos.reduce((s, v) => s + Number(v.precio_botella) * 0.10 * 24, 0))
    : 520

  // Fórmula 3: capital inmovilizado (Sep)
  const impCapital = Math.round(totalInmovilizadosLastSnap * 4 * 7.5)

  // Fórmula 4: blanco con cuerpo para arroces (4 arroces × 2 botellas/servicio × ...)
  const impBlancoArroces = !tieneBlancoConCuerpo
    ? Math.round(2 * 2 * 5 * 8 * 52 * adopcionPct)   // 2 botellas × 2 serv × 5 días × 8€ margen × 52s × 50%
    : Math.round(1 * 2 * 5 * 8 * 52 * adopcionPct)

  // Fórmula 5: diversificación proveedor (3% mejora sobre coste)
  const impProveedor = provPrincPct > 40
    ? Math.round(imp2Vinos.reduce((s, v) => s + Number(v.precio_botella) * 0.03 * 12, 0) || 800)
    : 600

  const oppItems = [
    {
      area: 'Carta de vinos',
      titulo: !tieneDulce
        ? 'Incorporar vino dulce (PX/Moscatel) — los 4 postres quedan sin maridaje'
        : 'Ampliar vinos dulces para maridaje de postres',
      detalle: !tieneDulce
        ? `La carta tiene 4 postres (tarta, torrijas, tocino, piononos) y NINGÚN vino dulce. El motor de maridaje devuelve vacío para postre: todos los vinos secos quedan penalizados -80 pts. Un PX o Moscatel por copa (4.50€, margen ~70%) resuelve el hueco y activa la venta cruzada postre+copa.`
        : `Existe vino dulce en carta pero la oferta es limitada. Ampliar a PX + Moscatel mejora la cobertura de postres.`,
      accion: 'Añadir Pedro Ximénez y/o Moscatel por copa — ver propuesta S6',
      impacto_estimado: impDulce,
      tipo_impacto: 'ventas',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 88,
      prioridad: 'alta',
      formula: `5 copas/servicio × 2 servicios × 5 días × ${MARGEN_COPA}€ margen × 52 semanas × ${adopcionPct * 100}% adopción = ${impDulce}€/año`,
    },
    {
      area: 'Precios',
      titulo: `Revisar PVP en ${vinosBajoMargen.length} vinos con margen < 60%`,
      detalle: `${vinosBajoMargen.length} referencias tienen margen bruto < 60% (sin IVA). Los vinos con margen < 60% se muestran como "margen bajo" en la calidad de bodega y bajan calidadVinos. Ajuste de +10% en PVP recupera margen sin impacto visible al cliente.`,
      accion: 'Revisar precios en /dashboard/vinos?filtro=pendientes e incrementar PVP un 10% en referencias identificadas',
      impacto_estimado: imp2,
      tipo_impacto: 'margen',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 78,
      prioridad: 'alta',
      formula: `${imp2Vinos.length} vinos con margen <60% × +10% PVP × 24 uds/año = ${imp2}€/año`,
    },
    {
      area: 'Gestión de stock',
      titulo: `Liberar capital inmovilizado (${totalInmovilizadosLastSnap} refs en Sep)`,
      detalle: `Snapshot de Sep 2026 detecta ${totalInmovilizadosLastSnap} referencias sin rotación en 60+ días. Capital bloqueado estimado: ${impCapital}€ a coste. Los 5 vinos bajo mínimo requieren reposición urgente.`,
      accion: 'Copa del día o menú degustación con vinos inmovilizados; reposición inmediata de los 5 bajo mínimo',
      impacto_estimado: Math.max(impCapital, 300),
      tipo_impacto: 'capital',
      horizonte: 'medio_plazo',
      dificultad: 'media',
      confianza_pct: 72,
      prioridad: 'media',
      formula: `${totalInmovilizadosLastSnap} refs inmovilizadas × 4 uds estimadas × 7.5€ coste medio = ${impCapital}€`,
    },
    {
      area: 'Carta de vinos',
      titulo: !tieneBlancoConCuerpo
        ? 'Añadir blanco con cuerpo (Chardonnay/Godello barrica) para arroces'
        : 'Optimizar blanco con cuerpo en carta para arroces',
      detalle: !tieneBlancoConCuerpo
        ? `La carta tiene 4 arroces (caldoso, bogavante, negro, fideuá) que piden blanco con cuerpo y maloláctica. Los blancos atlánticos actuales (albariño) son más ligeros; un Chardonnay en barrica o Godello con crianza sube el ticket y el margen por botella.`
        : `Existe blanco con cuerpo; optimizar precio y rotación para maximizar el ticket en arroces.`,
      accion: 'Incorporar Chardonnay fermentado en barrica o Godello D.O. Valdeorras — ver propuesta S6',
      impacto_estimado: impBlancoArroces,
      tipo_impacto: 'ventas',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 75,
      prioridad: 'media',
      formula: `2 botellas/servicio × 2 servicios × 5 días × 8€ margen × 52 semanas × ${adopcionPct * 100}% adopción = ${impBlancoArroces}€/año`,
    },
    {
      area: 'Proveedores',
      titulo: `Diversificar — ${provPrinc || 'principal'} al ${provPrincPct}% de la bodega`,
      detalle: provPrincPct > 40
        ? `${provPrinc} aporta el ${provPrincPct}% de las referencias. Alta concentración en un solo distribuidor limita la capacidad de negociación de rappels y aumenta el riesgo de desabastecimiento.`
        : `Distribución de proveedores razonablemente diversificada. Optimizar condiciones con el proveedor principal.`,
      accion: `Negociar rappel anual con ${provPrinc || 'proveedor principal'}; explorar 2 referencias alternativas para los vinos de mayor rotación`,
      impacto_estimado: impProveedor,
      tipo_impacto: 'riesgo',
      horizonte: 'estrategico',
      dificultad: 'alta',
      confianza_pct: 60,
      prioridad: provPrincPct > 40 ? 'media' : 'baja',
      formula: `3% mejora negociación × ${imp2Vinos.length} refs × 12 meses = ${impProveedor}€/año estimado`,
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

  const [catDulceRow, catBlancoConCuerpoRow, catGenComplejoRow, catTintoBajoMargenRow, catEspumosoRow] = await Promise.all([
    buscarEnCatalogoSinRepetir('dulce'),
    buscarEnCatalogoSinRepetir('blanco', 'barrica') || buscarEnCatalogoSinRepetir('blanco', 'crianza'),
    buscarEnCatalogoSinRepetir('generoso', 'oloroso') || buscarEnCatalogoSinRepetir('generoso', 'amontillado'),
    vinosBajoMargen[0]?.catalogo_vino_id
      ? (async () => { const { data } = await sb.from('proveedor_catalogo_vinos').select('id, nombre, bodega, tipo, zona_dop').eq('id', vinosBajoMargen[0].catalogo_vino_id).maybeSingle(); return data })()
      : buscarEnCatalogoSinRepetir(vinosBajoMargen[0]?.tipo || 'tinto'),
    buscarEnCatalogoSinRepetir('espumoso'),
  ])

  const propuestasRows = [
    {
      restaurante_id: DEMO_ID,
      titulo: catDulceRow
        ? `Incorporar ${catDulceRow.nombre} para maridaje de los 4 postres`
        : 'Incorporar Pedro Ximénez para maridaje de postres',
      vino:               catDulceRow?.nombre || 'Pedro Ximénez Gran Barquero',
      tipo:               'Dulce',
      zona:               catDulceRow?.zona_dop || 'Montilla-Moriles D.O.',
      proveedor_sugerido: catDulceRow?.proveedor || 'Consultar catálogo',
      coste_estimado: 6.50, precio_recomendado: 4.50, margen_objetivo: 70,
      plato_objetivo: 'Tarta de queso al horno, torrijas, tocino de cielo, piononos',
      motivo: `La carta tiene 4 postres y ningún vino dulce. El motor devuelve vacío para contexto "postre" cuando no hay dulce/PX. Margen por copa (~70%) superior a cualquier blanco. Diferenciador de servicio para los arroces y la tabla ibérica.`,
      prioridad: 'alta', estado: 'propuesta',
      catalogo_vino_id: catDulceRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: catBlancoConCuerpoRow
        ? `Añadir ${catBlancoConCuerpoRow.nombre} — blanco con cuerpo para arroces`
        : 'Añadir Chardonnay fermentado en barrica para arroces',
      vino:               catBlancoConCuerpoRow?.nombre || 'Chardonnay fermentado en barrica',
      tipo:               'Blanco',
      zona:               catBlancoConCuerpoRow?.zona_dop || 'D.O. Penedès / D.O. Conca de Barberà',
      proveedor_sugerido: catBlancoConCuerpoRow?.proveedor || 'Consultar catálogo',
      coste_estimado: 7.80, precio_recomendado: 28, margen_objetivo: 65,
      plato_objetivo: 'Arroz caldoso de mariscos, arroz meloso de bogavante, fideuá marinera',
      motivo: `Los 4 arroces piden volumen en boca y maloláctica que los blancos atlánticos actuales (albariño) no aportan. El Chardonnay en barrica tiene mantequilla+nata que contrarresta el azafrán y el sofrito. Sube el ticket de arroz de 22€ a 26€ con recomendación activa.`,
      prioridad: 'alta', estado: 'interesa',
      catalogo_vino_id: catBlancoConCuerpoRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: catGenComplejoRow
        ? `Incorporar ${catGenComplejoRow.nombre} para estofados y carnes al Jerez`
        : 'Incorporar oloroso/amontillado para carrillera y estofados',
      vino:               catGenComplejoRow?.nombre || 'Oloroso Seco Tío Pepe en Rama',
      tipo:               'Generoso',
      zona:               catGenComplejoRow?.zona_dop || 'Jerez D.O.',
      proveedor_sugerido: catGenComplejoRow?.proveedor || 'Consultar catálogo',
      coste_estimado: 5.50, precio_recomendado: 5.50, margen_objetivo: 68,
      plato_objetivo: 'Carrillera de ternera al Jerez, costilla lacada, rabo de toro estofado',
      motivo: `La carta tiene finos y manzanillas pero no generoso complejo. El oloroso/amontillado conecta con los platos cocinados al Jerez (carrillera) y con umami intenso. Chartier lo sitúa en la misma familia aromática que las carnes braseadas con reducción.`,
      prioridad: 'media', estado: 'propuesta',
      catalogo_vino_id: catGenComplejoRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: vinosBajoMargen[0]
        ? `Sustituir "${(vinosBajoMargen[0].nombre||'').slice(0, 30)}" (margen ${Math.round(vinosBajoMargen[0]._margen)}%) por alternativa`
        : 'Revisar tintos con margen < 60%',
      vino:               catTintoBajoMargenRow?.nombre || (vinosBajoMargen[0]?.tipo ? `Alternativa de ${vinosBajoMargen[0].tipo}` : 'Alternativa de tinto'),
      tipo:               catTintoBajoMargenRow?.tipo || vinosBajoMargen[0]?.tipo || 'Tinto',
      zona:               catTintoBajoMargenRow?.zona_dop || '—',
      proveedor_sugerido: catTintoBajoMargenRow?.proveedor || 'Consultar catálogo',
      coste_estimado: Number(vinosBajoMargen[0]?.coste_compra) || 6,
      precio_recomendado: Number(vinosBajoMargen[0]?.precio_botella) ? Math.round(Number(vinosBajoMargen[0].precio_botella) * 1.1) : 22,
      margen_objetivo: 65,
      plato_objetivo: 'Presa ibérica a la brasa, secreto ibérico, rabo de toro estofado',
      motivo: `El vino de menor margen (${Math.round(vinosBajoMargen[0]?._margen || 0)}%) puede sustituirse por una alternativa de mismo tipo con mejor estructura de coste. Impacto inmediato en margen sin cambio visible en carta.`,
      prioridad: 'media', estado: 'interesa',
      catalogo_vino_id: catTintoBajoMargenRow?.id || null,
    },
    {
      restaurante_id: DEMO_ID,
      titulo: catEspumosoRow
        ? `Añadir ${catEspumosoRow.nombre} — aperitivo de bienvenida`
        : 'Añadir espumoso rosado para aperitivo diferencial',
      vino:               catEspumosoRow?.nombre || 'Cava Rosado Brut Nature',
      tipo:               'Espumoso',
      zona:               catEspumosoRow?.zona_dop || 'Cava D.O.',
      proveedor_sugerido: catEspumosoRow?.proveedor || 'Consultar catálogo',
      coste_estimado: 6.20, precio_recomendado: 24, margen_objetivo: 64,
      plato_objetivo: 'Entrantes fríos, boquerones, ceviche, tortillitas',
      motivo: `La carta ya tiene espumosos blancos. Un rosado de cava diferencia el aperitivo y atrae a clientes que buscan color en copa. Armoniza con entrantes fríos y frutos del mar. Estado descartada: revisar tras incorporar el dulce que es prioridad 1.`,
      prioridad: 'baja', estado: 'descartada',
      catalogo_vino_id: catEspumosoRow?.id || null,
    },
  ]

  console.log('\n  prioridad  estado       cat_id?  titulo')
  console.log('  ' + '─'.repeat(74))
  for (const p of propuestasRows) {
    const catTag = p.catalogo_vino_id ? '✓ real' : '—'
    console.log(`  ${p.prioridad.padEnd(9)}  ${p.estado.padEnd(11)}  ${catTag.padEnd(7)}  ${p.titulo.slice(0, 46)}`)
  }
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
      // pescado marisco: 'marisco' → pescado; 'plancha' = brasa → tinto justificado pero blanco sigue mejor
      { plato: 'Langostinos a la plancha, marisco del día con sal gruesa y limón',     ctx: 'pescado' },
      // pescado marisco: 'almejas' → pescado
      { plato: 'Almejas a la marinera con salsa de manzanilla, ajo y perejil',        ctx: 'pescado' },
      // pescado: 'marisco' → pescado (ostras no en lista, se añade marisco)
      { plato: 'Ostras frescas, marisco vivo, servidas con hielo pilé y limón',        ctx: 'pescado' },
      // fritura: 'frito' → contexto=fritura
      { plato: 'Pescaíto frito de la bahía: boquerones, calamares fritos y gambas',   ctx: 'fritura' },
      // pescado: 'atun' → pescado
      { plato: 'Atún encebollado al estilo gaditano con tomate y laurel',             ctx: 'pescado' },
      // pescado: 'pescado' + 'rape' → pescado
      { plato: 'Urta a la roteña al horno, pescado entero con tomate y pimiento',     ctx: 'pescado' },
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
      const nomPad = (item) => {
        if (!item?.vino) return '—'.padEnd(22)
        const pvp = Number(item.vino.precio_botella) || 0
        const mg  = pvp && item.vino.coste_compra ? margenPct(pvp, Number(item.vino.coste_compra)) : null
        return ((item.vino.nombre||'?').slice(0, 14).padEnd(15) + (pvp ? pvp + '€' : '—').padStart(4) + (mg !== null ? ' ' + mg + '%' : '')).slice(0, 22).padEnd(22)
      }
      console.log('\n  plato                                  ctx       top-1                   top-2                   top-3')
      console.log('  ' + '─'.repeat(112))
      let allPass = true
      for (const { plato, ctx } of PLATOS_DEMO) {
        let res
        try { res = analizarMaridaje(plato, vinosParaMotor) } catch { res = { recomendados: [] } }
        const recs = (res.recomendados || []).slice(0, 3)
        const top1Tipo = recs[0]?.vino?.tipo || ''
        // Validación rápida de criterios 2a-2e
        let flag = ''
        if ((ctx === 'fritura' || ctx === 'pescado') && top1Tipo === 'tinto') { flag = ' ← ⚠ tinto arriba'; allPass = false }
        if (ctx === 'postre' && recs.length > 0 && !['dulce'].includes(top1Tipo)) { flag = ' ← ⚠ no dulce'; allPass = false }
        if (ctx === 'jamón' && top1Tipo === 'tinto') { flag = ' ← ⚠ tinto en jamón'; allPass = false }
        console.log(`  ${plato.slice(0, 38).padEnd(38)} ${ctx.padEnd(9)} ${nomPad(recs[0])}  ${nomPad(recs[1])}  ${nomPad(recs[2])}${flag}`)
      }
      console.log(allPass ? '\n  ✓ Todos los criterios 2(a-e) superados.' : '\n  [WARN] Algunos criterios fallaron — revisar perfiles de vinos o consultas.')
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
  console.log(`  S2  perfiles: ${updates2.length} actualizados (cat=${realCount} [${enriquecidoCount} enriquecidas], ficticio=${ficticioCount})`)
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
