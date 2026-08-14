'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { cargarDemoDashboard } from '../../lib/demoDashboardClient'
import { esPerfilBodega } from '../../lib/plans'
import { CONTENIDO_INICIAL, puedePublicarCarta, resumirContenidoCarta } from '../../lib/publicationReadiness'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

export default function QRPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [contenidoCarta, setContenidoCarta] = useState(CONTENIDO_INICIAL)
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState('')
  const [mensajeCopia, setMensajeCopia] = useState('')
  const [guardandoPublicacion, setGuardandoPublicacion] = useState(false)
  const [mensajePublicacion, setMensajePublicacion] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const canvasRef = useRef(null)

  useEffect(() => {
    async function cargar() {
      const { email, isDemo } = await getEffectiveRestaurantEmail(supabase)
      if (!email) {
        window.location.href = '/login'
        return
      }

      if (isDemo) {
        const demo = await cargarDemoDashboard(email)
        if (demo?.restaurante) {
          setRestaurante(demo.restaurante)
          setContenidoCarta(resumirContenidoCarta(demo.vinos || [], demo.platos || []))
        } else {
          setContenidoCarta({ ...CONTENIDO_INICIAL, loading: false, error: 'No se encontro el restaurante demo.' })
        }
        setLoading(false)
        return
      }

      const { data: rest } = await supabase
        .from('restaurantes')
        .select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
        .eq('email', email)
        .single()

      if (rest) {
        setRestaurante(rest)
        setContenidoCarta(prev => ({ ...prev, loading: true, error: '' }))
        const [vinosRes, platosRes] = await Promise.all([
          supabase.from('vinos').select('id, precio_botella, precio_copa').eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('platos').select('id').eq('restaurante_id', rest.id).eq('activo', true),
        ])
        const contenidoError = vinosRes.error || platosRes.error
        if (contenidoError) {
          setContenidoCarta({
            ...CONTENIDO_INICIAL,
            loading: false,
            error: 'No se pudo comprobar el contenido de la carta.',
          })
        } else {
          setContenidoCarta(resumirContenidoCarta(vinosRes.data || [], platosRes.data || []))
        }
      } else {
        setContenidoCarta({ ...CONTENIDO_INICIAL, loading: false, error: 'No se encontro el restaurante.' })
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const urlBase = typeof window !== 'undefined' ? window.location.origin : ''
  const destino = restaurante?.hub_activo ? 'r' : 'carta'
  const destinoLabel = restaurante?.hub_activo ? 'Hub publico' : 'Carta publica'
  const urlDirecta = restaurante?.slug ? `${urlBase}/${destino}/${restaurante.slug}` : ''
  const urlPrint = restaurante?.slug ? `${urlBase}/carta/${restaurante.slug}?print=1` : ''
  const textoEquipo = restaurante ? `Carta digital ${restaurante.nombre}: ${urlDirecta}` : ''
  const migracionPublicacionPendiente = restaurante && !Object.prototype.hasOwnProperty.call(restaurante, 'carta_publica_activa')
  const cartaPublicada = restaurante?.carta_publica_activa !== false
  const estadoPublicacion = cartaPublicada ? 'Publicada' : 'Borrador'
  const contenidoBloqueado = !contenidoCarta.loading && !contenidoCarta.error && !puedePublicarCarta(contenidoCarta)
  const contenidoPreparado = !contenidoCarta.loading && !contenidoCarta.error && !contenidoBloqueado
  const publicacionDeshabilitada = guardandoPublicacion ||
    migracionPublicacionPendiente ||
    contenidoCarta.loading ||
    Boolean(contenidoCarta.error) ||
    contenidoBloqueado

  const pasos = [
    {
      label: 'Revisar carta',
      detail: contenidoCarta.loading
        ? 'Comprobando vinos y precios'
        : contenidoPreparado
          ? `${contenidoCarta.vinosActivos} vinos listos`
          : 'Faltan vinos o precios',
      ok: contenidoPreparado,
      current: !contenidoPreparado,
    },
    {
      label: 'Publicar',
      detail: cartaPublicada ? 'Abierta al cliente' : 'En borrador',
      ok: cartaPublicada,
      current: contenidoPreparado && !cartaPublicada,
    },
    {
      label: 'Usar QR',
      detail: cartaPublicada ? 'Listo para mesa' : 'Disponible al publicar',
      ok: cartaPublicada,
      current: cartaPublicada,
    },
  ]

  const tituloEstado = cartaPublicada
    ? 'QR listo para mesa'
    : contenidoPreparado
      ? 'Carta lista para publicar'
      : 'Completa la carta antes de publicar'
  const detalleEstado = cartaPublicada
    ? 'El enlace publico ya funciona. Puedes descargar el QR, copiar la URL o abrir la carta como cliente.'
    : contenidoBloqueado
      ? 'Antes de abrir el QR al cliente, la carta necesita al menos un vino visible y precios de carta.'
      : 'Prueba la carta internamente y publica cuando este revisada.'

  useEffect(() => {
    if (!urlDirecta) {
      setQrDataUrl('')
      return
    }
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, urlDirecta, {
        width: 300,
        margin: 2,
        color: { dark: '#171416', light: '#ffffff' },
      }).catch(() => {})
    }
    QRCode.toDataURL(urlDirecta, {
      width: 880,
      margin: 2,
      color: { dark: '#171416', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [urlDirecta])

  async function registrarUso(event, metadata = {}) {
    if (!restaurante?.id || !event) return
    try {
      const token = await tokenSesion()
      await fetch('/api/publicacion/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          event,
          destino: restaurante.hub_activo ? 'hub' : 'carta',
          metadata,
        }),
      })
    } catch {
      // La medicion no debe bloquear acciones basicas del QR.
    }
  }

  async function copiarAlPortapapeles(texto) {
    if (!texto || typeof window === 'undefined' || typeof document === 'undefined') return false
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(texto)
        return true
      }
    } catch {}

    let textarea = null
    try {
      textarea = document.createElement('textarea')
      textarea.value = texto
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      textarea.setSelectionRange(0, textarea.value.length)
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      if (textarea?.parentNode) textarea.parentNode.removeChild(textarea)
    }
  }

  async function copiar(texto, tipo) {
    if (!texto) return
    const copiadoOk = await copiarAlPortapapeles(texto)
    if (!copiadoOk) {
      setMensajeCopia('No se pudo copiar automaticamente. Selecciona el enlace visible y copialo manualmente.')
      setTimeout(() => setMensajeCopia(''), 2600)
      return
    }
    setCopiado(tipo)
    const evento = tipo === 'equipo' ? 'team_message_copied' : 'public_link_copied'
    registrarUso(evento, { source: tipo })
    setTimeout(() => setCopiado(''), 1800)
  }

  function descargar() {
    if (!qrDataUrl || !restaurante?.slug || !cartaPublicada) return
    const link = document.createElement('a')
    link.download = `qr-${restaurante.slug}.png`
    link.href = qrDataUrl
    link.click()
    registrarUso('qr_downloaded', { source: 'dashboard_qr', slug: restaurante.slug })
  }

  function imprimir() {
    if (typeof window === 'undefined' || !cartaPublicada) return
    registrarUso('qr_print_opened', { source: 'dashboard_qr' })
    window.open(urlPrint, '_blank', 'noopener,noreferrer')
  }

  async function cambiarPublicacion(activa) {
    if (!restaurante?.id || guardandoPublicacion) return
    if (activa && !contenidoPreparado) {
      setMensajePublicacion(contenidoCarta.error || 'Completa vinos visibles y precios antes de publicar la carta.')
      return
    }

    setGuardandoPublicacion(true)
    setMensajePublicacion('')
    try {
      const token = await tokenSesion()
      const res = await fetch('/api/publicacion', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ restaurante_id: restaurante.id, activa }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.contenido) setContenidoCarta({ ...data.contenido, loading: false, error: '' })
        setMensajePublicacion(data.error || 'No se pudo cambiar el estado de la carta.')
      } else {
        setRestaurante(data.restaurante)
        if (data.contenido) setContenidoCarta({ ...data.contenido, loading: false, error: '' })
        setMensajePublicacion(activa ? 'Carta publicada. El QR ya puede ponerse en mesa.' : 'Carta pausada. El QR publico queda cerrado para clientes.')
      }
    } catch {
      setMensajePublicacion('No se pudo conectar con el servidor para cambiar la publicacion.')
    } finally {
      setGuardandoPublicacion(false)
    }
  }

  if (loading) return <LoadingState />

  if (!restaurante) {
    return (
      <ModuleShell
        restaurante={null}
        eyebrow="Codigo QR"
        title="No se pudo cargar el QR"
        subtitle="Falta una sesion de restaurante o la demo local no ha devuelto datos."
        narrow
      >
        <div className={styles.empty}>
          Inicia sesion con un restaurante o vuelve a cargar la demo para ver el enlace publico y el QR.
        </div>
      </ModuleShell>
    )
  }

  if (esPerfilBodega(restaurante)) {
    return (
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Accesos"
        title="QR no incluido en Sommelier"
        subtitle="La membresia sommelier trabaja con bodega interna: referencias, stock, inventario, TPV y mapa estrella/joya. No genera carta publica ni QR de mesa."
        actions={<Link className={styles.secondary} href="/dashboard/ajustes">Volver a ajustes</Link>}
        narrow
      >
        <section className={styles.empty}>
          <div>
            <strong>Sin carta publica</strong>
            <p>Para esta cuenta, los accesos utiles estan en Referencias, Bodega, Inventario y Estrellas/Joyas.</p>
          </div>
        </section>
      </ModuleShell>
    )
  }

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Codigo QR"
      title="Publicar QR"
      subtitle="Revisa la carta, abre o pausa el enlace publico y descarga el QR para mesa."
      narrow
      actions={<OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>}
      help={{
        title: 'Flujo simple',
        intro: 'Esta pantalla solo sirve para dejar el QR listo para clientes.',
        items: [
          { title: 'Revisar', text: 'Abre una prueba interna antes de publicar.' },
          { title: 'Publicar', text: 'Cuando este correcta, activa el enlace publico.' },
          { title: 'Descargar', text: 'Usa el QR en mesa, barra, imprenta o redes.' },
        ],
      }}
    >
      <section className={styles.handoffHero} aria-label="Estado del QR">
        <div className={styles.handoffCopy}>
          <h2>{tituloEstado}</h2>
          <p>{detalleEstado}</p>
          <div className={styles.handoffMeta}>
            <span>{destinoLabel}</span>
            <span>{migracionPublicacionPendiente ? 'Migracion pendiente' : estadoPublicacion}</span>
            <span>{contenidoCarta.vinosActivos} vinos</span>
          </div>
        </div>
        <div className={styles.handoffAction}>
          <span>{cartaPublicada ? 'QR final' : 'Siguiente paso'}</span>
          {cartaPublicada ? (
            <button type="button" className={styles.primary} onClick={descargar} disabled={!qrDataUrl}>
              Descargar QR
            </button>
          ) : contenidoPreparado ? (
            <button type="button" className={styles.primary} onClick={() => cambiarPublicacion(true)} disabled={publicacionDeshabilitada}>
              {guardandoPublicacion ? 'Publicando...' : 'Publicar carta'}
            </button>
          ) : (
            <Link className={styles.primary} href="/dashboard/vinos">Completar carta</Link>
          )}
        </div>
        <div className={styles.handoffSteps}>
          {pasos.map((paso, index) => (
            <article
              key={paso.label}
              className={`${styles.handoffStep} ${paso.ok ? styles.handoffStepOk : styles.handoffStepPending} ${paso.current ? styles.handoffStepCurrent : ''}`}
              aria-current={paso.current ? 'step' : undefined}
            >
              <span>{index + 1}</span>
              <strong>{paso.label}</strong>
              <small>{paso.detail}</small>
            </article>
          ))}
        </div>
      </section>

      {mensajeCopia && <p className={styles.panelSub} style={{ margin: '0 0 16px' }}>{mensajeCopia}</p>}

      <section className={styles.gridTwo} style={{ marginBottom: 16 }}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>QR de mesa</h2>
              <p className={styles.panelSub}>{cartaPublicada ? 'Descarga el codigo o copia el enlace publico.' : 'Publica la carta para activar la descarga final.'}</p>
            </div>
            <span className={styles.badge}>{estadoPublicacion}</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.qrCard}>
              <canvas ref={canvasRef} aria-label={`QR ${restaurante.nombre}`} />
            </div>
            <div className={styles.urlBox} style={{ marginTop: 14 }}>{urlDirecta}</div>
            <div className={styles.actionRow} style={{ marginTop: 14 }}>
              <button type="button" className={styles.primary} onClick={descargar} disabled={!cartaPublicada || !qrDataUrl}>Descargar QR</button>
              <button type="button" className={styles.secondary} onClick={() => copiar(urlDirecta, 'url')} disabled={!cartaPublicada}>Copiar enlace</button>
              <button type="button" className={styles.ghost} onClick={imprimir} disabled={!cartaPublicada}>Abrir impresion</button>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Revisar y publicar</h2>
              <p className={styles.panelSub}>Lo minimo antes de poner el QR delante del cliente.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              <OpenCartaPruebaButton restauranteId={restaurante?.id} className={styles.itemCard}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>Probar carta sin publicar</h3>
                    <p className={styles.sectionText}>Abre la carta como cliente, pero con enlace interno.</p>
                  </div>
                  <span className={styles.badge}>Abrir</span>
                </div>
              </OpenCartaPruebaButton>

              <article className={styles.itemCard}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>Contenido minimo</h3>
                    <p className={styles.sectionText}>
                      {contenidoCarta.loading
                        ? 'Comprobando vinos y precios...'
                        : contenidoBloqueado
                          ? 'Faltan vinos visibles o precios.'
                          : `${contenidoCarta.vinosActivos} vinos visibles y ${contenidoCarta.vinosConPrecio} con precio.`}
                    </p>
                  </div>
                  <span className={styles.badge}>{contenidoPreparado ? 'Listo' : 'Revisar'}</span>
                </div>
              </article>

              {cartaPublicada ? (
                <button type="button" className={styles.ghost} onClick={() => cambiarPublicacion(false)} disabled={guardandoPublicacion || migracionPublicacionPendiente}>
                  {guardandoPublicacion ? 'Guardando...' : 'Pausar carta publica'}
                </button>
              ) : (
                <button type="button" className={styles.primary} onClick={() => cambiarPublicacion(true)} disabled={publicacionDeshabilitada}>
                  {guardandoPublicacion ? 'Publicando...' : 'Publicar carta'}
                </button>
              )}
            </div>
            {contenidoCarta.error && <p className={styles.panelSub} style={{ marginTop: 12 }}>{contenidoCarta.error}</p>}
            {contenidoBloqueado && <p className={styles.panelSub} style={{ marginTop: 12 }}>No publiques todavia: faltan referencias activas o precios visibles para que el cliente no llegue a una carta vacia.</p>}
            {migracionPublicacionPendiente && <p className={styles.panelSub} style={{ marginTop: 12 }}>Aplica supabase/add_publication_status.sql para activar el control de borrador/publicado.</p>}
            {mensajePublicacion && <p className={styles.panelSub} style={{ marginTop: 12 }}>{mensajePublicacion}</p>}
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Enlace publico</h2>
            <p className={styles.panelSub}>Para WhatsApp, equipo de sala, imprenta o redes.</p>
          </div>
          <span className={styles.badge}>{destinoLabel}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.urlBox}>{urlDirecta}</div>
          <div className={styles.actionRow} style={{ marginTop: 14 }}>
            {cartaPublicada ? (
              <a className={styles.secondary} href={urlDirecta} target="_blank" rel="noreferrer" onClick={() => registrarUso('public_destination_opened', { source: 'url_panel' })}>Abrir carta</a>
            ) : (
              <button type="button" className={styles.secondary} disabled>Abrir carta</button>
            )}
            <button className={styles.ghost} onClick={() => copiar(urlDirecta, 'url')} disabled={!cartaPublicada}>{copiado === 'url' ? 'Copiado' : 'Copiar URL'}</button>
            <button className={styles.ghost} onClick={() => copiar(textoEquipo, 'equipo')} disabled={!cartaPublicada}>{copiado === 'equipo' ? 'Copiado' : 'Copiar para equipo'}</button>
          </div>
        </div>
      </section>
    </ModuleShell>
  )
}
