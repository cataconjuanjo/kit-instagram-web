#!/usr/bin/env node
/**
 * seed-demo-fase2.mjs — Fase 2
 * Casa Marisma: platos, perfiles de vino, simulador de carta, snapshots de
 * inventario, oportunidades y propuestas del consultor.
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
  console.error('Ejemplo: node --env-file=.env.local scripts/seed-demo-fase2.mjs --confirm --nombre "Casa Marisma"')
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

// Genera notas_cata con keywords que inferirPerfilesVino() detecta.
// Siempre incluye marcador [perfil_maridaje:...] para garantizar los perfiles.
function generarNotasCata(tipo, uva, region, nombre) {
  const t   = (tipo   || '').toLowerCase()
  const u   = (uva    || '').toLowerCase()
  const r   = (region || '').toLowerCase()
  const n   = (nombre || '').toLowerCase()
  const all = [n, u, r].join(' ')

  if (t === 'generoso' || /manzanilla|fino|amontillado|oloroso|palo cortado/.test(all)) {
    if (/manzanilla/.test(all))
      return 'Manzanilla con crianza biológica bajo flor. Salino y mineral, alta acidez, seco. Notas de almendra, avellana y toque marino yodado.\n[perfil_maridaje:seco,alta_acidez,mineral_salino,oxidativo,alcohol_alto]'
    if (/amontillado/.test(all))
      return 'Amontillado con crianza mixta. Oxidativo, avellana, nuez y caramelo. Seco, alcohol alto, con cuerpo.\n[perfil_maridaje:seco,oxidativo,con_cuerpo,alcohol_alto]'
    if (/oloroso/.test(all))
      return 'Oloroso con crianza oxidativa. Oxidativo, nuez, frutos secos y fruta seca. Seco, alcohol alto, estructura amplia.\n[perfil_maridaje:seco,oxidativo,fruta_seca_cocida,con_cuerpo,alcohol_alto]'
    return 'Fino de Jerez con crianza biológica bajo flor. Alta acidez, seco, alcohol alto. Notas de almendra, avellana y mineral.\n[perfil_maridaje:seco,alta_acidez,mineral_salino,oxidativo,alcohol_alto]'
  }

  if (t === 'dulce' || /pedro ximenez|moscatel/.test(all)) {
    if (/pedro ximenez|px/.test(all))
      return 'Pedro Ximénez de crianza oxidativa. Dulce, fruta seca, uva pasa, fruta cocida, caramelo y toffee. Cuerpo untuoso y muy concentrado.\n[perfil_maridaje:dulce,oxidativo,fruta_seca_cocida,con_cuerpo]'
    return 'Moscatel dulce con aromas florales, fruta tropical, lichi y miel. Dulce, alta acidez, cuerpo ligero.\n[perfil_maridaje:dulce,alta_acidez,floral,fruta_tropical,cuerpo_ligero]'
  }

  if (t === 'espumoso' || /cava|espumoso/.test(t)) {
    return 'Espumoso de crianza sobre lías. Fruta verde, manzana, fruta cítrica, lima. Alta acidez, seco. Notas de brioche y pan tostado por autolisis.\n[perfil_maridaje:seco,alta_acidez,fruta_verde,fruta_citrica,lias_autolisis]'
  }

  if (t === 'rosado') {
    return 'Rosado con fruta roja fresca, fresa y frambuesa. Alta acidez, seco, cuerpo ligero. Fresco y de fácil beber.\n[perfil_maridaje:seco,alta_acidez,fruta_roja,cuerpo_ligero]'
  }

  if (t === 'tinto') {
    if (/priorat/.test(r))
      return 'Tinto del Priorat. Fruta negra, zarzamora, ciruela negra. Con cuerpo, tanino firme, alcohol alto. Especiado con pimienta y regaliz.\n[perfil_maridaje:seco,fruta_negra,tanino_medio_alto,con_cuerpo,alcohol_alto,especiado]'
    if (/ribera del duero/.test(r) && /crianza|reserva/.test(n))
      return 'Tinto de Ribera del Duero con crianza. Fruta negra, ciruela negra, cereza negra. Tanino firme, con cuerpo. Roble, vainilla, café y cedro.\n[perfil_maridaje:seco,fruta_negra,tanino_medio_alto,con_cuerpo,roble]'
    if (/crianza|reserva|gran reserva/.test(n))
      return 'Tinto con crianza en barrica. Fruta negra, roble, vainilla, especiado. Tanino medio, con cuerpo.\n[perfil_maridaje:seco,fruta_negra,tanino_medio_alto,con_cuerpo,roble,especiado]'
    if (/garnacha/.test(u))
      return 'Garnacha con fruta roja, fresa y cereza roja. Tanino bajo, cuerpo ligero, alta acidez. Fresco y frutal.\n[perfil_maridaje:seco,alta_acidez,fruta_roja,tanino_bajo,cuerpo_ligero]'
    if (/mencia|bierzo/.test(all))
      return 'Mencía con fruta roja y notas de violeta. Tanino bajo, alta acidez, cuerpo ligero. Fresco, mineral.\n[perfil_maridaje:seco,alta_acidez,fruta_roja,tanino_bajo,cuerpo_ligero,mineral_salino]'
    return 'Tinto joven con fruta roja, fresa y frambuesa. Tanino bajo, cuerpo ligero. Perfil fresco y afrutado.\n[perfil_maridaje:seco,fruta_roja,tanino_bajo,cuerpo_ligero]'
  }

  if (t === 'blanco') {
    if (/albarino/.test(u) || /rias baixas/.test(r))
      return 'Albariño de Rías Baixas. Alta acidez, fruta cítrica, lima y pomelo. Mineral y salino con toque de melocotón. Seco, cuerpo ligero.\n[perfil_maridaje:seco,alta_acidez,fruta_citrica,mineral_salino,cuerpo_ligero]'
    if (/txakoli|txakolina/.test(all))
      return 'Txakolina con alta acidez, fruta cítrica, lima y fruta verde. Mineral y salino, ligero de alcohol, seco.\n[perfil_maridaje:seco,alta_acidez,fruta_citrica,mineral_salino,alcohol_bajo,cuerpo_ligero]'
    if (/verdejo/.test(u) || /rueda/.test(r))
      return 'Verdejo de Rueda con fruta verde, manzana y pera. Alta acidez, herbáceo con notas de hierba fresca. Seco, cuerpo ligero.\n[perfil_maridaje:seco,alta_acidez,fruta_verde,herbaceo,cuerpo_ligero]'
    if (/chardonnay/.test(u))
      return 'Chardonnay con fruta de hueso, melocotón y albaricoque. Maloláctica con mantequilla y nata. Con cuerpo, seco.\n[perfil_maridaje:seco,fruta_hueso,malolactica,con_cuerpo]'
    if (/palomino/.test(u) || /jerez/.test(r))
      return 'Blanco de Jerez con fruta cítrica, lima y hierba fresca. Alta acidez, mineral, seco.\n[perfil_maridaje:seco,alta_acidez,fruta_citrica,mineral_salino,cuerpo_ligero]'
    return 'Blanco con fruta cítrica, lima y pomelo. Alta acidez, seco, cuerpo ligero. Mineral con notas de fruta verde.\n[perfil_maridaje:seco,alta_acidez,fruta_citrica,mineral_salino,cuerpo_ligero]'
  }

  return 'Vino fresco con fruta cítrica y buena acidez. Seco, cuerpo ligero.\n[perfil_maridaje:seco,alta_acidez,fruta_citrica,cuerpo_ligero]'
}

// ── 32 platos de Casa Marisma ─────────────────────────────────────────────────
const PLATOS = [
  // Entrantes fríos (5)
  { nombre: 'Salmorejo cordobés con jamón ibérico y huevo de codorniz',         descripcion: 'Salmorejo tradicional de Córdoba con guarnición de jamón ibérico y huevo de codorniz pochado',                         categoria: 'Entrantes fríos',     precio: 10 },
  { nombre: 'Gazpacho de tomate con langostino y pepino',                        descripcion: 'Gazpacho andaluz clásico servido frío con langostino salteado y pepino crujiente',                                        categoria: 'Entrantes fríos',     precio: 11 },
  { nombre: 'Ensalada de pulpo con patata y pimentón de la Vera',                descripcion: 'Pulpo cocido laminado sobre base de patata tibia con vinagreta de pimentón ahumado y cebolla roja',                       categoria: 'Entrantes fríos',     precio: 16 },
  { nombre: 'Anchoas del Cantábrico con pan con tomate',                         descripcion: 'Anchoas en salazón artesanal sobre tostadas con tomate restregado y aceite de oliva virgen extra',                        categoria: 'Entrantes fríos',     precio: 14 },
  { nombre: 'Ceviche de corvina con leche de tigre al fino',                     descripcion: 'Corvina marinada en leche de tigre con notas de fino de Jerez, aguacate, cilantro y puntilla de chili',                  categoria: 'Entrantes fríos',     precio: 16 },
  // Entrantes calientes (7)
  { nombre: 'Tortillitas de camarones estilo Cádiz',                             descripcion: 'Tortillitas crujientes de camarones de la bahía gaditana con masa ligera y reborde de perejil fresco',                   categoria: 'Entrantes calientes', precio: 12 },
  { nombre: 'Croquetas de choco en su tinta (6 unidades)',                       descripcion: 'Croquetas artesanas de choco en su tinta con bechamel cremosa y pan rallado crujiente',                                  categoria: 'Entrantes calientes', precio: 12 },
  { nombre: 'Boquerones en adobo gaditano con limón',                            descripcion: 'Boquerones macerados en adobo de vinagre, ajo y especias, fritos en aceite de oliva virgen extra',                       categoria: 'Entrantes calientes', precio: 11 },
  { nombre: 'Ortiguillas de mar rebozadas con mayonesa de lima',                 descripcion: 'Anémonas de mar rebozadas en tempura ligera con mayonesa casera de lima y cilantro',                                     categoria: 'Entrantes calientes', precio: 14 },
  { nombre: 'Gambas al pil-pil con guindilla y ajo',                             descripcion: 'Gambas salteadas en aceite de oliva con ajo laminado, guindilla y pimentón dulce al momento',                            categoria: 'Entrantes calientes', precio: 18 },
  { nombre: 'Chipirón a la plancha con ali-oli de ajo negro',                    descripcion: 'Chipirones enteros a la plancha con ali-oli cremoso de ajo negro fermentado y sal en escamas',                           categoria: 'Entrantes calientes', precio: 16 },
  { nombre: 'Pulpo a la brasa con cachelos y pimentón',                          descripcion: 'Tentáculo de pulpo a la brasa sobre cama de patata gallega cocida, pimentón de la Vera y aceite virgen extra',           categoria: 'Entrantes calientes', precio: 22 },
  // Del mar (9)
  { nombre: 'Lubina a la sal con verduras de temporada',                         descripcion: 'Lubina entera cocida en costra de sal gruesa, abierta en mesa, con verduras asadas al tomillo',                          categoria: 'Del mar',             precio: 28 },
  { nombre: 'Atún rojo de almadraba a la plancha (160g)',                        descripcion: 'Medallón de atún rojo de almadraba marcado en plancha de piedra con salsa de soja y jengibre',                           categoria: 'Del mar',             precio: 32 },
  { nombre: 'Gamba blanca de Huelva a la plancha',                               descripcion: 'Gambas blancas de Huelva a la plancha con sal marina de la marisma y limón confitado',                                   categoria: 'Del mar',             precio: 36 },
  { nombre: 'Rape a la plancha con patatas a lo pobre y pimentón',               descripcion: 'Lomo de rape a la plancha sobre cama de patatas confitadas con cebolla, pimiento verde y pimentón',                      categoria: 'Del mar',             precio: 26 },
  { nombre: 'Dorada con ajoblanco y uva moscatel',                               descripcion: 'Dorada al horno con salsa fría de ajoblanco malagueño, uva moscatel y aceite de almendra',                               categoria: 'Del mar',             precio: 24 },
  { nombre: 'Calamar de potera a la plancha con salsa de su tinta',              descripcion: 'Calamar entero a la plancha con reducción de su tinta, aceite de oliva y flor de sal',                                   categoria: 'Del mar',             precio: 22 },
  { nombre: 'Almejas a la marinera con manzanilla de Sanlúcar',                  descripcion: 'Almejas de carril abiertas al vapor en salsa marinera de manzanilla, ajo, tomate y perejil',                             categoria: 'Del mar',             precio: 22 },
  { nombre: 'Urta a la roteña con tomate y pimiento',                            descripcion: 'Urta al horno a la roteña con salsa de tomate, pimiento rojo asado y cebolla caramelizada',                              categoria: 'Del mar',             precio: 26 },
  { nombre: 'Mero en salsa verde con almejas',                                   descripcion: 'Medallón de mero en salsa verde de perejil, ajo y vino blanco con almejas y guisantes',                                  categoria: 'Del mar',             precio: 28 },
  // Arroces (4)
  { nombre: 'Arroz caldoso de mariscos',                                         descripcion: 'Arroz caldoso con gamba blanca, mejillón, almeja, calamar y cigala en caldo concentrado de mariscos',                    categoria: 'Arroces',             precio: 22 },
  { nombre: 'Arroz meloso de bogavante',                                         descripcion: 'Arroz meloso con bogavante vivo, azafrán de La Mancha y sofrito de tomate y ñora',                                       categoria: 'Arroces',             precio: 38 },
  { nombre: 'Fideuá marinera con alioli casero',                                 descripcion: 'Fideos finos con sepia, gamba, mejillón y toque de pimentón servidos con alioli casero',                                  categoria: 'Arroces',             precio: 20 },
  { nombre: 'Arroz negro con sepia y ali-oli de ajo asado',                      descripcion: 'Arroz negro meloso con sepia en su tinta, caldo casero de mariscos y ali-oli de ajo asado al horno',                     categoria: 'Arroces',             precio: 22 },
  // De la tierra (4)
  { nombre: 'Presa ibérica a la brasa con chimichurri de hierbas',               descripcion: 'Presa de cerdo ibérico bellota a la brasa al punto rosado con chimichurri de perejil, orégano y ajo',                   categoria: 'De la tierra',        precio: 22 },
  { nombre: 'Carrillera de ternera al vino de Jerez con puré trufado',           descripcion: 'Carrillera braseada durante 5 horas en vino de Jerez oloroso con puré de patata al aceite de trufa',                    categoria: 'De la tierra',        precio: 20 },
  { nombre: 'Secreto ibérico con patatas fritas y pimientos de padrón',          descripcion: 'Secreto de cerdo ibérico a la brasa con patatas fritas en aceite de oliva y pimientos de padrón',                        categoria: 'De la tierra',        precio: 22 },
  { nombre: 'Costilla de cerdo lacada con miel, mostaza y cerveza negra',        descripcion: 'Costilla de cerdo adobada y cocinada a baja temperatura lacada con reducción de miel, mostaza y cerveza',                categoria: 'De la tierra',        precio: 18 },
  // Tablas (3)
  { nombre: 'Tabla de jamón ibérico de bellota (80g)',                           descripcion: 'Jamón ibérico de bellota cortado a cuchillo, presentado en tabla de madera con pan de cristal tostado',                 categoria: 'Tablas',              precio: 22 },
  { nombre: 'Tabla de quesos andaluces con membrillo y nueces',                  descripcion: 'Selección de quesos artesanos de Andalucía: queso de cabra, semicurado y curado con membrillo casero',                  categoria: 'Tablas',              precio: 16 },
  { nombre: 'Tabla ibérica mixta (jamón, chorizo, lomo y salchichón)',           descripcion: 'Selección de embutidos ibéricos de bellota cortados a máquina con regañás de aceite de oliva',                          categoria: 'Tablas',              precio: 18 },
]
// total: 5+7+9+4+4+3 = 32 ✓

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
  console.log(`\n${mode} seed-demo-fase2  DEMO_ID=${DEMO_ID}  restaurante="${dbName}"\n`)

  // ═══════════════════════════════════════════════════════════════════════════
  // S0: Actualizar restaurante (colores, carta pública, ticket medio)
  // ═══════════════════════════════════════════════════════════════════════════
  const restUpdate = {
    slug:                'casa-marisma',
    color_primario:      '#1a4a3a',
    color_acento:        '#c8a96e',
    color_fondo:         '#faf8f3',
    tipografia:          'serif',
    carta_publica_activa: true,
    carta_pie_texto:     'Alérgenos disponibles bajo solicitud. Precio con IVA incluido.',
    ticket_medio_comida: 46,
  }
  console.log('[S0] Restaurante — slug, colores marinos, carta_publica=true, ticket_medio=46€')
  console.log('  ', JSON.stringify(restUpdate))
  if (!DRY_RUN) {
    const { error } = await sb.from('restaurantes').update(restUpdate).eq('id', DEMO_ID)
    if (error) throw new Error(`S0: ${error.message}`)
    console.log('   ✓')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S1: Platos — DELETE + INSERT 32 platos
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S1] Platos — 32 platos para restaurante andaluz de mariscos...')

  const platoRows = PLATOS.map(p => ({
    restaurante_id: DEMO_ID,
    nombre:         p.nombre,
    descripcion:    p.descripcion,
    categoria:      p.categoria,
    precio:         p.precio,
    activo:         true,
  }))

  console.log('\n  categoria                    n  precio_rango')
  console.log('  ' + '─'.repeat(45))
  const cats = [...new Set(PLATOS.map(p => p.categoria))]
  for (const c of cats) {
    const ps  = PLATOS.filter(p => p.categoria === c)
    const min = Math.min(...ps.map(p => p.precio))
    const max = Math.max(...ps.map(p => p.precio))
    console.log(`  ${c.padEnd(28)} ${String(ps.length).padStart(2)}  ${min}–${max}€`)
  }
  console.log('  ' + '─'.repeat(45))
  console.log(`  ${'TOTAL'.padEnd(30)} ${PLATOS.length}`)

  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('platos').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S1 delete: ${delErr.message}`)
    const { error: insErr } = await sb.from('platos').insert(platoRows)
    if (insErr) throw new Error(`S1 insert: ${insErr.message}`)
    console.log(`\n   ✓ ${platoRows.length} platos insertados`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S2: Perfiles de vino — notas_cata para vinos vacíos o sin descripción
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S2] Perfiles de vino (notas_cata IS NULL o < 12 chars)...')

  const { data: vinos, error: vinosErr } = await sb
    .from('vinos')
    .select('id, nombre, tipo, uva, region, notas_cata, bodega, proveedor, stock, stock_minimo, coste_compra, coste_medio_pmp, precio_botella')
    .eq('restaurante_id', DEMO_ID)
    .eq('activo', true)
  if (vinosErr) throw new Error(`S2 vinos: ${vinosErr.message}`)

  const todosVinos       = vinos || []
  const vinosSinPerfil   = todosVinos.filter(v => !v.notas_cata || v.notas_cata.length < 12)
  const vinosConPerfil   = todosVinos.filter(v => v.notas_cata && v.notas_cata.length >= 12)

  console.log(`\n  Total vinos activos:         ${todosVinos.length}`)
  console.log(`  Con perfil existente:         ${vinosConPerfil.length}`)
  console.log(`  Sin perfil → se generará:     ${vinosSinPerfil.length}`)

  if (vinosSinPerfil.length > 0) {
    console.log('\n  ' + 'nombre'.padEnd(38) + 'tipo'.padEnd(12) + 'perfiles')
    console.log('  ' + '─'.repeat(80))
    for (const v of vinosSinPerfil) {
      const notas    = generarNotasCata(v.tipo, v.uva, v.region, v.nombre)
      const marcador = notas.match(/\[perfil_maridaje:([^\]]+)\]/)?.[1] || '—'
      console.log('  ' + (v.nombre||'').slice(0,37).padEnd(38) + (v.tipo||'—').slice(0,11).padEnd(12) + marcador)
    }
  }

  if (!DRY_RUN) {
    let updated = 0
    for (const v of vinosSinPerfil) {
      const notas = generarNotasCata(v.tipo, v.uva, v.region, v.nombre)
      const { error } = await sb.from('vinos').update({ notas_cata: notas }).eq('id', v.id).eq('restaurante_id', DEMO_ID)
      if (error) throw new Error(`S2 vino ${v.id}: ${error.message}`)
      updated++
    }
    console.log(`\n   ✓ ${updated} notas_cata actualizadas`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S3: carta_simulacion
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S3] carta_simulacion (DELETE + INSERT)...')

  const MAX_SIM     = 15
  const vinosSim    = todosVinos.slice(0, MAX_SIM)
  const vinoFuera   = vinosSim.length > 0 ? vinosSim[vinosSim.length - 1] : null
  const vinosActual = vinoFuera ? vinosSim.slice(0, -1) : vinosSim

  // 2 vinos del catálogo como propuesta 'nuevo'
  const { data: catVinos } = await sb
    .from('proveedor_catalogo_vinos')
    .select('id, nombre, bodega, tipo, region, anada, precio_pvp_botella, precio_pvp_copa, coste_neto')
    .limit(2)
  const catList = catVinos || []

  const simActualRows = vinosActual.map(v => ({
    restaurante_id: DEMO_ID,
    vino_id:        v.id,
    nombre:         v.nombre || 'Sin nombre',
    tipo:           v.tipo   || null,
    region:         v.region || null,
    estado:         'actual',
  }))

  console.log(`\n  actual:  ${vinosActual.length} vinos`)
  if (vinoFuera) console.log(`  fuera:   ${vinoFuera.nombre}`)
  console.log(`  nuevo:   ${catList.length} vinos del catálogo`)
  showTable('muestra actual', simActualRows.slice(0, 2).map(r => ({ nombre: r.nombre, estado: r.estado })), 2)

  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('carta_simulacion').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S3 delete: ${delErr.message}`)

    // INSERT fuera primero → necesitamos su id para sustituye_a
    let fueraId = null
    if (vinoFuera) {
      const { data: fueraData, error: fueraErr } = await sb.from('carta_simulacion').insert({
        restaurante_id: DEMO_ID,
        vino_id:        vinoFuera.id,
        nombre:         vinoFuera.nombre || 'Sin nombre',
        tipo:           vinoFuera.tipo   || null,
        region:         vinoFuera.region || null,
        estado:         'fuera',
      }).select('id').single()
      if (fueraErr) throw new Error(`S3 fuera: ${fueraErr.message}`)
      fueraId = fueraData.id
    }

    // INSERT actuals
    if (simActualRows.length > 0) {
      const { error: actErr } = await sb.from('carta_simulacion').insert(simActualRows)
      if (actErr) throw new Error(`S3 actuals: ${actErr.message}`)
    }

    // INSERT nuevos del catálogo
    for (let i = 0; i < catList.length; i++) {
      const c = catList[i]
      const { error: nuevoErr } = await sb.from('carta_simulacion').insert({
        restaurante_id:   DEMO_ID,
        catalogo_vino_id: c.id,
        nombre:           c.nombre || 'Vino nuevo',
        bodega:           c.bodega || null,
        tipo:             c.tipo   || null,
        region:           c.region || null,
        anada:            c.anada ? String(c.anada) : null,
        precio_botella:   c.precio_pvp_botella || null,
        precio_copa:      c.precio_pvp_copa    || null,
        coste_compra:     c.coste_neto         || null,
        estado:           'nuevo',
        sustituye_a:      i === 0 ? fueraId : null,
      })
      if (nuevoErr) throw new Error(`S3 nuevo cat ${c.id}: ${nuevoErr.message}`)
    }

    console.log(`\n   ✓ ${simActualRows.length} actual + ${vinoFuera ? 1 : 0} fuera + ${catList.length} nuevo`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S4: inventory_snapshots — 3 períodos (Jun, Ago, Sep 2026)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S4] inventory_snapshots — Jun, Ago, Sep 2026...')

  const PERIODOS_INV = [
    {
      label:   'Jun 2026',
      inicio:  '2026-06-01T00:00:00Z',
      fin:     '2026-06-30T23:59:59Z',
      stockFx: 1.0,
      estadoFn: (_v, i) => i % 8 === 0 ? 'bajo_minimo' : i % 11 === 0 ? 'lento' : 'normal',
    },
    {
      label:   'Ago 2026',
      inicio:  '2026-08-01T00:00:00Z',
      fin:     '2026-08-31T23:59:59Z',
      stockFx: 0.6,
      estadoFn: (_v, i) => i % 4 === 0 ? 'bajo_minimo' : i % 7 === 0 ? 'inmovilizado' : 'normal',
    },
    {
      label:   'Sep 2026',
      inicio:  '2026-09-01T00:00:00Z',
      fin:     '2026-09-30T23:59:59Z',
      stockFx: 0.8,
      estadoFn: (_v, i) => i % 5 === 0 ? 'inmovilizado' : i % 9 === 0 ? 'exceso' : i % 12 === 0 ? 'bajo_minimo' : 'normal',
    },
  ]

  const vinosS = todosVinos.slice(0, 30)

  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('inventory_snapshots').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S4 delete: ${delErr.message}`)
  }

  console.log('\n  período     refs  unid  coste€  inmov  bajos  exceso')
  console.log('  ' + '─'.repeat(58))

  for (const pd of PERIODOS_INV) {
    const items = vinosS.map((v, i) => {
      const stockBase  = Math.max(v.stock || 0, 6)
      const stockAct   = Math.round(stockBase * pd.stockFx)
      const stockMin   = v.stock_minimo || 3
      const coste      = Number(v.coste_medio_pmp || v.coste_compra) || 0
      const pvp        = Number(v.precio_botella) || 0
      const valCoste   = Math.round(stockAct * coste * 100) / 100
      const ventasU    = Math.round(stockBase * 0.4 * pd.stockFx)
      const diasCob    = ventasU > 0 ? Math.round(stockAct / (ventasU / 30)) : null
      const estado     = stockAct < stockMin ? 'bajo_minimo' : pd.estadoFn(v, i)
      return {
        restaurante_id:    DEMO_ID,
        vino_id:           v.id,
        proveedor:         v.proveedor || null,
        stock_actual:      stockAct,
        stock_minimo:      stockMin,
        ventas_unidades:   ventasU,
        coste_compra:      coste,
        precio_botella:    pvp,
        valor_stock_coste: valCoste,
        dias_cobertura:    diasCob,
        estado_inventario: estado,
        motivo:
          estado === 'inmovilizado' ? 'Sin rotación en 60+ días' :
          estado === 'exceso'       ? 'Stock superior a 3 meses de cobertura' :
          estado === 'bajo_minimo'  ? 'Por debajo del stock mínimo' : null,
      }
    })

    const totalUnid  = items.reduce((s, it) => s + it.stock_actual, 0)
    const totalCoste = items.reduce((s, it) => s + it.valor_stock_coste, 0)
    const totalVenta = items.reduce((s, it) => s + (it.stock_actual * it.precio_botella), 0)
    const inmovilizados = items.filter(it => it.estado_inventario === 'inmovilizado')
    const bajos         = items.filter(it => it.estado_inventario === 'bajo_minimo')
    const excesos       = items.filter(it => it.estado_inventario === 'exceso')
    const lentas        = items.filter(it => it.estado_inventario === 'lento')
    const mermaU        = Math.round(totalUnid * 0.01)

    const provMap = {}
    for (const it of items) if (it.proveedor) provMap[it.proveedor] = (provMap[it.proveedor] || 0) + 1
    const provPrinc = Object.entries(provMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || null
    const provPct   = provPrinc ? Math.round(provMap[provPrinc] / items.length * 100) : 0

    console.log(`  ${pd.label.padEnd(11)} ${String(items.length).padStart(4)}  ${String(totalUnid).padStart(4)}  ${String(Math.round(totalCoste)).padStart(6)}  ${String(inmovilizados.length).padStart(5)}  ${String(bajos.length).padStart(5)}  ${String(excesos.length).padStart(6)}`)

    if (!DRY_RUN) {
      const snap = {
        restaurante_id:              DEMO_ID,
        periodo_inicio:              pd.inicio,
        periodo_fin:                 pd.fin,
        referencias_activas:         items.length,
        unidades_totales:            totalUnid,
        valor_coste_total:           Math.round(totalCoste * 100) / 100,
        valor_venta_total:           Math.round(totalVenta * 100) / 100,
        stock_inmovilizado_refs:     inmovilizados.length,
        stock_inmovilizado_valor:    Math.round(inmovilizados.reduce((s,it)=>s+it.valor_stock_coste,0)*100)/100,
        referencias_lentas:          lentas.length,
        exceso_stock_refs:           excesos.length,
        proveedor_principal:         provPrinc,
        proveedor_principal_pct:     provPct,
        merma_unidades:              mermaU,
        tasa_merma_pct:              totalUnid > 0 ? Math.round(mermaU / totalUnid * 10000) / 100 : 0,
      }
      const { data: snapData, error: snapErr } = await sb
        .from('inventory_snapshots').insert(snap).select('id').single()
      if (snapErr) throw new Error(`S4 snapshot ${pd.label}: ${snapErr.message}`)

      const itemsConSnap = items.map(it => ({ ...it, snapshot_id: snapData.id }))
      const { error: itemsErr } = await sb.from('inventory_snapshot_items').insert(itemsConSnap)
      if (itemsErr) throw new Error(`S4 items ${pd.label}: ${itemsErr.message}`)
    }
  }
  if (!DRY_RUN) console.log(`\n   ✓ 3 snapshots + ${vinosS.length * 3} items`)

  // ═══════════════════════════════════════════════════════════════════════════
  // S5: opportunity_snapshot + 5 oportunidades (Sep 2026)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S5] opportunity_snapshot + 5 oportunidades...')

  const oppItems = [
    {
      area:             'Carta de vinos',
      titulo:           'Ampliar gama de manzanillas y finos por copa',
      detalle:          'Solo 1 referencia de Jerez en carta. Con 3 referencias distintas (fino, manzanilla, amontillado) a 3-4€/copa se captura el maridaje natural con mariscos y adobos gaditanos.',
      accion:           'Incorporar Manzanilla La Gitana y Fino Tío Pepe en copa durante temporada de mariscos',
      impacto_estimado: 1200,
      tipo_impacto:     'margen',
      horizonte:        'accion_rapida',
      dificultad:       'baja',
      confianza_pct:    88,
      prioridad:        'alta',
      formula:          '3 ref × 15 copas/semana × 3€ margen/copa × 4 semanas = 540€/mes aprox.',
    },
    {
      area:             'Precio copa',
      titulo:           'Actualizar precio copa manzanilla y vinos por copa con margen < 70%',
      detalle:          'Precio copa manzanilla actual: 2.5€. Mercado comparable: 3.5-4€. Con 20 copas/semana, la diferencia supera 780€/año sin cambiar volumen.',
      accion:           'Subir precio copa manzanilla a 3.5€ y revisar todos los vinos por copa con margen por debajo del 70%',
      impacto_estimado: 780,
      tipo_impacto:     'margen',
      horizonte:        'accion_rapida',
      dificultad:       'baja',
      confianza_pct:    82,
      prioridad:        'alta',
      formula:          '(3.5 - 2.5)€ × 20 copas/semana × 52 semanas = 1.040€/año ajustado al 75% = 780€ neto',
    },
    {
      area:             'Gestión de stock',
      titulo:           'Liberar capital inmovilizado en tintos de crianza',
      detalle:          'Detectados tintos crianza/reserva con más de 60 días sin rotación. Capital bloqueado en bodega a coste estimado ~320€.',
      accion:           'Crear menú maridaje de temporada con tinto como protagonista; aplicar precio especial en copas durante la semana',
      impacto_estimado: 320,
      tipo_impacto:     'capital',
      horizonte:        'medio_plazo',
      dificultad:       'media',
      confianza_pct:    75,
      prioridad:        'media',
      formula:          'Refs inmovilizadas × unidades × coste_compra',
    },
    {
      area:             'Maridaje',
      titulo:           'Incorporar blanco atlántico como recomendación del sumiller',
      detalle:          'El 65% de las mesas piden marisco. Solo 2 blancos atlánticos en carta. Añadir albariño o txakolina sub-20€ mejora la conversión en copas de precio medio.',
      accion:           'Incluir albariño gallego como "recomendación del día" para mariscos y pescados del día',
      impacto_estimado: 950,
      tipo_impacto:     'ventas',
      horizonte:        'accion_rapida',
      dificultad:       'baja',
      confianza_pct:    79,
      prioridad:        'media',
      formula:          '10 botellas/semana × 8€ margen/botella × 52 semanas × adopción 23% = 950€/año',
    },
    {
      area:             'Estrategia de carta',
      titulo:           'Diseñar maridaje cerrado para menú degustación de temporada',
      detalle:          'Un menú degustación con maridaje incluido (6 pasos + 4 vinos) a 75€/persona mejora ticket medio y diferencia la propuesta frente a la competencia directa.',
      accion:           'Crear menú degustación otoño con maridaje de fino, blanco atlántico, tinto ligero y PX de postre',
      impacto_estimado: 3200,
      tipo_impacto:     'ventas',
      horizonte:        'estrategico',
      dificultad:       'alta',
      confianza_pct:    65,
      prioridad:        'baja',
      formula:          '8 cubiertos × 30€ margen maridaje × 4 noches/semana × 12 semanas = 11.520€; ajustado 65% confianza = 3.200€',
    },
  ]

  const oppSnap = {
    restaurante_id:              DEMO_ID,
    periodo_inicio:              '2026-09-01T00:00:00Z',
    periodo_fin:                 '2026-09-30T23:59:59Z',
    recuperacion_anual_estimada: oppItems.reduce((s,it)=>s+it.impacto_estimado, 0),
    impacto_acciones_rapidas:    oppItems.filter(it=>it.horizonte==='accion_rapida').reduce((s,it)=>s+it.impacto_estimado, 0),
    impacto_medio_plazo:         oppItems.filter(it=>it.horizonte==='medio_plazo').reduce((s,it)=>s+it.impacto_estimado, 0),
    impacto_estrategico:         oppItems.filter(it=>it.horizonte==='estrategico').reduce((s,it)=>s+it.impacto_estimado, 0),
    capital_liberable_estimado:  oppItems.filter(it=>it.tipo_impacto==='capital').reduce((s,it)=>s+it.impacto_estimado, 0),
    confianza_media_pct:         Math.round(oppItems.reduce((s,it)=>s+it.confianza_pct,0)/oppItems.length * 100) / 100,
    oportunidades_total:         oppItems.length,
    resumen:                     'Recuperación estimada anual: 6.450€. Acciones rápidas de baja dificultad priorizadas en gama Jerez y precios por copa.',
  }

  console.log(`\n  Recuperación estimada: ${oppSnap.recuperacion_anual_estimada}€  confianza media: ${oppSnap.confianza_media_pct}%`)
  console.log('\n  prioridad  horizonte         impacto  titulo')
  console.log('  ' + '─'.repeat(68))
  for (const it of oppItems) {
    console.log(`  ${it.prioridad.padEnd(9)}  ${it.horizonte.padEnd(16)}  ${String(it.impacto_estimado).padStart(7)}€  ${it.titulo.slice(0,40)}`)
  }

  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('opportunity_snapshots').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S5 delete: ${delErr.message}`)

    const { data: snapData, error: snapErr } = await sb
      .from('opportunity_snapshots').insert(oppSnap).select('id').single()
    if (snapErr) throw new Error(`S5 snapshot: ${snapErr.message}`)

    const itemsConSnap = oppItems.map(it => ({
      ...it,
      snapshot_id:    snapData.id,
      restaurante_id: DEMO_ID,
    }))
    const { error: itemsErr } = await sb.from('opportunity_items').insert(itemsConSnap)
    if (itemsErr) throw new Error(`S5 items: ${itemsErr.message}`)
    console.log(`\n   ✓ 1 snapshot + ${oppItems.length} oportunidades`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S6: consultor_propuestas (5)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S6] consultor_propuestas — 5 propuestas...')

  const propuestasRows = [
    {
      restaurante_id:    DEMO_ID,
      titulo:            'Incorporar Manzanilla La Gitana en carta por copa',
      vino:              'Manzanilla La Gitana',
      tipo:              'Generoso',
      zona:              'Manzanilla de Sanlúcar DO',
      proveedor_sugerido:'Grupo Estévez / Hirart',
      coste_estimado:    3.20,
      precio_recomendado: 3.80,
      margen_objetivo:   68,
      plato_objetivo:    'Tortillitas de camarones, ortiguillas, coquinas',
      motivo:            'La manzanilla es el maridaje canónico del marisco gaditano. Alta rotación en barra, margen por copa superior al blanco tranquilo.',
      prioridad:         'alta',
      estado:            'propuesta',
    },
    {
      restaurante_id:    DEMO_ID,
      titulo:            'Añadir Albariño Pazo de Señorans para platos de lujo',
      vino:              'Pazo de Señorans Albariño',
      tipo:              'Blanco',
      zona:              'Rías Baixas DO',
      proveedor_sugerido:'Ferré i Catasús o distribución directa bodega',
      coste_estimado:    7.50,
      precio_recomendado: 26,
      margen_objetivo:   63,
      plato_objetivo:    'Gamba blanca de Huelva, atún rojo, lubina a la sal',
      motivo:            'Necesario para maridaje de referencias premium. El cliente de alto ticket busca blanco atlántico de gama alta.',
      prioridad:         'alta',
      estado:            'interesa',
    },
    {
      restaurante_id:    DEMO_ID,
      titulo:            'Sustituir tinto genérico por Mencía de Bierzo',
      vino:              'Pago de Valdoneje Mencía Joven',
      tipo:              'Tinto',
      zona:              'Bierzo DO',
      proveedor_sugerido:'Freixenet Mionetto o González Byass distribución',
      coste_estimado:    4.80,
      precio_recomendado: 18,
      margen_objetivo:   65,
      plato_objetivo:    'Carrillera al vino de Jerez, presa ibérica',
      motivo:            'La Mencía tiene tanino bajo y buena acidez: funciona en mesa mixta pescado+carne sin imponer estructura. Diferenciador frente a Rioja habitual.',
      prioridad:         'media',
      estado:            'propuesta',
    },
    {
      restaurante_id:    DEMO_ID,
      titulo:            'Incorporar Cava Brut Nature para aperitivo y adobos',
      vino:              'Juvé & Camps Brut Nature',
      tipo:              'Espumoso',
      zona:              'Cava DO',
      proveedor_sugerido:'Juvé & Camps distribución nacional',
      coste_estimado:    5.20,
      precio_recomendado: 22,
      margen_objetivo:   64,
      plato_objetivo:    'Ceviche de corvina, boquerones en adobo, tortillitas',
      motivo:            'El cava brut nature limpia los adobos y fritos. Actualmente no hay espumoso en carta; opción de aperitivo para grupos.',
      prioridad:         'media',
      estado:            'propuesta',
    },
    {
      restaurante_id:    DEMO_ID,
      titulo:            'Añadir Pedro Ximénez para postres y tabla ibérica',
      vino:              'Pedro Ximénez Toro Albalá Don PX',
      tipo:              'Dulce',
      zona:              'Montilla-Moriles DO',
      proveedor_sugerido:'Bodegas Toro Albalá / distribuidores locales Córdoba',
      coste_estimado:    6.80,
      precio_recomendado: 4.50,
      margen_objetivo:   70,
      plato_objetivo:    'Tabla de jamón ibérico, tabla de quesos andaluces',
      motivo:            'El PX sobre jamón ibérico es combinación clásica andaluza. Margen muy alto por ml y experiencia diferenciadora.',
      prioridad:         'baja',
      estado:            'descartada',
    },
  ]

  console.log('\n  prioridad  estado      titulo')
  console.log('  ' + '─'.repeat(68))
  for (const p of propuestasRows) {
    console.log(`  ${p.prioridad.padEnd(9)}  ${p.estado.padEnd(10)}  ${p.titulo.slice(0,50)}`)
  }

  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('consultor_propuestas').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S6 delete: ${delErr.message}`)
    const { error: insErr } = await sb.from('consultor_propuestas').insert(propuestasRows)
    if (insErr) throw new Error(`S6 insert: ${insErr.message}`)
    console.log(`\n   ✓ ${propuestasRows.length} propuestas insertadas`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S7: cabecera_compras — corregir proveedor genérico 'Proveedor Demo SA'
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S7] cabecera_compras — corregir proveedor genérico...')

  const { data: cabs } = await sb
    .from('cabecera_compras')
    .select('id, fecha, proveedor')
    .eq('restaurante_id', DEMO_ID)
    .ilike('proveedor', 'Proveedor Demo%')

  if (!cabs || cabs.length === 0) {
    console.log('  Sin cabeceras con proveedor genérico. Omitido.')
  } else {
    const cabIds = cabs.map(c => c.id)
    const { data: lineas } = await sb
      .from('lineas_compra')
      .select('cabecera_id, vino_id')
      .in('cabecera_id', cabIds)

    const vinoIds = [...new Set((lineas||[]).map(l => l.vino_id).filter(Boolean))]
    const { data: vinosProv } = vinoIds.length
      ? await sb.from('vinos').select('id, proveedor').in('id', vinoIds)
      : { data: [] }
    const vinoProvMap = Object.fromEntries((vinosProv||[]).map(v => [v.id, v.proveedor]))

    // Votar proveedor mayoritario por cabecera
    const cabVotos = {}
    for (const l of lineas||[]) {
      const prov = vinoProvMap[l.vino_id]
      if (!prov) continue
      if (!cabVotos[l.cabecera_id]) cabVotos[l.cabecera_id] = {}
      cabVotos[l.cabecera_id][prov] = (cabVotos[l.cabecera_id][prov] || 0) + 1
    }

    const updates = cabs.map(cab => ({
      id:   cab.id,
      fecha: cab.fecha,
      old:  cab.proveedor,
      new:  Object.entries(cabVotos[cab.id] || {}).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Sin proveedor asignado',
    }))

    console.log('\n  id_parcial   fecha       antiguo → nuevo')
    console.log('  ' + '─'.repeat(66))
    for (const u of updates) {
      console.log(`  …${u.id.slice(-8)}   ${(u.fecha||'').slice(0,10)}   "${u.old}" → "${u.new}"`)
    }

    if (!DRY_RUN) {
      for (const u of updates) {
        const { error } = await sb.from('cabecera_compras').update({ proveedor: u.new }).eq('id', u.id).eq('restaurante_id', DEMO_ID)
        if (error) throw new Error(`S7 cab ${u.id}: ${error.message}`)
      }
      console.log(`\n   ✓ ${updates.length} cabeceras actualizadas`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Resumen final
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(62))
  console.log(DRY_RUN ? 'DRY-RUN — RESUMEN (nada escrito en BD)' : 'CONFIRM — RESUMEN DE CAMBIOS APLICADOS')
  console.log('═'.repeat(62))
  console.log(`  S0  restaurante: slug=casa-marisma, colores marinos, carta_publica=true`)
  console.log(`  S1  platos: ${PLATOS.length} en ${cats.length} categorías (${Math.min(...PLATOS.map(p=>p.precio))}–${Math.max(...PLATOS.map(p=>p.precio))}€)`)
  console.log(`  S2  perfiles vino: ${vinosSinPerfil.length} generados / ${todosVinos.length} total activos`)
  console.log(`  S3  simulador: ${vinosActual.length} actual + ${vinoFuera ? 1 : 0} fuera + ${catList.length} nuevo (catálogo)`)
  console.log(`  S4  inventario: 3 snapshots × ${vinosS.length} refs (Jun/Ago/Sep 2026)`)
  console.log(`  S5  oportunidades: ${oppItems.length} items · ${oppSnap.recuperacion_anual_estimada}€ impacto estimado`)
  console.log(`  S6  propuestas consultor: ${propuestasRows.length} (alta×${propuestasRows.filter(p=>p.prioridad==='alta').length}, media×${propuestasRows.filter(p=>p.prioridad==='media').length}, baja×${propuestasRows.filter(p=>p.prioridad==='baja').length})`)
  console.log(`\n  ${DRY_RUN
    ? 'Para aplicar:\n  node --env-file=.env.local scripts/seed-demo-fase2.mjs --confirm --nombre "Casa Marisma"'
    : '✓ Completado. Verifica en dashboard: platos, simulador, inventario, oportunidades.'}`)
}

main().catch(err => {
  console.error('\nERROR:', err.message)
  process.exit(1)
})
