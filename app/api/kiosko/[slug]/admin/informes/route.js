import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function verificarAcceso(request, slug) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null

  const token = auth.slice(7)
  const client = createClient(supabaseUrl, supabaseAnon)
  const { data: { user } } = await client.auth.getUser(token)
  if (!user) return null

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slug)
    .or(`propietario_email.eq.${user.email},email.eq.${user.email}`)
    .single()

  // Permitir también a admins de cataconjuanjo
  const esAdmin = user.email?.endsWith('@cataconjuanjo.com') || user.email === 'jjgarciapozo@gmail.com'
  if (!tienda && !esAdmin) return null

  return user
}

export async function GET(request, { params }) {
  const { slug } = await params

  const user = await verificarAcceso(request, slug)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    // Devolver un informe concreto (con html)
    const { data, error } = await supabaseAdmin
      .from('kiosko_informes')
      .select('*')
      .eq('id', id)
      .eq('slug', slug)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ informe: data })
  }

  // Listar informes de esta tienda (sin html para no pesar)
  const { data, error } = await supabaseAdmin
    .from('kiosko_informes')
    .select('id, semana_label, semana_inicio, datos, email_destino, enviado_ok, created_at')
    .eq('slug', slug)
    .order('created_at', { ascending: false })
    .limit(52)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ informes: data || [] })
}
