'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../supabase'
import { getEffectiveRestaurantEmail, isAdminEmail } from '../demo'
import {
  SELECT_CLIENT_PLATO_DASHBOARD,
  SELECT_CLIENT_PROPUESTA_ADMIN,
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
  SELECT_CLIENT_VINO_DASHBOARD,
} from '../lib/clientSupabaseSelects'
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
  })} €`
}

function labelNavegacion(href = '') {
  if (!href || href === '/dashboard') return 'Ir al panel →'
  if (href.includes('cierre#incidencias')) return 'Ir a incidencias →'
  if (href.includes('cierre#dudas')) return 'Ir a dudas de sala →'
  if (href.includes('cierre')) return 'Ir al cierre →'
  if (href.includes('bodega#pedido')) return 'Ir a pedido →'
  if (href.includes('bodega#referencias-sin-coste')) return 'Completar costes →'
  if (href.includes('bodega#referencias-pendientes')) return 'Ir a bodega →'
  if (href.includes('bodega#propuestas')) return 'Ver propuestas →'
  if (href.includes('bodega')) return 'Ir a bodega →'
  if (href.includes('vinos?filtro=pendientes')) return 'Completar vinos →'
  if (href.includes('vinos?importar')) return 'Importar vinos →'
  if (href.includes('vinos')) return 'Ir a vinos →'
  if (href.includes('platos?filtro=descripcion')) return 'Completar platos →'
  if (href.includes('platos?importar')) return 'Importar platos →'
  if (href.includes('platos')) return 'Ir a platos →'
  if (href.includes('qr#preview-privada')) return 'Ir a preview →'
  if (href.includes('qr#pack-entrega')) return 'Ir a material QR →'
  if (href.includes('qr')) return 'Ir al QR →'
  if (href.includes('plantillas')) return 'Ir a plantillas →'
  if (href.includes('sala')) return 'Ir a sala →'
  if (href.includes('estadisticas')) return 'Ver estadísticas →'
  if (href.includes('simulador')) return 'Ir al simulador →'
  if (href.includes('menu-engineering')) return 'Ver mapa de carta →'
  if (href.includes('catalogo')) return 'Ir al catálogo →'
  if (href.includes('constructor')) return 'Ir al constructor →'
  if (href.includes('inventario')) return 'Ir a inventario →'
  if (href.includes('ajustes')) return 'Ir a ajustes →'
  return 'Ir al panel →'
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
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
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


function DashboardHome() {
  const searchParams = useSearchParams()
  const checkoutOk   = searchParams.get('checkout') === 'ok'

  const [restaurante, setRestaurante] = useState(null)
  const [generandoCheckout, setGenerandoCheckout] = useState(false)
  const [esperandoWebhook, setEsperandoWebhook]   = useState(false)
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
  const [radarUndo, setRadarUndo] = useState(null)
  const [resumenSemanal, setResumenSemanal] = useState(null)
  const [resumenSemanalLoading, setResumenSemanalLoading] = useState(false)
  const [resumenSemanalSaving, setResumenSemanalSaving] = useState(false)
  const [resumenSemanalSending, setResumenSemanalSending] = useState(false)
  const [resumenPrefsSaving, setResumenPrefsSaving] = useState(false)
  const [resumenPrefsDraft, setResumenPrefsDraft] = useState(preferenciasResumenPorDefecto())
  const [resumenSemanalError, setResumenSemanalError] = useState('')
  const [resumenSemanalMensaje, setResumenSemanalMensaje] = useState('')
  const [activacionReciente, setActivacionReciente] = useState(false)
  const [kioskos, setKioskos] = useState(null)
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
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la acción.')
      setRadarAcciones(prev => prev.map(item => item.id === accion.id ? data.accion : item))
    } catch (error) {
      setRadarError(error.message || 'No se pudo actualizar la acción.')
    } finally {
      setAccionandoRadar('')
    }
  }

  function ejecutarRadarConUndo(accion, estadoNuevo) {
    if (!accion?.id || !restaurante?.id || !radarPersistidas) return
    const estadoPrevio = accion.estado
    setRadarAcciones(prev => prev.map(item =>
      item.id === accion.id ? { ...item, estado: estadoNuevo } : item
    ))
    if (radarUndo?.timer) clearTimeout(radarUndo.timer)
    const timer = setTimeout(() => {
      actualizarRadarDiario({ ...accion, estado: estadoPrevio }, estadoNuevo)
      setRadarUndo(null)
    }, 4000)
    setRadarUndo({ accion: { ...accion, estado: estadoPrevio }, estadoNuevo, timer })
  }

  function deshacerRadar() {
    if (!radarUndo) return
    clearTimeout(radarUndo.timer)
    setRadarAcciones(prev => prev.map(item =>
      item.id === radarUndo.accion.id ? { ...item, estado: radarUndo.accion.estado } : item
    ))
    setRadarUndo(null)
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
      const { email, restauranteId, isDemo, isAdmin, user } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }

      const tok = await tokenSesion()
      // Solo mostrar kioskos cuando el admin está en su propia vista, no cuando impersona un restaurante
      const viendoRestaurante = isAdmin && email !== user?.email
      if (tok && isAdmin && !viendoRestaurante) {
        const res = await fetch('/api/admin/kiosko/lista', {
          headers: { Authorization: `Bearer ${tok}` },
        })
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          setKioskos(data.tiendas || [])
        }
      }

      if (isDemo) {
        const demo = await cargarDemoDashboard(email)
        if (demo?.restaurante) {
          const rest = demo.restaurante
          setRestaurante(rest)
          setActivacionReciente(false)
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
        }
        setLoading(false)
        return
      }

      const queryRestaurante = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
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
          supabase.from('vinos').select(SELECT_CLIENT_VINO_DASHBOARD).eq('restaurante_id', rest.id),
          supabase.from('platos').select(SELECT_CLIENT_PLATO_DASHBOARD).eq('restaurante_id', rest.id).eq('activo', true),
          aplicarVentana(
            supabase.from('estadisticas').select('tipo, detalle, created_at').eq('restaurante_id', rest.id),
            ventanaDia
          ),
          supabase.from('consultor_propuestas').select(SELECT_CLIENT_PROPUESTA_ADMIN).eq('restaurante_id', rest.id).neq('estado', 'descartada').order('created_at', { ascending: false }),
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
        ])
      }
      setLoading(false)
    }
    cargar()
  }, [cargarRadarDiario, cargarResumenSemanal])

  async function irACheckoutRestaurante() {
    if (!restaurante?.id) return
    setGenerandoCheckout(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id, plan: restaurante.plan || 'premium' }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch {}
    finally { setGenerandoCheckout(false) }
  }

  // Polling tras pago exitoso: espera a que el webhook actualice subscription_status
  useEffect(() => {
    if (!checkoutOk || !restaurante) return
    if (restaurante.subscription_status !== 'pending') return
    setEsperandoWebhook(true)
    let intentos = 0
    const intervalo = setInterval(async () => {
      intentos++
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('subscription_status')
        .eq('id', restaurante.id)
        .single()
      if (rest?.subscription_status !== 'pending') {
        clearInterval(intervalo)
        setEsperandoWebhook(false)
        setRestaurante(prev => ({ ...prev, subscription_status: rest.subscription_status }))
      }
      if (intentos >= 10) { clearInterval(intervalo); setEsperandoWebhook(false) }
    }, 3000)
    return () => clearInterval(intervalo)
  }, [checkoutOk, restaurante?.subscription_status])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.15em', color: '#bbb' }}>CARGANDO</p>
    </div>
  )

  // Gate de pago: si la suscripción está pendiente y no es admin
  const esAdmin = isAdminEmail(restaurante?.email)
  if (!esAdmin && restaurante?.subscription_status === 'pending') return (
    <div style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f4f3f0',padding:24 }}>
      <div style={{ background:'#fff',borderRadius:16,padding:'48px 40px',maxWidth:460,width:'100%',boxShadow:'0 8px 32px rgba(0,0,0,.08)',textAlign:'center' }}>
        {esperandoWebhook ? (
          <>
            <div style={{ fontSize:48,marginBottom:16 }}>⏳</div>
            <h2 style={{ fontSize:22,fontWeight:700,color:'#1a1a2e',margin:'0 0 12px' }}>Activando tu cuenta...</h2>
            <p style={{ fontSize:15,color:'#666',lineHeight:1.6,margin:0 }}>Pago recibido. Estamos activando tu acceso, tardará solo unos segundos.</p>
          </>
        ) : (
          <>
            <div style={{ fontSize:48,marginBottom:16 }}>🔒</div>
            <h2 style={{ fontSize:22,fontWeight:700,color:'#1a1a2e',margin:'0 0 12px' }}>Activa tu suscripción</h2>
            <p style={{ fontSize:15,color:'#666',lineHeight:1.6,margin:'0 0 32px' }}>
              Tu cuenta está lista. Para acceder al panel de Carta Viva necesitas activar tu suscripción.
            </p>
            <button
              onClick={irACheckoutRestaurante}
              disabled={generandoCheckout}
              style={{ background:'#1a1a2e',color:'#c9a96e',border:'none',borderRadius:10,padding:'14px 32px',fontSize:16,fontWeight:700,cursor:'pointer',width:'100%' }}
            >
              {generandoCheckout ? 'Preparando pago...' : 'Activar suscripción →'}
            </button>
            <p style={{ fontSize:12,color:'#aaa',marginTop:16 }}>Pago seguro con Stripe · Cancela cuando quieras</p>
          </>
        )}
      </div>
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
  const acciones = (perfilBodega ? [
    bajoMinimo.length > 0 && { texto: `Preparar reposición de ${bajoMinimo.length} vinos`, href: '/dashboard/bodega#pedido', tipo: 'Compra' },
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
  const tareasInicio = perfilBodega
    ? [
        { id: 'bodega_vinos', titulo: 'Cargar referencias de bodega', texto: 'Importa o crea los vinos con stock inicial, precio y datos principales.', href: '/dashboard/vinos?importar=1', autoHide: () => vinosActivos.length > 0 },
        { id: 'bodega_control', titulo: 'Completar control de bodega', texto: 'Coste, proveedor y stock actual convierten la lista en una herramienta de gestión.', href: '/dashboard/bodega#referencias-pendientes', feature: 'bodega', autoHide: () => vinosActivos.length === 0 || (sinCosteCompra.length === 0 && sinProveedor.length === 0 && vinosSinStock.length === 0 && sinStockMinimo.length === 0) },
      ]
    : [
        { id: 'vinos', titulo: 'Cargar carta de vinos', texto: 'Importa o crea las referencias principales con precio visible antes de publicar.', href: '/dashboard/vinos?importar=1', autoHide: () => cartaPublicable },
        { id: 'platos', titulo: 'Cargar platos clave', texto: 'Añade los platos que más se venden para que el maridaje tenga contexto real.', href: '/dashboard/platos?importar=1', autoHide: () => platos.length > 0 },
        { id: 'descripciones_platos', titulo: 'Definir platos para maridaje', texto: 'Describe técnica, salsa, intensidad e ingredientes clave. Es información interna: no se muestra como receta en la carta pública.', href: '/dashboard/platos?filtro=descripcion', autoHide: () => platos.length === 0 || platosSinDescripcion.length === 0 },
        { id: 'bodega', titulo: 'Completar margen, proveedor y stock', texto: 'Coste, proveedor y stock actual convierten la carta en control de bodega.', href: '/dashboard/bodega#referencias-pendientes', feature: 'bodega', autoHide: () => sinCosteCompra.length === 0 && sinProveedor.length === 0 && vinosSinStock.length === 0 },
        { id: 'qr', titulo: 'Probar QR y modo camarero', texto: 'Abre la prueba interna, revisa móvil y publica solo cuando la pantalla QR confirme contenido mínimo.', href: '/dashboard/qr', autoHide: () => cartaPublicada },
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
  const accionPrincipal = radarPrincipal
    ? { label: radarPrincipal.titulo, href: radarPrincipal.href, detalle: `${radarPrincipal.area} · ${radarPrincipal.prioridad}` }
    : acciones[0]
      ? { label: acciones[0].texto, href: acciones[0].href, detalle: acciones[0].tipo }
      : siguienteTurno
  const accionesSecundarias = acciones.slice(1, 4)
  const resumenOperativo = perfilBodega
    ? [
        `${calidadGlobal}% control de bodega`,
        `${bajoMinimo.length} bajo mínimo`,
        `${sinCosteCompra.length + sinProveedor.length + sinStockMinimo.length} datos pendientes`,
      ].join(' · ')
    : [
        `${calidadGlobal}% salud de carta`,
        `${stats.ventasHoy} ventas ${etiquetaServicio}`,
        `${alertasSala} señales de sala`,
      ].join(' · ')

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
      {kioskos !== null && (
        <section className={styles.kioskosPanel}>
          <div className={styles.kioskosHead}>
            <p className={styles.eyebrow}>Kioskos</p>
            <h2>Panel de tiendas activas</h2>
            <p>{kioskos.length} tienda{kioskos.length !== 1 ? 's' : ''} registrada{kioskos.length !== 1 ? 's' : ''}</p>
          </div>
          <div className={styles.kioskosGrid}>
            {kioskos.map(tienda => {
              const esTrial = tienda.plan === 'trial'
              const ahora = Date.now()
              const expMs = tienda.trial_expires_at ? new Date(tienda.trial_expires_at).getTime() : null
              const segsRestantes = esTrial && expMs ? Math.max(0, Math.round((expMs - ahora) / 1000)) : null
              const segsConsumidos = esTrial && expMs ? Math.max(0, 7200 - segsRestantes) : null
              const fmtSeg = s => {
                const h = Math.floor(s / 3600)
                const m = Math.floor((s % 3600) / 60)
                const ss = s % 60
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
              }
              return (
                <article key={tienda.slug} className={styles.kioskosCard}>
                  <div className={styles.kioskosCardHead}>
                    <strong>{tienda.nombre || tienda.slug}</strong>
                    <span className={`${styles.kioskosBadge} ${tienda.plan === 'premium' ? styles.kioskosBadgePremium : tienda.plan === 'trial' ? styles.kioskosBadgeTrial : styles.kioskosBadgeBasico}`}>
                      {tienda.plan || '—'}
                    </span>
                  </div>
                  {esTrial && (
                    <div className={styles.kioskosTrialInfo}>
                      {expMs === null ? (
                        <span className={styles.kioskosTrialNone}>Trial sin iniciar</span>
                      ) : segsRestantes === 0 ? (
                        <span className={styles.kioskosTrialExpired}>Trial expirado</span>
                      ) : (
                        <>
                          <span>Restante: <strong>{fmtSeg(segsRestantes)}</strong></span>
                          <span>Consumido: <strong>{fmtSeg(segsConsumidos)}</strong></span>
                        </>
                      )}
                    </div>
                  )}
                  {tienda.propietario_email && <small className={styles.kioskosEmail}>{tienda.propietario_email}</small>}
                  {tienda.precio_especial && <small className={styles.kioskosPrecio}>Precio especial: {tienda.precio_especial} €/mes</small>}
                  <Link href={`/kiosko-admin/${tienda.slug}`} className={styles.kioskosLink}>Gestionar →</Link>
                </article>
              )
            })}
          </div>
        </section>
      )}

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
                    <Link href={siguienteActivacion.href} className={styles.btnNav}>{labelNavegacion(siguienteActivacion.href)}</Link>
                    <button type="button" className={styles.btnEstado} onClick={() => marcarTareaInicio(siguienteActivacion.id)}>Marcar como hecho ✓</button>
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
              <Link href={enlaceRevisionActivacion} className={styles.btnNav}>{labelNavegacion(enlaceRevisionActivacion)}</Link>
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
                <div className={styles.priorityStats}>
                  <span><strong>{stats.escaneos}</strong>escaneos</span>
                  <span><strong>{stats.ventasHoy}</strong>ventas</span>
                  <span><strong>{alertasSala}</strong>señales</span>
                </div>
                <Link href={accionPrincipal.href} className={styles.btnNav}>{labelNavegacion(accionPrincipal.href)}</Link>
              </div>
            </section>

            {perfilBodega && (
              <section className={styles.cellarCommandPanel}>
                <div className={styles.cellarCommandHead}>
                  <div>
                    <p className={styles.eyebrow}>Dirección de bodega</p>
                    <h2>Carta Viva Sumiller</h2>
                    <p>Lectura ejecutiva para decidir compras, margen, rotación y altas sin volver al Excel.</p>
                  </div>
                  <Link href="/dashboard/simulador">Simular rentabilidad</Link>
                </div>
                <div className={styles.cellarCommandMetrics}>
                  <article>
                    <span>Referencias activas</span>
                    <strong>{vinosActivos.length}</strong>
                    <small>{referenciasListas} listas con coste, proveedor, mínimo y PVP</small>
                  </article>
                  <article>
                    <span>Valor de stock</span>
                    <strong>{eur(valorStock)}</strong>
                    <small>{referenciasCriticas} referencias críticas por stock o mínimo</small>
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
                    <strong>Ver vinos que empujan o están ocultos</strong>
                  </Link>
                  <Link href="/dashboard/bodega#pedido">
                    <span>Pedido inteligente</span>
                    <strong>Preparar reposición y evitar compras de más</strong>
                  </Link>
                  <Link href="/dashboard/catalogo">
                    <span>Catálogo distribuidores</span>
                    <strong>Buscar referencias reales y crear candidatas</strong>
                  </Link>
                  <Link href="/dashboard/constructor">
                    <span>Constructor de carta</span>
                    <strong>Maquetar salida cliente e interna</strong>
                  </Link>
                </div>
              </section>
            )}



            {(radarLoading || radarError || radarAcciones.length > 0) && (
              <section className={styles.dailyRadarPanel}>
                <div className={styles.dailyRadarHead}>
                  <div>
                    <p className={styles.eyebrow}>Radar diario</p>
                    <h2>{accionesRadarAbiertas.length ? 'Acciones operativas de hoy' : 'Día operativo controlado'}</h2>
                    <p>
                      {radarPersistidas
                        ? `${accionesRadarHechas} hechas · ${accionesRadarAbiertas.length} abiertas`
                        : 'Lectura generada; aplica la migración para guardar estados.'}
                    </p>
                  </div>
                </div>
                {radarError && <div className={styles.radarNotice}>{radarError}</div>}
                <div className={styles.dailyRadarList}>
                  {(accionesRadarAbiertas.length ? accionesRadarAbiertas : radarAcciones).slice(0, 3).map(accion => (
                    <article className={styles.dailyRadarItem} key={accion.id || accion.clave}>
                      <div>
                        <span>{accion.area}</span>
                        <h3>{accion.titulo}</h3>
                        <p>{accion.accion}</p>
                      </div>
                      <div className={styles.dailyRadarActions}>
                        <Link href={accion.href || '/dashboard'} className={styles.btnNav}>{labelNavegacion(accion.href)}</Link>
                        {radarPersistidas && !['hecha', 'descartada'].includes(accion.estado) && (
                          <>
                            <button
                              type="button"
                              className={styles.btnDestructivo}
                              disabled={accionandoRadar === accion.id}
                              onClick={() => ejecutarRadarConUndo(accion, 'hecha')}
                            >
                              Hecha ✓
                            </button>
                            <button
                              type="button"
                              className={styles.btnDestructivo}
                              disabled={accionandoRadar === accion.id}
                              onClick={() => ejecutarRadarConUndo(accion, 'descartada')}
                            >
                              Descartar ×
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

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

      {radarUndo && (
        <div className={styles.radarToast} role="status" aria-live="polite">
          <span>
            {radarUndo.estadoNuevo === 'hecha' ? 'Acción marcada como hecha' : 'Acción descartada'}
          </span>
          <button type="button" onClick={deshacerRadar} className={styles.radarToastUndo}>
            Deshacer
          </button>
        </div>
      )}
    </main>
  )
}

export default function Dashboard() {
  return <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh'}}><p style={{color:'#bbb',fontSize:12,letterSpacing:'.15em'}}>CARGANDO</p></div>}><DashboardHome /></Suspense>
}
