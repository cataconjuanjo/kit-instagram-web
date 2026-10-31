'use client'

/**
 * ChartShell — contenedor común (título, estado vacío/carga).
 * Tema fijo via prop `tema` ('claro' | 'oscuro'); por defecto 'claro'
 * porque las pantallas que montan gráficos (Explotación, Cierre,
 * Libro) no reaccionan a dashboard_dark_mode: sus tarjetas siguen
 * siendo claras incluso con el shell en oscuro. Los charts
 * ignoran el hook para que no queden ilegibles sobre fondo crema.
 * El llamador puede forzar oscuro con tema="oscuro".
 */

import { tokensChart } from './useDashboardDarkMode'

export function ChartShell({ titulo, subtitulo, loading, vacio, mensajeVacio = 'Aún no hay datos suficientes', height = 240, tema = 'claro', children }) {
  const t = tokensChart(tema === 'oscuro')

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
