import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import {
  ADMIN_TIENDA_SELECT,
  getPublicTienda,
  requireKioskoAccess,
} from '../../../_lib/kioskoAuth'
import { noStoreHeaders, publicCdnCacheHeaders } from '../../../../lib/publicCacheHeaders'
import {
  hasSquareAccessToken,
  missingEncryptedCredentialColumn,
} from '../../../../lib/tpvCredentials'

const OPTIONAL_COLS = 'kiosko_icon_style, kiosko_orders_enabled, cesta_activa, square_access_token, square_access_token_encrypted'
const LEGACY_OPTIONAL_COLS = 'kiosko_icon_style, kiosko_orders_enabled, cesta_activa, square_access_token'

async function getOptionalCols(slug) {
  let { data, error } = await supabaseAdmin
    .from('tiendas')
    .select(OPTIONAL_COLS)
    .eq('slug', slug)
    .single()

  if (error && missingEncryptedCredentialColumn(error)) {
    const legacy = await supabaseAdmin
      .from('tiendas')
      .select(LEGACY_OPTIONAL_COLS)
      .eq('slug', slug)
      .single()
    data = legacy.data
    error = legacy.error
  }

  if (error || !data) return {}
  // Nunca exponer el token real al frontend; solo indicar si está configurado
  const { square_access_token, square_access_token_encrypted, ...rest } = data
  return { ...rest, has_square_token: hasSquareAccessToken(data) }
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
