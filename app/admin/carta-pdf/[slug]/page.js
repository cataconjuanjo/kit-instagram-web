'use client'

/**
 * /admin/carta-pdf/[slug]
 *
 * Carta imprimible A4 (feature "Carta Viva PDF").
 *
 * - Vista previa en pantalla con la misma plantilla que se imprime.
 * - Controles para ajustar branding (color fondo, color acento, tipografía,
 *   logo, texto de presentación, pie, mostrar/ocultar copa).
 * - "Descargar PDF" → window.print(): el motor del navegador genera un PDF
 *   vector con fuentes embebidas; no se añade dependencia de servidor.
 *
 * Autorización: cliente autenticado dueño del restaurante o admin global.
 * Datos: lectura directa vía supabase client (RLS cubre). Guardado vía
 * /api/admin/carta-pdf-config (bearer token).
 */

import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { EB_Garamond, Inter, JetBrains_Mono } from 'next/font/google'
import { supabase } from '../../../supabase'
import {
  formatearPrecioPdf,
  agruparVinosPorSeccion,
  lineaOrigenVino,
  colorTextoSegunFondo,
  ratioContraste,
} from '../../../lib/cartaPdfUtils'
import './carta-pdf.css'

/*
 * Fuentes autoalojadas por next/font. Next descarga los .woff2 en build y los
 * sirve desde /_next/static/media/* sin ningún runtime fetch a Google. El
 * navegador las embebe automáticamente cuando el usuario hace "Guardar como
 * PDF" — verificable con pdfjs/pdffonts sobre el PDF resultante.
 */
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

// Mapea valores antiguos de DB a los tres grupos autoalojados.
function mapearTipografia(valor) {
  const v = String(valor || '').toLowerCase()
  if (v === 'sans' || v === 'condensed') return 'sans'
  if (v === 'mono') return 'mono'
  return 'serif' // serif | garamond | display | default
}

// Concatena las clases .variable de las 3 fuentes al shell para que las
// CSS variables --cpdf-font-* queden disponibles en todo el árbol.
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
  // Default alineado con la migración `add_carta_pdf`: NO mostrar copa si
  // el restaurante no lo activa explícitamente.
  carta_mostrar_copa: false,
}

export default function CartaPdfPage() {
  const { slug } = useParams()
  const searchParams = useSearchParams()
  const autoPrint = searchParams.get('print') === '1'

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({ kind: '', text: '' })
  const [guardando, setGuardando] = useState(false)
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [form, setForm] = useState(DEFAULTS)
  const yaAutoImprimio = useRef(false)

  // ── Carga inicial ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        // Intento 1: leer con columnas nuevas. Si falla 42703 degrada.
        const columnasBase = [
          'id', 'slug', 'nombre', 'email',
          'color_fondo', 'color_acento', 'color_primario', 'tipografia',
          'logo_url', 'carta_pie_texto',
        ]
        const columnasNuevas = ['carta_descripcion', 'carta_mostrar_copa']
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
          // "mostrar copa" ahora requiere activación explícita: null/undefined
          // o false (default de la migración) → no se imprime.
          carta_mostrar_copa: rest.carta_mostrar_copa === true,
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

  // ── Auto-print cuando se abre con ?print=1 ──────────────────────────
  useEffect(() => {
    if (!autoPrint || cargando || error || yaAutoImprimio.current) return
    yaAutoImprimio.current = true
    // Pequeño delay para que fuentes/imágenes rendericen antes del diálogo.
    const t = setTimeout(() => window.print(), 350)
    return () => clearTimeout(t)
  }, [autoPrint, cargando, error])

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

  // ── Render ──────────────────────────────────────────────────────────
  if (cargando) {
    return <main className={cpdfShellClassName()}><aside className="cpdf-shell__aside"><p>Cargando…</p></aside></main>
  }
  if (error) {
    return (
      <main className={cpdfShellClassName()}>
        <aside className="cpdf-shell__aside">
          <h2>No se pudo cargar</h2>
          <p className="cpdf-sub">{error}</p>
        </aside>
      </main>
    )
  }

  const styleShell = {
    '--cpdf-bg': form.color_fondo,
    '--cpdf-fg': colorTexto,
    '--cpdf-accent': form.color_acento,
    '--cpdf-font': fontStack,
  }

  const mostrarCopa = form.carta_mostrar_copa

  return (
    <main className={cpdfShellClassName()} style={styleShell}>
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
            onClick={() => window.print()}>
            Descargar PDF
          </button>
        </div>
      </aside>

      <div className="cpdf-shell__main">
        <article className="cpdf-sheet" aria-label="Previsualización de la carta imprimible">
          {/*
            Patrón table+thead para repetir cabecera en cada página.
            Chromium `--print-to-pdf` repite <thead> de forma nativa en
            cada page break, a diferencia de CSS `position: running()` que
            no funciona en la versión actual (verificado empíricamente
            con scripts/verify-carta-pdf-header.mjs).
          */}
          <table className="cpdf-page-table">
            <thead>
              <tr>
                <td>
                  <div className="cpdf-sheet__pageheader" aria-hidden="true">
                    <span>{restaurante?.nombre || ''}</span>
                    {form.logo_url ? (
                      <img src={form.logo_url} alt="" />
                    ) : <span aria-hidden="true" />}
                    <span>Carta de vinos</span>
                  </div>
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <section className="cpdf-sheet__hero">
                    {form.logo_url ? (
                      <img className="cpdf-sheet__logo" src={form.logo_url} alt="" />
                    ) : null}
                    <h1 className="cpdf-sheet__nombre">{restaurante?.nombre || ''}</h1>
                    {form.carta_descripcion ? (
                      <p className="cpdf-sheet__descripcion">{form.carta_descripcion}</p>
                    ) : null}
                  </section>

                  <div className="cpdf-sheet__body">
                    {secciones.map(sec => (
                      <Seccion key={sec.tipo} seccion={sec} mostrarCopa={mostrarCopa} />
                    ))}
                  </div>

                  {form.carta_pie_texto ? (
                    <footer className="cpdf-sheet__pie">{form.carta_pie_texto}</footer>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </article>
      </div>

      {status.text && (
        <div className={`cpdf-status cpdf-status--${status.kind || 'ok'}`}>
          {status.text}
        </div>
      )}
    </main>
  )
}

function Seccion({ seccion, mostrarCopa }) {
  return (
    <section className="cpdf-section">
      <header className="cpdf-section__header">
        <span className="cpdf-section__title">{seccion.label}</span>
        <span className="cpdf-section__labels">
          {mostrarCopa && <span>Copa</span>}
          <span>Botella</span>
        </span>
      </header>
      {seccion.vinos.map(vino => (
        <Vino key={vino.id} vino={vino} mostrarCopa={mostrarCopa} />
      ))}
    </section>
  )
}

function Vino({ vino, mostrarCopa }) {
  const precioBotella = formatearPrecioPdf(vino.precio_botella)
  const precioCopa = formatearPrecioPdf(vino.precio_copa)
  const origen = lineaOrigenVino(vino)
  const nombre = (vino.nombre || '').toUpperCase()
  const bodega = vino.bodega ? `${vino.bodega} · ` : ''
  const anada = vino.anada ? ` · ${vino.anada}` : ''

  return (
    <div className="cpdf-vino">
      <div className="cpdf-vino__linea1">
        <span className="cpdf-vino__nombre">{nombre}</span>
        <span className="cpdf-vino__precios">
          {mostrarCopa && (
            // Celda de copa: si no hay precio, dejamos la celda vacía (no "—")
            // para preservar la alineación de la columna BOTELLA.
            <span className="cpdf-vino__precio" aria-hidden={!precioCopa}>
              {precioCopa || ''}
            </span>
          )}
          <span className="cpdf-vino__precio">{precioBotella}</span>
        </span>
      </div>
      {(origen || bodega || anada) && (
        <div className="cpdf-vino__linea2">{bodega}{origen}{anada}</div>
      )}
    </div>
  )
}
