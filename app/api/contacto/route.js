import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function POST(req) {
  const { nombre, email, restaurante, mensaje } = await req.json()

  try {
    await resend.emails.send({
      from: 'Cata con Juanjo <onboarding@resend.dev>',
      to: 'cataconjuanjo@gmail.com',
      subject: `Nuevo contacto: ${restaurante || 'Cata con Juanjo'}`,
      html: `
        <h2>Nuevo mensaje desde cataconjuanjo.com</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Restaurante:</strong> ${escapeHtml(restaurante)}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${escapeHtml(mensaje).replace(/\n/g, '<br>')}</p>
      `
    })
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ ok: false }, { status: 500 })
  }
}
