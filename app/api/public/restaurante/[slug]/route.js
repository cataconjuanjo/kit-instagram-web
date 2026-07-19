import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../../lib/plans'

const CAMPOS_RESTAURANTE = [
  'id', 'slug', 'nombre', 'ciudad', 'provincia', 'region',
  'color_acento', 'color_primario', 'color_fondo', 'tipografia',
  'logo_url', 'banner_url', 'banner_zoom', 'banner_x', 'banner_y',
  'carta_mostrar_euro', 'carta_copa_decimales', 'carta_pie_texto',
  'hub_activo', 'hub_titulo', 'hub_subtitulo', 'hub_fondo_url',
  'hub_fondo_zoom', 'hub_fondo_x', 'hub_fondo_y', 'hub_overlay',
  'hub_estilo', 'hub_mostrar_logo', 'hub_mostrar_nombre',
  'hub_mostrar_direccion', 'instagram_url', 'facebook_url',
  'camarero_pin_requerido', 'camarero_pin_bloqueo_activo',
]

const CAMPOS_VINO = [
  'id', 'nombre', 'bodega', 'tipo', 'region', 'uva',
  'anada', 'precio_copa', 'precio_botella', 'notas_cata', 'activo',
  'taninos', 'acidez', 'alcohol', 'dulzor', 'cuerpo', 'intensidad', 'final',
]

const CAMPOS_PLATO = [
  'id', 'restaurante_id', 'nombre', 'categoria', 'precio',
  'activo', 'familias_aromaticas',
]

function seleccionarCampos(fila, campos) {
  return Object.fromEntries(campos
    .filter(campo => Object.prototype.hasOwnProperty.call(fila || {}, campo))
    .map(campo => [campo, fila[campo]]))
}

function esPerfilGoiko(restaurante = {}) {
  const texto = `${restaurante?.slug || ''} ${restaurante?.nombre || ''}`.toLowerCase()
  return texto.includes('goiko') || texto.includes('janardoa')
}

export async function GET(req, { params }) {
  try {
    const { slug } = await params
    const { searchParams } = new URL(req.url)
    const incluirCarta = searchParams.get('carta') === '1'
    const incluirHub = searchParams.get('hub') === '1'

    const { data: restaurante, error } = await supabaseAdmin
      .from('restaurantes')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error || !restaurante) {
      return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })
    }

    const respuesta = {
      restaurante: {
        ...seleccionarCampos(restaurante, CAMPOS_RESTAURANTE),
        carta_disponible: puedeUsar(restaurante, 'carta_qr'),
        hub_disponible: puedeUsar(restaurante, 'hub'),
        sala_disponible: puedeUsar(restaurante, 'modo_camarero'),
      },
    }
    if (incluirCarta && respuesta.restaurante.carta_disponible) {
      let vinosQuery = supabaseAdmin
        .from('vinos')
        .select('*')
        .eq('restaurante_id', restaurante.id)
        .eq('activo', true)
      if (esPerfilGoiko(restaurante)) {
        vinosQuery = vinosQuery.order('created_at', { ascending: true })
      }
      const [{ data: vinos }, { data: platos }, { data: seleccion }] = await Promise.all([
        vinosQuery,
        supabaseAdmin.from('platos').select('*').eq('restaurante_id', restaurante.id).eq('activo', true),
        supabaseAdmin
          .from('seleccion_especial')
          .select('id, restaurante_id, vino_id, orden, activo, vinos(nombre, bodega, tipo, region, uva, anada, precio_copa, precio_botella, notas_cata)')
          .eq('restaurante_id', restaurante.id)
          .eq('activo', true)
          .order('orden'),
      ])
      const vinosActivos = vinos || []
      const controlStockActivo = vinosActivos.some(vino => Number(vino.stock) > 0)
      respuesta.vinos = vinosActivos.map(vino => ({
        ...seleccionarCampos(vino, CAMPOS_VINO),
        disponible: !controlStockActivo || Number(vino.stock) > 0,
      }))
      respuesta.platos = (platos || []).map(plato => seleccionarCampos(plato, CAMPOS_PLATO))
      const vinosDisponibles = new Set(
        respuesta.vinos.filter(vino => vino.disponible).map(vino => String(vino.id))
      )
      respuesta.seleccion = (seleccion || []).filter(item => vinosDisponibles.has(String(item.vino_id)))
    }

    if (incluirHub && respuesta.restaurante.hub_disponible) {
      const { data: links } = await supabaseAdmin
        .from('restaurante_links')
        .select('id, restaurante_id, titulo, url, tipo, orden, visible')
        .eq('restaurante_id', restaurante.id)
        .eq('visible', true)
        .order('orden')
      respuesta.links = links || []
    }

    return Response.json(respuesta, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[public-restaurante]', error)
    return Response.json({ error: 'No se pudo cargar el restaurante.' }, { status: 500 })
  }
}
