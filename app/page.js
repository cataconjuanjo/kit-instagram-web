import Link from 'next/link'
import Image from 'next/image'
import LeadForm from './components/LeadForm'
import PublicNav from './components/PublicNav'
import PublicFooter from './components/PublicFooter'

const servicios = [
  {
    titulo: 'Auditoria de carta y bodega',
    texto: 'Analizo referencias, rotacion, stock, margenes, estructura de precios y coherencia con el concepto del local.',
  },
  {
    titulo: 'Rediseño de carta de vinos',
    texto: 'Construyo una carta clara, vendible y con narrativa: categorias, estilos, maridajes y vinos que el equipo puede defender.',
  },
  {
    titulo: 'Formacion de sala',
    texto: 'Entreno al equipo para recomendar mejor, explicar sin impostar y convertir dudas del cliente en venta sugerida.',
  },
  {
    titulo: 'Carta Viva',
    texto: 'Digitalizo la carta con QR, sommelier IA, vista de camarero, seleccion destacada y datos reales de uso.',
  },
]

const catas = [
  {
    titulo: 'Catas privadas',
    texto: 'Una experiencia cercana para grupos pequeños, celebraciones o regalos. Vinos elegidos con criterio y explicados sin solemnidad.',
  },
  {
    titulo: 'Catas para empresas',
    texto: 'Team building, incentivos o eventos con clientes. Formatos cuidados, participativos y adaptados al nivel del grupo.',
  },
  {
    titulo: 'Formacion inicial',
    texto: 'Sesiones para aprender a catar, entender estilos, leer etiquetas y ganar seguridad al elegir vino.',
  },
]

const metodologia = [
  ['01', 'Diagnostico', 'Vemos que hay en carta, que se vende, que ocupa espacio, que falta y que esta frenando margen o experiencia.'],
  ['02', 'Estrategia', 'Diseñamos una arquitectura de vinos ajustada al ticket, cocina, sala, publico y posicionamiento del restaurante.'],
  ['03', 'Implementacion', 'Lo bajamos a carta, proveedores, formacion, QR, seguimiento y rutinas para que no se quede en un informe.'],
]

export default function Home() {
  return (
    <main className="site-shell">
      <PublicNav active="home" />

      <section className="hero hero-consultoria">
        <div className="hero-copy">
          <p className="eyebrow">Vino, margen y experiencia de sala</p>
          <h1>Cartas de vino con criterio, margen y memoria.</h1>
          <p className="lead">
            Ayudo a restaurantes, hoteles boutique y espacios singulares a convertir su bodega en una herramienta
            de rentabilidad, diferenciacion y experiencia memorable para el cliente.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Reserva un diagnostico</Link>
            <Link href="/cartavinos" className="btn btn-secondary">Ver Carta Viva</Link>
          </div>
        </div>

        <aside className="hero-panel">
          <p className="panel-label">Sistema integrado</p>
          <h2>Consultoria + herramienta digital</h2>
          <p>
            No entrego recomendaciones que se quedan en un cajon. Analizo, rediseño, digitalizo y acompaño la
            implantacion hasta que la carta forma parte del ADN comercial del negocio.
          </p>
          <div className="metric-grid">
            <div><strong>QR</strong><span>Carta viva</span></div>
            <div><strong>IA</strong><span>Maridaje real</span></div>
            <div><strong>KPIs</strong><span>Uso y stock</span></div>
            <div><strong>WSET 3</strong><span>Criterio humano</span></div>
          </div>
        </aside>
      </section>

      <section className="section intro-band">
        <p>
          Una carta de vinos no es una lista. Es una decision de compra repetida muchas veces al dia. Cuando esta
          bien pensada, sube ticket medio, reduce friccion en sala y hace que el cliente recuerde el restaurante.
        </p>
      </section>

      <section id="servicios" className="section">
        <div className="section-head">
          <p className="eyebrow">Que hago</p>
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

      <section className="section tasting-band">
        <div className="tasting-image" aria-hidden="true">
          <Image src="/assets/instagram/post-6.jpg" alt="" width={640} height={853} />
        </div>
        <div className="tasting-copy">
          <p className="eyebrow">Catas y experiencias</p>
          <h2>Tambien diseño catas para personas, equipos y momentos especiales.</h2>
          <p>
            La consultoria es el foco profesional, pero el vino tambien se aprende y se disfruta en la mesa. Catas
            privadas, sesiones para empresas y formatos de iniciacion con el mismo criterio: rigor, cercania y cero
            postureo.
          </p>
          <div className="mini-service-grid">
            {catas.map((cata) => (
              <article key={cata.titulo}>
                <h3>{cata.titulo}</h3>
                <p>{cata.texto}</p>
              </article>
            ))}
          </div>
          <Link href="/catas" className="btn btn-secondary">Ver servicios de cata</Link>
        </div>
      </section>

      <section className="section product-band">
        <div>
          <p className="eyebrow">Producto propio</p>
          <h2>Carta Viva es la parte operativa de la consultoria.</h2>
          <p>
            Tu restaurante tiene una carta publica por QR, un panel privado, una vista de camarero para vender mejor
            y un sommelier IA que recomienda vinos de tu propia carta, no referencias inventadas.
          </p>
        </div>
        <div className="product-actions">
          <Link href="/cartavinos" className="btn btn-primary">Descubrir Carta Viva</Link>
          <Link href="/cartavinos#contacto" className="btn btn-secondary">Solicitar demo</Link>
        </div>
      </section>

      <section id="metodologia" className="section">
        <div className="section-head narrow">
          <p className="eyebrow">Metodo</p>
          <h2>Del diagnostico a la implantacion.</h2>
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
          <h2>Soy Juanjo Garcia. Ingeniero de formacion, WSET Level 3 por vocacion.</h2>
        </div>
        <div className="copy-stack">
          <p>
            Mi forma de trabajar mezcla dos mundos: la mirada analitica de la ingenieria y el criterio sensorial del
            vino. Me interesan las cartas que tienen alma, pero tambien numeros: rotacion, margen, ticket medio y
            facilidad de venta.
          </p>
          <p>
            Acompaño a negocios que quieren profesionalizar su oferta de vinos sin convertirla en algo frio. El vino
            tiene que vender, si. Pero tambien tiene que emocionar.
          </p>
        </div>
      </section>

      <section className="section proof-section">
        <div className="section-head">
          <p className="eyebrow">Primer paso</p>
          <h2>Antes de cambiar tu carta, entendamos que esta pasando.</h2>
        </div>
        <div className="proof-grid">
          <Link href="/catas" className="proof-card">
            <strong>Organizar una cata</strong>
            <span>Privadas, empresa o iniciacion al vino.</span>
          </Link>
          <Link href="/cartavinos" className="proof-card">
            <strong>Ver Carta Viva</strong>
            <span>QR, dashboard, sommelier IA y vista de sala.</span>
          </Link>
          <Link href="#contacto" className="proof-card">
            <strong>Auditar mi bodega</strong>
            <span>Una primera conversacion sobre carta, margen y sala.</span>
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
            <a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a>
            <a href="https://wa.me/34601502868">WhatsApp</a>
            <a href="https://instagram.com/cataconjuanjo">@cataconjuanjo</a>
          </div>
        </div>
        <LeadForm source="Home Cata con Juanjo" />
      </section>

      <PublicFooter />
    </main>
  )
}
