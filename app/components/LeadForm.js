'use client'

import { useState } from 'react'

export default function LeadForm({ source = 'Cata con Juanjo' }) {
  const [form, setForm] = useState({ nombre: '', email: '', restaurante: '', mensaje: '' })
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
          mensaje: `${form.mensaje || 'Sin mensaje adicional'}\n\nOrigen: ${source}`,
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
        <h3>Mensaje recibido</h3>
        <p>Te respondo en menos de 24 horas. Si es urgente, tambien puedes escribirme por WhatsApp.</p>
      </div>
    )
  }

  return (
    <form className="lead-form" onSubmit={enviar}>
      <label>
        Nombre
        <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
      </label>
      <label>
        Email
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </label>
      <label>
        Restaurante / negocio
        <input value={form.restaurante} onChange={(e) => setForm({ ...form, restaurante: e.target.value })} required />
      </label>
      <label>
        Que necesitas
        <textarea rows={5} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
      </label>
      {estado === 'error' && <p className="form-error">No se ha podido enviar. Escríbeme directamente a cataconjuanjo@gmail.com.</p>}
      <button type="submit" className="btn btn-primary" disabled={estado === 'sending'}>
        {estado === 'sending' ? 'Enviando...' : 'Solicitar diagnostico'}
      </button>
    </form>
  )
}
