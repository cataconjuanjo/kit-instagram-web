'use client'

/**
 * Line — gráfico de línea SVG con puntos, tooltip accesible, línea objetivo
 * opcional. Pensado para % CoGS vs objetivo (gráfico #2).
 *
 * Props:
 *   data: [{ mes: 'YYYY-MM', valor: number | null, estado?: 'cerrado'|'estimado',
 *            objetivo?: number }]
 *   titulo, subtitulo
 *   formatValor: (n) => string   (default: pct)
 *   target: { label } (si se pasa, las líneas de objetivo per-month vienen en data[i].objetivo)
 *   height
 */

import { useState } from 'react'
import { ChartShell } from './ChartShell'
import { useDashboardDarkMode, tokensChart } from './useDashboardDarkMode'
import { fmtMes, fmtPct, nicemax } from './format'

const PAD_L = 44, PAD_R = 14, PAD_T = 14, PAD_B = 28

export function Line({
  data, titulo, subtitulo, loading = false, formatValor = fmtPct,
  target = null, height = 240, mensajeVacio,
}) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const dark = useDashboardDarkMode()
  const t = tokensChart(dark)

  const vacio = !data || data.length === 0 ||
    data.every(d => !Number.isFinite(Number(d.valor)))

  return (
    <ChartShell titulo={titulo} subtitulo={subtitulo} loading={loading} vacio={vacio}
                mensajeVacio={mensajeVacio} height={height}>
      <LineSvg data={data} t={t} height={height} target={target}
               formatValor={formatValor} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
    </ChartShell>
  )
}

function LineSvg({ data, t, height, target, formatValor, hoverIdx, setHoverIdx }) {
  const W = 600
  const H = height
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = data.length

  const valuesForMax = []
  for (const d of data) {
    if (Number.isFinite(Number(d.valor))) valuesForMax.push(Number(d.valor))
    if (Number.isFinite(Number(d.objetivo))) valuesForMax.push(Number(d.objetivo))
  }
  const maxV = Math.max(...valuesForMax, 1)
  const yMax = nicemax(maxV)
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]
  const colW = innerW / Math.max(1, n - 1)

  const xFor = i => PAD_L + i * colW
  const yFor = v => PAD_T + innerH - (v / yMax) * innerH

  const puntos = data
    .map((d, i) => Number.isFinite(Number(d.valor))
      ? { i, x: xFor(i), y: yFor(Number(d.valor)), v: Number(d.valor), estado: d.estado, mes: d.mes }
      : null)
    .filter(Boolean)

  // Segmentar: no unir mes abierto con cerrados por línea continua
  const segmentos = []
  let seg = []
  for (const p of puntos) {
    seg.push(p)
    if (p.estado === 'estimado') {
      if (seg.length > 1) segmentos.push({ pts: seg.slice(0, -1).concat(p), dashed: true })
      seg = [p]
    }
  }
  if (seg.length > 1) segmentos.push({ pts: seg, dashed: false })

  // Línea objetivo (si hay por-mes, pintar como step)
  const objetivos = data
    .map((d, i) => Number.isFinite(Number(d.objetivo))
      ? { i, x: xFor(i), y: yFor(Number(d.objetivo)), v: Number(d.objetivo) }
      : null)
    .filter(Boolean)

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
           aria-label={`Línea de ${data.length} meses`} preserveAspectRatio="none"
           style={{ display: 'block', fontFamily: 'inherit' }}>
        {yTicks.map((v, i) => (
          <line key={`g${i}`} x1={PAD_L} x2={W - PAD_R} y1={yFor(v)} y2={yFor(v)}
                stroke={t.grid} strokeWidth="1" />
        ))}
        {yTicks.map((v, i) => (
          <text key={`yl${i}`} x={PAD_L - 6} y={yFor(v) + 3} textAnchor="end"
                fill={t.textDim} fontSize="10">{formatValor(v)}</text>
        ))}

        {/* Objetivo per-mes (step) */}
        {objetivos.length > 1 && (
          <polyline fill="none" stroke={t.target} strokeWidth="1.5" strokeDasharray="4 3"
                    points={objetivos.map(p => `${p.x},${p.y}`).join(' ')} />
        )}
        {target?.label && objetivos.length > 0 && (
          <text x={W - PAD_R - 2} y={yFor(objetivos[objetivos.length - 1].v) - 4}
                textAnchor="end" fill={t.target} fontSize="10">{target.label}</text>
        )}

        {/* Segmentos */}
        {segmentos.map((s, k) => (
          <polyline key={k} fill="none" stroke={t.lineStroke} strokeWidth="2"
                    strokeDasharray={s.dashed ? '5 3' : undefined}
                    points={s.pts.map(p => `${p.x},${p.y}`).join(' ')} />
        ))}

        {/* Puntos + eventos */}
        {puntos.map(p => {
          const estimado = p.estado === 'estimado'
          const label = `${fmtMes(p.mes)}: ${formatValor(p.v)}${estimado ? ' (estimado)' : ''}`
          return (
            <g key={p.i}
               onMouseEnter={() => setHoverIdx(p.i)}
               onMouseLeave={() => setHoverIdx(h => h === p.i ? null : h)}
               onFocus={() => setHoverIdx(p.i)}
               onBlur={() => setHoverIdx(h => h === p.i ? null : h)}
               tabIndex={0}
               role="button"
               aria-label={label}
               style={{ outline: 'none' }}>
              <circle cx={p.x} cy={p.y} r={estimado ? 3 : 4}
                      fill={t.lineStroke}
                      stroke={estimado ? t.lineStroke : 'none'}
                      strokeDasharray={estimado ? '2 2' : undefined} />
              {hoverIdx === p.i && (
                <Tip x={p.x} y={p.y} t={t} text={label} W={W} />
              )}
            </g>
          )
        })}

        {/* X labels */}
        {data.map((d, i) => {
          const parts = (d.mes || '').split('-')
          const mesLabel = fmtMes(d.mes)
          const yearLabel = parts[0]
          const showYear = i === 0 || parts[1] === '01'
          return (
            <g key={`x${i}`}>
              <text x={xFor(i)} y={H - PAD_B + 12} textAnchor="middle"
                    fill={t.textDim} fontSize="10">{mesLabel}</text>
              {showYear && (
                <text x={xFor(i)} y={H - PAD_B + 23} textAnchor="middle"
                      fill={t.textDim} fontSize="9">{yearLabel}</text>
              )}
            </g>
          )
        })}
        <line x1={PAD_L} x2={W - PAD_R} y1={yFor(0)} y2={yFor(0)}
              stroke={t.axis} strokeWidth="1" />
      </svg>
    </div>
  )
}

function Tip({ x, y, t, text, W }) {
  const w = Math.min(220, Math.max(60, text.length * 6))
  const tx = Math.max(4, Math.min(W - w - 4, x - w / 2))
  const ty = Math.max(4, y - 28)
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={22} rx={4} ry={4}
            fill={t.tooltipBg} opacity="0.95" />
      <text x={tx + w / 2} y={ty + 15} textAnchor="middle"
            fill={t.tooltipText} fontSize="11">{text}</text>
    </g>
  )
}
