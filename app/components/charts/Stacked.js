'use client'

/**
 * Stacked — barras apiladas SVG, misma lógica de ejes y tooltip que Bars.
 * Pensado para gráficos futuros (ej. canal: botella/copa/invitación por mes).
 * En F3-H2 queda como primitiva disponible, sin uso aún.
 *
 * Props:
 *   data: [{ mes: 'YYYY-MM', estado?, segmentos: [{ key, valor, color }] }]
 *   formatValor, titulo, subtitulo, height
 */

import { useState } from 'react'
import { ChartShell } from './ChartShell'
import { useDashboardDarkMode, tokensChart } from './useDashboardDarkMode'
import { fmtMes, fmtEur, nicemax } from './format'

const PAD_L = 48, PAD_R = 10, PAD_T = 14, PAD_B = 28

export function Stacked({ data, titulo, subtitulo, loading = false, formatValor = fmtEur, height = 240, mensajeVacio }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const dark = useDashboardDarkMode()
  const t = tokensChart(dark)

  const vacio = !data || data.length === 0 ||
    data.every(d => !d.segmentos || d.segmentos.every(s => !Number(s.valor)))

  return (
    <ChartShell titulo={titulo} subtitulo={subtitulo} loading={loading} vacio={vacio}
                mensajeVacio={mensajeVacio} height={height}>
      <StackedSvg data={data} t={t} height={height}
                  formatValor={formatValor} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
    </ChartShell>
  )
}

function StackedSvg({ data, t, height, formatValor, hoverIdx, setHoverIdx }) {
  const W = 600, H = height
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = data.length
  const totals = data.map(d => (d.segmentos || []).reduce((s, x) => s + (Number(x.valor) || 0), 0))
  const maxV = Math.max(...totals, 1)
  const yMax = nicemax(maxV)
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]
  const colW = innerW / n
  const barW = Math.max(4, colW * 0.6)
  const yFor = v => PAD_T + innerH - (v / yMax) * innerH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
         aria-label={`Barras apiladas de ${data.length} meses`}
         preserveAspectRatio="none" style={{ display: 'block', fontFamily: 'inherit' }}>
      {yTicks.map((v, i) => (
        <line key={`g${i}`} x1={PAD_L} x2={W - PAD_R} y1={yFor(v)} y2={yFor(v)}
              stroke={t.grid} strokeWidth="1" />
      ))}
      {yTicks.map((v, i) => (
        <text key={`yl${i}`} x={PAD_L - 6} y={yFor(v) + 3} textAnchor="end"
              fill={t.textDim} fontSize="10">{formatValor(v)}</text>
      ))}
      {data.map((d, i) => {
        const x0 = PAD_L + i * colW + (colW - barW) / 2
        let acc = 0
        const label = `${fmtMes(d.mes)}: ${formatValor(totals[i])}`
        return (
          <g key={i} tabIndex={0} role="button" aria-label={label}
             onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(h => h === i ? null : h)}
             onFocus={() => setHoverIdx(i)} onBlur={() => setHoverIdx(h => h === i ? null : h)}
             style={{ outline: 'none' }}>
            {(d.segmentos || []).map((s, j) => {
              const v = Number(s.valor) || 0
              if (v <= 0) return null
              const y = yFor(acc + v)
              const h = yFor(acc) - y
              acc += v
              return (
                <rect key={j} x={x0} y={y} width={barW} height={h}
                      fill={s.color || t.barFill} opacity={d.estado === 'estimado' ? 0.5 : 0.9} />
              )
            })}
            {hoverIdx === i && (
              <g pointerEvents="none">
                <rect x={x0} y={yFor(totals[i]) - 24} width={Math.min(200, label.length * 7)} height={22}
                      rx={4} ry={4} fill={t.tooltipBg} opacity="0.95" />
                <text x={x0 + 4} y={yFor(totals[i]) - 9} fill={t.tooltipText} fontSize="11">{label}</text>
              </g>
            )}
          </g>
        )
      })}
      {data.map((d, i) => {
        const mesLabel = fmtMes(d.mes)
        const parts = (d.mes || '').split('-')
        const showYear = i === 0 || parts[1] === '01'
        const x = PAD_L + i * colW + colW / 2
        return (
          <g key={`x${i}`}>
            <text x={x} y={H - PAD_B + 12} textAnchor="middle" fill={t.textDim} fontSize="10">{mesLabel}</text>
            {showYear && <text x={x} y={H - PAD_B + 23} textAnchor="middle" fill={t.textDim} fontSize="9">{parts[0]}</text>}
          </g>
        )
      })}
    </svg>
  )
}
