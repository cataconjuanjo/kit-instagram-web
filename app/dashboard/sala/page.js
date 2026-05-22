'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function inicioDiaISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function SalaHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data } = await supabase
          .from('estadisticas')
          .select('*')
          .eq('restaurante_id', rest.id)
          .gte('created_at', inicioDiaISO())
          .order('created_at', { ascending: false })
        setEventos((data || []).map(item => ({ ...item, parsed: leerDetalle(item.detalle) })))
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />

  const ventas = eventos.filter(e => e.tipo === 'venta' && e.parsed?.resultado === 'vendida').length
  const incidencias = eventos.filter(e => e.tipo === 'venta' && ['no_stock', 'agotado'].includes(e.parsed?.resultado)).length
  const dudas = eventos.filter(e => e.tipo === 'venta' && ['no_convence', 'otra'].includes(e.parsed?.resultado)).length
  const consultas = eventos.filter(e => e.tipo === 'sommelier').length

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Sala"
      title="Servicio y actividad"
      subtitle="Rutina diaria para revisar lo que ha pasado en mesa y dejar la carta lista para el siguiente servicio."
      actions={<a className={styles.secondary} href={`/camarero/${restaurante?.slug || ''}`} target="_blank" rel="noreferrer">Abrir modo camarero</a>}
      help={{
        title: 'Rutina de sala',
        intro: 'No es para tocarlo todo durante el servicio. Es para recoger señales y decidir después con calma.',
        items: [
          { title: 'Durante el servicio', text: 'El camarero marca ventas, falta de stock o cambios de decisión desde su pantalla simple.' },
          { title: 'Al cierre', text: 'Revisa incidencias y dudas en Cierre de servicio. Ahí decides si ajustar stock o solo tomar nota.' },
          { title: 'Semanalmente', text: 'Actividad sirve para ver tendencias: que se consulta, que convence y que necesita mejor argumento.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        <div className={styles.stat}><p className={styles.statValue}>{ventas}</p><p className={styles.statLabel}>Ventas marcadas hoy</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{incidencias}</p><p className={styles.statLabel}>Incidencias de stock</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{dudas}</p><p className={styles.statLabel}>Dudas o cambios</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{consultas}</p><p className={styles.statLabel}>Consultas maridaje</p></div>
      </section>

      <section className={styles.hubGrid}>
        <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/cierre">
          <p className={styles.eyebrow}>Hoy</p>
          <h2>Cierre de servicio</h2>
          <p>Resolver incidencias, limpiar dudas y detectar vinos con tracción.</p>
          <span>{incidencias + dudas} señales pendientes</span>
        </Link>
        <Link className={styles.hubCard} href="/dashboard/estadisticas">
          <p className={styles.eyebrow}>Historico</p>
          <h2>Actividad</h2>
          <p>Escaneos, consultas de maridaje y feedback acumulado.</p>
          <span>Ver tendencias</span>
        </Link>
      </section>
    </ModuleShell>
  )
}
