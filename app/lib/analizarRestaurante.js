// Motor único de análisis del consultor.
// Fase J-fix 2: antes había una copia de `analizar()` en Radar y otra en
// ficha, con reglas diferentes (2 alertas más en Radar y distinto
// `localTermsForRestaurant`). El mismo restaurante daba 54 en Radar y 36
// en ficha. Este módulo es la fuente única: Radar y ficha lo importan.

import { isLocalWine, localTermsForRestaurant } from './wineRegion.js'

export function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function pct(valor, total) {
  return total ? Math.round((valor / total) * 100) : 0
}

export function decimal(valor) {
  return Number(valor) || 0
}

export function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

export function incluye(texto, terminos) {
  const limpio = normalizar(texto)
  return terminos.some(termino => limpio.includes(normalizar(termino)))
}

export function textoVino(vino) {
  return `${vino.nombre || ''} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`
}

export function textoPlato(plato) {
  return `${plato.nombre || ''} ${plato.descripcion || ''} ${plato.categoria || ''}`
}

export function ticketReferencia(restaurante, platosActivos) {
  const ticketGuardado = decimal(restaurante?.ticket_medio || restaurante?.ticket_medio_comida || restaurante?.ticket_comida)
  if (ticketGuardado > 0) return { valor: ticketGuardado, fuente: 'ticket configurado', ticketEsEstimado: false }
  const platosConPrecio = platosActivos.filter(p => decimal(p.precio) > 0)
  if (platosConPrecio.length) {
    const mediaPlato = platosConPrecio.reduce((sum, p) => sum + decimal(p.precio), 0) / platosConPrecio.length
    return { valor: Math.round(mediaPlato * 2.5), fuente: 'estimado por carta de comida', ticketEsEstimado: true }
  }
  return { valor: null, fuente: 'no disponible', ticketEsEstimado: true }
}

// Formato enriquecido del mapa de precios. La ficha lo necesita porque
// renderiza `gama.vinosDetalle.map(...)`, `gama.delta`, `gama.objetivoNumero`
// y `reequilibrio.movimientos`. El Radar sólo usa `desajustes.length`, así
// que este formato es superset del anterior y lo sustituye en el motor.
export function mapaPrecios(vinosConPrecio, ticket) {
  if (!ticket) return { gamas: [], desajustes: [], referencias: null, reequilibrio: null, base: 'sin_ticket' }
  const total = vinosConPrecio.length
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
    { id: 'baja',     label: 'Gama baja',  objetivo: 20, min: 0,        max: tBaja    },
    { id: 'media',    label: 'Gama media', objetivo: 45, min: tBaja,    max: tMedia   },
    { id: 'alta',     label: 'Gama alta',  objetivo: 15, min: tMedia,   max: tAlta    },
    { id: 'muy_alta', label: 'Muy alta',   objetivo: 15, min: tAlta,    max: tMuyAlta },
    { id: 'premium',  label: 'Premium',    objetivo:  5, min: tMuyAlta, max: Infinity },
  ]
  const totalObjetivo = referencias.estado === 'equilibrada' ? total : referencias.ideal
  const objetivosPorGama = rangos.map(r => Math.round((r.objetivo / 100) * totalObjetivo))
  const ajusteObjetivo = totalObjetivo - objetivosPorGama.reduce((s, v) => s + v, 0)
  objetivosPorGama[1] = Math.max(0, objetivosPorGama[1] + ajusteObjetivo)

  const gamas = rangos.map((rango, index) => {
    const vinos = vinosConPrecio
      .filter(v => {
        const precio = decimal(v.precio_botella)
        return rango.max === Infinity ? precio >= rango.min : precio >= rango.min && precio < rango.max
      })
      .sort((a, b) => decimal(a.precio_botella) - decimal(b.precio_botella))
    const objetivoNumero = objetivosPorGama[index]
    const delta = vinos.length - objetivoNumero
    const real = pct(vinos.length, total)
    return {
      ...rango,
      vinos: vinos.length,
      vinosDetalle: vinos.map(v => ({
        id: v.id,
        nombre: v.nombre,
        bodega: v.bodega,
        tipo: v.tipo,
        region: v.region,
        precio: decimal(v.precio_botella),
        coste: decimal(v.coste_compra),
      })),
      real,
      objetivoNumero,
      delta,
      diferencia: real - rango.objetivo,
      rangoTexto: rango.max === Infinity
        ? `>${Math.round(rango.min)}`
        : rango.min === 0
          ? `hasta ${Math.round(rango.max)}`
          : `${Math.round(rango.min)}-${Math.round(rango.max)}`,
    }
  })

  const sobrantes = gamas.filter(g => g.delta > 0).map(g => ({ label: g.label, cantidad: g.delta }))
  const faltantes = gamas.filter(g => g.delta < 0).map(g => ({ label: g.label, cantidad: Math.abs(g.delta) }))
  const movimientos = []
  let surplus = 0
  let deficit = 0
  while (surplus < sobrantes.length && deficit < faltantes.length) {
    const cantidad = Math.min(sobrantes[surplus].cantidad, faltantes[deficit].cantidad)
    movimientos.push({
      cantidad,
      desde: sobrantes[surplus].label,
      hacia: faltantes[deficit].label,
      texto: `Sustituir ${cantidad} ref. de ${sobrantes[surplus].label.toLowerCase()} por ${cantidad} ref. de ${faltantes[deficit].label.toLowerCase()}`,
    })
    sobrantes[surplus].cantidad -= cantidad
    faltantes[deficit].cantidad -= cantidad
    if (sobrantes[surplus].cantidad === 0) surplus++
    if (faltantes[deficit].cantidad === 0) deficit++
  }
  const reequilibrio = {
    totalObjetivo,
    quitarTotal: Math.max(0, total - totalObjetivo),
    agregarTotal: Math.max(0, totalObjetivo - total),
    movimientos,
    resumen: movimientos.length
      ? movimientos.map(m => m.texto).join('. ')
      : referencias.estado === 'equilibrada'
        ? 'La cantidad total encaja; revisar solo excesos o huecos por gama.'
        : referencias.estado === 'corta'
          ? `Faltan ${Math.max(0, totalObjetivo - total)} referencias para acercarse al ideal.`
          : `Sobran ${Math.max(0, total - totalObjetivo)} referencias para acercarse al ideal.`,
  }
  const umbral = Math.max(1, Math.round(total * 0.10))
  const desajustes = gamas
    .filter(g => Math.abs(g.delta) > umbral || (g.vinos === 0 && g.objetivoNumero > 0))
    .map(g => `${g.label}: ${g.vinos} real vs ${g.objetivoNumero} objetivo`)
  if (referencias.estado === 'corta') desajustes.unshift(`Carta corta: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)
  if (referencias.estado === 'larga') desajustes.unshift(`Carta larga: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)
  return { gamas, desajustes, referencias, reequilibrio, base: 'pvp_iva_incl' }
}

// ---- Motor de análisis (único) -------------------------------------------
// Ambas copias anteriores producían el mismo output básico; aquí unificamos
// las reglas canónicas (superset: todas las del Radar) y conservamos los
// extras que usaba sólo la ficha (brechaCocina, pct por tipo).
export function analizarRestaurante(restaurante, vinos = [], platos = [], estadisticas = [], propuestas = []) {
  const activos = vinos.filter(v => v && v.activo !== false)
  const platosActivos = platos.filter(p => p && p.activo !== false)
  const total = activos.length

  const tipos = activos.reduce((acc, v) => {
    const t = v.tipo || 'sin_tipo'
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  const regiones = activos.reduce((acc, v) => {
    const r = normalizar(v.region || ''); if (!r) return acc
    const clave = r.includes('rioja') ? 'rioja' : r.includes('ribera') ? 'ribera' : r
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})

  const porCopa = activos.filter(v => decimal(v.precio_copa) > 0)
  const sinPrecio = activos.filter(v => !decimal(v.precio_botella))
  const sinPerfil = activos.filter(v => !v.notas_cata || normalizar(v.notas_cata).length < 12)
  const sinAnada = activos.filter(v => !v.anada)
  const sinStock = activos.filter(v => decimal(v.stock) === 0)
  const sinCoste = activos.filter(v => !decimal(v.coste_compra))
  const sinProveedor = activos.filter(v => !v.proveedor)
  const sinStockMinimo = activos.filter(v => !decimal(v.stock_minimo))
  const bajoMinimo = activos.filter(v => decimal(v.stock_minimo) > 0 && decimal(v.stock) <= decimal(v.stock_minimo))
  const conMargen = activos.filter(v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0)
  const margenMedio = conMargen.length
    ? Math.round(conMargen.reduce((s, v) => s + ((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100, 0) / conMargen.length)
    : null
  const margenBajo = conMargen.filter(v => ((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100 < 55)
  const valorCoste = activos.reduce((s, v) => s + decimal(v.stock) * decimal(v.coste_compra), 0)
  const valorVenta = activos.reduce((s, v) => s + decimal(v.stock) * decimal(v.precio_botella), 0)

  const dulces = activos.filter(v => v.tipo === 'dulce' || incluye(textoVino(v), ['dulce', 'moscatel', 'px', 'pedro ximenez', 'sauternes', 'tokaji']))
  const generosos = activos.filter(v => v.tipo === 'generoso' || incluye(textoVino(v), ['fino', 'manzanilla', 'amontillado', 'oloroso', 'palo cortado']))
  const espumosos = activos.filter(v => v.tipo === 'espumoso' || incluye(textoVino(v), ['cava', 'champagne', 'corpinnat', 'ancestral', 'brut']))
  const frescos = activos.filter(v => incluye(textoVino(v), ['fresco', 'alta acidez', 'salino', 'mineral', 'albarino', 'riesling', 'godello']))
  const tintosMadera = activos.filter(v => v.tipo === 'tinto' && incluye(textoVino(v), ['madera', 'tostado', 'crianza', 'reserva', 'roble']))

  const platosPostre = platosActivos.filter(p => incluye(textoPlato(p), ['postre', 'tarta', 'queso', 'torrija', 'helado', 'brownie', 'chocolate']))
  const platosFritura = platosActivos.filter(p => incluye(textoPlato(p), ['frit', 'croqueta', 'rebozado', 'flamenquin']))
  const platosPescado = platosActivos.filter(p => incluye(textoPlato(p), ['pescado', 'marisco', 'gamba', 'atun', 'salmon', 'bacalao', 'boqueron']))
  const platosQueso = platosActivos.filter(p => incluye(textoPlato(p), ['queso', 'quesos', 'curado', 'cabra']))
  const platosCarne = platosActivos.filter(p => incluye(textoPlato(p), ['brasa', 'vaca', 'ternera', 'presa', 'solomillo', 'rabo', 'cordero', 'cerdo']))

  // Identificación de vinos locales: usamos el módulo wineRegion (lo que
  // usaba el Radar). La ficha tenía su propia lógica inline distinta.
  const terminosLocales = localTermsForRestaurant(restaurante)
  const locales = terminosLocales.length
    ? activos.filter(v => isLocalWine(v, restaurante))
    : []

  const vinosConPrecio = activos.filter(v => decimal(v.precio_botella) > 0)
  const platosConPrecio = platosActivos.filter(p => decimal(p.precio) > 0)
  const ticket = ticketReferencia(restaurante, platosActivos)
  const wineMapping = mapaPrecios(vinosConPrecio, ticket.valor)
  const precioMedioVino = vinosConPrecio.reduce((s, v, _, a) => s + decimal(v.precio_botella) / a.length, 0)
  const precioMedioPlato = platosConPrecio.reduce((s, p, _, a) => s + decimal(p.precio) / a.length, 0)
  const vinosPremium = activos.filter(v => decimal(v.precio_botella) >= Math.max(35, precioMedioVino * 1.35))
  const platosPremium = platosActivos.filter(p => decimal(p.precio) >= Math.max(20, precioMedioPlato * 1.35))

  const eventosVenta = estadisticas.filter(e => e.tipo === 'venta').map(e => ({ ...e, parsed: leerDetalle(e.detalle) }))
  const escaneos30 = estadisticas.filter(e => e.tipo === 'escaneo').length
  const sommelier30 = estadisticas.filter(e => e.tipo === 'sommelier').length
  const ventasMarcadas = eventosVenta.filter(e => e.parsed?.resultado === 'vendida')
  const incidenciasStock = eventosVenta.filter(e => ['no_stock', 'agotado'].includes(e.parsed?.resultado))
  const dudasSala = eventosVenta.filter(e => ['no_convence', 'otra'].includes(e.parsed?.resultado))
  const propuestasAbiertas = propuestas.filter(p => p.estado !== 'descartada' && p.estado !== 'incorporada')
  const propuestasInteresan = propuestas.filter(p => p.estado === 'interesa')
  const vinosConDudas = Object.entries(dudasSala.reduce((acc, evento) => {
    const clave = evento.parsed?.vino || evento.parsed?.vino_id || 'Vino sin identificar'
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const alertas = []
  const op = (peso, titulo, detalle, servicio, accion) => alertas.push({ peso, titulo, detalle, servicio, accion: accion || servicio })

  if (total < 8) op(14, 'Carta de vinos muy corta', 'Hay pocas referencias para construir relato, margen y maridajes por familias de platos.', 'Diseño de carta base', 'Crear una carta base con estructura por estilos y objetivos de venta.')
  if (porCopa.length < Math.max(3, Math.round(total * 0.12))) op(12, 'Poca estrategia por copa', `${porCopa.length} referencias por copa sobre ${total}. Falta palanca de rotación y ticket medio.`, 'Programa de vinos por copa', 'Definir un programa de vinos por copa que rote stock y suba ticket.')
  if (locales.length < Math.max(2, Math.round(total * 0.08))) op(13, 'Vino local débil', `${locales.length} referencias locales detectadas. Hay margen para identidad territorial y storytelling.`, 'Selección de bodegas locales', 'Introducir bodegas locales con relato y argumento de sala.')
  if (platosPostre.length >= 2 && dulces.length === 0) op(15, 'Postres sin vino de cierre', `${platosPostre.length} postres detectados y ningún vino dulce claro.`, 'Maridaje postres', 'Añadir una propuesta de vino dulce o generoso para cierre de comida.')
  if (platosFritura.length >= 2 && generosos.length + espumosos.length < 2) op(13, 'Frituras sin aliados claros', 'Faltan generosos secos, burbuja o blancos salinos para vender con frituras.', 'Ajuste de estilos por cocina', 'Cubrir frituras con acidez, salinidad o generosos secos.')
  if (platosPescado.length >= 2 && frescos.length + espumosos.length + generosos.length < 3) op(10, 'Pescados con poca cobertura fresca', 'Pocos vinos frescos, salinos, blancos o burbuja para pescado y marisco.', 'Rediseño por maridaje', 'Ampliar blancos gastronómicos y alternativas por plato.')
  if (platosQueso.length >= 1 && generosos.length + dulces.length < 2) op(9, 'Quesos sin recorrido de maridaje', 'Hay queso en carta pero poca cobertura de generoso, oxidativo o dulce.', 'Experiencia de quesos y vino', 'Crear argumentos de maridaje para queso y cierre.')
  if (platosCarne.length >= 2 && (tipos.tinto || 0) < 4) op(8, 'Carnes con pocos tintos defendibles', 'La cocina pide tintos con perfiles distintos, no solo una opción genérica.', 'Curaduría de tintos', 'Diferenciar tintos por cuerpo, frescura, tanino y crianza.')
  if (pct((regiones.rioja || 0) + (regiones.ribera || 0), total) > 35) op(12, 'Exceso Rioja/Ribera', `${pct((regiones.rioja || 0) + (regiones.ribera || 0), total)}% de la carta concentrada en Rioja/Ribera.`, 'Diversificación de regiones', 'Diversificar regiones sin perder referencias reconocibles.')
  if (pct(tintosMadera.length, total) > 28) op(8, 'Perfil tinto demasiado parecido', 'Muchos tintos se apoyan en madera/crianza; puede cansar y limitar maridajes.', 'Arquitectura de estilos', 'Ordenar la arquitectura de estilos para evitar vinos redundantes.')
  if ((tipos.blanco || 0) < (tipos.tinto || 0) * 0.35 && platosPescado.length + platosFritura.length > 2) op(9, 'Faltan blancos gastronómicos', 'La cocina da razones para vender blancos, pero la carta se apoya demasiado en tintos.', 'Selección de blancos', 'Seleccionar blancos con acidez, salinidad y capacidad de venta.')
  if (vinosPremium.length < Math.max(2, Math.round(platosPremium.length * 0.5)) && platosPremium.length > 1) op(8, 'Ticket alto sin vinos premium suficientes', `${platosPremium.length} platos de ticket alto y ${vinosPremium.length} vinos premium claros.`, 'Subida de ticket medio', 'Crear escalones premium que sala pueda defender.')
  if (sinPerfil.length > total * 0.35) op(7, 'Faltan argumentos de venta', `${sinPerfil.length} vinos sin perfil de cata útil para sala.`, 'Formación de sala', 'Trabajar fichas cortas y frases de venta por estilo.')
  if (sinPrecio.length > 0) op(6, 'Vinos sin precio', `${sinPrecio.length} referencias sin precio de botella.`, 'Auditoría operativa', 'Cerrar precios y coherencia de PVP.')
  if (sinAnada.length > total * 0.35) op(5, 'Añadas poco cuidadas', `${sinAnada.length} referencias sin añada.`, 'Limpieza de carta', 'Completar añadas y verificar coherencia comercial.')
  if (sinStock.length > total * 0.25) op(5, 'Stock poco fiable', `${sinStock.length} referencias con stock cero.`, 'Control de bodega', 'Revisar stock físico y ajustar sistema.')
  if (sinCoste.length > total * 0.35) op(12, 'No se mide rentabilidad real', `${sinCoste.length} vinos sin coste de compra.`, 'Auditoría de margen', 'Completar costes para medir margen real y no solo intuición.')
  if (margenBajo.length > 0) op(11, 'Margen bajo en referencias con datos', `${margenBajo.length} vinos bajan del 55% de margen estimado.`, 'Pricing y beverage cost', 'Revisar compra, PVP o argumento de valor.')
  if (bajoMinimo.length > 0) op(9, 'Reposición pendiente', `${bajoMinimo.length} vinos por debajo del stock mínimo configurado.`, 'Rutina de compras', 'Activar rutina de reposición y pedido sugerido.')
  if (sinProveedor.length > total * 0.4) op(8, 'Proveedores poco trazados', `${sinProveedor.length} vinos sin proveedor. Hay margen para ordenar compra y negociación.`, 'Mapa de proveedores', 'Ordenar mapa de proveedores para compra y negociación.')
  if (wineMapping.desajustes.length > 0) op(12, 'Mapa de precios descompensado', wineMapping.desajustes.slice(0, 2).join('. '), 'Arquitectura de precios', 'Reequilibrar el mapa de precios por franja.')
  if (incidenciasStock.length >= 2) op(10, 'Sala está encontrando roturas de stock', `${incidenciasStock.length} incidencias marcadas en los últimos 30 días.`, 'Control de servicio', 'Conectar cierre de servicio con reposición.')
  if (dudasSala.length >= 3) op(9, 'Vinos que no convencen en sala', `${dudasSala.length} dudas o cambios marcados.`, 'Formación de sala', 'Formar a sala y ajustar alternativas o precio.')
  if (propuestasInteresan.length > 0) op(14, 'Cliente caliente con propuestas abiertas', `${propuestasInteresan.length} propuestas marcadas como interesan.`, 'Seguimiento comercial', 'Buen momento para cerrar acción con propuesta concreta.')
  if (propuestasAbiertas.length > 3) op(6, 'Propuestas acumuladas sin cierre', `${propuestasAbiertas.length} propuestas abiertas. Conviene simplificar y llevar una decisión concreta.`, 'Seguimiento de propuestas', 'Revisar y cerrar propuestas antiguas.')

  const alertasOrdenadas = alertas.sort((a, b) => b.peso - a.peso)
  const score = Math.min(100, Math.round(alertasOrdenadas.reduce((s, a) => s + a.peso, 0)))
  const prioridad = score >= 65 ? 'Alta' : score >= 35 ? 'Media' : 'Baja'
  const servicios = [...new Set(alertasOrdenadas.map(a => a.servicio))].slice(0, 4)
  const propuesta = alertasOrdenadas.slice(0, 3).map(a => a.titulo).join('. ')
  const siguienteMovimiento = alertasOrdenadas[0]
    ? `${alertasOrdenadas[0].servicio}: ${alertasOrdenadas[0].titulo.toLowerCase()}`
    : 'Mantenimiento fino: revisar relato, sala y pequeñas mejoras de carta'

  const brechaCocina = [
    platosFritura.length >= 2 && generosos.length + espumosos.length < 2 && { cocina: `Frituras (${platosFritura.length})`, falta: 'Generoso seco o espumoso' },
    platosPescado.length >= 2 && frescos.length + espumosos.length + generosos.length < 3 && { cocina: `Pescado/Marisco (${platosPescado.length})`, falta: 'Blanco fresco o atlántico' },
    platosQueso.length >= 1 && generosos.length + dulces.length < 2 && { cocina: `Quesos (${platosQueso.length})`, falta: 'Generoso o dulce' },
    platosCarne.length >= 2 && (tipos.tinto || 0) < 4 && { cocina: `Carnes (${platosCarne.length})`, falta: 'Tintos con cuerpo/crianza' },
    platosPostre.length >= 2 && dulces.length === 0 && { cocina: `Postres (${platosPostre.length})`, falta: 'Vino dulce de cierre' },
    (tipos.blanco || 0) < (tipos.tinto || 0) * 0.35 && platosPescado.length + platosFritura.length > 2 && { cocina: `Cocina de mar (${platosPescado.length + platosFritura.length})`, falta: 'Blancos gastronómicos' },
  ].filter(Boolean)

  return {
    score,
    prioridad,
    alertas: alertasOrdenadas,
    servicios,
    propuesta,
    siguienteMovimiento,
    ventasMarcadas,
    incidenciasStock,
    dudasSala,
    propuestasAbiertas,
    vinosConDudas,
    metricas: {
      vinos: total,
      platos: platosActivos.length,
      copa: porCopa.length,
      locales: locales.length,
      dulces: dulces.length,
      generosos: generosos.length,
      precioMedioVino: Math.round(precioMedioVino || 0),
      margenMedio,
      margenBajo: margenBajo.length,
      bajoMinimo: bajoMinimo.length,
      sinCoste: sinCoste.length,
      sinProveedor: sinProveedor.length,
      sinStockMinimo: sinStockMinimo.length,
      valorCoste,
      valorVenta,
      escaneos30,
      sommelier30,
    },
    diagnostico: {
      ticket,
      wineMapping,
      salud: [
        { label: 'Sin precio', valor: sinPrecio.length, total },
        { label: 'Sin añada', valor: sinAnada.length, total },
        { label: 'Sin perfil de venta', valor: sinPerfil.length, total },
        { label: 'Sin coste', valor: sinCoste.length, total },
        { label: 'Sin proveedor', valor: sinProveedor.length, total },
        { label: 'Stock cero', valor: sinStock.length, total },
      ],
      equilibrio: [
        { label: 'Tintos', valor: tipos.tinto || 0, pct: pct(tipos.tinto || 0, total) },
        { label: 'Blancos', valor: tipos.blanco || 0, pct: pct(tipos.blanco || 0, total) },
        { label: 'Espumosos', valor: tipos.espumoso || 0, pct: pct(tipos.espumoso || 0, total) },
        { label: 'Generosos', valor: tipos.generoso || 0, pct: pct(tipos.generoso || 0, total) },
        { label: 'Dulces', valor: dulces.length, pct: pct(dulces.length, total) },
        { label: 'Por copa', valor: porCopa.length, pct: pct(porCopa.length, total) },
        { label: 'Locales', valor: locales.length, pct: pct(locales.length, total) },
      ],
      brechaCocina,
    },
  }
}
