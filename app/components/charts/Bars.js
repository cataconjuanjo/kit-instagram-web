'use client'

/**
 * Bars — barras verticales SVG. viewBox = ancho real medido con
 * ResizeObserver (no deforma texto). Alto fijo.
 * Si <=360px, muestra una etiqueta de mes de cada dos.
 */

import { useState } from 'react'
import { ChartShell } from './ChartShell'
import { useChartWidth } from './useChartWidth'
import { useDashboardDarkMode, tokensChart } from './useDashboardDarkMode'
import { fmtMes, fmtEur, nicemax } from './format'

const PAD_L = 44, PAD_R = 10, PAD_T = 14, PAD_B = 36

export function Bars({
  data, titulo, subtitulo, loading = false, formatValor = fmtEur,
  target = null, height = 240, mensajeVacio,
}) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const [ref, W]                = useChartWidth(600)
  const dark = useDashboardDarkMode()
  const t = tokensChart(dark)

  const vacio = !data || data.length === 0 ||
    data.every(d => d.valor == null || !Number.isFinite(Number(d.valor)))

  return (
    <ChartShell titulo={titulo} subtitulo={subtitulo} loading={loading} vacio={vacio}
                mensajeVacio={mensajeVacio} height={height}>
      <div ref={ref} style={{ width: '100%' }}>
        <BarsSvg data={data} t={t} W={W} H={height} target={target}
                 formatValor={formatValor} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
      </div>
    </ChartShell>
  )
}

function BarsSvg({ data, t, W, H, target, formatValor, hoverIdx, setHoverIdx }) {
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = data.length
  const esEstrecho = W <= 360

  const valoresValidos = data.map(d => Number(d.valor)).filter(Number.isFinite)
  const maxV = Math.max(...valoresValidos, 0, target?.valor ?? 0)
  const yMax = nicemax(maxV || 1)
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]
  const colW = innerW / n
  const barW = Math.max(4, colW * 0.6)

  const yFor = v => PAD_T + innerH - (v / yMax) * innerH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
         aria-label={`${data.length} barras mensuales`}
         style={{ display: 'block', fontFamily: 'inherit' }}>
      {yTicks.map((v, i) => (
        <line key={`g${i}`} x1={PAD_L} x2={W - PAD_R} y1={yFor(v)} y2={yFor(v)}
              stroke={t.grid} strokeWidth="1" />
      ))}
      {yTicks.map((v, i) => (
        <text key={`yl${i}`} x={PAD_L - 6} y={yFor(v) + 3} textAnchor="end"
              fill={t.textDim} fontSize="10">{formatValor(v)}</text>
      ))}
      {target && Number.isFinite(target.valor) && target.valor > 0 && (
        <g>
          <line x1={PAD_L} x2={W - PAD_R} y1={yFor(target.valor)} y2={yFor(target.valor)}
                stroke={t.target} strokeDasharray="4 3" strokeWidth="1.2" />
          <text x={W - PAD_R - 2} y={yFor(target.valor) - 4} textAnchor="end"
                fill={t.target} fontSize="10">{target.label}</text>
        </g>
      )}
      {data.map((d, i) => {
        const vRaw = d.valor
        if (vRaw == null || !Number.isFinite(Number(vRaw))) return null
        const v = Number(vRaw)
        const x = PAD_L + i * colW + (colW - barW) / 2
        const y = yFor(Math.max(0, v))
        const h = Math.max(0, innerH - (y - PAD_T))
        const estimado = d.estado === 'estimado'
        const fill = v < 0 ? t.warn : t.barFill
        const label = `${fmtMes(d.mes)}${d.mes?.endsWith('-01') ? ' ' + d.mes.slice(0,4) : ''}: ${formatValor(v)}${estimado ? ' (estimado)' : ''}`
        return (
          <g key={i}
             onMouseEnter={() => setHoverIdx(i)}
             onMouseLeave={() => setHoverIdx(h => h === i ? null : h)}
             onFocus={() => setHoverIdx(i)}
             onBlur={() => setHoverIdx(h => h === i ? null : h)}
             tabIndex={0} role="button" aria-label={label}
             style={{ outline: 'none' }}>
            <rect x={x} y={y} width={barW} height={h}
                  fill={fill}
                  opacity={estimado ? 0.5 : 0.9}
                  stroke={estimado ? fill : 'none'}
                  strokeDasharray={estimado ? '3 2' : undefined}
                  strokeWidth={estimado ? 1 : 0}
                  rx={2} ry={2} />
            {hoverIdx === i && (
              <TooltipG x={x + barW / 2} y={y} t={t} text={label} W={W} />
            )}
          </g>
        )
      })}
      {data.map((d, i) => {
        if (esEstrecho && i % 2 === 1) return null
        const parts = (d.mes || '').split('-')
        const mesLabel = fmtMes(d.mes)
        const esEnero = parts[1] === '01'
        const x = PAD_L + i * colW + colW / 2
        return (
          <g key={`xl${i}`}>
            <text x={x} y={H - PAD_B + 14} textAnchor="middle" fill={t.textDim} fontSize="10">
              {mesLabel}
            </text>
            {esEnero && (
              <text x={x} y={H - PAD_B + 28} textAnchor="middle" fill={t.textDim} fontSize="9">
                {parts[0]}
              </text>
            )}
          </g>
        )
      })}
      <line x1={PAD_L} x2={W - PAD_R} y1={yFor(0)} y2={yFor(0)}
            stroke={t.axis} strokeWidth="1" />
    </svg>
  )
}

function TooltipG({ x, y, t, text, W }) {
  const w = Math.min(220, Math.max(60, text.length * 6))
  const tx = Math.max(4, Math.min(W - w - 4, x - w / 2))
  const ty = Math.max(4, y - 32)
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={22} rx={4} ry={4}
            fill={t.tooltipBg} opacity="0.95" />
      <text x={tx + w / 2} y={ty + 15} textAnchor="middle"
            fill={t.tooltipText} fontSize="11">{text}</text>
    </g>
  )
}
