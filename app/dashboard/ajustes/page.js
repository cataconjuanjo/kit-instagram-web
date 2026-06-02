'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'

export default function AjustesHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [pinSala, setPinSala] = useState('')
  const [pinConfigurado, setPinConfigurado] = useState(false)
  const [guardandoPin, setGuardandoPin] = useState(false)
  const [mensajePin, setMensajePin] = useState('')
  const [copiado, setCopiado] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      setRestaurante(rest || null)
      setPinConfigurado(Boolean(rest?.camarero_pin_hash || rest?.camarero_pin))
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const destino = restaurante?.hub_activo ? `/r/${restaurante.slug}` : `/carta/${restaurante?.slug || ''}`
  const urlPublica = `${origin}${destino}`
  const urlCarta = `${origin}/carta/${restaurante?.slug || ''}`
  const urlCamarero = `${origin}/camarero/${restaurante?.slug || ''}`
  const checklist = [
    { titulo: 'QR probado en móvil', detalle: restaurante?.hub_activo ? 'El QR abre el hub público.' : 'El QR abre la carta directa.', href: '/dashboard/qr' },
    { titulo: 'Marca revisada', detalle: 'Logo, colores, banner y estilo visual de la carta.', href: '/dashboard/personalizar' },
    { titulo: 'PIN de sala definido', detalle: pinConfigurado ? 'El equipo puede entrar en modo camarero.' : 'Define un PIN antes de formar al equipo.', href: '#pin-sala', pendiente: !pinConfigurado },
    { titulo: 'Carta pública abierta', detalle: 'Comprueba que precios, platos y enlaces cargan bien.', href: destino },
  ]

  async function guardarPinSala() {
    if (!restaurante?.id) return
    setGuardandoPin(true)
    setMensajePin('')
    const pinLimpio = String(pinSala || '').trim()
    if (pinLimpio.length < 4) {
      setMensajePin('Usa al menos 4 dígitos.')
      setGuardandoPin(false)
      return
    }
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch('/api/camarero/configurar-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify({ restaurante_id: restaurante.id, pin: pinLimpio }),
    })
    if (res.ok) {
      setRestaurante({ ...restaurante, camarero_pin_configurado: true })
      setPinConfigurado(true)
      setPinSala('')
    }
    setMensajePin(res.ok ? 'PIN de sala guardado.' : 'No se pudo guardar el PIN.')
    setGuardandoPin(false)
  }

  async function copiar(texto, tipo) {
    if (!texto) return
    await navigator.clipboard?.writeText(texto)
    setCopiado(tipo)
    setTimeout(() => setCopiado(''), 1800)
  }

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Ajustes"
      title="Accesos, marca y puesta en marcha"
      subtitle="Configuración que se toca poco, pero que debe quedar perfecta antes de entregar la carta al restaurante."
      actions={<OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>}
      help={{
        title: 'Cuándo tocar ajustes',
        intro: 'Esta zona se usa sobre todo al dar de alta el restaurante o cuando cambia la identidad visual.',
        items: [
          { title: 'QR y accesos', text: 'Comprueba si el QR debe abrir la carta de vinos directa o el hub con reservas y otros enlaces.' },
          { title: 'Diseño', text: 'Ajusta logo, banner, colores y tipografía para que la carta parezca del restaurante, no de una plantilla.' },
          { title: 'Después de lanzar', text: 'No hace falta revisarlo a diario. Solo vuelve aquí si cambias enlaces, imagen o material impreso.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        <div className={styles.stat}><p className={styles.statValue}>{restaurante?.hub_activo ? 'Hub' : 'Carta'}</p><p className={styles.statLabel}>Destino del QR</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{pinConfigurado ? 'Listo' : 'Falta'}</p><p className={styles.statLabel}>PIN camarero</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{restaurante?.slug || '-'}</p><p className={styles.statLabel}>Slug público</p></div>
      </section>

      <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Checklist de entrega</h2>
            <p className={styles.panelSub}>Lo mínimo que debe quedar comprobado antes de poner el QR en mesa.</p>
          </div>
          <span className={styles.badge}>{checklist.filter(item => !item.pendiente).length} / {checklist.length}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.itemStack}>
            {checklist.map(item => (
              item.href.startsWith('#') ? (
                <a key={item.titulo} href={item.href} className={styles.itemCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.detalle}</p>
                    </div>
                    <span className={styles.badge}>{item.pendiente ? 'Pendiente' : 'Listo'}</span>
                  </div>
                </a>
              ) : (
                <Link key={item.titulo} href={item.href} target={item.href.startsWith('/') ? undefined : '_blank'} className={styles.itemCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.detalle}</p>
                    </div>
                    <span className={styles.badge}>{item.pendiente ? 'Pendiente' : 'Listo'}</span>
                  </div>
                </Link>
              )
            ))}
          </div>
        </div>
      </section>

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

      <section className={styles.gridTwo} style={{ marginTop: 16 }}>
        <div className={styles.panel} id="pin-sala">
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
                <a className={styles.secondary} href={urlCamarero} target="_blank" rel="noreferrer">
                  Abrir modo camarero
                </a>
              </div>
            </div>
            <button className={styles.primary} onClick={guardarPinSala} disabled={guardandoPin} style={{ marginTop: 14 }}>
              {guardandoPin ? 'Guardando...' : 'Guardar PIN'}
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Enlaces para compartir</h2>
              <p className={styles.panelSub}>Útiles para imprenta, equipo de sala, WhatsApp o pruebas rápidas.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              <button className={styles.ghost} onClick={() => copiar(urlPublica, 'publica')}>{copiado === 'publica' ? 'Copiado' : 'Copiar experiencia pública'}</button>
              <button className={styles.ghost} onClick={() => copiar(urlCarta, 'carta')}>{copiado === 'carta' ? 'Copiado' : 'Copiar carta directa'}</button>
              <button className={styles.ghost} onClick={() => copiar(urlCamarero, 'camarero')}>{copiado === 'camarero' ? 'Copiado' : 'Copiar modo camarero'}</button>
            </div>
          </div>
        </div>
      </section>
    </ModuleShell>
  )
}
