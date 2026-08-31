'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'

function fechaCorta(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function SimuladorRevisionesAdmin() {
  const [cargando, setCargando] = useState(true)
  const [revisiones, setRevisiones] = useState([])
  const [token, setToken] = useState(null)
  const [respondiendo, setRespondiendo] = useState(null)  // { id, restaurante, respuesta }
  const [guardando, setGuardando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user || !isAdminEmail(session.user.email)) {
        window.location.href = '/login'
        return
      }
      const t = session.access_token
      setToken(t)
      await cargar(t)
    }
    init()
  }, [])

  async function cargar(t) {
    setCargando(true)
    const res = await fetch('/api/admin/simulador-revisiones', {
      headers: { Authorization: `Bearer ${t}` },
    }).catch(() => null)
    if (res?.ok) {
      const json = await res.json()
      setRevisiones(json.revisiones || [])
    }
    setCargando(false)
  }

  async function responder() {
    if (!respondiendo?.id) return
    setGuardando(true)
    setErrorMsg('')
    const res = await fetch('/api/admin/simulador-revisiones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: respondiendo.id, respuesta_consultor: respondiendo.respuesta }),
    }).catch(() => null)
    setGuardando(false)
    if (!res?.ok) {
      const json = res ? await res.json().catch(() => null) : null
      setErrorMsg(json?.error || 'No se pudo guardar la respuesta.')
      return
    }
    setRespondiendo(null)
    await cargar(token)
  }

  if (cargando) return <p style={{ padding: 32, color: '#766e64' }}>Cargando revisiones…</p>

  const pendientes = revisiones.filter(r => r.estado === 'pendiente')
  const revisadas  = revisiones.filter(r => r.estado === 'revisado')

  const card = (r) => (
    <div key={r.id} style={{
      background: '#fffaf3', border: '1px solid #dfd6c8', borderRadius: 8, padding: '16px 18px', marginBottom: 12,
      borderLeft: r.estado === 'pendiente' ? '4px solid #C9A24B' : '4px solid #c8d8c0',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#171416' }}>
            {r.restaurantes?.nombre || r.restaurante_id}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8b8278' }}>
            {fechaCorta(r.created_at)}
            {r.restaurantes?.email && ` · ${r.restaurantes.email}`}
          </p>
        </div>
        <span style={{
          display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          background: r.estado === 'pendiente' ? 'rgba(201,162,75,0.15)' : 'rgba(76,140,90,0.12)',
          color: r.estado === 'pendiente' ? '#7a5c1a' : '#2e6640',
        }}>
          {r.estado}
        </span>
      </div>

      {r.mensaje_restaurante && (
        <div style={{ margin: '12px 0 0', paddingLeft: 12, borderLeft: '2px solid #dfd6c8' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#5a4a38', fontStyle: 'italic', lineHeight: 1.5 }}>
            {r.mensaje_restaurante}
          </p>
        </div>
      )}

      {r.respuesta_consultor && (
        <div style={{ margin: '10px 0 0', paddingLeft: 12, borderLeft: '2px solid #a8c4a8' }}>
          <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#4a7a58' }}>
            Tu respuesta
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#384a3a', lineHeight: 1.5 }}>
            {r.respuesta_consultor}
          </p>
        </div>
      )}

      {r.estado === 'pendiente' && respondiendo?.id !== r.id && (
        <button
          style={{
            marginTop: 14, padding: '6px 14px', border: '1px solid #d8c898', borderRadius: 6,
            background: '#fffaf3', color: '#74223d', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
          onClick={() => setRespondiendo({ id: r.id, restaurante: r.restaurantes?.nombre, respuesta: '' })}
        >
          Responder
        </button>
      )}

      {respondiendo?.id === r.id && (
        <div style={{ marginTop: 12 }}>
          <textarea
            rows={4}
            placeholder="Escribe tu feedback al restaurante…"
            value={respondiendo.respuesta}
            onChange={e => setRespondiendo({ ...respondiendo, respuesta: e.target.value })}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
              border: '1px solid #dfd6c8', borderRadius: 6, background: '#fff', color: '#171416',
              fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', outline: 'none',
            }}
          />
          {errorMsg && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b03030' }}>{errorMsg}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              disabled={guardando || !respondiendo.respuesta.trim()}
              onClick={responder}
              style={{
                padding: '7px 16px', border: 'none', borderRadius: 6,
                background: '#74223d', color: '#fffaf3', fontSize: 13, fontWeight: 700,
                cursor: guardando ? 'wait' : 'pointer', opacity: (!respondiendo.respuesta.trim() || guardando) ? 0.55 : 1,
              }}
            >
              {guardando ? 'Guardando…' : 'Enviar respuesta'}
            </button>
            <button
              onClick={() => { setRespondiendo(null); setErrorMsg('') }}
              style={{
                padding: '7px 14px', border: '1px solid #dfd6c8', borderRadius: 6,
                background: 'transparent', color: '#766e64', fontSize: 13, cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9b7430' }}>
        Admin · Simulador
      </p>
      <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700, color: '#171416' }}>
        Revisiones de borrador
      </h1>

      {pendientes.length === 0 && revisadas.length === 0 && (
        <p style={{ color: '#817970', fontSize: 14 }}>No hay revisiones todavía.</p>
      )}

      {pendientes.length > 0 && (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C9A24B' }}>
            Pendientes ({pendientes.length})
          </p>
          {pendientes.map(card)}
        </>
      )}

      {revisadas.length > 0 && (
        <>
          <p style={{ margin: `${pendientes.length ? 24 : 0}px 0 10px`, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b8278' }}>
            Revisadas ({revisadas.length})
          </p>
          {revisadas.map(card)}
        </>
      )}
    </div>
  )
}
