import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const TIPOS = new Set(['entrada', 'venta', 'merma', 'ajuste', 'cata', 'invitacion'])
const MODOS = new Set(['delta', 'establecer'])

function texto(value, limite = 240) {
  return String(value || '').trim().slice(0, limite)
}

function normalizarAjustes(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null

  const ajustes = value.map(item => {
    const vinoId = texto(item?.vino_id, 80)
    const modo = texto(item?.modo, 20)
    const tipo = texto(item?.tipo, 20)
    const valor = Number(item?.valor)
    if (!vinoId || !MODOS.has(modo) || !TIPOS.has(tipo) || !Number.isInteger(valor)) return null
    return {
      vino_id: vinoId,
      modo,
      valor,
      tipo,
      motivo: texto(item?.motivo, 500) || 'Ajuste de stock',
      registrar_venta: Boolean(item?.registrar_venta),
    }
  })

  return ajustes.some(item => !item) ? null : ajustes
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const ajustes = normalizarAjustes(body.ajustes)
    if (!restauranteId || !ajustes) {
      return Response.json({ error: 'Ajustes de stock no validos.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('aplicar_ajustes_stock_atomicos', {
      p_restaurante_id: restauranteId,
      p_ajustes: ajustes,
      p_actor_id: auth.user.id,
      p_actor_email: (auth.user.email || '').toLowerCase(),
    })

    if (error) {
      if (error.code === 'PGRST202' || /aplicar_ajustes_stock_atomicos/i.test(error.message || '')) {
        return Response.json({
          error: 'Falta aplicar la migracion de stock atomico en Supabase.',
        }, { status: 503 })
      }
      throw error
    }

    return Response.json({ ajustes: Array.isArray(data) ? data : [] })
  } catch (error) {
    console.error('[stock-ajustes]', error)
    return Response.json({ error: 'No se pudieron aplicar los ajustes de stock.' }, { status: 500 })
  }
}
