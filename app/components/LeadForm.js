'use client'

import { useState } from 'react'

export default function LeadForm({
  source = 'Cata con Juanjo',
  cta = 'Solicitar diagnóstico',
  title = 'Cuéntame lo esencial',
  successTitle = 'Solicitud recibida',
  successText = 'Te respondo en menos de 24 horas con el siguiente paso y sin compromiso.',
  intro = '2 minutos · respuesta personal · sin compromiso',
  negocioLabel = 'Restaurante / negocio',
  referenciasLabel = 'Número de referencias',
  problemaLabel = 'Principal problema',
  problemaOptions = [
    'No controlo stock',
    'No sé qué margen deja cada vino',
    'Sala no vende vino con seguridad',
    'Carta desordenada o antigua',
    'Quiero digitalizar la carta',
  ],
  mensajeLabel = 'Qué necesitas',
}) {
  const [form, setForm] = useState({ nombre: '', email: '', restaurante: '', referencias: '', problema: '', mensaje: '' })
  const [estado, setEstado] = useState('idle')

  async function enviar(event) {
    event.preventDefault()
    if (!form.nombre || !form.email || !form.restaurante) return
    setEstado('sending')
    try {
      const res = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source,
          mensaje: [
            `Referencias aproximadas: ${form.referencias || 'Sin indicar'}`,
            `Principal problema: ${form.problema || 'Sin indicar'}`,
            '',
            form.mensaje || 'Sin mensaje adicional',
            '',
            `Origen: ${source}`,
          ].join('\n'),
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
        <h3>{successTitle}</h3>
        <p>{successText}</p>
      </div>
    )
  }

  return (
    <form className="lead-form" onSubmit={enviar}>
      <div className="lead-form-intro">
        <strong>{title}</strong>
        <span>{intro}</span>
      </div>
      <label>
        Nombre
        <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
      </label>
      <label>
        Email
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </label>
      <label>
        {negocioLabel}
        <input value={form.restaurante} onChange={(e) => setForm({ ...form, restaurante: e.target.value })} required />
      </label>
      <label>
        {referenciasLabel}
        <select value={form.referencias} onChange={(e) => setForm({ ...form, referencias: e.target.value })}>
          <option value="">Seleccionar</option>
          <option value="Menos de 30">Menos de 30</option>
          <option value="30-80">30-80</option>
          <option value="80-150">80-150</option>
          <option value="Más de 150">Más de 150</option>
        </select>
      </label>
      <label>
        {problemaLabel}
        <select value={form.problema} onChange={(e) => setForm({ ...form, problema: e.target.value })}>
          <option value="">Seleccionar</option>
          {problemaOptions.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <label>
        {mensajeLabel}
        <textarea rows={5} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
      </label>
      {estado === 'error' && <p className="form-error">No se ha podido enviar. Escríbeme directamente a cataconjuanjo@gmail.com.</p>}
      <button type="submit" className="btn btn-primary" disabled={estado === 'sending'}>
        {estado === 'sending' ? 'Enviando...' : cta}
      </button>
      <p className="lead-form-privacy">
        Tus datos solo se usan para responder a esta solicitud. No se comparten con terceros.
      </p>
    </form>
  )
}
