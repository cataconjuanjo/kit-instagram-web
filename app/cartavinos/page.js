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

const faq = [
  ['¿Hay permanencia mínima?', 'No. Puedes cancelar cuando quieras. La suscripción se adapta al momento de tu restaurante.'],
  ['¿Cuánto tarda en estar listo?', 'La puesta en marcha suele llevar entre 1 y 3 días. Depende del tamaño de la carta y de si ya tienes los vinos en un listado o hay que construirlo desde cero.'],
  ['¿La configuración inicial tiene coste aparte?', 'Depende del volumen y del estado de la carta. Antes de empezar valoramos la carga inicial y te indicamos el importe con claridad. Está incluida en el plan Acompañado.'],
  ['¿Puedo cambiar de plan más adelante?', 'Sí, en cualquier momento. Puedes subir de Básico a Sala o a Acompañado según lo que necesites.'],
  ['¿Qué pasa con mis datos si cancelo?', 'Antes de cerrar la cuenta te entrego toda tu información en formato descargable. Nada desaparece sin que lo tengas guardado.'],
  ['¿Necesito instalar algo?', 'No. Carta Viva funciona desde el navegador en móvil, tablet y escritorio. Sin apps, sin instalaciones.'],
  ['¿El maridaje recomienda vinos de fuera de mi carta?', 'No. El motor de maridaje solo trabaja con los vinos que tú tienes dados de alta. Nunca sugiere referencias que no puedes servir.'],
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

const planes = [
  {
    nombre: 'Básico',
    precio: '59',
    etiqueta: 'Carta digital viva',
    texto: 'Para restaurantes que quieren sustituir el PDF por una carta digital cuidada, actualizable y con maridaje para el cliente.',
    incluye: ['Carta digital por QR', 'Carta de vinos actualizable', 'Fichas de vino claras', 'Maridaje para el cliente', 'Personalización visual'],
    cta: 'Empezar con carta digital',
  },
  {
    nombre: 'Sala',
    precio: '99',
    etiqueta: 'El plan más operativo',
    texto: 'Para restaurantes que quieren que su equipo recomiende mejor y venda vino con más seguridad durante el servicio.',
    incluye: ['Todo el plan Básico', 'Modo camarero con PIN', 'Recomendaciones por plato o mesa', 'Objetivos de venta en sala', 'Estadísticas y control de bodega'],
    destacado: true,
    cta: 'Probar modo sala',
  },
  {
    nombre: 'Acompañado',
    precio: '199',
    etiqueta: 'Software + consultor',
    texto: 'Para restaurantes que quieren además una lectura mensual de su carta, oportunidades de venta y criterio profesional continuo.',
    incluye: ['Todo el plan Sala', 'Revisión mensual del consultor', 'Lectura profesional de oportunidades', 'Ajuste experto de maridajes y carta', 'Soporte prioritario'],
    premium: true,
    desde: true,
    cta: 'Quiero acompañamiento',
  },
]

const comparativaPlanes = [
  {
    grupo: 'Carta digital',
    filas: [
      ['Carta digital por QR', true, true, true],
      ['Carta de vinos actualizable', true, true, true],
      ['Maridaje para el cliente', true, true, true],
      ['Personalización visual', true, true, true],
    ],
  },
  {
    grupo: 'Gestión y sala',
    filas: [
      ['Modo camarero con PIN', false, true, true],
      ['Recomendaciones por plato o mesa', false, true, true],
      ['Objetivos de venta en sala', false, true, true],
      ['Estadísticas de recomendaciones', false, true, true],
      ['Control de stock y bodega', false, true, true],
    ],
  },
  {
    grupo: 'Acompañamiento del consultor',
    filas: [
      ['Revisión mensual del consultor', false, false, true],
      ['Lectura profesional de oportunidades', false, false, true],
      ['Ajuste experto de maridajes y carta', false, false, true],
    ],
  },
]

const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
    <path d="M2 7.5L5.5 12L13 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <line x1="3.5" y1="7" x2="10.5" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

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
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
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
          <p className="eyebrow">Ve cómo funciona</p>
          <h2>Tres pantallas reales con datos de ejemplo.</h2>
          <p>
            Lo que ves abajo es Carta Viva funcionando: bodega, inventario y cierre de servicio. Los datos son inventados
            para proteger a los restaurantes que ya lo usan. Si quieres verlo con tu carta real, te hago una demo en directo sin compromiso.
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
              <div className="safe-demo-rows">
                {pantalla.filas.map((fila) => <span key={fila}>{fila}</span>)}
              </div>
            </article>
          ))}
        </div>
        <div className="demo-note">
          <div>
            <strong>¿Quieres verlo con tu carta real?</strong>
            <p>Te enseño el sistema completo con un restaurante de prueba. Sin datos tuyos, sin compromisos.</p>
          </div>
          <Link href="#contacto" className="btn btn-primary">Pedir demo privada</Link>
        </div>
      </section>

      <section className="section cv-modalidades" id="planes">
        <div className="section-head">
          <p className="eyebrow">Planes</p>
          <h2>Elige cuánto quieres que trabaje tu carta de vinos.</h2>
        </div>
        <div className="pricing-grid">
          {planes.map((item) => (
            <article className={`price-card ${item.destacado ? 'featured' : ''} ${item.premium ? 'premium' : ''}`} key={item.nombre}>
              {item.destacado && <span className="badge">Recomendado</span>}
              {item.premium && <span className="badge badge-premium">Premium</span>}
              <h3>{item.nombre}</h3>
              <div className="plan-label">{item.etiqueta}</div>
              <div className="price">
                <strong>{item.desde ? 'Desde ' : ''}{item.precio} €</strong>
                <small>/mes</small>
              </div>
              <p>{item.texto}</p>
              <ul>
                {item.incluye.map((linea) => <li key={linea}>{linea}</li>)}
              </ul>
              <Link href="#contacto" className={item.destacado ? 'btn btn-primary' : 'btn btn-secondary'}>{item.cta}</Link>
            </article>
          ))}
        </div>
        <p className="pricing-note">
          * Precios mensuales orientativos para un restaurante independiente. La configuración inicial se valora según el volumen y el estado de la carta.
        </p>
        <div className="plans-comparison" aria-label="Comparativa de planes Carta Viva">
          <div className="plans-col-header">
            <span />
            <strong>Básico</strong>
            <strong>Sala</strong>
            <strong className="col-premium">Acompañado</strong>
          </div>
          {comparativaPlanes.map(({ grupo, filas }) => (
            <div className="plans-group" key={grupo}>
              <div className="plans-group-label"><span>{grupo}</span></div>
              {filas.map(([feature, basic, sala, acomp]) => (
                <div className="plans-row" key={feature}>
                  <span>{feature}</span>
                  {[basic, sala, acomp].map((activo, index) => (
                    <strong
                      className={`${activo ? 'yes' : 'no'}${index === 2 ? ' col-premium' : ''}`}
                      key={`${feature}-${index}`}
                      aria-label={activo ? 'Incluido' : 'No incluido'}
                    >
                      {activo ? <CheckIcon /> : <MinusIcon />}
                    </strong>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="section cv-faq">
        <div className="section-head narrow">
          <p className="eyebrow">Preguntas frecuentes</p>
          <h2>Lo que suelen preguntar antes de contratar.</h2>
        </div>
        <div className="faq-list">
          {faq.map(([pregunta, respuesta]) => (
            <details className="faq-item" key={pregunta}>
              <summary>{pregunta}</summary>
              <p>{respuesta}</p>
            </details>
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
