'use client'

import { useState } from 'react'
import styles from './module.module.css'

export function LoadingState() {
  return (
    <div className={styles.loading}>
      <p className={styles.loadingText}>Cargando</p>
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
        {helpOpen && <ModuleHelp help={help} />}
        {children}
      </div>
    </main>
  )
}
