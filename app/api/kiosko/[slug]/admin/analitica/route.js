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

  // ── Descuadres: ventas con stock_antes ≤ 0 en 90 días ───────────────────────
  // Ejecutado siempre, antes del early-return de analytics vacío, para que el
  // tab Descuadres muestre datos aunque la tienda no tenga búsquedas de kiosko.
  // payment_lines_applied NO tiene vino_id; el enlace es catalog_id →
  // vinos_tienda.square_variation_id (prioridad) o .square_catalog_id.
  const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const PAGE3 = 1000; let plaDescuadre = []; let from3 = 0
  while (true) {
    const { data: plaPage, error: plaError } = await supabaseAdmin
      .from('payment_lines_applied')
      .select('catalog_id, qty, stock_antes, stock_despues, created_at')
      .eq('tienda_id', tiendaId)
      .lte('stock_antes', 0)
      .gte('created_at', hace90)
      .order('created_at', { ascending: false })
      .range(from3, from3 + PAGE3 - 1)
    if (plaError) {
      console.error('[analitica] payment_lines_applied error:', plaError.message, plaError.code)
      break
    }
    plaDescuadre = plaDescuadre.concat(plaPage || [])
    if (!plaPage || plaPage.length < PAGE3) break
    from3 += PAGE3
  }

  const descuadreMap = {}
  for (const row of plaDescuadre) {
    const key = row.catalog_id
    if (!key) continue
    if (!descuadreMap[key]) {
      descuadreMap[key] = { catalog_id: key, ventas: 0, ultima_venta: row.created_at }
    }
    descuadreMap[key].ventas++
    if (row.created_at > descuadreMap[key].ultima_venta) descuadreMap[key].ultima_venta = row.created_at
  }

  // Enriquecer: dos queries paralelas por square_variation_id y square_catalog_id
  const catalogIds = Object.keys(descuadreMap)
  const catalogVinoMap = {}
  if (catalogIds.length) {
    const chunk = catalogIds.slice(0, 200)
    const [{ data: byVariation }, { data: byCatalog }] = await Promise.all([
      supabaseAdmin
        .from('vinos_tienda')
        .select('id, nombre, stock, activo, precio_pvp, categoria, square_variation_id, square_catalog_id')
        .eq('tienda_id', tiendaId)
        .in('square_variation_id', chunk),
      supabaseAdmin
        .from('vinos_tienda')
        .select('id, nombre, stock, activo, precio_pvp, categoria, square_variation_id, square_catalog_id')
        .eq('tienda_id', tiendaId)
        .in('square_catalog_id', chunk),
    ])
    for (const v of byCatalog   || []) if (v.square_catalog_id)   catalogVinoMap[v.square_catalog_id]   = v
    for (const v of byVariation || []) if (v.square_variation_id) catalogVinoMap[v.square_variation_id] = v
  }

  const descuadres = Object.values(descuadreMap)
    .sort((a, b) => b.ventas - a.ventas)
    .map(d => {
      const vino = catalogVinoMap[d.catalog_id] || {}
      return {
        vino_id:      vino.id || null,
        catalog_id:   d.catalog_id,
        nombre:       vino.nombre || d.catalog_id || '?',
        categoria:    vino.categoria || null,
        ventas:       d.ventas,
        stock_actual: vino.stock ?? null,
        activo:       vino.activo ?? null,
        precio_pvp:   vino.precio_pvp ?? null,
        ultima_venta: d.ultima_venta,
      }
    })

  if (searches.length === 0 && mobileIntents.length === 0) {
    return NextResponse.json({
      vacio: true,
      movil: { total: 0, semanaActual: 0, pendiente: mobilePendiente, topVinos: [], recientes: [] },
      descuadres,
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

  const todosVinoIds = Object.keys(vinoCount)

  // Fetch stock + datos de conversión para todos los vinos recomendados
  const { data: vinoDataArr } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, stock, precio_pvp, foto_url, ubicacion_estanteria')
    .eq('tienda_id', tiendaId)
    .in('id', todosVinoIds.length ? todosVinoIds.slice(0, 100) : ['00000000-0000-0000-0000-000000000000'])

  const stockMap = {}, precioMap = {}, fotoMap = {}, ubicacionMap = {}
  for (const v of vinoDataArr || []) {
    const id = String(v.id)
    stockMap[id]     = Number(v.stock ?? 0)
    precioMap[id]    = v.precio_pvp ? Number(v.precio_pvp) : null
    fotoMap[id]      = v.foto_url || null
    ubicacionMap[id] = v.ubicacion_estanteria || null
  }

  const topVinos = topVinosIds.map(id => {
    const { nombre, veces } = vinoCount[id]
    const stock   = stockMap[id] !== undefined ? stockMap[id] : null
    const recom7d = vinoCount7[id] || 0
    const diasRestantes = (stock !== null && recom7d > 0)
      ? Math.round(stock / (recom7d / 7))
      : null
    return { id, nombre, veces, stock, diasRestantes }
  })

  // ── Distribución por modo ──────────────────────────────────────────────────
  const totalWizard   = searches.filter(s => s.mode === 'wizard').length
  const totalMaridaje = searches.filter(s => s.mode === 'maridaje').length
  const totalRegalo   = searches.filter(s => s.mode === 'regalo').length
  const totalExplorar = searches.filter(s => s.mode === 'explorar').length

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
      regalo:   semana.filter(s => s.mode === 'regalo').length,
      explorar: semana.filter(s => s.mode === 'explorar').length,
    }
  })

  // ── Ventas reales desde Square ──────────────────────────────────────────────
  // Paginado para superar el tope de 1.000 filas de Supabase/PostgREST.
  // Filtro a 90 días: equilibrio entre histórico útil y coste de scan por tienda.
  // Revisar hacia tabla de rollup diario si se cumple alguna de estas condiciones:
  //   · square_sync_log supera ~5.000 filas para una tienda_slug
  //   · varias tiendas activas con carga frecuente del panel de admin
  //   · se necesita histórico rutinario > 90 días en la vista de rendimiento
  // hace90 ya definido arriba (bloque descuadres)
  let syncLogs = []
  {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data: page, error: pageError } = await supabaseAdmin
        .from('square_sync_log')
        .select('lineas, created_at')
        .eq('tienda_slug', slug)
        .eq('ok', true)
        .gte('created_at', hace90)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (pageError) { console.error('[analitica] square_sync_log page error:', pageError.message); break }
      syncLogs = syncLogs.concat(page || [])
      if (!page || page.length < PAGE) break
      from += PAGE
    }
  }

  const ventasPorVino = {}
  const tendenciaPorVino = {}
  const ventasDiarias = {}  // { vino_id: { 'YYYY-MM-DD': unidades } } — zona Europe/Madrid
  const ultimaVentaAt = {}
  let ultimoSyncAt = null
  const NUM_SEMANAS = 8
  const ahoraMs = Date.now()
  const fmtMadrid = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' })
  for (const log of syncLogs || []) {
    if (!ultimoSyncAt || log.created_at > ultimoSyncAt) ultimoSyncAt = log.created_at
    const logMs = new Date(log.created_at).getTime()
    const semanasAtras = Math.floor((ahoraMs - logMs) / (7 * 24 * 60 * 60 * 1000))
    const weekIdx = NUM_SEMANAS - 1 - semanasAtras // 7 = esta semana, 0 = hace 8 semanas
    const fechaKey = fmtMadrid.format(new Date(log.created_at))
    for (const linea of log.lineas || []) {
      if (linea.status === 'ok' && linea.vino_id) {
        const id = linea.vino_id
        ventasPorVino[id] = (ventasPorVino[id] || 0) + (linea.quantity || 1)
        if (!ultimaVentaAt[id] || log.created_at > ultimaVentaAt[id]) ultimaVentaAt[id] = log.created_at
        if (weekIdx >= 0 && weekIdx < NUM_SEMANAS) {
          if (!tendenciaPorVino[id]) tendenciaPorVino[id] = Array(NUM_SEMANAS).fill(0)
          tendenciaPorVino[id][weekIdx] += (linea.quantity || 1)
        }
        if (!ventasDiarias[id]) ventasDiarias[id] = {}
        ventasDiarias[id][fechaKey] = (ventasDiarias[id][fechaKey] || 0) + (linea.quantity || 1)
      }
    }
  }
  const ayerKey = fmtMadrid.format(new Date(Date.now() - 86400000))

  // ── Motor de conversión ─────────────────────────────────────────────────────
  const movilPorVinoId = {}
  mobileIntents.forEach(m => {
    const id = String(m.vino_id || '')
    if (id && id !== 'null') movilPorVinoId[id] = (movilPorVinoId[id] || 0) + 1
  })

  const conversionPorVino = Object.entries(vinoCount).map(([id, { nombre, veces }]) => {
    const vendido_n      = ventasPorVino[id] ?? 0
    const movil_n        = movilPorVinoId[id] ?? 0
    const precio_pvp     = precioMap[id] ?? null
    const fuga           = veces >= 5 && vendido_n === 0
    const tasa_conv      = veces > 0 ? vendido_n / veces : 0
    const euros_perdidos = precio_pvp ? Math.max(0, veces - vendido_n) * precio_pvp : null
    const causas = []
    if (!fotoMap[id])       causas.push('sin_foto')
    if (!precio_pvp)        causas.push('sin_pvp')
    if (!ubicacionMap[id])  causas.push('sin_ubicacion')
    if ((stockMap[id] ?? 0) === 0) causas.push('sin_stock')
    return { id, nombre, recomendado_n: veces, movil_n, vendido_n, tasa_conv, euros_perdidos, fuga, causas }
  }).sort((a, b) => (b.euros_perdidos ?? 0) - (a.euros_perdidos ?? 0))

  const hayDatosTPV        = Object.keys(ventasPorVino).length > 0
  const fugasCount         = conversionPorVino.filter(v => v.fuga).length
  const totalEurosPerdidos = conversionPorVino.reduce((s, v) => s + (v.euros_perdidos ?? 0), 0)
  const avgConvPct         = conversionPorVino.length
    ? Math.round((conversionPorVino.reduce((s, v) => s + v.tasa_conv, 0) / conversionPorVino.length) * 100)
    : 0

  const conversion = { porVino: conversionPorVino.slice(0, 30), resumen: { totalEurosPerdidos, fugasCount, avgConvPct, hayDatosTPV } }

  return NextResponse.json({
    vacio: false,
    total: searches.length,
    semanaActual,
    semanaAnterior,
    topConsultas,
    topVinos,
    modos: { wizard: totalWizard, maridaje: totalMaridaje, regalo: totalRegalo, explorar: totalExplorar },
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
    tendenciaPorVino,
    ventasDiarias,
    ayerKey,
    ultimaVentaAt,
    ultimoSyncAt,
    conversion,
    descuadres,
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
