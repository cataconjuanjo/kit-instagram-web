const calendlyUrl = 'https://calendly.com/cataconjuanjo/30min?hide_event_type_details=1&hide_gdpr_banner=1&primary_color=74223d'

const productosDemo = [
  {
    nombre: 'Carta Viva Restaurantes',
    etiqueta: 'Bodega + carta pública',
    texto: 'Gestión de bodega para restaurante: carta QR con Armonia, argumentos para sala, stock, margen y seguimiento con datos reales.',
  },
  {
    nombre: 'Carta Viva Sumiller',
    etiqueta: 'Gestión sin carta pública',
    texto: 'Para sumilleres, jefes de sala o dueños que quieren controlar vino, bodega, margen, compras y argumentos internos directamente.',
  },
  {
    nombre: 'Kiosko',
    etiqueta: 'Tienda de vino',
    texto: 'Puesto digital tipo autoservicio para vinotecas: el cliente simula su pedido y la tienda revisa stock, actividad e informes.',
  },
]

export default function DemoBookingSection({ id = 'demo' }) {
  return (
    <section id={id} className="section demo-booking-section">
      <div className="demo-booking-copy">
        <p className="eyebrow">Demo guiada</p>
        <h2>Reserva 30 minutos para ver qué producto encaja contigo.</h2>
        <p className="demo-booking-lead">
          Vemos tu caso y te enseño el producto que tenga sentido: Carta Viva Restaurantes, Carta Viva Sumiller o Kiosko.
          Si todavía no sabes cuál necesitas, lo decidimos en la propia demo.
        </p>
        <ul className="booking-facts" aria-label="Detalles de la demo">
          <li>30 min</li>
          <li>Online</li>
          <li>Sin compromiso</li>
          <li>Horario local</li>
        </ul>
        <div className="booking-product-list" aria-label="Productos disponibles para la demo">
          {productosDemo.map((producto) => (
            <article className="booking-product" key={producto.nombre}>
              <div>
                <strong>{producto.nombre}</strong>
                <span>{producto.etiqueta}</span>
              </div>
              <p>{producto.texto}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="booking-calendar-shell">
        <div className="booking-calendar-meta">
          <strong>Agenda de demo · 30 minutos</strong>
          <a href="https://calendly.com/cataconjuanjo/30min" target="_blank" rel="noopener noreferrer">
            Abrir en Calendly
          </a>
        </div>
        <div className="booking-mobile-fallback">
          <strong>Reserva desde Calendly</strong>
          <p>En móvil la agenda funciona mejor a pantalla completa, con tu zona horaria y disponibilidad actualizada.</p>
          <a className="btn btn-primary" href="https://calendly.com/cataconjuanjo/30min" target="_blank" rel="noopener noreferrer">
            Abrir agenda
          </a>
        </div>
        <iframe
          className="calendly-frame"
          src={calendlyUrl}
          title="Calendario para reservar una demo de Carta Viva"
          loading="lazy"
        />
      </div>
    </section>
  )
}
