'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

export default function AjustesHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [pinSala, setPinSala] = useState('')
  const [guardandoPin, setGuardandoPin] = useState(false)
  const [mensajePin, setMensajePin] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      setRestaurante(rest || null)
      setPinSala(rest?.camarero_pin || '')
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />

  const destino = restaurante?.hub_activo ? `/r/${restaurante.slug}` : `/carta/${restaurante?.slug || ''}`

  async function guardarPinSala() {
    if (!restaurante?.id) return
    setGuardandoPin(true)
    setMensajePin('')
    const pinLimpio = String(pinSala || '').trim()
    if (pinLimpio.length < 4) {
      setMensajePin('Usa al menos 4 digitos.')
      setGuardandoPin(false)
      return
    }
    const { error } = await supabase.from('restaurantes').update({ camarero_pin: pinLimpio }).eq('id', restaurante.id)
    setMensajePin(error ? 'No se pudo guardar el PIN.' : 'PIN de sala guardado.')
    setGuardandoPin(false)
  }

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Ajustes"
      title="Accesos e identidad visual"
      subtitle="Configuración que se toca poco: QR, diseño de la carta y enlaces públicos."
      actions={<a className={styles.secondary} href={destino} target="_blank" rel="noreferrer">Ver experiencia pública</a>}
      help={{
        title: 'Cuando tocar ajustes',
        intro: 'Esta zona se usa sobre todo al dar de alta el restaurante o cuando cambia la identidad visual.',
        items: [
          { title: 'QR y accesos', text: 'Comprueba si el QR debe abrir la carta de vinos directa o el hub con reservas y otros enlaces.' },
          { title: 'Diseño', text: 'Ajusta logo, banner, colores y tipografía para que la carta parezca del restaurante, no de una plantilla.' },
          { title: 'Después de lanzar', text: 'No hace falta revisarlo a diario. Solo vuelve aquí si cambias enlaces, imagen o material impreso.' },
        ],
      }}
    >
      <section className={styles.hubGrid}>
        <Link className={styles.hubCard} href="/dashboard/qr">
          <p className={styles.eyebrow}>Mesas</p>
          <h2>QR y accesos</h2>
          <p>Descarga el QR y revisa a dónde envía: carta o hub público.</p>
          <span>{restaurante?.hub_activo ? 'Hub activo' : 'Carta directa'}</span>
        </Link>
        <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/personalizar">
          <p className={styles.eyebrow}>Marca</p>
          <h2>Diseño de carta</h2>
          <p>Colores, tipografía, logo y banner de la carta pública.</p>
          <span>Editar identidad</span>
        </Link>
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>PIN de modo camarero</h2>
            <p className={styles.panelSub}>Acceso sencillo para sala, distinto por restaurante y editable cuando cambie el equipo.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formGrid}>
            <div>
              <label className={styles.label}>PIN sala</label>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                value={pinSala}
                onChange={e => setPinSala(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Ej. 4826"
              />
              {mensajePin && <p className={styles.tiny}>{mensajePin}</p>}
            </div>
            <div>
              <label className={styles.label}>Enlace camarero</label>
              <a className={styles.secondary} href={restaurante ? `/camarero/${restaurante.slug}` : '#'} target="_blank" rel="noreferrer">
                Abrir modo camarero
              </a>
            </div>
          </div>
          <button className={styles.primary} onClick={guardarPinSala} disabled={guardandoPin} style={{ marginTop: 14 }}>
            {guardandoPin ? 'Guardando...' : 'Guardar PIN'}
          </button>
        </div>
      </section>
    </ModuleShell>
  )
}
