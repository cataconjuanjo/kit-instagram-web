import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../../lib/plans'
import { validarTokenPruebaCarta } from '../../../../lib/cartaPruebaToken'
import { puedePublicarCarta, resumirContenidoCarta } from '../../../../lib/publicationReadiness'
import { experienciaPublicaDesdePlan } from '../../../../lib/experienceTemplates'
import { isInternationalWine } from '../../../../lib/wineRegion'

const CAMPOS_RESTAURANTE = [
  'id', 'slug', 'nombre', 'ciudad',
  'color_acento', 'color_primario', 'color_fondo', 'tipografia',
  'logo_url', 'banner_url', 'banner_zoom', 'banner_x', 'banner_y',
  'carta_mostrar_euro', 'carta_copa_decimales', 'carta_pie_texto',
  'hub_activo', 'hub_titulo', 'hub_subtitulo', 'hub_fondo_url',
  'hub_fondo_zoom', 'hub_fondo_x', 'hub_fondo_y', 'hub_overlay',
  'hub_estilo', 'hub_mostrar_logo', 'hub_mostrar_nombre',
  'hub_mostrar_direccion', 'instagram_url', 'facebook_url',
  'camarero_pin_requerido', 'camarero_pin_bloqueo_activo',
  'carta_publica_activa',
]

const CAMPOS_RESTAURANTE_CONTROL = ['plan', 'subscription_status']

const CAMPOS_VINO = [
  'id', 'nombre', 'bodega', 'tipo', 'region', 'uva',
  'anada', 'precio_copa', 'precio_botella', 'notas_cata', 'activo',
  'internacional',
]

const CAMPOS_PLATO = [
  'id', 'restaurante_id', 'nombre', 'categoria', 'precio',
  'activo', 'familias_aromaticas',
]

const CAMPOS_LINK_HUB = ['id', 'restaurante_id', 'titulo', 'url', 'tipo', 'orden', 'visible']
const SELECT_RESTAURANTE_PUBLICO = [...CAMPOS_RESTAURANTE, ...CAMPOS_RESTAURANTE_CONTROL].join(', ')
const SELECT_VINO_PUBLICO = [...CAMPOS_VINO, 'stock'].join(', ')
const SELECT_PLATO_PUBLICO = CAMPOS_PLATO.join(', ')
const SELECT_LINK_HUB_PUBLICO = CAMPOS_LINK_HUB.join(', ')

function seleccionarCampos(fila, campos) {
  return Object.fromEntries(campos
    .filter(campo => Object.prototype.hasOwnProperty.call(fila || {}, campo))
    .map(campo => [campo, fila[campo]]))
}

function slugPublicoValido(slug) {
  return /^[a-z0-9_-]{1,120}$/i.test(String(slug || '').trim())
}

function normalizarUrlPublica(valor, { allowHash = false, imageOnly = false } = {}) {
  const raw = String(valor || '').trim().slice(0, 2048)
  if (!raw) return ''
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  if (!imageOnly && allowHash && /^#[a-z0-9_-]{1,80}$/i.test(raw)) return raw
  try {
    const url = new URL(raw)
    const protocolos = imageOnly ? ['http:', 'https:'] : ['http:', 'https:', 'mailto:', 'tel:']
    return protocolos.includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function normalizarRestaurantePublico(restaurante) {
  const publico = seleccionarCampos(restaurante, CAMPOS_RESTAURANTE)
  ;['logo_url', 'banner_url', 'hub_fondo_url'].forEach(campo => {
    if (publico[campo]) publico[campo] = normalizarUrlPublica(publico[campo], { imageOnly: true })
  })
  ;['instagram_url', 'facebook_url'].forEach(campo => {
    if (publico[campo]) publico[campo] = normalizarUrlPublica(publico[campo])
  })
  return publico
}

function normalizarLinkHub(link) {
  const publico = seleccionarCampos(link, CAMPOS_LINK_HUB)
  publico.url = normalizarUrlPublica(publico.url, { allowHash: true })
  const esCarta = ['carta', 'carta_vinos'].includes(publico.tipo) || publico.url === '#carta'
  if (!publico.url && !esCarta) return null
  return publico
}

function esPerfilGoiko(restaurante = {}) {
  const texto = `${restaurante?.slug || ''} ${restaurante?.nombre || ''}`.toLowerCase()
  return texto.includes('goiko') || texto.includes('janardoa')
}

function errorIncluye(error, textoBuscado) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase().includes(textoBuscado)
}

function experienciaPublicaPendiente(error) {
  return errorIncluye(error, 'experience_activation_plans') ||
    errorIncluye(error, 'schema cache') ||
    ['42P01', 'PGRST204', 'PGRST205'].includes(String(error?.code || ''))
}

async function cargarExperienciaPublica(restauranteId) {
  const { data, error } = await supabaseAdmin
    .from('experience_activation_plans')
    .select('template_id, updated_at')
    .eq('restaurante_id', restauranteId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (experienciaPublicaPendiente(error)) return null
  if (error) {
    console.error('[public-restaurante:experiencia]', {
      restauranteId,
      code: error.code || '',
      message: error.message || 'Error consultando experiencia activa',
    })
    return null
  }
  return experienciaPublicaDesdePlan(data)
}

export async function GET(req, { params }) {
  try {
    const slug = String((await params).slug || '').trim()
    if (!slugPublicoValido(slug)) {
      return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })
    }
    const { searchParams } = new URL(req.url)
    const incluirCarta = searchParams.get('carta') === '1'
    const incluirHub = searchParams.get('hub') === '1'
    const tokenPrueba = String(searchParams.get('prueba') || '').trim().slice(0, 3000)

    const { data: restaurante, error } = await supabaseAdmin
      .from('restaurantes')
      .select(SELECT_RESTAURANTE_PUBLICO)
      .eq('slug', slug)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[public-restaurante]', {
        slug,
        code: error.code || '',
        message: error.message || 'Error consultando restaurante',
      })
      return Response.json({ error: 'No se pudo cargar el restaurante.' }, { status: 503 })
    }

    if (!restaurante) {
      return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })
    }

    const modoPrueba = validarTokenPruebaCarta(tokenPrueba, restaurante.id)
    const cartaPublicaActiva = restaurante.carta_publica_activa !== false
    if ((incluirCarta || incluirHub) && !cartaPublicaActiva && !modoPrueba) {
      return Response.json({ error: 'Carta no publicada.' }, { status: 404 })
    }

    const respuesta = {
      restaurante: {
        ...normalizarRestaurantePublico(restaurante),
        carta_publica_activa: cartaPublicaActiva,
        modo_prueba: modoPrueba,
        carta_disponible: puedeUsar(restaurante, 'carta_qr'),
        hub_disponible: puedeUsar(restaurante, 'hub'),
        sala_disponible: puedeUsar(restaurante, 'modo_camarero'),
      },
    }

    if (incluirCarta || incluirHub) {
      respuesta.restaurante.experiencia_publica = await cargarExperienciaPublica(restaurante.id)
    }

    if (incluirCarta && respuesta.restaurante.carta_disponible) {
      let vinosQuery = supabaseAdmin
        .from('vinos')
        .select(SELECT_VINO_PUBLICO)
        .eq('restaurante_id', restaurante.id)
        .eq('activo', true)
      if (esPerfilGoiko(restaurante)) {
        vinosQuery = vinosQuery.order('created_at', { ascending: true })
      }
      const [vinosRes, platosRes, seleccionRes] = await Promise.all([
        vinosQuery,
        supabaseAdmin.from('platos').select(SELECT_PLATO_PUBLICO).eq('restaurante_id', restaurante.id).eq('activo', true),
        supabaseAdmin
          .from('seleccion_especial')
          .select('id, restaurante_id, vino_id, orden, activo, vinos(nombre, bodega, tipo, region, uva, anada, precio_copa, precio_botella, notas_cata)')
          .eq('restaurante_id', restaurante.id)
          .eq('activo', true)
          .order('orden'),
      ])
      const consultaError = vinosRes.error || platosRes.error || seleccionRes.error
      if (consultaError) {
        console.error('[public-restaurante:carta]', {
          slug,
          code: consultaError.code || '',
          message: consultaError.message || 'Error consultando datos de carta',
        })
        return Response.json({ error: 'No se pudo cargar la carta.' }, { status: 503 })
      }
      const vinos = vinosRes.data
      const platos = platosRes.data
      const seleccion = seleccionRes.data
      const vinosActivos = vinos || []
      const controlStockActivo = vinosActivos.some(vino => Number(vino.stock) > 0)
      respuesta.vinos = vinosActivos.map(vino => ({
        ...seleccionarCampos(vino, CAMPOS_VINO),
        internacional: vino.internacional === true || isInternationalWine(vino),
        disponible: !controlStockActivo || Number(vino.stock) > 0,
      }))
      respuesta.platos = (platos || []).map(plato => seleccionarCampos(plato, CAMPOS_PLATO))
      const contenidoPublico = resumirContenidoCarta(
        respuesta.vinos.filter(vino => vino.disponible !== false),
        respuesta.platos
      )
      if (!modoPrueba && !puedePublicarCarta(contenidoPublico)) {
        return Response.json({ error: 'Carta en revision.' }, { status: 409 })
      }
      const vinosDisponibles = new Set(
        respuesta.vinos.filter(vino => vino.disponible).map(vino => String(vino.id))
      )
      respuesta.seleccion = (seleccion || []).filter(item => vinosDisponibles.has(String(item.vino_id)))
    }

    if (incluirHub && respuesta.restaurante.hub_disponible) {
      const { data: links, error: linksError } = await supabaseAdmin
        .from('restaurante_links')
        .select(SELECT_LINK_HUB_PUBLICO)
        .eq('restaurante_id', restaurante.id)
        .eq('visible', true)
        .order('orden')
      if (linksError) {
        console.error('[public-restaurante:hub]', {
          slug,
          code: linksError.code || '',
          message: linksError.message || 'Error consultando links del hub',
        })
        return Response.json({ error: 'No se pudo cargar el hub.' }, { status: 503 })
      }
      respuesta.links = (links || []).map(normalizarLinkHub).filter(Boolean)
    }

    return Response.json(respuesta, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[public-restaurante]', error)
    return Response.json({ error: 'No se pudo cargar el restaurante.' }, { status: 500 })
  }
}
