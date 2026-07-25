import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Kiosko Vinos <kiosko@cataconjuanjo.com>'

export async function GET(request) {
  const auth = request.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: tiendas } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, slug, logo_url, informe_email')
    .not('informe_email', 'is', null)
    .neq('informe_email', '')
    .eq('activo', true)

  if (!tiendas?.length) return NextResponse.json({ ok: true, enviados: 0 })

  const resultados = []
  for (const tienda of tiendas) {
    try {
      const datos = await obtenerDatos(tienda.id)
      if (!datos.vacio) await enviarEmail(tienda, datos)
      resultados.push({ slug: tienda.slug, ok: true, vacio: datos.vacio })
    } catch (e) {
      resultados.push({ slug: tienda.slug, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, resultados })
}

async function obtenerDatos(tiendaId) {
  const desde7  = new Date(Date.now() -  7 * 86400000).toISOString()
  const desde14 = new Date(Date.now() - 14 * 86400000).toISOString()
  const desde30 = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data: searches } = await supabaseAdmin
    .from('kiosko_searches')
    .select('consulta, mode, vinos_ids, vinos_nombres, created_at')
    .eq('tienda_id', tiendaId)
    .gte('created_at', desde30)
    .order('created_at', { ascending: false })

  if (!searches?.length) return { vacio: true }

  const semanaActual   = searches.filter(s => s.created_at >= desde7).length
  const semanaAnterior = searches.filter(s => s.created_at >= desde14 && s.created_at < desde7).length

  const consultaCount = {}
  searches.forEach(s => {
    const k = s.consulta.toLowerCase().trim()
    consultaCount[k] = (consultaCount[k] || 0) + 1
  })
  const topConsultas = Object.entries(consultaCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([consulta, veces]) => ({ consulta, veces }))

  const vinoCount = {}
  searches.forEach(s => {
    (s.vinos_ids || []).forEach((id, i) => {
      if (!vinoCount[id]) vinoCount[id] = { nombre: s.vinos_nombres?.[i] || id, veces: 0 }
      vinoCount[id].veces++
    })
  })
  const topVinos = Object.entries(vinoCount)
    .sort((a, b) => b[1].veces - a[1].veces).slice(0, 3)
    .map(([id, { nombre, veces }]) => ({ id, nombre, veces }))

  const topVinoIds = new Set(topVinos.map(v => v.id))
  const { data: vinosStock } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, stock')
    .eq('tienda_id', tiendaId)
    .eq('activo', true)
    .lte('stock', 5)

  const alertas = (vinosStock || [])
    .filter(v => topVinoIds.has(String(v.id)))
    .map(v => ({ nombre: v.nombre, stock: Number(v.stock) }))

  return { vacio: false, semanaActual, semanaAnterior, topConsultas, topVinos, alertas, totalMes: searches.length }
}

function deltaTexto(actual, anterior) {
  if (!anterior) return ''
  const d = actual - anterior
  if (d > 0) return `↑ ${d} más que la semana pasada`
  if (d < 0) return `↓ ${Math.abs(d)} menos que la semana pasada`
  return 'igual que la semana pasada'
}

async function enviarEmail(tienda, datos) {
  const base     = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://cataconjuanjo.com')
  const adminUrl = `${base}/kiosko-admin/${tienda.slug}`
  const semana   = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  const color    = datos.semanaActual >= datos.semanaAnterior ? '#3a8a3a' : '#c44'

  const filaLista = (items, campo) => items.map((it, i) => `
    <tr>
      <td style="width:20px;font-size:.72rem;font-weight:700;color:#c9a96e;vertical-align:middle">${i + 1}</td>
      <td style="font-size:.85rem;padding:7px 0;border-bottom:1px solid #f0ede8;vertical-align:middle">${it[campo]}</td>
      <td style="white-space:nowrap;font-size:.73rem;color:#999;background:#f0ede8;border-radius:20px;padding:2px 8px;vertical-align:middle">${it.veces}×</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3f0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1a1a2e">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">

  <div style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:18px 22px;display:flex;align-items:center;gap:12px">
    ${tienda.logo_url ? `<img src="${tienda.logo_url}" alt="" style="height:38px;object-fit:contain;border-radius:4px">` : '<span style="font-size:1.7rem">🍷</span>'}
    <div>
      <p style="margin:0;font-size:.95rem;font-weight:800;color:#c9a96e">${tienda.nombre}</p>
      <p style="margin:2px 0 0;font-size:.72rem;color:rgba(240,237,232,.45)">Informe del kiosko · semana del ${semana}</p>
    </div>
  </div>

  <div style="background:#fff;padding:22px 24px">

    <table width="100%" cellpadding="0" cellspacing="12" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center;padding:14px 8px;border-right:1px solid #f0ede8">
          <p style="margin:0;font-size:2.2rem;font-weight:800;color:#1a1a2e">${datos.semanaActual}</p>
          <p style="margin:4px 0 0;font-size:.68rem;color:#999;text-transform:uppercase;letter-spacing:.06em">esta semana</p>
          ${datos.semanaAnterior > 0 ? `<p style="margin:4px 0 0;font-size:.7rem;color:${color}">${deltaTexto(datos.semanaActual, datos.semanaAnterior)}</p>` : ''}
        </td>
        <td style="text-align:center;padding:14px 8px">
          <p style="margin:0;font-size:2.2rem;font-weight:800;color:#1a1a2e">${datos.totalMes}</p>
          <p style="margin:4px 0 0;font-size:.68rem;color:#999;text-transform:uppercase;letter-spacing:.06em">últimos 30 días</p>
        </td>
      </tr>
    </table>

    ${datos.topConsultas.length ? `
    <p style="margin:0 0 6px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Qué buscaron los clientes</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px">
      ${filaLista(datos.topConsultas, 'consulta')}
    </table>` : ''}

    ${datos.topVinos.length ? `
    <p style="margin:0 0 6px;font-size:.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#aaa">Vinos más recomendados</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px">
      ${filaLista(datos.topVinos, 'nombre')}
    </table>` : ''}

    ${datos.alertas.length ? `
    <div style="background:#fff8f0;border:1.5px solid #f5c06a;border-radius:8px;padding:12px 14px;margin-bottom:18px">
      <p style="margin:0 0 6px;font-size:.82rem;font-weight:700;color:#92400e">⚠️ Stock bajo en vinos recomendados</p>
      ${datos.alertas.map(a => `<p style="margin:3px 0;font-size:.82rem">${a.stock === 0 ? '🔴' : '🟡'} ${a.nombre} — ${a.stock === 0 ? 'Sin stock' : `${a.stock} ud.`}</p>`).join('')}
    </div>` : `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:18px">
      <p style="margin:0;font-size:.82rem;color:#166534">✅ Stock OK en todos los vinos recomendados</p>
    </div>`}

    <div style="text-align:center;margin-top:8px">
      <a href="${adminUrl}" style="display:inline-block;background:#c9a96e;color:#1a1a2e;font-weight:700;font-size:.88rem;padding:11px 28px;border-radius:9px;text-decoration:none">Ver analítica completa →</a>
    </div>
  </div>

  <div style="background:#1a1a2e;border-radius:0 0 12px 12px;padding:12px 22px;text-align:center">
    <p style="margin:0;font-size:.68rem;color:rgba(240,237,232,.3)">Para dejar de recibir este informe ve a Ajustes en tu panel de admin del kiosko</p>
  </div>

</div>
</body></html>`

  await resend.emails.send({
    from: FROM,
    to: tienda.informe_email,
    subject: `Kiosko ${tienda.nombre} — informe semana ${semana}`,
    html,
  })
}
