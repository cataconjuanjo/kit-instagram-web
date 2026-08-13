import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

try { process.loadEnvFile('.env.local') } catch {}

const ENCRYPTED_PREFIX = 'tpv:v1:'
const args = process.argv.slice(2)

function hasArg(name) {
  return args.includes(name)
}

function option(name) {
  const exact = args.find(arg => arg.startsWith(`${name}=`))
  if (exact) return exact.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

function usage() {
  console.log(`
Usage:
  node scripts/migrate-square-credentials-encrypted.mjs [--slug tienda] [--apply] [--clear-legacy]
  node scripts/migrate-square-credentials-encrypted.mjs --restore-legacy [--slug tienda] [--apply]

Defaults to dry-run. No token values are printed.
`)
}

if (hasArg('--help') || hasArg('-h')) {
  usage()
  process.exit(0)
}

const APPLY = hasArg('--apply')
const CLEAR_LEGACY = hasArg('--clear-legacy')
const RESTORE_LEGACY = hasArg('--restore-legacy')
const SLUG = option('--slug')

if (RESTORE_LEGACY && CLEAR_LEGACY) {
  throw new Error('--restore-legacy and --clear-legacy cannot be combined')
}

function encryptionMaterial() {
  return (
    process.env.TPV_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.SQUARE_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.CREDENTIALS_ENCRYPTION_KEY ||
    process.env.SALA_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim()
}

function encryptionKey() {
  const material = encryptionMaterial()
  if (!material) throw new Error('TPV credential encryption key is not configured')
  return crypto.createHash('sha256').update(material).digest()
}

function encode(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function decode(value) {
  return Buffer.from(value, 'base64url')
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX)
}

function encrypt(value) {
  const plain = String(value || '').trim()
  if (!plain) return null
  if (isEncrypted(plain)) return plain

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENCRYPTED_PREFIX}${encode(iv)}.${encode(tag)}.${encode(encrypted)}`
}

function decrypt(value) {
  const stored = String(value || '').trim()
  if (!stored) return null
  if (!isEncrypted(stored)) return stored

  const payload = stored.slice(ENCRYPTED_PREFIX.length)
  const [ivPart, tagPart, encryptedPart] = payload.split('.')
  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error('Invalid encrypted TPV credential format')
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), decode(ivPart))
  decipher.setAuthTag(decode(tagPart))
  return Buffer.concat([
    decipher.update(decode(encryptedPart)),
    decipher.final(),
  ]).toString('utf8')
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let query = supabase
    .from('tiendas')
    .select('id, slug, square_access_token, square_access_token_encrypted')
    .order('slug')

  if (SLUG) query = query.eq('slug', SLUG)

  const { data: tiendas, error } = await query
  if (error) {
    if (/square_access_token_encrypted|schema cache|pgrst204|column/i.test(error.message || '')) {
      throw new Error('Column square_access_token_encrypted is missing. Apply supabase/encrypt_square_credentials.sql first.')
    }
    throw error
  }

  let touched = 0
  let skipped = 0

  for (const tienda of tiendas || []) {
    const legacy = String(tienda.square_access_token || '').trim()
    const encrypted = String(tienda.square_access_token_encrypted || '').trim()

    if (RESTORE_LEGACY) {
      if (!encrypted) {
        skipped++
        continue
      }
      const updates = { square_access_token: decrypt(encrypted) }
      touched++
      console.log(`${APPLY ? 'restore' : 'dry-restore'} ${tienda.slug}`)
      if (APPLY) {
        const { error: updateError } = await supabase.from('tiendas').update(updates).eq('id', tienda.id)
        if (updateError) throw updateError
      }
      continue
    }

    if (!legacy && encrypted) {
      skipped++
      continue
    }
    if (!legacy) {
      skipped++
      continue
    }

    const updates = { square_access_token_encrypted: encrypt(legacy) }
    if (CLEAR_LEGACY) updates.square_access_token = null

    touched++
    console.log(`${APPLY ? 'migrate' : 'dry-migrate'} ${tienda.slug}${CLEAR_LEGACY ? ' clear-legacy' : ''}`)
    if (APPLY) {
      const { error: updateError } = await supabase.from('tiendas').update(updates).eq('id', tienda.id)
      if (updateError) throw updateError
    }
  }

  console.log(`${APPLY ? 'done' : 'dry-run'}: ${touched} touched, ${skipped} skipped`)
  if (!APPLY) console.log('Run again with --apply to write changes.')
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
