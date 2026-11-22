'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail, setAdminRestaurantEmail, setAdminRestaurantId } from '../../demo'
import {
  SELECT_CLIENT_ESTADISTICA_ADMIN,
  SELECT_CLIENT_PLATO_ADMIN,
  SELECT_CLIENT_PROPUESTA_ADMIN,
  SELECT_CLIENT_RESTAURANTE_ADMIN,
  SELECT_CLIENT_VINO_ADMIN,
} from '../../lib/clientSupabaseSelects'
import { isLocalWine, localTermsForRestaurant } from '../../lib/wineRegion'
import { analizarRestaurante as analizar } from '../../lib/analizarRestaurante'
import {
  calcPuntuacion,
  calcCapitalLiberable,
  calcAlertasCriticas,
  calcCandidatosCopa,
  describirFotos,
  seleccionarTareasMiDia,
  esExcluidoDeAgregado,
} from '../../lib/consultoriaMetricas'
import {
  ultimoContactoPorRestaurante,
  construirSenalesDeContacto,
  tareasMiDiaDesdeContactos,
  diasDesdeUltimoContacto,
} from '../../lib/consultorContactos'
import { agregarSeguimiento } from '../../lib/propuestasSeguimiento'
import AdminOverlay from '../components/AdminOverlay'


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
  return calcCapitalLiberable({
    snapshotOportunidad: informe.consultoriaFase1?.oportunidad?.snapshot || null,
    resumenEjecutivo: informe.ejecutivo?.resumen || null,
    metricas: informe.metricas || null,
  }).valor
}

function capitalRadarDetalle(informe) {
  return calcCapitalLiberable({
    snapshotOportunidad: informe.consultoriaFase1?.oportunidad?.snapshot || null,
    resumenEjecutivo: informe.ejecutivo?.resumen || null,
    metricas: informe.metricas || null,
  })
}

function alertasCriticasRadar(informe) {
  const conteoPersistido = (informe.ejecutivo && typeof informe.ejecutivo.resumen?.alertas_criticas === 'number')
    ? informe.ejecutivo.resumen.alertas_criticas
    : undefined
  return calcAlertasCriticas({
    conteoPersistido,
    alertasDb: informe.alertasAbiertas || null,
    analisis: informe,
  }).valor
}

function candidatosCopaRadar(informe) {
  return calcCandidatosCopa({
    snapshotCopa: informe.consultoriaFase1?.copa?.snapshot || null,
    resumenEjecutivo: informe.ejecutivo?.resumen || null,
    metricas: informe.metricas || null,
  }).valor
}

function puntuacionRadar(informe) {
  return calcPuntuacion(informe)
}

function semanalRadar(informe) {
  return informe.ejecutivo?.semanal || informe.semanal || null
}

function bloqueoSemanalPrincipal(informe) {
  return semanalRadar(informe)?.bloqueos?.[0] || null
}

function estadoEnvioSemanal(semanal) {
  const status = semanal?.delivery?.status
  if (status === 'sent') return 'Enviado'
  if (status === 'failed') return 'Fallido'
  if (status === 'disabled') return 'Pausado'
  if (status === 'pending') return 'Pendiente'
  if (status === 'draft') return 'Sin enviar'
  return 'Sin foto'
}

function claseEnvioSemanal(semanal) {
  const status = semanal?.delivery?.status
  if (status === 'sent') return 'is-ok'
  if (status === 'failed') return 'is-hot'
  if (status === 'disabled') return 'is-muted'
  return 'is-warning'
}

function etiquetaAutomatismo(status) {
  if (status === 'success') return 'OK'
  if (status === 'partial') return 'Parcial'
  if (status === 'failed') return 'Error'
  if (status === 'running') return 'En curso'
  if (status === 'skipped') return 'Omitido'
  return 'Sin dato'
}

function claseAutomatismo(status) {
  if (status === 'success') return 'is-ok'
  if (status === 'failed') return 'is-hot'
  if (status === 'partial' || status === 'running') return 'is-warning'
  return 'is-muted'
}

function claseCierreProducto(estado) {
  if (estado === 'listo' || estado === 'ok') return 'is-ok'
  if (estado === 'bloqueado' || estado === 'blocker') return 'is-hot'
  return 'is-warning'
}

function etiquetaCierreProducto(estado) {
  if (estado === 'listo') return 'Listo'
  if (estado === 'bloqueado') return 'Bloqueado'
  if (estado === 'ok') return 'OK'
  if (estado === 'blocker') return 'Bloqueo'
  if (estado === 'warning') return 'Aviso'
  return 'Casi'
}

function economicaRadar(informe) {
  return informe.ejecutivo?.economica || informe.economica || null
}

function claseDefensaEconomica(economica) {
  if (!economica?.tiene_foto || economica.estado === 'no_presentar') return 'is-hot'
  if (economica.estado === 'presentable') return 'is-ok'
  if (economica.estado === 'con_contexto') return 'is-warning'
  return 'is-muted'
}

function etiquetaDefensaEconomica(economica) {
  if (!economica?.tiene_foto) return 'Sin foto económica'
  return economica.estado_label || 'Sin dato'
}

function activacionRadar(informe) {
  if (!informe.metricas?.vinos) return { nivel: 0, label: 'Sin carta', accion: 'Cargar vinos' }
  if (!informe.metricas?.platos) return { nivel: 1, label: 'Sin platos', accion: 'Cargar platos' }
  if (!informe.metricas?.escaneos30) return { nivel: 2, label: 'Sin primer escaneo', accion: 'Probar y colocar QR' }
  if (!informe.metricas?.sommelier30) return { nivel: 3, label: 'Sin primer maridaje', accion: 'Probar recomendación' }
  return { nivel: 4, label: 'Activado', accion: 'Consolidar uso' }
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

export default function RadarConsultoria() {
  const [user, setUser] = useState(null)
  const [restaurantes, setRestaurantes] = useState([])
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [contactos, setContactos] = useState([])
  const [seguimientos, setSeguimientos] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [ticketDrafts, setTicketDrafts] = useState({})
  const [guardandoTicket, setGuardandoTicket] = useState('')
  const [ticketError, setTicketError] = useState('')
  const [loading, setLoading] = useState(true)
  const [favoritos, setFavoritos] = useState([])
  const [radarEjecutivo, setRadarEjecutivo] = useState(null)
  const [vistaRapida, setVistaRapida] = useState(null)
  const [recalcMasivo, setRecalcMasivo] = useState({ activo: false, total: 0, hechos: 0, ok: 0, error: 0, actual: null, resumen: null })

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
      const fetchAutenticado = (url) => token
        ? fetch(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(async res => res.ok ? res.json() : null)
            .catch(() => null)
        : Promise.resolve(null)
      const radarPromise = fetchAutenticado('/api/admin/radar-ejecutivo')
      const contactosPromise = fetchAutenticado('/api/admin/contactos')
      const seguimientoPromise = fetchAutenticado('/api/admin/propuestas-seguimiento')
      const [{ data: rests }, { data: vinosData }, { data: platosData }, { data: estadisticasData }, { data: propuestasData }, radarData, contactosData, seguimientoData] = await Promise.all([
        supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_ADMIN).order('nombre'),
        supabase.from('vinos').select(SELECT_CLIENT_VINO_ADMIN),
        supabase.from('platos').select(SELECT_CLIENT_PLATO_ADMIN),
        supabase.from('estadisticas').select(SELECT_CLIENT_ESTADISTICA_ADMIN).gte('created_at', desde),
        supabase.from('consultor_propuestas').select(SELECT_CLIENT_PROPUESTA_ADMIN).order('created_at', { ascending: false }),
        radarPromise,
        contactosPromise,
        seguimientoPromise,
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
      // Si la migración de fase K aún no está aplicada, el API devuelve
      // items: [] + pendiente_migracion. Trabajamos con lista vacía y
      // el Radar cae al proxy anterior; no revienta nada.
      setContactos(Array.isArray(contactosData?.items) ? contactosData.items : [])
      setSeguimientos(Array.isArray(seguimientoData?.items) ? seguimientoData.items : [])
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
    // No sobrescribimos score/prioridad con el motor: calcPuntuacion (helper
    // único) usa siempre el resultado de analizar(), y ficha y Radar llaman
    // a analizar() con los mismos datos → mismo número.
    return {
      ...base,
      ejecutivo,
      semanal: ejecutivo.semanal,
      economica: ejecutivo.economica,
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
    if (filtro === 'activacion') return activacionRadar(informe).nivel < 4
    if (filtro === 'semanal') {
      const semanal = semanalRadar(informe)
      return (semanal?.score || 0) >= 35 || (semanal?.kpis?.recuperable_semana || 0) > 0
    }
    if (filtro === 'envio') {
      const semanal = semanalRadar(informe)
      return !semanal?.periodo_key || ['draft', 'pending', 'failed'].includes(semanal.delivery?.status)
    }
    if (filtro === 'defensa') {
      const economica = economicaRadar(informe)
      return !economica?.tiene_foto || economica.estado === 'no_presentar' || economica.estado === 'con_contexto'
    }
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
    setTicketError('')
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
      setTicketError(error.message || 'No se pudo guardar el ticket medio.')
    } finally {
      setGuardandoTicket('')
    }
  }

  async function recalcularParaTodos() {
    const diana = informes.filter(informe => !esExcluidoDeAgregado(informe.restaurante))
    if (diana.length === 0) return
    setRecalcMasivo({ activo: true, total: diana.length, hechos: 0, ok: 0, error: 0, actual: null, resumen: null })
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''
    let ok = 0
    let error = 0
    for (let i = 0; i < diana.length; i++) {
      const informe = diana[i]
      setRecalcMasivo(prev => ({ ...prev, actual: informe.restaurante.nombre, hechos: i }))
      try {
        const res = await fetch('/api/admin/consultoria-fase1/recalcular', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ restaurante_id: informe.restaurante.id }),
        })
        if (res.ok) ok++
        else error++
      } catch { error++ }
    }
    setRecalcMasivo({ activo: false, total: diana.length, hechos: diana.length, ok, error, actual: null, resumen: { ok, error, total: diana.length } })
  }

  if (loading) {
    return <p className="admin-loading">Cargando radar</p>
  }

  // Para agregados (embudo, totales) excluimos restaurantes marcados como demo de agregado.
  // Las cards y listas del Radar siguen mostrando todos los informes.
  const informesAgregado = informes.filter(informe => !esExcluidoDeAgregado(informe.restaurante))

  // Mi día: hasta 5 tareas priorizadas. Fuentes:
  //  - propuestas 'interesa' abiertas, alertas críticas, costes bloqueantes (fase J).
  //  - contacto programado vencido, >14 días sin contacto (fase K).
  // Los dos últimos solo se añaden si la tabla consultor_contactos está
  // aplicada (si no, `contactos` llega vacío y no emiten tareas).
  const contextosMiDia = informes.map(informe => {
    const base = {
      restaurante: informe.restaurante,
      propuestasInteresan: (informe.propuestasAbiertas || []).filter(p => p.estado === 'interesa').length,
      alertasCriticas: alertasCriticasRadar(informe),
      capitalLiberable: capitalRadar(informe),
      costesBloqueantes: (informe.metricas?.sinCoste || 0) + (informe.metricas?.margenBajo || 0),
      isDemoAgregado: esExcluidoDeAgregado(informe.restaurante),
    }
    const propios = (contactos || []).filter(c => String(c.restaurante_id) === String(informe.restaurante.id))
    return construirSenalesDeContacto(base, propios)
  })
  const tareasPrincipales = seleccionarTareasMiDia(contextosMiDia, { limite: 5 })
  const tareasContacto = tareasMiDiaDesdeContactos(contextosMiDia)
  // Fusionar sin duplicar restaurante y respetar máximo 5.
  const yaIncluidos = new Set(tareasPrincipales.map(t => t.restaurante.id))
  const tareasMiDia = [
    ...tareasPrincipales,
    ...tareasContacto.filter(t => !yaIncluidos.has(t.restaurante.id)),
  ].slice(0, 5)

  const alta = informes.filter(i => i.prioridad === 'Alta').length
  const media = informes.filter(i => i.prioridad === 'Media').length
  const oportunidadTotal = informesAgregado.reduce((sum, informe) => sum + oportunidadRadar(informe), 0)
  const capitalTotal = informesAgregado.reduce((sum, informe) => sum + capitalRadar(informe), 0)
  const alertasCriticas = informesAgregado.reduce((sum, informe) => sum + alertasCriticasRadar(informe), 0)
  const candidatosCopa = informesAgregado.reduce((sum, informe) => sum + candidatosCopaRadar(informe), 0)
  const fotosPersistidas = informes.filter(informe => informe.ejecutivo?.resumen?.ultima_foto).length
  const agendaHoy = [...informes]
    .sort((a, b) => {
      const favoritoA = favoritos.includes(a.restaurante.id) ? 1 : 0
      const favoritoB = favoritos.includes(b.restaurante.id) ? 1 : 0
      return (favoritoB - favoritoA)
        || (b.score - a.score)
        || (oportunidadRadar(b) - oportunidadRadar(a))
    })
    .slice(0, 3)
  const restaurantesConAccion = informes.filter(informe =>
    informe.prioridad === 'Alta'
    || informe.propuestasAbiertas.length > 0
    || alertasCriticasRadar(informe) > 0
  ).length
  const activados = informes.filter(informe => activacionRadar(informe).nivel === 4).length
  const bloqueadosActivacion = informes.length - activados
  const consultorSemanal = radarEjecutivo?.consultor || {}
  const resumenSemanalConsultor = consultorSemanal.resumen || {}
  const agendaSemanal = consultorSemanal.agenda_semana || []
  const bloqueosSemanales = consultorSemanal.bloqueos || []
  const automatismos = radarEjecutivo?.automatismos || {}
  const resumenAutomatismos = automatismos.resumen || {}
  const jobsAutomatismos = automatismos.por_job || []
  const automatismosPendientes = automatismos.migration_pending || []
  const defensaEconomica = radarEjecutivo?.defensa_economica || {}
  const resumenDefensaEconomica = defensaEconomica.resumen || {}
  const defensaBloqueadas = defensaEconomica.bloqueadas || []
  const defensaPresentables = defensaEconomica.presentables || []
  const cierreProducto = radarEjecutivo?.cierre_producto || {}
  const checksCierre = cierreProducto.checks || []
  const resumenCierre = cierreProducto.resumen || {}
  const filtros = [
    ['todas', 'Todas'],
    ['activacion', 'Activación'],
    ['alta', 'Prioridad alta'],
    ['oportunidad', 'Oportunidad'],
    ['capital', 'Capital'],
    ['copa', 'Copa'],
    ['carta', 'Carta'],
    ['semanal', 'Semana'],
    ['envio', 'Envio'],
    ['defensa', 'Defensa'],
    ['margen', 'Margen/bodega'],
    ['sala', 'Sala'],
    ['propuestas', 'Propuestas'],
  ]

  return (
    <div className="admin-main radar-main">
      <div className="radar-header">
            <div>
              <h2>Radar ejecutivo</h2>
              <p>{informes.length} restaurantes · {alta} prioridad alta · {media} prioridad media</p>
              <p className="radar-data-note">
                {fotosPersistidas} restaurantes con datos guardados. El resto usa estimación previa hasta pulsar &ldquo;Recalcular y guardar&rdquo; en su ficha.
              </p>
            </div>
            <div className="radar-header-actions">
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={recalcularParaTodos}
                disabled={recalcMasivo.activo}
                title="Ejecuta 'Recalcular y guardar' en todos los restaurantes (excluidos los demo del agregado)"
              >
                {recalcMasivo.activo ? `Recalculando ${recalcMasivo.hechos + 1}/${recalcMasivo.total}…` : 'Recalcular y guardar para todos'}
              </button>
              <Link href="/admin/estado-producto" className="admin-btn-ghost" title="Estado del producto (checks internos)">Estado del producto</Link>
              <span className={`radar-tag ${automatismosPendientes.length ? 'is-warning' : claseAutomatismo((resumenAutomatismos.failed || 0) > 0 ? 'failed' : 'success')}`} title={`Ejecuciones ${resumenAutomatismos.total || 0} · errores ${resumenAutomatismos.failed || 0} · procesados ${resumenAutomatismos.processed || 0}`}>
                Automatismos: {automatismosPendientes.length ? 'migración pendiente' : `${resumenAutomatismos.success || 0} OK`}
              </span>
            </div>
          </div>
          {ticketError && <p className="admin-alert admin-alert-error" role="alert">{ticketError}</p>}
          {recalcMasivo.activo && (
            <div className="admin-alert" role="status">
              Recalculando {recalcMasivo.actual || '…'} · {recalcMasivo.hechos}/{recalcMasivo.total}
              <div className="activation-funnel-bar" style={{ marginTop: 6 }}>
                <span style={{ width: `${pct(recalcMasivo.hechos, recalcMasivo.total)}%` }} />
              </div>
            </div>
          )}
          {!recalcMasivo.activo && recalcMasivo.resumen && (
            <div className="admin-alert" role="status">
              Recálculo completado. {recalcMasivo.resumen.ok} ok · {recalcMasivo.resumen.error} con error · {recalcMasivo.resumen.total} totales.
            </div>
          )}

          <section className="radar-mi-dia" aria-labelledby="mi-dia-title">
            <h3 id="mi-dia-title">Mi día</h3>
            <p className="mi-dia-lead">Hasta 5 tareas priorizadas con datos de hoy.</p>
            {tareasMiDia.length === 0 && <p className="radar-mi-dia-empty">Hoy no hay nada urgente. Aprovecha para preparar la siguiente llamada.</p>}
            {tareasMiDia.length > 0 && (
              <ul>
                {tareasMiDia.map(tarea => (
                  <li key={`${tarea.restaurante.id}:${tarea.tipo}`}>
                    <div className="mi-dia-info">
                      <strong>{tarea.restaurante.nombre}</strong>
                      <span>{tarea.verbo}{tarea.euros > 0 ? ` · ${eur(tarea.euros)} en juego` : ''}</span>
                    </div>
                    <Link href={tarea.destino}>{tarea.cta}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
              <span>Alertas críticas</span>
              <strong>{alertasCriticas}</strong>
              <small>Problemas abiertos que merecen llamada.</small>
            </article>
            <article>
              <span>Candidatos copa</span>
              <strong>{candidatosCopa}</strong>
              <small>Oportunidades para subir ticket y rotar.</small>
            </article>
          </section>

          <section className="activation-funnel-summary">
            <div>
              <span>Embudo de activación</span>
              <strong>{activados}/{informes.length} restaurantes activados</strong>
              <small>Activado = carta y platos cargados + primer escaneo + primer maridaje en los últimos 30 días.</small>
            </div>
            <div className="activation-funnel-bar">
              <span style={{ width: `${pct(activados, informes.length)}%` }} />
            </div>
            <b>{bloqueadosActivacion} necesitan acompañamiento</b>
          </section>

          {/* Seguimiento de propuestas (fase K bloque 2). Solo cifras
              agregadas sobre restaurantes reales (no demo). */}
          {(() => {
            const idsDemo = new Set(informes.filter(i => esExcluidoDeAgregado(i.restaurante)).map(i => String(i.restaurante.id)))
            const agg = agregarSeguimiento(seguimientos || [], idsDemo)
            return (
              <section className="radar-propuestas-seguimiento">
                <div>
                  <span>Propuestas</span>
                  <strong>{agg.porEstado.propuesta + agg.porEstado.enviada + agg.porEstado.aceptada} abiertas</strong>
                  <small>
                    {agg.porEstado.enviada} enviadas · {agg.porEstado.aceptada} aceptadas · {agg.porEstado.implantada} implantadas
                  </small>
                </div>
                <div>
                  <span>€ en juego</span>
                  <strong>{eur(agg.estimado)}</strong>
                  <small>{agg.capturado > 0 ? `${eur(agg.capturado)} capturados` : 'Sin cifras capturadas aún'}</small>
                </div>
              </section>
            )
          })()}

          {/* Defensa económica: tarjeta ligera si todos están sin foto, panel completo si no */}
          {(() => {
            const sinFoto = resumenDefensaEconomica.sin_foto || 0
            const totalRests = resumenDefensaEconomica.restaurantes || informes.length
            const todosSinFoto = totalRests > 0 && sinFoto === totalRests
            if (todosSinFoto) {
              return (
                <section className="radar-no-foto-card" role="status" aria-label="Documentación pendiente">
                  <div>
                    <strong>{sinFoto} restaurantes sin documentación guardada</strong>
                    <p>Para enseñar cifras al cliente, cada uno necesita un recálculo desde su ficha.</p>
                  </div>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={recalcularParaTodos}
                    disabled={recalcMasivo.activo}
                  >
                    Guardar fotos de todos
                  </button>
                </section>
              )
            }
            return (
              <section className="economic-defense-panel">
                <div className="economic-defense-head">
                  <div>
                    <h3>Defensa económica</h3>
                    <p>{resumenDefensaEconomica.con_foto || 0}/{totalRests} restaurantes tienen documentación guardada.</p>
                  </div>
                  <span className={`radar-tag ${(resumenDefensaEconomica.no_presentar || sinFoto) ? 'is-warning' : 'is-ok'}`}>
                    Rigor medio {resumenDefensaEconomica.rigor_medio || 0}%
                  </span>
                </div>
                <div className="economic-defense-grid">
                  <div className="economic-defense-box">
                    <div className="economic-defense-box-head">
                      <strong>Bloqueadas para informe</strong>
                      <span>{defensaBloqueadas.length} cuentas</span>
                    </div>
                    <div className="economic-defense-list">
                      {defensaBloqueadas.slice(0, 5).map(item => (
                        <Link key={item.restaurante_id} href={`/admin/restaurante/${item.restaurante_id}`} className="economic-defense-row">
                          <div>
                            <strong>{item.restaurante?.nombre || 'Restaurante'}</strong>
                            <small>{item.bloqueo_principal || item.accion}</small>
                          </div>
                          <span className={`radar-tag ${claseDefensaEconomica(item)}`}>{etiquetaDefensaEconomica(item)}</span>
                        </Link>
                      ))}
                      {defensaBloqueadas.length === 0 && <p className="economic-defense-empty">No hay cuentas bloqueadas por defensa económica.</p>}
                    </div>
                  </div>
                  <div className="economic-defense-box">
                    <div className="economic-defense-box-head">
                      <strong>Cuentas presentables</strong>
                      <span>{defensaPresentables.length} cuentas</span>
                    </div>
                    <div className="economic-defense-list">
                      {defensaPresentables.slice(0, 5).map(item => (
                        <Link key={item.restaurante_id} href={`/admin/restaurante/${item.restaurante_id}`} className="economic-defense-row">
                          <div>
                            <strong>{item.restaurante?.nombre || 'Restaurante'}</strong>
                            <small>Rigor {item.score}% · guardada {item.ultima_foto_at ? new Date(item.ultima_foto_at).toLocaleDateString('es-ES') : 'sin fecha'}</small>
                          </div>
                          <b>{eur(item.beneficio_presentable || 0)}</b>
                        </Link>
                      ))}
                      {defensaPresentables.length === 0 && <p className="economic-defense-empty">Aún no hay cuentas con cifras plenamente presentables.</p>}
                    </div>
                  </div>
                </div>
              </section>
            )
          })()}

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
            {informesFiltrados.map(informe => {
              const semanal = semanalRadar(informe)
              const bloqueoSemanal = bloqueoSemanalPrincipal(informe)
              const economica = economicaRadar(informe)
              return (
              <article key={informe.restaurante.id} className="radar-row">
                <button
                  type="button"
                  className={`radar-favorite ${favoritos.includes(informe.restaurante.id) ? 'is-active' : ''}`}
                  onClick={event => toggleFavorito(event, informe.restaurante.id)}
                  aria-label="Marcar restaurante como favorito"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <path d="M6.5 1.5l1.3 2.8 3.1.45-2.2 2.15.52 3.1L6.5 8.5l-2.72 1.5.52-3.1L2.1 4.75l3.1-.45z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  </svg>
                </button>
                <Link href={`/admin/restaurante/${informe.restaurante.id}`} className="radar-card-link">
                <div className={`radar-score radar-score-${informe.prioridad.toLowerCase()}`}>
                  <span>{informe.score}</span>
                  <i style={{ width: `${informe.score}%` }} />
                </div>
                <div className="radar-info">
                  <strong>
                    {informe.restaurante.nombre}
                    {esExcluidoDeAgregado(informe.restaurante) && <span className="radar-demo-chip" title="Restaurante demo: no suma en agregados">demo</span>}
                  </strong>
                  <div className="radar-tags">
                    <span className={`radar-tag radar-tag-${informe.prioridad.toLowerCase()}`}>{informe.prioridad}</span>
                    {informe.propuestasAbiertas.length > 0 && <span className="radar-tag is-warning">Pendiente acción</span>}
                    {oportunidadRadar(informe) > 0 && <span className="radar-tag is-hot">{eur(oportunidadRadar(informe))}</span>}
                    {candidatosCopaRadar(informe) > 0 && <span className="radar-tag is-ok">{candidatosCopaRadar(informe)} copa</span>}
                    {(semanal?.kpis?.recuperable_semana || 0) > 0 && <span className="radar-tag is-hot">{eur(semanal.kpis.recuperable_semana)} semana</span>}
                    {informe.alertas.some(alerta => alerta.titulo.toLowerCase().includes('cliente caliente')) && <span className="radar-tag is-hot">Cliente caliente</span>}
                    {informe.alertas.length === 0 && <span className="radar-tag is-ok">OK</span>}
                    <span className={`radar-tag ${activacionRadar(informe).nivel === 4 ? 'is-ok' : 'is-warning'}`}>
                      {activacionRadar(informe).label}
                    </span>
                    <span className={`radar-tag ${claseEnvioSemanal(semanal)}`}>Resumen {estadoEnvioSemanal(semanal)}</span>
                    <span className={`radar-tag ${claseDefensaEconomica(economica)}`}>{etiquetaDefensaEconomica(economica)}</span>
                    {bloqueoSemanal && <span className="radar-tag is-warning">{bloqueoSemanal.titulo}</span>}
                  </div>
                  <span>{informe.restaurante.ciudad || '—'} · {informe.metricas.vinos} vinos · {informe.metricas.platos} platos</span>
                  {informe.ejecutivo && (
                    <small className="radar-executive-line">
                      Capital {eur(capitalRadar(informe))} · Alertas críticas {alertasCriticasRadar(informe)} · Carta {informe.ejecutivo.resumen.carta_inflada ? 'inflada' : 'controlada'}
                    </small>
                  )}
                  {semanal && (
                    <small className="radar-executive-line">
                      Semana {eur(semanal.kpis?.beneficio_bruto || 0)} defendido / {eur(semanal.kpis?.recuperable_semana || 0)} por capturar
                    </small>
                  )}
                  {economica?.tiene_foto && (
                    <small className="radar-executive-line">
                      Defensa {economica.score}% · Presentable {eur(economica.beneficio_presentable || 0)} · {economica.bloqueo_principal}
                    </small>
                  )}
                  {!informe.ejecutivo && (
                    <small className="radar-executive-line">
                      Estimación previa: capital {eur(capitalRadar(informe))} · alertas críticas {alertasCriticasRadar(informe)} · copa {candidatosCopaRadar(informe)}
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
                  <span>Siguiente acción</span>
                  <strong>{activacionRadar(informe).nivel < 4 ? activacionRadar(informe).accion : informe.siguienteMovimiento}</strong>
                  <small>
                    {(() => {
                      const propios = (contactos || []).filter(c => String(c.restaurante_id) === String(informe.restaurante.id))
                      if (propios.length === 0) return 'Sin contactos registrados'
                      const d = diasDesdeUltimoContacto(propios)
                      if (d == null) return 'Sin contactos registrados'
                      if (d === 0) return 'Último contacto: hoy'
                      if (d === 1) return 'Último contacto: ayer'
                      return `Último contacto: hace ${d} días`
                    })()}
                  </small>
                </div>
                <div className="radar-cta">Ver detalles</div>
                </Link>
                <button type="button" className="radar-quick-button" onClick={() => setVistaRapida(informe)}>Vista rápida</button>
              </article>
              )
            })}
            {informesFiltrados.length === 0 && (
              <div className="ws-empty-block">No hay restaurantes con este filtro.</div>
            )}
          </div>
          <AdminOverlay
            open={Boolean(vistaRapida)}
            onClose={() => setVistaRapida(null)}
            eyebrow={vistaRapida?.prioridad ? `Prioridad ${vistaRapida.prioridad}` : 'Radar'}
            title={vistaRapida?.restaurante?.nombre || 'Restaurante'}
            description={vistaRapida ? `${vistaRapida.restaurante.ciudad || 'Sin ciudad'} · ${vistaRapida.metricas.vinos} vinos · ${vistaRapida.metricas.platos} platos` : ''}
            footer={
              <>
                <button type="button" onClick={() => setVistaRapida(null)}>Cerrar</button>
                {vistaRapida && <button type="button" className="is-primary" onClick={() => gestionar(vistaRapida.restaurante)}>Abrir dashboard</button>}
              </>
            }
          >
            {vistaRapida && (
              <div className="admin-detail-stack">
                <div className="alerts-summary">
                  <div><span>Score</span><strong>{vistaRapida.score}</strong></div>
                  <div><span>Oportunidad</span><strong>{eur(oportunidadRadar(vistaRapida))}</strong></div>
                  <div><span>Capital</span><strong>{eur(capitalRadar(vistaRapida))}</strong></div>
                  <div><span>Alertas</span><strong>{alertasCriticasRadar(vistaRapida)}</strong></div>
                </div>
                <div className="admin-detail-box">
                  <h3>Problema principal</h3>
                  <p>{vistaRapida.ejecutivo?.resumen?.problema_principal || vistaRapida.alertas[0]?.titulo || 'Sin alertas críticas.'}</p>
                </div>
                <div className="admin-detail-box">
                  <h3>Siguiente acción</h3>
                  <p>{activacionRadar(vistaRapida).nivel < 4 ? activacionRadar(vistaRapida).accion : vistaRapida.siguienteMovimiento}</p>
                </div>
                {semanalRadar(vistaRapida) && (
                  <div className="admin-detail-box">
                    <h3>Resumen semanal</h3>
                    <p>
                      {eur(semanalRadar(vistaRapida).kpis?.beneficio_bruto || 0)} defendido,
                      {' '}{eur(semanalRadar(vistaRapida).kpis?.recuperable_semana || 0)} por capturar.
                      {' '}Entrega: {estadoEnvioSemanal(semanalRadar(vistaRapida))}.
                      {bloqueoSemanalPrincipal(vistaRapida) ? ` Bloqueo: ${bloqueoSemanalPrincipal(vistaRapida).titulo}.` : ''}
                    </p>
                  </div>
                )}
                <div className="admin-detail-box">
                  <h3>Defensa económica</h3>
                  <p>
                    {etiquetaDefensaEconomica(economicaRadar(vistaRapida))}.
                    {economicaRadar(vistaRapida)?.tiene_foto
                      ? ` Rigor ${economicaRadar(vistaRapida).score}%, presentable ${eur(economicaRadar(vistaRapida).beneficio_presentable || 0)}. ${economicaRadar(vistaRapida).bloqueo_principal || ''}`
                      : ' Falta guardar una foto de trazabilidad antes de presentar cifras.'}
                  </p>
                </div>
                <div className="admin-overlay-actions">
                  <Link href={`/admin/restaurante/${vistaRapida.restaurante.id}`}>Abrir ficha consultor</Link>
                  <Link href={`/admin/propuestas?restaurante=${vistaRapida.restaurante.id}`}>Crear propuesta</Link>
                </div>
              </div>
            )}
          </AdminOverlay>

    </div>
  )
}
