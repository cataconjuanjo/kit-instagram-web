import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

function texto(v, max = 200) { return String(v || '').trim().slice(0, max) }

// GET /api/conteos?restaurante_id=
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id = texto(searchParams.get('restaurante_id'), 80)
    if (!restaurante_id) return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const [{ data: conteos }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from('conteos_inventario')
        .select('id, tipo, estado, cerrado_en, notas, created_at')
        .eq('restaurante_id', restaurante_id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('restaurant_economic_settings')
        .select('control_stock_desde')
        .eq('restaurante_id', restaurante_id)
        .single(),
    ])

    const borrador = (conteos || []).find(c => c.estado === 'borrador') || null
    return Response.json({
      conteos: conteos || [],
      borrador,
      control_stock_desde: settings?.control_stock_desde ?? null,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/conteos  { restaurante_id, tipo }
export async function POST(req) {
  try {
    const body = await req.json()
    const restaurante_id = texto(body.restaurante_id, 80)
    const tipo = texto(body.tipo, 20)

    if (!restaurante_id || !tipo) {
      return Response.json({ error: 'restaurante_id y tipo son obligatorios' }, { status: 400 })
    }
    if (!['inicial', 'periodico'].includes(tipo)) {
      return Response.json({ error: 'tipo debe ser inicial o periodico' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    // Verificar que no haya borrador activo
    const { data: existente } = await supabaseAdmin
      .from('conteos_inventario')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .eq('estado', 'borrador')
      .single()

    if (existente) {
      return Response.json({ error: 'Ya hay un conteo en borrador', conteo_id: existente.id }, { status: 409 })
    }

    // Verificar que si tipo=inicial, control_stock_desde sea NULL
    if (tipo === 'inicial') {
      const { data: settings } = await supabaseAdmin
        .from('restaurant_economic_settings')
        .select('control_stock_desde')
        .eq('restaurante_id', restaurante_id)
        .single()
      if (settings?.control_stock_desde) {
        return Response.json(
          { error: 'El conteo inicial ya fue realizado. Usa tipo=periodico.' },
          { status: 409 }
        )
      }
    }

    // Snapshot de vinos activos: stock_teorico = vinos.stock actual
    const { data: vinos, error: vinosError } = await supabaseAdmin
      .from('vinos')
      .select('id, stock, coste_medio_pmp, coste_compra')
      .eq('restaurante_id', restaurante_id)
      .eq('activo', true)
      .order('nombre')

    if (vinosError) return Response.json({ error: vinosError.message }, { status: 500 })

    // Crear conteo
    const { data: conteo, error: conteoError } = await supabaseAdmin
      .from('conteos_inventario')
      .insert({ restaurante_id, tipo })
      .select()
      .single()

    if (conteoError) return Response.json({ error: conteoError.message }, { status: 500 })

    // Insertar líneas (una por vino activo)
    if (vinos && vinos.length > 0) {
      const lineas = vinos.map(v => ({
        conteo_id:               conteo.id,
        restaurante_id,
        vino_id:                 v.id,
        // stock_nuevo - stock_anterior ≡ vinos.stock cuando se toma el snapshot
        stock_teorico:           Math.max(0, Number(v.stock) || 0),
        coste_unitario_snapshot: v.coste_medio_pmp ?? v.coste_compra ?? null,
      }))

      const { error: lineasError } = await supabaseAdmin
        .from('conteos_inventario_lineas')
        .insert(lineas)

      if (lineasError) {
        // Limpiar el conteo huérfano
        await supabaseAdmin.from('conteos_inventario').delete().eq('id', conteo.id)
        return Response.json({ error: lineasError.message }, { status: 500 })
      }
    }

    return Response.json({ conteo, vinos_total: vinos?.length ?? 0 }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
