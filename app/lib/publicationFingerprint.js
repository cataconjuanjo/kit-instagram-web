import { createHash } from 'crypto'
import { resumirContenidoCarta } from './publicationReadiness'

export const PUBLICATION_FINGERPRINT_VERSION = 1

const RESTAURANTE_BASE_FIELDS = [
  'id', 'slug', 'nombre', 'ciudad',
  'color_acento', 'color_primario', 'color_fondo', 'tipografia',
  'logo_url', 'banner_url', 'banner_zoom', 'banner_x', 'banner_y',
  'carta_mostrar_euro', 'carta_copa_decimales', 'carta_pie_texto',
  'hub_activo',
]

const RESTAURANTE_HUB_FIELDS = [
  'hub_titulo', 'hub_subtitulo', 'hub_fondo_url',
  'hub_fondo_zoom', 'hub_fondo_x', 'hub_fondo_y', 'hub_overlay',
  'hub_estilo', 'hub_mostrar_logo', 'hub_mostrar_nombre',
  'hub_mostrar_direccion', 'instagram_url', 'facebook_url',
]

const VINO_FIELDS = [
  'id', 'nombre', 'bodega', 'tipo', 'region', 'uva',
  'anada', 'precio_copa', 'precio_botella', 'notas_cata', 'activo',
  'taninos', 'acidez', 'alcohol', 'dulzor', 'cuerpo', 'intensidad', 'final',
  'stock',
]

const PLATO_FIELDS = [
  'id', 'nombre', 'categoria', 'precio', 'activo', 'familias_aromaticas',
]

const SELECCION_FIELDS = [
  'id', 'vino_id', 'orden', 'activo',
]

const LINK_FIELDS = [
  'id', 'titulo', 'url', 'tipo', 'orden', 'visible',
]

export function normalizarDestinoPublicacion(valor) {
  return valor === 'hub' ? 'hub' : 'carta'
}

function seleccionarCampos(fila, campos) {
  return Object.fromEntries(campos
    .filter(campo => Object.prototype.hasOwnProperty.call(fila || {}, campo))
    .map(campo => [campo, fila[campo] ?? null]))
}

function compararTexto(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es')
}

function ordenarPorId(lista = []) {
  return [...lista].sort((a, b) => compararTexto(a.id, b.id))
}

function ordenarPorOrden(lista = []) {
  return [...lista].sort((a, b) => {
    const ordenA = Number(a.orden ?? 0)
    const ordenB = Number(b.orden ?? 0)
    if (ordenA !== ordenB) return ordenA - ordenB
    return compararTexto(a.id, b.id)
  })
}

function stableStringify(valor) {
  if (Array.isArray(valor)) return `[${valor.map(stableStringify).join(',')}]`
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor).sort().map(key => `${JSON.stringify(key)}:${stableStringify(valor[key])}`).join(',')}}`
  }
  return JSON.stringify(valor)
}

export function crearFingerprintPublicacion(documento) {
  return createHash('sha256').update(stableStringify(documento)).digest('hex')
}

export async function calcularHuellaPublicacion(supabase, restauranteId, destinoEntrada = 'carta') {
  const destino = normalizarDestinoPublicacion(destinoEntrada)
  const camposRestaurante = destino === 'hub'
    ? [...RESTAURANTE_BASE_FIELDS, ...RESTAURANTE_HUB_FIELDS]
    : RESTAURANTE_BASE_FIELDS

  const restauranteRes = await supabase
    .from('restaurantes')
    .select(camposRestaurante.join(', '))
    .eq('id', restauranteId)
    .single()

  if (restauranteRes.error || !restauranteRes.data) {
    return { error: restauranteRes.error || new Error('Restaurante no encontrado') }
  }

  const consultas = [
    supabase
      .from('vinos')
      .select(VINO_FIELDS.join(', '))
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
    supabase
      .from('platos')
      .select(PLATO_FIELDS.join(', '))
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
    supabase
      .from('seleccion_especial')
      .select(SELECCION_FIELDS.join(', '))
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
  ]

  if (destino === 'hub') {
    consultas.push(
      supabase
        .from('restaurante_links')
        .select(LINK_FIELDS.join(', '))
        .eq('restaurante_id', restauranteId)
        .eq('visible', true)
    )
  }

  const [vinosRes, platosRes, seleccionRes, linksRes] = await Promise.all(consultas)
  const error = vinosRes.error || platosRes.error || seleccionRes.error || linksRes?.error
  if (error) return { error }

  const vinosBase = ordenarPorId(vinosRes.data || []).map(vino => seleccionarCampos(vino, VINO_FIELDS))
  const controlStockActivo = vinosBase.some(vino => Number(vino.stock) > 0)
  const vinos = vinosBase.map(vino => ({
    ...vino,
    disponible: !controlStockActivo || Number(vino.stock) > 0,
  }))
  const vinosDisponibles = new Set(vinos.filter(vino => vino.disponible).map(vino => String(vino.id)))
  const platos = ordenarPorId(platosRes.data || []).map(plato => seleccionarCampos(plato, PLATO_FIELDS))
  const seleccion = ordenarPorOrden(seleccionRes.data || [])
    .filter(item => vinosDisponibles.has(String(item.vino_id)))
    .map(item => seleccionarCampos(item, SELECCION_FIELDS))
  const links = destino === 'hub'
    ? ordenarPorOrden(linksRes?.data || []).map(link => seleccionarCampos(link, LINK_FIELDS))
    : []

  const documento = {
    version: PUBLICATION_FINGERPRINT_VERSION,
    destino,
    restaurante: seleccionarCampos(restauranteRes.data, camposRestaurante),
    vinos,
    platos,
    seleccion,
    links,
  }
  const resumenCarta = resumirContenidoCarta(
    vinos.filter(vino => vino.disponible !== false),
    platos
  )
  const resumen = {
    destino,
    version: PUBLICATION_FINGERPRINT_VERSION,
    vinos_activos: resumenCarta.vinosActivos,
    vinos_con_precio: resumenCarta.vinosConPrecio,
    vinos_sin_precio: resumenCarta.vinosSinPrecio,
    vinos_por_copa: resumenCarta.vinosPorCopa,
    platos_activos: resumenCarta.platosActivos,
    seleccion_activa: seleccion.length,
    links_visibles: links.length,
  }

  return {
    fingerprint: crearFingerprintPublicacion(documento),
    resumen,
    documento,
    version: PUBLICATION_FINGERPRINT_VERSION,
  }
}
