import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

const BUCKET   = 'kiosko-fotos'
const MAX_BYTES = 5 * 1024 * 1024
const MIME_OK   = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  if (!buckets?.some(b => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
  }
}

async function getTiendaId(slug) {
  const { data } = await supabaseAdmin.from('tiendas').select('id').eq('slug', slug).single()
  return data?.id || null
}

export async function POST(request, { params }) {
  const { slug } = await params
  const tiendaId = await getTiendaId(slug)
  if (!tiendaId) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  let fd
  try { fd = await request.formData() } catch {
    return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 })
  }

  const foto   = fd.get('foto')
  const vinoId = fd.get('vinoId') || null

  if (!foto || typeof foto === 'string') {
    return NextResponse.json({ error: 'Falta el archivo de foto' }, { status: 400 })
  }
  if (!MIME_OK.has(foto.type)) {
    return NextResponse.json({ error: 'Solo se permiten imágenes JPG, PNG o WebP' }, { status: 400 })
  }

  const buffer = await foto.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'La imagen supera el límite de 5 MB' }, { status: 400 })
  }

  try { await ensureBucket() } catch { /* ya existe */ }

  const ext  = foto.type.includes('webp') ? 'webp' : foto.type.includes('png') ? 'png' : 'jpg'
  const path = `${tiendaId}/${vinoId ?? Date.now()}.${ext}`

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: foto.type, upsert: true })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

  if (vinoId) {
    await supabaseAdmin
      .from('vinos_tienda')
      .update({ foto_url: publicUrl })
      .eq('id', vinoId)
      .eq('tienda_id', tiendaId)
  }

  return NextResponse.json({ url: publicUrl })
}

export async function DELETE(request, { params }) {
  const { slug } = await params
  const tiendaId = await getTiendaId(slug)
  if (!tiendaId) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const { vinoId } = body
  if (!vinoId) return NextResponse.json({ error: 'Falta vinoId' }, { status: 400 })

  const { data: vino } = await supabaseAdmin
    .from('vinos_tienda')
    .select('foto_url')
    .eq('id', vinoId)
    .eq('tienda_id', tiendaId)
    .single()

  if (vino?.foto_url) {
    const match = vino.foto_url.match(/kiosko-fotos\/(.+)/)
    if (match) await supabaseAdmin.storage.from(BUCKET).remove([match[1]])
  }

  await supabaseAdmin
    .from('vinos_tienda')
    .update({ foto_url: null })
    .eq('id', vinoId)
    .eq('tienda_id', tiendaId)

  return NextResponse.json({ ok: true })
}
