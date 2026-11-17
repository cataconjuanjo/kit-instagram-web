'use client'

/**
 * PdfPreview — renderiza un PDF (ObjectURL local) sobre un <canvas>
 * usando pdfjs-dist empaquetado (sin CDN). Se usa SOLO desde FacturaIA
 * y se carga por import dinámico (`next/dynamic`) para no engordar el
 * bundle del dashboard; pdfjs-dist cae en su propio chunk.
 *
 * Seguridad:
 *   - isEvalSupported: false  → no se permite eval en el documento PDF.
 *   - disableAutoFetch: true  → no se precargan rangos del PDF.
 *   - El origen de las fuentes/CMaps queda sin configurar: pdf.js usa
 *     las fuentes estándar embebidas; si el PDF trae tipografías raras
 *     saldrán sustitutas, pero nunca se hacen peticiones a terceros.
 *   - No se evalúa el JS embebido del PDF (pdf.sandbox no se carga).
 *
 * Límite práctico: la API `/api/facturas/extraer` ya rechaza PDFs con
 * más de 5 páginas, así que no hace falta paginar en bloque.
 */

import { useEffect, useRef, useState } from 'react'

export default function PdfPreview({ url }) {
  const canvasRef = useRef(null)
  const docRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [numPaginas, setNumPaginas] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState('cargando')  // 'cargando' | 'listo' | 'error'

  // Carga/limpieza del documento.
  useEffect(() => {
    if (!url) return
    let cancelado = false
    setEstado('cargando')
    setNumPaginas(0)
    setPagina(1)

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
        // Webpack 5 (Next) procesa este new URL(...) y genera un chunk
        // estático para el worker en nuestro propio origen. Nada de CDN.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).href

        const loadingTask = pdfjs.getDocument({
          url,
          isEvalSupported: false,
          disableAutoFetch: true,
        })
        const pdf = await loadingTask.promise
        if (cancelado) { try { pdf.destroy() } catch { /* ignored */ } return }

        docRef.current = pdf
        setNumPaginas(pdf.numPages || 0)
        setEstado('listo')
      } catch {
        if (!cancelado) setEstado('error')
      }
    })()

    return () => {
      cancelado = true
      try { renderTaskRef.current?.cancel() } catch { /* ignored */ }
      renderTaskRef.current = null
      try { docRef.current?.destroy() } catch { /* ignored */ }
      docRef.current = null
    }
  }, [url])

  // Render de la página seleccionada cada vez que cambie `pagina`
  // o cuando el documento esté listo.
  useEffect(() => {
    if (estado !== 'listo') return
    const pdf = docRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas) return

    let cancelado = false
    ;(async () => {
      try {
        const page = await pdf.getPage(pagina)
        if (cancelado) return

        // Escala: ajusta al ancho del contenedor y respeta devicePixelRatio
        // para que se vea nítido en pantallas Retina.
        const anchoContenedor = canvas.parentElement?.clientWidth || 520
        const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
        const viewportBase = page.getViewport({ scale: 1 })
        const escala = (anchoContenedor / viewportBase.width) * dpr
        const viewport = page.getViewport({ scale: escala })

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`

        const ctx = canvas.getContext('2d')
        try { renderTaskRef.current?.cancel() } catch { /* ignored */ }
        const task = page.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = task
        await task.promise
      } catch (err) {
        // Un `RenderingCancelledException` es esperado al cambiar de
        // página rápido; no lo marcamos como error.
        const nombre = err && (err.name || err.constructor?.name)
        if (!cancelado && nombre !== 'RenderingCancelledException') {
          setEstado('error')
        }
      }
    })()

    return () => { cancelado = true }
  }, [estado, pagina])

  if (estado === 'cargando') {
    return (
      <div style={{ padding: 16, fontSize: 12, color: '#8b8278', border: '1px solid #e8e3d8', borderRadius: 4 }}>
        Cargando vista previa…
      </div>
    )
  }
  if (estado === 'error') {
    return (
      <div style={{ padding: 10, fontSize: 12, color: '#8b6a1b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 4 }}>
        No se pudo mostrar la vista previa; la extracción no se ve afectada.
      </div>
    )
  }

  return (
    <div>
      <div style={{ border: '1px solid #e8e3d8', borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
      </div>
      {numPaginas > 1 && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 12, color: '#444' }}>
          <button
            type="button"
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            style={{ padding: '2px 8px', border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: pagina <= 1 ? 'not-allowed' : 'pointer', opacity: pagina <= 1 ? 0.5 : 1 }}
            aria-label="Página anterior"
          >
            ◄
          </button>
          <span>Página {pagina} de {numPaginas}</span>
          <button
            type="button"
            onClick={() => setPagina(p => Math.min(numPaginas, p + 1))}
            disabled={pagina >= numPaginas}
            style={{ padding: '2px 8px', border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: pagina >= numPaginas ? 'not-allowed' : 'pointer', opacity: pagina >= numPaginas ? 0.5 : 1 }}
            aria-label="Página siguiente"
          >
            ►
          </button>
        </div>
      )}
    </div>
  )
}
