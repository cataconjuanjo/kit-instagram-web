import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return new Response(pageHtml('Enlace inválido', 'Este enlace de baja no es válido.', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const { data: lead, error } = await supabaseAdmin
    .from('kiosko_leads')
    .select('id, email, tienda_id')
    .eq('id', id)
    .is('borrado_at', null)
    .maybeSingle()

  if (error || !lead) {
    return new Response(pageHtml('Ya estás dado de baja', 'No encontramos una suscripción activa para este enlace.', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  await supabaseAdmin
    .from('kiosko_leads')
    .update({ borrado_at: new Date().toISOString(), email: '[dado de baja]' })
    .eq('id', id)

  return new Response(pageHtml('Baja confirmada', 'Has cancelado tu suscripción. No recibirás más comunicaciones de esta tienda.', true), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function pageHtml(titulo, mensaje, ok) {
  const color = ok ? '#b5873a' : '#888'
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${titulo}</title>
  <style>
    body { margin:0; padding:0; background:#f7f4ef; font-family:Georgia,serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#fff; border-radius:16px; padding:48px 40px; max-width:440px; text-align:center; box-shadow:0 2px 24px rgba(0,0,0,.06); }
    .icon { font-size:40px; margin-bottom:20px; }
    h1 { margin:0 0 12px; font-size:22px; color:#1a1a1a; }
    p { margin:0; font-size:15px; color:#666; line-height:1.7; font-family:sans-serif; }
    .dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; margin-bottom:24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="dot"></div>
    <h1>${titulo}</h1>
    <p>${mensaje}</p>
  </div>
</body>
</html>`
}
