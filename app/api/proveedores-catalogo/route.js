import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

function texto(value, limite = 120) {
  return String(value || '').trim().slice(0, limite)
}

function numero(value) {
  return Number(value) || 0
}

function normalizar(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'))
    const q = texto(searchParams.get('q'), 80).toLowerCase()
    const proveedor = texto(searchParams.get('proveedor'), 120)
    const limit = Math.min(120, Math.max(12, Number(searchParams.get('limit')) || 40))
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const offset = (page - 1) * limit

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error: restauranteError } = await supabaseAdmin
      .from('restaurantes')
      .select('id, plan')
      .eq('id', restauranteId)
      .single()

    if (restauranteError) throw restauranteError
    const perfilBodega = restaurante?.plan === 'bodega'

    let providersQuery = supabaseAdmin
      .from('proveedores_vino')
      .select('id, nombre, telefono, email, zona, visible_restaurantes')
      .order('nombre')

    if (!perfilBodega) providersQuery = providersQuery.eq('visible_restaurantes', true)

    const { data: providers, error: providersError } = await providersQuery

    if (providersError) throw providersError

    const providerIds = (providers || []).map(item => item.id).filter(Boolean)
    if (!providerIds.length) {
      return Response.json({ proveedores: [], items: [], total: 0 })
    }

    const selectedProvider = proveedor ? (providers || []).find(item => item.nombre === proveedor) : null
    const searchableProviderIds = selectedProvider ? [selectedProvider.id] : providerIds

    if (proveedor && !selectedProvider) {
      return Response.json({
        proveedores: (providers || []).map(item => ({
          nombre: item.nombre,
          telefono: item.telefono || '',
          email: item.email || '',
          zona: item.zona || '',
        })),
        items: [],
        total: 0,
        page,
        limit,
        hasMore: false,
      })
    }

    const byId = new Map((providers || []).map(item => [item.id, item]))
    const decorate = item => {
      const provider = byId.get(item.proveedor_id) || {}
      const coste = numero(item.coste_estimado)
      const pvp = numero(item.pvp_recomendado)
      const margen = pvp > 0 && coste > 0 ? Math.round(((pvp - coste) / pvp) * 100) : null
      return {
        ...item,
        proveedor: provider.nombre || '',
        proveedor_email: provider.email || '',
        proveedor_telefono: provider.telefono || '',
        proveedor_zona: provider.zona || '',
        margen,
      }
    }
    const matches = item => {
      if (!q) return true
      const needle = normalizar(q)
      const haystack = normalizar([
        item.nombre,
        item.bodega,
        item.region,
        item.uva,
        item.anada,
        item.referencia,
        item.proveedor,
        item.notas,
      ].filter(Boolean).join(' '))
      return needle.split(' ').filter(Boolean).every(part => haystack.includes(part))
    }

    let items = []
    let total = 0

    if (!q) {
      const from = offset
      const to = offset + limit - 1
      const { data, error, count } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, proveedor_id, nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, disponibilidad, notas, updated_at', { count: 'exact' })
        .in('proveedor_id', searchableProviderIds)
        .eq('activo', true)
        .order('nombre')
        .range(from, to)
      if (error) throw error
      items = (data || []).map(decorate)
      total = count || 0
    } else {
      const chunkSize = 1000
      let from = 0
      let matchedSeen = 0
      while (true) {
        const { data, error } = await supabaseAdmin
          .from('proveedor_catalogo_vinos')
          .select('id, proveedor_id, nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, disponibilidad, notas, updated_at')
          .in('proveedor_id', searchableProviderIds)
          .eq('activo', true)
          .order('nombre')
          .range(from, from + chunkSize - 1)
        if (error) throw error
        const rows = data || []
        for (const row of rows) {
          const decorated = decorate(row)
          if (!matches(decorated)) continue
          if (matchedSeen >= offset && items.length < limit) items.push(decorated)
          matchedSeen += 1
        }
        if (rows.length < chunkSize) break
        from += chunkSize
      }
      total = matchedSeen
    }

    return Response.json({
      proveedores: (providers || []).map(item => ({
        nombre: item.nombre,
        telefono: item.telefono || '',
        email: item.email || '',
        zona: item.zona || '',
      })),
      items,
      total,
      page,
      limit,
      hasMore: offset + items.length < total,
    })
  } catch (error) {
    console.error('[proveedores-catalogo] leer:', error)
    return Response.json({ error: 'No se pudo cargar el catalogo de proveedores.' }, { status: 500 })
  }
}
