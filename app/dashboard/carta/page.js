'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'

function porcentaje(valor, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round((valor / total) * 100)))
}

export default function CartaHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const [{ data: vinosData }, { data: platosData }] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
        ])
        setVinos(vinosData || [])
        setPlatos(platosData || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />

  const vinosSinPrecio = vinos.filter(vino => !Number(vino.precio_botella))
  const vinosSinPerfil = vinos.filter(vino => !vino.notas_cata || vino.notas_cata.length < 12)
  const vinosSinStock = vinos.filter(vino => vino.stock === null || vino.stock === undefined || Number(vino.stock) === 0)
  const platosSinDescripcion = platos.filter(plato => !plato.descripcion || plato.descripcion.length < 8)
  const platosSinPrecio = platos.filter(plato => !Number(plato.precio))
  const pendientesCarta = vinosSinPrecio.length + vinosSinPerfil.length + platosSinDescripcion.length + platosSinPrecio.length
  const calidadVinos = Math.round((porcentaje(vinos.length - vinosSinPrecio.length, vinos.length) * 0.45) + (porcentaje(vinos.length - vinosSinPerfil.length, vinos.length) * 0.45) + (porcentaje(vinos.length - vinosSinStock.length, vinos.length) * 0.1))
  const calidadPlatos = Math.round((porcentaje(platos.length - platosSinDescripcion.length, platos.length) * 0.65) + (porcentaje(platos.length - platosSinPrecio.length, platos.length) * 0.35))
  const calidadPublicacion = Math.round((calidadVinos * 0.58) + (calidadPlatos * 0.42))
  const estadoPublicacion = calidadPublicacion >= 80 ? 'Lista para enseñar' : calidadPublicacion >= 55 ? 'Publicable con avisos' : 'No la enseñaría aún'
  const checklist = [
    { titulo: 'Vinos con precio', valor: vinos.length - vinosSinPrecio.length, total: vinos.length, href: '/dashboard/vinos?filtro=pendientes' },
    { titulo: 'Vinos con perfil de venta', valor: vinos.length - vinosSinPerfil.length, total: vinos.length, href: '/dashboard/vinos?filtro=pendientes' },
    { titulo: 'Platos con descripción', valor: platos.length - platosSinDescripcion.length, total: platos.length, href: '/dashboard/platos?filtro=descripcion' },
    { titulo: 'Platos con precio', valor: platos.length - platosSinPrecio.length, total: platos.length, href: '/dashboard/platos' },
  ]
  const pendientesPrioritarios = [
    ...vinosSinPrecio.slice(0, 3).map(vino => ({ tipo: 'Precio vino', nombre: vino.nombre, href: '/dashboard/vinos?filtro=pendientes' })),
    ...vinosSinPerfil.slice(0, 3).map(vino => ({ tipo: 'Perfil vino', nombre: vino.nombre, href: '/dashboard/vinos?filtro=pendientes' })),
    ...platosSinDescripcion.slice(0, 3).map(plato => ({ tipo: 'Descripción plato', nombre: plato.nombre, href: '/dashboard/platos?filtro=descripcion' })),
  ].slice(0, 5)

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Carta"
      title="Vinos, platos y destacados"
      subtitle="Aquí se mantiene la información que ve el cliente y usa el modo camarero para recomendar."
      actions={
        <>
          <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>
          <a className={styles.secondary} href={`/carta/${restaurante?.slug || ''}?print=1`} target="_blank" rel="noreferrer">Imprimir / PDF</a>
        </>
      }
      help={{
        title: 'Orden recomendado',
        intro: 'Esta pestaña es la base comercial de la carta. Si está bien alimentada, el resto de la app trabaja mejor.',
        items: [
          { title: 'Primero vinos', text: 'Comprueba precios, stock y perfil de venta. Sin eso, la carta pública y el modo camarero pierden fuerza.' },
          { title: 'Luego platos', text: 'Los platos necesitan descripción breve: técnica, salsa, intensidad o ingrediente clave para recomendar mejor.' },
          { title: 'Destacados al final', text: 'Úsalos cuando quieras empujar margen, producto local, novedad o una referencia con buen relato de sala.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        <div className={styles.stat}><p className={styles.statValue}>{vinos.length}</p><p className={styles.statLabel}>Vinos activos</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{platos.length}</p><p className={styles.statLabel}>Platos activos</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{calidadPublicacion}%</p><p className={styles.statLabel}>{estadoPublicacion}</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{pendientesCarta}</p><p className={styles.statLabel}>Datos a completar</p></div>
      </section>

      <section className={pendientesCarta ? styles.panelDark : styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Preflight antes de enseñar el QR</h2>
            <p className={styles.panelSub}>Una revisión rápida para evitar platos sin argumento, vinos sin precio o una carta que parezca incompleta.</p>
          </div>
          <span className={styles.badge}>{estadoPublicacion}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.gridTwo}>
            <div className={styles.itemStack}>
              {checklist.map(item => {
                const valor = porcentaje(item.valor, item.total)
                return (
                  <Link key={item.titulo} href={item.href} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                        <p className={styles.sectionText}>{item.valor} de {item.total || 0} completados</p>
                      </div>
                      <span className={styles.badge}>{valor}%</span>
                    </div>
                  </Link>
                )
              })}
            </div>

            <div className={styles.itemStack}>
              {pendientesPrioritarios.length ? pendientesPrioritarios.map(item => (
                <Link key={`${item.tipo}-${item.nombre}`} href={item.href} className={styles.itemCard}>
                  <p className={styles.eyebrow}>{item.tipo}</p>
                  <h3 className={styles.sectionTitle}>{item.nombre}</h3>
                </Link>
              )) : (
                <div className={styles.empty}>La carta no tiene pendientes críticos para publicar.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubGrid}>
        <Link className={styles.hubCard} href="/dashboard/vinos">
          <p className={styles.eyebrow}>Base de carta</p>
          <h2>Vinos</h2>
          <p>Alta, importación, precios, stock básico y perfiles de venta.</p>
          <span>{vinosSinPrecio.length} sin precio · {vinosSinPerfil.length} sin perfil</span>
        </Link>
        <Link className={styles.hubCard} href="/dashboard/platos">
          <p className={styles.eyebrow}>Maridaje</p>
          <h2>Platos</h2>
          <p>Carta de comida, categorías y pistas para que la recomendación encaje.</p>
          <span>{platosSinDescripcion.length} necesitan descripción</span>
        </Link>
        <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/seleccion">
          <p className={styles.eyebrow}>Escaparate</p>
          <h2>Sugerencia de la casa</h2>
          <p>La Selección Juanjo la mantiene el consultor. Aquí podéis añadir una recomendación propia del restaurante.</p>
          <span>1 vino recomendado</span>
        </Link>
      </section>
    </ModuleShell>
  )
}
