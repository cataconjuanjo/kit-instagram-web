import Link from 'next/link'
import Image from 'next/image'
import LeadForm from '../components/LeadForm'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

const pilares = [
  ['Cliente', 'Carta QR elegante, filtros utiles y recomendaciones de vino segun lo que va a comer.'],
  ['Sala', 'Argumentos sencillos para recomendar, comparar y vender mejor sin memorizar toda la bodega.'],
  ['Gestion', 'Panel privado para mantener vinos, platos, stock, seleccion destacada y señales de uso.'],
]

const funciones = [
  {
    titulo: 'Carta viva por QR',
    texto: 'Una carta digital que se actualiza, se entiende y respeta la identidad del restaurante.',
  },
  {
    titulo: 'Sommelier IA con carta real',
    texto: 'Recomienda solo vinos disponibles en tu bodega y los conecta con los platos reales del local.',
  },
  {
    titulo: 'Modo sala',
    texto: 'Ayuda al equipo a vender: maridaje, ticket, rotacion, copa, premium y frase de servicio.',
  },
  {
    titulo: 'Criterio de Juanjo',
    texto: 'La tecnologia se acompaña con revision, seleccion especial y recomendaciones de mejora.',
  },
]

const modalidades = [
  {
    nombre: 'Digitalizacion',
    etiqueta: 'Para ordenar la carta',
    texto: 'Carta QR, panel de gestion, personalizacion visual, vinos y platos conectados.',
  },
  {
    nombre: 'Acompañamiento',
    etiqueta: 'Para mantenerla viva',
    texto: 'Revision periodica, seleccion destacada, notas personales y ajustes segun uso real.',
    destacado: true,
  },
  {
    nombre: 'Consultoria integral',
    etiqueta: 'Para transformar la bodega',
    texto: 'Rediseño de carta, estrategia de sala, proveedores, formacion y seguimiento.',
  },
]

export const metadata = {
  title: 'Carta Viva · Sistema de vino para restaurantes',
  description: 'Carta Viva une carta digital QR, sommelier IA, modo sala y consultoria de vino para restaurantes con criterio WSET Level 3.',
}

export default function CartaVivaPage() {
  return (
    <main className="site-shell carta-viva-page">
      <PublicNav active="carta" eyebrow="Carta Viva para restaurantes" />

      <section className="cv-hero">
        <div className="cv-hero-copy">
          <p className="eyebrow">Sistema de vino para restaurantes</p>
          <h1>Carta Viva convierte tu bodega en una herramienta de sala.</h1>
          <p className="lead">
            Carta digital, criterio de sumilleria y datos de uso para que el vino deje de ser una lista bonita y
            empiece a venderse con sentido.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Solicitar demo privada</Link>
            <Link href="#como-funciona" className="btn btn-secondary">Ver como funciona</Link>
          </div>
        </div>

        <div className="cv-hero-visual">
          <Image src="/assets/instagram/post-11.jpg" alt="Mesa de restaurante con vino" width={640} height={853} priority />
          <div className="cv-floating-panel">
            <span>Seleccion destacada</span>
            <strong>4 vinos con nota personal</strong>
            <p>Una recomendacion visible para cliente y facil de defender por sala.</p>
          </div>
        </div>
      </section>

      <section className="cv-statement">
        <p>
          No se trata de poner un PDF en un QR. Se trata de que cliente, camarero y propietario lean la carta de vino
          de forma distinta: mas clara, mas rentable y mas memorable.
        </p>
      </section>

      <section id="como-funciona" className="section cv-flow-section">
        <div className="section-head">
          <p className="eyebrow">Tres lecturas de la misma carta</p>
          <h2>Una herramienta, tres usuarios.</h2>
        </div>
        <div className="cv-flow">
          {pilares.map(([titulo, texto], index) => (
            <article key={titulo}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section cv-product-split">
        <div className="cv-screen-card">
          <div className="cv-browser-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="cv-dashboard-preview">
            <p className="eyebrow">Panel privado</p>
            <h3>Lo que la carta te esta diciendo</h3>
            <div className="cv-insight-row"><strong>Vinos por copa</strong><span>Oportunidad clara</span></div>
            <div className="cv-insight-row"><strong>Stock bajo</strong><span>3 referencias</span></div>
            <div className="cv-insight-row"><strong>Maridaje</strong><span>Frituras sin cobertura</span></div>
          </div>
        </div>
        <div>
          <p className="eyebrow">No solo tecnologia</p>
          <h2>El software detecta señales. El criterio decide que hacer con ellas.</h2>
          <p>
            Carta Viva ordena informacion que normalmente esta dispersa: vinos, platos, precios, stock, seleccion y
            comportamiento del cliente. A partir de ahi, el acompañamiento convierte datos en decisiones: que mantener,
            que destacar, que formar y que retirar.
          </p>
        </div>
      </section>

      <section className="section cv-features">
        <div className="section-head">
          <p className="eyebrow">Que incluye</p>
          <h2>Una capa digital para vender vino con mas criterio.</h2>
        </div>
        <div className="service-grid">
          {funciones.map((item) => (
            <article className="service-card" key={item.titulo}>
              <span className="card-mark" />
              <h3>{item.titulo}</h3>
              <p>{item.texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section cv-modalidades">
        <div className="section-head">
          <p className="eyebrow">Modalidades</p>
          <h2>La propuesta se adapta a la madurez de tu carta.</h2>
        </div>
        <div className="pricing-grid">
          {modalidades.map((item) => (
            <article className={`price-card ${item.destacado ? 'featured' : ''}`} key={item.nombre}>
              {item.destacado && <span className="badge">Mas equilibrado</span>}
              <h3>{item.nombre}</h3>
              <div className="plan-label">{item.etiqueta}</div>
              <p>{item.texto}</p>
              <Link href="#contacto" className="btn btn-secondary">Solicitar propuesta</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section cv-closing">
        <div>
          <p className="eyebrow">Diagnostico privado</p>
          <h2>Vemos tu carta, tu sala y el papel que el vino juega en tu negocio.</h2>
        </div>
        <p>
          La primera conversacion sirve para decidir si necesitas digitalizacion, consultoria o ambas cosas. Sin
          automatismos baratos. Con contexto.
        </p>
      </section>

      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Demo privada</p>
          <h2>Enséñame tu carta y te digo que haria.</h2>
          <p>
            Manda el nombre del restaurante y una idea de tu carta actual. Te responderé con una propuesta clara.
          </p>
        </div>
        <LeadForm source="Carta Viva" />
      </section>

      <PublicFooter />
    </main>
  )
}
