'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import AdminOverlay from '../components/AdminOverlay'

const TIPO_LABEL = {
  mejora: 'Mejora',
  problema: 'Problema',
  nueva_funcion: 'Nueva función',
  otro: 'Otro',
}

function limpiarTexto(texto = '') {
  return String(texto || '')
    .replace(/gustar\?a/gi, m => m[0] === 'G' ? 'Gustaría' : 'gustaría')
    .replace(/\bqu\?/gi,    m => m[0] === 'Q' ? 'Qué'      : 'qué')
    .replace(/\bm\?s\b/gi,  m => m[0] === 'M' ? 'Más'      : 'más')
    .replace(/\br\?pido/gi, m => m[0] === 'R' ? 'Rápido'   : 'rápido')
    .replace(/\bfunci\?n/gi,m => m[0] === 'F' ? 'Función'  : 'función')
    .replace(/\btambi\?n/gi,m => m[0] === 'T' ? 'También'  : 'también')
    .replace(/\bsecci\?n/gi,m => m[0] === 'S' ? 'Sección'  : 'sección')
    .replace(/\brap\?do/gi, m => m[0] === 'R' ? 'Rápido'   : 'rápido')
}

const ESTADOS = ['nueva', 'revisando', 'resuelta', 'descartada']

const FILTROS = [
  ['pendientes', 'Pendientes'],
  ['nueva', 'Nueva'],
  ['revisando', 'Revisando'],
  ['resuelta', 'Resueltas'],
  ['descartada', 'Descartadas'],
  ['todas', 'Todas'],
]

function fecha(value) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function AdminSugerenciasPage() {
  const [sugerencias, setSugerencias] = useState([])
  const [filtro, setFiltro] = useState('pendientes')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState('')
  const [sugerenciaActiva, setSugerenciaActiva] = useState(null)

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
    if (res.ok) {
      setSugerencias(actual => actual.map(sugerencia => sugerencia.id === item.id ? data.sugerencia : sugerencia))
      setSugerenciaActiva(null)
    }
    setGuardando('')
  }

  const visibles = useMemo(() => sugerencias.filter(item => {
    if (filtro === 'todas') return true
    if (filtro === 'pendientes') return ['nueva', 'revisando'].includes(item.estado)
    return item.estado === filtro
  }), [sugerencias, filtro])

  return (
    <div className="admin-main sugerencias-workspace">
      <div className="ws-header">
        <div className="ws-header-left">
          <Link href="/admin/consultoria" className="ws-back">Radar</Link>
          <div>
            <h2 className="ws-title">Buzón de sugerencias</h2>
            <span className="ws-sub">Feedback directo de los restaurantes para decidir qué corregir y qué construir después.</span>
          </div>
        </div>
        <div className="ws-header-actions">
          <span className="ws-badge">{sugerencias.filter(item => item.estado === 'nueva').length} nuevas</span>
        </div>
      </div>

      <section className="ws-section">
      <div className="consult-toolbar">
        {FILTROS.map(([value, label]) => (
          <button type="button" key={value} className={filtro === value ? 'is-selected' : ''} onClick={() => setFiltro(value)}>
            {label}
          </button>
        ))}
      </div>

      <div className="consult-grid">
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
              <span className={`consult-badge consult-badge--${item.estado}`}>{item.estado}</span>
            </div>
            <p className="consult-card-text">{limpiarTexto(item.mensaje)}</p>
            {item.pagina && <p className="consult-muted">Contexto: {item.pagina}</p>}
            <div className="consult-card-actions">
              <button type="button" onClick={() => setSugerenciaActiva({ ...item })}>Revisar y responder</button>
            </div>
          </article>
        ))}
      </div>
      </section>
      <AdminOverlay
        open={Boolean(sugerenciaActiva)}
        onClose={() => !guardando && setSugerenciaActiva(null)}
        size="modal"
        eyebrow={TIPO_LABEL[sugerenciaActiva?.tipo] || sugerenciaActiva?.tipo}
        title={sugerenciaActiva?.restaurantes?.nombre || 'Sugerencia'}
        description={sugerenciaActiva ? `${fecha(sugerenciaActiva.created_at)}${sugerenciaActiva.pagina ? ` · ${sugerenciaActiva.pagina}` : ''}` : ''}
        footer={
          <>
            <button type="button" onClick={() => setSugerenciaActiva(null)} disabled={Boolean(guardando)}>Cancelar</button>
            <button type="button" className="is-primary" onClick={() => actualizar(sugerenciaActiva, {})} disabled={!sugerenciaActiva || guardando === sugerenciaActiva?.id}>
              {guardando === sugerenciaActiva?.id ? 'Guardando…' : 'Guardar respuesta'}
            </button>
          </>
        }
      >
        {sugerenciaActiva && (
          <div className="admin-detail-stack">
            <div className="admin-detail-box">
              <h3>Mensaje del restaurante</h3>
              <p>{limpiarTexto(sugerenciaActiva.mensaje)}</p>
            </div>
            <label className="consult-field">
              Estado
              <select value={sugerenciaActiva.estado} onChange={event => setSugerenciaActiva({ ...sugerenciaActiva, estado: event.target.value })}>
                {ESTADOS.map(estado => <option value={estado} key={estado}>{estado}</option>)}
              </select>
            </label>
            <label className="consult-field">
              Nota interna
              <textarea
                value={sugerenciaActiva.respuesta_interna || ''}
                onChange={event => setSugerenciaActiva({ ...sugerenciaActiva, respuesta_interna: event.target.value })}
                placeholder="Seguimiento, decisión o próximo paso..."
              />
            </label>
            <label className="consult-field">
              Respuesta visible para el restaurante
              <textarea
                value={sugerenciaActiva.respuesta_publica || ''}
                onChange={event => setSugerenciaActiva({ ...sugerenciaActiva, respuesta_publica: event.target.value })}
                placeholder="Ej. Lo tenemos en revisión. Gracias por avisar."
              />
            </label>
          </div>
        )}
      </AdminOverlay>
    </div>
  )
}
