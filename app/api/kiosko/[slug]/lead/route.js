import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createHash } from 'crypto'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { checkRateLimit } from '../../../../lib/security'

const resend = new Resend(process.env.RESEND_API_KEY)
const IP_RATE_LIMIT = 12
const EMAIL_RATE_LIMIT = 3
const RATE_WINDOW_MS = 60 * 60 * 1000

const TIPO_COLOR = {
  tinto:        '#8B1A1A',
  blanco:       '#B8973A',
  rosado:       '#C4556A',
  espumoso:     '#5A9AB5',
  generoso:     '#B47C3C',
  dulce:        '#A0467A',
  naranja:      '#C4843C',
  sin_alcohol:  '#4A8C4A',
}
const TIPO_LABEL = {
  tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso',
  generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol',
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

function requestIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

function hashIdentifier(value) {
  const pepper = process.env.LOGIN_RATE_LIMIT_PEPPER ||
    process.env.SALA_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'carta-viva-kiosko-lead-rate-limit'

  return createHash('sha256')
    .update(`${pepper}:${value}`)
    .digest('hex')
}

function buildEmailHtml({ tiendaNombre, colorAcento, logoUrl, vinos, unsubscribeUrl }) {
  const acento = colorAcento || '#b5873a'

  const soloVinos  = (vinos || []).filter(v => v._seccion !== 'gourmet')
  const soloGourmet = (vinos || []).filter(v => v._seccion === 'gourmet')

  const vinosHtml = soloVinos.map(v => {
    const tipoColor = TIPO_COLOR[v.tipo] || acento
    const tipoLabel = TIPO_LABEL[v.tipo] || ''
    const precio = v.precio_pvp ? `${Number(v.precio_pvp).toFixed(2).replace('.', ',')} €` : ''

    return `
    <tr>
      <td style="padding:20px 0;border-bottom:1px solid #ede9e1;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;">
              ${tipoLabel ? `<span style="display:inline-block;background:${tipoColor};color:#fff;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:3px 9px;border-radius:20px;">${tipoLabel}</span>` : ''}
            </td>
            ${precio ? `<td align="right" style="vertical-align:middle;font-family:Arial,sans-serif;font-size:17px;font-weight:700;color:${acento};white-space:nowrap;">${precio}</td>` : ''}
          </tr>
        </table>
        <div style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#1a1a1a;margin-top:10px;line-height:1.3;">${v.nombre || ''}</div>
        ${v.bodega ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:.5px;">${v.bodega}</div>` : ''}
        ${v.descripcion ? `<div style="font-family:Arial,sans-serif;font-size:13px;color:#555;line-height:1.65;margin-top:8px;">${v.descripcion}</div>` : ''}
      </td>
    </tr>`
  }).join('')

  const gourmetHtml = soloGourmet.length ? `
    <tr>
      <td style="padding:28px 0 8px;">
        <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#bbb;">Para acompañar</div>
      </td>
    </tr>
    ${soloGourmet.map(g => {
      const precio = g.precio_pvp ? `${Number(g.precio_pvp).toFixed(2).replace('.', ',')} €` : ''
      return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #ede9e1;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;">
              <div style="font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#1a1a1a;">${g.nombre || ''}</div>
              ${g._razon ? `<div style="font-family:Arial,sans-serif;font-size:12px;color:#888;margin-top:2px;line-height:1.5;">${g._razon}</div>` : ''}
            </td>
            ${precio ? `<td align="right" style="vertical-align:top;white-space:nowrap;padding-left:12px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:${acento};">${precio}</td>` : ''}
          </tr>
        </table>
      </td>
    </tr>`}).join('')}` : ''

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${tiendaNombre}" style="max-height:44px;max-width:160px;object-fit:contain;" />`
    : `<div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#fff;letter-spacing:.5px;">${tiendaNombre}</div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Tu selección de vino · ${tiendaNombre}</title>
</head>
<body style="margin:0;padding:0;background:#f0ece4;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ece4;padding:48px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:${acento};border-radius:16px 16px 0 0;padding:40px 48px;text-align:center;">
            <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.65);margin-bottom:20px;">Tu selección de vino</div>
            ${logoHtml}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:40px 48px 0;">
            <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:20px;color:#1a1a1a;line-height:1.4;">
              Aquí tienes tu selección de hoy
            </p>
            <p style="margin:0 0 32px;font-family:Arial,sans-serif;font-size:14px;color:#888;line-height:1.6;">
              Guarda este correo para consultarlo cuando estés en casa.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0">
              ${vinosHtml || `<tr><td style="padding:20px 0;font-family:Arial,sans-serif;font-size:14px;color:#aaa;">Sin vinos guardados.</td></tr>`}
              ${gourmetHtml}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#fff;padding:32px 48px 40px;text-align:center;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#aaa;line-height:1.7;">
              Estos vinos están disponibles en <strong style="color:#888;">${tiendaNombre}</strong>.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#e8e3d8;border-radius:0 0 16px 16px;padding:24px 48px;text-align:center;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#aaa;line-height:1.8;">
              Recibiste este email porque lo solicitaste en ${tiendaNombre}.<br>
              <a href="${unsubscribeUrl}" style="color:#aaa;text-decoration:underline;">Cancelar suscripción</a>
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
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`
  const ip = requestIp(request)

  const ipAllowed = await checkRateLimit(`${slug}:${ip}`, 'kiosko-lead-ip', {
    max: IP_RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  })
  if (!ipAllowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Espera unos minutos.' }, { status: 429 })
  }

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
  const emailAllowed = await checkRateLimit(`${slug}:acct:${hashIdentifier(emailClean)}`, 'kiosko-lead-email', {
    max: EMAIL_RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  })
  if (!emailAllowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes para este email. Espera unos minutos.' }, { status: 429 })
  }

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
    await enviarSeleccion({ email: emailClean, tienda, vinos: vinos_recomendados, leadId: existing[0].id, baseUrl })
    return NextResponse.json({ ok: true, duplicado: true })
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('kiosko_leads')
    .insert({
      tienda_id:          tienda.id,
      email:              emailClean,
      source:             source || 'kiosko',
      preferencias:       preferencias || null,
      vinos_recomendados: vinos_recomendados || null,
      consentimiento_at:  new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[kiosko-lead]', error.message)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }

  await enviarSeleccion({ email: emailClean, tienda, vinos: vinos_recomendados, leadId: inserted.id, baseUrl })

  return NextResponse.json({ ok: true })
}

async function enviarSeleccion({ email, tienda, vinos, leadId, baseUrl }) {
  try {
    const unsubscribeUrl = `${baseUrl}/api/kiosko/lead/unsubscribe?id=${leadId}`
    const html = buildEmailHtml({
      tiendaNombre: tienda.nombre,
      colorAcento:  tienda.color_acento,
      logoUrl:      tienda.logo_url,
      vinos:        vinos || [],
      unsubscribeUrl,
    })
    await resend.emails.send({
      from:    'Kiosko Vinos <kiosko@cataconjuanjo.com>',
      to:      email,
      subject: `Tu selección de vino en ${tienda.nombre}`,
      html,
    })
  } catch (e) {
    console.error('[kiosko-lead] Error enviando email:', e.message)
  }
}
