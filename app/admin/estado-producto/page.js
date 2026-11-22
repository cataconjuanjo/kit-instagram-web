'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'
import AdminOverlay from '../components/AdminOverlay'

function etiquetaCheck(estado) {
  if (estado === 'ok' || estado === 'listo') return 'LISTO'
  if (estado === 'warning' || estado === 'aviso') return 'AVISO'
  if (estado === 'blocker' || estado === 'bloqueado') return 'BLOQUEO'
  return estado || '-'
}

function claseCheck(estado) {
  if (estado === 'ok' || estado === 'listo') return 'is-ok'
  if (estado === 'warning' || estado === 'aviso') return 'is-warning'
  return 'is-hot'
}

export default function AdminEstadoProductoPage() {
  const [user, setUser] = useState(null)
  const [cierre, setCierre] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) { window.location.href = '/login'; return }
      setUser(user)
      const { data: session } = await supabase.auth.getSession()
      const token = session?.session?.access_token || ''
      try {
        const res = await fetch('/api/admin/radar-ejecutivo', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data = await res.json()
          setCierre(data?.cierre_producto || null)
        }
      } catch {}
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <p className="admin-loading">Cargando estado del producto…</p>
  if (!user) return null

  const checks = cierre?.checks || []
  const resumen = cierre?.resumen || {}

  return (
    <AdminOverlay>
      <div className="admin-main">
        <div className="ws-header">
          <div className="ws-header-left">
            <Link href="/admin/consultoria" className="ws-back">Radar</Link>
            <div>
              <h2 className="ws-title">Estado del producto</h2>
              <span className="ws-sub">Checks internos de preparación del producto. Mide el producto, no el trabajo del consultor.</span>
            </div>
          </div>
        </div>

        <section className="ws-section">
          <div className="product-readiness-panel">
            <div className="product-readiness-head">
              <div>
                <h3>Cierre de producto</h3>
                <p>{resumen.ok || 0}/{resumen.total_checks || 0} checks listos · {resumen.blockers || 0} bloqueos · {resumen.warnings || 0} avisos.</p>
              </div>
              <div className="product-readiness-score">
                <strong>{cierre?.score || 0}%</strong>
                <span className={`radar-tag ${claseCheck(cierre?.estado)}`}>{etiquetaCheck(cierre?.estado)}</span>
              </div>
            </div>
            <div className="product-readiness-grid">
              {checks.map(check => (
                <article key={check.id} className="product-readiness-check">
                  <span className={`radar-tag ${claseCheck(check.estado)}`}>{etiquetaCheck(check.estado)}</span>
                  <strong>{check.titulo}</strong>
                  <p>{check.detalle}</p>
                  <small>{check.accion}</small>
                </article>
              ))}
              {checks.length === 0 && <p>No hay checks registrados todavía.</p>}
            </div>
          </div>
        </section>
      </div>
    </AdminOverlay>
  )
}
