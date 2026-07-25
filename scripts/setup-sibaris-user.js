/**
 * Crea usuario Supabase Auth para Sibaris Gourmet
 * y lo asigna a su tienda via propietario_email.
 *
 * Uso: node scripts/setup-sibaris-user.js
 */

const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

// Leer .env.local manualmente
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=')
  if (k && v.length) process.env[k.trim()] = v.join('=').trim()
})

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const EMAIL   = 'vregalado@sibarisgourmet.com'
const TIENDA_SLUG = 'sibaris-gourmet'

async function main() {
  // 1. Crear usuario en Auth (confirmado, sin contraseña → se la pondrá via magic link)
  console.log(`Creando usuario Auth: ${EMAIL}`)
  const { data: authData, error: authError } = await sb.auth.admin.createUser({
    email: EMAIL,
    email_confirm: true,
  })
  if (authError && !authError.message.includes('already been registered')) {
    console.error('Error creando usuario:', authError.message)
    process.exit(1)
  }
  if (authError?.message.includes('already been registered')) {
    console.log('⚠️  El usuario ya existía en Auth — continuando.')
  } else {
    console.log('✓ Usuario creado:', authData.user.id)
  }

  // 2. Asignar propietario_email en la tienda
  console.log(`Asignando ${EMAIL} a tienda ${TIENDA_SLUG}`)
  const { error: updError } = await sb
    .from('tiendas')
    .update({ propietario_email: EMAIL })
    .eq('slug', TIENDA_SLUG)
  if (updError) {
    console.error('Error actualizando tienda:', updError.message)
    process.exit(1)
  }
  console.log('✓ propietario_email actualizado')

  // 3. Generar enlace de invitación (para que el cliente pueda poner su contraseña)
  console.log('Generando enlace de acceso...')
  const { data: linkData, error: linkError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
  })
  if (linkError) {
    console.error('Error generando enlace:', linkError.message)
  } else {
    console.log('\n✅ Todo listo. Enlace de acceso para el cliente:\n')
    console.log(linkData.properties?.action_link || linkData.action_link)
    console.log('\nEnvía este enlace a vregalado@sibarisgourmet.com')
    console.log('Caducidad: 1 hora. Si caduca, genera uno nuevo desde Supabase > Auth > Users.')
  }
}

main()
