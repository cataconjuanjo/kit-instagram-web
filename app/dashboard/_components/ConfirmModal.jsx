'use client'

import { useEffect, useId, useRef } from 'react'

/**
 * Diálogo de confirmación modal accesible.
 *
 * Patrón:
 * - Overlay = <button aria-label=...> (no un <div onClick>) para satisfacer
 *   jsx-a11y sin disables y ser pulsable por teclado.
 * - Dialog = <div role="dialog" aria-modal aria-labelledby>.
 * - Escape cierra (listener global registrado solo mientras open).
 * - Focus inicial en "Cancelar" vía ref (sin autoFocus).
 *
 * Reemplaza a window.confirm() y a modales caseros con riesgos de identificadores
 * no definidos (el bug "styles is not defined" en Libro de Compras venía de ahí).
 */
export default function ConfirmModal({
  open,
  title,
  onCancel,
  onConfirm,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmTone = 'primary', // 'primary' | 'danger'
  busy = false,
  overlayAriaLabel = 'Cerrar sin confirmar',
  children,
}) {
  const titleId = useId()
  const cancelRef = useRef(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  const confirmBg = confirmTone === 'danger' ? '#c0392b' : '#1a1a1a'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <button
        type="button"
        aria-label={overlayAriaLabel}
        onClick={() => { if (!busy) onCancel() }}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
          border: 'none', padding: 0, cursor: busy ? 'not-allowed' : 'pointer',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: 'relative', zIndex: 1,
          background: '#fff', borderRadius: 10, padding: 24,
          maxWidth: 440, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}
      >
        <h3 id={titleId} style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>
          {title}
        </h3>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: '#1a1a1a' }}>
          {children}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '8px 16px', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer',
              background: '#fff', color: '#1a1a1a',
              border: '1px solid #d8d3c8', borderRadius: 4, fontWeight: 500,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '8px 16px', fontSize: 13,
              background: busy ? '#bbb' : confirmBg,
              color: '#fff', border: 'none', borderRadius: 4,
              cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
