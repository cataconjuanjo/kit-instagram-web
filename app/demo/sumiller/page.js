'use client'

import Link from 'next/link'
import { setAdminRestaurantEmail, setDemoEmail } from '../../demo'
import styles from './sumiller-demo.module.css'

const DEMO_EMAIL = 'sumiller.demo@cartaviva.local'

const recorridos = [
  {
    id: 'mapa',
    eyebrow: '1 - Decisión',
    title: 'Mapa estrella y joyas',
    text: 'La gráfica clave del sumiller: qué referencias son estrella, joya oculta, caballo de batalla o candidato a revisar.',
    href: '/dashboard/menu-engineering?demo_sumiller=1',
    cta: 'Abrir mapa',
    metrics: ['Estrella', 'Joya', 'Revisar'],
  },
  {
    id: 'bodega',
    eyebrow: '2 - Operación',
    title: 'Stock y pedido',
    text: 'Pedido sugerido por proveedor, bajo mínimo, margen bajo, rotación y propuestas listas para decidir.',
    href: '/dashboard/bodega?demo_sumiller=1',
    cta: 'Ver bodega',
    metrics: ['Pedido', 'Proveedores', 'Movimientos'],
  },
  {
    id: 'catalogo',
    eyebrow: '3 - Compra',
    title: 'Catálogo distribuidores',
    text: 'Tarifas profesionales para buscar referencias, comparar coste, disponibilidad, margen sugerido y crear fichas de bodega.',
    href: '/dashboard/catalogo?demo_sumiller=1',
    cta: 'Ver catálogo',
    metrics: ['Tarifas', 'Coste', 'Alta ficha'],
  },
  {
    id: 'constructor',
    eyebrow: '4 - Carta',
    title: 'Constructor de carta',
    text: 'Crea una carta desde bodega, pega referencias nuevas, ordena secciones y exporta una salida limpia para Word.',
    href: '/dashboard/constructor?demo_sumiller=1',
    cta: 'Construir carta',
    metrics: ['Secciones', 'Exportar', 'Word'],
  },
  {
    id: 'inventario',
    eyebrow: '5 - Conteo',
    title: 'Inventario inteligente',
    text: 'Conteo por prioridad: premium, copa, bajo mínimo, inmovilizado y referencias críticas.',
    href: '/dashboard/inventario?demo_sumiller=1',
    cta: 'Ver inventario',
    metrics: ['Conteo rápido', 'Ajustes', 'Impacto'],
  },
  {
    id: 'simulador',
    eyebrow: '6 - Dirección',
    title: 'Simulador de margen',
    text: 'Escenarios para defender PVP, copa, margen, stock parado y coste de oportunidad ante dirección.',
    href: '/dashboard/simulador?demo_sumiller=1',
    cta: 'Simular margen',
    metrics: ['Margen', 'Copa', 'Escenarios'],
  },
]

const guion = [
  'Abrir el mapa estrella/joya y explicar que Carta Viva Bodega no sustituye criterio: ordena señales para decidir.',
  'Mostrar estrellas, joyas ocultas, caballos de batalla y referencias a revisar con margen, salida real y capital inmovilizado.',
  'Entrar en Stock y pedido: copiar pedido por proveedor y revisar bajo mínimo, cobertura y rotación.',
  'Abrir Catálogo distribuidores: buscar una referencia, comparar coste/PVP y explicar alta de ficha.',
  'Pasar al Constructor de carta: ordenar secciones y exportar una versión limpia para maquetar.',
  'Abrir Inventario: contar referencias críticas, no toda la bodega en orden alfabético.',
  'Cerrar con Simulador: defender margen, copa y argumentos antes de comprar, subir precio o retirar referencias.',
]

export default function DemoSumiller() {
  function abrir(href) {
    setDemoEmail(DEMO_EMAIL)
    setAdminRestaurantEmail(DEMO_EMAIL)
    window.location.href = href
  }

  if (process.env.NEXT_PUBLIC_SHOW_DEMO !== 'true') {
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>Demo no disponible</p>
            <h1>Acceso privado</h1>
            <p>Esta demo se activa solo para presentaciones internas.</p>
            <div className={styles.actions}>
              <Link className={styles.secondary} href="/">Volver</Link>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>Demo Carta Viva Bodega</p>
          <h1>La app de bodega para sumilleres</h1>
          <p>
            Una membresía centrada en gestión profesional: mapa de vinos estrella y joyas, stock,
            compras, catálogo de distribuidores, margen, inventario y argumentos para dirección.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => abrir('/dashboard/menu-engineering?demo_sumiller=1')}>
              Ver mapa estrella/joya
            </button>
            <button type="button" className={styles.secondary} onClick={() => abrir('/dashboard/catalogo?demo_sumiller=1')}>
              Ver catálogo distribuidores
            </button>
          </div>
        </div>
        <aside className={styles.snapshot}>
          <p className={styles.kicker}>Bodega precargada</p>
          <strong>43 vinos</strong>
          <span>5 proveedores · 90 días de ventas · catálogo profesional · estrellas, joyas, pedidos y movimientos</span>
        </aside>
      </section>

      <section className={`${styles.section} ${styles.spotlight}`}>
        <div>
          <p className={styles.kicker}>Vista principal</p>
          <h2>Vinos estrella, joyas y referencias a revisar</h2>
          <p>
            La demo empieza por el mapa que un sumiller puede enseñar a dirección:
            margen, salida real, retorno de inventario y acción sugerida por referencia.
          </p>
        </div>
        <div className={styles.quadrants}>
          <button type="button" onClick={() => abrir('/dashboard/menu-engineering?demo_sumiller=1')}>
            <strong>Estrella</strong>
            <span>Alta salida - alto margen</span>
          </button>
          <button type="button" onClick={() => abrir('/dashboard/menu-engineering?demo_sumiller=1')}>
            <strong>Joya oculta</strong>
            <span>Alto margen - poca salida</span>
          </button>
          <button type="button" onClick={() => abrir('/dashboard/menu-engineering?demo_sumiller=1')}>
            <strong>Caballo de batalla</strong>
            <span>Alta salida - margen a defender</span>
          </button>
          <button type="button" onClick={() => abrir('/dashboard/menu-engineering?demo_sumiller=1')}>
            <strong>Revisar</strong>
            <span>Baja salida - capital parado</span>
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.routes}>
          {recorridos.map(item => (
            <button key={item.id} type="button" className={styles.card} onClick={() => abrir(item.href)}>
              <span className={styles.kicker}>{item.eyebrow}</span>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
              <div className={styles.metrics}>
                {item.metrics.map(metric => <span key={metric}>{metric}</span>)}
              </div>
              <b>{item.cta}</b>
            </button>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.script}`}>
        <div>
          <p className={styles.kicker}>Guion</p>
          <h2>Qué enseñar</h2>
        </div>
        <ol>
          {guion.map(paso => <li key={paso}>{paso}</li>)}
        </ol>
      </section>
    </main>
  )
}
