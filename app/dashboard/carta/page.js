'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

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

  const vinosSinPrecio = vinos.filter(vino => !Number(vino.precio_botella)).length
  const vinosSinPerfil = vinos.filter(vino => !vino.notas_cata || vino.notas_cata.length < 12).length
  const platosSinDescripcion = platos.filter(plato => !plato.descripcion || plato.descripcion.length < 8).length

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Carta"
      title="Vinos, platos y destacados"
      subtitle="Aquí se mantiene la información que ve el cliente y usa el modo camarero para recomendar."
      actions={
        <>
          <a className={styles.secondary} href={`/carta/${restaurante?.slug || ''}`} target="_blank" rel="noreferrer">Ver carta pública</a>
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
        <div className={styles.stat}><p className={styles.statValue}>{vinosSinPrecio + vinosSinPerfil + platosSinDescripcion}</p><p className={styles.statLabel}>Datos a completar</p></div>
      </section>

      <section className={styles.hubGrid}>
        <Link className={styles.hubCard} href="/dashboard/vinos">
          <p className={styles.eyebrow}>Base de carta</p>
          <h2>Vinos</h2>
          <p>Alta, importación, precios, stock básico y perfiles de venta.</p>
          <span>{vinosSinPrecio} sin precio · {vinosSinPerfil} sin perfil</span>
        </Link>
        <Link className={styles.hubCard} href="/dashboard/platos">
          <p className={styles.eyebrow}>Maridaje</p>
          <h2>Platos</h2>
          <p>Carta de comida, categorías y pistas para que la recomendación encaje.</p>
          <span>{platosSinDescripcion} necesitan descripción</span>
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
