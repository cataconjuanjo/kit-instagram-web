'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { setAdminRestaurantEmail, setDemoEmail } from '../../demo'
import { trackDemoEvent } from '../../lib/demoAnalyticsClient'
import styles from './taberna-demo.module.css'

const DEMO_EMAIL = 'demo@taberna-del-puerto.com'
const SLUG = 'taberna-del-puerto'

const recorridos = [
  {
    id: 'cliente',
    paso: '01',
    tiempo: '0:00 - 0:35',
    rol: 'Cliente en mesa',
    titulo: 'Del QR a una carta que ayuda a elegir',
    objetivo: 'Demostrar que el cliente no abre un PDF: entra en un hub claro, ve la carta y puede llegar al vino por copa o al maridaje.',
    senal: 'El restaurante entiende que su carta de vinos gana presencia sin pedir instalación ni registro.',
    href: `/r/${SLUG}?demo_presentacion=1`,
    cta: 'Ver como cliente',
    metricas: ['Hub público', 'Carta QR', 'Vinos por copa'],
  },
  {
    id: 'camarero',
    paso: '02',
    tiempo: '0:35 - 1:20',
    rol: 'Camarero en servicio',
    titulo: 'Recomendar sin memorizar toda la bodega',
    objetivo: 'Abrir un plato real, recibir tres vinos vendibles y enseñar la frase de servicio para defender la recomendación.',
    senal: 'Sala pasa de improvisar a recomendar con criterio, ticket y disponibilidad.',
    href: `/camarero/${SLUG}?demo=1&demo_focus=1`,
    cta: 'Ver como camarero',
    metricas: ['Sin PIN en demo', 'Argumento de venta', 'Resultado medible'],
    destacado: true,
  },
  {
    id: 'gerente',
    paso: '03',
    tiempo: '1:20 - 2:00',
    rol: 'Gerente',
    titulo: 'Convertir señales del turno en decisiones',
    objetivo: 'Entrar al panel y enseñar prioridades, bodega, margen, propuestas y cierre de servicio ya preparados.',
    senal: 'La demo deja claro que Carta Viva no termina en el QR: alimenta gestión y mejora de carta.',
    href: '/dashboard?demo_presentacion=1',
    action: 'dashboard',
    cta: 'Ver como gerente',
    metricas: ['Dashboard guiado', 'Bodega', 'Cierre'],
  },
]

const guion = [
  {
    titulo: 'Abrir con el problema',
    texto: 'La carta de vinos suele estar viva en la cabeza de alguien, pero muerta para cliente, sala y gerencia.',
  },
  {
    titulo: 'Mostrar cliente',
    texto: 'El QR no es un archivo: es una experiencia breve que ayuda a decidir y hace visible el vino por copa.',
  },
  {
    titulo: 'Mostrar sala',
    texto: 'El camarero no necesita saberlo todo; necesita tres opciones buenas, una frase clara y un objetivo de venta.',
  },
  {
    titulo: 'Cerrar con gestión',
    texto: 'Cada recomendación deja una señal: venta, duda, falta de stock o rechazo. Eso se convierte en decisiones.',
  },
]

const valor = [
  ['Confianza', 'El restaurante ve datos precargados, rutas reales y una demo que no exige credenciales.'],
  ['Claridad', 'Tres roles, tres pantallas y un cierre: cliente, sala y gerente entienden su parte.'],
  ['Negocio', 'La conversación cambia de “quiero un QR” a “quiero vender y decidir mejor el vino”.'],
]

export default function DemoTabernaDelPuerto() {
  useEffect(() => {
    trackDemoEvent('demo_page_view', {
      demo: SLUG,
      source: 'demo_taberna',
    })
  }, [])

  function abrirRecorrido(recorrido, source = 'role_card') {
    setDemoEmail(DEMO_EMAIL)
    if (recorrido.action === 'dashboard') setAdminRestaurantEmail(DEMO_EMAIL)
    trackDemoEvent(source === 'hero_start' ? 'demo_start' : 'demo_role_open', {
      demo: SLUG,
      role: recorrido.id,
      target: recorrido.href,
      source,
    })
    window.location.href = recorrido.href
  }

  return (
    <main className={styles.page}>
      <nav className={styles.topbar} aria-label="Navegación de demo">
        <Link href="/cartavinos">Carta Viva</Link>
        <span>Demo guiada · 2 minutos</span>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Demo comercial preparada</p>
          <h1>La Taberna del Puerto</h1>
          <p>
            Un recorrido corto para que un restaurante entienda Carta Viva sin explicaciones largas:
            primero cliente, después sala y al final gerencia.
          </p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.primary} onClick={() => abrirRecorrido(recorridos[0], 'hero_start')}>
              Empezar demo guiada
            </button>
            <button type="button" className={styles.secondary} onClick={() => abrirRecorrido(recorridos[2], 'hero_manager')}>
              Ver como gerente
            </button>
          </div>
        </div>

        <aside className={styles.snapshot} aria-label="Resumen de la muestra">
          <span>Piloto listo</span>
          <strong>Cliente · Sala · Gerencia</strong>
          <p>Rutas reales, datos precargados y guion pensado para una conversación comercial de 2 minutos.</p>
          <div>
            <small>No pide tarjeta</small>
            <small>No requiere instalación</small>
            <small>Sin PIN en modo demo</small>
          </div>
        </aside>
      </section>

      <section className={styles.timeline} aria-label="Recorrido recomendado">
        <div className={styles.sectionHead}>
          <p className={styles.kicker}>Empieza por aquí</p>
          <h2>Un relato simple: elegir, recomendar, decidir</h2>
        </div>

        <div className={styles.routes}>
          {recorridos.map((recorrido) => (
            <button
              key={recorrido.id}
              type="button"
              className={`${styles.card} ${recorrido.destacado ? styles.cardFeatured : ''}`}
              onClick={() => abrirRecorrido(recorrido)}
            >
              <span className={styles.stepBadge}>{recorrido.paso}</span>
              <span className={styles.cardEyebrow}>{recorrido.tiempo} · {recorrido.rol}</span>
              <strong>{recorrido.titulo}</strong>
              <p>{recorrido.objetivo}</p>
              <div className={styles.metricRow}>
                {recorrido.metricas.map((metrica) => <span key={metrica}>{metrica}</span>)}
              </div>
              <em>{recorrido.senal}</em>
              <b>{recorrido.cta}</b>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.script}>
        <div>
          <p className={styles.kicker}>Guion de venta</p>
          <h2>Qué decir en cada paso</h2>
        </div>
        <ol>
          {guion.map((paso) => (
            <li key={paso.titulo}>
              <strong>{paso.titulo}</strong>
              <span>{paso.texto}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.valueGrid} aria-label="Qué debe transmitir la demo">
        {valor.map(([titulo, texto]) => (
          <article key={titulo}>
            <span>{titulo}</span>
            <p>{texto}</p>
          </article>
        ))}
      </section>

      <section className={styles.close}>
        <div>
          <p className={styles.kicker}>Cierre recomendado</p>
          <h2>El siguiente paso no es comprar: es probarlo con su carta.</h2>
          <p>
            Después de la demo, la propuesta natural es cargar una muestra real del restaurante,
            enseñar dos platos y medir si sala puede recomendar mejor desde el primer servicio.
          </p>
        </div>
        <Link
          href="/cartavinos#contacto"
          className={styles.primary}
          onClick={() => trackDemoEvent('demo_contact_click', {
            demo: SLUG,
            role: 'contacto',
            target: '/cartavinos#contacto',
            source: 'demo_close',
          })}
        >
          Pedir demo privada
        </Link>
      </section>
    </main>
  )
}
