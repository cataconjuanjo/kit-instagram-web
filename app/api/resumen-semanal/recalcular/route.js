import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { finalizarAutomationRun, iniciarAutomationRun } from '../../../lib/automationRunLog'
import { enviarResumenSemanalEmail } from '../../../lib/weeklySummaryDelivery'
import {
  actualizarEntregaResumen,
  calcularYGuardarResumenSemanal,
  leerPreferenciasResumen,
  resolverPeriodo,
} from '../shared'

function autorizarCron(req) {
  const secret = process.env.RESUMEN_SEMANAL_CRON_SECRET || process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET
  if (!secret) return { error: 'Secreto de cron no configurado.', status: 503 }

  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  const headerToken = req.headers.get('x-cron-secret') || ''
  if (token === secret || headerToken === secret) return { ok: true }

  return { error: 'No autorizado.', status: 401 }
}

async function cargarRestaurantes(restauranteId) {
  let query = supabaseAdmin
    .from('restaurantes')
    .select('*')
    .order('created_at', { ascending: false })

  if (restauranteId) query = query.eq('id', restauranteId)
  else query = query.not('email', 'is', null)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

function boolParam(searchParams, ...nombres) {
  return nombres.some(nombre => ['1', 'true', 'si', 'yes'].includes(String(searchParams.get(nombre) || '').toLowerCase()))
}

function partesRutinaLocal(preferencias, fecha = new Date()) {
  const timeZone = preferencias?.timezone || 'Europe/Madrid'
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  const partes = Object.fromEntries(formatter.formatToParts(fecha).map(part => [part.type, part.value]))
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    day: dias[partes.weekday] ?? 1,
    hour: Number(partes.hour || 0) % 24,
    timezone: timeZone,
  }
}

function debeEnviarPorRutina(preferencias, fecha = new Date(), opciones = {}) {
  try {
    const local = partesRutinaLocal(preferencias, fecha)
    const diaCorrecto = Number(preferencias?.send_day) === local.day
    const horaCorrecta = Number(preferencias?.send_hour) === local.hour
    return {
      ok: diaCorrecto && (opciones.ignorarHora || horaCorrecta),
      local,
    }
  } catch {
    const fallback = partesRutinaLocal({ ...preferencias, timezone: 'Europe/Madrid' }, fecha)
    const diaCorrecto = Number(preferencias?.send_day) === fallback.day
    const horaCorrecta = Number(preferencias?.send_hour) === fallback.hour
    return {
      ok: diaCorrecto && (opciones.ignorarHora || horaCorrecta),
      local: fallback,
    }
  }
}

export async function GET(req) {
  let runLog = null
  try {
    const auth = autorizarCron(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const periodo = resolverPeriodo(searchParams)
    const restauranteId = searchParams.get('restaurante_id')
    const enviar = boolParam(searchParams, 'enviar', 'send')
    const forzarEnvio = boolParam(searchParams, 'forzar_envio', 'force_send')
    const respetarRutina = boolParam(searchParams, 'respetar_rutina', 'respect_schedule')
    const modoDiario = boolParam(searchParams, 'modo_diario', 'daily_mode')
    const restaurantes = await cargarRestaurantes(restauranteId)
    const resultados = []
    const errores = []
    runLog = await iniciarAutomationRun({
      supabase: supabaseAdmin,
      jobKey: 'resumen_semanal_recalcular',
      jobType: enviar ? 'cron' : 'api',
      triggerSource: 'api.resumen-semanal.recalcular',
      restauranteId: restauranteId || null,
      idempotencyKey: [
        periodo.periodoInicio,
        periodo.periodoFin,
        restauranteId || 'all',
        enviar ? 'send' : 'save',
        respetarRutina ? 'schedule' : 'free',
        modoDiario ? 'daily' : 'hourly',
      ].join('|'),
      metrics: {
        enviar,
        forzar_envio: forzarEnvio,
        respetar_rutina: respetarRutina,
        modo_diario: modoDiario,
        restaurantes: restaurantes.length,
      },
    })

    for (const restaurante of restaurantes) {
      try {
        let prefs = null
        const migrationPending = []

        if (enviar) {
          prefs = await leerPreferenciasResumen(restaurante)
          if (prefs.pending) migrationPending.push(prefs.pending)
          const ventana = debeEnviarPorRutina(prefs.preferencias, new Date(), { ignorarHora: modoDiario })
          if (respetarRutina && !forzarEnvio && !ventana.ok) {
            resultados.push({
              restaurante_id: restaurante.id,
              restaurante: restaurante.nombre,
              guardado: false,
              envio: 'fuera_de_rutina',
              envio_omitido: true,
              rutina_local: ventana.local,
              migration_pending: migrationPending,
            })
            continue
          }
        }

        const resultado = await calcularYGuardarResumenSemanal({
          restaurante,
          periodo,
          user: { id: null, email: 'cron@carta-viva' },
        })
        migrationPending.push(...resultado.migrationPending)
        let delivery = null
        const yaEnviado = Boolean(resultado.resumen?.delivery?.sent_at || resultado.resumen?.persistencia?.sent_at)

        if (enviar && (!yaEnviado || forzarEnvio) && !migrationPending.includes('weekly_executive_summaries')) {
          prefs = prefs || await leerPreferenciasResumen(restaurante)
          if (prefs.pending) migrationPending.push(prefs.pending)
          delivery = await enviarResumenSemanalEmail({
            resumen: resultado.resumen,
            restaurante,
            preferencias: prefs.preferencias,
          })

          if (resultado.guardado?.id) {
            const actualizada = await actualizarEntregaResumen({
              resumenId: resultado.guardado.id,
              restauranteId: restaurante.id,
              delivery,
              preferencias: prefs.preferencias,
            })
            if (actualizada.pending) migrationPending.push(actualizada.pending)
          }
        } else if (enviar && yaEnviado && !forzarEnvio) {
          delivery = {
            delivery_status: 'sent',
            channel: resultado.resumen?.delivery?.channel || resultado.resumen?.persistencia?.sent_channel || null,
            recipient_email: resultado.resumen?.delivery?.recipient_email || null,
            sent_at: resultado.resumen?.delivery?.sent_at || resultado.resumen?.persistencia?.sent_at || null,
            skipped: true,
            reason: 'Resumen ya enviado para el periodo',
          }
        }

        resultados.push({
          restaurante_id: restaurante.id,
          restaurante: restaurante.nombre,
          guardado: Boolean(resultado.guardado),
          envio: delivery?.delivery_status || (enviar ? 'pendiente' : 'no_solicitado'),
          envio_omitido: Boolean(delivery?.skipped),
          beneficio_bruto: resultado.resumen?.kpis?.beneficio_bruto || 0,
          recuperable_semana: resultado.resumen?.kpis?.recuperable_semana || 0,
          decisiones: resultado.resumen?.decisiones?.length || 0,
          migration_pending: migrationPending,
        })
      } catch (error) {
        errores.push({
          restaurante_id: restaurante.id,
          restaurante: restaurante.nombre,
          error: error.message || 'No se pudo recalcular.',
        })
      }
    }

    const omitidos = resultados.filter(item => item.envio_omitido).length
    const status = errores.length ? (resultados.length ? 'partial' : 'failed') : 'success'
    await finalizarAutomationRun(runLog, {
      supabase: supabaseAdmin,
      status,
      processedCount: restaurantes.length,
      successCount: resultados.length,
      errorCount: errores.length,
      skippedCount: omitidos,
      metrics: {
        enviar,
        respetar_rutina: respetarRutina,
        modo_diario: modoDiario,
        guardados: resultados.filter(item => item.guardado).length,
        enviados: resultados.filter(item => item.envio === 'sent').length,
        omitidos,
        beneficio_bruto: resultados.reduce((sum, item) => sum + (Number(item.beneficio_bruto) || 0), 0),
        recuperable_semana: resultados.reduce((sum, item) => sum + (Number(item.recuperable_semana) || 0), 0),
      },
    })

    return Response.json({
      ok: errores.length === 0,
      periodo: {
        inicio: periodo.periodoInicio,
        fin: periodo.periodoFin,
        dias: periodo.dias,
      },
      enviar,
      respetar_rutina: respetarRutina,
      modo_diario: modoDiario,
      procesados: resultados.length,
      errores,
      resultados,
    })
  } catch (error) {
    console.error('[resumen-semanal/recalcular] GET:', error)
    await finalizarAutomationRun(runLog, {
      supabase: supabaseAdmin,
      status: 'failed',
      errorCount: 1,
      errorMessage: error.message || 'No se pudo recalcular el resumen semanal.',
    })
    return Response.json({ error: 'No se pudo recalcular el resumen semanal.' }, { status: 500 })
  }
}

export const POST = GET
