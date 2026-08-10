import { Resend } from 'resend'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { DEMO_BOOKING_CONFIG, generateDemoSlots, isValidDemoSlot } from '../../lib/demoBookingAvailability'
import { createDemoIcs, createGoogleCalendarEvent, formatBookingDate } from '../../lib/calendarInvites'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const FROM = process.env.CARTA_VIVA_FROM || 'Cata con Juanjo <onboarding@resend.dev>'

function clean(value, limit = 200) {
  return String(value || '').trim().slice(0, limit)
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function getBookedStarts() {
  const now = new Date()
  const until = new Date(now)
  until.setUTCDate(until.getUTCDate() + DEMO_BOOKING_CONFIG.horizonDays + 1)

  const { data, error } = await supabaseAdmin
    .from('demo_bookings')
    .select('slot_start')
    .in('status', ['confirmed', 'pending'])
    .gte('slot_start', now.toISOString())
    .lte('slot_start', until.toISOString())

  if (error) {
    console.error('[demo-bookings] read failed', error)
    return []
  }

  return (data || []).map((booking) => new Date(booking.slot_start).toISOString())
}

async function sendBookingEmail(booking) {
  if (!resend) return

  const readableDate = formatBookingDate(booking.slot_start)
  const ics = createDemoIcs(booking)
  const attachments = [{
    filename: 'demo-carta-viva.ics',
    content: Buffer.from(ics, 'utf8'),
    contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
  }]

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    replyTo: booking.email,
    subject: `Nueva demo reservada: ${booking.name}`,
    html: `
      <h2>Nueva demo reservada</h2>
      <p><strong>Fecha:</strong> ${escapeHtml(readableDate)}</p>
      <p><strong>Enlace Calendar:</strong> ${booking.calendar_event_link ? `<a href="${escapeHtml(booking.calendar_event_link)}">Abrir evento</a>` : 'No disponible'}</p>
      <p><strong>Meet:</strong> ${booking.meet_link ? `<a href="${escapeHtml(booking.meet_link)}">${escapeHtml(booking.meet_link)}</a>` : 'Pendiente'}</p>
      <p><strong>Nombre:</strong> ${escapeHtml(booking.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(booking.email)}</p>
      <p><strong>Telefono:</strong> ${escapeHtml(booking.phone || 'No indicado')}</p>
      <p><strong>Empresa:</strong> ${escapeHtml(booking.company || 'No indicada')}</p>
      <p><strong>Producto:</strong> ${escapeHtml(booking.product_interest || 'No indicado')}</p>
      <p><strong>Mensaje:</strong></p>
      <p>${escapeHtml(booking.message || 'Sin mensaje').replace(/\n/g, '<br>')}</p>
    `,
    attachments,
  })

  if (booking.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    await resend.emails.send({
      from: FROM,
      to: booking.email,
      subject: 'Tu demo de Carta Viva esta reservada',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#222;line-height:1.55">
          <h1 style="font-size:24px;font-weight:500;margin:0 0 16px">Demo reservada</h1>
          <p>Hola ${escapeHtml(booking.name)},</p>
          <p>He recibido tu reserva para la demo de <strong>Carta Viva</strong>.</p>
          <p><strong>Fecha:</strong> ${escapeHtml(readableDate)} (${escapeHtml(DEMO_BOOKING_CONFIG.timezone)})</p>
          ${booking.meet_link ? `<p><strong>Enlace de la demo:</strong><br><a href="${escapeHtml(booking.meet_link)}">${escapeHtml(booking.meet_link)}</a></p>` : '<p>Te enviare el enlace de la demo en cuanto revise la reserva.</p>'}
          <p>Adjunto tienes un archivo <strong>.ics</strong> para anadir la cita a Apple Calendar, iPhone, Google Calendar u Outlook.</p>
          <p>Un saludo,<br>Juanjo</p>
        </div>
      `,
      attachments,
    })
  }
}

export async function GET() {
  const bookedStarts = await getBookedStarts()

  return Response.json({
    ok: true,
    config: {
      durationMinutes: DEMO_BOOKING_CONFIG.durationMinutes,
      timezone: DEMO_BOOKING_CONFIG.timezone,
    },
    days: generateDemoSlots({ bookedStarts }),
  })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const slotStart = clean(body.slotStart, 80)
    const name = clean(body.name, 120)
    const email = clean(body.email, 160).toLowerCase()
    const phone = clean(body.phone, 60)
    const company = clean(body.company, 160)
    const productInterest = clean(body.productInterest, 80)
    const message = clean(body.message, 1200)

    if (!slotStart || !name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ ok: false, error: 'Completa nombre, email y hora.' }, { status: 400 })
    }

    if (!isValidDemoSlot(slotStart)) {
      return Response.json({ ok: false, error: 'Ese horario ya no esta disponible.' }, { status: 409 })
    }

    const slotEnd = new Date(new Date(slotStart).getTime() + DEMO_BOOKING_CONFIG.durationMinutes * 60 * 1000).toISOString()
    const payload = {
      slot_start: slotStart,
      slot_end: slotEnd,
      timezone: DEMO_BOOKING_CONFIG.timezone,
      duration_minutes: DEMO_BOOKING_CONFIG.durationMinutes,
      name,
      email,
      phone: phone || null,
      company: company || null,
      product_interest: productInterest || null,
      message: message || null,
      status: 'confirmed',
      source: 'web-demo-booking',
    }

    const { data, error } = await supabaseAdmin
      .from('demo_bookings')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return Response.json({ ok: false, error: 'Ese horario acaba de reservarse.' }, { status: 409 })
      }

      console.error('[demo-bookings] insert failed', error)
      return Response.json({ ok: false, error: 'No se pudo guardar la reserva.' }, { status: 500 })
    }

    try {
      let bookingForEmail = data
      try {
        const calendarEvent = await createGoogleCalendarEvent(data)
        if (!calendarEvent.skipped) {
          bookingForEmail = {
            ...data,
            calendar_event_id: calendarEvent.id,
            calendar_event_link: calendarEvent.htmlLink,
            meet_link: calendarEvent.meetLink,
            calendar_sync_status: 'synced',
          }

          await supabaseAdmin
            .from('demo_bookings')
            .update({
              calendar_event_id: calendarEvent.id,
              calendar_event_link: calendarEvent.htmlLink,
              meet_link: calendarEvent.meetLink,
              calendar_sync_status: 'synced',
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.id)
        }
      } catch (calendarError) {
        console.error('[demo-bookings] calendar sync failed', calendarError)
        await supabaseAdmin
          .from('demo_bookings')
          .update({
            calendar_sync_status: 'failed',
            calendar_sync_error: String(calendarError?.message || calendarError).slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
      }

      await sendBookingEmail(bookingForEmail)
    } catch (emailError) {
      console.error('[demo-bookings] email failed', emailError)
    }

    return Response.json({ ok: true, booking: data }, { status: 201 })
  } catch (error) {
    console.error('[demo-bookings] unexpected failure', error)
    return Response.json({ ok: false, error: 'No se pudo procesar la reserva.' }, { status: 500 })
  }
}
