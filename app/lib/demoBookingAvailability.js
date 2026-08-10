export const DEMO_BOOKING_CONFIG = {
  timezone: 'Europe/Madrid',
  durationMinutes: 30,
  minNoticeHours: 24,
  horizonDays: 30,
  weekdays: [1, 2, 3, 4, 5],
  windows: [
    { start: '10:00', end: '13:00' },
    { start: '16:00', end: '18:00' },
  ],
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEMO_BOOKING_CONFIG.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DEMO_BOOKING_CONFIG.timezone,
  weekday: 'short',
})

const dayNameToIndex = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function getOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date)

  const value = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT+0'
  const match = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0

  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0))
}

export function zonedDateTimeToUtc(dateKey, time) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const approximateUtc = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const offsetMinutes = getOffsetMinutes(approximateUtc, DEMO_BOOKING_CONFIG.timezone)

  return new Date(approximateUtc.getTime() - offsetMinutes * 60 * 1000)
}

export function formatDateKey(date) {
  return dateFormatter.format(date)
}

export function getWeekdayIndex(date) {
  return dayNameToIndex[weekdayFormatter.format(date)] ?? 0
}

function addMinutesToTime(time, minutesToAdd) {
  const [hours, minutes] = time.split(':').map(Number)
  const total = hours * 60 + minutes + minutesToAdd
  const nextHours = String(Math.floor(total / 60)).padStart(2, '0')
  const nextMinutes = String(total % 60).padStart(2, '0')

  return `${nextHours}:${nextMinutes}`
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function generateDemoSlots({ now = new Date(), bookedStarts = [] } = {}) {
  const minStartTime = now.getTime() + DEMO_BOOKING_CONFIG.minNoticeHours * 60 * 60 * 1000
  const booked = new Set(bookedStarts)
  const days = []

  for (let offset = 0; offset < DEMO_BOOKING_CONFIG.horizonDays; offset += 1) {
    const cursor = new Date(now)
    cursor.setUTCDate(cursor.getUTCDate() + offset)

    const dateKey = formatDateKey(cursor)
    const weekday = getWeekdayIndex(cursor)
    if (!DEMO_BOOKING_CONFIG.weekdays.includes(weekday)) continue

    const slots = []

    for (const window of DEMO_BOOKING_CONFIG.windows) {
      let time = window.start
      const latestStart = timeToMinutes(window.end) - DEMO_BOOKING_CONFIG.durationMinutes

      while (timeToMinutes(time) <= latestStart) {
        const start = zonedDateTimeToUtc(dateKey, time)
        const startIso = start.toISOString()
        if (start.getTime() >= minStartTime && !booked.has(startIso)) {
          slots.push({
            id: startIso,
            date: dateKey,
            time,
            start: startIso,
            end: new Date(start.getTime() + DEMO_BOOKING_CONFIG.durationMinutes * 60 * 1000).toISOString(),
          })
        }
        time = addMinutesToTime(time, DEMO_BOOKING_CONFIG.durationMinutes)
      }
    }

    if (slots.length > 0) {
      days.push({ date: dateKey, slots })
    }
  }

  return days
}

export function isValidDemoSlot(startIso, now = new Date()) {
  return generateDemoSlots({ now }).some((day) => day.slots.some((slot) => slot.start === startIso))
}
