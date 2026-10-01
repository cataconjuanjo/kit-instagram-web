import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import {
  ADMIN_TIENDA_SELECT,
  getPublicTienda,
  requireKioskoAccess,
} from '../../../_lib/kioskoAuth'
import { planTieneCapacidad, getAutoFeaturedIds } from '../../../_lib/autoFeatured'
import { noStoreHeaders, publicCdnCacheHeaders } from '../../../../lib/publicCacheHeaders'

const OPTIONAL_COLS = 'kiosko_icon_style, kiosko_orders_enabled, cesta_activa, square_access_token'
// Columnas con migrations independientes — se consultan por separado para no romper
// las anteriores si alguna migración aún no se ha ejecutado en producción.
const OPTIONAL_COLS_V2 = 'escaparate_timeout_segundos'
// Columnas de destacados automáticos — requieren supabase/auto_featured.sql
const OPTIONAL_COLS_AF = 'auto_featured_enabled, auto_featured_n, auto_featured_max_tipo'

async function getOptionalCols(slug) {
  const { data } = await supabaseAdmin
    .from('tiendas')
    .select(OPTIONAL_COLS)
    .eq('slug', slug)
    .single()
  const base = data ? (() => {
    const { square_access_token, ...rest } = data
    return { ...rest, has_square_token: !!square_access_token }
  })() : {}

  // Si la migración escaparate_timeout.sql no está aplicada aún, este SELECT
  // falla en silencio y el kiosko usa el default de 60 s.
  const { data: v2 } = await supabaseAdmin
    .from('tiendas')
    .select(OPTIONAL_COLS_V2)
    .eq('slug', slug)
    .single()

  return { ...base, ...(v2 || {}) }
}

// Si la migración auto_featured.sql no está aplicada, devuelve {} sin error.
async function getAutoFeaturedCols(slug) {
  const { data } = await supabaseAdmin
    .from('tiendas')
    .select(OPTIONAL_COLS_AF)
    .eq('slug', slug)
    .single()
  return data || {}
}

export async function GET(request, { params }) {
  const { slug } = await params
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()

  if (token) {
    const access = await requireKioskoAccess(request, slug, { select: ADMIN_TIENDA_SELECT })
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
    const [extra, afCols] = await Promise.all([getOptionalCols(slug), getAutoFeaturedCols(slug)])
    return NextResponse.json(
      { tienda: { ...access.tienda, ...extra, ...afCols } },
      { headers: noStoreHeaders() }
    )
  }

  const tienda = await getPublicTienda(slug)
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const [extra, afCols] = await Promise.all([getOptionalCols(slug), getAutoFeaturedCols(slug)])

  // Calcular IDs automáticos solo si está habilitado Y el plan actual lo permite.
  // Si el plan no lo permite (downgrade), se ignora el flag y el kiosko usa los manuales.
  // precio_coste y margen nunca salen de getAutoFeaturedIds.
  let autoFeaturedIds
  if (afCols.auto_featured_enabled && planTieneCapacidad(tienda, 'autoFeaturedByMargin')) {
    autoFeaturedIds = await getAutoFeaturedIds(
      tienda.id,
      afCols.auto_featured_n ?? 8,
      afCols.auto_featured_max_tipo ?? 3,
    )
  }

  return NextResponse.json(
    {
      tienda: {
        ...tienda,
        ...extra,
        // Solo se incluye auto_featured_ids si hay IDs (array no vacío).
        // Los valores de configuración (enabled, n, max_tipo) NO se exponen en el payload público.
        ...(autoFeaturedIds?.length ? { auto_featured_ids: autoFeaturedIds } : {}),
      },
    },
    { headers: publicCdnCacheHeaders({ cdnMaxAge: 60, staleWhileRevalidate: 300 }) }
  )
}
