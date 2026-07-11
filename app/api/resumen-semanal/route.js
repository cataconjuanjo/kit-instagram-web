import {
  calcularResumenSemanal,
  calcularYGuardarResumenSemanal,
  resolverPeriodo,
  resolverRestaurante,
} from './shared'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    const periodo = resolverPeriodo(searchParams)
    const acceso = await resolverRestaurante(req, restauranteId)
    if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })

    const resultado = await calcularResumenSemanal({
      restaurante: acceso.restaurante,
      periodo,
      user: acceso.user,
    })

    return Response.json({
      resumen: resultado.resumen,
      anterior: resultado.anterior,
      migration_pending: resultado.migrationPending,
    })
  } catch (error) {
    console.error('[resumen-semanal] GET:', error)
    return Response.json({ error: 'No se pudo generar el resumen semanal.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url)
    const body = await req.json().catch(() => ({}))
    const restauranteId = body.restaurante_id || searchParams.get('restaurante_id')
    const periodo = resolverPeriodo(searchParams)
    const acceso = await resolverRestaurante(req, restauranteId)
    if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })

    const resultado = await calcularYGuardarResumenSemanal({
      restaurante: acceso.restaurante,
      periodo,
      user: acceso.user,
    })

    if (resultado.migrationPending.includes('weekly_executive_summaries')) {
      return Response.json({
        error: 'Migracion de resumen semanal pendiente.',
        resumen: resultado.resumen,
        migration_pending: resultado.migrationPending,
      }, { status: 409 })
    }

    return Response.json({
      resumen: resultado.resumen,
      guardado: Boolean(resultado.guardado),
      migration_pending: resultado.migrationPending,
    })
  } catch (error) {
    console.error('[resumen-semanal] POST:', error)
    return Response.json({ error: 'No se pudo guardar el resumen semanal.' }, { status: 500 })
  }
}
