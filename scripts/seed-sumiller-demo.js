/**
 * Seed a Carta Viva Bodega demo for sommeliers.
 *
 * Usage:
 *   node scripts/seed-sumiller-demo.js --dry-run
 *   node scripts/seed-sumiller-demo.js
 *
 * It creates/refreshes only the restaurant with slug "sumiller-demo-bodega".
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile('.env.local')
} catch {}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (!match) continue
      const key = match[1].trim()
      const value = match[2].trim().replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  }
}

const DEMO_EMAIL = 'sumiller.demo@cartaviva.local'
const DEMO_SLUG = 'sumiller-demo-bodega'
const DEMO_PASSWORD = 'SumillerDemo24!'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const proveedores = [
  { nombre: 'Alma Vinos Selectos', contacto: 'Lucia Martin', email: 'pedidos@almavinos.example', telefono: '+34600111222', zona: 'Rioja, Ribera y champagne', notas: 'Proveedor principal de referencias premium.', visible_restaurantes: true },
  { nombre: 'Distribuciones Atlante', contacto: 'Pablo Ruiz', email: 'operaciones@atlante.example', telefono: '+34600333444', zona: 'Galicia, Jerez y blancos', notas: 'Buen servicio para blancos y generosos.', visible_restaurantes: true },
  { nombre: 'Vinos de Territorio', contacto: 'Marta Sola', email: 'marta@territorio.example', telefono: '+34600555666', zona: 'Pequenos productores', notas: 'Referencias de baja asignacion.', visible_restaurantes: true },
  { nombre: 'Bodegas del Sur', contacto: 'Antonio Vega', email: 'pedidos@bodegasdelsur.example', telefono: '+34600777888', zona: 'Andalucia y Mediterraneo', notas: 'Entrega semanal los martes.', visible_restaurantes: true },
  { nombre: 'Grand Cru Iberia', contacto: 'Nuria Casas', email: 'nuria@grandcru.example', telefono: '+34600999000', zona: 'Francia e Italia', notas: 'Importacion premium con cupos limitados.', visible_restaurantes: true },
]

function vino(nombre, bodega, tipo, region, uva, anada, precioBotella, coste, stock, minimo, proveedor, ref, notas, rotacion = 1, precioCopa = 0) {
  return {
    nombre,
    bodega,
    tipo,
    region,
    uva,
    anada,
    precio_botella: precioBotella,
    precio_copa: precioCopa,
    coste_compra: coste,
    stock,
    stock_minimo: minimo,
    proveedor,
    referencia_proveedor: ref,
    formato_compra: precioBotella >= 90 ? 'Unidad asignada' : 'Caja 6',
    notas_cata: notas,
    activo: true,
    rotacion,
  }
}

const vinos = [
  vino('López de Heredia Viña Tondonia Reserva', 'R. López de Heredia', 'tinto', 'Rioja', 'Tempranillo, Garnacha', '2011', 74, 32, 7, 2, 'Alma Vinos Selectos', 'ALM-LHT-11', 'Clasico, cuero fino, fruta roja evolucionada. Etiqueta interna: vino emblema.', 2),
  vino('La Rioja Alta 904 Gran Reserva', 'La Rioja Alta', 'tinto', 'Rioja', 'Tempranillo, Graciano', '2015', 96, 43, 5, 2, 'Alma Vinos Selectos', 'ALM-904-15', 'Gran reserva, especia, elegancia. Ventana de consumo: beber ahora-2032.', 2),
  vino('Artadi Valdeginés', 'Artadi', 'tinto', 'Rioja Alavesa', 'Tempranillo', '2020', 82, 37, 3, 2, 'Alma Vinos Selectos', 'ALM-ART-20', 'Fruta precisa, tanino fino, parcela. Etiqueta interna: prestigio.', 1),
  vino('Vega Sicilia Valbuena 5º', 'Vega Sicilia', 'tinto', 'Ribera del Duero', 'Tinto fino, Merlot', '2019', 185, 92, 2, 1, 'Grand Cru Iberia', 'GCI-VS5-19', 'Icono de bodega, guarda y venta dirigida. No mover sin autorizacion.', 1),
  vino('Pago de Carraovejas', 'Pago de Carraovejas', 'tinto', 'Ribera del Duero', 'Tinto fino, Cabernet, Merlot', '2021', 64, 28, 9, 4, 'Alma Vinos Selectos', 'ALM-CAR-21', 'Potente, pulido, facil de defender por marca.', 3, 12),
  vino('Dominio de Atauta', 'Dominio de Atauta', 'tinto', 'Ribera del Duero', 'Tinto fino', '2020', 78, 34, 4, 2, 'Alma Vinos Selectos', 'ALM-ATA-20', 'Profundo, mineral, tanino serio. Etiqueta interna: menu degustacion.', 1),
  vino('Pétalos del Bierzo', 'Descendientes J. Palacios', 'tinto', 'Bierzo', 'Mencia', '2022', 38, 16, 18, 5, 'Vinos de Territorio', 'VDT-PET-22', 'Mencia floral, fresco, gran rotacion por copa.', 4, 7),
  vino('Ultreia Saint Jacques', 'Raúl Pérez', 'tinto', 'Bierzo', 'Mencia', '2021', 34, 14, 20, 6, 'Vinos de Territorio', 'VDT-USJ-21', 'Joya oculta, fruta fina, margen sano.', 3, 6),
  vino('Terroir al Límit Arbossar', 'Terroir al Límit', 'tinto', 'Priorat', 'Carinyena', '2019', 118, 55, 3, 1, 'Grand Cru Iberia', 'GCI-ARB-19', 'Priorat elegante, asignacion limitada. Vigilar stock.', 1),
  vino('Clos Mogador', 'Clos Mogador', 'tinto', 'Priorat', 'Garnacha, Cariñena, Syrah', '2020', 132, 61, 2, 1, 'Grand Cru Iberia', 'GCI-MOG-20', 'Referencia de prestigio, venta puntual de alto ticket.', 1),
  vino('Envínate Táganan Tinto', 'Envínate', 'tinto', 'Tenerife', 'Listan Negro, Negramoll', '2022', 49, 21, 14, 4, 'Vinos de Territorio', 'VDT-TAG-22', 'Volcanico, salino, energia. Etiqueta interna: joya oculta.', 3, 9),
  vino('Suertes del Marqués 7 Fuentes', 'Suertes del Marqués', 'tinto', 'Valle de la Orotava', 'Listan Negro, Tintilla', '2021', 36, 15, 16, 5, 'Vinos de Territorio', 'VDT-7FU-21', 'Tinto fresco para servicio por copa.', 4, 7),
  vino('Comando G La Bruja de Rozas', 'Comando G', 'tinto', 'Sierra de Gredos', 'Garnacha', '2022', 45, 19, 11, 4, 'Vinos de Territorio', 'VDT-BRU-22', 'Garnacha delicada, alta salida con carnes blancas.', 3, 8),
  vino('Bodegas Frontonio Microcósmico', 'Frontonio', 'tinto', 'Valdejalón', 'Garnacha', '2021', 31, 12, 28, 5, 'Vinos de Territorio', 'VDT-FRO-21', 'Stock alto sin salida: necesita plan de servicio por copa.', 0, 6),
  vino('Mauro VS', 'Bodegas Mauro', 'tinto', 'Castilla y León', 'Tempranillo', '2020', 112, 58, 10, 2, 'Alma Vinos Selectos', 'ALM-MVS-20', 'Margen bajo por coste alto; revisar PVP o proveedor.', 1),

  vino('Pazo Señorans Selección de Añada', 'Pazo Señorans', 'blanco', 'Rías Baixas', 'Albariño', '2015', 69, 29, 6, 2, 'Distribuciones Atlante', 'ATL-PSA-15', 'Albariño de guarda, salino, complejo. Beber ahora.', 2, 12),
  vino('Zárate Albariño', 'Zárate', 'blanco', 'Rías Baixas', 'Albariño', '2023', 32, 12, 24, 7, 'Distribuciones Atlante', 'ATL-ZAR-23', 'Fresco, directo, alta rotacion por copa.', 5, 6),
  vino('As Sortes', 'Rafael Palacios', 'blanco', 'Valdeorras', 'Godello', '2021', 78, 36, 4, 2, 'Distribuciones Atlante', 'ATL-ASO-21', 'Godello serio, volumen y mineralidad. Menu degustacion.', 1),
  vino('Louro do Bolo', 'Rafael Palacios', 'blanco', 'Valdeorras', 'Godello', '2023', 34, 13, 21, 6, 'Distribuciones Atlante', 'ATL-LOU-23', 'Blanco gastronomico, margen sano, salida estable.', 4, 7),
  vino('Ossian', 'Ossian Vides y Vinos', 'blanco', 'Castilla y León', 'Verdejo', '2020', 62, 26, 9, 3, 'Alma Vinos Selectos', 'ALM-OSS-20', 'Verdejo de guarda, madera fina, textura.', 2),
  vino('Belondrade y Lurton', 'Belondrade', 'blanco', 'Rueda', 'Verdejo', '2021', 86, 42, 6, 2, 'Alma Vinos Selectos', 'ALM-BEL-21', 'Prestigio blanco, margen ajustado. Revisar PVP.', 1),
  vino('Gramona Ovum', 'Gramona', 'blanco', 'Penedès', 'Xarel·lo', '2022', 39, 15, 18, 4, 'Vinos de Territorio', 'VDT-OVU-22', 'Xarello textural, buena joya oculta.', 2, 7),
  vino('Celler Credo Miranius', 'Celler Credo', 'blanco', 'Penedès', 'Xarel·lo', '2022', 28, 10, 30, 5, 'Vinos de Territorio', 'VDT-MIR-22', 'Stock alto, margen bueno, necesita visibilidad.', 0, 6),
  vino('Envínate Táganan Blanco', 'Envínate', 'blanco', 'Tenerife', 'Listan Blanco', '2022', 52, 22, 8, 3, 'Vinos de Territorio', 'VDT-TAB-22', 'Volcanico, salino, muy sumiller.', 2),
  vino('Ariyanas Naturalmente Dulce', 'Bodegas Bentomiz', 'dulce', 'Málaga', 'Moscatel de Alejandría', '2021', 46, 18, 10, 3, 'Bodegas del Sur', 'BDS-ARI-21', 'Dulce local premium para postre y quesos.', 2, 9),

  vino('Manzanilla La Gitana', 'Hidalgo', 'generoso', 'Sanlúcar de Barrameda', 'Palomino', null, 22, 7, 5, 8, 'Bodegas del Sur', 'BDS-GIT-NV', 'Bajo minimo: generoso clave por copa.', 5, 4),
  vino('Fino Inocente', 'Valdespino', 'generoso', 'Jerez', 'Palomino', null, 31, 11, 7, 4, 'Distribuciones Atlante', 'ATL-INO-NV', 'Fino de pago, conviene documentar servicio y conservación.', 2, 5),
  vino('Amontillado Coliseo VORS', 'Valdespino', 'generoso', 'Jerez', 'Palomino', null, 92, 45, 3, 1, 'Distribuciones Atlante', 'ATL-COL-NV', 'VORS para armonias concretas, prestigio.', 1),
  vino('Oloroso Villapanés', 'Emilio Hidalgo', 'generoso', 'Jerez', 'Palomino', null, 54, 21, 12, 3, 'Bodegas del Sur', 'BDS-VIL-NV', 'Oloroso seco, valor gastronomico alto.', 1, 10),
  vino('Palo Cortado Obispo Gascón', 'Barbadillo', 'generoso', 'Jerez', 'Palomino', null, 58, 23, 10, 2, 'Bodegas del Sur', 'BDS-OBI-NV', 'Palo cortado para upsell y quesos.', 1),

  vino('Recaredo Terrers Brut Nature', 'Recaredo', 'espumoso', 'Corpinnat', 'Xarel·lo, Macabeo, Parellada', '2019', 58, 24, 8, 3, 'Vinos de Territorio', 'VDT-TER-19', 'Burbuja gastronomica, salida buena.', 3, 11),
  vino('Gramona III Lustros', 'Gramona', 'espumoso', 'Corpinnat', 'Xarel·lo, Macabeo', '2015', 86, 39, 4, 2, 'Vinos de Territorio', 'VDT-LUS-15', 'Espumoso de guarda, referencia premium de bodega.', 1),
  vino('Raventós i Blanc De Nit', 'Raventós i Blanc', 'espumoso', 'Conca del Riu Anoia', 'Macabeo, Xarel·lo, Parellada, Monastrell', '2021', 42, 17, 14, 4, 'Vinos de Territorio', 'VDT-DEN-21', 'Rosado espumoso versatil, margen correcto.', 3, 8),
  vino('Billecart-Salmon Brut Réserve', 'Billecart-Salmon', 'espumoso', 'Champagne', 'Pinot Noir, Chardonnay, Meunier', null, 96, 49, 3, 3, 'Grand Cru Iberia', 'GCI-BIL-NV', 'Bajo minimo: champagne de entrada.', 2, 18),
  vino('Egly-Ouriet Les Vignes de Vrigny', 'Egly-Ouriet', 'espumoso', 'Champagne', 'Pinot Meunier', null, 148, 82, 1, 1, 'Grand Cru Iberia', 'GCI-EGL-NV', 'Asignacion limitada, joya para sumiller.', 1),
  vino('Ruinart Blanc de Blancs', 'Ruinart', 'espumoso', 'Champagne', 'Chardonnay', null, 135, 68, 8, 2, 'Grand Cru Iberia', 'GCI-RUI-NV', 'Stock alto para rotacion baja: revisar inmovilizado y estrategia de salida.', 0),

  vino('Domaine Tempier Bandol Rosé', 'Domaine Tempier', 'rosado', 'Bandol', 'Mourvedre, Grenache, Cinsault', '2022', 72, 33, 5, 2, 'Grand Cru Iberia', 'GCI-TEM-22', 'Rosado gastronomico premium.', 1),
  vino('Chivite Las Fincas', 'Chivite', 'rosado', 'Navarra', 'Garnacha, Tempranillo', '2023', 28, 10, 24, 6, 'Bodegas del Sur', 'BDS-CHI-23', 'Rosado accesible, buena salida en terraza.', 3, 6),
  vino('Viña Tondonia Rosado Gran Reserva', 'R. López de Heredia', 'rosado', 'Rioja', 'Tempranillo, Garnacha, Viura', '2012', 118, 58, 2, 1, 'Alma Vinos Selectos', 'ALM-LHR-12', 'Rosado iconico, asignacion escasa.', 1),

  vino('Moulin-à-Vent Les Thorins', 'Jean Foillard', 'tinto', 'Beaujolais', 'Gamay', '2021', 62, 28, 15, 3, 'Grand Cru Iberia', 'GCI-FOI-21', 'Stock alto sin salida: perfil delicado que requiere explicacion.', 0),
  vino('Etna Rosso Calderara Sottana', 'Tenuta delle Terre Nere', 'tinto', 'Etna', 'Nerello Mascalese', '2021', 68, 30, 13, 3, 'Grand Cru Iberia', 'GCI-ETN-21', 'Volcanico italiano, joya oculta para sumiller.', 1),
  vino('Barolo Serralunga', 'Giovanni Rosso', 'tinto', 'Barolo', 'Nebbiolo', '2018', 98, 46, 5, 2, 'Grand Cru Iberia', 'GCI-BAR-18', 'Nebbiolo clasico, vigilar ventana de consumo.', 1),
  vino('Chablis 1er Cru Montmains', 'Domaine Pinson', 'blanco', 'Chablis', 'Chardonnay', '2021', 78, 35, 7, 2, 'Grand Cru Iberia', 'GCI-CHA-21', 'Blanco premium, mineral, venta dirigida.', 2),
]

function daysAgo(n, hour = 13) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, (n * 7) % 59, 0, 0)
  return d.toISOString()
}

function restaurantPayload() {
  return {
    nombre: 'Carta Viva Bodega Sumiller',
    slug: DEMO_SLUG,
    email: DEMO_EMAIL,
    ciudad: 'Madrid',
    plan: 'bodega',
    subscription_status: 'active',
    subscription_ends_at: '2027-12-31T00:00:00Z',
    ticket_medio_comida: 95,
    actividad_real_desde: daysAgo(90, 9),
    color_primario: '#171416',
    color_fondo: '#f7f2ea',
    color_acento: '#6f5a33',
    tipografia: 'serif',
    hub_activo: false,
    camarero_pin: '',
  }
}

function stripWine(v) {
  const { rotacion, ...payload } = v
  return payload
}

function buildStats(restauranteId, insertedWines) {
  const stats = []
  const byName = new Map(insertedWines.map(v => [v.nombre, v]))
  for (let day = 75; day >= 1; day--) {
    for (const original of vinos) {
      const inserted = byName.get(original.nombre)
      if (!inserted || original.rotacion <= 0) continue
      const saleToday = (day + original.nombre.length) % Math.max(2, 7 - Math.min(5, original.rotacion)) === 0
      if (!saleToday) continue
      const quantity = original.rotacion >= 4 && day % 3 === 0 ? 2 : 1
      stats.push({
        restaurante_id: restauranteId,
        tipo: 'venta',
        detalle: JSON.stringify({
          vino_id: inserted.id,
          vino: inserted.nombre,
          resultado: 'vendida',
          cantidad: quantity,
          origen: 'tpv',
          formato_venta: original.precio_copa ? 'copa' : 'botella',
          objetivo: original.rotacion >= 4 ? 'rotacion' : 'margen',
        }),
        created_at: daysAgo(day, day % 2 ? 14 : 21),
      })
    }
  }

  for (const name of ['Billecart-Salmon Brut Réserve', 'Manzanilla La Gitana', 'Pago de Carraovejas']) {
    const inserted = byName.get(name)
    if (!inserted) continue
    stats.push({
      restaurante_id: restauranteId,
      tipo: 'venta',
      detalle: JSON.stringify({ vino_id: inserted.id, vino: inserted.nombre, resultado: 'no_stock', cantidad: 0, origen: 'inventario', objetivo: 'reposicion' }),
      created_at: daysAgo(1, 22),
    })
  }

  return stats
}

function buildMovements(restauranteId, insertedWines) {
  const byName = new Map(insertedWines.map(v => [v.nombre, v]))
  const movements = []
  for (const original of vinos) {
    const inserted = byName.get(original.nombre)
    if (!inserted) continue
    const inicial = original.stock + 12 + Math.max(0, original.rotacion * 2)
    movements.push({
      restaurante_id: restauranteId,
      vino_id: inserted.id,
      tipo: 'entrada',
      cantidad: inicial,
      stock_anterior: 0,
      stock_nuevo: inicial,
      motivo: `Stock inicial sumiller - ${original.proveedor}`,
      created_at: daysAgo(82, 10),
    })
    if (original.rotacion > 0) {
      const vendidas = Math.max(1, Math.min(inicial - original.stock, original.rotacion * 3))
      movements.push({
        restaurante_id: restauranteId,
        vino_id: inserted.id,
        tipo: 'venta',
        cantidad: -vendidas,
        stock_anterior: inicial,
        stock_nuevo: inicial - vendidas,
        motivo: 'Venta registrada por TPV',
        created_at: daysAgo(18, 22),
      })
    }
    if (original.stock <= original.stock_minimo) {
      movements.push({
        restaurante_id: restauranteId,
        vino_id: inserted.id,
        tipo: 'ajuste',
        cantidad: -1,
        stock_anterior: original.stock + 1,
        stock_nuevo: original.stock,
        motivo: 'Ajuste tras conteo de cava',
        created_at: daysAgo(2, 11),
      })
    }
  }
  return movements
}

function buildProposals(restauranteId) {
  return [
    {
      restaurante_id: restauranteId,
      titulo: 'Renegociar Mauro VS o ajustar PVP',
      vino: 'Mauro VS',
      tipo: 'margen',
      zona: 'Castilla y León',
      proveedor_sugerido: 'Alma Vinos Selectos',
      coste_estimado: 58,
      precio_recomendado: 128,
      margen_objetivo: 55,
      motivo: 'Referencia de prestigio con margen por debajo del objetivo. Conviene revisar coste o reposicionar precio antes de reponer.',
      prioridad: 'alta',
      estado: 'propuesta',
    },
    {
      restaurante_id: restauranteId,
      titulo: 'Plan de salida para Frontonio Microcósmico',
      vino: 'Bodegas Frontonio Microcósmico',
      tipo: 'rotacion',
      zona: 'Valdejalón',
      proveedor_sugerido: 'Vinos de Territorio',
      coste_estimado: 12,
      precio_recomendado: 31,
      margen_objetivo: 61,
      motivo: 'Hay stock alto sin ventas recientes. Buen candidato para copa, menu de temporada o recomendacion interna.',
      prioridad: 'media',
      estado: 'interesa',
    },
    {
      restaurante_id: restauranteId,
      titulo: 'Reponer champagne de entrada',
      vino: 'Billecart-Salmon Brut Réserve',
      tipo: 'compra',
      zona: 'Champagne',
      proveedor_sugerido: 'Grand Cru Iberia',
      coste_estimado: 49,
      precio_recomendado: 96,
      margen_objetivo: 49,
      motivo: 'Bajo minimo y con senales de falta de stock. Mantener disponibilidad evita perder ventas de aperitivo premium.',
      prioridad: 'alta',
      estado: 'propuesta',
    },
  ]
}

async function ensureProvider(supabase, provider) {
  const { data: existing, error: lookupError } = await supabase
    .from('proveedores_vino')
    .select('id')
    .eq('nombre', provider.nombre)
    .maybeSingle()
  if (lookupError) throw lookupError
  if (existing?.id) {
    const { error } = await supabase.from('proveedores_vino').update(provider).eq('id', existing.id)
    if (error) throw error
    return existing.id
  }
  const { data, error } = await supabase.from('proveedores_vino').insert(provider).select('id').single()
  if (error) throw error
  return data.id
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({
      email: DEMO_EMAIL,
      slug: DEMO_SLUG,
      plan: 'bodega',
      proveedores: proveedores.length,
      vinos: vinos.length,
      bajoMinimo: vinos.filter(v => v.stock <= v.stock_minimo).length,
      stockAltoSinSalida: vinos.filter(v => v.rotacion === 0 && v.stock >= Math.max(8, v.stock_minimo * 3)).length,
    }, null, 2))
    return
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  for (const provider of proveedores) {
    await ensureProvider(supabase, provider)
  }

  const payload = restaurantPayload()
  const { data: existing, error: lookupError } = await supabase
    .from('restaurantes')
    .select('id')
    .or(`slug.eq.${DEMO_SLUG},email.eq.${DEMO_EMAIL}`)
    .maybeSingle()
  if (lookupError) throw lookupError

  let restaurantId = existing?.id
  if (restaurantId) {
    await supabase.from('movimientos_stock').delete().eq('restaurante_id', restaurantId)
    await supabase.from('estadisticas').delete().eq('restaurante_id', restaurantId)
    await supabase.from('consultor_propuestas').delete().eq('restaurante_id', restaurantId)
    await supabase.from('platos').delete().eq('restaurante_id', restaurantId)
    await supabase.from('vinos').delete().eq('restaurante_id', restaurantId)
    const { error } = await supabase.from('restaurantes').update(payload).eq('id', restaurantId)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from('restaurantes').insert(payload).select('id').single()
    if (error) throw error
    restaurantId = data.id
  }

  const { data: insertedWines, error: wineError } = await supabase
    .from('vinos')
    .insert(vinos.map(v => ({ ...stripWine(v), restaurante_id: restaurantId })))
    .select('*')
  if (wineError) throw wineError

  const { error: statsError } = await supabase.from('estadisticas').insert(buildStats(restaurantId, insertedWines || []))
  if (statsError) throw statsError

  const { error: movementsError } = await supabase.from('movimientos_stock').insert(buildMovements(restaurantId, insertedWines || []))
  if (movementsError) throw movementsError

  const { error: proposalError } = await supabase.from('consultor_propuestas').insert(buildProposals(restaurantId))
  if (proposalError) throw proposalError

  try {
    await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { demo: 'sumiller' },
    })
  } catch {}

  console.log(JSON.stringify({
    ok: true,
    restaurantId,
    email: DEMO_EMAIL,
    slug: DEMO_SLUG,
    password: DEMO_PASSWORD,
    vinos: insertedWines?.length || 0,
    stats: buildStats(restaurantId, insertedWines || []).length,
    movimientos: buildMovements(restaurantId, insertedWines || []).length,
    url: '/demo/sumiller',
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
