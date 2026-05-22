'use client'

import { useState } from 'react'

export default function LeadForm({ source = 'Cata con Juanjo' }) {
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
        <h3>Mensaje recibido</h3>
        <p>Te respondo en menos de 24 horas. Si es urgente, también puedes escribirme por WhatsApp.</p>
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
        Número de referencias
        <select value={form.referencias} onChange={(e) => setForm({ ...form, referencias: e.target.value })}>
          <option value="">Seleccionar</option>
          <option value="Menos de 30">Menos de 30</option>
          <option value="30-80">30-80</option>
          <option value="80-150">80-150</option>
          <option value="Más de 150">Más de 150</option>
        </select>
      </label>
      <label>
        Principal problema
        <select value={form.problema} onChange={(e) => setForm({ ...form, problema: e.target.value })}>
          <option value="">Seleccionar</option>
          <option value="No controlo stock">No controlo stock</option>
          <option value="No sé qué margen deja cada vino">No sé qué margen deja cada vino</option>
          <option value="Sala no vende vino con seguridad">Sala no vende vino con seguridad</option>
          <option value="Carta desordenada o antigua">Carta desordenada o antigua</option>
          <option value="Quiero digitalizar la carta">Quiero digitalizar la carta</option>
        </select>
      </label>
      <label>
        Qué necesitas
        <textarea rows={5} value={form.mensaje} onChange={(e) => setForm({ ...form, mensaje: e.target.value })} />
      </label>
      {estado === 'error' && <p className="form-error">No se ha podido enviar. Escríbeme directamente a cataconjuanjo@gmail.com.</p>}
      <button type="submit" className="btn btn-primary" disabled={estado === 'sending'}>
        {estado === 'sending' ? 'Enviando...' : 'Solicitar diagnóstico'}
      </button>
    </form>
  )
}
