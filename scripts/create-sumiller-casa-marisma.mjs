/**
 * Crea el cascarón "Sumiller Casa Marisma" en la base de datos.
 *
 * Sin flags   → dry-run REAL: conecta en solo lectura y muestra el estado
 *               actual de la BD + las filas exactas que crearía --apply.
 * --apply     → ejecuta los INSERTs.
 *
 * Idempotente: si slug/id/email ya existen, informa y sale sin escribir nada.
 *
 * Uso:
 *   node scripts/create-sumiller-casa-marisma.mjs          # dry-run (lee BD)
 *   node scripts/create-sumiller-casa-marisma.mjs --apply  # ejecutar
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ── Guard ─────────────────────────────────────────────────────────────────────
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

// ── Denylist por UUID — nunca usar como destino ───────────────────────────────
const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286', // Lo de Carmen
  '7af94e33-48cd-43b8-b939-4796ba58e4d8', // Araboka
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66', // La Taberna del Puerto
  '6b528438-3d24-432d-9728-dc2ff868baf6', // Modo Sumiller
  '65d26545-7c7e-424c-9c29-33bfe8bbaafa', // Casa Marisma (demo restaurantes)
])

// Denylist por nombre — comparación exacta en minúsculas
// "sumiller casa marisma" NO está aquí → es el único nombre permitido con "marisma"
const NAME_DENYLIST = new Set([
  'lo de carmen',
  'araboka',
  'la taberna del puerto',
  'modo sumiller',
  'casa marisma',
])

// ── Constantes del restaurante ────────────────────────────────────────────────
const CASA_MARISMA_ID    = '00000002-ca5a-4000-0000-000000000001'
const CASA_MARISMA_SLUG  = 'sumiller-casa-marisma'
const CASA_MARISMA_EMAIL = 'sumiller-casa-marisma@cartaviva.local'
const CASA_MARISMA_NOMBRE = 'Sumiller Casa Marisma'
const ADMIN_EMAIL        = 'cataconjuanjo@gmail.com'

// Guardia pre-vuelo
if (UUID_DENYLIST.has(CASA_MARISMA_ID)) {
  console.error('ERROR: CASA_MARISMA_ID colisiona con la denylist. Aborto.')
  process.exit(1)
}
if (NAME_DENYLIST.has(CASA_MARISMA_NOMBRE.toLowerCase())) {
  console.error('ERROR: El nombre del restaurante está en la name-denylist. Aborto.')
  process.exit(1)
}

// ── Payloads ──────────────────────────────────────────────────────────────────
const restaurantePayload = {
  id:                   CASA_MARISMA_ID,
  nombre:               CASA_MARISMA_NOMBRE,
  slug:                 CASA_MARISMA_SLUG,
  email:                CASA_MARISMA_EMAIL,
  ciudad:               'Málaga',
  provincia_codigo:     '29',
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
  nombre_alias:   CASA_MARISMA_NOMBRE,
  orden:          99,
}

// ── Cliente Supabase (usado en dry-run y en --apply) ──────────────────────────
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── Dry-run real: lectura de BD ───────────────────────────────────────────────
if (!APPLY) {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  DRY-RUN — solo lectura de BD, no se escribe nada            ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  // 1. Verificar slug, id, email en restaurantes
  const [
    { data: bySlug  },
    { data: byId    },
    { data: byEmail },
  ] = await Promise.all([
    admin.from('restaurantes').select('id, nombre').eq('slug',  CASA_MARISMA_SLUG ).maybeSingle(),
    admin.from('restaurantes').select('id, nombre').eq('id',    CASA_MARISMA_ID   ).maybeSingle(),
    admin.from('restaurantes').select('id, nombre').eq('email', CASA_MARISMA_EMAIL).maybeSingle(),
  ])

  const slugOk  = !bySlug
  const idOk    = !byId
  const emailOk = !byEmail

  console.log(`[BD] slug  ${CASA_MARISMA_SLUG}  → ${slugOk  ? 'NO existe ✓' : `YA EXISTE — id=${bySlug?.id}`}`)
  console.log(`[BD] id    ${CASA_MARISMA_ID}  → ${idOk    ? 'NO existe ✓' : `YA EXISTE — nombre="${byId?.nombre}"`}`)
  console.log(`[BD] email ${CASA_MARISMA_EMAIL} → ${emailOk ? 'NO existe ✓' : `YA EXISTE — id=${byEmail?.id}`}`)

  // 2. Contar restaurantes vinculados al admin en sumiller_restaurantes
  const { data: vinculados, error: vErr } = await admin
    .from('sumiller_restaurantes')
    .select('restaurante_id, nombre_alias, orden')
    .eq('email_sumiller', ADMIN_EMAIL)
    .order('orden')

  const nVinculados = vinculados?.length ?? 0
  console.log()
  console.log(`[BD] sumiller_restaurantes para ${ADMIN_EMAIL}: ${nVinculados} fila(s) (límite selector: 3)`)
  if (vinculados?.length) {
    for (const v of vinculados) {
      console.log(`       orden=${v.orden}  restaurante_id=${v.restaurante_id}  alias="${v.nombre_alias}"`)
    }
  }
  if (nVinculados >= 3) {
    console.log()
    console.log('  ⚠  Ya hay ≥3 filas: Casa Marisma quedaría FUERA del selector (.limit(3))')
    console.log('     Solución sugerida (sin implementar): incrementar .limit() en')
    console.log('     app/dashboard/layout.js:233 a 4 o más, o añadir paginación al selector.')
  }

  if (!slugOk || !idOk || !emailOk) {
    console.log()
    console.log('  ✗  Algún identificador ya existe. --apply abortaría. Revisa antes de continuar.')
    console.log()
    console.log('Para ejecutar (cuando esté limpio):')
    console.log('  node scripts/create-sumiller-casa-marisma.mjs --apply')
    process.exit(0)
  }

  // 3. Filas que crearía --apply
  console.log()
  console.log('── Filas que crearía --apply ────────────────────────────────────')
  console.log()
  console.log('  1. restaurantes')
  console.log(JSON.stringify(restaurantePayload, null, 5).replace(/^/gm, '     '))
  console.log()
  console.log('  2. restaurant_economic_settings')
  console.log(JSON.stringify(economicPayload, null, 5).replace(/^/gm, '     '))
  console.log()
  console.log('  3. sumiller_restaurantes')
  console.log(JSON.stringify(sumillerRestPayload, null, 5).replace(/^/gm, '     '))
  console.log()
  console.log('Para ejecutar:')
  console.log('  node scripts/create-sumiller-casa-marisma.mjs --apply')
  process.exit(0)
}

// ── Ejecutar ──────────────────────────────────────────────────────────────────

// 1. Idempotencia: ¿ya existe el slug?
const { data: existente } = await admin
  .from('restaurantes')
  .select('id, nombre')
  .eq('slug', CASA_MARISMA_SLUG)
  .maybeSingle()

if (existente) {
  console.log(`[OK] Ya existe: id=${existente.id}  nombre="${existente.nombre}"`)
  console.log('No se ha creado nada.')
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

// 4. sumiller_restaurantes (switcher del admin)
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
