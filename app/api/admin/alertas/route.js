import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

async function validarAdmin(req) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesion no recibida', status: 401 }

  const supabaseAuth = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesion no valida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }

  return { user: data.user }
}

function adminClient() {
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
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

function adjuntarRestaurante(alerta, restaurantes) {
  return {
    ...alerta,
    restaurantes: restaurantes.get(alerta.restaurante_id) || null,
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

function payloadEstado(body = {}) {
  const estado = ['abierta', 'en_progreso', 'resuelta', 'descartada'].includes(body.estado)
    ? body.estado
    : null
  const now = new Date().toISOString()
  const update = {
    updated_at: now,
  }
  if (estado) update.estado = estado
  if (typeof body.asignado_a === 'string') update.asignado_a = body.asignado_a.trim()
  if (typeof body.motivo_cierre === 'string') update.motivo_cierre = body.motivo_cierre.trim()
  if (estado === 'resuelta') update.resuelta_at = now
  if (estado === 'descartada') update.descartada_at = now
  if (estado === 'abierta' || estado === 'en_progreso') {
    update.resuelta_at = null
    update.descartada_at = null
  }
  return update
}

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { searchParams } = new URL(req.url)
    const estado = searchParams.get('estado')
    const severidad = searchParams.get('severidad')
    const restauranteId = searchParams.get('restaurante_id')
    const tipo = searchParams.get('tipo')

    const supabase = adminClient()
    await asegurarAlertasOperativas(supabase)

    let query = supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250)

    if (estado && estado !== 'todas') query = query.eq('estado', estado)
    if (severidad && severidad !== 'todas') query = query.eq('severidad', severidad)
    if (restauranteId) query = query.eq('restaurante_id', restauranteId)
    if (tipo && tipo !== 'todos') query = query.eq('clave', tipo)

    const { data, error } = await query
    if (error) throw error

    const restauranteIds = [...new Set((data || []).map(alerta => alerta.restaurante_id).filter(Boolean))]
    let restaurantes = new Map()
    if (restauranteIds.length) {
      const { data: restData, error: restError } = await supabase
        .from('restaurantes')
        .select('id, nombre, ciudad, slug')
        .in('id', restauranteIds)
      if (restError) throw restError
      restaurantes = new Map((restData || []).map(restaurante => [restaurante.id, restaurante]))
    }

    const ids = (data || []).map(alerta => alerta.id)
    let historial = []
    if (ids.length) {
      const { data: histData, error: histError } = await supabase
        .from('alert_history')
        .select('*')
        .in('alert_id', ids)
        .order('created_at', { ascending: false })
        .limit(500)
      if (!histError) historial = histData || []
    }

    return Response.json({ alertas: (data || []).map(alerta => adjuntarRestaurante(alerta, restaurantes)), historial })
  } catch (error) {
    console.error('Error leyendo alertas:', error)
    return Response.json({ error: 'No se pudieron cargar las alertas.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    if (!body.id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const supabase = adminClient()
    const { data: alertaActual, error: actualError } = await supabase
      .from('alerts')
      .select('*')
      .eq('id', body.id)
      .single()
    if (actualError) throw actualError

    const update = payloadEstado(body)
    const { data: alerta, error } = await supabase
      .from('alerts')
      .update(update)
      .eq('id', body.id)
      .select('*')
      .single()
    if (error) throw error

    const { data: restaurante } = await supabase
      .from('restaurantes')
      .select('id, nombre, ciudad, slug')
      .eq('id', alerta.restaurante_id)
      .maybeSingle()

    await supabase.from('alert_history').insert([{
      alert_id: alerta.id,
      restaurante_id: alerta.restaurante_id,
      accion: body.accion || 'cambio_estado',
      estado_anterior: alertaActual.estado,
      estado_nuevo: alerta.estado,
      comentario: body.comentario || body.motivo_cierre || '',
      created_by: admin.user.email,
    }])

    return Response.json({ alerta: { ...alerta, restaurantes: restaurante || null } })
  } catch (error) {
    console.error('Error actualizando alerta:', error)
    return Response.json({ error: 'No se pudo actualizar la alerta.' }, { status: 500 })
  }
}
