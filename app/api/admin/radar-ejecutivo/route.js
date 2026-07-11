import { createClient } from '@supabase/supabase-js'
import { getUserFromRequest } from '../../_lib/auth'
import { leerAutomationRunsRecientes, resumirAutomationRuns } from '../../../lib/automationRunLog'
import { crearAgendaConsultorSemanal, crearLecturaSemanalConsultor } from '../../../lib/consultantWeeklyBriefing'

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

function guardarUltimoPorRestaurante(mapa, filas = []) {
  for (const fila of filas || []) {
    if (!fila?.restaurante_id) continue
    const actual = mapa.get(fila.restaurante_id)
    if (!actual || new Date(fila.created_at || fila.periodo_fin || 0) > new Date(actual.created_at || actual.periodo_fin || 0)) {
      mapa.set(fila.restaurante_id, fila)
    }
  }
}

async function leerOpcional(queryPromise) {
  const { data, error } = await queryPromise
  if (error) {
    if (esTablaNoExiste(error)) return []
    throw error
  }
  return data || []
}

function objeto(valor) {
  if (!valor) return {}
  if (typeof valor === 'object' && !Array.isArray(valor)) return valor
  try {
    return JSON.parse(valor)
  } catch {
    return {}
  }
}

function numero(valor) {
  return Number(valor) || 0
}

function defensaDesdeReporte(reporte = null) {
  if (!reporte) {
    return {
      tiene_foto: false,
      estado: 'sin_foto',
      estado_label: 'Sin foto economica',
      score: 0,
      presentables: 0,
      con_contexto: 0,
      no_presentar: 0,
      beneficio_presentable: 0,
      oportunidad_estimada: 0,
      bloqueo_principal: 'Guardar foto de trazabilidad',
      ultima_foto_at: null,
    }
  }

  const resumen = objeto(reporte.resumen)
  const metadata = objeto(reporte.metadata)
  const defensas = Array.isArray(metadata.defensa_cifras) ? metadata.defensa_cifras : []
  const presentables = numero(metadata.defensa_presentables) || defensas.filter(item => item.estado === 'presentable').length
  const conContexto = numero(metadata.defensa_con_contexto) || defensas.filter(item => item.estado === 'presentar_con_contexto').length
  const noPresentar = numero(metadata.defensa_no_presentar) || defensas.filter(item => item.estado === 'no_presentar').length
  const score = numero(resumen.puntuacion_rigor)
  const bloqueo = defensas.find(item => item.estado === 'no_presentar')
  const estado = noPresentar > 0 || score < 45
    ? 'no_presentar'
    : score >= 75 && presentables > 0
      ? 'presentable'
      : 'con_contexto'

  return {
    tiene_foto: true,
    estado,
    estado_label: estado === 'presentable' ? 'Presentable' : estado === 'con_contexto' ? 'Con contexto' : 'No presentar',
    score,
    presentables,
    con_contexto: conContexto,
    no_presentar: noPresentar,
    beneficio_real_tpv: numero(resumen.beneficio_real_tpv),
    beneficio_confirmado_sala: numero(resumen.beneficio_confirmado_sala),
    beneficio_inferido: numero(resumen.beneficio_inferido),
    beneficio_presentable: numero(resumen.beneficio_real_tpv) + numero(resumen.beneficio_confirmado_sala),
    oportunidad_estimada: numero(resumen.oportunidad_estimada),
    advertencias: numero(resumen.advertencias),
    bloqueo_principal: bloqueo?.titulo || (score < 45 ? 'Rigor economico bajo' : 'Presentar con contexto'),
    accion: bloqueo?.accion || 'Revisar trazabilidad economica',
    ultima_foto_at: reporte.created_at || null,
  }
}

function resumirDefensaEconomica(items = []) {
  const total = items.length
  const lecturas = items.map(item => ({ ...item.economica, restaurante: item.restaurante }))
  const conFoto = lecturas.filter(item => item.tiene_foto)
  const sinFoto = lecturas.filter(item => !item.tiene_foto)
  const bloqueadas = lecturas
    .filter(item => item.estado === 'no_presentar' || !item.tiene_foto)
    .sort((a, b) => (a.tiene_foto === b.tiene_foto ? a.score - b.score : a.tiene_foto ? 1 : -1))
    .slice(0, 6)
  const presentables = lecturas
    .filter(item => item.estado === 'presentable')
    .sort((a, b) => numero(b.beneficio_presentable) - numero(a.beneficio_presentable))
    .slice(0, 6)

  return {
    resumen: {
      restaurantes: total,
      con_foto: conFoto.length,
      sin_foto: sinFoto.length,
      presentables: conFoto.filter(item => item.estado === 'presentable').length,
      con_contexto: conFoto.filter(item => item.estado === 'con_contexto').length,
      no_presentar: conFoto.filter(item => item.estado === 'no_presentar').length,
      beneficio_presentable: conFoto.reduce((sum, item) => sum + numero(item.beneficio_presentable), 0),
      oportunidad_estimada: conFoto.reduce((sum, item) => sum + numero(item.oportunidad_estimada), 0),
      rigor_medio: conFoto.length ? Math.round(conFoto.reduce((sum, item) => sum + numero(item.score), 0) / conFoto.length) : 0,
    },
    bloqueadas: bloqueadas.map(item => ({
      restaurante_id: item.restaurante?.id,
      restaurante: item.restaurante,
      estado: item.estado,
      estado_label: item.estado_label,
      score: item.score,
      bloqueo_principal: item.bloqueo_principal,
      accion: item.accion,
      tiene_foto: item.tiene_foto,
    })),
    presentables: presentables.map(item => ({
      restaurante_id: item.restaurante?.id,
      restaurante: item.restaurante,
      score: item.score,
      beneficio_presentable: item.beneficio_presentable,
      oportunidad_estimada: item.oportunidad_estimada,
      ultima_foto_at: item.ultima_foto_at,
    })),
  }
}

function checkCierre(id, titulo, estado, detalle, accion, href = '/admin/consultoria') {
  return { id, titulo, estado, detalle, accion, href }
}

function crearCierreProducto(items = [], automatismos = {}, defensaEconomica = {}) {
  const total = items.length
  const semanales = items.filter(item => item.semanal?.periodo_key).length
  const envioFallido = items.filter(item => item.semanal?.delivery?.status === 'failed').length
  const envioPendiente = items.filter(item => ['draft', 'pending'].includes(item.semanal?.delivery?.status)).length
  const fotosRadar = items.filter(item => item.resumen?.ultima_foto).length
  const defensa = defensaEconomica.resumen || {}
  const automatismoResumen = automatismos.resumen || {}
  const automationPending = (automatismos.migration_pending || []).length
  const automationFailed = numero(automatismoResumen.failed) + numero(automatismoResumen.errors)
  const checks = [
    checkCierre(
      'resumen_semanal',
      'Resumen semanal',
      semanales === total && total > 0 ? 'ok' : semanales > 0 ? 'warning' : 'blocker',
      `${semanales}/${total} restaurantes tienen foto semanal.`,
      'Generar o recalcular fotos semanales.',
      '/admin/consultoria'
    ),
    checkCierre(
      'entrega_semanal',
      'Entrega semanal',
      envioFallido > 0 ? 'blocker' : envioPendiente > 0 ? 'warning' : 'ok',
      `${envioFallido} envios fallidos y ${envioPendiente} pendientes.`,
      'Revisar rutina, destinatario y Resend.',
      '/admin/consultoria'
    ),
    checkCierre(
      'defensa_economica',
      'Defensa economica',
      numero(defensa.sin_foto) > 0 || numero(defensa.no_presentar) > 0 ? 'blocker' : numero(defensa.con_contexto) > 0 ? 'warning' : 'ok',
      `${numero(defensa.presentables)} presentables, ${numero(defensa.con_contexto)} con contexto, ${numero(defensa.sin_foto)} sin foto.`,
      'Guardar fotos de trazabilidad y completar datos economicos.',
      '/admin/consultoria'
    ),
    checkCierre(
      'automatismos',
      'Automatismos',
      automationPending || automationFailed ? 'blocker' : numero(automatismoResumen.total) > 0 ? 'ok' : 'warning',
      automationPending
        ? 'Migracion de logs pendiente.'
        : `${numero(automatismoResumen.total)} ejecuciones registradas, ${automationFailed} errores.`,
      'Aplicar logs y revisar cron/radar diario.',
      '/admin/consultoria'
    ),
    checkCierre(
      'radar_persistido',
      'Radar persistido',
      fotosRadar === total && total > 0 ? 'ok' : fotosRadar > 0 ? 'warning' : 'blocker',
      `${fotosRadar}/${total} restaurantes tienen foto persistida del radar ejecutivo.`,
      'Recalcular y guardar radar en fichas prioritarias.',
      '/admin/consultoria'
    ),
  ]
  const blockers = checks.filter(item => item.estado === 'blocker').length
  const warnings = checks.filter(item => item.estado === 'warning').length
  const score = Math.max(0, 100 - blockers * 22 - warnings * 10)

  return {
    estado: blockers ? 'bloqueado' : warnings ? 'casi' : 'listo',
    score,
    checks,
    resumen: {
      total_checks: checks.length,
      ok: checks.filter(item => item.estado === 'ok').length,
      warnings,
      blockers,
    },
  }
}

export async function GET(req) {
  try {
    const auth = await getUserFromRequest(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    if ((auth.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
      return Response.json({ error: 'No autorizado' }, { status: 403 })
    }

    const supabase = adminClient()
    const [
      restaurantesRes,
      diagnostics,
      opportunities,
      inventory,
      wineLists,
      btg,
      alerts,
      recommendations,
      weeklySummaries,
      weeklyPreferences,
      automationRuns,
      traceReports,
    ] = await Promise.all([
      supabase.from('restaurantes').select('id, nombre, ciudad, provincia, email, slug, ticket_medio, ticket_medio_comida, ticket_comida').order('nombre'),
      leerOpcional(supabase.from('consultant_diagnostics').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('opportunity_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('inventory_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('wine_list_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('btg_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('alerts').select('*').in('estado', ['abierta', 'en_progreso']).order('created_at', { ascending: false }).limit(2000)),
      leerOpcional(supabase.from('recommendations').select('*').in('estado', ['pendiente', 'en_progreso']).order('created_at', { ascending: false }).limit(2000)),
      leerOpcional(supabase.from('weekly_executive_summaries').select('*').order('periodo_fin', { ascending: false }).limit(1200)),
      leerOpcional(supabase.from('weekly_summary_preferences').select('*')),
      leerAutomationRunsRecientes({ supabase, dias: 7, limit: 120, jobKeys: ['radar_diario', 'resumen_semanal_recalcular'] }),
      leerOpcional(supabase.from('economic_trace_reports').select('id, restaurante_id, created_at, resumen, metadata').order('created_at', { ascending: false }).limit(1200)),
    ])

    if (restaurantesRes.error) throw restaurantesRes.error

    const latestDiagnostic = new Map()
    const latestOpportunity = new Map()
    const latestInventory = new Map()
    const latestWineList = new Map()
    const latestBtg = new Map()
    const latestWeekly = new Map()
    const latestTraceReport = new Map()
    guardarUltimoPorRestaurante(latestDiagnostic, diagnostics)
    guardarUltimoPorRestaurante(latestOpportunity, opportunities)
    guardarUltimoPorRestaurante(latestInventory, inventory)
    guardarUltimoPorRestaurante(latestWineList, wineLists)
    guardarUltimoPorRestaurante(latestBtg, btg)
    guardarUltimoPorRestaurante(latestWeekly, weeklySummaries)
    guardarUltimoPorRestaurante(latestTraceReport, traceReports)

    const weeklyPrefsPorRestaurante = new Map()
    for (const pref of weeklyPreferences) {
      if (pref?.restaurante_id) weeklyPrefsPorRestaurante.set(pref.restaurante_id, pref)
    }

    const alertasPorRestaurante = new Map()
    for (const alerta of alerts) {
      const lista = alertasPorRestaurante.get(alerta.restaurante_id) || []
      lista.push(alerta)
      alertasPorRestaurante.set(alerta.restaurante_id, lista)
    }

    const recomendacionesPorRestaurante = new Map()
    for (const rec of recommendations) {
      const lista = recomendacionesPorRestaurante.get(rec.restaurante_id) || []
      lista.push(rec)
      recomendacionesPorRestaurante.set(rec.restaurante_id, lista)
    }

    const items = (restaurantesRes.data || []).map(restaurante => {
      const diagnostic = latestDiagnostic.get(restaurante.id) || null
      const opportunity = latestOpportunity.get(restaurante.id) || null
      const inventorySnapshot = latestInventory.get(restaurante.id) || null
      const wineListSnapshot = latestWineList.get(restaurante.id) || null
      const btgSnapshot = latestBtg.get(restaurante.id) || null
      const alertas = alertasPorRestaurante.get(restaurante.id) || []
      const recomendaciones = recomendacionesPorRestaurante.get(restaurante.id) || []
      const semanal = crearLecturaSemanalConsultor({
        restaurante,
        resumenSemanal: latestWeekly.get(restaurante.id) || null,
        preferencias: weeklyPrefsPorRestaurante.get(restaurante.id) || {},
        alertas,
        recomendaciones,
      })
      const economica = defensaDesdeReporte(latestTraceReport.get(restaurante.id) || null)
      const criticas = alertas.filter(alerta => alerta.severidad === 'critica').length
      const avisos = alertas.filter(alerta => alerta.severidad === 'aviso').length
      const score = diagnostic?.score ?? Math.min(100, criticas * 25 + avisos * 10 + recomendaciones.filter(rec => rec.prioridad === 'alta').length * 8)
      const prioridad = diagnostic?.prioridad || (score >= 65 ? 'alta' : score >= 35 ? 'media' : 'baja')
      const candidatosCopa = btgSnapshot
        ? Number(btgSnapshot.candidatos_copa || 0) + Number(btgSnapshot.candidatos_copa_premium || 0) + Number(btgSnapshot.candidatos_coravin || 0)
        : 0
      const principal = alertas[0] || null
      return {
        restaurante,
        score,
        prioridad,
        diagnostic,
        opportunity,
        inventory: inventorySnapshot,
        wineList: wineListSnapshot,
        btg: btgSnapshot,
        semanal,
        economica,
        alertas: alertas.slice(0, 8),
        recomendaciones: recomendaciones.slice(0, 8),
        resumen: {
          alertas_abiertas: alertas.length,
          alertas_criticas: criticas,
          alertas_aviso: avisos,
          recuperacion_anual_estimada: Number(opportunity?.recuperacion_anual_estimada || 0),
          capital_liberable_estimado: Number(opportunity?.capital_liberable_estimado || 0),
          stock_inmovilizado_valor: Number(inventorySnapshot?.stock_inmovilizado_valor || 0),
          stock_inmovilizado_refs: Number(inventorySnapshot?.stock_inmovilizado_refs || 0),
          carta_inflada: Boolean(wineListSnapshot?.carta_inflada),
          bottom10_refs: Number(wineListSnapshot?.bottom10_refs || 0),
          candidatos_copa: candidatosCopa,
          beneficio_copa_estimado: Number(btgSnapshot?.beneficio_potencial_estimado || 0),
          semanal_beneficio_bruto: semanal.kpis.beneficio_bruto,
          semanal_recuperable: semanal.kpis.recuperable_semana,
          semanal_oportunidad_anual: semanal.kpis.oportunidad_anual,
          semanal_delivery_status: semanal.delivery.status,
          semanal_bloqueos: semanal.bloqueos.length,
          semanal_score: semanal.score,
          defensa_economica_estado: economica.estado,
          defensa_economica_score: economica.score,
          defensa_economica_presentables: economica.presentables,
          defensa_economica_no_presentar: economica.no_presentar,
          defensa_economica_beneficio_presentable: economica.beneficio_presentable,
          siguiente_accion: recomendaciones[0]?.accion || principal?.accion_sugerida || diagnostic?.problema_principal || 'Revisar diagnostico mensual.',
          problema_principal: principal?.titulo || diagnostic?.problema_principal || 'Sin alerta dominante',
          ultima_foto: diagnostic?.created_at || opportunity?.created_at || inventorySnapshot?.created_at || null,
        },
      }
    })

    const consultor = crearAgendaConsultorSemanal(items)
    const defensaEconomica = resumirDefensaEconomica(items)
    const automatismos = resumirAutomationRuns(automationRuns.data, automationRuns.pending)

    return Response.json({
      items,
      consultor,
      defensa_economica: defensaEconomica,
      automatismos,
      cierre_producto: crearCierreProducto(items, automatismos, defensaEconomica),
    })
  } catch (error) {
    console.error('Error cargando radar ejecutivo:', error)
    return Response.json({ error: 'No se pudo cargar el radar ejecutivo.' }, { status: 500 })
  }
}
