'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail, setAdminRestaurantEmail, setAdminRestaurantId } from '../../demo'


function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

function oportunidadRadar(informe) {
  const persistida = informe.ejecutivo?.resumen?.recuperacion_anual_estimada || 0
  if (persistida > 0) return persistida
  const margenBajo = informe.metricas?.margenBajo || 0
  const sinCoste = informe.metricas?.sinCoste || 0
  const propuestas = informe.propuestasAbiertas?.length || 0
  const copaFaltante = Math.max(0, Math.round((informe.metricas?.vinos || 0) * 0.12) - (informe.metricas?.copa || 0))
  return (margenBajo * 180) + (sinCoste * 60) + (propuestas * 120) + (copaFaltante * 90)
}

function capitalRadar(informe) {
  const persistido = informe.ejecutivo?.resumen?.capital_liberable_estimado || 0
  if (persistido > 0) return persistido
  const valorCoste = informe.metricas?.valorCoste || 0
  const vinos = informe.metricas?.vinos || 0
  if (!valorCoste || !vinos) return 0
  const friccion = (informe.metricas?.margenBajo || 0) + (informe.metricas?.bajoMinimo || 0) + (informe.metricas?.sinProveedor || 0)
  if (!friccion) return 0
  return Math.round(valorCoste * Math.min(0.18, Math.max(0.04, friccion / vinos * 0.18)))
}

function alertasCriticasRadar(informe) {
  const persistidas = informe.ejecutivo?.resumen?.alertas_criticas
  if (typeof persistidas === 'number' && persistidas > 0) return persistidas
  return informe.prioridad === 'Alta' ? Math.max(1, Math.min(3, informe.alertas?.filter(alerta => alerta.peso >= 12).length || 1)) : 0
}

function candidatosCopaRadar(informe) {
  const persistidos = informe.ejecutivo?.resumen?.candidatos_copa || 0
  if (persistidos > 0) return persistidos
  return Math.max(0, Math.round((informe.metricas?.vinos || 0) * 0.12) - (informe.metricas?.copa || 0))
}

const IVA_HOSTELERIA = 1.10
const sinIva = valor => decimal(valor) / IVA_HOSTELERIA
const conIva = valor => decimal(valor) * IVA_HOSTELERIA

function ticketReferencia(restaurante, platosActivos) {
  const ticketGuardado = decimal(restaurante.ticket_medio || restaurante.ticket_medio_comida || restaurante.ticket_comida)
  if (ticketGuardado > 0) return { valor: ticketGuardado, fuente: 'ticket configurado', ticketEsEstimado: false }
  const platosConPrecio = platosActivos.filter(p => decimal(p.precio) > 0)
  if (platosConPrecio.length) {
    const mediaPlato = platosConPrecio.reduce((sum, p) => sum + decimal(p.precio), 0) / platosConPrecio.length
    return { valor: Math.round(mediaPlato * 2.5), fuente: 'estimado por carta de comida', ticketEsEstimado: true }
  }
  return { valor: null, fuente: 'no disponible', ticketEsEstimado: true }
}

function mapaPrecios(vinosConPrecio, ticket) {
  if (!ticket) return { gamas: [], desajustes: [], base: 'sin_ticket' }
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
  // Botella completa vs ticket por persona: escala con ticket, pero mantiene suelos comerciales realistas.
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
  const gamas = rangos.map(rango => {
    const vinos = vinosConPrecio.filter(v => {
      const precio = decimal(v.precio_botella)
      return rango.max === Infinity ? precio >= rango.min : precio >= rango.min && precio < rango.max
    })
    const real = pct(vinos.length, total)
    return {
      ...rango,
      vinos: vinos.length,
      real,
      diferencia: real - rango.objetivo,
      rangoTexto: rango.max === Infinity
        ? `>${Math.round(rango.min)}`
        : rango.min === 0
          ? `hasta ${Math.round(rango.max)}`
          : `${Math.round(rango.min)}–${Math.round(rango.max)}`,
    }
  })
  const umbral = Math.max(1, Math.round(total * 0.10))
  const desajustes = gamas
    .filter(g => {
      const ideal = Math.round((g.objetivo / 100) * total)
      return Math.abs(g.vinos - ideal) > umbral || (g.vinos === 0 && ideal > 0)
    })
    .map(g => `${g.label}: ${g.real}% real vs ${g.objetivo}% objetivo`)
  if (referencias.estado === 'corta') desajustes.unshift(`Carta corta: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)
  if (referencias.estado === 'larga') desajustes.unshift(`Carta larga: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)
  return { gamas, desajustes, referencias, base: 'pvp_iva_incl' }
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
  return terminos.some(termino => limpio.includes(normalizar(termino)))
}

function textoVino(vino) {
  return `${vino.nombre || ''} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`
}

function textoPlato(plato) {
  return `${plato.nombre || ''} ${plato.descripcion || ''} ${plato.categoria || ''}`
}

function analizar(restaurante, vinos = [], platos = [], estadisticas = [], propuestas = []) {
  const activos = vinos.filter(vino => vino.activo !== false)
  const platosActivos = platos.filter(plato => plato.activo !== false)
  const total = activos.length
  const tipos = activos.reduce((acc, vino) => {
    acc[vino.tipo || 'sin_tipo'] = (acc[vino.tipo || 'sin_tipo'] || 0) + 1
    return acc
  }, {})
  const regiones = activos.reduce((acc, vino) => {
    const region = normalizar(vino.region || '')
    if (!region) return acc
    const clave = region.includes('rioja') ? 'rioja' : region.includes('ribera') ? 'ribera' : region
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})

  const porCopa = activos.filter(v => Number(v.precio_copa) > 0)
  const sinPrecio = activos.filter(v => !Number(v.precio_botella))
  const sinPerfil = activos.filter(v => !v.notas_cata || normalizar(v.notas_cata).length < 12)
  const sinAnada = activos.filter(v => !v.anada)
  const sinStock = activos.filter(v => Number(v.stock) === 0)
  const sinCoste = activos.filter(v => !decimal(v.coste_compra))
  const sinProveedor = activos.filter(v => !v.proveedor)
  const sinStockMinimo = activos.filter(v => !decimal(v.stock_minimo))
  const bajoMinimo = activos.filter(v => decimal(v.stock_minimo) > 0 && decimal(v.stock) <= decimal(v.stock_minimo))
  const conMargen = activos.filter(v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0)
  const margenMedio = conMargen.length
    ? Math.round(conMargen.reduce((sum, v) => sum + (((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100), 0) / conMargen.length)
    : null
  const margenBajo = conMargen.filter(v => (((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100) < 55)
  const valorCoste = activos.reduce((sum, v) => sum + decimal(v.stock) * decimal(v.coste_compra), 0)
  const valorVenta = activos.reduce((sum, v) => sum + decimal(v.stock) * decimal(v.precio_botella), 0)

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

  const zona = normalizar(`${restaurante.ciudad || ''} ${restaurante.provincia || ''}`)
  const terminosLocales = [
    ...zona.split(/[^a-z0-9]+/).filter(t => t.length > 3),
    zona.includes('malaga') && 'sierras de malaga',
    zona.includes('jerez') && 'jerez',
    zona.includes('cadiz') && 'cadiz'
  ].filter(Boolean)
  const locales = terminosLocales.length
    ? activos.filter(v => terminosLocales.some(t => normalizar(textoVino(v)).includes(t)))
    : []

  const vinosConPrecio = activos.filter(v => Number(v.precio_botella) > 0)
  const platosConPrecio = platosActivos.filter(p => Number(p.precio) > 0)
  const ticket = ticketReferencia(restaurante, platosActivos)
  const wineMapping = mapaPrecios(vinosConPrecio, ticket.valor)
  const precioMedioVino = vinosConPrecio.reduce((sum, v, _, arr) => sum + Number(v.precio_botella) / arr.length, 0)
  const precioMedioPlato = platosConPrecio.reduce((sum, p, _, arr) => sum + Number(p.precio) / arr.length, 0)
  const vinosPremium = activos.filter(v => Number(v.precio_botella) >= Math.max(35, precioMedioVino * 1.35))
  const platosPremium = platosActivos.filter(p => Number(p.precio) >= Math.max(20, precioMedioPlato * 1.35))

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
  const oportunidad = (peso, titulo, detalle, servicio) => alertas.push({ peso, titulo, detalle, servicio })

  if (total < 8) oportunidad(14, 'Carta de vinos muy corta', 'Hay pocas referencias para construir relato, margen y maridajes por familias de platos.', 'Diseno de carta base')
  if (porCopa.length < Math.max(3, Math.round(total * 0.12))) oportunidad(12, 'Poca estrategia por copa', `${porCopa.length} referencias por copa sobre ${total}. Falta palanca de rotación y ticket medio.`, 'Programa de vinos por copa')
  if (locales.length < Math.max(2, Math.round(total * 0.08))) oportunidad(13, 'Vino local débil', `${locales.length} referencias locales detectadas. Hay margen para identidad territorial y storytelling.`, 'Selección de bodegas locales')
  if (platosPostre.length >= 2 && dulces.length === 0) oportunidad(15, 'Postres sin vino de cierre', `${platosPostre.length} platos/postres detectados y ningun vino dulce claro.`, 'Maridaje postres y venta sugerida')
  if (platosFritura.length >= 2 && generosos.length + espumosos.length < 2) oportunidad(13, 'Frituras sin aliados claros', 'Faltan generosos secos, burbuja o blancos salinos para vender con frituras/rebozados.', 'Ajuste de estilos por cocina')
  if (platosPescado.length >= 2 && frescos.length + espumosos.length + generosos.length < 3) oportunidad(10, 'Pescados con poca cobertura fresca', 'Pocos vinos frescos, salinos, blancos o burbuja para pescado y marisco.', 'Rediseno por maridaje')
  if (platosQueso.length >= 1 && generosos.length + dulces.length < 2) oportunidad(9, 'Quesos sin recorrido de maridaje', 'Hay queso en carta pero poca cobertura de generoso, oxidativo o dulce.', 'Experiencia de quesos y vino')
  if (platosCarne.length >= 2 && (tipos.tinto || 0) < 4) oportunidad(8, 'Carnes con pocos tintos defendibles', 'La cocina pide tintos con perfiles distintos, no solo una opción genérica.', 'Curaduría de tintos')
  if (pct((regiones.rioja || 0) + (regiones.ribera || 0), total) > 35) oportunidad(12, 'Exceso Rioja/Ribera', `${pct((regiones.rioja || 0) + (regiones.ribera || 0), total)}% de la carta está concentrada en Rioja/Ribera.`, 'Diversificación de regiones')
  if (pct(tintosMadera.length, total) > 28) oportunidad(8, 'Perfil tinto demasiado parecido', 'Muchos tintos parecen apoyarse en madera/crianza; puede cansar y limitar maridajes.', 'Arquitectura de estilos')
  if ((tipos.blanco || 0) < (tipos.tinto || 0) * 0.35 && platosPescado.length + platosFritura.length > 2) oportunidad(9, 'Faltan blancos gastronómicos', 'La cocina da razones para vender blancos, pero la carta se apoya demasiado en tintos.', 'Selección de blancos')
  if (vinosPremium.length < Math.max(2, Math.round(platosPremium.length * 0.5)) && platosPremium.length > 1) oportunidad(8, 'Ticket alto sin vinos premium suficientes', `${platosPremium.length} platos de ticket alto y ${vinosPremium.length} vinos premium claros.`, 'Subida de ticket medio')
  if (sinPerfil.length > total * 0.35) oportunidad(7, 'Faltan argumentos de venta', `${sinPerfil.length} vinos sin perfil de cata útil para sala.`, 'Formación de sala')
  if (sinPrecio.length > 0) oportunidad(6, 'Vinos sin precio', `${sinPrecio.length} referencias sin precio de botella.`, 'Auditoria operativa')
  if (sinAnada.length > total * 0.35) oportunidad(5, 'Anadas poco cuidadas', `${sinAnada.length} referencias sin anada.`, 'Limpieza de carta')
  if (sinStock.length > total * 0.25) oportunidad(5, 'Stock poco fiable', `${sinStock.length} referencias con stock cero.`, 'Control de bodega')
  if (sinCoste.length > total * 0.35) oportunidad(12, 'No se está midiendo rentabilidad real', `${sinCoste.length} vinos sin coste de compra. Sin eso no hay margen, solo intuición.`, 'Auditoría de margen y bodega')
  if (margenBajo.length > 0) oportunidad(11, 'Margen bajo en referencias con datos', `${margenBajo.length} vinos bajan del 55% de margen estimado. Puede haber compra cara o PVP mal defendido.`, 'Pricing y beverage cost')
  if (bajoMinimo.length > 0) oportunidad(9, 'Reposición pendiente', `${bajoMinimo.length} vinos están por debajo del stock mínimo configurado.`, 'Rutina de compras')
  if (sinProveedor.length > total * 0.4) oportunidad(8, 'Proveedores poco trazados', `${sinProveedor.length} vinos sin proveedor. Hay margen para ordenar compra y negociación.`, 'Mapa de proveedores')
  if (wineMapping.desajustes.length > 0) oportunidad(12, 'Mapa de precios descompensado', wineMapping.desajustes.slice(0, 2).join('. '), 'Arquitectura de precios')
  if (incidenciasStock.length >= 2) oportunidad(10, 'Sala está encontrando roturas de stock', `${incidenciasStock.length} incidencias marcadas en los últimos 30 días.`, 'Control de servicio y reposición')
  if (dudasSala.length >= 3) oportunidad(9, 'Vinos que no terminan de convencer en sala', `${dudasSala.length} dudas o cambios marcados. Puede faltar argumento, precio o alternativa.`, 'Formación de sala')
  if (propuestasInteresan.length > 0) oportunidad(14, 'Cliente caliente con propuestas abiertas', `${propuestasInteresan.length} propuestas marcadas como interesan. Buen momento para cerrar acción.`, 'Seguimiento comercial')
  if (propuestasAbiertas.length > 3) oportunidad(6, 'Propuestas acumuladas sin cierre', `${propuestasAbiertas.length} propuestas abiertas. Conviene simplificar y llevar una decisión concreta.`, 'Seguimiento de propuestas')

  const alertasOrdenadas = alertas.sort((a, b) => b.peso - a.peso)
  const score = Math.min(100, Math.round(alertasOrdenadas.reduce((sum, a) => sum + a.peso, 0)))
  const prioridad = score >= 65 ? 'Alta' : score >= 35 ? 'Media' : 'Baja'
  const servicios = [...new Set(alertasOrdenadas.map(a => a.servicio))].slice(0, 3)
  const propuesta = alertasOrdenadas.slice(0, 3).map(a => a.titulo).join('. ')
  const siguienteMovimiento = alertasOrdenadas[0]
    ? `${alertasOrdenadas[0].servicio}: ${alertasOrdenadas[0].titulo.toLowerCase()}`
    : 'Mantenimiento fino: revisar relato, sala y pequeñas mejoras de carta'

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
      sommelier30
    },
    diagnostico: {
      ticket,
      wineMapping,
      salud: [
        { label: 'Sin precio', valor: sinPrecio.length, total },
        { label: 'Sin anada', valor: sinAnada.length, total },
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

export default function RadarConsultoria() {
  const [user, setUser] = useState(null)
  const [restaurantes, setRestaurantes] = useState([])
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [ticketDrafts, setTicketDrafts] = useState({})
  const [guardandoTicket, setGuardandoTicket] = useState('')
  const [loading, setLoading] = useState(true)
  const [favoritos, setFavoritos] = useState([])
  const [radarEjecutivo, setRadarEjecutivo] = useState(null)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }
      setUser(user)
      const desde = haceDiasISO(30)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token || ''
      const radarPromise = token
        ? fetch('/api/admin/radar-ejecutivo', { headers: { Authorization: `Bearer ${token}` } })
            .then(async res => res.ok ? res.json() : null)
            .catch(() => null)
        : Promise.resolve(null)
      const [{ data: rests }, { data: vinosData }, { data: platosData }, { data: estadisticasData }, { data: propuestasData }, radarData] = await Promise.all([
        supabase.from('restaurantes').select('*').order('nombre'),
        supabase.from('vinos').select('*'),
        supabase.from('platos').select('*'),
        supabase.from('estadisticas').select('*').gte('created_at', desde),
        supabase.from('consultor_propuestas').select('*').order('created_at', { ascending: false }),
        radarPromise,
      ])
      setRestaurantes(rests || [])
      setTicketDrafts(Object.fromEntries((rests || []).map(rest => [
        rest.id,
        rest.ticket_medio_comida || rest.ticket_medio || rest.ticket_comida || ''
      ])))
      setVinos(vinosData || [])
      setPlatos(platosData || [])
      setEstadisticas(estadisticasData || [])
      setPropuestas(propuestasData || [])
      setRadarEjecutivo(radarData)
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    try {
      setFavoritos(JSON.parse(window.localStorage.getItem('admin_restaurant_favorites') || '[]'))
    } catch {
      setFavoritos([])
    }
  }, [])

  const ejecutivoPorRestaurante = useMemo(() => {
    const mapa = new Map()
    for (const item of radarEjecutivo?.items || []) {
      mapa.set(item.restaurante.id, item)
    }
    return mapa
  }, [radarEjecutivo])

  const informes = useMemo(() => restaurantes.map(restaurante => {
    const vinosRest = vinos.filter(v => v.restaurante_id === restaurante.id)
    const platosRest = platos.filter(p => p.restaurante_id === restaurante.id)
    const estadisticasRest = estadisticas.filter(e => e.restaurante_id === restaurante.id)
    const propuestasRest = propuestas.filter(p => p.restaurante_id === restaurante.id)
    const base = { restaurante, ...analizar(restaurante, vinosRest, platosRest, estadisticasRest, propuestasRest) }
    const ejecutivo = ejecutivoPorRestaurante.get(restaurante.id)
    if (!ejecutivo) return base
    const prioridad = ejecutivo.prioridad === 'alta' ? 'Alta' : ejecutivo.prioridad === 'media' ? 'Media' : 'Baja'
    return {
      ...base,
      ejecutivo,
      score: ejecutivo.score ?? base.score,
      prioridad,
      siguienteMovimiento: ejecutivo.resumen?.siguiente_accion || base.siguienteMovimiento,
    }
  }).sort((a, b) => {
    const opA = a.ejecutivo?.resumen?.recuperacion_anual_estimada || 0
    const opB = b.ejecutivo?.resumen?.recuperacion_anual_estimada || 0
    return (b.score - a.score) || (opB - opA)
  }), [restaurantes, vinos, platos, estadisticas, propuestas, ejecutivoPorRestaurante])

  const informesFiltrados = informes.filter(informe => {
    if (filtro === 'alta') return informe.prioridad === 'Alta'
    if (filtro === 'margen') return informe.metricas.sinCoste > 0 || informe.metricas.margenBajo > 0
    if (filtro === 'sala') return informe.dudasSala.length > 0 || informe.incidenciasStock.length > 0
    if (filtro === 'propuestas') return informe.propuestasAbiertas.length > 0
    if (filtro === 'oportunidad') return oportunidadRadar(informe) > 0
    if (filtro === 'capital') return capitalRadar(informe) > 0
    if (filtro === 'copa') return candidatosCopaRadar(informe) > 0
    if (filtro === 'carta') return informe.ejecutivo?.resumen?.carta_inflada || (informe.ejecutivo?.resumen?.bottom10_refs || 0) > 0
    return true
  })

  function gestionar(restaurante) {
    setAdminRestaurantEmail(restaurante.email)
    setAdminRestaurantId(restaurante.id)
    window.location.href = `/dashboard?restaurante_id=${restaurante.id}`
  }

  function toggleFavorito(event, restauranteId) {
    event.preventDefault()
    event.stopPropagation()
    setFavoritos(prev => {
      const next = prev.includes(restauranteId)
        ? prev.filter(id => id !== restauranteId)
        : [restauranteId, ...prev]
      window.localStorage.setItem('admin_restaurant_favorites', JSON.stringify(next))
      return next
    })
  }

  async function guardarTicket(informe) {
    const restaurante = informe.restaurante
    const valor = ticketDrafts[restaurante.id]
    setGuardandoTicket(restaurante.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/restaurantes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          ...restaurante,
          ticket_medio_comida: valor === '' ? null : Number(valor)
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el ticket.')
      setRestaurantes(actual => actual.map(rest => rest.id === restaurante.id ? data.restaurante : rest))
    } catch (error) {
      alert(error.message || 'No se pudo guardar el ticket medio.')
    } finally {
      setGuardandoTicket('')
    }
  }

  if (loading) {
    return <p className="admin-loading">Cargando radar</p>
  }

  const alta = informes.filter(i => i.prioridad === 'Alta').length
  const media = informes.filter(i => i.prioridad === 'Media').length
  const oportunidadTotal = informes.reduce((sum, informe) => sum + oportunidadRadar(informe), 0)
  const capitalTotal = informes.reduce((sum, informe) => sum + capitalRadar(informe), 0)
  const alertasCriticas = informes.reduce((sum, informe) => sum + alertasCriticasRadar(informe), 0)
  const candidatosCopa = informes.reduce((sum, informe) => sum + candidatosCopaRadar(informe), 0)
  const fotosPersistidas = informes.filter(informe => informe.ejecutivo?.resumen?.ultima_foto).length
  const filtros = [
    ['todas', 'Todas'],
    ['alta', 'Prioridad alta'],
    ['oportunidad', 'Oportunidad'],
    ['capital', 'Capital'],
    ['copa', 'Copa'],
    ['carta', 'Carta'],
    ['margen', 'Margen/bodega'],
    ['sala', 'Sala'],
    ['propuestas', 'Propuestas'],
  ]

  return (
    <div className="admin-main radar-main">
      <div className="radar-header">
            <div>
              <p className="admin-kicker">Centro de mando</p>
              <h2>Radar ejecutivo</h2>
              <p>{informes.length} restaurantes · {alta} prioridad alta · {media} prioridad media</p>
              <p className="radar-data-note">
                {fotosPersistidas} restaurantes con foto persistida. El resto usa estimacion previa del radar hasta pulsar "Recalcular y guardar" en su ficha.
              </p>
            </div>
          </div>

          <section className="executive-radar-summary">
            <article>
              <span>Oportunidad anual</span>
              <strong>{eur(oportunidadTotal)}</strong>
              <small>Potencial estimado si se ejecutan acciones.</small>
            </article>
            <article>
              <span>Capital liberable</span>
              <strong>{eur(capitalTotal)}</strong>
              <small>Stock/carta que puede desbloquear caja.</small>
            </article>
            <article>
              <span>Alertas criticas</span>
              <strong>{alertasCriticas}</strong>
              <small>Problemas abiertos que merecen llamada.</small>
            </article>
            <article>
              <span>Candidatos copa</span>
              <strong>{candidatosCopa}</strong>
              <small>Oportunidades para subir ticket y rotar.</small>
            </article>
          </section>

          <div className="radar-command-bar">
            <Link href="/admin/acciones">Ver pipeline consultor</Link>
            <Link href="/admin/alertas">Ver alertas abiertas</Link>
          </div>

          <div className="radar-filterbar">
            {filtros.map(([id, label]) => (
              <button key={id} className={filtro === id ? 'active' : ''} onClick={() => setFiltro(id)}>{label}</button>
            ))}
          </div>

          <div className="radar-list">
            {informesFiltrados.map(informe => (
              <article key={informe.restaurante.id} className="radar-row">
                <button
                  type="button"
                  className={`radar-favorite ${favoritos.includes(informe.restaurante.id) ? 'is-active' : ''}`}
                  onClick={event => toggleFavorito(event, informe.restaurante.id)}
                  aria-label="Marcar restaurante como favorito"
                >
                  ⭐
                </button>
                <Link href={`/admin/restaurante/${informe.restaurante.id}`} className="radar-card-link">
                <div className={`radar-score radar-score-${informe.prioridad.toLowerCase()}`}>
                  <span>{informe.score}</span>
                  <i style={{ width: `${informe.score}%` }} />
                </div>
                <div className="radar-info">
                  <strong>{informe.restaurante.nombre}</strong>
                  <div className="radar-tags">
                    <span className={`radar-tag radar-tag-${informe.prioridad.toLowerCase()}`}>{informe.prioridad}</span>
                    {informe.propuestasAbiertas.length > 0 && <span className="radar-tag is-warning">Pendiente accion</span>}
                    {oportunidadRadar(informe) > 0 && <span className="radar-tag is-hot">{eur(oportunidadRadar(informe))}</span>}
                    {candidatosCopaRadar(informe) > 0 && <span className="radar-tag is-ok">{candidatosCopaRadar(informe)} copa</span>}
                    {informe.alertas.some(alerta => alerta.titulo.toLowerCase().includes('cliente caliente')) && <span className="radar-tag is-hot">Cliente caliente</span>}
                    {informe.alertas.length === 0 && <span className="radar-tag is-ok">OK</span>}
                  </div>
                  <span>{informe.restaurante.ciudad || '—'} · {informe.metricas.vinos} vinos · {informe.metricas.platos} platos</span>
                  {informe.ejecutivo && (
                    <small className="radar-executive-line">
                      Capital {eur(capitalRadar(informe))} · Alertas criticas {alertasCriticasRadar(informe)} · Carta {informe.ejecutivo.resumen.carta_inflada ? 'inflada' : 'controlada'}
                    </small>
                  )}
                  {!informe.ejecutivo && (
                    <small className="radar-executive-line">
                      Estimacion previa: capital {eur(capitalRadar(informe))} · alertas criticas {alertasCriticasRadar(informe)} · copa {candidatosCopaRadar(informe)}
                    </small>
                  )}
                </div>
                <div className="radar-alerta">
                  {informe.ejecutivo?.resumen?.problema_principal || informe.alertas[0]
                    ? <><strong>{informe.ejecutivo?.resumen?.problema_principal || informe.alertas[0].titulo}</strong><span>{informe.ejecutivo?.alertas?.[0]?.detalle || informe.alertas[0]?.detalle}</span></>
                    : <span>Sin alertas críticas. Mantenimiento fino.</span>
                  }
                </div>
                <div className="radar-next">
                  <span>Siguiente accion</span>
                  <strong>{informe.siguienteMovimiento}</strong>
                  <small>Ultimo contacto: hace {Math.max(1, informe.propuestasAbiertas.length + informe.incidenciasStock.length)} dias</small>
                </div>
                <div className="radar-cta">Ver detalles</div>
                </Link>
              </article>
            ))}
            {informesFiltrados.length === 0 && (
              <div className="ws-empty-block">No hay restaurantes con este filtro.</div>
            )}
          </div>

    </div>
  )
}
