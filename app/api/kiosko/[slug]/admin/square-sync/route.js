import { NextResponse } from 'next/server'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'
import { squareSyncForTienda } from '../../../../../api/_lib/squareSync'

export const maxDuration = 120

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  if (!process.env.SQUARE_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'SQUARE_ACCESS_TOKEN no configurado en Vercel' }, { status: 500 })
  }

  try {
    const result = await squareSyncForTienda(access.tienda.id, slug)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[square-sync]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
