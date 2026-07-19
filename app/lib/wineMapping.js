function numero(valor) {
  return Number(valor) || 0
}

function pct(valor, total) {
  if (!total) return 0
  return Math.round((valor / total) * 100)
}

export function ticketReferencia(restaurante = {}) {
  const valor = numero(restaurante.ticket_medio || restaurante.ticket_medio_comida || restaurante.ticket_comida)
  return valor > 0
    ? { valor, fuente: 'ticket configurado', esEstimado: false }
    : { valor: null, fuente: 'no disponible', esEstimado: true }
}

export function calcularWineMapping(vinos = [], ticket) {
  const vinosConPrecio = (vinos || []).filter(vino => numero(vino.precio_botella) > 0)
  const total = vinosConPrecio.length
  if (!ticket || total === 0) {
    return {
      gamas: [],
      desajustes: [],
      referencias: null,
      reequilibrio: null,
      rangos: [],
      vinosConPrecio,
    }
  }

  const referencias = {
    actual: total,
    minimo: Math.round(ticket * 1.0),
    ideal: Math.round(ticket * 1.25),
    maximo: Math.round(ticket * 1.5),
  }
  referencias.estado = total < referencias.minimo
    ? 'corta'
    : total > referencias.maximo
      ? 'larga'
      : 'equilibrada'

  const tBaja = Math.max(22, ticket * 0.60)
  const tMedia = Math.max(tBaja + 10, ticket * 1.05)
  const tAlta = Math.max(tMedia + 14, ticket * 1.65)
  const tMuyAlta = Math.max(tAlta + 24, ticket * 2.50)
  const rangos = [
    { id: 'baja', label: 'Gama baja', objetivo: 20, min: 0, max: tBaja },
    { id: 'media', label: 'Gama media', objetivo: 45, min: tBaja, max: tMedia },
    { id: 'alta', label: 'Gama alta', objetivo: 15, min: tMedia, max: tAlta },
    { id: 'muy_alta', label: 'Muy alta', objetivo: 15, min: tAlta, max: tMuyAlta },
    { id: 'premium', label: 'Premium', objetivo: 5, min: tMuyAlta, max: Infinity },
  ]

  const totalObjetivo = referencias.estado === 'equilibrada' ? total : referencias.ideal
  const objetivosPorGama = rangos.map(rango => Math.round((rango.objetivo / 100) * totalObjetivo))
  const ajuste = totalObjetivo - objetivosPorGama.reduce((sum, valor) => sum + valor, 0)
  objetivosPorGama[1] = Math.max(0, objetivosPorGama[1] + ajuste)

  const gamas = rangos.map((rango, index) => {
    const vinosGama = vinosConPrecio
      .filter(vino => {
        const precio = numero(vino.precio_botella)
        return rango.max === Infinity ? precio >= rango.min : precio >= rango.min && precio < rango.max
      })
      .sort((a, b) => numero(a.precio_botella) - numero(b.precio_botella))
    const objetivoNumero = objetivosPorGama[index]
    const delta = vinosGama.length - objetivoNumero
    return {
      ...rango,
      vinos: vinosGama.length,
      objetivoNumero,
      delta,
      real: pct(vinosGama.length, total),
      diferencia: pct(vinosGama.length, total) - rango.objetivo,
      rangoTexto: rango.max === Infinity
        ? `desde ${Math.round(rango.min)}`
        : rango.min === 0
          ? `hasta ${Math.round(rango.max)}`
          : `${Math.round(rango.min)}-${Math.round(rango.max)}`,
      vinosDetalle: vinosGama.map(vino => ({
        id: vino.id,
        nombre: vino.nombre,
        bodega: vino.bodega,
        tipo: vino.tipo,
        region: vino.region,
        precio: numero(vino.precio_botella),
        coste: numero(vino.coste_compra),
        proveedor: vino.proveedor || '',
      })),
    }
  })

  const sobrantes = gamas.filter(gama => gama.delta > 0).map(gama => ({ label: gama.label, cantidad: gama.delta }))
  const faltantes = gamas.filter(gama => gama.delta < 0).map(gama => ({ label: gama.label, cantidad: Math.abs(gama.delta) }))
  const movimientos = []
  let surplusIndex = 0
  let deficitIndex = 0
  while (surplusIndex < sobrantes.length && deficitIndex < faltantes.length) {
    const cantidad = Math.min(sobrantes[surplusIndex].cantidad, faltantes[deficitIndex].cantidad)
    movimientos.push({
      cantidad,
      desde: sobrantes[surplusIndex].label,
      hacia: faltantes[deficitIndex].label,
      texto: `Sustituir ${cantidad} ref. de ${sobrantes[surplusIndex].label.toLowerCase()} por ${cantidad} ref. de ${faltantes[deficitIndex].label.toLowerCase()}`,
    })
    sobrantes[surplusIndex].cantidad -= cantidad
    faltantes[deficitIndex].cantidad -= cantidad
    if (sobrantes[surplusIndex].cantidad === 0) surplusIndex++
    if (faltantes[deficitIndex].cantidad === 0) deficitIndex++
  }

  const desajustes = gamas
    .filter(gama => Math.abs(gama.delta) > Math.max(1, Math.round(total * 0.10)) || (gama.vinos === 0 && gama.objetivoNumero > 0))
    .map(gama => `${gama.label}: ${gama.vinos} real vs ${gama.objetivoNumero} objetivo`)
  if (referencias.estado === 'corta') desajustes.unshift(`Carta corta: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)
  if (referencias.estado === 'larga') desajustes.unshift(`Carta larga: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)

  return {
    gamas,
    desajustes,
    referencias,
    rangos,
    vinosConPrecio,
    reequilibrio: {
      totalObjetivo,
      quitarTotal: Math.max(0, total - totalObjetivo),
      agregarTotal: Math.max(0, totalObjetivo - total),
      movimientos,
      resumen: movimientos.length
        ? movimientos.map(movimiento => movimiento.texto).join('. ')
        : referencias.estado === 'equilibrada'
          ? 'La cantidad total encaja; revisar solo excesos o huecos por gama.'
          : referencias.estado === 'corta'
            ? `Faltan ${Math.max(0, totalObjetivo - total)} referencias para acercarse al ideal.`
            : `Sobran ${Math.max(0, total - totalObjetivo)} referencias para acercarse al ideal.`,
    },
  }
}
