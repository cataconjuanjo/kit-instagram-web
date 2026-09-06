import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../../lib/plans'
import { validarTokenPruebaCarta } from '../../../../lib/cartaPruebaToken'
import { puedePublicarCarta, resumirContenidoCarta } from '../../../../lib/publicationReadiness'
import { experienciaPublicaDesdePlan } from '../../../../lib/experienceTemplates'
import { isInternationalWine } from '../../../../lib/wineRegion'
import { limpiarMarcadorPerfiles, resolverPerfilesVino } from '../../../../lib/wineProfileTags'
import { noStoreHeaders, publicCdnCacheHeaders } from '../../../../lib/publicCacheHeaders'

// Valida que el bearer token corresponde al dueño del restaurante indicado.
// Devuelve true si es dueño, false en cualquier otro caso (sin errores visibles).
async function esOwnerDelRestaurante(req, restauranteId) {
  try {
    const auth = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!auth) return false
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
    const { data, error } = await supabaseAuth.auth.getUser(auth)
    if (error || !data?.user?.email) return false
    const email = data.user.email.toLowerCase()
    // El admin también puede ver el borrador de cualquier restaurante
    if (email === (process.env.ADMIN_EMAIL || 'cataconjuanjo@gmail.com').toLowerCase()) return true
    const { data: rest } = await supabaseAdmin
      .from('restaurantes')
      .select('id')
      .eq('id', restauranteId)
      .eq('email', email)
      .maybeSingle()
    return !!rest
  } catch {
    return false
  }
}

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
  'carta_publica_activa', 'duelo_activo',
]

const CAMPOS_RESTAURANTE_CONTROL = ['plan', 'subscription_status']

const CAMPOS_VINO = [
  'id', 'nombre', 'bodega', 'tipo', 'region', 'uva',
  'anada', 'precio_copa', 'precio_botella', 'copa_ml', 'notas_cata', 'activo',
  'internacional', 'foto_url',
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
const DEMO_PRESENTACION_SLUGS = new Set(['taberna-del-puerto'])

function seleccionarCampos(fila, campos) {
  return Object.fromEntries(campos
    .filter(campo => Object.prototype.hasOwnProperty.call(fila || {}, campo))
    .map(campo => [campo, fila[campo]]))
}

function slugPublicoValido(slug) {
  return /^[a-z0-9_-]{1,120}$/i.test(String(slug || '').trim())
}

function demoPresentacionAutorizada(slug, searchParams) {
  return searchParams.get('demo_presentacion') === '1' && DEMO_PRESENTACION_SLUGS.has(String(slug || '').toLowerCase())
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
    const modoDemoPresentacion = demoPresentacionAutorizada(slug, searchParams)
    const solicitaPreviewBorrador = searchParams.get('preview') === '1'

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
    if ((incluirCarta || incluirHub) && !cartaPublicaActiva && !modoPrueba && !modoDemoPresentacion) {
      return Response.json({ error: 'Carta no publicada.' }, { status: 404 })
    }

    const respuesta = {
      restaurante: {
        ...normalizarRestaurantePublico(restaurante),
        carta_publica_activa: cartaPublicaActiva,
        etiquetas_publicas_activas: puedeUsar(restaurante, 'vista_etiquetas_publica'),
        modo_prueba: modoPrueba,
        modo_demo_presentacion: modoDemoPresentacion,
        carta_disponible: puedeUsar(restaurante, 'carta_qr'),
        hub_disponible: puedeUsar(restaurante, 'hub'),
        sala_disponible: puedeUsar(restaurante, 'modo_camarero'),
      },
    }

    if (incluirCarta || incluirHub) {
      respuesta.restaurante.experiencia_publica = await cargarExperienciaPublica(restaurante.id)
    }

    // ── Vista previa del borrador del simulador ───────────────────────────────
    // Activada cuando ?preview=1 llega con un token de sesión válido del dueño.
    // Si el token no es válido o no es el dueño, se ignora el flag silenciosamente
    // y se sirve la carta pública normal (sin error ni pista de que existe este modo).
    const modoBorrador = solicitaPreviewBorrador && incluirCarta
      ? await esOwnerDelRestaurante(req, restaurante.id)
      : false

    if (modoBorrador) {
      respuesta.restaurante.modo_borrador = true
      // Cargar vinos del borrador: los propios (vino_id JOIN vinos) + los del catálogo
      // usando los precios editados en el simulador si difieren de la carta real.
      const [borradorRes, platosRes] = await Promise.all([
        supabaseAdmin
          .from('carta_simulacion')
          .select(`
            id, estado, nombre, bodega, tipo, region, anada, formato,
            precio_botella, precio_copa, coste_compra,
            vino_id, catalogo_vino_id,
            vinos(id, uva, copa_ml, notas_cata, activo, internacional, foto_url, stock)
          `)
          .eq('restaurante_id', restaurante.id)
          .in('estado', ['actual', 'nuevo']),
        supabaseAdmin
          .from('platos')
          .select(SELECT_PLATO_PUBLICO)
          .eq('restaurante_id', restaurante.id)
          .eq('activo', true),
      ])
      if (borradorRes.error || platosRes.error) {
        const err = borradorRes.error || platosRes.error
        console.error('[public-restaurante:borrador]', { slug, code: err.code || '', message: err.message })
        return Response.json({ error: 'No se pudo cargar el borrador.' }, { status: 503 })
      }
      const lineas = borradorRes.data || []
      respuesta.vinos = lineas.map(linea => {
        const vinoReal = linea.vinos || {}
        return {
          // Los ids de líneas del catálogo no son UUIDs de vinos reales; usamos el id de la línea.
          id:              linea.vino_id || linea.id,
          nombre:          linea.nombre,
          bodega:          linea.bodega || null,
          tipo:            linea.tipo || null,
          region:          linea.region || null,
          uva:             vinoReal.uva || null,
          anada:           linea.anada || null,
          // Los precios del simulador pueden haber sido editados y tienen prioridad.
          precio_copa:     linea.precio_copa    ?? vinoReal.precio_copa    ?? null,
          precio_botella:  linea.precio_botella ?? vinoReal.precio_botella ?? null,
          copa_ml:         vinoReal.copa_ml || null,
          notas_cata:      limpiarMarcadorPerfiles(vinoReal.notas_cata || null),
          activo:          true,
          internacional:   vinoReal.internacional === true || isInternationalWine(linea),
          foto_url:        normalizarUrlPublica(vinoReal.foto_url || '', { imageOnly: true }),
          perfiles_maridaje: resolverPerfilesVino(vinoReal),
          disponible:      true,
          _es_nuevo:       linea.estado === 'nuevo', // para que la carta pueda marcarlo si se desea
        }
      })
      respuesta.platos = (platosRes.data || []).map(plato => seleccionarCampos(plato, CAMPOS_PLATO))
      // En modo borrador no hay selección especial ni control de stock
      respuesta.seleccion = []
      return Response.json(respuesta, { headers: noStoreHeaders() })
    }

    if (incluirCarta && respuesta.restaurante.carta_disponible) {
      const vinosQuery = supabaseAdmin
        .from('vinos')
        .select(SELECT_VINO_PUBLICO)
        .eq('restaurante_id', restaurante.id)
        .eq('activo', true)
      const [vinosRes, platosRes, seleccionRes] = await Promise.all([
        vinosQuery,
        supabaseAdmin.from('platos').select(SELECT_PLATO_PUBLICO).eq('restaurante_id', restaurante.id).eq('activo', true),
        supabaseAdmin
          .from('seleccion_especial')
          .select('id, restaurante_id, vino_id, orden, activo, vinos(nombre, bodega, tipo, region, uva, anada, precio_copa, precio_botella, notas_cata, foto_url)')
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
        perfiles_maridaje: resolverPerfilesVino(vino),
        notas_cata: limpiarMarcadorPerfiles(vino.notas_cata),
        foto_url: normalizarUrlPublica(vino.foto_url, { imageOnly: true }),
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
      respuesta.seleccion = (seleccion || [])
        .filter(item => vinosDisponibles.has(String(item.vino_id)))
        .map(item => ({
          ...item,
          vinos: item.vinos ? {
            ...item.vinos,
            perfiles_maridaje: resolverPerfilesVino(item.vinos),
            notas_cata: limpiarMarcadorPerfiles(item.vinos.notas_cata),
          } : item.vinos,
        }))
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
      headers: tokenPrueba
        ? noStoreHeaders()
        : publicCdnCacheHeaders({ cdnMaxAge: 60, staleWhileRevalidate: 300 }),
    })
  } catch (error) {
    console.error('[public-restaurante]', error)
    return Response.json({ error: 'No se pudo cargar el restaurante.' }, { status: 500 })
  }
}
