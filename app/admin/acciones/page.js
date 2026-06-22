'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'

const ESTADOS = [
  ['pendiente', 'Pendientes'],
  ['en_progreso', 'En progreso'],
  ['hecha', 'Hechas'],
  ['descartada', 'Descartadas'],
  ['todas', 'Todas'],
]

const FASES = [
  ['todas', 'Todas'],
  ['accion_rapida', '30 dias'],
  ['medio_plazo', '90 dias'],
  ['estrategico', '180 dias'],
]

const PRIORIDADES = [
  ['todas', 'Todas'],
  ['alta', 'Alta'],
  ['media', 'Media'],
  ['baja', 'Baja'],
]

function haceDias(fecha) {
  if (!fecha) return 'sin fecha'
  const diff = Date.now() - new Date(fecha).getTime()
  const dias = Math.max(0, Math.floor(diff / 86400000))
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} dias`
}

function etiquetaFase(fase) {
  if (fase === 'accion_rapida') return '30 dias'
  if (fase === 'medio_plazo') return '90 dias'
  if (fase === 'estrategico') return '180 dias'
  return fase || 'sin fase'
}

async function tokenAdmin() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || ''
}

export default function AdminAccionesPage() {
  const [user, setUser] = useState(null)
  const [acciones, setAcciones] = useState([])
  const [estado, setEstado] = useState('pendiente')
  const [fase, setFase] = useState('todas')
  const [prioridad, setPrioridad] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [accionando, setAccionando] = useState('')
  const [mensaje, setMensaje] = useState('')

  const cargarAcciones = useCallback(async () => {
    setLoading(true)
    setMensaje('')
    const token = await tokenAdmin()
    const params = new URLSearchParams({ estado })
    const res = await fetch(`/api/admin/acciones?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setAcciones(data.acciones || [])
    } else {
      setMensaje(data.error || 'No se pudieron cargar las acciones.')
    }
    setLoading(false)
  }, [estado])

  useEffect(() => {
    async function cargarUsuario() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }
      setUser(user)
    }
    cargarUsuario()
  }, [])

  useEffect(() => {
    if (!user) return
    const timeout = window.setTimeout(cargarAcciones, 0)
    return () => window.clearTimeout(timeout)
  }, [user, cargarAcciones])

  async function actualizarAccion(accion, nuevoEstado) {
    setAccionando(`${accion.fuente}-${accion.id}`)
    setMensaje('')
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/acciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: accion.id, fuente: accion.fuente, estado: nuevoEstado }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setMensaje('Accion actualizada.')
      await cargarAcciones()
    } else {
      setMensaje(data.error || 'No se pudo actualizar la accion.')
    }
    setAccionando('')
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return acciones.filter(accion => {
      if (fase !== 'todas' && accion.fase !== fase) return false
      if (prioridad !== 'todas' && accion.prioridad !== prioridad) return false
      if (!q) return true
      return [
        accion.titulo,
        accion.detalle,
        accion.accion,
        accion.restaurante?.nombre,
        accion.origen,
      ].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [acciones, fase, prioridad, busqueda])

  const resumen = useMemo(() => ({
    pendientes: acciones.filter(item => item.estado === 'pendiente').length,
    progreso: acciones.filter(item => item.estado === 'en_progreso').length,
    alta: acciones.filter(item => item.prioridad === 'alta').length,
    rapidas: acciones.filter(item => item.fase === 'accion_rapida').length,
  }), [acciones])

  if (loading && !acciones.length) return <p className="admin-loading">Cargando acciones</p>

  return (
    <div className="admin-main actions-workspace">
      <div className="ws-header">
        <div className="ws-header-left">
          <Link href="/admin/consultoria" className="ws-back">Radar</Link>
          <div>
            <h2 className="ws-title">Pipeline consultor</h2>
            <span className="ws-sub">Acciones comerciales y operativas derivadas del diagnostico.</span>
          </div>
        </div>
        <div className="ws-header-actions">
          <button onClick={cargarAcciones} disabled={loading}>{loading ? 'Actualizando...' : 'Actualizar'}</button>
        </div>
      </div>

      <section className="ws-section">
        <div className="alerts-summary">
          <div><span>Pendientes</span><strong>{resumen.pendientes}</strong></div>
          <div><span>En progreso</span><strong>{resumen.progreso}</strong></div>
          <div><span>Prioridad alta</span><strong>{resumen.alta}</strong></div>
          <div><span>30 dias</span><strong>{resumen.rapidas}</strong></div>
        </div>

        <div className="alerts-toolbar">
          <label>
            Estado
            <select value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Fase
            <select value={fase} onChange={e => setFase(e.target.value)}>
              {FASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Prioridad
            <select value={prioridad} onChange={e => setPrioridad(e.target.value)}>
              {PRIORIDADES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Buscar
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Restaurante, accion, origen..." />
          </label>
        </div>

        {mensaje && <p className="admin-alert">{mensaje}</p>}

        <div className="alerts-list">
          {visibles.map(accion => {
            const key = `${accion.fuente}-${accion.id}`
            return (
              <article className={`alert-work-card is-${accion.prioridad === 'alta' ? 'critica' : accion.prioridad === 'media' ? 'aviso' : 'info'}`} key={key}>
                <div className="alert-work-main">
                  <div className="alert-work-head">
                    <span>{accion.prioridad}</span>
                    <strong>{accion.titulo}</strong>
                    <em>{accion.estado.replace('_', ' ')}</em>
                  </div>
                  {accion.detalle && <p>{accion.detalle}</p>}
                  <small>Accion: {accion.accion}</small>
                  <div className="alert-work-meta">
                    <Link href={`/admin/restaurante/${accion.restaurante_id}`}>{accion.restaurante?.nombre || 'Restaurante'}</Link>
                    <span>{etiquetaFase(accion.fase)}</span>
                    <span>impacto {accion.impacto}</span>
                    <span>esfuerzo {accion.esfuerzo}</span>
                    <span>{haceDias(accion.created_at)}</span>
                    <span>{accion.fuente}</span>
                  </div>
                </div>
                <div className="alert-work-actions">
                  <button disabled={accionando === key} onClick={() => actualizarAccion(accion, 'en_progreso')}>En progreso</button>
                  <button disabled={accionando === key} onClick={() => actualizarAccion(accion, 'hecha')}>Hecha</button>
                  <button disabled={accionando === key} onClick={() => actualizarAccion(accion, 'descartada')}>Descartar</button>
                </div>
              </article>
            )
          })}
          {!visibles.length && <div className="ws-empty-block">No hay acciones con estos filtros.</div>}
        </div>
      </section>
    </div>
  )
}
