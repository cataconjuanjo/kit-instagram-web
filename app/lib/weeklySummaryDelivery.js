import { Resend } from 'resend'

const DEFAULT_FROM = 'Carta Viva <resumen@cataconjuanjo.com>'
const DEFAULT_URL = 'https://cataconjuanjo.com'
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

function limpiarEmail(valor = '') {
  const email = String(valor || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function numeroEntero(valor, fallback, min, max) {
  const n = Number.parseInt(valor, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function escapeHtml(valor = '') {
  return String(valor || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function appUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '')
  return DEFAULT_URL
}

function listaEmails(valor = '') {
  return String(valor || '')
    .split(',')
    .map(limpiarEmail)
    .filter(Boolean)
}

export function normalizarPreferenciasResumen(preferencias = {}, restaurante = {}) {
  const channel = preferencias.channel === 'manual' ? 'manual' : 'email'
  return {
    enabled: preferencias.enabled !== false,
    channel,
    recipient_email: limpiarEmail(preferencias.recipient_email) || limpiarEmail(restaurante.email),
    cc_email: listaEmails(preferencias.cc_email).join(','),
    send_day: numeroEntero(preferencias.send_day, 1, 0, 6),
    send_hour: numeroEntero(preferencias.send_hour, 9, 0, 23),
    timezone: String(preferencias.timezone || 'Europe/Madrid').trim() || 'Europe/Madrid',
    last_sent_at: preferencias.last_sent_at || null,
    last_error: preferencias.last_error || null,
  }
}

export function proveedorEmailDisponible() {
  return Boolean(process.env.RESEND_API_KEY)
}

function kpi(resumen, campo, fallback = '0 EUR') {
  return resumen?.kpis?.[campo] || fallback
}

function decisionesTexto(resumen) {
  const decisiones = Array.isArray(resumen?.decisiones) ? resumen.decisiones.slice(0, 3) : []
  if (!decisiones.length) return ['1. Mantener briefing y revisar una oportunidad rentable.']
  return decisiones.map((item, index) => `${index + 1}. ${item.titulo}: ${item.accion}`)
}

function decisionesHtml(resumen) {
  const decisiones = Array.isArray(resumen?.decisiones) ? resumen.decisiones.slice(0, 3) : []
  if (!decisiones.length) {
    return '<li><strong>Mantener briefing</strong><br><span>Revisar una oportunidad rentable y mantener control de sala.</span></li>'
  }
  return decisiones.map(item => (
    `<li><strong>${escapeHtml(item.titulo)}</strong><br><span>${escapeHtml(item.accion || item.detalle || '')}</span></li>`
  )).join('')
}

export function construirMensajeResumenSemanal({ resumen = {}, restaurante = {}, preferencias = {} }) {
  const prefs = normalizarPreferenciasResumen(preferencias, restaurante)
  const dashboardUrl = `${appUrl()}/dashboard`
  const nombre = resumen.restaurante_nombre || restaurante.nombre || 'Restaurante'
  const subject = `Resumen semanal ${nombre}: ${kpi(resumen, 'beneficio_bruto_texto')} defendibles`
  const rutina = `${DIAS[prefs.send_day] || 'lunes'} ${String(prefs.send_hour).padStart(2, '0')}:00 ${prefs.timezone}`
  const texto = [
    `Resumen semanal - ${nombre}`,
    resumen?.rango?.label || 'Ultimos 7 dias',
    '',
    resumen.titular || 'Lectura semanal de rentabilidad de vino',
    '',
    `Ganado defendible: ${kpi(resumen, 'beneficio_bruto_texto')}`,
    `Atribuido a recomendacion: ${kpi(resumen, 'beneficio_recomendacion_texto')}`,
    `Por capturar: ${kpi(resumen, 'recuperable_semana_texto')}`,
    `Oportunidad anual: ${kpi(resumen, 'oportunidad_anual_texto')}`,
    '',
    '3 decisiones:',
    ...decisionesTexto(resumen),
    '',
    `Rutina: ${rutina}`,
    `Panel: ${dashboardUrl}`,
  ].join('\n')

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f8f3eb;color:#171416;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f3eb;padding:24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fffdf8;border:1px solid #ddd6cb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#171416;color:#fffaf3;padding:22px 24px;">
                <p style="margin:0 0 8px;color:#d8c898;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Resumen semanal</p>
                <h1 style="margin:0;font-size:24px;line-height:1.15;">${escapeHtml(resumen.titular || 'Lectura semanal de rentabilidad de vino')}</h1>
                <p style="margin:10px 0 0;color:rgba(255,250,243,.68);font-size:13px;">${escapeHtml(nombre)} - ${escapeHtml(resumen?.rango?.label || 'Ultimos 7 dias')} - confianza ${escapeHtml(resumen.confianza || 'media')}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:10px;border:1px solid #e5dfd5;border-radius:8px;"><span style="display:block;color:#74223d;font-size:11px;font-weight:700;">Ganado</span><strong style="font-size:22px;">${escapeHtml(kpi(resumen, 'beneficio_bruto_texto'))}</strong></td>
                    <td style="width:10px;"></td>
                    <td style="padding:10px;border:1px solid #e5dfd5;border-radius:8px;"><span style="display:block;color:#74223d;font-size:11px;font-weight:700;">Por capturar</span><strong style="font-size:22px;">${escapeHtml(kpi(resumen, 'recuperable_semana_texto'))}</strong></td>
                  </tr>
                  <tr><td colspan="3" style="height:10px;"></td></tr>
                  <tr>
                    <td style="padding:10px;border:1px solid #e5dfd5;border-radius:8px;"><span style="display:block;color:#74223d;font-size:11px;font-weight:700;">Recomendacion</span><strong style="font-size:18px;">${escapeHtml(kpi(resumen, 'beneficio_recomendacion_texto'))}</strong></td>
                    <td style="width:10px;"></td>
                    <td style="padding:10px;border:1px solid #e5dfd5;border-radius:8px;"><span style="display:block;color:#74223d;font-size:11px;font-weight:700;">Escenarios</span><strong style="font-size:18px;">${escapeHtml(kpi(resumen, 'oportunidad_anual_texto'))}</strong></td>
                  </tr>
                </table>
                <h2 style="margin:22px 0 10px;font-size:16px;">3 decisiones</h2>
                <ol style="margin:0 0 22px;padding-left:20px;color:#332d29;font-size:14px;line-height:1.55;">${decisionesHtml(resumen)}</ol>
                <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#171416;color:#fffaf3;text-decoration:none;border-radius:8px;padding:12px 16px;font-size:13px;font-weight:700;">Abrir panel</a>
                <p style="margin:18px 0 0;color:#7b7168;font-size:12px;">Rutina: ${escapeHtml(rutina)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, text: texto, html }
}

export async function enviarResumenSemanalEmail({ resumen = {}, restaurante = {}, preferencias = {} }) {
  const prefs = normalizarPreferenciasResumen(preferencias, restaurante)
  const now = new Date().toISOString()

  if (!prefs.enabled) {
    return {
      delivery_status: 'disabled',
      channel: prefs.channel,
      recipient_email: prefs.recipient_email || null,
      sent_at: null,
      provider_message_id: null,
      error: null,
      skipped: true,
      reason: 'Rutina desactivada',
    }
  }

  if (prefs.channel === 'manual') {
    return {
      delivery_status: 'pending',
      channel: 'manual',
      recipient_email: prefs.recipient_email || null,
      sent_at: null,
      provider_message_id: null,
      error: null,
      skipped: true,
      reason: 'Canal manual',
    }
  }

  if (!prefs.recipient_email) {
    return {
      delivery_status: 'failed',
      channel: 'email',
      recipient_email: null,
      sent_at: null,
      provider_message_id: null,
      error: 'Falta destinatario de envio.',
      skipped: true,
    }
  }

  if (!proveedorEmailDisponible()) {
    return {
      delivery_status: 'pending',
      channel: 'email',
      recipient_email: prefs.recipient_email,
      sent_at: null,
      provider_message_id: null,
      error: 'RESEND_API_KEY no configurada.',
      skipped: true,
    }
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const mensaje = construirMensajeResumenSemanal({ resumen, restaurante, preferencias: prefs })
    const cc = listaEmails(prefs.cc_email)
    const payload = {
      from: process.env.RESUMEN_SEMANAL_FROM || DEFAULT_FROM,
      to: [prefs.recipient_email],
      subject: mensaje.subject,
      text: mensaje.text,
      html: mensaje.html,
    }
    if (cc.length) payload.cc = cc

    const { data, error } = await resend.emails.send(payload)

    if (error) {
      return {
        delivery_status: 'failed',
        channel: 'email',
        recipient_email: prefs.recipient_email,
        sent_at: null,
        provider_message_id: null,
        error: error.message || 'No se pudo enviar el email.',
        skipped: false,
      }
    }

    return {
      delivery_status: 'sent',
      channel: 'email',
      recipient_email: prefs.recipient_email,
      sent_at: now,
      provider_message_id: data?.id || null,
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      delivery_status: 'failed',
      channel: 'email',
      recipient_email: prefs.recipient_email,
      sent_at: null,
      provider_message_id: null,
      error: error.message || 'No se pudo enviar el email.',
      skipped: false,
    }
  }
}
