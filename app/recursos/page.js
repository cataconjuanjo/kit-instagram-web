import Link from 'next/link'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { recursos } from './content'

export const metadata = {
  title: 'Recursos sobre cartas de vino, bodega y gestión de sala',
  description: 'Guías prácticas para restaurantes: rentabilidad de carta, inventario inteligente, venta por copa, sala, bodega y oportunidad económica.',
  alternates: {
    canonical: '/recursos',
  },
  openGraph: {
    title: 'Recursos de vino para restaurantes',
    description: 'Contenido práctico para vender y gestionar mejor el vino en restaurantes, con criterio de carta, bodega y sala.',
    url: '/recursos',
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
  },
}

export default function RecursosPage() {
  return (
    <main className="site-shell resources-page">
      <PublicNav active="recursos" eyebrow="Recursos de vino" />

      <section className="resources-hero">
        <div>
          <p className="eyebrow">Blog y recursos</p>
          <h1>Guías prácticas para vender y gestionar mejor el vino.</h1>
          <p className="lead">
            Ideas nacidas del trabajo con cartas, bodegas y equipos de sala:
            carta rentable, inventario inteligente, venta por copa, formación y oportunidad económica.
          </p>
        </div>
      </section>

      <section className="section resources-grid-section">
        <div className="resource-grid">
          {recursos.map((recurso) => (
            <article className="resource-card" key={recurso.slug}>
              <div>
                <span className="resource-category">{recurso.category}</span>
                <h2>{recurso.title}</h2>
                <p>{recurso.description}</p>
              </div>
              <div className="resource-meta">
                <span>{recurso.intent}</span>
                <span>{recurso.readingTime}</span>
              </div>
              <Link href={`/recursos/${recurso.slug}`} className="btn btn-secondary">Leer guía</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section resource-cta-band">
        <div>
          <p className="eyebrow">Diagnóstico privado</p>
          <h2>Si quieres pasar de leer a decidir, revisamos tu carta.</h2>
        </div>
        <Link href="/#contacto" className="btn btn-primary">Solicitar diagnóstico</Link>
      </section>

      <PublicFooter />
    </main>
  )
}
