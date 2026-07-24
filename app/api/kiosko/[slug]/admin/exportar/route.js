import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

async function getTiendaId(slug) {
  const { data } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slug)
    .single()
  return data?.id || null
}

const CAMPOS = [
  'nombre', 'bodega', 'tipo', 'uva', 'anada', 'region', 'pais',
  'precio_pvp', 'precio_coste', 'stock', 'ubicacion_estanteria',
  'foto_url', 'descripcion', 'notas_cata', 'puntuacion', 'destacado', 'activo',
]

function esc(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export async function GET(request, { params }) {
  const { slug } = await params
  const tiendaId = await getTiendaId(slug)
  if (!tiendaId) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('vinos_tienda')
    .select(CAMPOS.join(', '))
    .eq('tienda_id', tiendaId)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lineas = [
    CAMPOS.join(','),
    ...(data || []).map(v => CAMPOS.map(c => esc(v[c])).join(',')),
  ]
  const csv = '﻿' + lineas.join('\r\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kiosko-${slug}-vinos.csv"`,
    },
  })
}
