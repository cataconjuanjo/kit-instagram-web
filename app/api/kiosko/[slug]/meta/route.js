import { NextResponse } from 'next/server'
import {
  ADMIN_TIENDA_SELECT,
  getPublicTienda,
  requireKioskoAccess,
} from '../../../_lib/kioskoAuth'

export async function GET(request, { params }) {
  const { slug } = await params
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()

  if (token) {
    const access = await requireKioskoAccess(request, slug, { select: ADMIN_TIENDA_SELECT })
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
    return NextResponse.json({ tienda: access.tienda })
  }

  const tienda = await getPublicTienda(slug)
  if (!tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  return NextResponse.json({ tienda })
}
