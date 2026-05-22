'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

function HubIcon({ tipo }) {
  if (['carta_vinos', 'carta', 'comida'].includes(tipo)) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 8a5 5 0 0 1-10 0l1-8Z"/><path d="M7.5 8h9"/><path d="M12 16v5"/><path d="M8.5 21h7"/></svg>
  }
  if (tipo === 'reservas') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3"/><path d="M4.5 8h15"/><path d="M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 12h3M8 16h6"/></svg>
  }
  if (tipo === 'maps') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
  }
  if (tipo === 'alergenos') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>
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

export default function RestauranteHub({ params }) {
  const [restaurante, setRestaurante] = useState(null)
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const slug = (await params).slug
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('*')
        .eq('slug', slug)
        .single()

      if (rest?.hub_activo) {
        setRestaurante(rest)
        const { data } = await supabase
          .from('restaurante_links')
          .select('*')
          .eq('restaurante_id', rest.id)
          .eq('visible', true)
          .order('orden')
        setLinks(data || [])
      }

      setLoading(false)
    }
    cargar()
  }, [params])

  if (loading) {
    return (
      <main className="hub-page">
        <p className="hub-loading">Cargando</p>
      </main>
    )
  }

  if (!restaurante) {
    return (
      <main className="hub-page">
        <section className="hub-card">
          <h1>Hub no disponible</h1>
          <p>Este restaurante no tiene activada la página de enlaces.</p>
        </section>
      </main>
    )
  }

  const titulo = restaurante.hub_titulo || restaurante.nombre
  const subtitulo = restaurante.hub_subtitulo || [restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ')
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
  const linksSociales = [
    restaurante.instagram_url && { id: 'instagram-url', tipo: 'instagram', url: restaurante.instagram_url },
    restaurante.facebook_url && { id: 'facebook-url', tipo: 'facebook', url: restaurante.facebook_url },
    ...links.filter(link => ['instagram', 'facebook'].includes(link.tipo))
  ].filter(Boolean)
  const linksPrincipales = links.filter(link => !['instagram', 'facebook'].includes(link.tipo))

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
        '--hub-overlay': fondoHub ? Math.max(0.2, Math.min(0.78, overlay)) : 0,
      }}
    >
      <section className="hub-card">
        {mostrarIdentidad && (
          <div className="hub-identity">
            {mostrarLogo && (restaurante.logo_url ? (
              <img className="hub-logo" src={restaurante.logo_url} alt={restaurante.nombre} />
            ) : (
              <div className="hub-logo hub-logo-text">{restaurante.nombre?.slice(0, 2)}</div>
            ))}
            <div>
              {mostrarNombre && <h1>{titulo}</h1>}
              {mostrarDireccion && subtitulo && <p className="hub-location">{subtitulo}</p>}
            </div>
          </div>
        )}

        <div className="hub-links">
          {linksPrincipales.map(link => (
            <a
              key={link.id}
              className={`hub-link ${link.tipo === 'carta_vinos' ? 'hub-link-featured' : ''}`}
              href={link.url}
              target={link.url?.startsWith('/') ? '_self' : '_blank'}
              rel="noreferrer"
            >
              <span className="hub-link-icon"><HubIcon tipo={link.tipo} /></span>
              <span className="hub-link-text">{link.titulo}</span>
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
          Carta Viva by @cataconjuanjo
        </a>
      </section>
    </main>
  )
}
