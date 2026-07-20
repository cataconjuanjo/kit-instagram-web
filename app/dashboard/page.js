'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../supabase'
import { getEffectiveRestaurantEmail } from '../demo'
import { cargarDemoDashboard } from '../lib/demoDashboardClient'
import { aplicarVentana, resolverVentanaDiaOperativo } from '../lib/demoServiceDay'
import { esPerfilBodega, puedeUsar } from '../lib/plans'
import { puedePublicarCarta, resumirContenidoCarta } from '../lib/publicationReadiness'
import styles from './dashboard.module.css'

function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function porcentaje(valor, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round((valor / total) * 100)))
}

function decimal(valor) {
  return Number(valor) || 0
}

function eur(valor, decimales = 0) {
  return `${decimal(valor).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} EUR`
}

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function fechaLocalClave() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function claveCierreDia(restauranteId) {
  return `carta_viva_cierre_${restauranteId}_${fechaLocalClave()}`
}

function leerActivacionReciente() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  let marcada = false
  try {
    marcada = window.localStorage.getItem('carta_viva_recien_activado') === '1'
    if (marcada) window.localStorage.removeItem('carta_viva_recien_activado')
  } catch {
    marcada = false
  }
  return params.get('bienvenida') === '1' || marcada
}

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

async function cargarCierreRemoto(restauranteId) {
  const token = await tokenSesion()
  if (!token) return null
  const query = new URLSearchParams({ restaurante_id: restauranteId, fecha: fechaLocalClave() })
  const res = await fetch(`/api/cierres-servicio?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.cierre || null
}

async function copiarTexto(texto) {
  if (!texto) return
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

const DIAS_ENVIO_RESUMEN = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miercoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sabado' },
]

function preferenciasResumenPorDefecto(rest = {}) {
  return {
    enabled: true,
    channel: 'email',
    recipient_email: rest.email || '',
    cc_email: '',
    send_day: 1,
    send_hour: 9,
    timezone: 'Europe/Madrid',
  }
}

function normalizarPreferenciasDraft(preferencias = {}, rest = {}) {
  const base = preferenciasResumenPorDefecto(rest)
  return {
    ...base,
    ...preferencias,
    enabled: preferencias.enabled !== false,
    channel: preferencias.channel === 'manual' ? 'manual' : 'email',
    recipient_email: preferencias.recipient_email || base.recipient_email,
    cc_email: preferencias.cc_email || '',
    send_day: Number.isFinite(Number(preferencias.send_day)) ? Number(preferencias.send_day) : base.send_day,
    send_hour: Number.isFinite(Number(preferencias.send_hour)) ? Number(preferencias.send_hour) : base.send_hour,
    timezone: preferencias.timezone || base.timezone,
  }
}

const ESTADO_LANZAMIENTO_INICIAL = {
  loading: false,
  previewAprobada: false,
  previewObsoleta: false,
  previewPendiente: false,
  analyticsPendiente: false,
  qrPreparado: false,
  eventosEntrega: 0,
  escaneosReales: 0,
  error: '',
}

const EXPERIENCIAS_CARTA = {
  lanzamiento: 'Lanzamiento QR en sala',
  temporada: 'Carta de temporada',
  degustacion: 'Menu degustacion con maridaje',
  premium: 'Bodega premium por botella',
  evento: 'Evento privado o grupo',
}

const EXPERIENCIA_LANZAMIENTO_INICIAL = {
  id: '',
  nombre: '',
  progreso: 0,
  completados: 0,
  total: 0,
  objetivo: '',
  responsable: '',
}

function leerExperienciaLanzamiento(restauranteId) {
  if (!restauranteId || typeof window === 'undefined') return EXPERIENCIA_LANZAMIENTO_INICIAL
  try {
    const id = window.localStorage.getItem(`carta_viva_plantilla_activa_${restauranteId}`) || ''
    if (!id || !EXPERIENCIAS_CARTA[id]) return EXPERIENCIA_LANZAMIENTO_INICIAL
    const plan = JSON.parse(window.localStorage.getItem(`carta_viva_plan_activacion_${restauranteId}_${id}`) || '{}')
    const estados = Object.values(plan.completados || {})
    const completados = estados.filter(Boolean).length
    const total = estados.length
    return {
      id,
      nombre: EXPERIENCIAS_CARTA[id],
      progreso: total ? Math.round((completados / total) * 100) : 0,
      completados,
      total,
      objetivo: plan.objetivo || '',
      responsable: plan.responsable || '',
    }
  } catch {
    return EXPERIENCIA_LANZAMIENTO_INICIAL
  }
}

function experienciaDesdePlanRemoto(plan) {
  if (!plan?.template_id || !EXPERIENCIAS_CARTA[plan.template_id]) return null
  const estados = Object.values(plan.completed_steps || {})
  const completados = estados.filter(Boolean).length
  const total = estados.length
  return {
    id: plan.template_id,
    nombre: EXPERIENCIAS_CARTA[plan.template_id],
    progreso: total ? Math.round((completados / total) * 100) : 0,
    completados,
    total,
    objetivo: plan.objective_date || '',
    responsable: plan.responsible || '',
  }
}

async function cargarExperienciaLanzamientoRemota(restauranteId) {
  const local = leerExperienciaLanzamiento(restauranteId)
  try {
    const token = await tokenSesion()
    if (!token || !restauranteId) return local
    const query = new URLSearchParams({ restaurante_id: restauranteId })
    const res = await fetch(`/api/experiencias?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.experience_pending) return local
    return experienciaDesdePlanRemoto(data.active_plan) || local
  } catch {
    return local
  }
}

export default function DashboardHome() {
  const [restaurante, setRestaurante] = useState(null)
  const [stats, setStats] = useState({ escaneos: 0, sommelier: 0, ventasHoy: 0, incidenciasSala: 0, dudasSala: 0 })
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [tareasOcultas, setTareasOcultas] = useState([])
  const [turnoCerrado, setTurnoCerrado] = useState(false)
  const [etiquetaDia, setEtiquetaDia] = useState('hoy')
  const [radarAcciones, setRadarAcciones] = useState([])
  const [radarPersistidas, setRadarPersistidas] = useState(false)
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarError, setRadarError] = useState('')
  const [accionandoRadar, setAccionandoRadar] = useState('')
  const [resumenSemanal, setResumenSemanal] = useState(null)
  const [resumenSemanalLoading, setResumenSemanalLoading] = useState(false)
  const [resumenSemanalSaving, setResumenSemanalSaving] = useState(false)
  const [resumenSemanalSending, setResumenSemanalSending] = useState(false)
  const [resumenPrefsSaving, setResumenPrefsSaving] = useState(false)
  const [resumenPrefsDraft, setResumenPrefsDraft] = useState(preferenciasResumenPorDefecto())
  const [resumenSemanalError, setResumenSemanalError] = useState('')
  const [resumenSemanalMensaje, setResumenSemanalMensaje] = useState('')
  const [activacionReciente, setActivacionReciente] = useState(false)
  const [estadoLanzamiento, setEstadoLanzamiento] = useState(ESTADO_LANZAMIENTO_INICIAL)
  const [experienciaLanzamiento, setExperienciaLanzamiento] = useState(EXPERIENCIA_LANZAMIENTO_INICIAL)
  const [loading, setLoading] = useState(true)

  const cargarRadarDiario = useCallback(async (restauranteId) => {
    const token = await tokenSesion()
    if (!token || !restauranteId) {
      setRadarAcciones([])
      setRadarPersistidas(false)
      return
    }
    setRadarLoading(true)
    setRadarError('')
    try {
      const query = new URLSearchParams({ restaurante_id: restauranteId })
      const res = await fetch(`/api/radar-diario?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el radar diario.')
      setRadarAcciones(data.acciones || [])
      setRadarPersistidas(Boolean(data.persistidas))
    } catch (error) {
      setRadarError(error.message || 'No se pudo cargar el radar diario.')
      setRadarAcciones([])
      setRadarPersistidas(false)
    } finally {
      setRadarLoading(false)
    }
  }, [])

  async function actualizarRadarDiario(accion, estado) {
    if (!accion?.id || !restaurante?.id || !radarPersistidas) return
    const token = await tokenSesion()
    if (!token) return
    setAccionandoRadar(accion.id)
    setRadarError('')
    try {
      const res = await fetch('/api/radar-diario', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: accion.id, restaurante_id: restaurante.id, estado }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la accion.')
      setRadarAcciones(prev => prev.map(item => item.id === accion.id ? data.accion : item))
    } catch (error) {
      setRadarError(error.message || 'No se pudo actualizar la accion.')
    } finally {
      setAccionandoRadar('')
    }
  }

  const aplicarPreferenciasSemanal = useCallback((preferencias, rest = {}) => {
    setResumenPrefsDraft(normalizarPreferenciasDraft(preferencias || {}, rest || {}))
  }, [])

  const cargarResumenSemanal = useCallback(async (restauranteId, restActual = {}) => {
    const token = await tokenSesion()
    if (!token || !restauranteId) {
      setResumenSemanal(null)
      return
    }
    setResumenSemanalLoading(true)
    setResumenSemanalError('')
    try {
      const query = new URLSearchParams({ restaurante_id: restauranteId, dias: '7' })
      const res = await fetch(`/api/resumen-semanal?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el resumen semanal.')
      setResumenSemanal(data.resumen || null)
      aplicarPreferenciasSemanal(data.resumen?.delivery?.preferencias, restActual)
    } catch (error) {
      setResumenSemanalError(error.message || 'No se pudo cargar el resumen semanal.')
      setResumenSemanal(null)
      aplicarPreferenciasSemanal(null, restActual)
    } finally {
      setResumenSemanalLoading(false)
    }
  }, [aplicarPreferenciasSemanal])

  const cargarEstadoLanzamiento = useCallback(async (restauranteId, restActual = {}) => {
    if (!restauranteId || esPerfilBodega(restActual)) {
      setEstadoLanzamiento(ESTADO_LANZAMIENTO_INICIAL)
      return
    }
    const token = await tokenSesion()
    if (!token) return
    setEstadoLanzamiento(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const destino = restActual?.hub_activo ? 'hub' : 'carta'
      const previewQuery = new URLSearchParams({ restaurante_id: restauranteId, destino })
      const analyticsQuery = new URLSearchParams({ restaurante_id: restauranteId, days: '30' })
      const [previewRes, analyticsRes] = await Promise.all([
        fetch(`/api/publicacion/preview-approval?${previewQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/publicacion/analytics?${analyticsQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      const previewData = await previewRes.json().catch(() => ({}))
      const analyticsData = await analyticsRes.json().catch(() => ({}))
      const resumenEntrega = analyticsData.resumen || {}
      const accionesMaterial = (resumenEntrega.qr_downloaded || 0) +
        (resumenEntrega.qr_print_opened || 0) +
        (resumenEntrega.public_link_copied || 0) +
        (resumenEntrega.team_message_copied || 0)

      setEstadoLanzamiento({
        loading: false,
        previewAprobada: Boolean(previewRes.ok && previewData.aprobacion_vigente),
        previewObsoleta: Boolean(previewRes.ok && previewData.aprobacion_obsoleta),
        previewPendiente: Boolean(previewData.aprobaciones_pendientes),
        analyticsPendiente: Boolean(analyticsData.analytics_pendiente),
        qrPreparado: accionesMaterial > 0,
        eventosEntrega: analyticsData.eventos?.length || 0,
        escaneosReales: analyticsData.uso_real?.escaneos_total || 0,
        error: '',
      })
    } catch (error) {
      setEstadoLanzamiento(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'No se pudo cargar el estado de lanzamiento.',
      }))
    }
  }, [])

  async function copiarResumenSemanal() {
    if (!resumenSemanal?.copy_text) return
    await copiarTexto(resumenSemanal.copy_text)
    setResumenSemanalMensaje('Resumen copiado')
    setTimeout(() => setResumenSemanalMensaje(''), 1600)
  }

  async function guardarResumenSemanal() {
    const token = await tokenSesion()
    if (!token || !restaurante?.id) return
    setResumenSemanalSaving(true)
    setResumenSemanalError('')
    try {
      const query = new URLSearchParams({ restaurante_id: restaurante.id, dias: '7' })
      const res = await fetch(`/api/resumen-semanal?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la foto semanal.')
      setResumenSemanal(data.resumen || null)
      aplicarPreferenciasSemanal(data.resumen?.delivery?.preferencias, restaurante)
      setResumenSemanalMensaje('Foto semanal guardada')
      setTimeout(() => setResumenSemanalMensaje(''), 1800)
    } catch (error) {
      setResumenSemanalError(error.message || 'No se pudo guardar la foto semanal.')
    } finally {
      setResumenSemanalSaving(false)
    }
  }

  async function guardarRutinaSemanal() {
    const token = await tokenSesion()
    if (!token || !restaurante?.id) return
    setResumenPrefsSaving(true)
    setResumenSemanalError('')
    try {
      const query = new URLSearchParams({ restaurante_id: restaurante.id })
      const res = await fetch(`/api/resumen-semanal/preferencias?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id, ...resumenPrefsDraft }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la rutina semanal.')
      aplicarPreferenciasSemanal(data.preferencias, restaurante)
      setResumenSemanal(prev => prev ? ({
        ...prev,
        delivery: {
          ...(prev.delivery || {}),
          preferencias: data.preferencias,
          channel: data.preferencias?.channel || prev.delivery?.channel,
          recipient_email: data.preferencias?.recipient_email || prev.delivery?.recipient_email,
        },
      }) : prev)
      setResumenSemanalMensaje('Rutina semanal guardada')
      setTimeout(() => setResumenSemanalMensaje(''), 1800)
    } catch (error) {
      setResumenSemanalError(error.message || 'No se pudo guardar la rutina semanal.')
    } finally {
      setResumenPrefsSaving(false)
    }
  }

  async function enviarResumenSemanalAhora() {
    const token = await tokenSesion()
    if (!token || !restaurante?.id) return
    setResumenSemanalSending(true)
    setResumenSemanalError('')
    try {
      const query = new URLSearchParams({ restaurante_id: restaurante.id, dias: '7' })
      const res = await fetch(`/api/resumen-semanal/enviar?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el resumen semanal.')
      setResumenSemanal(data.resumen || null)
      aplicarPreferenciasSemanal(data.resumen?.delivery?.preferencias, restaurante)
      const estado = data.delivery?.delivery_status
      setResumenSemanalMensaje(estado === 'sent' ? 'Resumen enviado' : estado === 'failed' ? 'Envio fallido' : 'Envio pendiente')
      setTimeout(() => setResumenSemanalMensaje(''), 2200)
    } catch (error) {
      setResumenSemanalError(error.message || 'No se pudo enviar el resumen semanal.')
    } finally {
      setResumenSemanalSending(false)
    }
  }

  function marcarTareaInicio(tareaId) {
    if (!tareaId) return
    setTareasOcultas(prev => {
      if (prev.includes(tareaId)) return prev
      const siguientes = [...prev, tareaId]
      if (typeof window !== 'undefined' && restaurante?.id) {
        try {
          window.localStorage.setItem(`carta_viva_inicio_${restaurante.id}`, JSON.stringify(siguientes))
        } catch {
          // El checklist sigue funcionando aunque el navegador bloquee localStorage.
        }
      }
      return siguientes
    })
  }

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId, isDemo } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }

      if (isDemo) {
        const demo = await cargarDemoDashboard(email)
        if (demo?.restaurante) {
          const rest = demo.restaurante
          setRestaurante(rest)
          setActivacionReciente(false)
          setExperienciaLanzamiento(leerExperienciaLanzamiento(rest.id))
          if (typeof window !== 'undefined') {
            try {
              const guardadas = JSON.parse(window.localStorage.getItem(`carta_viva_inicio_${rest.id}`) || '[]')
              setTareasOcultas(Array.isArray(guardadas) ? guardadas : [])
            } catch {
              setTareasOcultas([])
            }
          }
          setEtiquetaDia(demo.etiquetaDia || 'hoy')
          setTurnoCerrado(Boolean(demo.turnoCerrado))
          setVinos(demo.vinos || [])
          setPlatos(demo.platos || [])
          setPropuestas(demo.propuestas || [])
          setStats(demo.stats || { escaneos: 0, sommelier: 0, ventasHoy: 0, incidenciasSala: 0, dudasSala: 0 })
          setRadarAcciones([])
          setRadarPersistidas(false)
          setResumenSemanal(null)
          setEstadoLanzamiento(ESTADO_LANZAMIENTO_INICIAL)
        }
        setLoading(false)
        return
      }

      const queryRestaurante = supabase.from('restaurantes').select('*')
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        setExperienciaLanzamiento(leerExperienciaLanzamiento(rest.id))
        if (typeof window !== 'undefined') {
          setActivacionReciente(leerActivacionReciente())
          try {
            const guardadas = JSON.parse(window.localStorage.getItem(`carta_viva_inicio_${rest.id}`) || '[]')
            setTareasOcultas(Array.isArray(guardadas) ? guardadas : [])
          } catch {
            setTareasOcultas([])
          }
        }
        const ventanaDia = await resolverVentanaDiaOperativo(supabase, rest, { tipo: 'venta' })
        setEtiquetaDia(ventanaDia.etiqueta)
        const [
          { data: vinosData },
          { data: platosData },
          { data: statsHoy },
          { data: propuestasData },
        ] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id),
          supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
          aplicarVentana(
            supabase.from('estadisticas').select('tipo, detalle, created_at').eq('restaurante_id', rest.id),
            ventanaDia
          ),
          supabase.from('consultor_propuestas').select('*').eq('restaurante_id', rest.id).neq('estado', 'descartada').order('created_at', { ascending: false }),
        ])
        const eventosVentaHoy = (statsHoy || []).filter(s => s.tipo === 'venta')
        const ventasHoy = eventosVentaHoy.map(s => leerDetalle(s.detalle))
        if (typeof window !== 'undefined') {
          try {
            const locales = JSON.parse(window.localStorage.getItem(claveCierreDia(rest.id)) || '[]')
            const cierreRemoto = await cargarCierreRemoto(rest.id)
            const guardados = cierreRemoto?.eventos_revisados || locales
            setTurnoCerrado(Boolean(cierreRemoto?.cerrado) || (Array.isArray(guardados) && guardados.length >= eventosVentaHoy.length && eventosVentaHoy.length > 0))
          } catch {
            setTurnoCerrado(false)
          }
        }
        setVinos(vinosData || [])
        setPlatos(platosData || [])
        setPropuestas(propuestasData || [])
        setStats({
          escaneos: statsHoy?.filter(s => s.tipo === 'escaneo').length || 0,
          sommelier: statsHoy?.filter(s => s.tipo === 'sommelier').length || 0,
          ventasHoy: ventasHoy.filter(item => item.resultado === 'vendida').length,
          incidenciasSala: ventasHoy.filter(item => ['no_stock', 'agotado'].includes(item.resultado)).length,
          dudasSala: ventasHoy.filter(item => ['no_convence', 'otra'].includes(item.resultado)).length,
        })
        await Promise.all([
          cargarRadarDiario(rest.id),
          cargarResumenSemanal(rest.id, rest),
          cargarEstadoLanzamiento(rest.id, rest),
          cargarExperienciaLanzamientoRemota(rest.id).then(setExperienciaLanzamiento),
        ])
      }
      setLoading(false)
    }
    cargar()
  }, [cargarEstadoLanzamiento, cargarRadarDiario, cargarResumenSemanal])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.15em', color: '#bbb' }}>CARGANDO</p>
    </div>
  )

  const vinosActivos = vinos.filter(v => v.activo !== false)
  const vinosSinPrecio = vinosActivos.filter(vino => !decimal(vino.precio_botella))
  const vinosSinPerfil = vinosActivos.filter(vino => !vino.notas_cata || normalizar(vino.notas_cata).length < 12)
  const vinosSinStock = vinosActivos.filter(vino => vino.stock === null || vino.stock === undefined || decimal(vino.stock) === 0)
  const platosSinDescripcion = platos.filter(plato => !plato.descripcion || plato.descripcion.trim().length < 8)
  const platosSinPrecio = platos.filter(plato => !decimal(plato.precio))
  const bajoMinimo = vinosActivos.filter(vino => decimal(vino.stock_minimo) > 0 && decimal(vino.stock) <= decimal(vino.stock_minimo))
  const sinCosteCompra = vinosActivos.filter(vino => !decimal(vino.coste_compra))
  const sinProveedor = vinosActivos.filter(vino => !vino.proveedor)
  const sinStockMinimo = vinosActivos.filter(vino => !decimal(vino.stock_minimo))
  const propuestasActivas = propuestas.filter(item => item.estado !== 'incorporada')
  const pinConfigurado = Boolean(restaurante?.camarero_pin_bloqueo_activo)
  const perfilBodega = esPerfilBodega(restaurante)
  const calidadPlatos = Math.round((porcentaje(platos.length - platosSinDescripcion.length, platos.length) * 0.65) + (porcentaje(platos.length - platosSinPrecio.length, platos.length) * 0.35))
  const calidadVinos = Math.round((porcentaje(vinosActivos.length - vinosSinPrecio.length, vinosActivos.length) * 0.45) + (porcentaje(vinosActivos.length - vinosSinPerfil.length, vinosActivos.length) * 0.45) + (porcentaje(vinosActivos.length - vinosSinStock.length, vinosActivos.length) * 0.1))
  const calidadBodega = Math.round(
    (porcentaje(vinosActivos.length - sinCosteCompra.length, vinosActivos.length) * 0.3) +
    (porcentaje(vinosActivos.length - sinProveedor.length, vinosActivos.length) * 0.25) +
    (porcentaje(vinosActivos.length - sinStockMinimo.length, vinosActivos.length) * 0.2) +
    (porcentaje(vinosActivos.length - vinosSinStock.length, vinosActivos.length) * 0.15) +
    (porcentaje(vinosActivos.length - vinosSinPrecio.length, vinosActivos.length) * 0.1)
  )
  const calidadGlobal = perfilBodega ? calidadBodega : Math.round((calidadVinos * 0.58) + (calidadPlatos * 0.42))
  const contenidoPublicacion = resumirContenidoCarta(vinosActivos, platos)
  const cartaPublicable = puedePublicarCarta(contenidoPublicacion)
  const cartaPublicada = restaurante?.carta_publica_activa !== false
  const previewLista = Boolean(estadoLanzamiento.previewAprobada && !estadoLanzamiento.previewObsoleta)
  const qrPreparado = Boolean(estadoLanzamiento.qrPreparado || estadoLanzamiento.escaneosReales > 0)
  const primerEscaneoReal = Boolean(estadoLanzamiento.escaneosReales > 0 || stats.escaneos > 0)
  const experienciaElegida = Boolean(experienciaLanzamiento.id)
  const estadoCarta = perfilBodega
    ? calidadGlobal >= 80 ? 'Bodega bajo control' : calidadGlobal >= 55 ? 'Bodega con pendientes' : 'Bodega por ordenar'
    : calidadGlobal >= 80 ? 'Lista para trabajar' : calidadGlobal >= 55 ? 'Necesita ajustes' : 'Requiere orden'

  const acciones = (perfilBodega ? [
    bajoMinimo.length > 0 && { texto: `Preparar reposicion de ${bajoMinimo.length} vinos`, href: '/dashboard/bodega#pedido', tipo: 'Compra' },
    sinCosteCompra.length > 0 && { texto: `Completar coste de ${sinCosteCompra.length} referencias`, href: '/dashboard/bodega#referencias-sin-coste', tipo: 'Margen' },
    sinProveedor.length > 0 && { texto: `Asignar proveedor a ${sinProveedor.length} vinos`, href: '/dashboard/bodega#referencias-sin-proveedor', tipo: 'Proveedor' },
    vinosSinStock.length > 0 && { texto: `Registrar stock actual de ${vinosSinStock.length} vinos`, href: '/dashboard/bodega#referencias-sin-stock', tipo: 'Stock' },
    sinStockMinimo.length > 0 && { texto: `Definir stock minimo de ${sinStockMinimo.length} referencias`, href: '/dashboard/bodega#referencias-sin-minimo', tipo: 'Stock' },
    vinosSinPrecio.length > 0 && { texto: `Revisar precio de venta de ${vinosSinPrecio.length} vinos`, href: '/dashboard/vinos?filtro=pendientes', tipo: 'Precio' },
    propuestasActivas.length > 0 && { texto: `Valorar ${propuestasActivas.length} propuestas pendientes`, href: '/dashboard/bodega#propuestas', tipo: 'Propuesta' },
  ] : [
    stats.incidenciasSala > 0 && { texto: `Resolver ${stats.incidenciasSala} incidencias de stock`, href: '/dashboard/cierre#incidencias', tipo: 'Urgente' },
    stats.dudasSala > 0 && { texto: `Revisar ${stats.dudasSala} dudas de sala`, href: '/dashboard/cierre#dudas', tipo: 'Sala' },
    bajoMinimo.length > 0 && { texto: `Preparar reposición de ${bajoMinimo.length} vinos`, href: '/dashboard/bodega#pedido', tipo: 'Bodega' },
    sinCosteCompra.length > 0 && { texto: `Completar coste de ${sinCosteCompra.length} vinos`, href: '/dashboard/bodega#referencias-sin-coste', tipo: 'Margen' },
    vinosSinPrecio.length + vinosSinPerfil.length > 0 && { texto: `Completar datos de ${vinosSinPrecio.length + vinosSinPerfil.length} vinos`, href: '/dashboard/vinos?filtro=pendientes', tipo: 'Carta' },
    platosSinDescripcion.length > 0 && { texto: `Completar descripcion interna de ${platosSinDescripcion.length} platos`, href: '/dashboard/platos?filtro=descripcion', tipo: 'Maridaje' },
    propuestasActivas.length > 0 && { texto: `Valorar ${propuestasActivas.length} propuestas pendientes`, href: '/dashboard/bodega#propuestas', tipo: 'Propuesta' },
  ]).filter(Boolean)
  const accionesRadarAbiertas = radarAcciones.filter(item => !['hecha', 'descartada'].includes(item.estado))
  const accionesRadarHechas = radarAcciones.filter(item => item.estado === 'hecha').length
  const radarPrincipal = accionesRadarAbiertas[0] || null
  const pasosLanzamiento = perfilBodega ? [] : [
    {
      id: 'contenido',
      titulo: 'Contenido publicable',
      texto: cartaPublicable
        ? `${contenidoPublicacion.vinosActivos} vinos activos y ${contenidoPublicacion.vinosConPrecio} con precio.`
        : `${contenidoPublicacion.vinosActivos} vinos activos, ${contenidoPublicacion.vinosSinPrecio} sin precio.`,
      href: cartaPublicable ? '/dashboard/qr' : '/dashboard/vinos?filtro=pendientes',
      ok: cartaPublicable,
      requerido: true,
    },
    {
      id: 'platos',
      titulo: 'Maridaje con contexto',
      texto: platos.length
        ? `${platos.length} platos activos${platosSinDescripcion.length ? `, ${platosSinDescripcion.length} sin descripcion interna` : ''}.`
        : 'Aun no hay platos activos para orientar ArmonIA.',
      href: '/dashboard/platos',
      ok: platos.length > 0 && platosSinDescripcion.length === 0,
      requerido: false,
    },
    {
      id: 'experiencia',
      titulo: 'Experiencia elegida',
      texto: experienciaElegida
        ? `${experienciaLanzamiento.nombre}${experienciaLanzamiento.total ? ` - ${experienciaLanzamiento.progreso}% del plan marcado` : ''}.`
        : 'Elige el formato de entrega antes de preparar preview y QR.',
      href: '/dashboard/plantillas',
      ok: experienciaElegida,
      requerido: true,
    },
    {
      id: 'preview',
      titulo: 'Preview aprobada',
      texto: estadoLanzamiento.previewPendiente
        ? 'Falta activar la tabla de aprobaciones.'
        : previewLista
          ? 'La ultima preview vigente esta aprobada.'
          : estadoLanzamiento.previewObsoleta
            ? 'La carta cambio despues de aprobar la preview.'
            : 'Genera y aprueba la preview privada.',
      href: '/dashboard/qr#preview-privada',
      ok: previewLista,
      requerido: true,
    },
    {
      id: 'publicacion',
      titulo: 'Destino publicado',
      texto: cartaPublicada ? 'El QR publico responde sin token.' : 'La carta sigue en borrador.',
      href: '/dashboard/qr',
      ok: cartaPublicada,
      requerido: true,
    },
    {
      id: 'material',
      titulo: 'QR preparado',
      texto: qrPreparado
        ? 'Ya hay descarga, impresion, copia de enlace o escaneo real.'
        : 'Descarga o imprime el QR despues de publicar.',
      href: '/dashboard/qr',
      ok: qrPreparado,
      requerido: true,
    },
    {
      id: 'escaneo',
      titulo: 'Primer escaneo real',
      texto: primerEscaneoReal
        ? `${Math.max(estadoLanzamiento.escaneosReales, stats.escaneos)} escaneos detectados.`
        : 'Aun no hay escaneos reales de clientes.',
      href: '/dashboard/qr',
      ok: primerEscaneoReal,
      requerido: false,
    },
  ]
  const pasosLanzamientoRequeridos = pasosLanzamiento.filter(paso => paso.requerido)
  const pasosLanzamientoCompletados = pasosLanzamiento.filter(paso => paso.ok).length
  const pasosLanzamientoRequeridosCompletados = pasosLanzamientoRequeridos.filter(paso => paso.ok).length
  const progresoLanzamiento = porcentaje(pasosLanzamientoCompletados, pasosLanzamiento.length)
  const lanzamientoListoMesa = Boolean(pasosLanzamientoRequeridos.length && pasosLanzamientoRequeridosCompletados === pasosLanzamientoRequeridos.length)
  const siguienteLanzamiento = pasosLanzamiento.find(paso => !paso.ok && paso.requerido) || pasosLanzamiento.find(paso => !paso.ok) || null
  const mostrarChecklistLanzamiento = !perfilBodega && (
    cartaPublicable ||
    previewLista ||
    cartaPublicada ||
    estadoLanzamiento.eventosEntrega > 0 ||
    experienciaElegida ||
    estadoLanzamiento.loading
  )

  const tareasInicio = perfilBodega
    ? [
        { id: 'bodega_vinos', titulo: 'Cargar referencias de bodega', texto: 'Importa o crea los vinos con stock inicial, precio y datos principales.', href: '/dashboard/vinos?importar=1', autoHide: () => vinosActivos.length > 0 },
        { id: 'bodega_control', titulo: 'Completar control de bodega', texto: 'Coste, proveedor y stock actual convierten la lista en una herramienta de gestion.', href: '/dashboard/bodega#referencias-pendientes', feature: 'bodega', autoHide: () => vinosActivos.length === 0 || (sinCosteCompra.length === 0 && sinProveedor.length === 0 && vinosSinStock.length === 0 && sinStockMinimo.length === 0) },
      ]
    : [
        { id: 'vinos', titulo: 'Cargar carta de vinos', texto: 'Importa o crea las referencias principales con precio visible antes de publicar.', href: '/dashboard/vinos?importar=1', autoHide: () => cartaPublicable },
        { id: 'platos', titulo: 'Cargar platos clave', texto: 'Añade los platos que más se venden para que el maridaje tenga contexto real.', href: '/dashboard/platos?importar=1', autoHide: () => platos.length > 0 },
        { id: 'descripciones_platos', titulo: 'Definir platos para maridaje', texto: 'Describe técnica, salsa, intensidad e ingredientes clave. Es información interna: no se muestra como receta en la carta pública.', href: '/dashboard/platos?filtro=descripcion', autoHide: () => platos.length === 0 || platosSinDescripcion.length === 0 },
        { id: 'bodega', titulo: 'Completar margen, proveedor y stock', texto: 'Coste, proveedor y stock actual convierten la carta en control de bodega.', href: '/dashboard/bodega#referencias-pendientes', feature: 'bodega', autoHide: () => sinCosteCompra.length === 0 && sinProveedor.length === 0 && vinosSinStock.length === 0 },
        { id: 'plantillas', titulo: 'Elegir experiencia de entrega', texto: 'Define si vas a lanzar QR, temporada, degustacion, premium o evento privado antes de preparar el material.', href: '/dashboard/plantillas', autoHide: () => experienciaElegida },
        { id: 'qr', titulo: 'Probar QR y modo camarero', texto: 'Abre la prueba interna, revisa móvil y publica solo cuando la pantalla QR confirme contenido mínimo.', href: '/dashboard/qr', autoHide: () => previewLista && cartaPublicada && qrPreparado },
      ]
  const tareasInicioVisibles = tareasInicio.filter(tarea =>
    !tareasOcultas.includes(tarea.id) &&
    (!tarea.feature || puedeUsar(restaurante, tarea.feature)) &&
    !tarea.autoHide?.()
  )
  const tareasInicioAplicables = tareasInicio.filter(tarea => !tarea.feature || puedeUsar(restaurante, tarea.feature))
  const tareasInicioCompletadas = tareasInicioAplicables.length - tareasInicioVisibles.length
  const progresoActivacion = porcentaje(tareasInicioCompletadas, tareasInicioAplicables.length)
  const activacionCompacta = progresoActivacion >= 60 && tareasInicioVisibles.length <= 2
  const siguienteActivacion = tareasInicioVisibles[0]
  const colaActivacion = tareasInicioVisibles.slice(1)
  const mostrarOperativaDiaria = tareasInicioVisibles.length === 0 || activacionCompacta
  const enlaceRevisionActivacion = perfilBodega ? '/dashboard/bodega' : cartaPublicable ? '/dashboard/qr' : '/dashboard/vinos?filtro=pendientes'
  const textoRevisionActivacion = perfilBodega ? 'Abrir bodega' : cartaPublicable ? 'Revisar QR' : 'Completar carta'

  const alertasSala = stats.incidenciasSala + stats.dudasSala
  const haySenalesSala = stats.ventasHoy + alertasSala > 0
  const etiquetaServicio = etiquetaDia === 'ultimo_dia_demo' ? 'último servicio demo' : 'hoy'
  const siguienteTurno = perfilBodega
    ? bajoMinimo.length > 0
      ? { label: 'Preparar pedido', href: '/dashboard/bodega#pedido', detalle: `${bajoMinimo.length} referencias bajo minimo` }
      : sinCosteCompra.length + sinProveedor.length + vinosSinStock.length + sinStockMinimo.length > 0
        ? { label: 'Completar datos de bodega', href: '/dashboard/bodega#referencias-pendientes', detalle: `${sinCosteCompra.length + sinProveedor.length + vinosSinStock.length + sinStockMinimo.length} datos pendientes` }
        : { label: 'Abrir bodega', href: '/dashboard/bodega', detalle: 'Stock, margen y compras bajo control' }
    : alertasSala > 0
      ? { label: 'Resolver señales', href: '/dashboard/cierre', detalle: `${alertasSala} señales requieren decisión` }
      : stats.ventasHoy > 0 && !turnoCerrado
        ? { label: 'Cerrar turno', href: '/dashboard/cierre', detalle: `${stats.ventasHoy} ventas marcadas ${etiquetaServicio}` }
        : bajoMinimo.length > 0
          ? { label: 'Preparar pedido', href: '/dashboard/bodega#pedido', detalle: `${bajoMinimo.length} referencias bajo mínimo` }
          : { label: 'Abrir briefing', href: '/dashboard/sala', detalle: 'Sala lista para preparar el servicio' }
  const estadoTurno = perfilBodega
    ? bajoMinimo.length > 0 ? 'Compra pendiente' : sinCosteCompra.length + sinProveedor.length + vinosSinStock.length + sinStockMinimo.length > 0 ? 'Datos pendientes' : 'Bodega estable'
    : turnoCerrado
      ? 'Turno cerrado'
      : haySenalesSala
        ? 'Turno con señales'
        : 'Turno limpio'
  const faltasOperativas = [
    vinosSinPrecio.length > 0 && `${vinosSinPrecio.length} vinos sin precio`,
    vinosSinPerfil.length > 0 && `${vinosSinPerfil.length} vinos sin descripcion`,
    !perfilBodega && platosSinPrecio.length > 0 && `${platosSinPrecio.length} platos sin precio`,
    !perfilBodega && platosSinDescripcion.length > 0 && `${platosSinDescripcion.length} platos sin descripcion`,
    perfilBodega && sinCosteCompra.length > 0 && `${sinCosteCompra.length} referencias sin coste`,
    perfilBodega && sinProveedor.length > 0 && `${sinProveedor.length} referencias sin proveedor`,
    perfilBodega && vinosSinStock.length > 0 && `${vinosSinStock.length} referencias sin stock actual`,
    perfilBodega && sinStockMinimo.length > 0 && `${sinStockMinimo.length} referencias sin minimo`,
    bajoMinimo.length > 0 && `${bajoMinimo.length} referencias bajo minimo`,
  ].filter(Boolean)
  const accionPrincipal = radarPrincipal
    ? { label: radarPrincipal.titulo, href: radarPrincipal.href, detalle: `${radarPrincipal.area} · ${radarPrincipal.prioridad}` }
    : acciones[0]
      ? { label: acciones[0].texto, href: acciones[0].href, detalle: acciones[0].tipo }
      : siguienteTurno
  const accionesSecundarias = acciones.slice(1, 4)
  const accesoSimuladorRentabilidad = {
    texto: perfilBodega ? 'Ver mapa estrella y joyas' : 'Ver simulador de rentabilidad',
    href: perfilBodega ? '/dashboard/menu-engineering' : '/dashboard/simulador',
    tipo: perfilBodega ? 'Mapa de bodega' : (puedeUsar(restaurante, 'precios_margenes') ? 'Rentabilidad' : 'Plan Sala'),
  }
  const accionesInicio = accionesRadarAbiertas.length
    ? [accesoSimuladorRentabilidad, ...accionesRadarAbiertas.slice(0, 3).map(item => ({ texto: item.titulo, href: item.href, tipo: item.area }))]
    : [accesoSimuladorRentabilidad, ...(acciones.length ? acciones.slice(0, 3) : [siguienteTurno])]
  const resumenOperativo = perfilBodega
    ? [
        `${calidadGlobal}% control de bodega`,
        `${bajoMinimo.length} bajo minimo`,
        `${sinCosteCompra.length + sinProveedor.length + sinStockMinimo.length} datos pendientes`,
      ].join(' · ')
    : [
        `${calidadGlobal}% salud de carta`,
        `${stats.ventasHoy} ventas ${etiquetaServicio}`,
        `${alertasSala} señales de sala`,
      ].join(' · ')

  const kpisSemanales = resumenSemanal?.kpis || {}
  const decisionesSemanales = resumenSemanal?.decisiones || []
  const ganadoSemanal = resumenSemanal?.ganado || []
  const pendienteSemanal = resumenSemanal?.pendiente || []
  const comparacionSemanal = resumenSemanal?.comparacion || null
  const persistenciaSemanal = resumenSemanal?.persistencia || {}
  const entregaSemanal = resumenSemanal?.delivery || {}
  const estadoEntregaSemanal = entregaSemanal.status || entregaSemanal.delivery_status || (persistenciaSemanal.sent_at ? 'sent' : 'draft')
  const etiquetaEntregaSemanal = estadoEntregaSemanal === 'sent'
    ? 'enviado'
    : estadoEntregaSemanal === 'failed'
      ? 'fallido'
      : estadoEntregaSemanal === 'disabled'
        ? 'pausado'
        : estadoEntregaSemanal === 'pending'
          ? 'pendiente'
          : 'sin enviar'
  const destinatarioSemanal = resumenPrefsDraft.recipient_email || entregaSemanal.recipient_email || restaurante?.email || ''
  const diaRutinaSemanal = DIAS_ENVIO_RESUMEN.find(item => item.value === Number(resumenPrefsDraft.send_day))?.label || 'Lunes'
  const mostrarResumenSemanal = mostrarOperativaDiaria && (resumenSemanalLoading || resumenSemanalError || resumenSemanal)
  const valorStock = vinosActivos.reduce((sum, vino) => sum + (decimal(vino.stock) * decimal(vino.coste_compra)), 0)
  const vinosConMargen = vinosActivos.filter(vino => decimal(vino.precio_botella) > 0 && decimal(vino.coste_compra) > 0)
  const margenMedio = vinosConMargen.length
    ? Math.round(vinosConMargen.reduce((sum, vino) => {
        const pvpNeto = decimal(vino.precio_botella) / 1.1
        const coste = decimal(vino.coste_compra)
        return sum + (pvpNeto > 0 ? ((pvpNeto - coste) / pvpNeto) * 100 : 0)
      }, 0) / vinosConMargen.length)
    : 0
  const referenciasListas = vinosActivos.filter(vino =>
    decimal(vino.precio_botella) > 0 &&
    decimal(vino.coste_compra) > 0 &&
    String(vino.proveedor || '').trim() &&
    decimal(vino.stock_minimo) > 0
  ).length
  const vinosPorCopa = vinosActivos.filter(vino => decimal(vino.precio_copa) > 0).length
  const referenciasCriticas = bajoMinimo.length + vinosSinStock.length

  return (
    <main>
      <div className={styles.wrap}>
        {tareasInicioVisibles.length > 0 && (
          <section className={`${styles.activationPanel} ${activacionCompacta ? styles.activationCompact : ''}`}>
            <div className={styles.activationHead}>
              <div>
                <p className={styles.eyebrow}>Puesta en marcha</p>
                <h1>{perfilBodega ? 'Ordena tu bodega profesional' : activacionReciente ? 'Tu cuenta está activa. Publiquemos la carta.' : 'Publica tu primera Carta Viva'}</h1>
                <p>{perfilBodega ? 'Completa estos pasos para controlar stock, coste, proveedor y reposición desde el primer día.' : 'Completa estos pasos en orden. Cuando termines, tendrás carta pública, maridaje y QR revisados antes de llevarlos a mesa.'}</p>
              </div>
              <div className={styles.activationProgress}>
                <strong>{progresoActivacion}%</strong>
                <span>{tareasInicioCompletadas} de {tareasInicioAplicables.length} pasos</span>
              </div>
            </div>
            {activacionReciente && !perfilBodega && (
              <div className={styles.activationWelcome}>
                <strong>Cuenta activada</strong>
                <span>Ahora deja la carta lista para enseñar: primero contenido, después prueba pública y QR.</span>
              </div>
            )}
            <div className={styles.activationBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresoActivacion}>
              <span style={{ width: `${progresoActivacion}%` }} />
            </div>
            <div className={styles.activationStepsFocused}>
              {siguienteActivacion && (
                <article className={styles.activationCurrent}>
                  <span>{tareasInicioAplicables.findIndex(item => item.id === siguienteActivacion.id) + 1}</span>
                  <div>
                    <small>Siguiente paso</small>
                    <strong>{siguienteActivacion.titulo}</strong>
                    <p>{siguienteActivacion.texto}</p>
                  </div>
                  <div className={styles.activationStepActions}>
                    <Link href={siguienteActivacion.href}>Continuar</Link>
                    <button type="button" onClick={() => marcarTareaInicio(siguienteActivacion.id)}>Marcar revisado</button>
                  </div>
                </article>
              )}
              {colaActivacion.length > 0 && (
                <div className={styles.activationQueue}>
                  <p>Después</p>
                  {colaActivacion.map(tarea => (
                    <Link key={tarea.id} href={tarea.href}>
                      <span>{tareasInicioAplicables.findIndex(item => item.id === tarea.id) + 1}</span>
                      <strong>{tarea.titulo}</strong>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.activationTrust}>
              <span>Avanza paso a paso sin publicar nada por sorpresa</span>
              <span>{perfilBodega ? 'El criterio del sumiller sigue al mando' : 'Tu carta no se publica sola'}</span>
              <Link href={enlaceRevisionActivacion}>{textoRevisionActivacion}</Link>
            </div>
          </section>
        )}

        {mostrarChecklistLanzamiento && (
          <section className={styles.launchPanel}>
            <div className={styles.launchHead}>
              <div>
                <p className={styles.eyebrow}>Lanzamiento de mesa</p>
                <h2>{lanzamientoListoMesa ? 'QR listo para servicio' : 'Checklist antes de poner el QR'}</h2>
                <p>
                  {lanzamientoListoMesa
                    ? 'Contenido, aprobacion, publicacion y material estan alineados para trabajar en sala.'
                    : 'Sigue estos controles para evitar publicar una carta incompleta, sin aprobar o sin material probado.'}
                </p>
              </div>
              <div className={styles.launchProgress}>
                <strong>{progresoLanzamiento}%</strong>
                <span>{pasosLanzamientoCompletados} de {pasosLanzamiento.length} controles</span>
              </div>
            </div>
            <div className={styles.launchBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresoLanzamiento}>
              <span style={{ width: `${progresoLanzamiento}%` }} />
            </div>
            <div className={styles.launchExperience}>
              <div>
                <span>Experiencia de entrega</span>
                <strong>{experienciaElegida ? experienciaLanzamiento.nombre : 'Sin experiencia elegida'}</strong>
                <small>
                  {experienciaElegida
                    ? experienciaLanzamiento.total
                      ? `${experienciaLanzamiento.completados}/${experienciaLanzamiento.total} pasos del plan marcados${experienciaLanzamiento.responsable ? ` - ${experienciaLanzamiento.responsable}` : ''}.`
                      : 'Plantilla elegida. Completa el plan operativo cuando prepares la entrega.'
                    : 'Elige una plantilla para orientar copy, QR, preview y material.'}
                </small>
              </div>
              <Link href="/dashboard/plantillas">{experienciaElegida ? 'Abrir plan' : 'Elegir plantilla'}</Link>
            </div>
            <div className={styles.launchSteps}>
              {pasosLanzamiento.map((paso, index) => (
                <Link
                  key={paso.id}
                  href={paso.href}
                  className={`${styles.launchStep} ${paso.ok ? styles.launchStepOk : siguienteLanzamiento?.id === paso.id ? styles.launchStepCurrent : ''}`}
                >
                  <span>{paso.ok ? 'OK' : index + 1}</span>
                  <strong>{paso.titulo}</strong>
                  <small>{paso.texto}</small>
                  <em>{paso.requerido ? 'Obligatorio' : 'Recomendado'}</em>
                </Link>
              ))}
            </div>
            <div className={styles.launchDecision}>
              <div>
                <strong>{estadoLanzamiento.loading ? 'Comprobando estado de lanzamiento' : lanzamientoListoMesa ? 'Preparado para mesa' : siguienteLanzamiento?.titulo || 'Revisar lanzamiento'}</strong>
                <span>
                  {estadoLanzamiento.error ||
                    (estadoLanzamiento.analyticsPendiente
                      ? 'La analitica de entrega esta pendiente de base de datos.'
                      : lanzamientoListoMesa
                        ? `${estadoLanzamiento.escaneosReales || stats.escaneos || 0} escaneos reales detectados.`
                        : siguienteLanzamiento?.texto)}
                </span>
              </div>
              <Link href={siguienteLanzamiento?.href || '/dashboard/qr'}>
                {lanzamientoListoMesa ? 'Abrir QR' : 'Resolver siguiente'}
              </Link>
            </div>
          </section>
        )}

        {mostrarOperativaDiaria && (
          <>
            <section className={styles.priorityPanel}>
              <div>
                <p className={styles.eyebrow}>Prioridad de hoy</p>
                <h1>{accionPrincipal.label}</h1>
                <p>{accionPrincipal.detalle || resumenOperativo}</p>
              </div>
              <div className={styles.prioritySide}>
                <span>{resumenOperativo}</span>
                <Link href={accionPrincipal.href}>Abrir tarea</Link>
              </div>
            </section>

            {perfilBodega && (
              <section className={styles.cellarCommandPanel}>
                <div className={styles.cellarCommandHead}>
                  <div>
                    <p className={styles.eyebrow}>Direccion de bodega</p>
                    <h2>Carta Viva Sumiller</h2>
                    <p>Lectura ejecutiva para decidir compras, margen, rotacion y altas sin volver al Excel.</p>
                  </div>
                  <Link href="/dashboard/simulador">Simular rentabilidad</Link>
                </div>
                <div className={styles.cellarCommandMetrics}>
                  <article>
                    <span>Referencias activas</span>
                    <strong>{vinosActivos.length}</strong>
                    <small>{referenciasListas} listas con coste, proveedor, minimo y PVP</small>
                  </article>
                  <article>
                    <span>Valor de stock</span>
                    <strong>{eur(valorStock)}</strong>
                    <small>{referenciasCriticas} referencias criticas por stock o minimo</small>
                  </article>
                  <article>
                    <span>Margen medio</span>
                    <strong>{margenMedio || '-'}%</strong>
                    <small>{vinosConMargen.length} referencias con coste y PVP defendibles</small>
                  </article>
                  <article>
                    <span>Por copa</span>
                    <strong>{vinosPorCopa}</strong>
                    <small>Copa visible solo donde el sumiller la haya definido</small>
                  </article>
                </div>
                <div className={styles.cellarCommandGrid}>
                  <Link href="/dashboard/menu-engineering">
                    <span>Mapa estrella/joya</span>
                    <strong>Ver vinos que empujan o estan ocultos</strong>
                  </Link>
                  <Link href="/dashboard/bodega#pedido">
                    <span>Pedido inteligente</span>
                    <strong>Preparar reposicion y evitar compras de mas</strong>
                  </Link>
                  <Link href="/dashboard/catalogo">
                    <span>Catalogo distribuidores</span>
                    <strong>Buscar referencias reales y crear candidatas</strong>
                  </Link>
                  <Link href="/dashboard/constructor">
                    <span>Constructor de carta</span>
                    <strong>Maquetar salida cliente e interna</strong>
                  </Link>
                </div>
              </section>
            )}

            {mostrarResumenSemanal && (
              <section className={styles.weeklyPanel}>
                <div className={styles.weeklyHead}>
                  <div>
                    <p className={styles.eyebrow}>Resumen semanal</p>
                    <h2>{resumenSemanal?.titular || 'Preparando lectura ejecutiva'}</h2>
                    <p>
                      {resumenSemanal?.rango?.label || 'Ultimos 7 dias'} · confianza {resumenSemanal?.confianza || 'calculando'}
                      {persistenciaSemanal.guardado ? ' · foto guardada' : ' · foto sin guardar'}
                      {` - envio ${etiquetaEntregaSemanal}`}
                    </p>
                  </div>
                  <div className={styles.weeklyActions}>
                    <button type="button" onClick={() => cargarResumenSemanal(restaurante?.id, restaurante)} disabled={resumenSemanalLoading || !restaurante?.id}>
                      {resumenSemanalLoading ? 'Actualizando' : 'Recalcular'}
                    </button>
                    <button type="button" onClick={guardarResumenSemanal} disabled={resumenSemanalSaving || !resumenSemanal || !restaurante?.id}>
                      {resumenSemanalSaving ? 'Guardando' : persistenciaSemanal.guardado ? 'Actualizar foto' : 'Guardar foto'}
                    </button>
                    <button type="button" onClick={enviarResumenSemanalAhora} disabled={resumenSemanalSending || !resumenSemanal || !restaurante?.id}>
                      {resumenSemanalSending ? 'Enviando' : 'Enviar'}
                    </button>
                    <button type="button" onClick={copiarResumenSemanal} disabled={!resumenSemanal?.copy_text}>
                      Copiar
                    </button>
                    <Link href="/dashboard/estadisticas">Ver detalle</Link>
                  </div>
                </div>

                {resumenSemanalMensaje && <div className={styles.weeklyNotice}>{resumenSemanalMensaje}</div>}
                {resumenSemanalError && <div className={styles.radarNotice}>{resumenSemanalError}</div>}

                {resumenSemanal && (
                  <>
                    <div className={styles.weeklyRoutine}>
                      <div className={styles.weeklyRoutineState}>
                        <span>Rutina semanal</span>
                        <strong>{resumenPrefsDraft.enabled ? 'Activa' : 'Pausada'} - {diaRutinaSemanal} {String(resumenPrefsDraft.send_hour).padStart(2, '0')}:00</strong>
                        <small>{resumenPrefsDraft.channel === 'email' ? destinatarioSemanal || 'sin destinatario' : 'envio manual'} - estado {etiquetaEntregaSemanal}</small>
                      </div>
                      <label className={styles.weeklyCheck}>
                        <input
                          type="checkbox"
                          checked={Boolean(resumenPrefsDraft.enabled)}
                          onChange={event => setResumenPrefsDraft(prev => ({ ...prev, enabled: event.target.checked }))}
                        />
                        <span>Activa</span>
                      </label>
                      <label>
                        <span>Destinatario</span>
                        <input
                          type="email"
                          value={resumenPrefsDraft.recipient_email}
                          onChange={event => setResumenPrefsDraft(prev => ({ ...prev, recipient_email: event.target.value }))}
                          placeholder={restaurante?.email || 'gerencia@restaurante.com'}
                        />
                      </label>
                      <label>
                        <span>Canal</span>
                        <select
                          value={resumenPrefsDraft.channel}
                          onChange={event => setResumenPrefsDraft(prev => ({ ...prev, channel: event.target.value }))}
                        >
                          <option value="email">Email</option>
                          <option value="manual">Manual</option>
                        </select>
                      </label>
                      <label>
                        <span>Dia</span>
                        <select
                          value={resumenPrefsDraft.send_day}
                          onChange={event => setResumenPrefsDraft(prev => ({ ...prev, send_day: Number(event.target.value) }))}
                        >
                          {DIAS_ENVIO_RESUMEN.map(dia => (
                            <option value={dia.value} key={dia.value}>{dia.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Hora</span>
                        <select
                          value={resumenPrefsDraft.send_hour}
                          onChange={event => setResumenPrefsDraft(prev => ({ ...prev, send_hour: Number(event.target.value) }))}
                        >
                          {Array.from({ length: 13 }, (_, index) => index + 7).map(hora => (
                            <option value={hora} key={hora}>{String(hora).padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" onClick={guardarRutinaSemanal} disabled={resumenPrefsSaving || !restaurante?.id}>
                        {resumenPrefsSaving ? 'Guardando' : 'Guardar rutina'}
                      </button>
                    </div>

                    <div className={styles.weeklyMetrics}>
                      <article>
                        <span>Ganado</span>
                        <strong>{kpisSemanales.beneficio_bruto_texto || '0 EUR'}</strong>
                        <small>
                          {kpisSemanales.ventas_kpi || 0} ventas KPI · margen {kpisSemanales.margen_medio_texto || '0%'}
                          {comparacionSemanal ? ` · ${comparacionSemanal.beneficio_bruto_delta >= 0 ? '+' : ''}${comparacionSemanal.beneficio_bruto_delta} EUR vs anterior` : ''}
                        </small>
                      </article>
                      <article>
                        <span>Recomendacion</span>
                        <strong>{kpisSemanales.beneficio_recomendacion_texto || '0 EUR'}</strong>
                        <small>{kpisSemanales.conversion_recomendacion_texto || '0%'} conversion · {kpisSemanales.ventas_tpv_atribuidas || 0} TPV atribuidas</small>
                      </article>
                      <article>
                        <span>Por capturar</span>
                        <strong>{kpisSemanales.recuperable_semana_texto || '0 EUR'}</strong>
                        <small>
                          {kpisSemanales.ventas_tpv_no_atribuidas || 0} TPV sin atribuir · {kpisSemanales.ventas_sin_coste || 0} ventas sin coste
                          {comparacionSemanal ? ` · ${comparacionSemanal.recuperable_semana_delta >= 0 ? '+' : ''}${comparacionSemanal.recuperable_semana_delta} EUR vs anterior` : ''}
                        </small>
                      </article>
                      <article>
                        <span>Escenarios</span>
                        <strong>{kpisSemanales.oportunidad_anual_texto || '0 EUR'}</strong>
                        <small>Impacto anual pendiente de decision</small>
                      </article>
                    </div>

                    {comparacionSemanal && (
                      <div className={styles.weeklyEvolution}>
                        <span>Evolucion vs foto anterior</span>
                        <strong>{comparacionSemanal.beneficio_bruto_delta >= 0 ? '+' : ''}{comparacionSemanal.beneficio_bruto_delta} EUR ganado</strong>
                        <strong>{comparacionSemanal.recuperable_semana_delta >= 0 ? '+' : ''}{comparacionSemanal.recuperable_semana_delta} EUR por capturar</strong>
                        <strong>{comparacionSemanal.ventas_kpi_delta >= 0 ? '+' : ''}{comparacionSemanal.ventas_kpi_delta} ventas KPI</strong>
                      </div>
                    )}

                    <div className={styles.weeklyGrid}>
                      <div className={styles.weeklyBlock}>
                        <h3>3 decisiones</h3>
                        <div className={styles.weeklyDecisionList}>
                          {decisionesSemanales.length ? decisionesSemanales.map((decision, index) => (
                            <Link href={decision.href || '/dashboard'} key={`${decision.titulo}-${index}`}>
                              <span>{decision.area} · {decision.prioridad}</span>
                              <strong>{decision.titulo}</strong>
                              <small>{decision.accion}</small>
                            </Link>
                          )) : (
                            <p>Sin decision urgente. Mantener briefing y revisar una oportunidad rentable.</p>
                          )}
                        </div>
                      </div>

                      <div className={styles.weeklyBlock}>
                        <h3>Ganado y pendiente</h3>
                        <div className={styles.weeklyValueList}>
                          {(ganadoSemanal.length ? ganadoSemanal.slice(0, 3) : [{ titulo: 'Ganado defendible', valor_texto: '0 EUR', detalle: 'Faltan ventas con precio y coste esta semana.', href: '/dashboard/estadisticas' }]).map(item => (
                            <Link href={item.href || '/dashboard'} key={`ganado-${item.titulo}`}>
                              <span>{item.titulo}</span>
                              <strong>{item.valor_texto}</strong>
                              <small>{item.detalle}</small>
                            </Link>
                          ))}
                          {pendienteSemanal.slice(0, 3).map(item => (
                            <Link href={item.href || '/dashboard'} key={`pendiente-${item.titulo}`} className={styles.weeklyPending}>
                              <span>{item.titulo}</span>
                              <strong>{item.valor_texto}</strong>
                              <small>{item.detalle}</small>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {(radarLoading || radarError || radarAcciones.length > 0) && (
              <section className={styles.dailyRadarPanel}>
                <div className={styles.dailyRadarHead}>
                  <div>
                    <p className={styles.eyebrow}>Radar diario</p>
                    <h2>{accionesRadarAbiertas.length ? 'Acciones operativas de hoy' : 'Dia operativo controlado'}</h2>
                    <p>
                      {radarPersistidas
                        ? `${accionesRadarHechas} hechas · ${accionesRadarAbiertas.length} abiertas`
                        : 'Lectura generada; aplica la migracion para guardar estados.'}
                    </p>
                  </div>
                  <button type="button" onClick={() => cargarRadarDiario(restaurante?.id)} disabled={radarLoading || !restaurante?.id}>
                    {radarLoading ? 'Actualizando' : 'Recalcular'}
                  </button>
                </div>
                {radarError && <div className={styles.radarNotice}>{radarError}</div>}
                <div className={styles.dailyRadarList}>
                  {(accionesRadarAbiertas.length ? accionesRadarAbiertas : radarAcciones).slice(0, 6).map(accion => (
                    <article className={styles.dailyRadarItem} key={accion.id || accion.clave}>
                      <div>
                        <span>{accion.area} · {accion.prioridad}</span>
                        <h3>{accion.titulo}</h3>
                        <p>{accion.detalle}</p>
                        <p>{accion.accion}</p>
                      </div>
                      <div className={styles.dailyRadarActions}>
                        <Link href={accion.href || '/dashboard'}>Abrir</Link>
                        {radarPersistidas && !['hecha', 'descartada'].includes(accion.estado) && (
                          <>
                            <button
                              type="button"
                              disabled={accionandoRadar === accion.id}
                              onClick={() => actualizarRadarDiario(accion, accion.estado === 'en_progreso' ? 'pendiente' : 'en_progreso')}
                            >
                              {accion.estado === 'en_progreso' ? 'Pausar' : 'En curso'}
                            </button>
                            <button type="button" disabled={accionandoRadar === accion.id} onClick={() => actualizarRadarDiario(accion, 'hecha')}>
                              Hecha
                            </button>
                            <button type="button" disabled={accionandoRadar === accion.id} onClick={() => actualizarRadarDiario(accion, 'descartada')}>
                              Descartar
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className={styles.focusPanel}>
              <div className={styles.focusBlock}>
                <p className={styles.eyebrow}>Trabajo pendiente</p>
                <h2>{acciones.length ? 'Acciones abiertas' : 'Sin urgencias ahora'}</h2>
                <div className={styles.focusList}>
                  {accionesInicio.map(accion => (
                    <Link key={accion.texto || accion.label} href={accion.href}>
                      <span>{accion.tipo || 'Operativa'}</span>
                      <strong>{accion.texto || accion.label}</strong>
                    </Link>
                  ))}
                </div>
              </div>

              <div className={styles.focusBlock}>
                <p className={styles.eyebrow}>Estado</p>
                <h2>{estadoCarta}</h2>
                <div className={styles.stateRows}>
                  <span><strong>{calidadGlobal}%</strong> {perfilBodega ? 'control de bodega' : 'salud de carta'}</span>
                  <span><strong>{estadoTurno}</strong> {perfilBodega ? 'bodega' : 'sala'}</span>
                  <span><strong>{perfilBodega ? bajoMinimo.length : alertasSala}</strong> {perfilBodega ? 'bajo minimo' : 'señales pendientes'}</span>
                </div>
                <div className={styles.stateCallout}>
                  {perfilBodega
                    ? faltasOperativas.length
                      ? faltasOperativas.slice(0, 3).join(' · ')
                      : 'Bodega sin bloqueos visibles de stock, coste o proveedor.'
                    : alertasSala > 0
                    ? `${alertasSala} señales de sala pendientes de revisar.`
                    : faltasOperativas.length
                      ? faltasOperativas.slice(0, 3).join(' · ')
                      : 'Carta, sala y bodega sin bloqueos visibles.'}
                </div>
                <div className={styles.focusActions}>
                  {perfilBodega ? (
                    <>
                      <Link href="/dashboard/vinos">Referencias</Link>
                      <Link href="/dashboard/bodega">Bodega</Link>
                      <Link href="/dashboard/menu-engineering">Estrellas y joyas</Link>
                      <Link href="/dashboard/inventario">Inventario</Link>
                    </>
                  ) : (
                    <>
                      <Link href="/dashboard/carta">Carta</Link>
                      {puedeUsar(restaurante, 'modo_camarero') && <Link href="/dashboard/sala">Sala</Link>}
                      {puedeUsar(restaurante, 'bodega') && <Link href="/dashboard/bodega">Bodega</Link>}
                      <Link href="/dashboard/simulador">Simulador</Link>
                    </>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {mostrarOperativaDiaria && accionesSecundarias.length > 0 && (
          <section className={styles.todayActions}>
            <div>
              <p className={styles.eyebrow}>Siguiente</p>
              <h2>Después de la prioridad</h2>
            </div>
            <div className={styles.todayActionList}>
              {accionesSecundarias.map(accion => (
                <Link key={accion.texto || accion.label} href={accion.href}>
                  <span>{accion.tipo || 'Operativa'}</span>
                  <strong>{accion.texto || accion.label}</strong>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </main>
  )
}
