'use client'

import styles from './DonutEquilibrio.module.css'

const RADIO = 56
const CIRCUNFERENCIA = 2 * Math.PI * RADIO
const GROSOR = 18

function arcos(data) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return []
  let offset = 0
  return data.map(item => {
    const pct = item.value / total
    const dash = pct * CIRCUNFERENCIA
    const result = { ...item, dash, gap: CIRCUNFERENCIA - dash, offset, pct }
    offset += dash
    return result
  })
}

export default function DonutEquilibrio({ data = [], totalLabel = '', totalCaption = '', rentabilidad = null, rotacion = null }) {
  const segmentos = arcos(data)
  const size = (RADIO + GROSOR) * 2 + 4

  return (
    <div className={styles.wrap}>
      <div className={styles.chart}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Distribución de la carta por secciones"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={RADIO}
            fill="none"
            stroke="rgba(42,33,28,0.08)"
            strokeWidth={GROSOR}
          />
          {segmentos.map((seg, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={RADIO}
              fill="none"
              stroke={seg.color}
              strokeWidth={GROSOR}
              strokeDasharray={`${seg.dash} ${seg.gap}`}
              strokeDashoffset={-seg.offset + CIRCUNFERENCIA / 4}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <div className={styles.center} aria-hidden="true">
          <span className={styles.centerTotal}>{totalLabel}</span>
          <span className={styles.centerCaption}>{totalCaption}</span>
        </div>
      </div>

      <div className={styles.legend}>
        {segmentos.map((seg, i) => (
          <div key={i} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: seg.color }} />
            <span className={styles.legendLabel}>{seg.label}</span>
            <span className={styles.legendPct}>{Math.round(seg.pct * 100)}%</span>
          </div>
        ))}
      </div>

      {(rentabilidad != null || rotacion != null) && (
        <div className={styles.kpis}>
          {rentabilidad != null && (
            <div className={styles.kpi}>
              <span className={styles.kpiValue}>{rentabilidad}%</span>
              <span className={styles.kpiCaption}>Margen medio</span>
            </div>
          )}
          {rotacion != null && (
            <div className={styles.kpi}>
              <span className={styles.kpiValue}>{rotacion}x</span>
              <span className={styles.kpiCaption}>Rotación</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
