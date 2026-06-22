'use client'

import ResponsiveOverlay from './ResponsiveOverlay'
import styles from './module.module.css'

export default function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  busy = false,
  children,
}) {
  return (
    <ResponsiveOverlay
      open={open}
      onClose={() => !busy && onClose()}
      size="modal"
      eyebrow="Confirmación"
      title={title}
      description={description}
      footer={
        <>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className={styles.danger} onClick={onConfirm} disabled={busy}>
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </ResponsiveOverlay>
  )
}
