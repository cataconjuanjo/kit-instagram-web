import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import {
  ADMIN_TIENDA_SELECT,
  getPublicTienda,
  requireKioskoAccess,
} from '../../../_lib/kioskoAuth'

// Columnas añadidas por migraciones opcionales — pueden no existir en todos los entornos
const OPTIONAL_COLS = 'kiosko_icon_style, kiosko_orders_enabled'

async function getOptionalCols(slug) {
  const { data } = await supabaseAdmin
    .from('tiendas')
    .select(OPTIONAL_COLS)
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
    const extra = await getOptionalCols(slug)
    return NextResponse.json({ tienda: { ...access.tienda, ...extra } })
  }

  const tienda = await getPublicTienda(slug)
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const extra = await getOptionalCols(slug)
  return NextResponse.json({ tienda: { ...tienda, ...extra } })
}
