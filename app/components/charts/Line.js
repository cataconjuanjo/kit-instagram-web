'use client'

/**
 * Line — línea SVG con viewBox = ancho real medido. Segmentación por
 * segmentarPorEstado: sólido entre cerrados, discontinuo cuando toca
 * un mes estimado. No pinta punto para valor null.
 *
 * YoY opcional (prop `serieB`): segunda línea discontinua gris/tono
 * atenuado con puntos pequeños del año anterior. El tooltip muestra
 * la variación solo si el mes está en `comparables`. Para la variación
 * se puede pedir Δ en pp (`tipoVariacion='ratio'`) o Δ% sobre |prev|
 * (`tipoVariacion='importe'`, default).
 */

import { useState } from 'react'
import { ChartShell } from './ChartShell'
import { useChartWidth } from './useChartWidth'
import { tokensChart } from './useDashboardDarkMode'
import { fmtMes, fmtPct, escalaPct } from './format'
import { segmentarPorEstado } from './segmentos'
import { buildLineTooltip, etiquetaAnioPrev } from './tooltips'

const PAD_L = 44, PAD_R = 14, PAD_T = 14, PAD_B = 36

export function Line({
  data, titulo, subtitulo, loading = false, formatValor = fmtPct,
  target = null, height = 240, mensajeVacio, tema = 'claro',
  serieB = null,
  comparables = [],
  etiquetaSeries = null,
  tipoVariacion = 'importe',  // 'importe' | 'ratio'
}) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const [ref, W]                = useChartWidth(600)
  const t = tokensChart(tema === 'oscuro')

  const vacio = !data || data.length === 0 ||
    data.every(d => d.valor == null || !Number.isFinite(Number(d.valor)))

  const subFinal = etiquetaSeries
    ? (subtitulo ? `${subtitulo} · ${etiquetaSeries}` : etiquetaSeries)
    : subtitulo

  const anioPrevLabel = etiquetaAnioPrev(serieB, etiquetaSeries)

  return (
    <ChartShell titulo={titulo} subtitulo={subFinal} loading={loading} vacio={vacio}
                mensajeVacio={mensajeVacio} height={height} tema={tema}>
      <div ref={ref} style={{ width: '100%', minWidth: 0 }}>
        <LineSvg data={data} serieB={serieB} comparables={comparables}
                 tipoVariacion={tipoVariacion} anioPrevLabel={anioPrevLabel}
                 t={t} W={W} H={height} target={target}
                 formatValor={formatValor} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx} />
      </div>
    </ChartShell>
  )
}

function LineSvg({ data, serieB, comparables, tipoVariacion, anioPrevLabel, t, W, H, target, formatValor, hoverIdx, setHoverIdx }) {
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const n = data.length
  const esEstrecho = W <= 360

  const idxBByMes = serieBToMap(serieB)

  // Filtrar null/undefined ANTES de Number(): Number(null)===0 pasa
  // Number.isFinite, lo cual mete un 0 falso en la escala y la aplasta.
  const valoresEscala = []
  for (const d of data) {
    if (d.valor != null && Number.isFinite(Number(d.valor))) {
      valoresEscala.push(Number(d.valor))
    }
    if (d.objetivo != null && Number.isFinite(Number(d.objetivo))) {
      valoresEscala.push(Number(d.objetivo))
    }
  }
  if (serieB) {
    for (const s of serieB) {
      if (s.valor != null && Number.isFinite(Number(s.valor))) {
        valoresEscala.push(Number(s.valor))
      }
    }
  }
  const { min: yMin, max: yMax } = escalaPct(valoresEscala)
  const yTicks = [yMin, yMin + (yMax - yMin) * 0.25, yMin + (yMax - yMin) * 0.5,
                  yMin + (yMax - yMin) * 0.75, yMax]
  const colW = innerW / Math.max(1, n - 1)

  const xFor = i => PAD_L + i * colW
  const yFor = v => PAD_T + innerH - ((v - yMin) / (yMax - yMin)) * innerH

  const puntos = data
    .map((d, i) => (d.valor != null && Number.isFinite(Number(d.valor)))
      ? { i, x: xFor(i), y: yFor(Number(d.valor)), v: Number(d.valor), estado: d.estado, mes: d.mes }
      : null)
    .filter(Boolean)

  const segmentos = segmentarPorEstado(puntos)

  // Línea secundaria (serieB) alineada por número de mes
  const puntosB = []
  if (serieB) {
    data.forEach((d, i) => {
      const m = mesNum(d.mes)
      const b = idxBByMes.get(m)
      if (b && b.valor != null && Number.isFinite(Number(b.valor))) {
        puntosB.push({ i, x: xFor(i), y: yFor(Number(b.valor)), v: Number(b.valor) })
      }
    })
  }

  const objetivos = data
    .map((d, i) => (d.objetivo != null && Number.isFinite(Number(d.objetivo)))
      ? { i, x: xFor(i), y: yFor(Number(d.objetivo)), v: Number(d.objetivo) }
      : null)
    .filter(Boolean)

  const comparablesSet = new Set(comparables || [])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
         aria-label={`Línea de ${data.length} meses`}
         style={{ display: 'block', fontFamily: 'inherit' }}>
      {yTicks.map((v, i) => (
        <line key={`g${i}`} x1={PAD_L} x2={W - PAD_R} y1={yFor(v)} y2={yFor(v)}
              stroke={t.grid} strokeWidth="1" />
      ))}
      {yTicks.map((v, i) => (
        <text key={`yl${i}`} x={PAD_L - 6} y={yFor(v) + 3} textAnchor="end"
              fill={t.textDim} fontSize="10">{formatValor(v)}</text>
      ))}

      {objetivos.length > 1 && (
        <polyline fill="none" stroke={t.target} strokeWidth="1.5" strokeDasharray="4 3"
                  points={objetivos.map(p => `${p.x},${p.y}`).join(' ')} />
      )}
      {target?.label && objetivos.length > 0 && (
        <text x={W - PAD_R - 2} y={yFor(objetivos[objetivos.length - 1].v) - 4}
              textAnchor="end" fill={t.target} fontSize="10">{target.label}</text>
      )}

      {/* Línea secundaria del año anterior (serieB) — detrás.
          Trazo distinto del objetivo: punteado FINO gris claro
          (dasharray "2 2") para evitar confusión con la línea
          "Objetivo" (dasharray "4 3" oscuro) del presupuesto. */}
      {puntosB.length > 1 && (
        <polyline fill="none" stroke={t.textDim} strokeOpacity="0.55" strokeWidth="1"
                  strokeDasharray="2 2"
                  points={puntosB.map(p => `${p.x},${p.y}`).join(' ')} />
      )}
      {puntosB.map(p => (
        <circle key={`cB${p.i}`} cx={p.x} cy={p.y} r={2}
                fill={t.textDim} opacity="0.55" pointerEvents="none" />
      ))}
      {puntosB.length > 0 && anioPrevLabel && (
        <text x={W - PAD_R - 2}
              y={puntosB[puntosB.length - 1].y - 4}
              textAnchor="end" fill={t.textDim} fontSize="10"
              style={{ opacity: 0.75 }}>{anioPrevLabel}</text>
      )}

      {segmentos.map((s, k) => (
        <polyline key={k} fill="none" stroke={t.lineStroke} strokeWidth="2"
                  strokeDasharray={s.dashed ? '5 3' : undefined}
                  points={s.pts.map(p => `${p.x},${p.y}`).join(' ')} />
      ))}

      {puntos.map(p => {
        const estimado = p.estado === 'estimado'
        const m = mesNum(p.mes)
        const b = idxBByMes.get(m)
        const esComparable = comparablesSet.has(m)
        const label = buildLineTooltip({
          mes: p.mes, valor: p.v, valorPrev: b?.valor,
          formatValor, estimado, esComparable, tieneSerieB: !!serieB,
          tipoVariacion, anioPrevLabel,
        })
        return (
          <g key={p.i}
             onMouseEnter={() => setHoverIdx(p.i)}
             onMouseLeave={() => setHoverIdx(h => h === p.i ? null : h)}
             onFocus={() => setHoverIdx(p.i)}
             onBlur={() => setHoverIdx(h => h === p.i ? null : h)}
             tabIndex={0} role="button" aria-label={label}
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

      {data.map((d, i) => {
        if (esEstrecho && i % 2 === 1) return null
        const parts = (d.mes || '').split('-')
        const mesLabel = fmtMes(d.mes)
        const esEnero = parts[1] === '01'
        return (
          <g key={`x${i}`}>
            <text x={xFor(i)} y={H - PAD_B + 14} textAnchor="middle"
                  fill={t.textDim} fontSize="10">{mesLabel}</text>
            {esEnero && (
              <text x={xFor(i)} y={H - PAD_B + 28} textAnchor="middle"
                    fill={t.textDim} fontSize="9">{parts[0]}</text>
            )}
          </g>
        )
      })}
      <line x1={PAD_L} x2={W - PAD_R} y1={yFor(0)} y2={yFor(0)}
            stroke={t.axis} strokeWidth="1" />
    </svg>
  )
}

function Tip({ x, y, t, text, W }) {
  const w = Math.min(320, Math.max(60, text.length * 6))
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

