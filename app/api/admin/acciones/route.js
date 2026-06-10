import { createClient } from '@supabase/supabase-js'
import { getUserFromRequest } from '../../_lib/auth'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

function adminClient() {
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

function decimal(valor) {
  return Number(valor) || 0
}

function crearAlertaBase(restauranteId, clave, severidad, titulo, detalle, impacto, accion) {
  const now = new Date().toISOString()
  return {
    restaurante_id: restauranteId,
    entidad_tipo: 'restaurante',
    entidad_id: restauranteId,
    severidad,
    clave,
    titulo,
    detalle,
    impacto,
    accion_sugerida: accion,
    estado: 'abierta',
    periodo_inicio: now,
    periodo_fin: now,
  }
}

async function asegurarAlertasOperativas(supabase) {
  const [
    { data: restaurantes, error: restError },
    { data: vinos, error: vinosError },
    { data: propuestas, error: propuestasError },
    { data: existentes, error: existentesError },
  ] = await Promise.all([
    supabase.from('restaurantes').select('id, nombre'),
    supabase.from('vinos').select('*'),
    supabase.from('consultor_propuestas').select('id, restaurante_id, estado'),
    supabase.from('alerts').select('id, restaurante_id, clave, estado').in('estado', ['abierta', 'en_progreso']),
  ])
  if (restError || vinosError || existentesError) {
    console.error('asegurarAlertasOperativas query error:', { restError, vinosError, existentesError })
    return
  }

  const existentesSet = new Set((existentes || []).map(item => `${item.restaurante_id}:${item.clave}`))
  const nuevas = []
  const propuestasDisponibles = propuestasError ? [] : (propuestas || [])

  for (const restaurante of restaurantes || []) {
    const vinosRest = (vinos || []).filter(vino => vino.restaurante_id === restaurante.id && vino.activo !== false)
    const propuestasRest = propuestasDisponibles.filter(item => item.restaurante_id === restaurante.id && item.estado !== 'descartada' && item.estado !== 'incorporada')
    if (!vinosRest.length) continue

    const sinPrecio = vinosRest.filter(vino => !decimal(vino.precio_botella))
    const sinCoste = vinosRest.filter(vino => !decimal(vino.coste_compra))
    const sinStockMinimo = vinosRest.filter(vino => !decimal(vino.stock_minimo))
    const conMargen = vinosRest.filter(vino => decimal(vino.coste_compra) > 0 && decimal(vino.precio_botella) > 0)
    const margenBajo = conMargen.filter(vino => ((decimal(vino.precio_botella) - decimal(vino.coste_compra)) / decimal(vino.precio_botella)) * 100 < 55)
    const bajoMinimo = vinosRest.filter(vino => decimal(vino.stock_minimo) > 0 && decimal(vino.stock) <= decimal(vino.stock_minimo))

    const candidatas = []
    if (sinPrecio.length) {
      candidatas.push(crearAlertaBase(
        restaurante.id,
        'precio_venta_pendiente',
        sinPrecio.length > vinosRest.length * 0.25 ? 'critica' : 'aviso',
        'Precios de venta pendientes',
        `${sinPrecio.length} vinos no tienen PVP de botella informado.`,
        'Sin PVP la carta no puede calcular gamas, margen ni recomendacion comercial.',
        'Completar PVP de botella en las referencias activas.'
      ))
    }
    if (sinCoste.length) {
      candidatas.push(crearAlertaBase(
        restaurante.id,
        'datos_coste_pendientes',
        sinCoste.length > vinosRest.length * 0.35 ? 'critica' : 'aviso',
        'Costes pendientes',
        `${sinCoste.length} vinos no tienen coste de compra informado.`,
        'Sin costes no se puede defender margen real ante el cliente.',
        'Completar coste de compra en las referencias principales.'
      ))
    }
    if (sinStockMinimo.length) {
      candidatas.push(crearAlertaBase(
        restaurante.id,
        'stock_minimo_pendiente',
        'info',
        'Stock minimo pendiente',
        `${sinStockMinimo.length} vinos no tienen stock minimo definido.`,
        'La app no puede anticipar rupturas ni preparar pedidos con precision.',
        'Definir stock minimo por referencia, empezando por vinos de alta rotacion.'
      ))
    }
    if (margenBajo.length) {
      candidatas.push(crearAlertaBase(
        restaurante.id,
        'margen_bajo_operativo',
        margenBajo.length > 3 ? 'critica' : 'aviso',
        'Margen bajo detectado',
        `${margenBajo.length} referencias estan por debajo del 55% de margen estimado.`,
        'La carta puede estar dejando dinero en referencias vendibles.',
        'Revisar PVP, coste de compra o sustitucion de esas referencias.'
      ))
    }
    if (bajoMinimo.length) {
      candidatas.push(crearAlertaBase(
        restaurante.id,
        'reposicion_pendiente',
        'aviso',
        'Reposicion pendiente',
        `${bajoMinimo.length} vinos estan en o por debajo del stock minimo.`,
        'Riesgo de ruptura durante el servicio.',
        'Preparar pedido sugerido por proveedor.'
      ))
    }
    if (propuestasRest.length) {
      candidatas.push(crearAlertaBase(
        restaurante.id,
        'propuestas_abiertas',
        propuestasRest.length > 3 ? 'critica' : 'aviso',
        'Propuestas abiertas',
        `${propuestasRest.length} propuestas siguen pendientes de decision.`,
        'Hay trabajo comercial abierto que conviene cerrar.',
        'Priorizar una decision: incorporar, descartar o convertir en accion.'
      ))
    }
    if (!candidatas.length) {
      candidatas.push(crearAlertaBase(
        restaurante.id,
        'revision_consultor_disponible',
        'info',
        'Revision consultor disponible',
        `${vinosRest.length} referencias activas listas para seguimiento comercial.`,
        'No hay alertas criticas automaticas, pero conviene revisar equilibrio de carta y oportunidades.',
        'Entrar en el restaurante y revisar arquitectura de precios, gamas y candidatos a salir.'
      ))
    }

    for (const alerta of candidatas) {
      const key = `${alerta.restaurante_id}:${alerta.clave}`
      if (!existentesSet.has(key)) {
        existentesSet.add(key)
        nuevas.push(alerta)
      }
    }
  }

  if (nuevas.length) {
    const { error: insertError } = await supabase.from('alerts').insert(nuevas)
    if (insertError) console.error('asegurarAlertasOperativas insert error:', insertError)
  }
}

async function validarAdmin(req) {
  const auth = await getUserFromRequest(req)
  if (auth.error) return auth
  if ((auth.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }
  return auth
}

async function leerOpcional(queryPromise) {
  const { data, error } = await queryPromise
  if (error) {
    if (esTablaNoExiste(error)) return []
    throw error
  }
  return data || []
}

function normalizarAccionConsultor(item, restaurante = null) {
  return {
    id: item.id,
    fuente: 'consultor',
    restaurante_id: item.restaurante_id,
    restaurante,
    titulo: item.titulo,
    detalle: item.detalle,
    accion: item.accion,
    fase: item.fase,
    prioridad: item.prioridad,
    impacto: item.impacto,
    esfuerzo: item.esfuerzo,
    estado: item.estado,
    origen: item.origen || 'modo_consultor',
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

function normalizarRecomendacion(item, restaurante = null) {
  return {
    id: item.id,
    fuente: 'recomendacion',
    restaurante_id: item.restaurante_id,
    restaurante,
    titulo: item.titulo,
    detalle: item.detalle,
    accion: item.accion,
    fase: item.esfuerzo === 'bajo' ? 'accion_rapida' : item.esfuerzo === 'alto' ? 'estrategico' : 'medio_plazo',
    prioridad: item.prioridad,
    impacto: item.prioridad === 'alta' ? 'alto' : item.prioridad === 'baja' ? 'bajo' : 'medio',
    esfuerzo: item.esfuerzo,
    estado: item.estado === 'hecha' ? 'hecha' : item.estado === 'descartada' ? 'descartada' : item.estado === 'en_progreso' ? 'en_progreso' : 'pendiente',
    origen: item.origen || item.tipo || 'recommendation_engine',
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

function normalizarAlerta(item, restaurante = null) {
  return {
    id: item.id,
    fuente: 'alerta',
    restaurante_id: item.restaurante_id,
    restaurante,
    titulo: item.titulo,
    detalle: item.detalle,
    accion: item.accion_sugerida || 'Revisar con el cliente.',
    fase: item.severidad === 'critica' ? 'accion_rapida' : 'medio_plazo',
    prioridad: item.severidad === 'critica' ? 'alta' : item.severidad === 'aviso' ? 'media' : 'baja',
    impacto: item.severidad === 'critica' ? 'alto' : item.severidad === 'aviso' ? 'medio' : 'bajo',
    esfuerzo: 'medio',
    estado: item.estado === 'en_progreso' ? 'en_progreso' : 'pendiente',
    origen: item.clave || 'alert_engine',
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { searchParams } = new URL(req.url)
    const estado = searchParams.get('estado') || 'pendiente'
    const restauranteId = searchParams.get('restaurante_id')
    const supabase = adminClient()
    await asegurarAlertasOperativas(supabase)

    let accionesQuery = supabase
      .from('consultant_action_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    let recomendacionesQuery = supabase
      .from('recommendations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    let alertasQuery = supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (estado && estado !== 'todas') {
      accionesQuery = accionesQuery.eq('estado', estado)
      recomendacionesQuery = recomendacionesQuery.eq('estado', estado)
      if (estado === 'pendiente') alertasQuery = alertasQuery.eq('estado', 'abierta')
      else if (estado === 'hecha') alertasQuery = alertasQuery.eq('estado', 'resuelta')
      else alertasQuery = alertasQuery.eq('estado', estado)
    }
    if (restauranteId) {
      accionesQuery = accionesQuery.eq('restaurante_id', restauranteId)
      recomendacionesQuery = recomendacionesQuery.eq('restaurante_id', restauranteId)
      alertasQuery = alertasQuery.eq('restaurante_id', restauranteId)
    }

    const [acciones, recomendaciones, alertas, restaurantesRes] = await Promise.all([
      leerOpcional(accionesQuery),
      leerOpcional(recomendacionesQuery),
      leerOpcional(alertasQuery),
      supabase.from('restaurantes').select('id, nombre, ciudad, slug'),
    ])

    if (restaurantesRes.error) throw restaurantesRes.error
    const restaurantes = new Map((restaurantesRes.data || []).map(restaurante => [restaurante.id, restaurante]))

    const items = [
      ...acciones.map(item => normalizarAccionConsultor(item, restaurantes.get(item.restaurante_id) || null)),
      ...recomendaciones.map(item => normalizarRecomendacion(item, restaurantes.get(item.restaurante_id) || null)),
      ...alertas.map(item => normalizarAlerta(item, restaurantes.get(item.restaurante_id) || null)),
    ].sort((a, b) => {
      const pesoPrioridad = { alta: 3, media: 2, baja: 1 }
      return (pesoPrioridad[b.prioridad] || 0) - (pesoPrioridad[a.prioridad] || 0) ||
        new Date(b.created_at || 0) - new Date(a.created_at || 0)
    })

    return Response.json({ acciones: items })
  } catch (error) {
    console.error('Error leyendo acciones:', error)
    return Response.json({ error: 'No se pudieron cargar las acciones.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const estados = ['pendiente', 'en_progreso', 'hecha', 'descartada']
    if (!body.id || !estados.includes(body.estado)) {
      return Response.json({ error: 'ID y estado valido obligatorios.' }, { status: 400 })
    }

    if (body.fuente === 'alerta') {
      const estadoAlerta = body.estado === 'hecha'
        ? 'resuelta'
        : body.estado === 'pendiente'
          ? 'abierta'
          : body.estado
      const now = new Date().toISOString()
      const update = {
        estado: estadoAlerta,
        updated_at: now,
      }
      if (estadoAlerta === 'resuelta') update.resuelta_at = now
      if (estadoAlerta === 'descartada') update.descartada_at = now
      const { data, error } = await adminClient()
        .from('alerts')
        .update(update)
        .eq('id', body.id)
        .select('*')
        .single()
      if (error) throw error
      return Response.json({ accion: data })
    }

    const tabla = body.fuente === 'recomendacion' ? 'recommendations' : 'consultant_action_items'
    const { data, error } = await adminClient()
      .from(tabla)
      .update({ estado: body.estado, updated_at: new Date().toISOString() })
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) throw error
    return Response.json({ accion: data })
  } catch (error) {
    console.error('Error actualizando accion:', error)
    return Response.json({ error: 'No se pudo actualizar la accion.' }, { status: 500 })
  }
}
