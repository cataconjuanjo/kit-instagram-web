'use client'

import { useEffect, useMemo, useState } from 'react'
import { getEffectiveRestaurantEmail } from '../../demo'
import { actividadRealDesdeISO } from '../../lib/actividadReal'
import {
  SELECT_CLIENT_ESTADISTICA_DASHBOARD,
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
  SELECT_CLIENT_VINO_DASHBOARD,
} from '../../lib/clientSupabaseSelects'
import { BY_THE_GLASS_REFERENCE, POSITIONING_MARKUP_REFERENCE, beneficioBruto, costeNetoCompra, margenBrutoPct, margenObjetivoContextual, numero, precioCopaObjetivo, precioNetoVenta, redondear, anadirIva, copasVendibles } from '../../lib/wineEconomics'
import { esPerfilBodega } from '../../lib/plans'
import { priorizarVentas, esVentaTPV } from '../../lib/salesPriority'
import { supabase } from '../../supabase'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import styles from '../module.module.css'

const FORMULA_VERSION = 'profit-simulator-v2-contextual-margin'

const ESCENARIOS = {
  prudente: {
    label: 'Prudente',
    margenObjetivo: 60,
    reduccionCostePct: 5,
    empujeUnidadesMes: 1,
    descripcion: 'Pocas acciones, bajo riesgo y solo cambios faciles de defender.',
  },
  equilibrado: {
    label: 'Equilibrado',
    margenObjetivo: 63,
    reduccionCostePct: 8,
    empujeUnidadesMes: 2,
    descripcion: 'Mejora margen, copa y stock sin redisenar toda la carta.',
  },
  ambicioso: {
    label: 'Ambicioso',
    margenObjetivo: 66,
    reduccionCostePct: 12,
    empujeUnidadesMes: 3,
    descripcion: 'Mas palanca comercial, mas impacto y mas necesidad de seguimiento.',
  },
}

function eur(valor, decimales = 0) {
  return `${numero(valor).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} EUR`
}

function pct(valor) {
  return `${Math.round(numero(valor))}%`
}

function normalizar(valor = '') {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function leerDetalle(detalle) {
  if (!detalle) return null
  if (typeof detalle === 'object') return detalle
  try {
    return JSON.parse(detalle)
  } catch {
    return null
  }
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

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

function pvpParaMargen(coste, margenObjetivoPct) {
  const costeNeto = costeNetoCompra(coste)
  const objetivo = Math.min(90, Math.max(5, numero(margenObjetivoPct))) / 100
  if (!costeNeto || objetivo >= 1) return 0
  return redondear(anadirIva(costeNeto / (1 - objetivo)), 2)
}

function esVinoEspecialParaCopa(vino) {
  const texto = normalizar(`${vino?.nombre || ''} ${vino?.bodega || ''}`)
  return /\b(fino|manzanilla|amontillado|oloroso|palo cortado|pedro ximenez|px|generoso|jerez|sauternes|tokaji|moscatel)\b/.test(texto)
}

function evaluarCandidatoCopa({ vino, coste, precio, precioCopa, stock, stockMinimo, unidadesPeriodo, recomendacionesVino }) {
  if (precioCopa || coste <= 0 || precio <= 0) return null
  const especial = esVinoEspecialParaCopa(vino)
  const stockNecesario = especial ? 3 : 5
  const precioMaximoBotella = especial ? 95 : 58
  const costeMaximoCompra = especial ? 38 : 24
  const copaMaxima = especial ? 18 : 14
  const ratioMaximo = especial ? 0.26 : 0.24

  if (stock < stockNecesario) return null
  if (stockMinimo > 0 && stock <= stockMinimo + 1) return null
  if (unidadesPeriodo < 2 && recomendacionesVino < 4) return null
  if (precio > precioMaximoBotella || coste > costeMaximoCompra) return null

  const copaObjetivo = precioCopaObjetivo(coste)
  if (!copaObjetivo || copaObjetivo > copaMaxima) return null
  if (copaObjetivo / precio > ratioMaximo) return null

  return { copaObjetivo, especial }
}

function confianzaPorDatos({ unidadesPeriodo, recomendaciones, tieneTPV }) {
  if (tieneTPV && unidadesPeriodo >= 5) return 'alta'
  if (unidadesPeriodo >= 3 || recomendaciones >= 4) return 'media'
  return 'baja'
}

function pesoConfianza(valor) {
  return valor === 'alta' ? 3 : valor === 'media' ? 2 : 1
}

function confianzaGlobal(items) {
  if (!items.length) return 'baja'
  const media = items.reduce((sum, item) => sum + pesoConfianza(item.confianza), 0) / items.length
  if (media >= 2.55) return 'alta'
  if (media >= 1.75) return 'media'
  return 'baja'
}

function itemBase(vino, data) {
  return {
    vino_id: vino?.id || null,
    vino: vino?.nombre || 'Vino sin nombre',
    bodega: vino?.bodega || '',
    href: data.href || '/dashboard/simulador',
    impacto_margen: redondear(data.impactoAnual, 2),
    impacto_capital: redondear(data.impactoCapital, 2),
    impacto_stock: redondear(data.impactoStock, 2),
    impacto_ticket: redondear(data.impactoTicket, 2),
    formula_version: FORMULA_VERSION,
    estado: 'propuesto',
    ...data,
    input: {
      ...(data.input || {}),
      vino_id: vino?.id || null,
      vino: vino?.nombre || null,
      precio_botella_actual: numero(vino?.precio_botella),
      precio_copa_actual: numero(vino?.precio_copa),
      coste_compra_actual: numero(vino?.coste_compra),
      stock_actual: numero(vino?.stock),
      stock_minimo_actual: numero(vino?.stock_minimo),
    },
  }
}

function generarSimulacion({ vinos, stats, escenario, restaurante }) {
  const cfg = ESCENARIOS[escenario] || ESCENARIOS.equilibrado
  const activos = (vinos || []).filter(vino => vino.activo !== false)
  const ventasStats = (stats || []).filter(item => item.tipo === 'venta')
  const recomendaciones = (stats || []).filter(item => item.tipo === 'recomendacion').map(item => leerDetalle(item.detalle)).filter(Boolean)
  const lecturaVentas = priorizarVentas(ventasStats)
  const ventas = lecturaVentas.detalleVentasKpi
  const tieneTPV = ventas.some(item => esVentaTPV(item))

  const fechas = (stats || []).map(item => new Date(item.created_at).getTime()).filter(Boolean)
  const minFecha = fechas.length ? Math.min(...fechas) : Date.now()
  const maxFecha = fechas.length ? Math.max(...fechas) : Date.now()
  const dias = Math.max(30, Math.ceil((maxFecha - minFecha) / 86400000) || 30)

  const ventasPorId = {}
  const ventasPorNombre = {}
  ventas.forEach(item => {
    const cantidad = Math.max(1, numero(item.cantidad) || 1)
    if (item.vino_id) ventasPorId[String(item.vino_id)] = (ventasPorId[String(item.vino_id)] || 0) + cantidad
    if (item.vino) ventasPorNombre[normalizar(item.vino)] = (ventasPorNombre[normalizar(item.vino)] || 0) + cantidad
  })

  const recomendacionesPorId = {}
  const recomendacionesPorNombre = {}
  recomendaciones.forEach(item => {
    if (item.vino_id) recomendacionesPorId[String(item.vino_id)] = (recomendacionesPorId[String(item.vino_id)] || 0) + 1
    if (item.vino) recomendacionesPorNombre[normalizar(item.vino)] = (recomendacionesPorNombre[normalizar(item.vino)] || 0) + 1
  })

  const items = []

  activos.forEach(vino => {
    const coste = numero(vino.coste_compra)
    const precio = numero(vino.precio_botella)
    const precioCopa = numero(vino.precio_copa)
    const stock = numero(vino.stock)
    const stockMinimo = numero(vino.stock_minimo)
    const unidadesPeriodo = ventasPorId[String(vino.id)] || ventasPorNombre[normalizar(vino.nombre)] || 0
    const recomendacionesVino = recomendacionesPorId[String(vino.id)] || recomendacionesPorNombre[normalizar(vino.nombre)] || 0
    const unidadesMesBase = unidadesPeriodo > 0
      ? Math.max(0.25, (unidadesPeriodo / dias) * 30)
      : Math.min(cfg.empujeUnidadesMes, recomendacionesVino * 0.25)
    const unidadesMes = redondear(unidadesMesBase, 2)
    const confianza = confianzaPorDatos({ unidadesPeriodo, recomendaciones: recomendacionesVino, tieneTPV })

    if (coste > 0 && precio > 0) {
      const margenContextual = margenObjetivoContextual(cfg.margenObjetivo, coste, restaurante)
      const margenActual = margenBrutoPct(precio, coste)
      const beneficioActual = beneficioBruto(precio, coste)
      const pvpObjetivo = pvpParaMargen(coste, margenContextual.objetivo)
      const beneficioObjetivo = beneficioBruto(pvpObjetivo, coste)
      const deltaPrecioPct = precio ? ((pvpObjetivo - precio) / precio) * 100 : 0
      const deltaBeneficio = beneficioObjetivo - beneficioActual

      if (unidadesMes > 0 && margenActual > 0 && margenActual < margenContextual.objetivo - 4 && deltaBeneficio > 0.5 && deltaPrecioPct <= 28) {
        const impactoMensual = deltaBeneficio * unidadesMes
        items.push(itemBase(vino, {
          tipo: 'pvp_botella',
          titulo: 'Ajustar PVP botella',
          detalle: `${vino.nombre}: margen ${pct(margenActual)} -> ${pct(margenContextual.objetivo)} con PVP objetivo ${eur(pvpObjetivo, 0)}. Objetivo ajustado por posicionamiento y coste.`,
          accion: 'Subir PVP solo si el posicionamiento y el mercado lo sostienen; validar con sala antes de aplicar.',
          href: '/dashboard/precios',
          impactoMensual,
          impactoAnual: impactoMensual * 12,
          impactoCapital: 0,
          impactoStock: 0,
          impactoTicket: (pvpObjetivo - precio) * unidadesMes,
          riesgo: deltaPrecioPct > 15 ? 'medio' : 'bajo',
          confianza,
          input: {
            margen_actual_pct: margenActual,
            margen_base_pct: cfg.margenObjetivo,
            margen_objetivo_pct: margenContextual.objetivo,
            pvp_objetivo: pvpObjetivo,
            unidades_mes: unidadesMes,
            contexto_margen: margenContextual,
          },
        }))
      }

      if (unidadesMes > 0.5 && margenActual > 0 && margenActual < 55) {
        const costeNuevo = redondear(coste * (1 - cfg.reduccionCostePct / 100), 2)
        const mejora = beneficioBruto(precio, costeNuevo) - beneficioActual
        if (mejora > 0.25) {
          const impactoMensual = mejora * unidadesMes
          items.push(itemBase(vino, {
            tipo: 'renegociar_coste',
            titulo: 'Renegociar coste',
            detalle: `${vino.nombre}: reducir coste ${cfg.reduccionCostePct}% mejoraria ${eur(mejora, 2)} por botella.`,
            accion: 'Negociar con proveedor o buscar equivalente gastronomico con mejor coste.',
            href: '/dashboard/bodega',
            impactoMensual,
            impactoAnual: impactoMensual * 12,
            impactoCapital: stock * (coste - costeNuevo),
            impactoStock: 0,
            impactoTicket: 0,
            riesgo: 'bajo',
            confianza,
            input: { coste_actual: coste, coste_objetivo: costeNuevo, unidades_mes: unidadesMes },
          }))
        }
      }
    }

    const candidatoCopa = evaluarCandidatoCopa({ vino, coste, precio, precioCopa, stock, stockMinimo, unidadesPeriodo, recomendacionesVino })
    if (candidatoCopa) {
      const { copaObjetivo } = candidatoCopa
      const beneficioBotella = beneficioBruto(precio, coste)
      const beneficioPorCopas = redondear((precioNetoVenta(copaObjetivo) * copasVendibles()) - costeNetoCompra(coste), 2)
      const mejora = beneficioPorCopas - beneficioBotella
      if (mejora > 1) {
        const botellasMes = Math.max(0.5, Math.min(1.25, unidadesMes || recomendacionesVino * 0.2))
        const impactoMensual = mejora * botellasMes
        items.push(itemBase(vino, {
          tipo: 'activar_copa',
          titulo: 'Valorar servicio por copa',
          detalle: `${vino.nombre}: copa orientativa ${eur(copaObjetivo, 2)} con stock y precio dentro de una banda defendible. Mejora estimada por botella abierta: ${eur(mejora, 2)}.`,
          accion: 'Probar solo en servicio controlado, con rotacion prevista y cierre semanal de merma.',
          href: '/dashboard/precios',
          impactoMensual,
          impactoAnual: impactoMensual * 12,
          impactoCapital: 0,
          impactoStock: botellasMes,
          impactoTicket: copaObjetivo * copasVendibles() * botellasMes,
          riesgo: 'medio',
          confianza,
          input: {
            precio_copa_objetivo: copaObjetivo,
            beneficio_botella: beneficioBotella,
            beneficio_por_copas: beneficioPorCopas,
            botellas_mes: botellasMes,
            referencia_btg: BY_THE_GLASS_REFERENCE,
          },
        }))
      }
    }

    if (coste > 0 && precio > 0 && stockMinimo > 0 && stock <= stockMinimo && (unidadesPeriodo > 0 || recomendacionesVino > 0)) {
      const beneficio = beneficioBruto(precio, coste)
      const unidadesRecuperables = Math.max(1, Math.min(3, Math.ceil(unidadesMes || recomendacionesVino * 0.4)))
      items.push(itemBase(vino, {
        tipo: 'reponer_stock',
        titulo: 'Reponer stock que frena venta',
        detalle: `${vino.nombre}: stock ${stock} con minimo ${stockMinimo}; hay ventas o recomendaciones recientes.`,
        accion: 'Reponer o preparar sustituto equivalente antes del servicio.',
        href: '/dashboard/bodega#pedido',
        impactoMensual: beneficio * unidadesRecuperables,
        impactoAnual: beneficio * unidadesRecuperables * 12,
        impactoCapital: -(costeNetoCompra(coste) * unidadesRecuperables),
        impactoStock: unidadesRecuperables,
        impactoTicket: precio * unidadesRecuperables,
        riesgo: 'bajo',
        confianza,
        input: { unidades_recuperables_mes: unidadesRecuperables, beneficio_unitario: beneficio },
      }))
    }

    if (coste > 0 && stock >= Math.max(8, stockMinimo * 3 || 8) && unidadesPeriodo === 0) {
      const objetivoStock = Math.max(stockMinimo || 2, 2)
      const liberable = Math.max(0, stock - objetivoStock)
      if (liberable > 0) {
        items.push(itemBase(vino, {
          tipo: 'reducir_stock',
          titulo: 'Reducir stock objetivo',
          detalle: `${vino.nombre}: ${stock} uds. sin ventas KPI en el periodo; objetivo sugerido ${objetivoStock}.`,
          accion: 'No comprar mas y mover excedente solo si el maridaje encaja; liberar capital sin forzar venta.',
          href: '/dashboard/bodega',
          impactoMensual: 0,
          impactoAnual: 0,
          impactoCapital: liberable * costeNetoCompra(coste),
          impactoStock: -liberable,
          impactoTicket: 0,
          riesgo: 'bajo',
          confianza: recomendacionesVino > 0 ? 'media' : 'baja',
          input: { stock_actual: stock, stock_objetivo: objetivoStock, unidades_liberables: liberable },
        }))
      }
    }

    if (coste > 0 && precio > 0 && stock > Math.max(1, stockMinimo) && recomendacionesVino >= 2 && unidadesPeriodo <= 1) {
      const margen = margenBrutoPct(precio, coste)
      const beneficio = beneficioBruto(precio, coste)
      const margenContextual = margenObjetivoContextual(cfg.margenObjetivo, coste, restaurante)
      if (margen >= margenContextual.objetivo) {
        const unidadesExtra = Math.min(cfg.empujeUnidadesMes, recomendacionesVino * 0.35)
        const impactoMensual = beneficio * unidadesExtra
        items.push(itemBase(vino, {
          tipo: 'mix_recomendacion',
          titulo: 'Cambiar mix de recomendacion',
          detalle: `${vino.nombre}: ${recomendacionesVino} recomendaciones, poco cierre y margen ${pct(margen)}.`,
          accion: 'Usarlo como opcion preferente solo en platos donde ya sea gastronomicamente equivalente.',
          href: '/dashboard/sala',
          impactoMensual,
          impactoAnual: impactoMensual * 12,
          impactoCapital: 0,
          impactoStock: unidadesExtra,
          impactoTicket: precio * unidadesExtra,
          riesgo: 'medio',
          confianza,
          input: { recomendaciones: recomendacionesVino, unidades_extra_mes: unidadesExtra, margen_pct: margen, contexto_margen: margenContextual },
        }))
      }
    }
  })

  const pesoTipo = {
    reponer_stock: 7,
    pvp_botella: 6,
    renegociar_coste: 5,
    activar_copa: 4,
    mix_recomendacion: 3,
    reducir_stock: 2,
  }

  const ordenados = items
    .filter(item => item.impacto_margen > 0 || item.impacto_capital > 0)
    .sort((a, b) =>
      (b.impacto_margen + b.impacto_capital * 0.2) - (a.impacto_margen + a.impacto_capital * 0.2) ||
      (pesoTipo[b.tipo] || 0) - (pesoTipo[a.tipo] || 0)
    )
    .slice(0, 12)

  return {
    items: ordenados,
    ventasKpi: lecturaVentas.unidadesKpi,
    ventasTPV: lecturaVentas.unidadesTPV,
    ventasSala: lecturaVentas.unidadesSalaKpi,
    dias,
    tieneTPV,
    posicionamiento: margenObjetivoContextual(cfg.margenObjetivo, 0, restaurante).posicionamiento,
  }
}

export default function SimuladorRentabilidad() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [stats, setStats] = useState([])
  const [escenario, setEscenario] = useState('equilibrado')
  const [guardados, setGuardados] = useState([])
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [apiDisponible, setApiDisponible] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) {
        window.location.href = '/login'
        return
      }

      const queryRestaurante = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()

      if (rest) {
        setRestaurante(rest)
        const desdeActividad = actividadRealDesdeISO(rest)
        let statsQuery = supabase
          .from('estadisticas')
          .select('id, tipo, detalle, created_at')
          .eq('restaurante_id', rest.id)
          .in('tipo', ['venta', 'recomendacion'])
          .order('created_at', { ascending: false })
          .limit(1500)
        if (desdeActividad) statsQuery = statsQuery.gte('created_at', desdeActividad)

        const [{ data: vinosData }, { data: statsData }] = await Promise.all([
          supabase
            .from('vinos')
            .select('id, nombre, bodega, precio_botella, precio_copa, coste_compra, stock, stock_minimo, activo')
            .eq('restaurante_id', rest.id),
          statsQuery,
        ])
        setVinos(vinosData || [])
        setStats(statsData || [])
        await cargarGuardados(rest.id)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarGuardados(restauranteId) {
    const token = await tokenSesion()
    if (!token) return
    try {
      const query = new URLSearchParams({ restaurante_id: restauranteId })
      const res = await fetch(`/api/profit-scenarios?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.status === 409) {
        setApiDisponible(false)
        return
      }
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar escenarios.')
      setGuardados(data.escenarios || [])
      setApiDisponible(true)
    } catch {
      setApiDisponible(false)
    }
  }

  const simulacion = useMemo(() => generarSimulacion({ vinos, stats, escenario, restaurante }), [vinos, stats, escenario, restaurante])
  const itemsTop = simulacion.items.slice(0, 5)
  const impactoAnual = redondear(itemsTop.reduce((sum, item) => sum + numero(item.impacto_margen), 0), 2)
  const impactoMensual = redondear(itemsTop.reduce((sum, item) => sum + numero(item.impactoMensual), 0), 2)
  const capitalLiberable = redondear(itemsTop.reduce((sum, item) => sum + numero(item.impacto_capital), 0), 2)
  const stockImpacto = redondear(itemsTop.reduce((sum, item) => sum + numero(item.impacto_stock), 0), 2)
  const ticketImpacto = redondear(itemsTop.reduce((sum, item) => sum + numero(item.impacto_ticket), 0), 2)
  const confianza = confianzaGlobal(itemsTop)
  const cfg = ESCENARIOS[escenario]
  const perfilBodega = esPerfilBodega(restaurante)

  const informe = [
    `Simulador de rentabilidad - ${restaurante?.nombre || 'Restaurante'}`,
    `Escenario: ${cfg.label}`,
    '',
    `Impacto anual prudente: ${eur(impactoAnual)}`,
    `Impacto mensual: ${eur(impactoMensual)}`,
    `Capital liberable / comprometido: ${eur(capitalLiberable)}`,
    `Confianza: ${confianza}`,
    '',
    `Criterio copa: Carta Viva solo propone copa en vinos con stock, demanda y precio defendibles. La referencia ${BY_THE_GLASS_REFERENCE.source} se usa como contexto economico, no como promesa ni como orden de abrir botellas.`,
    `Criterio posicionamiento: ${POSITIONING_MARKUP_REFERENCE.source} apunta que el mark-up depende del coste del vino, del ticket medio, del estilo fine dining y del efecto hotel. Perfil aplicado: ${simulacion.posicionamiento.label}${simulacion.posicionamiento.ticket ? `, ticket ${eur(simulacion.posicionamiento.ticket)}` : ''}.`,
    '',
    'Acciones:',
    ...(itemsTop.length
      ? itemsTop.map((item, index) => `${index + 1}. ${item.titulo}: ${item.vino}. ${item.accion} Impacto anual ${eur(item.impacto_margen)}.`)
      : ['1. Faltan coste, PVP, stock o ventas para defender una accion.']),
  ].join('\n')

  async function copiarInforme() {
    await copiarTexto(informe)
    setMensaje('Escenario copiado.')
    setTimeout(() => setMensaje(''), 1800)
  }

  async function guardarEscenario() {
    if (!restaurante?.id || !itemsTop.length) return
    const token = await tokenSesion()
    if (!token) {
      setMensaje('Inicia sesion para guardar escenarios.')
      return
    }
    setGuardando(true)
    setMensaje('')
    try {
      const res = await fetch('/api/profit-scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          nombre: `Escenario ${cfg.label}`,
          descripcion: cfg.descripcion,
          estado: 'propuesto',
          confianza,
          impacto_margen: impactoAnual,
          impacto_capital: capitalLiberable,
          impacto_stock: stockImpacto,
          impacto_ticket: ticketImpacto,
          input: {
            escenario,
            formula_version: FORMULA_VERSION,
            ventas_kpi: simulacion.ventasKpi,
            dias: simulacion.dias,
            posicionamiento_margen: simulacion.posicionamiento,
            referencia_posicionamiento: POSITIONING_MARKUP_REFERENCE,
          },
          items: itemsTop,
        }),
      })
      const data = await res.json()
      if (res.status === 409) {
        setApiDisponible(false)
        throw new Error(data.error || 'La base de datos todavia no permite guardar escenarios.')
      }
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el escenario.')
      setGuardados(data.escenarios || [])
      setApiDisponible(true)
      setMensaje('Escenario guardado.')
    } catch (error) {
      setMensaje(error.message || 'No se pudo guardar el escenario.')
    } finally {
      setGuardando(false)
    }
  }

  async function cambiarEstado(escenarioGuardado, estado) {
    const token = await tokenSesion()
    if (!token || !restaurante?.id) return
    setMensaje('')
    try {
      const res = await fetch('/api/profit-scenarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: escenarioGuardado.id, restaurante_id: restaurante.id, estado }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el escenario.')
      setGuardados(data.escenarios || [])
      setMensaje(`Escenario ${estado}.`)
      setTimeout(() => setMensaje(''), 1800)
    } catch (error) {
      setMensaje(error.message || 'No se pudo actualizar el escenario.')
    }
  }

  if (loading) return <LoadingState />
  if (!restaurante) return null

  return (
    <FeatureGate restaurante={restaurante} feature="precios_margenes" title="Simulador no incluido">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Fase 5"
        title="Simulador de rentabilidad"
        subtitle={perfilBodega
          ? 'Simula PVP, coste, stock y rotacion con criterio de bodega. La copa solo aparece cuando el precio y el stock son defendibles.'
          : 'Calcula antes de tocar la carta: PVP, copa, coste, stock y mix de recomendacion con impacto mensual, anual y capital.'}
        actions={
          <>
            <button type="button" className={styles.secondary} onClick={copiarInforme}>Copiar escenario</button>
            <button type="button" className={styles.primary} disabled={!itemsTop.length || guardando} onClick={guardarEscenario}>
              {guardando ? 'Guardando...' : 'Guardar escenario'}
            </button>
          </>
        }
        help={{
          title: 'Como decidir con el simulador',
          intro: perfilBodega
            ? 'No aplica cambios automaticamente. Convierte margen, stock y rotacion en decisiones que el sumiller puede revisar antes de tocar la bodega.'
            : 'No aplica cambios automaticamente. Convierte margen, stock y venta por copa en decisiones que el restaurante puede aprobar o descartar.',
          items: [
            { title: 'Impacto anual', text: 'Es una estimacion prudente basada en ventas KPI, recomendaciones y datos de margen disponibles.' },
            { title: 'Capital', text: 'Puede ser positivo si libera stock o negativo si exige comprar para recuperar venta.' },
            { title: 'Maridaje', text: 'El mix de recomendacion solo se propone como preferencia cuando el encaje gastronomico ya sea equivalente.' },
            { title: 'Copa controlada', text: 'La copa se propone solo si hay stock, rotacion o interes suficiente, y si el precio resultante cabe en una banda razonable de servicio.' },
            { title: 'Posicionamiento', text: 'El margen objetivo se ajusta por ticket medio, estilo de restaurante y banda de coste del vino. No todos los vinos ni todos los restaurantes defienden el mismo porcentaje.' },
          ],
        }}
      >
        <section className={styles.statsGrid}>
          <StatCard
            value={eur(impactoAnual)}
            label="Impacto anual"
            hint="Estimacion de las 5 acciones."
            info="Suma el impacto de margen anual de las principales acciones del escenario. Es una estimacion basada en ventas KPI, recomendaciones, coste, PVP y stock disponibles."
          />
          <StatCard
            value={eur(impactoMensual)}
            label="Impacto mensual"
            hint="Version mensual del escenario."
            info="Mismo calculo que impacto anual, llevado a un mes. Ayuda a decidir si la accion merece trabajo operativo inmediato."
          />
          <StatCard
            value={eur(capitalLiberable)}
            label="Capital neto"
            hint="Stock que libera o exige caja."
            info="Puede ser positivo si el escenario reduce stock parado, o negativo si requiere comprar para recuperar ventas perdidas por falta de stock."
          />
          <StatCard
            value={confianza}
            label="Confianza"
            hint="Calidad de la evidencia."
            info="Resume la fuerza de los datos usados: TPV, ventas KPI, recomendaciones y volumen del periodo. Alta no significa promesa; significa mejor base para decidir."
          />
          <StatCard
            value={simulacion.posicionamiento.label}
            label="Perfil de margen"
            hint="Contexto del restaurante."
            info="Ajusta el margen objetivo segun ticket medio, estilo de restaurante y banda de coste del vino. No todos los locales defienden el mismo margen."
          />
        </section>

        <section className={styles.panelDark} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Escenario</h2>
              <p className={styles.panelSub}>Elige cuanto quieres tensar margen, coste y empuje comercial.</p>
            </div>
            <span className={styles.badge}>{simulacion.ventasKpi} ventas KPI</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.gridThree}>
              {Object.entries(ESCENARIOS).map(([key, item]) => (
                <button
                  type="button"
                  key={key}
                  className={styles.itemCard}
                  onClick={() => setEscenario(key)}
                  style={{
                    textAlign: 'left',
                    borderColor: escenario === key ? '#bfa984' : undefined,
                    boxShadow: escenario === key ? '0 0 0 2px rgba(191,169,132,0.22)' : undefined,
                  }}
                >
                  <p className={styles.eyebrow}>{item.margenObjetivo}% margen objetivo</p>
                  <h3 className={styles.sectionTitle}>{item.label}</h3>
                  <p className={styles.sectionText}>{item.descripcion}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        {mensaje && <div className={styles.panel} style={{ marginBottom: 16, padding: 14 }}>{mensaje}</div>}
        {!apiDisponible && (
          <div className={styles.panel} style={{ marginBottom: 16, padding: 14, borderLeft: '3px solid #d4a636' }}>
            La base de datos aun no permite guardar escenarios. Puedes calcular el impacto y volver a guardar cuando este activa.
          </div>
        )}

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Base metodologica</p>
              <h2 className={styles.panelTitle}>{perfilBodega ? 'Copa solo cuando tiene sentido' : 'Por que miramos copa y botella juntas'}</h2>
              <p className={styles.panelSub}>
                {perfilBodega
                  ? 'El simulador no recomienda abrir cualquier vino por copa. Primero descarta referencias de alta gama, bajo stock, poca senal de demanda o precios de copa fuera de mercado; despues estima si una prueba controlada puede tener sentido.'
                  : `Un estudio del Journal of Wine Economics observo que los vinos tambien vendidos por copa tenian, de media y controlando coste, calidad y varietal, +${BY_THE_GLASS_REFERENCE.bottlePriceLiftPct}% de PVP botella, +${BY_THE_GLASS_REFERENCE.bottleMarginLiftPct}% de margen botella y cerca de +${BY_THE_GLASS_REFERENCE.markupLiftPct}% de markup. Carta Viva lo usa como referencia para simular escenarios, no como promesa automatica.`}
              </p>
            </div>
            <span className={styles.badge}>Referencia externa</span>
          </div>
        </section>

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Base metodologica</p>
              <h2 className={styles.panelTitle}>Por que el margen cambia segun restaurante</h2>
              <p className={styles.panelSub}>
                {POSITIONING_MARKUP_REFERENCE.source} senala que el mark-up se explica por la banda de coste del vino y por el posicionamiento: ticket medio, estilo fine dining y efecto hotel. En este escenario Carta Viva aplica el perfil {simulacion.posicionamiento.label.toLowerCase()}{simulacion.posicionamiento.ticket ? ` con ticket de referencia ${eur(simulacion.posicionamiento.ticket)}` : ''}, y ajusta cada vino por su coste para no tratar igual una entrada de carta que una botella premium.
              </p>
            </div>
            <span className={styles.badge}>Margen contextual</span>
          </div>
        </section>

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Las 5 acciones del escenario</h2>
              <p className={styles.panelSub}>La frase vendible: si hacemos estas acciones, el escenario {cfg.label.toLowerCase()} recupera {eur(impactoAnual)} al año.</p>
            </div>
            <span className={styles.badge}>{itemsTop.length} acciones</span>
          </div>
          <div className={styles.panelBody}>
            {itemsTop.length ? (
              <div className={styles.itemStack}>
                {itemsTop.map(item => (
                  <article className={styles.itemCard} key={`${item.tipo}-${item.vino_id || item.vino}`}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{item.tipo.replace(/_/g, ' ')}</p>
                        <h3 className={styles.sectionTitle}>{item.titulo}: {item.vino}</h3>
                        <p className={styles.sectionText}>{item.detalle}</p>
                        <p className={styles.sectionText}>{item.accion}</p>
                      </div>
                      <span className={styles.badge}>{item.impacto_margen ? eur(item.impacto_margen) : eur(item.impacto_capital)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Completa coste, PVP, stock o ventas para defender una accion rentable.</div>
            )}
          </div>
        </section>

        {simulacion.items.length > 5 && (
          <section className={styles.panel} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Otras palancas</h2>
                <p className={styles.panelSub}>No entran en el paquete principal, pero conviene vigilarlas.</p>
              </div>
              <span className={styles.badge}>{simulacion.items.length - 5}</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.gridTwo}>
                {simulacion.items.slice(5, 11).map(item => (
                  <article className={styles.itemCard} key={`extra-${item.tipo}-${item.vino_id || item.vino}`}>
                    <p className={styles.eyebrow}>{item.confianza} confianza</p>
                    <h3 className={styles.sectionTitle}>{item.vino}</h3>
                    <p className={styles.sectionText}>{item.titulo}. {item.accion}</p>
                    <p className={styles.sectionText}>Impacto anual {eur(item.impacto_margen)} · capital {eur(item.impacto_capital)}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Escenarios guardados</h2>
              <p className={styles.panelSub}>{perfilBodega ? 'Aplica o descarta solo cuando el sumiller haya validado la decision de bodega.' : 'Aplica o descarta solo cuando el restaurante haya decidido.'}</p>
            </div>
            <span className={styles.badge}>{guardados.length}</span>
          </div>
          <div className={styles.panelBody}>
            {guardados.length ? (
              <div className={styles.itemStack}>
                {guardados.map(item => (
                  <article className={styles.itemCard} key={item.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{item.estado} · {item.confianza}</p>
                        <h3 className={styles.sectionTitle}>{item.nombre}</h3>
                        <p className={styles.sectionText}>{item.descripcion || 'Escenario guardado desde el simulador.'}</p>
                        <p className={styles.sectionText}>Impacto {eur(item.impacto_margen)} · capital {eur(item.impacto_capital)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button type="button" className={styles.secondary} onClick={() => cambiarEstado(item, 'aplicado')}>Aplicar</button>
                        <button type="button" className={styles.ghost} onClick={() => cambiarEstado(item, 'descartado')}>Descartar</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aun no hay escenarios guardados. Guarda uno cuando quieras llevar una propuesta a gerencia.</div>
            )}
          </div>
        </section>
      </ModuleShell>
    </FeatureGate>
  )
}
