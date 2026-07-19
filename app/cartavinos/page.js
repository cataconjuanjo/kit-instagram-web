import Link from 'next/link'
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

const lineasProducto = [
  {
    nombre: 'Carta Viva Restaurantes',
    etiqueta: 'QR, sala y cliente final',
    texto: 'Para restaurantes que quieren que la carta de vinos trabaje de cara al cliente y al equipo de sala.',
    puntos: ['Carta pública por QR', 'Maridaje para clientes', 'Modo sala con PIN', 'Datos de uso y stock'],
    precio: 'Desde 59 EUR/mes',
    cta: 'Ver planes de restaurante',
  },
  {
    nombre: 'Carta Viva Sumiller',
    etiqueta: 'Bodega, compra y rentabilidad',
    texto: 'Para sumilleres que no quieren otra carta QR, sino una mesa de control para ordenar bodega, proveedores y gamas.',
    puntos: ['KPIs de bodega', 'Mapa de gamas editable', 'Catálogo de distribuidores', 'Constructor de carta'],
    precio: 'Desde 149 EUR/mes',
    cta: 'Ver membresia sumiller',
  },
]

const sumillerFunciones = [
  ['Inventario vivo', 'Stock, coste, proveedor, margen, mínimo y alertas para dejar atras el Excel de bodega.'],
  ['Mapa de gamas', 'Lectura por tramos según ticket medio editable: baja, media, alta, muy alta y premium.'],
  ['Vinos estrella y joyas', 'Lectura de referencias con potencial, rotación, margen y oportunidades de carta.'],
  ['Catálogo conectado', 'Búsqueda en el catálogo de distribuidores para localizar referencias e incorporarlas con criterio.'],
  ['Constructor de carta', 'Salida estructurada para armar o rehacer la carta antes de llevarla a Word o a diseño final.'],
  ['Copa con cabeza', 'Simulador de rentabilidad para valorar si una referencia tiene sentido por copa sin precios absurdos.'],
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
  {
    etiqueta: 'Sumiller',
    titulo: 'Mapa de gamas',
    dato: '5 gamas',
    filas: ['Ticket medio editable', 'Huecos por gama', 'Familias y vinos por tramo'],
  },
]

const faq = [
  ['¿Hay permanencia mínima?', 'No. Puedes cancelar cuando quieras. La suscripción se adapta al momento de tu restaurante.'],
  ['¿Cuánto tarda en estar listo?', 'La puestá en marcha suele llevar entre 1 y 3 días. Depende del tamaño de la carta y de si ya tienes los vinos en un listado o hay que construirlo desde cero.'],
  ['¿La configuración inicial tiene coste aparte?', 'Depende del volumen y del estado de la carta. Antes de empezar valoramos la carga inicial y te indicamos el importe con claridad. Está incluida en el plan Acompañado.'],
  ['¿Puedo cambiar de plan más adelante?', 'Sí, en cualquier momento. Puedes subir de Básico a Sala o a Acompañado según lo que necesites.'],
  ['¿Qué pasa con mis datos si cancelo?', 'Antes de cerrar la cuenta te entrego toda tu información en formato descargable. Nada desaparece sin que lo tengas guardado.'],
  ['¿Necesito instalar algo?', 'No. Carta Viva funciona desde el navegador en móvil, tablet y escritorio. Sin apps, sin instalaciones.'],
  ['¿El maridaje recomienda vinos de fuera de mi carta?', 'No. El motor de maridaje solo trabaja con los vinos que tú tienes dados de alta. Nunca sugiere referencias que no puedes servir.'],
  ['Carta Viva Sumiller ¿Carta Viva Sumiller sustituye al sumiller?', 'No. Ordena stock, proveedores, coste, gamas, rentabilidad y oportunidades para que el sumiller decida mejor. No decide armonías por el profesional.'],
  ['Carta Viva Sumiller ¿Carta Viva Sumiller incluye carta pública o QR?', 'No es el foco. La membresia Sumiller está pensada como gestión interna de bodega, constructor de carta, catálogo, mapa de gamas y control de referencias.'],
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
          <p className="eyebrow">Sistema de vino para restaurantes y sumilleres</p>
          <h1>Carta Viva: carta QR, sala y bodega conectadas.</h1>
          <p className="lead">
            Dos caminos bajo la misma marca: carta digital y modo sala para restaurantes; gestión de bodega,
            proveedores y mapa de gamas para sumilleres.
          </p>
          <div className="hero-actions">
            <Link href="#prueba" className="btn btn-primary">Solicitar prueba 14 días</Link>
            <Link href="#sumiller" className="btn btn-secondary">Ver Carta Viva Sumiller</Link>
          </div>
          <div className="cv-trust-line">
            <span>Configuración acompañada</span>
            <span>Sin permanencia</span>
            <span>Restaurante o sumiller</span>
          </div>
        </div>

        <div className="cv-hero-visual app-showcase" aria-label="Vista previa de Carta Viva">
          <div className="app-window">
            <div className="app-window-bar">
              <span />
              <span />
              <span />
              <strong>Panel Carta Viva</strong>
            </div>
            <div className="app-dashboard-grid">
              <section className="app-main-panel">
                <div className="app-panel-head">
                  <span>Bodega hoy</span>
                  <strong>18.420 EUR</strong>
                </div>
                <div className="app-kpi-row">
                  <div><strong>7</strong><span>stock bajo</span></div>
                  <div><strong>12</strong><span>por copa</span></div>
                  <div><strong>31%</strong><span>margen medio</span></div>
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
            <span>Modo sala</span>
            <strong>Recomienda con seguridad</strong>
            <p>Lubina a la brasa</p>
            <div className="app-wine-card">
              <small>Mejor opción</small>
              <b>Godello con textura</b>
              <em>Sube ticket y encaja con el plato</em>
            </div>
          </div>
          <div className="cv-floating-panel app-floating-panel">
            <span>Carta pública por QR</span>
            <strong>Cliente, sala y bodega conectados</strong>
            <p>Una vista para vender, otra para recomendar y otra para decidir qué comprar.</p>
          </div>
        </div>
      </section>

      <section className="cv-statement">
        <p>
          Carta Viva ya no es una sola promesa. Para restaurantes, hace visible y vendible la carta. Para sumilleres,
          convierte la bodega en un sistema de control: stock, proveedores, costes, gamas y oportunidades.
        </p>
      </section>

      <section className="section cv-comparison-section">
        <div className="section-head">
          <p className="eyebrow">Carta Viva vs PDF o Excel</p>
          <h2>Una carta estatica informa. Una carta viva ayuda a decidir.</h2>
        </div>
        <div className="comparison-grid">
          <article>
            <span>PDF</span>
            <h3>Bonito, pero rigido</h3>
            <p>Sirve para mostrar la carta, pero no sabe si queda stock, que vino conviene empujar o que plato necesita una recomendacion mejor.</p>
          </article>
          <article>
            <span>Excel</span>
            <h3>Control interno sin venta</h3>
            <p>Puede ordenar costes y proveedores, pero rara vez llega al cliente o al camarero cuando tiene que recomendar durante el servicio.</p>
          </article>
          <article className="featured">
            <span>Carta Viva</span>
            <h3>Cliente, sala y bodega conectados</h3>
            <p>Une QR, modo sala, maridaje, stock, coste, proveedor y seguimiento para que la misma información trabaje en todo el restaurante.</p>
          </article>
        </div>
        <Link href="/recursos/carta-viva-vs-pdf-excel" className="btn btn-secondary">Leer comparativa completa</Link>
      </section>

      <section className="section cv-product-lines">
        <div className="section-head">
          <p className="eyebrow">Dos formás de usar Carta Viva</p>
          <h2>Una para vender mejor. Otra para gestionar mejor.</h2>
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
                <Link href={linea.nombre.includes('Sumiller') ? '#prueba-sumiller' : '#planes'} className="btn btn-secondary">{linea.cta}</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section cv-activation-path" id="prueba">
        <div className="section-head narrow">
          <p className="eyebrow">Prueba guiada de 14 días</p>
          <h2>Tu primera carta públicada, no otra herramienta abandonada.</h2>
          <p>La prueba empieza con un objetivo concreto: cargar la base, comprobar el maridaje y poner el QR delante de un cliente real.</p>
        </div>
        <div className="cv-activation-grid">
          <article><span>1</span><strong>Me envías tu carta</strong><p>PDF, Excel o listado. Te digo qué está listo y qué falta.</p></article>
          <article><span>2</span><strong>Montamos la base</strong><p>Vinos, platos, precios y perfiles esenciales para recomendar.</p></article>
          <article><span>3</span><strong>Pruebas sala y QR</strong><p>Validas carta pública, modo camarero y primeras recomendaciones.</p></article>
          <article><span>4</span><strong>Decides con datos</strong><p>Al final de los 14 días sabes si aporta valor al restaurante.</p></article>
        </div>
        <div className="cv-activation-cta">
          <div>
            <strong>Sin permanencia. Sin compromiso de continuidad.</strong>
            <span>La configuración inicial se valora según el volumen de la carta.</span>
          </div>
          <Link href="#contacto" className="btn btn-primary">Solicitar mi prueba</Link>
        </div>
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

      <section className="section cv-sumiller-section" id="sumiller">
        <div className="section-head">
          <p className="eyebrow">Carta Viva Sumiller</p>
          <h2>El Excel de bodega convertido en una herramienta profesional.</h2>
          <p>
            Pensado para sumilleres que ya tienen criterio y necesitan menos trabajo mecánico:
            inventario, proveedores, catálogo, rentabilidad, mapa de gamas y salida estructurada de carta.
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
          <p>Le quita fricción: no decide armonías por el profesional, pero le muestra que referencias faltan, sobran, rotan, inmovilizan dinero o tienen sentido por copa.</p>
        </div>
        <div className="sumiller-section-cta">
          <div>
            <strong>Prueba privada para sumilleres</strong>
            <span>Te preparo un acceso de prueba y vemos si encaja con tu forma de gestionar la bodega.</span>
          </div>
          <Link href="#prueba-sumiller" className="btn btn-primary">Solicitar prueba Sumiller</Link>
        </div>
      </section>

      <section id="prueba-sumiller" className="section contact-section sumiller-trial-section">
        <div>
          <p className="eyebrow">Prueba privada Sumiller</p>
          <h2>Solicita acceso a Carta Viva Sumiller.</h2>
          <p>
            Pensado para sumilleres, jefes de sala o responsables de bodega que quieren probar la herramienta
            con un acceso privado antes de decidir. La activación se revisa manualmente para que no entre cualquiera.
          </p>
        </div>
        <LeadForm
          source="Carta Viva Sumiller - solicitud de prueba privada"
          cta="Solicitar prueba Sumiller"
          title="Datos para preparar la prueba"
          successTitle="Solicitud Sumiller recibida"
          successText="Te respondere con el siguiente paso para activar la prueba privada de Carta Viva Sumiller."
          intro="2 minutos - acceso privado - respuesta personal"
          negocioLabel="Restaurante / bodega / proyecto"
          referenciasLabel="Referencias apróximadas en bodega"
          problemaLabel="Qué quieres resolver primero"
          problemaOptions={[
            'Gestiono la bodega con Excel',
            'No controlo stock y reposición',
            'Quiero ordenar proveedores y costes',
            'Quiero rehacer o estructurar la carta',
            'Quiero analizar gamas, margen y oportunidades',
          ]}
          mensajeLabel="Algo que deba saber antes de prepararte la prueba? (opcional)"
        />
      </section>

      <section className="section cv-demo-section" id="demo-segura">
        <div className="section-head narrow">
          <p className="eyebrow">Ve cómo funciona</p>
          <h2>Cuatro pantallas reales con datos de ejemplo.</h2>
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
          <p className="eyebrow">Planes para restaurantes</p>
          <h2>Elige cuanto quieres que trabaje tu carta de vinos en sala.</h2>
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
            Manda el nombre del restaurante y una idea de tu carta actual. Te responderé con una propuestá clara.
          </p>
        </div>
        <LeadForm
          source="Carta Viva · prueba guiada 14 días"
          cta="Solicitar prueba de 14 días"
          title="Solicita tu prueba guiada"
          successTitle="Prueba solicitada"
        />
      </section>

      <PublicFooter />
    </main>
  )
}
