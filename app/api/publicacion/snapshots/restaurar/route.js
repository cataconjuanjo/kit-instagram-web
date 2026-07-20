import { requireRestaurantAccess } from '../../../_lib/auth'
import { guardarDeliveryEvent } from '../../../../lib/publicationDeliveryAnalytics'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { resumirContenidoCarta } from '../../../../lib/publicationReadiness'

function texto(valor, limite = 120) {
  return String(valor || '').trim().slice(0, limite)
}

function textoLargo(valor, limite = 1200) {
  return String(valor || '').trim().slice(0, limite)
}

function decimalNullable(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = Number(String(valor).replace(',', '.'))
  return Number.isFinite(numero) ? numero : null
}

function decimalCero(valor) {
  const numero = decimalNullable(valor)
  return numero === null ? 0 : numero
}

function listaJson(valor) {
  return Array.isArray(valor) ? valor : []
}

function limpiarObjeto(objeto) {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined)
  )
}

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

function prepararVinoSnapshot(vino = {}, restauranteId) {
  return limpiarObjeto({
    id: texto(vino.id, 80) || undefined,
    restaurante_id: restauranteId,
    nombre: texto(vino.nombre, 180) || 'Vino sin nombre',
    bodega: texto(vino.bodega, 180),
    tipo: texto(vino.tipo, 60) || 'tinto',
    region: texto(vino.region, 140),
    uva: texto(vino.uva, 140),
    anada: texto(vino.anada, 40),
    precio_copa: decimalNullable(vino.precio_copa),
    precio_botella: decimalNullable(vino.precio_botella),
    notas_cata: textoLargo(vino.notas_cata),
    activo: true,
  })
}

function prepararPlatoSnapshot(plato = {}, restauranteId) {
  return limpiarObjeto({
    id: texto(plato.id, 80) || undefined,
    restaurante_id: restauranteId,
    nombre: texto(plato.nombre, 180) || 'Plato sin nombre',
    descripcion: textoLargo(plato.descripcion),
    categoria: texto(plato.categoria, 120) || 'Carta',
    precio: decimalCero(plato.precio),
    familias_aromaticas: plato.familias_aromaticas ?? null,
    activo: true,
  })
}

async function guardarEventoRestauracion({ restauranteId, estadoAnterior, contenido, snapshot, auth }) {
  const payload = {
    restaurante_id: restauranteId,
    accion: 'pausar',
    estado_anterior: estadoAnterior,
    estado_nuevo: 'borrador',
    contenido_resumen: contenido,
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
    console.error('[publicacion/snapshots/restaurar] historial:', {
      error,
      snapshot_id: snapshot?.id,
      version_number: snapshot?.version_number,
    })
    return { error }
  }
  return { evento: data, pendiente: false }
}

async function restaurarItem({ tabla, restauranteId, payload }) {
  const id = payload.id
  if (id) {
    const { id: _id, restaurante_id: _restauranteId, ...cambios } = payload
    const { data, error } = await supabaseAdmin
      .from(tabla)
      .update(cambios)
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
      .select('id')
      .maybeSingle()

    if (error) return { error }
    if (data?.id) return { id: data.id }
  }

  let insert = await supabaseAdmin
    .from(tabla)
    .insert(payload)
    .select('id')
    .single()

  if (insert.error && id && String(insert.error.code || '') === '23505') {
    const { id: _id, ...payloadSinId } = payload
    insert = await supabaseAdmin
      .from(tabla)
      .insert(payloadSinId)
      .select('id')
      .single()
  }

  if (insert.error) return { error: insert.error }
  return { id: insert.data?.id }
}

async function ocultarNoRestaurados(tabla, restauranteId, idsRestaurados) {
  let query = supabaseAdmin
    .from(tabla)
    .update({ activo: false })
    .eq('restaurante_id', restauranteId)

  if (idsRestaurados.length) {
    query = query.not('id', 'in', `(${idsRestaurados.join(',')})`)
  }

  const { error } = await query
  return { error }
}

async function restaurarColeccion({ tabla, restauranteId, items, preparar }) {
  const ids = []
  for (const item of items) {
    const payload = preparar(item, restauranteId)
    const resultado = await restaurarItem({ tabla, restauranteId, payload })
    if (resultado.error) return { error: resultado.error }
    if (resultado.id) ids.push(resultado.id)
  }

  const ocultarRes = await ocultarNoRestaurados(tabla, restauranteId, ids)
  if (ocultarRes.error) return { error: ocultarRes.error }
  return { ids }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const snapshotId = texto(body.snapshot_id, 80)
    const confirmar = body.confirmar === true

    if (!restauranteId || !snapshotId) {
      return Response.json({ error: 'restaurante_id y snapshot_id son obligatorios.' }, { status: 400 })
    }
    if (!confirmar) {
      return Response.json({ error: 'Confirma la restauracion antes de aplicarla.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('publication_snapshots')
      .select('*')
      .eq('restaurante_id', restauranteId)
      .eq('id', snapshotId)
      .maybeSingle()

    if (snapshotPendiente(snapshotError)) {
      return Response.json({
        error: 'Aplica supabase/add_publication_snapshots.sql para restaurar versiones.',
        snapshot_pendiente: true,
        sql: 'supabase/add_publication_snapshots.sql',
      }, { status: 409 })
    }
    if (snapshotError) throw snapshotError
    if (!snapshot) return Response.json({ error: 'Version publicada no encontrada.' }, { status: 404 })

    const vinosSnapshot = listaJson(snapshot.vinos_snapshot)
    const platosSnapshot = listaJson(snapshot.platos_snapshot)
    if (!vinosSnapshot.length && !platosSnapshot.length) {
      return Response.json({ error: 'Esta version no contiene vinos ni platos para restaurar.' }, { status: 409 })
    }

    const { data: restauranteAntes, error: restauranteAntesError } = await supabaseAdmin
      .from('restaurantes')
      .select('id, carta_publica_activa, hub_activo')
      .eq('id', restauranteId)
      .single()

    if (errorIncluye(restauranteAntesError, 'carta_publica_activa')) {
      return Response.json({
        error: 'Aplica supabase/add_publication_status.sql antes de restaurar versiones.',
      }, { status: 409 })
    }
    if (restauranteAntesError || !restauranteAntes) throw restauranteAntesError || new Error('Restaurante no encontrado')

    const { data: restaurante, error: pausaError } = await supabaseAdmin
      .from('restaurantes')
      .update({ carta_publica_activa: false })
      .eq('id', restauranteId)
      .select('*')
      .single()

    if (pausaError) throw pausaError

    const vinosRes = await restaurarColeccion({
      tabla: 'vinos',
      restauranteId,
      items: vinosSnapshot,
      preparar: prepararVinoSnapshot,
    })
    if (vinosRes.error) throw vinosRes.error

    const platosRes = await restaurarColeccion({
      tabla: 'platos',
      restauranteId,
      items: platosSnapshot,
      preparar: prepararPlatoSnapshot,
    })
    if (platosRes.error) throw platosRes.error

    const contenidoBase = resumirContenidoCarta(vinosSnapshot, platosSnapshot)
    const contenido = {
      ...contenidoBase,
      restauracion: {
        tipo: 'snapshot',
        snapshot_id: snapshot.id,
        version_number: snapshot.version_number,
      },
    }

    const eventoRes = await guardarEventoRestauracion({
      restauranteId,
      estadoAnterior: estadoPublicacion(restauranteAntes.carta_publica_activa),
      contenido,
      snapshot,
      auth,
    })

    const deliveryRes = await guardarDeliveryEvent(supabaseAdmin, {
      restauranteId,
      event: 'publication_paused',
      destino: restauranteAntes.hub_activo ? 'hub' : 'carta',
      metadata: {
        source: 'snapshot_restore',
        snapshot_id: snapshot.id,
        version_number: snapshot.version_number,
        restaurados: {
          vinos: vinosRes.ids.length,
          platos: platosRes.ids.length,
        },
        contenido,
      },
      auth,
      userAgent: req.headers.get('user-agent'),
    })
    if (deliveryRes.error) console.error('[publicacion/snapshots/restaurar] delivery event:', deliveryRes.error)

    return Response.json({
      restaurante,
      snapshot: {
        id: snapshot.id,
        version_number: snapshot.version_number,
        created_at: snapshot.created_at,
      },
      contenido,
      restaurados: {
        vinos: vinosRes.ids.length,
        platos: platosRes.ids.length,
      },
      evento: eventoRes.evento || null,
      analytics_pendiente: Boolean(deliveryRes.pendiente),
      historial_pendiente: Boolean(eventoRes.pendiente),
      historial_error: Boolean(eventoRes.error),
      sql: eventoRes.pendiente ? 'supabase/add_publication_history.sql' : null,
    })
  } catch (error) {
    console.error('[publicacion/snapshots/restaurar]', error)
    return Response.json({ error: 'No se pudo restaurar la version publicada.' }, { status: 500 })
  }
}
