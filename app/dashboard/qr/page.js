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
      const destino = restaurante.hub_activo ? 'r' : 'carta'
      const url = `${window.location.origin}/${destino}/${restaurante.slug}`
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
    ? `${window.location.origin}/${restaurante.hub_activo ? 'r' : 'carta'}/${restaurante.slug}`
    : ''

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Código QR"
      title="Carta lista para mesa"
      subtitle="Un QR limpio y descargable. Si el hub está activo, apunta al link en bio; si no, apunta a la carta de vinos."
      narrow
      help={{
        title: 'Antes de imprimir',
        intro: 'El QR es el punto de entrada del cliente. Conviene probarlo antes de llevarlo a mesa.',
        items: [
          { title: 'Destino', text: 'Si el hub está activo abre reservas, cartas y redes. Si no, abre la carta de vinos directamente.' },
          { title: 'Prueba real', text: 'Escanea con el móvil antes de imprimir para revisar velocidad, logo, colores y enlaces.' },
          { title: 'Uso', text: 'Descarga el PNG y usalo en sobremesa, metacrilato, cartel o enlace de Instagram.' },
        ],
      }}
    >
      <section className={styles.qrLayout}>
        <div className={styles.qrCard}>
          <canvas ref={canvasRef} />
          <div style={{ textAlign: 'center' }}>
            <p className={styles.sectionTitle}>{restaurante?.nombre}</p>
            <p className={styles.sectionText}>{restaurante?.hub_activo ? 'Hub público' : 'Carta digital'}</p>
          </div>
          <button className={styles.primary} onClick={descargar}>Descargar PNG</button>
          <a className={styles.secondary} href={`/carta/${restaurante?.slug || ''}?print=1`} target="_blank" rel="noreferrer">Imprimir / PDF</a>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{restaurante?.hub_activo ? 'URL del hub' : 'URL directa'}</h2>
              <p className={styles.panelSub}>Enlace público para compartir, probar o enviar al proveedor de imprenta.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.urlBox}>{urlDirecta}</div>
            <div className={styles.actionRow} style={{ marginTop: 14 }}>
              <a className={styles.secondary} href={urlDirecta} target="_blank" rel="noreferrer">Abrir carta</a>
              <a className={styles.secondary} href={`/carta/${restaurante?.slug || ''}?print=1`} target="_blank" rel="noreferrer">Carta en PDF</a>
              <button className={styles.ghost} onClick={() => navigator.clipboard?.writeText(urlDirecta)}>Copiar URL</button>
            </div>
          </div>
        </div>
      </section>
    </ModuleShell>
  )
}
