'use client'

import { useEffect, useId, useRef } from 'react'

export default function AdminOverlay({
  open,
  onClose,
  eyebrow,
  title,
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

    function onKeyDown(event) {
      if (event.key === 'Escape') onCloseRef.current?.()
      if (event.key !== 'Tab' || !panelRef.current) return
      const elements = panelRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => {
      panelRef.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')?.focus()
    })

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="admin-overlay-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose?.()}>
      <section
        ref={panelRef}
        className={`admin-overlay-panel is-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-overlay-header">
          <div>
            {eyebrow && <p className="admin-kicker">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="admin-overlay-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="admin-overlay-body">{children}</div>
        {footer && <footer className="admin-overlay-footer">{footer}</footer>}
      </section>
    </div>
  )
}
