'use client'

import Link from 'next/link'
import { setAdminRestaurantEmail, setDemoEmail } from '../../demo'
import styles from './taberna-demo.module.css'

const DEMO_EMAIL = 'demo@taberna-del-puerto.com'
const SLUG = 'taberna-del-puerto'

const recorridos = [
  {
    id: 'cliente',
    eyebrow: '1 · Cliente en mesa',
    titulo: 'Del QR a una carta que vende vino',
    texto: 'Ensenar hub, carta publica, vinos por copa y maridaje sin pedir datos ni instalar nada.',
    href: `/r/${SLUG}?demo_presentacion=1`,
    cta: 'Ver como cliente',
    metricas: ['QR listo', '29 vinos', 'Por copa visible'],
  },
  {
    id: 'camarero',
    eyebrow: '2 · Camarero en servicio',
    titulo: 'Recomendar sin saber de memoria toda la carta',
    texto: 'Seleccionar un plato real, recibir tres vinos y registrar si se vendio, hubo duda o faltaba stock.',
    href: `/camarero/${SLUG}?demo=1&demo_focus=1`,
    cta: 'Ver como camarero',
    metricas: ['Sin PIN en demo', 'Argumento de venta', 'Resultado medible'],
    destacado: true,
  },
  {
    id: 'gerente',
    eyebrow: '3 · Gerente',
    titulo: 'Ver prioridades, margen y senales del turno',
    texto: 'Entrar al panel ya preparado para explicar bodega, precios, propuestas y cierre de servicio.',
    action: 'dashboard',
    cta: 'Ver como gerente',
    metricas: ['Dashboard guiado', 'Bodega', 'Cierre'],
  },
]

const guion = [
  'Abrir esta pagina y decir: "Esto es lo que veria un restaurante antes de instalarlo".',
  'Entrar como cliente y mostrar que el QR no es un PDF: abre hub, carta y vinos por copa.',
  'Entrar como camarero y mostrar directamente un plato con recomendaciones listas.',
  'Registrar una senal de servicio para explicar que el gerente no recibe opiniones sueltas, recibe datos.',
  'Cerrar con gerente: prioridades, bodega/precios y cierre del dia.',
]

export default function DemoTabernaDelPuerto() {
  function abrirDashboard() {
    setDemoEmail(DEMO_EMAIL)
    setAdminRestaurantEmail(DEMO_EMAIL)
    window.location.href = '/dashboard?demo_presentacion=1'
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Demo comercial preparada</p>
          <h1>La Taberna del Puerto</h1>
          <p>
            Un recorrido de 2 minutos para mostrar a otro restaurante que Carta Viva no es solo una carta digital:
            ayuda al cliente a elegir, al camarero a vender y al gerente a decidir.
          </p>
        </div>
        <aside className={styles.snapshot} aria-label="Resumen de la muestra">
          <span>Piloto listo</span>
          <strong>Cliente · Sala · Gerencia</strong>
          <p>Usa datos reales del restaurante piloto y rutas publicas ya desplegadas.</p>
        </aside>
      </section>

      <section className={styles.routes} aria-label="Recorridos de la demo">
        {recorridos.map((recorrido) => (
          recorrido.action === 'dashboard' ? (
            <button key={recorrido.id} type="button" className={styles.card} onClick={abrirDashboard}>
              <RecorridoContent recorrido={recorrido} />
            </button>
          ) : (
            <Link key={recorrido.id} href={recorrido.href} className={`${styles.card} ${recorrido.destacado ? styles.cardFeatured : ''}`}>
              <RecorridoContent recorrido={recorrido} />
            </Link>
          )
        ))}
      </section>

      <section className={styles.script}>
        <div>
          <p className={styles.kicker}>Guion recomendado</p>
          <h2>Que ensenar y en que orden</h2>
        </div>
        <ol>
          {guion.map((paso) => (
            <li key={paso}>{paso}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}

function RecorridoContent({ recorrido }) {
  return (
    <>
      <span className={styles.cardEyebrow}>{recorrido.eyebrow}</span>
      <strong>{recorrido.titulo}</strong>
      <p>{recorrido.texto}</p>
      <div className={styles.metricRow}>
        {recorrido.metricas.map((metrica) => <span key={metrica}>{metrica}</span>)}
      </div>
      <b>{recorrido.cta}</b>
    </>
  )
}
