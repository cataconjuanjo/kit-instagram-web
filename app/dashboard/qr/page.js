'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

export default function QRPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef(null)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) setRestaurante(rest)
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (restaurante && canvasRef.current) {
      const url = `${window.location.origin}/carta/${restaurante.slug}`
      QRCode.toCanvas(canvasRef.current, url, {
        width: 280,
        margin: 2,
        color: { dark: '#171416', light: '#ffffff' }
      })
    }
  }, [restaurante])

  function descargar() {
    const canvas = canvasRef.current
    const link = document.createElement('a')
    link.download = `qr-${restaurante.slug}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  if (loading) return <LoadingState />

  const urlDirecta = typeof window !== 'undefined' && restaurante
    ? `${window.location.origin}/carta/${restaurante.slug}`
    : ''

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Codigo QR"
      title="Carta lista para mesa"
      subtitle="Un QR limpio, descargable y vinculado a la carta publica del establecimiento."
      narrow
    >
      <section className={styles.qrLayout}>
        <div className={styles.qrCard}>
          <canvas ref={canvasRef} />
          <div style={{ textAlign: 'center' }}>
            <p className={styles.sectionTitle}>{restaurante?.nombre}</p>
            <p className={styles.sectionText}>Carta digital</p>
          </div>
          <button className={styles.primary} onClick={descargar}>Descargar PNG</button>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>URL directa</h2>
              <p className={styles.panelSub}>Enlace publico para compartir, probar o enviar al proveedor de imprenta.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.urlBox}>{urlDirecta}</div>
            <div className={styles.actionRow} style={{ marginTop: 14 }}>
              <a className={styles.secondary} href={urlDirecta} target="_blank" rel="noreferrer">Abrir carta</a>
              <button className={styles.ghost} onClick={() => navigator.clipboard?.writeText(urlDirecta)}>Copiar URL</button>
            </div>
          </div>
        </div>
      </section>
    </ModuleShell>
  )
}
