'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'
import styles from './demo.module.css'

const EVENT_LABELS = {
  demo_page_view: 'Vista demo',
  demo_start: 'Inicio guiado',
  demo_role_open: 'Rol abierto',
  demo_contact_click: 'Contacto',
  demo_landing_click: 'CTA landing',
}

const ROLE_LABELS = {
  cliente: 'Cliente',
  camarero: 'Camarero',
  gerente: 'Gerente',
  contacto: 'Contacto',
  landing: 'Landing',
  inicio: 'Inicio',
  sin_dato: 'Sin dato',
}

const DEVICE_LABELS = {
  mobile: 'Movil',
  tablet: 'Tablet',
  desktop: 'Desktop',
  unknown: 'Sin dato',
}

function pct(value, total) {
  if (!total) return '0%'
  return `${Math.round((Number(value || 0) / total) * 100)}%`
}

function fechaHora(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function stat(value) {
  return Number(value || 0).toLocaleString('es-ES')
}

function entriesSorted(obj = {}) {
  return Object.entries(obj).sort((a, b) => Number(b[1]) - Number(a[1]))
}

export default function AdminDemoAnalytics() {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user || !isAdminEmail(userData.user.email)) {
        window.location.href = '/login'
        return
      }
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token || ''
      const res = await fetch(`/api/admin/demo-analytics?demo=taberna-del-puerto&days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'No se pudo cargar el embudo.')
      setData(payload)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el embudo.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    cargar()
  }, [cargar])

  const funnel = data?.funnel || {}
  const roleRows = useMemo(() => entriesSorted(funnel.by_role), [funnel.by_role])
  const deviceRows = useMemo(() => entriesSorted(funnel.by_device), [funnel.by_device])
  const sourceRows = useMemo(() => entriesSorted(funnel.by_source).slice(0, 6), [funnel.by_source])
  const dailyMax = useMemo(() => Math.max(1, ...(funnel.daily || []).map(item => item.total || 0)), [funnel.daily])
  const baseAwareness = Math.max(Number(funnel.page_views || 0), Number(funnel.landing_clicks || 0))

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Analitica comercial</p>
          <h1>Embudo de demo</h1>
          <p>Lectura rapida del recorrido La Taberna del Puerto: landing, inicio guiado, roles abiertos y contacto.</p>
        </div>
        <div className={styles.actions}>
          <select value={days} onChange={event => setDays(Number(event.target.value))} aria-label="Rango de fechas">
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <button type="button" onClick={cargar} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </header>

      {data?.migration_pending && (
        <section className={styles.notice}>
          <strong>Migracion pendiente</strong>
          <p>Aplica <code>{data.sql}</code> en Supabase para empezar a guardar eventos reales.</p>
        </section>
      )}

      {error && <section className={styles.error}>{error}</section>}

      <section className={styles.statsGrid} aria-label="Resumen del embudo">
        <StatCard label="Vistas demo" value={funnel.page_views} detail={`${pct(funnel.starts, baseAwareness)} llegan a inicio`} />
        <StatCard label="CTA landing" value={funnel.landing_clicks} detail="Entradas desde Carta Viva" />
        <StatCard label="Inicio guiado" value={funnel.starts} detail={`${pct(funnel.role_opens, Math.max(1, funnel.starts))} siguen a rol`} />
        <StatCard label="Contacto" value={funnel.contact_clicks} detail={`${pct(funnel.contact_clicks, Math.max(1, funnel.starts))} sobre inicios`} />
      </section>

      <section className={styles.gridTwo}>
        <Panel title="Aperturas por rol" empty={!roleRows.length}>
          {roleRows.map(([role, value]) => (
            <BarRow
              key={role}
              label={ROLE_LABELS[role] || role}
              value={value}
              max={Math.max(1, ...roleRows.map(([, count]) => count))}
            />
          ))}
        </Panel>

        <Panel title="Dispositivo" empty={!deviceRows.length}>
          {deviceRows.map(([device, value]) => (
            <BarRow
              key={device}
              label={DEVICE_LABELS[device] || device}
              value={value}
              max={Math.max(1, ...deviceRows.map(([, count]) => count))}
            />
          ))}
        </Panel>
      </section>

      <section className={styles.gridTwo}>
        <Panel title="Actividad diaria" empty={!(funnel.daily || []).length}>
          <div className={styles.dayChart}>
            {(funnel.daily || []).map(item => (
              <div key={item.date} className={styles.dayRow}>
                <span>{item.date.slice(5)}</span>
                <div><i style={{ width: `${Math.max(4, (item.total / dailyMax) * 100)}%` }} /></div>
                <strong>{item.total}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Origen" empty={!sourceRows.length}>
          {sourceRows.map(([source, value]) => (
            <BarRow
              key={source}
              label={source || 'Sin dato'}
              value={value}
              max={Math.max(1, ...sourceRows.map(([, count]) => count))}
            />
          ))}
        </Panel>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Eventos recientes</h2>
          <span>{stat(funnel.recent?.length || 0)}</span>
        </div>
        {funnel.recent?.length ? (
          <div className={styles.eventList}>
            {funnel.recent.map(event => (
              <article key={event.id}>
                <strong>{EVENT_LABELS[event.event] || event.event}</strong>
                <span>{ROLE_LABELS[event.role] || event.role || 'Sin rol'}</span>
                <small>{event.source || 'sin origen'} · {fechaHora(event.created_at)}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Todavia no hay eventos para este periodo.</p>
        )}
      </section>
    </main>
  )
}

function StatCard({ label, value, detail }) {
  return (
    <article className={styles.statCard}>
      <span>{label}</span>
      <strong>{stat(value)}</strong>
      <p>{detail}</p>
    </article>
  )
}

function Panel({ title, empty, children }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{title}</h2>
      </div>
      {empty ? <p className={styles.empty}>Sin datos todavia.</p> : children}
    </section>
  )
}

function BarRow({ label, value, max }) {
  return (
    <div className={styles.barRow}>
      <div>
        <span>{label}</span>
        <strong>{stat(value)}</strong>
      </div>
      <i style={{ width: `${Math.max(4, (Number(value || 0) / max) * 100)}%` }} />
    </div>
  )
}
