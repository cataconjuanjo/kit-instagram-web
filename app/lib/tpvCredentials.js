import crypto from 'crypto'

const ENCRYPTED_PREFIX = 'tpv:v1:'

export const SQUARE_TOKEN_FIELD = 'square_access_token'
export const SQUARE_ENCRYPTED_TOKEN_FIELD = 'square_access_token_encrypted'

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
  if (!material) {
    throw new Error('TPV credential encryption key is not configured')
  }
  return crypto.createHash('sha256').update(material).digest()
}

function encode(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

function decode(value) {
  return Buffer.from(value, 'base64url')
}

export function isEncryptedTpvCredential(value) {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX)
}

export function encryptTpvCredential(value) {
  const plain = String(value || '').trim()
  if (!plain) return null
  if (isEncryptedTpvCredential(plain)) return plain

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${ENCRYPTED_PREFIX}${encode(iv)}.${encode(tag)}.${encode(encrypted)}`
}

export function decryptTpvCredential(value) {
  const stored = String(value || '').trim()
  if (!stored) return null
  if (!isEncryptedTpvCredential(stored)) return stored

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

export function resolveSquareAccessToken(row) {
  const encrypted = row?.[SQUARE_ENCRYPTED_TOKEN_FIELD]
  if (encrypted) {
    return {
      token: decryptTpvCredential(encrypted),
      source: 'tienda_encrypted',
    }
  }

  const legacy = String(row?.[SQUARE_TOKEN_FIELD] || '').trim()
  if (legacy) {
    return {
      token: decryptTpvCredential(legacy),
      source: isEncryptedTpvCredential(legacy) ? 'tienda_encrypted_legacy' : 'tienda_legacy',
    }
  }

  return { token: null, source: null }
}

export function hasSquareAccessToken(row) {
  return Boolean(
    String(row?.[SQUARE_ENCRYPTED_TOKEN_FIELD] || '').trim() ||
    String(row?.[SQUARE_TOKEN_FIELD] || '').trim()
  )
}

export function missingEncryptedCredentialColumn(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    text.includes(SQUARE_ENCRYPTED_TOKEN_FIELD) ||
    text.includes('schema cache') ||
    text.includes('pgrst204') ||
    text.includes('column')
  )
}
