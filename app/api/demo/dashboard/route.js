import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const DEMO_EMAILS = new Set([
  'demo@taberna-del-puerto.com',
  'sumiller.demo@cartaviva.local',
])

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function calcularStats(eventos = []) {
  const ventas = eventos.filter(evento => evento.tipo === 'venta').map(evento => leerDetalle(evento.detalle))
  return {
    escaneos: eventos.filter(evento => evento.tipo === 'escaneo').length,
    sommelier: eventos.filter(evento => evento.tipo === 'sommelier').length,
    ventasHoy: ventas.filter(item => item.resultado === 'vendida').length,
    incidenciasSala: ventas.filter(item => ['no_stock', 'agotado'].includes(item.resultado)).length,
    dudasSala: ventas.filter(item => ['no_convence', 'otra'].includes(item.resultado)).length,
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const email = String(searchParams.get('email') || '').trim().toLowerCase()
    if (!DEMO_EMAILS.has(email)) {
      return Response.json({ error: 'Demo no disponible.' }, { status: 403 })
    }

    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('*')
      .eq('email', email)
      .single()

    if (!restaurante) {
      return Response.json({ error: 'Restaurante demo no encontrado.' }, { status: 404 })
    }

    const [
      { data: vinos },
      { data: platos },
      { data: propuestas },
      { data: eventos },
    ] = await Promise.all([
      supabaseAdmin.from('vinos').select('*').eq('restaurante_id', restaurante.id),
      supabaseAdmin.from('platos').select('*').eq('restaurante_id', restaurante.id).eq('activo', true),
      supabaseAdmin.from('consultor_propuestas').select('*').eq('restaurante_id', restaurante.id).neq('estado', 'descartada').order('created_at', { ascending: false }),
      supabaseAdmin.from('estadisticas').select('tipo, detalle, created_at').eq('restaurante_id', restaurante.id).order('created_at', { ascending: false }).limit(500),
    ])

    return Response.json({
      restaurante,
      vinos: vinos || [],
      platos: platos || [],
      propuestas: propuestas || [],
      stats: calcularStats(eventos || []),
      etiquetaDia: restaurante.slug === 'taberna-del-puerto' ? 'ultimo_dia_demo' : 'hoy',
      turnoCerrado: false,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo cargar la demo.' }, { status: 500 })
  }
}
