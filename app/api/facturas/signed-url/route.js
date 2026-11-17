import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { validarPathFactura } from '../../../lib/facturasPath'

// GET /api/facturas/signed-url?path=…&restaurante_id=…
//
// Devuelve una URL firmada del bucket `facturas-bodega` para que el
// cliente pueda abrir el adjunto (PDF o imagen) en una pestaña nueva.
// Mismo gating de plan que /api/facturas/extraer (sumiller/premium) y
// validación pura del path en app/lib/facturasPath.js.
//
// Nunca se filtra el path del error al cliente; los códigos 400/403/404
// son limpios.

const BUCKET = 'facturas-bodega'
const EXPIRES_IN = 60 * 10  // 10 minutos

async function requireSumiller(restauranteId) {
  const { data: rest } = await supabaseAdmin
    .from('restaurantes')
    .select('plan')
    .eq('id', restauranteId)
    .single()
  if (rest?.plan !== 'sumiller' && rest?.plan !== 'premium') {
    return { error: 'Solo disponible para los planes Somm y Acompañado.', status: 403 }
  }
  return null
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const path          = searchParams.get('path')
    const restauranteId = searchParams.get('restaurante_id')
    if (!path || !restauranteId) {
      return Response.json({ error: 'Faltan parámetros.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const plan = await requireSumiller(restauranteId)
    if (plan) return Response.json({ error: plan.error }, { status: plan.status })

    const v = validarPathFactura(path, restauranteId)
    if (!v.ok) {
      // No devolvemos `reason` al cliente: sólo nos sirve para log.
      console.error('[facturas/signed-url] path rechazado:', v.reason)
      return Response.json({ error: 'Ruta no permitida.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, EXPIRES_IN)
    if (error || !data?.signedUrl) {
      // Cualquier fallo de Storage (incluye "object not found") se
      // responde como 404 opaco para no filtrar si el objeto existe.
      console.error('[facturas/signed-url] Storage:', error?.message || 'sin URL firmada')
      return Response.json({ error: 'Archivo no encontrado.' }, { status: 404 })
    }

    return Response.json({ url: data.signedUrl, expires_in: EXPIRES_IN })
  } catch (err) {
    console.error('[facturas/signed-url] fatal', err?.message || err?.name)
    return Response.json({ error: 'Error al firmar la URL.' }, { status: 500 })
  }
}
