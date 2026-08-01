import Link from 'next/link'
import PublicNav from './components/PublicNav'
import PublicFooter from './components/PublicFooter'

export const metadata = {
  title: 'Página no encontrada · Cata con Juanjo',
}

export default function NotFound() {
  return (
    <main className="site-shell">
      <PublicNav />
      <section className="section" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 520 }}>
          <p className="eyebrow">Error 404</p>
          <h1 style={{ fontSize: 'clamp(2rem, 4.2vw, 4rem)', marginBottom: '1rem' }}>
            Esta página no existe.
          </h1>
          <p className="lead" style={{ marginBottom: '2rem' }}>
            Puede que el enlace haya cambiado o que la carta ya no esté disponible.
          </p>
          <Link href="/" className="btn btn-primary">Volver al inicio</Link>
        </div>
      </section>
      <PublicFooter />
    </main>
  )
}
