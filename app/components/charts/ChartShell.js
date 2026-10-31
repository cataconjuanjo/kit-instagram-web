'use client'

/**
 * ChartShell — contenedor común (título, estado vacío/carga, modo oscuro).
 * Mantiene el estilo visual coherente con analitica-somm/BarChart (titulos
 * en mayúsculas, letter-spacing, color dim).
 */

import { useDashboardDarkMode, tokensChart } from './useDashboardDarkMode'

export function ChartShell({ titulo, subtitulo, loading, vacio, mensajeVacio = 'Aún no hay datos suficientes', height = 240, children }) {
  const dark = useDashboardDarkMode()
  const t = tokensChart(dark)

  return (
    <div style={{ marginBottom: 24, color: t.text }}>
      {(titulo || subtitulo) && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          {titulo && (
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: t.textDim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {titulo}
            </p>
          )}
          {subtitulo && (
            <p style={{ margin: 0, fontSize: 11, color: t.textDim }}>{subtitulo}</p>
          )}
        </div>
      )}
      {loading ? (
        <div style={{
          height, display: 'grid', placeItems: 'center',
          color: t.textDim, fontSize: 12, border: `1px dashed ${t.axis}`, borderRadius: 6,
        }} role="status" aria-live="polite">Cargando…</div>
      ) : vacio ? (
        <div style={{
          height, display: 'grid', placeItems: 'center',
          color: t.textDim, fontSize: 12, border: `1px dashed ${t.axis}`, borderRadius: 6,
        }}>{mensajeVacio}</div>
      ) : children}
    </div>
  )
}
