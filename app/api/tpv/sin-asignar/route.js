import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { requireRestaurantAccess } from '../../_lib/auth'

export const runtime = 'nodejs'

const VALID_ACCIONES = new Set(['asignar', 'ignorar', 'descartar_linea'])

// Errores RAISE EXCEPTION del RPC asignar_lineas_tpv → 422; otros errores → 500.
function rpcStatus(error) {
  return /^asignar_lineas_tpv:/.test(error?.message || '') ? 422 : 500
}

// GET /api/tpv/sin-asignar?restaurante_id=…&estado=pendiente&limit=100&offset=0
// Auth: requireRestaurantAccess verifica sesión (401 sin token, 403 sin acceso al restaurante,
//       bypass para cataconjuanjo@gmail.com).
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const restauranteId = searchParams.get('restaurante_id') || ''

  const auth = await requireRestaurantAccess(request, supabaseAdmin, restauranteId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const estado = searchParams.get('estado') || 'pendiente'
  const limit  = Math.min(parseInt(searchParams.get('limit')  || '100', 10), 200)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0',   10), 0)

  const { data, error, count } = await supabaseAdmin
    .from('tpv_lineas_sin_asignar')
    .select('*', { count: 'exact' })
    .eq('restaurante_id', restauranteId)
    .eq('estado', estado)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lineas: data || [], total: count || 0 })
}

// PATCH /api/tpv/sin-asignar
// body: { restaurante_id, fuente?, accion, producto_externo_id?, vino_id?, formato_venta?, linea_id? }
export async function PATCH(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'body JSON inválido' }, { status: 400 })
  }

  const {
    restaurante_id: restauranteId,
    fuente = 'square',
    accion,
    producto_externo_id,
    vino_id,
    formato_venta,
    linea_id,
  } = body

  const auth = await requireRestaurantAccess(request, supabaseAdmin, restauranteId)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!accion || !VALID_ACCIONES.has(accion)) {
    return NextResponse.json(
      { error: `accion no reconocida: ${accion ?? '(vacía)'}. Valores válidos: asignar, ignorar, descartar_linea` },
      { status: 400 }
    )
  }

  if (accion === 'descartar_linea') {
    if (!linea_id) return NextResponse.json({ error: 'linea_id requerido para descartar_linea' }, { status: 400 })
    const { data, error } = await supabaseAdmin.rpc('asignar_lineas_tpv', {
      p_restaurante_id:      restauranteId,
      p_fuente:              fuente,
      p_producto_externo_id: '',
      p_vino_id:             null,
      p_formato_venta:       null,
      p_accion:              'descartar_linea',
      p_linea_id:            linea_id,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: rpcStatus(error) })
    return NextResponse.json(data)
  }

  if (!producto_externo_id)
    return NextResponse.json({ error: 'producto_externo_id requerido' }, { status: 400 })
  if (accion === 'asignar' && !vino_id)
    return NextResponse.json({ error: 'vino_id requerido para asignar' }, { status: 400 })
  if (accion === 'asignar' && !formato_venta)
    return NextResponse.json({ error: 'formato_venta requerido para asignar' }, { status: 400 })
  if (accion === 'asignar' && !['botella', 'copa'].includes(formato_venta))
    return NextResponse.json({ error: 'formato_venta debe ser botella o copa' }, { status: 400 })

  // Bucle hasta cola vaciada o sin progreso (máx 20 iteraciones × 200 líneas = 4000 líneas)
  const resultados = []
  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabaseAdmin.rpc('asignar_lineas_tpv', {
      p_restaurante_id:      restauranteId,
      p_fuente:              fuente,
      p_producto_externo_id: producto_externo_id,
      p_vino_id:             vino_id || null,
      p_formato_venta:       formato_venta || null,
      p_accion:              accion,
      p_linea_id:            null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: rpcStatus(error) })
    resultados.push(data)
    if (data.pendientes_restantes === 0 || data.procesadas === 0) break
  }

  return NextResponse.json({
    procesadas:           resultados.reduce((s, r) => s + (r.procesadas || 0), 0),
    no_asignables:        resultados[0]?.no_asignables || 0,
    pendientes_restantes: resultados.at(-1)?.pendientes_restantes || 0,
    lineas:               resultados.flatMap(r => r.lineas || []),
  })
}
