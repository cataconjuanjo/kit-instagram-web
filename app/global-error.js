'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        digest: error?.digest || '',
        message: error?.message || 'Error global',
        path: typeof window !== 'undefined' ? window.location.pathname : '',
      }),
    }).catch(() => {})
  }, [error])

  return (
    <html lang="es">
      <body style={{ margin: 0 }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#171416', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
          <section style={{ width: 'min(500px, 100%)', color: '#fffaf3', textAlign: 'center' }}>
            <p style={{ color: '#bfa984', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Carta Viva</p>
            <h1 style={{ margin: '0 0 12px', fontSize: 28 }}>No hemos podido abrir esta pantalla.</h1>
            <p style={{ color: 'rgba(255,250,243,0.65)', lineHeight: 1.6 }}>Reintenta ahora. Si el problema continúa, puedes volver a la web sin perder información.</p>
            <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
              <button type="button" onClick={reset} style={{ minHeight: 42, border: 0, borderRadius: 8, background: '#fffaf3', color: '#171416', padding: '0 16px', cursor: 'pointer', fontWeight: 850 }}>Reintentar</button>
              <Link href="/" style={{ minHeight: 42, display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(255,250,243,0.25)', borderRadius: 8, color: '#fffaf3', padding: '0 16px', textDecoration: 'none', fontWeight: 850 }}>Ir a la web</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  )
}
