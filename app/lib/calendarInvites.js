import { createSign, randomUUID } from 'crypto'

import { DEMO_BOOKING_CONFIG } from './demoBookingAvailability'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

function foldIcsLine(line) {
  const limit = 74
  if (line.length <= limit) return line

  const parts = []
  let rest = line
  while (rest.length > limit) {
    parts.push(rest.slice(0, limit))
    rest = ` ${rest.slice(limit)}`
  }
  parts.push(rest)
  return parts.join('\r\n')
}

function escapeIcs(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function toIcsDate(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function getGooglePrivateKey() {
  return process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.replace(/\\n/g, '\n')
}

function googleCalendarConfigured() {
  return Boolean(
    process.env.GOOGLE_CALENDAR_ID &&
    process.env.GOOGLE_CALENDAR_CLIENT_EMAIL &&
    getGooglePrivateKey()
  )
}

export function formatBookingDate(startIso) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: DEMO_BOOKING_CONFIG.timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(startIso))
}

export function createDemoIcs(booking) {
  const uid = booking.calendar_event_uid || `${booking.id || randomUUID()}@cataconjuanjo.com`
  const description = [
    `Reserva de demo desde cataconjuanjo.com`,
    `Nombre: ${booking.name}`,
    `Email: ${booking.email}`,
    booking.phone ? `Telefono: ${booking.phone}` : null,
    booking.company ? `Empresa: ${booking.company}` : null,
    booking.product_interest ? `Interes: ${booking.product_interest}` : null,
    booking.message ? `Mensaje: ${booking.message}` : null,
  ].filter(Boolean).join('\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cata con Juanjo//Demo Booking//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(booking.slot_start)}`,
    `DTEND:${toIcsDate(booking.slot_end)}`,
    `SUMMARY:${escapeIcs(`Demo Carta Viva - ${booking.name}`)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'LOCATION:Online - enlace por confirmar',
    `ORGANIZER;CN=Cata con Juanjo:mailto:${process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'}`,
    `ATTENDEE;CN=${escapeIcs(booking.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${booking.email}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}

async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = toBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = toBase64Url(JSON.stringify({
    iss: process.env.GOOGLE_CALENDAR_CLIENT_EMAIL,
    scope: GOOGLE_CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))
  const unsignedToken = `${header}.${claim}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(getGooglePrivateKey(), 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsignedToken}.${signature}`,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Google token request failed')
  }

  return data.access_token
}

export async function createGoogleCalendarEvent(booking) {
  if (!googleCalendarConfigured()) {
    return { skipped: true, reason: 'missing-google-calendar-env' }
  }

  const accessToken = await getGoogleAccessToken()
  const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)
  const requestId = `demo-${booking.id || randomUUID()}`
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `Demo Carta Viva - ${booking.name}`,
        description: [
          `Reserva recibida desde cataconjuanjo.com`,
          `Email: ${booking.email}`,
          booking.phone ? `Telefono: ${booking.phone}` : null,
          booking.company ? `Empresa: ${booking.company}` : null,
          booking.product_interest ? `Interes: ${booking.product_interest}` : null,
          booking.message ? `Mensaje: ${booking.message}` : null,
        ].filter(Boolean).join('\n'),
        start: {
          dateTime: booking.slot_start,
          timeZone: DEMO_BOOKING_CONFIG.timezone,
        },
        end: {
          dateTime: booking.slot_end,
          timeZone: DEMO_BOOKING_CONFIG.timezone,
        },
        attendees: [
          { email: booking.email, displayName: booking.name },
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  )

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || 'Google Calendar event creation failed')
  }

  return {
    skipped: false,
    id: data.id,
    htmlLink: data.htmlLink,
    meetLink: data.hangoutLink || data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri || null,
  }
}
