import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { puedeUsar } from '../../lib/plans'

// GET /api/simulador?restaurante_id=...
// Devuelve el borrador del simulador con auto-sync silencioso:
//   - vinos activos de la carta no presentes en el borrador → se insertan como 'actual'
//   - líneas del borrador cuyo vino_id ya no existe en BD → se eliminan (ON DELETE CASCADE
//     lo gestiona en tiempo real; este paso es un safety-net explícito)
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = String(searchParams.get('restaurante_id') || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error: restError } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status')
      .eq('id', restauranteId)
      .single()

    if (restError || !restaurante) {
      return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    if (!puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    // Carga paralela: todos los vinos del restaurante + borrador actual
    const [vinosResult, borradorResult] = await Promise.all([
      supabaseAdmin
        .from('vinos')
        .select('id, activo, nombre, bodega, tipo, region, anada, formato_compra, precio_botella, precio_copa, coste_compra')
        .eq('restaurante_id', restauranteId),
      supabaseAdmin
        .from('carta_simulacion')
        .select('*')
        .eq('restaurante_id', restauranteId),
    ])

    if (vinosResult.error) throw vinosResult.error
    if (borradorResult.error) throw borradorResult.error

    const todosVinos = vinosResult.data || []
    const vinosActivos = todosVinos.filter(v => v.activo !== false)
    const todosVinoIds = new Set(todosVinos.map(v => v.id))
    const borrador = borradorResult.data || []

    const vinoIdsEnBorrador = new Set(borrador.filter(l => l.vino_id).map(l => l.vino_id))

    // ── Sync: añadir vinos activos que no están en el borrador ────────────
    const vinosAAgregar = vinosActivos.filter(v => !vinoIdsEnBorrador.has(v.id))
    let lineasInsertadas = []
    if (vinosAAgregar.length > 0) {
      const filas = vinosAAgregar.map(v => ({
        restaurante_id: restauranteId,
        vino_id: v.id,
        nombre: v.nombre,
        bodega: v.bodega || null,
        tipo: v.tipo || null,
        region: v.region || null,
        anada: v.anada || null,
        formato: v.formato_compra || null,
        precio_botella: v.precio_botella ?? null,
        precio_copa: v.precio_copa ?? null,
        coste_compra: v.coste_compra ?? null,
        estado: 'actual',
      }))
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('carta_simulacion')
        .insert(filas)
        .select()
      if (insertError) throw insertError
      lineasInsertadas = inserted || []
    }

    // ── Sync: eliminar líneas huérfanas (vino borrado de la BD) ───────────
    // ON DELETE CASCADE ya lo gestiona automáticamente; esto es un safety-net
    // para la ventana de tiempo entre la carga paralela y el borrado real.
    const idsHuerfanos = borrador
      .filter(l => l.vino_id && !todosVinoIds.has(l.vino_id))
      .map(l => l.id)
    if (idsHuerfanos.length > 0) {
      await supabaseAdmin.from('carta_simulacion').delete().in('id', idsHuerfanos)
    }

    // Construye resultado final sin re-fetch
    const idsHuerfanosSet = new Set(idsHuerfanos)
    const lineasFinales = [
      ...borrador.filter(l => !idsHuerfanosSet.has(l.id)),
      ...lineasInsertadas,
    ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))

    return Response.json({ lineas: lineasFinales })
  } catch (err) {
    console.error('[simulador GET]', err)
    return Response.json({ error: 'No se pudo cargar el simulador.' }, { status: 500 })
  }
}
