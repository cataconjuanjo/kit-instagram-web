import { hashTexto } from './camareroTextUtils'
import { normalizarTexto } from './textNormalize'

export function crearFirmaRecomendacionVenta({
  restauranteId = '',
  consulta = '',
  objetivoVenta = '',
  perfilClienteVenta = {},
  rotacionVenta = 0,
} = {}) {
  return [
    restauranteId || 'sin-restaurante',
    normalizarTexto(consulta).slice(0, 180),
    objetivoVenta,
    perfilClienteVenta.bebe || '',
    perfilClienteVenta.estilo || '',
    perfilClienteVenta.gama || '',
    rotacionVenta,
  ].join('|')
}

export function crearGrupoRecomendacionVenta(firma) {
  return `grp_${Math.abs(hashTexto(firma))}`
}

export function crearIdRecomendacionVenta({ firma = '', item = {}, index = 0 } = {}) {
  const vino = item?.vino || {}
  const vinoId = vino.id || vino.nombre || ''
  return `rec_${Math.abs(hashTexto(`${firma}|${vinoId}|${item?.label || ''}|${index + 1}`))}`
}
