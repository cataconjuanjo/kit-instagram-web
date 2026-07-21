'use client'

import { WINE_PROFILE_AXES, WINE_PROFILE_LABELS, radarGridPath, radarPath } from '../lib/wineProfileRadar'

const DASH_PATTERNS = ['none', '6,3', 'none', '6,3']

export default function WineProfileRadarChart({
  vinos,
  perfiles,
  coloresVino,
  ejes = WINE_PROFILE_AXES,
  etiquetas = WINE_PROFILE_LABELS,
  gridStroke = '#f0f0f0',
  labelFill = '#aaa',
  fillOpacity = 0.12,
  labelStyle,
}) {
  const cx = 150
  const cy = 150
  const r = 100

  return (
    <svg width={300} height={300} viewBox="0 0 300 300">
      {[0.2, 0.4, 0.6, 0.8, 1].map(level => (
        <path key={level} d={radarGridPath(level, cx, cy, r, ejes)} fill="none" stroke={gridStroke} strokeWidth={1} />
      ))}
      {ejes.map((_, idx) => {
        const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
        return <line key={idx} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke={gridStroke} strokeWidth={1} />
      })}
      {ejes.map((eje, idx) => {
        const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
        const lx = cx + (r + 20) * Math.cos(angle)
        const ly = cy + (r + 20) * Math.sin(angle)
        return (
          <text key={eje} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill={labelFill} style={labelStyle}>
            {etiquetas[eje]}
          </text>
        )
      })}
      {vinos.map((vino, idx) => {
        const perfil = perfiles[vino.id]
        if (!perfil) return null
        return (
          <path
            key={vino.id}
            d={radarPath(perfil, cx, cy, r, ejes)}
            fill={coloresVino[idx]}
            fillOpacity={fillOpacity}
            stroke={coloresVino[idx]}
            strokeWidth={idx % 2 === 0 ? 2.5 : 1.5}
            strokeDasharray={DASH_PATTERNS[idx]}
          />
        )
      })}
    </svg>
  )
}
