'use client'

/**
 * Gráfico #2 — CoGS% vs objetivo mensual.
 * Línea de % CoGS teórico (línea sólida cerrados / discontinua estimados)
 * + línea objetivo per-mes desde presupuesto_mensual.objetivo_mp_pct.
 *
 * Decisión de montaje: en app/dashboard/cierre/page.js (Cierre mensual),
 * NO en Explotación. Razones:
 *  - El cierre define coste_ventas_teorico; es su "métrica propia" por mes.
 *  - Explotación mezcla costes personal/alquiler y lo convertiría en ruido.
 *  - El objetivo_mp_pct es del presupuesto de la bodega, no de la cuenta
 *    de explotación completa.
 */

import { useState } from 'react'
import { Line, fmtPct } from '../../components/charts'
import { useGraficosSomm } from './GraficosSommProvider'

export function GraficoCogsPct({ restauranteId, enabled = true }) {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const { data, loading, error } = useGraficosSomm({ restauranteId, anio, enabled })

  if (!enabled) return null

  const dataChart = (data?.meses || []).map(m => ({
    mes:      m.mes,
    estado:   m.estado,
    valor:    m.cogs_pct,
    objetivo: m.objetivo_mp_pct,
  }))

  const haySerie = dataChart.some(d => Number.isFinite(Number(d.valor)))
  const hayObjetivo = dataChart.some(d => Number.isFinite(Number(d.objetivo)))

  return (
    <section style={{ marginTop: 32 }}>
      <HeaderConSelector
        titulo="% CoGS vs objetivo"
        subtitulo={hayObjetivo
          ? 'Línea punteada = objetivo del presupuesto mensual'
          : 'Define un presupuesto en Analítica Somm para ver el objetivo'}
        anio={anio} setAnio={setAnio}
      />
      {error && <p style={{ color: 'var(--c-error, #c00)', fontSize: 12 }} role="alert">{error}</p>}
      <Line
        data={dataChart}
        loading={loading}
        formatValor={v => fmtPct(v, 1)}
        target={hayObjetivo ? { label: 'Objetivo' } : null}
        titulo="% COSTE DE VENTAS TEÓRICO"
        mensajeVacio={haySerie ? '' : 'Aún no hay datos suficientes para este año'}
      />
    </section>
  )
}

function HeaderConSelector({ titulo, subtitulo, anio, setAnio }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{titulo}</h3>
        {subtitulo && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8b8278' }}>{subtitulo}</p>}
      </div>
      <select value={String(anio)} onChange={e => setAnio(Number(e.target.value))}
              style={{ padding: '4px 8px', fontSize: 13 }}>
        {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}
