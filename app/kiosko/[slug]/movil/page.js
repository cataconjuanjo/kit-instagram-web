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

const TIPO_LABEL = {
  tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso',
  generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol',
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

    fetch(`/api/kiosko/${slug}/movil?ids=${encodeURIComponent(ids)}`)
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

    fetch(`/api/kiosko/${slug}/movil`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.split(','), source: `qr_${from}`, lang }),
    }).catch(() => {})
  }, [slug, searchParams])

  if (estado === 'cargando') {
    return (
      <div className={styles.page}>
        <div className={styles.loading}><span>Cargando tu lista…</span></div>
      </div>
    )
  }

  if (estado === 'error' || !data) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <h2>Lista no disponible</h2>
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
  const tieneUbicaciones = vinos.some(v => v.ubicacion_estanteria)
  const total = vinos.reduce((sum, v) => sum + precioActual(v), 0)
  const acento = tienda.color_acento || '#c9a96e'
  const primario = tienda.color_primario || '#171416'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {tienda.logo_url
          ? <img src={tienda.logo_url} alt={tienda.nombre} className={styles.logo} />
          : <div className={styles.logoPlaceholder} style={{ background: primario }} />
        }
        <div className={styles.headerText}>
          <p className={styles.headerName}>{tienda.nombre}</p>
          <p className={styles.headerSub}>Tu lista de vinos</p>
        </div>
      </header>

      <div className={styles.body}>

        <div className={styles.purposeBanner}>
          <span className={styles.purposeIcon}>💡</span>
          <p className={styles.purposeText}>
            {tieneUbicaciones
              ? 'Muestra esta lista en el mostrador o busca los vinos directamente en las estanterías usando las ubicaciones.'
              : 'Muestra esta lista en el mostrador para que el equipo te ayude a encontrar los vinos que has elegido.'}
          </p>
        </div>

        <p className={styles.heading}>
          {vinos.length === 1 ? '1 vino en tu lista' : `${vinos.length} vinos en tu lista`}
        </p>

        <div className={styles.wineList}>
          {vinos.map((vino, i) => (
            <div key={vino.id} className={styles.wineCard}>
              <div className={styles.wineNumber} style={{ background: primario }}>{i + 1}</div>

              <div className={styles.wineMain}>
                <div className={styles.wineTop}>
                  {vino.foto_url
                    ? <img src={vino.foto_url} alt={vino.nombre} className={styles.wineFoto} />
                    : <div className={styles.wineFotoEmpty}>{TIPO_EMOJI[vino.tipo] || '🍷'}</div>
                  }
                  <div className={styles.wineInfo}>
                    <p className={styles.wineName}>{vino.nombre}</p>
                    {vino.bodega && <p className={styles.wineBodega}>{vino.bodega}</p>}
                    <div className={styles.wineMeta}>
                      {vino.tipo && (
                        <span className={styles.wineTipoBadge}>
                          {TIPO_EMOJI[vino.tipo] || '🍷'} {TIPO_LABEL[vino.tipo] || vino.tipo}
                        </span>
                      )}
                      {vino.anada && <span className={styles.wineAnadaBadge}>{vino.anada}</span>}
                    </div>
                    {precioActual(vino) > 0 && (
                      <p className={styles.winePrecio}>{formatPrecio(precioActual(vino))}</p>
                    )}
                  </div>
                </div>

                {vino.ubicacion_estanteria && (
                  <div className={styles.ubicacionRow} style={{ borderColor: acento }}>
                    <span className={styles.ubicacionIcon}>📍</span>
                    <div>
                      <span className={styles.ubicacionLabel}>Encuéntralo en</span>
                      <span className={styles.ubicacionValor} style={{ color: acento }}>
                        {vino.ubicacion_estanteria}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {total > 0 && (
          <div className={styles.resumen}>
            <span className={styles.resumenLabel}>Precio estimado</span>
            <span className={styles.resumenAmount}>{formatPrecio(total)}</span>
          </div>
        )}

        <div className={styles.disclaimer}>
          Esta lista es orientativa. Los precios finales y disponibilidad los confirma el equipo de la tienda.
        </div>

        <Link href={`/kiosko/${slug}`} className={styles.back} style={{ borderColor: acento, color: acento }}>
          ← Volver al kiosko
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
