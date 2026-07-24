import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

function normalizarTexto(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export async function GET(request, { params }) {
  const { slug } = await params
  const { searchParams } = new URL(request.url)

  const { data: tienda, error: tiendaError } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (tiendaError || !tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  let query = supabaseAdmin
    .from('vinos_tienda')
    .select('*')
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .order('destacado', { ascending: false })
    .order('nombre')

  const tipo        = searchParams.get('tipo')
  const uva         = searchParams.get('uva')
  const pais        = searchParams.get('pais')
  const region      = searchParams.get('region')
  const bodega      = searchParams.get('bodega')
  const anada       = searchParams.get('anada')
  const precioMin   = searchParams.get('precio_min')
  const precioMax   = searchParams.get('precio_max')
  const soloStock   = searchParams.get('solo_stock')
  const destacado   = searchParams.get('destacado')

  if (tipo && tipo !== 'todos')     query = query.eq('tipo', tipo)
  if (pais)                         query = query.eq('pais', pais)
  if (region)                       query = query.eq('region', region)
  if (bodega)                       query = query.eq('bodega', bodega)
  if (anada)                        query = query.eq('anada', anada)
  if (precioMin)                    query = query.gte('precio_pvp', Number(precioMin))
  if (precioMax)                    query = query.lte('precio_pvp', Number(precioMax))
  if (soloStock === 'true')         query = query.gt('stock', 0)
  if (destacado === 'true')         query = query.eq('destacado', true)
  if (uva)                          query = query.ilike('uva', `%${uva}%`)

  const { data: vinos, error } = await query

  if (error) {
    console.error('kiosko/vinos error:', error)
    return NextResponse.json({ error: 'Error al cargar vinos' }, { status: 500 })
  }

  // Full-text search after DB query (cubre nombre, bodega, uva, region, descripcion)
  const q = searchParams.get('q')
  let resultado = vinos
  if (q) {
    const limpia = normalizarTexto(q)
    resultado = vinos.filter(v => {
      const texto = normalizarTexto(
        [v.nombre, v.bodega, v.uva, v.region, v.pais, v.descripcion].filter(Boolean).join(' ')
      )
      return texto.includes(limpia)
    })
  }

  return NextResponse.json({ vinos: resultado, total: resultado.length })
}
