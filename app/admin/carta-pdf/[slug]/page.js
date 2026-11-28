'use client'

/**
 * /admin/carta-pdf/[slug] — Panel v2
 *
 * - Preview en vivo con CartaImprimible (mismo componente que
 *   /imprimir/carta-pdf/[slug]).
 * - Controles organizados en paneles plegables (<details>): Identidad,
 *   Tipografía, Logos, Orden y agrupación, Precios y copa, QR, Avanzado.
 * - Guardado en /api/admin/carta-pdf-config: columnas v1 individuales +
 *   carta_pdf_opciones jsonb v2 en un único PATCH.
 * - "Descargar PDF" abre /imprimir/carta-pdf/[slug]?print=1 en pestaña
 *   nueva (ver nota de bug "hoja en blanco" al imprimir desde admin).
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../supabase'
import { CartaImprimible } from '../../../components/cartaImprimible/CartaImprimible'
import {
  CATALOGO_FUENTES, classNameTodasLasVariables,
} from '../../../components/cartaImprimible/fonts.js'
import {
  agruparVinosPorSeccion,
  colorTextoSegunFondo,
  ratioContraste,
  normalizarOpcionesCartaPdf,
  CATALOGO_POSICIONES_LOGO,
  CATALOGO_POSICIONES_QR,
} from '../../../lib/cartaPdfUtils'
import '../../../components/cartaImprimible/carta-imprimible.css'
import './carta-pdf.css'

const CLASS_FUENTES = classNameTodasLasVariables()

function cpdfShellClassName() {
  return `cpdf-shell ${CLASS_FUENTES}`
}

const DEFAULTS = {
  color_fondo: '#1a1a2e',
  color_acento: '#c9a96e',
  logo_url: '',
  carta_descripcion: '',
  carta_pie_texto: '',
  carta_incluir_bodega_anada: false,
}

const FUENTES_POR_GRUPO = [
  { label: 'Serif clásicas',   grupo: 'serif' },
  { label: 'Sans',             grupo: 'sans' },
  { label: 'Mono / máquina',   grupo: 'mono' },
  { label: 'Manuscrita',       grupo: 'manuscrita' },
]

const POSICIONES_LOGO = Array.from(CATALOGO_POSICIONES_LOGO)
const POSICIONES_QR   = Array.from(CATALOGO_POSICIONES_QR)

export default function CartaPdfPage() {
  const { slug } = useParams()

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({ kind: '', text: '' })
  const [guardando, setGuardando] = useState(false)
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [form, setForm] = useState(DEFAULTS)
  const [opciones, setOpciones] = useState(() => normalizarOpcionesCartaPdf({}))

  // ── Carga inicial ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        const columnasBase = [
          'id', 'slug', 'nombre', 'email',
          'color_fondo', 'color_acento', 'color_primario',
          'logo_url', 'carta_pie_texto', 'carta_publica_activa',
        ]
        const columnasV1 = [
          'carta_descripcion', 'carta_mostrar_copa', 'carta_incluir_bodega_anada',
        ]
        const columnasV2 = ['carta_pdf_opciones']
        // Carga escalonada con fallback 42703: v1+v2 → v1 → base.
        let { data: rest, error: errRest } = await supabase
          .from('restaurantes')
          .select([...columnasBase, ...columnasV1, ...columnasV2].join(', '))
          .eq('slug', slug).maybeSingle()
        if (errRest && errRest.code === '42703') {
          const retry = await supabase
            .from('restaurantes')
            .select([...columnasBase, ...columnasV1].join(', '))
            .eq('slug', slug).maybeSingle()
          if (retry.error && retry.error.code === '42703') {
            const retry2 = await supabase
              .from('restaurantes').select(columnasBase.join(', '))
              .eq('slug', slug).maybeSingle()
            rest = retry2.data; errRest = retry2.error
          } else {
            rest = retry.data; errRest = retry.error
          }
        }
        if (errRest) throw errRest
        if (!rest) throw new Error('Restaurante no encontrado.')

        const { data: vinosData, error: errVinos } = await supabase
          .from('vinos')
          .select('id, nombre, bodega, tipo, region, uva, anada, precio_botella, precio_copa, activo')
          .eq('restaurante_id', rest.id).eq('activo', true)
        if (errVinos) throw errVinos

        if (cancelado) return
        setRestaurante(rest)
        setVinos(vinosData || [])
        setForm({
          color_fondo: rest.color_fondo || DEFAULTS.color_fondo,
          color_acento: rest.color_acento || DEFAULTS.color_acento,
          logo_url: rest.logo_url || '',
          carta_descripcion: rest.carta_descripcion ?? '',
          carta_pie_texto: rest.carta_pie_texto ?? DEFAULTS.carta_pie_texto,
          carta_incluir_bodega_anada: rest.carta_incluir_bodega_anada === true,
        })
        // Normaliza opciones v2. Compat: si en v1 estaba carta_mostrar_copa=true
        // y en v2 no se ha tocado copa_modo (sigue en 'no'), deducimos 'junto'.
        const op = normalizarOpcionesCartaPdf(rest.carta_pdf_opciones)
        if (rest.carta_mostrar_copa === true && op.copa_modo === 'no') {
          op.copa_modo = 'junto'
        }
        setOpciones(op)
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
    () => agruparVinosPorSeccion(vinos), [vinos]
  )
  const colorTexto = useMemo(() => colorTextoSegunFondo(form.color_fondo), [form.color_fondo])
  const contrasteOk = useMemo(() => {
    const r = ratioContraste(form.color_fondo, colorTexto)
    return r === null || r >= 4.5
  }, [form.color_fondo, colorTexto])

  const configPreview = useMemo(() => ({
    color_fondo: form.color_fondo,
    color_acento: form.color_acento,
    color_texto: colorTexto,
    carta_descripcion: form.carta_descripcion,
    carta_pie_texto: form.carta_pie_texto,
    carta_incluir_bodega_anada: form.carta_incluir_bodega_anada,
    carta_publica_activa: restaurante?.carta_publica_activa !== false,
    opciones,
  }), [form, colorTexto, opciones, restaurante])

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
  function set(campo, valor) { setForm(prev => ({ ...prev, [campo]: valor })) }
  function setOp(campo, valor) { setOpciones(prev => ({ ...prev, [campo]: valor })) }
  function setOpQr(campo, valor) { setOpciones(prev => ({ ...prev, qr: { ...prev.qr, [campo]: valor } })) }

  function addLogo() {
    if (opciones.logos.length >= 4) return
    setOpciones(prev => ({ ...prev, logos: [...prev.logos, { url: '', posicion: 'cabecera-izq', tamano_mm: 14, opacidad: 100 }] }))
  }
  function removeLogo(i) {
    setOpciones(prev => ({ ...prev, logos: prev.logos.filter((_, idx) => idx !== i) }))
  }
  function moveLogo(i, delta) {
    setOpciones(prev => {
      const next = [...prev.logos]
      const j = i + delta
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...prev, logos: next }
    })
  }
  function setLogo(i, campo, valor) {
    setOpciones(prev => ({
      ...prev,
      logos: prev.logos.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l),
    }))
  }

  async function guardar() {
    if (!restaurante?.id) return
    setGuardando(true); setStatus({ kind: '', text: '' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Debes iniciar sesión para guardar.')
      const resp = await fetch('/api/admin/carta-pdf-config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          color_fondo: form.color_fondo,
          color_acento: form.color_acento,
          logo_url: form.logo_url || null,
          carta_descripcion: form.carta_descripcion,
          carta_incluir_bodega_anada: form.carta_incluir_bodega_anada,
          carta_pie_texto: form.carta_pie_texto,
          // v2 completo en el jsonb
          carta_pdf_opciones: opciones,
        }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || 'No se pudo guardar.')
      setStatus({ kind: 'ok', text: json?.aviso || 'Cambios guardados.' })
    } catch (err) {
      setStatus({ kind: 'error', text: err?.message || 'Error al guardar.' })
    } finally {
      setGuardando(false)
      setTimeout(() => setStatus({ kind: '', text: '' }), 4000)
    }
  }

  function abrirImpresion() {
    const url = `/imprimir/carta-pdf/${encodeURIComponent(slug)}?print=1`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // ── Render ──────────────────────────────────────────────────────────
  if (cargando) {
    return <main className={cpdfShellClassName()} data-cpdf-hide-on-print>
      <aside className="cpdf-shell__aside"><p>Cargando…</p></aside>
    </main>
  }
  if (error) {
    return <main className={cpdfShellClassName()} data-cpdf-hide-on-print>
      <aside className="cpdf-shell__aside">
        <h2>No se pudo cargar</h2>
        <p className="cpdf-sub">{error}</p>
      </aside>
    </main>
  }

  const qrPermitido = restaurante?.carta_publica_activa !== false

  return (
    <main className={cpdfShellClassName()} data-cpdf-hide-on-print>
      <aside className="cpdf-shell__aside no-print">
        <h2>Carta imprimible</h2>
        <p className="cpdf-sub">
          <strong>{total}</strong> vinos entran en la carta.
          {omitidos.length > 0 && (
            <> <span className="cpdf-sub-warn">{omitidos.length} sin precio no se imprimen.</span></>
          )}
        </p>

        <details open className="cpdf-panel">
          <summary>Identidad</summary>
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
              Contraste texto/fondo &lt; WCAG AA (4.5:1). Prueba un fondo más oscuro o claro.
            </div>
          )}
          <div className="cpdf-field">
            <label htmlFor="cpdf-desc">Texto de presentación</label>
            <textarea id="cpdf-desc" value={form.carta_descripcion} maxLength={600}
              onChange={e => set('carta_descripcion', e.target.value)} />
          </div>
          <div className="cpdf-field">
            <label htmlFor="cpdf-pie">Pie de página</label>
            <input id="cpdf-pie" type="text" value={form.carta_pie_texto} maxLength={400}
              onChange={e => set('carta_pie_texto', e.target.value)} />
          </div>
        </details>

        <details className="cpdf-panel">
          <summary>Tipografía</summary>
          <div className="cpdf-field">
            <label htmlFor="cpdf-ft">Fuente de títulos (restaurante y secciones)</label>
            <SelectFuente id="cpdf-ft" valor={opciones.fuente_titulo}
              onChange={v => setOp('fuente_titulo', v)} />
          </div>
          <div className="cpdf-field">
            <label htmlFor="cpdf-fc">Fuente del cuerpo (vinos, precios, intro, pie)</label>
            <SelectFuente id="cpdf-fc" valor={opciones.fuente_cuerpo}
              onChange={v => setOp('fuente_cuerpo', v)} soloCuerpo />
          </div>
        </details>

        <details className="cpdf-panel">
          <summary>Logos ({opciones.logos.length}/4)</summary>
          <p className="cpdf-sub" style={{ fontSize: 11 }}>
            Si está vacío, se usa el logo del restaurante (cabecera izquierda).
          </p>
          {opciones.logos.map((l, i) => (
            <fieldset key={i} className="cpdf-logo-fs">
              <legend>Logo {i + 1}</legend>
              <div className="cpdf-field">
                <label>URL</label>
                <input type="url" value={l.url || ''}
                  placeholder="https://… o /ruta/local"
                  onChange={e => setLogo(i, 'url', e.target.value)} />
              </div>
              <div className="cpdf-field">
                <label>Posición</label>
                <select value={l.posicion}
                  onChange={e => setLogo(i, 'posicion', e.target.value)}>
                  {POSICIONES_LOGO.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="cpdf-field">
                <label>Tamaño: {l.tamano_mm} mm</label>
                <input type="range" min={8} max={60} step={1} value={l.tamano_mm}
                  onChange={e => setLogo(i, 'tamano_mm', Number(e.target.value))} />
              </div>
              {l.posicion === 'marca-agua' && (
                <div className="cpdf-field">
                  <label>Opacidad: {l.opacidad || 8}%</label>
                  <input type="range" min={5} max={20} step={1} value={l.opacidad || 8}
                    onChange={e => setLogo(i, 'opacidad', Number(e.target.value))} />
                </div>
              )}
              <div className="cpdf-logo-actions">
                <button type="button" onClick={() => moveLogo(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" onClick={() => moveLogo(i, +1)} disabled={i === opciones.logos.length - 1}>↓</button>
                <button type="button" onClick={() => removeLogo(i)}>Quitar</button>
              </div>
            </fieldset>
          ))}
          {opciones.logos.length < 4 && (
            <button type="button" className="cpdf-btn cpdf-btn--ghost" onClick={addLogo}>
              Añadir logo
            </button>
          )}
        </details>

        <details className="cpdf-panel">
          <summary>Orden y agrupación</summary>
          <div className="cpdf-field">
            <label htmlFor="cpdf-orden">Orden dentro de cada sección</label>
            <select id="cpdf-orden" value={opciones.orden_vinos}
              onChange={e => {
                const v = e.target.value
                setOpciones(prev => ({
                  ...prev,
                  orden_vinos: v,
                  // Al elegir "region" por primera vez, activamos los
                  // subtítulos (el usuario puede desactivarlos abajo).
                  subtitulos_region: v === 'region' ? true : prev.subtitulos_region,
                }))
              }}>
              <option value="alfabetico">Alfabético (por nombre)</option>
              <option value="region">Por región / DO</option>
              <option value="precio_asc">Por precio ascendente</option>
              <option value="uva">Por uva</option>
              <option value="anada">Por añada (más nuevas primero)</option>
            </select>
          </div>
          {opciones.orden_vinos === 'region' && (
            <>
              <div className="cpdf-field">
                <label htmlFor="cpdf-ordens">Dentro del grupo</label>
                <select id="cpdf-ordens" value={opciones.orden_secundario}
                  onChange={e => setOp('orden_secundario', e.target.value)}>
                  <option value="precio_asc">Precio ascendente</option>
                  <option value="alfabetico">Alfabético</option>
                </select>
              </div>
              <label className="cpdf-field--check">
                <input type="checkbox" checked={opciones.subtitulos_region}
                  onChange={e => setOp('subtitulos_region', e.target.checked)} />
                Mostrar subtítulo de región
              </label>
            </>
          )}
          <label className="cpdf-field--check">
            <input type="checkbox" checked={form.carta_incluir_bodega_anada}
              onChange={e => set('carta_incluir_bodega_anada', e.target.checked)} />
            Incluir bodega y añada en la 2ª línea
          </label>
        </details>

        <details className="cpdf-panel">
          <summary>Precios y copa</summary>
          <div className="cpdf-field">
            <label htmlFor="cpdf-prec">Formato de precio</label>
            <select id="cpdf-prec" value={opciones.precio_formato}
              onChange={e => setOp('precio_formato', e.target.value)}>
              <option value="con_euro">Con € (24 €)</option>
              <option value="sin_euro">Sin € (24)</option>
            </select>
          </div>
          {opciones.precio_formato === 'sin_euro' && (
            <label className="cpdf-field--check">
              <input type="checkbox" checked={opciones.nota_euros}
                onChange={e => setOp('nota_euros', e.target.checked)} />
              Añadir nota “Precios en euros, IVA incluido”
            </label>
          )}
          <div className="cpdf-field">
            <label htmlFor="cpdf-copa">Precio por copa</label>
            <select id="cpdf-copa" value={opciones.copa_modo}
              onChange={e => setOp('copa_modo', e.target.value)}>
              <option value="no">No mostrar</option>
              <option value="junto">Junto al precio de botella</option>
              <option value="seccion">Sección “Por copa” aparte</option>
              <option value="ambos">Ambos (sección + junto)</option>
            </select>
          </div>
          {opciones.copa_modo === 'ambos' && total > 60 && (
            <div className="cpdf-contrast-warn">
              El modo “Ambos” duplica los vinos (sección + junto): con {total} vinos
              la carta puede necesitar 3+ páginas. Considera “Junto” o activar
              densidad “Compacto extra” en Avanzado.
            </div>
          )}
        </details>

        <details className="cpdf-panel">
          <summary>QR a la carta digital</summary>
          {!qrPermitido && (
            <div className="cpdf-contrast-warn">
              El restaurante no tiene carta pública activa: el QR no se mostrará.
            </div>
          )}
          <label className="cpdf-field--check">
            <input type="checkbox" checked={opciones.qr.activo}
              onChange={e => setOpQr('activo', e.target.checked)} />
            Mostrar QR en el PDF
          </label>
          <div className="cpdf-field">
            <label>Posición</label>
            <select value={opciones.qr.posicion}
              onChange={e => setOpQr('posicion', e.target.value)}>
              {POSICIONES_QR.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="cpdf-field">
            <label>Tamaño: {opciones.qr.tamano_mm} mm</label>
            <input type="range" min={10} max={40} step={1} value={opciones.qr.tamano_mm}
              onChange={e => setOpQr('tamano_mm', Number(e.target.value))} />
          </div>
          <div className="cpdf-field">
            <label>Texto bajo el QR</label>
            <input type="text" value={opciones.qr.texto} maxLength={140}
              onChange={e => setOpQr('texto', e.target.value)} />
          </div>
        </details>

        <details className="cpdf-panel">
          <summary>Avanzado</summary>
          <label className="cpdf-field--check">
            <input type="checkbox" checked={opciones.credito}
              onChange={e => setOp('credito', e.target.checked)} />
            Mostrar crédito “Carta Viva × @cataconjuanjo”
          </label>
          <div className="cpdf-field">
            <label>Densidad</label>
            <select value={opciones.densidad_forzada}
              onChange={e => setOp('densidad_forzada', e.target.value)}>
              <option value="auto">Auto (compacto &gt; 60 vinos; extra &gt; 90)</option>
              <option value="normal">Normal</option>
              <option value="compacto">Compacto</option>
              <option value="compacto-extra">Compacto extra (8pt, hero mínimo)</option>
            </select>
          </div>
        </details>

        <div className="cpdf-actions">
          <button type="button" className="cpdf-btn cpdf-btn--ghost"
            onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" className="cpdf-btn cpdf-btn--primary"
            onClick={abrirImpresion}>
            Descargar PDF
          </button>
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

function SelectFuente({ id, valor, onChange, soloCuerpo = false }) {
  return (
    <select id={id} value={valor} onChange={e => onChange(e.target.value)}>
      <option value="actual">Actual (sin cambio)</option>
      {FUENTES_POR_GRUPO.map(g => {
        const items = CATALOGO_FUENTES.filter(f => f.grupo === g.grupo
          && (!soloCuerpo || !f.soloTitulo))
        if (items.length === 0) return null
        return (
          <optgroup key={g.grupo} label={g.label}>
            {items.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
        )
      })}
    </select>
  )
}
