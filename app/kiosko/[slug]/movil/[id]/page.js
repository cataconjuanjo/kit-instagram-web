'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import styles from './mobile.module.css'

const TIPO_COLORS = {
  tinto: '#8B1A1A', blanco: '#C4A843', rosado: '#D4756A', espumoso: '#7AB5C8',
  generoso: '#B47C3C', dulce: '#C4567C', naranja: '#C4843C', sin_alcohol: '#5C9C5C',
}

const TIPO_LABELS = {
  tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso',
  generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol',
}

function formatPrecio(p) {
  if (!p) return ''
  return Number(p).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
}

function BottleMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M21 7h6" />
      <path d="M22 7v9l-5 7v15c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V23l-5-7V7" />
      <path d="M18 29h12" />
      <path d="M19 36h10" />
    </svg>
  )
}

function SafeImage({ src, alt, className, fallback }) {
  const [failedSrc, setFailedSrc] = useState('')
  if (!src || failedSrc === src) return fallback ?? null
  return <img src={src} alt={alt || ''} className={className} onError={() => setFailedSrc(src)} />
}

export default function KioskoMobileWinePage() {
  const { slug, id } = useParams()
  const searchParams = useSearchParams()
  const motivo = searchParams.get('motivo') || ''
  const lang = ['en', 'fr', 'de'].includes(searchParams.get('lang')) ? searchParams.get('lang') : 'es'

  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      setLoading(true)
      setError('')
    })
    fetch(`/api/kiosko/${slug}/movil/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('No encontrado')))
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setError('No hemos podido cargar esta seleccion.') })
      .finally(() => { if (alive) setLoading(false) })

    fetch(`/api/kiosko/${slug}/movil/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'qr_opened', lang }),
    }).catch(() => {})

    return () => { alive = false }
  }, [slug, id, lang])

  const vino = data?.vino
  const tienda = data?.tienda
  const ficha = data?.ficha
  const colorAcento = tienda?.color_acento || '#c9a96e'
  const colorPrimario = tienda?.color_primario || '#11111a'
  const placeholderStyle = useMemo(() => ({
    background: `linear-gradient(135deg, ${TIPO_COLORS[vino?.tipo] || '#333'}44, ${TIPO_COLORS[vino?.tipo] || '#333'}99)`,
  }), [vino?.tipo])

  async function compartir() {
    const url = window.location.href
    const text = vino ? `${vino.nombre}${vino.precio_pvp ? ` - ${formatPrecio(vino.precio_pvp)}` : ''}` : url
    if (navigator.share) {
      try {
        await navigator.share({ title: vino?.nombre || 'Vino recomendado', text, url })
        return
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {}
  }

  if (loading) {
    return (
      <main className={styles.page} style={{ '--accent': colorAcento, '--primary': colorPrimario }}>
        <div className={styles.loading}>Cargando seleccion...</div>
      </main>
    )
  }

  if (error || !vino) {
    return (
      <main className={styles.page} style={{ '--accent': colorAcento, '--primary': colorPrimario }}>
        <div className={styles.empty}>
          <h1>Seleccion no disponible</h1>
          <p>{error || 'Este vino ya no esta disponible en el kiosko.'}</p>
          <a href={`/kiosko/${slug}`} className={styles.primaryBtn}>Volver al kiosko</a>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page} style={{ '--accent': colorAcento, '--primary': colorPrimario }}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Tu seleccion en {tienda?.nombre || 'la tienda'}</p>
        <div className={styles.photoWrap}>
          <SafeImage
            src={vino.foto_url}
            alt={vino.nombre}
            className={styles.photo}
            fallback={
              <div className={styles.photoFallback} style={placeholderStyle}>
                <BottleMark className={styles.photoIcon} />
              </div>
            }
          />
        </div>
        {vino.tipo && <span className={styles.tipo} style={{ background: TIPO_COLORS[vino.tipo] || '#666' }}>{TIPO_LABELS[vino.tipo] || vino.tipo}</span>}
        <h1>{vino.nombre}</h1>
        {vino.bodega && <p className={styles.bodega}>{vino.bodega}</p>}
        {vino.precio_oferta ? (
          <p className={styles.price}>
            <s>{formatPrecio(vino.precio_pvp)}</s>
            <strong>{formatPrecio(vino.precio_oferta)}</strong>
          </p>
        ) : vino.precio_pvp ? (
          <p className={styles.price}><strong>{formatPrecio(vino.precio_pvp)}</strong></p>
        ) : null}
      </section>

      <section className={styles.infoGrid}>
        {vino.ubicacion_estanteria && (
          <article className={styles.infoCard}>
            <span>Ubicacion</span>
            <strong>{vino.ubicacion_estanteria}</strong>
            <p>Busca esta referencia en tienda o ensenala al equipo.</p>
          </article>
        )}
        <article className={styles.infoCard}>
          <span>Perfil</span>
          <strong>{[vino.uva, vino.anada, vino.region].filter(Boolean).join(' · ') || 'Seleccion de tienda'}</strong>
          {vino.pais && <p>{vino.pais}</p>}
        </article>
      </section>

      {motivo && (
        <section className={styles.section}>
          <h2>Por que encaja</h2>
          <p>{motivo.slice(0, 320)}</p>
        </section>
      )}

      {(ficha?.notas || vino.descripcion || vino.notas_cata) && (
        <section className={styles.section}>
          <h2>Notas para decidir</h2>
          <p>{ficha?.notas || vino.descripcion || vino.notas_cata}</p>
        </section>
      )}

      {ficha?.maridajes?.length > 0 && (
        <section className={styles.section}>
          <h2>Va bien con</h2>
          <div className={styles.tags}>
            {ficha.maridajes.slice(0, 4).map((m, i) => <span key={i}>{m}</span>)}
          </div>
        </section>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={compartir}>{copiado ? 'Enlace copiado' : 'Compartir o guardar'}</button>
        <a href={`/kiosko/${slug}`} className={styles.secondaryBtn}>Abrir kiosko</a>
      </div>
    </main>
  )
}
