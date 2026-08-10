import { NextResponse } from 'next/server'
import { requireRestaurantAccess } from '../../../_lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const BUCKET = 'cartaviva-etiquetas'
const MAX_BYTES = 5 * 1024 * 1024
const MIME_OK = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

function errorTexto(error) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase()
}

function faltaColumnaFoto(error) {
  const texto = errorTexto(error)
  return texto.includes('foto_url') || texto.includes('schema cache') || String(error?.code || '') === 'PGRST204'
}

function extensionDesdeMime(type = '') {
  if (type.includes('webp')) return 'webp'
  if (type.includes('png')) return 'png'
  return 'jpg'
}

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  if (!buckets?.some(bucket => bucket.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
  }
}

async function cargarVino(vinoId) {
  const { data, error } = await supabaseAdmin
    .from('vinos')
    .select('id, restaurante_id, foto_url')
    .eq('id', vinoId)
    .single()

  if (faltaColumnaFoto(error)) {
    return { error: 'Ejecuta supabase/add_wine_label_images.sql antes de subir etiquetas.', status: 400 }
  }
  if (error || !data) return { error: 'Vino no encontrado', status: 404 }
  return { vino: data }
}

export async function POST(request, { params }) {
  const { id } = await params
  const vinoRes = await cargarVino(id)
  if (vinoRes.error) return NextResponse.json({ error: vinoRes.error }, { status: vinoRes.status })

  const access = await requireRestaurantAccess(request, supabaseAdmin, vinoRes.vino.restaurante_id)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  let fd
  try {
    fd = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 })
  }

  const foto = fd.get('foto')
  if (!foto || typeof foto === 'string') {
    return NextResponse.json({ error: 'Falta el archivo de etiqueta' }, { status: 400 })
  }
  if (!MIME_OK.has(foto.type)) {
    return NextResponse.json({ error: 'Solo se permiten imagenes JPG, PNG o WebP' }, { status: 400 })
  }

  const buffer = await foto.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'La imagen supera el limite de 5 MB' }, { status: 400 })
  }

  try {
    await ensureBucket()
  } catch {
    // Si el bucket ya existe o el entorno restringe listBuckets, probamos igualmente la subida.
  }

  const ext = extensionDesdeMime(foto.type)
  const path = `${vinoRes.vino.restaurante_id}/${id}-${Date.now()}.${ext}`

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: foto.type, upsert: true })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

  const { error: updateError } = await supabaseAdmin
    .from('vinos')
    .update({ foto_url: publicUrl })
    .eq('id', id)
    .eq('restaurante_id', vinoRes.vino.restaurante_id)

  if (faltaColumnaFoto(updateError)) {
    return NextResponse.json({ error: 'Ejecuta supabase/add_wine_label_images.sql antes de subir etiquetas.' }, { status: 400 })
  }
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ url: publicUrl })
}

export async function DELETE(request, { params }) {
  const { id } = await params
  const vinoRes = await cargarVino(id)
  if (vinoRes.error) return NextResponse.json({ error: vinoRes.error }, { status: vinoRes.status })

  const access = await requireRestaurantAccess(request, supabaseAdmin, vinoRes.vino.restaurante_id)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  if (vinoRes.vino.foto_url) {
    const match = vinoRes.vino.foto_url.match(/cartaviva-etiquetas\/(.+)/)
    if (match) await supabaseAdmin.storage.from(BUCKET).remove([match[1]])
  }

  const { error } = await supabaseAdmin
    .from('vinos')
    .update({ foto_url: null })
    .eq('id', id)
    .eq('restaurante_id', vinoRes.vino.restaurante_id)

  if (faltaColumnaFoto(error)) {
    return NextResponse.json({ error: 'Ejecuta supabase/add_wine_label_images.sql antes de quitar etiquetas.' }, { status: 400 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
