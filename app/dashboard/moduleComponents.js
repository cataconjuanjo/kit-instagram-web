'use client'

import { useState } from 'react'
import Link from 'next/link'
import { nombrePlan, puedeUsar } from '../lib/plans'
import styles from './module.module.css'
import { useGuideMode } from './GuideMode'

export function LoadingState() {
  return (
    <div className={styles.loading}>
      <p className={styles.loadingText}>Cargando</p>
    </div>
  )
}

export function MetricInfo({ title, children }) {
  if (!children) return null

  return (
    <details className={styles.metricInfo}>
      <summary aria-label={`Explicar ${title || 'metrica'}`} title="Que significa este dato">
        i
      </summary>
      <div className={styles.metricInfoBubble}>
        {title && <strong>{title}</strong>}
        <p>{children}</p>
      </div>
    </details>
  )
}

export function StatCard({ value, label, info, hint, valueStyle }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statTop}>
        <p className={styles.statValue} style={valueStyle}>{value}</p>
        <MetricInfo title={label}>{info}</MetricInfo>
      </div>
      <p className={styles.statLabel}>{label}</p>
      {hint && <p className={styles.statHint}>{hint}</p>}
    </div>
  )
}

function ModuleHelp({ help }) {
  if (!help) return null

  const items = Array.isArray(help.items) ? help.items : []

  return (
    <section className={styles.helpBox}>
      <div>
        <p className={styles.eyebrow}>{help.eyebrow || 'Ayuda'}</p>
        <h2>{help.title || 'Cómo usar esta pantalla'}</h2>
        {help.intro && <p>{help.intro}</p>}
      </div>
      {items.length > 0 && (
        <div className={styles.helpGrid}>
          {items.map(item => (
            <article key={item.title || item}>
              {item.title && <h3>{item.title}</h3>}
              <p>{item.text || item}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function ModuleShell({ restaurante, eyebrow, title, subtitle, actions, help, children, narrow = false }) {
  const [helpOpen, setHelpOpen] = useState(false)
  const { enabled: guideEnabled } = useGuideMode()

  return (
    <main className={styles.shell}>
      <div className={`${styles.wrap} ${narrow ? styles.narrow : ''}`}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.lead}>{subtitle}</p>}
          </div>
          {(actions || help) && (
            <div className={styles.heroActions}>
              {actions}
              {help && (
                <button
                  type="button"
                  className={styles.helpButton}
                  onClick={() => setHelpOpen(!helpOpen)}
                  aria-expanded={helpOpen}
                  aria-label={helpOpen ? 'Cerrar ayuda' : 'Abrir ayuda'}
                  title={helpOpen ? 'Cerrar ayuda' : 'Ayuda'}
                >
                  i
                </button>
              )}
            </div>
          )}
        </section>
        {(helpOpen || guideEnabled) && <ModuleHelp help={help} />}
        {children}
      </div>
    </main>
  )
}

export function FeatureGate({ restaurante, feature, title = 'Funcion no incluida', children }) {
  if (!restaurante) return null
  if (puedeUsar(restaurante, feature)) return children

  const estado = restaurante.subscription_status || 'trialing'
  const textoEstado = ['past_due', 'cancelled'].includes(estado)
    ? 'La suscripcion no esta activa. Actualiza el estado desde administracion para recuperar el acceso.'
    : `Esta pantalla no esta incluida en el plan ${nombrePlan(restaurante)}.`

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Plan"
      title={title}
      subtitle={textoEstado}
      actions={<Link className={styles.secondary} href="/dashboard">Volver al inicio</Link>}
      narrow
    >
      <section className={styles.empty}>
        <div>
          <strong>Disponible al subir de plan</strong>
          <p>El acceso queda bloqueado para esta cuenta, aunque conozca la URL directa.</p>
        </div>
      </section>
    </ModuleShell>
  )
}
