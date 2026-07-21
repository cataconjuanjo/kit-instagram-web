export const WINE_PROFILE_AXES = ['dulzor', 'acidez', 'taninos', 'alcohol', 'cuerpo', 'intensidad', 'final']

export const WINE_PROFILE_LABELS = {
  dulzor: 'Dulzor',
  acidez: 'Acidez',
  taninos: 'Taninos',
  alcohol: 'Alcohol',
  cuerpo: 'Cuerpo',
  intensidad: 'Intensidad',
  final: 'Final',
}

export function radarPath(perfil, cx, cy, r, axes = WINE_PROFILE_AXES) {
  return axes.map((eje, idx) => {
    const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2
    const val = (perfil[eje] || 1) / 5
    const x = cx + r * val * Math.cos(angle)
    const y = cy + r * val * Math.sin(angle)
    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ') + ' Z'
}

export function radarGridPath(level, cx, cy, r, axes = WINE_PROFILE_AXES) {
  return axes.map((_, idx) => {
    const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2
    const x = cx + r * level * Math.cos(angle)
    const y = cy + r * level * Math.sin(angle)
    return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ') + ' Z'
}
