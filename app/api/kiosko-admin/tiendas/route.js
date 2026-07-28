import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getKioskoUser, isKioskoAdminEmail } from '../../_lib/kioskoAuth'

// Lista tiendas para el panel multi-tienda.
// Si es superadmin → devuelve todas.
// Si tiene propietario_email → devuelve solo las suyas.
export async function GET(request) {
  const auth = await getKioskoUser(request)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userEmail = auth.email
  const selectTiendas = 'id, nombre, slug, logo_url, ciudad, plan, activo, created_at'

  // Superadmin ve todo; usuario normal solo sus tiendas
  if (isKioskoAdminEmail(userEmail)) {
    const { data, error } = await supabaseAdmin
      .from('tiendas')
      .select(selectTiendas)
      .order('nombre')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tiendas: data || [] })
  }

  const [porPropietario, porEmail] = await Promise.all([
    supabaseAdmin.from('tiendas').select(selectTiendas).eq('propietario_email', userEmail).order('nombre'),
    supabaseAdmin.from('tiendas').select(selectTiendas).eq('email', userEmail).order('nombre'),
  ])

  if (porPropietario.error) return NextResponse.json({ error: porPropietario.error.message }, { status: 500 })
  if (porEmail.error) return NextResponse.json({ error: porEmail.error.message }, { status: 500 })

  const tiendasMap = new Map()
  for (const tienda of [...(porPropietario.data || []), ...(porEmail.data || [])]) {
    tiendasMap.set(tienda.id, tienda)
  }

  return NextResponse.json({ tiendas: [...tiendasMap.values()] })
}
