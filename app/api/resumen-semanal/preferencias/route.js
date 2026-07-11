import {
  guardarPreferenciasResumen,
  leerPreferenciasResumen,
  resolverRestaurante,
} from '../shared'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    const acceso = await resolverRestaurante(req, restauranteId)
    if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })

    const resultado = await leerPreferenciasResumen(acceso.restaurante)
    return Response.json({
      preferencias: resultado.preferencias,
      guardada: resultado.guardada,
      migration_pending: resultado.pending ? [resultado.pending] : [],
    })
  } catch (error) {
    console.error('[resumen-semanal/preferencias] GET:', error)
    return Response.json({ error: 'No se pudo cargar la rutina semanal.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url)
    const body = await req.json().catch(() => ({}))
    const restauranteId = body.restaurante_id || searchParams.get('restaurante_id')
    const acceso = await resolverRestaurante(req, restauranteId)
    if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })

    const resultado = await guardarPreferenciasResumen({
      restaurante: acceso.restaurante,
      preferencias: body,
    })

    if (resultado.pending) {
      return Response.json({
        error: 'Migracion de rutina semanal pendiente.',
        preferencias: resultado.preferencias,
        migration_pending: [resultado.pending],
      }, { status: 409 })
    }

    return Response.json({
      preferencias: resultado.preferencias,
      guardada: Boolean(resultado.data),
      migration_pending: [],
    })
  } catch (error) {
    console.error('[resumen-semanal/preferencias] POST:', error)
    return Response.json({ error: 'No se pudo guardar la rutina semanal.' }, { status: 500 })
  }
}
