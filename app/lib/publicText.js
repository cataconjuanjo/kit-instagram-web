export function limpiarTextoPublico(texto = '') {
  return String(texto || '')
    .replace(/Â·/g, '·')
    .replace(/Ã—/g, '×')
    .replace(/â‚¬/g, '€')
    .replace(/\s+\?\s+/g, ' · ')
    .replace(/malague\?as/gi, match => match[0] === 'M' ? 'Malagueñas' : 'malagueñas')
    .replace(/gustar\?a/gi, match => match[0] === 'G' ? 'Gustaría' : 'gustaría')
    .replace(/\bqu\?/gi, match => match[0] === 'Q' ? 'Qué' : 'qué')
    .replace(/\bm\?s\b/gi, match => match[0] === 'M' ? 'Más' : 'más')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
