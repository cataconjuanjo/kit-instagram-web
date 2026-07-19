import Link from 'next/link'
import LeadForm from './components/LeadForm'
import PublicNav from './components/PublicNav'
import PublicFooter from './components/PublicFooter'
import AuthHashRedirect from './components/AuthHashRedirect'
import { recursos } from './recursos/content'

export const metadata = {
  alternates: {
    canonical: '/',
  },
}

const servicios = [
  {
    titulo: 'Auditoría de carta y bodega',
    texto: 'Analizo referencias, rotación, stock, márgenes, estructura de precios y coherencia con el concepto del local.',
  },
  {
    titulo: 'Rediseño de carta de vinos',
    texto: 'Construyo una carta clara, vendible y con narrativa: categorías, estilos, maridajes y vinos que el equipo puede defender.',
  },
  {
    titulo: 'Formación de sala',
    texto: 'Entreno al equipo para recomendar mejor, explicar sin impostar y convertir dudas del cliente en venta sugerida.',
  },
  {
    titulo: 'Carta Viva',
    texto: 'Digitalizo la carta con QR, guía de maridaje, vista de camarero, selección destacada y datos reales de uso.',
  },
]


const activaciones = [
  {
    titulo: 'Cena de maridaje',
    texto: 'El restaurante activa una noche con su menú y mi criterio en sala. Los clientes comen, beben y entienden qué tienen en la copa.',
  },
  {
    titulo: 'Noche de productor',
    texto: 'Un bodeguero, una mesa y una historia detrás de cada copa. Formato íntimo que llena noches y conecta a los clientes con el origen del vino.',
  },
  {
    titulo: 'Selección de Juanjo',
    texto: 'Vinos elegidos con criterio dentro de tu carta, con mi nombre y mi lectura detrás. Actualizable cada temporada.',
  },
  {
    titulo: 'Formación de producto',
    texto: 'Cuando entran vinos nuevos, formo a sala para que los defienda con argumentos reales. Una sesión, un equipo que vende mejor.',
  },
]

const metodologia = [
  ['01', 'Diagnóstico', 'Vemos qué hay en carta, qué se vende, qué ocupa espacio, qué falta y qué está frenando margen o experiencia.'],
  ['02', 'Estrategia', 'Diseñamos una arquitectura de vinos ajustada al ticket, cocina, sala, publico y posicionamiento del restaurante.'],
  ['03', 'Implementación', 'Lo bajamos a carta, proveedores, formación, QR, seguimiento y rutinas para que no se quede en un informe.'],
]

const recursosDestacados = recursos.filter((recurso) => [
  'como-hacer-carta-vinos-rentable',
  'margen-vino-por-copa',
  'control-stock-vino-restaurante',
].includes(recurso.slug))

export default function Home() {
  return (
    <main className="site-shell">
      <AuthHashRedirect />
      <PublicNav active="home" />

      <section className="hero hero-consultoria">
        <div className="hero-copy">
          <p className="eyebrow">Control de bodega, margen y experiencia de sala</p>
          <h1>Consultoría de carta de vinos para restaurantes en Málaga y España.</h1>
          <p className="lead">
            Ayudo a restaurantes, hoteles boutique y espacios singulares a saber qué tienen, qué margen deja cada
            botella, qué falta por reponer y cómo convertir la carta en venta real en sala.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Reserva un diagnóstico</Link>
            <Link href="/cartavinos#demo-segura" className="btn btn-secondary">Ver demo segura</Link>
          </div>
        </div>

        <aside className="hero-panel">
          <p className="panel-label">Sistema integrado</p>
          <h2>Consultoría + control operativo</h2>
          <p>
            No entrego recomendaciones que se quedan en un cajón. Analizo, rediseño, digitalizo y conecto carta,
            bodega, sala y reposición para que cada decisión tenga contexto.
          </p>
          <div className="metric-grid">
            <div><strong>QR</strong><span>Carta viva</span></div>
            <div><strong>Stock</strong><span>Minimos y pedido</span></div>
            <div><strong>Margen</strong><span>Coste y PVP</span></div>
            <div><strong>WSET 3</strong><span>Criterio humano</span></div>
          </div>
        </aside>
      </section>

      <section className="section intro-band">
        <p>
          Una carta de vinos no es una lista. Es stock, margen, proveedor, relato de sala y una decisión de compra
          repetida muchas veces al día. Cuando está bien pensada, sube ticket medio y reduce fricción.
        </p>
      </section>

      <section id="servicios" className="section">
        <div className="section-head">
          <p className="eyebrow">Qué hago</p>
          <h2>Servicios para restaurantes que quieren vender vino sin perder identidad.</h2>
        </div>
        <div className="service-grid">
          {servicios.map((servicio) => (
            <article className="service-card" key={servicio.titulo}>
              <span className="card-mark" />
              <h3>{servicio.titulo}</h3>
              <p>{servicio.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section activaciones-section">
        <div className="section-head">
          <p className="eyebrow">Activaciones en sala</p>
          <h2>Formatos para que el vino genere negocio dentro del restaurante.</h2>
        </div>
        <div className="activaciones-grid">
          {activaciones.map((item) => (
            <article className="activación-card" key={item.titulo}>
              <h3>{item.titulo}</h3>
              <p>{item.texto}</p>
            </article>
          ))}
        </div>
        <div className="activaciones-footer">
          <p>¿Tienes una idea diferente? Lo hablamos.</p>
          <Link href="#contacto" className="btn btn-secondary">Cuéntame</Link>
        </div>
      </section>

      <section className="section product-band">
        <div>
          <p className="eyebrow">Producto propio</p>
          <h2>Carta Viva es la parte operativa de la consultoría.</h2>
          <p>
            Tu restaurante tiene una carta pública por QR, un panel privado, una vista de camarero para vender mejor
            y una guía de maridaje que recomienda vinos de tu propia carta, no referencias inventadas. También mide
            coste, PVP, stock mínimo, proveedor, incidencias y pedido sugerido.
          </p>
        </div>
        <div className="product-actions">
          <Link href="/cartavinos" className="btn btn-primary">Descubrir Carta Viva</Link>
          <Link href="/cartavinos#demo-segura" className="btn btn-secondary">Ver demo segura</Link>
        </div>
      </section>

      <section id="metodologia" className="section">
        <div className="section-head narrow">
          <p className="eyebrow">Metodo</p>
          <h2>Del diagnóstico a la implantación.</h2>
        </div>
        <div className="steps">
          {metodologia.map(([num, titulo, texto]) => (
            <article className="step" key={num}>
              <span>{num}</span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section split">
        <div>
          <p className="eyebrow">Sobre mi</p>
          <h2>Soy Juanjo García. Ingeniero de formación, WSET Level 3 por vocación.</h2>
        </div>
        <div className="copy-stack">
          <p>
            Mi forma de trabajar mezcla dos mundos: la mirada analitica de la ingenieria y el criterio sensorial del
            vino. Me interesan las cartas que tienen alma, pero también números: rotación, margen, ticket medio y
            facilidad de venta.
          </p>
          <p>
            Acompaño a negocios que quieren profesionalizar su oferta de vinos sin convertirla en algo frío. El vino
            tiene que vender, sí. Pero también tiene que emocionar.
          </p>
        </div>
      </section>

      <section className="section resource-preview-section">
        <div className="section-head">
          <p className="eyebrow">Recursos para restaurantes</p>
          <h2>Guías para mejorar carta, margen y control de bodega.</h2>
        </div>
        <div className="resource-grid compact">
          {recursosDestacados.map((recurso) => (
            <article className="resource-card" key={recurso.slug}>
              <span className="resource-category">{recurso.category}</span>
              <h3><Link href={`/recursos/${recurso.slug}`}>{recurso.title}</Link></h3>
              <p>{recurso.description}</p>
            </article>
          ))}
        </div>
        <div className="section-inline-cta">
          <Link href="/recursos" className="btn btn-primary">Ver todos los recursos</Link>
          <Link href="/formación-sala" className="btn btn-secondary">Formación de sala</Link>
        </div>
      </section>

      <section className="section proof-section">
        <div className="section-head">
          <p className="eyebrow">Primer paso</p>
          <h2>Antes de cambiar tu carta, entendamos qué está pasando.</h2>
        </div>
        <div className="proof-grid">
          <Link href="/catas" className="proof-card">
            <strong>Organizar una cata</strong>
            <span>Privadas, empresa o iniciación al vino.</span>
          </Link>
          <Link href="/cartavinos" className="proof-card">
            <strong>Ver Carta Viva</strong>
            <span>QR, dashboard, guía de maridaje y vista de sala.</span>
          </Link>
          <Link href="#contacto" className="proof-card">
            <strong>Auditar mi bodega</strong>
            <span>Una primera conversación sobre carta, margen y sala.</span>
          </Link>
        </div>
      </section>

      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Contacto</p>
          <h2>Hablemos de tu carta de vinos.</h2>
          <p>
            Escríbeme si tienes un restaurante, hotel o espacio singular y quieres mejorar tu carta, digitalizarla o
            formar al equipo de sala.
          </p>
          <div className="contact-links">
            <a href="mailto:cataconjuanjo@gmail.com" title="Email" aria-label="Enviar email">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
            </a>
            <a href="https://wa.me/34601502868" title="WhatsApp" aria-label="Contactar por WhatsApp" target="_blank" rel="noopener noreferrer">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.975-1.418A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Zm5.006 13.76c-.207.583-1.215 1.114-1.656 1.154-.44.04-.854.207-2.877-.598-2.437-.977-3.99-3.458-4.11-3.617-.12-.16-.978-1.3-.978-2.48 0-1.18.617-1.762.836-2.002.22-.24.48-.3.64-.3l.46.008c.147.006.344-.056.54.41.2.48.68 1.66.74 1.78.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.252.31-.36.417-.12.12-.244.25-.105.49.14.24.62.98 1.33 1.59.915.79 1.687 1.033 1.927 1.153.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.4.66 1.64.78.24.12.4.18.46.28.06.1.06.56-.148 1.14Z"/></svg>
            </a>
            <a href="https://instagram.com/cataconjuanjo" title="Instagram @cataconjuanjo" aria-label="Perfil de Instagram" target="_blank" rel="noopener noreferrer">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
            </a>
          </div>
        </div>
        <LeadForm source="Home Cata con Juanjo" />
      </section>

      <PublicFooter />
    </main>
  )
}
