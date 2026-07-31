import { supabaseAdmin } from '../../lib/supabaseAdmin'

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com').toLowerCase()

export const ADMIN_TIENDA_SELECT =
  'id, nombre, slug, logo_url, descripcion, ciudad, color_primario, color_acento, banner_url, font_family, plan, informe_email, trial_expires_at, trial_used_seconds, precio_especial, setup_fee_incluido, activo, subscription_status, propietario_email, email'

export const ADMIN_VINO_SELECT =
  'id, nombre, bodega, tipo, uva, region, pais, anada, precio_pvp, precio_coste, precio_oferta, stock, stock_minimo, ubicacion_estanteria, foto_url, notas_cata, descripcion, puntuacion, destacado, activo, ficha_ia, square_catalog_id'

export const PUBLIC_VINO_SELECT =
  'id, nombre, bodega, tipo, uva, region, pais, anada, precio_pvp, precio_oferta, stock, ubicacion_estanteria, foto_url, notas_cata, descripcion, puntuacion, destacado, activo'

const WRITABLE_VINO_FIELDS = new Set([
  'nombre', 'bodega', 'tipo', 'uva', 'region', 'pais', 'anada',
  'precio_pvp', 'precio_coste', 'precio_oferta', 'stock', 'stock_minimo',
  'ubicacion_estanteria', 'foto_url', 'notas_cata', 'descripcion',
  'puntuacion', 'destacado', 'activo',
])

export function pickWritableVinoFields(body) {
  const result = {}
  for (const [key, value] of Object.entries(body || {})) {
    if (WRITABLE_VINO_FIELDS.has(key)) result[key] = value
  }
  return result
}

export function isKioskoAdminEmail(email) {
  return Boolean(email && email.toLowerCase() === ADMIN_EMAIL)
}

export async function getKioskoUser(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: 'No autorizado', status: 401 }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: 'Token inválido', status: 401 }

  return { email: user.email, user }
}

export async function requireKioskoAccess(request, slug, { select = 'id, plan, propietario_email, email, activo' } = {}) {
  const auth = await getKioskoUser(request)
  if (auth.error) return auth

  const { data: tienda, error } = await supabaseAdmin
    .from('tiendas')
    .select(select)
    .eq('slug', slug)
    .single()

  if (error || !tienda) return { error: 'Tienda no encontrada', status: 404 }

  const userEmail = auth.email
  const propietario = tienda.propietario_email || tienda.email

  if (!isKioskoAdminEmail(userEmail) && userEmail !== propietario) {
    return { error: 'Sin acceso a esta tienda', status: 403 }
  }

  return { tienda }
}

export async function getPublicTienda(slug) {
  // Solo columnas que existen en todas las versiones del schema (sin columnas de migraciones opcionales)
  const publicSelect =
    'id, nombre, slug, logo_url, descripcion, ciudad, color_primario, color_acento, banner_url, font_family, plan, activo'

  const { data, error } = await supabaseAdmin
    .from('tiendas')
    .select(publicSelect)
    .eq('slug', slug)
    .single()

  if (error) {
    console.error('[getPublicTienda]', slug, error.message)
    return null
  }

  return data || null
}
