import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { getKioskoUser, isKioskoAdminEmail } from '../../../_lib/kioskoAuth'

function slugificar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export async function GET(request) {
  const auth = await getKioskoUser(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const selectTiendas = 'id, nombre, slug, ciudad, activo, created_at'

  if (isKioskoAdminEmail(auth.email)) {
    const { data, error } = await supabaseAdmin
      .from('tiendas')
      .select(selectTiendas)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tiendas: data || [] })
  }

  const [porPropietario, porEmail] = await Promise.all([
    supabaseAdmin.from('tiendas').select(selectTiendas).eq('propietario_email', auth.email).order('created_at', { ascending: false }),
    supabaseAdmin.from('tiendas').select(selectTiendas).eq('email', auth.email).order('created_at', { ascending: false }),
  ])

  if (porPropietario.error) return NextResponse.json({ error: porPropietario.error.message }, { status: 500 })
  if (porEmail.error) return NextResponse.json({ error: porEmail.error.message }, { status: 500 })

  const tiendasMap = new Map()
  for (const tienda of [...(porPropietario.data || []), ...(porEmail.data || [])]) {
    tiendasMap.set(tienda.id, tienda)
  }

  return NextResponse.json({ tiendas: [...tiendasMap.values()] })
}

export async function POST(request) {
  const auth = await getKioskoUser(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!isKioskoAdminEmail(auth.email)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const nombre = String(body.nombre || '').trim()
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const slugBase = slugificar(String(body.slug || nombre))
  if (!slugBase) return NextResponse.json({ error: 'El slug no es valido' }, { status: 400 })

  const email = String(body.email || '').trim().toLowerCase() || null
  const propietarioEmail = String(body.propietario_email || email || '').trim().toLowerCase() || null

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
      email,
      propietario_email: propietarioEmail,
      logo_url:      body.logo_url || null,
      color_primario: body.color_primario || '#1a1a2e',
      color_acento:   body.color_acento   || '#c9a96e',
    })
    .select('id, nombre, slug, ciudad, activo, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tienda: data }, { status: 201 })
}
