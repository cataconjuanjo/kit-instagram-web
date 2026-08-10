'use client'

import { useEffect, useMemo, useState } from 'react'

const productosDemo = [
  {
    nombre: 'Carta Viva Restaurantes',
    etiqueta: 'Bodega + carta publica',
    texto: 'Gestion de bodega para restaurante: carta QR con Armonia, argumentos para sala, stock, margen y seguimiento con datos reales.',
  },
  {
    nombre: 'Carta Viva Sumiller',
    etiqueta: 'Gestion sin carta publica',
    texto: 'Para sumilleres, jefes de sala o duenos que quieren controlar vino, bodega, margen, compras y argumentos internos directamente.',
  },
  {
    nombre: 'Kiosko',
    etiqueta: 'Tienda de vino',
    texto: 'Puesto digital tipo autoservicio para vinotecas: el cliente simula su pedido y la tienda revisa stock, actividad e informes.',
  },
]

const initialForm = {
  name: '',
  email: '',
  phone: '',
  company: '',
  productInterest: 'No lo se aun',
  message: '',
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const monthFormatter = new Intl.DateTimeFormat('es-ES', {
  month: 'long',
  year: 'numeric',
})

const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function formatDay(dateKey) {
  return dateFormatter.format(new Date(`${dateKey}T12:00:00`)).replace('.', '')
}

function formatMonthLabel(monthKey) {
  return monthFormatter.format(new Date(`${monthKey}-01T12:00:00`))
}

function formatSelectedSlot(slot) {
  if (!slot) return 'Selecciona una hora'
  return `${formatDay(slot.date)} · ${slot.time}`
}

function buildMonthGrid(monthKey, daysByDate) {
  if (!monthKey) return []

  const firstDay = new Date(`${monthKey}-01T12:00:00`)
  const year = firstDay.getFullYear()
  const month = firstDay.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const mondayIndex = (firstDay.getDay() + 6) % 7
  const cells = []

  for (let i = 0; i < mondayIndex; i += 1) {
    cells.push({ type: 'empty', key: `empty-start-${i}` })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`
    const availability = daysByDate.get(date)

    cells.push({
      type: 'day',
      key: date,
      date,
      day,
      slots: availability?.slots || [],
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ type: 'empty', key: `empty-end-${cells.length}` })
  }

  return cells
}

export default function DemoBookingSection({ id = 'demo', calendarOnly = false }) {
  const [days, setDays] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [loadingAvailability, setLoadingAvailability] = useState(true)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true

    async function loadAvailability() {
      try {
        const response = await fetch('/api/demo-bookings', { cache: 'no-store' })
        const data = await response.json()

        if (!alive) return
        const nextDays = data.days || []
        setDays(nextDays)
        setSelectedDate(nextDays[0]?.date || '')
        setSelectedSlot(nextDays[0]?.slots?.[0] || null)
      } catch (error) {
        if (!alive) return
        setMessage('No se pudo cargar la agenda. Prueba de nuevo en un momento.')
      } finally {
        if (alive) setLoadingAvailability(false)
      }
    }

    loadAvailability()

    return () => {
      alive = false
    }
  }, [])

  const visibleSlots = useMemo(() => {
    return days.find((day) => day.date === selectedDate)?.slots || []
  }, [days, selectedDate])

  const daysByDate = useMemo(() => {
    return new Map(days.map((day) => [day.date, day]))
  }, [days])

  const availableMonths = useMemo(() => {
    return Array.from(new Set(days.map((day) => day.date.slice(0, 7))))
  }, [days])

  const selectedMonth = selectedDate ? selectedDate.slice(0, 7) : availableMonths[0] || ''
  const currentMonthIndex = availableMonths.indexOf(selectedMonth)
  const calendarCells = useMemo(() => buildMonthGrid(selectedMonth, daysByDate), [selectedMonth, daysByDate])

  function moveMonth(direction) {
    const nextMonth = availableMonths[currentMonthIndex + direction]
    if (!nextMonth) return

    const nextDay = days.find((day) => day.date.startsWith(nextMonth))
    setSelectedDate(nextDay?.date || '')
    setSelectedSlot(nextDay?.slots?.[0] || null)
  }

  function updateField(event) {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }))
  }

  async function submitBooking(event) {
    event.preventDefault()

    if (!selectedSlot) {
      setMessage('Elige una hora para la demo.')
      return
    }

    setStatus('submitting')
    setMessage('')

    try {
      const response = await fetch('/api/demo-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          slotStart: selectedSlot.start,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setStatus('error')
        setMessage(data.error || 'No se pudo reservar ese horario.')
        return
      }

      setStatus('success')
      setMessage(`Reserva recibida para ${formatSelectedSlot(selectedSlot)}. Te escribire para confirmar el enlace de la demo.`)
      setForm(initialForm)
      const nextDays = days
        .map((day) => ({
          ...day,
          slots: day.slots.filter((slot) => slot.start !== selectedSlot.start),
        }))
        .filter((day) => day.slots.length > 0)
      setDays(nextDays)
      setSelectedDate(nextDays[0]?.date || '')
      setSelectedSlot(nextDays[0]?.slots?.[0] || null)
    } catch (error) {
      setStatus('error')
      setMessage('No se pudo enviar la reserva. Prueba de nuevo en un momento.')
    }
  }

  return (
    <section id={id} className={`section demo-booking-section${calendarOnly ? ' demo-booking-section--calendar-only' : ''}`}>
      {!calendarOnly ? (
        <div className="demo-booking-copy">
          <p className="eyebrow">Demo guiada</p>
          <h2>Reserva 30 minutos para ver que producto encaja contigo.</h2>
          <p className="demo-booking-lead">
            Vemos tu caso y te enseno el producto que tenga sentido: Carta Viva Restaurantes, Carta Viva Sumiller o Kiosko.
            Si todavia no sabes cual necesitas, lo decidimos en la propia demo.
          </p>
          <ul className="booking-facts" aria-label="Detalles de la demo">
            <li>30 min</li>
            <li>Online</li>
            <li>Sin compromiso</li>
            <li>Horario Madrid</li>
          </ul>
          <div className="booking-product-list" aria-label="Productos disponibles para la demo">
            {productosDemo.map((producto) => (
              <article className="booking-product" key={producto.nombre}>
                <div>
                  <strong>{producto.nombre}</strong>
                  <span>{producto.etiqueta}</span>
                </div>
                <p>{producto.texto}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="booking-calendar-shell" aria-live="polite">
        <div className="booking-calendar-meta">
          <strong>Agenda propia · 30 minutos</strong>
          <span>Lun-vie · 10:00-13:00 y 16:00-18:00</span>
        </div>

        <div className="booking-app">
          <div className="booking-picker">
            <div className="booking-month-panel">
              <div className="booking-month-head">
                <button
                  type="button"
                  className="booking-month-nav"
                  onClick={() => moveMonth(-1)}
                  disabled={currentMonthIndex <= 0}
                  aria-label="Mes anterior"
                >
                  ‹
                </button>
                <strong>{selectedMonth ? formatMonthLabel(selectedMonth) : 'Agenda'}</strong>
                <button
                  type="button"
                  className="booking-month-nav"
                  onClick={() => moveMonth(1)}
                  disabled={currentMonthIndex === -1 || currentMonthIndex >= availableMonths.length - 1}
                  aria-label="Mes siguiente"
                >
                  ›
                </button>
              </div>

              <div className="booking-weekdays" aria-hidden="true">
                {weekdayLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="booking-month-grid" aria-label="Calendario de disponibilidad">
                {loadingAvailability ? (
                  <p className="booking-empty booking-empty--calendar">Cargando disponibilidad...</p>
                ) : days.length === 0 ? (
                  <p className="booking-empty booking-empty--calendar">No hay huecos disponibles ahora mismo.</p>
                ) : (
                  calendarCells.map((cell) => {
                    if (cell.type === 'empty') {
                      return <span className="booking-calendar-empty-cell" key={cell.key} aria-hidden="true" />
                    }

                    const available = cell.slots.length > 0
                    return (
                      <button
                        type="button"
                        key={cell.key}
                        className={`booking-calendar-day${selectedDate === cell.date ? ' active' : ''}${available ? '' : ' disabled'}`}
                        onClick={() => {
                          if (!available) return
                          setSelectedDate(cell.date)
                          setSelectedSlot(cell.slots[0] || null)
                        }}
                        disabled={!available}
                        aria-label={`${formatDay(cell.date)}${available ? `, ${cell.slots.length} huecos` : ', no disponible'}`}
                      >
                        <span>{cell.day}</span>
                        {available ? <small>{cell.slots.length}</small> : null}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="booking-time-panel">
              <div className="booking-time-head">
                <span>Día elegido</span>
                <strong>{selectedDate ? formatDay(selectedDate) : 'Sin selección'}</strong>
              </div>
              <div className="booking-slots" aria-label="Horas disponibles">
                {visibleSlots.length > 0 ? (
                  visibleSlots.map((slot) => (
                    <button
                      type="button"
                      key={slot.start}
                      className={`booking-slot-button${selectedSlot?.start === slot.start ? ' active' : ''}`}
                      onClick={() => setSelectedSlot(slot)}
                    >
                      {slot.time}
                    </button>
                  ))
                ) : (
                  <p className="booking-empty">Elige un día disponible.</p>
                )}
              </div>
            </div>
          </div>

          <form className="booking-form" onSubmit={submitBooking}>
            <div className="booking-selected">
              <span>Horario seleccionado</span>
              <strong>{formatSelectedSlot(selectedSlot)}</strong>
            </div>

            <label>
              Nombre
              <input name="name" value={form.name} onChange={updateField} autoComplete="name" required />
            </label>

            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required />
            </label>

            <div className="booking-form-row">
              <label>
                Telefono
                <input name="phone" value={form.phone} onChange={updateField} autoComplete="tel" />
              </label>
              <label>
                Empresa
                <input name="company" value={form.company} onChange={updateField} autoComplete="organization" />
              </label>
            </div>

            <label>
              Interes principal
              <select name="productInterest" value={form.productInterest} onChange={updateField}>
                <option>Carta Viva Restaurantes</option>
                <option>Carta Viva Sumiller</option>
                <option>Kiosko</option>
                <option>No lo se aun</option>
              </select>
            </label>

            <label>
              Contexto
              <textarea
                name="message"
                value={form.message}
                onChange={updateField}
                rows="3"
                placeholder="Restaurante, vinoteca, hotel, idea de proyecto..."
              />
            </label>

            <button className="btn btn-primary booking-submit" type="submit" disabled={status === 'submitting' || !selectedSlot}>
              {status === 'submitting' ? 'Reservando...' : 'Reservar demo'}
            </button>

            {message ? (
              <p className={`booking-status booking-status--${status === 'success' ? 'success' : 'error'}`}>
                {message}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  )
}
