import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import {
  ADMIN_TIENDA_SELECT,
  getPublicTienda,
  requireKioskoAccess,
} from '../../../_lib/kioskoAuth'
import { noStoreHeaders, publicCdnCacheHeaders } from '../../../../lib/publicCacheHeaders'

const OPTIONAL_COLS = 'kiosko_icon_style, kiosko_orders_enabled, cesta_activa, square_access_token'
// Columnas con migrations independientes — se consultan por separado para no romper
// las anteriores si alguna migración aún no se ha ejecutado en producción.
const OPTIONAL_COLS_V2 = 'escaparate_timeout_segundos'

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

export async function GET(request, { params }) {
  const { slug } = await params
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()

  if (token) {
    const access = await requireKioskoAccess(request, slug, { select: ADMIN_TIENDA_SELECT })
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
    const extra = await getOptionalCols(slug)
    return NextResponse.json(
      { tienda: { ...access.tienda, ...extra } },
      { headers: noStoreHeaders() }
    )
  }

  const tienda = await getPublicTienda(slug)
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const extra = await getOptionalCols(slug)
  return NextResponse.json(
    { tienda: { ...tienda, ...extra } },
    { headers: publicCdnCacheHeaders({ cdnMaxAge: 60, staleWhileRevalidate: 300 }) }
  )
}
