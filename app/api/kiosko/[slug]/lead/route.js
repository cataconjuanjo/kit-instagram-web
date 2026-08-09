import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const resend = new Resend(process.env.RESEND_API_KEY)

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

function buildEmailHtml({ tiendaNombre, colorAcento, logoUrl, vinos }) {
  const acento = colorAcento || '#b5873a'
  const vinosHtml = (vinos || []).map(v => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #f0ede8;">
        <div style="font-size:15px;font-weight:600;color:#1a1a1a;margin-bottom:2px;">${v.nombre || ''}</div>
        ${v.bodega ? `<div style="font-size:13px;color:#888;margin-bottom:4px;">${v.bodega}</div>` : ''}
        ${v.descripcion ? `<div style="font-size:13px;color:#555;line-height:1.5;">${v.descripcion}</div>` : ''}
        ${v.precio_pvp ? `<div style="font-size:14px;font-weight:700;color:${acento};margin-top:6px;">${Number(v.precio_pvp).toFixed(2)} €</div>` : ''}
      </td>
    </tr>
  `).join('')

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${tiendaNombre}" style="height:40px;object-fit:contain;margin-bottom:12px;" />`
    : `<div style="font-size:22px;font-weight:700;color:${acento};">${tiendaNombre}</div>`

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f4ef;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ef;padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:${acento};padding:32px 40px;text-align:center;">
            <div style="color:#fff;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-bottom:16px;">Tu selección de vino</div>
            ${logoHtml.replace(/color:[^;]+/, 'color:#fff')}
          </td>
        </tr>

        <!-- Intro -->
        <tr>
          <td style="padding:32px 40px 8px;">
            <p style="margin:0;font-size:16px;color:#444;line-height:1.7;">
              Aquí tienes los vinos que te hemos recomendado hoy en <strong>${tiendaNombre}</strong>. Guarda este correo para consultarlos cuando quieras.
            </p>
          </td>
        </tr>

        <!-- Vinos -->
        <tr>
          <td style="padding:8px 40px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${vinosHtml || '<tr><td style="padding:20px 0;color:#888;font-size:14px;">Sin recomendaciones guardadas.</td></tr>'}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f7f4ef;padding:24px 40px;text-align:center;border-top:1px solid #ede9e1;">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
              Recibiste este email porque lo solicitaste en ${tiendaNombre}.<br>
              Si no fuiste tú, ignora este mensaje.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(request, { params }) {
  const { slug } = await params

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { email, consentimiento, source, preferencias, vinos_recomendados } = body

  if (!email || !isValidEmail(email.trim())) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }
  if (!consentimiento) {
    return NextResponse.json({ error: 'Se requiere consentimiento explícito' }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, logo_url, color_acento')
    .eq('slug', slug)
    .single()

  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const emailClean = email.toLowerCase().trim()

  // Deduplicar: mismo email en los últimos 7 días
  const desde7 = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: existing } = await supabaseAdmin
    .from('kiosko_leads')
    .select('id')
    .eq('tienda_id', tienda.id)
    .eq('email', emailClean)
    .gte('created_at', desde7)
    .is('borrado_at', null)
    .limit(1)

  if (existing?.length) {
    // Lead ya existe pero mandamos el email igualmente
    await enviarSeleccion({ email: emailClean, tienda, vinos: vinos_recomendados })
    return NextResponse.json({ ok: true, duplicado: true })
  }

  const { error } = await supabaseAdmin.from('kiosko_leads').insert({
    tienda_id:          tienda.id,
    email:              emailClean,
    source:             source || 'kiosko',
    preferencias:       preferencias || null,
    vinos_recomendados: vinos_recomendados || null,
    consentimiento_at:  new Date().toISOString(),
  })

  if (error) {
    console.error('[kiosko-lead]', error.message)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }

  await enviarSeleccion({ email: emailClean, tienda, vinos: vinos_recomendados })

  return NextResponse.json({ ok: true })
}

async function enviarSeleccion({ email, tienda, vinos }) {
  try {
    const html = buildEmailHtml({
      tiendaNombre: tienda.nombre,
      colorAcento:  tienda.color_acento,
      logoUrl:      tienda.logo_url,
      vinos:        vinos || [],
    })
    await resend.emails.send({
      from:    'Kiosko Vinos <kiosko@cataconjuanjo.com>',
      to:      email,
      subject: `Tu selección de vino en ${tienda.nombre}`,
      html,
    })
  } catch (e) {
    console.error('[kiosko-lead] Error enviando email:', e.message)
    // No bloqueamos la respuesta si el email falla
  }
}
