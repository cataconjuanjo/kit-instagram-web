'use client'

/**
 * BarsLine — barra (y izq) + línea (y der), viewBox = ancho real medido.
 * Línea sólida entre cerrados consecutivos; discontinua solo en el tramo
 * que llega a (o parte de) un mes estimado. Ignora puntos null (no barra
 * ni círculo). Dos ejes Y: € izq, €/% der.
 *
 * YoY opcional (prop `serieB`): barras fantasma del año anterior
 * (contorno + relleno muy atenuado detrás de la barra actual, mismo eje)
 * y una segunda línea discontinua gris atenuada. El tooltip muestra la
 * variación solo si el mes está en `comparables` (importe: Δ% sobre
 * |prev|; "—" si prev 0/null).
 */

import { useState } from 'react'
import { ChartShell } from './ChartShell'
import { useChartWidth } from './useChartWidth'
import { tokensChart } from './useDashboardDarkMode'
import { fmtMes, fmtEur, fmtPct, nicemax } from './format'
import { segmentarPorEstado } from './segmentos'

const PAD_L = 48, PAD_R = 44, PAD_T = 14, PAD_B = 36

export function BarsLine({
  data, titulo, subtitulo, loading = false,
  formatBar = fmtEur, formatLine = fmtPct,
  height = 240, mensajeVacio, tema = 'claro',
  serieB = null,
  comparables = [],
  etiquetaSeries = null,  // ej. "2026 / 2025"
}) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const [ref, W]                = useChartWidth(600)
  const t = tokensChart(tema === 'oscuro')

  const vacio = !data || data.length === 0 ||
    data.every(d =>
      (d.bar   == null || !Number.isFinite(Number(d.bar))) &&
      (d.linea == null || !Number.isFinite(Number(d.linea))))

  const subFinal = etiquetaSeries
    ? (subtitulo ? `${subtitulo} · ${etiquetaSeries}` : etiquetaSeries)
    : subtitulo

  return (
    <ChartShell titulo={titulo} subtitulo={subFinal} loading={loading} vacio={vacio}
                mensajeVacio={mensajeVacio} height={height} tema={tema}>
      <div ref={ref} style={{ width: '100%', minWidth: 0 }}>
        <Svg data={data} serieB={serieB} comparables={comparables}
             t={t} W={W} H={height}
             formatBar={formatBar} formatLine={formatLine}
             hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
      </div>
    </ChartShell>
  )
}

function Svg({ data, serieB, comparables, t, W, H, formatBar, formatLine, hoverIdx, setHoverIdx }) {
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = data.length
  const esEstrecho = W <= 360

  // Lookup serieB por número de mes
  const idxBByMes = serieBToMap(serieB)

  // Max barras: incluye serieB
  const barVals  = data.map(d => Number(d.bar)).filter(Number.isFinite)
  const barValsB = serieB ? (serieB.map(s => Number(s.bar)).filter(Number.isFinite)) : []
  const maxBar   = Math.max(...barVals, ...barValsB, 0, 1)
  const yMaxBar  = nicemax(maxBar)
  const barTicks = [0, yMaxBar * 0.25, yMaxBar * 0.5, yMaxBar * 0.75, yMaxBar]

  // Max línea: incluye serieB
  const lineVals = data.map(d => Number(d.linea)).filter(Number.isFinite)
  const lineValsB = serieB ? serieB.map(s => Number(s.linea)).filter(Number.isFinite) : []
  const minLine  = Math.min(0, ...lineVals, ...lineValsB)
  const maxLine  = Math.max(1, ...lineVals, ...lineValsB)
  const yMaxLine = nicemax(Math.max(Math.abs(maxLine), Math.abs(minLine)))

  const colW = innerW / Math.max(1, n)

  const yBar = v => PAD_T + innerH - (v / yMaxBar) * innerH
  const yLine = v => {
    const range = yMaxLine - (minLine < 0 ? -yMaxLine : 0)
    const base  = minLine < 0 ? -yMaxLine : 0
    return PAD_T + innerH - ((v - base) / range) * innerH
  }

  // Puntos de la línea actual (ignora null)
  const puntos = data
    .map((d, i) => (d.linea != null && Number.isFinite(Number(d.linea)))
      ? { i, x: PAD_L + i * colW + colW / 2, y: yLine(Number(d.linea)),
          v: Number(d.linea), estado: d.estado, mes: d.mes }
      : null)
    .filter(Boolean)
  const segmentos = segmentarPorEstado(puntos)

  // Puntos de la línea secundaria (serieB)
  const puntosB = []
  if (serieB) {
    data.forEach((d, i) => {
      const m = mesNum(d.mes)
      const b = idxBByMes.get(m)
      if (b && b.linea != null && Number.isFinite(Number(b.linea))) {
        puntosB.push({ i, x: PAD_L + i * colW + colW / 2, y: yLine(Number(b.linea)), v: Number(b.linea) })
      }
    })
  }

  const barW = Math.max(4, colW * 0.55)
  const comparablesSet = new Set(comparables || [])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
         aria-label={`Evolución mensual: ${data.length} meses${serieB ? ' (incluye año anterior)' : ''}`}
         style={{ display: 'block', fontFamily: 'inherit' }}>
      {barTicks.map((v, i) => (
        <line key={`g${i}`} x1={PAD_L} x2={W - PAD_R} y1={yBar(v)} y2={yBar(v)}
              stroke={t.grid} strokeWidth="1" />
      ))}
      {barTicks.map((v, i) => (
        <text key={`yl${i}`} x={PAD_L - 6} y={yBar(v) + 3} textAnchor="end"
              fill={t.textDim} fontSize="10">{formatBar(v)}</text>
      ))}
      {[-yMaxLine, 0, yMaxLine].filter(v => minLine < 0 || v >= 0).map((v, i) => (
        <text key={`yr${i}`} x={W - PAD_R + 6} y={yLine(v) + 3} textAnchor="start"
              fill={t.lineStroke} fontSize="10">{formatLine(v)}</text>
      ))}

      {/* Barras del año anterior (serieB): detrás, mismo x, relleno muy
          atenuado + contorno suave. Mismo barW. */}
      {serieB && data.map((d, i) => {
        const m = mesNum(d.mes)
        const b = idxBByMes.get(m)
        if (!b || b.bar == null || !Number.isFinite(Number(b.bar))) return null
        const v = Number(b.bar)
        const x = PAD_L + i * colW + (colW - barW) / 2
        const y = yBar(Math.max(0, v))
        const h = Math.max(0, innerH - (y - PAD_T))
        return (
          <rect key={`b-prev-${i}`} x={x} y={y} width={barW} height={h}
                fill={t.barFill} fillOpacity="0.15"
                stroke={t.barFill} strokeOpacity="0.55"
                strokeDasharray="3 2" strokeWidth="1" rx={2} ry={2}
                pointerEvents="none" />
        )
      })}

      {/* Barras actuales (null → no se dibuja) */}
      {data.map((d, i) => {
        if (d.bar == null || !Number.isFinite(Number(d.bar))) return null
        const v = Number(d.bar)
        const x = PAD_L + i * colW + (colW - barW) / 2
        const y = yBar(Math.max(0, v))
        const h = Math.max(0, innerH - (y - PAD_T))
        const estimado = d.estado === 'estimado'
        const m = mesNum(d.mes)
        const b = idxBByMes.get(m)
        const esComparable = comparablesSet.has(m)
        const label = buildTooltip({
          mes: d.mes, bar: v, linea: d.linea,
          barPrev: b?.bar,
          formatBar, formatLine, estimado, esComparable, tieneSerieB: !!serieB,
        })
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

      {/* Línea secundaria del año anterior */}
      {puntosB.length > 1 && (
        <polyline fill="none" stroke={t.target} strokeOpacity="0.75" strokeWidth="1.5"
                  strokeDasharray="4 3"
                  points={puntosB.map(p => `${p.x},${p.y}`).join(' ')} />
      )}
      {puntosB.map(p => (
        <circle key={`cB${p.i}`} cx={p.x} cy={p.y} r={2}
                fill={t.target} opacity="0.75" pointerEvents="none" />
      ))}

      {/* Segmentos de línea actual */}
      {segmentos.map((s, k) => (
        <polyline key={k} fill="none" stroke={t.lineStroke} strokeWidth="2"
                  strokeDasharray={s.dashed ? '5 3' : undefined}
                  points={s.pts.map(p => `${p.x},${p.y}`).join(' ')} />
      ))}
      {puntos.map(p => (
        <circle key={`c${p.i}`} cx={p.x} cy={p.y} r={3} fill={t.lineStroke}
                opacity={p.estado === 'estimado' ? 0.7 : 1} />
      ))}

      {data.map((d, i) => {
        if (esEstrecho && i % 2 === 1) return null
        const parts = (d.mes || '').split('-')
        const mesLabel = fmtMes(d.mes)
        const esEnero = parts[1] === '01'
        const x = PAD_L + i * colW + colW / 2
        return (
          <g key={`x${i}`}>
            <text x={x} y={H - PAD_B + 14} textAnchor="middle"
                  fill={t.textDim} fontSize="10">{mesLabel}</text>
            {esEnero && (
              <text x={x} y={H - PAD_B + 28} textAnchor="middle"
                    fill={t.textDim} fontSize="9">{parts[0]}</text>
            )}
          </g>
        )
      })}
      <line x1={PAD_L} x2={W - PAD_R} y1={yBar(0)} y2={yBar(0)}
            stroke={t.axis} strokeWidth="1" />
    </svg>
  )
}

function mesNum(mesStr) {
  if (mesStr == null) return null
  const str = String(mesStr)
  const parts = str.split('-')
  const token = parts.length > 1 ? parts[1] : parts[0]
  if (token == null || token === '' || !/^\d+$/.test(token)) return null
  const n = Number(token)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}

function serieBToMap(serieB) {
  const m = new Map()
  if (!serieB) return m
  for (const s of serieB) {
    // mes puede venir como 'YYYY-MM', 'MM' o entero 1..12
    const raw = s.mes
    let k = null
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 12) k = raw
    else if (typeof raw === 'string') {
      const parts = raw.split('-')
      const n = Number(parts.length > 1 ? parts[1] : parts[0])
      if (Number.isInteger(n) && n >= 1 && n <= 12) k = n
    }
    if (k != null) m.set(k, s)
  }
  return m
}

function buildTooltip({ mes, bar, linea, barPrev, formatBar, formatLine, estimado, esComparable, tieneSerieB }) {
  const base = `${fmtMes(mes)}${String(mes || '').endsWith('-01') ? ' ' + String(mes).slice(0, 4) : ''}: ${formatBar(bar)}`
  const lineaInfo = (linea != null && Number.isFinite(Number(linea)))
    ? ' · ' + formatLine(Number(linea)) : ''
  let yoy = ''
  if (tieneSerieB && esComparable) {
    if (barPrev == null) {
      yoy = '  (prev — · Δ —)'
    } else {
      const barPrevNum = Number(barPrev)
      if (!Number.isFinite(barPrevNum)) {
        yoy = '  (prev — · Δ —)'
      } else if (barPrevNum === 0) {
        yoy = `  (prev ${formatBar(0)} · Δ —)`
      } else {
        const delta = Number(bar) - barPrevNum
        const dPct  = delta / Math.abs(barPrevNum) * 100
        const sign  = dPct >= 0 ? '+' : ''
        yoy = `  (prev ${formatBar(barPrevNum)} · ${sign}${dPct.toFixed(1)}%)`
      }
    }
  }
  const estimadoTxt = estimado ? ' (estimado)' : ''
  return `${base}${lineaInfo}${yoy}${estimadoTxt}`
}

function Tip({ x, y, t, text, W }) {
  const w = Math.min(320, Math.max(60, text.length * 6))
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
