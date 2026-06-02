/**
 * Creates a private commercial proposal for Araboka from its public Foodyt menus.
 *
 * Usage:
 *   node scripts/seed-araboka-propuesta.js --dry-run
 *   node scripts/seed-araboka-propuesta.js
 *
 * The proposal intentionally uses a non-obvious slug and must remain unindexed.
 * Stock is provisional: it only allows ArmonIA to evaluate each published wine.
 */

const { createClient } = require('@supabase/supabase-js')
try {
  process.loadEnvFile('.env.local')
} catch {}

const FOOD_URL = 'https://menu.tipsipro.com/es/esp/restaurants/qr/araboka/'
const WINE_URL = 'https://menu.tipsipro.com/es/esp/restaurants/araboka/?menu=724'
const PROPOSAL_SLUG = 'propuesta-araboka-f7q9m2'
const PROPOSAL_EMAIL = 'propuesta-araboka@cataconjuanjo.local'

const FOOD_CATEGORIES = {
  653: 'Postres',
  655: 'Entrantes frios',
  656: 'Entrantes calientes',
  657: 'Principales',
  664: 'Ensaladas',
  24980: 'Pan',
}

const WINE_TYPES = {
  6239: 'blanco',
  6240: 'rosado',
  6241: 'espumoso',
  6242: 'tinto',
}

function decodeHtml(value = '') {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
}

function cleanText(value = '') {
  return decodeHtml(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

function cleanTitle(value = '') {
  return cleanText(value)
    .replace(/\s+/g, ' ')
    .replace(/([a-záéíóúüñ])([A-ZÁÉÍÓÚÜÑ])$/, (_, before, last) => before + last.toLowerCase())
    .trim()
}

function parsePrice(fragment) {
  const match = fragment.match(/dish-miniature__content__prices__icon[\s\S]*?\u20ac\s*([\d.,]+)/i)
  if (!match) return 0
  return Number(match[1].replace(/\./g, '').replace(',', '.')) || 0
}

function parseDescription(fragment) {
  const match = fragment.match(/itemprop="description">([\s\S]*?)(?:<div class="dish-miniature__content__allergens"|<div class="dish-miniature__content__prices)/i)
  return cleanText(match?.[1] || '').replace(/\n+/g, ' | ').trim()
}

function parsePublicMenu(html) {
  return html
    .split('<div class="dish-miniature"')
    .slice(1)
    .map(fragment => {
      const title = fragment.match(/itemprop="name" title="([^"]+)"/i)?.[1]
      const href = decodeHtml(fragment.match(/href="([^"]+)"/i)?.[1] || '')
      const menuId = Number(href.match(/[?&]menu=(\d+)/i)?.[1] || 0)

      return {
        menuId,
        nombre: cleanTitle(title || ''),
        descripcion: parseDescription(fragment),
        precio: parsePrice(fragment),
      }
    })
    .filter(item => item.nombre)
}

function splitWineDescription(description) {
  const parts = description
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
  const grapes = parts[0] || ''
  const region = parts.find(part => /^D\.?\s*O\.?/i.test(part)) || ''
  return { grapes, region }
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`No se pudo leer ${url}: HTTP ${response.status}`)
  return response.text()
}

async function buildPayload() {
  const [foodHtml, wineHtml] = await Promise.all([
    fetchText(FOOD_URL),
    fetchText(WINE_URL),
  ])

  const platos = parsePublicMenu(foodHtml).map(item => ({
    nombre: item.nombre,
    descripcion: item.descripcion,
    categoria: FOOD_CATEGORIES[item.menuId] || 'Otros',
    precio: item.precio,
    activo: true,
  }))

  const vinos = parsePublicMenu(wineHtml).map(item => {
    const { grapes, region } = splitWineDescription(item.descripcion)
    return {
      nombre: item.nombre,
      bodega: '',
      tipo: WINE_TYPES[item.menuId] || 'tinto',
      region,
      uva: grapes,
      precio_copa: 0,
      precio_botella: item.precio,
      stock: 1,
      stock_minimo: 0,
      notas_cata: item.descripcion,
      proveedor: '',
      activo: true,
    }
  })

  return { platos, vinos }
}

async function seed() {
  const { platos, vinos } = await buildPayload()

  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({
      slug: PROPOSAL_SLUG,
      sources: { food: FOOD_URL, wine: WINE_URL },
      totals: { platos: platos.length, vinos: vinos.length },
      platosPorCategoria: platos.reduce((totals, plato) => {
        totals[plato.categoria] = (totals[plato.categoria] || 0) + 1
        return totals
      }, {}),
      vinosPorTipo: vinos.reduce((totals, vino) => {
        totals[vino.tipo] = (totals[vino.tipo] || 0) + 1
        return totals
      }, {}),
      muestras: { platos: platos.slice(0, 3), vinos: vinos.slice(0, 3) },
    }, null, 2))
    return
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const restaurant = {
    nombre: 'Araboka',
    slug: PROPOSAL_SLUG,
    email: PROPOSAL_EMAIL,
    ciudad: 'Malaga',
    plan: 'premium',
    subscription_status: 'trialing',
    ticket_medio_comida: 45,
    color_primario: '#22201d',
    color_fondo: '#f7f5f0',
    color_acento: '#8b6a38',
    tipografia: 'serif',
    hub_activo: false,
    camarero_pin: '1234',
  }

  const { data: existing, error: lookupError } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('slug', PROPOSAL_SLUG)
    .maybeSingle()
  if (lookupError) throw lookupError

  let restaurantId = existing?.id
  if (restaurantId) {
    const { error: updateError } = await supabase.from('restaurantes').update(restaurant).eq('id', restaurantId)
    if (updateError) throw updateError
    const { error: deleteFoodError } = await supabase.from('platos').delete().eq('restaurante_id', restaurantId)
    if (deleteFoodError) throw deleteFoodError
    const { error: deleteWineError } = await supabase.from('vinos').delete().eq('restaurante_id', restaurantId)
    if (deleteWineError) throw deleteWineError
  } else {
    const { data: created, error: createError } = await supabase
      .from('restaurantes')
      .insert(restaurant)
      .select('id')
      .single()
    if (createError) throw createError
    restaurantId = created.id
  }

  const { error: foodError } = await supabase
    .from('platos')
    .insert(platos.map(plato => ({ ...plato, restaurante_id: restaurantId })))
  if (foodError) throw foodError

  const { error: wineError } = await supabase
    .from('vinos')
    .insert(vinos.map(vino => ({ ...vino, restaurante_id: restaurantId })))
  if (wineError) throw wineError

  console.log(JSON.stringify({
    restaurantId,
    slug: PROPOSAL_SLUG,
    totals: { platos: platos.length, vinos: vinos.length },
    note: 'Stock provisional: revisar disponibilidad real antes de cualquier alta oficial.',
  }, null, 2))
}

seed().catch(error => {
  console.error(error)
  process.exit(1)
})
