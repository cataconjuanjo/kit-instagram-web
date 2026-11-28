'use client'

/**
 * /admin/carta-pdf/[slug]
 *
 * Panel de configuración de la carta PDF imprimible (dentro del shell admin).
 *
 * - Preview en pantalla usando el mismo componente CartaImprimible que
 *   renderiza la ruta pública /imprimir/carta-pdf/[slug].
 * - Controles para ajustar branding y toggles.
 * - "Descargar PDF" abre /imprimir/carta-pdf/[slug]?print=1 en pestaña
 *   nueva. Se imprime desde ALLÍ, NO desde esta ruta, porque el layout
 *   admin (sidebar fixed, main con min-height:100vh, overflow:hidden en
 *   varios ancestros) producía un PDF con una hoja en blanco al imprimir
 *   desde Chrome "Guardar como PDF" (bug reportado y reproducido).
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'
import { supabase } from '../../../supabase'
import { CartaImprimible } from '../../../components/cartaImprimible/CartaImprimible'
import {
  agruparVinosPorSeccion,
  colorTextoSegunFondo,
  ratioContraste,
} from '../../../lib/cartaPdfUtils'
import '../../../components/cartaImprimible/carta-imprimible.css'
import './carta-pdf.css'

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

const TIPOGRAFIAS = [
  { value: 'serif', label: 'Serif (EB Garamond)', stack: "var(--cpdf-font-serif), 'Georgia', serif" },
  { value: 'sans',  label: 'Sans (Inter)',        stack: "var(--cpdf-font-sans), system-ui, -apple-system, sans-serif" },
  { value: 'mono',  label: 'Monoespaciada (JetBrains Mono)', stack: "var(--cpdf-font-mono), 'Courier New', monospace" },
]

function mapearTipografia(valor) {
  const v = String(valor || '').toLowerCase()
  if (v === 'sans' || v === 'condensed') return 'sans'
  if (v === 'mono') return 'mono'
  return 'serif'
}

function cpdfShellClassName() {
  return `cpdf-shell ${serifFont.variable} ${sansFont.variable} ${monoFont.variable}`
}

const DEFAULTS = {
  color_fondo: '#1a1a2e',
  color_acento: '#c9a96e',
  tipografia: 'serif',
  logo_url: '',
  carta_descripcion: '',
  carta_pie_texto: 'IVA incluido. Consulte alérgenos en sala.',
  carta_mostrar_copa: false,
  carta_incluir_bodega_anada: false,
}

export default function CartaPdfPage() {
  const { slug } = useParams()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({ kind: '', text: '' })
  const [guardando, setGuardando] = useState(false)
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [form, setForm] = useState(DEFAULTS)

  // ── Carga inicial ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        const columnasBase = [
          'id', 'slug', 'nombre', 'email',
          'color_fondo', 'color_acento', 'color_primario', 'tipografia',
          'logo_url', 'carta_pie_texto',
        ]
        const columnasNuevas = [
          'carta_descripcion', 'carta_mostrar_copa', 'carta_incluir_bodega_anada',
        ]
        let seleccion = [...columnasBase, ...columnasNuevas].join(', ')
        let { data: rest, error: errRest } = await supabase
          .from('restaurantes').select(seleccion).eq('slug', slug).maybeSingle()
        if (errRest && errRest.code === '42703') {
          seleccion = columnasBase.join(', ')
          const retry = await supabase
            .from('restaurantes').select(seleccion).eq('slug', slug).maybeSingle()
          rest = retry.data
          errRest = retry.error
        }
        if (errRest) throw errRest
        if (!rest) throw new Error('Restaurante no encontrado.')

        const { data: vinosData, error: errVinos } = await supabase
          .from('vinos')
          .select('id, nombre, bodega, tipo, region, uva, anada, precio_botella, precio_copa, activo')
          .eq('restaurante_id', rest.id)
          .eq('activo', true)
        if (errVinos) throw errVinos

        if (cancelado) return
        setRestaurante(rest)
        setVinos(vinosData || [])
        setForm({
          color_fondo: rest.color_fondo || DEFAULTS.color_fondo,
          color_acento: rest.color_acento || DEFAULTS.color_acento,
          tipografia: mapearTipografia(rest.tipografia || DEFAULTS.tipografia),
          logo_url: rest.logo_url || '',
          carta_descripcion: rest.carta_descripcion ?? '',
          carta_pie_texto: rest.carta_pie_texto ?? DEFAULTS.carta_pie_texto,
          carta_mostrar_copa: rest.carta_mostrar_copa === true,
          carta_incluir_bodega_anada: rest.carta_incluir_bodega_anada === true,
        })
      } catch (err) {
        if (!cancelado) setError(err?.message || 'No se pudo cargar la carta.')
      } finally {
        if (!cancelado) setCargando(false)
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [slug])

  // ── Derivados ────────────────────────────────────────────────────────
  const { secciones, total, omitidos } = useMemo(
    () => agruparVinosPorSeccion(vinos),
    [vinos]
  )

  const colorTexto = useMemo(() => colorTextoSegunFondo(form.color_fondo), [form.color_fondo])
  const contrasteOk = useMemo(() => {
    const r = ratioContraste(form.color_fondo, colorTexto)
    return r === null || r >= 4.5
  }, [form.color_fondo, colorTexto])

  const fontStack = useMemo(() => {
    const t = TIPOGRAFIAS.find(x => x.value === form.tipografia)
    return t?.stack || TIPOGRAFIAS[0].stack
  }, [form.tipografia])

  const configPreview = useMemo(() => ({
    color_fondo: form.color_fondo,
    color_acento: form.color_acento,
    color_texto: colorTexto,
    font_stack: fontStack,
    carta_descripcion: form.carta_descripcion,
    carta_pie_texto: form.carta_pie_texto,
    carta_mostrar_copa: form.carta_mostrar_copa,
    carta_incluir_bodega_anada: form.carta_incluir_bodega_anada,
  }), [form, colorTexto, fontStack])

  /*
   * Inyectar las variables de color en <html>. En la preview admin el
   * efecto visible es el mismo que en /imprimir: evita que el fondo
   * del shell admin (gris #e9eaec) "parpadee" al cambiar colores desde
   * el panel. El cleanup restaura el shell admin neutro al salir.
   */
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--cpdf-bg', form.color_fondo)
    root.style.setProperty('--cpdf-fg', colorTexto)
    root.style.setProperty('--cpdf-accent', form.color_acento)
    return () => {
      root.style.removeProperty('--cpdf-bg')
      root.style.removeProperty('--cpdf-fg')
      root.style.removeProperty('--cpdf-accent')
    }
  }, [form.color_fondo, form.color_acento, colorTexto])

  // ── Mutaciones ───────────────────────────────────────────────────────
  function set(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function guardar() {
    if (!restaurante?.id) return
    setGuardando(true)
    setStatus({ kind: '', text: '' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Debes iniciar sesión para guardar.')
      const resp = await fetch('/api/admin/carta-pdf-config', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          color_fondo: form.color_fondo,
          color_acento: form.color_acento,
          tipografia: form.tipografia,
          logo_url: form.logo_url || null,
          carta_descripcion: form.carta_descripcion,
          carta_mostrar_copa: form.carta_mostrar_copa,
          carta_incluir_bodega_anada: form.carta_incluir_bodega_anada,
          carta_pie_texto: form.carta_pie_texto,
        }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || 'No se pudo guardar.')
      setStatus({
        kind: 'ok',
        text: json?.aviso || 'Cambios guardados.',
      })
    } catch (err) {
      setStatus({ kind: 'error', text: err?.message || 'Error al guardar.' })
    } finally {
      setGuardando(false)
      setTimeout(() => setStatus({ kind: '', text: '' }), 4000)
    }
  }

  function abrirImpresion() {
    // Abre la ruta standalone en pestaña nueva con auto-print. La
    // impresión NO se dispara desde /admin/ porque el layout admin
    // interfiere con @media print (bug "hoja en blanco" reportado).
    const url = `/imprimir/carta-pdf/${encodeURIComponent(slug)}?print=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // ── Render ──────────────────────────────────────────────────────────
  if (cargando) {
    return (
      <main className={cpdfShellClassName()} data-cpdf-hide-on-print>
        <aside className="cpdf-shell__aside"><p>Cargando…</p></aside>
      </main>
    )
  }
  if (error) {
    return (
      <main className={cpdfShellClassName()} data-cpdf-hide-on-print>
        <aside className="cpdf-shell__aside">
          <h2>No se pudo cargar</h2>
          <p className="cpdf-sub">{error}</p>
        </aside>
      </main>
    )
  }

  return (
    <main className={cpdfShellClassName()} data-cpdf-hide-on-print>
      <aside className="cpdf-shell__aside no-print">
        <h2>Carta imprimible</h2>
        <p className="cpdf-sub">
          Ajusta la identidad y descarga un PDF A4 listo para imprenta.
          {' '}
          <strong>{total}</strong> vinos entran en la carta.
          {omitidos.length > 0 && (
            <>
              {' '}<span className="cpdf-sub-warn">
                {omitidos.length} sin precio no se imprimen.
              </span>
            </>
          )}
        </p>

        <div className="cpdf-field cpdf-field--row">
          <input id="cpdf-fondo" type="color" value={form.color_fondo}
            onChange={e => set('color_fondo', e.target.value)} />
          <label htmlFor="cpdf-fondo">Color de fondo</label>
        </div>

        <div className="cpdf-field cpdf-field--row">
          <input id="cpdf-acento" type="color" value={form.color_acento}
            onChange={e => set('color_acento', e.target.value)} />
          <label htmlFor="cpdf-acento">Color de acento (cabeceras)</label>
        </div>

        {!contrasteOk && (
          <div className="cpdf-contrast-warn">
            El contraste del texto sobre el fondo no alcanza el mínimo WCAG
            AA (4.5:1). Prueba un fondo más oscuro o claro.
          </div>
        )}

        <div className="cpdf-field">
          <label htmlFor="cpdf-font">Tipografía</label>
          <select id="cpdf-font" value={form.tipografia}
            onChange={e => set('tipografia', e.target.value)}>
            {TIPOGRAFIAS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="cpdf-field">
          <label htmlFor="cpdf-logo">URL del logo</label>
          <input id="cpdf-logo" type="url" value={form.logo_url}
            placeholder="https://… o /ruta/local"
            onChange={e => set('logo_url', e.target.value)} />
        </div>

        <div className="cpdf-field">
          <label htmlFor="cpdf-desc">Texto de presentación (opcional)</label>
          <textarea id="cpdf-desc" value={form.carta_descripcion} maxLength={600}
            placeholder="Una selección pensada para cenas relajadas y buena conversación…"
            onChange={e => set('carta_descripcion', e.target.value)} />
        </div>

        <label className="cpdf-field--check">
          <input type="checkbox" checked={form.carta_mostrar_copa}
            onChange={e => set('carta_mostrar_copa', e.target.checked)} />
          Mostrar precio por copa
        </label>

        <label className="cpdf-field--check">
          <input type="checkbox" checked={form.carta_incluir_bodega_anada}
            onChange={e => set('carta_incluir_bodega_anada', e.target.checked)} />
          Incluir bodega y añada en la 2ª línea
        </label>

        <div className="cpdf-field">
          <label htmlFor="cpdf-pie">Pie de página (opcional)</label>
          <input id="cpdf-pie" type="text" value={form.carta_pie_texto} maxLength={400}
            onChange={e => set('carta_pie_texto', e.target.value)} />
        </div>

        <div className="cpdf-actions">
          <button type="button" className="cpdf-btn cpdf-btn--ghost"
            onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" className="cpdf-btn cpdf-btn--primary"
            onClick={abrirImpresion}>
            Descargar PDF
          </button>
          <p className="cpdf-sub" style={{ marginTop: 4, fontSize: 11 }}>
            Se abre una pestaña nueva con la hoja A4 y Chrome mostrará el
            diálogo de impresión. Elige “Guardar como PDF”.
          </p>
        </div>
      </aside>

      <div className="cpdf-shell__main">
        <CartaImprimible
          restaurante={restaurante}
          secciones={secciones}
          config={configPreview}
        />
      </div>

      {status.text && (
        <div className={`cpdf-status cpdf-status--${status.kind || 'ok'}`}>
          {status.text}
        </div>
      )}
    </main>
  )
}
