import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const DEMO_EMAILS = new Set([
  'demo@taberna-del-puerto.com',
  'sumiller.demo@cartaviva.local',
])

const SELECT_RESTAURANTE_DEMO = [
  'id', 'slug', 'nombre', 'email', 'ciudad', 'logo_url',
  'plan', 'subscription_status', 'actividad_real_desde',
  'camarero_pin_bloqueo_activo', 'carta_publica_activa', 'hub_activo',
].join(', ')

const SELECT_VINO_DEMO = [
  'id', 'restaurante_id', 'nombre', 'bodega', 'tipo', 'region', 'uva', 'anada',
  'precio_copa', 'precio_botella', 'coste_compra', 'stock', 'stock_minimo',
  'proveedor', 'referencia_proveedor', 'formato_compra', 'notas_cata', 'activo',
].join(', ')

const SELECT_PLATO_DEMO = [
  'id', 'restaurante_id', 'nombre', 'descripcion', 'categoria', 'precio', 'activo',
].join(', ')

const SELECT_PROPUESTA_DEMO = [
  'id', 'restaurante_id', 'titulo', 'motivo', 'tipo', 'zona', 'prioridad',
  'estado', 'vino', 'created_at',
].join(', ')

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

    const { data: restaurante, error: restauranteError } = await supabaseAdmin
      .from('restaurantes')
      .select(SELECT_RESTAURANTE_DEMO)
      .eq('email', email)
      .single()

    if (restauranteError && restauranteError.code !== 'PGRST116') {
      console.error('[demo-dashboard:restaurante]', {
        email,
        code: restauranteError.code || '',
        message: restauranteError.message || 'Error consultando restaurante demo',
      })
      return Response.json({ error: 'No se pudo cargar la demo.' }, { status: 503 })
    }

    if (!restaurante) {
      return Response.json({ error: 'Restaurante demo no encontrado.' }, { status: 404 })
    }

    const [
      vinosRes,
      platosRes,
      propuestasRes,
      eventosRes,
    ] = await Promise.all([
      supabaseAdmin.from('vinos').select(SELECT_VINO_DEMO).eq('restaurante_id', restaurante.id),
      supabaseAdmin.from('platos').select(SELECT_PLATO_DEMO).eq('restaurante_id', restaurante.id).eq('activo', true),
      supabaseAdmin.from('consultor_propuestas').select(SELECT_PROPUESTA_DEMO).eq('restaurante_id', restaurante.id).neq('estado', 'descartada').order('created_at', { ascending: false }),
      supabaseAdmin.from('estadisticas').select('tipo, detalle, created_at').eq('restaurante_id', restaurante.id).order('created_at', { ascending: false }).limit(500),
    ])
    const consultaError = vinosRes.error || platosRes.error || propuestasRes.error || eventosRes.error
    if (consultaError) {
      console.error('[demo-dashboard]', {
        email,
        code: consultaError.code || '',
        message: consultaError.message || 'Error consultando datos de demo',
      })
      return Response.json({ error: 'No se pudo cargar la demo.' }, { status: 503 })
    }

    return Response.json({
      restaurante,
      vinos: vinosRes.data || [],
      platos: platosRes.data || [],
      propuestas: propuestasRes.data || [],
      stats: calcularStats(eventosRes.data || []),
      etiquetaDia: restaurante.slug === 'taberna-del-puerto' ? 'ultimo_dia_demo' : 'hoy',
      turnoCerrado: false,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return Response.json({ error: error.message || 'No se pudo cargar la demo.' }, { status: 500 })
  }
}
