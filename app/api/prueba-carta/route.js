import { requireRestaurantAccess } from '../_lib/auth'
import { crearTokenPruebaCarta, normalizarDuracionPruebaMs } from '../../lib/cartaPruebaToken'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

function numeroHoras(valor) {
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0 ? numero : 1
}

function destinoPreview(valor, restaurante = {}) {
  if (valor === 'hub' && restaurante.hub_activo) return 'hub'
  return 'carta'
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { restaurante_id } = body
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error } = await supabaseAdmin
      .from('restaurantes')
      .select('slug, hub_activo')
      .eq('id', restaurante_id)
      .single()
    if (error || !restaurante) return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })

    const duracionMs = normalizarDuracionPruebaMs(numeroHoras(body.duracion_horas) * 60 * 60 * 1000)
    const caducaAt = new Date(Date.now() + duracionMs)
    const destino = destinoPreview(body.destino, restaurante)
    const token = crearTokenPruebaCarta(restaurante_id, {
      duracionMs,
      tipo: destino === 'hub' ? 'preview_hub' : 'preview_carta',
    })
    const ruta = destino === 'hub' ? `/r/${restaurante.slug}` : `/carta/${restaurante.slug}`
    const url = `${ruta}?prueba=${encodeURIComponent(token)}`
    const urlAbsoluta = new URL(url, req.url).toString()
    return Response.json({
      url,
      url_absoluta: urlAbsoluta,
      destino,
      caduca_en_minutos: Math.round(duracionMs / 60000),
      caduca_at: caducaAt.toISOString(),
    })
  } catch (error) {
    console.error('[prueba-carta]', error)
    return Response.json({ error: 'No se pudo abrir el modo de prueba.' }, { status: 500 })
  }
}
