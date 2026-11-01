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
 *
 * Comparar YoY: casilla "Comparar con año anterior" (activa por defecto si
 * existe el año anterior con datos). serieB es la línea de cogs_pct del
 * año prev; variación en PP (tipoVariacion='ratio').
 */

import { useState } from 'react'
import { Line, fmtPct } from '../../components/charts'
import { useGraficosSomm } from './GraficosSommProvider'

export function GraficoCogsPct({ restauranteId, enabled = true }) {
  const [anio, setAnio]           = useState(new Date().getFullYear())
  const [compararOn, setComparar] = useState(true)

  const compararCon = compararOn ? (anio - 1) : null
  const { data, loading, error } = useGraficosSomm({
    restauranteId, anio, compararCon, enabled,
  })

  // La casilla NO se muestra: mientras loading, si data no corresponde
  // al año seleccionado, o si comparables está vacío.
  const dataListo   = !loading && data?.anio === anio
  const hayAnioPrev = dataListo && Array.isArray(data?.comparables) && data.comparables.length > 0

  if (!enabled) return null

  const dataChart = (data?.meses || []).map(m => ({
    mes:      m.mes,
    estado:   m.estado,
    valor:    m.cogs_pct,
    objetivo: m.objetivo_mp_pct,
  }))

  const haySerie    = dataChart.some(d => Number.isFinite(Number(d.valor)))
  const hayObjetivo = dataChart.some(d => Number.isFinite(Number(d.objetivo)))

  const serieB = (compararOn && data?.mesesPrev) ? data.mesesPrev.map(m => ({
    mes:   m.mes,
    valor: m.cogs_pct,
  })) : null

  const comparables    = compararOn ? (data?.comparables || []) : []
  const etiquetaSeries = compararOn && hayAnioPrev
    ? `${anio} / ${anio - 1}`
    : null

  return (
    <section style={{ marginTop: 32 }}>
      <HeaderConSelector
        titulo="% CoGS vs objetivo"
        subtitulo={hayObjetivo
          ? 'Línea punteada = objetivo del presupuesto mensual'
          : 'Define un presupuesto en Analítica Somm para ver el objetivo'}
        anio={anio} setAnio={setAnio}
        compararOn={compararOn} setComparar={setComparar}
        mostrarComparar={hayAnioPrev}
        anioPrev={anio - 1}
      />
      {error && <p style={{ color: 'var(--c-error, #c00)', fontSize: 12 }} role="alert">{error}</p>}
      <Line
        data={dataChart}
        loading={loading}
        formatValor={v => fmtPct(v, 1)}
        target={hayObjetivo ? { label: 'Objetivo' } : null}
        titulo="% COSTE DE VENTAS TEÓRICO"
        mensajeVacio={haySerie ? '' : 'Aún no hay datos suficientes para este año'}
        serieB={serieB}
        comparables={comparables}
        etiquetaSeries={etiquetaSeries}
        tipoVariacion="ratio"
      />
    </section>
  )
}

function HeaderConSelector({ titulo, subtitulo, anio, setAnio, compararOn, setComparar, mostrarComparar, anioPrev }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{titulo}</h3>
        {subtitulo && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8b8278' }}>{subtitulo}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {mostrarComparar && (
          <label style={{ fontSize: 12, color: '#555', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={compararOn}
                   onChange={e => setComparar(e.target.checked)} />
            Comparar con {anioPrev}
          </label>
        )}
        <select value={String(anio)} onChange={e => setAnio(Number(e.target.value))}
                style={{ padding: '4px 8px', fontSize: 13 }}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  )
}
