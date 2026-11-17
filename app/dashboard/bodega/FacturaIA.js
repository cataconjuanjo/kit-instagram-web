'use client'

/**
 * FacturaIA — subir foto/PDF de factura → extracción con IA → revisión
 * y confirmación → registro de compra (reutiliza /api/compras y
 * /api/facturas/vincular).
 *
 * Flujo
 *   1. "Subir factura (foto o PDF)" → selector local (capture="environment"
 *      para abrir cámara en móvil cuando se pulse una imagen).
 *   2. POST /api/facturas/extraer (multipart) → recibe { datos, avisos,
 *      archivo, posible_duplicado }.
 *   3. Pantalla de revisión: todos los campos editables, líneas editables
 *      con selector de vino sugerido, preview del archivo a la derecha.
 *   4. "Confirmar y registrar compra" → POST /api/compras (reutiliza el
 *      flujo que crea cabecera + líneas) y luego POST /api/facturas/vincular
 *      para registrar el archivo ya subido como adjunto.
 *   5. "Descartar" → DELETE /api/facturas/extraer?path=… (si falla,
 *      se avisa; el archivo queda huérfano en Storage).
 *
 * Nunca se crea compra sin que el usuario pulse Confirmar.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../../supabase'
import {
  emparejarLineasConVinos,
  preseleccionarProveedor,
  componerNotasFacturaIA,
} from '../../lib/facturaIA'

// pdfjs-dist es pesado (~1 MB). Lo cargamos SOLO cuando el usuario
// abre una vista previa de PDF: next/dynamic con ssr:false lo saca a
// su propio chunk y no se descarga en el bundle inicial del dashboard.
const PdfPreview = dynamic(() => import('./PdfPreview'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 16, fontSize: 12, color: '#8b8278', border: '1px solid #e8e3d8', borderRadius: 4 }}>
      Cargando vista previa…
    </div>
  ),
})

async function apiFetch(path, opts = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  const headers = { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
  // No metemos Content-Type para que fetch lo ponga en multipart.
  if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(path, { ...opts, headers })
}

function eur(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v)) + ' €'
}

// Editor compacto para un campo numérico (importe o %).
function InputNum({ value, onChange, step = '0.01', placeholder = '0' }) {
  return (
    <input
      type="number"
      step={step}
      min="0"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      style={{ width: '100%', padding: '4px 8px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 4 }}
    />
  )
}
function InputTxt({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '4px 8px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 4 }}
    />
  )
}

export default function FacturaIA({ restauranteId, vinosActivos = [], onCompraRegistrada }) {
  const [paso, setPaso] = useState('inicial')  // inicial | leyendo | revisar | confirmando
  const [error, setError] = useState(null)
  const [cabecera, setCabecera] = useState({
    proveedor: '', nif: '', numero_factura: '', fecha: '',
    base_imponible: null, iva_pct: 21, iva_importe: null, total: null,
    notas: '',
  })
  // Proveedor SELECCIONADO del catálogo. El RPC `registrar_compra_con_pmp`
  // acepta cualquier texto, pero la convención del restaurante es usar
  // nombres canónicos del catálogo. Si no hay match, el botón de confirmar
  // queda bloqueado y se muestra un mensaje pidiendo crearlo en el
  // catálogo de proveedores.
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('')
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState([])
  const [prov, setProv] = useState({ origen: null, candidatos: [] })  // info de preselección
  const [lineas, setLineas] = useState([])                 // [{ descripcion, uds, uds_bonificadas, precio_unitario, importe_neto, vino_id }]
  const [avisos, setAvisos] = useState([])
  const [posibleDuplicado, setPosibleDuplicado] = useState(null)
  const [archivo, setArchivo] = useState(null)             // { path, mime_type, tamano_bytes, nombre_archivo }
  const [previewUrl, setPreviewUrl] = useState(null)       // objectURL local (sólo para <img>)
  const [previewFile, setPreviewFile] = useState(null)     // File original (para pdfjs: evita fetch(blob:) que la CSP bloquea)
  const [previewMime, setPreviewMime] = useState(null)
  const fileRef = useRef(null)

  // Carga perezosa de la lista de proveedores del restaurante (misma
  // fuente que usa /dashboard/bodega y /dashboard/vinos:
  // /api/proveedores-visibles, basado en proveedores_vino con
  // visible_restaurantes = true). No se crean proveedores desde aquí.
  useEffect(() => {
    let cancelado = false
    async function cargar() {
      if (!restauranteId) return
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token || ''
        const res = await fetch(
          `/api/proveedores-visibles?restaurante_id=${encodeURIComponent(restauranteId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) return
        const json = await res.json().catch(() => ({}))
        const nombres = Array.isArray(json?.proveedores) ? json.proveedores : []
        if (!cancelado) setProveedoresDisponibles(nombres)
      } catch {
        // Silencioso: si no hay lista, el <select> quedará vacío y el
        // mensaje "no está dado de alta" guiará al usuario.
      }
    }
    cargar()
    return () => { cancelado = true }
  }, [restauranteId])

  // Sugerencias de emparejado (cliente, puras).
  const sugerencias = useMemo(() => {
    if (!lineas.length) return []
    return emparejarLineasConVinos(
      lineas.map(l => ({ descripcion: l.descripcion })),
      vinosActivos,
    )
  }, [lineas, vinosActivos])

  function resetTodo() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPaso('inicial')
    setError(null)
    setCabecera({ proveedor: '', nif: '', numero_factura: '', fecha: '', base_imponible: null, iva_pct: 21, iva_importe: null, total: null, notas: '' })
    setProveedorSeleccionado('')
    setProv({ origen: null, candidatos: [] })
    setLineas([])
    setAvisos([])
    setPosibleDuplicado(null)
    setArchivo(null)
    setPreviewUrl(null)
    setPreviewFile(null)
    setPreviewMime(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onSeleccionarArchivo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)

    // Preview local. Para imágenes usamos un ObjectURL con <img>. Para PDF
    // guardamos el File y pdfjs-dist lo carga por `data: Uint8Array`
    // (hacer fetch(blob:) desde pdf.js lo bloquearía connect-src de la CSP).
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setPreviewFile(file)
    setPreviewMime(file.type || '')

    setPaso('leyendo')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('restaurante_id', restauranteId)
      const res = await apiFetch('/api/facturas/extraer', { method: 'POST', body: form })
      // La cuota diaria de lecturas con IA es compartida con otras funciones
      // (Sumiller, etc.). El servidor devuelve 429 cuando se agota; mostramos
      // el texto literal acordado en lugar del error genérico.
      if (res.status === 429) {
        throw new Error('Has alcanzado el límite diario de lecturas con IA. Inténtalo mañana o registra la factura a mano.')
      }
      const json = await res.json().catch(() => ({ error: 'Respuesta no válida' }))
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)

      const d = json.datos || {}
      setCabecera({
        proveedor: d.proveedor?.nombre ?? '',
        nif: d.proveedor?.nif ?? '',
        numero_factura: d.numero_factura ?? '',
        fecha: d.fecha ?? '',
        base_imponible: d.base_imponible ?? null,
        iva_pct: d.iva_pct ?? 21,
        iva_importe: d.iva_importe ?? null,
        total: d.total ?? null,
        notas: '',
      })
      // Preselección del proveedor del catálogo. Si hay match (por NIF o por
      // nombre normalizado), ya queda elegido; si no, el <select> queda
      // vacío y el botón de Confirmar queda deshabilitado hasta que el
      // usuario elija uno. No se crean proveedores desde aquí.
      const pre = preseleccionarProveedor(d, proveedoresDisponibles)
      setProveedorSeleccionado(pre.nombre || '')
      setProv({ origen: pre.origen, candidatos: pre.candidatos || [] })
      setLineas((d.lineas || []).map(l => ({
        descripcion: l.descripcion ?? '',
        uds: l.uds ?? 1,
        uds_bonificadas: l.uds_bonificadas ?? 0,
        precio_unitario: l.precio_unitario ?? null,
        importe_neto: l.importe_neto ?? null,
        vino_id: '',  // SIN match automático: el usuario selecciona siempre.
      })))
      setAvisos(Array.isArray(json.avisos) ? json.avisos : [])
      setPosibleDuplicado(json.posible_duplicado?.encontrado ? json.posible_duplicado : null)
      setArchivo(json.archivo || null)
      setPaso('revisar')
    } catch (err) {
      setError(err.message || 'No se pudo leer la factura.')
      setPaso('inicial')
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
      setPreviewFile(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function actualizarLinea(idx, campo, valor) {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l))
  }
  function eliminarLinea(idx) {
    setLineas(prev => prev.filter((_, i) => i !== idx))
  }
  function agregarLinea() {
    setLineas(prev => [...prev, { descripcion: '', uds: 1, uds_bonificadas: 0, precio_unitario: null, importe_neto: null, vino_id: '' }])
  }

  // Pide una URL firmada corta (10 min) y abre el adjunto en una pestaña
  // nueva. No usamos el ObjectURL local (`previewUrl`) para evitar que el
  // visor del navegador herede CSP y bloquee el plugin de PDF.
  const [abriendoAdjunto, setAbriendoAdjunto] = useState(false)
  const [errorAdjunto, setErrorAdjunto] = useState(null)
  async function abrirAdjuntoEnPestana() {
    if (!archivo?.path || !restauranteId) return
    setErrorAdjunto(null)
    setAbriendoAdjunto(true)
    try {
      const res = await apiFetch(
        `/api/facturas/signed-url?path=${encodeURIComponent(archivo.path)}&restaurante_id=${encodeURIComponent(restauranteId)}`,
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j?.url) throw new Error(j?.error || `Error ${res.status}`)
      window.open(j.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('[FacturaIA] abrir adjunto:', err?.message || err?.name)
      setErrorAdjunto('No se pudo abrir el archivo. Inténtalo de nuevo en unos segundos.')
    } finally {
      setAbriendoAdjunto(false)
    }
  }

  async function descartar() {
    if (!archivo?.path) { resetTodo(); return }
    try {
      const res = await apiFetch(
        `/api/facturas/extraer?path=${encodeURIComponent(archivo.path)}&restaurante_id=${restauranteId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError('Datos descartados, pero no se pudo borrar el archivo del almacén: ' + (j.error || res.status))
        setPaso('inicial')
        // Dejamos la caja de error visible; el objectURL se limpia.
        if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }
        setPreviewFile(null)
        setArchivo(null); setLineas([]); setAvisos([]); setPosibleDuplicado(null)
        if (fileRef.current) fileRef.current.value = ''
        return
      }
    } catch (err) {
      setError('Error al borrar el archivo: ' + (err.message || ''))
    }
    resetTodo()
  }

  async function confirmar() {
    if (!restauranteId) return
    setError(null)
    setPaso('confirmando')
    try {
      // Validación mínima client-side
      if (!proveedorSeleccionado?.trim()) {
        throw new Error('Este proveedor no está dado de alta. Créalo en el catálogo de proveedores y vuelve a intentarlo.')
      }
      if (!cabecera.fecha) throw new Error('Falta la fecha de la factura.')
      const lineasValidas = lineas.filter(l => l.vino_id && Number(l.uds) > 0 && (l.precio_unitario != null || l.importe_neto != null))
      if (lineasValidas.length === 0) throw new Error('No hay líneas con vino asignado y cantidad > 0.')

      // Construye payload de /api/compras. precio_tarifa se deriva de
      // precio_unitario si está; si no, de importe_neto / uds.
      // origen = 'manual' porque cabecera_compras tiene CHECK
      // (origen IN ('manual','importacion')). La traza de IA se guarda en
      // `notas` con el prefijo canónico.
      const payload = {
        restaurante_id: restauranteId,
        cabecera: {
          proveedor: proveedorSeleccionado.trim(),
          fecha: cabecera.fecha,
          numero_documento: cabecera.numero_factura || '',
          referencia_externa: '',
          descuento_global: 0,
          iva_pct: Number(cabecera.iva_pct) || 21,
          notas: componerNotasFacturaIA(cabecera.notas),
          origen: 'manual',
        },
        lineas: lineasValidas.map(l => {
          const uds = Math.max(1, Number(l.uds) || 1)
          const bon = Math.max(0, Number(l.uds_bonificadas) || 0)
          const tarifa = (l.precio_unitario != null && Number(l.precio_unitario) > 0)
            ? Number(l.precio_unitario)
            : (l.importe_neto != null && Number(l.importe_neto) > 0 && uds > 0
              ? Number(l.importe_neto) / uds
              : 0)
          return {
            vino_id: l.vino_id,
            uds, uds_bonificadas: bon,
            precio_tarifa: tarifa,
            descuento_linea: 0,
          }
        }),
      }

      const resCompra = await apiFetch('/api/compras', { method: 'POST', body: JSON.stringify(payload) })
      const jCompra = await resCompra.json().catch(() => ({ error: 'Respuesta no válida' }))
      if (!resCompra.ok) throw new Error(jCompra.error || `Error ${resCompra.status}`)

      const cabeceraId = jCompra.cabecera_id
      if (cabeceraId && archivo?.path) {
        const resVinc = await apiFetch('/api/facturas/vincular', {
          method: 'POST',
          body: JSON.stringify({
            restaurante_id: restauranteId,
            cabecera_compra_id: cabeceraId,
            path: archivo.path,
            mime_type: archivo.mime_type,
            tamano_bytes: archivo.tamano_bytes,
            nombre_archivo: archivo.nombre_archivo,
          }),
        })
        if (!resVinc.ok) {
          const jV = await resVinc.json().catch(() => ({}))
          // La compra YA está registrada; sólo falló el adjunto.
          setError('Compra registrada, pero no se pudo adjuntar el archivo: ' + (jV.error || resVinc.status))
        }
      }

      if (onCompraRegistrada) onCompraRegistrada()
      resetTodo()
    } catch (err) {
      setError('No se pudo guardar: ' + (err.message || 'error desconocido'))
      setPaso('revisar')
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────

  if (paso === 'inicial' || paso === 'leyendo') {
    return (
      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, border: '1px dashed rgba(26,26,26,0.15)', background: 'rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={paso === 'leyendo'}
            style={{ padding: '8px 14px', border: '1px solid #d8d3c8', borderRadius: 6, fontSize: 13, color: '#444', background: '#fff', cursor: paso === 'leyendo' ? 'wait' : 'pointer' }}
          >
            {paso === 'leyendo' ? 'Leyendo factura…' : 'Subir factura (foto o PDF)'}
          </button>
          <span style={{ fontSize: 12, color: '#8b8278' }}>
            PDF, PNG o JPEG · máx. 10 MB · máx. 5 páginas de PDF.
          </span>
        </div>
        <p style={{ marginTop: 8, fontSize: 11, color: '#8b8278', lineHeight: 1.4 }}>
          El archivo se envía a un servicio de IA para leerlo y se guarda en tu cuenta.
          Revisa siempre los datos antes de confirmar.
        </p>
        {error && (
          <p style={{ marginTop: 8, fontSize: 12, color: '#b85454', background: 'rgba(184,84,84,0.08)', border: '1px solid rgba(184,84,84,0.25)', borderRadius: 6, padding: '6px 10px' }}>
            {error}
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          capture="environment"
          style={{ display: 'none' }}
          onChange={onSeleccionarArchivo}
        />
      </div>
    )
  }

  // paso === 'revisar' | 'confirmando'
  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(26,26,26,0.12)', background: '#fff' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Revisión de factura</strong>
        <button type="button" onClick={descartar} disabled={paso === 'confirmando'} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #d8d3c8', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
          Descartar
        </button>
      </div>

      {avisos.length > 0 && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <p style={{ fontSize: 12, color: '#b15a00', fontWeight: 600, marginBottom: 4 }}>Avisos</p>
          <ul style={{ fontSize: 12, color: '#8b6a1b', paddingLeft: 18, margin: 0 }}>
            {avisos.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      {posibleDuplicado && (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(184,84,84,0.08)', border: '1px solid rgba(184,84,84,0.25)' }}>
          <p style={{ fontSize: 12, color: '#b85454', fontWeight: 600, marginBottom: 4 }}>
            Posible factura duplicada
          </p>
          <p style={{ fontSize: 12, color: '#a04040' }}>
            Ya existe una factura parecida en el Libro de Compras:
            {' '}{posibleDuplicado.detalle?.proveedor || ''}
            {' · '}{posibleDuplicado.detalle?.albaran || ''}
            {' · '}{eur(posibleDuplicado.detalle?.importe)}
            {' · '}{posibleDuplicado.detalle?.fecha || ''}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>
                Proveedor del catálogo
                {cabecera.proveedor && (
                  <span style={{ marginLeft: 6, fontStyle: 'italic', color: '#a39889' }}>
                    IA leyó: &ldquo;{cabecera.proveedor}&rdquo;
                  </span>
                )}
              </div>
              <select
                value={proveedorSeleccionado}
                onChange={e => setProveedorSeleccionado(e.target.value)}
                style={{ width: '100%', padding: '4px 8px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff' }}
              >
                <option value="">— elegir proveedor —</option>
                {proveedoresDisponibles.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {proveedorSeleccionado && prov.origen && (
                <div style={{ fontSize: 10, color: '#8b8278', marginTop: 2 }}>
                  {prov.origen === 'nif' && 'Coincidencia por NIF ✓'}
                  {prov.origen === 'nombre_exacto' && 'Coincidencia por nombre ✓'}
                  {prov.origen === 'nombre_parcial' && 'Coincidencia parcial — revisa que sea el correcto'}
                </div>
              )}
              {!proveedorSeleccionado && (
                <div style={{ fontSize: 10, color: '#b85454', marginTop: 2 }}>
                  {prov.candidatos && prov.candidatos.length > 0
                    ? `Elige el proveedor. Posibles: ${prov.candidatos.join(', ')}`
                    : 'Este proveedor no está dado de alta. Créalo en el catálogo de proveedores y vuelve a intentarlo.'}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>NIF/CIF</div>
              <InputTxt value={cabecera.nif} onChange={v => setCabecera(c => ({ ...c, nif: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>Nº factura</div>
              <InputTxt value={cabecera.numero_factura} onChange={v => setCabecera(c => ({ ...c, numero_factura: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>Fecha</div>
              <input type="date" value={cabecera.fecha || ''} onChange={e => setCabecera(c => ({ ...c, fecha: e.target.value }))} style={{ width: '100%', padding: '4px 8px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 4 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>Base imponible (€)</div>
              <InputNum value={cabecera.base_imponible} onChange={v => setCabecera(c => ({ ...c, base_imponible: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>IVA %</div>
              <InputNum value={cabecera.iva_pct} onChange={v => setCabecera(c => ({ ...c, iva_pct: v }))} step="1" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>IVA importe (€)</div>
              <InputNum value={cabecera.iva_importe} onChange={v => setCabecera(c => ({ ...c, iva_importe: v }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>Total (€)</div>
              <InputNum value={cabecera.total} onChange={v => setCabecera(c => ({ ...c, total: v }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 11, color: '#8b8278', marginBottom: 2 }}>
                Notas (opcional — la traza de IA se añade sola al guardar)
              </div>
              <InputTxt
                value={cabecera.notas}
                onChange={v => setCabecera(c => ({ ...c, notas: v }))}
                placeholder="Observaciones de esta compra"
              />
            </div>
          </div>

          <p style={{ fontSize: 11, color: '#8b8278', marginBottom: 4, fontWeight: 600 }}>
            Líneas de la factura (sin IVA)
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e8e3d8', color: '#8b8278' }}>
                  <th style={{ textAlign: 'left',  padding: '4px 6px', fontWeight: 500 }}>Descripción</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500 }}>uds</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500 }}>bon.</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500 }}>P. ud</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500 }}>Importe</th>
                  <th style={{ textAlign: 'left',  padding: '4px 6px', fontWeight: 500 }}>Vino</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => {
                  const s = sugerencias[i]
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f2ec' }}>
                      <td style={{ padding: '3px 6px' }}>
                        <InputTxt value={l.descripcion} onChange={v => actualizarLinea(i, 'descripcion', v)} />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <InputNum value={l.uds} onChange={v => actualizarLinea(i, 'uds', v)} step="1" />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <InputNum value={l.uds_bonificadas} onChange={v => actualizarLinea(i, 'uds_bonificadas', v)} step="1" />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <InputNum value={l.precio_unitario} onChange={v => actualizarLinea(i, 'precio_unitario', v)} />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <InputNum value={l.importe_neto} onChange={v => actualizarLinea(i, 'importe_neto', v)} />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <select
                          value={l.vino_id || ''}
                          onChange={e => actualizarLinea(i, 'vino_id', e.target.value)}
                          style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #d8d3c8', borderRadius: 4 }}
                        >
                          <option value="">— elegir vino —</option>
                          {s?.mejor && (
                            <option value={s.mejor.vino_id}>
                              {s.mejor.nombre} {s.estado === 'seguro' ? '✓' : s.estado === 'dudoso' ? '?' : ''}
                            </option>
                          )}
                          {vinosActivos.map(v => (
                            <option key={v.id} value={v.id}>{v.nombre}</option>
                          ))}
                        </select>
                        {s && s.estado === 'sin_match' && (
                          <div style={{ fontSize: 10, color: '#b85454', marginTop: 2 }}>Sin coincidencia — elige o crea el vino antes.</div>
                        )}
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <button type="button" onClick={() => eliminarLinea(i)} style={{ fontSize: 11, padding: '2px 6px', border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={agregarLinea} style={{ marginTop: 6, fontSize: 12, padding: '4px 10px', border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
            + Añadir línea
          </button>
        </div>

        <div style={{ borderLeft: '1px solid rgba(26,26,26,0.08)', paddingLeft: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <p style={{ fontSize: 11, color: '#8b8278', margin: 0 }}>Vista del documento</p>
            {archivo?.path && (
              <button
                type="button"
                onClick={abrirAdjuntoEnPestana}
                disabled={abriendoAdjunto}
                style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: abriendoAdjunto ? 'wait' : 'pointer', color: '#444' }}
              >
                {abriendoAdjunto
                  ? 'Abriendo…'
                  : (previewMime === 'application/pdf' ? 'Abrir PDF' : 'Abrir archivo')}
              </button>
            )}
          </div>
          {errorAdjunto && (
            <p style={{ fontSize: 11, color: '#b85454', marginTop: 0, marginBottom: 6 }}>{errorAdjunto}</p>
          )}
          {previewUrl && previewMime?.startsWith('image/') && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="factura" style={{ width: '100%', maxHeight: 520, objectFit: 'contain', border: '1px solid #e8e3d8', borderRadius: 4 }} />
          )}
          {previewFile && previewMime === 'application/pdf' && (
            <PdfPreview file={previewFile} />
          )}
          {!previewUrl && (
            <p style={{ fontSize: 12, color: '#8b8278' }}>Sin vista previa.</p>
          )}
        </div>
      </div>

      {error && (
        <p style={{ marginTop: 10, fontSize: 12, color: '#b85454', background: 'rgba(184,84,84,0.08)', border: '1px solid rgba(184,84,84,0.25)', borderRadius: 6, padding: '6px 10px' }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={confirmar}
          disabled={paso === 'confirmando' || !proveedorSeleccionado}
          title={!proveedorSeleccionado ? 'Elige un proveedor del catálogo para poder registrar la compra.' : ''}
          style={{
            padding: '8px 16px',
            background: (paso === 'confirmando' || !proveedorSeleccionado) ? '#8b8278' : '#1a1a1a',
            color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
            cursor: paso === 'confirmando' ? 'wait' : (!proveedorSeleccionado ? 'not-allowed' : 'pointer'),
          }}
        >
          {paso === 'confirmando' ? 'Registrando…' : 'Confirmar y registrar compra'}
        </button>
      </div>
    </div>
  )
}
