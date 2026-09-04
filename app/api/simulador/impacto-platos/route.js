import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { computarCobertura } from '../../../lib/cartaCoverageUtils'

export const maxDuration = 30

// POST /api/simulador/impacto-platos
// Body: { restaurante_id, lineas }
// Devuelve cobertura de platos antes y después de aplicar los cambios simulados.
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)
    const lineas = Array.isArray(body.lineas) ? body.lineas : []

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status')
      .eq('id', restauranteId)
      .single()

    if (!restaurante || !puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    // Fetch without strict activo=true filter — computarCobertura already filters
    // p.activo !== false, which correctly includes platos where activo is NULL.
    const [{ data: platos }, { count: totalPlatosRestaurante }] = await Promise.all([
      supabaseAdmin
        .from('platos')
        .select('id, nombre, categoria, descripcion, precio, activo')
        .eq('restaurante_id', restauranteId)
        .order('categoria')
        .limit(500),
      supabaseAdmin
        .from('platos')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', restauranteId),
    ])

    const cobertura = computarCobertura(lineas, platos || [])

    // ── Resumen global ────────────────────────────────────────────────────
    const totalPlatos      = cobertura.length
    const cubiertosAntes   = cobertura.filter(x => x.antes   > 0).length
    const cubiertosDespues = cobertura.filter(x => x.despues > 0).length

    const resumen = {
      totalPlatos,
      cubiertosAntes,
      cubiertosDespues,
      deltaPlatos:        cubiertosDespues - cubiertosAntes,
      sinCoberturaAntes:  totalPlatos - cubiertosAntes,
      sinCoberturaDespues: totalPlatos - cubiertosDespues,
    }

    // ── Desglose por categoría ────────────────────────────────────────────
    const catMap = new Map()
    for (const x of cobertura) {
      const cat = x.plato.categoria || 'Sin categoría'
      if (!catMap.has(cat)) catMap.set(cat, { categoria: cat, total: 0, antes: 0, despues: 0 })
      const c = catMap.get(cat)
      c.total++
      if (x.antes   > 0) c.antes++
      if (x.despues > 0) c.despues++
    }
    const categorias = Array.from(catMap.values()).sort((a, b) =>
      (b.despues - b.antes) - (a.despues - a.antes)
    )

    // ── Platos sin cobertura (para la tabla de huecos) ───────────────────
    const huecos = cobertura
      .filter(x => x.despues === 0)
      .sort((a, b) => {
        // Primero los que siguen sin cobertura incluso antes (más urgentes)
        if (a.antes === 0 && b.antes > 0) return -1
        if (b.antes === 0 && a.antes > 0) return 1
        return (a.plato.categoria || '').localeCompare(b.plato.categoria || '', 'es')
      })
      .map(x => ({
        id: x.plato.id,
        nombre: x.plato.nombre,
        categoria: x.plato.categoria || 'Sin categoría',
        precio: x.plato.precio,
        antes: x.antes,
        despues: x.despues,
      }))

    // ── Aporte marginal de vinos nuevos ──────────────────────────────────
    // Para cada vino 'nuevo', cuántos platos pasan de 0 a ≥1 cobertura gracias a él.
    const vinosNuevos = lineas.filter(l => l.estado === 'nuevo')
    let aporteVinos = []
    if (vinosNuevos.length > 0) {
      const { estimarPerfil, necesidadesEstructurales } = await import('../../../lib/maridajeEngine')

      function esCompatibleLocal(n, p) {
        if (n.taninosMax !== undefined && p.taninos > n.taninosMax) return false
        if (n.taninosMin !== undefined && p.taninos < n.taninosMin) return false
        if (n.acidezMin  !== undefined && p.acidez  < n.acidezMin)  return false
        if (n.acidezMax  !== undefined && p.acidez  > n.acidezMax)  return false
        if (n.alcoholMax !== undefined && p.alcohol > n.alcoholMax) return false
        if (n.alcoholMin !== undefined && p.alcohol < n.alcoholMin) return false
        if (n.cuerpoMax  !== undefined && p.cuerpo  > n.cuerpoMax)  return false
        if (n.cuerpoMin  !== undefined && p.cuerpo  < n.cuerpoMin)  return false
        return true
      }

      // Platos sin cobertura en la carta "antes"
      const platosHuerfanosAntes = cobertura.filter(x => x.antes === 0).map(x => x.plato)

      if (platosHuerfanosAntes.length > 0) {
        const necesidadesPlatos = platosHuerfanosAntes.map(p => {
          let n = {}
          try { n = necesidadesEstructurales([p.nombre, p.categoria, p.descripcion].filter(Boolean).join(' ')) } catch { /* noop */ }
          return { plato: p, n }
        })

        aporteVinos = vinosNuevos.map(vino => {
          const precio = Number(vino.precio_botella) > 0 ? Number(vino.precio_botella) : 20
          const obj = { ...vino, activo: true, stock: null, precio_botella: precio }
          let perfil
          try { perfil = estimarPerfil(obj) }
          catch { perfil = { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3 } }

          const cubre = necesidadesPlatos.filter(({ n }) => esCompatibleLocal(n, perfil)).length
          return { id: vino.id, nombre: vino.nombre, bodega: vino.bodega, cubrePlatos: cubre }
        }).filter(v => v.cubrePlatos > 0).sort((a, b) => b.cubrePlatos - a.cubrePlatos)
      }
    }

    return Response.json({ resumen, categorias, huecos, aporteVinos, totalPlatosRestaurante: totalPlatosRestaurante ?? resumen.totalPlatos })
  } catch (err) {
    console.error('[impacto-platos]', err)
    return Response.json({ error: 'No se pudo calcular el impacto.' }, { status: 500 })
  }
}
