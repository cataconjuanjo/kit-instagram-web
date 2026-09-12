import { createClient } from '@supabase/supabase-js'
import { NextResponse }  from 'next/server'

const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey        = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail     = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

async function validarAdmin (req) {
  const auth  = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesion no recibida', status: 401 }
  const supabaseAuth = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesion no valida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== adminEmail.toLowerCase())
    return { error: 'No autorizado', status: 403 }
  return { user: data.user }
}

function adminClient () {
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function buildSide (va, oferta) {
  if (!va) return null
  return {
    vino_anada_id: va.id,
    nombre:        va.vino?.nombre   || '',
    bodega:        va.vino?.bodega?.nombre || '(sin bodega)',
    anada:         va.anada,
    formato_ml:    va.formato_ml,
    coste:         oferta?.coste     ?? null,
    proveedor:     oferta?.proveedor?.nombre || '',
  }
}

// ── GET /api/admin/duplicados — lista candidatos pendientes ──────────────────
export async function GET (req) {
  const auth = await validarAdmin(req)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const sb = adminClient()

  // Candidatos pendientes (máx 100, ordenados por similitud desc)
  const { data: candidatos, error: cErr } = await sb
    .from('dedup_candidato')
    .select('id, similitud, vino_anada_a, vino_anada_b')
    .eq('estado', 'pendiente')
    .order('similitud', { ascending: false })
    .limit(100)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!candidatos?.length) return NextResponse.json({ candidatos: [], total: 0 })

  // Fetch vino_anadas con joins
  const vaIds = [...new Set(candidatos.flatMap(c => [c.vino_anada_a, c.vino_anada_b]))]

  const { data: vinoAnadas, error: vaErr } = await sb
    .from('vino_anada')
    .select('id, anada, formato_ml, vino:vino_id (id, nombre, bodega:bodega_id (nombre))')
    .in('id', vaIds)

  if (vaErr) return NextResponse.json({ error: vaErr.message }, { status: 500 })

  const vaMap = new Map((vinoAnadas || []).map(va => [va.id, va]))

  // Primera oferta por vino_anada (para proveedor + coste)
  const { data: ofertas, error: oErr } = await sb
    .from('oferta')
    .select('vino_anada_id, coste, proveedor:proveedor_id (nombre)')
    .in('vino_anada_id', vaIds)

  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 })

  const ofertaMap = new Map()
  for (const o of (ofertas || [])) {
    if (!ofertaMap.has(o.vino_anada_id)) ofertaMap.set(o.vino_anada_id, o)
  }

  // Total pendientes
  const { count: total } = await sb
    .from('dedup_candidato')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'pendiente')

  const formatted = candidatos.map(c => ({
    id:        c.id,
    similitud: c.similitud,
    lado_a:    buildSide(vaMap.get(c.vino_anada_a), ofertaMap.get(c.vino_anada_a)),
    lado_b:    buildSide(vaMap.get(c.vino_anada_b), ofertaMap.get(c.vino_anada_b)),
  }))

  return NextResponse.json({ candidatos: formatted, total: total || 0 })
}

// ── PATCH /api/admin/duplicados — registra decisión ──────────────────────────
export async function PATCH (req) {
  const auth = await validarAdmin(req)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { candidato_id, decision } = await req.json()
  if (!candidato_id || !['fusionado', 'distintos'].includes(decision))
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })

  const sb = adminClient()

  const { error: decErr } = await sb
    .from('dedup_decision')
    .insert({ candidato_id, decision })
  if (decErr) return NextResponse.json({ error: decErr.message }, { status: 500 })

  const { error: updErr } = await sb
    .from('dedup_candidato')
    .update({ estado: decision })
    .eq('id', candidato_id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
