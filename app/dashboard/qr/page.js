'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'
import ResponsiveOverlay from '../ResponsiveOverlay'

export default function QRPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState('')
  const [vistaRapida, setVistaRapida] = useState(false)
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

  const urlBase = typeof window !== 'undefined' ? window.location.origin : ''
  const destino = restaurante?.hub_activo ? 'r' : 'carta'
  const urlDirecta = restaurante?.slug ? `${urlBase}/${destino}/${restaurante.slug}` : ''
  const urlCarta = restaurante?.slug ? `${urlBase}/carta/${restaurante.slug}` : ''
  const urlPrint = restaurante?.slug ? `${urlBase}/carta/${restaurante.slug}?print=1` : ''
  const textoEquipo = restaurante ? `Carta digital ${restaurante.nombre}: ${urlDirecta}` : ''

  useEffect(() => {
    if (urlDirecta && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, urlDirecta, {
        width: 300,
        margin: 2,
        color: { dark: '#171416', light: '#ffffff' }
      })
    }
  }, [urlDirecta])

  function descargar() {
    const canvas = canvasRef.current
    if (!canvas || !restaurante?.slug) return
    const link = document.createElement('a')
    link.download = `qr-${restaurante.slug}.png`
    link.href = canvas.toDataURL()
    link.click()
  }

  function imprimir() {
    if (typeof window === 'undefined') return
    window.print()
  }

  async function copiar(texto, tipo) {
    if (!texto) return
    await navigator.clipboard?.writeText(texto)
    setCopiado(tipo)
    setTimeout(() => setCopiado(''), 1800)
  }

  if (loading) return <LoadingState />

  const pruebas = [
    { titulo: 'Abrir enlace público', detalle: restaurante?.hub_activo ? 'El QR abre el hub público. Si consultas ArmonIA, contará como cliente real.' : 'El QR abre la carta digital. Si consultas ArmonIA, contará como cliente real.', href: urlDirecta },
    { titulo: 'Carta directa', detalle: 'Comprueba platos, vinos, precios y tiempos de carga. Esta apertura se registra como prueba interna.', pruebaCarta: true },
    { titulo: 'Versión impresión', detalle: 'Abre la vista preparada para imprimir o guardar PDF.', href: urlPrint },
  ]

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Código QR"
      title="Entrega de QR y accesos"
      subtitle="Pantalla de entrega para probar el enlace, descargar el QR y preparar materiales de mesa."
      narrow
      actions={<button type="button" className={styles.primary} onClick={() => setVistaRapida(true)}>Vista rápida</button>}
      help={{
        title: 'Antes de imprimir',
        intro: 'El QR es el punto de entrada del cliente. Conviene probarlo antes de llevarlo a mesa.',
        items: [
          { title: 'Destino', text: 'Si el hub está activo abre reservas, cartas y redes. Si no, abre la carta de vinos directamente.' },
          { title: 'Prueba real', text: 'Escanea con el móvil antes de imprimir para revisar velocidad, logo, colores y enlaces.' },
          { title: 'Uso', text: 'Descarga el PNG y úsalo en sobremesa, metacrilato, cartel o enlace de Instagram.' },
        ],
      }}
    >
      <section className={styles.qrHero}>
        <div>
          <p className={styles.eyebrow}>Material de mesa</p>
          <h2>QR listo para imprimir</h2>
          <p>Una pieza limpia para sobremesa, metacrilato o carta física. Prueba el destino antes de mandar a imprenta.</p>
        </div>
        <div className={styles.qrHeroActions}>
          <button className={styles.primary} onClick={descargar}>Descargar QR</button>
          <button className={styles.secondary} onClick={imprimir}>Imprimir esta página</button>
          <button className={styles.ghost} onClick={() => copiar(urlDirecta, 'url')}>{copiado === 'url' ? 'Copiado' : 'Copiar enlace'}</button>
        </div>
      </section>

      <section className={styles.qrLayout}>
        <div className={styles.qrCard}>
          <div className={styles.tableTentPreview}>
            <p>Escanea para ver la carta viva</p>
            <canvas ref={canvasRef} />
            <span>{restaurante?.nombre}</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p className={styles.sectionTitle}>{restaurante?.nombre}</p>
            <p className={styles.sectionText}>{restaurante?.hub_activo ? 'Hub público' : 'Carta digital'}</p>
          </div>
          <button className={styles.primary} onClick={descargar}>Descargar PNG</button>
          <a className={styles.secondary} href={urlPrint} target="_blank" rel="noreferrer">Imprimir / PDF</a>
          <button className={styles.ghost} onClick={imprimir}>Imprimir página</button>
        </div>

        <div className={styles.itemStack}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{restaurante?.hub_activo ? 'URL del hub' : 'URL directa'}</h2>
                <p className={styles.panelSub}>Enlace público para compartir, probar o enviar al proveedor de imprenta.</p>
              </div>
              <span className={styles.badge}>{destino === 'r' ? 'Hub' : 'Carta'}</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.urlBox}>{urlDirecta}</div>
              <div className={styles.actionRow} style={{ marginTop: 14 }}>
                <a className={styles.secondary} href={urlDirecta} target="_blank" rel="noreferrer">Abrir destino</a>
                <button className={styles.ghost} onClick={() => copiar(urlDirecta, 'url')}>{copiado === 'url' ? 'Copiado' : 'Copiar URL'}</button>
                <button className={styles.ghost} onClick={() => copiar(textoEquipo, 'equipo')}>{copiado === 'equipo' ? 'Copiado' : 'Copiar para equipo'}</button>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Pruebas rápidas</h2>
                <p className={styles.panelSub}>Tres aperturas para comprobar qué verá el cliente antes de imprimir.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.itemStack}>
                {pruebas.map(prueba => prueba.pruebaCarta ? (
                  <OpenCartaPruebaButton key={prueba.titulo} restauranteId={restaurante?.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{prueba.titulo}</h3>
                        <p className={styles.sectionText}>{prueba.detalle}</p>
                      </div>
                      <span className={styles.badge}>Abrir</span>
                    </div>
                  </OpenCartaPruebaButton>
                ) : (
                  <a key={prueba.titulo} href={prueba.href} target="_blank" rel="noreferrer" className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{prueba.titulo}</h3>
                        <p className={styles.sectionText}>{prueba.detalle}</p>
                      </div>
                      <span className={styles.badge}>Abrir</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <ResponsiveOverlay
        open={vistaRapida}
        onClose={() => setVistaRapida(false)}
        size="modal"
        eyebrow="QR y accesos"
        title="Acceso rápido"
        description="Comparte o prueba el enlace público desde el móvil. La página completa sigue disponible para imprimir."
        footer={<button type="button" className={styles.ghost} onClick={() => setVistaRapida(false)}>Cerrar</button>}
      >
        <div className={styles.itemStack}>
          <div className={styles.urlBox}>{urlDirecta}</div>
          <a className={styles.primary} href={urlDirecta} target="_blank" rel="noreferrer">Abrir destino público</a>
          <button className={styles.secondary} onClick={() => copiar(urlDirecta, 'quick')}>{copiado === 'quick' ? 'Enlace copiado' : 'Copiar enlace'}</button>
          <button className={styles.secondary} onClick={descargar}>Descargar QR</button>
          <a className={styles.ghost} href={urlPrint} target="_blank" rel="noreferrer">Abrir impresión / PDF</a>
        </div>
      </ResponsiveOverlay>
    </ModuleShell>
  )
}
