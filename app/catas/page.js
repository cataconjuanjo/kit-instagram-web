import Link from 'next/link'
import Image from 'next/image'
import LeadForm from '../components/LeadForm'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

export const metadata = {
  title: 'Catas de vino en Málaga',
  description: 'Catas de vino privadas, para empresas y cursos de iniciación con Juanjo García, WSET Level 3, en Málaga y Andalucía.',
  alternates: {
    canonical: '/catas',
  },
  openGraph: {
    title: 'Catas de vino en Málaga · Cata con Juanjo',
    description: 'Catas privadas, para empresas y cursos de iniciación al vino en Málaga con criterio WSET Level 3.',
    url: '/catas',
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
  },
}

const formatos = [
  {
    nombre: 'Cata privada',
    precio: 'desde 120€',
    texto: 'Para 2 a 6 personas. Ideal para cumpleaños, regalos o una noche distinta en casa.',
    incluye: ['5 o 6 vinos', 'Guía de cata', 'Contexto sencillo', 'Duración 1,5 a 2 horas'],
  },
  {
    nombre: 'Cata para empresas',
    precio: 'desde 20€/persona',
    texto: 'Una actividad elegante y participativa para equipos, incentivos o eventos con clientes.',
    incluye: ['Formato a medida', 'Dinámica de grupo', 'Opción con maridaje', 'Desplazamiento a empresa'],
  },
  {
    nombre: 'Curso de iniciación',
    precio: 'desde 60€/persona',
    texto: 'Para entender estilos, variedades, etiquetas, servicio y maridaje sin tecnicismos innecesarios.',
    incluye: ['Sesiones prácticas', 'Material de apoyo', 'Cata guiada', 'Lenguaje claro'],
  },
]

const temas = [
  'Vinos de Malaga y Andalucia',
  'Blancos que sorprenden',
  'Tintos con estilos muy distintos',
  'Burbujas y generosos',
  'Maridajes para una cena',
  'Como elegir vino sin miedo',
]

export default function CatasPage() {
  return (
    <main className="site-shell">
      <PublicNav active="catas" eyebrow="Catas y experiencias" />

      <section className="hero catas-hero">
        <div className="hero-copy">
          <p className="eyebrow">Catas de vino en Malaga</p>
          <h1>Aprende a entender el vino, no solo beberlo.</h1>
          <p className="lead">
            Catas privadas, experiencias para empresas y cursos de iniciación con una idea sencilla: disfrutar más
            del vino porque entiendes mejor lo que tienes en la copa.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Reservar una cata</Link>
            <Link href="#formatos" className="btn btn-secondary">Ver formatos</Link>
          </div>
        </div>
        <div className="photo-collage">
          <Image src="/assets/instagram/post-4.jpg" alt="Cata de vinos con Juanjo Garcia" width={640} height={640} />
          <Image src="/assets/instagram/post-8.jpg" alt="Formación de vino en Málaga" width={640} height={640} />
          <Image src="/assets/instagram/post-10.jpg" alt="Vinos para cata privada" width={640} height={853} />
        </div>
      </section>

      <section className="section intro-band tasting-intro">
        <p>
          Una buena cata no va de acertar aromas raros. Va de entender acidez, cuerpo, textura, origen y por qué un
          vino funciona mejor en una mesa que en otra.
        </p>
      </section>

      <section id="formatos" className="section">
        <div className="section-head">
          <p className="eyebrow">Formatos</p>
          <h2>Catas con estructura, ritmo y conversación real.</h2>
        </div>
        <div className="pricing-grid">
          {formatos.map((formato) => (
            <article className="price-card tasting-card" key={formato.nombre}>
              <h3>{formato.nombre}</h3>
              <div className="price"><strong>{formato.precio}</strong></div>
              <p>{formato.texto}</p>
              <ul>
                {formato.incluye.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <Link href="#contacto" className="btn btn-secondary">Consultar</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section tasting-topics">
        <div>
          <p className="eyebrow">Tematicas posibles</p>
          <h2>Diseñamos la cata según el grupo, la ocasión y el nivel.</h2>
        </div>
        <div className="topic-list">
          {temas.map((tema) => <span key={tema}>{tema}</span>)}
        </div>
      </section>

      <section className="section split">
        <div>
          <p className="eyebrow">Como trabajo</p>
          <h2>Rigor técnico, lenguaje normal y una mesa que no se enfría.</h2>
        </div>
        <div className="copy-stack">
          <p>
            Preparo cada cata con una selección coherente, materiales sencillos y un hilo conductor. No se trata de
            impresionar con vocabulario, sino de que el grupo salga sabiendo algo que podrá usar la próxima vez que
            pida una botella.
          </p>
          <p>
            Si hay comida, adapto los vinos al contexto. Si es empresa, cuido el ritmo y la participación. Si es una
            celebración, busco que sea memorable sin ponerse académico.
          </p>
        </div>
      </section>

      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Reserva</p>
          <h2>Cuéntame qué tienes en mente.</h2>
          <p>
            Dime fecha aproximada, número de personas, lugar y tipo de cata. Te respondo con una propuesta clara.
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
        <LeadForm source="Servicios de cata" />
      </section>
      <PublicFooter />
    </main>
  )
}
