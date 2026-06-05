'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../supabase'
import { isAdminEmail, setAdminRestaurantEmail } from '../../../demo'


function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function pct(valor, total) {
  return total ? Math.round((valor / total) * 100) : 0
}

function decimal(valor) {
  return Number(valor) || 0
}

function eur(valor) {
  return `${decimal(valor).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`
}

function haceDiasISO(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function incluye(texto, terminos) {
  const limpio = normalizar(texto)
  return terminos.some(t => limpio.includes(normalizar(t)))
}

function textoVino(v) {
  return `${v.nombre || ''} ${v.bodega || ''} ${v.tipo || ''} ${v.region || ''} ${v.uva || ''} ${v.notas_cata || ''}`
}

function textoPlato(p) {
  return `${p.nombre || ''} ${p.descripcion || ''} ${p.categoria || ''}`
}

function ticketReferencia(restaurante, platosActivos) {
  const guardado = decimal(restaurante.ticket_medio || restaurante.ticket_medio_comida || restaurante.ticket_comida)
  if (guardado > 0) return { valor: guardado, fuente: 'ticket configurado', esEstimado: false }
  const conPrecio = platosActivos.filter(p => decimal(p.precio) > 0)
  if (conPrecio.length) {
    const media = conPrecio.reduce((sum, p) => sum + decimal(p.precio), 0) / conPrecio.length
    return { valor: Math.round(media * 2.5), fuente: 'estimado por carta de comida', esEstimado: true }
  }
  return { valor: null, fuente: 'no disponible', esEstimado: true }
}

function mapaPrecios(vinosConPrecio, ticket) {
  if (!ticket) return { gamas: [], desajustes: [] }
  const total = vinosConPrecio.length
  // Umbrales calibrados con metodología Álex Pardo GCA (ticket 40€ y 57€)
  // Todos proporcionales al ticket — sin floors fijos
  const tBajaMin = ticket * 0.38   // 38% — mínimo recomendado Gama Baja
  const tBaja    = ticket * 0.48   // 48% — Baja / Media
  const tMedia   = ticket * 0.75   // 75% — Media / Alta
  const tAlta    = ticket * 1.75   // 175% — Alta / Muy Alta
  const tMuyAlta = ticket * 2.75   // 275% — Muy Alta / Premium
  const rangos = [
    { id: 'baja',     label: 'Gama baja',  objetivo: 20, min: 0,        max: tBaja    },
    { id: 'media',    label: 'Gama media', objetivo: 45, min: tBaja,    max: tMedia   },
    { id: 'alta',     label: 'Gama alta',  objetivo: 15, min: tMedia,   max: tAlta    },
    { id: 'muy_alta', label: 'Muy alta',   objetivo: 15, min: tAlta,    max: tMuyAlta },
    { id: 'premium',  label: 'Premium',    objetivo:  5, min: tMuyAlta, max: Infinity },
  ]
  const gamas = rangos.map(rango => {
    const vinos = vinosConPrecio.filter(v => {
      const precio = decimal(v.precio_botella)
      return rango.max === Infinity ? precio >= rango.min : precio >= rango.min && precio < rango.max
    })
    const real = pct(vinos.length, total)
    return {
      ...rango, vinos: vinos.length, real, diferencia: real - rango.objetivo,
      rangoTexto: rango.max === Infinity
        ? `>${Math.round(rango.min)}`
        : rango.min === 0 ? `hasta ${Math.round(rango.max)}`
        : `${Math.round(rango.min)}–${Math.round(rango.max)}`
    }
  })
  const umbral = Math.max(1, Math.round(total * 0.10))
  const desajustes = gamas.filter(g => {
    const ideal = Math.round((g.objetivo / 100) * total)
    return Math.abs(g.vinos - ideal) > umbral || (g.vinos === 0 && ideal > 0)
  }).map(g => `${g.label}: ${g.real}% real vs ${g.objetivo}% objetivo`)
  return { gamas, desajustes }
}

function analizar(restaurante, vinos = [], platos = [], estadisticas = [], propuestas = []) {
  const activos = vinos.filter(v => v.activo !== false)
  const platosActivos = platos.filter(p => p.activo !== false)
  const total = activos.length
  const tipos = activos.reduce((acc, v) => { acc[v.tipo || 'sin_tipo'] = (acc[v.tipo || 'sin_tipo'] || 0) + 1; return acc }, {})
  const regiones = activos.reduce((acc, v) => {
    const r = normalizar(v.region || ''); if (!r) return acc
    const c = r.includes('rioja') ? 'rioja' : r.includes('ribera') ? 'ribera' : r
    acc[c] = (acc[c] || 0) + 1; return acc
  }, {})

  const porCopa = activos.filter(v => decimal(v.precio_copa) > 0)
  const sinPrecio = activos.filter(v => !decimal(v.precio_botella))
  const sinPerfil = activos.filter(v => !v.notas_cata || normalizar(v.notas_cata).length < 12)
  const sinAnada = activos.filter(v => !v.anada)
  const sinStock = activos.filter(v => Number(v.stock) === 0)
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

  const zona = normalizar(`${restaurante?.ciudad || ''} ${restaurante?.provincia || ''}`)
  const terminosLocales = [
    ...zona.split(/[^a-z0-9]+/).filter(t => t.length > 3),
    zona.includes('malaga') && 'sierras de malaga',
    zona.includes('jerez') && 'jerez',
    zona.includes('cadiz') && 'cadiz'
  ].filter(Boolean)
  const locales = terminosLocales.length ? activos.filter(v => terminosLocales.some(t => normalizar(textoVino(v)).includes(t))) : []

  const vinosConPrecio = activos.filter(v => decimal(v.precio_botella) > 0)
  const platosConPrecio = platosActivos.filter(p => decimal(p.precio) > 0)
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
  const vinosConDudas = Object.entries(dudasSala.reduce((acc, e) => {
    const c = e.parsed?.vino || 'Vino sin identificar'; acc[c] = (acc[c] || 0) + 1; return acc
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
  if (incidenciasStock.length >= 2) op(10, 'Sala encuentra roturas de stock', `${incidenciasStock.length} incidencias marcadas en los últimos 30 días.`, 'Control de servicio', 'Conectar cierre de servicio con reposición.')
  if (dudasSala.length >= 3) op(9, 'Vinos que no convencen en sala', `${dudasSala.length} dudas o cambios marcados.`, 'Formación de sala', 'Formar a sala y ajustar alternativas o precio.')
  if (propuestasAbiertas.length > 0 && propuestasAbiertas.some(p => p.estado === 'interesa')) op(14, 'Cliente caliente con propuestas abiertas', `${propuestasAbiertas.filter(p => p.estado === 'interesa').length} propuestas marcadas como interesan.`, 'Seguimiento comercial', 'Buen momento para cerrar acción con propuesta concreta.')

  const alertasOrdenadas = alertas.sort((a, b) => b.peso - a.peso)
  const score = Math.min(100, Math.round(alertasOrdenadas.reduce((s, a) => s + a.peso, 0)))
  const prioridad = score >= 65 ? 'Alta' : score >= 35 ? 'Media' : 'Baja'
  const servicios = [...new Set(alertasOrdenadas.map(a => a.servicio))].slice(0, 4)
  const siguienteMovimiento = alertasOrdenadas[0]
    ? `${alertasOrdenadas[0].servicio}: ${alertasOrdenadas[0].titulo.toLowerCase()}`
    : 'Mantenimiento fino: revisar relato, sala y pequeñas mejoras de carta'

  const ticket = ticketReferencia(restaurante, platosActivos)
  const wineMapping = mapaPrecios(vinosConPrecio, ticket.valor)

  return {
    score, prioridad, alertas: alertasOrdenadas, servicios, siguienteMovimiento,
    ventasMarcadas, incidenciasStock, dudasSala, propuestasAbiertas, vinosConDudas,
    metricas: {
      vinos: total, platos: platosActivos.length, copa: porCopa.length,
      locales: locales.length, dulces: dulces.length, generosos: generosos.length,
      precioMedioVino: Math.round(precioMedioVino || 0), margenMedio,
      margenBajo: margenBajo.length, bajoMinimo: bajoMinimo.length,
      sinCoste: sinCoste.length, sinProveedor: sinProveedor.length,
      sinStockMinimo: sinStockMinimo.length, valorCoste, valorVenta,
      escaneos30, sommelier30
    },
    diagnostico: {
      ticket, wineMapping,
      salud: [
        { label: 'Sin precio', valor: sinPrecio.length, total },
        { label: 'Sin añada', valor: sinAnada.length, total },
        { label: 'Sin perfil de venta', valor: sinPerfil.length, total },
        { label: 'Sin coste', valor: sinCoste.length, total },
        { label: 'Sin proveedor', valor: sinProveedor.length, total },
        { label: 'Stock cero', valor: sinStock.length, total },
      ],
      equilibrio: [
        { label: 'Tintos', valor: tipos.tinto || 0 },
        { label: 'Blancos', valor: tipos.blanco || 0 },
        { label: 'Espumosos', valor: tipos.espumoso || 0 },
        { label: 'Generosos', valor: tipos.generoso || 0 },
        { label: 'Dulces', valor: dulces.length },
        { label: 'Por copa', valor: porCopa.length },
        { label: 'Locales', valor: locales.length },
      ]
    }
  }
}

function calcularMargen(coste, precio) {
  const c = Number(coste) || 0; const p = Number(precio) || 0
  if (!c || !p || p <= c) return ''
  return String(Math.round(((p - c) / c) * 100))
}

function calcularPrecioDesdeMargen(coste, margen) {
  const c = Number(coste) || 0; const m = Number(margen) || 0
  if (!c || m <= 0) return ''
  return (c * (1 + m / 100)).toFixed(2)
}

function diasDesde(fecha) {
  if (!fecha) return null
  const diff = Date.now() - new Date(fecha).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

function normalizarCatalogo(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function tokensCatalogo(texto = '') {
  return normalizarCatalogo(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3)
}

function scoreMatchCatalogo(vinoRestaurante, vinoCatalogo, proveedor) {
  const nombreRest = normalizarCatalogo(vinoRestaurante?.nombre)
  const nombreCatalogo = normalizarCatalogo(vinoCatalogo?.nombre)
  const bodegaRest = normalizarCatalogo(vinoRestaurante?.bodega)
  const bodegaCatalogo = normalizarCatalogo(vinoCatalogo?.bodega)
  const regionRest = normalizarCatalogo(vinoRestaurante?.region)
  const regionCatalogo = normalizarCatalogo(vinoCatalogo?.region)
  const tipoRest = normalizarCatalogo(vinoRestaurante?.tipo)
  const tipoCatalogo = normalizarCatalogo(vinoCatalogo?.tipo)
  const uvaRest = normalizarCatalogo(vinoRestaurante?.uva)
  const uvaCatalogo = normalizarCatalogo(vinoCatalogo?.uva)
  const proveedorRest = normalizarCatalogo(vinoRestaurante?.proveedor)
  const proveedorCatalogo = normalizarCatalogo(proveedor?.nombre || vinoCatalogo?.proveedores_vino?.nombre)
  const anadaRest = String(vinoRestaurante?.anada || '').trim()
  const anadaCatalogo = String(vinoCatalogo?.anada || '').trim()

  let score = 0
  if (nombreRest && nombreCatalogo) {
    if (nombreRest === nombreCatalogo) score += 48
    else if (nombreRest.includes(nombreCatalogo) || nombreCatalogo.includes(nombreRest)) score += 34
    const tokensRest = tokensCatalogo(vinoRestaurante?.nombre)
    const tokensCat = new Set(tokensCatalogo(vinoCatalogo?.nombre))
    const comunes = tokensRest.filter(token => tokensCat.has(token)).length
    score += Math.min(24, comunes * 8)
  }
  if (bodegaRest && bodegaCatalogo) {
    if (bodegaRest === bodegaCatalogo) score += 22
    else if (bodegaRest.includes(bodegaCatalogo) || bodegaCatalogo.includes(bodegaRest)) score += 14
  }
  if (regionRest && regionCatalogo && (regionRest.includes(regionCatalogo) || regionCatalogo.includes(regionRest))) score += 10
  if (tipoRest && tipoCatalogo && tipoRest === tipoCatalogo) score += 8
  if (uvaRest && uvaCatalogo && (uvaRest.includes(uvaCatalogo) || uvaCatalogo.includes(uvaRest))) score += 8
  if (anadaRest && anadaCatalogo && anadaRest === anadaCatalogo) score += 8
  if (proveedorRest && proveedorCatalogo && proveedorRest === proveedorCatalogo) score += 18
  if (decimal(vinoCatalogo?.coste_estimado) > 0) score += 4
  if (vinoCatalogo?.referencia) score += 3
  if (vinoCatalogo?.formato) score += 2

  return score
}

const propuestaVacia = {
  titulo: '', vino: '', tipo: '', zona: '', proveedor_sugerido: '',
  coste_estimado: '', precio_recomendado: '', margen_objetivo: '',
  plato_objetivo: '', motivo: '', prioridad: 'media', estado: 'propuesta'
}

async function tokenAdmin() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token
}

export default function RestauranteWorkspace() {
  const params = useParams()
  const id = params?.id

  const [user, setUser] = useState(null)
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [proveedoresCatalogo, setProveedoresCatalogo] = useState([])
  const [vinosCatalogo, setVinosCatalogo] = useState([])
  const [loading, setLoading] = useState(true)

  const [ticketDraft, setTicketDraft] = useState('')
  const [guardandoTicket, setGuardandoTicket] = useState(false)

  const [formPropuesta, setFormPropuesta] = useState(propuestaVacia)
  const [editandoPropuesta, setEditandoPropuesta] = useState(null)
  const [modoPropuesta, setModoPropuesta] = useState('alta')
  const [vinoExistenteId, setVinoExistenteId] = useState('')
  const [proveedorCatalogoId, setProveedorCatalogoId] = useState('')
  const [vinoCatalogoId, setVinoCatalogoId] = useState('')
  const [busquedaVinoCatalogo, setBusquedaVinoCatalogo] = useState('')
  const [proveedorMatchId, setProveedorMatchId] = useState('')
  const [busquedaMatchCatalogo, setBusquedaMatchCatalogo] = useState('')
  const [aplicandoMatchId, setAplicandoMatchId] = useState('')
  const [mensajeMatch, setMensajeMatch] = useState('')
  const [guardandoPropuesta, setGuardandoPropuesta] = useState(false)
  const [errorPropuesta, setErrorPropuesta] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [ultimoCampoEco, setUltimoCampoEco] = useState('precio')

  const [alertaAbierta, setAlertaAbierta] = useState(null)
  const propuestaFormRef = useRef(null)

  const [seleccion, setSeleccion] = useState([])
  const [vinoElegido, setVinoElegido] = useState('')
  const [notaSeleccion, setNotaSeleccion] = useState('')
  const [guardandoSeleccion, setGuardandoSeleccion] = useState(false)

  const RESTAURANTE_PREFIX = '[RESTAURANTE] '
  const esSeleccionJuanjo = item => !String(item.nota_personal || '').startsWith(RESTAURANTE_PREFIX)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) { window.location.href = '/login'; return }
      setUser(user)
      const desde = haceDiasISO(30)
      const token = await tokenAdmin()
      const [{ data: rest }, { data: vinosData }, { data: platosData }, { data: statsData }, { data: propuestasData }, { data: selData }, catalogoRes] = await Promise.all([
        supabase.from('restaurantes').select('*').eq('id', id).single(),
        supabase.from('vinos').select('*').eq('restaurante_id', id),
        supabase.from('platos').select('*').eq('restaurante_id', id),
        supabase.from('estadisticas').select('*').eq('restaurante_id', id).gte('created_at', desde),
        supabase.from('consultor_propuestas').select('*').eq('restaurante_id', id).order('created_at', { ascending: false }),
        supabase.from('seleccion_especial').select('*, vinos(nombre, bodega, tipo, region)').eq('restaurante_id', id).eq('activo', true).order('orden'),
        fetch('/api/admin/proveedores', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const catalogoData = await catalogoRes.json().catch(() => ({}))
      setRestaurante(rest)
      setTicketDraft(rest?.ticket_medio_comida || rest?.ticket_medio || rest?.ticket_comida || '')
      setVinos(vinosData || [])
      setPlatos(platosData || [])
      setEstadisticas(statsData || [])
      setPropuestas(propuestasData || [])
      setProveedoresCatalogo(catalogoRes.ok ? catalogoData.proveedores || [] : [])
      setVinosCatalogo(catalogoRes.ok ? catalogoData.vinos || [] : [])
      setSeleccion((selData || []).filter(item => !String(item.nota_personal || '').startsWith('[RESTAURANTE] ')))
      setLoading(false)
    }
    if (id) cargar()
  }, [id])

  const analisis = useMemo(
    () => restaurante ? analizar(restaurante, vinos, platos, estadisticas, propuestas) : null,
    [restaurante, vinos, platos, estadisticas, propuestas]
  )

  useEffect(() => {
    if (analisis?.alertas?.[0] && !alertaAbierta) setAlertaAbierta(analisis.alertas[0].titulo)
  }, [analisis, alertaAbierta])

  function gestionar() {
    setAdminRestaurantEmail(restaurante.email)
    window.location.href = '/dashboard'
  }

  async function guardarTicket() {
    setGuardandoTicket(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/restaurantes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ ...restaurante, ticket_medio_comida: ticketDraft === '' ? null : Number(ticketDraft) })
      })
      const data = await res.json()
      if (res.ok) setRestaurante(data.restaurante)
    } finally {
      setGuardandoTicket(false)
    }
  }

  function actualizarForm(campo, valor) {
    setErrorPropuesta('')
    if (campo === 'precio_recomendado') setUltimoCampoEco('precio')
    if (campo === 'margen_objetivo') setUltimoCampoEco('margen')
    setFormPropuesta(prev => {
      const next = { ...prev, [campo]: valor }
      if (campo === 'margen_objetivo') {
        const p = calcularPrecioDesdeMargen(next.coste_estimado, next.margen_objetivo)
        if (p) next.precio_recomendado = p
      } else if (campo === 'coste_estimado' && ultimoCampoEco === 'margen') {
        const p = calcularPrecioDesdeMargen(next.coste_estimado, next.margen_objetivo)
        if (p) next.precio_recomendado = p
      } else if (campo === 'coste_estimado' || campo === 'precio_recomendado') {
        next.margen_objetivo = calcularMargen(next.coste_estimado, next.precio_recomendado)
      }
      return next
    })
  }

  function abrirFormNuevo(prefill = {}) {
    setEditandoPropuesta(null)
    setModoPropuesta('alta')
    setVinoExistenteId('')
    setProveedorCatalogoId('')
    setVinoCatalogoId('')
    setBusquedaVinoCatalogo('')
    setFormPropuesta({ ...propuestaVacia, restaurante_id: id, ...prefill })
    setMostrarForm(true)
    setTimeout(() => propuestaFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function abrirFormEditar(p) {
    setEditandoPropuesta(p.id)
    setModoPropuesta(p.tipo === 'Retirar referencia' ? 'retirada' : 'alta')
    setVinoExistenteId('')
    setProveedorCatalogoId('')
    setVinoCatalogoId('')
    setBusquedaVinoCatalogo('')
    setFormPropuesta({
      restaurante_id: id, titulo: p.titulo || '', vino: p.vino || '', tipo: p.tipo || '',
      zona: p.zona || '', proveedor_sugerido: p.proveedor_sugerido || '',
      coste_estimado: p.coste_estimado || '', precio_recomendado: p.precio_recomendado || '',
      margen_objetivo: p.margen_objetivo || '', plato_objetivo: p.plato_objetivo || '',
      motivo: p.motivo || '', prioridad: p.prioridad || 'media', estado: p.estado || 'propuesta'
    })
    setMostrarForm(true)
    setTimeout(() => propuestaFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function seleccionarVinoExistente(vid) {
    setVinoExistenteId(vid)
    const v = vinos.find(x => String(x.id) === String(vid))
    if (!v) return
    setFormPropuesta(prev => ({
      ...prev,
      titulo: prev.titulo || `Retirar ${v.nombre} de la carta`,
      vino: v.nombre || '', tipo: 'Retirar referencia', zona: v.region || '',
      proveedor_sugerido: v.proveedor || '', coste_estimado: v.coste_compra || '',
      precio_recomendado: v.precio_botella || ''
    }))
  }

  const vinosCatalogoFiltrados = useMemo(() => {
    const terminos = normalizarCatalogo(busquedaVinoCatalogo).split(' ').filter(Boolean)
    const base = proveedorCatalogoId
      ? vinosCatalogo.filter(vino => String(vino.proveedor_id) === String(proveedorCatalogoId))
      : vinosCatalogo
    return base
      .filter(vino => {
        if (!terminos.length) return true
        const proveedor = proveedoresCatalogo.find(item => String(item.id) === String(vino.proveedor_id))
        const texto = normalizarCatalogo([
          vino.nombre,
          vino.bodega,
          vino.region,
          vino.tipo,
          vino.uva,
          vino.referencia,
          vino.formato,
          proveedor?.nombre,
        ].filter(Boolean).join(' '))
        return terminos.every(termino => texto.includes(termino))
      })
      .slice(0, 40)
  }, [vinosCatalogo, proveedoresCatalogo, proveedorCatalogoId, busquedaVinoCatalogo])

  const proveedorCatalogoPorId = useMemo(() => (
    Object.fromEntries(proveedoresCatalogo.map(proveedor => [String(proveedor.id), proveedor]))
  ), [proveedoresCatalogo])

  const matchesCatalogo = useMemo(() => {
    const terminos = tokensCatalogo(busquedaMatchCatalogo)
    const catalogoBase = vinosCatalogo.filter(vino => {
      if (proveedorMatchId && String(vino.proveedor_id) !== String(proveedorMatchId)) return false
      return vino.activo !== false
    })
    return vinos
      .filter(vino => vino.activo !== false)
      .filter(vino => !vino.proveedor || !decimal(vino.coste_compra) || !vino.referencia_proveedor || !vino.formato_compra)
      .filter(vino => {
        if (!terminos.length) return true
        const texto = normalizarCatalogo([vino.nombre, vino.bodega, vino.region, vino.tipo, vino.uva, vino.proveedor].filter(Boolean).join(' '))
        return terminos.every(termino => texto.includes(termino))
      })
      .map(vino => {
        const candidatos = catalogoBase
          .map(catalogo => {
            const proveedor = proveedorCatalogoPorId[String(catalogo.proveedor_id)]
            return {
              vino: catalogo,
              proveedor,
              score: scoreMatchCatalogo(vino, catalogo, proveedor)
            }
          })
          .filter(match => match.score >= 34)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
        return { vino, candidatos }
      })
      .filter(item => item.candidatos.length > 0)
      .sort((a, b) => b.candidatos[0].score - a.candidatos[0].score)
      .slice(0, 30)
  }, [vinos, vinosCatalogo, proveedorCatalogoPorId, proveedorMatchId, busquedaMatchCatalogo])

  function seleccionarProveedorCatalogo(proveedorId) {
    setProveedorCatalogoId(proveedorId)
    setVinoCatalogoId('')
    setBusquedaVinoCatalogo('')
  }

  function seleccionarVinoCatalogo(vinoId) {
    setVinoCatalogoId(vinoId)
    const vino = vinosCatalogo.find(item => String(item.id) === String(vinoId))
    if (!vino) return
    const proveedor = proveedoresCatalogo.find(item => String(item.id) === String(vino.proveedor_id))
    const pvp = Number(vino.pvp_recomendado) > 0 ? vino.pvp_recomendado : ''
    setProveedorCatalogoId(vino.proveedor_id || '')
    setBusquedaVinoCatalogo(vino.nombre || '')
    setUltimoCampoEco(pvp ? 'precio' : 'margen')
    setFormPropuesta(prev => ({
      ...prev,
      titulo: prev.titulo || `Añadir ${vino.nombre} a la carta`,
      vino: vino.nombre || '',
      tipo: vino.tipo || '',
      zona: vino.region || '',
      proveedor_sugerido: proveedor?.nombre || vino.proveedores_vino?.nombre || '',
      coste_estimado: Number(vino.coste_estimado) > 0 ? vino.coste_estimado : '',
      precio_recomendado: pvp,
      margen_objetivo: pvp ? calcularMargen(vino.coste_estimado, pvp) : prev.margen_objetivo,
    }))
  }

  async function aplicarMatchCatalogo(vinoRestaurante, match) {
    const proveedor = match.proveedor
    const vinoCatalogo = match.vino
    const cambios = {}
    const nombreProveedor = proveedor?.nombre || vinoCatalogo.proveedores_vino?.nombre || ''

    if (nombreProveedor) cambios.proveedor = nombreProveedor
    if (decimal(vinoCatalogo.coste_estimado) > 0) cambios.coste_compra = decimal(vinoCatalogo.coste_estimado)
    if (vinoCatalogo.referencia) cambios.referencia_proveedor = vinoCatalogo.referencia
    if (vinoCatalogo.formato) cambios.formato_compra = vinoCatalogo.formato

    if (!Object.keys(cambios).length) return
    setAplicandoMatchId(`${vinoRestaurante.id}-${vinoCatalogo.id}`)
    setMensajeMatch('')
    const { error } = await supabase
      .from('vinos')
      .update(cambios)
      .eq('id', vinoRestaurante.id)
      .eq('restaurante_id', id)

    if (error) {
      setMensajeMatch(`No se pudo aplicar a ${vinoRestaurante.nombre}: ${error.message}`)
    } else {
      setVinos(prev => prev.map(vino => String(vino.id) === String(vinoRestaurante.id) ? { ...vino, ...cambios } : vino))
      setMensajeMatch(`Datos aplicados a ${vinoRestaurante.nombre}.`)
    }
    setAplicandoMatchId('')
  }

  async function guardarPropuesta(e) {
    e.preventDefault()
    setGuardandoPropuesta(true)
    setErrorPropuesta('')
    const token = await tokenAdmin()
    const margenCalc = calcularMargen(formPropuesta.coste_estimado, formPropuesta.precio_recomendado)
    const payload = {
      ...formPropuesta,
      tipo: modoPropuesta === 'retirada' ? 'Retirar referencia' : formPropuesta.tipo,
      margen_objetivo: margenCalc || formPropuesta.margen_objetivo || ''
    }
    const res = await fetch('/api/admin/propuestas', {
      method: editandoPropuesta ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editandoPropuesta ? { ...payload, id: editandoPropuesta } : payload)
    })
    const data = await res.json()
    if (res.ok) {
      if (editandoPropuesta) setPropuestas(prev => prev.map(x => x.id === data.propuesta.id ? data.propuesta : x))
      else setPropuestas(prev => [data.propuesta, ...prev])
      setFormPropuesta(propuestaVacia)
      setEditandoPropuesta(null)
      setModoPropuesta('alta')
      setVinoExistenteId('')
      setProveedorCatalogoId('')
      setVinoCatalogoId('')
      setBusquedaVinoCatalogo('')
      setMostrarForm(false)
    } else {
      setErrorPropuesta(data.error || 'No se pudo guardar la propuesta.')
    }
    setGuardandoPropuesta(false)
  }

  async function borrarPropuesta(pid) {
    if (!confirm('¿Borrar esta propuesta?')) return
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/propuestas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: pid })
    })
    if (res.ok) setPropuestas(prev => prev.filter(x => x.id !== pid))
  }

  async function completarPropuesta(propuesta) {
    if (!confirm(`Marcar como completada: ${propuesta.titulo}?`)) return
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/propuestas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...propuesta, estado: 'incorporada' })
    })
    const data = await res.json()
    if (res.ok) setPropuestas(prev => prev.map(item => item.id === propuesta.id ? data.propuesta : item))
  }

  function copiarResumen() {
    const texto = [
      restaurante.nombre,
      `Prioridad: ${analisis.prioridad} (${analisis.score})`,
      `Siguiente movimiento: ${analisis.siguienteMovimiento}`,
      `Vinos: ${analisis.metricas.vinos}`,
      `Propuestas abiertas: ${analisis.propuestasAbiertas.length}`
    ].join('\n')
    navigator.clipboard.writeText(texto)
  }

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function añadirSeleccion() {
    if (!vinoElegido || !notaSeleccion.trim()) return
    setGuardandoSeleccion(true)
    const { data, error } = await supabase.from('seleccion_especial').insert([{
      restaurante_id: id,
      vino_id: vinoElegido,
      nota_personal: notaSeleccion,
      orden: seleccion.length
    }]).select('*, vinos(nombre, bodega, tipo, region)')
    if (!error && data?.[0]) {
      setSeleccion(prev => [...prev, data[0]])
      setVinoElegido('')
      setNotaSeleccion('')
    }
    setGuardandoSeleccion(false)
  }

  async function quitarSeleccion(selId) {
    await supabase.from('seleccion_especial').update({ activo: false }).eq('id', selId)
    setSeleccion(prev => prev.filter(s => s.id !== selId))
  }

  if (loading) return <p className="admin-loading">Cargando restaurante</p>

  if (!restaurante || !analisis) return (
    <div className="admin-empty" style={{ margin: '48px auto' }}>Restaurante no encontrado.</div>
  )

  const { score, prioridad, alertas, servicios, siguienteMovimiento, metricas, diagnostico, ventasMarcadas, incidenciasStock, dudasSala, propuestasAbiertas, vinosConDudas } = analisis
  const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
  const propuestasActivas = propuestas.filter(p => p.estado !== 'descartada' && p.estado !== 'incorporada')

  return (
    <div className="admin-main ws-main">

          {/* Workspace header */}
          <div className="ws-header">
            <div className="ws-header-left">
              <Link href="/admin/consultoria" className="ws-back">← Radar</Link>
              <div>
                <h2 className="ws-title">{restaurante.nombre}</h2>
                <span className="ws-sub">{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ')} · {metricas.vinos} vinos · {metricas.platos} platos</span>
              </div>
            </div>
            <div className="ws-header-actions">
              <button onClick={copiarResumen} aria-label="Copiar resumen del restaurante">Copiar datos</button>
              <button onClick={gestionar}>Abrir dashboard</button>
              <button onClick={() => window.print()} aria-label="Imprimir esta pagina">Imprimir pagina</button>
              <a href={`/admin/informe/${id}`} target="_blank" rel="noreferrer">Descargar informe</a>
              <a href={`/carta/${restaurante.slug}`} target="_blank" rel="noreferrer">Ver carta ↗</a>
            </div>
          </div>

          {/* Anchor navigation */}
          <nav className="ws-anchors">
            <button onClick={() => scrollTo('ws-resumen')}>Resumen {propuestasAbiertas.length > 0 && <span className="ws-badge">{propuestasAbiertas.length}</span>}</button>
            <button onClick={() => scrollTo('ws-diagnostico')}>Diagnóstico {alertas.length > 0 && <span className="ws-badge">{alertas.length}</span>}</button>
            <button onClick={() => scrollTo('ws-matching')}>Matching {matchesCatalogo.length > 0 && <span className="ws-badge">{matchesCatalogo.length}</span>}</button>
            <button onClick={() => scrollTo('ws-propuestas')}>Propuestas {propuestasActivas.length > 0 && <span className="ws-badge">{propuestasActivas.length}</span>}</button>
            <button onClick={() => scrollTo('ws-seleccion')}>Selección {seleccion.length > 0 && <span className="ws-badge">{seleccion.length}/4</span>}</button>
            <button onClick={() => scrollTo('ws-informe')}>Informe</button>
          </nav>

          {/* ═══════════════════════════════════════
              SECCIÓN: RESUMEN
          ═══════════════════════════════════════ */}
          <section id="ws-resumen" className="ws-section">
            <div className="ws-resumen-top">
              <div className="ws-score-block">
                <div className={`ws-score ws-score-${prioridad.toLowerCase()}`}>
                  <span>{score}</span>
                  <strong>{prioridad}</strong>
                </div>
                <div>
                  <p className="ws-next-label">Siguiente movimiento</p>
                  <p className="ws-next-text">{siguienteMovimiento}</p>
                </div>
              </div>
              <div className="ws-metrics-grid">
                <div><span>Vinos activos</span><strong>{metricas.vinos}</strong></div>
                <div><span>Por copa</span><strong>{metricas.copa}</strong></div>
                <div><span>Margen medio</span><strong>{metricas.margenMedio ?? '—'}%</strong></div>
                <div><span>Precio medio</span><strong>{metricas.precioMedioVino} EUR</strong></div>
                <div><span>Escaneos 30d</span><strong>{metricas.escaneos30}</strong></div>
                <div><span>Maridajes 30d</span><strong>{metricas.sommelier30}</strong></div>
                <div><span>Bodega a coste</span><strong>{eur(metricas.valorCoste)}</strong></div>
                <div><span>Propuestas abiertas</span><strong>{propuestasAbiertas.length}</strong></div>
              </div>
            </div>
            {servicios.length > 0 && (
              <div className="ws-servicios">
                <span className="ws-servicios-label">Servicios detectados</span>
                {servicios.map(s => <span key={s} className="ws-servicio-pill">{s}</span>)}
              </div>
            )}
          </section>

          {/* ═══════════════════════════════════════
              SECCIÓN: DIAGNÓSTICO
          ═══════════════════════════════════════ */}
          <section id="ws-diagnostico" className="ws-section">
            <h3 className="ws-section-title">Diagnóstico</h3>

            {/* Alertas */}
            {alertas.length > 0 ? (
              <div className="ws-alertas">
                {alertas.map(alerta => (
                  <div key={alerta.titulo} className={`ws-alerta ${alertaAbierta === alerta.titulo ? 'is-open' : ''}`}>
                    <button className="ws-alerta-head" onClick={() => setAlertaAbierta(alertaAbierta === alerta.titulo ? null : alerta.titulo)}>
                      <div className="ws-alerta-left">
                        <span className="ws-alerta-peso">{alerta.peso}</span>
                        <span className="ws-alerta-titulo">
                          {alerta.titulo}
                          {alertaAbierta !== alerta.titulo && <small>{alerta.detalle}</small>}
                        </span>
                      </div>
                      <span className="ws-alerta-chevron">{alertaAbierta === alerta.titulo ? '▲' : '▼'}</span>
                    </button>
                    {alertaAbierta === alerta.titulo && (
                      <div className="ws-alerta-body">
                        <p className="ws-alerta-detalle">{alerta.detalle}</p>
                        <p className="ws-alerta-accion">{alerta.accion}</p>
                        <button
                          className="ws-alerta-proponer"
                          onClick={() => {
                            scrollTo('ws-propuestas')
                            abrirFormNuevo({ titulo: alerta.titulo, motivo: alerta.detalle + '\n\nAcción: ' + alerta.accion, prioridad: prioridad === 'Alta' ? 'alta' : prioridad === 'Media' ? 'media' : 'baja' })
                          }}
                        >
                          → Crear propuesta desde esta alerta
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="ws-empty-block">Sin alertas claras. Oportunidad de mantenimiento y afinado puntual.</div>
            )}

            {/* Arquitectura de precios */}
            <div className="ws-strategy-panel">
              <div className="ws-strategy-head">
                <div>
                  <span className="admin-kicker">Arquitectura de precios</span>
                  <div className="ws-ticket-editor">
                    <label>Ticket medio comida</label>
                    <div className="ws-ticket-row">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={ticketDraft}
                        placeholder={diagnostico.ticket.valor != null ? String(diagnostico.ticket.valor) : ''}
                        onChange={e => setTicketDraft(e.target.value)}
                      />
                      <button onClick={guardarTicket} disabled={guardandoTicket}>
                        {guardandoTicket ? 'Guardando' : 'Guardar'}
                      </button>
                    </div>
                    <small>
                      {diagnostico.ticket.valor == null
                        ? 'Sin ticket configurado — introdúcelo aquí'
                        : `${eur(diagnostico.ticket.valor)} · ${diagnostico.ticket.fuente}${diagnostico.ticket.esEstimado ? ' · Estimado automáticamente' : ''}`}
                    </small>
                  </div>
                </div>
              </div>

              <div className="ws-strategy-grid">
                <div className="ws-strategy-col ws-strategy-col-wide">
                  {diagnostico.ticket.valor == null ? (
                    <p className="ws-sin-ticket">Ticket medio no disponible — introdúcelo arriba para ver la arquitectura de precios.</p>
                  ) : diagnostico.wineMapping.gamas.map(gama => (
                    <div className="mapping-row" key={gama.id}>
                      <div>
                        <strong>{gama.label}</strong>
                        <span>{gama.rangoTexto} EUR · {gama.vinos} vinos</span>
                      </div>
                      <div className="mapping-bar"><i style={{ width: `${Math.min(100, gama.real)}%` }} /></div>
                      <b>{gama.real}%</b>
                      <em>obj. {gama.objetivo}%</em>
                    </div>
                  ))}
                </div>

                <div className="ws-strategy-col">
                  <p className="ws-strategy-col-title">Salud operativa</p>
                  <div className="strategy-pills">
                    {diagnostico.salud.map(item => (
                      <span key={item.label} className={item.valor > Math.max(0, item.total * 0.2) ? 'is-warning' : ''}>
                        {item.label}: {item.valor}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="ws-strategy-col">
                  <p className="ws-strategy-col-title">Equilibrio comercial</p>
                  <div className="strategy-pills">
                    {diagnostico.equilibrio.map(item => (
                      <span key={item.label}>{item.label}: {item.valor}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sala y operativa */}
            <div className="ws-sala-grid">
              <div>
                <span>Sala 30 días</span>
                <strong>{ventasMarcadas.length} ventas marcadas</strong>
                <p>{incidenciasStock.length} incidencias stock · {dudasSala.length} dudas o cambios · {metricas.sommelier30} usos maridaje</p>
                {vinosConDudas.length > 0 && (
                  <p className="ws-fricciones">Fricción: {vinosConDudas.map(([v, n]) => `${v} (${n})`).join(' · ')}</p>
                )}
              </div>
              <div>
                <span>Bodega</span>
                <strong>{eur(metricas.valorCoste)} a coste</strong>
                <p>{eur(metricas.valorVenta)} potencial venta · {metricas.sinCoste} sin coste · {metricas.margenBajo} con margen bajo</p>
              </div>
              <div>
                <span>Compra</span>
                <strong>{metricas.bajoMinimo} bajo mínimo</strong>
                <p>{metricas.sinProveedor} sin proveedor · {metricas.sinStockMinimo} sin stock mínimo</p>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════
              SECCIÓN: PROPUESTAS
          ═══════════════════════════════════════ */}
          <section id="ws-matching" className="ws-section">
            <div className="ws-section-head">
              <div>
                <h3 className="ws-section-title">Matching carta - catalogo proveedor</h3>
                <p className="ws-match-sub">Cruza vinos del restaurante con catalogos cargados para completar proveedor, coste, referencia y formato sin pedirle mas trabajo al encargado.</p>
              </div>
              <Link href="/admin/proveedores" className="ws-btn-secondary">Gestionar catalogos</Link>
            </div>

            <div className="admin-create-form ws-form-grid ws-match-tools">
              <label>
                Proveedor
                <select value={proveedorMatchId} onChange={e => setProveedorMatchId(e.target.value)}>
                  <option value="">Todos los proveedores...</option>
                  {proveedoresCatalogo.map(proveedor => (
                    <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                  ))}
                </select>
              </label>
              <label>
                Buscar vino de la carta
                <input value={busquedaMatchCatalogo} onChange={e => setBusquedaMatchCatalogo(e.target.value)} placeholder="Nombre, bodega, uva, region..." />
              </label>
            </div>

            {mensajeMatch && <p className={`admin-alert ${mensajeMatch.startsWith('No se pudo') ? 'admin-alert-error' : 'admin-alert-ok'}`}>{mensajeMatch}</p>}

            <div className="ws-match-list">
              {vinosCatalogo.length === 0 && (
                <div className="ws-empty-block">Aun no hay catalogos de proveedor cargados. Cuando subas tarifas, aqui apareceran cruces automaticos.</div>
              )}
              {vinosCatalogo.length > 0 && matchesCatalogo.length === 0 && (
                <div className="ws-empty-block">No hay coincidencias claras con los filtros actuales. Prueba otro proveedor o revisa nombres/bodegas del catalogo.</div>
              )}
              {matchesCatalogo.map(({ vino, candidatos }) => {
                const faltantes = [
                  !vino.proveedor && 'proveedor',
                  !decimal(vino.coste_compra) && 'coste',
                  !vino.referencia_proveedor && 'referencia',
                  !vino.formato_compra && 'formato',
                ].filter(Boolean)
                return (
                  <article className="ws-match-card" key={vino.id}>
                    <div className="ws-match-current">
                      <span className="admin-kicker">Carta restaurante</span>
                      <h4>{vino.nombre}</h4>
                      <p>{[vino.bodega, vino.region, vino.uva, vino.anada].filter(Boolean).join(' · ') || 'Sin datos extra'}</p>
                      <div className="strategy-pills">
                        {faltantes.map(item => <span key={item} className="is-warning">Falta {item}</span>)}
                      </div>
                    </div>
                    <div className="ws-match-candidates">
                      {candidatos.map(match => {
                        const key = `${vino.id}-${match.vino.id}`
                        return (
                          <div className="ws-match-candidate" key={key}>
                            <div>
                              <strong>{match.vino.nombre}</strong>
                              <span>{[match.proveedor?.nombre || match.vino.proveedores_vino?.nombre, match.vino.bodega, match.vino.region, match.vino.formato, match.vino.coste_estimado ? `${match.vino.coste_estimado} EUR` : '', match.vino.referencia ? `ref. ${match.vino.referencia}` : ''].filter(Boolean).join(' · ')}</span>
                              <small>Confianza {Math.min(99, match.score)}%</small>
                            </div>
                            <button
                              type="button"
                              onClick={() => aplicarMatchCatalogo(vino, match)}
                              disabled={aplicandoMatchId === key}
                            >
                              {aplicandoMatchId === key ? 'Aplicando...' : 'Aplicar datos'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section id="ws-propuestas" className="ws-section">
            <div className="ws-section-head">
              <h3 className="ws-section-title">Propuestas</h3>
              <button className="ws-btn-primary" onClick={() => mostrarForm && !editandoPropuesta ? setMostrarForm(false) : abrirFormNuevo()}>
                {mostrarForm && !editandoPropuesta ? 'Cancelar' : '+ Nueva propuesta'}
              </button>
            </div>

            {/* Formulario inline */}
            {mostrarForm && (
              <div ref={propuestaFormRef} className="ws-propuesta-form">
                <p className="admin-kicker">{editandoPropuesta ? 'Editar propuesta' : 'Nueva propuesta'}</p>
                <form onSubmit={guardarPropuesta} className="admin-create-form ws-form-grid">
                  <label>
                    Tipo de propuesta
                    <select value={modoPropuesta} onChange={e => { setModoPropuesta(e.target.value); setVinoExistenteId(''); setProveedorCatalogoId(''); setVinoCatalogoId('') }}>
                      <option value="alta">Añadir o recomendar vino</option>
                      <option value="retirada">Retirar vino existente</option>
                    </select>
                  </label>
                  <label>
                    Título
                    <input value={formPropuesta.titulo} onChange={e => actualizarForm('titulo', e.target.value)} placeholder="Falta un vino dulce para postres" required />
                  </label>
                  {modoPropuesta === 'retirada' ? (
                    <label>
                      Vino de su carta
                      <select value={vinoExistenteId || (formPropuesta.vino ? 'actual' : '')} onChange={e => e.target.value !== 'actual' && seleccionarVinoExistente(e.target.value)} required>
                        <option value="">Selecciona una referencia...</option>
                        {formPropuesta.vino && <option value="actual">{formPropuesta.vino}</option>}
                        {vinos.map(v => (
                          <option key={v.id} value={v.id}>{[v.nombre, v.bodega, v.region].filter(Boolean).join(' · ')}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <label>
                        Proveedor del catálogo
                        <select value={proveedorCatalogoId} onChange={e => seleccionarProveedorCatalogo(e.target.value)}>
                          <option value="">Todos los proveedores...</option>
                          {proveedoresCatalogo.map(proveedor => (
                            <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Buscar vino del catálogo común
                        <input value={busquedaVinoCatalogo} onChange={e => setBusquedaVinoCatalogo(e.target.value)} placeholder="Nombre, bodega, zona, uva o referencia..." />
                      </label>
                      <div className="admin-create-wide catalog-picker">
                        {vinosCatalogoFiltrados.length === 0 && <p>No hay vinos con ese filtro.</p>}
                        {vinosCatalogoFiltrados.map(vino => {
                          const proveedor = proveedoresCatalogo.find(item => String(item.id) === String(vino.proveedor_id))
                          return (
                            <button
                              type="button"
                              key={vino.id}
                              className={String(vinoCatalogoId) === String(vino.id) ? 'active' : ''}
                              onClick={() => seleccionarVinoCatalogo(vino.id)}
                            >
                              <strong>{vino.nombre}</strong>
                              <span>{[proveedor?.nombre, vino.bodega, vino.region, vino.formato, vino.coste_estimado ? `${vino.coste_estimado} EUR` : ''].filter(Boolean).join(' · ')}</span>
                            </button>
                          )
                        })}
                      </div>
                      <label>Vino sugerido<input value={formPropuesta.vino} onChange={e => actualizarForm('vino', e.target.value)} placeholder="Moscatel naturalmente dulce..." /></label>
                      <label>Tipo / estilo<input value={formPropuesta.tipo} onChange={e => actualizarForm('tipo', e.target.value)} placeholder="Dulce, generoso, blanco salino..." /></label>
                    </>
                  )}
                  <label>Zona / D.O.<input value={formPropuesta.zona} onChange={e => actualizarForm('zona', e.target.value)} placeholder="Málaga, Jerez, Rías Baixas..." /></label>
                  <label>Proveedor sugerido<input value={formPropuesta.proveedor_sugerido} onChange={e => actualizarForm('proveedor_sugerido', e.target.value)} placeholder="Distribuidor o bodega" /></label>
                  <label>Coste estimado<input type="number" step="0.01" value={formPropuesta.coste_estimado} onChange={e => actualizarForm('coste_estimado', e.target.value)} /></label>
                  <label>Precio recomendado<input type="number" step="0.01" value={formPropuesta.precio_recomendado} onChange={e => actualizarForm('precio_recomendado', e.target.value)} /></label>
                  <label>Margen sobre coste %<input type="number" min="1" max="900" value={formPropuesta.margen_objetivo} onChange={e => actualizarForm('margen_objetivo', e.target.value)} placeholder="Ej. 200" /></label>
                  <label>
                    Plato objetivo
                    <select value={formPropuesta.plato_objetivo} onChange={e => actualizarForm('plato_objetivo', e.target.value)}>
                      <option value="">Sin plato concreto...</option>
                      {formPropuesta.plato_objetivo && !platos.some(plato => plato.nombre === formPropuesta.plato_objetivo) && (
                        <option value={formPropuesta.plato_objetivo}>{formPropuesta.plato_objetivo}</option>
                      )}
                      {platos.map(plato => (
                        <option key={plato.id} value={plato.nombre}>
                          {[plato.nombre, plato.categoria].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prioridad
                    <select value={formPropuesta.prioridad} onChange={e => actualizarForm('prioridad', e.target.value)}>
                      <option value="alta">Alta</option>
                      <option value="media">Media</option>
                      <option value="baja">Baja</option>
                    </select>
                  </label>
                  <label>
                    Estado
                    <select value={formPropuesta.estado} onChange={e => actualizarForm('estado', e.target.value)}>
                      <option value="propuesta">Propuesta</option>
                      <option value="interesa">Interesa</option>
                      <option value="descartada">Descartada</option>
                      <option value="incorporada">Incorporada</option>
                    </select>
                  </label>
                  <label className="admin-create-wide">
                    Motivo
                    <textarea
                      value={formPropuesta.motivo}
                      onChange={e => actualizarForm('motivo', e.target.value)}
                      placeholder={modoPropuesta === 'retirada'
                        ? 'Por qué conviene retirarlo: baja rotación, margen débil, no encaja con cocina...'
                        : 'Por qué conviene, qué hueco cubre, cómo lo vendería sala...'}
                    />
                  </label>
                  <div className="ws-form-actions">
                    <button disabled={guardandoPropuesta}>{guardandoPropuesta ? 'Guardando...' : editandoPropuesta ? 'Guardar cambios' : 'Crear propuesta'}</button>
                    {editandoPropuesta && (
                      <button type="button" className="admin-plain-button" onClick={() => { setEditandoPropuesta(null); setFormPropuesta(propuestaVacia); setProveedorCatalogoId(''); setVinoCatalogoId(''); setBusquedaVinoCatalogo(''); setMostrarForm(false) }}>Cancelar</button>
                    )}
                  </div>
                  {errorPropuesta && <p className="admin-alert admin-alert-error">{errorPropuesta}</p>}
                </form>
              </div>
            )}

            {/* Lista de propuestas */}
            {propuestas.length === 0 ? (
              <div className="ws-empty-block">No hay propuestas para este restaurante todavía.</div>
            ) : (
              <div className="ws-propuestas-list">
                {propuestas.map(p => (
                  <div key={p.id} className={`ws-propuesta-item ws-propuesta-${p.estado}`}>
                    <div className="ws-propuesta-info">
                      <div className="ws-propuesta-badges">
                        <span className={`ws-estado ws-estado-${p.estado}`}>{p.estado}</span>
                        <span className="ws-prioridad">{p.prioridad}</span>
                      </div>
                      <strong>{p.titulo}</strong>
                      <p>{[p.vino, p.tipo, p.zona].filter(Boolean).join(' · ') || 'Propuesta de consultoría'}</p>
                      <div className="ws-propuesta-history">
                        <span>Abierta desde hace {diasDesde(p.created_at) ?? 0} dias</span>
                        <span>Responsable: Juanjo</span>
                        <a href="#ws-propuestas">Historial de cambios</a>
                      </div>
                      {p.motivo && <p className="ws-propuesta-motivo">{p.motivo}</p>}
                      {(p.coste_estimado || p.precio_recomendado) && (
                        <small>
                          {p.coste_estimado ? `Coste: ${p.coste_estimado} EUR` : ''}
                          {p.precio_recomendado ? ` · PVP rec: ${p.precio_recomendado} EUR` : ''}
                          {p.margen_objetivo ? ` · Margen: ${p.margen_objetivo}%` : ''}
                        </small>
                      )}
                    </div>
                    <div className="ws-propuesta-actions">
                      {p.estado !== 'incorporada' && <button onClick={() => completarPropuesta(p)}>Marcar completada</button>}
                      <button onClick={() => abrirFormEditar(p)}>Editar</button>
                      <button className="admin-plain-button" onClick={() => borrarPropuesta(p.id)}>Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ═══════════════════════════════════════
              SECCIÓN: SELECCIÓN JUANJO
          ═══════════════════════════════════════ */}
          <section id="ws-seleccion" className="ws-section">
            <div className="ws-section-head">
              <h3 className="ws-section-title">Selección Juanjo</h3>
              <span className="ws-sub">{seleccion.length}/4 vinos</span>
            </div>

            {seleccion.length < 4 && (
              <div className="ws-propuesta-form" style={{ marginBottom: 20 }}>
                <p className="admin-kicker">Añadir vino a la selección</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <label>
                    Vino
                    <select value={vinoElegido} onChange={e => setVinoElegido(e.target.value)}>
                      <option value="">Selecciona un vino de la carta...</option>
                      {vinos.filter(v => v.activo !== false && !seleccion.some(s => s.vino_id === v.id)).map(v => (
                        <option key={v.id} value={v.id}>{v.nombre} · {v.bodega}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nota personal
                    <input
                      value={notaSeleccion}
                      onChange={e => setNotaSeleccion(e.target.value)}
                      placeholder="Por qué lo recomiendas, con qué platos..."
                    />
                  </label>
                </div>
                <button
                  className="ws-btn-primary"
                  onClick={añadirSeleccion}
                  disabled={guardandoSeleccion || !vinoElegido || !notaSeleccion.trim()}
                >
                  {guardandoSeleccion ? 'Guardando...' : 'Añadir a la selección'}
                </button>
              </div>
            )}

            {seleccion.length > 0 ? (
              <div className="ws-propuestas-list">
                {seleccion.map(s => (
                  <div key={s.id} className="ws-propuesta-item">
                    <div className="ws-propuesta-info">
                      <strong>{s.vinos?.nombre}</strong>
                      <p>{[s.vinos?.bodega, s.vinos?.region].filter(Boolean).join(' · ')}</p>
                      {s.nota_personal && <p className="ws-propuesta-motivo">{s.nota_personal}</p>}
                    </div>
                    <div className="ws-propuesta-actions">
                      <button className="admin-plain-button" onClick={() => quitarSeleccion(s.id)}>Quitar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ws-empty-block">Sin vinos en la selección de este restaurante.</div>
            )}
          </section>

          {/* ═══════════════════════════════════════
              SECCIÓN: INFORME
          ═══════════════════════════════════════ */}
          <section id="ws-informe" className="ws-section">
            <div className="ws-section-head">
              <h3 className="ws-section-title">Informe</h3>
              <a href={`/admin/informe/${id}`} target="_blank" rel="noreferrer" className="ws-btn-secondary">Abrir versión imprimible ↗</a>
            </div>

            <div className="ws-informe-preview">
              <div className="ws-informe-hero">
                <div>
                  <p className="admin-kicker">Informe privado de consultoría</p>
                  <h4>Estado de la carta de vinos de {restaurante.nombre}</h4>
                  <p>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ')} · {fecha}</p>
                </div>
                <div className={`report-score report-score-${prioridad.toLowerCase()}`}>
                  <span>{score}</span>
                  <strong>{prioridad}</strong>
                </div>
              </div>

              <div className="ws-informe-metrics">
                <div><span>Valor a coste</span><strong>{eur(metricas.valorCoste)}</strong></div>
                <div><span>Potencial venta</span><strong>{eur(metricas.valorVenta)}</strong></div>
                <div><span>Margen medio</span><strong>{metricas.margenMedio ?? '—'}%</strong></div>
                <div><span>Maridajes 30d</span><strong>{metricas.sommelier30}</strong></div>
              </div>

              <div className="ws-informe-alertas">
                <p className="admin-kicker">Oportunidades principales</p>
                {alertas.slice(0, 5).map(a => (
                  <div key={a.titulo} className="ws-informe-alerta">
                    <strong>{a.titulo}</strong>
                    <p>{a.detalle}</p>
                    <em>{a.accion}</em>
                  </div>
                ))}
              </div>

              <div className="ws-informe-plan">
                <p className="admin-kicker">Hoja de ruta propuesta</p>
                {alertas.slice(0, 4).map((a, i) => (
                  <div key={a.titulo} className="ws-informe-plan-item">
                    <span>{i + 1}</span>
                    <div>
                      <strong>{a.titulo}</strong>
                      <p>{a.accion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <footer className="ws-audit-footer">
            <span>Ultima actualizacion: {user?.email || 'Consultor'} · {fecha}</span>
            <a href="#ws-diagnostico">Ver historial de cambios completo</a>
          </footer>

    </div>
  )
}
