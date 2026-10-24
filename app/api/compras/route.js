import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

async function bridgeLibroCompras({ restauranteId, cabecera, cabeceraId, lineas }) {
  // Solo para plan sumiller. Bridge atómico via RPC para evitar race condition.
  // importe = suma de importe_neto (base imponible neta: post-descuento, pre-IVA)
  const { data: rest } = await supabaseAdmin
    .from('restaurantes')
    .select('plan')
    .eq('id', restauranteId)
    .single()
  if (rest?.plan !== 'sumiller') return

  const periodo = cabecera.fecha.slice(0, 7) // 'YYYY-MM'
  const importe = Math.round(
    (lineas || []).reduce((s, l) => s + (Number(l.importe_neto) || 0), 0) * 100
  ) / 100

  const entrada = {
    fecha:              cabecera.fecha,
    importe,
    cabecera_compra_id: cabeceraId,
    ...(cabecera.numero_documento ? { albaran: cabecera.numero_documento } : {}),
  }

  await supabaseAdmin.rpc('upsert_libro_compras_factura', {
    p_restaurante_id: restauranteId,
    p_periodo:        periodo,
    p_proveedor:      cabecera.proveedor,
    p_entrada:        entrada,
  })
}

function str(v, max = 500) {
  return String(v ?? '').trim().slice(0, max)
}

function validarCabecera(raw) {
  if (!raw || typeof raw !== 'object') return null
  const proveedor = str(raw.proveedor, 200)
  const fecha     = str(raw.fecha, 10)
  if (!proveedor || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  return {
    proveedor,
    fecha,
    numero_documento:   str(raw.numero_documento, 100)   || undefined,
    referencia_externa: str(raw.referencia_externa, 100) || undefined,
    descuento_global:   Math.max(0, Math.min(99.99, Number(raw.descuento_global) || 0)),
    iva_pct:            Math.max(0, Math.min(100,   Number(raw.iva_pct)          ?? 21)),
    notas:              str(raw.notas, 500) || undefined,
    origen:             ['manual', 'importacion'].includes(raw.origen) ? raw.origen : 'manual',
  }
}

function validarLineas(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 200) return null
  const lineas = raw.map(item => {
    const vino_id       = str(item?.vino_id, 80)
    const uds           = Math.floor(Number(item?.uds))
    const uds_bon       = Math.floor(Number(item?.uds_bonificadas) || 0)
    const precio_tarifa = Number(item?.precio_tarifa)
    const desc_linea    = Math.max(0, Math.min(99.99, Number(item?.descuento_linea) || 0))
    if (!vino_id || uds <= 0 || uds_bon < 0 || isNaN(precio_tarifa) || precio_tarifa < 0) return null
    return { vino_id, uds, uds_bonificadas: uds_bon, precio_tarifa, descuento_linea: desc_linea }
  })
  return lineas.some(l => !l) ? null : lineas
}

export async function POST(req) {
  try {
    const body         = await req.json()
    const restauranteId = str(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const cabecera = validarCabecera(body.cabecera)
    const lineas   = validarLineas(body.lineas)

    if (!restauranteId || !cabecera || !lineas) {
      return Response.json({ error: 'Datos de compra no válidos.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('registrar_compra_con_pmp', {
      p_restaurante_id: restauranteId,
      p_cabecera:       cabecera,
      p_lineas:         lineas,
    })

    if (error) {
      if (error.message?.includes('already_exists')) {
        return Response.json({ error: 'already_exists' }, { status: 409 })
      }
      if (error.message?.includes('vino_no_encontrado')) {
        return Response.json({ error: 'Vino no encontrado o no autorizado.' }, { status: 400 })
      }
      if (error.message?.includes('proveedor_requerido')) {
        return Response.json({ error: 'El proveedor es obligatorio.' }, { status: 400 })
      }
      throw error
    }

    // Bridge asíncrono — fallo no bloquea la respuesta al cliente
    if (data?.cabecera_id) {
      bridgeLibroCompras({
        restauranteId,
        cabecera,
        cabeceraId: data.cabecera_id,
        lineas:     data.lineas,
      }).catch(err => console.error('[compras bridge]', err))
    }

    return Response.json({ ok: true, ...data })
  } catch (err) {
    console.error('[compras]', err)
    return Response.json({ error: 'No se pudo registrar la compra.' }, { status: 500 })
  }
}
