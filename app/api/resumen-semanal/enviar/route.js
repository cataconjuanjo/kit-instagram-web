import { enviarResumenSemanalEmail } from '../../../lib/weeklySummaryDelivery'
import {
  actualizarEntregaResumen,
  calcularYGuardarResumenSemanal,
  filaAResumenGuardado,
  leerPreferenciasResumen,
  resolverPeriodo,
  resolverRestaurante,
} from '../shared'

function combinarResumenGuardado(fila, base, migrationPending) {
  if (!fila) {
    return {
      ...base,
      metadata: {
        ...(base?.metadata || {}),
        migration_pending: migrationPending,
      },
    }
  }

  const guardado = filaAResumenGuardado(fila)
  return {
    ...guardado,
    comparacion: base?.comparacion || guardado.comparacion || null,
    historico: base?.historico || guardado.historico || [],
    metadata: {
      ...(guardado.metadata || {}),
      migration_pending: migrationPending,
    },
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
    const migrationPending = [...resultado.migrationPending]

    if (migrationPending.includes('weekly_executive_summaries')) {
      return Response.json({
        error: 'Migracion de resumen semanal pendiente.',
        resumen: resultado.resumen,
        migration_pending: migrationPending,
      }, { status: 409 })
    }

    const prefs = await leerPreferenciasResumen(acceso.restaurante)
    if (prefs.pending) migrationPending.push(prefs.pending)

    const delivery = await enviarResumenSemanalEmail({
      resumen: resultado.resumen,
      restaurante: acceso.restaurante,
      preferencias: prefs.preferencias,
    })

    let filaActualizada = null
    if (resultado.guardado?.id) {
      const actualizada = await actualizarEntregaResumen({
        resumenId: resultado.guardado.id,
        restauranteId: acceso.restaurante.id,
        delivery,
        preferencias: prefs.preferencias,
      })
      if (actualizada.pending) migrationPending.push(actualizada.pending)
      filaActualizada = actualizada.data
    }

    const resumen = combinarResumenGuardado(filaActualizada, {
      ...resultado.resumen,
      delivery: {
        ...(resultado.resumen.delivery || {}),
        ...delivery,
        status: delivery.delivery_status,
        preferencias: prefs.preferencias,
      },
    }, migrationPending)

    return Response.json({
      resumen,
      delivery,
      migration_pending: migrationPending,
    })
  } catch (error) {
    console.error('[resumen-semanal/enviar] POST:', error)
    return Response.json({ error: 'No se pudo enviar el resumen semanal.' }, { status: 500 })
  }
}
