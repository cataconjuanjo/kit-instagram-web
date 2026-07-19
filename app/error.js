'use client'

import { useEffect } from 'react'

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        digest: error?.digest || '',
        message: error?.message || 'Error de interfaz',
        path: window.location.pathname,
      }),
    }).catch(() => {})
  }, [error])

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>Carta Viva</p>
        <h1 style={styles.title}>Algo no ha cargado correctamente.</h1>
        <p style={styles.text}>
          Tus datos no se han borrado. Reintenta la pantalla y, si continúa, vuelve al inicio del panel.
        </p>
        <div style={styles.actions}>
          <button type="button" onClick={reset} style={styles.primary}>Reintentar</button>
          <a href="/dashboard" style={styles.secondary}>Volver al inicio</a>
        </div>
        {error?.digest && <small style={styles.code}>Referencia: {error.digest}</small>}
      </section>
    </main>
  )
}

const styles = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8f3eb', padding: 20, fontFamily: 'system-ui, sans-serif' },
  card: { width: 'min(520px, 100%)', border: '1px solid #ddd6cb', borderRadius: 12, background: '#fffdf8', padding: 28 },
  eyebrow: { margin: '0 0 10px', color: '#74223d', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' },
  title: { margin: 0, color: '#222', fontSize: 26, lineHeight: 1.15 },
  text: { margin: '12px 0 0', color: '#625a53', fontSize: 14, lineHeight: 1.6 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  primary: { minHeight: 42, border: 0, borderRadius: 8, background: '#74223d', color: '#fff', padding: '0 16px', cursor: 'pointer', fontWeight: 850 },
  secondary: { minHeight: 42, display: 'inline-flex', alignItems: 'center', border: '1px solid #ddd6cb', borderRadius: 8, color: '#222', padding: '0 16px', textDecoration: 'none', fontWeight: 850 },
  code: { display: 'block', marginTop: 18, color: '#8b8278', fontSize: 11 },
}
