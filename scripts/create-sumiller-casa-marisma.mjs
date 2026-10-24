/**
 * Crea el cascarón "Sumiller Casa Marisma" en la base de datos.
 *
 * Dry-run por defecto — muestra lo que se haría sin tocar la BD.
 * Pasa --apply para ejecutar.
 * Idempotente: si el slug ya existe, informa el ID existente y sale.
 *
 * Uso:
 *   node scripts/create-sumiller-casa-marisma.mjs          # dry-run
 *   node scripts/create-sumiller-casa-marisma.mjs --apply  # ejecutar
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ── Guard dry-run ─────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply')

// ── Carga .env.local si las vars no vienen del entorno ────────────────────────
{
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let val   = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch { /* .env.local no encontrado — asume vars en entorno */ }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ── Denylist — nunca usar estos IDs como destino ──────────────────────────────
const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286', // Lo de Carmen
  '7af94e33-48cd-43b8-b939-4796ba58e4d8', // Araboka
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66', // La Taberna del Puerto
  '6b528438-3d24-432d-9728-dc2ff868baf6', // Modo Sumiller
  '00000001-f100-4000-0000-000000000001', // Smoke Test F1 (reservado)
])

// ── Constantes del restaurante ────────────────────────────────────────────────
const CASA_MARISMA_ID   = '00000002-ca5a-4000-0000-000000000001'
const CASA_MARISMA_SLUG = 'sumiller-casa-marisma'
const ADMIN_EMAIL       = 'cataconjuanjo@gmail.com'

if (UUID_DENYLIST.has(CASA_MARISMA_ID)) {
  console.error('ERROR: CASA_MARISMA_ID colisiona con la denylist. Aborto.')
  process.exit(1)
}

// ── Payloads ──────────────────────────────────────────────────────────────────
const restaurantePayload = {
  id:                   CASA_MARISMA_ID,
  nombre:               'Sumiller Casa Marisma',
  slug:                 CASA_MARISMA_SLUG,
  email:                'sumiller-casa-marisma@cartaviva.local',
  ciudad:               'Casa Marisma',
  provincia_codigo:     'XX',
  plan:                 'sumiller',
  subscription_status:  'active',
  subscription_ends_at: '2030-12-31T00:00:00Z',
  camarero_pin:         '',
  hub_activo:           false,
}

const economicPayload = {
  restaurante_id:      CASA_MARISMA_ID,
  fuente_ventas:       'parte',
  control_stock_desde: '2025-01-01',
}

const sumillerRestPayload = {
  email_sumiller: ADMIN_EMAIL,
  restaurante_id: CASA_MARISMA_ID,
  nombre_alias:   'Casa Marisma',
  orden:          99,
}

// ── Dry-run: mostrar plan sin tocar la BD ─────────────────────────────────────
if (!APPLY) {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  DRY-RUN — no se escribe nada en la BD                       ║')
  console.log('║  Pasa --apply para ejecutar                                   ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log('── restaurantes ────────────────────────────────────────────────')
  console.log(JSON.stringify(restaurantePayload, null, 2))
  console.log()
  console.log('── restaurant_economic_settings ────────────────────────────────')
  console.log(JSON.stringify(economicPayload, null, 2))
  console.log()
  console.log('── sumiller_restaurantes ───────────────────────────────────────')
  console.log(JSON.stringify(sumillerRestPayload, null, 2))
  process.exit(0)
}

// ── Ejecutar ──────────────────────────────────────────────────────────────────
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// 1. Idempotencia: ¿ya existe el slug?
const { data: existente } = await admin
  .from('restaurantes')
  .select('id, nombre')
  .eq('slug', CASA_MARISMA_SLUG)
  .maybeSingle()

if (existente) {
  console.log(`[OK] Ya existe: id=${existente.id}  nombre="${existente.nombre}"`)
  console.log('No se ha creado nada. Para reconfigurarlo hazlo manualmente.')
  process.exit(0)
}

// 2. Crear restaurante
const { error: restErr } = await admin
  .from('restaurantes')
  .insert(restaurantePayload)

if (restErr) {
  console.error('[ERROR] restaurantes:', restErr.message)
  process.exit(1)
}
console.log(`[OK] restaurante creado  id=${CASA_MARISMA_ID}`)

// 3. restaurant_economic_settings
const { error: econErr } = await admin
  .from('restaurant_economic_settings')
  .upsert(economicPayload, { onConflict: 'restaurante_id' })

if (econErr) {
  console.error('[ERROR] restaurant_economic_settings:', econErr.message)
  process.exit(1)
}
console.log('[OK] restaurant_economic_settings creada')

// 4. sumiller_restaurantes (switcher de admin)
const { error: switchErr } = await admin
  .from('sumiller_restaurantes')
  .upsert(sumillerRestPayload, { onConflict: 'email_sumiller,restaurante_id', ignoreDuplicates: true })

if (switchErr) {
  console.warn('[WARN] sumiller_restaurantes:', switchErr.message)
} else {
  console.log(`[OK] sumiller_restaurantes  ${ADMIN_EMAIL} → ${CASA_MARISMA_ID}`)
}

console.log()
console.log('╔══════════════════════════════════════════════════════════════╗')
console.log('║  Sumiller Casa Marisma creado correctamente                   ║')
console.log(`║  ID:   ${CASA_MARISMA_ID}              ║`)
console.log(`║  Slug: ${CASA_MARISMA_SLUG}                        ║`)
console.log('╚══════════════════════════════════════════════════════════════╝')
