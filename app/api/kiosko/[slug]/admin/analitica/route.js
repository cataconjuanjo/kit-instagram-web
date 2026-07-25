import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

async function getTiendaId(slug) {
  const { data } = await supabaseAdmin
    .from('tiendas').select('id').eq('slug', slug).eq('activo', true).single()
  return data?.id || null
}

export async function GET(request, { params }) {
  const { slug } = await params
  const tiendaId = await getTiendaId(slug)
  if (!tiendaId) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const dias = 30
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
  const desde7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const desde14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data: searches } = await supabaseAdmin
    .from('kiosko_searches')
    .select('consulta, mode, vinos_ids, vinos_nombres, created_at')
    .eq('tienda_id', tiendaId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })

  if (!searches || searches.length === 0) {
    return NextResponse.json({ vacio: true })
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
  searches.forEach(s => {
    (s.vinos_ids || []).forEach((id, i) => {
      if (!vinoCount[id]) vinoCount[id] = { nombre: s.vinos_nombres?.[i] || id, veces: 0 }
      vinoCount[id].veces++
    })
  })
  const topVinos = Object.entries(vinoCount)
    .sort((a, b) => b[1].veces - a[1].veces).slice(0, 10)
    .map(([id, { nombre, veces }]) => ({ id, nombre, veces }))

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

  return NextResponse.json({
    vacio: false,
    total: searches.length,
    semanaActual,
    semanaAnterior,
    topConsultas,
    topVinos,
    modos: { wizard: totalWizard, maridaje: totalMaridaje },
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
