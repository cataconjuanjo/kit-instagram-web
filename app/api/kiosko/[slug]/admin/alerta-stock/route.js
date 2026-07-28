import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = 'Kiosko Vinos <kiosko@cataconjuanjo.com>'

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug, {
    select: 'id, nombre, logo_url, informe_email, slug, propietario_email, email',
  })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tienda = access.tienda

  if (!tienda || !tienda.informe_email) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const { vino_nombre, stock_nuevo } = body || {}
  if (!vino_nombre || stock_nuevo == null) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  const base     = process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.VERCEL_URL}`
  const adminUrl = `${base}/kiosko-admin/${tienda.slug}`
  const critico  = Number(stock_nuevo) === 0

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3f0;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1a1a2e">
<div style="max-width:480px;margin:0 auto;padding:24px 16px">
  <div style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:16px 20px;display:flex;align-items:center;gap:10px">
    ${tienda.logo_url ? `<img src="${tienda.logo_url}" alt="" style="height:32px;object-fit:contain;border-radius:4px">` : '<span style="font-size:1.5rem">🍷</span>'}
    <div>
      <p style="margin:0;font-size:.9rem;font-weight:800;color:#c9a96e">${tienda.nombre}</p>
      <p style="margin:2px 0 0;font-size:.68rem;color:rgba(240,237,232,.45)">Alerta de stock</p>
    </div>
  </div>
  <div style="background:#fff;padding:20px 22px">
    <div style="background:${critico ? '#fef2f2' : '#fff8f0'};border:1.5px solid ${critico ? '#fca5a5' : '#f5c06a'};border-radius:8px;padding:14px 16px;margin-bottom:18px">
      <p style="margin:0 0 6px;font-size:.9rem;font-weight:700;color:${critico ? '#991b1b' : '#92400e'}">${critico ? '🔴 Sin stock' : '🟡 Stock bajo'}</p>
      <p style="margin:0;font-size:.95rem;font-weight:600">${vino_nombre}</p>
      <p style="margin:4px 0 0;font-size:.82rem;color:#666">${critico ? 'Este vino se ha agotado.' : `Quedan ${stock_nuevo} unidad${Number(stock_nuevo) !== 1 ? 'es' : ''}.`}</p>
    </div>
    <div style="text-align:center">
      <a href="${adminUrl}" style="display:inline-block;background:#c9a96e;color:#1a1a2e;font-weight:700;font-size:.85rem;padding:10px 24px;border-radius:8px;text-decoration:none">Gestionar stock →</a>
    </div>
  </div>
  <div style="background:#1a1a2e;border-radius:0 0 12px 12px;padding:10px 20px;text-align:center">
    <p style="margin:0;font-size:.65rem;color:rgba(240,237,232,.3)">Kiosko Vinos · ${tienda.nombre}</p>
  </div>
</div>
</body></html>`

  try {
    await resend.emails.send({
      from: FROM,
      to: tienda.informe_email,
      subject: `${critico ? '🔴 Sin stock' : '🟡 Stock bajo'}: ${vino_nombre} — ${tienda.nombre}`,
      html,
    })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
