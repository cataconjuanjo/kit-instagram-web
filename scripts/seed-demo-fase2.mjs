#!/usr/bin/env node
/**
 * seed-demo-fase2.mjs — Fase 2 (v2)
 * Casa Marisma: platos, perfiles de vino (sin marcadores), simulador con lógica
 * de margen, snapshots, oportunidades con fórmula, propuestas con catálogo y
 * análisis de onboarding + maridaje.
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

// Genera notas de cata profesionales SIN marcadores de perfil.
// El motor de maridaje (maridajeEngine.js + wineProfileTags.js) infiere los
// perfiles directamente desde las palabras clave del texto libre:
//   "alta acidez" → alta_acidez | "salino", "mineral", "marino" → mineral_salino
//   "almendra", "avellana", "nuez" → oxidativo | "tanino firme/marcado" → tanino_medio_alto
//   "tanino amable/suave/redondo" → tanino_bajo | "con cuerpo" → con_cuerpo
//   "ligero", "delicado" → cuerpo_ligero | "brioche", "pan tostado" → lias_autolisis
//   "fino", "manzanilla" (en nombre/región) → perfil genero seco en estimarPerfil
function generarNotasCata(tipo, uva, region, nombre) {
  const t   = (tipo   || '').toLowerCase()
  const u   = (uva    || '').toLowerCase()
  const r   = (region || '').toLowerCase()
  const n   = (nombre || '').toLowerCase()
  const all = [n, u, r].join(' ')

  if (t === 'generoso' || /manzanilla|fino|amontillado|oloroso|palo cortado/.test(all)) {
    if (/manzanilla/.test(all))
      return 'Manzanilla de crianza biológica bajo flor en Sanlúcar. Vivo, salino y mineral, con toque marino y yodado. Alta acidez y carácter salino persistente. Notas de almendra fresca, manzanilla camomila y avellana verde. Seco, ligero y muy largo.'
    if (/amontillado/.test(all))
      return 'Amontillado con crianza mixta biológica y oxidativa. Con cuerpo y alcohol alto. Notas de avellana tostada, nuez y caramelo. Sabroso y persistente. Seco con gran complejidad.'
    if (/oloroso/.test(all))
      return 'Oloroso con crianza oxidativa compleja y prolongada. Con cuerpo y alcohol alto, untuoso. Notas de nuez y frutos secos tostados, fruta seca y ligero toffee. Seco, largo y muy sabroso.'
    return 'Fino con crianza biológica bajo flor en Jerez. Alta acidez y salinidad marcada, mineral. Ligero y delicado, con notas de almendra fresca y avellana. Seco, alcohol alto y fin nítido.'
  }

  if (t === 'dulce' || /pedro ximenez|moscatel/.test(all)) {
    if (/pedro ximenez|px/.test(all))
      return 'Pedro Ximénez de crianza oxidativa lenta. Dulce y untuoso, con notas de uva pasa, fruta seca y cocida, caramelo, toffee y fruta confitada. Con cuerpo, concentrado y persistente.'
    return 'Moscatel dulce, floral y exuberante. Notas de fruta tropical, lichi, flores blancas y miel. Alta acidez que equilibra el dulzor. Ligero y expresivo.'
  }

  if (t === 'espumoso' || /cava|espumoso/.test(t)) {
    return 'Espumoso con crianza sobre lías. Burbuja fina y persistente, alta acidez vibrante. Fruta verde de manzana y pera, fruta cítrica de lima. Notas de brioche y pan tostado por la autolisis. Seco y tenso.'
  }

  if (t === 'rosado') {
    return 'Rosado fresco y vibrante, alta acidez limpia. Fruta roja fresca de fresa, frambuesa y cereza roja. Ligero, seco, con final limpio y muy fácil de beber.'
  }

  if (t === 'tinto') {
    if (/priorat/.test(r))
      return 'Tinto del Priorat concentrado. Con cuerpo amplio y tanino potente y marcado. Fruta negra de zarzamora y ciruela negra. Especiado con pimienta y regaliz, roble integrado. Alcohol alto y muy largo.'
    if (/ribera del duero/.test(r) && /crianza|reserva/.test(n))
      return 'Tinto de Ribera del Duero con crianza en roble. Fruta negra de cereza negra y ciruela. Tanino firme y marcado, con cuerpo. Barrica de cedro, café y vainilla bien integrada. Largo y elegante.'
    if (/rioja/.test(r) && /crianza|reserva/.test(n))
      return 'Tinto riojano con crianza en barrica americana. Fruta roja madura, notas de vainilla, roble y tostado. Tanino amable y redondo, con cuerpo medio. Largo, equilibrado y classic.'
    if (/crianza|reserva|gran reserva/.test(n))
      return 'Tinto con crianza en barrica. Fruta negra de madurez media, tanino firme. Con cuerpo, notas de roble, especiado y ligero ahumado. Persistente y bien estructurado.'
    if (/garnacha/.test(u))
      return 'Garnacha de carácter frutal y fresco. Fruta roja de fresa y cereza roja. Tanino amable y bajo, alta acidez natural. Ligero y jovial, sin paso por madera. Muy bebible.'
    if (/mencia/.test(u) || /bierzo/.test(r))
      return 'Mencía de Bierzo fresco y mineral, alta acidez vibrante. Fruta roja y floral, tanino amable y sedoso. Ligero, con carácter cítrico y notas de hierbas frescas.'
    return 'Tinto joven de carácter frutal. Fruta roja de fresa y frambuesa. Tanino amable y bajo, perfil fresco sin paso por madera. Ligero y afrutado, fácil de beber.'
  }

  if (t === 'blanco') {
    if (/albarino/.test(u) || /rias baixas/.test(r))
      return 'Albariño de Rías Baixas con alta acidez vibrante. Fruta cítrica de lima, limón y pomelo, con toque de melocotón. Mineral y salino, frescura oceánica. Ligero, seco y largo. Fin muy sabroso.'
    if (/txakoli|txakolina/.test(all))
      return 'Txakolina con altísima acidez y vibrante salinidad. Fruta cítrica de lima y fruta verde de pera. Mineral y marino. Baja graduación de alcohol. Ligero, seco y muy refrescante.'
    if (/verdejo/.test(u) || /rueda/.test(r))
      return 'Verdejo de Rueda con alta acidez y perfil herbáceo fresco. Fruta verde de manzana y pera, notas de hierba fresca y matices cítricos de lima. Ligero y seco, final amargo agradable.'
    if (/chardonnay/.test(u) && (/crianza|barrica|reserva/).test(n))
      return 'Chardonnay con crianza en roble. Fruta de hueso de melocotón y albaricoque. Notas de mantequilla y nata por la maloláctica. Con cuerpo, seco y persistente.'
    if (/chardonnay/.test(u))
      return 'Chardonnay fresco y afrutado, alta acidez. Fruta de hueso de melocotón y fruta tropical. Cuerpo medio y equilibrio fruta-acidez. Seco y fácil de beber.'
    if (/palomino/.test(u) || /jerez/.test(r))
      return 'Palomino seco de Jerez. Fruta cítrica de lima con hierba fresca. Alta acidez, mineral y ligero. Seco, cuerpo ligero, carácter atlántico y sabroso.'
    return 'Blanco fresco con alta acidez vibrante. Fruta cítrica de lima y pomelo, mineral y salino. Ligero, seco y refrescante, con notas de fruta verde de manzana.'
  }

  return 'Vino seco con buena acidez y fruta fresca. Equilibrado y de fácil disfrute.'
}

// ── 36 platos de Casa Marisma (32 principales + 4 postres) ───────────────────
const PLATOS = [
  // Entrantes fríos (5)
  { nombre: 'Salmorejo cordobés con jamón ibérico y huevo de codorniz',       descripcion: 'Salmorejo tradicional de Córdoba con guarnición de jamón ibérico y huevo de codorniz pochado',                         categoria: 'Entrantes fríos',     precio: 10 },
  { nombre: 'Gazpacho de tomate con langostino y pepino',                      descripcion: 'Gazpacho andaluz clásico servido frío con langostino salteado y pepino crujiente',                                        categoria: 'Entrantes fríos',     precio: 11 },
  { nombre: 'Ensalada de pulpo con patata y pimentón de la Vera',              descripcion: 'Pulpo cocido laminado sobre base de patata tibia con vinagreta de pimentón ahumado y cebolla roja',                       categoria: 'Entrantes fríos',     precio: 16 },
  { nombre: 'Anchoas del Cantábrico con pan con tomate',                       descripcion: 'Anchoas en salazón artesanal sobre tostadas con tomate restregado y aceite de oliva virgen extra',                        categoria: 'Entrantes fríos',     precio: 14 },
  { nombre: 'Ceviche de corvina con leche de tigre al fino',                   descripcion: 'Corvina marinada en leche de tigre con notas de fino de Jerez, aguacate, cilantro y puntilla de chili',                  categoria: 'Entrantes fríos',     precio: 16 },
  // Entrantes calientes (7)
  { nombre: 'Tortillitas de camarones estilo Cádiz',                           descripcion: 'Tortillitas crujientes de camarones de la bahía gaditana con masa ligera y reborde de perejil fresco',                   categoria: 'Entrantes calientes', precio: 12 },
  { nombre: 'Croquetas de choco en su tinta (6 unidades)',                     descripcion: 'Croquetas artesanas de choco en su tinta con bechamel cremosa y pan rallado crujiente',                                  categoria: 'Entrantes calientes', precio: 12 },
  { nombre: 'Boquerones en adobo gaditano con limón',                          descripcion: 'Boquerones macerados en adobo de vinagre, ajo y especias, fritos en aceite de oliva virgen extra',                       categoria: 'Entrantes calientes', precio: 11 },
  { nombre: 'Ortiguillas de mar rebozadas con mayonesa de lima',               descripcion: 'Anémonas de mar rebozadas en tempura ligera con mayonesa casera de lima y cilantro',                                     categoria: 'Entrantes calientes', precio: 14 },
  { nombre: 'Gambas al pil-pil con guindilla y ajo',                           descripcion: 'Gambas salteadas en aceite de oliva con ajo laminado, guindilla y pimentón dulce al momento',                            categoria: 'Entrantes calientes', precio: 18 },
  { nombre: 'Chipirón a la plancha con ali-oli de ajo negro',                  descripcion: 'Chipirones enteros a la plancha con ali-oli cremoso de ajo negro fermentado y sal en escamas',                           categoria: 'Entrantes calientes', precio: 16 },
  { nombre: 'Pulpo a la brasa con cachelos y pimentón',                        descripcion: 'Tentáculo de pulpo a la brasa sobre cama de patata gallega cocida, pimentón de la Vera y aceite virgen extra',           categoria: 'Entrantes calientes', precio: 22 },
  // Del mar (9)
  { nombre: 'Lubina a la sal con verduras de temporada',                       descripcion: 'Lubina entera cocida en costra de sal gruesa, abierta en mesa, con verduras asadas al tomillo',                          categoria: 'Del mar',             precio: 28 },
  { nombre: 'Atún rojo de almadraba a la plancha (160g)',                      descripcion: 'Medallón de atún rojo de almadraba marcado en plancha de piedra con salsa de soja y jengibre',                           categoria: 'Del mar',             precio: 32 },
  { nombre: 'Gamba blanca de Huelva a la plancha',                             descripcion: 'Gambas blancas de Huelva a la plancha con sal marina de la marisma y limón confitado',                                   categoria: 'Del mar',             precio: 36 },
  { nombre: 'Rape a la plancha con patatas a lo pobre y pimentón',             descripcion: 'Lomo de rape a la plancha sobre cama de patatas confitadas con cebolla, pimiento verde y pimentón',                      categoria: 'Del mar',             precio: 26 },
  { nombre: 'Dorada con ajoblanco y uva moscatel',                             descripcion: 'Dorada al horno con salsa fría de ajoblanco malagueño, uva moscatel y aceite de almendra',                               categoria: 'Del mar',             precio: 24 },
  { nombre: 'Calamar de potera a la plancha con salsa de su tinta',            descripcion: 'Calamar entero a la plancha con reducción de su tinta, aceite de oliva y flor de sal',                                   categoria: 'Del mar',             precio: 22 },
  { nombre: 'Almejas a la marinera con manzanilla de Sanlúcar',                descripcion: 'Almejas de carril abiertas al vapor en salsa marinera de manzanilla, ajo, tomate y perejil',                             categoria: 'Del mar',             precio: 22 },
  { nombre: 'Urta a la roteña con tomate y pimiento',                          descripcion: 'Urta al horno a la roteña con salsa de tomate, pimiento rojo asado y cebolla caramelizada',                              categoria: 'Del mar',             precio: 26 },
  { nombre: 'Mero en salsa verde con almejas',                                 descripcion: 'Medallón de mero en salsa verde de perejil, ajo y vino blanco con almejas y guisantes',                                  categoria: 'Del mar',             precio: 28 },
  // Arroces (4)
  { nombre: 'Arroz caldoso de mariscos',                                       descripcion: 'Arroz caldoso con gamba blanca, mejillón, almeja, calamar y cigala en caldo concentrado de mariscos',                    categoria: 'Arroces',             precio: 22 },
  { nombre: 'Arroz meloso de bogavante',                                       descripcion: 'Arroz meloso con bogavante vivo, azafrán de La Mancha y sofrito de tomate y ñora',                                       categoria: 'Arroces',             precio: 38 },
  { nombre: 'Fideuá marinera con alioli casero',                               descripcion: 'Fideos finos con sepia, gamba, mejillón y toque de pimentón servidos con alioli casero',                                  categoria: 'Arroces',             precio: 20 },
  { nombre: 'Arroz negro con sepia y ali-oli de ajo asado',                    descripcion: 'Arroz negro meloso con sepia en su tinta, caldo casero de mariscos y ali-oli de ajo asado al horno',                     categoria: 'Arroces',             precio: 22 },
  // De la tierra (4)
  { nombre: 'Presa ibérica a la brasa con chimichurri de hierbas',             descripcion: 'Presa de cerdo ibérico bellota a la brasa al punto rosado con chimichurri de perejil, orégano y ajo',                   categoria: 'De la tierra',        precio: 22 },
  { nombre: 'Carrillera de ternera al vino de Jerez con puré trufado',         descripcion: 'Carrillera braseada durante 5 horas en vino de Jerez oloroso con puré de patata al aceite de trufa',                    categoria: 'De la tierra',        precio: 20 },
  { nombre: 'Secreto ibérico con patatas fritas y pimientos de padrón',        descripcion: 'Secreto de cerdo ibérico a la brasa con patatas fritas en aceite de oliva y pimientos de padrón',                        categoria: 'De la tierra',        precio: 22 },
  { nombre: 'Costilla de cerdo lacada con miel, mostaza y cerveza negra',      descripcion: 'Costilla de cerdo adobada y cocinada a baja temperatura, lacada con reducción de miel, mostaza y cerveza',               categoria: 'De la tierra',        precio: 18 },
  // Tablas (3)
  { nombre: 'Tabla de jamón ibérico de bellota (80g)',                         descripcion: 'Jamón ibérico de bellota cortado a cuchillo, presentado en tabla de madera con pan de cristal tostado',                 categoria: 'Tablas',              precio: 22 },
  { nombre: 'Tabla de quesos andaluces con membrillo y nueces',                descripcion: 'Selección de quesos artesanos de Andalucía: queso de cabra, semicurado y curado con membrillo casero',                  categoria: 'Tablas',              precio: 16 },
  { nombre: 'Tabla ibérica mixta (jamón, chorizo, lomo y salchichón)',         descripcion: 'Selección de embutidos ibéricos de bellota cortados a máquina con regañás de aceite de oliva',                          categoria: 'Tablas',              precio: 18 },
  // Postres (4) — incluidos desde el brief de Fase 2
  { nombre: 'Tarta de queso de La Viña al horno',                              descripcion: 'Tarta de queso tipo San Sebastián, cremosa y semi-cuajada, sobre base de galleta y coulis de frutos rojos',             categoria: 'Postres',             precio: 9  },
  { nombre: 'Torrijas con helado de vainilla y miel de caña',                  descripcion: 'Torrijas de pan brioche empapadas en leche y canela, fritas en aceite, con helado de vainilla y miel de caña de azúcar', categoria: 'Postres',             precio: 8  },
  { nombre: 'Tocino de cielo artesano con nata montada',                       descripcion: 'Tocino de cielo de receta tradicional gaditana, elaborado con yemas y almíbar, acompañado de nata montada',             categoria: 'Postres',             precio: 7  },
  { nombre: 'Piononos de Santa Fe',                                            descripcion: 'Pastelillos granadinos de bizcocho empapado en almíbar, enrollado y cubierto de crema tostada. Especialidad andaluza',    categoria: 'Postres',             precio: 8  },
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
  console.log(`\n${mode} seed-demo-fase2 v2  DEMO_ID=${DEMO_ID}  restaurante="${dbName}"\n`)

  // ── Query única de vinos (todas las secciones la usan) ───────────────────
  const { data: vinos, error: vinosErr } = await sb
    .from('vinos')
    .select('id, nombre, tipo, uva, region, notas_cata, bodega, proveedor, catalogo_vino_id, stock, stock_minimo, coste_compra, coste_medio_pmp, precio_botella, precio_copa, activo')
    .eq('restaurante_id', DEMO_ID)
    .eq('activo', true)
  if (vinosErr) throw new Error(`vinos: ${vinosErr.message}`)
  const todosVinos = vinos || []

  // Métricas derivadas (usadas en S3, S5, S6, onboarding)
  const vinosConMargenCalc = todosVinos
    .filter(v => Number(v.precio_botella) > 0 && Number(v.coste_compra) > 0)
    .map(v => {
      const pvpNeto = Number(v.precio_botella) / 1.1
      const coste   = Number(v.coste_compra)
      return { ...v, _margen: (pvpNeto - coste) / pvpNeto * 100 }
    })
    .sort((a, b) => a._margen - b._margen)  // ascending → lowest margin first

  const vinosSinPerfil   = todosVinos.filter(v => !v.notas_cata || v.notas_cata.length < 12)
  const vinosConPrecio   = todosVinos.filter(v => Number(v.precio_botella) > 0)
  const vinosBajoMargen  = vinosConMargenCalc.filter(v => v._margen < 60)
  const vinosConStock    = todosVinos.filter(v => Number(v.stock) > 0)
  const vinosSinCoste    = todosVinos.filter(v => !Number(v.coste_compra))
  const vinosSinProveedor = todosVinos.filter(v => !v.proveedor)
  const vinosBajoMinimo  = todosVinos.filter(v => Number(v.stock_minimo) > 0 && Number(v.stock) <= Number(v.stock_minimo))

  const tieneGeneroso   = todosVinos.some(v => v.tipo === 'generoso')
  const tieneEspumoso   = todosVinos.some(v => v.tipo === 'espumoso')
  const tieneDulce      = todosVinos.some(v => v.tipo === 'dulce')
  const tieneRosado     = todosVinos.some(v => v.tipo === 'rosado')
  const huecosCarta     = [!tieneGeneroso && 'generoso', !tieneEspumoso && 'espumoso', !tieneDulce && 'dulce', !tieneRosado && 'rosado'].filter(Boolean)

  const provMap = {}
  for (const v of todosVinos) if (v.proveedor) provMap[v.proveedor] = (provMap[v.proveedor] || 0) + 1
  const provSort   = Object.entries(provMap).sort((a,b)=>b[1]-a[1])
  const provPrinc  = provSort[0]?.[0] || null
  const provPrincPct = provSort[0] ? Math.round(provSort[0][1] / todosVinos.length * 100) : 0

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
  console.log('\n[S1] Platos — 36 platos (5 Entrantes fríos + 7 Ent. calientes + 9 Del mar + 4 Arroces + 4 De la tierra + 3 Tablas + 4 Postres)...')

  const platoRows = PLATOS.map(p => ({
    restaurante_id: DEMO_ID, nombre: p.nombre, descripcion: p.descripcion,
    categoria: p.categoria, precio: p.precio, activo: true,
  }))

  const cats = [...new Set(PLATOS.map(p => p.categoria))]
  console.log('\n  categoria                    n  precio_rango')
  console.log('  ' + '─'.repeat(45))
  for (const c of cats) {
    const ps  = PLATOS.filter(p => p.categoria === c)
    const min = Math.min(...ps.map(p => p.precio))
    const max = Math.max(...ps.map(p => p.precio))
    console.log(`  ${c.padEnd(28)} ${String(ps.length).padStart(2)}  ${min}–${max}€`)
  }
  console.log(`  ${'─'.repeat(45)}\n  ${'TOTAL'.padEnd(30)} ${PLATOS.length}`)

  if (!DRY_RUN) {
    const { error: delErr } = await sb.from('platos').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S1 delete: ${delErr.message}`)
    const { error: insErr } = await sb.from('platos').insert(platoRows)
    if (insErr) throw new Error(`S1 insert: ${insErr.message}`)
    console.log(`\n   ✓ ${platoRows.length} platos insertados`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S2: Perfiles de vino — sin marcadores en notas_cata
  // Prioridad: 1) catálogo real (proveedor_catalogo_vinos.notas)
  //            2) generado con generarNotasCata() (marcado como ficticio)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S2] Perfiles de vino (sin marcadores, texto natural)...')

  // Obtener notas del catálogo para vinos vinculados
  const catIds = [...new Set(todosVinos.map(v => v.catalogo_vino_id).filter(Boolean))]
  const { data: catNotasRows } = catIds.length
    ? await sb.from('proveedor_catalogo_vinos').select('id, notas').in('id', catIds)
    : { data: [] }
  const catNotasMap = Object.fromEntries((catNotasRows || []).filter(r => r.notas && r.notas.length >= 12).map(r => [r.id, r.notas]))

  const vinosSinPerfilTotal = vinosSinPerfil
  const updates2 = []
  let realCount = 0
  let ficticioCount = 0

  console.log(`\n  Total vinos activos: ${todosVinos.length}`)
  console.log(`  Con perfil existente (≥12 chars): ${todosVinos.length - vinosSinPerfilTotal.length}`)
  console.log(`  Sin perfil → a actualizar:        ${vinosSinPerfilTotal.length}`)

  if (vinosSinPerfilTotal.length > 0) {
    console.log('\n  ' + 'nombre'.padEnd(36) + 'tipo'.padEnd(10) + 'fuente    perfiles_esperados')
    console.log('  ' + '─'.repeat(88))
    for (const v of vinosSinPerfilTotal) {
      const catalogNota = v.catalogo_vino_id ? catNotasMap[v.catalogo_vino_id] : null
      const notas       = catalogNota || generarNotasCata(v.tipo, v.uva, v.region, v.nombre)
      const fuente      = catalogNota ? 'catálogo' : 'ficticio'
      if (catalogNota) realCount++; else ficticioCount++
      // Estimate expected tags from keywords in the text
      const tags = []
      const nt = notas.toLowerCase()
      if (/alta acidez/.test(nt))      tags.push('alta_acidez')
      if (/salino|mineral|marino|yodado/.test(nt)) tags.push('mineral_salino')
      if (/almendra|avellana|nuez/.test(nt)) tags.push('oxidativo')
      if (/tanino amable|tanino suave|tanino redondo|sedoso/.test(nt)) tags.push('tanino_bajo')
      if (/tanino firme|tanino marcado|astringente|potente/.test(nt)) tags.push('tanino_medio_alto')
      if (/con cuerpo|corpulento/.test(nt)) tags.push('con_cuerpo')
      if (/ligero|delicado/.test(nt))   tags.push('cuerpo_ligero')
      if (/brioche|pan tostado/.test(nt)) tags.push('lias_autolisis')
      if (/mantequilla|nata/.test(nt))  tags.push('malolactica')
      if (/fruta cítrica|lima|limón|pomelo/.test(nt)) tags.push('fruta_citrica')
      if (/fruta roja|fresa|frambuesa|cereza roja/.test(nt)) tags.push('fruta_roja')
      if (/fruta negra|zarzamora|ciruela negra/.test(nt)) tags.push('fruta_negra')
      if (/roble|barrica|vainilla/.test(nt)) tags.push('roble')
      console.log('  ' + (v.nombre||'').slice(0,35).padEnd(36) + (v.tipo||'—').slice(0,9).padEnd(10) + fuente.padEnd(10) + tags.slice(0,4).join(','))
      updates2.push({ id: v.id, notas_cata: notas })
    }
    console.log(`\n  Fuente real (catálogo): ${realCount}  Ficticio (generado): ${ficticioCount}`)
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
  // • fuera:  el vino con menor margen bruto (candidato a sustitución)
  // • nuevo:  vino del catálogo del mismo tipo que el fuera
  // • actual: el resto de los vinos de la carta
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S3] carta_simulacion (lógica de margen para selección)...')

  const vinoFuera   = vinosConMargenCalc.length > 0 ? vinosConMargenCalc[0] : null  // menor margen
  const vinosActual = vinoFuera ? todosVinos.filter(v => v.id !== vinoFuera.id).slice(0, 14) : todosVinos.slice(0, 14)

  // Buscar vino del catálogo del mismo tipo que el fuera para proponer como sustituto
  const tipoFuera = vinoFuera?.tipo || 'blanco'
  const { data: catVinos1 } = await sb.from('proveedor_catalogo_vinos')
    .select('id, nombre, bodega, tipo, region, anada, precio_pvp_botella, precio_pvp_copa, coste_neto')
    .eq('activo', true).eq('tipo', tipoFuera).limit(2)
  const { data: catVinosAny } = (!catVinos1?.length)
    ? await sb.from('proveedor_catalogo_vinos').select('id, nombre, bodega, tipo, region, anada, precio_pvp_botella, precio_pvp_copa, coste_neto').eq('activo', true).limit(2)
    : { data: [] }
  const catList = catVinos1?.length ? catVinos1 : (catVinosAny || [])

  if (vinoFuera) {
    const m = margenPct(Number(vinoFuera.precio_botella), Number(vinoFuera.coste_compra))
    console.log(`\n  fuera:  ${vinoFuera.nombre} (margen ${m !== null ? m + '%' : 'sin precio'}, menor de la carta)`)
  }
  console.log(`  actual: ${vinosActual.length} vinos`)
  console.log(`  nuevo:  ${catList.length} del catálogo (tipo=${tipoFuera})`)
  showTable('catálogo nuevo', catList.map(c => ({ nombre: c.nombre, tipo: c.tipo, pvp: c.precio_pvp_botella })))

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

    const simActualRows = vinosActual.map(v => ({
      restaurante_id: DEMO_ID, vino_id: v.id, nombre: v.nombre || 'Sin nombre',
      tipo: v.tipo || null, region: v.region || null, precio_botella: v.precio_botella || null,
      coste_compra: v.coste_compra || null, estado: 'actual',
    }))
    if (simActualRows.length > 0) {
      const { error: ae } = await sb.from('carta_simulacion').insert(simActualRows)
      if (ae) throw new Error(`S3 actuals: ${ae.message}`)
    }

    for (let i = 0; i < catList.length; i++) {
      const c = catList[i]
      const { error: ne } = await sb.from('carta_simulacion').insert({
        restaurante_id: DEMO_ID, catalogo_vino_id: c.id,
        nombre: c.nombre || 'Vino nuevo', bodega: c.bodega || null,
        tipo: c.tipo || null, region: c.region || null, anada: c.anada ? String(c.anada) : null,
        precio_botella: c.precio_pvp_botella || null, precio_copa: c.precio_pvp_copa || null,
        coste_compra: c.coste_neto || null, estado: 'nuevo',
        sustituye_a: i === 0 ? fueraId : null,
      })
      if (ne) throw new Error(`S3 nuevo ${c.id}: ${ne.message}`)
    }
    console.log(`\n   ✓ ${vinosActual.length} actual + ${vinoFuera ? 1 : 0} fuera + ${catList.length} nuevo`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S4: inventory_snapshots (Jun, Ago, Sep 2026)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S4] inventory_snapshots — Jun, Ago, Sep 2026...')

  const PERIODOS_INV = [
    { label: 'Jun 2026', inicio: '2026-06-01T00:00:00Z', fin: '2026-06-30T23:59:59Z', stockFx: 1.0,
      estadoFn: (_v, i) => i % 8 === 0 ? 'bajo_minimo' : i % 11 === 0 ? 'lento' : 'normal' },
    { label: 'Ago 2026', inicio: '2026-08-01T00:00:00Z', fin: '2026-08-31T23:59:59Z', stockFx: 0.6,
      estadoFn: (_v, i) => i % 4 === 0 ? 'bajo_minimo' : i % 7 === 0 ? 'inmovilizado' : 'normal' },
    { label: 'Sep 2026', inicio: '2026-09-01T00:00:00Z', fin: '2026-09-30T23:59:59Z', stockFx: 0.8,
      estadoFn: (_v, i) => i % 5 === 0 ? 'inmovilizado' : i % 9 === 0 ? 'exceso' : i % 12 === 0 ? 'bajo_minimo' : 'normal' },
  ]
  const vinosS = todosVinos.slice(0, 30)

  if (!DRY_RUN) {
    const { error: de } = await sb.from('inventory_snapshots').delete().eq('restaurante_id', DEMO_ID)
    if (de) throw new Error(`S4 delete: ${de.message}`)
  }

  let totalInmovilizadosLastSnap = 0
  let totalBajosLastSnap = 0

  console.log('\n  período     refs  unid  coste€  inmov  bajos  exceso')
  console.log('  ' + '─'.repeat(58))

  for (const pd of PERIODOS_INV) {
    const items = vinosS.map((v, i) => {
      const stockBase = Math.max(v.stock || 0, 6)
      const stockAct  = Math.round(stockBase * pd.stockFx)
      const stockMin  = v.stock_minimo || 3
      const coste     = Number(v.coste_medio_pmp || v.coste_compra) || 0
      const pvp       = Number(v.precio_botella) || 0
      const valCoste  = Math.round(stockAct * coste * 100) / 100
      const ventasU   = Math.round(stockBase * 0.4 * pd.stockFx)
      const diasCob   = ventasU > 0 ? Math.round(stockAct / (ventasU / 30)) : null
      const estado    = stockAct < stockMin ? 'bajo_minimo' : pd.estadoFn(v, i)
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
    const totalUnid = items.reduce((s,it)=>s+it.stock_actual,0)
    const totalCoste = items.reduce((s,it)=>s+it.valor_stock_coste,0)
    const totalVenta = items.reduce((s,it)=>s+(it.stock_actual*it.precio_botella),0)
    const inmovilizados = items.filter(it=>it.estado_inventario==='inmovilizado')
    const bajos         = items.filter(it=>it.estado_inventario==='bajo_minimo')
    const excesos       = items.filter(it=>it.estado_inventario==='exceso')
    const lentas        = items.filter(it=>it.estado_inventario==='lento')
    const mermaU        = Math.round(totalUnid * 0.01)

    if (pd.label === 'Sep 2026') {
      totalInmovilizadosLastSnap = inmovilizados.length
      totalBajosLastSnap = bajos.length
    }

    const pMap = {}
    for (const it of items) if (it.proveedor) pMap[it.proveedor]=(pMap[it.proveedor]||0)+1
    const pprinc = Object.entries(pMap).sort((a,b)=>b[1]-a[1])[0]?.[0]||null
    const pPct   = pprinc ? Math.round(pMap[pprinc]/items.length*100) : 0

    console.log(`  ${pd.label.padEnd(11)} ${String(items.length).padStart(4)}  ${String(totalUnid).padStart(4)}  ${String(Math.round(totalCoste)).padStart(6)}  ${String(inmovilizados.length).padStart(5)}  ${String(bajos.length).padStart(5)}  ${String(excesos.length).padStart(6)}`)

    if (!DRY_RUN) {
      const { data: sd, error: se } = await sb.from('inventory_snapshots').insert({
        restaurante_id: DEMO_ID, periodo_inicio: pd.inicio, periodo_fin: pd.fin,
        referencias_activas: items.length, unidades_totales: totalUnid,
        valor_coste_total: Math.round(totalCoste*100)/100,
        valor_venta_total: Math.round(totalVenta*100)/100,
        stock_inmovilizado_refs: inmovilizados.length,
        stock_inmovilizado_valor: Math.round(inmovilizados.reduce((s,it)=>s+it.valor_stock_coste,0)*100)/100,
        referencias_lentas: lentas.length, exceso_stock_refs: excesos.length,
        proveedor_principal: pprinc, proveedor_principal_pct: pPct,
        merma_unidades: mermaU, tasa_merma_pct: totalUnid > 0 ? Math.round(mermaU/totalUnid*10000)/100 : 0,
      }).select('id').single()
      if (se) throw new Error(`S4 snapshot ${pd.label}: ${se.message}`)
      const { error: ie } = await sb.from('inventory_snapshot_items').insert(items.map(it=>({...it,snapshot_id:sd.id})))
      if (ie) throw new Error(`S4 items ${pd.label}: ${ie.message}`)
    }
  }
  if (!DRY_RUN) console.log(`\n   ✓ 3 snapshots + ${vinosS.length * 3} items`)

  // ═══════════════════════════════════════════════════════════════════════════
  // S5: opportunity_snapshot + oportunidades derivadas de datos reales
  // Fórmula de impacto: comentada junto a cada ítem.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S5] opportunity_snapshot — derivado de datos reales de la demo...')

  // Parámetros base para fórmulas
  const COPAS_SEMANA = 15
  const MARGEN_COPA  = 3.0   // €/copa (margen conservador)
  const SEMANAS      = 52
  const adopcionPct  = 0.50  // adopción realista al 50%

  // Fórmula 1: huecos de carta (generoso) → copas potenciales
  // Si no hay generoso: 3 refs × 15 copas/semana × 3€ × 4 semanas × adopción
  const imp1 = !tieneGeneroso
    ? Math.round(3 * COPAS_SEMANA * MARGEN_COPA * 4 * adopcionPct)
    : Math.round(1 * COPAS_SEMANA * MARGEN_COPA * 4 * adopcionPct)  // ampliar gama existente

  // Fórmula 2: margen bajo — diferencia de margen potencial en vinos bajo 60%
  // Supuesto: subir precio en 10% → diferencia anual
  const imp2Vinos = vinosBajoMargen.slice(0, 5)  // top 5 peores
  const imp2 = imp2Vinos.length > 0
    ? Math.round(imp2Vinos.reduce((s, v) => {
        const pvp  = Number(v.precio_botella)
        const mejora = pvp * 0.10  // +10% pvp
        const ventasAno = 24       // uds/año estimado para un vino con bajo giro
        return s + mejora * ventasAno
      }, 0))
    : 520  // fallback

  // Fórmula 3: capital inmovilizado (Sep snapshot: inmovilizados estimados)
  // vinosInmov × stock_medio × coste_medio
  const impCapital = Math.round(totalInmovilizadosLastSnap * 4 * 7.5)  // 4 uds × 7.5€ coste medio

  // Fórmula 4: huecos espumoso → aperitivo
  const imp4 = !tieneEspumoso ? Math.round(8 * 7.0 * 4 * adopcionPct) : 0  // 8 bol/sem × 7€/margen × 4sem × adopción

  // Fórmula 5: concentración proveedor → riesgo negociación
  // Si proveedor principal > 40%: riesgo de €/yr estimado = 3% de ventas de esas referencias
  const imp5 = provPrincPct > 40
    ? Math.round(imp2Vinos.reduce((s,v)=>s+Number(v.precio_botella)*0.03*12,0))
    : 200

  const oppItems = [
    {
      area: 'Carta de vinos',
      titulo: !tieneGeneroso ? 'Incorporar generoso (fino/manzanilla) en carta' : 'Ampliar gama de generosos en carta',
      detalle: !tieneGeneroso
        ? `Sin ningún generoso en la carta actual (${todosVinos.length} vinos). Maridaje natural con mariscos y fritos. 3 referencias (fino, manzanilla, amontillado) a 3.5€/copa capturan demanda directa.`
        : `Solo ${todosVinos.filter(v=>v.tipo==='generoso').length} generoso/s en carta. Ampliar a 3 refs maximiza maridaje y ticket por copa.`,
      accion: 'Añadir Manzanilla La Gitana y Fino Quinta en carta por copa (ver propuesta S6)',
      impacto_estimado: imp1,
      tipo_impacto: 'margen',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 85,
      prioridad: 'alta',
      formula: `${tieneGeneroso ? 1 : 3} refs nuevas × ${COPAS_SEMANA} copas/semana × ${MARGEN_COPA}€ margen/copa × 4 semanas × ${adopcionPct*100}% adopción = ${imp1}€/mes`,
    },
    {
      area: 'Precios',
      titulo: `Revisar PVP en ${vinosBajoMargen.length} vinos con margen < 60%`,
      detalle: `${vinosBajoMargen.length} referencias tienen margen bruto < 60% (sin IVA). Ajuste de +10% en PVP recupera márgenes sin impacto visible para el cliente final.`,
      accion: 'Revisar precios en /dashboard/vinos?filtro=pendientes e incrementar PVP un 10% en las referencias identificadas',
      impacto_estimado: imp2,
      tipo_impacto: 'margen',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 78,
      prioridad: 'alta',
      formula: `${imp2Vinos.length} vinos con margen < 60% × +10% PVP × 24 uds/año estimadas = ${imp2}€/año`,
    },
    {
      area: 'Gestión de stock',
      titulo: `Liberar capital inmovilizado (${totalInmovilizadosLastSnap} refs en Sep)`,
      detalle: `Snapshot de Sep 2026 detecta ${totalInmovilizadosLastSnap} referencias sin rotación en 60+ días. Capital bloqueado estimado: ${Math.round(totalInmovilizadosLastSnap*4*7.5)}€ a coste.`,
      accion: 'Crear menú degustación o copa del día con los vinos inmovilizados; aplicar descuento por volumen para grupos',
      impacto_estimado: impCapital,
      tipo_impacto: 'capital',
      horizonte: 'medio_plazo',
      dificultad: 'media',
      confianza_pct: 72,
      prioridad: 'media',
      formula: `${totalInmovilizadosLastSnap} refs inmovilizadas × 4 uds estimadas × 7.5€ coste medio = ${impCapital}€ a liberar`,
    },
    {
      area: 'Carta de vinos',
      titulo: !tieneEspumoso ? 'Introducir espumoso para aperitivo (hueco de carta)' : 'Ampliar espumoso en carta',
      detalle: !tieneEspumoso
        ? 'Sin ningún espumoso en carta. El cava brut nature funciona como aperitivo y limpia adobos, croquetas y fritos. Canal fácil de margen alto.'
        : 'Ampliar a 2 espumosos mejora la conversión en aperitivos y eventos.',
      accion: 'Incorporar Juvé & Camps Brut Nature o similar por botella y copa',
      impacto_estimado: imp4 || 420,
      tipo_impacto: 'ventas',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 75,
      prioridad: tieneEspumoso ? 'baja' : 'media',
      formula: !tieneEspumoso
        ? `8 botellas/semana × 7€ margen/botella × 4 semanas × ${adopcionPct*100}% adopción = ${imp4||420}€/mes`
        : 'Hueco de carta ya cubierto; margen incremental de ampliar es menor.',
    },
    {
      area: 'Proveedores',
      titulo: `Diversificar proveedor — ${provPrinc||'principal'} al ${provPrincPct}% de la bodega`,
      detalle: provPrincPct > 40
        ? `${provPrinc} aporta el ${provPrincPct}% de las referencias. Alta concentración limita la negociación de descuentos y aumenta el riesgo de desabastecimiento.`
        : `Distribución de proveedores razonablemente diversificada. Optimizar condiciones con los 2 principales.`,
      accion: 'Negociar rappel con proveedor principal; explorar alternativa para al menos 2 referencias de alta rotación',
      impacto_estimado: imp5,
      tipo_impacto: 'riesgo',
      horizonte: 'estrategico',
      dificultad: 'alta',
      confianza_pct: 60,
      prioridad: provPrincPct > 40 ? 'media' : 'baja',
      formula: `3% negociación sobre coste de ${imp2Vinos.length} refs × 12 meses = ${imp5}€/año estimado`,
    },
  ]

  const oppSnap = {
    restaurante_id: DEMO_ID,
    periodo_inicio: '2026-09-01T00:00:00Z', periodo_fin: '2026-09-30T23:59:59Z',
    recuperacion_anual_estimada: oppItems.reduce((s,it)=>s+it.impacto_estimado,0),
    impacto_acciones_rapidas:    oppItems.filter(it=>it.horizonte==='accion_rapida').reduce((s,it)=>s+it.impacto_estimado,0),
    impacto_medio_plazo:         oppItems.filter(it=>it.horizonte==='medio_plazo').reduce((s,it)=>s+it.impacto_estimado,0),
    impacto_estrategico:         oppItems.filter(it=>it.horizonte==='estrategico').reduce((s,it)=>s+it.impacto_estimado,0),
    capital_liberable_estimado:  oppItems.filter(it=>it.tipo_impacto==='capital').reduce((s,it)=>s+it.impacto_estimado,0),
    confianza_media_pct:         Math.round(oppItems.reduce((s,it)=>s+it.confianza_pct,0)/oppItems.length*100)/100,
    oportunidades_total:         oppItems.length,
    resumen:                     `Recuperación estimada anual: ${oppItems.reduce((s,it)=>s+it.impacto_estimado,0)}€. Fórmulas basadas en datos reales de la demo (margen, huecos de carta, inmovilizados).`,
  }

  console.log(`\n  Recuperación estimada (fórmula): ${oppSnap.recuperacion_anual_estimada}€`)
  console.log(`  Huecos de carta detectados: ${huecosCarta.length ? huecosCarta.join(', ') : 'ninguno'}`)
  console.log(`  Vinos bajo margen 60%: ${vinosBajoMargen.length} | Bajos mínimo: ${totalBajosLastSnap} | Inmovilizados Sep: ${totalInmovilizadosLastSnap}`)
  console.log(`  Proveedor principal: ${provPrinc || '—'} (${provPrincPct}%)`)
  console.log('\n  prioridad  horizonte         impacto  titulo')
  console.log('  ' + '─'.repeat(68))
  for (const it of oppItems) {
    console.log(`  ${it.prioridad.padEnd(9)}  ${it.horizonte.padEnd(16)}  ${String(it.impacto_estimado).padStart(7)}€  ${it.titulo.slice(0,40)}`)
  }

  if (!DRY_RUN) {
    const { error: de } = await sb.from('opportunity_snapshots').delete().eq('restaurante_id', DEMO_ID)
    if (de) throw new Error(`S5 delete: ${de.message}`)
    const { data: sd, error: se } = await sb.from('opportunity_snapshots').insert(oppSnap).select('id').single()
    if (se) throw new Error(`S5 snapshot: ${se.message}`)
    const { error: ie } = await sb.from('opportunity_items').insert(oppItems.map(it=>({...it,snapshot_id:sd.id,restaurante_id:DEMO_ID})))
    if (ie) throw new Error(`S5 items: ${ie.message}`)
    console.log(`\n   ✓ 1 snapshot + ${oppItems.length} oportunidades`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S6: consultor_propuestas — con catalogo_vino_id real cuando está disponible
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S6] consultor_propuestas (con catalogo_vino_id del catálogo real)...')

  // Buscar IDs del catálogo para cada tipo propuesto
  async function buscarCatalogoPorTipo(tipo) {
    const { data } = await sb.from('proveedor_catalogo_vinos')
      .select('id, nombre, bodega, tipo, zona_dop')
      .eq('activo', true).eq('tipo', tipo).limit(1)
    return data?.[0] || null
  }
  const [catGenRow, catBlancoRow, catTintoRow, catEspumosoRow, catDulceRow] = await Promise.all([
    buscarCatalogoPorTipo('generoso'),
    buscarCatalogoPorTipo('blanco'),
    buscarCatalogoPorTipo('tinto'),
    buscarCatalogoPorTipo('espumoso'),
    buscarCatalogoPorTipo('dulce'),
  ])

  const propuestasRows = [
    {
      restaurante_id: DEMO_ID,
      titulo:             catGenRow ? `Incorporar ${catGenRow.nombre} (${catGenRow.bodega||''}) en carta` : 'Incorporar Manzanilla en carta por copa',
      vino:               catGenRow?.nombre || 'Manzanilla La Gitana',
      tipo:               'Generoso',
      zona:               catGenRow?.zona_dop || 'Manzanilla de Sanlúcar DO',
      proveedor_sugerido: 'Ver catalogo_vino_id en DB',
      coste_estimado:     3.20, precio_recomendado: 3.80, margen_objetivo: 68,
      plato_objetivo:     'Tortillitas de camarones, ortiguillas, coquinas, gambas al pil-pil',
      motivo:             'La manzanilla es el maridaje canónico del marisco gaditano. Alta rotación en barra, margen por copa superior al blanco tranquilo.',
      prioridad: 'alta', estado: 'propuesta',
    },
    {
      restaurante_id: DEMO_ID,
      titulo:             catBlancoRow ? `Añadir ${catBlancoRow.nombre} para platos de alta gama` : 'Añadir Albariño Pazo de Señorans',
      vino:               catBlancoRow?.nombre || 'Pazo de Señorans Albariño',
      tipo:               'Blanco',
      zona:               catBlancoRow?.zona_dop || 'Rías Baixas DO',
      proveedor_sugerido: 'Ver catalogo_vino_id en DB',
      coste_estimado:     7.50, precio_recomendado: 26, margen_objetivo: 63,
      plato_objetivo:     'Gamba blanca de Huelva, atún rojo, lubina a la sal',
      motivo:             'Blanco atlántico premium para maridaje de referencias de alto ticket. Hay solo 2 blancos atlánticos en carta actual.',
      prioridad: 'alta', estado: 'interesa',
    },
    {
      restaurante_id: DEMO_ID,
      titulo:             catTintoRow ? `Sustituir tinto genérico por ${catTintoRow.nombre}` : 'Sustituir tinto genérico por Mencía de Bierzo',
      vino:               catTintoRow?.nombre || 'Pago de Valdoneje Mencía Joven',
      tipo:               'Tinto',
      zona:               catTintoRow?.zona_dop || 'Bierzo DO',
      proveedor_sugerido: 'Ver catalogo_vino_id en DB',
      coste_estimado:     4.80, precio_recomendado: 18, margen_objetivo: 65,
      plato_objetivo:     'Carrillera de ternera al Jerez, presa ibérica, secreto ibérico',
      motivo:             'Mencía: tanino bajo, acidez alta. No choca con pescado en mesa mixta y funciona con carnes ibéricas. Diferenciador frente a Rioja habitual.',
      prioridad: 'media', estado: 'propuesta',
    },
    {
      restaurante_id: DEMO_ID,
      titulo:             catEspumosoRow ? `Incorporar ${catEspumosoRow.nombre} para aperitivo` : 'Incorporar Cava Brut Nature para aperitivo',
      vino:               catEspumosoRow?.nombre || 'Juvé & Camps Brut Nature',
      tipo:               'Espumoso',
      zona:               catEspumosoRow?.zona_dop || 'Cava DO',
      proveedor_sugerido: 'Ver catalogo_vino_id en DB',
      coste_estimado:     5.20, precio_recomendado: 22, margen_objetivo: 64,
      plato_objetivo:     'Ceviche de corvina, boquerones en adobo, tortillitas',
      motivo:             'El cava brut nature limpia adobos y fritos. Actualmente no hay espumoso en carta — hueco de aperitivo y maridaje con cítricos.',
      prioridad: 'media', estado: 'propuesta',
    },
    {
      restaurante_id: DEMO_ID,
      titulo:             catDulceRow ? `Añadir ${catDulceRow.nombre} para postres y tabla ibérica` : 'Añadir Pedro Ximénez para postres',
      vino:               catDulceRow?.nombre || 'Pedro Ximénez Don PX',
      tipo:               'Dulce',
      zona:               catDulceRow?.zona_dop || 'Montilla-Moriles DO',
      proveedor_sugerido: 'Ver catalogo_vino_id en DB',
      coste_estimado:     6.80, precio_recomendado: 4.50, margen_objetivo: 70,
      plato_objetivo:     'Tabla de jamón ibérico, tabla de quesos, tocino de cielo, piononos',
      motivo:             'PX sobre jamón ibérico y postres: combinación clásica andaluza. Margen muy alto por ml. Diferenciador del restaurante.',
      prioridad: 'baja', estado: 'descartada',
    },
  ]

  // Añadir catalogo_vino_id si encontramos el vino en el catálogo
  if (catGenRow)      propuestasRows[0].catalogo_vino_id = catGenRow.id
  if (catBlancoRow)   propuestasRows[1].catalogo_vino_id = catBlancoRow.id
  if (catTintoRow)    propuestasRows[2].catalogo_vino_id = catTintoRow.id
  if (catEspumosoRow) propuestasRows[3].catalogo_vino_id = catEspumosoRow.id
  if (catDulceRow)    propuestasRows[4].catalogo_vino_id = catDulceRow.id

  console.log('\n  prioridad  estado      cat_id?  titulo')
  console.log('  ' + '─'.repeat(70))
  for (const p of propuestasRows) {
    const catTag = p.catalogo_vino_id ? '✓' : '—'
    console.log(`  ${p.prioridad.padEnd(9)}  ${p.estado.padEnd(10)}  ${catTag.padEnd(7)}  ${p.titulo.slice(0,48)}`)
  }

  if (!DRY_RUN) {
    const { error: de } = await sb.from('consultor_propuestas').delete().eq('restaurante_id', DEMO_ID)
    if (de) throw new Error(`S6 delete: ${de.message}`)
    // Remove catalogo_vino_id from rows if the column doesn't exist in schema
    const rowsToInsert = propuestasRows.map(({ catalogo_vino_id: _c, ...rest }) => rest)
    const { error: ie } = await sb.from('consultor_propuestas').insert(rowsToInsert)
    if (ie) throw new Error(`S6 insert: ${ie.message}`)
    console.log(`\n   ✓ ${propuestasRows.length} propuestas insertadas`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S7: cabecera_compras — corregir proveedor genérico
  // Solo actualiza el campo "proveedor"; NO toca importe, stock, movimientos.
  // Si no hay proveedor resoluble desde lineas_compra → asigna 'Sin proveedor asignado'.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S7] cabecera_compras — corregir proveedor genérico (solo campo proveedor)...')

  const { data: cabs } = await sb.from('cabecera_compras')
    .select('id, fecha, proveedor').eq('restaurante_id', DEMO_ID).ilike('proveedor', 'Proveedor Demo%')

  if (!cabs || cabs.length === 0) {
    console.log('  Sin cabeceras con proveedor genérico. Omitido.')
  } else {
    const cabIds = cabs.map(c => c.id)
    const { data: lineas } = await sb.from('lineas_compra').select('cabecera_id, vino_id').in('cabecera_id', cabIds)
    const vinoIds = [...new Set((lineas||[]).map(l=>l.vino_id).filter(Boolean))]
    const { data: vProv } = vinoIds.length
      ? await sb.from('vinos').select('id, proveedor').in('id', vinoIds)
      : { data: [] }
    const vpMap = Object.fromEntries((vProv||[]).map(v=>[v.id,v.proveedor]))

    const cabVotos = {}
    for (const l of lineas||[]) {
      const prov = vpMap[l.vino_id]
      if (!prov) continue
      if (!cabVotos[l.cabecera_id]) cabVotos[l.cabecera_id] = {}
      cabVotos[l.cabecera_id][prov] = (cabVotos[l.cabecera_id][prov]||0)+1
    }

    const updates7 = cabs.map(cab => ({
      id: cab.id, fecha: cab.fecha, old: cab.proveedor,
      new: Object.entries(cabVotos[cab.id]||{}).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Sin proveedor asignado',
    }))

    console.log('\n  id_parcial   fecha       antiguo → nuevo')
    console.log('  ' + '─'.repeat(66))
    for (const u of updates7) console.log(`  …${u.id.slice(-8)}   ${(u.fecha||'').slice(0,10)}   "${u.old}" → "${u.new}"`)

    if (!DRY_RUN) {
      for (const u of updates7) {
        // Solo actualiza proveedor — sin tocar fecha, estado, importes ni stock
        const { error } = await sb.from('cabecera_compras').update({ proveedor: u.new }).eq('id', u.id).eq('restaurante_id', DEMO_ID)
        if (error) throw new Error(`S7 ${u.id}: ${error.message}`)
      }
      console.log(`\n   ✓ ${updates7.length} proveedores actualizados (solo campo proveedor)`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEMO MARIDAJE: 10 platos clave × 3 vinos (motor al vuelo)
  // El motor analizarMaridaje() trabaja sobre los vinos con notas generadas (dry-run)
  // o ya actualizadas (confirm). La demo usa las notas locales para dry-run.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[DEMO] Maridaje — 10 platos clave con motor al vuelo...')

  try {
    const { analizarMaridaje } = await import('../app/lib/maridajeEngine.js')

    // En dry-run: aplicar notas generadas en memoria para obtener perfiles correctos
    const vinosParaMotor = todosVinos.map(v => ({
      ...v,
      activo: true,
      stock: Math.max(Number(v.stock) || 0, 6),  // garantizar stock > 0 para que aparezca
      notas_cata: (!v.notas_cata || v.notas_cata.length < 12)
        ? generarNotasCata(v.tipo, v.uva, v.region, v.nombre)
        : v.notas_cata,
    }))

    const PLATOS_DEMO = [
      'Tortillitas de camarones estilo Cádiz, masa crujiente, fritas en aceite',
      'Gambas al pil-pil con guindilla y ajo, aceite de oliva picante',
      'Gamba blanca de Huelva a la plancha con sal marina',
      'Ceviche de corvina con leche de tigre al fino, frío y cítrico',
      'Almejas a la marinera con manzanilla de Sanlúcar, salsa verde',
      'Atún rojo de almadraba a la plancha, marcado a la plancha',
      'Arroz negro con sepia en su tinta y ali-oli de ajo asado',
      'Presa ibérica a la brasa con chimichurri de hierbas, ibérico',
      'Carrillera de ternera al vino de Jerez oloroso, estofado',
      'Tabla de jamón ibérico de bellota, cortado a cuchillo',
    ]

    if (vinosParaMotor.length === 0) {
      console.log('  Sin vinos en la demo para el análisis. Omitido.')
    } else {
      console.log('\n  plato                               top-1               top-2               top-3')
      console.log('  ' + '─'.repeat(100))
      for (const consulta of PLATOS_DEMO) {
        let res
        try {
          res = analizarMaridaje(consulta, vinosParaMotor)
        } catch { res = { recomendados: [] } }
        const recs = (res.recomendados || []).slice(0, 3)
        const nomPad = (v) => {
          if (!v) return '—'.padEnd(20)
          const pvp = Number(v.precio_botella) || 0
          return (v.nombre||'?').slice(0,14).padEnd(15) + ` ${pvp ? pvp + '€' : '—'}`.padStart(5)
        }
        console.log(`  ${consulta.slice(0,35).padEnd(36)}${nomPad(recs[0]?.vino)}  ${nomPad(recs[1]?.vino)}  ${nomPad(recs[2]?.vino)}`)
      }
      console.log('\n  Nota: el motor puntúa acidez, tanino, cuerpo, alcohol y dulzor contra las necesidades del plato.')
      console.log('  Para platos de fritura/marisco: prioriza generoso seco, espumoso y blanco salino.')
      console.log('  Para jamón: prioriza generoso seco > espumoso > blanco salino (prioridadEstiloJamon).')
      console.log('  Para carne brasa: prioriza tinto con tanino≥3 y cuerpo≥3.')
      console.log('  Para postre (torrijas, tocino, piononos): filtra secos; admite dulce/oxidativo.')
    }
  } catch (err) {
    console.log(`  (motor maridaje no disponible en este contexto: ${err.message})`)
    console.log('\n  Análisis estático esperado por tipo de plato:')
    console.log('  fritura/marisco → generoso seco (manzanilla, fino) > espumoso > blanco salino')
    console.log('  pescado limpio  → blanco atlántico (albariño, verdejo) > generoso seco > rosado')
    console.log('  jamón curado    → fino/manzanilla > cava > blanco salino mineral')
    console.log('  carne a la brasa → tinto con crianza y tanino firme (Ribera, Rioja crianza)')
    console.log('  estofado (carrillera) → tinto con estructura o amontillado/oloroso')
    console.log('  postres (torrija, tocino, pionono) → dulce (PX) o cava brut nature')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ONBOARDING: Análisis antes/después del seed
  // Basado en dashboard/page.js tareasInicio (modo no-perfilBodega)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[ONBOARDING] Progreso estimado antes/después del seed...')

  const cartaPublicablePre  = vinosConPrecio.length > 0 && todosVinos.length > 0
  const platosPre           = false  // asumimos 0 platos antes del seed
  const descsPre            = false
  const qrPre               = false  // carta_publica_activa era false antes
  const bodegaPre           = vinosSinCoste.length === 0 && vinosSinProveedor.length === 0 && vinosConStock.length === todosVinos.length

  const cartaPublicablePost = cartaPublicablePre  // sin cambio en precios
  const platosPost          = true                // S1 inserta 36 platos
  const descsPost           = true                // todos con descripcion
  const qrPost              = true                // S0 activa carta_publica_activa
  const bodegaPost          = bodegaPre           // S2 actualiza notas_cata pero no stock/coste/proveedor

  // Los 5 pasos aplican si el plan incluye 'bodega' feature
  // Para simplificar, asumimos plan premium (bodega activo)
  const tareas = [
    { id: 'vinos',               pre: cartaPublicablePre,  post: cartaPublicablePost, desc: 'Carta con vinos y precios' },
    { id: 'platos',              pre: platosPre,            post: platosPost,          desc: 'Platos cargados' },
    { id: 'descripciones_platos',pre: descsPre,             post: descsPost,           desc: 'Platos descritos para maridaje' },
    { id: 'bodega',              pre: bodegaPre,            post: bodegaPost,           desc: 'Coste, proveedor y stock completos', feature: 'bodega' },
    { id: 'qr',                  pre: qrPre,               post: qrPost,              desc: 'Carta pública activa (QR)' },
  ]

  const pctAntes  = Math.round(tareas.filter(t=>t.pre).length  / tareas.length * 100)
  const pctDespues = Math.round(tareas.filter(t=>t.post).length / tareas.length * 100)

  console.log('\n  paso                         antes  después  cambio')
  console.log('  ' + '─'.repeat(58))
  for (const t of tareas) {
    const before = t.pre  ? '✓' : '✗'
    const after  = t.post ? '✓' : '✗'
    const change = !t.pre && t.post ? '→ DONE' : t.pre && !t.post ? '→ ROTO' : ''
    console.log(`  ${t.desc.padEnd(30)} ${before.padEnd(6)} ${after.padEnd(8)} ${change}`)
  }
  console.log(`\n  Progreso activación: ${pctAntes}% antes → ${pctDespues}% después del seed`)
  console.log(`\n  Para llegar al 100% falta:`)
  const pendientes = tareas.filter(t => !t.post)
  if (pendientes.length === 0) {
    console.log('    Nada — todos los pasos completados tras el seed.')
  } else {
    for (const t of pendientes) {
      if (t.id === 'bodega') console.log(`    • ${t.desc}: completar coste (${vinosSinCoste.length} vinos), proveedor (${vinosSinProveedor.length}), stock (${todosVinos.length - vinosConStock.length})`)
      else console.log(`    • ${t.desc}`)
    }
    console.log('\n  Fase 3 propuesta: completar datos de bodega (coste+proveedor+stock) para llegar a 100%.')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Resumen final
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(64))
  console.log(DRY_RUN ? 'DRY-RUN — RESUMEN (nada escrito en BD)' : 'CONFIRM — RESUMEN DE CAMBIOS APLICADOS')
  console.log('═'.repeat(64))
  console.log(`  S0  restaurante: slug=casa-marisma, colores marinos, carta_publica=true`)
  console.log(`  S1  platos: ${PLATOS.length} en ${cats.length} categorías (${Math.min(...PLATOS.map(p=>p.precio))}–${Math.max(...PLATOS.map(p=>p.precio))}€)`)
  console.log(`  S2  perfiles vino: ${updates2.length} actualizados (${realCount} catálogo real / ${ficticioCount} ficticio)`)
  console.log(`  S3  simulador: ${vinosActual.length} actual + ${vinoFuera?1:0} fuera (menor margen) + ${catList.length} nuevo (catálogo)`)
  console.log(`  S4  inventario: 3 snapshots × ${vinosS.length} refs (Jun/Ago/Sep 2026)`)
  console.log(`  S5  oportunidades: ${oppItems.length} items · ${oppSnap.recuperacion_anual_estimada}€ impacto (fórmula)`)
  console.log(`  S6  propuestas: ${propuestasRows.length} (${propuestasRows.filter(p=>p.catalogo_vino_id).length} con catalogo_vino_id real)`)
  console.log(`  S7  cabecera_compras: solo campo proveedor, sin tocar importes/stock/movimientos`)
  console.log(`  ONBOARDING: ${pctAntes}% → ${pctDespues}%`)
  console.log(`\n  ${DRY_RUN
    ? 'Para aplicar:\n  node --env-file=.env.local scripts/seed-demo-fase2.mjs --confirm --nombre "Casa Marisma"'
    : '✓ Completado.'}`)
}

main().catch(err => {
  console.error('\nERROR:', err.message)
  process.exit(1)
})
