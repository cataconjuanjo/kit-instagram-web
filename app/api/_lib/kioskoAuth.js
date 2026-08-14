import { supabaseAdmin } from '../../lib/supabaseAdmin'

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'cataconjuanjo@gmail.com').toLowerCase()

export const ADMIN_TIENDA_SELECT =
  'id, nombre, slug, logo_url, descripcion, ciudad, color_primario, color_acento, banner_url, font_family, plan, informe_email, trial_expires_at, trial_used_seconds, precio_especial, setup_fee_incluido, activo, subscription_status, propietario_email, email'

export const ADMIN_VINO_SELECT =
  'id, nombre, bodega, tipo, uva, region, pais, anada, precio_pvp, precio_coste, precio_oferta, stock, stock_minimo, ubicacion_estanteria, foto_url, notas_cata, descripcion, puntuacion, destacado, activo, ficha_ia, square_catalog_id, categoria, apto_cesta, es_vegano, con_alcohol, cat_gourmet, sin_gluten'

export const PUBLIC_VINO_SELECT =
  'id, nombre, bodega, tipo, uva, region, pais, anada, precio_pvp, precio_oferta, stock, ubicacion_estanteria, foto_url, notas_cata, descripcion, puntuacion, destacado, activo'

const WRITABLE_VINO_FIELDS = new Set([
  'nombre', 'bodega', 'tipo', 'uva', 'region', 'pais', 'anada',
  'precio_pvp', 'precio_coste', 'precio_oferta', 'stock', 'stock_minimo',
  'ubicacion_estanteria', 'foto_url', 'notas_cata', 'descripcion',
  'puntuacion', 'destacado', 'activo', 'categoria',
  'apto_cesta', 'es_vegano', 'con_alcohol', 'cat_gourmet', 'sin_gluten',
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

// Una tienda es accesible públicamente si está activa y tiene suscripción vigente
// o un trial aún no agotado (límite: 3600 segundos de uso en el admin).
export function isTiendaAccesible(tienda) {
  if (!tienda?.activo) return false
  if (tienda.subscription_status === 'active') return true
  if (tienda.plan === 'trial' && (tienda.trial_used_seconds ?? 0) < 3600) return true
  return false
}

export async function getPublicTienda(slug) {
  const publicSelect =
    'id, nombre, slug, logo_url, descripcion, ciudad, color_primario, color_acento, banner_url, font_family, plan, activo, subscription_status, trial_used_seconds'

  const { data, error } = await supabaseAdmin
    .from('tiendas')
    .select(publicSelect)
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (error) {
    console.error('[getPublicTienda]', slug, error.message)
    return null
  }

  return isTiendaAccesible(data) ? data : null
}
