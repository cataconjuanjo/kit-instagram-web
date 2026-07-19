import Link from 'next/link'

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8f3eb', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 520, textAlign: 'center' }}>
        <p style={{ color: '#74223d', fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Error 404</p>
        <h1 style={{ margin: '0 0 12px', color: '#222', fontSize: 30 }}>Esta página no existe.</h1>
        <p style={{ color: '#625a53', lineHeight: 1.6 }}>Puede que el enlace haya cambiado o que la carta ya no esté disponible.</p>
        <Link href="/" style={{ minHeight: 42, display: 'inline-flex', alignItems: 'center', marginTop: 16, borderRadius: 8, background: '#74223d', color: '#fff', padding: '0 18px', textDecoration: 'none', fontWeight: 850 }}>Volver al inicio</Link>
      </section>
    </main>
  )
}
