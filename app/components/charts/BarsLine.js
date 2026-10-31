'use client'

/**
 * BarsLine — combinación barra (y izq) + línea (y der), compartiendo ejes X.
 * Usado para evolución mensual de ventas (barras €) + línea de margen % o
 * resultado €. Dos ejes Y: izq siempre €, der puede ser % o €.
 */

import { useState } from 'react'
import { ChartShell } from './ChartShell'
import { useDashboardDarkMode, tokensChart } from './useDashboardDarkMode'
import { fmtMes, fmtEur, fmtPct, nicemax } from './format'

const PAD_L = 48, PAD_R = 44, PAD_T = 14, PAD_B = 28

export function BarsLine({
  data, titulo, subtitulo, loading = false,
  formatBar = fmtEur, formatLine = fmtPct,
  height = 240, mensajeVacio,
}) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const dark = useDashboardDarkMode()
  const t = tokensChart(dark)

  const vacio = !data || data.length === 0 ||
    data.every(d => !Number.isFinite(Number(d.bar)) && !Number.isFinite(Number(d.linea)))

  return (
    <ChartShell titulo={titulo} subtitulo={subtitulo} loading={loading} vacio={vacio}
                mensajeVacio={mensajeVacio} height={height}>
      <Svg data={data} t={t} height={height}
           formatBar={formatBar} formatLine={formatLine}
           hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
    </ChartShell>
  )
}

function Svg({ data, t, height, formatBar, formatLine, hoverIdx, setHoverIdx }) {
  const W = 600
  const H = height
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = data.length

  const maxBar  = Math.max(...data.map(d => Math.max(0, Number(d.bar) || 0)), 1)
  const yMaxBar = nicemax(maxBar)
  const barTicks = [0, yMaxBar * 0.25, yMaxBar * 0.5, yMaxBar * 0.75, yMaxBar]

  const lineVals = data.map(d => Number(d.linea)).filter(v => Number.isFinite(v))
  const minLine = Math.min(0, ...lineVals)
  const maxLine = Math.max(1, ...lineVals)
  const yMaxLine = nicemax(Math.max(Math.abs(maxLine), Math.abs(minLine)))

  const colW = innerW / Math.max(1, n)
  const barW = Math.max(4, colW * 0.55)

  const yBar  = v => PAD_T + innerH - (v / yMaxBar) * innerH
  const yLine = v => {
    const range = yMaxLine - (minLine < 0 ? -yMaxLine : 0)
    const base  = minLine < 0 ? -yMaxLine : 0
    return PAD_T + innerH - ((v - base) / range) * innerH
  }

  const lineSeg = []
  let cur = []
  data.forEach((d, i) => {
    if (!Number.isFinite(Number(d.linea))) {
      if (cur.length > 1) lineSeg.push(cur)
      cur = []
      return
    }
    const x = PAD_L + i * colW + colW / 2
    const y = yLine(Number(d.linea))
    cur.push({ x, y, i, v: Number(d.linea), estado: d.estado, mes: d.mes })
    if (d.estado === 'estimado') {
      if (cur.length > 1) lineSeg.push(cur.slice())
      cur = [cur[cur.length - 1]]
    }
  })
  if (cur.length > 1) lineSeg.push(cur)

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`Evolución mensual: ${data.length} meses`}
           preserveAspectRatio="none"
           style={{ display: 'block', fontFamily: 'inherit' }}>
        {/* grid */}
        {barTicks.map((v, i) => (
          <line key={`g${i}`} x1={PAD_L} x2={W - PAD_R} y1={yBar(v)} y2={yBar(v)}
                stroke={t.grid} strokeWidth="1" />
        ))}
        {/* y izq (bar) */}
        {barTicks.map((v, i) => (
          <text key={`yl${i}`} x={PAD_L - 6} y={yBar(v) + 3} textAnchor="end"
                fill={t.textDim} fontSize="10">{formatBar(v)}</text>
        ))}
        {/* y der (line) */}
        {[-yMaxLine, 0, yMaxLine].filter(v => minLine < 0 || v >= 0).map((v, i) => (
          <text key={`yr${i}`} x={W - PAD_R + 6} y={yLine(v) + 3} textAnchor="start"
                fill={t.lineStroke} fontSize="10">{formatLine(v)}</text>
        ))}

        {/* barras */}
        {data.map((d, i) => {
          const v = Number(d.bar) || 0
          const x = PAD_L + i * colW + (colW - barW) / 2
          const y = yBar(Math.max(0, v))
          const h = Math.max(0, innerH - (y - PAD_T))
          const estimado = d.estado === 'estimado'
          const label = `${fmtMes(d.mes)}${d.mes?.endsWith('-01') ? ' ' + d.mes.slice(0,4) : ''}: ${formatBar(v)}${Number.isFinite(Number(d.linea)) ? ' · ' + formatLine(Number(d.linea)) : ''}${estimado ? ' (estimado)' : ''}`
          return (
            <g key={i}
               onMouseEnter={() => setHoverIdx(i)}
               onMouseLeave={() => setHoverIdx(h => h === i ? null : h)}
               onFocus={() => setHoverIdx(i)}
               onBlur={() => setHoverIdx(h => h === i ? null : h)}
               tabIndex={0} role="button" aria-label={label}
               style={{ outline: 'none' }}>
              <rect x={x} y={y} width={barW} height={h}
                    fill={t.barFill}
                    opacity={estimado ? 0.5 : 0.9}
                    stroke={estimado ? t.barFill : 'none'}
                    strokeDasharray={estimado ? '3 2' : undefined}
                    strokeWidth={estimado ? 1 : 0}
                    rx={2} ry={2} />
              {hoverIdx === i && (
                <Tip x={x + barW / 2} y={y} t={t} text={label} W={W} />
              )}
            </g>
          )
        })}

        {/* línea */}
        {lineSeg.map((seg, k) => {
          const dashed = seg.some(p => p.estado === 'estimado')
          return (
            <polyline key={k} fill="none" stroke={t.lineStroke} strokeWidth="2"
                      strokeDasharray={dashed ? '5 3' : undefined}
                      points={seg.map(p => `${p.x},${p.y}`).join(' ')} />
          )
        })}
        {lineSeg.flat().map((p, k) => (
          <circle key={`c${k}`} cx={p.x} cy={p.y} r={3} fill={t.lineStroke} />
        ))}

        {/* X labels */}
        {data.map((d, i) => {
          const parts = (d.mes || '').split('-')
          const mesLabel = fmtMes(d.mes)
          const yearLabel = parts[0]
          const showYear = i === 0 || parts[1] === '01'
          const x = PAD_L + i * colW + colW / 2
          return (
            <g key={`x${i}`}>
              <text x={x} y={H - PAD_B + 12} textAnchor="middle"
                    fill={t.textDim} fontSize="10">{mesLabel}</text>
              {showYear && (
                <text x={x} y={H - PAD_B + 23} textAnchor="middle"
                      fill={t.textDim} fontSize="9">{yearLabel}</text>
              )}
            </g>
          )
        })}
        <line x1={PAD_L} x2={W - PAD_R} y1={yBar(0)} y2={yBar(0)}
              stroke={t.axis} strokeWidth="1" />
      </svg>
    </div>
  )
}

function Tip({ x, y, t, text, W }) {
  const w = Math.min(260, Math.max(60, text.length * 6))
  const tx = Math.max(4, Math.min(W - w - 4, x - w / 2))
  const ty = Math.max(4, y - 30)
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={22} rx={4} ry={4}
            fill={t.tooltipBg} opacity="0.95" />
      <text x={tx + w / 2} y={ty + 15} textAnchor="middle"
            fill={t.tooltipText} fontSize="11">{text}</text>
    </g>
  )
}
