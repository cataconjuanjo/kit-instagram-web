import Link from 'next/link'
import Image from 'next/image'
import LeadForm from '../components/LeadForm'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

const pilares = [
  ['Cliente', 'Carta QR elegante, filtros útiles y recomendaciones de vino según lo que va a comer.'],
  ['Sala', 'Argumentos sencillos para recomendar, comparar y vender mejor sin memorizar toda la bodega.'],
  ['Gestión', 'Panel privado para mantener vinos, platos, stock, selección destacada y señales de uso.'],
]

const funciones = [
  {
    titulo: 'Carta viva por QR',
    texto: 'Una carta digital que se actualiza, se entiende y respeta la identidad del restaurante.',
  },
  {
    titulo: 'Guía de maridaje con carta real',
    texto: 'Recomienda solo vinos disponibles en tu bodega y los conecta con los platos reales del local.',
  },
  {
    titulo: 'Modo sala',
    texto: 'Ayuda al equipo a vender: maridaje, ticket, rotación, copa, premium y frase de servicio.',
  },
  {
    titulo: 'Criterio de Juanjo',
    texto: 'La tecnología se acompaña con revisión, selección especial y recomendaciones de mejora.',
  },
]

const controles = [
  ['Coste y PVP', 'Margen por referencia y valor real de lo que tienes parado en bodega.'],
  ['Stock mínimo', 'Avisos de reposición antes de que sala descubra que no queda una botella.'],
  ['Proveedor', 'Pedido sugerido por distribuidor, referencia y formato de compra.'],
  ['Incidencias de sala', 'No quedaba, no convenció, pidió otra: señales para decidir después del servicio.'],
  ['Rotación', 'Vinos con salida, vinos inmovilizados y referencias que conviene empujar o retirar.'],
  ['Maridaje vendible', 'Recomendaciones desde tu carta real, ajustadas a cocina, ticket y objetivo de venta.'],
]

const demoSegura = [
  {
    etiqueta: 'Bodega',
    titulo: 'Pedido sugerido',
    dato: '7 referencias',
    filas: ['Albariño casa · pedir 6', 'Tinto crianza · pedir 12', 'Espumoso seco · revisar margen'],
  },
  {
    etiqueta: 'Inventario',
    titulo: 'Diferencia a coste',
    dato: '184 EUR',
    filas: ['Premium sin confirmar', 'Copa con alta rotación', 'Merma pendiente de motivo'],
  },
  {
    etiqueta: 'Sala',
    titulo: 'Cierre de servicio',
    dato: '4 señales',
    filas: ['2 ventas marcadas', '1 no quedaba', '1 pidió otra opción'],
  },
]

const modalidades = [
  {
    nombre: 'Digitalización',
    etiqueta: 'Para ordenar la carta',
    texto: 'Carta QR, panel de gestión, personalización visual, vinos y platos conectados.',
  },
  {
    nombre: 'Acompañamiento',
    etiqueta: 'Para mantenerla viva',
    texto: 'Revisión periódica, selección destacada, notas personales y ajustes según uso real.',
    destacado: true,
  },
  {
    nombre: 'Consultoría integral',
    etiqueta: 'Para transformar la bodega',
    texto: 'Rediseño de carta, estrategia de sala, proveedores, formación y seguimiento.',
  },
]

export const metadata = {
  title: 'Carta Viva · Carta digital de vino con IA',
  description: 'Carta Viva une carta digital QR, guía de maridaje, modo sala y consultoría de vino para restaurantes con criterio WSET Level 3.',
  alternates: {
    canonical: '/cartavinos',
  },
  openGraph: {
    title: 'Carta Viva · Carta digital de vino con IA para restaurantes',
    description: 'Carta digital QR, guía de maridaje y consultoría de vino para restaurantes. Por Juanjo García, WSET Level 3.',
    url: '/cartavinos',
    images: [{ url: '/assets/og-image.jpg', width: 1200, height: 630 }],
  },
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
            Carta digital, criterio de sumillería y datos de uso para que el vino deje de ser una lista bonita y
            empiece a venderse con sentido.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Solicitar demo privada</Link>
            <Link href="#como-funciona" className="btn btn-secondary">Ver cómo funciona</Link>
          </div>
        </div>

        <div className="cv-hero-visual">
          <Image src="/assets/instagram/post-11.jpg" alt="Mesa de restaurante con vino" width={640} height={853} priority />
          <div className="cv-floating-panel">
            <span>Selección destacada</span>
            <strong>4 vinos con nota personal</strong>
            <p>Una recomendación visible para cliente y fácil de defender por sala.</p>
          </div>
        </div>
      </section>

      <section className="cv-statement">
        <p>
          No se trata de poner un PDF en un QR. Se trata de que cliente, camarero y propietario lean la carta de vino
          de forma distinta: más clara, más rentable y más memorable.
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
            <h3>Lo que la carta te está diciendo</h3>
            <div className="cv-insight-row"><strong>Vinos por copa</strong><span>Oportunidad clara</span></div>
            <div className="cv-insight-row"><strong>Stock bajo</strong><span>3 referencias</span></div>
            <div className="cv-insight-row"><strong>Maridaje</strong><span>Frituras sin cobertura</span></div>
          </div>
        </div>
        <div>
          <p className="eyebrow">No solo tecnología</p>
          <h2>El software detecta señales. El criterio decide qué hacer con ellas.</h2>
          <p>
            Carta Viva ordena información que normalmente está dispersa: vinos, platos, precios, stock, selección y
            comportamiento del cliente. A partir de ahí, el acompañamiento convierte datos en decisiones: qué mantener,
            qué destacar, qué formar y qué retirar.
          </p>
        </div>
      </section>

      <section className="section cv-features">
        <div className="section-head">
          <p className="eyebrow">Qué incluye</p>
          <h2>Una capa digital para vender vino con más criterio.</h2>
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

      <section className="section cv-control-section">
        <div className="section-head">
          <p className="eyebrow">Lo que controlas</p>
          <h2>La bodega deja de ser una lista y pasa a ser un cuadro de mando.</h2>
        </div>
        <div className="control-grid">
          {controles.map(([titulo, texto]) => (
            <article className="control-card" key={titulo}>
              <span />
              <h3>{titulo}</h3>
              <p>{texto}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section cv-demo-section" id="demo-segura">
        <div className="section-head narrow">
          <p className="eyebrow">Demo segura</p>
          <h2>Se puede enseñar valor sin regalar datos ni abrir la cocina del producto.</h2>
          <p>
            La demo pública usa datos ficticios y pantallas simplificadas. Para clientes reales, el recorrido completo
            se enseña en una demo privada con un restaurante de prueba y permisos controlados.
          </p>
        </div>
        <div className="safe-demo-grid">
          {demoSegura.map((pantalla) => (
            <article className="safe-demo-card" key={pantalla.etiqueta}>
              <div>
                <p className="eyebrow">{pantalla.etiqueta}</p>
                <h3>{pantalla.titulo}</h3>
              </div>
              <strong>{pantalla.dato}</strong>
              <div>
                {pantalla.filas.map((fila) => <span key={fila}>{fila}</span>)}
              </div>
            </article>
          ))}
        </div>
        <div className="demo-note">
          <strong>Protección comercial</strong>
          <p>
            Nada de capturas con restaurantes reales, datos sensibles o reglas internas completas. Solo evidencias
            suficientes para que el hostelero entienda el resultado.
          </p>
          <Link href="#contacto" className="btn btn-primary">Ver demo de restaurante</Link>
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
              {item.destacado && <span className="badge">Más equilibrado</span>}
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
          <p className="eyebrow">Diagnóstico privado</p>
          <h2>Vemos tu carta, tu sala y el papel que el vino juega en tu negocio.</h2>
        </div>
        <p>
          La primera conversación sirve para decidir si necesitas digitalización, consultoría o ambas cosas. Sin
          automatismos baratos. Con contexto.
        </p>
      </section>

      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Demo privada</p>
          <h2>Enséñame tu carta y te digo qué haría.</h2>
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
