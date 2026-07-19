import Link from 'next/link'
import LeadForm from '../components/LeadForm'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

export const metadata = {
  title: 'Formación de sala en vino para restaurantes',
  description: 'Formación de sala en vino para restaurantes: recomendaciones, maridaje, servicio y argumentos sencillos para vender mejor la carta.',
  alternates: {
    canonical: '/formación-sala',
  },
  openGraph: {
    title: 'Formación de sala en vino para restaurantes · Cata con Juanjo',
    description: 'Entrenamiento práctico sobre la carta real del restaurante para que sala recomiende vino con seguridad.',
    url: '/formación-sala',
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
  },
}

const modulos = [
  ['Lectura de carta', 'Qué vinos defender, que estilos explicar y como ordenar la recomendacion por platos.'],
  ['Frases de servicio', 'Argumentos cortos para vender sin sonar técnico ni forzado.'],
  ['Objeciones reales', 'Respuestas para precio, estilos suaves, desconocimiento o miedo a fallar.'],
  ['Rutina de seguimiento', 'Dudas de sala, vinos que no rotan y ajustes despues del servicio.'],
]

export default function FormacionSalaPage() {
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Formación de sala en vino para restaurantes',
    provider: {
      '@type': 'LocalBusiness',
      name: 'Cata con Juanjo',
      url: 'https://cataconjuanjo.com',
    },
    areaServed: ['Málaga', 'Andalucía', 'España'],
    serviceType: 'Formación de sala y consultoria de vino',
    description: metadata.description,
  }

  return (
    <main className="site-shell service-landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <PublicNav active="home" eyebrow="Formación de sala" />

      <section className="hero service-hero">
        <div className="hero-copy">
          <p className="eyebrow">Formación de sala en vino</p>
          <h1>Tu equipo puede vender más vino sin aprenderse una enciclopedia.</h1>
          <p className="lead">
            Sesiones prácticas sobre la carta real del restaurante: que recomendar, como explicarlo y como convertir
            dudas del cliente en una venta natural.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Pedir propuesta</Link>
            <Link href="/recursos/formacion-sala-vino-restaurante" className="btn btn-secondary">Leer guía</Link>
          </div>
        </div>
        <aside className="hero-panel">
          <p className="panel-label">Formato práctico</p>
          <h2>Sobre tu carta, tu cocina y tu equipo</h2>
          <p>
            No es una clase genérica de vino. Se trabaja con referencias reales, platos reales y situaciones reales
            de servicio para que sala salga con frases listas para usar.
          </p>
        </aside>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="eyebrow">Qué incluye</p>
          <h2>Una formación pensada para servicio, margen y confianza.</h2>
        </div>
        <div className="service-grid">
          {modulos.map(([titulo, texto]) => (
            <article className="service-card" key={titulo}>
              <span className="card-mark" />
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section split proof-section">
        <div>
          <p className="eyebrow">Para quien</p>
          <h2>Restaurantes que tienen buena carta, pero no siempre consiguen venderla.</h2>
        </div>
        <div className="copy-stack">
          <p>
            Encaja cuando el equipo duda al recomendar, cuando hay vinos parados, cuando las referencias nuevas no se
            explican bien o cuando el restaurante quiere subir ticket medio sin presionar al cliente.
          </p>
          <p>
            Puede hacerse como sesion puntual, refuerzo de temporada o parte de una consultoria completa de carta y
            bodega.
          </p>
        </div>
      </section>

      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Contacto</p>
          <h2>Cuéntame como trabaja tu sala.</h2>
          <p>
            Dime tipo de restaurante, numero de personas en sala y qué quieres mejorar primero. Te propongo un formato.
          </p>
        </div>
        <LeadForm
          source="Landing formación de sala"
          cta="Solicitar formación"
          title="Datos para preparar la propuesta"
          problemaLabel="Objetivo principal"
          problemaOptions={[
            'Sala no recomienda vino con seguridad',
            'Quiero vender más vino por copa',
            'Tengo referencias paradas',
            'Voy a cambiar la carta',
            'Necesito formar equipo nuevo',
          ]}
          mensajeLabel="Qué debería saber de tu equipo"
        />
      </section>

      <PublicFooter />
    </main>
  )
}
