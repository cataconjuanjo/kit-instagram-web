import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { resumirContenidoCarta } from '../../../lib/publicationReadiness'

function texto(valor, limite = 100) {
  return String(valor || '').trim().slice(0, limite)
}

function numeroPrecio(valor) {
  if (valor === null || valor === undefined || valor === '') return 0
  const numero = Number(String(valor).replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

function errorTablaPendiente(error) {
  const textoError = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase()
  return textoError.includes('publication_snapshots') || ['42P01', 'PGRST205'].includes(String(error?.code || ''))
}

function claveItem(item = {}) {
  return String(item.id || `${item.nombre || ''}-${item.bodega || item.categoria || ''}`).toLowerCase()
}

function compactarVino(vino = {}) {
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

function compactarPlato(plato = {}) {
  return {
    id: plato.id,
    nombre: plato.nombre,
    descripcion: plato.descripcion,
    categoria: plato.categoria,
    precio: plato.precio,
    familias_aromaticas: plato.familias_aromaticas,
  }
}

function describirVino(vino = {}) {
  return [vino.nombre, vino.bodega, vino.tipo, vino.region].filter(Boolean).join(' · ')
}

function describirPlato(plato = {}) {
  return [plato.nombre, plato.categoria].filter(Boolean).join(' · ')
}

function compararColeccion(snapshotItems = [], currentItems = [], descriptor, comparadores = []) {
  const snapshotMap = new Map((snapshotItems || []).map(item => [claveItem(item), item]))
  const currentMap = new Map((currentItems || []).map(item => [claveItem(item), item]))
  const agregados = []
  const eliminados = []
  const cambiados = []

  for (const [clave, current] of currentMap) {
    const before = snapshotMap.get(clave)
    if (!before) {
      agregados.push({ id: current.id, nombre: descriptor(current), actual: current })
      continue
    }
    const cambios = comparadores
      .map(comparador => comparador(before, current))
      .filter(Boolean)
    if (cambios.length) {
      cambiados.push({ id: current.id, nombre: descriptor(current), cambios, anterior: before, actual: current })
    }
  }

  for (const [clave, before] of snapshotMap) {
    if (!currentMap.has(clave)) eliminados.push({ id: before.id, nombre: descriptor(before), anterior: before })
  }

  return { agregados, eliminados, cambiados }
}

function compararPrecio(campo, label) {
  return (before, current) => {
    const anterior = numeroPrecio(before[campo])
    const actual = numeroPrecio(current[campo])
    if (anterior === actual) return null
    return { campo, label, anterior, actual }
  }
}

function compararTexto(campo, label) {
  return (before, current) => {
    const anterior = String(before[campo] || '').trim()
    const actual = String(current[campo] || '').trim()
    if (anterior === actual) return null
    return { campo, label, anterior, actual }
  }
}

function compararJson(campo, label) {
  return (before, current) => {
    const anterior = JSON.stringify(before[campo] || null)
    const actual = JSON.stringify(current[campo] || null)
    if (anterior === actual) return null
    return { campo, label, anterior: before[campo] || '-', actual: current[campo] || '-' }
  }
}

function compararSnapshotConActual(snapshot, current) {
  const vinos = compararColeccion(
    snapshot?.vinos_snapshot || [],
    current.vinos || [],
    describirVino,
    [
      compararPrecio('precio_botella', 'Botella'),
      compararPrecio('precio_copa', 'Copa'),
      compararTexto('nombre', 'Nombre'),
      compararTexto('bodega', 'Bodega'),
      compararTexto('tipo', 'Tipo'),
      compararTexto('region', 'Region'),
      compararTexto('uva', 'Uva'),
      compararTexto('anada', 'Anada'),
      compararTexto('notas_cata', 'Notas'),
    ]
  )
  const platos = compararColeccion(
    snapshot?.platos_snapshot || [],
    current.platos || [],
    describirPlato,
    [
      compararPrecio('precio', 'Precio'),
      compararTexto('nombre', 'Nombre'),
      compararTexto('categoria', 'Categoria'),
      compararTexto('descripcion', 'Descripcion'),
      compararJson('familias_aromaticas', 'Familias'),
    ]
  )
  return {
    resumen: {
      vinos_agregados: vinos.agregados.length,
      vinos_eliminados: vinos.eliminados.length,
      vinos_cambiados: vinos.cambiados.length,
      platos_agregados: platos.agregados.length,
      platos_eliminados: platos.eliminados.length,
      platos_cambiados: platos.cambiados.length,
    },
    vinos,
    platos,
  }
}

async function cargarActual(restauranteId) {
  const [vinosRes, platosRes] = await Promise.all([
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
  const error = vinosRes.error || platosRes.error
  if (error) return { error }
  const vinos = (vinosRes.data || []).map(compactarVino)
  const platos = (platosRes.data || []).map(compactarPlato)
  return {
    actual: {
      vinos,
      platos,
      contenido_resumen: resumirContenidoCarta(vinos, platos),
    },
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const snapshotId = texto(searchParams.get('snapshot_id'), 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: snapshots, error: listError } = await supabaseAdmin
      .from('publication_snapshots')
      .select('id, restaurante_id, publication_event_id, version_number, contenido_resumen, actor_email, created_at')
      .eq('restaurante_id', restauranteId)
      .order('version_number', { ascending: false })
      .limit(30)

    if (errorTablaPendiente(listError)) {
      return Response.json({
        snapshots: [],
        snapshot_pendiente: true,
        sql: 'supabase/add_publication_snapshots.sql',
      }, { status: 409 })
    }
    if (listError) throw listError

    const objetivoId = snapshotId || snapshots?.[0]?.id || ''
    let snapshot = null
    if (objetivoId) {
      const { data, error } = await supabaseAdmin
        .from('publication_snapshots')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .eq('id', objetivoId)
        .single()
      if (errorTablaPendiente(error)) {
        return Response.json({
          snapshots: [],
          snapshot_pendiente: true,
          sql: 'supabase/add_publication_snapshots.sql',
        }, { status: 409 })
      }
      if (error) throw error
      snapshot = data
    }

    const actualRes = await cargarActual(restauranteId)
    if (actualRes.error) throw actualRes.error

    return Response.json({
      snapshots: snapshots || [],
      snapshot,
      actual: actualRes.actual,
      comparacion: snapshot ? compararSnapshotConActual(snapshot, actualRes.actual) : null,
      snapshot_pendiente: false,
    })
  } catch (error) {
    console.error('[publicacion/snapshots]', error)
    return Response.json({ error: 'No se pudieron cargar las versiones publicadas.' }, { status: 500 })
  }
}
