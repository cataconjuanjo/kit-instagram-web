'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import styles from './movil.module.css'

function formatPrecio(n) {
  if (!n && n !== 0) return ''
  return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })
}

function precioActual(vino) {
  if (vino.precio_oferta && Number(vino.precio_oferta) > 0) return Number(vino.precio_oferta)
  return Number(vino.precio_pvp) || 0
}

const TIPO_EMOJI = {
  tinto: '🍷', blanco: '🥂', rosado: '🌸', espumoso: '🍾',
  generoso: '🫙', dulce: '🍯', naranja: '🍊', sin_alcohol: '🧃',
}

function MovilContent() {
  const { slug } = useParams()
  const searchParams = useSearchParams()
  const [data, setData] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [errorDetail, setErrorDetail] = useState('')

  useEffect(() => {
    if (!slug) return

    const ids = searchParams?.get('ids') || ''
    const from = searchParams?.get('from') || 'selection'
    const lang = searchParams?.get('lang') || 'es'

    if (!ids) {
      setErrorDetail('Sin IDs en la URL')
      setEstado('error')
      return
    }

    const url = `/api/kiosko/${slug}/movil?ids=${encodeURIComponent(ids)}`

    fetch(url)
      .then(async r => {
        if (r.ok) return r.json()
        const body = await r.json().catch(() => ({}))
        throw new Error(`HTTP ${r.status}: ${body.error || r.statusText}`)
      })
      .then(d => { setData(d); setEstado('ok') })
      .catch(err => {
        setErrorDetail(err.message || String(err))
        setEstado('error')
      })

    // Registrar apertura para analítica (fire-and-forget)
    fetch(`/api/kiosko/${slug}/movil`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.split(','), source: `qr_${from}`, lang }),
    }).catch(() => {})
  }, [slug, searchParams])

  if (estado === 'cargando') {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <span>Cargando tu selección…</span>
        </div>
      </div>
    )
  }

  if (estado === 'error' || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <h2>Selección no disponible</h2>
          <p>Es posible que el QR haya caducado o los vinos ya no estén disponibles.</p>
          {errorDetail && (
            <p style={{ fontSize: '.72rem', color: '#b0a496', marginTop: '.5rem', wordBreak: 'break-all' }}>
              {errorDetail}
            </p>
          )}
          <Link href={slug ? `/kiosko/${slug}` : '/'} className={styles.back}>Volver al kiosko</Link>
        </div>
      </div>
    )
  }

  const { tienda, vinos } = data
  const total = vinos.reduce((sum, v) => sum + precioActual(v), 0)
  const acento = tienda.color_acento || '#c9a96e'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {tienda.logo_url
          ? <img src={tienda.logo_url} alt={tienda.nombre} className={styles.logo} />
          : <div className={styles.logoPlaceholder} style={{ background: tienda.color_primario || '#171416' }} />
        }
        <div className={styles.headerText}>
          <p className={styles.headerName}>{tienda.nombre}</p>
          <p className={styles.headerSub}>Tu selección de vinos</p>
        </div>
      </header>

      <div className={styles.body}>
        <p className={styles.heading}>
          {vinos.length} {vinos.length === 1 ? 'vino seleccionado' : 'vinos guardados'}
        </p>

        <div className={styles.wineList}>
          {vinos.map(vino => (
            <div key={vino.id} className={styles.wineCard}>
              {vino.foto_url
                ? <img src={vino.foto_url} alt={vino.nombre} className={styles.wineFoto} />
                : <div className={styles.wineFotoEmpty}>{TIPO_EMOJI[vino.tipo] || '🍷'}</div>
              }
              <div className={styles.wineInfo}>
                <p className={styles.wineName}>{vino.nombre}</p>
                {vino.bodega && <p className={styles.wineBodega}>{vino.bodega}</p>}
                {vino.tipo && <p className={styles.wineTipo}>{vino.tipo}</p>}
                {vino.ubicacion_estanteria && (
                  <p className={styles.wineUbicacion} style={{ color: acento }}>
                    📍 {vino.ubicacion_estanteria}
                  </p>
                )}
              </div>
              {precioActual(vino) > 0 && (
                <span className={styles.winePrecio}>{formatPrecio(precioActual(vino))}</span>
              )}
            </div>
          ))}
        </div>

        {total > 0 && (
          <div className={styles.total} style={{ background: tienda.color_primario || '#171416' }}>
            <span className={styles.totalLabel}>Total orientativo</span>
            <span className={styles.totalAmount}>{formatPrecio(total)}</span>
          </div>
        )}

        <Link href={`/kiosko/${slug}`} className={styles.back}>
          ← Seguir explorando vinos
        </Link>
      </div>
    </div>
  )
}

export default function MovilPage() {
  return (
    <Suspense fallback={
      <div className={styles.page}>
        <div className={styles.loading}><span>Cargando…</span></div>
      </div>
    }>
      <MovilContent />
    </Suspense>
  )
}
