'use client'

import { useEffect, useState } from 'react'
import styles from './CollapsibleSection.module.css'

export default function CollapsibleSection({ storageKey, eyebrow, title, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = `${storageKey}-body`

  useEffect(() => {
    const stored = localStorage.getItem(`collapsible_${storageKey}`)
    if (stored !== null) setOpen(stored === 'true')
  }, [storageKey])

  function toggle() {
    const next = !open
    setOpen(next)
    localStorage.setItem(`collapsible_${storageKey}`, String(next))
  }

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <div className={styles.triggerLeft}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h2 className={styles.title}>{title}</h2>
        </div>
        <div className={styles.triggerRight}>
          {badge && <span className={styles.badge}>{badge}</span>}
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.5 6.75L9 11.25L13.5 6.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>
      <div
        id={bodyId}
        className={`${styles.body} ${open ? styles.bodyOpen : ''}`}
        aria-hidden={!open}
      >
        <div className={styles.inner}>
          {children}
        </div>
      </div>
    </section>
  )
}
