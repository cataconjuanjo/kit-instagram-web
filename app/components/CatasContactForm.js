'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function CatasContactForm() {
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    telefono: '',
    fecha: '',
    personas: '',
    lugar: '',
    tipoCata: '',
    mensaje: '',
    consentimiento: false,
  })
  const [estado, setEstado] = useState('idle')

  async function enviar(event) {
    event.preventDefault()
    if (!form.nombre || !form.email || !form.consentimiento) return
    setEstado('sending')
    try {
      const res = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre,
          email: form.email,
          consentimiento: form.consentimiento,
          source: 'Reserva cata',
          mensaje: [
            form.telefono ? `Teléfono: ${form.telefono}` : null,
            form.fecha ? `Fecha aproximada: ${form.fecha}` : null,
            form.personas ? `Número de personas: ${form.personas}` : null,
            form.lugar ? `Lugar: ${form.lugar}` : null,
            form.tipoCata ? `Tipo de cata: ${form.tipoCata}` : null,
            '',
            form.mensaje || 'Sin mensaje adicional',
          ].filter(Boolean).join('\n'),
        }),
      })
      const data = await res.json()
      setEstado(data.ok ? 'sent' : 'error')
    } catch {
      setEstado('error')
    }
  }

  if (estado === 'sent') {
    return (
      <div className="lead-form form-success">
        <h3>Solicitud recibida</h3>
        <p>Te respondo en menos de 24 horas con una propuesta clara y sin compromiso.</p>
      </div>
    )
  }

  return (
    <form className="lead-form" onSubmit={enviar}>
      <div className="lead-form-intro">
        <strong>Solicitar propuesta</strong>
        <span>Respuesta personal en menos de 24 h · sin compromiso</span>
      </div>

      <label>
        Nombre
        <input
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          required
        />
      </label>

      <label>
        Email
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
      </label>

      <label>
        Teléfono
        <input
          type="tel"
          value={form.telefono}
          onChange={(e) => setForm({ ...form, telefono: e.target.value })}
          placeholder="Opcional"
        />
      </label>

      <label>
        Fecha aproximada
        <input
          value={form.fecha}
          onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          placeholder="p. ej. mediados de octubre, sin fecha fija…"
        />
      </label>

      <label>
        Número de personas
        <select value={form.personas} onChange={(e) => setForm({ ...form, personas: e.target.value })}>
          <option value="">Seleccionar</option>
          <option value="2–6 personas">2–6 personas</option>
          <option value="7–12 personas">7–12 personas</option>
          <option value="Más de 12 personas">Más de 12 personas</option>
        </select>
      </label>

      <label>
        Lugar
        <select value={form.lugar} onChange={(e) => setForm({ ...form, lugar: e.target.value })}>
          <option value="">Seleccionar</option>
          <option value="A domicilio">A domicilio</option>
          <option value="Finca o villa">Finca o villa</option>
          <option value="A bordo (yate)">A bordo (yate)</option>
          <option value="Otro">Otro</option>
        </select>
      </label>

      <label>
        Tipo de cata
        <select value={form.tipoCata} onChange={(e) => setForm({ ...form, tipoCata: e.target.value })}>
          <option value="">Seleccionar</option>
          <option value="Cata Esencial">Cata Esencial</option>
          <option value="Cata Premium">Cata Premium</option>
          <option value="Cata Exclusiva">Cata Exclusiva</option>
          <option value="No lo tengo claro">No lo tengo claro</option>
        </select>
      </label>

      <label>
        Mensaje
        <textarea
          rows={4}
          value={form.mensaje}
          onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
          placeholder="Cuéntame qué tienes en mente…"
        />
      </label>

      {estado === 'error' && (
        <p className="form-error">
          No se ha podido enviar. Escríbeme directamente a cataconjuanjo@gmail.com.
        </p>
      )}

      <label
        className="lead-form-consent"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          color: 'rgba(255,255,255,0.66)',
          fontSize: '0.76rem',
          lineHeight: 1.45,
          letterSpacing: 0,
          textTransform: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={form.consentimiento}
          onChange={(e) => setForm({ ...form, consentimiento: e.target.checked })}
          required
          style={{
            width: 16,
            minWidth: 16,
            height: 16,
            marginTop: 2,
            accentColor: '#fff',
          }}
        />
        <span>
          He leído la{' '}
          <a href="/privacidad" style={{ color: '#fff', textDecoration: 'underline', textUnderlineOffset: '3px' }}>política de privacidad</a>
          {' '}y acepto que mis datos se usen para responder a esta solicitud.
        </span>
      </label>

      <button
        type="submit"
        className="btn btn-primary"
        disabled={estado === 'sending' || !form.consentimiento}
      >
        {estado === 'sending' ? 'Enviando...' : 'Solicitar propuesta'}
      </button>

      <p className="lead-form-privacy">
        Tus datos solo se usan para responder a esta solicitud. No se comparten con terceros.
      </p>
    </form>
  )
}
