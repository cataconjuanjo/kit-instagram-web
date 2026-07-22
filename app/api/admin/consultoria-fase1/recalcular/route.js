import { createClient } from '@supabase/supabase-js'
import { requireRestaurantAccess } from '../../../_lib/auth'
import { calcularConsultoriaFase1, limpiarPayloadPersistencia } from '../../../../lib/consultoriaFase1Engine'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const SELECT_RESTAURANTE_CONSULTORIA = 'id, nombre, ticket_medio_comida'
const SELECT_VINO_CONSULTORIA = [
  'id', 'nombre', 'bodega', 'tipo', 'region', 'uva', 'notas_cata',
  'activo', 'precio_botella', 'precio_copa', 'coste_compra', 'stock',
  'stock_minimo', 'proveedor',
].join(', ')
const SELECT_ESTADISTICA_CONSULTORIA = 'id, restaurante_id, tipo, detalle, created_at'
const SELECT_MOVIMIENTO_CONSULTORIA = 'id, restaurante_id, vino_id, tipo, cantidad, created_at'
const SELECT_PLATO_CONSULTORIA = 'id, nombre, descripcion, categoria, activo'
const SELECT_KPI_HISTORY = [
  'id', 'restaurante_id', 'periodo_inicio', 'periodo_fin', 'clave',
  'nombre', 'valor', 'unidad', 'categoria', 'fuente', 'coeficientes',
  'interpretacion', 'created_at',
].join(', ')
const SELECT_ALERT = [
  'id', 'restaurante_id', 'entidad_tipo', 'entidad_id', 'severidad',
  'clave', 'titulo', 'detalle', 'impacto', 'accion_sugerida', 'estado',
  'periodo_inicio', 'periodo_fin', 'created_at', 'updated_at',
  'resuelta_at', 'descartada_at', 'motivo_cierre', 'asignado_a',
  'ultima_deteccion_at', 'veces_detectada',
].join(', ')
const SELECT_RECOMMENDATION = [
  'id', 'restaurante_id', 'entidad_tipo', 'entidad_id', 'tipo', 'titulo',
  'detalle', 'accion', 'prioridad', 'esfuerzo', 'origen', 'estado',
  'coeficientes', 'periodo_inicio', 'periodo_fin', 'created_at', 'updated_at',
].join(', ')
const SELECT_WINE_CLASSIFICATION = [
  'id', 'restaurante_id', 'vino_id', 'periodo_inicio', 'periodo_fin',
  'categoria', 'categoria_ingles', 'margen_bruto_pct', 'popularidad_pct',
  'umbral_margen_pct', 'umbral_popularidad_pct', 'explicacion',
  'acciones', 'created_at', 'vinos(nombre, bodega, tipo, region, precio_botella, coste_compra)',
].join(', ')
const SELECT_WINE_PERFORMANCE = [
  'id', 'restaurante_id', 'vino_id', 'periodo_inicio', 'periodo_fin',
  'ventas_unidades', 'ingresos_estimados', 'coste_estimado',
  'beneficio_bruto', 'margen_bruto_pct', 'popularidad_pct',
  'rotacion_estimada', 'stock_actual', 'valor_stock_coste',
  'created_at', 'vinos(nombre, bodega, tipo, region, precio_botella, coste_compra)',
].join(', ')
const SELECT_INVENTORY_SNAPSHOT = [
  'id', 'restaurante_id', 'periodo_inicio', 'periodo_fin',
  'referencias_activas', 'unidades_totales', 'valor_coste_total',
  'valor_venta_total', 'stock_inmovilizado_refs', 'stock_inmovilizado_valor',
  'referencias_lentas', 'exceso_stock_refs', 'proveedor_principal',
  'proveedor_principal_pct', 'merma_unidades', 'tasa_merma_pct',
  'created_at',
].join(', ')
const SELECT_INVENTORY_ITEM = [
  'id', 'snapshot_id', 'restaurante_id', 'vino_id', 'proveedor',
  'stock_actual', 'stock_minimo', 'ventas_unidades', 'coste_compra',
  'precio_botella', 'valor_stock_coste', 'dias_cobertura',
  'estado_inventario', 'motivo', 'created_at',
  'vinos(nombre, bodega, tipo, region)',
].join(', ')
const SELECT_WINE_LIST_SNAPSHOT = [
  'id', 'restaurante_id', 'periodo_inicio', 'periodo_fin',
  'referencias_total', 'referencias_con_venta', 'ventas_totales',
  'pareto_top20_refs', 'pareto_top20_ventas_pct', 'bottom10_refs',
  'productividad_media', 'huecos_precio', 'resumen_gamas',
  'concentracion_tipos', 'concentracion_regiones', 'carta_inflada',
  'motivo_principal', 'created_at',
].join(', ')
const SELECT_WINE_LIST_ITEM = [
  'id', 'snapshot_id', 'restaurante_id', 'vino_id', 'nombre', 'bodega',
  'tipo', 'region', 'gama', 'precio_botella', 'ventas_unidades',
  'margen_bruto_pct', 'popularidad_pct', 'productividad_score',
  'valor_stock_coste', 'es_top20', 'es_bottom10', 'motivo', 'created_at',
  'vinos(nombre, bodega, tipo, region)',
].join(', ')
const SELECT_BTG_SNAPSHOT = [
  'id', 'restaurante_id', 'periodo_inicio', 'periodo_fin',
  'referencias_activas', 'referencias_por_copa', 'cobertura_copa_pct',
  'candidatos_copa', 'candidatos_copa_premium', 'candidatos_coravin',
  'beneficio_potencial_estimado', 'motivo_principal', 'created_at',
].join(', ')
const SELECT_BTG_CANDIDATE = [
  'id', 'snapshot_id', 'restaurante_id', 'vino_id', 'nombre', 'bodega',
  'tipo', 'region', 'categoria_copa', 'score_copa', 'coste_botella',
  'pvp_botella', 'precio_copa_actual', 'precio_copa_sugerido',
  'copas_por_botella', 'merma_pct', 'ingresos_por_botella_copa',
  'beneficio_por_botella_copa', 'margen_copa_pct', 'riesgo_apertura',
  'motivo', 'accion', 'created_at', 'vinos(nombre, bodega, tipo, region)',
].join(', ')
const SELECT_CONSULTANT_DIAGNOSTIC = [
  'id', 'restaurante_id', 'periodo_inicio', 'periodo_fin', 'score',
  'prioridad', 'resumen_ejecutivo', 'estado_actual',
  'problema_principal', 'quick_wins', 'medio_plazo', 'estrategico',
  'problemas_detectados', 'created_at',
].join(', ')
const SELECT_CONSULTANT_ACTION = [
  'id', 'diagnostic_id', 'restaurante_id', 'fase', 'titulo', 'detalle',
  'accion', 'prioridad', 'impacto', 'esfuerzo', 'estado', 'origen',
  'created_at', 'updated_at',
].join(', ')
const SELECT_OPPORTUNITY_SNAPSHOT = [
  'id', 'restaurante_id', 'periodo_inicio', 'periodo_fin',
  'recuperacion_anual_estimada', 'impacto_acciones_rapidas',
  'impacto_medio_plazo', 'impacto_estrategico',
  'capital_liberable_estimado', 'confianza_media_pct',
  'oportunidades_total', 'resumen', 'created_at',
].join(', ')
const SELECT_OPPORTUNITY_ITEM = [
  'id', 'snapshot_id', 'restaurante_id', 'area', 'titulo', 'detalle',
  'accion', 'impacto_estimado', 'tipo_impacto', 'horizonte',
  'dificultad', 'confianza_pct', 'prioridad', 'formula', 'created_at',
].join(', ')

function adminClient() {
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function haceDiasISO(dias) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - dias)
  return fecha.toISOString()
}

function soloCamposLatest(item) {
  return {
    id: item.id,
    created_at: item.created_at,
    periodo_inicio: item.periodo_inicio,
    periodo_fin: item.periodo_fin,
  }
}

function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

function normalizar(t = '') {
  return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function incluye(texto, terminos) {
  const t = normalizar(texto)
  return terminos.some(term => t.includes(normalizar(term)))
}

function brechaCocinaAlertas(platos, vinos, restauranteId, periodoInicio, periodoFin) {
  const platosActivos = (platos || []).filter(p => p.activo !== false)
  const vinosActivos = (vinos || []).filter(v => v.activo !== false)
  if (!platosActivos.length || !vinosActivos.length) return []

  const tv = v => `${v.nombre || ''} ${v.bodega || ''} ${v.tipo || ''} ${v.region || ''} ${v.uva || ''} ${v.notas_cata || ''}`
  const tp = p => `${p.nombre || ''} ${p.descripcion || ''} ${p.categoria || ''}`

  const generosos = vinosActivos.filter(v => normalizar(v.tipo || '').includes('generoso') || incluye(tv(v), ['fino', 'manzanilla', 'amontillado', 'oloroso']))
  const espumosos = vinosActivos.filter(v => normalizar(v.tipo || '').includes('espumoso') || incluye(tv(v), ['cava', 'champagne', 'brut']))
  const dulces = vinosActivos.filter(v => normalizar(v.tipo || '').includes('dulce') || incluye(tv(v), ['pedro ximenez', 'px', 'moscatel', 'tokaji']))
  const frescos = vinosActivos.filter(v => incluye(tv(v), ['albarino', 'verdejo', 'godello', 'txakoli', 'salino', 'mineral', 'fresco']))
  const tintos = vinosActivos.filter(v => normalizar(v.tipo || '').includes('tinto'))
  const blancos = vinosActivos.filter(v => normalizar(v.tipo || '').includes('blanco'))

  const platosFritura = platosActivos.filter(p => incluye(tp(p), ['frit', 'croqueta', 'rebozado', 'flamenquin', 'adobo', 'tempura']))
  const platosPescado = platosActivos.filter(p => incluye(tp(p), ['pescado', 'marisco', 'gamba', 'atun', 'salmon', 'bacalao', 'boqueron', 'del mar']))
  const platosQueso = platosActivos.filter(p => incluye(tp(p), ['queso', 'curado', 'cabra']))
  const platosCarne = platosActivos.filter(p => incluye(tp(p), ['brasa', 'vaca', 'ternera', 'presa', 'solomillo', 'rabo', 'cordero', 'cerdo']))
  const platosPostre = platosActivos.filter(p => incluye(tp(p), ['postre', 'tarta', 'torrija', 'helado', 'chocolate']))

  const gaps = [
    platosFritura.length >= 2 && generosos.length + espumosos.length < 2 && { cocina: `Frituras (${platosFritura.length} platos)`, falta: 'Generoso seco o espumoso' },
    platosPescado.length >= 2 && frescos.length + espumosos.length + generosos.length < 3 && { cocina: `Pescado/Marisco (${platosPescado.length} platos)`, falta: 'Blanco fresco o atlántico' },
    platosQueso.length >= 1 && generosos.length + dulces.length < 2 && { cocina: `Quesos (${platosQueso.length} platos)`, falta: 'Generoso o vino dulce' },
    platosCarne.length >= 2 && tintos.length < 4 && { cocina: `Carnes (${platosCarne.length} platos)`, falta: 'Tintos con cuerpo o crianza' },
    platosPostre.length >= 2 && dulces.length === 0 && { cocina: `Postres (${platosPostre.length} platos)`, falta: 'Vino dulce de cierre' },
    blancos.length < tintos.length * 0.35 && platosPescado.length + platosFritura.length > 2 && { cocina: `Cocina de mar (${platosPescado.length + platosFritura.length} platos)`, falta: 'Blancos gastronómicos' },
  ].filter(Boolean)

  if (!gaps.length) return []

  return [{
    restaurante_id: restauranteId,
    clave: 'brecha_cocina_vinos',
    entidad_tipo: 'restaurante',
    entidad_id: restauranteId,
    severidad: gaps.length >= 3 ? 'aviso' : 'info',
    titulo: `Carta de vinos sin cobertura para ${gaps.length} aspecto${gaps.length > 1 ? 's' : ''} de tu cocina`,
    detalle: JSON.stringify({ gaps }),
    impacto: gaps.map(g => `${g.cocina} → falta ${g.falta}`).join(' · '),
    accion_sugerida: 'Revisar con sumiller consultor qué estilos incorporar según cocina',
    estado: 'abierta',
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
  }]
}

function esColumnaNoExiste(error) {
  return error?.code === 'PGRST204' || /Could not find.*column|column .* does not exist/i.test(error?.message || '')
}

async function guardarAlertasDeduplicadas(supabase, restauranteId, alertas, periodoFin) {
  if (!alertas.length) return { modo: 'sin_alertas' }

  const { data: existentes, error } = await supabase
    .from('alerts')
    .select(SELECT_ALERT)
    .eq('restaurante_id', restauranteId)
    .in('estado', ['abierta', 'en_progreso'])

  if (error) throw error

  const nuevas = []
  for (const alerta of alertas) {
    const existente = (existentes || []).find(item =>
      item.clave === alerta.clave &&
      item.entidad_tipo === alerta.entidad_tipo &&
      String(item.entidad_id || '') === String(alerta.entidad_id || '')
    )

    if (!existente) {
      nuevas.push({ ...alerta, ultima_deteccion_at: periodoFin, veces_detectada: 1 })
      continue
    }

    const updateAvanzado = {
      severidad: alerta.severidad,
      titulo: alerta.titulo,
      detalle: alerta.detalle,
      impacto: alerta.impacto,
      accion_sugerida: alerta.accion_sugerida,
      periodo_inicio: alerta.periodo_inicio,
      periodo_fin: alerta.periodo_fin,
      ultima_deteccion_at: periodoFin,
      veces_detectada: (Number(existente.veces_detectada) || 1) + 1,
      updated_at: periodoFin,
    }
    const { error: updateError } = await supabase
      .from('alerts')
      .update(updateAvanzado)
      .eq('id', existente.id)

    if (updateError) {
      if (!esColumnaNoExiste(updateError)) throw updateError
      const { error: fallbackError } = await supabase
        .from('alerts')
        .update({
          severidad: alerta.severidad,
          titulo: alerta.titulo,
          detalle: alerta.detalle,
          impacto: alerta.impacto,
          accion_sugerida: alerta.accion_sugerida,
          periodo_inicio: alerta.periodo_inicio,
          periodo_fin: alerta.periodo_fin,
          updated_at: periodoFin,
        })
        .eq('id', existente.id)
      if (fallbackError) throw fallbackError
    }
  }

  if (nuevas.length) {
    const { error: insertError } = await supabase.from('alerts').insert(nuevas)
    if (insertError) {
      if (!esColumnaNoExiste(insertError)) throw insertError
      const fallback = nuevas.map(({ ultima_deteccion_at, veces_detectada, ...alerta }) => alerta)
      const { error: fallbackError } = await supabase.from('alerts').insert(fallback)
      if (fallbackError) throw fallbackError
    }
  }

  return { modo: 'deduplicado', nuevas: nuevas.length, actualizadas: alertas.length - nuevas.length }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })

    const supabase = adminClient()
    const auth = await requireRestaurantAccess(req, supabase, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const [
      { data: kpis, error: kpisError },
      { data: alertas, error: alertasError },
      { data: recomendaciones, error: recomendacionesError },
      { data: clasificaciones, error: clasificacionesError },
      { data: performance, error: performanceError },
    ] = await Promise.all([
      supabase.from('kpi_history').select(SELECT_KPI_HISTORY).eq('restaurante_id', restauranteId).order('created_at', { ascending: false }).limit(40),
      supabase.from('alerts').select(SELECT_ALERT).eq('restaurante_id', restauranteId).in('estado', ['abierta', 'en_progreso']).order('created_at', { ascending: false }).limit(30),
      supabase.from('recommendations').select(SELECT_RECOMMENDATION).eq('restaurante_id', restauranteId).in('estado', ['pendiente', 'en_progreso']).order('created_at', { ascending: false }).limit(30),
      supabase.from('wine_classifications').select(SELECT_WINE_CLASSIFICATION).eq('restaurante_id', restauranteId).order('created_at', { ascending: false }).limit(80),
      supabase.from('wine_performance').select(SELECT_WINE_PERFORMANCE).eq('restaurante_id', restauranteId).order('created_at', { ascending: false }).limit(80),
    ])

    const error = kpisError || alertasError || recomendacionesError || clasificacionesError || performanceError
    if (error) throw error

    const ultima = kpis?.[0] ? soloCamposLatest(kpis[0]) : null
    let snapshot = null
    let inventarioItems = []
    let inventarioPendienteMigracion = false
    let cartaSnapshot = null
    let cartaItems = []
    let cartaPendienteMigracion = false
    let copaSnapshot = null
    let copaCandidates = []
    let copaPendienteMigracion = false
    let consultorDiagnostic = null
    let consultorItems = []
    let consultorPendienteMigracion = false
    let oportunidadSnapshot = null
    let oportunidadItems = []
    let oportunidadPendienteMigracion = false
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('inventory_snapshots')
      .select(SELECT_INVENTORY_SNAPSHOT)
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (snapshotsError) {
      if (esTablaNoExiste(snapshotsError)) inventarioPendienteMigracion = true
      else throw snapshotsError
    } else {
      snapshot = snapshots?.[0] || null
      if (snapshot?.id) {
        const { data: items, error: itemsError } = await supabase
          .from('inventory_snapshot_items')
          .select(SELECT_INVENTORY_ITEM)
          .eq('snapshot_id', snapshot.id)
          .order('valor_stock_coste', { ascending: false })
          .limit(80)
        if (itemsError) {
          if (esTablaNoExiste(itemsError)) inventarioPendienteMigracion = true
          else throw itemsError
        } else {
          inventarioItems = items || []
        }
      }
    }
    const { data: wineListSnapshots, error: wineListError } = await supabase
      .from('wine_list_snapshots')
      .select(SELECT_WINE_LIST_SNAPSHOT)
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (wineListError) {
      if (esTablaNoExiste(wineListError)) cartaPendienteMigracion = true
      else throw wineListError
    } else {
      cartaSnapshot = wineListSnapshots?.[0] || null
      if (cartaSnapshot?.id) {
        const { data: items, error: itemsError } = await supabase
          .from('wine_list_snapshot_items')
          .select(SELECT_WINE_LIST_ITEM)
          .eq('snapshot_id', cartaSnapshot.id)
          .order('productividad_score', { ascending: true })
          .limit(100)
        if (itemsError) {
          if (esTablaNoExiste(itemsError)) cartaPendienteMigracion = true
          else throw itemsError
        } else {
          cartaItems = items || []
        }
      }
    }
    const { data: btgSnapshots, error: btgError } = await supabase
      .from('btg_snapshots')
      .select(SELECT_BTG_SNAPSHOT)
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (btgError) {
      if (esTablaNoExiste(btgError)) copaPendienteMigracion = true
      else throw btgError
    } else {
      copaSnapshot = btgSnapshots?.[0] || null
      if (copaSnapshot?.id) {
        const { data: candidates, error: candidatesError } = await supabase
          .from('btg_candidates')
          .select(SELECT_BTG_CANDIDATE)
          .eq('snapshot_id', copaSnapshot.id)
          .order('score_copa', { ascending: false })
          .limit(80)
        if (candidatesError) {
          if (esTablaNoExiste(candidatesError)) copaPendienteMigracion = true
          else throw candidatesError
        } else {
          copaCandidates = candidates || []
        }
      }
    }
    const { data: diagnostics, error: diagnosticError } = await supabase
      .from('consultant_diagnostics')
      .select(SELECT_CONSULTANT_DIAGNOSTIC)
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (diagnosticError) {
      if (esTablaNoExiste(diagnosticError)) consultorPendienteMigracion = true
      else throw diagnosticError
    } else {
      consultorDiagnostic = diagnostics?.[0] || null
      if (consultorDiagnostic?.id) {
        const { data: items, error: itemsError } = await supabase
          .from('consultant_action_items')
          .select(SELECT_CONSULTANT_ACTION)
          .eq('diagnostic_id', consultorDiagnostic.id)
          .order('created_at', { ascending: true })
        if (itemsError) {
          if (esTablaNoExiste(itemsError)) consultorPendienteMigracion = true
          else throw itemsError
        } else {
          consultorItems = items || []
        }
      }
    }
    const { data: opportunitySnapshots, error: opportunityError } = await supabase
      .from('opportunity_snapshots')
      .select(SELECT_OPPORTUNITY_SNAPSHOT)
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (opportunityError) {
      if (esTablaNoExiste(opportunityError)) oportunidadPendienteMigracion = true
      else throw opportunityError
    } else {
      oportunidadSnapshot = opportunitySnapshots?.[0] || null
      if (oportunidadSnapshot?.id) {
        const { data: items, error: itemsError } = await supabase
          .from('opportunity_items')
          .select(SELECT_OPPORTUNITY_ITEM)
          .eq('snapshot_id', oportunidadSnapshot.id)
          .order('impacto_estimado', { ascending: false })
        if (itemsError) {
          if (esTablaNoExiste(itemsError)) oportunidadPendienteMigracion = true
          else throw itemsError
        } else {
          oportunidadItems = items || []
        }
      }
    }
    const periodoFin = ultima?.periodo_fin || null
    const kpisUltimoPeriodo = periodoFin ? (kpis || []).filter(item => item.periodo_fin === periodoFin) : []
    const clasificacionesUltimoPeriodo = periodoFin ? (clasificaciones || []).filter(item => item.periodo_fin === periodoFin) : []
    const performanceUltimoPeriodo = periodoFin ? (performance || []).filter(item => item.periodo_fin === periodoFin) : []

    return Response.json({
      ultima,
      kpis: kpisUltimoPeriodo,
      alertas: alertas || [],
      recomendaciones: recomendaciones || [],
      clasificaciones: clasificacionesUltimoPeriodo,
      performance: performanceUltimoPeriodo,
      inventario: snapshot ? { snapshot, items: inventarioItems } : null,
      inventario_pendiente_migracion: inventarioPendienteMigracion,
      carta: cartaSnapshot ? { snapshot: cartaSnapshot, items: cartaItems } : null,
      carta_pendiente_migracion: cartaPendienteMigracion,
      copa: copaSnapshot ? { snapshot: copaSnapshot, candidates: copaCandidates } : null,
      copa_pendiente_migracion: copaPendienteMigracion,
      consultor: consultorDiagnostic ? { diagnostic: consultorDiagnostic, items: consultorItems } : null,
      consultor_pendiente_migracion: consultorPendienteMigracion,
      oportunidad: oportunidadSnapshot ? { snapshot: oportunidadSnapshot, items: oportunidadItems } : null,
      oportunidad_pendiente_migracion: oportunidadPendienteMigracion,
    })
  } catch (error) {
    console.error('Error leyendo consultoria fase 1:', error)
    return Response.json({ error: 'No se pudo cargar la consultoria inteligente.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = body.restaurante_id
    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })

    const supabase = adminClient()
    const auth = await requireRestaurantAccess(req, supabase, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const periodoInicio = body.periodo_inicio || haceDiasISO(30)
    const periodoFin = new Date().toISOString()

    const [
      { data: restaurante, error: restError },
      { data: vinos, error: vinosError },
      { data: estadisticas, error: estadisticasError },
      { data: movimientos, error: movimientosError },
      { data: platos, error: platosError },
    ] = await Promise.all([
      supabase.from('restaurantes').select(SELECT_RESTAURANTE_CONSULTORIA).eq('id', restauranteId).single(),
      supabase.from('vinos').select(SELECT_VINO_CONSULTORIA).eq('restaurante_id', restauranteId),
      supabase.from('estadisticas').select(SELECT_ESTADISTICA_CONSULTORIA).eq('restaurante_id', restauranteId).gte('created_at', periodoInicio),
      supabase.from('movimientos_stock').select(SELECT_MOVIMIENTO_CONSULTORIA).eq('restaurante_id', restauranteId).gte('created_at', periodoInicio),
      supabase.from('platos').select(SELECT_PLATO_CONSULTORIA).eq('restaurante_id', restauranteId),
    ])

    const error = restError || vinosError || estadisticasError || movimientosError
    if (error) throw error

    const resultado = calcularConsultoriaFase1({
      restaurante,
      vinos: vinos || [],
      estadisticas: estadisticas || [],
      movimientos: movimientos || [],
      periodoInicio,
      periodoFin,
    })
    const payload = limpiarPayloadPersistencia(resultado)

    await supabase
      .from('recommendations')
      .update({ estado: 'descartada', updated_at: periodoFin })
      .eq('restaurante_id', restauranteId)
      .eq('estado', 'pendiente')
      .eq('origen', 'motor_consultoria_fase1')

    const inserts = []
    if (payload.kpis.length) inserts.push(supabase.from('kpi_history').insert(payload.kpis))
    if (payload.winePerformance.length) inserts.push(supabase.from('wine_performance').insert(payload.winePerformance))
    if (payload.clasificaciones.length) inserts.push(supabase.from('wine_classifications').insert(payload.clasificaciones))
    if (payload.recomendaciones.length) inserts.push(supabase.from('recommendations').insert(payload.recomendaciones))

    const insertResults = await Promise.all(inserts)
    const insertError = insertResults.find(res => res.error)?.error
    if (insertError) throw insertError

    const brechaAlertas = brechaCocinaAlertas(platos || [], vinos || [], restauranteId, periodoInicio, periodoFin)
    payload.alertas = [...payload.alertas, ...brechaAlertas]

    const alertasPersistidas = await guardarAlertasDeduplicadas(supabase, restauranteId, payload.alertas, periodoFin)

    let snapshotInsertado = null
    let inventarioPendienteMigracion = false
    let cartaSnapshotInsertado = null
    let cartaPendienteMigracion = false
    let copaSnapshotInsertado = null
    let copaPendienteMigracion = false
    let consultorDiagnosticInsertado = null
    let consultorPendienteMigracion = false
    let oportunidadSnapshotInsertado = null
    let oportunidadPendienteMigracion = false
    const { data: snapshotData, error: snapshotError } = await supabase
      .from('inventory_snapshots')
      .insert([payload.inventarioSnapshot])
      .select(SELECT_INVENTORY_SNAPSHOT)
      .single()
    if (snapshotError) {
      if (esTablaNoExiste(snapshotError)) {
        inventarioPendienteMigracion = true
      } else {
        throw snapshotError
      }
    } else {
      snapshotInsertado = snapshotData
    }

    if (snapshotInsertado?.id && payload.inventarioItems.length) {
      const items = payload.inventarioItems.map(item => ({
        ...item,
        snapshot_id: snapshotInsertado.id,
      }))
      const { error: itemsError } = await supabase.from('inventory_snapshot_items').insert(items)
      if (itemsError) {
        if (esTablaNoExiste(itemsError)) inventarioPendienteMigracion = true
        else throw itemsError
      }
    }

    const { data: cartaSnapshotData, error: cartaSnapshotError } = await supabase
      .from('wine_list_snapshots')
      .insert([payload.cartaSnapshot])
      .select(SELECT_WINE_LIST_SNAPSHOT)
      .single()
    if (cartaSnapshotError) {
      if (esTablaNoExiste(cartaSnapshotError)) {
        cartaPendienteMigracion = true
      } else {
        throw cartaSnapshotError
      }
    } else {
      cartaSnapshotInsertado = cartaSnapshotData
    }

    if (cartaSnapshotInsertado?.id && payload.cartaItems.length) {
      const items = payload.cartaItems.map(item => ({
        ...item,
        snapshot_id: cartaSnapshotInsertado.id,
      }))
      const { error: itemsError } = await supabase.from('wine_list_snapshot_items').insert(items)
      if (itemsError) {
        if (esTablaNoExiste(itemsError)) cartaPendienteMigracion = true
        else throw itemsError
      }
    }

    const { data: copaSnapshotData, error: copaSnapshotError } = await supabase
      .from('btg_snapshots')
      .insert([payload.copaSnapshot])
      .select(SELECT_BTG_SNAPSHOT)
      .single()
    if (copaSnapshotError) {
      if (esTablaNoExiste(copaSnapshotError)) {
        copaPendienteMigracion = true
      } else {
        throw copaSnapshotError
      }
    } else {
      copaSnapshotInsertado = copaSnapshotData
    }

    if (copaSnapshotInsertado?.id && payload.copaCandidates.length) {
      const candidates = payload.copaCandidates.map(item => ({
        ...item,
        snapshot_id: copaSnapshotInsertado.id,
      }))
      const { error: candidatesError } = await supabase.from('btg_candidates').insert(candidates)
      if (candidatesError) {
        if (esTablaNoExiste(candidatesError)) copaPendienteMigracion = true
        else throw candidatesError
      }
    }

    const { data: diagnosticData, error: diagnosticInsertError } = await supabase
      .from('consultant_diagnostics')
      .insert([payload.consultorDiagnostic])
      .select(SELECT_CONSULTANT_DIAGNOSTIC)
      .single()
    if (diagnosticInsertError) {
      if (esTablaNoExiste(diagnosticInsertError)) {
        consultorPendienteMigracion = true
      } else {
        throw diagnosticInsertError
      }
    } else {
      consultorDiagnosticInsertado = diagnosticData
    }

    if (consultorDiagnosticInsertado?.id && payload.consultorItems.length) {
      const items = payload.consultorItems.map(item => ({
        ...item,
        diagnostic_id: consultorDiagnosticInsertado.id,
      }))
      const { error: itemsError } = await supabase.from('consultant_action_items').insert(items)
      if (itemsError) {
        if (esTablaNoExiste(itemsError)) consultorPendienteMigracion = true
        else throw itemsError
      }
    }

    const { data: oportunidadSnapshotData, error: oportunidadSnapshotError } = await supabase
      .from('opportunity_snapshots')
      .insert([payload.oportunidadSnapshot])
      .select(SELECT_OPPORTUNITY_SNAPSHOT)
      .single()
    if (oportunidadSnapshotError) {
      if (esTablaNoExiste(oportunidadSnapshotError)) {
        oportunidadPendienteMigracion = true
      } else {
        throw oportunidadSnapshotError
      }
    } else {
      oportunidadSnapshotInsertado = oportunidadSnapshotData
    }

    if (oportunidadSnapshotInsertado?.id && payload.oportunidadItems.length) {
      const items = payload.oportunidadItems.map(item => ({
        ...item,
        snapshot_id: oportunidadSnapshotInsertado.id,
      }))
      const { error: itemsError } = await supabase.from('opportunity_items').insert(items)
      if (itemsError) {
        if (esTablaNoExiste(itemsError)) oportunidadPendienteMigracion = true
        else throw itemsError
      }
    }

    return Response.json({
      ok: true,
      resumen: resultado.resumen,
      kpis: resultado.kpis,
      alertas: resultado.alertas,
      recomendaciones: resultado.recomendaciones,
      clasificaciones: resultado.clasificaciones.map(({ vino, ...item }) => item),
      inventario: {
        snapshot: snapshotInsertado,
        items: payload.inventarioItems,
      },
      inventario_pendiente_migracion: inventarioPendienteMigracion,
      carta: {
        snapshot: cartaSnapshotInsertado,
        items: payload.cartaItems,
      },
      carta_pendiente_migracion: cartaPendienteMigracion,
      copa: {
        snapshot: copaSnapshotInsertado,
        candidates: payload.copaCandidates,
      },
      copa_pendiente_migracion: copaPendienteMigracion,
      consultor: {
        diagnostic: consultorDiagnosticInsertado,
        items: payload.consultorItems,
      },
      consultor_pendiente_migracion: consultorPendienteMigracion,
      oportunidad: {
        snapshot: oportunidadSnapshotInsertado,
        items: payload.oportunidadItems,
      },
      oportunidad_pendiente_migracion: oportunidadPendienteMigracion,
      alertas_persistidas: alertasPersistidas,
    })
  } catch (error) {
    console.error('Error recalculando consultoria fase 1:', error)
    return Response.json({ error: 'No se pudo recalcular la consultoria inteligente.' }, { status: 500 })
  }
}
