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
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'
import { CartaImprimible } from '../../../components/cartaImprimible/CartaImprimible'
import {
  agruparVinosPorSeccion,
  colorTextoSegunFondo,
} from '../../../lib/cartaPdfUtils'
import '../../../components/cartaImprimible/carta-imprimible.css'
import './imprimir-shell.css'

const serifFont = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  variable: '--cpdf-font-serif',
  weight: ['400', '600', '700'],
})
const sansFont = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--cpdf-font-sans',
  weight: ['400', '600', '700'],
})
const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--cpdf-font-mono',
  weight: ['400', '700'],
})

const STACKS = {
  serif: "var(--cpdf-font-serif), 'Georgia', serif",
  sans:  "var(--cpdf-font-sans), system-ui, -apple-system, sans-serif",
  mono:  "var(--cpdf-font-mono), 'Courier New', monospace",
}

function mapearTipografia(valor) {
  const v = String(valor || '').toLowerCase()
  if (v === 'sans' || v === 'condensed') return 'sans'
  if (v === 'mono') return 'mono'
  return 'serif'
}

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
        const resp = await fetch(`/api/public/restaurante/${encodeURIComponent(slug)}?carta=1`, {
          cache: 'no-store',
        })
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
    return {
      color_fondo,
      color_acento,
      color_texto: colorTextoSegunFondo(color_fondo),
      font_stack: STACKS[mapearTipografia(rest?.tipografia)],
      carta_descripcion: rest?.carta_descripcion ?? DEFAULTS.carta_descripcion,
      carta_pie_texto: rest?.carta_pie_texto ?? DEFAULTS.carta_pie_texto,
      carta_mostrar_copa: rest?.carta_mostrar_copa === true,
      carta_incluir_bodega_anada: rest?.carta_incluir_bodega_anada === true,
    }
  }, [datos])

  const { secciones } = useMemo(
    () => agruparVinosPorSeccion(datos?.vinos || []),
    [datos]
  )

  const bodyClass = `cpdf-print-body ${serifFont.variable} ${sansFont.variable} ${monoFont.variable}`
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
