/**
 * purge-eci-demo.js
 *
 * Elimina la tienda demo ECI Gourmet, todos sus datos y los assets locales.
 * Uso:
 *   node scripts/purge-eci-demo.js            → solicita confirmación
 *   node scripts/purge-eci-demo.js --confirm  → ejecuta sin preguntar
 */

'use strict'
const { createClient } = require('@supabase/supabase-js')
const fs   = require('fs')
const path = require('path')
const rl   = require('readline')

;(function loadEnv(file = '.env.local') {
  try {
    let content = fs.readFileSync(file, 'utf8')
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
    for (let raw of content.split('\n')) {
      raw = raw.replace(/\r$/, '')
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const stripped = line.startsWith('export ') ? line.slice(7).trim() : line
      const eq = stripped.indexOf('=')
      if (eq < 0) continue
      const k = stripped.slice(0, eq).trim()
      if (!k || !/^[A-Z_][A-Z0-9_]*$/i.test(k)) continue
      let v = stripped.slice(eq + 1)
      const vt = v.trim()
      if ((vt[0] === '"' && vt[vt.length - 1] === '"') || (vt[0] === "'" && vt[vt.length - 1] === "'")) v = vt.slice(1, -1)
      else v = v.split(' #')[0].split('\t#')[0].trim()
      if (v && !process.env[k]) process.env[k] = v
    }
  } catch {}
})()

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const SLUG             = 'eci-gourmet-k7x2'
const DEMO_EMAIL       = `demo-eci-${SLUG}@kiosko.internal`
const CREDENTIALS_FILE = path.join(process.cwd(), '.eci-demo-credentials')
const ASSETS_DIR       = path.join(process.cwd(), 'public', 'assets', 'eci-gourmet-demo')
const CONFIRM          = process.argv.includes('--confirm')

async function confirm(msg) {
  if (CONFIRM) return true
  const iface = rl.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    iface.question(`${msg} [s/N] `, ans => {
      iface.close()
      resolve(ans.toLowerCase() === 's')
    })
  })
}

function rmDirRecursive(dir) {
  if (!fs.existsSync(dir)) return
  fs.rmSync(dir, { recursive: true, force: true })
}

async function main() {
  console.log(`\n▶ demo:purge — slug: ${SLUG}`)

  // 1. Buscar tienda
  const { data: tienda } = await sb.from('tiendas').select('id').eq('slug', SLUG).single()
  if (!tienda) {
    console.log('  Tienda no encontrada — nada que borrar en BD.')
  }

  const ok = await confirm('  ¿Eliminar tienda, datos y assets de la demo ECI?')
  if (!ok) { console.log('  Cancelado.\n'); process.exit(0) }

  if (tienda) {
    const id = tienda.id

    // 2. Borrar datos relacionados
    const tablas = [
      'vinos_tienda',
      'kiosko_leads',
      'kiosko_funnel_events',
      'kiosko_orders',
      'rate_limits',
    ]
    for (const tabla of tablas) {
      const col = tabla === 'rate_limits' ? 'ip' : 'tienda_id'
      if (tabla === 'rate_limits') {
        const { error } = await sb.from(tabla).delete().like('ip', `tienda:${id}%`)
        if (error) console.warn(`  ⚠ ${tabla}:`, error.message)
        else console.log(`  ✓ rate_limits demo purgados`)
        continue
      }
      const { error } = await sb.from(tabla).delete().eq(col, id)
      if (error) console.warn(`  ⚠ ${tabla}:`, error.message)
      else console.log(`  ✓ ${tabla} eliminados`)
    }

    // 3. Borrar tienda
    const { error: errTienda } = await sb.from('tiendas').delete().eq('id', id)
    if (errTienda) console.error('  ✗ tienda:', errTienda.message)
    else console.log('  ✓ tienda eliminada')
  }

  // 4. Borrar usuario de auth
  const { data: { users } } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 })
  const demoUser = users?.find(u => u.email === DEMO_EMAIL)
  if (demoUser) {
    const { error } = await sb.auth.admin.deleteUser(demoUser.id)
    if (error) console.warn('  ⚠ auth user:', error.message)
    else console.log(`  ✓ usuario auth eliminado`)
  }

  // 5. Borrar .eci-demo-credentials
  if (fs.existsSync(CREDENTIALS_FILE)) {
    fs.unlinkSync(CREDENTIALS_FILE)
    console.log('  ✓ .eci-demo-credentials eliminado')
  }

  // 6. Borrar assets locales
  if (fs.existsSync(ASSETS_DIR)) {
    rmDirRecursive(ASSETS_DIR)
    console.log('  ✓ public/assets/eci-gourmet-demo/ eliminado')
  } else {
    console.log('  — assets ya eliminados o no existen')
  }

  console.log('\n✓ Demo ECI purgada.\n')
}

main().catch(err => { console.error('\n✗', err.message); process.exit(1) })
