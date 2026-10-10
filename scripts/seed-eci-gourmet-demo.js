/**
 * Crea la tienda demo ECI Gourmet y su usuario de acceso al admin.
 *
 * Uso:
 *   node scripts/seed-eci-gourmet-demo.js
 *
 * Las credenciales se guardan en .eci-demo-credentials (gitignoreado).
 * No se imprimen en consola.
 *
 * Para eliminar la tienda demo:
 *   npm run demo:purge
 */

const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')

try { process.loadEnvFile('.env.local') } catch {}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const SLUG             = 'eci-gourmet-k7x2'
const NOMBRE           = 'Club del Gourmet · El Corte Inglés'
const CIUDAD           = 'Madrid'
const CREDENTIALS_FILE = path.join(process.cwd(), '.eci-demo-credentials')
const DEMO_EMAIL       = `demo-eci-${SLUG}@kiosko.internal`
const DEMO_DAILY_LIMIT = 150  // llamadas a /maridaje por día

function generarPassword() {
  return crypto.randomBytes(16).toString('base64url')
}

async function main() {
  console.log(`\n▶ Slug:   ${SLUG}`)
  console.log(`▶ Nombre: ${NOMBRE}\n`)

  // ── Leer o generar contraseña ──────────────────────────────────────────────

  let password
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'))
      password = existing.password
      console.log('→ Usando contraseña existente de .eci-demo-credentials')
    } catch {
      password = generarPassword()
    }
  } else {
    password = generarPassword()
  }

  // ── Crear o actualizar tienda ──────────────────────────────────────────────

  let { data: tienda } = await sb.from('tiendas').select('id, nombre').eq('slug', SLUG).single()

  const configTienda = {
    nombre:              NOMBRE,
    email:               DEMO_EMAIL,
    slug:                SLUG,
    ciudad:              CIUDAD,
    logo_url:            '/assets/eci-gourmet-demo/logo.svg',
    color_primario:      '#ffffff',
    color_acento:        '#1a1a1a',
    font_family:         'moderna',
    activo:              true,
    subscription_status: 'active',
    theme_preset:        'eci',
    is_demo:             true,
    demo_daily_limit:    DEMO_DAILY_LIMIT,
    cesta_activa:        false,
    features: {
      qr_order:      true,
      is_demo:       true,
      hide_sensitive: true,
      wine_to_food:  true,
      idle_reposo_s: 60,
      idle_reset_s:  45,
    },
  }

  if (!tienda) {
    const { data, error } = await sb.from('tiendas').insert(configTienda).select().single()
    if (error) { console.error('Error tienda:', error.message); process.exit(1) }
    tienda = data
    console.log(`✓ Tienda creada: ${tienda.nombre} (${tienda.id})`)
  } else {
    const { error } = await sb.from('tiendas').update(configTienda).eq('id', tienda.id)
    if (error) { console.error('Error actualizando tienda:', error.message); process.exit(1) }
    console.log(`✓ Tienda actualizada: ${tienda.nombre} (${tienda.id})`)
  }

  // ── Crear o actualizar usuario en Supabase Auth ────────────────────────────

  const { data: { users } } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
  const existente = users.find(u => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase())

  if (existente) {
    await sb.auth.admin.updateUserById(existente.id, { password })
    console.log('✓ Usuario actualizado (contraseña regenerada)')
  } else {
    const { error } = await sb.auth.admin.createUser({
      email:         DEMO_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { kiosko: NOMBRE, is_demo: true },
    })
    if (error) { console.error('Error usuario:', error.message); process.exit(1) }
    console.log(`✓ Usuario creado: ${DEMO_EMAIL}`)
  }

  // ── Guardar credenciales en fichero local (nunca en consola) ───────────────

  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify({
    slug:     SLUG,
    email:    DEMO_EMAIL,
    password,
    admin_url: `http://localhost:3000/kiosko-admin/${SLUG}`,
    kiosko_url: `http://localhost:3000/kiosko/${SLUG}`,
    created_at: new Date().toISOString(),
  }, null, 2), 'utf8')

  // ── Resumen (sin credenciales) ─────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────────────────────')
  console.log('  Demo ECI lista')
  console.log('─────────────────────────────────────────────────────────')
  console.log(`  Kiosko: http://localhost:3000/kiosko/${SLUG}`)
  console.log(`  Admin:  http://localhost:3000/kiosko-admin/${SLUG}`)
  console.log(`  Credenciales guardadas en: .eci-demo-credentials`)
  console.log(`  Rate limit maridaje: ${DEMO_DAILY_LIMIT} llamadas/día`)
  console.log('─────────────────────────────────────────────────────────')
  console.log('\n  ⚠  .eci-demo-credentials está gitignoreado.')
  console.log('  No lo compartas por correo ni lo pegues en el chat.\n')
}

main().catch(err => { console.error(err); process.exit(1) })
