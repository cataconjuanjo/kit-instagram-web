import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const BUCKET = 'facturas-bodega'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg'])

// GET ?cabecera_compra_id=xxx&restaurante_id=xxx
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const cabeceraId    = searchParams.get('cabecera_compra_id')
    const restauranteId = searchParams.get('restaurante_id')
    if (!cabeceraId || !restauranteId) {
      return Response.json({ error: 'Faltan parámetros.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('facturas_compra_adjuntos')
      .select('id, nombre_archivo, storage_path, mime_type, tamano_bytes, created_at')
      .eq('cabecera_compra_id', cabeceraId)
      .eq('restaurante_id', restauranteId)
      .order('created_at', { ascending: true })
    if (error) throw error

    const adjuntos = await Promise.all((data || []).map(async adj => {
      const { data: signed } = await supabaseAdmin.storage
        .from(BUCKET)
        .createSignedUrl(adj.storage_path, 3600)
      return { ...adj, url: signed?.signedUrl || null }
    }))

    return Response.json({ adjuntos })
  } catch (err) {
    console.error('[facturas-adjuntos GET]', err)
    return Response.json({ error: 'Error al cargar adjuntos.' }, { status: 500 })
  }
}

// POST { restaurante_id, cabecera_compra_id, nombre_archivo, mime_type, tamano_bytes }
export async function POST(req) {
  try {
    const body = await req.json()
    const { restaurante_id, cabecera_compra_id, nombre_archivo, mime_type, tamano_bytes } = body

    if (!restaurante_id || !cabecera_compra_id || !nombre_archivo) {
      return Response.json({ error: 'Datos incompletos.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    if (Number(tamano_bytes) > MAX_BYTES) {
      return Response.json({ error: 'El archivo supera el límite de 10 MB.' }, { status: 400 })
    }
    if (!ALLOWED_MIME.has(mime_type)) {
      return Response.json({ error: 'Solo se permiten archivos PDF, PNG o JPG.' }, { status: 400 })
    }

    const ext        = String(nombre_archivo).split('.').pop()?.toLowerCase() || 'bin'
    const fileId     = crypto.randomUUID()
    const storagePath = `${restaurante_id}/${cabecera_compra_id}/${fileId}.${ext}`

    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath)
    if (signedErr) throw signedErr

    const { data: adjunto, error: insertErr } = await supabaseAdmin
      .from('facturas_compra_adjuntos')
      .insert({
        restaurante_id,
        cabecera_compra_id,
        nombre_archivo:  String(nombre_archivo).slice(0, 255),
        storage_path:    storagePath,
        mime_type,
        tamano_bytes:    Math.max(0, parseInt(tamano_bytes) || 0),
      })
      .select('id')
      .single()
    if (insertErr) throw insertErr

    return Response.json({
      ok:         true,
      adjunto_id: adjunto.id,
      signed_url: signedData.signedUrl,
      token:      signedData.token,
      path:       storagePath,
    })
  } catch (err) {
    console.error('[facturas-adjuntos POST]', err)
    return Response.json({ error: 'Error al preparar la subida.' }, { status: 500 })
  }
}

// DELETE ?id=xxx&restaurante_id=xxx
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url)
    const id            = searchParams.get('id')
    const restauranteId = searchParams.get('restaurante_id')
    if (!id || !restauranteId) {
      return Response.json({ error: 'Faltan parámetros.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: adj, error: fetchErr } = await supabaseAdmin
      .from('facturas_compra_adjuntos')
      .select('storage_path')
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
      .single()
    if (fetchErr || !adj) return Response.json({ error: 'Adjunto no encontrado.' }, { status: 404 })

    await supabaseAdmin.storage.from(BUCKET).remove([adj.storage_path])

    const { error: deleteErr } = await supabaseAdmin
      .from('facturas_compra_adjuntos')
      .delete()
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
    if (deleteErr) throw deleteErr

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[facturas-adjuntos DELETE]', err)
    return Response.json({ error: 'Error al eliminar el adjunto.' }, { status: 500 })
  }
}
