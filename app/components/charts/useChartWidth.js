'use client'

/**
 * useChartWidth — mide el ancho real del contenedor con ResizeObserver.
 * SSR y primer render → 600 (ancho base).
 *
 * Uso:
 *   const [ref, width] = useChartWidth(600)
 *   <div ref={ref}><svg viewBox={`0 0 ${width} ${H}`} width={width} ... /></div>
 */

import { useEffect, useRef, useState } from 'react'

export function useChartWidth(fallback = 600) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width)
        if (w > 0) setWidth(w)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width]
}
