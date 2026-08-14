import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { guardarDeliveryEvent } from '../../lib/publicationDeliveryAnalytics'
import { problemasPublicacionCarta, puedePublicarCarta, resumirContenidoCarta } from '../../lib/publicationReadiness'

function texto(valor, limite = 100) {
  return String(valor || '').trim().slice(0, limite)
}

const SELECT_RESTAURANTE_PUBLICACION = [
  'id', 'slug', 'nombre', 'email', 'ciudad', 'logo_url', 'plan',
  'subscription_status', 'carta_publica_activa', 'hub_activo',
].join(', ')
const SELECT_RESTAURANTE_SNAPSHOT = [
  'id', 'slug', 'nombre', 'ciudad', 'color_primario', 'color_fondo',
  'color_acento', 'tipografia', 'hub_activo',
].join(', ')
const SELECT_PUBLICATION_SNAPSHOT_RESUMEN = [
  'id', 'restaurante_id', 'publication_event_id', 'version_number',
  'contenido_resumen', 'restaurante_resumen', 'actor_email', 'created_at',
].join(', ')

function errorIncluye(error, textoBuscado) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase().includes(textoBuscado)
}

function historialPendiente(error) {
  return errorIncluye(error, 'publication_events') ||
    ['42P01', 'PGRST205'].includes(String(error?.code || ''))
}

function snapshotPendiente(error) {
  return errorIncluye(error, 'publication_snapshots') ||
    ['42P01', 'PGRST205'].includes(String(error?.code || ''))
}

function estadoPublicacion(valor) {
  return valor === false ? 'borrador' : 'publicada'
}

function destinoPublicacion(restaurante = {}) {
  return restaurante?.hub_activo ? 'hub' : 'carta'
}

async function cargarContenido(restauranteId) {
  const [vinosRes, platosRes] = await Promise.all([
    supabaseAdmin
      .from('vinos')
      .select('id, precio_botella, precio_copa')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
    supabaseAdmin
      .from('platos')
      .select('id')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
  ])
  const error = vinosRes.error || platosRes.error
  if (error) return { error }
  return { contenido: resumirContenidoCarta(vinosRes.data || [], platosRes.data || []) }
}

async function leerHistorialPublicacion(restauranteId, limit = 6) {
  const { data, error } = await supabaseAdmin
    .from('publication_events')
    .select('id, restaurante_id, accion, estado_anterior, estado_nuevo, contenido_resumen, actor_email, created_at')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (historialPendiente(error)) return { historial: [], pendiente: true }
  if (error) return { error }
  return { historial: data || [], pendiente: false }
}

async function leerUltimoSnapshot(restauranteId) {
  const { data, error } = await supabaseAdmin
    .from('publication_snapshots')
    .select('id, restaurante_id, publication_event_id, version_number, contenido_resumen, restaurante_resumen, actor_email, created_at')
    .eq('restaurante_id', restauranteId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snapshotPendiente(error)) return { snapshot: null, pendiente: true }
  if (error) return { error }
  return { snapshot: data || null, pendiente: false }
}

async function guardarEventoPublicacion({ restauranteId, activa, estadoAnterior, contenido, auth }) {
  const payload = {
    restaurante_id: restauranteId,
    accion: activa ? 'publicar' : 'pausar',
    estado_anterior: estadoAnterior,
    estado_nuevo: activa ? 'publicada' : 'borrador',
    contenido_resumen: contenido || {},
    actor_id: auth.user.id,
    actor_email: (auth.user.email || '').toLowerCase(),
  }
  const { data, error } = await supabaseAdmin
    .from('publication_events')
    .insert(payload)
    .select('id, restaurante_id, accion, estado_anterior, estado_nuevo, contenido_resumen, actor_email, created_at')
    .single()

  if (historialPendiente(error)) return { pendiente: true }
  if (error) {
    console.error('[publicacion] historial:', error)
    return { error }
  }
  return { evento: data, pendiente: false }
}

function compactarRestauranteSnapshot(restaurante = {}) {
  return {
    id: restaurante.id,
    slug: restaurante.slug,
    nombre: restaurante.nombre,
    ciudad: restaurante.ciudad,
    color_primario: restaurante.color_primario,
    color_fondo: restaurante.color_fondo,
    color_acento: restaurante.color_acento,
    tipografia: restaurante.tipografia,
    hub_activo: restaurante.hub_activo,
  }
}

function compactarVinoSnapshot(vino = {}) {
  return {
    id: vino.id,
    nombre: vino.nombre,
    bodega: vino.bodega,
    tipo: vino.tipo,
    region: vino.region,
    uva: vino.uva,
    anada: vino.anada,
    precio_copa: vino.precio_copa,
    precio_botella: vino.precio_botella,
    notas_cata: vino.notas_cata,
  }
}

function compactarPlatoSnapshot(plato = {}) {
  return {
    id: plato.id,
    nombre: plato.nombre,
    descripcion: plato.descripcion,
    categoria: plato.categoria,
    precio: plato.precio,
    familias_aromaticas: plato.familias_aromaticas,
  }
}

async function crearSnapshotPublicacion({ restauranteId, publicationEventId, contenido, auth }) {
  const ultimoRes = await leerUltimoSnapshot(restauranteId)
  if (ultimoRes.pendiente) return { pendiente: true }
  if (ultimoRes.error) return { error: ultimoRes.error }

  const [restRes, vinosRes, platosRes] = await Promise.all([
    supabaseAdmin
      .from('restaurantes')
      .select(SELECT_RESTAURANTE_SNAPSHOT)
      .eq('id', restauranteId)
      .single(),
    supabaseAdmin
      .from('vinos')
      .select('id, nombre, bodega, tipo, region, uva, anada, precio_copa, precio_botella, notas_cata')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
    supabaseAdmin
      .from('platos')
      .select('id, nombre, descripcion, categoria, precio, familias_aromaticas')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
  ])
  const snapshotError = restRes.error || vinosRes.error || platosRes.error
  if (snapshotError) return { error: snapshotError }

  const payload = {
    restaurante_id: restauranteId,
    publication_event_id: publicationEventId || null,
    version_number: Number(ultimoRes.snapshot?.version_number || 0) + 1,
    contenido_resumen: contenido || resumirContenidoCarta(vinosRes.data || [], platosRes.data || []),
    restaurante_resumen: compactarRestauranteSnapshot(restRes.data || {}),
    vinos_snapshot: (vinosRes.data || []).map(compactarVinoSnapshot),
    platos_snapshot: (platosRes.data || []).map(compactarPlatoSnapshot),
    actor_id: auth.user.id,
    actor_email: (auth.user.email || '').toLowerCase(),
  }

  const { data, error } = await supabaseAdmin
    .from('publication_snapshots')
    .insert(payload)
    .select(SELECT_PUBLICATION_SNAPSHOT_RESUMEN)
    .single()

  if (snapshotPendiente(error)) return { pendiente: true }
  if (error) return { error }
  return { snapshot: data, pendiente: false }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const historialRes = await leerHistorialPublicacion(restauranteId, 10)
    if (historialRes.error) throw historialRes.error
    const snapshotRes = await leerUltimoSnapshot(restauranteId)
    if (snapshotRes.error) throw snapshotRes.error
    return Response.json({
      historial: historialRes.historial,
      historial_pendiente: Boolean(historialRes.pendiente),
      ultimo_snapshot: snapshotRes.snapshot,
      snapshot_pendiente: Boolean(snapshotRes.pendiente),
      sql: historialRes.pendiente
        ? 'supabase/add_publication_history.sql'
        : snapshotRes.pendiente
          ? 'supabase/add_publication_snapshots.sql'
          : null,
    })
  } catch (error) {
    console.error('[publicacion] historial leer:', error)
    return Response.json({ error: 'No se pudo cargar el historial de publicacion.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const activa = body.activa === true

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restauranteAntes, error: antesError } = await supabaseAdmin
      .from('restaurantes')
      .select('id, carta_publica_activa, hub_activo')
      .eq('id', restauranteId)
      .single()
    if (errorIncluye(antesError, 'carta_publica_activa')) {
      return Response.json({
        error: 'No se pudo cambiar el estado. Ejecuta supabase/add_publication_status.sql en Supabase.',
      }, { status: 409 })
    }
    if (antesError || !restauranteAntes) throw antesError || new Error('Restaurante no encontrado')

    let contenido = null
    const contenidoRes = await cargarContenido(restauranteId)
    if (contenidoRes.error) {
      if (activa) {
        console.error('[publicacion] contenido:', contenidoRes.error)
        return Response.json({ error: 'No se pudo comprobar el contenido de la carta.' }, { status: 503 })
      } else {
        console.error('[publicacion] contenido pausa:', contenidoRes.error)
      }
    } else {
      contenido = contenidoRes.contenido
    }
    if (activa) {
      if (!puedePublicarCarta(contenido)) {
        return Response.json({
          error: 'Completa vinos visibles y precios antes de publicar la carta.',
          contenido,
          problemas: problemasPublicacionCarta(contenido),
        }, { status: 409 })
      }
    }

    const { data: restaurante, error } = await supabaseAdmin
      .from('restaurantes')
      .update({ carta_publica_activa: activa })
      .eq('id', restauranteId)
      .select(SELECT_RESTAURANTE_PUBLICACION)
      .single()

    if (errorIncluye(error, 'carta_publica_activa')) {
      return Response.json({
        error: 'No se pudo cambiar el estado. Ejecuta supabase/add_publication_status.sql en Supabase.',
      }, { status: 409 })
    }
    if (error || !restaurante) throw error || new Error('Restaurante no encontrado')

    const eventoRes = await guardarEventoPublicacion({
      restauranteId,
      activa,
      estadoAnterior: estadoPublicacion(restauranteAntes.carta_publica_activa),
      contenido,
      auth,
    })
    let snapshotRes = { snapshot: null, pendiente: false }
    if (activa) {
      snapshotRes = await crearSnapshotPublicacion({
        restauranteId,
        publicationEventId: eventoRes.evento?.id,
        contenido,
        auth,
      })
      if (snapshotRes.error) console.error('[publicacion] snapshot:', snapshotRes.error)
    }

    const deliveryRes = await guardarDeliveryEvent(supabaseAdmin, {
      restauranteId,
      event: activa ? 'publication_published' : 'publication_paused',
      destino: destinoPublicacion(restaurante || restauranteAntes),
      metadata: {
        publication_event_id: eventoRes.evento?.id || null,
        snapshot_id: snapshotRes.snapshot?.id || null,
        contenido,
      },
      auth,
      userAgent: req.headers.get('user-agent'),
    })
    if (deliveryRes.error) console.error('[publicacion] delivery event:', deliveryRes.error)

    return Response.json({
      restaurante,
      contenido,
      evento: eventoRes.evento || null,
      snapshot: snapshotRes.snapshot || null,
      analytics_pendiente: Boolean(deliveryRes.pendiente),
      historial_pendiente: Boolean(eventoRes.pendiente),
      snapshot_pendiente: Boolean(snapshotRes.pendiente),
      sql: eventoRes.pendiente
        ? 'supabase/add_publication_history.sql'
        : snapshotRes.pendiente
          ? 'supabase/add_publication_snapshots.sql'
          : null,
    })
  } catch (error) {
    console.error('[publicacion] guardar:', error)
    return Response.json({ error: 'No se pudo cambiar el estado de publicacion.' }, { status: 500 })
  }
}
