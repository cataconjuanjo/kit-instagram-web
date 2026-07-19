export function normalizeWineFormatText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function wineFormatText(vino = {}) {
  return normalizeWineFormatText([
    vino.nombre,
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva,
    vino.notas_cata,
  ].filter(Boolean).join(' '))
}

export function isLargeFormatWine(vino = {}) {
  const text = wineFormatText(vino)
  return ['magnum', 'jeroboam'].some(term => text.includes(term))
}
