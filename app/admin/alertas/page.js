'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'
import AdminOverlay from '../components/AdminOverlay'

const ESTADOS = [
  ['todas', 'Todas'],
  ['abierta', 'Abiertas'],
  ['en_progreso', 'En progreso'],
  ['resuelta', 'Resueltas'],
  ['descartada', 'Descartadas'],
]

const SEVERIDADES = [
  ['todas', 'Todas'],
  ['critica', 'Criticas'],
  ['aviso', 'Avisos'],
  ['info', 'Info'],
]

function haceDias(fecha) {
  if (!fecha) return 'sin fecha'
  const diff = Date.now() - new Date(fecha).getTime()
  const dias = Math.max(0, Math.floor(diff / 86400000))
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} dias`
}

async function tokenAdmin() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || ''
}

export default function AdminAlertasPage() {
  const [user, setUser] = useState(null)
  const [alertas, setAlertas] = useState([])
  const [historial, setHistorial] = useState([])
  const [estado, setEstado] = useState('abierta')
  const [severidad, setSeveridad] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [accionando, setAccionando] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [alertaActiva, setAlertaActiva] = useState(null)

  const cargarAlertas = useCallback(async () => {
    setLoading(true)
    setMensaje('')
    const token = await tokenAdmin()
    const params = new URLSearchParams({ estado, severidad })
    const res = await fetch(`/api/admin/alertas?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setAlertas(data.alertas || [])
      setHistorial(data.historial || [])
    } else {
      setMensaje(data.error || 'No se pudieron cargar las alertas.')
    }
    setLoading(false)
  }, [estado, severidad])

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
    const timeout = window.setTimeout(cargarAlertas, 0)
    return () => window.clearTimeout(timeout)
  }, [user, cargarAlertas])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return alertas
    return alertas.filter(alerta => [
      alerta.titulo,
      alerta.detalle,
      alerta.accion_sugerida,
      alerta.restaurantes?.nombre,
      alerta.clave,
    ].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [alertas, busqueda])

  const resumen = useMemo(() => ({
    criticas: alertas.filter(a => a.severidad === 'critica').length,
    avisos: alertas.filter(a => a.severidad === 'aviso').length,
    abiertas: alertas.filter(a => a.estado === 'abierta').length,
    progreso: alertas.filter(a => a.estado === 'en_progreso').length,
  }), [alertas])

  async function actualizarAlerta(alerta, nuevoEstado, comentario = '') {
    setAccionando(alerta.id)
    setMensaje('')
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/alertas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: alerta.id,
        estado: nuevoEstado,
        accion: nuevoEstado === 'resuelta' ? 'resolver' : nuevoEstado === 'descartada' ? 'descartar' : 'cambio_estado',
        motivo_cierre: comentario,
        comentario,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setMensaje('Alerta actualizada.')
      setAlertaActiva(null)
      await cargarAlertas()
    } else {
      setMensaje(data.error || 'No se pudo actualizar la alerta.')
    }
    setAccionando('')
  }

  async function crearPropuesta(alerta) {
    setAccionando(alerta.id)
    setMensaje('')
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/propuestas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        restaurante_id: alerta.restaurante_id,
        titulo: alerta.titulo,
        tipo: 'Accion consultoria',
        motivo: `${alerta.detalle}\n\nAccion sugerida: ${alerta.accion_sugerida || 'Revisar con el cliente.'}`,
        prioridad: alerta.severidad === 'critica' ? 'alta' : alerta.severidad === 'aviso' ? 'media' : 'baja',
        estado: 'propuesta',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setMensaje('Propuesta creada desde la alerta.')
      await actualizarAlerta(alerta, 'en_progreso', 'Propuesta creada desde la alerta.')
    } else {
      setMensaje(data.error || 'No se pudo crear la propuesta.')
    }
    setAccionando('')
  }

  const historialPorAlerta = useMemo(() => {
    return historial.reduce((acc, item) => {
      acc[item.alert_id] = acc[item.alert_id] || []
      acc[item.alert_id].push(item)
      return acc
    }, {})
  }, [historial])

  if (loading && !alertas.length) return <p className="admin-loading">Cargando alertas</p>

  return (
    <div className="admin-main alerts-workspace">
      <div className="ws-header">
        <div className="ws-header-left">
          <Link href="/admin/consultoria" className="ws-back">Radar</Link>
          <div>
            <h2 className="ws-title">Bandeja de alertas</h2>
            <span className="ws-sub">Problemas abiertos, seguimiento y propuestas de consultoria.</span>
          </div>
        </div>
        <div className="ws-header-actions">
          <button onClick={cargarAlertas} disabled={loading}>{loading ? 'Actualizando...' : 'Actualizar'}</button>
        </div>
      </div>

      <section className="ws-section">
        <div className="alerts-summary">
          <div><span>Criticas</span><strong>{resumen.criticas}</strong></div>
          <div><span>Avisos</span><strong>{resumen.avisos}</strong></div>
          <div><span>Abiertas</span><strong>{resumen.abiertas}</strong></div>
          <div><span>En progreso</span><strong>{resumen.progreso}</strong></div>
        </div>

        <div className="alerts-toolbar">
          <label>
            Estado
            <select value={estado} onChange={e => setEstado(e.target.value)}>
              {ESTADOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Severidad
            <select value={severidad} onChange={e => setSeveridad(e.target.value)}>
              {SEVERIDADES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Buscar
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Restaurante, alerta, accion..." />
          </label>
        </div>

        {mensaje && <p className="admin-alert">{mensaje}</p>}

        <div className="alerts-list">
          {visibles.map(alerta => (
            <article className={`alert-work-card is-${alerta.severidad}`} key={alerta.id}>
              <div className="alert-work-main">
                <div className="alert-work-head">
                  <span>{alerta.severidad}</span>
                  <strong>{alerta.titulo}</strong>
                  <em>{alerta.estado.replace('_', ' ')}</em>
                </div>
                <p>{alerta.detalle}</p>
                {alerta.impacto && <small>Impacto: {alerta.impacto}</small>}
                {alerta.accion_sugerida && <small>Accion: {alerta.accion_sugerida}</small>}
                <div className="alert-work-meta">
                  <Link href={`/admin/restaurante/${alerta.restaurante_id}`}>{alerta.restaurantes?.nombre || 'Restaurante'}</Link>
                  <span>{haceDias(alerta.created_at)}</span>
                  <span>{Number(alerta.veces_detectada || 1)} detecciones</span>
                  {alerta.asignado_a && <span>Asignada a {alerta.asignado_a}</span>}
                </div>
                {historialPorAlerta[alerta.id]?.length > 0 && (
                  <details className="alert-history">
                    <summary>Historial ({historialPorAlerta[alerta.id].length})</summary>
                    {historialPorAlerta[alerta.id].slice(0, 4).map(item => (
                      <div key={item.id}>
                        <span>{item.accion}: {item.estado_anterior || '-'} a {item.estado_nuevo || '-'}</span>
                        <small>{item.comentario || 'Sin comentario'} · {haceDias(item.created_at)}</small>
                      </div>
                    ))}
                  </details>
                )}
              </div>
              <div className="alert-work-actions">
                <button className="admin-open-detail" onClick={() => setAlertaActiva(alerta)}>Abrir detalle</button>
              </div>
            </article>
          ))}
          {!visibles.length && <div className="ws-empty-block">No hay alertas con estos filtros.</div>}
        </div>
      </section>
      <AdminOverlay
        open={Boolean(alertaActiva)}
        onClose={() => !accionando && setAlertaActiva(null)}
        eyebrow={alertaActiva?.severidad}
        title={alertaActiva?.titulo || 'Detalle de alerta'}
        description={`${alertaActiva?.restaurantes?.nombre || 'Restaurante'} · ${alertaActiva?.estado?.replace('_', ' ') || ''}`}
      >
        {alertaActiva && (
          <div className="admin-detail-stack">
            <div className="admin-detail-box">
              <h3>Diagnóstico</h3>
              <p>{alertaActiva.detalle}</p>
            </div>
            {alertaActiva.impacto && (
              <div className="admin-detail-box">
                <h3>Impacto</h3>
                <p>{alertaActiva.impacto}</p>
              </div>
            )}
            {alertaActiva.accion_sugerida && (
              <div className="admin-detail-box">
                <h3>Acción sugerida</h3>
                <p>{alertaActiva.accion_sugerida}</p>
              </div>
            )}
            <div className="alert-work-meta">
              <Link href={`/admin/restaurante/${alertaActiva.restaurante_id}`}>Abrir restaurante</Link>
              <span>{haceDias(alertaActiva.created_at)}</span>
              <span>{Number(alertaActiva.veces_detectada || 1)} detecciones</span>
            </div>
            {historialPorAlerta[alertaActiva.id]?.length > 0 && (
              <div className="admin-detail-box">
                <h3>Historial</h3>
                {historialPorAlerta[alertaActiva.id].slice(0, 6).map(item => (
                  <p key={item.id}>{item.accion}: {item.estado_anterior || '-'} → {item.estado_nuevo || '-'} · {item.comentario || 'Sin comentario'}</p>
                ))}
              </div>
            )}
            <div className="admin-overlay-actions">
              <button disabled={accionando === alertaActiva.id} onClick={() => actualizarAlerta(alertaActiva, 'en_progreso', 'Trabajo iniciado.')}>En progreso</button>
              <button disabled={accionando === alertaActiva.id} onClick={() => crearPropuesta(alertaActiva)}>Crear propuesta</button>
              <button disabled={accionando === alertaActiva.id} onClick={() => actualizarAlerta(alertaActiva, 'resuelta', 'Resuelta desde bandeja de alertas.')}>Resolver</button>
              <button disabled={accionando === alertaActiva.id} onClick={() => actualizarAlerta(alertaActiva, 'descartada', 'Descartada desde bandeja de alertas.')}>Descartar</button>
            </div>
          </div>
        )}
      </AdminOverlay>
    </div>
  )
}
