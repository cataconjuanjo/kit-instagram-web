import Link from 'next/link'
import Image from 'next/image'
import LeadForm from '../components/LeadForm'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

export const metadata = {
  title: 'Catas de vino en Malaga',
  description: 'Catas de vino privadas, para empresas y cursos de iniciacion con Juanjo Garcia, WSET Level 3, en Malaga y Andalucia.',
}

const formatos = [
  {
    nombre: 'Cata privada',
    precio: 'desde 120€',
    texto: 'Para 2 a 6 personas. Ideal para cumpleaños, regalos o una noche distinta en casa.',
    incluye: ['5 o 6 vinos', 'Guia de cata', 'Contexto sencillo', 'Duracion 1,5 a 2 horas'],
  },
  {
    nombre: 'Cata para empresas',
    precio: 'desde 20€/persona',
    texto: 'Una actividad elegante y participativa para equipos, incentivos o eventos con clientes.',
    incluye: ['Formato a medida', 'Dinamica de grupo', 'Opcion con maridaje', 'Desplazamiento a empresa'],
  },
  {
    nombre: 'Curso de iniciacion',
    precio: 'desde 60€/persona',
    texto: 'Para entender estilos, variedades, etiquetas, servicio y maridaje sin tecnicismos innecesarios.',
    incluye: ['Sesiones practicas', 'Material de apoyo', 'Cata guiada', 'Lenguaje claro'],
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
            Catas privadas, experiencias para empresas y cursos de iniciacion con una idea sencilla: disfrutar mas
            del vino porque entiendes mejor lo que tienes en la copa.
          </p>
          <div className="hero-actions">
            <Link href="#contacto" className="btn btn-primary">Reservar una cata</Link>
            <Link href="#formatos" className="btn btn-secondary">Ver formatos</Link>
          </div>
        </div>
        <div className="photo-collage">
          <Image src="/assets/instagram/post-4.jpg" alt="Cata de vinos con Juanjo Garcia" width={640} height={640} />
          <Image src="/assets/instagram/post-8.jpg" alt="Formacion de vino en Malaga" width={640} height={640} />
          <Image src="/assets/instagram/post-10.jpg" alt="Vinos para cata privada" width={640} height={853} />
        </div>
      </section>

      <section className="section intro-band tasting-intro">
        <p>
          Una buena cata no va de acertar aromas raros. Va de entender acidez, cuerpo, textura, origen y por que un
          vino funciona mejor en una mesa que en otra.
        </p>
      </section>

      <section id="formatos" className="section">
        <div className="section-head">
          <p className="eyebrow">Formatos</p>
          <h2>Catas con estructura, ritmo y conversacion real.</h2>
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
          <h2>Diseñamos la cata segun el grupo, la ocasion y el nivel.</h2>
        </div>
        <div className="topic-list">
          {temas.map((tema) => <span key={tema}>{tema}</span>)}
        </div>
      </section>

      <section className="section split">
        <div>
          <p className="eyebrow">Como trabajo</p>
          <h2>Rigor tecnico, lenguaje normal y una mesa que no se enfria.</h2>
        </div>
        <div className="copy-stack">
          <p>
            Preparo cada cata con una seleccion coherente, materiales sencillos y un hilo conductor. No se trata de
            impresionar con vocabulario, sino de que el grupo salga sabiendo algo que podra usar la proxima vez que
            pida una botella.
          </p>
          <p>
            Si hay comida, adapto los vinos al contexto. Si es empresa, cuido el ritmo y la participacion. Si es una
            celebracion, busco que sea memorable sin ponerse academico.
          </p>
        </div>
      </section>

      <section id="contacto" className="section contact-section">
        <div>
          <p className="eyebrow">Reserva</p>
          <h2>Cuéntame que tienes en mente.</h2>
          <p>
            Dime fecha aproximada, numero de personas, lugar y tipo de cata. Te respondo con una propuesta clara.
          </p>
          <div className="contact-links">
            <a href="mailto:cataconjuanjo@gmail.com">cataconjuanjo@gmail.com</a>
            <a href="https://wa.me/34601502868">WhatsApp</a>
            <a href="https://instagram.com/cataconjuanjo">@cataconjuanjo</a>
          </div>
        </div>
        <LeadForm source="Servicios de cata" />
      </section>
      <PublicFooter />
    </main>
  )
}
