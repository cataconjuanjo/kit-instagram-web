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
    ] = await Promise.all([
      supabase.from('restaurantes').select('id, nombre, ciudad, provincia, email, slug, ticket_medio, ticket_medio_comida, ticket_comida').order('nombre'),
      leerOpcional(supabase.from('consultant_diagnostics').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('opportunity_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('inventory_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('wine_list_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('btg_snapshots').select('*').order('created_at', { ascending: false }).limit(800)),
      leerOpcional(supabase.from('alerts').select('*').in('estado', ['abierta', 'en_progreso']).order('created_at', { ascending: false }).limit(2000)),
      leerOpcional(supabase.from('recommendations').select('*').in('estado', ['pendiente', 'en_progreso']).order('created_at', { ascending: false }).limit(2000)),
    ])

    if (restaurantesRes.error) throw restaurantesRes.error

    const latestDiagnostic = new Map()
    const latestOpportunity = new Map()
    const latestInventory = new Map()
    const latestWineList = new Map()
    const latestBtg = new Map()
    guardarUltimoPorRestaurante(latestDiagnostic, diagnostics)
    guardarUltimoPorRestaurante(latestOpportunity, opportunities)
    guardarUltimoPorRestaurante(latestInventory, inventory)
    guardarUltimoPorRestaurante(latestWineList, wineLists)
    guardarUltimoPorRestaurante(latestBtg, btg)

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
          siguiente_accion: recomendaciones[0]?.accion || principal?.accion_sugerida || diagnostic?.problema_principal || 'Revisar diagnostico mensual.',
          problema_principal: principal?.titulo || diagnostic?.problema_principal || 'Sin alerta dominante',
          ultima_foto: diagnostic?.created_at || opportunity?.created_at || inventorySnapshot?.created_at || null,
        },
      }
    })

    return Response.json({ items })
  } catch (error) {
    console.error('Error cargando radar ejecutivo:', error)
    return Response.json({ error: 'No se pudo cargar el radar ejecutivo.' }, { status: 500 })
  }
}
