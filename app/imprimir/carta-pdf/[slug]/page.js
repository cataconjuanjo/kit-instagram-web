'use client'

/**
 * /imprimir/carta-pdf/[slug]
 *
 * Ruta de impresión standalone (sin shell admin).
 *
 * - Usa la MISMA API pública que la carta QR (/api/public/restaurante/[slug]?carta=1).
 *   No requiere auth: el gate es el mismo que la carta pública (`carta_publica_activa`).
 * - Auto-print al cargar con `?print=1`.
 * - Diseñada para abrirse en una pestaña nueva desde /admin/carta-pdf/[slug].
 *
 * Decisión de acceso: la info impresa es la misma que ya se expone por QR;
 * no incluye ningún dato privado (coste, margen, proveedor). El bloqueo
 * por `carta_publica_activa` cubre el caso "no publicada todavía".
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { CartaImprimible } from '../../../components/cartaImprimible/CartaImprimible'
import { classNameTodasLasVariables } from '../../../components/cartaImprimible/fonts.js'
import {
  agruparVinosPorSeccion,
  colorTextoSegunFondo,
  normalizarOpcionesCartaPdf,
} from '../../../lib/cartaPdfUtils'
import '../../../components/cartaImprimible/carta-imprimible.css'
import './imprimir-shell.css'

// Todas las clases .variable de las 24 fuentes de next/font/google se
// aplican al <main>. Así cualquier --cpdf-f-<id> que el componente use
// (seleccionada por opciones.fuente_titulo / fuente_cuerpo) está
// disponible. Sólo las 2 familias elegidas por el restaurante se embeben
// en el PDF resultante (Chromium subsetea).
const CLASS_FUENTES = classNameTodasLasVariables()

const DEFAULTS = {
  color_fondo: '#1a1a2e',
  color_acento: '#c9a96e',
  carta_descripcion: '',
  carta_pie_texto: '',
  carta_mostrar_copa: false,
  carta_incluir_bodega_anada: false,
}

export default function ImprimirCartaPdfPage() {
  const { slug } = useParams()
  const searchParams = useSearchParams()
  const autoPrint = searchParams.get('print') === '1'

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [datos, setDatos] = useState(null)
  const yaAutoImprimio = useRef(false)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        // `_=<timestamp>` rompe cualquier capa intermedia (CDN, proxy, SW)
        // que pudiera servir una copia cacheada. Combinado con
        // `cache: 'no-store'` y `Cache-Control: no-store` en la API, garantiza
        // que el PDF siempre refleje la última configuración guardada.
        const bust = `_=${Date.now()}`
        const resp = await fetch(
          `/api/public/restaurante/${encodeURIComponent(slug)}?carta=1&${bust}`,
          { cache: 'no-store' }
        )
        if (!resp.ok) {
          if (resp.status === 404) throw new Error('Carta no publicada o restaurante no encontrado.')
          throw new Error('No se pudo cargar la carta.')
        }
        const json = await resp.json()
        if (cancelado) return
        if (!json?.restaurante) throw new Error('Respuesta sin restaurante.')
        setDatos(json)
      } catch (err) {
        if (!cancelado) setError(err?.message || 'Error cargando datos.')
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [slug])

  // Esperar a que las fuentes estén cargadas + un pequeño delay para imágenes.
  useEffect(() => {
    if (!autoPrint || cargando || error || yaAutoImprimio.current) return
    yaAutoImprimio.current = true
    let cancelado = false
    async function imprimir() {
      try {
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready
        }
      } catch {}
      if (cancelado) return
      setTimeout(() => { if (!cancelado) window.print() }, 400)
    }
    imprimir()
    return () => { cancelado = true }
  }, [autoPrint, cargando, error])

  const config = useMemo(() => {
    const rest = datos?.restaurante
    const color_fondo = rest?.color_fondo || DEFAULTS.color_fondo
    const color_acento = rest?.color_acento || DEFAULTS.color_acento
    // v2: `opciones` normalizado desde carta_pdf_opciones. Compat v1:
    // si carta_mostrar_copa=true y no hay copa_modo en opciones, se
    // infiere copa_modo='junto'.
    const opciones = normalizarOpcionesCartaPdf(rest?.carta_pdf_opciones)
    if (rest?.carta_mostrar_copa === true && opciones.copa_modo === 'no') {
      opciones.copa_modo = 'junto'
    }
    return {
      color_fondo,
      color_acento,
      color_texto: colorTextoSegunFondo(color_fondo),
      carta_descripcion: rest?.carta_descripcion ?? DEFAULTS.carta_descripcion,
      carta_pie_texto: rest?.carta_pie_texto ?? DEFAULTS.carta_pie_texto,
      carta_incluir_bodega_anada: rest?.carta_incluir_bodega_anada === true,
      carta_publica_activa: rest?.carta_publica_activa !== false,
      opciones,
    }
  }, [datos])

  /*
   * Inyectar las variables de color en <html> (document.documentElement).
   * Antes vivían solo en .cpdf-sheet con style inline y el <html>/<body>
   * caían a su fallback hardcoded #1a1a2e → banda oscura al final de la
   * última página cuando el fondo real es claro. Al ponerlas en <html>,
   * body y cualquier contenedor intermedio heredan el color correcto.
   * El cleanup borra las propiedades al desmontar para no contaminar
   * otras rutas de la SPA.
   */
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--cpdf-bg', config.color_fondo)
    root.style.setProperty('--cpdf-fg', config.color_texto)
    root.style.setProperty('--cpdf-accent', config.color_acento)
    return () => {
      root.style.removeProperty('--cpdf-bg')
      root.style.removeProperty('--cpdf-fg')
      root.style.removeProperty('--cpdf-accent')
    }
  }, [config.color_fondo, config.color_texto, config.color_acento])

  const { secciones } = useMemo(
    () => agruparVinosPorSeccion(datos?.vinos || []),
    [datos]
  )

  const bodyClass = `cpdf-print-body ${CLASS_FUENTES}`
  const styleRoot = { '--cpdf-bg': config.color_fondo }

  if (cargando) {
    return <main className={bodyClass} style={styleRoot}><p className="cpdf-print-msg">Cargando…</p></main>
  }
  if (error) {
    return (
      <main className={bodyClass} style={styleRoot}>
        <p className="cpdf-print-msg cpdf-print-msg--error">{error}</p>
      </main>
    )
  }

  return (
    <main className={bodyClass} style={styleRoot}>
      <CartaImprimible
        restaurante={datos.restaurante}
        secciones={secciones}
        config={config}
      />
    </main>
  )
}
