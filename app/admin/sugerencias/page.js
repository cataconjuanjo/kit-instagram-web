'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'

const TIPO_LABEL = {
  mejora: 'Mejora',
  problema: 'Problema',
  nueva_funcion: 'Nueva función',
  otro: 'Otro',
}

const ESTADOS = ['nueva', 'revisando', 'resuelta', 'descartada']

function fecha(value) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function AdminSugerenciasPage() {
  const [sugerencias, setSugerencias] = useState([])
  const [filtro, setFiltro] = useState('pendientes')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState('')

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }

  useEffect(() => {
    async function cargarInicial() {
      const res = await fetch('/api/sugerencias', { headers: { Authorization: `Bearer ${await token() || ''}` } })
      const data = await res.json()
      setSugerencias(res.ok ? data.sugerencias || [] : [])
      setLoading(false)
    }
    cargarInicial()
  }, [])

  async function actualizar(item, cambios) {
    setGuardando(item.id)
    const res = await fetch('/api/sugerencias', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token() || ''}` },
      body: JSON.stringify({ ...item, ...cambios }),
    })
    const data = await res.json()
    if (res.ok) setSugerencias(actual => actual.map(sugerencia => sugerencia.id === item.id ? data.sugerencia : sugerencia))
    setGuardando('')
  }

  const visibles = useMemo(() => sugerencias.filter(item => {
    if (filtro === 'todas') return true
    if (filtro === 'pendientes') return ['nueva', 'revisando'].includes(item.estado)
    return item.estado === filtro
  }), [sugerencias, filtro])

  return (
    <main className="consult-page">
      <section className="consult-hero">
        <div>
          <p className="consult-eyebrow">Producto</p>
          <h2>Buzón de sugerencias</h2>
          <p>Feedback directo de los restaurantes para decidir qué corregir y qué construir después.</p>
        </div>
        <span className="consult-count">{sugerencias.filter(item => item.estado === 'nueva').length} nuevas</span>
      </section>

      <section className="consult-toolbar">
        {['pendientes', 'nueva', 'revisando', 'resuelta', 'descartada', 'todas'].map(item => (
          <button type="button" key={item} className={filtro === item ? 'is-selected' : ''} onClick={() => setFiltro(item)}>
            {item}
          </button>
        ))}
      </section>

      <section className="consult-grid">
        {loading && <p className="consult-empty">Cargando sugerencias...</p>}
        {!loading && visibles.length === 0 && <p className="consult-empty">No hay sugerencias en esta vista.</p>}
        {visibles.map(item => (
          <article className="consult-card" key={item.id}>
            <div className="consult-card-head">
              <div>
                <p className="consult-card-kicker">{TIPO_LABEL[item.tipo] || item.tipo}</p>
                <h2>{item.restaurantes?.nombre || 'Restaurante'}</h2>
                <p className="consult-muted">{fecha(item.created_at)}</p>
              </div>
              <span className="consult-badge">{item.estado}</span>
            </div>
            <p className="consult-card-text">{item.mensaje}</p>
            {item.pagina && <p className="consult-muted">Contexto: {item.pagina}</p>}
            <label className="consult-field">
              Nota interna
              <textarea
                value={item.respuesta_interna || ''}
                onChange={event => setSugerencias(actual => actual.map(sugerencia => sugerencia.id === item.id ? { ...sugerencia, respuesta_interna: event.target.value } : sugerencia))}
                placeholder="Seguimiento, decisión o próximo paso..."
              />
            </label>
            <label className="consult-field">
              Respuesta visible para el restaurante
              <textarea
                value={item.respuesta_publica || ''}
                onChange={event => setSugerencias(actual => actual.map(sugerencia => sugerencia.id === item.id ? { ...sugerencia, respuesta_publica: event.target.value } : sugerencia))}
                placeholder="Ej. Lo tenemos en revisión. Gracias por avisar."
              />
            </label>
            <div className="consult-card-actions">
              <select value={item.estado} onChange={event => actualizar(item, { estado: event.target.value })}>
                {ESTADOS.map(estado => <option value={estado} key={estado}>{estado}</option>)}
              </select>
              <button type="button" onClick={() => actualizar(item, {})} disabled={guardando === item.id}>
                {guardando === item.id ? 'Guardando...' : 'Guardar nota'}
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}
