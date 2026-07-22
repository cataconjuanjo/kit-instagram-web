import { normalizarTexto } from './textNormalize'

export function incluyeTerminoCompleto(texto, termino) {
  const textoDelimitado = ` ${normalizarTexto(texto).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
  const terminoDelimitado = normalizarTexto(termino).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  return terminoDelimitado && textoDelimitado.includes(` ${terminoDelimitado} `)
}

export function textoPlano(valor) {
  if (!valor) return ''
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor)) return valor.map(textoPlano).join(' ')
  if (typeof valor === 'object') return Object.values(valor).map(textoPlano).join(' ')
  return ''
}

export function palabrasClave(texto) {
  const stop = new Set(['con', 'del', 'para', 'por', 'una', 'uno', 'los', 'las', 'que', 'vino', 'vinos', 'tipo', 'como', 'tambien', 'sobre'])
  return normalizarTexto(texto).split(/[^a-z0-9]+/).filter(p => p.length > 3 && !stop.has(p))
}

export function hashTexto(texto) {
  return normalizarTexto(texto).split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
}

export function ordenarConRotacion(items, semilla) {
  return [...items].sort((a, b) => {
    const scoreDiff = b.score - a.score
    if (Math.abs(scoreDiff) > 10) return scoreDiff
    const aHash = Math.abs(hashTexto(`${a.vino.id}-${semilla}`)) % 1000
    const bHash = Math.abs(hashTexto(`${b.vino.id}-${semilla}`)) % 1000
    return aHash - bHash
  })
}

export function elegirConRotacion(items, semilla, offset = 0) {
  if (!items.length) return null
  const ordenados = ordenarConRotacion(items, semilla)
  return ordenados[Math.abs(offset) % ordenados.length]
}
