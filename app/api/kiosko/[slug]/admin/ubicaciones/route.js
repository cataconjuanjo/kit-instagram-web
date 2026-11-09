import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

// P1-3: catalogo de ubicaciones por tienda.
// Degrada con grace: si la tabla aún no existe (SQL kiosko_ubicaciones.sql
// pendiente de aplicar), GET devuelve lista vacía con pending:true y las
// mutaciones responden 503 sin romper el admin. El admin sigue usando el
// input de texto libre de vinos_tienda.ubicacion_estanteria.

function normalizar(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function tablaInexistente(err) {
  if (!err) return false
  const code = String(err.code || '').toUpperCase()
  const msg  = String(err.message || '').toLowerCase()
  if (code === '42P01') return true
  if (msg.includes('relation') && msg.includes('does not exist') && msg.includes('kiosko_ubicaciones')) return true
  return false
}

export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data, error } = await supabaseAdmin
    .from('kiosko_ubicaciones')
    .select('id, nombre, nombre_key, orden, activa')
    .eq('tienda_id', access.tienda.id)
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })

  if (error) {
    if (tablaInexistente(error)) return NextResponse.json({ ubicaciones: [], pending: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ubicaciones: data || [], pending: false })
}

export async function POST(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  let body = {}
  try { body = await request.json() } catch {}
  const nombre = String(body?.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'Nombre vacio' }, { status: 400 })
  if (nombre.length > 80) return NextResponse.json({ error: 'Nombre demasiado largo' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('kiosko_ubicaciones')
    .insert({
      tienda_id: access.tienda.id,
      nombre,
      nombre_key: normalizar(nombre),
      orden: Number.isFinite(Number(body?.orden)) ? Number(body.orden) : 100,
      activa: body?.activa !== false,
    })
    .select('id, nombre, nombre_key, orden, activa')
    .single()

  if (error) {
    if (tablaInexistente(error)) {
      return NextResponse.json({ error: 'Falta aplicar supabase/kiosko_ubicaciones.sql', pending: true }, { status: 503 })
    }
    // UNIQUE violation -> 409
    if (String(error.code || '') === '23505') {
      return NextResponse.json({ error: 'Ya existe una ubicación con ese nombre' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ubicacion: data })
}

export async function PATCH(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  let body = {}
  try { body = await request.json() } catch {}
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const patch = {}
  if (typeof body?.nombre === 'string') {
    const nombre = body.nombre.trim()
    if (!nombre) return NextResponse.json({ error: 'Nombre vacio' }, { status: 400 })
    patch.nombre = nombre
    patch.nombre_key = normalizar(nombre)
  }
  if (Number.isFinite(Number(body?.orden))) patch.orden = Number(body.orden)
  if (typeof body?.activa === 'boolean')    patch.activa = body.activa
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('kiosko_ubicaciones')
    .update(patch)
    .eq('id', id)
    .eq('tienda_id', access.tienda.id)
    .select('id, nombre, nombre_key, orden, activa')
    .single()

  if (error) {
    if (tablaInexistente(error)) {
      return NextResponse.json({ error: 'Falta aplicar supabase/kiosko_ubicaciones.sql', pending: true }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ubicacion: data })
}

export async function DELETE(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('kiosko_ubicaciones')
    .delete()
    .eq('id', id)
    .eq('tienda_id', access.tienda.id)

  if (error) {
    if (tablaInexistente(error)) {
      return NextResponse.json({ error: 'Falta aplicar supabase/kiosko_ubicaciones.sql', pending: true }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
