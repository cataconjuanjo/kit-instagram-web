import { getUserFromRequest } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

function esAdmin(user) {
  return (user?.email || '').toLowerCase() === adminEmail.toLowerCase()
}

async function autenticar(req) {
  const auth = await getUserFromRequest(req)
  if (auth.error) return auth
  if (esAdmin(auth.user)) return { error: 'No se registra el uso del consultor.', status: 403 }
  return auth
}

async function restauranteDelUsuario(user) {
  const email = (user.email || '').toLowerCase()
  const { data, error } = await supabaseAdmin
    .from('restaurantes')
    .select('id')
    .eq('email', email)
    .single()

  if (error || !data) return null
  return data
}

export async function POST(req) {
  try {
    const auth = await autenticar(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const restaurante = await restauranteDelUsuario(auth.user)
    if (!restaurante) return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })

    const body = await req.json()
    const accion = body.accion === 'fin' ? 'fin' : body.accion === 'pulso' ? 'pulso' : 'inicio'

    if (accion === 'inicio') {
      const { data, error } = await supabaseAdmin
        .from('sesiones_uso')
        .insert([{
          restaurante_id: restaurante.id,
          user_id: auth.user.id,
          user_email: (auth.user.email || '').toLowerCase(),
        }])
        .select('id')
        .single()

      if (error) throw error
      return Response.json({ sesion_id: data.id })
    }

    const sesionId = String(body.sesion_id || '').trim()
    if (!sesionId) return Response.json({ error: 'sesion_id obligatorio.' }, { status: 400 })

    const { data: sesion, error: sesionError } = await supabaseAdmin
      .from('sesiones_uso')
      .select('id')
      .eq('id', sesionId)
      .eq('restaurante_id', restaurante.id)
      .eq('user_id', auth.user.id)
      .single()

    if (sesionError || !sesion) return Response.json({ error: 'Sesion no encontrada.' }, { status: 404 })

    const { error } = await supabaseAdmin.rpc('registrar_pulso_uso', {
      p_sesion_id: sesionId,
      p_finalizar: accion === 'fin',
    })
    if (error) throw error

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Error registrando uso:', error)
    return Response.json({ error: 'No se pudo registrar el uso.' }, { status: 500 })
  }
}

export async function GET(req) {
  try {
    const auth = await getUserFromRequest(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    if (!esAdmin(auth.user)) return Response.json({ error: 'No autorizado.' }, { status: 403 })

    const inicioMes = new Date()
    inicioMes.setUTCDate(1)
    inicioMes.setUTCHours(0, 0, 0, 0)

    const [{ data, error }, { data: consumosIa, error: consumosIaError }, { data: restaurantes, error: restaurantesError }] = await Promise.all([
      supabaseAdmin
        .from('sesiones_uso')
        .select('id, restaurante_id, user_email, started_at, last_seen_at, ended_at, active_seconds')
        .order('started_at', { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from('consumos_ia')
        .select('restaurante_id, endpoint, input_tokens, output_tokens, coste_estimado_usd, metadata, created_at')
        .gte('created_at', inicioMes.toISOString())
        .order('created_at', { ascending: false })
        .limit(10000),
      supabaseAdmin
        .from('restaurantes')
        .select('id, slug'),
    ])

    if (error) throw error
    if (restaurantesError) throw restaurantesError

    const ahora = Date.now()
    const resumen = {}
    for (const sesion of data || []) {
      const item = resumen[sesion.restaurante_id] || {
        sesiones: 0,
        active_seconds: 0,
        ultimo_acceso: null,
        activo_ahora: false,
      }
      item.sesiones += 1
      item.active_seconds += sesion.active_seconds || 0
      item.ultimo_acceso ||= sesion.started_at
      item.activo_ahora ||= !sesion.ended_at && ahora - new Date(sesion.last_seen_at).getTime() < 2 * 60 * 1000
      resumen[sesion.restaurante_id] = item
    }

    const resumenIa = {}
    const resumenPreparacionIa = {}
    const totalIa = { consultas: 0, input_tokens: 0, output_tokens: 0, coste_estimado_usd: 0 }
    const totalPreparacionIa = { consultas: 0, input_tokens: 0, output_tokens: 0, coste_estimado_usd: 0 }
    const propuestas = new Set((restaurantes || [])
      .filter(restaurante => String(restaurante.slug || '').startsWith('propuesta-'))
      .map(restaurante => restaurante.id))

    function acumularConsumo(item, consumo) {
      item.consultas += 1
      item.input_tokens += consumo.input_tokens || 0
      item.output_tokens += consumo.output_tokens || 0
      item.coste_estimado_usd += Number(consumo.coste_estimado_usd) || 0
    }

    for (const consumo of consumosIa || []) {
      const esPreparacion = propuestas.has(consumo.restaurante_id)
      acumularConsumo(esPreparacion ? totalPreparacionIa : totalIa, consumo)
      if (!consumo.restaurante_id) continue
      const destino = esPreparacion ? resumenPreparacionIa : resumenIa
      const item = destino[consumo.restaurante_id] || {
        consultas: 0,
        input_tokens: 0,
        output_tokens: 0,
        coste_estimado_usd: 0,
      }
      acumularConsumo(item, consumo)
      const origen = consumo.metadata?.origen || 'cliente_real'
      item.origenes ||= {}
      item.origenes[origen] ||= { consultas: 0, input_tokens: 0, output_tokens: 0, coste_estimado_usd: 0 }
      acumularConsumo(item.origenes[origen], consumo)
      destino[consumo.restaurante_id] = item
    }

    return Response.json({
      resumen,
      recientes: (data || []).slice(0, 12),
      ia: {
        resumen: resumenIa,
        preparacion: { resumen: resumenPreparacionIa, total: totalPreparacionIa },
        total: totalIa,
        disponible: !consumosIaError,
      },
    })
  } catch (error) {
    console.error('Error leyendo uso:', error)
    return Response.json({ error: 'No se pudo cargar el uso.' }, { status: 500 })
  }
}
