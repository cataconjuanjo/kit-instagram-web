'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { esPerfilBodega } from '../../lib/plans'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'

const PALETTES = [
  { nombre: 'Bodega',        primario: '#1C3A2A', fondo: '#FAFAF7', acento: '#B8860B', tipografia: 'serif'     },
  { nombre: 'Moderno',       primario: '#111111', fondo: '#FFFFFF', acento: '#4A8C6F', tipografia: 'sans'      },
  { nombre: 'Burdeos',       primario: '#5C1A1A', fondo: '#FDF8F3', acento: '#B87333', tipografia: 'serif'     },
  { nombre: 'Bistró',        primario: '#1A2E4A', fondo: '#FAF7F2', acento: '#C4603A', tipografia: 'sans'      },
  { nombre: 'Mineral',       primario: '#2D2D2D', fondo: '#FAFAFA', acento: '#7B8FA0', tipografia: 'sans'      },
  { nombre: 'Rústico',       primario: '#3D2B1F', fondo: '#F7F3EE', acento: '#A0522D', tipografia: 'serif'     },
  { nombre: 'Mediterráneo',  primario: '#1B4F72', fondo: '#F8FBFF', acento: '#E67E22', tipografia: 'sans'      },
  { nombre: 'Oro',           primario: '#0A0A0A', fondo: '#F5F0E8', acento: '#C9A84C', tipografia: 'serif'     },
  { nombre: 'Carmen',        primario: '#3D2B1F', fondo: '#F7F3EE', acento: '#8B5A3A', tipografia: 'condensed' },
  { nombre: 'Elegante',      primario: '#1A1A2E', fondo: '#FDFCF9', acento: '#9B7E6B', tipografia: 'display'   },
]

const FONT_MAP = {
  serif:     { family: 'Georgia, serif',                 label: 'Clásica',   sample: 'Vino',  googleFont: null },
  sans:      { family: 'system-ui, sans-serif',          label: 'Moderna',   sample: 'Vino',  googleFont: null },
  condensed: { family: '"Barlow Condensed", sans-serif', label: 'Condensada', sample: 'VINO', googleFont: 'Barlow+Condensed:wght@700' },
  display:   { family: '"Playfair Display", serif',      label: 'Display',   sample: 'Vino',  googleFont: 'Playfair+Display:wght@500' },
  garamond:  { family: '"Cormorant Garamond", Georgia, serif', label: 'Carta vino', sample: 'Vino', googleFont: 'Cormorant+Garamond:wght@400;500;600;700' },
}

function hexToRgb(hex = '') {
  const clean = hex.replace('#', '').trim()
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function luminance(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const values = [rgb.r, rgb.g, rgb.b].map(value => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function contrastRatio(a, b) {
  const light = Math.max(luminance(a), luminance(b))
  const dark = Math.min(luminance(a), luminance(b))
  return (light + 0.05) / (dark + 0.05)
}

export default function Personalizar() {
  const [restaurante, setRestaurante] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [colorPrimario, setColorPrimario] = useState('#111111')
  const [colorFondo, setColorFondo] = useState('#ffffff')
  const [colorAcento, setColorAcento] = useState('#4A8C6F')
  const [tipografia, setTipografia] = useState('serif')
  const [logoUrl, setLogoUrl] = useState(null)
  const [bannerUrl, setBannerUrl] = useState(null)
  const [bannerZoom, setBannerZoom] = useState(100)
  const [bannerX, setBannerX] = useState(50)
  const [bannerY, setBannerY] = useState(50)
  const [hubFondoUrl, setHubFondoUrl] = useState(null)
  const [hubFondoZoom, setHubFondoZoom] = useState(115)
  const [hubFondoX, setHubFondoX] = useState(50)
  const [hubFondoY, setHubFondoY] = useState(50)
  const [hubOverlay, setHubOverlay] = useState(0.48)
  const [hubEstilo, setHubEstilo] = useState('nubes')
  const [hubTitulo, setHubTitulo] = useState('')
  const [hubSubtitulo, setHubSubtitulo] = useState('')
  const [hubMostrarLogo, setHubMostrarLogo] = useState(true)
  const [hubMostrarNombre, setHubMostrarNombre] = useState(true)
  const [hubMostrarDireccion, setHubMostrarDireccion] = useState(true)
  const [cartaMostrarEuro, setCartaMostrarEuro] = useState(true)
  const [cartaCopaDecimales, setCartaCopaDecimales] = useState(true)
  const [cartaPieTexto, setCartaPieTexto] = useState('')
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [subiendoBanner, setSubiendoBanner] = useState(false)
  const [subiendoHub, setSubiendoHub] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [errorPersonalizacion, setErrorPersonalizacion] = useState('')
  const fileRef = useRef(null)
  const bannerRef = useRef(null)
  const hubRef = useRef(null)
  const dragRef = useRef(null)
  const dragState = useRef(null)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        setColorPrimario(rest.color_primario || '#111111')
        setColorFondo(rest.color_fondo || '#ffffff')
        setColorAcento(rest.color_acento || '#4A8C6F')
        setTipografia(rest.tipografia || 'serif')
        setLogoUrl(rest.logo_url || null)
        setBannerUrl(rest.banner_url || null)
        setBannerZoom(rest.banner_zoom || 100)
        setBannerX(rest.banner_x ?? 50)
        setBannerY(rest.banner_y ?? 50)
        setHubFondoUrl(rest.hub_fondo_url || null)
        setHubFondoZoom(rest.hub_fondo_zoom || 115)
        setHubFondoX(rest.hub_fondo_x ?? 50)
        setHubFondoY(rest.hub_fondo_y ?? 50)
        setHubOverlay(rest.hub_overlay ?? 0.48)
        setHubEstilo(rest.hub_estilo || 'nubes')
        setHubTitulo(rest.hub_titulo || '')
        setHubSubtitulo(rest.hub_subtitulo || '')
        setHubMostrarLogo(rest.hub_mostrar_logo !== false)
        setHubMostrarNombre(rest.hub_mostrar_nombre !== false)
        setHubMostrarDireccion(rest.hub_mostrar_direccion !== false)
        setCartaMostrarEuro(rest.carta_mostrar_euro !== false)
        setCartaCopaDecimales(rest.carta_copa_decimales !== false)
        setCartaPieTexto(rest.carta_pie_texto || '')
      }
      setLoading(false)
    }
    cargar()
  }, [])

  // Cargar Google Fonts cuando cambia la tipografía seleccionada
  useEffect(() => {
    const font = FONT_MAP[tipografia]
    if (!font?.googleFont) return
    if (document.querySelector(`link[data-gfont="${tipografia}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`
    link.setAttribute('data-gfont', tipografia)
    document.head.appendChild(link)
  }, [tipografia])

  function aplicarPaleta(p) {
    setColorPrimario(p.primario)
    setColorFondo(p.fondo)
    setColorAcento(p.acento)
    setTipografia(p.tipografia)
  }

  function nombreArchivoStorage(tipo, file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    return `${restaurante.slug}/${tipo}-${Date.now()}.${ext}`
  }

  function esErrorColumnasHub(error) {
    const texto = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
    return ['hub_mostrar_logo', 'hub_mostrar_nombre', 'hub_mostrar_direccion'].some(columna => texto.includes(columna))
  }

  function descripcionErrorGuardar(nombre, error, sql) {
    const detalle = error?.message ? ` (${error.message})` : ''
    return `${nombre}${detalle}${sql ? `. Ejecuta ${sql} en Supabase.` : ''}`
  }

  function aplicarEstadoBanner(url, zoom = 100, x = 50, y = 50) {
    setBannerUrl(url)
    setBannerZoom(zoom)
    setBannerX(x)
    setBannerY(y)
  }

  function aplicarEstadoHub(url, zoom = 115, x = 50, y = 50) {
    setHubFondoUrl(url)
    setHubFondoZoom(zoom)
    setHubFondoX(x)
    setHubFondoY(y)
  }

  async function guardarParcial(cambios) {
    const { error } = await supabase.from('restaurantes').update(cambios).eq('id', restaurante.id)
    if (!error) setRestaurante(prev => prev ? { ...prev, ...cambios } : prev)
    return { error }
  }

  // Drag to reposition banner
  function onDragStart(e) {
    e.preventDefault()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    dragState.current = { startX: clientX, startY: clientY, origX: bannerX, origY: bannerY }

    function onMove(ev) {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY
      const rect = dragRef.current?.getBoundingClientRect()
      if (!rect) return
      const sensitivity = 100 / (bannerZoom / 100)
      const dx = -((cx - dragState.current.startX) / rect.width) * sensitivity
      const dy = -((cy - dragState.current.startY) / rect.height) * sensitivity
      setBannerX(Math.max(0, Math.min(100, dragState.current.origX + dx)))
      setBannerY(Math.max(0, Math.min(100, dragState.current.origY + dy)))
    }

    function onEnd() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
  }

  async function subirBanner(e) {
    const file = e.target.files[0]
    if (!file) return
    setErrorPersonalizacion('')
    setSubiendoBanner(true)
    const previewUrl = URL.createObjectURL(file)
    aplicarEstadoBanner(previewUrl)
    const fileName = nombreArchivoStorage('banner', file)
    const { error } = await supabase.storage.from('logos').upload(fileName, file, { cacheControl: '31536000' })
    if (error) {
      setErrorPersonalizacion('No se pudo subir el banner a Supabase. Lo ves en la vista previa, pero no se aplicará en la carta pública hasta que suba correctamente.')
    } else {
      const { data } = supabase.storage.from('logos').getPublicUrl(fileName)
      const cambios = { banner_url: data.publicUrl, banner_zoom: 100, banner_x: 50, banner_y: 50 }
      aplicarEstadoBanner(cambios.banner_url, cambios.banner_zoom, cambios.banner_x, cambios.banner_y)
      URL.revokeObjectURL(previewUrl)
      const { error: updateError } = await guardarParcial(cambios)
      if (updateError) {
        setErrorPersonalizacion(`El banner se subió y aparece en la vista previa, pero no se pudo aplicar en la carta pública: ${updateError.message || 'error de guardado'}.`)
      }
    }
    e.target.value = ''
    setSubiendoBanner(false)
  }

  async function subirHubFondo(e) {
    const file = e.target.files[0]
    if (!file) return
    setErrorPersonalizacion('')
    setSubiendoHub(true)
    const previewUrl = URL.createObjectURL(file)
    aplicarEstadoHub(previewUrl)
    const fileName = nombreArchivoStorage('hub', file)
    const { error } = await supabase.storage.from('logos').upload(fileName, file, { cacheControl: '31536000' })
    if (error) {
      setErrorPersonalizacion('No se pudo subir el fondo del hub a Supabase. Lo ves en la vista previa, pero no se aplicará en el hub público hasta que suba correctamente.')
    } else {
      const { data } = supabase.storage.from('logos').getPublicUrl(fileName)
      const cambios = { hub_fondo_url: data.publicUrl, hub_fondo_zoom: 115, hub_fondo_x: 50, hub_fondo_y: 50 }
      aplicarEstadoHub(cambios.hub_fondo_url, cambios.hub_fondo_zoom, cambios.hub_fondo_x, cambios.hub_fondo_y)
      URL.revokeObjectURL(previewUrl)
      const { error: updateError } = await guardarParcial(cambios)
      if (updateError) {
        setErrorPersonalizacion(`El fondo del hub se subió y aparece en la vista previa, pero no se pudo aplicar en el hub público: ${updateError.message || 'error de guardado'}.`)
      }
    }
    e.target.value = ''
    setSubiendoHub(false)
  }

  async function subirLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    setErrorPersonalizacion('')
    setSubiendoLogo(true)
    const fileName = nombreArchivoStorage('logo', file)
    const { error } = await supabase.storage.from('logos').upload(fileName, file, { cacheControl: '31536000' })
    if (error) {
      setErrorPersonalizacion('No se pudo subir el logo. Revisa el formato de imagen e inténtalo de nuevo.')
    } else {
      const { data } = supabase.storage.from('logos').getPublicUrl(fileName)
      const { error: updateError } = await guardarParcial({ logo_url: data.publicUrl })
      if (updateError) {
        setErrorPersonalizacion('El logo se subió, pero no se pudo guardar en el restaurante.')
      } else {
        setLogoUrl(data.publicUrl)
      }
    }
    e.target.value = ''
    setSubiendoLogo(false)
  }

  async function quitarBanner() {
    setErrorPersonalizacion('')
    const cambios = { banner_url: null, banner_zoom: 100, banner_x: 50, banner_y: 50 }
    const { error } = await guardarParcial(cambios)
    if (error) {
      setErrorPersonalizacion('No se pudo quitar el banner.')
      return
    }
    aplicarEstadoBanner(null, 100, 50, 50)
  }

  async function quitarHubFondo() {
    setErrorPersonalizacion('')
    const cambios = { hub_fondo_url: null, hub_fondo_zoom: 115, hub_fondo_x: 50, hub_fondo_y: 50 }
    const { error } = await guardarParcial(cambios)
    if (error) {
      setErrorPersonalizacion('No se pudo quitar el fondo del hub.')
      return
    }
    aplicarEstadoHub(null, 115, 50, 50)
  }

  async function guardarPorBloques() {
    setErrorPersonalizacion('')
    setGuardando(true)

    const grupos = [
      { nombre: 'colores base', cambios: { color_primario: colorPrimario, color_fondo: colorFondo } },
      { nombre: 'acento y tipografia', cambios: { color_acento: colorAcento, tipografia }, sql: 'supabase/add_personalizacion.sql' },
      { nombre: 'banner de carta', cambios: { banner_url: bannerUrl, banner_zoom: bannerZoom, banner_x: bannerX, banner_y: bannerY }, sql: 'supabase/add_personalizacion.sql' },
      { nombre: 'texto del hub', cambios: { hub_titulo: hubTitulo.trim() || null, hub_subtitulo: hubSubtitulo.trim() || null }, sql: 'supabase/add_hub_links.sql' },
      { nombre: 'fondo del hub', cambios: { hub_fondo_url: hubFondoUrl, hub_fondo_zoom: hubFondoZoom, hub_fondo_x: hubFondoX, hub_fondo_y: hubFondoY, hub_overlay: hubOverlay, hub_estilo: hubEstilo }, sql: 'supabase/add_hub_links.sql' },
      { nombre: 'visibilidad del hub', cambios: { hub_mostrar_logo: hubMostrarLogo, hub_mostrar_nombre: hubMostrarNombre, hub_mostrar_direccion: hubMostrarDireccion }, sql: 'supabase/add_hub_links.sql' },
      { nombre: 'formato de precios', cambios: { carta_mostrar_euro: cartaMostrarEuro, carta_copa_decimales: cartaCopaDecimales, carta_pie_texto: cartaPieTexto.trim() || null }, sql: 'supabase/add_precio_formato.sql' },
    ]

    const errores = []
    let guardados = 0
    for (const grupo of grupos) {
      const { error } = await guardarParcial(grupo.cambios)
      if (error) errores.push(descripcionErrorGuardar(grupo.nombre, error, grupo.sql))
      else guardados += 1
    }

    if (guardados > 0) {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    }

    if (errores.length) {
      setErrorPersonalizacion(
        guardados > 0
          ? `Guardado parcial. Fallo: ${errores.join(' | ')}`
          : `No se pudo guardar nada. Fallo: ${errores.join(' | ')}`
      )
    }

    setGuardando(false)
  }

  async function guardar() {
    setErrorPersonalizacion('')
    setGuardando(true)
    const cambios = {
      color_primario: colorPrimario,
      color_fondo: colorFondo,
      color_acento: colorAcento,
      tipografia,
      hub_titulo: hubTitulo.trim() || null,
      hub_subtitulo: hubSubtitulo.trim() || null,
      banner_url: bannerUrl,
      banner_zoom: bannerZoom,
      banner_x: bannerX,
      banner_y: bannerY,
      hub_fondo_url: hubFondoUrl,
      hub_fondo_zoom: hubFondoZoom,
      hub_fondo_x: hubFondoX,
      hub_fondo_y: hubFondoY,
      hub_overlay: hubOverlay,
      hub_estilo: hubEstilo,
    }
    const { error } = await guardarParcial(cambios)
    if (error) {
      setErrorPersonalizacion('No se pudieron guardar los cambios de diseño.')
      setGuardando(false)
      return
    }

    const { error: errorOpcionesHub } = await guardarParcial({
      hub_mostrar_logo: hubMostrarLogo,
      hub_mostrar_nombre: hubMostrarNombre,
      hub_mostrar_direccion: hubMostrarDireccion,
    })
    if (errorOpcionesHub) {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
      setErrorPersonalizacion(
        esErrorColumnasHub(errorOpcionesHub)
          ? 'Diseño guardado. Los interruptores de logo/nombre/dirección necesitan ejecutar el SQL actualizado de supabase/add_hub_links.sql en Supabase.'
          : `Diseño guardado, pero no se pudieron guardar las opciones del hub: ${errorOpcionesHub.message || 'error desconocido'}.`
      )
    } else {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    }
    setGuardando(false)
  }

  const fontPreview = (FONT_MAP[tipografia] || FONT_MAP.serif).family

  function bannerCss(zoom, x, y) {
    return {
      position: 'absolute',
      inset: 0,
      backgroundImage: bannerUrl
        ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${bannerUrl})`
        : undefined,
      backgroundSize: 'cover',
      backgroundPosition: `${x}% ${y}%`,
      backgroundRepeat: 'no-repeat',
      transform: `scale(${Number(zoom || 100) / 100})`,
      transformOrigin: 'center',
      pointerEvents: 'none',
    }
  }

  if (loading) return <LoadingState />

  if (esPerfilBodega(restaurante)) {
    return (
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Bodega"
        title="Diseno de carta no incluido en Sommelier"
        subtitle="La membresia sommelier no publica carta ni QR. Su configuracion se centra en datos de bodega, actividad real y accesos internos de trabajo."
        actions={<Link className={styles.secondary} href="/dashboard/ajustes">Volver a ajustes</Link>}
        narrow
      >
        <section className={styles.empty}>
          <div>
            <strong>Sin escaparate publico</strong>
            <p>Para esta cuenta, la identidad visual de carta se sustituye por control de referencias, inventario y decisiones economicas.</p>
          </div>
        </section>
      </ModuleShell>
    )
  }

  const tituloHubPreview = hubTitulo.trim() || restaurante?.nombre
  const subtituloHubPreview = hubSubtitulo.trim() || restaurante?.ciudad || 'Carta, reservas y enlaces'
  const contrasteCabecera = contrastRatio(colorPrimario, '#ffffff')
  const contrasteFondo = contrastRatio(colorFondo, '#111111')
  const checksMarca = [
    { label: 'Logo', ok: Boolean(logoUrl), text: logoUrl ? 'Cargado' : 'Pendiente' },
    { label: 'Banner carta', ok: Boolean(bannerUrl), text: bannerUrl ? 'Con imagen' : 'Sin banner' },
    { label: 'Fondo hub', ok: Boolean(hubFondoUrl), text: hubFondoUrl ? 'Personalizado' : 'Sin fondo' },
    { label: 'Contraste cabecera', ok: contrasteCabecera >= 4.5, text: `${contrasteCabecera.toFixed(1)}:1` },
    { label: 'Contraste fondo', ok: contrasteFondo >= 4.5, text: `${contrasteFondo.toFixed(1)}:1` },
  ]
  const marcaLista = checksMarca.filter(item => item.ok).length

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Personalizacion"
      title="Identidad visual de la carta"
      subtitle="Elige una paleta base y ajusta los colores para que la carta encaje con la marca del establecimiento."
      narrow
      actions={
        <>
          <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>
            Probar carta
          </OpenCartaPruebaButton>
          {restaurante?.hub_activo && (
            <a className={styles.secondary} href={`/r/${restaurante.slug}`} target="_blank" rel="noreferrer">
              Ver hub
            </a>
          )}
        </>
      }
      help={{
        title: 'Diseno sin romper la carta',
        intro: 'Personaliza lo suficiente para que sea reconocible, pero manteniendo legibilidad en móvil.',
        items: [
          { title: 'Empieza por paleta', text: 'Elige una base parecida al local y despues ajusta colores concretos.' },
          { title: 'Imagen y logo', text: 'Usa imágenes claras. Evita banners oscuros o recortados que tapen el nombre.' },
          { title: 'Revisa en móvil', text: 'Guarda y abre la carta pública. Si se lee bien en móvil, normalmente funciona en mesa.' },
        ],
      }}
    >
      {errorPersonalizacion && (
        <div className={styles.empty} style={{ minHeight: 'auto', marginBottom: 16, color: '#9b3535' }}>
          {errorPersonalizacion}
        </div>
      )}
      <section className={styles.brandHealth}>
        <div>
          <p className={styles.eyebrow}>Diagnóstico de marca</p>
          <h2>{marcaLista === checksMarca.length ? 'Identidad lista para mesa' : 'Faltan detalles de identidad'}</h2>
          <p>Un vistazo rápido a lo que verá el cliente: logo, ambiente, hub y legibilidad.</p>
        </div>
        <div className={styles.brandHealthScore}>
          <strong>{marcaLista}/{checksMarca.length}</strong>
          <span>puntos listos</span>
        </div>
        <div className={styles.brandChecks}>
          {checksMarca.map(item => (
            <span key={item.label} className={item.ok ? styles.brandCheckOk : styles.brandCheckPending}>
              {item.label}: {item.text}
            </span>
          ))}
        </div>
      </section>

      {/* Paletas curadas */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Paletas curadas</h2>
            <p className={styles.panelSub}>Punto de partida testeado. Puedes ajustar cualquier color después.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
            {PALETTES.map(p => {
              const activa = colorPrimario === p.primario && colorFondo === p.fondo && colorAcento === p.acento
              return (
                <button
                  key={p.nombre}
                  onClick={() => aplicarPaleta(p)}
                  style={{
                    border: activa ? `2px solid ${p.primario}` : '2px solid transparent',
                    borderRadius: 10, padding: 0, cursor: 'pointer', background: p.fondo, overflow: 'hidden',
                    boxShadow: activa ? `0 0 0 2px ${p.primario}` : '0 1px 4px rgba(0,0,0,0.08)',
                  }}
                >
                  <div style={{ background: p.primario, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.acento }} />
                  </div>
                  <div style={{ padding: '6px 8px 8px' }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: p.primario, fontFamily: (FONT_MAP[p.tipografia] || FONT_MAP.serif).family }}>{p.nombre}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Colores + tipografía */}
      <section className={styles.gridTwo} style={{ marginTop: 16 }}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Colores y tipografía</h2>
              <p className={styles.panelSub}>Ajuste fino sobre la paleta elegida.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>Color principal</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Cabecera y estructura</p>
                <div className={styles.swatchRow}>
                  <input className={styles.colorSwatch} type="color" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)} />
                  <input className={styles.input} type="text" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Color de acento</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Botones y elementos activos</p>
                <div className={styles.swatchRow}>
                  <input className={styles.colorSwatch} type="color" value={colorAcento} onChange={e => setColorAcento(e.target.value)} />
                  <input className={styles.input} type="text" value={colorAcento} onChange={e => setColorAcento(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Color de fondo</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Fondo de la página</p>
                <div className={styles.swatchRow}>
                  <input className={styles.colorSwatch} type="color" value={colorFondo} onChange={e => setColorFondo(e.target.value)} />
                  <input className={styles.input} type="text" value={colorFondo} onChange={e => setColorFondo(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Tipografía</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Nombre y títulos de la carta</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
                  {Object.entries(FONT_MAP).map(([id, f]) => (
                    <button key={id} onClick={() => setTipografia(id)} style={{
                      padding: '10px 6px', borderRadius: 8, cursor: 'pointer',
                      border: tipografia === id ? `2px solid ${colorPrimario}` : '2px solid #e8e8e8',
                      background: tipografia === id ? `${colorPrimario}10` : '#fafafa',
                    }}>
                      <p style={{ margin: '0 0 2px', fontSize: 15, fontFamily: f.family, color: colorPrimario, fontWeight: id === 'condensed' ? 700 : 400 }}>{f.sample}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#aaa' }}>{f.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className={styles.panelDark}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Vista rápida</h2>
              <p className={styles.panelSub}>Comprobación visual antes de guardar.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.previewCard} style={{ background: colorFondo, overflow: 'hidden' }}>
              <div style={{ position: 'relative', overflow: 'hidden', padding: '14px 16px', background: colorPrimario }}>
                {bannerUrl && <div aria-hidden="true" style={bannerCss(bannerZoom, bannerX, bannerY)} />}
                <div style={{ position: 'relative', zIndex: 1 }}>
                  {logoUrl && <img src={logoUrl} alt="Logo" loading="lazy" style={{ height: 28, objectFit: 'contain', display: 'block', marginBottom: 8 }} />}
                  <p style={{ margin: '0 0 2px', color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: 850, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Carta de vinos</p>
                  <p style={{ margin: 0, color: '#fff', fontSize: 18, fontFamily: fontPreview }}>{restaurante?.nombre}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, padding: '10px 12px', flexWrap: 'wrap' }}>
                {['Todos', 'Tintos', 'Blancos'].map((label, i) => (
                  <span key={label} style={{
                    padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: i === 0 ? colorAcento : 'transparent',
                    border: `1px solid ${i === 0 ? colorAcento : '#ddd'}`,
                    color: i === 0 ? '#fff' : '#888',
                  }}>{label}</span>
                ))}
              </div>
              <div style={{ margin: '0 12px 8px', background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111', fontFamily: fontPreview }}>Pago de Capellanes</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>Ribera del Duero · Tinto</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: colorAcento }}>28 €</span>
                </div>
              </div>
              <div style={{ padding: '0 12px 12px' }}>
                <div style={{ background: colorAcento, borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#fff', fontSize: 11, fontWeight: 850, letterSpacing: '0.1em' }}>SOMMELIER IA</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Banner */}
      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Banner de cabecera</h2>
            <p className={styles.panelSub}>
              {bannerUrl ? 'Arrastra la imagen para encuadrar. Usa el slider para hacer zoom.' : 'Foto de fachada, interior o ambiente. Recomendado: 1200×400 px o apaisada.'}
            </p>
          </div>
        </div>
        <div className={styles.panelBody}>
          {bannerUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Drag area */}
              <div
                ref={dragRef}
                onMouseDown={onDragStart}
                onTouchStart={onDragStart}
                style={{
                  height: 140, borderRadius: 10, overflow: 'hidden', cursor: 'grab', userSelect: 'none',
                  position: 'relative', border: '1px solid #e8e8e8',
                  backgroundColor: '#111',
                }}
              >
                <div aria-hidden="true" style={bannerCss(bannerZoom, bannerX, bannerY)} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <span style={{ background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, padding: '4px 10px', borderRadius: 20, letterSpacing: '0.05em' }}>
                    Arrastra para encuadrar
                  </span>
                </div>
              </div>

              {/* Zoom slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>Zoom</span>
                <input
                  type="range" min={100} max={300} step={1}
                  value={bannerZoom}
                  onChange={e => setBannerZoom(Number(e.target.value))}
                  style={{ flex: 1, accentColor: colorPrimario }}
                />
                <span style={{ fontSize: 11, color: '#888', flexShrink: 0, width: 36, textAlign: 'right' }}>{bannerZoom}%</span>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input type="file" accept="image/*" ref={bannerRef} onChange={subirBanner} style={{ display: 'none' }} />
                <button className={styles.secondary} onClick={() => bannerRef.current.click()} disabled={subiendoBanner}>
                  {subiendoBanner ? 'Subiendo...' : 'Cambiar foto'}
                </button>
                <button className={styles.secondary} onClick={quitarBanner} style={{ color: '#c00', borderColor: '#fcc' }}>
                  Quitar banner
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ height: 100, borderRadius: 10, border: '2px dashed #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, background: '#fafafa' }}>
                <span style={{ fontSize: 13, color: '#bbb' }}>Sin banner</span>
              </div>
              <input type="file" accept="image/*" ref={bannerRef} onChange={subirBanner} style={{ display: 'none' }} />
              <button className={styles.secondary} onClick={() => bannerRef.current.click()} disabled={subiendoBanner}>
                {subiendoBanner ? 'Subiendo...' : 'Subir foto de banner'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Hub */}
      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Hub tipo campsite</h2>
            <p className={styles.panelSub}>Foto de fondo y botones tipo nube para carta, reservas, redes y accesos rápidos.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.gridTwo}>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className={styles.label}>Foto de fondo del hub</label>
                <p className={styles.tiny} style={{ marginTop: 0 }}>Interior, barra, fachada o una imagen de ambiente. La app la oscurece para que los botones se lean.</p>
                <input type="file" accept="image/*" ref={hubRef} onChange={subirHubFondo} style={{ display: 'none' }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className={styles.secondary} onClick={() => hubRef.current.click()} disabled={subiendoHub}>
                    {subiendoHub ? 'Subiendo...' : hubFondoUrl ? 'Cambiar fondo' : 'Subir fondo'}
                  </button>
                  {hubFondoUrl && (
                    <button className={styles.secondary} onClick={quitarHubFondo} style={{ color: '#9b3535', borderColor: '#e0bbbb' }}>
                      Quitar fondo
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.formGrid}>
                <div>
                  <label className={styles.label}>Título del hub</label>
                  <input className={styles.input} value={hubTitulo} onChange={e => setHubTitulo(e.target.value)} placeholder={restaurante?.nombre || 'Nombre del restaurante'} />
                </div>
                <div>
                  <label className={styles.label}>Dirección o subtítulo</label>
                  <input className={styles.input} value={hubSubtitulo} onChange={e => setHubSubtitulo(e.target.value)} placeholder={restaurante?.ciudad || 'Carta, reservas y enlaces'} />
                </div>
                <label className={styles.checkOption}>
                  <input type="checkbox" checked={hubMostrarLogo} onChange={e => setHubMostrarLogo(e.target.checked)} />
                  <span>Mostrar logo en el hub</span>
                </label>
                <label className={styles.checkOption}>
                  <input type="checkbox" checked={hubMostrarNombre} onChange={e => setHubMostrarNombre(e.target.checked)} />
                  <span>Mostrar nombre del restaurante</span>
                </label>
                <label className={styles.checkOption}>
                  <input type="checkbox" checked={hubMostrarDireccion} onChange={e => setHubMostrarDireccion(e.target.checked)} />
                  <span>Mostrar dirección o subtítulo</span>
                </label>
                <div>
                  <label className={styles.label}>Estilo botones</label>
                  <select className={styles.input} value={hubEstilo} onChange={e => setHubEstilo(e.target.value)}>
                    <option value="nubes">Nubes claras</option>
                    <option value="solido">Botones sólidos</option>
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Oscurecer fondo</label>
                  <input
                    type="range"
                    min={0.2}
                    max={0.78}
                    step={0.01}
                    value={hubOverlay}
                    onChange={e => setHubOverlay(Number(e.target.value))}
                    style={{ width: '100%', accentColor: colorPrimario }}
                  />
                  <p className={styles.tiny} style={{ margin: 0 }}>{Math.round(hubOverlay * 100)}%</p>
                </div>
                <div>
                  <label className={styles.label}>Zoom fondo</label>
                  <input
                    type="range"
                    min={100}
                    max={260}
                    step={1}
                    value={hubFondoZoom}
                    onChange={e => setHubFondoZoom(Number(e.target.value))}
                    style={{ width: '100%', accentColor: colorPrimario }}
                  />
                </div>
                <div>
                  <label className={styles.label}>Posición</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input className={styles.input} type="number" min={0} max={100} value={hubFondoX} onChange={e => setHubFondoX(Number(e.target.value))} />
                    <input className={styles.input} type="number" min={0} max={100} value={hubFondoY} onChange={e => setHubFondoY(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                minHeight: 360,
                borderRadius: 18,
                overflow: 'hidden',
                display: 'grid',
                alignContent: 'center',
                justifyItems: 'center',
                gap: 12,
                padding: 24,
                backgroundColor: colorFondo,
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                ...(hubFondoUrl ? {
                  backgroundImage: `linear-gradient(rgba(0,0,0,${hubOverlay}), rgba(0,0,0,${hubOverlay})), url(${hubFondoUrl})`,
                  backgroundSize: `${hubFondoZoom}%`,
                  backgroundPosition: `${hubFondoX}% ${hubFondoY}%`,
                  backgroundRepeat: 'no-repeat',
                } : {}),
              }}
            >
              <div style={{ display: 'contents' }}>
              {hubMostrarLogo && (logoUrl ? (
                <img src={logoUrl} alt="Logo" loading="lazy" style={{ width: 68, height: 68, objectFit: 'contain', borderRadius: 999, background: colorPrimario, padding: 8, boxSizing: 'border-box' }} />
              ) : (
                <div style={{ width: 68, height: 68, borderRadius: 999, background: colorPrimario, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: fontPreview }}>
                  {restaurante?.nombre?.slice(0, 2)}
                </div>
              ))}
              {(hubMostrarNombre || hubMostrarDireccion) && (
                <div style={{ textAlign: 'center', color: hubFondoUrl ? '#fff' : colorPrimario }}>
                  {hubMostrarNombre && <h3 style={{ margin: 0, fontSize: 28, lineHeight: 1, fontFamily: fontPreview }}>{tituloHubPreview}</h3>}
                  {hubMostrarDireccion && <p style={{ margin: hubMostrarNombre ? '8px 0 0' : 0, opacity: 0.72 }}>{subtituloHubPreview}</p>}
                </div>
              )}
              {[
                { label: 'Carta de vino', icon: 'wine' },
                { label: 'Carta restaurante', icon: 'menu' },
                { label: 'Reservas', icon: 'calendar' },
              ].map(item => (
                <div key={item.label} style={{
                  width: '100%',
                  maxWidth: 320,
                  minHeight: 48,
                  borderRadius: 999,
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(0, 1fr) 20px',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 18px',
                  background: hubEstilo === 'solido' ? colorPrimario : 'rgba(255,255,255,0.86)',
                  color: hubEstilo === 'solido' ? '#fff' : '#111',
                  fontWeight: 850,
                  boxShadow: '0 16px 38px rgba(0,0,0,0.18)',
                  border: `1px solid ${hubEstilo === 'solido' ? colorAcento : 'rgba(255,255,255,0.58)'}`,
                }}>
                  <span style={{ display: 'grid', placeItems: 'center', color: hubEstilo === 'solido' ? '#fff' : colorPrimario }}>
                    {item.icon === 'wine' && <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l1 8a5 5 0 0 1-10 0l1-8Z"/><path d="M7.5 8h9"/><path d="M12 16v5"/><path d="M8.5 21h7"/></svg>}
                    {item.icon === 'menu' && <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h9a3 3 0 0 1 3 3v13H9a3 3 0 0 1-3-3V4Z"/><path d="M9 8h6"/><path d="M9 11h5"/><path d="M9 14h4"/><path d="M19 7v13"/><path d="M4 7v10"/></svg>}
                    {item.icon === 'calendar' && <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3v3M17 3v3"/><path d="M4.5 8h15"/><path d="M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 12h3M8 16h6"/></svg>}
                  </span>
                  <span style={{ justifySelf: 'center' }}>{item.label}</span>
                  <span />
                </div>
              ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo */}
      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Logo del restaurante</h2>
            <p className={styles.panelSub}>Aparece en la cabecera encima del banner. PNG con fondo transparente funciona mejor.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 72, height: 72, border: '1px solid #dfddd6', borderRadius: 8, display: 'grid', placeItems: 'center', background: colorPrimario, overflow: 'hidden', flexShrink: 0 }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Sin logo</span>
              }
            </div>
            <div>
              <input type="file" accept="image/*" ref={fileRef} onChange={subirLogo} style={{ display: 'none' }} />
              <button className={styles.secondary} onClick={() => fileRef.current.click()} disabled={subiendoLogo}>
                {subiendoLogo ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Formato de precios */}
      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Formato de precios</h2>
            <p className={styles.panelSub}>Controla cómo se muestran los precios en la carta pública y el texto legal del pie.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div style={{ display: 'grid', gap: 14 }}>
            <label className={styles.checkOption}>
              <input type="checkbox" checked={cartaMostrarEuro} onChange={e => setCartaMostrarEuro(e.target.checked)} />
              <span>Mostrar símbolo € junto al precio</span>
            </label>
            <label className={styles.checkOption}>
              <input type="checkbox" checked={cartaCopaDecimales} onChange={e => setCartaCopaDecimales(e.target.checked)} />
              <span>Mostrar decimales en precio por copa (ej. 3,50 vs 4)</span>
            </label>
            <div>
              <label className={styles.label}>Texto legal al pie de carta</label>
              <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Déjalo vacío para usar el texto por defecto sobre IVA incluido.</p>
              <input
                className={styles.input}
                value={cartaPieTexto}
                onChange={e => setCartaPieTexto(e.target.value)}
                placeholder="Los precios de esta carta están indicados en Euros € e incluyen el 10% de IVA."
              />
            </div>
          </div>
        </div>
      </section>

      <button
        className={styles.primary}
        onClick={guardarPorBloques}
        disabled={guardando}
        style={{ width: '100%', marginTop: 16, background: guardado ? '#4A8C6F' : undefined, borderColor: guardado ? '#4A8C6F' : undefined }}
      >
        {guardado ? 'Guardado' : guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </ModuleShell>
  )
}
