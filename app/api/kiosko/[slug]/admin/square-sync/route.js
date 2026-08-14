import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'
import {
  isSquareSyncTemporarilyPaused,
  squareStockReconcileDryRunForTienda,
  squareStockReconcileForTienda,
  squareSyncDryRunForTienda,
  squareSyncForTienda,
  squareSyncPausedPayload,
} from '../../../../../api/_lib/squareSync'

export const maxDuration = 300

const TRUE_PARAM = /^(1|true|yes|on)$/i

function isDryRunRequest(request) {
  const url = new URL(request.url)
  return TRUE_PARAM.test(String(url.searchParams.get('dryRun') || url.searchParams.get('dry_run') || '').trim())
}

function isStockReconcileRequest(request) {
  const url = new URL(request.url)
  return TRUE_PARAM.test(String(
    url.searchParams.get('reconcileStock') ||
    url.searchParams.get('reconcile_stock') ||
    url.searchParams.get('stockReconcile') ||
    ''
  ).trim())
}

export async function POST(request, { params }) {
  const { slug } = await params
  const dryRun = isDryRunRequest(request)
  const reconcileStock = isStockReconcileRequest(request)

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  const tienda = { ...access.tienda, slug }
  if (!dryRun && isSquareSyncTemporarilyPaused(tienda)) {
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
    let result
    if (reconcileStock) {
      result = dryRun
        ? await squareStockReconcileDryRunForTienda(access.tienda.id, slug, squareToken)
        : await squareStockReconcileForTienda(access.tienda.id, slug, squareToken)
    } else {
      result = dryRun
        ? await squareSyncDryRunForTienda(access.tienda.id, slug, squareToken)
        : await squareSyncForTienda(access.tienda.id, slug, squareToken)
    }
    return NextResponse.json(result)
  } catch (e) {
    console.error('[square-sync]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
