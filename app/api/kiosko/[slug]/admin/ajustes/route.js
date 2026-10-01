import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess, getKioskoUser, isKioskoAdminEmail } from '../../../../_lib/kioskoAuth'
import { planTieneCapacidad } from '../../../../_lib/autoFeatured'

const PERMITIDOS = new Set([
  'nombre', 'ciudad', 'descripcion',
  'logo_url', 'color_primario', 'color_acento', 'font_family', 'kiosko_icon_style', 'kiosko_orders_enabled', 'banner_url',
  'informe_email', 'cesta_activa', 'square_location_id', 'escaparate_timeout_segundos',
  'auto_featured_enabled', 'auto_featured_n', 'auto_featured_max_tipo',
])

const ICON_STYLES = new Set(['emoji', 'lineal'])
const COUNTER_ORDERS_IN_DEVELOPMENT = true
const OPTIONAL_MIGRATIONS = {
  kiosko_icon_style: 'supabase/kiosko_icon_style.sql',
  kiosko_orders_enabled: 'supabase/kiosko_assisted_orders.sql',
  cesta_activa: 'supabase/cesta_activa.sql',
  square_access_token: 'supabase/square_access_token.sql',
  square_location_id: 'supabase/square_location_id.sql',
  escaparate_timeout_segundos: 'supabase/escaparate_timeout.sql',
  auto_featured_enabled: 'supabase/auto_featured.sql',
  auto_featured_n: 'supabase/auto_featured.sql',
  auto_featured_max_tipo: 'supabase/auto_featured.sql',
}

// Campos que requieren capacidad autoFeaturedByMargin para ser modificados
const AF_CAMPOS = new Set(['auto_featured_enabled', 'auto_featured_n', 'auto_featured_max_tipo'])

function missingOptionalFields(error, updates) {
  const texto = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  if (!texto.includes('column') && !texto.includes('schema cache') && !texto.includes('pgrst204')) return []
  return Object.keys(OPTIONAL_MIGRATIONS).filter(field => updates[field] !== undefined && texto.includes(field))
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
    await supabaseAdmin
      .from('tiendas')
      .update({ square_access_token: tokenVal })
      .eq('id', access.tienda.id)
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
    if (k === 'escaparate_timeout_segundos') {
      const n = parseInt(v, 10)
      updates[k] = (!isNaN(n) && n >= 0 && n <= 600) ? n : 60
      continue
    }
    if (k === 'auto_featured_enabled') {
      updates[k] = v === true
      continue
    }
    if (k === 'auto_featured_n') {
      updates[k] = v  // validado abajo
      continue
    }
    if (k === 'auto_featured_max_tipo') {
      updates[k] = v  // validado abajo
      continue
    }
    updates[k] = v === '' ? null : v
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 })
  }

  // Control de acceso: rechazar modificación de campos AF si el plan no lo permite.
  // Esta comprobación es en servidor y no depende del estado enviado por el frontend.
  const hayAF = Object.keys(updates).some(k => AF_CAMPOS.has(k))
  if (hayAF && !esMasterAdmin && !planTieneCapacidad(access.tienda, 'autoFeaturedByMargin')) {
    return NextResponse.json(
      { error: 'El plan Premium es necesario para activar o modificar los destacados automáticos' },
      { status: 403 }
    )
  }

  // Validación de rangos para campos AF (400, nunca recortar en silencio)
  if (updates.auto_featured_n !== undefined) {
    const n = parseInt(updates.auto_featured_n, 10)
    if (isNaN(n) || n < 3 || n > 12) {
      return NextResponse.json({ error: 'auto_featured_n debe ser un número entre 3 y 12' }, { status: 400 })
    }
    updates.auto_featured_n = n
  }
  if (updates.auto_featured_max_tipo !== undefined) {
    const mt = parseInt(updates.auto_featured_max_tipo, 10)
    // Si n también viene en este request, max_tipo debe ser ≤ n; si no, lo limitamos a 12
    const maxPermitido = updates.auto_featured_n ?? 12
    if (isNaN(mt) || mt < 1 || mt > maxPermitido) {
      return NextResponse.json(
        { error: `auto_featured_max_tipo debe ser un número entre 1 y ${maxPermitido}` },
        { status: 400 }
      )
    }
    updates.auto_featured_max_tipo = mt
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
