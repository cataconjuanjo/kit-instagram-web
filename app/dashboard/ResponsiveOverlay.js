'use client'

import { useEffect, useId, useRef } from 'react'
import styles from './responsiveOverlay.module.css'

export default function ResponsiveOverlay({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  size = 'drawer',
}) {
  const titleId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'

    const handleKeyDown = event => {
      if (event.key === 'Escape') onCloseRef.current?.()
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    requestAnimationFrame(() => {
      panelRef.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')?.focus()
    })

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className={styles.backdrop} onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
      <section
        ref={panelRef}
        className={`${styles.panel} ${size === 'modal' ? styles.modal : styles.drawer}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <div>
            {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </section>
    </div>
  )
}
