import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const STATUS = new Set(['pendiente_pago', 'nuevo', 'preparando', 'cerrado', 'cancelado'])
const COUNTER_ORDERS_IN_DEVELOPMENT = true

function migrationPending(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return text.includes('kiosko_assisted_orders') || text.includes('schema cache') || text.includes('pgrst')
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function summarize(pedidos = []) {
  const abiertos = pedidos.filter(p => ['pendiente_pago', 'nuevo', 'preparando'].includes(p.status)).length
  const pendientesPago = pedidos.filter(p => ['pendiente_pago', 'nuevo'].includes(p.status)).length
  const totalImporte = pedidos.reduce((sum, p) => sum + Number(p.total || 0), 0)
  return {
    total: pedidos.length,
    abiertos,
    nuevos: pendientesPago,
    pendientesPago,
    totalImporte: Number(totalImporte.toFixed(2)),
  }
}

export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  if (COUNTER_ORDERS_IN_DEVELOPMENT) {
    return NextResponse.json({ disabled: true, development: true, pendiente: false, pedidos: [], resumen: summarize([]) })
  }
  if (access.tienda.kiosko_orders_enabled !== true) {
    return NextResponse.json({ disabled: true, pendiente: false, pedidos: [], resumen: summarize([]) })
  }

  const { data, error } = await supabaseAdmin
    .from('kiosko_assisted_orders')
    .select('id, order_code, status, customer_label, customer_note, total, item_count, source, lang, lines, created_at, updated_at')
    .eq('tienda_id', access.tienda.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    if (migrationPending(error)) return NextResponse.json({ pendiente: true, pedidos: [], resumen: summarize([]) })
    console.error('[kiosko admin pedidos]', error)
    return NextResponse.json({ error: 'No se pudieron cargar los pedidos' }, { status: 500 })
  }

  const pedidos = data || []
  return NextResponse.json({ pendiente: false, pedidos, resumen: summarize(pedidos) })
}

export async function PATCH(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  if (COUNTER_ORDERS_IN_DEVELOPMENT) {
    return NextResponse.json({ error: 'Pedido de mostrador en desarrollo', development: true }, { status: 503 })
  }
  if (access.tienda.kiosko_orders_enabled !== true) {
    return NextResponse.json({ error: 'Pedido de mostrador desactivado' }, { status: 403 })
  }

  let body = {}
  try { body = await request.json() } catch {}

  const id = cleanText(body?.id, 80)
  const status = cleanText(body?.status, 40)
  if (!id || !STATUS.has(status)) return NextResponse.json({ error: 'Estado no valido' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('kiosko_assisted_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tienda_id', access.tienda.id)
    .select('id, status, updated_at')
    .single()

  if (error) {
    if (migrationPending(error)) return NextResponse.json({ error: 'Pedidos no activados', pending: true }, { status: 503 })
    console.error('[kiosko admin pedido status]', error)
    return NextResponse.json({ error: 'No se pudo actualizar el pedido' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pedido: data })
}
