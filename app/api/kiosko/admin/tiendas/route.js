import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

function slugificar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, slug, ciudad, activo, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tiendas: data || [] })
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const nombre = String(body.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const slugBase = body.slug?.trim() || slugificar(nombre)

  // Comprueba unicidad del slug
  const { data: existe } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slugBase)
    .single()

  if (existe) {
    return NextResponse.json({ error: `El slug "${slugBase}" ya está en uso. Elige otro.` }, { status: 409 })
  }

  const { data, error } = await supabaseAdmin
    .from('tiendas')
    .insert({
      nombre,
      slug:          slugBase,
      ciudad:        body.ciudad || null,
      descripcion:   body.descripcion || null,
      direccion:     body.direccion || null,
      telefono:      body.telefono || null,
      email:         body.email || null,
      logo_url:      body.logo_url || null,
      color_primario: body.color_primario || '#1a1a2e',
      color_acento:   body.color_acento   || '#c9a96e',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tienda: data }, { status: 201 })
}
