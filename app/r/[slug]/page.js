'use client'

import { useEffect, useRef, useState } from 'react'
import { enviarAprobacionPreview } from '../../lib/previewApprovalClient'
import { cargarRestaurantePublico } from '../../lib/publicRestaurantClient'
import { limpiarTextoPublico } from '../../lib/publicText'
import { enviarEstadisticas } from '../../lib/statsClient'
import { normalizarTexto } from '../../lib/textNormalize'

function HubIcon({ tipo, titulo }) {
  const texto = normalizarTexto(`${tipo || ''} ${titulo || ''}`)

  if (tipo === 'tarta' || texto.includes('tarta') || texto.includes('postre')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z"/><path d="M4 11c0-2.2 1.8-4 4-4s4 1.8 4 1.8S13.8 7 16 7s4 1.8 4 4"/><path d="M12 3v4"/><path d="M11 3h2"/></svg>
  }
  if (tipo === 'reservas' || texto.includes('reserv')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3"/><path d="M4.5 8h15"/><path d="M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 12h3M8 16h6"/></svg>
  }
  if (tipo === 'carta_vinos' || texto.includes('vino')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 8a5 5 0 0 1-10 0l1-8Z"/><path d="M7.5 8h9"/><path d="M12 16v5"/><path d="M8.5 21h7"/></svg>
  }
  if (tipo === 'grupos' || texto.includes('grupo') || texto.includes('evento')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.5"/><path d="M21 20c0-2.8-1.8-5-4-5.5"/></svg>
  }
  if (tipo === 'maps' || texto.includes('direccion') || texto.includes('ubicacion')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
  }
  if (tipo === 'alergenos' || texto.includes('alergen')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>
  }
  if (tipo === 'gintonics' || texto.includes('gin') || texto.includes('tonic') || texto.includes('coctel')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l-1 8H9L8 3Z"/><path d="M9 11l3 7 3-7"/><path d="M6 21h12"/><path d="M7 7h1M10 5h1"/></svg>
  }
  if (['carta', 'comida'].includes(tipo) || texto.includes('comida') || texto.includes('restaurante') || texto.includes('menu')) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9a3 3 0 0 1 3 3v13H9a3 3 0 0 1-3-3V4Z"/><path d="M9 8h6"/><path d="M9 11h5"/><path d="M9 14h4"/><path d="M19 7v13"/><path d="M4 7v10"/></svg>
  }
  if (tipo === 'pdf') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8L14 2Z"/><path d="M14 2v6h6"/><path d="M8 13h2.5a1.5 1.5 0 0 1 0 3H8v-3ZM8 16v3"/><path d="M14 13v6M14 13h2a1.5 1.5 0 0 1 0 3h-2"/><path d="M17 13h1a2 2 0 0 1 0 4v2"/></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H7a5 5 0 0 0 0 10h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M8 12h8"/></svg>
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1.1" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.2 8.2V6.7c0-.8.5-1.2 1.3-1.2h1.7V2.6c-.8-.1-1.6-.2-2.5-.2-2.6 0-4.4 1.6-4.4 4.5v1.3H7.6v3.2h2.7v10.2h3.4V11.4h2.8l.5-3.2h-3Z" />
    </svg>
  )
}

function SocialIcon({ tipo }) {
  return tipo === 'facebook' ? <FacebookIcon /> : <InstagramIcon />
}

function registrarEscaneoHub(restauranteId, pruebaToken, experienciaId = '') {
  if (!restauranteId) return
  enviarEstadisticas({
    restaurante_id: restauranteId,
    tipo: 'escaneo',
    detalle: {
      destino: 'hub',
      experiencia_id: experienciaId || null,
    },
    prueba_token: pruebaToken,
  }).catch(() => {})
}

export default function RestauranteHub({ params }) {
  const [restaurante, setRestaurante] = useState(null)
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [currentSlug, setCurrentSlug] = useState('')
  const [previewAprobacion, setPreviewAprobacion] = useState({ aprobada: false, loading: false, error: '' })
  const [previewApprovalOpen, setPreviewApprovalOpen] = useState(false)
  const [previewApprovalForm, setPreviewApprovalForm] = useState({ reviewer_name: '', reviewer_email: '', note: '' })
  const [demoPresentacion] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo_presentacion') === '1'
  ))
  const [pruebaToken] = useState(() => (
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('prueba') || '' : ''
  ))
  const escaneoRegistradoRef = useRef('')

  useEffect(() => {
    async function cargar() {
      try {
        setLoadError('')
        const slug = (await params).slug
        setCurrentSlug(slug)
        const { data, restaurante: rest } = await cargarRestaurantePublico(slug, {
          hub: true,
          pruebaToken,
          jsonSoloSiOk: true,
        })

        if (rest?.hub_activo && rest?.hub_disponible) {
          setRestaurante(rest)
          setLinks(data.links || [])
          const claveEscaneo = `${rest.id}:${pruebaToken || 'publico'}`
          if (escaneoRegistradoRef.current !== claveEscaneo) {
            escaneoRegistradoRef.current = claveEscaneo
            registrarEscaneoHub(rest.id, pruebaToken, rest.experiencia_publica?.id)
          }
        } else {
          setRestaurante(null)
          setLinks([])
        }
      } catch {
        setRestaurante(null)
        setLinks([])
        setLoadError('No hemos podido cargar el hub. Revisa la conexión o vuelve a intentarlo en unos segundos.')
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [params, pruebaToken])

  function updatePreviewApprovalField(field, value) {
    setPreviewApprovalForm(prev => ({ ...prev, [field]: value }))
  }

  async function aprobarPreviewHub(event) {
    event?.preventDefault()
    if (!restaurante?.id || !pruebaToken || previewAprobacion.loading || previewAprobacion.aprobada) return
    setPreviewAprobacion({ aprobada: false, loading: true, error: '' })
    try {
      const { res, data } = await enviarAprobacionPreview({
        restauranteId: restaurante.id,
        previewToken: pruebaToken,
        destino: 'hub',
        reviewerName: previewApprovalForm.reviewer_name,
        reviewerEmail: previewApprovalForm.reviewer_email,
        note: previewApprovalForm.note,
      })
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar la aprobación.')
      setPreviewAprobacion({ aprobada: true, loading: false, error: '' })
      setPreviewApprovalOpen(false)
    } catch (error) {
      setPreviewAprobacion({
        aprobada: false,
        loading: false,
        error: error.message || 'No se pudo registrar la aprobación.',
      })
    }
  }

  if (loading) {
    return (
      <main className="hub-page">
        <p className="hub-loading">Cargando</p>
      </main>
    )
  }

  if (!restaurante) {
    const cartaDirecta = currentSlug ? `/carta/${currentSlug}` : '/cartavinos'
    return (
      <main className="hub-page">
        <section className="hub-card hub-state-card" aria-live="polite">
          <p className="hub-state-eyebrow">Carta Viva</p>
          <h1>Hub no disponible</h1>
          <p>{loadError || 'El enlace puede haber cambiado o el hub todavía no está publicado.'}</p>
          <div className="hub-state-actions">
            {currentSlug && (
              <a className="hub-state-link hub-state-primary" href={cartaDirecta}>
                Abrir carta directa
              </a>
            )}
            <a className="hub-state-link" href="/cartavinos">
              Volver a Carta Viva
            </a>
          </div>
        </section>
      </main>
    )
  }

  const titulo = limpiarTextoPublico(restaurante.hub_titulo || restaurante.nombre)
  const subtitulo = limpiarTextoPublico(restaurante.hub_subtitulo || [restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · '))
  const queryCartaParams = new URLSearchParams()
  if (demoPresentacion) queryCartaParams.set('demo_presentacion', '1')
  if (pruebaToken) queryCartaParams.set('prueba', pruebaToken)
  const queryCarta = queryCartaParams.toString() ? `?${queryCartaParams.toString()}` : ''
  const mostrarLogo = restaurante.hub_mostrar_logo !== false
  const mostrarNombre = restaurante.hub_mostrar_nombre !== false
  const mostrarDireccion = restaurante.hub_mostrar_direccion !== false
  const mostrarIdentidad = mostrarLogo || mostrarNombre || (mostrarDireccion && subtitulo)
  const color = restaurante.color_primario || '#24423c'
  const acento = restaurante.color_acento || '#bfa984'
  const fondo = restaurante.color_fondo || '#f6f4f0'
  const fondoHub = restaurante.hub_fondo_url || ''
  const estilo = restaurante.hub_estilo || 'nubes'
  const overlay = Number(restaurante.hub_overlay ?? 0.48)
  const experienciaPublica = restaurante.experiencia_publica || null
  const linksSocialesBase = [
    restaurante.instagram_url && { id: 'instagram-url', tipo: 'instagram', url: restaurante.instagram_url },
    restaurante.facebook_url && { id: 'facebook-url', tipo: 'facebook', url: restaurante.facebook_url },
    ...links.filter(link => ['instagram', 'facebook'].includes(link.tipo))
  ].filter(Boolean)
  const linksSociales = linksSocialesBase.filter((link, index, lista) => {
    const clave = `${link.tipo}-${link.url}`
    return lista.findIndex(item => `${item.tipo}-${item.url}` === clave) === index
  })
  const linksPrincipales = links.filter(link => !['instagram', 'facebook'].includes(link.tipo))
  const hrefLink = link => {
    const tituloLimpio = limpiarTextoPublico(link.titulo).toLowerCase()
    if (link.tipo === 'carta' || link.tipo === 'carta_vinos' || link.url === '#carta' || tituloLimpio.includes('carta de vinos')) {
      return `/carta/${restaurante.slug}${queryCarta}`
    }
    return link.url || '#'
  }

  return (
    <main
      className={`hub-page ${fondoHub ? 'hub-page-photo' : ''} hub-style-${estilo}`}
      style={{
        '--hub-color': color,
        '--hub-accent': acento,
        '--hub-bg': fondo,
        '--hub-image': fondoHub ? `url("${fondoHub}")` : undefined,
        '--hub-image-scale': String((Number(restaurante.hub_fondo_zoom) || 115) / 100),
        '--hub-image-position': `${restaurante.hub_fondo_x ?? 50}% ${restaurante.hub_fondo_y ?? 50}%`,
        '--hub-overlay': fondoHub ? Math.max(0.56, Math.min(0.78, overlay)) : 0,
      }}
    >
      {demoPresentacion && (
        <div className="demo-presentation-bar">
          <span>Vista cliente</span>
          <a href="/demo/taberna-del-puerto">Volver a la muestra</a>
        </div>
      )}
      <div className="hub-preview-stack">
        {restaurante.modo_prueba && (
          <div className={`hub-preview-banner ${previewApprovalOpen ? 'hub-preview-banner-open' : ''}`} role="status">
            <div>
              <strong>{previewAprobacion.aprobada ? 'Preview aprobada' : 'Vista previa privada'}</strong>
              <span>
                {previewAprobacion.aprobada
                  ? 'La revisión ha quedado registrada. Ya se puede publicar desde el dashboard.'
                  : 'No es una página publicada. Revisa enlaces y carta antes de compartir el QR real.'}
              </span>
              {previewAprobacion.error && <small>{previewAprobacion.error}</small>}
            </div>
            {!previewApprovalOpen && (
              <button
                type="button"
                onClick={() => setPreviewApprovalOpen(true)}
                disabled={previewAprobacion.loading || previewAprobacion.aprobada}
              >
                {previewAprobacion.loading ? 'Registrando...' : previewAprobacion.aprobada ? 'Aprobada' : 'Aprobar preview'}
              </button>
            )}
            {previewApprovalOpen && !previewAprobacion.aprobada && (
              <form className="hub-preview-approval-form" onSubmit={aprobarPreviewHub}>
                <input
                  type="text"
                  aria-label="Nombre de quien aprueba"
                  value={previewApprovalForm.reviewer_name}
                  onChange={event => updatePreviewApprovalField('reviewer_name', event.target.value)}
                  placeholder="Nombre, cargo o equipo"
                  maxLength={120}
                  autoComplete="name"
                />
                <input
                  type="email"
                  aria-label="Email de quien aprueba"
                  value={previewApprovalForm.reviewer_email}
                  onChange={event => updatePreviewApprovalField('reviewer_email', event.target.value)}
                  placeholder="Email opcional"
                  maxLength={180}
                  autoComplete="email"
                />
                <textarea
                  aria-label="Nota de aprobacion"
                  value={previewApprovalForm.note}
                  onChange={event => updatePreviewApprovalField('note', event.target.value)}
                  placeholder="Nota opcional"
                  maxLength={800}
                  rows={2}
                />
                <div>
                  <button type="submit" disabled={previewAprobacion.loading}>
                    {previewAprobacion.loading ? 'Registrando...' : 'Confirmar aprobación'}
                  </button>
                  <button type="button" onClick={() => setPreviewApprovalOpen(false)} disabled={previewAprobacion.loading}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        <section className="hub-card">
          {mostrarIdentidad && (
            <div className="hub-identity">
              {mostrarLogo && (restaurante.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- Logo configurable del restaurante: puede venir de Supabase u otra URL externa no controlada por next/image.
                <img className="hub-logo" src={restaurante.logo_url} alt={restaurante.nombre} loading="lazy" />
              ) : (
                <div className="hub-logo hub-logo-text">{restaurante.nombre?.slice(0, 2)}</div>
              ))}
              <div>
                {mostrarNombre && <h1>{titulo}</h1>}
                {mostrarDireccion && subtitulo && <p className="hub-location">{subtitulo}</p>}
              </div>
            </div>
          )}

          {experienciaPublica && (
            <div className="hub-experience">
              <span>{limpiarTextoPublico(experienciaPublica.badge)}</span>
              <strong>{limpiarTextoPublico(experienciaPublica.headline)}</strong>
              <p>{limpiarTextoPublico(experienciaPublica.hub_text || experienciaPublica.text)}</p>
            </div>
          )}

          <div className="hub-links">
            {linksPrincipales.map(link => (
              <a
                key={link.id}
                className="hub-link"
                href={hrefLink(link)}
                target={hrefLink(link).startsWith('/') ? '_self' : '_blank'}
                rel="noreferrer"
              >
                <span className="hub-link-icon"><HubIcon tipo={link.tipo} titulo={link.titulo} /></span>
                <span className="hub-link-text">{limpiarTextoPublico(link.titulo)}</span>
              </a>
            ))}
          </div>

          {linksSociales.length > 0 && (
            <div className="hub-socials">
              {linksSociales.map(link => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" aria-label={link.tipo}>
                  <SocialIcon tipo={link.tipo} />
                </a>
              ))}
            </div>
          )}

          <a className="hub-credit" href="https://cataconjuanjo.com/cartavinos" target="_blank" rel="noreferrer">
            Carta Viva <span style={{fontStyle:'italic',letterSpacing:'0.08em'}}>×</span> @cataconjuanjo
          </a>
        </section>
      </div>
    </main>
  )
}
