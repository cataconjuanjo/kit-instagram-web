import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

const BUCKET    = 'kiosko-logos'
const MAX_BYTES = 2 * 1024 * 1024
const MIME_OK   = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'])

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets()
  if (!buckets?.some(b => b.name === BUCKET)) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
  }
}

export async function POST(request, { params }) {
  const { slug } = await params

  const { data: tienda } = await supabaseAdmin
    .from('tiendas').select('id').eq('slug', slug).single()
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  let fd
  try { fd = await request.formData() } catch {
    return NextResponse.json({ error: 'Error al leer el formulario' }, { status: 400 })
  }

  const logo = fd.get('logo')
  if (!logo || typeof logo === 'string') {
    return NextResponse.json({ error: 'Falta el archivo de logo' }, { status: 400 })
  }
  if (!MIME_OK.has(logo.type)) {
    return NextResponse.json({ error: 'Solo se permiten PNG, JPG, WebP o SVG' }, { status: 400 })
  }

  const buffer = await logo.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'El logo supera el límite de 2 MB' }, { status: 400 })
  }

  try { await ensureBucket() } catch { /* ya existe */ }

  const ext  = logo.type.includes('svg') ? 'svg' : logo.type.includes('webp') ? 'webp' : logo.type.includes('png') ? 'png' : 'jpg'
  const path = `${tienda.id}/logo.${ext}`

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: logo.type, upsert: true })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)

  await supabaseAdmin
    .from('tiendas')
    .update({ logo_url: publicUrl })
    .eq('id', tienda.id)

  return NextResponse.json({ url: publicUrl })
}
