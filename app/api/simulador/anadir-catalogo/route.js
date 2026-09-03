import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'
import { calcularPreciosSugeridos } from '../../../lib/pricingUtils'

function normalizar(texto = '') {
  return String(texto || '').toLowerCase().trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// POST /api/simulador/anadir-catalogo
// Body: { restaurante_id, catalogo_vino_id, force? }
//
// Respuestas:
//   { linea }                          — insertado correctamente
//   { warning: 'duplicate', mensaje }  — nombre+bodega ya existe en el borrador; requiere force=true
//   { error }                          — error de auth / plan / no encontrado / ya existe (409)
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId  = String(body.restaurante_id  || '').trim().slice(0, 80)
    const catalogoVinoId = String(body.catalogo_vino_id || '').trim()
    const force          = Boolean(body.force)
    const sustituye_a    = body.sustituye_a ? String(body.sustituye_a).trim() : null
    const origen         = typeof body.origen === 'string' ? body.origen.slice(0, 40) : null

    if (!catalogoVinoId) {
      return Response.json({ error: 'catalogo_vino_id obligatorio' }, { status: 400 })
    }

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

    // Carga en paralelo: vino del catálogo + borrador existente
    const [catalogoResult, borradorResult] = await Promise.all([
      supabaseAdmin
        .from('proveedor_catalogo_vinos')
        .select('id, nombre, bodega, tipo, region, anada, formato, coste_estimado, pvp_recomendado, pvp_copa, proveedor_id')
        .eq('id', catalogoVinoId)
        .eq('activo', true)
        .maybeSingle(),
      supabaseAdmin
        .from('carta_simulacion')
        .select('id, catalogo_vino_id, nombre, bodega')
        .eq('restaurante_id', restauranteId),
    ])

    if (catalogoResult.error) throw catalogoResult.error
    if (!catalogoResult.data) {
      return Response.json({ error: 'Referencia de catálogo no encontrada' }, { status: 404 })
    }
    if (borradorResult.error) throw borradorResult.error

    const catalogVino = catalogoResult.data
    const lineasBorrador = borradorResult.data || []

    // ── Bloqueo duro: ya existe exactamente ese catalogo_vino_id ─────────
    const yaExiste = lineasBorrador.some(l => l.catalogo_vino_id === catalogoVinoId)
    if (yaExiste) {
      return Response.json({ error: 'Este vino ya está en tu simulación' }, { status: 409 })
    }

    // ── Aviso no bloqueante: mismo nombre+bodega, referencia diferente ────
    if (!force) {
      const nombreNorm = normalizar(catalogVino.nombre)
      const bodegaNorm = normalizar(catalogVino.bodega)
      const duplicado = lineasBorrador.some(
        l => normalizar(l.nombre) === nombreNorm && normalizar(l.bodega) === bodegaNorm
      )
      if (duplicado) {
        const etiqueta = [catalogVino.nombre, catalogVino.bodega].filter(Boolean).join(' · ')
        return Response.json({
          warning: 'duplicate',
          mensaje: `Ya tienes "${etiqueta}" en tu simulación. ¿Añadir igualmente como referencia distinta?`,
        })
      }
    }

    // ── Calcular precios sugeridos igual que catalogo-consultor/route.js ──
    const { data: econSettings } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .select('copas_por_botella, merma_copa_pct, iva_venta_pct, pvp_incluye_iva, coste_incluye_iva')
      .eq('restaurante_id', restauranteId)
      .maybeSingle()
    const econConfig = econSettings || {}
    const coste = Number(catalogVino.coste_estimado) || 0
    const calc = coste > 0 ? calcularPreciosSugeridos(coste, econConfig) : null
    const pvpBotella = calc?.botella || 0
    const pvpCopa = calc?.copa || 0

    // ── Insertar línea nueva con estado 'nuevo' ───────────────────────────
    // precio_copa queda NULL — el restaurante decide por copa mediante el flujo
    // de decisión (ofrecido_por_copa). Los snapshots del catálogo se guardan
    // en pvp_recomendado_catalogo y pvp_copa_catalogo como referencia inmutable.
    const { data: nuevaLinea, error: insertError } = await supabaseAdmin
      .from('carta_simulacion')
      .insert({
        restaurante_id: restauranteId,
        catalogo_vino_id: catalogoVinoId,
        nombre: catalogVino.nombre,
        bodega: catalogVino.bodega || null,
        tipo: catalogVino.tipo || null,
        region: catalogVino.region || null,
        anada: catalogVino.anada || null,
        formato: catalogVino.formato || null,
        precio_botella: null,
        precio_copa: null,
        coste_compra: coste || null,
        pvp_recomendado_catalogo: pvpBotella || null,
        pvp_copa_catalogo: pvpCopa || null,
        estado: 'nuevo',
        sustituye_a: sustituye_a || null,
        origen: origen || null,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return Response.json({ linea: nuevaLinea })
  } catch (err) {
    console.error('[simulador/anadir-catalogo POST]', err)
    return Response.json({ error: 'No se pudo añadir al simulador.' }, { status: 500 })
  }
}
