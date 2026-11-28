import { isConsultorFromAuth } from '../_lib/isConsultor'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { requireCatalogoConsultor } from '../_lib/requireCatalogoConsultor'

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

    // Gate único: el restaurante debe tener catalogo_consultor en su plan.
    // El admin NO salta este control (ver requireCatalogoConsultor).
    const gate = await requireCatalogoConsultor(req, restauranteId)
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status })
    const esConsultor = isConsultorFromAuth(gate.auth)
    const restaurante = gate.restaurante

    const perfilBodega = restaurante?.plan === 'bodega'

    // Proyección de proveedores: el restaurante ve nombre/zona (necesarios para
    // filtrar y mostrar origen del vino); el contacto comercial (email, teléfono)
    // es exclusivo del consultor.
    const proveedoresSelectConsultor = 'id, nombre, telefono, email, zona, visible_restaurantes'
    const proveedoresSelectRestaurante = 'id, nombre, zona, visible_restaurantes'
    let providersQuery = supabaseAdmin
      .from('proveedores_vino')
      .select(esConsultor ? proveedoresSelectConsultor : proveedoresSelectRestaurante)
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
        proveedores: (providers || []).map(item => esConsultor
          ? {
              nombre: item.nombre,
              telefono: item.telefono || '',
              email: item.email || '',
              zona: item.zona || '',
            }
          : {
              nombre: item.nombre,
              zona: item.zona || '',
            }),
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
      if (esConsultor) {
        return {
          ...item,
          proveedor: provider.nombre || '',
          proveedor_email: provider.email || '',
          proveedor_telefono: provider.telefono || '',
          proveedor_zona: provider.zona || '',
          margen,
        }
      }
      // Restaurante: nunca devuelvas coste_estimado, margen ni contacto comercial.
      // El PVP sugerido sí va (lo necesita para construir su carta).
      const safe = { ...item }
      delete safe.coste_estimado
      return {
        ...safe,
        proveedor: provider.nombre || '',
        proveedor_zona: provider.zona || '',
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

    // Proyección de catálogo: coste_estimado SÓLO para consultor.
    // 'notas' puede contener anotaciones privadas del consultor; se omite para restaurante.
    const catalogoSelectConsultor = 'id, proveedor_id, nombre, bodega, tipo, region, uva, anada, referencia, formato, coste_estimado, pvp_recomendado, disponibilidad, notas, updated_at'
    const catalogoSelectRestaurante = 'id, proveedor_id, nombre, bodega, tipo, region, uva, anada, referencia, formato, pvp_recomendado, disponibilidad, updated_at'
    const catalogoSelect = esConsultor ? catalogoSelectConsultor : catalogoSelectRestaurante

    let items = []
    let total = 0

    if (!q) {
      const from = offset
      const to = offset + limit - 1
      const { data, error, count } = await supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select(catalogoSelect, { count: 'exact' })
        .in('proveedor_id', searchableProviderIds)
        .eq('activo', true)
        .order('nombre')
        .order('id')
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
          .select(catalogoSelect)
          .in('proveedor_id', searchableProviderIds)
          .eq('activo', true)
          .order('nombre')
          .order('id')
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

    // Proyección final de proveedores: contacto (email/teléfono) SOLO para
    // el consultor. El propietario premium ve nombre/zona (necesarios para
    // filtrar), coherente con el comentario del header del fichero.
    const proveedoresOut = (providers || []).map(item => esConsultor
      ? { nombre: item.nombre, telefono: item.telefono || '', email: item.email || '', zona: item.zona || '' }
      : { nombre: item.nombre, zona: item.zona || '' })

    return Response.json({
      proveedores: proveedoresOut,
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
