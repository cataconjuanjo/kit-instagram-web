import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  isSquareSyncGloballyPaused,
  isSquareSyncTemporarilyPaused,
  squareSyncForTienda,
  squareSyncPausedPayload,
} from '../../_lib/squareSync'

export const maxDuration = 300

export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
  }
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isSquareSyncGloballyPaused()) {
    return NextResponse.json(squareSyncPausedPayload({}, 'cron_square_sync'))
  }

  if (!process.env.SQUARE_ACCESS_TOKEN) {
    return NextResponse.json({ ok: false, error: 'SQUARE_ACCESS_TOKEN no configurado' })
  }

  // Tiendas que tienen productos Square vinculados
  const { data: rows, error } = await supabaseAdmin
    .from('vinos_tienda')
    .select('tienda_id')
    .not('square_catalog_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tiendaIds = [...new Set((rows || []).map(r => r.tienda_id))]
  if (!tiendaIds.length) return NextResponse.json({ ok: true, message: 'Sin tiendas Square', synced: 0 })

  // Nombre/slug/ubicacion para logs e inventario Square
  const { data: tiendas } = await supabaseAdmin
    .from('tiendas')
    .select('id, slug, square_location_id')
    .in('id', tiendaIds)
  const tiendaMap = Object.fromEntries((tiendas || []).map(t => [t.id, t]))
  const slugMap = Object.fromEntries((tiendas || []).map(t => [t.id, t.slug]))

  const results = []
  for (const tiendaId of tiendaIds) {
    const tienda = { id: tiendaId, slug: slugMap[tiendaId] }
    if (isSquareSyncTemporarilyPaused(tienda)) {
      results.push({
        tiendaId,
        slug: tienda.slug,
        ...squareSyncPausedPayload(tienda, 'cron_square_sync'),
        insertados: 0,
        actualizados: 0,
        errores: 0,
        total: 0,
        stockSincronizados: 0,
      })
      continue
    }

    try {
      const result = await squareSyncForTienda(tiendaId, slugMap[tiendaId], process.env.SQUARE_ACCESS_TOKEN, {
        locationId: tiendaMap[tiendaId]?.square_location_id || process.env.SQUARE_LOCATION_ID || null,
      })
      results.push({ tiendaId, slug: slugMap[tiendaId], ...result })
    } catch (e) {
      console.error(`[cron/square-sync] ${slugMap[tiendaId] || tiendaId}:`, e.message)
      results.push({ tiendaId, slug: slugMap[tiendaId], ok: false, error: e.message })
    }
  }

  // Limpiar registros de processed_payments de más de 30 días
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  await supabaseAdmin.from('processed_payments').delete().lt('created_at', cutoff)

  return NextResponse.json({ ok: true, synced: results.length, results })
}
