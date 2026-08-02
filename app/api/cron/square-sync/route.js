import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { squareSyncForTienda } from '../../_lib/squareSync'

export const maxDuration = 300

export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  // Nombre/slug para logs
  const { data: tiendas } = await supabaseAdmin
    .from('tiendas')
    .select('id, slug')
    .in('id', tiendaIds)
  const slugMap = Object.fromEntries((tiendas || []).map(t => [t.id, t.slug]))

  const results = []
  for (const tiendaId of tiendaIds) {
    try {
      const result = await squareSyncForTienda(tiendaId, slugMap[tiendaId])
      results.push({ tiendaId, slug: slugMap[tiendaId], ...result })
    } catch (e) {
      console.error(`[cron/square-sync] ${slugMap[tiendaId] || tiendaId}:`, e.message)
      results.push({ tiendaId, slug: slugMap[tiendaId], ok: false, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, synced: results.length, results })
}
