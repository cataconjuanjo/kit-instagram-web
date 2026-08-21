import Link from 'next/link'
import Image from 'next/image'
import CatasContactForm from '../components/CatasContactForm'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

export const metadata = {
  title: 'Catas de vino en Málaga · A domicilio, en finca y en yate',
  description: 'Catas privadas de vino a domicilio, en fincas y en yates en Málaga y la Costa del Sol. Cata Esencial, Premium y Exclusiva. WSET Level 3. Desde 350 €.',
  alternates: {
    canonical: '/catas',
  },
  openGraph: {
    title: 'Catas de vino en Málaga · A domicilio, en finca y en yate',
    description: 'Catas privadas de vino a domicilio, en fincas, villas y yates en Málaga y la Costa del Sol. Cata Esencial desde 350 €. WSET Level 3.',
    url: '/catas',
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
  },
}

const niveles = [
  {
    nombre: 'Cata Esencial',
    precioLabel: null,
    precio: '350 € / 400 €',
    precioSub: 'hasta 6 personas',
    precioNota: null,
    vinos: '12–22 €/botella',
    texto: 'Precio cerrado. Tú decides si aportas las copas (350 €) o las llevo yo con cristalería profesional (400 €).',
    incluye: [
      '5 vinos de tienda especializada',
      'Guía de cata 90–120 min',
      'Técnica de cata, variedades y maridajes',
      'Montaje y recogida',
      'Desplazamiento en Málaga capital',
    ],
  },
  {
    nombre: 'Cata Premium',
    precioLabel: 'Honorarios',
    precio: '350 € / 400 €',
    precioSub: '+ presupuesto de vinos 150–300 €',
    precioNota: 'Precio final según el presupuesto de vinos y el número de personas.',
    vinos: '25–50 €/botella',
    texto: 'Para quienes buscan vinos de mayor nivel. Los honorarios son los mismos que en la Cata Esencial; los vinos se presupuestan aparte.',
    incluye: [
      'Mismo formato que la Cata Esencial',
      'Referencias de bodega con identidad',
      '+50 / +55 €/pers a partir del 7.º',
    ],
  },
  {
    nombre: 'Cata Exclusiva',
    precioLabel: 'Honorarios',
    precio: '350 € / 400 €',
    precioSub: '+ presupuesto de vinos a medida',
    precioNota: 'Presupuesto de vinos a medida según referencias, añadas y disponibilidad.',
    vinos: '+50 €/botella',
    texto: 'Para ocasiones especiales con referencias de gran añada o vinos de autor. El presupuesto de vinos se construye según la selección y el número de personas.',
    incluye: [
      'Mismo formato que la Cata Esencial',
      'Gran añada, vinos de autor o especiales',
      '+50 / +55 €/pers a partir del 7.º',
    ],
  },
]

const temas = [
  'Vinos de Málaga y Andalucía',
  'Blancos que sorprenden',
  'Tintos con estilos muy distintos',
  'Burbujas y generosos',
  'Maridajes para una cena',
  'Cómo elegir vino sin miedo',
]

const queIncluye = [
  'Selección de 5 vinos',
  'Guía de cata 90–120 min',
  'Técnica de cata',
  'Variedades, zonas y estilos',
  'Maridajes',
  'Montaje y recogida',
  'Desplazamiento en Málaga capital',
]

// Rutas de imagen: sustituye cada src por la foto real cuando la tengas
const ambientes = [
  {
    nombre: 'A domicilio',
    img: '/assets/ambiente-domicilio.png',
    alt: 'Salón preparado a domicilio con copas de vino y guía de cata para una Cata Esencial en Málaga capital',
    desc: 'Málaga capital, con desplazamiento incluido en el precio. Tú pones el salón o la terraza y la gente; yo llevo los vinos, la guía de cata y, si quieres, la cristalería. El formato más flexible para probar sin salir de casa, con la mesa y el ritmo que prefieras.',
    chef: false,
  },
  {
    nombre: 'Finca o villa',
    img: '/assets/ambiente-finca.png',
    alt: 'Jardín de una finca o villa en la Costa del Sol con mesa preparada para cata privada al atardecer',
    desc: 'Eventos privados en fincas, villas y cortijos de Málaga. Mismo formato que a domicilio, pero pensado para grupos más grandes y jornadas completas: aperitivo al atardecer, cata en el jardín, celebración sin prisas.',
    chef: false,
  },
  {
    nombre: 'A bordo',
    img: '/assets/ambiente-yate.png',
    alt: 'Cubierta de yate en Puerto Banús con copa de vino blanco y mar Mediterráneo al fondo',
    desc: 'Una cata diferente. A bordo, en el puerto, con el Mediterráneo de fondo y los mejores vinos de la tarde.',
    chef: false,
  },
  {
    nombre: 'Cena con chef privado',
    img: '/assets/ambiente-chef.png',
    alt: 'Plato de alta cocina emplatado junto a copa de vino tinto en mesa de cena privada con maridaje',
    desc: 'Colaboración con chef privado o proveedor externo, presupuestada aparte. Cena de varios platos maridada copa a copa —en villa, finca, yate o donde prefieras— para quienes quieren ir un paso más allá de la cata.',
    chef: true,
  },
]

const faq = [
  {
    q: '¿Cuánto cuesta una Cata Esencial a domicilio en Málaga?',
    a: 'Desde 350 € hasta 6 personas si aportas las copas, o 400 € con cristalería profesional incluida. El precio cubre la selección de 5 vinos, la guía de cata de 90–120 minutos y el desplazamiento dentro de Málaga capital. A partir del 7.º invitado se añaden 50 € o 55 €/persona según cristalería.',
  },
  {
    q: '¿Qué diferencia hay entre la Cata Esencial, la Cata Premium y la Cata Exclusiva?',
    a: 'La diferencia está en el nivel de los vinos. En la Cata Esencial el precio es cerrado (350–400 €): incluye los honorarios de guía y los vinos de gama media-alta (12–22 €/botella). En la Cata Premium y la Cata Exclusiva, los honorarios de guía son los mismos (350–400 € hasta 6 personas), pero el coste de los vinos va aparte: aprox. 150–300 € en vinos de 25–50 €/botella (Premium) o a medida en vinos de más de 50 €/botella (Exclusiva).',
  },
  {
    q: '¿Qué incluye una cata privada a domicilio?',
    a: 'Cinco vinos, guía de cata de 90–120 min, técnica de cata, variedades y maridajes, montaje y recogida — todo conducido por Juanjo García, sumiller WSET Level 3.',
  },
  {
    q: '¿Se puede organizar una cata de vino en un yate?',
    a: 'Sí. Se organizan catas a bordo de yates amarrados en Puerto Banús, Marbella y el litoral malagueño, con vinos adaptados al consumo en cubierta. Para este formato suele encajar bien una Cata Premium, con honorarios de guía aparte del presupuesto de vinos.',
  },
  {
    q: '¿Hacéis catas en fincas o villas para eventos privados?',
    a: 'Sí, en fincas, villas y cortijos de Málaga, Marbella, Benahavís, Mijas y Ronda, con el mismo formato que la cata a domicilio y ampliable en número de personas y nivel de vinos.',
  },
  {
    q: '¿En qué zonas de Málaga trabajáis?',
    a: 'Málaga capital sin coste adicional; resto de la Costa del Sol (Marbella, Puerto Banús, Benahavís, Mijas, Estepona, Ronda) a 0,40 €/km ida y vuelta desde Málaga.',
  },
  {
    q: '¿Qué pasa si una botella tiene defecto?',
    a: 'Los vinos se revisan antes de servir, pero una botella puede presentar defectos (corcho, oxidación u otros). En la Cata Esencial, una botella con defecto evidente se sustituye por una referencia equivalente según disponibilidad. En Cata Premium y Cata Exclusiva, si se quiere garantizar una segunda botella de la misma referencia como respaldo, se presupuesta aparte.',
  },
  {
    q: '¿Puedo incluir comida o cena con maridaje?',
    a: 'No ofrezco servicio gastronómico propio. Si quieres incluir comida, puedo valorar una colaboración con chef privado o proveedor externo, presupuestada aparte. Próximamente disponible como servicio de cena con maridaje.',
  },
]

export default function CatasPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        name: 'Juanjo García',
        url: 'https://cataconjuanjo.com',
        jobTitle: 'Sumiller y consultor de vino WSET Level 3',
        sameAs: ['https://instagram.com/cataconjuanjo'],
      },
      {
        '@type': 'Service',
        name: 'Catas de vino privadas en Málaga · A domicilio, en finca y en yate',
        provider: { '@type': 'Person', name: 'Juanjo García' },
        areaServed: ['Málaga', 'Marbella', 'Puerto Banús', 'Benahavís', 'Mijas', 'Estepona', 'Ronda'],
        serviceType: 'Catas de vino privadas a domicilio, en fincas y en yates',
        description: 'Catas de vino privadas a domicilio, en fincas, villas y yates en Málaga y la Costa del Sol, con formación WSET Level 3.',
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          hasOffer: [
            {
              '@type': 'Offer',
              name: 'Cata Esencial (cliente aporta copas)',
              priceCurrency: 'EUR',
              price: '350',
              availability: 'https://schema.org/InStock',
              description: 'Hasta 6 personas. 5 vinos de 12–22 €/botella, guía de cata 90–120 min, desplazamiento incluido en Málaga capital.',
            },
            {
              '@type': 'Offer',
              name: 'Cata Esencial con cristalería profesional',
              priceCurrency: 'EUR',
              price: '400',
              availability: 'https://schema.org/InStock',
              description: 'Hasta 6 personas. Incluye vinos y cristalería profesional.',
            },
            {
              '@type': 'Offer',
              name: 'Cata Premium',
              priceCurrency: 'EUR',
              price: '350',
              availability: 'https://schema.org/InStock',
              description: 'Honorarios desde 350 €/400 € hasta 6 personas + presupuesto de vinos 150–300 € (25–50 €/botella).',
            },
            {
              '@type': 'Offer',
              name: 'Cata Exclusiva',
              priceCurrency: 'EUR',
              price: '350',
              availability: 'https://schema.org/InStock',
              description: 'Honorarios desde 350 €/400 € hasta 6 personas + presupuesto de vinos a medida (más de 50 €/botella).',
            },
            {
              '@type': 'Offer',
              name: 'Cena con chef privado y maridaje de vinos',
              availability: 'https://schema.org/PreOrder',
              description: 'Próximamente. Colaboración con chef privado o proveedor externo. En villa, finca, yate. Presupuesto a medida.',
            },
          ],
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }

  return (
    <main className="site-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PublicNav active="catas" eyebrow="Catas y experiencias" />

      {/* Hero */}
      <section className="hero catas-hero">
        <div className="hero-copy">
          <p className="eyebrow">Catas de vino en Málaga</p>
          <h1>Catas de vino en Málaga: aprende a entender el vino, no solo beberlo.</h1>
          <p className="lead">
            Catas privadas de vino guiadas, a domicilio, en finca o a bordo, con una idea sencilla: disfrutar más
            del vino porque entiendes mejor lo que tienes en la copa.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Reservar una cata</Link>
            <Link href="#niveles" className="btn btn-secondary">Ver niveles y precios</Link>
          </div>
        </div>
        <div className="photo-collage">
          <Image
            src="/assets/instagram/post-6.jpg"
            alt="Copas de vino alineadas sobre mantel blanco en una cata privada en Málaga"
            width={640}
            height={853}
            priority
            sizes="(max-width: 900px) 50vw, 33vw"
          />
          <Image
            src="/assets/instagram/post-10.jpg"
            alt="Copa de vino de Málaga en una cata privada"
            width={640}
            height={853}
            sizes="(max-width: 900px) 50vw, 33vw"
          />
          <Image
            src="/assets/instagram/post-9.jpg"
            alt="Botella y copa en una experiencia de cata de vino"
            width={640}
            height={853}
            sizes="(max-width: 900px) 50vw, 33vw"
          />
        </div>
      </section>

      {/* Intro band */}
      <section className="section intro-band tasting-intro">
        <p>
          Una buena cata no va de acertar aromas raros. Va de entender acidez, cuerpo, textura, origen y por qué un
          vino funciona mejor en una mesa que en otra.
        </p>
      </section>

      {/* Niveles de cata */}
      <section id="niveles" className="section niveles-section">
        <div className="section-head">
          <p className="eyebrow">Niveles de cata</p>
          <h2>Tres niveles según el vino que quieres en la mesa.</h2>
          <p className="section-intro">
            Los honorarios de guía son los mismos en los tres niveles. La diferencia está en los vinos: precio
            cerrado en la Cata Esencial, presupuesto aparte en la Premium y la Exclusiva.
          </p>
        </div>
        <div className="pricing-grid">
          {niveles.map((nivel) => (
            <article className="price-card tasting-card" key={nivel.nombre}>
              <div className="nivel-vinos-tag">{nivel.vinos}</div>
              <h3>{nivel.nombre}</h3>
              <div className={`price${nivel.precioLabel ? ' price-compact' : ''}`}>
                {nivel.precioLabel && <span className="price-label">{nivel.precioLabel}</span>}
                <strong>{nivel.precio}</strong>
                <small>{nivel.precioSub}</small>
              </div>
              {nivel.precioNota && <p className="price-note">{nivel.precioNota}</p>}
              <p>{nivel.texto}</p>
              <ul>
                {nivel.incluye.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <Link href="#contacto" className="btn btn-secondary">Consultar</Link>
            </article>
          ))}
        </div>
      </section>

      {/* Dónde y precio de la Cata Esencial */}
      <section id="domicilio" className="section domicilio-section">
        <div className="section-head">
          <p className="eyebrow">Catas privadas · A domicilio, en finca y en yate</p>
          <h2>Llevo la cata donde estés.</h2>
          <p className="section-intro">
            Catas privadas de vino guiadas con formación WSET Level 3, en domicilios, fincas, villas y yates en
            Málaga y la Costa del Sol. Llevo los vinos, la guía de cata y, si hace falta, la cristalería. Tú pones
            el sitio y la gente.
          </p>
        </div>

        {/* Ambientes */}
        <div className="ambientes-grid">
          {ambientes.map((ambiente) => (
            <article
              className={`ambiente-card${ambiente.chef ? ' ambiente-chef' : ''}`}
              key={ambiente.nombre}
            >
              <div className="ambiente-card-img">
                <Image
                  src={ambiente.img}
                  alt={ambiente.alt}
                  fill
                  sizes="(max-width: 760px) 100vw, 50vw"
                  style={{ objectFit: 'cover' }}
                />
                {ambiente.chef && <span className="badge-soon">Próximamente</span>}
              </div>
              <div className="ambiente-card-body">
                <h4>{ambiente.nombre}</h4>
                <p>{ambiente.desc}</p>
                {ambiente.chef
                  ? (
                    <button className="btn btn-secondary btn-soon" disabled aria-disabled="true">
                      Avísame cuando esté disponible
                    </button>
                  )
                  : <Link href="#contacto" className="btn btn-secondary">Consultar</Link>
                }
              </div>
            </article>
          ))}
        </div>

        {/* Precio de la Cata Esencial */}
        <div className="section-head section-head-sub">
          <p className="eyebrow">Cata Esencial · Desglose de precio</p>
          <h3>Cómo se calcula el precio</h3>
        </div>

        <div className="domicilio-incluye">
          <p className="incluye-label">Qué incluye la Cata Esencial</p>
          <div className="topic-list">
            {queIncluye.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>

        <div className="pricing-grid domicilio-pricing">
          <article className="price-card tasting-card">
            <h3>Copas propias</h3>
            <div className="price">
              <strong>350 €</strong>
              <small>58 €/persona si sois 6</small>
            </div>
            <p>Hasta 6 personas. Tú aportas las copas, yo llevo los vinos y conduzco la sesión.</p>
            <ul>
              <li>Desplazamiento incluido en Málaga</li>
            </ul>
            <Link href="#contacto" className="btn btn-secondary">Reservar</Link>
          </article>

          <article className="price-card tasting-card">
            <h3>Con cristalería</h3>
            <div className="price">
              <strong>400 €</strong>
              <small>67 €/persona si sois 6</small>
            </div>
            <p>Hasta 6 personas. Cristalería profesional incluida. Solo tienes que preparar la mesa.</p>
            <ul>
              <li>Roturas o pérdidas a precio de reposición</li>
            </ul>
            <Link href="#contacto" className="btn btn-secondary">Reservar</Link>
          </article>

          <article className="price-card tasting-card">
            <h3>7 personas o más</h3>
            <div className="price price-compact">
              <strong>+50–55 €/pers</strong>
              <small>A partir del 7.º invitado</small>
            </div>
            <p>Suplemento por persona adicional a partir del séptimo. Grupos de más de 12, presupuesto a medida.</p>
            <ul>
              <li>+50 €/pers (copas propias)</li>
              <li>+55 €/pers (con cristalería)</li>
              <li>Grupos +12: a medida</li>
            </ul>
            <Link href="#contacto" className="btn btn-secondary">Consultar grupo</Link>
          </article>
        </div>

        <div className="premium-note">
          <p className="premium-note-eyebrow">Y si voy a Cata Premium o Exclusiva…</p>
          <p>
            <strong>Cata Premium y Cata Exclusiva:</strong> los honorarios de guía son los mismos (350 / 400 €
            hasta 6 personas, +50 / +55 € por persona adicional), más un presupuesto de vinos aparte — 150–300 € en
            la Cata Premium y a medida en la Cata Exclusiva. El presupuesto de vinos incluye selección y
            aprovisionamiento, y se ajusta al número final de personas.
          </p>
        </div>

        {/* Condiciones */}
        <div className="conditions-strip">
          <div>
            <h4>Zona de cobertura</h4>
            <ul>
              <li>Málaga capital — desplazamiento incluido</li>
              <li>Costa del Sol (Marbella, Puerto Banús, Benahavís, Mijas, Estepona, Ronda) — 0,40 €/km ida y vuelta desde Málaga</li>
              <li>Peajes o parking si los hubiera, aparte</li>
            </ul>
          </div>
          <div>
            <h4>Condiciones de reserva</h4>
            <ul>
              <li>50 % por adelantado para confirmar</li>
              <li>Resto el día de la cata</li>
              <li>Cancelaciones con menos de 48 h sin devolución del anticipo</li>
              <li>Precios sin IVA</li>
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section faq-section">
        <div className="section-head narrow">
          <p className="eyebrow">Preguntas frecuentes</p>
          <h2>Lo que más suelen preguntar.</h2>
        </div>
        <dl className="faq-grid">
          <div className="faq-col">
            {faq.slice(0, 4).map(({ q, a }) => (
              <div className="faq-item" key={q}>
                <dt className="faq-q">{q}</dt>
                <dd className="faq-a">{a}</dd>
              </div>
            ))}
          </div>
          <div className="faq-col">
            {faq.slice(4).map(({ q, a }) => (
              <div className="faq-item" key={q}>
                <dt className="faq-q">{q}</dt>
                <dd className="faq-a">{a}</dd>
              </div>
            ))}
          </div>
        </dl>
      </section>

      {/* Temáticas */}
      <section className="section tasting-topics">
        <div>
          <p className="eyebrow">Temáticas posibles</p>
          <h2>Diseñamos la cata según el grupo, la ocasión y el nivel.</h2>
        </div>
        <div className="topic-list">
          {temas.map((tema) => <span key={tema}>{tema}</span>)}
        </div>
      </section>

      {/* Cómo trabajo */}
      <section className="section split">
        <div>
          <p className="eyebrow">Cómo trabajo</p>
          <h2>Rigor técnico, lenguaje normal y una mesa que no se enfría.</h2>
        </div>
        <div className="copy-stack">
          <p>
            Preparo cada cata con una selección coherente, materiales sencillos y un hilo conductor. No se trata de
            impresionar con vocabulario, sino de que el grupo salga sabiendo algo que podrá usar la próxima vez que
            pida una botella.
          </p>
          <p>
            Si hay comida, adapto los vinos al contexto. Si es una celebración, busco que sea memorable sin ponerse
            académico.
          </p>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Reserva</p>
          <h2>Cuéntame qué tienes en mente.</h2>
          <p>
            Dime cuántos sois, dónde y qué tipo de experiencia buscas. Te respondo con una propuesta clara en
            menos de 24 h.
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
        <CatasContactForm />
      </section>
      <PublicFooter />
    </main>
  )
}
