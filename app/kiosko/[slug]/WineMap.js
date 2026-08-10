'use client'
import { useEffect, useRef, useState } from 'react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const TOPO_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
const TOPO_ATTR = '© OpenTopoMap (CC-BY-SA)'

const geoCache = {}

async function geocode(region, pais) {
  const key = `${region}||${pais}`
  if (geoCache[key]) return geoCache[key]

  const q = pais && pais !== 'España' ? `${region}, ${pais}` : `${region}, Spain`
  try {
    const res = await fetch(
      `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'kiosko-vinos/1.0' } }
    )
    const data = await res.json()
    if (data?.[0]) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      geoCache[key] = result
      return result
    }
  } catch {}
  return null
}

function injectLeafletCSS() {
  if (document.querySelector('#leaflet-css')) return
  const link = document.createElement('link')
  link.id = 'leaflet-css'
  link.rel = 'stylesheet'
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  document.head.appendChild(link)
}

export default function WineMap({ region, pais, colorAcento = '#c9a96e' }) {
  const divRef = useRef(null)
  const mapRef = useRef(null)
  const [estado, setEstado] = useState('loading')

  useEffect(() => {
    if (!region) { setEstado('sin-region'); return }

    let cancelled = false

    async function init() {
      injectLeafletCSS()

      const leafletModule = await import('leaflet')
      const L = leafletModule.default ?? leafletModule
      if (cancelled) return

      const coords = await geocode(region, pais)
      if (cancelled) return

      if (!coords) { setEstado('error'); return }

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(divRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
      })
      map.setView([coords.lat, coords.lng], 9)
      L.tileLayer(TOPO_URL, { attribution: TOPO_ATTR, maxZoom: 17 }).addTo(map)
      L.circleMarker([coords.lat, coords.lng], {
        radius: 8,
        color: colorAcento,
        fillColor: colorAcento,
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map)

      mapRef.current = map
      if (!cancelled) setEstado('ok')
    }

    init()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [region, pais])

  if (!region) return null

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <p style={{
        fontSize: '.6rem', fontWeight: 700, letterSpacing: '.12em',
        textTransform: 'uppercase', color: 'rgba(240,237,232,.3)', marginBottom: '.4rem',
      }}>
        Zona de producción
      </p>
      <div style={{
        borderRadius: '10px', overflow: 'hidden',
        border: '1px solid rgba(255,255,255,.08)',
        height: '140px', position: 'relative', background: '#1a1a2e',
      }}>
        {(estado === 'loading') && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,.25)', fontSize: '.78rem',
          }}>
            Cargando mapa…
          </div>
        )}
        {estado === 'error' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,.2)', fontSize: '.78rem',
          }}>
            Mapa no disponible
          </div>
        )}
        <div
          ref={divRef}
          style={{ height: '100%', width: '100%', opacity: estado === 'ok' ? 1 : 0 }}
        />
      </div>
    </div>
  )
}
