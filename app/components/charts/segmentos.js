/**
 * Segmentación pura para gráficos de línea con mezcla cerrado/estimado.
 *
 * Regla: una línea es SÓLIDA entre dos meses cerrados consecutivos y
 * DISCONTINUA solo en el tramo que toca un mes estimado. El cambio de
 * estilo cae en el segmento que conecta un cerrado con el siguiente
 * estimado (ambos extremos presentes).
 *
 * Entrada:
 *   puntos: [{ i, x, y, mes, estado: 'cerrado' | 'estimado', v }]
 * Devuelve:
 *   [{ dashed: boolean, pts: [...] }, ...]
 *   — cada segmento tiene >=2 puntos (ignora puntos aislados).
 */

export function segmentarPorEstado(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 2) return []
  const out = []
  let i = 0
  while (i < puntos.length - 1) {
    const a = puntos[i]
    const b = puntos[i + 1]
    const dashed = a.estado === 'estimado' || b.estado === 'estimado'

    // Extender el segmento mientras el "modo" (dashed/sólido) no cambie
    const pts = [a, b]
    let j = i + 1
    while (j < puntos.length - 1) {
      const p = puntos[j]
      const q = puntos[j + 1]
      const nextDashed = p.estado === 'estimado' || q.estado === 'estimado'
      if (nextDashed !== dashed) break
      pts.push(q)
      j++
    }
    out.push({ dashed, pts })
    i = j
  }
  return out
}
