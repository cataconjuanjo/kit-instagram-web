import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

function migrationPending(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return text.includes('kiosko_mobile_intents') || text.includes('schema cache') || text.includes('pgrst')
}

export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tiendaId = access.tienda.id

  const dias = 30
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  const desde7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const desde14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: searchesData } = await supabaseAdmin
    .from('kiosko_searches')
    .select('consulta, mode, vinos_ids, vinos_nombres, created_at')
    .eq('tienda_id', tiendaId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })

  const searches = searchesData || []

  let mobilePendiente = false
  let mobileIntents = []
  const { data: mobileData, error: mobileError } = await supabaseAdmin
    .from('kiosko_mobile_intents')
    .select('vino_id, vino_nombre, vino_bodega, source, lang, created_at')
    .eq('tienda_id', tiendaId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })

  if (mobileError) {
    if (migrationPending(mobileError)) mobilePendiente = true
    else console.error('[kiosko mobile analytics]', mobileError)
  } else {
    mobileIntents = mobileData || []
  }

  if (searches.length === 0 && mobileIntents.length === 0) {
    return NextResponse.json({
      vacio: true,
      movil: { total: 0, semanaActual: 0, pendiente: mobilePendiente, topVinos: [], recientes: [] },
    })
  }

  // ── Top consultas ───────────────────────────────────────────────────────────
  const consultaCount = {}
  searches.forEach(s => {
    const k = s.consulta.toLowerCase().trim()
    consultaCount[k] = (consultaCount[k] || 0) + 1
  })
  const topConsultas = Object.entries(consultaCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([consulta, veces]) => ({ consulta, veces }))

  // ── Vinos más recomendados ──────────────────────────────────────────────────
  const vinoCount = {}
  const vinoCount7 = {}
  searches.forEach(s => {
    const en7d = s.created_at >= desde7
    ;(s.vinos_ids || []).forEach((id, i) => {
      if (!vinoCount[id]) vinoCount[id] = { nombre: s.vinos_nombres?.[i] || id, veces: 0 }
      vinoCount[id].veces++
      if (en7d) vinoCount7[id] = (vinoCount7[id] || 0) + 1
    })
  })
  const topVinosIds = Object.entries(vinoCount)
    .sort((a, b) => b[1].veces - a[1].veces).slice(0, 10)
    .map(([id]) => id)

  // Fetch stock actual para predecir agotamiento
  const { data: stockData } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, stock')
    .eq('tienda_id', tiendaId)
    .in('id', topVinosIds.length ? topVinosIds : ['00000000-0000-0000-0000-000000000000'])

  const stockMap = {}
  ;(stockData || []).forEach(v => { stockMap[String(v.id)] = Number(v.stock ?? 0) })

  const topVinos = topVinosIds.map(id => {
    const { nombre, veces } = vinoCount[id]
    const stock   = stockMap[id] ?? null
    const recom7d = vinoCount7[id] || 0
    const diasRestantes = (stock !== null && recom7d > 0)
      ? Math.round(stock / (recom7d / 7))
      : null
    return { id, nombre, veces, stock, diasRestantes }
  })

  // ── Distribución wizard vs maridaje ────────────────────────────────────────
  const totalWizard   = searches.filter(s => s.mode === 'wizard').length
  const totalMaridaje = searches.filter(s => s.mode === 'maridaje').length

  // ── Búsquedas por día (últimos 14 días) ─────────────────────────────────────
  const porDia = {}
  searches.filter(s => s.created_at >= desde14).forEach(s => {
    const dia = s.created_at.slice(0, 10)
    porDia[dia] = (porDia[dia] || 0) + 1
  })
  const timeline = Object.entries(porDia)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, busquedas]) => ({ fecha, busquedas }))

  // ── Semana actual vs anterior ───────────────────────────────────────────────
  const semanaActual  = searches.filter(s => s.created_at >= desde7).length
  const semanaAnterior = searches.filter(s => s.created_at >= desde14 && s.created_at < desde7).length

  const mobileCount = {}
  mobileIntents.forEach(m => {
    const id = String(m.vino_id || `${m.vino_nombre || 'vino'}-${m.vino_bodega || ''}`)
    if (!mobileCount[id]) {
      mobileCount[id] = {
        id,
        nombre: m.vino_nombre || 'Vino sin nombre',
        bodega: m.vino_bodega || '',
        veces: 0,
      }
    }
    mobileCount[id].veces++
  })
  const topMobileVinos = Object.values(mobileCount)
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 10)
  const mobileSemanaActual = mobileIntents.filter(m => m.created_at >= desde7).length

  // ── Tendencias semanales (últimas 8 semanas) ────────────────────────────────
  const ahora = Date.now()
  const tendencias = Array.from({ length: 8 }, (_, i) => {
    const inicioMs = ahora - (8 - i) * 7 * 24 * 60 * 60 * 1000
    const finMs    = ahora - (7 - i) * 7 * 24 * 60 * 60 * 1000
    const inicio   = new Date(inicioMs).toISOString()
    const fin      = new Date(finMs).toISOString()
    const semana   = searches.filter(s => s.created_at >= inicio && s.created_at < fin)
    const d        = new Date(inicioMs)
    return {
      label:    `${d.getDate()}/${d.getMonth() + 1}`,
      total:    semana.length,
      wizard:   semana.filter(s => s.mode === 'wizard').length,
      maridaje: semana.filter(s => s.mode === 'maridaje').length,
    }
  })

  // ── Ventas reales desde Square ──────────────────────────────────────────────
  const { data: syncLogs } = await supabaseAdmin
    .from('square_sync_log')
    .select('lineas, created_at')
    .eq('tienda_slug', slug)
    .eq('ok', true)

  const ventasPorVino = {}
  let ultimoSyncAt = null
  for (const log of syncLogs || []) {
    if (!ultimoSyncAt || log.created_at > ultimoSyncAt) ultimoSyncAt = log.created_at
    for (const linea of log.lineas || []) {
      if (linea.status === 'ok' && linea.vino_id) {
        ventasPorVino[linea.vino_id] = (ventasPorVino[linea.vino_id] || 0) + (linea.quantity || 1)
      }
    }
  }

  return NextResponse.json({
    vacio: false,
    total: searches.length,
    semanaActual,
    semanaAnterior,
    topConsultas,
    topVinos,
    modos: { wizard: totalWizard, maridaje: totalMaridaje },
    movil: {
      total: mobileIntents.length,
      semanaActual: mobileSemanaActual,
      pendiente: mobilePendiente,
      topVinos: topMobileVinos,
      recientes: mobileIntents.slice(0, 12).map(m => ({
        vinoId: m.vino_id,
        nombre: m.vino_nombre || 'Vino sin nombre',
        bodega: m.vino_bodega || '',
        source: m.source,
        lang: m.lang,
        fecha: m.created_at,
      })),
    },
    ventasPorVino,
    ultimoSyncAt,
    timeline,
    tendencias,
    recientes: searches.slice(0, 20).map(s => ({
      consulta: s.consulta,
      mode: s.mode,
      vinos: s.vinos_nombres?.slice(0, 3) || [],
      fecha: s.created_at,
    })),
  })
}
