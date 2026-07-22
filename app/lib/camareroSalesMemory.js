import { normalizarTexto } from './textNormalize'

const SIN_AJUSTE_APRENDIZAJE = { ajuste: 0, muestras: 0 }
const SIN_AJUSTE_EXPOSICION = { ajuste: 0, veces: 0 }

export function claveConsultaSala(texto) {
  return normalizarTexto(String(texto || '')
    .split(':')[0]
    .replace(/\([^)]*\)/g, ' '))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mismoVinoSala(vino, evento) {
  const idEvento = String(evento?.vino_id || '')
  const idVino = String(vino?.id || '')
  const nombreEvento = normalizarTexto(evento?.vino || '')
  const nombreVino = normalizarTexto(vino?.nombre || '')
  return Boolean(idEvento && idVino && idEvento === idVino) ||
    Boolean(nombreEvento && nombreVino && nombreEvento === nombreVino)
}

export function pesoConsultaSala(evento, consultas = [], contexto = '', resolverContexto = () => '') {
  const consultaEvento = claveConsultaSala(evento?.plato || evento?.consulta || '')
  const consultasBase = consultas.map(claveConsultaSala).filter(Boolean)
  if (consultaEvento && consultasBase.some(consulta => consultaEvento === consulta || consultaEvento.includes(consulta) || consulta.includes(consultaEvento))) return 1

  const contextoEvento = resolverContexto(normalizarTexto(evento?.plato || evento?.consulta || ''))
  return contextoEvento === contexto ? 0.35 : 0
}

export function calcularAjusteAprendizajeVenta({
  vino,
  contexto,
  historialVenta = [],
  resolverContexto = () => '',
} = {}) {
  if (!historialVenta.length) return SIN_AJUSTE_APRENDIZAJE

  const pesos = historialVenta.reduce((acc, evento) => {
    const mismoVino = String(evento.vino_id) === String(vino?.id)
    if (!mismoVino) return acc

    const contextoEvento = resolverContexto(normalizarTexto(evento.plato || ''))
    const mismoContexto = contextoEvento === contexto
    const pesoContexto = mismoContexto ? 1 : 0.35
    const pesoResultado = evento.resultado === 'vendida'
      ? 2.2
      : evento.resultado === 'no_convence'
        ? -2
        : evento.resultado === 'otra'
          ? -1
          : evento.resultado === 'no_stock' || evento.resultado === 'agotado'
            ? -3
            : 0

    return {
      total: acc.total + (pesoResultado * pesoContexto),
      muestras: acc.muestras + pesoContexto,
      vendidas: acc.vendidas + (evento.resultado === 'vendida' ? pesoContexto : 0),
    }
  }, { total: 0, muestras: 0, vendidas: 0 })

  if (!pesos.muestras) return SIN_AJUSTE_APRENDIZAJE

  const confianza = Math.min(pesos.muestras / 6, 1)
  const ajuste = Math.max(-4, Math.min(4, pesos.total * confianza))
  return { ajuste, muestras: pesos.muestras, vendidas: pesos.vendidas }
}

export function calcularAjusteExposicionRecomendacion({
  vino,
  contexto,
  historialRecomendaciones = [],
  resolverContexto = () => '',
} = {}) {
  if (!historialRecomendaciones.length) return SIN_AJUSTE_EXPOSICION

  const datos = historialRecomendaciones.reduce((acc, evento) => {
    const mismoVino = String(evento.vino_id) === String(vino?.id) || normalizarTexto(evento.vino) === normalizarTexto(vino?.nombre)
    if (!mismoVino) return acc

    const contextoEvento = resolverContexto(normalizarTexto(evento.consulta || ''))
    const mismoContexto = contextoEvento === contexto
    const peso = mismoContexto ? 1 : 0.35
    return {
      total: acc.total + peso,
      mismoContexto: acc.mismoContexto + (mismoContexto ? 1 : 0),
    }
  }, { total: 0, mismoContexto: 0 })

  if (!datos.total) return SIN_AJUSTE_EXPOSICION

  const ajuste = -Math.min(4, Math.log2(datos.total + 1) * 1.2)
  return { ajuste, veces: datos.total, mismoContexto: datos.mismoContexto }
}

export function calcularSenalComercialSala({
  vino,
  consultas = [],
  contexto,
  historialVenta = [],
  historialRecomendaciones = [],
  resolverContexto = () => '',
  precioBotella = () => 0,
  opciones = {},
} = {}) {
  const base = {
    visible: false,
    ajuste: 0,
    tipo: 'medir',
    label: '',
    texto: '',
    ventas: 0,
    dudas: 0,
    stock: 0,
    recomendaciones: 0,
    conversion: 0,
  }

  if (!historialVenta.length && !historialRecomendaciones.length) return base

  const resumen = historialVenta.reduce((acc, evento) => {
    if (!mismoVinoSala(vino, evento)) return acc
    const peso = pesoConsultaSala(evento, consultas, contexto, resolverContexto)
    if (!peso) return acc
    const cantidad = Number(evento.cantidad) || 1
    const importe = Number(evento.importe_vino_estimado) || 0

    acc.muestras += peso
    acc.feedback += peso
    if (evento.resultado === 'vendida') {
      acc.ventas += cantidad * peso
      acc.ventasEventos += peso
      acc.importe += importe * peso
    }
    if (['no_convence', 'otra'].includes(evento.resultado)) acc.dudas += peso
    if (['no_stock', 'agotado'].includes(evento.resultado)) acc.stock += peso
    return acc
  }, { muestras: 0, feedback: 0, ventas: 0, ventasEventos: 0, dudas: 0, stock: 0, importe: 0 })

  const recomendaciones = historialRecomendaciones.reduce((acc, evento) => {
    if (!mismoVinoSala(vino, evento)) return acc
    return acc + pesoConsultaSala(evento, consultas, contexto, resolverContexto)
  }, 0)

  const totalFeedback = resumen.ventasEventos + resumen.dudas + resumen.stock
  const conversion = recomendaciones ? Math.round((resumen.ventasEventos / recomendaciones) * 100) : resumen.ventasEventos ? 100 : 0
  const valorMedio = resumen.ventas ? resumen.importe / resumen.ventas : 0
  const precio = precioBotella(vino)
  const confianza = Math.min((totalFeedback + recomendaciones * 0.35) / 5, 1)
  let tipo = 'medir'
  let label = ''
  let texto = ''
  let ajusteBase = 0

  if (resumen.stock >= 1) {
    tipo = 'stock'
    label = 'Confirmar stock'
    texto = 'Ya hubo aviso de stock con una mesa parecida. Ofrecelo solo tras comprobar bodega.'
    ajusteBase = -4
  } else if (resumen.dudas >= 1 && resumen.dudas >= resumen.ventasEventos) {
    tipo = 'duda'
    label = 'Revisar argumento'
    texto = 'Ha generado dudas o cambios. Mantiene el encaje, pero conviene preparar alternativa.'
    ajusteBase = -2.8
  } else if (resumen.ventasEventos >= 1 && conversion >= 50) {
    tipo = 'funciona'
    label = 'Ha funcionado en sala'
    texto = `${Math.round(resumen.ventas)} venta${Math.round(resumen.ventas) === 1 ? '' : 's'} registrada${Math.round(resumen.ventas) === 1 ? '' : 's'} con esta consulta o contexto.`
    ajusteBase = 3.5
  } else if (resumen.ventasEventos >= 1 && (valorMedio >= 35 || precio >= (opciones.umbralUpsell || 35))) {
    tipo = 'upsell'
    label = 'Buen upsell'
    texto = 'Ya se vendi\u00f3 como opci\u00f3n de m\u00e1s valor. \u00dasalo cuando la mesa acepte algo especial.'
    ajusteBase = 2.4
  } else if (recomendaciones >= 2 && !totalFeedback) {
    tipo = 'medir'
    label = 'Medir resultado'
    texto = 'Se ha recomendado varias veces, pero falta marcar si vende o genera dudas.'
    ajusteBase = -0.8
  }

  const ajuste = Math.max(-4, Math.min(3.5, ajusteBase * Math.max(confianza, tipo === 'stock' ? 0.85 : 0.55)))
  return {
    visible: Boolean(label),
    ajuste,
    tipo,
    label,
    texto,
    ventas: Math.round(resumen.ventas),
    dudas: Math.round(resumen.dudas),
    stock: Math.round(resumen.stock),
    recomendaciones: Math.round(recomendaciones),
    conversion,
  }
}
