'use client'

/**
 * useChartWidth — mide el ancho real del contenedor con ResizeObserver,
 * usando un ref CALLBACK (setNode) en lugar de useRef+useEffect([]).
 *
 * Motivo: el contenido medido vive dentro de ChartShell, que primero
 * renderiza "Cargando…" o estado vacío. Con useRef+useEffect([], []) el
 * efecto corre al mount cuando el ref aún es null y no se conecta el
 * observer. Con ref callback, React invoca el callback en cuanto el
 * nodo aparece/desaparece/cambia, y el efecto se re-ejecuta.
 *
 * Mide inmediatamente con getBoundingClientRect en el primer callback,
 * sin esperar a un resize.
 *
 * Uso:
 *   const [ref, width] = useChartWidth(600)
 *   <div ref={ref} style={{ width: '100%', minWidth: 0 }}>…</div>
 */

import { useEffect, useState } from 'react'

export const CHART_WIDTH_MIN = 280
export const CHART_WIDTH_MAX = 2400

/**
 * Función pura. Clampa un ancho medido al rango soportado o cae al
 * fallback si el valor no es un número válido o es <=0.
 */
export function clampChartWidth(w, fallback = 600) {
  const n = Number(w)
  if (!Number.isFinite(n) || n <= 0) return fallback
  if (n < CHART_WIDTH_MIN) return CHART_WIDTH_MIN
  if (n > CHART_WIDTH_MAX) return CHART_WIDTH_MAX
  return Math.round(n)
}

export function useChartWidth(fallback = 600) {
  const [node, setNode]   = useState(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    if (!node) return

    // Fallback (SSR/entornos antiguos): medición única diferida
    if (typeof ResizeObserver === 'undefined') {
      const h = setTimeout(() => {
        const rect = node.getBoundingClientRect()
        setWidth(clampChartWidth(rect.width, fallback))
      }, 0)
      return () => clearTimeout(h)
    }

    // ResizeObserver dispara la primera entry en el siguiente microtask
    // con el tamaño actual del nodo, así que no hace falta getBoundingClientRect
    // síncrono (que además violaría react-hooks/set-state-in-effect).
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect?.width ?? entry.target.getBoundingClientRect().width
        setWidth(clampChartWidth(w, fallback))
      }
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [node, fallback])

  // Devolvemos el callback como "ref" (React admite callback refs igual
  // que RefObjects en atributos ref={...}).
  return [setNode, width]
}
