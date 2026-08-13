import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'
import {
  isSquareSyncTemporarilyPaused,
  squareSyncForTienda,
  squareSyncPausedPayload,
} from '../../../../../api/_lib/squareSync'

export const maxDuration = 120

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  const tienda = { ...access.tienda, slug }
  if (isSquareSyncTemporarilyPaused(tienda)) {
    return NextResponse.json(
      {
        ...squareSyncPausedPayload(tienda, 'admin_square_sync'),
        ok: false,
        error: 'Sincronizacion con Square pausada temporalmente para esta tienda.',
      },
      { status: 423 }
    )
  }

  // Obtener el token de Square específico de esta tienda
  const { data: tiendaData } = await supabaseAdmin
    .from('tiendas')
    .select('square_access_token')
    .eq('id', access.tienda.id)
    .single()

  const squareToken = tiendaData?.square_access_token || process.env.SQUARE_ACCESS_TOKEN

  if (!squareToken) {
    return NextResponse.json(
      { error: 'Esta tienda no tiene un token de Square configurado. Ve a Ajustes → Square.' },
      { status: 400 }
    )
  }

  try {
    const result = await squareSyncForTienda(access.tienda.id, slug, squareToken)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[square-sync]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
