import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess, getKioskoUser, isKioskoAdminEmail } from '../../../../_lib/kioskoAuth'
import {
  encryptTpvCredential,
  missingEncryptedCredentialColumn,
} from '../../../../../lib/tpvCredentials'

const PERMITIDOS = new Set([
  'nombre', 'ciudad', 'descripcion',
  'logo_url', 'color_primario', 'color_acento', 'font_family', 'kiosko_icon_style', 'kiosko_orders_enabled', 'banner_url',
  'informe_email', 'cesta_activa',
])

const ICON_STYLES = new Set(['emoji', 'lineal'])
const COUNTER_ORDERS_IN_DEVELOPMENT = true
const OPTIONAL_MIGRATIONS = {
  kiosko_icon_style: 'supabase/kiosko_icon_style.sql',
  kiosko_orders_enabled: 'supabase/kiosko_assisted_orders.sql',
  cesta_activa: 'supabase/cesta_activa.sql',
  square_access_token: 'supabase/square_access_token.sql',
  square_access_token_encrypted: 'supabase/encrypt_square_credentials.sql',
}

function missingOptionalFields(error, updates) {
  const texto = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  if (!texto.includes('column') && !texto.includes('schema cache') && !texto.includes('pgrst204')) return []
  return Object.keys(OPTIONAL_MIGRATIONS).filter(field => updates[field] !== undefined && texto.includes(field))
}

function keepLegacyPlaintextCredential() {
  return ['1', 'true', 'yes'].includes(
    String(process.env.TPV_CREDENTIALS_KEEP_LEGACY_PLAINTEXT || '').toLowerCase()
  )
}

async function updateSquareAccessToken(tiendaId, tokenVal) {
  let encryptedToken = null

  if (tokenVal) {
    try {
      encryptedToken = encryptTpvCredential(tokenVal)
    } catch (error) {
      console.error('[kiosko-ajustes] No se pudo cifrar la credencial Square:', error.message)
    }
  }

  if (encryptedToken || !tokenVal) {
    const updates = {
      square_access_token_encrypted: encryptedToken,
      square_access_token: keepLegacyPlaintextCredential() ? tokenVal : null,
    }

    const { error } = await supabaseAdmin
      .from('tiendas')
      .update(updates)
      .eq('id', tiendaId)

    if (!error) return { encrypted: Boolean(encryptedToken) }
    if (!missingEncryptedCredentialColumn(error)) throw error
  }

  const { error: legacyError } = await supabaseAdmin
    .from('tiendas')
    .update({ square_access_token: tokenVal })
    .eq('id', tiendaId)

  if (legacyError) throw legacyError
  return { encrypted: false }
}

export async function PATCH(request, { params }) {
  const { slug } = await params

  const auth = await getKioskoUser(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const esMasterAdmin = isKioskoAdminEmail(auth.email)

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  // square_access_token: cualquier propietario puede configurar el suyo
  if (body.square_access_token !== undefined) {
    const tokenVal = (body.square_access_token || '').trim() || null
    await updateSquareAccessToken(access.tienda.id, tokenVal)
    // Si solo venía el token, devolver OK
    const soloToken = Object.keys(body).every(k => k === 'square_access_token')
    if (soloToken) return NextResponse.json({ ok: true })
  }

  const updates = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'square_access_token') continue
    if (!PERMITIDOS.has(k)) continue
    if (k === 'kiosko_icon_style') {
      const value = String(v || '').trim()
      updates[k] = ICON_STYLES.has(value) ? value : 'emoji'
      continue
    }
    if (k === 'kiosko_orders_enabled') {
      if (COUNTER_ORDERS_IN_DEVELOPMENT) continue
      updates[k] = v === true
      continue
    }
    if (k === 'cesta_activa') {
      updates[k] = v === true
      continue
    }
    updates[k] = v === '' ? null : v
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 })
  }

  let { error } = await supabaseAdmin
    .from('tiendas').update(updates).eq('id', access.tienda.id)

  const missingOptionals = error ? missingOptionalFields(error, updates) : []
  if (error && missingOptionals.length) {
    const updatesSinOpcionales = Object.fromEntries(
      Object.entries(updates).filter(([key]) => !missingOptionals.includes(key))
    )

    if (!Object.keys(updatesSinOpcionales).length) {
      return NextResponse.json({
        error: `Aplica la migracion ${OPTIONAL_MIGRATIONS[missingOptionals[0]]} para guardar esta preferencia`,
      }, { status: 409 })
    }

    const fallback = await supabaseAdmin
      .from('tiendas').update(updatesSinOpcionales).eq('id', access.tienda.id)

    error = fallback.error
    if (!error) {
      return NextResponse.json({
        ok: true,
        warning: `Preferencia pendiente de migracion: ${missingOptionals.map(field => OPTIONAL_MIGRATIONS[field]).join(', ')}`,
      })
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
