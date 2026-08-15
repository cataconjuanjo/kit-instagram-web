'use client'

export function Donut({ data, total }) {
  const R = 70, C = 2 * Math.PI * R, gap = 4
  let offset = 0

  return (
    <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Distribución por tipo">
      <g transform="rotate(-90 90 90)">
        {data.map((d, i) => {
          const len = (d.value / 100) * C
          const dash = Math.max(len - gap, 0)
          const el = (
            <circle
              key={i}
              cx="90"
              cy="90"
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth="15"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
            />
          )
          offset += len
          return el
        })}
      </g>
      <text
        x="90"
        y="87"
        textAnchor="middle"
        style={{ font: '600 34px "Cormorant Garamond", serif', fill: '#171416' }}
      >
        {total}
      </text>
      <text
        x="90"
        y="105"
        textAnchor="middle"
        style={{ font: '600 10px Inter, sans-serif', letterSpacing: '1.6px', fill: '#9a9186' }}
      >
        REFERENCIAS
      </text>
    </svg>
  )
}
