/**
 * Crea el usuario de prueba para Sibaris Gourmet y lo vincula a la tienda.
 *
 * Uso:
 *   node scripts/seed-sibaris-kiosko.js
 *
 * Para cambiar al email real del cliente cuando contraten:
 *   node scripts/seed-sibaris-kiosko.js --email real@cliente.com
 */

const { createClient } = require('@supabase/supabase-js')

try { process.loadEnvFile('.env.local') } catch {}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const args      = process.argv.slice(2)
const emailIdx  = args.indexOf('--email')
const EMAIL     = emailIdx !== -1 ? args[emailIdx + 1] : 'kiosko@sibaris-gourmet.com'
const PASSWORD  = 'Sibaris2025!'
const SLUG      = 'sibaris-gourmet'
const NOMBRE    = 'Sibaris Gourmet'

async function main() {
  console.log(`\n▶ Email: ${EMAIL}`)
  console.log(`▶ Slug:  ${SLUG}\n`)

  // 1. Crear o recuperar tienda
  let { data: tienda } = await sb.from('tiendas').select('id, nombre, email').eq('slug', SLUG).single()

  if (!tienda) {
    console.log('→ Creando tienda...')
    const { data, error } = await sb.from('tiendas').insert({
      nombre:             NOMBRE,
      email:              EMAIL,
      slug:               SLUG,
      ciudad:             'Málaga',
      color_primario:     '#1a1a2e',
      color_acento:       '#c9a96e',
      activo:             true,
      subscription_status: 'active',
    }).select().single()
    if (error) { console.error('Error tienda:', error.message); process.exit(1) }
    tienda = data
    console.log(`✓ Tienda creada: ${tienda.nombre} (${tienda.id})`)
  } else {
    // Actualizar email en la tienda
    await sb.from('tiendas').update({ email: EMAIL, activo: true, subscription_status: 'active' }).eq('id', tienda.id)
    console.log(`✓ Tienda encontrada: ${tienda.nombre} — email actualizado a ${EMAIL}`)
  }

  // 2. Crear usuario en Supabase Auth (si no existe)
  const { data: { users } } = await sb.auth.admin.listUsers({ page: 1, perPage: 100 })
  const existente = users.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase())

  if (existente) {
    console.log(`✓ Usuario ya existe: ${existente.email}`)
    // Actualizar contraseña por si acaso
    await sb.auth.admin.updateUserById(existente.id, { password: PASSWORD })
    console.log(`✓ Contraseña actualizada`)
  } else {
    const { data: nuevo, error } = await sb.auth.admin.createUser({
      email:         EMAIL,
      password:      PASSWORD,
      email_confirm: true,
      user_metadata: { kiosko: NOMBRE },
    })
    if (error) { console.error('Error usuario:', error.message); process.exit(1) }
    console.log(`✓ Usuario creado: ${nuevo.user.email}`)
  }

  console.log('\n─────────────────────────────────────────')
  console.log('  Credenciales de prueba')
  console.log('─────────────────────────────────────────')
  console.log(`  Email:      ${EMAIL}`)
  console.log(`  Contraseña: ${PASSWORD}`)
  console.log(`  Login:      http://localhost:3000/login`)
  console.log(`  Panel:      http://localhost:3000/kiosko-admin/${SLUG}`)
  console.log('─────────────────────────────────────────')
  console.log('\nCuando el cliente contrate, ejecuta:')
  console.log(`  node scripts/seed-sibaris-kiosko.js --email correo@real.com\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
