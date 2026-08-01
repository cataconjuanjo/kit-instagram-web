import Link from 'next/link'
import DemoAnalyticsLink from '../components/DemoAnalyticsLink'
import DemoBookingSection from '../components/DemoBookingSection'
import LeadForm from '../components/LeadForm'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

const pilares = [
  ['Cliente', 'Una carta pública clara, elegante y actualizada, con recomendaciones que nacen de los platos reales del restaurante.'],
  ['Sala y sumillería', 'Argumentos de servicio para explicar por qué un vino encaja, qué alternativa ofrecer y qué referencia conviene mover.'],
  ['Dirección', 'Margen, rotación, stock, compras y señales mensuales para decidir si la bodega está trabajando o reteniendo dinero.'],
]

const funciones = [
  {
    titulo: 'Carta pública editable, no PDF',
    texto: 'El QR abre una carta viva: filtros útiles, fichas claras, disponibilidad actualizada y una lectura cómoda durante el servicio.',
  },
  {
    titulo: 'Maridaje con cocina real',
    texto: 'Relaciona vinos disponibles con platos concretos, técnicas, intensidad, salsas y ticket, sin recomendar referencias que no puedes servir.',
  },
  {
    titulo: 'Modo sala con argumentos',
    texto: 'Da al equipo frases de servicio, alternativas por estilo y precio, opciones por copa y señales para empujar vinos estratégicos sin forzar la venta.',
  },
  {
    titulo: 'Lectura económica de la carta',
    texto: 'Cruza coste, PVP, margen, rotación, stock, proveedor e incidencias para que dirección pueda revisar compras y retorno mensual.',
  },
]

const controles = [
  ['Margen por referencia', 'Coste, PVP y beneficio bruto para saber qué vinos sostienen rentabilidad y cuáles necesitan revisión.'],
  ['Stock mínimo operativo', 'Alertas antes de que sala descubra en mesa que no queda una botella importante.'],
  ['Compra por proveedor', 'Pedidos sugeridos por distribuidor, referencia y formato para comprar mejor, no solo reponer por costumbre.'],
  ['Incidencias de sala', 'No quedaba, no convenció, pidió otra opción: señales breves que después se convierten en decisiones.'],
  ['Rotación e inmovilizado', 'Vinos con salida real, referencias lentas y botellas que retienen capital sin aportar al servicio.'],
  ['Retorno mensual', 'Lectura periódica de oportunidades: copa, premium, margen bajo, carta inflada, huecos de gama y compras a ajustar.'],
]

const lineasProducto = [
  {
    nombre: 'Carta Viva Restaurantes',
    etiqueta: 'Bodega de restaurante + carta pública',
    texto: 'Para restaurantes que necesitan gestionar bodega, publicar una carta QR con Armonia y dar argumentos útiles al equipo de sala.',
    puntos: ['Carta QR con Armonia', 'Gestión de bodega', 'Argumentos para sala', 'Stock, margen y seguimiento'],
    precio: 'Desde 59 €/mes',
    cta: 'Ver planes de restaurante',
    href: '#planes',
  },
  {
    nombre: 'Carta Viva Sumiller',
    etiqueta: 'Bodega y criterio sin carta pública',
    texto: 'Para sumilleres, jefes de sala o dueños que quieren gestionar directamente el vino del negocio sin publicar una carta al cliente.',
    puntos: ['Inventario y stock', 'Coste y margen por vino', 'Compras y proveedores', 'Argumentos internos'],
    precio: 'Desde 149 €/mes',
    cta: 'Ver membresía sumiller',
    href: '#sumiller',
  },
  {
    nombre: 'Kiosko',
    etiqueta: 'Autoservicio para tiendas de vino',
    texto: 'Para vinotecas y tiendas que quieren un puesto tipo autoservicio donde el cliente simula su pedido y el dueño controla stock y actividad.',
    puntos: ['Puesto digital en tienda', 'Simulación de pedido', 'Catálogo de vinos', 'Dashboard de stock e informes'],
    precio: 'Planes Kiosko',
    cta: 'Ver Kiosko',
    href: '/kiosko/contratar',
  },
]

const argumentosPorPerfil = [
  {
    etiqueta: 'Sala y sumillería',
    titulo: 'Para una sala que necesita recomendar sin improvisar.',
    texto: 'Elena necesita que el equipo hable de vino con coherencia cuando el servicio aprieta: qué encaja, qué alternativa ofrecer y cómo sostener el relato de cocina sin convertir cada mesa en una clase.',
    puntos: [
      'Argumentos por plato',
      'Alternativas si falta stock',
      'Coherencia con cocina',
      'Frases de servicio naturales',
    ],
    cta: 'Reservar demo',
    href: '/cartavinos#demo',
  },
  {
    etiqueta: 'Dirección y propiedad',
    titulo: 'Para una dirección que necesita ver margen, rotación y retorno.',
    texto: 'Miguel necesita saber si la bodega trabaja para el negocio: qué referencias inmovilizan capital, dónde se pierde margen, qué compras conviene ajustar y qué oportunidades revisar cada mes.',
    puntos: [
      'Margen, coste y PVP',
      'Rotación y stock parado',
      'Pedidos por proveedor',
      'Lectura mensual de retorno',
    ],
    cta: 'Reservar demo',
    href: '/cartavinos#demo',
  },
]

const sumillerFunciones = [
  ['Argumentos de servicio', 'Explicaciones claras para recomendar por plato, intensidad, textura, precio y objetivo de venta.'],
  ['Alternativas disponibles', 'Opciones por estilo y gama cuando falta una referencia o el cliente pide otro tramo de precio.'],
  ['Coherencia con cocina', 'Lectura de maridaje sobre platos reales para que sala no recomiende desde teoría genérica.'],
  ['Inventario vivo', 'Stock, coste, proveedor, margen, mínimo y alertas para que la bodega no dependa de memoria o libreta.'],
  ['Mapa de gamas', 'Tramos según ticket medio editable para detectar huecos, saturaciones y premium sin apoyo de sala.'],
  ['Copa con cabeza', 'Simulador para valorar si una referencia tiene sentido por copa con margen, merma y rotación prudente.'],
]

const demoSegura = [
  {
    etiqueta: 'Sala',
    titulo: 'Argumentos activos',
    dato: '12 platos',
    filas: ['Lubina · godello con textura', 'Steak tartar · tinto atlántico', 'Quesos · generoso seco'],
  },
  {
    etiqueta: 'Dirección',
    titulo: 'Retorno mensual',
    dato: '3 acciones',
    filas: ['Revisar PVP bajo margen', 'Activar copa premium', 'Frenar compra lenta'],
  },
  {
    etiqueta: 'Bodega',
    titulo: 'Pedido sugerido',
    dato: '7 refs',
    filas: ['Albariño casa · pedir 6', 'Crianza carta · pedir 12', 'Espumoso seco · revisar margen'],
  },
  {
    etiqueta: 'Servicio',
    titulo: 'Cierre de turno',
    dato: '4 señales',
    filas: ['2 ventas marcadas', '1 no quedaba', '1 pidió otra opción'],
  },
]

const faq = [
  ['¿Esto es solo un PDF con QR?', 'No. Un PDF con QR muestra una lista. Carta Viva conecta carta pública, platos, disponibilidad, argumentos de sala, coste, margen, rotación y seguimiento.'],
  ['¿Es un inventario genérico de vinos?', 'No. El inventario es solo una parte. La diferencia está en cruzar bodega con cocina, servicio, PVP, proveedor, incidencias y decisiones mensuales de compra o carta.'],
  ['¿Sirve si ya tengo sumiller o jefe de sala?', 'Sí. No sustituye su criterio: lo ordena para que el equipo lo use mejor y dirección pueda ver qué decisiones salen de ese criterio.'],
  ['¿Cómo se mide el retorno mensual?', 'Se revisan oportunidades concretas: referencias inmovilizadas, margen bajo, candidatos por copa, stock crítico, compras evitables, gamas saturadas y vinos que necesitan apoyo de sala.'],
  ['¿El equipo tiene que saber mucho vino?', 'No. Carta Viva no pretende convertir a todo el equipo en sumiller. Les da argumentos breves, alternativas y recomendaciones defendibles para el servicio real.'],
  ['¿Hay permanencia mínima?', 'No. Puedes cancelar cuando quieras. La suscripción se adapta al momento de tu restaurante.'],
  ['¿Cuánto tarda en estar listo?', 'La puesta en marcha suele llevar entre 1 y 3 días. Depende del tamaño de la carta y de si ya tienes los vinos en un listado o hay que construirlo desde cero.'],
  ['¿La configuración inicial tiene coste aparte?', 'Depende del volumen y del estado de la carta. Antes de empezar valoramos la carga inicial y te indicamos el importe con claridad. Está incluida en el plan Acompañado.'],
  ['¿Qué pasa con mis datos si cancelo?', 'Antes de cerrar la cuenta te entrego toda tu información en formato descargable. Nada desaparece sin que lo tengas guardado.'],
  ['¿El maridaje recomienda vinos de fuera de mi carta?', 'No. El motor de maridaje solo trabaja con los vinos que tú tienes dados de alta. Nunca sugiere referencias que no puedes servir.'],
  ['¿Necesito instalar algo?', 'No. Carta Viva funciona desde el navegador en móvil, tablet y escritorio. Sin apps, sin instalaciones.'],
]

const modalidades = [
  {
    nombre: 'Digitalización',
    etiqueta: 'Para ordenar la carta',
    texto: 'Carta pública editable, panel privado, personalización visual, vinos y platos conectados.',
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
    etiqueta: 'Carta pública editable',
    texto: 'Para restaurantes que quieren dejar atrás el PDF y ofrecer una carta de vinos clara, actualizable y conectada con cocina.',
    incluye: ['QR editable, no PDF estático', 'Carta de vinos actualizable', 'Fichas claras para cliente', 'Maridaje desde platos reales', 'Personalización visual'],
    cta: 'Empezar con carta viva',
  },
  {
    nombre: 'Sala',
    precio: '99',
    etiqueta: 'Servicio y venta',
    texto: 'Para restaurantes que quieren que sala recomiende con seguridad, cuide la experiencia y mueva referencias con intención.',
    incluye: ['Todo el plan Básico', 'Modo sala con PIN', 'Argumentos por plato o mesa', 'Alternativas según disponibilidad', 'Objetivos de venta y rotación'],
    destacado: true,
    cta: 'Reforzar sala',
  },
  {
    nombre: 'Acompañado',
    precio: '199',
    etiqueta: 'Software + lectura mensual',
    texto: 'Para restaurantes que quieren revisar margen, rotación, compras, carta y oportunidades con criterio profesional continuo.',
    incluye: ['Todo el plan Sala', 'Revisión mensual de retorno', 'Lectura profesional de oportunidades', 'Ajuste de carta, copa y compras', 'Soporte prioritario'],
    premium: true,
    desde: true,
    cta: 'Ver retorno mensual',
  },
]

const comparativaPlanes = [
  {
    grupo: 'Carta pública',
    filas: [
      ['QR editable, no PDF estático', true, true, true],
      ['Carta de vinos actualizable', true, true, true],
      ['Maridaje con platos reales', true, true, true],
      ['Personalización visual', true, true, true],
    ],
  },
  {
    grupo: 'Sala y dirección',
    filas: [
      ['Modo sala con PIN', false, true, true],
      ['Argumentos por plato o mesa', false, true, true],
      ['Alternativas según disponibilidad', false, true, true],
      ['Señales de margen y rotación', false, true, true],
      ['Control de stock y bodega', false, true, true],
    ],
  },
  {
    grupo: 'Acompañamiento y retorno',
    filas: [
      ['Revisión mensual de retorno', false, false, true],
      ['Lectura profesional de oportunidades', false, false, true],
      ['Ajuste de carta, copa y compras', false, false, true],
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
  title: 'Carta Viva · Gestión de vino para restaurantes, sumilleres y tiendas',
  description: 'Carta Viva reúne gestión de bodega para restaurantes, herramienta interna para sumilleres y Kiosko para tiendas de vino con stock, margen, argumentos e informes reales.',
  alternates: {
    canonical: '/cartavinos',
  },
  openGraph: {
    title: 'Carta Viva · Gestión de vino para restaurantes, sumilleres y tiendas',
    description: 'Carta Viva Restaurantes, Carta Viva Sumiller y Kiosko: tres formas de gestionar vino con criterio, stock, margen e informes reales.',
    url: '/cartavinos',
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
  },
}

export default function CartaVivaPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(([pregunta, respuesta]) => ({
      '@type': 'Question',
      name: pregunta,
      acceptedAnswer: {
        '@type': 'Answer',
        text: respuesta,
      },
    })),
  }

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Carta Viva',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: metadata.description,
    offers: {
      '@type': 'Offer',
      price: '59',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
  }

  return (
    <main className="site-shell carta-viva-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([faqJsonLd, productJsonLd]) }}
      />
      <PublicNav active="carta" eyebrow="Carta Viva para restaurantes" />

      <section className="cv-hero">
        <div className="cv-hero-copy">
          <p className="eyebrow">Carta de vinos operativa para restaurantes</p>
          <h1>Carta Viva no es un PDF con QR. Es una carta que trabaja en sala y en dirección.</h1>
          <p className="lead">
            Para restaurantes con una carta de vinos seria: convierte cada referencia en una recomendación defendible
            para sala y en una decisión medible para propiedad: margen, rotación, stock, compras y retorno mensual.
          </p>
          <div className="hero-actions">
            <Link href="#demo" className="btn btn-primary">Reservar demo de 30 min</Link>
            <Link href="#demo-segura" className="btn btn-secondary">Ver demo segura</Link>
          </div>
          <div className="cv-trust-line">
            <span>Maridaje con cocina real</span>
            <span>Argumentos para sala</span>
            <span>Lectura económica mensual</span>
          </div>
        </div>

        <div className="cv-hero-visual app-showcase" aria-label="Vista previa de Carta Viva">
          <div className="app-window">
            <div className="app-window-bar">
              <span />
              <span />
              <span />
              <strong>Dirección Carta Viva</strong>
            </div>
            <div className="app-dashboard-grid">
              <section className="app-main-panel">
                <div className="app-panel-head">
                  <span>Valor en bodega</span>
                  <strong>18.420 EUR</strong>
                </div>
                <div className="app-kpi-row">
                  <div><strong>7</strong><span>stock crítico</span></div>
                  <div><strong>12</strong><span>rotación lenta</span></div>
                  <div><strong>64%</strong><span>margen medio</span></div>
                </div>
                <div className="app-chart" aria-hidden="true">
                  <span style={{ height: '44%' }} />
                  <span style={{ height: '68%' }} />
                  <span style={{ height: '52%' }} />
                  <span style={{ height: '82%' }} />
                  <span style={{ height: '61%' }} />
                  <span style={{ height: '74%' }} />
                </div>
              </section>
              <section className="app-side-panel">
                <span>Pedido sugerido</span>
                <strong>3 proveedores</strong>
                <p>Albariño casa · pedir 6</p>
                <p>Crianza carta · pedir 12</p>
                <p>Espumoso seco · revisar margen</p>
              </section>
            </div>
          </div>
          <div className="app-phone">
            <div className="app-phone-top" />
            <span>Sala / sumillería</span>
            <strong>Argumento listo para servicio</strong>
            <p>Lubina a la brasa</p>
            <div className="app-wine-card">
              <small>Recomendación defendible</small>
              <b>Godello con textura</b>
              <em>Frescura, volumen y margen correcto</em>
            </div>
          </div>
          <div className="cv-floating-panel app-floating-panel">
            <span>No es un PDF</span>
            <strong>Carta, sala y dirección con la misma base</strong>
            <p>Cliente entiende, sala defiende y dirección mide compras, rotación y rentabilidad.</p>
          </div>
        </div>
      </section>

      <section className="cv-statement">
        <p>
          Carta Viva transforma una carta de vinos seria en un sistema de servicio y gestión. No sustituye el criterio
          del sumiller; lo hace visible para el equipo y medible para dirección.
        </p>
      </section>

      <section className="section cv-comparison-section">
        <div className="section-head">
          <p className="eyebrow">No es un PDF con QR ni un inventario genérico</p>
          <h2>La carta deja de ser un archivo y empieza a comportarse como una herramienta.</h2>
        </div>
        <div className="comparison-grid">
          <article>
            <span>PDF</span>
            <h3>Muestra, pero no acompaña el servicio</h3>
            <p>Un QR que abre un PDF sigue siendo una carta estática: no sabe qué queda, qué combina con cocina ni qué argumento necesita sala.</p>
          </article>
          <article>
            <span>Inventario</span>
            <h3>Cuenta botellas, pero no vende vino</h3>
            <p>Un inventario genérico puede registrar stock, pero no relaciona coste, PVP, platos, rotación, incidencias y criterio comercial.</p>
          </article>
          <article className="featured">
            <span>Carta Viva</span>
            <h3>Conecta experiencia y rentabilidad</h3>
            <p>Cada vino tiene contexto de servicio y lectura económica: recomendación, disponibilidad, margen, proveedor, rotación y acción siguiente.</p>
          </article>
        </div>
        <Link href="/recursos/carta-viva-vs-pdf-excel" className="btn btn-secondary">Leer comparativa completa</Link>
      </section>

      <section className="section cv-audience-section" id="sala-direccion">
        <div className="audience-section-head">
          <div>
            <p className="eyebrow">Dos perfiles, una misma carta</p>
            <h2>Sala necesita argumentos. Dirección necesita decisiones.</h2>
          </div>
          <p>
            Carta Viva separa las preguntas sin separar los datos: el equipo trabaja con lenguaje de servicio y
            propiedad ve margen, rotación, compras y retorno mensual.
          </p>
        </div>
        <div className="audience-grid">
          {argumentosPorPerfil.map((perfil) => (
            <article className="audience-card" key={perfil.etiqueta}>
              <header className="audience-card-head">
                <span className="plan-label">{perfil.etiqueta}</span>
                <h3>{perfil.titulo}</h3>
              </header>
              <p>{perfil.texto}</p>
              <ul>
                {perfil.puntos.map((punto) => <li key={punto}>{punto}</li>)}
              </ul>
              <footer className="audience-card-footer">
                <Link href={perfil.href} className="btn btn-secondary">{perfil.cta}</Link>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="section cv-product-lines">
        <div className="section-head">
          <p className="eyebrow">Líneas de producto</p>
          <h2>Restaurante, Sumiller y Kiosko no resuelven el mismo problema.</h2>
        </div>
        <div className="product-lines-grid">
          {lineasProducto.map((linea) => (
            <article className={`product-line-card ${linea.destacado ? 'featured' : ''}`} key={linea.nombre}>
              <span className="plan-label">{linea.etiqueta}</span>
              <h3>{linea.nombre}</h3>
              <p>{linea.texto}</p>
              <ul>
                {linea.puntos.map((punto) => <li key={punto}>{punto}</li>)}
              </ul>
              <div className="product-line-footer">
                <strong>{linea.precio}</strong>
                <Link href={linea.href} className="btn btn-secondary">{linea.cta}</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section cv-activation-path" id="prueba">
        <div className="section-head narrow">
          <p className="eyebrow">Prueba guiada de 14 días</p>
          <h2>Tu primera carta útil en servicio, no otra herramienta abandonada.</h2>
          <p>La prueba tiene un objetivo concreto: publicar una carta que sala pueda usar y que dirección pueda medir.</p>
        </div>
        <div className="cv-activation-grid">
          <article><span>1</span><strong>Analizamos tu carta</strong><p>PDF, Excel o listado. Revisamos estructura, datos críticos, huecos de margen y coherencia con cocina.</p></article>
          <article><span>2</span><strong>Construimos la base</strong><p>Vinos, platos, precios, costes, disponibilidad y perfiles esenciales para recomendar.</p></article>
          <article><span>3</span><strong>Probamos en sala</strong><p>Validas QR, argumentos, alternativas y recomendaciones delante de mesas reales.</p></article>
          <article><span>4</span><strong>Revisamos retorno</strong><p>Al final sabes qué se consulta, qué rota, qué falta y qué compra conviene ajustar.</p></article>
        </div>
        <div className="cv-activation-cta">
          <div>
            <strong>Sin permanencia. Con una decisión clara al final.</strong>
            <span>Seguir, ajustar o descartarlo con criterio operativo y económico.</span>
          </div>
          <Link href="/cartavinos#demo" className="btn btn-primary">Reservar demo</Link>
        </div>
      </section>

      <section id="como-funciona" className="section cv-flow-section">
        <div className="section-head">
          <p className="eyebrow">Tres lecturas de la misma carta</p>
          <h2>La misma carta responde preguntas distintas.</h2>
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
            <p className="eyebrow">Lectura mensual</p>
            <h3>Lo que el vino está moviendo</h3>
            <div className="cv-insight-row"><strong>Carta por copa</strong><span>2 candidatas</span></div>
            <div className="cv-insight-row"><strong>Stock bajo</strong><span>3 referencias</span></div>
            <div className="cv-insight-row"><strong>Margen bajo</strong><span>Revisar PVP</span></div>
          </div>
        </div>
        <div>
          <p className="eyebrow">Criterio + datos</p>
          <h2>La sala necesita argumentos. La dirección necesita decisiones.</h2>
          <p>
            Carta Viva ordena información que normalmente está dispersa: vinos, platos, precios, costes, stock,
            proveedores y señales de servicio. A partir de ahí, convierte datos en decisiones concretas: qué recomendar,
            qué comprar, qué destacar, qué formar y qué retirar.
          </p>
        </div>
      </section>

      <section className="section cv-features">
        <div className="section-head">
          <p className="eyebrow">Qué incluye</p>
          <h2>Funciones pensadas para restaurantes donde el vino importa.</h2>
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

      <blockquote className="cv-quote-band">
        <p>Una botella vendida con argumento vale más que diez vendidas por inercia.</p>
        <cite>Carta Viva · criterio de sumiller para el servicio de cada noche</cite>
      </blockquote>

      <section className="section cv-control-section">
        <div className="section-head">
          <p className="eyebrow">Para dirección y propiedad</p>
          <h2>Margen, rotación y compras sin convertir la bodega en un Excel eterno.</h2>
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

      <section className="section cv-sumiller-section" id="sumiller">
        <div className="section-head">
          <p className="eyebrow">Sala y sumillería</p>
          <h2>El criterio del sumiller convertido en argumentos de servicio.</h2>
          <p>
            Pensado para sumilleres, jefes de sala y responsables de bodega que ya tienen criterio y necesitan que
            ese criterio llegue al equipo: platos reales, alternativas, copa, gamas, stock y argumentos de venta.
          </p>
        </div>
        <div className="sumiller-dashboard">
          <div className="sumiller-map">
            <div className="map-head">
              <span>Mapa de gamas</span>
              <strong>Ticket medio 55 EUR</strong>
            </div>
            <div className="map-bars" aria-hidden="true">
              <span style={{ height: '38%' }} />
              <span style={{ height: '72%' }} />
              <span style={{ height: '54%' }} />
              <span style={{ height: '44%' }} />
              <span style={{ height: '24%' }} />
            </div>
            <div className="map-labels">
              <span>Baja</span><span>Media</span><span>Alta</span><span>Muy alta</span><span>Premium</span>
            </div>
          </div>
          <div className="sumiller-feature-list">
            {sumillerFunciones.map(([titulo, texto]) => (
              <article key={titulo}>
                <span />
                <div>
                  <h3>{titulo}</h3>
                  <p>{texto}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="sumiller-note">
          <strong>No sustituye al sumiller.</strong>
          <p>Convierte su criterio en lenguaje usable por el equipo: por qué encaja, cuándo ofrecer alternativa, qué vino merece salir y cómo defender una copa premium.</p>
        </div>
        <div className="sumiller-section-cta">
          <div>
            <strong>Prueba privada para sala y sumillería</strong>
            <span>Te preparo un acceso de prueba y vemos si encaja con tu forma de recomendar, formar y gestionar la bodega.</span>
          </div>
          <Link href="#prueba-sumiller" className="btn btn-primary">Solicitar prueba de sala</Link>
        </div>
      </section>

      <section id="prueba-sumiller" className="section contact-section sumiller-trial-section">
        <div>
          <p className="eyebrow">Prueba privada sala / sumillería</p>
          <h2>Prueba Carta Viva con una carta real de servicio.</h2>
          <p>
            Pensado para sumilleres, jefes de sala o responsables de bodega que quieren probar la herramienta con
            una carta real antes de decidir. La activación se revisa manualmente para que tenga sentido operativo.
          </p>
        </div>
        <LeadForm
          source="Carta Viva sala y sumillería - solicitud de prueba privada"
          cta="Solicitar prueba de sala"
          title="Datos para preparar la prueba"
          successTitle="Solicitud recibida"
          successText="Te responderé con el siguiente paso para preparar una prueba útil con tu carta real."
          intro="2 minutos · acceso privado · respuesta personal"
          negocioLabel="Restaurante / bodega / proyecto"
          referenciasLabel="Referencias aproximadas en bodega"
          problemaLabel="Qué quieres resolver primero"
          problemaOptions={[
            'Sala no tiene argumentos homogéneos',
            'Las recomendaciones no siguen la cocina',
            'Cuesta vender referencias premium',
            'Quiero ordenar copa, gamas y alternativas',
            'Quiero analizar margen, rotación y compras',
          ]}
          mensajeLabel="¿Algo que deba saber antes de prepararte la prueba? (opcional)"
        />
      </section>

      <section className="section cv-demo-section" id="demo-segura">
        <div className="section-head narrow">
          <p className="eyebrow">Ve cómo funciona</p>
          <h2>Cuatro pantallas con decisiones, no solo datos.</h2>
          <p>
            Lo que ves abajo es Carta Viva funcionando: argumentos de sala, lectura de dirección, compra y cierre de
            servicio. Los datos son inventados para proteger a los restaurantes que ya lo usan.
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
            <p>Te enseño el sistema completo con un restaurante de prueba o con una lectura inicial de tu propia carta.</p>
          </div>
          <div className="demo-note-actions">
            <DemoAnalyticsLink href="/demo/taberna-del-puerto" className="btn btn-secondary" target="/demo/taberna-del-puerto">
              Ver demo guiada
            </DemoAnalyticsLink>
            <Link href="/cartavinos#demo" className="btn btn-primary">Pedir demo privada</Link>
          </div>
        </div>
      </section>

      <DemoBookingSection />

      <section className="section cv-modalidades" id="planes">
        <div className="section-head">
          <p className="eyebrow">Planes para restaurantes</p>
          <h2>Elige cuánto quieres que Carta Viva trabaje en servicio y en rentabilidad.</h2>
        </div>
        <div className="pricing-grid">
          {planes.map((item) => (
            <article className={`price-card ${item.destacado ? 'featured' : ''} ${item.premium ? 'premium' : ''}`} key={item.nombre}>
              {item.destacado && <span className="badge">Recomendado</span>}
              {item.premium && <span className="badge badge-premium">Premium</span>}
              <h3>{item.nombre}</h3>
              <div className="plan-label">{item.etiqueta}</div>
              <div className="price">
                <strong>Desde {item.precio} €</strong>
                <small>/mes</small>
              </div>
              <p>{item.texto}</p>
              <ul>
                {item.incluye.map((linea) => <li key={linea}>{linea}</li>)}
              </ul>
              <Link href="/cartavinos#demo" className={item.destacado ? 'btn btn-primary' : 'btn btn-secondary'}>{item.cta}</Link>
            </article>
          ))}
        </div>
        <p className="pricing-note">
          * Precios mensuales orientativos para un restaurante independiente. La configuración inicial se valora según volumen, estado de datos, número de platos y nivel de acompañamiento.
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
          <p className="eyebrow">Objeciones habituales</p>
          <h2>Lo que conviene aclarar antes de decidir.</h2>
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
          <p className="eyebrow">Demo privada</p>
          <h2>Vemos si necesitas carta pública, gestión interna o Kiosko para tienda.</h2>
        </div>
        <p>
          La primera conversación sirve para detectar si necesitas Carta Viva Restaurantes, Carta Viva Sumiller o
          Kiosko. Sin automatismos baratos. Con contexto.
        </p>
      </section>

      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Contacto</p>
          <h2>¿Prefieres escribir antes de reservar?</h2>
          <p>
            Manda el nombre del restaurante, vinoteca o proyecto y una idea de lo que necesitas. Te responderé con una propuesta clara.
          </p>
        </div>
        <LeadForm
          source="Carta Viva · prueba guiada 14 días"
          cta="Enviar mensaje"
          title="Datos para orientar la demo"
          successTitle="Prueba solicitada"
          successText="Te responderé con el siguiente paso para ver qué producto encaja mejor."
          problemaOptions={[
            'Gestionar bodega de restaurante',
            'Publicar carta QR con Armonia',
            'Gestionar vino sin carta pública',
            'Poner un Kiosko en una tienda de vino',
            'No sé qué producto necesito',
          ]}
          mensajeLabel="Qué te gustaría ver en la demo"
        />
      </section>

      <PublicFooter />
    </main>
  )
}
