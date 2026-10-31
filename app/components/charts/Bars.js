'use client'

/**
 * Bars — barras verticales SVG, con etiquetas de ejes, tooltip accesible
 * (focus/hover), responsive hasta 360px, modo oscuro.
 *
 * Props:
 *   data: [{ mes: 'YYYY-MM', valor: number, estado?: 'cerrado'|'estimado',
 *            tooltipExtra?: string }]
 *   titulo, subtitulo, mensajeVacio
 *   formatValor: (n) => string   (default: miles sin unidad)
 *   colorBar(d): optional
 *   target: optional { valor: number, label: string } → línea horizontal objetivo
 *   height
 */

import { useState } from 'react'
import { ChartShell } from './ChartShell'
import { useDashboardDarkMode, tokensChart } from './useDashboardDarkMode'
import { fmtMes, fmtEur, nicemax } from './format'

const PAD_L = 44, PAD_R = 10, PAD_T = 14, PAD_B = 28

export function Bars({
  data, titulo, subtitulo, loading = false, formatValor = fmtEur,
  target = null, height = 240, mensajeVacio,
}) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const dark = useDashboardDarkMode()
  const t = tokensChart(dark)

  const vacio = !data || data.length === 0 ||
    data.every(d => !Number.isFinite(Number(d.valor)) || Number(d.valor) === 0)

  return (
    <ChartShell titulo={titulo} subtitulo={subtitulo} loading={loading} vacio={vacio}
                mensajeVacio={mensajeVacio} height={height}>
      <BarsSvg data={data} t={t} height={height} target={target}
               formatValor={formatValor} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
    </ChartShell>
  )
}

function BarsSvg({ data, t, height, target, formatValor, hoverIdx, setHoverIdx }) {
  const W = 600  // viewBox width; se escala al contenedor
  const H = height
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = data.length

  const maxV   = Math.max(...data.map(d => Math.max(0, Number(d.valor) || 0)), target?.valor ?? 0)
  const yMax   = nicemax(maxV || 1)
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]
  const colW   = innerW / n
  const barW   = Math.max(4, colW * 0.6)

  const yFor = v => PAD_T + innerH - (v / yMax) * innerH

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`${data.length} barras mensuales`}
           preserveAspectRatio="none"
           style={{ display: 'block', fontFamily: 'inherit' }}>
        {/* grid */}
        {yTicks.map((v, i) => (
          <line key={`g${i}`} x1={PAD_L} x2={W - PAD_R} y1={yFor(v)} y2={yFor(v)}
                stroke={t.grid} strokeWidth="1" />
        ))}
        {/* y-labels */}
        {yTicks.map((v, i) => (
          <text key={`yl${i}`} x={PAD_L - 6} y={yFor(v) + 3} textAnchor="end"
                fill={t.textDim} fontSize="10">{formatValor(v)}</text>
        ))}
        {/* target line */}
        {target && Number.isFinite(target.valor) && target.valor > 0 && (
          <g>
            <line x1={PAD_L} x2={W - PAD_R} y1={yFor(target.valor)} y2={yFor(target.valor)}
                  stroke={t.target} strokeDasharray="4 3" strokeWidth="1.2" />
            <text x={W - PAD_R - 2} y={yFor(target.valor) - 4} textAnchor="end"
                  fill={t.target} fontSize="10">{target.label}</text>
          </g>
        )}
        {/* bars */}
        {data.map((d, i) => {
          const v = Number(d.valor) || 0
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
               tabIndex={0}
               role="button"
               aria-label={label}
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
        {/* x-labels */}
        {data.map((d, i) => {
          const parts = (d.mes || '').split('-')
          const mesLabel = fmtMes(d.mes)
          const yearLabel = parts[0]
          const showYear = i === 0 || parts[1] === '01'
          const x = PAD_L + i * colW + colW / 2
          return (
            <g key={`xl${i}`}>
              <text x={x} y={H - PAD_B + 12} textAnchor="middle" fill={t.textDim} fontSize="10">
                {mesLabel}
              </text>
              {showYear && (
                <text x={x} y={H - PAD_B + 23} textAnchor="middle" fill={t.textDim} fontSize="9">
                  {yearLabel}
                </text>
              )}
            </g>
          )
        })}
        {/* x-axis */}
        <line x1={PAD_L} x2={W - PAD_R} y1={yFor(0)} y2={yFor(0)}
              stroke={t.axis} strokeWidth="1" />
      </svg>
    </div>
  )
}

function TooltipG({ x, y, t, text, W }) {
  const w = Math.min(220, Math.max(60, text.length * 6))
  // Clamp dentro del viewBox
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
