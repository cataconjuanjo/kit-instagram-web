'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { actividadRealDesdeISO, etiquetaActividadReal } from '../../lib/actividadReal'
import { esVentaTPV, priorizarVentas } from '../../lib/salesPriority'
import { esPerfilBodega } from '../../lib/plans'
import { beneficioBruto, costeNetoCompra, copasVendibles, margenBrutoPct, numero, precioNetoVenta, redondear } from '../../lib/wineEconomics'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import styles from '../module.module.css'

function resumenVenta(detalle) {
  try {
    const data = JSON.parse(detalle || '{}')
    const resultado = {
      vendida: 'vendida',
      no_convence: 'no convenció',
      otra: 'pidió otra',
      no_stock: 'no quedaba',
      agotado: 'agotado',
    }[data.resultado] || 'feedback'

    return `${data.vino || 'vino'} · ${resultado}`
  } catch {
    return 'feedback registrado'
  }
}

function leerJSON(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return null }
}

function fechaLocalISO(fecha) {
  if (!fecha) return ''
  const date = new Date(fecha)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}

function servicioDeFecha(fecha) {
  const hora = new Date(fecha).getHours()
  if (hora >= 12 && hora < 17) return 'comida'
  if (hora >= 20 || hora < 2) return 'cena'
  return 'otro'
}

function eur(valor, decimales = 0) {
  return `${(Number(valor) || 0).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} €`
}

function textoAnalitica(valor, fallback = '') {
  return String(valor || '').trim() || fallback
}

function claveAnalitica(valor, fallback = 'sin-dato') {
  const texto = textoAnalitica(valor, fallback)
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function consultaAnalitica(item) {
  return textoAnalitica(item?.plato || item?.consulta, 'Consulta sin plato')
}

function claveNombreVino(nombre) {
  return claveAnalitica(nombre, '')
}

function formatoVenta(item = {}) {
  return item.formato_venta === 'copa' ? 'copa' : 'botella'
}

function precioUnidadEvento(item = {}, vino = null) {
  const cantidad = Math.max(1, numero(item.cantidad) || 1)
  return numero(item.precio_unidad) ||
    numero(item.precio_recomendado) ||
    (numero(item.importe_vino_estimado) ? numero(item.importe_vino_estimado) / cantidad : 0) ||
    (formatoVenta(item) === 'copa' ? numero(vino?.precio_copa) : numero(vino?.precio_botella)) ||
    numero(item.precio) ||
    numero(vino?.precio_botella)
}

function beneficioUnidadEvento(item = {}, vino = null) {
  const precio = precioUnidadEvento(item, vino)
  const coste = numero(vino?.coste_compra)
  if (!precio || !coste) return 0
  if (formatoVenta(item) === 'copa') {
    const costeCopa = costeNetoCompra(coste) / copasVendibles()
    return redondear(precioNetoVenta(precio) - costeCopa, 2)
  }
  return beneficioBruto(precio, coste)
}

function margenUnidadEvento(item = {}, vino = null) {
  const precio = precioUnidadEvento(item, vino)
  const coste = numero(vino?.coste_compra)
  if (!precio || !coste) return 0
  if (formatoVenta(item) === 'copa') {
    const costeCopa = costeNetoCompra(coste) / copasVendibles()
    const precioNeto = precioNetoVenta(precio)
    return precioNeto ? redondear(((precioNeto - costeCopa) / precioNeto) * 100, 1) : 0
  }
  return margenBrutoPct(precio, coste)
}

async function copiarTexto(texto) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = texto
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function lineaTop(lista, vacio, formato = ([nombre, valor]) => `${nombre} (${valor})`) {
  return lista.length ? lista.slice(0, 3).map(item => `- ${formato(item)}`) : [`- ${vacio}`]
}

function porcentajeDato(parte, total) {
  const base = Number(total) || 0
  if (!base) return 0
  return Math.max(0, Math.min(100, Math.round(((Number(parte) || 0) / base) * 100)))
}

function datoNumericoInformado(valor) {
  if (valor === null || valor === undefined) return false
  if (String(valor).trim() === '') return false
  return Number.isFinite(Number(String(valor).replace(',', '.')))
}

function nivelFiabilidad(pct, base = 1) {
  if (!base) {
    return {
      estado: 'Sin base',
      clase: 'trafficNeutral',
      detalle: 'Faltan datos suficientes para medir.',
    }
  }
  if (pct >= 80) {
    return {
      estado: 'Fiable',
      clase: 'trafficGreen',
      detalle: 'Dato consistente para decidir.',
    }
  }
  if (pct >= 55) {
    return {
      estado: 'Parcial',
      clase: 'trafficAmber',
      detalle: 'Se puede decidir con cautela.',
    }
  }
  return {
    estado: 'Debil',
    clase: 'trafficRed',
    detalle: 'Conviene completar datos antes de decidir.',
  }
}

export default function Estadisticas() {
  const [restaurante, setRestaurante] = useState(null)
  const [stats, setStats] = useState([])
  const [vinos, setVinos] = useState([])
  const [loading, setLoading] = useState(true)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [servicio, setServicio] = useState('todos')
  const [mensajeInforme, setMensajeInforme] = useState('')
  const [esAdmin, setEsAdmin] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email, isAdmin } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      setEsAdmin(Boolean(isAdmin))
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const desdeActividad = actividadRealDesdeISO(rest)
        if (!desdeActividad) {
          setStats([])
          setLoading(false)
          return
        }
        let query = supabase
          .from('estadisticas')
          .select('*')
          .eq('restaurante_id', rest.id)
          .order('created_at', { ascending: false })
        if (desdeActividad) query = query.gte('created_at', desdeActividad)
        const [{ data }, { data: vinosData }] = await Promise.all([
          query,
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id),
        ])
        setStats(data || [])
        setVinos(vinosData || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />
  if (!restaurante) return null
  const perfilBodega = esPerfilBodega(restaurante)
  const actividadIniciada = Boolean(actividadRealDesdeISO(restaurante))

  const hoy = fechaLocalISO(new Date())
  const statsFiltradas = stats.filter(s => {
    const fecha = fechaLocalISO(s.created_at)
    if (fechaInicio && fecha < fechaInicio) return false
    if (fechaFin && fecha > fechaFin) return false
    if (servicio !== 'todos' && servicioDeFecha(s.created_at) !== servicio) return false
    return true
  })
  const escaneos = statsFiltradas.filter(s => s.tipo === 'escaneo').length
  const consultas = statsFiltradas.filter(s => s.tipo === 'sommelier').length
  const recomendaciones = statsFiltradas.filter(s => s.tipo === 'recomendacion')
  const feedbacksVenta = statsFiltradas.filter(s => s.tipo === 'venta')
  const escaneosHoy = stats.filter(s => s.tipo === 'escaneo' && fechaLocalISO(s.created_at) === hoy).length
  const consultasHoy = stats.filter(s => s.tipo === 'sommelier' && fechaLocalISO(s.created_at) === hoy).length
  const prioridadVentas = priorizarVentas(feedbacksVenta)
  const ventasMarcadas = prioridadVentas.ventasMarcadasEventos
  const ventasKpi = prioridadVentas.unidadesKpi
  const ventasTPV = prioridadVentas.unidadesTPV
  const ventasSalaKpi = prioridadVentas.unidadesSalaKpi
  const ventasSalaOmitidas = prioridadVentas.unidadesSalaOmitidas

  const feedbackVenta = prioridadVentas.feedbackKpi
  const feedbackSala = feedbackVenta.filter(item => !esVentaTPV(item))
  const recomendacionesVino = recomendaciones.map(s => leerJSON(s.detalle)).filter(Boolean)
  const ventasVendidasDetalle = prioridadVentas.detalleVentasKpi
  const ventasTPVAtribuidas = ventasVendidasDetalle
    .filter(item => esVentaTPV(item) && item.recommendation_id)
    .reduce((sum, item) => sum + (Number(item.cantidad) || 1), 0)
  const ventasTPVNoAtribuidas = Math.max(0, ventasTPV - ventasTPVAtribuidas)
  const importeVinoEstimado = ventasVendidasDetalle.reduce((sum, item) => sum + (Number(item.importe_vino_estimado) || 0), 0)
  const ticketMesaAsociado = ventasVendidasDetalle.reduce((sum, item) => sum + (Number(item.ticket_mesa) || 0), 0)
  const comensalesAsociados = ventasVendidasDetalle.reduce((sum, item) => sum + (Number(item.comensales) || 0), 0)
  const copasVendidas = ventasVendidasDetalle
    .filter(item => item.formato_venta === 'copa')
    .reduce((sum, item) => sum + (Number(item.cantidad) || 1), 0)
  const botellasVendidas = ventasVendidasDetalle
    .filter(item => item.formato_venta === 'botella')
    .reduce((sum, item) => sum + (Number(item.cantidad) || 1), 0)
  const vinoPorComensal = comensalesAsociados ? importeVinoEstimado / comensalesAsociados : 0
  const pesoVinoSobreTicket = ticketMesaAsociado ? Math.round((importeVinoEstimado / ticketMesaAsociado) * 100) : 0
  const feedbackConContextoSala = feedbackSala.filter(item =>
    item.importe_vino_estimado || item.ticket_mesa || item.comensales || item.camarero || item.mesa || item.formato_venta || item.resultado
  )
  const rankingCamareros = Object.values(feedbackConContextoSala.reduce((acc, item) => {
    const nombre = String(item.camarero || '').trim() || 'Sin camarero'
    acc[nombre] = acc[nombre] || {
      nombre,
      eventos: 0,
      ventas: 0,
      ventasEventos: 0,
      importe: 0,
      copas: 0,
      botellas: 0,
      dudas: 0,
      stock: 0,
      comensales: 0,
      ticket: 0,
      pares: {},
    }
    const cantidad = Number(item.cantidad) || 1
    acc[nombre].eventos += 1
    if (item.resultado === 'vendida') {
      acc[nombre].ventas += cantidad
      acc[nombre].ventasEventos += 1
      acc[nombre].importe += Number(item.importe_vino_estimado) || 0
      acc[nombre].comensales += Number(item.comensales) || 0
      acc[nombre].ticket += Number(item.ticket_mesa) || 0
      if (item.formato_venta === 'copa') acc[nombre].copas += cantidad
      else acc[nombre].botellas += cantidad

      const plato = consultaAnalitica(item)
      const vino = item.vino || 'Vino sin nombre'
      const clave = `${claveAnalitica(plato)}|${claveAnalitica(vino)}`
      acc[nombre].pares[clave] = acc[nombre].pares[clave] || { plato, vino, ventas: 0, importe: 0 }
      acc[nombre].pares[clave].ventas += cantidad
      acc[nombre].pares[clave].importe += Number(item.importe_vino_estimado) || 0
    }
    if (['no_convence', 'otra'].includes(item.resultado)) acc[nombre].dudas += 1
    if (['no_stock', 'agotado'].includes(item.resultado)) acc[nombre].stock += 1
    return acc
  }, {}))
    .map(item => {
      const tasaDuda = item.eventos ? Math.round((item.dudas / item.eventos) * 100) : 0
      const tasaVenta = item.eventos ? Math.round((item.ventasEventos / item.eventos) * 100) : 0
      const vinoComensal = item.comensales ? item.importe / item.comensales : 0
      const pesoVinoTicket = item.ticket ? Math.round((item.importe / item.ticket) * 100) : 0
      const mejorPareja = Object.values(item.pares)
        .sort((a, b) => b.ventas - a.ventas || b.importe - a.importe)[0] || null
      const mezcla = item.copas + item.botellas
      const copasPct = mezcla ? Math.round((item.copas / mezcla) * 100) : 0
      let accion = 'Seguir registrando ventas y dudas para afinar la lectura de sala.'
      if (item.nombre === 'Sin camarero') {
        accion = 'Pedir que sala rellene el nombre para medir formacion sin perder contexto.'
      } else if (item.stock > 0) {
        accion = 'Trabajar sustitutos y confirmacion de stock antes de ofrecer.'
      } else if (item.eventos >= 2 && tasaDuda >= 35) {
        accion = 'Practicar argumento de venta y alternativa rapida para reducir dudas.'
      } else if (item.ventas >= 2 && vinoComensal > 0 && vinoPorComensal > 0 && vinoComensal < vinoPorComensal * 0.8) {
        accion = 'Entrenar upsell suave: mismo encaje gastronomico, botella de mas valor.'
      } else if (item.copas >= 2 && copasPct >= 60) {
        accion = 'Buen perfil para empujar servicio por copas y primeras recomendaciones.'
      } else if (item.ventas >= 2 && tasaDuda <= 20) {
        accion = 'Usar sus argumentos como ejemplo en briefing de sala.'
      }

      return {
        ...item,
        tasaDuda,
        tasaVenta,
        vinoComensal,
        pesoVinoTicket,
        mejorPareja,
        copasPct,
        accion,
      }
    })
    .sort((a, b) => b.importe - a.importe || b.ventas - a.ventas || a.tasaDuda - b.tasaDuda)
    .slice(0, 5)
  const camarerosConDatos = rankingCamareros.filter(item => item.nombre !== 'Sin camarero').length
  const focoFormacionSala = rankingCamareros.find(item =>
    item.nombre !== 'Sin camarero' && (item.stock > 0 || item.tasaDuda >= 35 || item.accion.includes('upsell'))
  ) || rankingCamareros.find(item => item.nombre !== 'Sin camarero')
  const recomendacionesTrazadasIds = new Set(recomendacionesVino.map(item => item.recommendation_id).filter(Boolean))
  const feedbackTrazado = feedbackVenta.filter(item => item.recommendation_id)
  const ventasAtribuidasEventos = feedbackTrazado.filter(item => item.resultado === 'vendida')
  const ventasAtribuidasIds = new Set(ventasAtribuidasEventos.map(item => item.recommendation_id).filter(Boolean))
  const unidadesAtribuidas = ventasAtribuidasEventos.reduce((sum, item) => sum + (Number(item.cantidad) || 1), 0)
  const conversionRecomendacion = recomendacionesTrazadasIds.size
    ? Math.round((ventasAtribuidasIds.size / recomendacionesTrazadasIds.size) * 100)
    : 0
  const coberturaFeedback = feedbackVenta.length
    ? Math.round((feedbackTrazado.length / feedbackVenta.length) * 100)
    : 0
  const incidenciasStock = feedbackVenta.filter(item => ['no_stock', 'agotado'].includes(item.resultado)).length
  const dudasSala = feedbackVenta.filter(item => ['no_convence', 'otra'].includes(item.resultado)).length

  const embudoPorVino = recomendacionesVino.reduce((acc, item) => {
    const clave = item.vino_id || item.vino || 'vino'
    acc[clave] = acc[clave] || {
      vino: item.vino || 'Vino sin nombre',
      recomendaciones: 0,
      ventas: 0,
      dudas: 0,
      incidencias: 0,
    }
    acc[clave].recomendaciones += 1
    return acc
  }, {})

  feedbackTrazado.forEach(item => {
    const clave = item.vino_id || item.vino || 'vino'
    embudoPorVino[clave] = embudoPorVino[clave] || {
      vino: item.vino || 'Vino sin nombre',
      recomendaciones: 0,
      ventas: 0,
      dudas: 0,
      incidencias: 0,
    }
    if (item.resultado === 'vendida') embudoPorVino[clave].ventas += Number(item.cantidad) || 1
    if (['no_convence', 'otra'].includes(item.resultado)) embudoPorVino[clave].dudas += 1
    if (['no_stock', 'agotado'].includes(item.resultado)) embudoPorVino[clave].incidencias += 1
  })

  const rankingEmbudo = Object.values(embudoPorVino)
    .filter(item => item.recomendaciones > 0 || item.ventas > 0)
    .map(item => ({
      ...item,
      conversion: item.recomendaciones ? Math.min(100, Math.round((item.ventas / item.recomendaciones) * 100)) : 0,
    }))
    .sort((a, b) => b.ventas - a.ventas || b.conversion - a.conversion || b.recomendaciones - a.recomendaciones)
    .slice(0, 5)

  const recomendacionesPorId = new Map(recomendacionesVino
    .filter(item => item.recommendation_id)
    .map(item => [item.recommendation_id, item])
  )
  const vinosPorId = new Map(vinos.map(vino => [String(vino.id), vino]))
  const vinosPorNombre = new Map(vinos.map(vino => [claveNombreVino(vino.nombre), vino]))
  const feedbackPorRecomendacion = new Set(feedbackVenta.map(item => item.recommendation_id).filter(Boolean))

  function vinoParaAnalitica(item = {}, recomendacion = null) {
    const id = item.vino_id || recomendacion?.vino_id
    const nombre = item.vino || recomendacion?.vino
    return (id ? vinosPorId.get(String(id)) : null) || vinosPorNombre.get(claveNombreVino(nombre)) || null
  }

  function ventaEconomica(item = {}, recomendacion = null) {
    const vino = vinoParaAnalitica(item, recomendacion)
    const cantidad = Math.max(1, numero(item.cantidad) || 1)
    const precioUnitario = precioUnidadEvento(item, vino)
    const ingreso = numero(item.importe_vino_estimado) || redondear(precioUnitario * cantidad, 2)
    const ingresoNeto = redondear(precioNetoVenta(precioUnitario) * cantidad, 2)
    const beneficioUnitario = beneficioUnidadEvento(item, vino)
    const beneficio = redondear(beneficioUnitario * cantidad, 2)
    const margenPct = margenUnidadEvento(item, vino)
    const tieneCoste = numero(vino?.coste_compra) > 0 && precioUnitario > 0
    return {
      item,
      vino,
      nombre: textoAnalitica(item.vino || recomendacion?.vino || vino?.nombre, 'Vino sin nombre'),
      clave: String(vino?.id || item.vino_id || recomendacion?.vino_id || claveNombreVino(item.vino || recomendacion?.vino || vino?.nombre)),
      cantidad,
      precioUnitario,
      ingreso,
      ingresoNeto,
      beneficio,
      margenPct,
      tieneCoste,
    }
  }

  const ventasEconomicas = ventasVendidasDetalle
    .map(item => ventaEconomica(item, item.recommendation_id ? recomendacionesPorId.get(item.recommendation_id) : null))
    .filter(item => item.precioUnitario > 0 || item.ingreso > 0)
  const ventasEconomicasConCoste = ventasEconomicas.filter(item => item.tieneCoste)
  const beneficioBrutoAtribuido = redondear(ventasEconomicasConCoste.reduce((sum, item) => sum + item.beneficio, 0), 2)
  const ingresoNetoConCoste = ventasEconomicasConCoste.reduce((sum, item) => sum + item.ingresoNeto, 0)
  const margenBrutoAtribuidoPct = ingresoNetoConCoste ? Math.round((beneficioBrutoAtribuido / ingresoNetoConCoste) * 100) : 0
  const ventasSinCoste = ventasEconomicas.filter(item => !item.tieneCoste).length
  const ventasAtribuidasEconomicas = ventasEconomicas.filter(item => item.item?.recommendation_id)
  const ventasAtribuidasConCoste = ventasAtribuidasEconomicas.filter(item => item.tieneCoste)
  const unidadesEconomicasAtribuidas = ventasAtribuidasEconomicas.reduce((sum, item) => sum + item.cantidad, 0)
  const importeAtribuidoRecomendacion = redondear(ventasAtribuidasEconomicas.reduce((sum, item) => sum + item.ingreso, 0), 2)
  const beneficioAtribuidoRecomendacion = redondear(ventasAtribuidasConCoste.reduce((sum, item) => sum + item.beneficio, 0), 2)
  const ventasTpvAtribuidasEconomicas = ventasAtribuidasEconomicas.filter(item => esVentaTPV(item.item))
  const ventasTpvAtribuidasConCoste = ventasTpvAtribuidasEconomicas.filter(item => item.tieneCoste)
  const unidadesTpvAtribuidasEconomicas = ventasTpvAtribuidasEconomicas.reduce((sum, item) => sum + item.cantidad, 0)
  const importeTpvAtribuido = redondear(ventasTpvAtribuidasEconomicas.reduce((sum, item) => sum + item.ingreso, 0), 2)
  const beneficioTpvAtribuido = redondear(ventasTpvAtribuidasConCoste.reduce((sum, item) => sum + item.beneficio, 0), 2)

  const noConvertidasEconomicas = feedbackVenta
    .filter(item => item.resultado && item.resultado !== 'vendida')
    .map(item => ventaEconomica(item, item.recommendation_id ? recomendacionesPorId.get(item.recommendation_id) : null))
    .filter(item => item.precioUnitario > 0)
  const beneficioNoConvertido = redondear(noConvertidasEconomicas
    .filter(item => item.tieneCoste)
    .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0), 2)
  const importeNoConvertido = redondear(noConvertidasEconomicas.reduce((sum, item) => sum + item.ingreso, 0), 2)
  const beneficioPerdidoStock = redondear(noConvertidasEconomicas
    .filter(item => ['no_stock', 'agotado'].includes(item.item.resultado) && item.tieneCoste)
    .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0), 2)
  const recomendacionesSinResultadoEconomico = recomendacionesVino
    .filter(item => item.recommendation_id && !feedbackPorRecomendacion.has(item.recommendation_id))
    .map(item => ventaEconomica(item, item))
    .filter(item => item.precioUnitario > 0)
  const beneficioPendienteRecomendacion = redondear(recomendacionesSinResultadoEconomico
    .filter(item => item.tieneCoste)
    .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0), 2)
  const importePendienteRecomendacion = redondear(recomendacionesSinResultadoEconomico.reduce((sum, item) => sum + item.ingreso, 0), 2)
  const ventasTpvNoAtribuidasEconomicas = ventasVendidasDetalle
    .filter(item => esVentaTPV(item) && !item.recommendation_id)
    .map(item => ventaEconomica(item, null))
    .filter(item => item.precioUnitario > 0 || item.ingreso > 0)
  const importeTpvNoAtribuido = redondear(ventasTpvNoAtribuidasEconomicas.reduce((sum, item) => sum + item.ingreso, 0), 2)
  const beneficioTpvNoAtribuido = redondear(ventasTpvNoAtribuidasEconomicas
    .filter(item => item.tieneCoste)
    .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0), 2)
  const ventasBajoMargen = ventasEconomicasConCoste.filter(item => item.margenPct > 0 && item.margenPct < 50)
  const mejoraPotencialMargenBajo = redondear(ventasBajoMargen.reduce((sum, item) => {
    const beneficioObjetivo = item.ingresoNeto * 0.55
    return sum + Math.max(0, beneficioObjetivo - item.beneficio)
  }, 0), 2)
  const valorRecuperablePendiente = redondear(
    beneficioPerdidoStock + beneficioNoConvertido + beneficioPendienteRecomendacion + mejoraPotencialMargenBajo,
    2
  )

  const rentabilidadPorVino = {}
  function asegurarRentabilidad(fila) {
    rentabilidadPorVino[fila.clave] = rentabilidadPorVino[fila.clave] || {
      clave: fila.clave,
      vino: fila.nombre,
      bodega: fila.vino?.bodega || '',
      stock: numero(fila.vino?.stock),
      stockMinimo: numero(fila.vino?.stock_minimo),
      margenPct: margenUnidadEvento({ formato_venta: 'botella' }, fila.vino),
      beneficioBotella: fila.vino ? beneficioBruto(fila.vino.precio_botella, fila.vino.coste_compra) : 0,
      recomendaciones: 0,
      pendientes: 0,
      ventas: 0,
      ventasEventos: 0,
      ingresos: 0,
      beneficio: 0,
      noConvertidas: 0,
      perdida: 0,
      stockFallos: 0,
    }
    return rentabilidadPorVino[fila.clave]
  }

  recomendacionesVino.forEach(item => {
    const filaEconomica = ventaEconomica(item, item)
    const fila = asegurarRentabilidad(filaEconomica)
    fila.recomendaciones += 1
    if (item.recommendation_id && !feedbackPorRecomendacion.has(item.recommendation_id)) fila.pendientes += 1
  })

  ventasEconomicas.forEach(item => {
    const fila = asegurarRentabilidad(item)
    fila.ventas += item.cantidad
    fila.ventasEventos += 1
    fila.ingresos += item.ingreso
    if (item.tieneCoste) fila.beneficio += item.beneficio
  })

  noConvertidasEconomicas.forEach(item => {
    const fila = asegurarRentabilidad(item)
    fila.noConvertidas += 1
    if (item.tieneCoste) fila.perdida += Math.max(0, item.beneficio)
    if (['no_stock', 'agotado'].includes(item.item.resultado)) fila.stockFallos += 1
  })

  const rankingRentabilidadCarta = Object.values(rentabilidadPorVino)
    .map(item => ({
      ...item,
      conversion: item.recomendaciones ? Math.min(100, Math.round((item.ventasEventos / item.recomendaciones) * 100)) : 0,
      beneficio: redondear(item.beneficio, 2),
      ingresos: redondear(item.ingresos, 2),
      perdida: redondear(item.perdida, 2),
    }))
    .sort((a, b) => b.beneficio - a.beneficio || b.ventas - a.ventas || b.margenPct - a.margenPct)
    .slice(0, 5)

  const oportunidadesRentables = Object.values(rentabilidadPorVino)
    .map(item => {
      const margenAlto = item.margenPct >= 60 || item.beneficioBotella >= 10
      const stockDisponible = item.stock > Math.max(1, item.stockMinimo)
      let accion = 'Seguir midiendo antes de cambiar la carta.'
      let prioridad = item.recomendaciones + item.noConvertidas + item.pendientes

      if (item.stockFallos > 0) {
        accion = 'Reponer o preparar sustituto: ya se perdio venta por stock.'
        prioridad += 12 + item.stockFallos * 4
      } else if (margenAlto && stockDisponible && item.recomendaciones > item.ventasEventos) {
        accion = 'Empujar en sala cuando el maridaje encaje: margen sano y demanda sin cerrar.'
        prioridad += 10 + item.recomendaciones + item.beneficioBotella
      } else if (item.ventasEventos >= 2 && item.margenPct > 0 && item.margenPct < 50) {
        accion = 'Se vende, pero deja poco: revisar PVP, coste o sustituto equivalente.'
        prioridad += 8 + item.ventasEventos
      } else if (item.pendientes >= 2) {
        accion = 'Validar en cierre: hay recomendaciones sin resultado economico.'
        prioridad += 5 + item.pendientes
      }

      return {
        ...item,
        margenAlto,
        stockDisponible,
        accion,
        prioridad,
        perdida: redondear(item.perdida, 2),
      }
    })
    .filter(item => item.prioridad > 0 && (item.stockFallos > 0 || item.margenAlto || item.pendientes >= 2 || item.ventasEventos >= 2))
    .sort((a, b) => b.prioridad - a.prioridad || b.perdida - a.perdida || b.beneficioBotella - a.beneficioBotella)
    .slice(0, 5)

  const aprendizajePorVino = {}
  function asegurarAprendizaje(item = {}, recomendacion = null) {
    const vino = vinoParaAnalitica(item, recomendacion)
    const nombre = textoAnalitica(item.vino || recomendacion?.vino || vino?.nombre, 'Vino sin nombre')
    const clave = String(vino?.id || item.vino_id || recomendacion?.vino_id || claveNombreVino(nombre))
    aprendizajePorVino[clave] = aprendizajePorVino[clave] || {
      clave,
      vino: nombre,
      bodega: vino?.bodega || '',
      margenPct: margenUnidadEvento({ formato_venta: 'botella' }, vino),
      recomendaciones: 0,
      ventasKpi: 0,
      ventasTpv: 0,
      ventasTpvAtribuidas: 0,
      ventasTpvNoAtribuidas: 0,
      ventasSala: 0,
      importeTpvNoAtribuido: 0,
      beneficioTpvNoAtribuido: 0,
    }
    return aprendizajePorVino[clave]
  }

  recomendacionesVino.forEach(item => {
    const fila = asegurarAprendizaje(item, item)
    fila.recomendaciones += 1
  })

  ventasVendidasDetalle.forEach(item => {
    const recomendacion = item.recommendation_id ? recomendacionesPorId.get(item.recommendation_id) : null
    const fila = asegurarAprendizaje(item, recomendacion)
    const cantidad = Number(item.cantidad) || 1
    fila.ventasKpi += cantidad
    if (esVentaTPV(item)) {
      fila.ventasTpv += cantidad
      if (item.recommendation_id) {
        fila.ventasTpvAtribuidas += cantidad
      } else {
        const venta = ventaEconomica(item, recomendacion)
        fila.ventasTpvNoAtribuidas += cantidad
        fila.importeTpvNoAtribuido += venta.ingreso
        if (venta.tieneCoste) fila.beneficioTpvNoAtribuido += venta.beneficio
      }
    } else {
      fila.ventasSala += cantidad
    }
  })

  const aprendizajeComercial = Object.values(aprendizajePorVino)
    .map(item => {
      const conversionAtribuida = item.recomendaciones
        ? Math.min(100, Math.round((item.ventasTpvAtribuidas / item.recomendaciones) * 100))
        : 0
      let tipo = ''
      let accion = ''
      let prioridad = 0

      if (item.ventasTpvNoAtribuidas >= 2 && item.recomendaciones === 0) {
        tipo = 'Se vende sin ayuda'
        accion = item.margenPct > 0 && item.margenPct < 50
          ? 'No gastar esfuerzo de sala: revisar coste o PVP porque ya rota sin empuje.'
          : 'Mantener disponible y usarlo solo cuando el maridaje encaje de forma natural.'
        prioridad = 18 + item.ventasTpvNoAtribuidas
      } else if (item.ventasTpvNoAtribuidas >= 2 && item.recomendaciones > 0 && item.ventasTpvAtribuidas === 0) {
        tipo = 'Demanda no conectada'
        accion = 'Sale por TPV, pero no queda atribuida: revisar alias, exposiciones y briefing de sala para platos donde encaje.'
        prioridad = 16 + item.ventasTpvNoAtribuidas + item.recomendaciones
      } else if (item.recomendaciones >= 2 && item.ventasKpi === 0) {
        tipo = 'Recomendado sin venta'
        accion = 'Revisar argumento, precio o alternativa; no empujar si el encaje gastronomico es debil.'
        prioridad = 14 + item.recomendaciones
      } else if (item.ventasTpvAtribuidas >= 2) {
        tipo = 'Recomendacion que convierte'
        accion = 'Convertir el argumento en guion de sala y proteger stock antes del servicio.'
        prioridad = 12 + item.ventasTpvAtribuidas + conversionAtribuida / 10
      } else if (item.ventasKpi >= 2 && item.margenPct > 0 && item.margenPct < 50) {
        tipo = 'Volumen con margen bajo'
        accion = 'Se mueve, pero deja poco: renegociar coste o buscar sustituto equivalente sin romper maridaje.'
        prioridad = 10 + item.ventasKpi
      }

      return {
        ...item,
        tipo,
        accion,
        prioridad,
        conversionAtribuida,
        importeTpvNoAtribuido: redondear(item.importeTpvNoAtribuido, 2),
        beneficioTpvNoAtribuido: redondear(item.beneficioTpvNoAtribuido, 2),
      }
    })
    .filter(item => item.prioridad > 0)
    .sort((a, b) => b.prioridad - a.prioridad || b.ventasTpvNoAtribuidas - a.ventasTpvNoAtribuidas || b.ventasKpi - a.ventasKpi)
    .slice(0, 6)

  const perdidoPendiente = [
    (beneficioPerdidoStock > 0 || incidenciasStock > 0) && {
      tipo: 'Perdido',
      titulo: 'Stock frena venta',
      valor: beneficioPerdidoStock ? eur(beneficioPerdidoStock) : `${incidenciasStock} incidencias`,
      detalle: beneficioPerdidoStock
        ? 'Beneficio bruto potencial perdido por falta de stock o agotado.'
        : 'Hay incidencias de stock sin beneficio calculable porque faltan datos economicos.',
      accion: 'Reponer o preparar sustituto equivalente antes del proximo servicio.',
      href: '/dashboard/bodega',
      prioridad: 110,
    },
    (beneficioNoConvertido > 0 || importeNoConvertido > 0) && {
      tipo: 'No convertido',
      titulo: 'Venta estimada no cerrada',
      valor: beneficioNoConvertido ? eur(beneficioNoConvertido) : eur(importeNoConvertido),
      detalle: beneficioNoConvertido
        ? 'Beneficio bruto potencial asociado a dudas, cambios o rechazos.'
        : 'Importe estimado de oportunidades no cerradas.',
      accion: 'Revisar argumento, precio de entrada o alternativa gastronomica.',
      href: '/dashboard/cierre#dudas',
      prioridad: 96,
    },
    recomendacionesSinResultadoEconomico.length > 0 && {
      tipo: 'Pendiente',
      titulo: 'Recomendaciones sin resultado',
      valor: beneficioPendienteRecomendacion ? eur(beneficioPendienteRecomendacion) : `${recomendacionesSinResultadoEconomico.length} rec.`,
      detalle: `${recomendacionesSinResultadoEconomico.length} recomendaciones tienen valor economico sin confirmar.`,
      accion: 'Validar en cierre si salieron, se rechazaron o quedaron sin resolver.',
      href: '/dashboard/cierre',
      prioridad: 88,
    },
    ventasTPVNoAtribuidas > 0 && {
      tipo: 'Sin atribuir',
      titulo: 'TPV no conectado a recomendacion',
      valor: importeTpvNoAtribuido ? eur(importeTpvNoAtribuido) : `${ventasTPVNoAtribuidas} ventas`,
      detalle: `${ventasTPVNoAtribuidas} ventas reales no explican que recomendacion o exposicion las origino.`,
      accion: 'Revisar alias, exposiciones y uso de modo sala para capturar influencia comercial.',
      href: '/dashboard/tpv',
      prioridad: 82,
    },
    ventasSinCoste > 0 && {
      tipo: 'Dato pendiente',
      titulo: 'Ventas sin coste de compra',
      valor: `${ventasSinCoste} ventas`,
      detalle: 'No se puede defender margen bruto ni coste bebida de esas ventas.',
      accion: 'Completar coste de compra en vinos vendidos y referencias recomendadas.',
      href: '/dashboard/vinos',
      prioridad: 76,
    },
    mejoraPotencialMargenBajo > 0 && {
      tipo: 'Margen bajo',
      titulo: 'Volumen que deja poco',
      valor: eur(mejoraPotencialMargenBajo),
      detalle: `${ventasBajoMargen.length} ventas quedan por debajo de un margen bruto objetivo del 55%.`,
      accion: 'Renegociar coste, revisar PVP o buscar sustituto equivalente sin romper maridaje.',
      href: '/dashboard/menu-engineering',
      prioridad: 70,
    },
  ].filter(Boolean).sort((a, b) => b.prioridad - a.prioridad)

  const oportunidadesPorClave = {}

  function asegurarOportunidad({ plato, vino, vinoId }) {
    const nombrePlato = textoAnalitica(plato, 'Consulta sin plato')
    const nombreVino = textoAnalitica(vino, 'Vino sin nombre')
    const clave = `${claveAnalitica(nombrePlato)}|${vinoId || claveAnalitica(nombreVino)}`
    oportunidadesPorClave[clave] = oportunidadesPorClave[clave] || {
      clave,
      plato: nombrePlato,
      vino: nombreVino,
      vinoId: vinoId || nombreVino,
      recomendaciones: 0,
      recomendacionesSala: 0,
      ventas: 0,
      ventasEventos: 0,
      dudas: 0,
      incidencias: 0,
      feedback: 0,
      importe: 0,
      precioTotal: 0,
      precioMuestras: 0,
      etiquetas: new Set(),
      objetivos: new Set(),
      camareros: new Set(),
    }
    return oportunidadesPorClave[clave]
  }

  recomendacionesVino.forEach(item => {
    const fila = asegurarOportunidad({
      plato: consultaAnalitica(item),
      vino: item.vino,
      vinoId: item.vino_id,
    })
    fila.recomendaciones += 1
    if (item.origen === 'camarero') fila.recomendacionesSala += 1
    if (item.etiqueta) fila.etiquetas.add(item.etiqueta)
    if (item.objetivo) fila.objetivos.add(item.objetivo)
    const precio = Number(item.precio) || 0
    if (precio > 0) {
      fila.precioTotal += precio
      fila.precioMuestras += 1
    }
  })

  feedbackVenta.forEach(item => {
    const recomendacion = item.recommendation_id ? recomendacionesPorId.get(item.recommendation_id) : null
    const fila = asegurarOportunidad({
      plato: item.plato || item.consulta ? consultaAnalitica(item) : consultaAnalitica(recomendacion),
      vino: item.vino || recomendacion?.vino,
      vinoId: item.vino_id || recomendacion?.vino_id,
    })
    const cantidad = Number(item.cantidad) || 1
    fila.feedback += 1
    if (item.camarero) fila.camareros.add(item.camarero)
    if (item.objetivo || recomendacion?.objetivo) fila.objetivos.add(item.objetivo || recomendacion?.objetivo)
    if (item.posicion || item.recommendation_label || recomendacion?.etiqueta) {
      fila.etiquetas.add(item.recommendation_label || item.posicion || recomendacion?.etiqueta)
    }
    const precio = Number(item.precio_unidad || item.precio_recomendado || recomendacion?.precio) || 0
    if (precio > 0) {
      fila.precioTotal += precio
      fila.precioMuestras += 1
    }
    if (item.resultado === 'vendida') {
      fila.ventas += cantidad
      fila.ventasEventos += 1
      fila.importe += Number(item.importe_vino_estimado) || (precio * cantidad)
    }
    if (['no_convence', 'otra'].includes(item.resultado)) fila.dudas += 1
    if (['no_stock', 'agotado'].includes(item.resultado)) fila.incidencias += 1
  })

  const paresOportunidad = Object.values(oportunidadesPorClave)
    .filter(item => item.recomendaciones > 0 || item.feedback > 0)
    .map(item => {
      const conversionPar = item.recomendaciones
        ? Math.min(100, Math.round((item.ventasEventos / item.recomendaciones) * 100))
        : 0
      const precioMedio = item.precioMuestras ? item.precioTotal / item.precioMuestras : 0
      const valorMedio = item.ventas ? item.importe / item.ventas : 0
      let tipo = 'Medir'
      let accion = 'Seguir registrando resultados para tener una muestra mas fiable.'
      let prioridad = item.recomendaciones + item.feedback

      if (item.incidencias > 0) {
        tipo = 'Stock'
        accion = 'Revisar stock antes del servicio o preparar sustituto para sala.'
        prioridad += 8 + item.incidencias * 3
      } else if (item.recomendaciones >= 2 && item.ventasEventos === 0) {
        tipo = 'No convierte'
        accion = 'Cambiar argumento, precio de entrada o alternativa recomendada para este plato.'
        prioridad += 7 + item.recomendaciones
      } else if (item.dudas > 0 && item.dudas >= item.ventasEventos) {
        tipo = 'Dudas'
        accion = 'Entrenar relato de sala y revisar si el estilo o precio genera friccion.'
        prioridad += 5 + item.dudas * 2
      } else if (item.ventasEventos > 0 && conversionPar >= 50) {
        tipo = 'Funciona'
        accion = 'Convertir en recomendacion preferente para este plato o mesa.'
        prioridad += 6 + item.ventasEventos * 2
      } else if (item.ventasEventos > 0 && (valorMedio >= 35 || precioMedio >= 35)) {
        tipo = 'Subir ticket'
        accion = 'Usarlo como opcion de upsell cuando el cliente acepte una botella mas especial.'
        prioridad += 4
      }

      return {
        ...item,
        conversion: conversionPar,
        conversionLabel: item.recomendaciones ? `${conversionPar}%` : 'venta directa',
        precioMedio,
        valorMedio,
        etiquetas: Array.from(item.etiquetas).slice(0, 2),
        objetivos: Array.from(item.objetivos).slice(0, 2),
        camareros: Array.from(item.camareros).slice(0, 2),
        tipo,
        accion,
        prioridad,
      }
    })

  const mejoresPlatoVino = paresOportunidad
    .sort((a, b) => b.ventasEventos - a.ventasEventos || b.conversion - a.conversion || b.importe - a.importe || b.recomendaciones - a.recomendaciones)
    .slice(0, 6)

  const alertasOportunidad = paresOportunidad
    .filter(item =>
      item.tipo !== 'Funciona' &&
      (
        item.incidencias > 0 ||
        item.dudas > 0 ||
        (item.recomendaciones >= 2 && item.ventasEventos === 0) ||
        (item.recomendaciones >= 3 && item.conversion < 34)
      )
    )
    .sort((a, b) => b.prioridad - a.prioridad || b.recomendaciones - a.recomendaciones || b.feedback - a.feedback)
    .slice(0, 5)

  const platosConSenal = new Set(paresOportunidad.map(item => claveAnalitica(item.plato))).size
  const parejasQueFuncionan = paresOportunidad.filter(item => item.tipo === 'Funciona').length

  const rendimientoVinos = Object.entries(feedbackSala.reduce((acc, item) => {
    const vino = item.vino || 'Vino sin nombre'
    acc[vino] = acc[vino] || { vendida: 0, no_convence: 0, otra: 0, total: 0 }
    acc[vino][item.resultado] = (acc[vino][item.resultado] || 0) + (item.cantidad || 1)
    acc[vino].total += (item.cantidad || 1)
    return acc
  }, {}))
    .sort((a, b) => (b[1].vendida - b[1].no_convence) - (a[1].vendida - a[1].no_convence))
    .slice(0, 6)

  const topVinosVendidos = Object.entries(ventasVendidasDetalle.reduce((acc, item) => {
    const vino = item.vino || 'Vino sin nombre'
    acc[vino] = (acc[vino] || 0) + (item.cantidad || 1)
    return acc
  }, {}))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const maxVentas = topVinosVendidos[0]?.[1] || 1

  const ganadoEsteMes = [
    beneficioBrutoAtribuido > 0 && {
      tipo: 'Beneficio capturado',
      titulo: 'Vino vendido con margen medido',
      valor: eur(beneficioBrutoAtribuido),
      detalle: `${ventasEconomicasConCoste.length} ventas KPI tienen coste informado y margen bruto defendible.`,
      accion: 'Mantener coste, PVP y formato completos para sostener esta lectura economica.',
      href: '/dashboard/menu-engineering',
      prioridad: 120,
    },
    ventasKpi > 0 && {
      tipo: 'Venta registrada',
      titulo: 'KPI economico consolidado',
      valor: `${ventasKpi} ventas`,
      detalle: `${ventasTPV} vienen de TPV y ${ventasSalaKpi} de sala no duplicada.`,
      accion: 'Usar estas ventas como base de rentabilidad de carta, sala y compras.',
      href: '/dashboard/tpv',
      prioridad: 112,
    },
    beneficioAtribuidoRecomendacion > 0 && {
      tipo: 'Recomendacion que vende',
      titulo: 'Beneficio ligado a recomendacion',
      valor: eur(beneficioAtribuidoRecomendacion),
      detalle: importeAtribuidoRecomendacion
        ? `${unidadesEconomicasAtribuidas} uds. conectadas a recomendacion suman ${eur(importeAtribuidoRecomendacion)} de venta.`
        : `${unidadesEconomicasAtribuidas} uds. quedan conectadas a una recomendacion.`,
      accion: 'Convertir los argumentos que cerraron venta en guion de sala.',
      href: '/dashboard/sala',
      prioridad: 108,
    },
    ventasTPVAtribuidas > 0 && {
      tipo: 'TPV confirmado',
      titulo: 'Influencia validada por venta real',
      valor: beneficioTpvAtribuido ? eur(beneficioTpvAtribuido) : `${ventasTPVAtribuidas} ventas`,
      detalle: importeTpvAtribuido
        ? `${unidadesTpvAtribuidasEconomicas} uds. TPV atribuidas suman ${eur(importeTpvAtribuido)} de venta.`
        : `${ventasTPVAtribuidas} ventas TPV quedan atribuidas a recomendacion.`,
      accion: 'Repetir el patron de sala donde el maridaje encaja y el TPV confirma salida.',
      href: '/dashboard/tpv',
      prioridad: 104,
    },
    parejasQueFuncionan > 0 && mejoresPlatoVino[0] && {
      tipo: 'Plato-vino ganador',
      titulo: `${mejoresPlatoVino[0].vino} + ${mejoresPlatoVino[0].plato}`,
      valor: `${mejoresPlatoVino[0].ventas} uds.`,
      detalle: `${mejoresPlatoVino[0].conversionLabel} de conversion en el periodo seleccionado.`,
      accion: 'Convertirlo en recomendacion preferente sin moverlo si el encaje gastronomico no aplica.',
      href: '/dashboard/sala',
      prioridad: 96,
    },
    rankingRentabilidadCarta[0]?.beneficio > 0 && {
      tipo: 'Vino rentable lider',
      titulo: rankingRentabilidadCarta[0].vino,
      valor: eur(rankingRentabilidadCarta[0].beneficio),
      detalle: `${rankingRentabilidadCarta[0].ventas} uds. vendidas con ${rankingRentabilidadCarta[0].margenPct || '-'}% de margen estimado.`,
      accion: 'Proteger stock y visibilidad cuando el maridaje lo justifique.',
      href: '/dashboard/bodega',
      prioridad: 92,
    },
    ventasSalaOmitidas > 0 && {
      tipo: 'Dato protegido',
      titulo: 'Doble conteo evitado',
      valor: `${ventasSalaOmitidas} ventas`,
      detalle: 'El TPV ya confirmaba esas ventas, asi que sala no infla los KPI economicos.',
      accion: 'Mantener TPV como fuente prioritaria y sala como contexto comercial.',
      href: '/dashboard/tpv',
      prioridad: 84,
    },
  ].filter(Boolean).sort((a, b) => b.prioridad - a.prioridad).slice(0, 6)

  const totalVinosCarta = vinos.length
  const vinosConCoste = vinos.filter(vino => numero(vino.coste_compra) > 0).length
  const vinosConPvpYCoste = vinos.filter(vino =>
    numero(vino.coste_compra) > 0 && (numero(vino.precio_botella) > 0 || numero(vino.precio_copa) > 0)
  ).length
  const vinosConStockMinimo = vinos.filter(vino => datoNumericoInformado(vino.stock_minimo) && numero(vino.stock_minimo) > 0).length
  const recomendacionesCerradas = recomendacionesTrazadasIds.size
    ? Array.from(feedbackPorRecomendacion).filter(id => recomendacionesTrazadasIds.has(id)).length
    : 0
  const fiabilidadIndicadoresBase = [
    {
      id: 'costes',
      label: 'Costes completos',
      pct: porcentajeDato(vinosConCoste, totalVinosCarta),
      base: totalVinosCarta,
      valor: totalVinosCarta ? `${vinosConCoste}/${totalVinosCarta}` : 'sin base',
      detalle: 'Vinos con coste de compra informado.',
      accion: 'Completar coste de compra para defender margen bruto y coste bebida.',
      href: '/dashboard/vinos',
    },
    {
      id: 'pvpCoste',
      label: 'PVP + coste',
      pct: porcentajeDato(vinosConPvpYCoste, totalVinosCarta),
      base: totalVinosCarta,
      valor: totalVinosCarta ? `${vinosConPvpYCoste}/${totalVinosCarta}` : 'sin base',
      detalle: 'Vinos con PVP de venta y coste para calcular rentabilidad.',
      accion: 'Completar PVP botella/copa y coste antes de tocar precios.',
      href: '/dashboard/precios',
    },
    {
      id: 'ventasCoste',
      label: 'Ventas con coste',
      pct: porcentajeDato(ventasEconomicasConCoste.length, ventasEconomicas.length),
      base: ventasEconomicas.length,
      valor: ventasEconomicas.length ? `${ventasEconomicasConCoste.length}/${ventasEconomicas.length}` : 'sin base',
      detalle: 'Ventas KPI que permiten calcular beneficio bruto.',
      accion: 'Completar coste en los vinos vendidos para no perder lectura de margen.',
      href: '/dashboard/vinos',
    },
    {
      id: 'fuenteTpv',
      label: 'Fuente TPV',
      pct: porcentajeDato(ventasTPV, ventasKpi),
      base: ventasKpi,
      valor: ventasKpi ? `${ventasTPV}/${ventasKpi}` : 'sin base',
      detalle: 'Peso del TPV dentro de las ventas KPI.',
      accion: 'Importar TPV de forma recurrente para depender menos del marcado de sala.',
      href: '/dashboard/tpv',
    },
    {
      id: 'tpvAtribuido',
      label: 'TPV atribuido',
      pct: porcentajeDato(ventasTPVAtribuidas, ventasTPV),
      base: ventasTPV,
      valor: ventasTPV ? `${ventasTPVAtribuidas}/${ventasTPV}` : 'sin base',
      detalle: 'Ventas TPV conectadas a recomendacion o exposicion.',
      accion: 'Revisar alias, exposiciones y briefing para unir venta real con recomendacion.',
      href: '/dashboard/tpv',
    },
    {
      id: 'ventasAtribuidas',
      label: 'Ventas atribuidas',
      pct: porcentajeDato(unidadesAtribuidas, ventasKpi),
      base: ventasKpi,
      valor: ventasKpi ? `${unidadesAtribuidas}/${ventasKpi}` : 'sin base',
      detalle: 'Ventas KPI vinculadas a una recomendacion.',
      accion: 'Usar modo sala y cierre para capturar que argumento genera venta.',
      href: '/dashboard/sala',
    },
    {
      id: 'cierreRecomendacion',
      label: 'Rec. cerradas',
      pct: porcentajeDato(recomendacionesCerradas, recomendacionesTrazadasIds.size),
      base: recomendacionesTrazadasIds.size,
      valor: recomendacionesTrazadasIds.size ? `${recomendacionesCerradas}/${recomendacionesTrazadasIds.size}` : 'sin base',
      detalle: 'Recomendaciones con resultado cerrado.',
      accion: 'Cerrar recomendaciones pendientes para saber si vendieron, fallaron o siguen abiertas.',
      href: '/dashboard/cierre',
    },
    {
      id: 'stockMinimo',
      label: 'Stock minimo',
      pct: porcentajeDato(vinosConStockMinimo, totalVinosCarta),
      base: totalVinosCarta,
      valor: totalVinosCarta ? `${vinosConStockMinimo}/${totalVinosCarta}` : 'sin base',
      detalle: 'Vinos con umbral minimo para alertas de compra.',
      accion: 'Definir stock minimo por referencia para anticipar roturas.',
      href: '/dashboard/bodega',
    },
  ]
  const fiabilidadIndicadores = fiabilidadIndicadoresBase.map(item => ({
    ...item,
    nivel: nivelFiabilidad(item.pct, item.base),
  }))
  const fiabilidadConBase = fiabilidadIndicadores.filter(item => item.base > 0)
  const fiabilidadGlobalPct = fiabilidadConBase.length
    ? Math.round(fiabilidadConBase.reduce((sum, item) => sum + item.pct, 0) / fiabilidadConBase.length)
    : 0
  const fiabilidadGlobal = nivelFiabilidad(fiabilidadGlobalPct, fiabilidadConBase.length)
  const indicadorFiabilidadPorId = new Map(fiabilidadIndicadores.map(item => [item.id, item]))
  function decisionFiabilidad({ area, ids, href, verde, ambar, rojo, sinBase }) {
    const indicadores = ids.map(id => indicadorFiabilidadPorId.get(id)).filter(Boolean)
    const conBase = indicadores.filter(item => item.base > 0)
    const pct = conBase.length
      ? Math.round(conBase.reduce((sum, item) => sum + item.pct, 0) / conBase.length)
      : 0
    const nivel = nivelFiabilidad(pct, conBase.length)
    const accion = !conBase.length ? sinBase : pct >= 80 ? verde : pct >= 55 ? ambar : rojo
    return {
      area,
      pct,
      nivel,
      href,
      accion,
      detalle: conBase.length ? `${conBase.length}/${indicadores.length} indicadores con base` : 'Sin datos suficientes para evaluar.',
    }
  }
  const fiabilidadDecisiones = [
    decisionFiabilidad({
      area: 'Precio',
      ids: ['pvpCoste', 'ventasCoste', 'costes'],
      href: '/dashboard/precios',
      verde: 'Se puede revisar PVP y margen con bastante seguridad.',
      ambar: 'Revisar precio solo en vinos con coste y PVP completos; completar huecos antes de generalizar.',
      rojo: 'Completar coste y PVP antes de decidir subidas, bajadas o formatos por copa.',
      sinBase: 'Cargar vinos con PVP y coste para medir precio.',
    }),
    decisionFiabilidad({
      area: 'Sala',
      ids: ['ventasAtribuidas', 'cierreRecomendacion', 'tpvAtribuido'],
      href: '/dashboard/sala',
      verde: 'Briefing fiable: repetir argumentos que convierten y formar con evidencia.',
      ambar: 'Formar sala con casos trazados y cerrar mejor las recomendaciones pendientes.',
      rojo: 'Cerrar resultados y atribuir TPV antes de juzgar rendimiento de sala.',
      sinBase: 'Registrar recomendaciones y cierres para medir sala.',
    }),
    decisionFiabilidad({
      area: 'Compras',
      ids: ['stockMinimo', 'fuenteTpv', 'costes'],
      href: '/dashboard/bodega',
      verde: 'Comprar y reponer con base de rotacion, margen y umbral minimo.',
      ambar: 'Priorizar compras en referencias con TPV, coste y stock minimo fiable.',
      rojo: 'Definir stock minimo, coste y TPV antes de comprometer compra.',
      sinBase: 'Cargar stock, costes y ventas para medir compras.',
    }),
    decisionFiabilidad({
      area: 'Carta',
      ids: ['pvpCoste', 'fuenteTpv', 'cierreRecomendacion', 'ventasAtribuidas'],
      href: '/dashboard/menu-engineering',
      verde: 'Mover visibilidad de carta con seguridad y sin romper el maridaje.',
      ambar: 'Ajustar carta solo en vinos con datos suficientes; el resto queda en vigilancia.',
      rojo: 'No reordenar carta todavia: faltan ventas, costes o cierres.',
      sinBase: 'Necesita datos de carta, ventas y recomendaciones para decidir.',
    }),
  ]
  const fiabilidadFocos = fiabilidadIndicadores
    .filter(item => item.base === 0 || item.pct < 80)
    .sort((a, b) => (a.base ? a.pct : -1) - (b.base ? b.pct : -1))
  const fiabilidadDecisionPrincipal = fiabilidadDecisiones
    .filter(item => item.nivel.estado !== 'Fiable')
    .sort((a, b) => a.pct - b.pct)[0] || null

  const platosFrecuentes = statsFiltradas
    .filter(s => s.tipo === 'sommelier' && s.detalle)
    .flatMap(s => s.detalle.split(', ').map(p => p.trim()))
    .reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc }, {})

  const topPlatos = Object.entries(platosFrecuentes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const vinosRecomendados = Object.entries(recomendacionesVino.reduce((acc, item) => {
    const vino = item.vino || 'Vino sin nombre'
    acc[vino] = acc[vino] || { total: 0, cliente: 0, camarero: 0 }
    const origen = item.origen === 'camarero' ? 'camarero' : 'cliente'
    acc[vino][origen] += 1
    acc[vino].total += 1
    return acc
  }, {}))
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)

  const conversion = escaneos > 0 ? Math.round((consultas / escaneos) * 100) : 0
  const ventasSalaEventos = feedbackSala.filter(item => item.resultado === 'vendida').length
  const tasaVenta = feedbackSala.length > 0 ? Math.round((ventasSalaEventos / feedbackSala.length) * 100) : 0
  const lecturaEjecutiva = [
    escaneos === 0 && { titulo: 'No hay escaneos en el periodo', texto: 'Revisa ubicación del QR, material de mesa y si sala lo está ofreciendo.', href: '/dashboard/qr' },
    incidenciasStock > 0 && { titulo: 'Stock está generando fricción', texto: `${incidenciasStock} avisos de falta de stock o agotado. Conviene pasar por cierre y bodega.`, href: '/dashboard/cierre#incidencias' },
    beneficioPerdidoStock > 0 && { titulo: 'Stock esta costando margen', texto: `Hay ${eur(beneficioPerdidoStock)} de beneficio bruto potencial perdido por falta de stock.`, href: '/dashboard/bodega' },
    ventasSalaOmitidas > 0 && { titulo: 'TPV prioriza los KPI', texto: `${ventasSalaOmitidas} ventas de sala quedan fuera del KPI porque el TPV ya confirma ese vino y dia.`, href: '/dashboard/tpv' },
    ventasTPVNoAtribuidas > 0 && recomendaciones.length > 0 && { titulo: 'Venta TPV sin atribucion', texto: `${ventasTPVNoAtribuidas} ventas TPV no quedan vinculadas a recomendacion. Importa revisar exposiciones, alias y uso de sala.`, href: '/dashboard/tpv' },
    fiabilidadDecisionPrincipal && { titulo: `Fiabilidad ${fiabilidadDecisionPrincipal.area}: ${fiabilidadDecisionPrincipal.nivel.estado}`, texto: fiabilidadDecisionPrincipal.accion, href: fiabilidadDecisionPrincipal.href },
    aprendizajeComercial[0] && { titulo: `Aprendizaje TPV: ${aprendizajeComercial[0].tipo}`, texto: `${aprendizajeComercial[0].vino}: ${aprendizajeComercial[0].accion}`, href: '/dashboard/estadisticas' },
    oportunidadesRentables[0] && { titulo: `Empujar sin traicionar maridaje: ${oportunidadesRentables[0].vino}`, texto: oportunidadesRentables[0].accion, href: '/dashboard/sala' },
    ventasSinCoste > 0 && { titulo: 'Faltan costes para medir margen', texto: `${ventasSinCoste} ventas no pueden calcular beneficio bruto. Completar coste de compra cambia la lectura economica.`, href: '/dashboard/vinos' },
    dudasSala > 0 && { titulo: 'Hay dudas en mesa', texto: `${dudasSala} cambios o rechazos. Revisa argumento, precio o alternativa.`, href: '/dashboard/cierre#dudas' },
    recomendacionesTrazadasIds.size > 0 && conversionRecomendacion === 0 && { titulo: 'Recomendaciones sin venta KPI', texto: 'Sala esta recomendando, pero todavia no hay ventas atribuidas por TPV, cierre o feedback. Conviene validar el resultado.', href: '/dashboard/cierre' },
    unidadesAtribuidas > 0 && { titulo: 'Embudo comercial activo', texto: `${unidadesAtribuidas} ventas quedan vinculadas a una recomendacion de sala.`, href: '/dashboard/estadisticas' },
    focoFormacionSala && { titulo: `Formacion sala: ${focoFormacionSala.nombre}`, texto: focoFormacionSala.accion, href: '/dashboard/estadisticas' },
    alertasOportunidad[0] && { titulo: `Oportunidad: ${alertasOportunidad[0].plato}`, texto: `${alertasOportunidad[0].vino}: ${alertasOportunidad[0].accion}`, href: '/dashboard/estadisticas' },
    parejasQueFuncionan > 0 && mejoresPlatoVino[0] && { titulo: 'Pareja plato-vino ganadora', texto: `${mejoresPlatoVino[0].vino} funciona con ${mejoresPlatoVino[0].plato}. Usalo como argumento de sala.`, href: '/dashboard/sala' },
    topPlatos[0] && { titulo: 'Plato que pide ayuda', texto: `${topPlatos[0][0]} concentra consultas de maridaje. Úsalo para formar a sala.`, href: '/dashboard/platos' },
    vinosRecomendados[0] && { titulo: 'Vino con tirón en recomendación', texto: `${vinosRecomendados[0][0]} aparece ${vinosRecomendados[0][1].total} veces. Comprueba stock y margen.`, href: '/dashboard/bodega' },
    topVinosVendidos[0] && { titulo: 'Venta KPI destacada', texto: `${topVinosVendidos[0][0]} lidera con ${topVinosVendidos[0][1]} ventas KPI.`, href: '/dashboard/tpv' },
  ].filter(Boolean).slice(0, 4)
  const accionesFase6Base = [
    actividadIniciada && escaneos === 0 && {
      grupo: 'moverAhora',
      area: 'Cliente',
      titulo: 'Recuperar escaneos de carta',
      texto: 'Sin escaneos no hay consultas ni atribucion. Revisar QR, mesa y discurso de bienvenida.',
      href: '/dashboard/qr',
      prioridad: 98,
    },
    incidenciasStock > 0 && {
      grupo: 'moverAhora',
      area: 'Bodega',
      titulo: 'Resolver stock antes del servicio',
      texto: `${incidenciasStock} avisos de falta de stock o agotado. Preparar reposicion o sustituto equivalente.`,
      href: '/dashboard/cierre#incidencias',
      prioridad: 110,
    },
    beneficioPerdidoStock > 0 && {
      grupo: 'moverAhora',
      area: 'Margen',
      titulo: 'Recuperar margen perdido',
      texto: `${eur(beneficioPerdidoStock)} de beneficio bruto potencial se pierde por stock. Prioridad de compra y sustitucion.`,
      href: '/dashboard/bodega',
      prioridad: 108,
    },
    fiabilidadDecisionPrincipal && {
      grupo: fiabilidadDecisionPrincipal.pct < 55 ? 'moverAhora' : 'estaSemana',
      area: 'Datos',
      titulo: `Fiabilidad ${fiabilidadDecisionPrincipal.area}`,
      texto: fiabilidadDecisionPrincipal.accion,
      href: fiabilidadDecisionPrincipal.href,
      prioridad: fiabilidadDecisionPrincipal.pct < 55 ? 104 : 74,
    },
    oportunidadesRentables[0] && {
      grupo: oportunidadesRentables[0].stockFallos || oportunidadesRentables[0].margenAlto ? 'moverAhora' : 'estaSemana',
      area: 'Carta',
      titulo: `Accion rentable: ${oportunidadesRentables[0].vino}`,
      texto: oportunidadesRentables[0].accion,
      href: '/dashboard/sala',
      prioridad: 92 + (oportunidadesRentables[0].prioridad || 0),
    },
    ...aprendizajeComercial.slice(0, 3).map(item => ({
      grupo: item.tipo === 'Recomendacion que convierte' ? 'moverAhora' : 'estaSemana',
      area: 'TPV',
      titulo: item.tipo,
      texto: `${item.vino}: ${item.accion}`,
      href: '/dashboard/estadisticas',
      prioridad: 70 + (item.prioridad || 0),
    })),
    ventasSinCoste > 0 && {
      grupo: 'estaSemana',
      area: 'Costes',
      titulo: 'Completar costes de compra',
      texto: `${ventasSinCoste} ventas no pueden calcular beneficio bruto. Sin coste, el margen no se puede defender.`,
      href: '/dashboard/vinos',
      prioridad: 82,
    },
    recomendacionesSinResultadoEconomico.length > 0 && {
      grupo: 'estaSemana',
      area: 'Cierre',
      titulo: 'Cerrar recomendaciones pendientes',
      texto: `${recomendacionesSinResultadoEconomico.length} recomendaciones tienen valor economico sin resultado. Validarlas mejora conversion y margen.`,
      href: '/dashboard/cierre',
      prioridad: 78,
    },
    ventasTPVNoAtribuidas > 0 && {
      grupo: 'estaSemana',
      area: 'TPV',
      titulo: 'Conectar TPV con recomendacion',
      texto: `${ventasTPVNoAtribuidas} ventas TPV no quedan atribuidas. Revisar alias, exposiciones y briefing de sala.`,
      href: '/dashboard/tpv',
      prioridad: 76,
    },
    focoFormacionSala && {
      grupo: 'estaSemana',
      area: 'Sala',
      titulo: `Formacion: ${focoFormacionSala.nombre}`,
      texto: focoFormacionSala.accion,
      href: '/dashboard/estadisticas',
      prioridad: 72,
    },
    alertasOportunidad[0] && {
      grupo: alertasOportunidad[0].incidencias > 0 ? 'moverAhora' : 'estaSemana',
      area: 'Maridaje',
      titulo: `${alertasOportunidad[0].tipo}: ${alertasOportunidad[0].plato}`,
      texto: `${alertasOportunidad[0].vino}: ${alertasOportunidad[0].accion}`,
      href: '/dashboard/estadisticas',
      prioridad: 68 + (alertasOportunidad[0].prioridad || 0),
    },
    dudasSala > 0 && {
      grupo: 'estaSemana',
      area: 'Sala',
      titulo: 'Reducir dudas en mesa',
      texto: `${dudasSala} cambios o rechazos. Revisar argumento, precio de entrada o alternativa gastronomica.`,
      href: '/dashboard/cierre#dudas',
      prioridad: 66,
    },
    ventasSalaOmitidas > 0 && {
      grupo: 'vigilar',
      area: 'Datos',
      titulo: 'Sala duplicada por TPV',
      texto: `${ventasSalaOmitidas} ventas de sala se omiten de KPI por existir TPV del mismo vino y dia.`,
      href: '/dashboard/tpv',
      prioridad: 54,
    },
    parejasQueFuncionan > 0 && mejoresPlatoVino[0] && {
      grupo: 'vigilar',
      area: 'Maridaje',
      titulo: 'Pareja que funciona',
      texto: `${mejoresPlatoVino[0].vino} funciona con ${mejoresPlatoVino[0].plato}. Proteger stock y repetir argumento.`,
      href: '/dashboard/sala',
      prioridad: 52,
    },
    topVinosVendidos[0] && {
      grupo: 'vigilar',
      area: 'TPV',
      titulo: 'Vino lider en KPI',
      texto: `${topVinosVendidos[0][0]} lidera con ${topVinosVendidos[0][1]} ventas KPI. Vigilar margen, stock y dependencia.`,
      href: '/dashboard/tpv',
      prioridad: 48,
    },
    vinosRecomendados[0] && {
      grupo: 'vigilar',
      area: 'Carta',
      titulo: 'Vino con tiron en recomendacion',
      texto: `${vinosRecomendados[0][0]} aparece ${vinosRecomendados[0][1].total} veces. Comparar salida real, margen y stock.`,
      href: '/dashboard/bodega',
      prioridad: 44,
    },
  ].flat().filter(Boolean)

  function accionesPorGrupo(grupo, limite) {
    const vistos = new Set()
    return accionesFase6Base
      .filter(item => item.grupo === grupo)
      .sort((a, b) => b.prioridad - a.prioridad)
      .filter(item => {
        const clave = `${item.titulo}|${item.texto}`
        if (vistos.has(clave)) return false
        vistos.add(clave)
        return true
      })
      .slice(0, limite)
  }

  const accionesFase6 = {
    moverAhora: accionesPorGrupo('moverAhora', 3),
    estaSemana: accionesPorGrupo('estaSemana', 4),
    vigilar: accionesPorGrupo('vigilar', 4),
  }
  const accionPrincipal = accionesFase6.moverAhora[0] || accionesFase6.estaSemana[0] || lecturaEjecutiva[0] || { titulo: 'Sin alertas relevantes', texto: 'Los datos no muestran friccion clara en el periodo seleccionado.', href: '/dashboard/sala' }
  const columnasFase6 = [
    { id: 'moverAhora', titulo: 'Mover ahora', items: accionesFase6.moverAhora, vacio: 'Sin urgencias economicas claras.' },
    { id: 'estaSemana', titulo: 'Esta semana', items: accionesFase6.estaSemana, vacio: 'Sin tareas operativas prioritarias.' },
    { id: 'vigilar', titulo: 'Vigilar', items: accionesFase6.vigilar, vacio: 'Sin riesgos suaves que seguir.' },
  ]

  function explicarMetrica(label) {
    if (label.includes('Ventas KPI')) return 'Ventas usadas para indicadores economicos. TPV tiene prioridad y sala solo entra cuando no duplica una venta real del mismo vino y dia.'
    if (label.includes('Ventas TPV')) return 'Unidades detectadas en la importacion TPV. Es la fuente mas fuerte para ventas reales cuando esta vinculada a vinos.'
    if (label.includes('TPV atrib')) return 'Ventas TPV que se pueden relacionar con una recomendacion previa. Ayuda a medir si Carta Viva influye en la venta.'
    if (label.includes('Beneficio bruto')) return 'Ingreso neto estimado menos coste neto de compra, solo en ventas con vino, precio y coste suficientes.'
    if (label.includes('Margen bruto')) return 'Porcentaje del ingreso neto que queda despues de restar el coste de compra. Solo se calcula con ventas que tienen coste.'
    if (label.includes('Fiabilidad')) return 'Indica si los datos sirven para decidir. Sube cuando hay costes, PVP, TPV, atribucion, cierre y stock informados.'
    if (label.includes('Importe vino')) return 'Suma del importe de vino registrado en ventas KPI del periodo filtrado.'
    if (label.includes('Perd') || label.includes('pend')) return 'Dinero recuperable o bloqueado por stock, ventas sin coste, TPV sin atribuir o recomendaciones sin validar.'
    if (label.includes('Oport')) return 'Senales comerciales detectadas: recomendaciones sin venta, dudas, stock, margen o parejas plato-vino con potencial.'
    if (label.includes('Convers')) return 'Porcentaje de recomendaciones o consultas que acaban en venta segun el feedback y las ventas trazadas.'
    return 'Dato operativo del periodo filtrado. Sirve como contexto, pero las decisiones economicas dependen de coste, PVP, stock y ventas fiables.'
  }

  const metricas = [
    { label: perfilBodega ? 'Eventos totales' : 'Escaneos totales', valor: escaneos },
    { label: perfilBodega ? 'Eventos hoy' : 'Escaneos hoy', valor: escaneosHoy },
    { label: perfilBodega ? 'Consultas internas' : 'Consultas maridaje', valor: consultas },
    { label: perfilBodega ? 'Referencias movidas' : 'Vinos recomendados', valor: recomendaciones.length },
    { label: perfilBodega ? 'Senales hoy' : 'Maridaje hoy', valor: consultasHoy },
    { label: 'Eventos venta', valor: ventasMarcadas },
    { label: 'Ventas KPI', valor: ventasKpi || '-' },
    { label: 'Ventas TPV', valor: ventasTPV || '-' },
    { label: 'TPV atrib.', valor: ventasTPVAtribuidas || '-' },
    { label: perfilBodega ? 'No dup.' : 'Sala no dup.', valor: ventasSalaKpi || '-' },
    { label: 'Ventas atribuidas', valor: unidadesAtribuidas || '-' },
    { label: perfilBodega ? 'Usuarios' : 'Camareros', valor: camarerosConDatos || '-' },
    { label: perfilBodega ? 'Senales internas' : 'Platos con senal', valor: platosConSenal || '-' },
    { label: 'Oportunidades', valor: alertasOportunidad.length || '-' },
    { label: 'Aprend. TPV', valor: aprendizajeComercial.length || '-' },
    { label: 'Importe vino', valor: importeVinoEstimado ? eur(importeVinoEstimado) : '-' },
    { label: 'Beneficio bruto', valor: beneficioBrutoAtribuido ? eur(beneficioBrutoAtribuido) : '-' },
    { label: 'Ganado mes', valor: beneficioBrutoAtribuido ? eur(beneficioBrutoAtribuido) : ventasKpi || '-' },
    { label: 'Fiabilidad', valor: fiabilidadConBase.length ? `${fiabilidadGlobalPct}%` : '-' },
    { label: 'Margen bruto', valor: margenBrutoAtribuidoPct ? `${margenBrutoAtribuidoPct}%` : '-' },
    { label: 'Oport. no venta', valor: beneficioNoConvertido ? eur(beneficioNoConvertido) : '-' },
    { label: 'Perd./pend.', valor: valorRecuperablePendiente ? eur(valorRecuperablePendiente) : '-' },
    { label: 'Vino/comensal', valor: vinoPorComensal ? eur(vinoPorComensal, 2) : '-' },
    { label: 'Conversión', valor: `${conversion}%` },
    { label: 'Conv. recomendacion', valor: recomendacionesTrazadasIds.size ? `${conversionRecomendacion}%` : '-' },
    { label: 'Aceptación sala', valor: feedbackSala.length ? `${tasaVenta}%` : '-' },
  ]

  const periodoInforme = fechaInicio || fechaFin
    ? `${fechaInicio || 'inicio'} a ${fechaFin || 'hoy'}${servicio !== 'todos' ? ` · ${servicio}` : ''}`
    : `Últimos datos disponibles${servicio !== 'todos' ? ` · ${servicio}` : ''}`

  const accionesInformeBase = [
    ...accionesFase6.moverAhora,
    ...accionesFase6.estaSemana,
    ...accionesFase6.vigilar,
  ]
  const accionesInforme = accionesInformeBase.length ? accionesInformeBase : [accionPrincipal]
  const informeCompartible = [
    `Informe de actividad - ${restaurante?.nombre || 'Restaurante'}`,
    periodoInforme,
    '',
    'Actividad:',
    `- ${escaneos} escaneos de carta`,
    `- ${consultas} consultas de maridaje`,
    `- ${recomendaciones.length} recomendaciones generadas`,
    `- ${ventasKpi} ventas KPI con TPV prioritario`,
    `- ${ventasTPV} ventas TPV | ${ventasSalaKpi} sala no duplicada`,
    `- ${ventasTPVAtribuidas} ventas TPV atribuidas a recomendacion | ${ventasTPVNoAtribuidas} no atribuidas`,
    ventasSalaOmitidas ? `- ${ventasSalaOmitidas} ventas de sala omitidas por TPV` : null,
    `- ${unidadesAtribuidas} ventas atribuidas a recomendacion`,
    `- ${eur(importeVinoEstimado)} de vino estimado registrado`,
    `- ${vinoPorComensal ? eur(vinoPorComensal, 2) : '-'} vino por comensal`,
    `- ${beneficioBrutoAtribuido ? eur(beneficioBrutoAtribuido) : '-'} de beneficio bruto atribuido`,
    `- ${margenBrutoAtribuidoPct ? `${margenBrutoAtribuidoPct}%` : '-'} margen bruto medio con coste informado`,
    '',
    'Embudo comercial:',
    `- ${recomendacionesTrazadasIds.size} recomendaciones trazadas`,
    `- ${conversionRecomendacion}% conversion recomendacion -> venta KPI`,
    `- ${coberturaFeedback}% del feedback de sala queda vinculado a una recomendacion`,
    `- ${importeNoConvertido ? eur(importeNoConvertido) : '-'} de venta estimada no convertida`,
    `- ${beneficioNoConvertido ? eur(beneficioNoConvertido) : '-'} de beneficio bruto potencial no convertido`,
    `- ${recomendacionesSinResultadoEconomico.length} recomendaciones con valor economico sin resultado`,
    '',
    'Fiabilidad ejecutiva:',
    `- ${fiabilidadConBase.length ? `${fiabilidadGlobalPct}%` : '-'} fiabilidad global (${fiabilidadGlobal.estado})`,
    ...fiabilidadDecisiones.map(item => `- ${item.area}: ${item.nivel.estado} (${item.nivel.estado === 'Sin base' ? 'sin base' : `${item.pct}%`}). ${item.accion}`),
    ...lineaTop(fiabilidadFocos.slice(0, 2), 'Sin focos de fiabilidad pendientes', item => `${item.label}: ${item.base ? `${item.pct}%` : 'sin base'}. ${item.accion}`),
    '',
    'Ganado este mes:',
    `- ${beneficioBrutoAtribuido ? eur(beneficioBrutoAtribuido) : '-'} de beneficio bruto KPI`,
    `- ${beneficioAtribuidoRecomendacion ? eur(beneficioAtribuidoRecomendacion) : '-'} de beneficio atribuido a recomendacion`,
    `- ${ventasTPVAtribuidas} ventas TPV atribuidas a recomendacion`,
    `- ${parejasQueFuncionan || 0} parejas plato-vino con resultado positivo`,
    ...lineaTop(ganadoEsteMes.slice(0, 3), 'Sin valor ganado trazado suficiente', item => `${item.tipo}: ${item.titulo} (${item.valor}). ${item.accion}`),
    '',
    'Perdido o pendiente:',
    `- ${valorRecuperablePendiente ? eur(valorRecuperablePendiente) : '-'} recuperable estimado`,
    `- ${importeTpvNoAtribuido ? eur(importeTpvNoAtribuido) : '-'} de TPV sin atribucion`,
    ...lineaTop(perdidoPendiente.slice(0, 3), 'Sin perdidas o pendientes economicos claros', item => `${item.tipo}: ${item.titulo} (${item.valor}). ${item.accion}`),
    '',
    'Rentabilidad de carta:',
    ...lineaTop(rankingRentabilidadCarta.slice(0, 2), 'Sin ventas con coste suficiente', item => `${item.vino}: ${eur(item.beneficio)} beneficio, ${item.ventas} uds., ${item.conversion}% conversion`),
    ...lineaTop(oportunidadesRentables.slice(0, 1), 'Sin oportunidades economicas claras', item => `${item.vino}: ${item.accion}`),
    '',
    'Aprendizaje TPV:',
    ...lineaTop(aprendizajeComercial.slice(0, 2), 'Sin aprendizaje TPV accionable', item => `${item.tipo}: ${item.vino}. ${item.accion}`),
    '',
    'Oportunidades plato-vino:',
    `- ${platosConSenal} platos o consultas con senal comercial`,
    ...lineaTop(mejoresPlatoVino.slice(0, 2), 'Sin parejas plato-vino suficientes', item => `${item.plato}: ${item.vino} (${item.conversionLabel}, ${item.ventas} uds.)`),
    ...lineaTop(alertasOportunidad.slice(0, 1), 'Sin alertas plato-vino', item => `Revisar ${item.plato} + ${item.vino}: ${item.accion}`),
    '',
    'Formacion de sala:',
    `- ${camarerosConDatos} camareros con nombre registrado`,
    ...lineaTop(rankingCamareros.slice(0, 2), 'Sin datos por camarero', item => `${item.nombre}: ${item.ventas} uds., ${item.tasaDuda}% dudas, ${item.accion}`),
    '',
    'Lo más relevante:',
    ...lineaTop(topPlatos.slice(0, 1), 'Sin platos consultados', ([nombre, veces]) => `Plato más consultado: ${nombre} (${veces}x)`),
    ...lineaTop(vinosRecomendados.slice(0, 1), 'Sin vinos recomendados', ([nombre, datos]) => `Vino más recomendado: ${nombre} (${datos.total}x)`),
    ...lineaTop(topVinosVendidos.slice(0, 1), 'Sin ventas KPI', ([nombre, ventas]) => `Vino mas vendido KPI: ${nombre} (${ventas})`),
    '',
    'Alertas:',
    `- ${incidenciasStock} avisos de stock`,
    `- ${dudasSala} dudas, rechazos o cambios`,
    '',
    'Acciones recomendadas:',
    ...accionesInforme.slice(0, 3).map((item, index) => `${index + 1}. ${item.titulo}. ${item.texto}`),
  ].filter(linea => linea !== null).join('\n')

  async function copiarInforme() {
    await copiarTexto(informeCompartible)
    setMensajeInforme('Informe copiado para compartir.')
    setTimeout(() => setMensajeInforme(''), 1800)
  }

  return (
    <FeatureGate restaurante={restaurante} feature="estadisticas" title="Actividad no incluida">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Estadísticas"
      title={perfilBodega ? 'Actividad de bodega' : 'Actividad de la carta'}
      subtitle={perfilBodega
        ? 'Lectura rapida de ventas, TPV, movimientos y senales internas para decidir compras, rotacion y margen.'
        : 'Lectura rápida de escaneos, consultas de maridaje y feedback de sala para tomar decisiones comerciales con criterio.'}
      help={{
        title: perfilBodega ? 'Como leer la bodega' : 'Cómo leer los datos',
        intro: 'No hace falta mirarlo cada hora. Funciona mejor como lectura semanal o mensual.',
        items: perfilBodega ? [
          { title: 'TPV', text: 'Es la fuente principal para ventas reales, rotacion y margen.' },
          { title: 'Movimientos', text: 'Ajustes, reposiciones y conteos explican diferencias de stock.' },
          { title: 'Decision', text: 'Cruza venta, coste, stock y margen antes de comprar, archivar o defender una referencia.' },
        ] : [
          { title: 'Escaneos', text: 'Indican uso de la carta, pero no venta. Si bajan, revisa QR, ubicación o comunicación en sala.' },
          { title: 'Consultas', text: 'Muestran platos o momentos donde el cliente necesita ayuda para elegir vino.' },
          { title: 'Feedback', text: 'Ventas, cambios y rechazos ayudan a mejorar precio, relato, stock y destacados.' },
        ],
      }}
    >
      <section className={actividadIniciada ? styles.panel : styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{actividadIniciada ? `Actividad real desde ${etiquetaActividadReal(restaurante)}` : 'Actividad preparada'}</h2>
            <p className={styles.panelSub}>
              {actividadIniciada
                ? 'Las metricas de esta pantalla ya excluyen el historico de pruebas anterior al arranque.'
                : (perfilBodega
                  ? 'Cuando la bodega empiece con datos reales, aqui apareceran ventas TPV, movimientos y senales utiles. De momento no mezclamos pruebas con decisiones de compra.'
                  : 'Cuando empecéis a usar Sala en el día a día, aquí aparecerán escaneos, consultas, recomendaciones y ventas reales. De momento no mezclamos datos de prueba con decisiones del restaurante.')}
            </p>
          </div>
          {esAdmin && <a className={styles.secondary} href="/dashboard/ajustes">Activar en Ajustes</a>}
        </div>
      </section>

      <section className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Filtrar actividad</h2>
            <p className={styles.panelSub}>Revisa escaneos y consultas por día, rango de fechas o servicio.</p>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => { setFechaInicio(''); setFechaFin(''); setServicio('todos') }}
          >
            Limpiar
          </button>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formGridThree}>
            <label>
              <span className={styles.label}>Desde</span>
              <input className={styles.input} type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
            </label>
            <label>
              <span className={styles.label}>Hasta</span>
              <input className={styles.input} type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
            </label>
            <label>
              <span className={styles.label}>Servicio</span>
              <select className={styles.select} value={servicio} onChange={e => setServicio(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="comida">Comida · 12:00-17:00</option>
                <option value="cena">Cena · 20:00-02:00</option>
                <option value="otro">Fuera de servicio</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.statsGrid}>
        {metricas.map(metrica => (
          <StatCard
            key={metrica.label}
            value={metrica.valor}
            label={metrica.label}
            info={explicarMetrica(metrica.label)}
          />
        ))}
      </section>

      <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Plan ejecutivo</h2>
            <p className={styles.panelSub}>Ordena las senales por urgencia para decidir que toca hacer ahora, esta semana o solo vigilar.</p>
          </div>
          <span className={styles.badge}>{accionesInformeBase.length || 0} senales</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.execActionGrid}>
            {columnasFase6.map(columna => (
              <section className={styles.execActionColumn} key={columna.id}>
                <h3 className={styles.execActionColumnTitle}>{columna.titulo}</h3>
                {columna.items.length ? (
                  columna.items.map(item => (
                    <a className={styles.itemCard} href={item.href} key={`${columna.id}-${item.titulo}-${item.area}`}>
                      <p className={styles.eyebrow}>{item.area}</p>
                      <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.texto}</p>
                    </a>
                  ))
                ) : (
                  <div className={styles.empty}>{columna.vacio}</div>
                )}
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Semaforo de fiabilidad</h2>
            <p className={styles.panelSub}>Indica si el dato ya sirve para decidir precio, sala, compras o carta sin maquillar la rentabilidad.</p>
          </div>
          <span className={`${styles.trafficBadge} ${styles[fiabilidadGlobal.clase]}`}>
            <span className={styles.trafficDot} />
            {fiabilidadGlobal.estado} {fiabilidadConBase.length ? `${fiabilidadGlobalPct}%` : ''}
          </span>
        </div>
        <div className={styles.panelBody}>
          <section className={styles.statsGrid} style={{ marginBottom: 14 }}>
            {fiabilidadDecisiones.map(item => (
              <div className={styles.stat} key={`fiabilidad-stat-${item.area}`}>
                <p className={styles.statValue}>{item.nivel.estado === 'Sin base' ? '-' : `${item.pct}%`}</p>
                <p className={styles.statLabel}>{item.area}</p>
              </div>
            ))}
          </section>

          <section className={styles.gridTwo}>
            <div>
              <div className={styles.sectionHead}>
                <div>
                  <h3 className={styles.sectionTitle}>Decision ejecutiva</h3>
                  <p className={styles.sectionText}>Que se puede decidir con seguridad y que conviene completar antes.</p>
                </div>
              </div>
              <div className={styles.itemStack}>
                {fiabilidadDecisiones.map(item => (
                  <a className={styles.itemCard} href={item.href} key={`decision-fiabilidad-${item.area}`}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>Fiabilidad {item.area}</p>
                        <h3 className={styles.sectionTitle}>{item.nivel.estado}</h3>
                        <p className={styles.sectionText}>{item.accion}</p>
                        <p className={styles.sectionText}>{item.detalle}</p>
                      </div>
                      <span className={`${styles.trafficBadge} ${styles[item.nivel.clase]}`}>
                        <span className={styles.trafficDot} />
                        {item.nivel.estado === 'Sin base' ? 'sin base' : `${item.pct}%`}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div>
              <div className={styles.sectionHead}>
                <div>
                  <h3 className={styles.sectionTitle}>Cobertura del dato</h3>
                  <p className={styles.sectionText}>Los huecos que mas cambian margen, atribucion, sala y compras.</p>
                </div>
              </div>
              <div className={styles.itemStack}>
                {fiabilidadIndicadores.map(item => (
                  <a className={styles.itemCard} href={item.href} key={`indicador-fiabilidad-${item.id}`}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{item.label}</p>
                        <h3 className={styles.sectionTitle}>{item.valor}</h3>
                        <p className={styles.sectionText}>{item.detalle}</p>
                        <p className={styles.sectionText}>{item.accion}</p>
                      </div>
                      <span className={`${styles.trafficBadge} ${styles[item.nivel.clase]}`}>
                        <span className={styles.trafficDot} />
                        {item.base ? `${item.pct}%` : 'sin base'}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>

      {ganadoEsteMes.length > 0 && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Ganado este mes</h2>
              <p className={styles.panelSub}>Valor ya capturado por ventas KPI, TPV atribuido y maridajes que funcionan en el periodo seleccionado.</p>
            </div>
            <span className={styles.badge}>{ganadoEsteMes.length} avances</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.statsGrid} style={{ marginBottom: 14 }}>
              <StatCard
                value={beneficioBrutoAtribuido ? eur(beneficioBrutoAtribuido) : '-'}
                label="Beneficio KPI"
                hint="Venta con coste y PVP."
                info="Beneficio bruto calculado desde las ventas KPI del periodo. Usa TPV prioritario y sala no duplicada, siempre que haya coste de compra y precio."
              />
              <StatCard
                value={beneficioAtribuidoRecomendacion ? eur(beneficioAtribuidoRecomendacion) : '-'}
                label="Beneficio rec."
                hint="Asociado a recomendaciones."
                info="Parte del beneficio que se puede vincular a recomendaciones de la app mediante identificadores de recomendacion o ventas TPV atribuidas."
              />
              <StatCard
                value={ventasTPVAtribuidas || '-'}
                label="TPV atribuido"
                hint="Venta real conectada."
                info="Lineas de TPV que coinciden con un vino recomendado. Ayuda a defender que la recomendacion influyo en una venta real."
              />
              <StatCard
                value={parejasQueFuncionan || '-'}
                label="Pares que funcionan"
                hint="Plato-vino con senal."
                info="Combinaciones de plato o consulta con vino que muestran venta, aceptacion o conversion suficiente para reforzarlas en sala."
              />
            </section>
            <div className={styles.itemStack}>
              {ganadoEsteMes.map(item => (
                <a className={styles.itemCard} href={item.href} key={`${item.tipo}-${item.titulo}`}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <p className={styles.eyebrow}>{item.tipo}</p>
                      <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.detalle}</p>
                      <p className={styles.sectionText}>{item.accion}</p>
                    </div>
                    <span className={styles.badge}>{item.valor}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {(perdidoPendiente.length > 0 || valorRecuperablePendiente > 0 || importeTpvNoAtribuido > 0) && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Perdido o pendiente</h2>
              <p className={styles.panelSub}>Dinero recuperable, valor sin atribuir y datos que bloquean decisiones economicas.</p>
            </div>
            <span className={styles.badge}>{perdidoPendiente.length} focos</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.statsGrid} style={{ marginBottom: 14 }}>
              <StatCard
                value={valorRecuperablePendiente ? eur(valorRecuperablePendiente) : '-'}
                label="Recuperable estimado"
                hint="Oportunidad, no caja."
                info="Estimacion de dinero que podria recuperarse corrigiendo stock, margen bajo, ventas sin coste, recomendaciones sin validar o TPV no atribuido."
              />
              <StatCard
                value={importeTpvNoAtribuido ? eur(importeTpvNoAtribuido) : '-'}
                label="TPV sin atribuir"
                hint="Venta real sin origen claro."
                info="Importe de ventas TPV de vino que no estan conectadas a una recomendacion. Sirve para aprender demanda y mejorar alias/matching."
              />
              <StatCard
                value={ventasSinCoste || '-'}
                label="Ventas sin coste"
                hint="Bloquean margen."
                info="Ventas de vinos cuyo coste de compra no esta informado. La venta existe, pero no se puede calcular beneficio fiable."
              />
              <StatCard
                value={recomendacionesSinResultadoEconomico.length || '-'}
                label="Rec. pendientes"
                hint="Falta cerrar resultado."
                info="Recomendaciones que se mostraron pero no tienen venta, rechazo, stock o cierre asociado. Conviene resolverlas en cierre o con TPV."
              />
            </section>
            <div className={styles.itemStack}>
              {perdidoPendiente.map(item => (
                <a className={styles.itemCard} href={item.href} key={`${item.tipo}-${item.titulo}`}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <p className={styles.eyebrow}>{item.tipo}</p>
                      <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.detalle}</p>
                      <p className={styles.sectionText}>{item.accion}</p>
                    </div>
                    <span className={styles.badge}>{item.valor}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {(ventasTPV > 0 || ventasSalaOmitidas > 0) && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Fuente de ventas</h2>
              <p className={styles.panelSub}>
                TPV es fuente prioritaria para KPI economicos. Sala completa contexto, dudas y ventas sin TPV equivalente.
              </p>
            </div>
            <span className={styles.badge}>{ventasTPV} TPV / {ventasSalaKpi} sala</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.statsGrid} style={{ marginBottom: ventasSalaOmitidas > 0 ? 14 : 0 }}>
              <div className={styles.stat}>
                <p className={styles.statValue}>{ventasTPVAtribuidas || '-'}</p>
                <p className={styles.statLabel}>TPV atribuido</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{ventasTPVNoAtribuidas || '-'}</p>
                <p className={styles.statLabel}>TPV no atrib.</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{ventasSalaOmitidas || '-'}</p>
                <p className={styles.statLabel}>Sala omitida</p>
              </div>
            </section>
            {ventasSalaOmitidas > 0 && (
              <div className={styles.empty}>
                {ventasSalaOmitidas} ventas de sala se omiten del KPI para evitar doble conteo con TPV.
              </div>
            )}
          </div>
        </section>
      )}

      {aprendizajeComercial.length > 0 && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Aprendizaje TPV</h2>
              <p className={styles.panelSub}>Convierte venta real, recomendaciones y margen en decisiones de sala, carta y compras.</p>
            </div>
            <span className={styles.badge}>{aprendizajeComercial.length} acciones</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.gridTwo}>
              {aprendizajeComercial.map(item => (
                <article className={styles.itemCard} key={`aprendizaje-${item.clave}-${item.tipo}`}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <p className={styles.eyebrow}>{item.tipo}</p>
                      <h3 className={styles.sectionTitle}>{item.vino}</h3>
                      <p className={styles.sectionText}>
                        {item.recomendaciones} rec. - {item.ventasTpvAtribuidas} TPV atrib. - {item.ventasTpvNoAtribuidas} TPV no atrib. - {item.ventasSala} sala
                      </p>
                      <p className={styles.sectionText}>{item.accion}</p>
                    </div>
                    <span className={styles.badge}>{item.margenPct ? `${item.margenPct}%` : 'medir'}</span>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </section>
      )}

      {(recomendacionesTrazadasIds.size > 0 || feedbackTrazado.length > 0) && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Embudo comercial</h2>
              <p className={styles.panelSub}>Relaciona recomendaciones de sala con ventas TPV, cierre o feedback del camarero.</p>
            </div>
            <span className={styles.badge}>{recomendacionesTrazadasIds.size} trazadas</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.statsGrid} style={{ marginBottom: rankingEmbudo.length ? 14 : 0 }}>
              <div className={styles.stat}>
                <p className={styles.statValue}>{unidadesAtribuidas || '-'}</p>
                <p className={styles.statLabel}>Ventas atribuidas</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{recomendacionesTrazadasIds.size ? `${conversionRecomendacion}%` : '-'}</p>
                <p className={styles.statLabel}>Conversion rec.</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{feedbackVenta.length ? `${coberturaFeedback}%` : '-'}</p>
                <p className={styles.statLabel}>Feedback trazado</p>
              </div>
            </section>
            {rankingEmbudo.length > 0 && (
              <div className={styles.itemStack}>
                {rankingEmbudo.map(item => (
                  <article className={styles.itemCard} key={item.vino}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{item.vino}</h3>
                        <p className={styles.sectionText}>
                          {item.recomendaciones} recomendaciones · {item.ventas} ventas · {item.dudas} dudas · {item.incidencias} stock
                        </p>
                      </div>
                      <span className={styles.badge}>{item.conversion}%</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {(feedbackConContextoSala.length > 0 || importeVinoEstimado > 0) && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Venta registrada</h2>
              <p className={styles.panelSub}>Lectura comercial con ventas KPI: TPV primero y sala solo cuando no duplica el mismo vino y dia.</p>
            </div>
            <span className={styles.badge}>{feedbackConContextoSala.length} senales</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.statsGrid} style={{ marginBottom: rankingCamareros.length ? 14 : 0 }}>
              <div className={styles.stat}>
                <p className={styles.statValue}>{importeVinoEstimado ? eur(importeVinoEstimado) : '-'}</p>
                <p className={styles.statLabel}>Importe vino</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{vinoPorComensal ? eur(vinoPorComensal, 2) : '-'}</p>
                <p className={styles.statLabel}>Vino/comensal</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{ticketMesaAsociado ? `${pesoVinoSobreTicket}%` : '-'}</p>
                <p className={styles.statLabel}>Peso vino ticket</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{botellasVendidas}/{copasVendidas}</p>
                <p className={styles.statLabel}>Botellas/copas</p>
              </div>
            </section>
            {rankingCamareros.length > 0 && (
              <div className={styles.itemStack}>
                {rankingCamareros.map(item => (
                  <article className={styles.itemCard} key={item.nombre}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow} style={{ marginBottom: 5 }}>Formacion de sala</p>
                        <h3 className={styles.sectionTitle}>{item.nombre}</h3>
                        <p className={styles.sectionText}>
                          {item.ventas} uds. - {eur(item.importe)} - {item.tasaVenta}% venta - {item.tasaDuda}% dudas
                        </p>
                        <p className={styles.sectionText}>
                          {item.vinoComensal ? `${eur(item.vinoComensal, 2)} vino/comensal` : 'Sin comensales'} - {item.botellas} botellas - {item.copas} copas
                        </p>
                        {item.mejorPareja && (
                          <p className={styles.sectionText}>
                            Fuerte: {item.mejorPareja.vino} con {item.mejorPareja.plato}
                          </p>
                        )}
                        <p className={styles.sectionText}>{item.accion}</p>
                      </div>
                      <span className={styles.badge}>{item.stock ? `${item.stock} stock` : `${item.copasPct}% copa`}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {(ventasEconomicas.length > 0 || beneficioNoConvertido > 0 || oportunidadesRentables.length > 0) && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Rentabilidad de carta</h2>
              <p className={styles.panelSub}>Cruza ventas KPI, recomendaciones, coste, PVP y stock para decidir que empujar sin romper el maridaje.</p>
            </div>
            <span className={styles.badge}>{ventasEconomicasConCoste.length} con coste</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.statsGrid} style={{ marginBottom: 14 }}>
              <StatCard
                value={beneficioBrutoAtribuido ? eur(beneficioBrutoAtribuido) : '-'}
                label="Beneficio bruto"
                hint="Ingresos netos menos coste."
                info="Se calcula con ventas KPI que tienen precio y coste: precio neto de venta menos coste neto de compra, multiplicado por unidades."
              />
              <StatCard
                value={margenBrutoAtribuidoPct ? `${margenBrutoAtribuidoPct}%` : '-'}
                label="Margen medio"
                hint="Solo ventas con coste."
                info="Porcentaje medio de beneficio sobre ingreso neto en las ventas que permiten calcular margen. Si faltan costes, puede quedar incompleto."
              />
              <StatCard
                value={beneficioNoConvertido ? eur(beneficioNoConvertido) : '-'}
                label="Beneficio no convertido"
                hint="Potencial perdido."
                info="Beneficio estimado de recomendaciones o situaciones que no acabaron en venta por falta de stock, dudas, rechazo o pendiente de cierre."
              />
              <StatCard
                value={ventasSinCoste || '-'}
                label="Ventas sin coste"
                hint="Dato a completar."
                info="Numero de ventas donde sabemos que hubo movimiento, pero falta coste de compra para calcular beneficio y margen defendible."
              />
            </section>

            <section className={styles.gridTwo}>
              <div>
                <div className={styles.sectionHead}>
                  <div>
                    <h3 className={styles.sectionTitle}>Vinos que dejan dinero</h3>
                    <p className={styles.sectionText}>Ranking por beneficio bruto atribuido a ventas KPI.</p>
                  </div>
                </div>
                {rankingRentabilidadCarta.length ? (
                  <div className={styles.itemStack}>
                    {rankingRentabilidadCarta.map(item => (
                      <article className={styles.itemCard} key={`rent-${item.clave}`}>
                        <div className={styles.sectionHead} style={{ margin: 0 }}>
                          <div>
                            <p className={styles.eyebrow}>{item.bodega || 'Rentabilidad'}</p>
                            <h3 className={styles.sectionTitle}>{item.vino}</h3>
                            <p className={styles.sectionText}>
                              {item.ventas} uds. - {eur(item.ingresos)} venta - {eur(item.beneficio)} beneficio bruto
                            </p>
                            <p className={styles.sectionText}>
                              {item.recomendaciones} rec. - {item.conversion}% conversion - stock {item.stock || 0}
                            </p>
                          </div>
                          <span className={styles.badge}>{item.margenPct ? `${item.margenPct}%` : 'sin coste'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>Registra coste de compra y ventas para calcular beneficio por vino.</div>
                )}
              </div>

              <div>
                <div className={styles.sectionHead}>
                  <div>
                    <h3 className={styles.sectionTitle}>Accion rentable</h3>
                    <p className={styles.sectionText}>Siguiente movimiento comercial respetando el encaje gastronomico.</p>
                  </div>
                </div>
                {oportunidadesRentables.length ? (
                  <div className={styles.itemStack}>
                    {oportunidadesRentables.map(item => (
                      <article className={styles.itemCard} key={`opp-rent-${item.clave}`}>
                        <div className={styles.sectionHead} style={{ margin: 0 }}>
                          <div>
                            <p className={styles.eyebrow}>
                              {item.stockFallos ? 'Stock' : item.margenAlto ? 'Margen' : 'Medicion'}
                            </p>
                            <h3 className={styles.sectionTitle}>{item.vino}</h3>
                            <p className={styles.sectionText}>
                              {item.recomendaciones} rec. - {item.ventasEventos} ventas - {item.pendientes} sin validar
                            </p>
                            <p className={styles.sectionText}>{item.accion}</p>
                          </div>
                          <span className={styles.badge}>{item.perdida ? eur(item.perdida) : `${item.beneficioBotella.toFixed(0)} EUR`}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>Sin accion economica clara en este periodo.</div>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      {paresOportunidad.length > 0 && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Oportunidades de venta</h2>
              <p className={styles.panelSub}>Cruza plato o consulta con vino recomendado, resultado de sala e importe registrado.</p>
            </div>
            <span className={styles.badge}>{platosConSenal} platos</span>
          </div>
          <div className={styles.panelBody}>
            <section className={styles.statsGrid} style={{ marginBottom: 14 }}>
              <div className={styles.stat}>
                <p className={styles.statValue}>{paresOportunidad.length}</p>
                <p className={styles.statLabel}>Pares plato-vino</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{parejasQueFuncionan || '-'}</p>
                <p className={styles.statLabel}>Funcionan</p>
              </div>
              <div className={styles.stat}>
                <p className={styles.statValue}>{alertasOportunidad.length || '-'}</p>
                <p className={styles.statLabel}>A revisar</p>
              </div>
            </section>

            <section className={styles.gridTwo}>
              <div>
                <div className={styles.sectionHead}>
                  <div>
                    <h3 className={styles.sectionTitle}>Mejores parejas</h3>
                    <p className={styles.sectionText}>Lo que ya convierte o empieza a dar senal positiva en sala.</p>
                  </div>
                </div>
                <div className={styles.itemStack}>
                  {mejoresPlatoVino.map(item => (
                    <article className={styles.itemCard} key={`mejor-${item.clave}`}>
                      <div className={styles.sectionHead} style={{ margin: 0 }}>
                        <div>
                          <p className={styles.eyebrow}>{item.plato}</p>
                          <h3 className={styles.sectionTitle}>{item.vino}</h3>
                          <p className={styles.sectionText}>
                            {item.recomendaciones} rec. - {item.ventas} uds. - {item.dudas} dudas - {item.incidencias} stock
                          </p>
                          <p className={styles.sectionText}>{item.accion}</p>
                        </div>
                        <span className={styles.badge}>{item.conversionLabel}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <div className={styles.sectionHead}>
                  <div>
                    <h3 className={styles.sectionTitle}>Alertas comerciales</h3>
                    <p className={styles.sectionText}>Recomendaciones que no convierten, generan dudas o chocan con stock.</p>
                  </div>
                </div>
                {alertasOportunidad.length ? (
                  <div className={styles.itemStack}>
                    {alertasOportunidad.map(item => (
                      <article className={styles.itemCard} key={`alerta-${item.clave}`}>
                        <div className={styles.sectionHead} style={{ margin: 0 }}>
                          <div>
                            <p className={styles.eyebrow}>{item.tipo} - {item.plato}</p>
                            <h3 className={styles.sectionTitle}>{item.vino}</h3>
                            <p className={styles.sectionText}>
                              {item.recomendaciones} rec. - {item.ventas} uds. - {item.dudas} dudas - {item.incidencias} stock
                            </p>
                            <p className={styles.sectionText}>{item.accion}</p>
                          </div>
                          <span className={styles.badge}>{item.conversionLabel}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>Sin alertas comerciales en este periodo.</div>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Lectura ejecutiva</h2>
            <p className={styles.panelSub}>No solo cuenta eventos: convierte la actividad en la siguiente decisión.</p>
            {mensajeInforme && <p className={styles.tiny}>{mensajeInforme}</p>}
          </div>
          <div className={styles.actionRow}>
            <button type="button" className={styles.primary} onClick={copiarInforme}>Copiar informe</button>
            <a className={styles.secondary} href={accionPrincipal.href}>Abrir acción</a>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.itemStack}>
            {accionesInforme.slice(0, 4).map(item => (
              <a key={item.titulo} href={item.href} className={styles.itemCard}>
                <p className={styles.eyebrow}>Decisión</p>
                <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                <p className={styles.sectionText}>{item.texto}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {topVinosVendidos.length > 0 && (
        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Top vinos vendidos</h2>
              <p className={styles.panelSub}>Ventas KPI con TPV prioritario e inventario en el periodo seleccionado.</p>
            </div>
            <span className={styles.badge}>{topVinosVendidos.reduce((s, [, n]) => s + n, 0)} ventas</span>
          </div>
          <div className={styles.panelBody}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topVinosVendidos.map(([vino, ventas], i) => (
                <div key={vino}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 500, color: '#171416', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {i === 0 ? 'Principal: ' : ''}{vino}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#766e64', flexShrink: 0, marginLeft: 8 }}>
                      {ventas} {ventas === 1 ? 'venta' : 'ventas'}
                    </span>
                  </div>
                  <div style={{ height: 8, background: '#f0ebe4', borderRadius: 4 }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.round((ventas / maxVentas) * 100)}%`,
                      background: i === 0 ? '#7B2D2D' : i < 3 ? '#bfa984' : '#d9cfc6',
                      borderRadius: 4,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className={styles.gridTwo}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Vinos más recomendados</h2>
              <p className={styles.panelSub}>Cuenta las recomendaciones generadas en carta pública y modo camarero.</p>
            </div>
            <span className={styles.badge}>{vinosRecomendados.length}</span>
          </div>
          <div className={styles.panelBody}>
            {vinosRecomendados.length ? (
              <div className={styles.itemStack}>
                {vinosRecomendados.map(([vino, datos], index) => (
                  <article className={styles.itemCard} key={vino}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow} style={{ marginBottom: 5 }}>#{index + 1}</p>
                        <h3 className={styles.sectionTitle}>{vino}</h3>
                        <p className={styles.sectionText}>Cliente {datos.cliente} · Camarero {datos.camarero}</p>
                      </div>
                      <span className={styles.badge}>{datos.total}x</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aún no hay recomendaciones registradas.</div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Feedback del camarero</h2>
              <p className={styles.panelSub}>Vinos que se aceptan, se rechazan o se cambian en mesa.</p>
            </div>
            <span className={styles.badge}>{rendimientoVinos.length}</span>
          </div>
          <div className={styles.panelBody}>
            {rendimientoVinos.length ? (
              <div className={styles.itemStack}>
                {rendimientoVinos.map(([vino, datos]) => (
                  <article className={styles.itemCard} key={vino}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino}</h3>
                        <p className={styles.sectionText}>{datos.no_convence} no convenció · {datos.otra} pidió otra cosa</p>
                      </div>
                      <span className={styles.badge}>{datos.vendida}/{datos.total} ventas</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Sin feedback de venta todavía.</div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Platos más consultados</h2>
              <p className={styles.panelSub}>Lo que más aparece cuando el cliente o sala pide maridaje.</p>
            </div>
            <span className={styles.badge}>{topPlatos.length}</span>
          </div>
          <div className={styles.panelBody}>
            {topPlatos.length ? (
              <div className={styles.itemStack}>
                {topPlatos.map(([plato, veces], index) => (
                  <article className={styles.itemCard} key={plato}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow} style={{ marginBottom: 5 }}>#{index + 1}</p>
                        <h3 className={styles.sectionTitle}>{plato}</h3>
                      </div>
                      <span className={styles.badge}>{veces}x</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aún no hay consultas suficientes.</div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Actividad reciente</h2>
            <p className={styles.panelSub}>Últimos movimientos registrados en carta, maridaje y venta.</p>
          </div>
          <span className={styles.badge}>{statsFiltradas.length}</span>
        </div>
        <div className={styles.panelBody}>
          {statsFiltradas.length ? (
            <div className={styles.itemStack}>
              {statsFiltradas.slice(0, 10).map(s => (
                <article className={styles.itemCard} key={s.id}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className={styles.dot}
                        style={{ background: s.tipo === 'escaneo' ? '#4A8C6F' : s.tipo === 'venta' ? '#bfa984' : s.tipo === 'recomendacion' ? '#3266a8' : '#531827' }}
                      />
                      <p className={styles.sectionTitle}>
                        {s.tipo === 'escaneo'
                          ? 'Escaneo de carta'
                          : s.tipo === 'venta'
                            ? `Venta sala: ${resumenVenta(s.detalle)}`
                            : s.tipo === 'recomendacion'
                              ? `Recomendado: ${leerJSON(s.detalle)?.vino || 'vino'}`
                              : `Maridaje: ${s.detalle?.substring(0, 46)}${s.detalle?.length > 46 ? '...' : ''}`}
                      </p>
                    </div>
                    <p className={styles.tiny}>
                      {new Date(s.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>Sin actividad aún.</div>
          )}
        </div>
      </section>
    </ModuleShell>
    </FeatureGate>
  )
}
