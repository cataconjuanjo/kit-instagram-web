import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const ESTADOS = new Set(['borrador', 'propuesto', 'aplicado', 'descartado'])
const CONFIANZAS = new Set(['alta', 'media', 'baja'])
const FORMULA_VERSION = 'profit-simulator-v1'

function texto(valor, limite = 500) {
  return String(valor || '').trim().slice(0, limite)
}

function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

function confianza(valor) {
  return CONFIANZAS.has(valor) ? valor : 'media'
}

function estado(valor) {
  return ESTADOS.has(valor) ? valor : 'borrador'
}

function limpiarItem(item = {}, restauranteId) {
  return {
    restaurante_id: restauranteId,
    vino_id: item.vino_id || null,
    tipo: texto(item.tipo, 80) || 'escenario',
    titulo: texto(item.titulo, 220) || 'Accion simulada',
    detalle: texto(item.detalle, 900),
    accion: texto(item.accion, 900) || 'Revisar antes de aplicar.',
    href: texto(item.href, 240) || '/dashboard/simulador',
    formula_version: FORMULA_VERSION,
    input: item.input && typeof item.input === 'object' ? item.input : {},
    impacto_margen: numero(item.impacto_margen ?? item.impactoAnual),
    impacto_capital: numero(item.impacto_capital ?? item.impactoCapital),
    impacto_stock: numero(item.impacto_stock ?? item.impactoStock),
    impacto_ticket: numero(item.impacto_ticket ?? item.impactoTicket),
    confianza: confianza(item.confianza),
    estado: estado(item.estado || 'propuesto'),
  }
}

async function cargarEscenarios(restauranteId) {
  const { data, error } = await supabaseAdmin
    .from('profit_scenarios')
    .select('*, items:profit_scenario_items(*)')
    .eq('restaurante_id', restauranteId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return data || []
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const escenarios = await cargarEscenarios(restauranteId)
    return Response.json({ escenarios })
  } catch (error) {
    if (esTablaNoExiste(error)) {
      return Response.json({ error: 'La base de datos aun no permite guardar escenarios.' }, { status: 409 })
    }
    console.error('[profit-scenarios] GET:', error)
    return Response.json({ error: 'No se pudieron cargar los escenarios.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const items = Array.isArray(body.items)
      ? body.items.map(item => limpiarItem(item, restauranteId)).slice(0, 30)
      : []
    if (!items.length) {
      return Response.json({ error: 'El escenario necesita al menos una accion.' }, { status: 400 })
    }

    const escenario = {
      restaurante_id: restauranteId,
      nombre: texto(body.nombre, 180) || 'Escenario de rentabilidad',
      descripcion: texto(body.descripcion, 900),
      formula_version: FORMULA_VERSION,
      input: body.input && typeof body.input === 'object' ? body.input : {},
      impacto_margen: numero(body.impacto_margen ?? body.impactoAnual),
      impacto_capital: numero(body.impacto_capital ?? body.impactoCapital),
      impacto_stock: numero(body.impacto_stock ?? body.impactoStock),
      impacto_ticket: numero(body.impacto_ticket ?? body.impactoTicket),
      confianza: confianza(body.confianza),
      estado: estado(body.estado || 'propuesto'),
    }

    const { data: creado, error } = await supabaseAdmin
      .from('profit_scenarios')
      .insert(escenario)
      .select('*')
      .single()
    if (error) throw error

    const { error: itemsError } = await supabaseAdmin
      .from('profit_scenario_items')
      .insert(items.map(item => ({ ...item, scenario_id: creado.id, estado: escenario.estado })))
    if (itemsError) throw itemsError

    const escenarios = await cargarEscenarios(restauranteId)
    return Response.json({ escenario: creado, escenarios })
  } catch (error) {
    if (esTablaNoExiste(error)) {
      return Response.json({ error: 'La base de datos aun no permite guardar escenarios.' }, { status: 409 })
    }
    console.error('[profit-scenarios] POST:', error)
    return Response.json({ error: 'No se pudo guardar el escenario.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const id = texto(body.id, 80)
    const siguienteEstado = estado(body.estado)
    if (!id || !restauranteId || !ESTADOS.has(siguienteEstado)) {
      return Response.json({ error: 'id, restaurante_id y estado valido son obligatorios.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const now = new Date().toISOString()
    const update = {
      estado: siguienteEstado,
      updated_at: now,
      applied_at: siguienteEstado === 'aplicado' ? now : null,
      discarded_at: siguienteEstado === 'descartado' ? now : null,
    }

    const { data, error } = await supabaseAdmin
      .from('profit_scenarios')
      .update(update)
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
      .select('*')
      .single()
    if (error) throw error

    await supabaseAdmin
      .from('profit_scenario_items')
      .update({ estado: siguienteEstado, updated_at: now })
      .eq('scenario_id', id)
      .eq('restaurante_id', restauranteId)

    const escenarios = await cargarEscenarios(restauranteId)
    return Response.json({ escenario: data, escenarios })
  } catch (error) {
    if (esTablaNoExiste(error)) {
      return Response.json({ error: 'La base de datos aun no permite guardar escenarios.' }, { status: 409 })
    }
    console.error('[profit-scenarios] PATCH:', error)
    return Response.json({ error: 'No se pudo actualizar el escenario.' }, { status: 500 })
  }
}
