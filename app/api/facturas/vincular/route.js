import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

// Vincula un archivo ya subido (vía /api/facturas/extraer) con una
// cabecera de compra recién creada. Inserta una fila en
// facturas_compra_adjuntos; NO re-sube el archivo (está en Storage).
//
// POST body JSON:
//   {
//     restaurante_id: uuid,
//     cabecera_compra_id: uuid,
//     path: 'restauranteId/_ia/<hash>.<ext>',  ← tal cual lo devolvió extraer
//     mime_type: 'application/pdf' | 'image/png' | 'image/jpeg',
//     tamano_bytes: number,
//     nombre_archivo: string,
//   }

async function requireSumiller(restauranteId) {
  const { data: rest } = await supabaseAdmin
    .from('restaurantes').select('plan').eq('id', restauranteId).single()
  if (rest?.plan !== 'sumiller' && rest?.plan !== 'premium') {
    return { error: 'Solo disponible para los planes Somm y Acompañado.', status: 403 }
  }
  return null
}

export async function POST(req) {
  try {
    const body = await req.json()
    const {
      restaurante_id, cabecera_compra_id, path,
      mime_type, tamano_bytes, nombre_archivo,
    } = body || {}

    if (!restaurante_id || !cabecera_compra_id || !path || !nombre_archivo) {
      return Response.json({ error: 'Datos incompletos.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    const plan = await requireSumiller(restaurante_id)
    if (plan) return Response.json({ error: plan.error }, { status: plan.status })

    // Seguridad: el path debe pertenecer al restaurante.
    if (!String(path).startsWith(`${restaurante_id}/`)) {
      return Response.json({ error: 'Ruta no permitida.' }, { status: 400 })
    }

    const { data: adjunto, error: insertErr } = await supabaseAdmin
      .from('facturas_compra_adjuntos')
      .insert({
        restaurante_id,
        cabecera_compra_id,
        nombre_archivo: String(nombre_archivo).slice(0, 255),
        storage_path:   String(path),
        mime_type:      String(mime_type || ''),
        tamano_bytes:   Math.max(0, parseInt(tamano_bytes) || 0),
      })
      .select('id')
      .single()
    if (insertErr) {
      console.error('[facturas/vincular] insert', insertErr.message)
      return Response.json({ error: 'No se pudo vincular la factura.' }, { status: 500 })
    }

    return Response.json({ ok: true, adjunto_id: adjunto.id })
  } catch (err) {
    console.error('[facturas/vincular] fatal', err?.message || err?.name)
    return Response.json({ error: 'Error al vincular la factura.' }, { status: 500 })
  }
}
