'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { esPerfilBodega } from '../../lib/plans'
import { CONTENIDO_INICIAL, puedePublicarCarta, resumirContenidoCarta } from '../../lib/publicationReadiness'
import { EXPERIENCIA_ENTREGA_INICIAL, experienciaEntregaDesdePlan, experienciaTemplateExiste } from '../../lib/experienceTemplates'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'
import ResponsiveOverlay from '../ResponsiveOverlay'

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

function formatoFechaHistorial(fecha) {
  if (!fecha) return 'Sin fecha'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function resumenContenidoHistorial(resumen = {}) {
  return [
    `${resumen.vinosActivos || 0} vinos`,
    `${resumen.vinosConPrecio || 0} con precio`,
    `${resumen.platosActivos || 0} platos`,
  ].join(' · ')
}

function firmantePreview(aprobacion = {}) {
  return aprobacion.reviewer_name || aprobacion.reviewer_email || 'enlace privado'
}

function resumenPreviewAprobada(aprobacion = {}) {
  const resumen = aprobacion.content_summary || {}
  return [
    `${resumen.vinos_activos || 0} vinos`,
    `${resumen.vinos_con_precio || 0} con precio`,
    `${resumen.platos_activos || 0} platos`,
    Number(resumen.links_visibles || 0) > 0 ? `${resumen.links_visibles} enlaces` : null,
  ].filter(Boolean).join(' · ')
}

function textoSnapshot(snapshot) {
  if (!snapshot) return null
  return `v${snapshot.version_number} · ${formatoFechaHistorial(snapshot.created_at)} · ${snapshot.actor_email || 'responsable'} · ${resumenContenidoHistorial(snapshot.contenido_resumen)}`
}

function esRestauracionSnapshot(evento = {}) {
  return evento?.contenido_resumen?.restauracion?.tipo === 'snapshot'
}

function tituloEventoPublicacion(evento = {}) {
  if (esRestauracionSnapshot(evento)) {
    const version = evento.contenido_resumen?.restauracion?.version_number
    return version ? `Restauro version v${version}` : 'Restauro una version'
  }
  return evento.accion === 'publicar' ? 'Publico la carta' : 'Pauso la carta'
}

const DELIVERY_EVENT_LABELS = {
  preview_generated: 'Preview generada',
  preview_link_copied: 'Enlace privado copiado',
  preview_message_copied: 'Mensaje privado copiado',
  preview_opened_from_dashboard: 'Preview abierta',
  preview_approved: 'Preview aprobada',
  preview_approval_refreshed: 'Aprobacion actualizada',
  publication_published: 'Carta publicada',
  publication_paused: 'Carta pausada',
  qr_downloaded: 'QR descargado',
  qr_print_opened: 'Impresion abierta',
  public_link_copied: 'Enlace publico copiado',
  team_message_copied: 'Mensaje para equipo copiado',
  public_destination_opened: 'Destino publico abierto',
  quick_view_opened: 'Vista rapida abierta',
}

const USO_REAL_INICIAL = {
  actividad_iniciada: false,
  desde: null,
  escaneos_total: 0,
  escaneos_carta: 0,
  escaneos_hub: 0,
  escaneos_otro: 0,
  por_destino: { carta: 0, hub: 0, otro: 0 },
  ultimos_escaneos: [],
}

const FORMATOS_ENTREGA = [
  {
    id: 'sobremesa',
    label: 'Sobremesa',
    detail: 'Metacrilato o mesa',
    tagline: 'Escanea para ver la carta viva',
  },
  {
    id: 'cartel',
    label: 'Cartel',
    detail: 'Entrada o barra',
    tagline: 'Carta digital y recomendaciones al momento',
  },
  {
    id: 'tarjeta',
    label: 'Tarjeta',
    detail: 'Formato pequeno',
    tagline: 'Tu carta viva',
  },
  {
    id: 'historia',
    label: 'Historia',
    detail: 'Instagram / WhatsApp',
    tagline: 'Nuestra carta viva ya esta disponible',
  },
]

function clavePlantillaEntrega(restauranteId) {
  return `carta_viva_plantilla_activa_${restauranteId}`
}

function clavePlanEntrega(restauranteId, plantillaId) {
  return `carta_viva_plan_activacion_${restauranteId}_${plantillaId}`
}

function leerExperienciaEntregaLocal(restauranteId) {
  if (!restauranteId || typeof window === 'undefined') return null
  try {
    const plantillaId = window.localStorage.getItem(clavePlantillaEntrega(restauranteId))
    if (!experienciaTemplateExiste(plantillaId)) return null
    const planLocal = JSON.parse(window.localStorage.getItem(clavePlanEntrega(restauranteId, plantillaId)) || 'null') || {}
    return experienciaEntregaDesdePlan({
      template_id: plantillaId,
      completed_steps: planLocal.completados || {},
      objective_date: planLocal.objetivo || '',
      responsible: planLocal.responsable || '',
    })
  } catch {
    return null
  }
}

function tituloEventoEntrega(evento = {}) {
  return DELIVERY_EVENT_LABELS[evento.event] || 'Evento de entrega'
}

function detalleEventoEntrega(evento = {}) {
  const destinoTexto = evento.destino === 'hub' ? 'hub' : 'carta'
  const responsable = evento.actor_email || evento.metadata?.reviewer_email || 'sistema'
  const experiencia = evento.metadata?.experiencia_label || evento.metadata?.experiencia
  return [
    formatoFechaHistorial(evento.created_at),
    destinoTexto,
    responsable,
    experiencia,
  ].filter(Boolean).join(' - ')
}

export default function QRPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [contenidoCarta, setContenidoCarta] = useState(CONTENIDO_INICIAL)
  const [historialPublicacion, setHistorialPublicacion] = useState([])
  const [historialPublicacionPendiente, setHistorialPublicacionPendiente] = useState(false)
  const [snapshotPublicacionPendiente, setSnapshotPublicacionPendiente] = useState(false)
  const [ultimoSnapshot, setUltimoSnapshot] = useState(null)
  const [historialPublicacionError, setHistorialPublicacionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [copiado, setCopiado] = useState('')
  const [vistaRapida, setVistaRapida] = useState(false)
  const [guardandoPublicacion, setGuardandoPublicacion] = useState(false)
  const [mensajePublicacion, setMensajePublicacion] = useState('')
  const [previewDestinoSeleccionado, setPreviewDestinoSeleccionado] = useState('carta')
  const [previewDuracionHoras, setPreviewDuracionHoras] = useState('24')
  const [previewLink, setPreviewLink] = useState('')
  const [previewLinkDestino, setPreviewLinkDestino] = useState('')
  const [previewCaducaAt, setPreviewCaducaAt] = useState('')
  const [previewApproval, setPreviewApproval] = useState(null)
  const [previewApprovalLoading, setPreviewApprovalLoading] = useState(false)
  const [previewApprovalVigente, setPreviewApprovalVigente] = useState(false)
  const [previewApprovalObsoleta, setPreviewApprovalObsoleta] = useState(false)
  const [previewApprovalPendiente, setPreviewApprovalPendiente] = useState(false)
  const [previewApprovalError, setPreviewApprovalError] = useState('')
  const [generandoPreview, setGenerandoPreview] = useState(false)
  const [mensajePreview, setMensajePreview] = useState('')
  const [formatoEntrega, setFormatoEntrega] = useState('sobremesa')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [exportandoMaterial, setExportandoMaterial] = useState(false)
  const [mensajeMaterial, setMensajeMaterial] = useState('')
  const [experienciaEntrega, setExperienciaEntrega] = useState(EXPERIENCIA_ENTREGA_INICIAL)
  const [deliveryAnalytics, setDeliveryAnalytics] = useState({
    eventos: [],
    resumen: { por_destino: { carta: 0, hub: 0 } },
    usoReal: USO_REAL_INICIAL,
    loading: false,
    pendiente: false,
    error: '',
  })
  const canvasRef = useRef(null)
  const materialRef = useRef(null)

  async function cargarHistorialPublicacion(restauranteId) {
    if (!restauranteId) return
    setHistorialPublicacionError('')
    try {
      const token = await tokenSesion()
      const query = new URLSearchParams({ restaurante_id: restauranteId })
      const res = await fetch(`/api/publicacion?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el historial de publicacion.')
      setHistorialPublicacion(data.historial || [])
      setHistorialPublicacionPendiente(Boolean(data.historial_pendiente))
      setSnapshotPublicacionPendiente(Boolean(data.snapshot_pendiente))
      setUltimoSnapshot(data.ultimo_snapshot || null)
    } catch (error) {
      setHistorialPublicacion([])
      setHistorialPublicacionError(error.message || 'No se pudo cargar el historial de publicacion.')
    }
  }

  async function cargarAprobacionPreview(restauranteId, destino = '') {
    if (!restauranteId) return
    setPreviewApprovalError('')
    setPreviewApprovalLoading(true)
    try {
      const token = await tokenSesion()
      const query = new URLSearchParams({ restaurante_id: restauranteId })
      if (destino) query.set('destino', destino)
      const res = await fetch(`/api/publicacion/preview-approval?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la aprobacion de preview.')
      setPreviewApproval(data.ultima_aprobacion_vigente || data.ultima_aprobacion || null)
      setPreviewApprovalVigente(Boolean(data.aprobacion_vigente))
      setPreviewApprovalObsoleta(Boolean(data.aprobacion_obsoleta))
      setPreviewApprovalPendiente(Boolean(data.aprobaciones_pendientes))
    } catch (error) {
      setPreviewApproval(null)
      setPreviewApprovalVigente(false)
      setPreviewApprovalObsoleta(false)
      setPreviewApprovalPendiente(false)
      setPreviewApprovalError(error.message || 'No se pudo cargar la aprobacion de preview.')
    } finally {
      setPreviewApprovalLoading(false)
    }
  }

  async function cargarDeliveryAnalytics(restauranteId) {
    if (!restauranteId) return
    setDeliveryAnalytics(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const token = await tokenSesion()
      const query = new URLSearchParams({ restaurante_id: restauranteId, days: '30' })
      const res = await fetch(`/api/publicacion/analytics?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la analitica de entrega.')
      setDeliveryAnalytics({
        eventos: data.eventos || [],
        resumen: data.resumen || { por_destino: { carta: 0, hub: 0 } },
        usoReal: data.uso_real || USO_REAL_INICIAL,
        loading: false,
        pendiente: Boolean(data.analytics_pendiente),
        error: '',
      })
    } catch (error) {
      setDeliveryAnalytics(prev => ({
        ...prev,
        eventos: [],
        loading: false,
        error: error.message || 'No se pudo cargar la analitica de entrega.',
      }))
    }
  }

  async function cargarExperienciaEntrega(restauranteId) {
    if (!restauranteId) return
    setExperienciaEntrega(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const token = await tokenSesion()
      const query = new URLSearchParams({ restaurante_id: restauranteId })
      const res = await fetch(`/api/experiencias?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la experiencia activa.')
      if (data.experience_pending) {
        setExperienciaEntrega({ ...EXPERIENCIA_ENTREGA_INICIAL, pendiente: true })
        return
      }
      const experiencia = experienciaEntregaDesdePlan(data.active_plan) || leerExperienciaEntregaLocal(restauranteId)
      setExperienciaEntrega(experiencia || { ...EXPERIENCIA_ENTREGA_INICIAL })
    } catch (error) {
      const experienciaLocal = leerExperienciaEntregaLocal(restauranteId)
      setExperienciaEntrega(experienciaLocal || {
        ...EXPERIENCIA_ENTREGA_INICIAL,
        error: error.message || 'No se pudo cargar la experiencia activa.',
      })
    }
  }

  async function registrarDeliveryEvent(event, metadata = {}) {
    if (!restaurante?.id || !event) return
    try {
      const token = await tokenSesion()
      const metadataConExperiencia = {
        ...metadata,
        experiencia: metadata.experiencia || experienciaEntrega.id || null,
        experiencia_label: metadata.experiencia_label || experienciaEntrega.label || null,
      }
      const res = await fetch('/api/publicacion/analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          event,
          destino: metadataConExperiencia.destino || destinoPreview,
          metadata: metadataConExperiencia,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.analytics_pendiente) {
        setDeliveryAnalytics(prev => ({ ...prev, pendiente: true }))
        return
      }
      if (res.ok) cargarDeliveryAnalytics(restaurante.id)
    } catch {
      // La analitica nunca debe bloquear una accion operativa del QR.
    }
  }

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        setPreviewDestinoSeleccionado(rest.hub_activo ? 'hub' : 'carta')
        setContenidoCarta(prev => ({ ...prev, loading: true, error: '' }))
        const [vinosRes, platosRes] = await Promise.all([
          supabase.from('vinos').select('id, precio_botella, precio_copa').eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('platos').select('id').eq('restaurante_id', rest.id).eq('activo', true),
        ])
        const contenidoError = vinosRes.error || platosRes.error
        if (contenidoError) {
          setContenidoCarta({
            ...CONTENIDO_INICIAL,
            loading: false,
            error: 'No se pudo comprobar el contenido de la carta.',
          })
        } else {
          setContenidoCarta(resumirContenidoCarta(vinosRes.data || [], platosRes.data || []))
        }
        cargarHistorialPublicacion(rest.id)
        cargarAprobacionPreview(rest.id, rest.hub_activo ? 'hub' : 'carta')
        cargarDeliveryAnalytics(rest.id)
        cargarExperienciaEntrega(rest.id)
      } else {
        setContenidoCarta({ ...CONTENIDO_INICIAL, loading: false, error: 'No se encontro el restaurante.' })
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const urlBase = typeof window !== 'undefined' ? window.location.origin : ''
  const destino = restaurante?.hub_activo ? 'r' : 'carta'
  const urlDirecta = restaurante?.slug ? `${urlBase}/${destino}/${restaurante.slug}` : ''
  const urlPrint = restaurante?.slug ? `${urlBase}/carta/${restaurante.slug}?print=1` : ''
  const textoEquipo = restaurante ? `Carta digital ${restaurante.nombre}: ${urlDirecta}` : ''
  const destinoPreview = restaurante?.hub_activo ? 'hub' : 'carta'
  const destinoPreviewLabel = restaurante?.hub_activo ? 'Hub privado' : 'Carta privada'
  const previewDestinoActivo = restaurante?.hub_activo ? previewDestinoSeleccionado : 'carta'
  const previewDestinoActivoLabel = previewDestinoActivo === 'hub' ? 'Hub privado' : 'Carta privada'
  const previewDestinoGenerado = previewLinkDestino || previewDestinoActivo
  const previewDestinoGeneradoLabel = previewDestinoGenerado === 'hub' ? 'Hub privado' : 'Carta privada'
  const previewOpcionesDestino = restaurante?.hub_activo
    ? [
        {
          id: 'hub',
          label: 'Hub',
          detail: 'Enlaces, carta y redes',
        },
        {
          id: 'carta',
          label: 'Carta',
          detail: 'Solo carta de vinos',
        },
      ]
    : [
        {
          id: 'carta',
          label: 'Carta',
          detail: 'Carta de vinos',
        },
      ]
  const textoPreviewRevisor = previewLink
    ? [
        `Hola, te paso la preview privada de ${previewDestinoGenerado === 'hub' ? 'hub' : 'carta'} de ${restaurante?.nombre || 'la carta'}.`,
        previewLink,
        'Revísala con calma y, si está correcta, pulsa "Aprobar preview" dentro del enlace. Esa aprobación permite publicar el QR final.',
      ].join('\n\n')
    : ''
  const migracionPublicacionPendiente = restaurante && !Object.prototype.hasOwnProperty.call(restaurante, 'carta_publica_activa')
  const cartaPublicada = restaurante?.carta_publica_activa !== false
  const estadoPublicacion = cartaPublicada ? 'Publicada' : 'Borrador'
  const previewApprovalLista = Boolean(previewApprovalVigente && previewApproval && previewApproval.destino === destinoPreview)
  const previewApprovalBloqueada = !previewApprovalLoading && !previewApprovalPendiente && !previewApprovalLista
  const previewApprovalDetalle = previewApprovalLoading
    ? 'Comprobando aprobacion'
    : previewApprovalPendiente
      ? 'Falta tabla de aprobaciones'
      : previewApprovalLista
        ? `${formatoFechaHistorial(previewApproval.approved_at)} por ${firmantePreview(previewApproval)}`
        : previewApprovalObsoleta
          ? 'La carta cambio despues de aprobar'
          : `Sin aprobacion de ${destinoPreview === 'hub' ? 'hub' : 'carta'}`
  const criteriosContenido = [
    {
      label: 'Vinos visibles',
      detail: `${contenidoCarta.vinosActivos} referencias activas`,
      ok: contenidoCarta.vinosActivos > 0,
      required: true,
      href: '/dashboard/vinos',
    },
    {
      label: 'Precios de carta',
      detail: contenidoCarta.vinosSinPrecio
        ? `${contenidoCarta.vinosConPrecio} con precio, ${contenidoCarta.vinosSinPrecio} incompletas`
        : `${contenidoCarta.vinosConPrecio} referencias con precio`,
      ok: contenidoCarta.vinosConPrecio > 0,
      required: true,
      href: '/dashboard/vinos',
    },
    {
      label: 'Platos para ArmonIA',
      detail: contenidoCarta.platosActivos ? `${contenidoCarta.platosActivos} platos activos` : 'Sin platos activos',
      ok: contenidoCarta.platosActivos > 0,
      required: false,
      href: '/dashboard/platos',
    },
    {
      label: 'Vinos por copa',
      detail: contenidoCarta.vinosPorCopa ? `${contenidoCarta.vinosPorCopa} copas marcadas` : 'Sin servicio por copa',
      ok: contenidoCarta.vinosPorCopa > 0,
      required: false,
      href: '/dashboard/vinos',
    },
    {
      label: 'Preview aprobada',
      detail: previewApprovalDetalle,
      ok: previewApprovalLista,
      required: true,
      href: '#preview-privada',
    },
  ]
  const contenidoBloqueado = !contenidoCarta.loading && !contenidoCarta.error && !puedePublicarCarta(contenidoCarta)
  const contenidoPreparado = !contenidoCarta.loading && !contenidoCarta.error && !contenidoBloqueado
  const publicacionDeshabilitada = guardandoPublicacion ||
    migracionPublicacionPendiente ||
    contenidoCarta.loading ||
    Boolean(contenidoCarta.error) ||
    contenidoBloqueado ||
    previewApprovalLoading ||
    previewApprovalPendiente ||
    Boolean(previewApprovalError) ||
    previewApprovalBloqueada
  const entregaPasos = [
    {
      label: 'Contenido',
      detail: contenidoCarta.loading
        ? 'Comprobando carta'
        : contenidoPreparado
          ? `${contenidoCarta.vinosActivos} vinos listos`
          : 'Faltan vinos o precios',
      ok: contenidoPreparado,
      current: !contenidoPreparado,
    },
    {
      label: 'Preview',
      detail: previewApprovalLoading
        ? 'Comprobando aprobacion'
        : previewApprovalLista
          ? 'Aprobada y vigente'
          : previewApprovalObsoleta
            ? 'Necesita nueva firma'
            : 'Pendiente de firma',
      ok: previewApprovalLista,
      current: contenidoPreparado && !previewApprovalLista,
    },
    {
      label: 'Publicacion',
      detail: cartaPublicada ? 'Destino abierto' : 'En borrador',
      ok: cartaPublicada,
      current: contenidoPreparado && previewApprovalLista && !cartaPublicada,
    },
    {
      label: 'Entrega',
      detail: cartaPublicada ? 'QR y enlace listos' : 'Esperando publicacion',
      ok: cartaPublicada,
      current: cartaPublicada,
    },
  ]
  const entregaTitulo = cartaPublicada
    ? 'Entrega lista para mesa'
    : contenidoPreparado && previewApprovalLista
      ? 'Lista para publicar'
      : 'Preparando entrega'
  const entregaDetalle = cartaPublicada
    ? 'El enlace publico, el QR y la version de impresion ya estan disponibles.'
    : contenidoBloqueado
      ? 'Completa el contenido minimo para evitar una carta vacia o sin precios.'
      : previewApprovalObsoleta
        ? 'La carta cambio despues de la aprobacion. Hace falta una nueva preview firmada.'
        : previewApprovalLista
          ? 'La preview esta aprobada. Publica cuando quieras abrir el destino al cliente.'
          : 'Genera una preview privada y pide aprobacion antes de publicar.'
  const entregaAccion = cartaPublicada
    ? { label: 'Descargar QR', hint: 'Material final', onClick: descargar, disabled: false }
    : migracionPublicacionPendiente || previewApprovalPendiente
      ? { label: 'SQL pendiente', hint: 'Base de datos', disabled: true }
      : !contenidoPreparado
        ? { label: 'Completar carta', hint: 'Siguiente paso', href: '/dashboard/vinos', disabled: false }
        : !previewApprovalLista
          ? { label: previewApprovalObsoleta ? 'Reaprobar preview' : 'Generar preview', hint: 'Siguiente paso', onClick: irAPreviewPrivada, disabled: previewApprovalLoading }
          : { label: guardandoPublicacion ? 'Publicando...' : 'Publicar carta', hint: 'Siguiente paso', onClick: () => cambiarPublicacion(true), disabled: publicacionDeshabilitada }
  const deliveryResumen = deliveryAnalytics.resumen || {}
  const usoReal = deliveryAnalytics.usoReal || USO_REAL_INICIAL
  const deliveryStats = [
    {
      label: 'Previews',
      value: deliveryResumen.preview_generated || 0,
      hint: 'Enlaces privados generados',
    },
    {
      label: 'Aprobaciones',
      value: deliveryResumen.preview_approved || 0,
      hint: 'Firmas recibidas desde preview',
    },
    {
      label: 'Publicacion',
      value: (deliveryResumen.publication_published || 0) + (deliveryResumen.publication_paused || 0),
      hint: 'Cambios publicar/pausar',
    },
    {
      label: 'QR e impresion',
      value: (deliveryResumen.qr_downloaded || 0) + (deliveryResumen.qr_print_opened || 0),
      hint: 'Material preparado',
    },
    {
      label: 'Enlaces',
      value: (deliveryResumen.public_link_copied || 0) +
        (deliveryResumen.team_message_copied || 0) +
        (deliveryResumen.public_destination_opened || 0),
      hint: 'Copias y aperturas publicas',
    },
    {
      label: 'Uso real',
      value: usoReal.escaneos_total || 0,
      hint: usoReal.actividad_iniciada ? 'Escaneos de clientes' : 'Actividad no iniciada',
    },
  ]
  const deliveryEventosRecientes = deliveryAnalytics.eventos?.slice(0, 5) || []
  const accionesMaterial = (deliveryResumen.qr_downloaded || 0) +
    (deliveryResumen.qr_print_opened || 0) +
    (deliveryResumen.public_link_copied || 0) +
    (deliveryResumen.team_message_copied || 0)
  const experienciaActiva = experienciaEntrega.id ? experienciaEntrega : null
  const escaneosExperienciaActiva = experienciaActiva
    ? Number(usoReal.por_experiencia?.[experienciaActiva.id] || 0)
    : 0
  const experienciasUsoReal = Array.isArray(usoReal.experiencias) ? usoReal.experiencias.slice(0, 3) : []
  const lecturaUsoReal = !usoReal.actividad_iniciada
    ? 'La actividad real no esta iniciada. Cuando actives el servicio diario, los escaneos de clientes se compararan con la entrega.'
    : usoReal.escaneos_total > 0
      ? `${usoReal.escaneos_total} escaneos reales detectados: ${usoReal.escaneos_hub || 0} desde hub y ${usoReal.escaneos_carta || 0} desde carta.`
      : accionesMaterial > 0
        ? 'El material ya se preparo, pero aun no hay escaneos reales en el periodo. Revisa si el QR esta en mesa o si sala lo esta ofreciendo.'
        : 'Todavia no hay preparacion de material ni escaneos reales en el periodo.'
  const formatoEntregaActivo = FORMATOS_ENTREGA.find(formato => formato.id === formatoEntrega) || FORMATOS_ENTREGA[0]
  const lecturaExperienciaReal = !experienciaActiva
    ? 'Activa una plantilla para atribuir escaneos a una experiencia concreta.'
    : !usoReal.actividad_iniciada
      ? 'La medicion real aun no esta iniciada para comparar esta experiencia.'
      : escaneosExperienciaActiva > 0
        ? `${escaneosExperienciaActiva} escaneos reales llegaron con ${experienciaActiva.label}.`
        : 'Todavia no hay escaneos reales atribuidos a la experiencia activa.'
  const nombreMaterial = restaurante?.nombre || 'Carta Viva'
  const destinoMaterial = restaurante?.hub_activo ? 'Hub digital' : 'Carta digital'
  const detalleMaterial = restaurante?.ciudad || restaurante?.provincia
    ? [restaurante?.ciudad, restaurante?.provincia].filter(Boolean).join(' - ')
    : 'Carta Viva'
  const etiquetaMaterial = experienciaActiva?.badge || destinoMaterial
  const taglineMaterial = experienciaActiva?.tagline || formatoEntregaActivo.tagline
  const progresoExperiencia = experienciaActiva?.total
    ? `${experienciaActiva.completados}/${experienciaActiva.total} pasos listos (${experienciaActiva.progreso}%)`
    : 'Checklist sin pasos marcados'
  const estadoExperienciaEntrega = experienciaEntrega.loading
    ? 'Cargando experiencia activa.'
    : experienciaEntrega.pendiente
      ? 'Aplica supabase/add_experience_activation_plans.sql para personalizar el pack por plantilla.'
      : experienciaEntrega.error
        ? 'No se pudo cargar la experiencia activa. El pack usa texto generico.'
        : experienciaActiva
          ? `Usando ${experienciaActiva.label}. ${progresoExperiencia}.`
          : 'El pack usa texto generico. Activa una plantilla para orientar los copys.'
  const textoMaterialEquipo = [
    `Carta Viva de ${nombreMaterial}`,
    experienciaActiva ? `Experiencia: ${experienciaActiva.label}` : null,
    experienciaActiva?.responsable ? `Responsable: ${experienciaActiva.responsable}` : null,
    experienciaActiva?.objetivo ? `Fecha objetivo: ${experienciaActiva.objetivo}` : null,
    urlDirecta,
    experienciaActiva?.sala || 'Antes de llevar el QR a mesa: escanear desde movil, comprobar precios y confirmar que abre sin token.',
  ].filter(Boolean).join('\n')
  const textoMaterialWhatsApp = [
    `${experienciaActiva?.whatsapp || 'Hola, te paso la carta digital de'} ${nombreMaterial}.`,
    urlDirecta,
    experienciaActiva?.cliente || 'Desde ahi puedes ver la carta actualizada y las recomendaciones.',
  ].join('\n\n')
  const textoMaterialInstagram = [
    experienciaActiva ? `${experienciaActiva.instagram} ${nombreMaterial}.` : `La carta viva de ${nombreMaterial} ya esta disponible.`,
    experienciaActiva?.cliente || 'Escanea el QR en mesa o abre el enlace para ver vinos y recomendaciones.',
    urlDirecta,
  ].join('\n')
  const textoMaterialImprenta = [
    `Material QR ${nombreMaterial}`,
    `Destino: ${destinoMaterial}`,
    `URL final: ${urlDirecta}`,
    `Formato seleccionado: ${formatoEntregaActivo.label}`,
    `Mensaje principal: ${taglineMaterial}`,
    experienciaActiva ? `Experiencia activa: ${experienciaActiva.label}` : null,
  ].filter(Boolean).join('\n')
  const textosMaterial = [
    { id: 'material-equipo', label: 'Equipo', texto: textoMaterialEquipo },
    { id: 'material-whatsapp', label: 'WhatsApp', texto: textoMaterialWhatsApp },
    { id: 'material-instagram', label: 'Instagram', texto: textoMaterialInstagram },
    { id: 'material-imprenta', label: 'Imprenta', texto: textoMaterialImprenta },
  ]

  useEffect(() => {
    if (urlDirecta && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, urlDirecta, {
        width: 300,
        margin: 2,
        color: { dark: '#171416', light: '#ffffff' }
      })
      QRCode.toDataURL(urlDirecta, {
        width: 880,
        margin: 2,
        color: { dark: '#171416', light: '#ffffff' },
      }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
    }
  }, [urlDirecta])

  function descargar() {
    const canvas = canvasRef.current
    if (!canvas || !restaurante?.slug) return
    const link = document.createElement('a')
    link.download = `qr-${restaurante.slug}.png`
    link.href = canvas.toDataURL()
    link.click()
    registrarDeliveryEvent('qr_downloaded', {
      destino: destinoPreview,
      slug: restaurante.slug,
      source: 'dashboard_qr',
    })
  }

  function imprimir() {
    if (typeof window === 'undefined') return
    registrarDeliveryEvent('qr_print_opened', {
      destino: destinoPreview,
      source: 'dashboard_qr',
    })
    window.print()
  }

  async function descargarMaterial() {
    if (!materialRef.current || !restaurante?.slug || exportandoMaterial) return
    setExportandoMaterial(true)
    setMensajeMaterial('')
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(materialRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `material-${formatoEntrega}-${restaurante.slug}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      registrarDeliveryEvent('qr_downloaded', {
        destino: destinoPreview,
        source: 'delivery_pack',
        formato: formatoEntrega,
        experiencia: experienciaActiva?.id || null,
      })
      setMensajeMaterial('Material exportado en PNG.')
    } catch {
      setMensajeMaterial('No se pudo exportar el material. Prueba de nuevo o descarga el QR simple.')
    } finally {
      setExportandoMaterial(false)
      setTimeout(() => setMensajeMaterial(''), 2200)
    }
  }

  async function copiar(texto, tipo) {
    if (!texto) return
    await navigator.clipboard?.writeText(texto)
    setCopiado(tipo)
    const eventoPorTipo = {
      url: 'public_link_copied',
      equipo: 'team_message_copied',
      quick: 'public_link_copied',
      preview: 'preview_link_copied',
      'preview-texto': 'preview_message_copied',
      'material-equipo': 'team_message_copied',
      'material-whatsapp': 'team_message_copied',
      'material-instagram': 'team_message_copied',
      'material-imprenta': 'team_message_copied',
    }
    const evento = eventoPorTipo[tipo]
    if (evento) {
      registrarDeliveryEvent(evento, {
        destino: tipo?.startsWith('preview') ? previewDestinoGenerado : destinoPreview,
        source: tipo,
      })
    }
    setTimeout(() => setCopiado(''), 1800)
  }

  function abrirVistaRapida() {
    setVistaRapida(true)
    registrarDeliveryEvent('quick_view_opened', {
      destino: destinoPreview,
      source: 'dashboard_qr',
    })
  }

  function irAPreviewPrivada() {
    if (typeof document === 'undefined') return
    document.getElementById('preview-privada')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function actualizarAprobacionPreview() {
    await cargarAprobacionPreview(restaurante?.id, destinoPreview)
    registrarDeliveryEvent('preview_approval_refreshed', {
      destino: destinoPreview,
      source: 'dashboard_qr',
    })
  }

  function cambiarDestinoPreview(destino) {
    const siguiente = destino === 'hub' && restaurante?.hub_activo ? 'hub' : 'carta'
    setPreviewDestinoSeleccionado(siguiente)
    setPreviewLink('')
    setPreviewLinkDestino('')
    setPreviewCaducaAt('')
    setMensajePreview('')
  }

  async function crearPreviewCompartible() {
    if (!restaurante?.id || generandoPreview) return
    setGenerandoPreview(true)
    setMensajePreview('')
    try {
      const token = await tokenSesion()
      const destinoSolicitud = restaurante.hub_activo ? previewDestinoSeleccionado : 'carta'
      const res = await fetch('/api/prueba-carta', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          destino: destinoSolicitud,
          duracion_horas: Number(previewDuracionHoras) || 24,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la vista previa.')
      const enlace = data.url_absoluta || data.url
      setPreviewLink(enlace)
      setPreviewLinkDestino(data.destino || destinoSolicitud)
      setPreviewCaducaAt(data.caduca_at || '')
      await navigator.clipboard?.writeText(enlace)
      setCopiado('preview')
      registrarDeliveryEvent('preview_generated', {
        destino: data.destino || destinoSolicitud,
        duracion_horas: Number(previewDuracionHoras) || 24,
        caduca_at: data.caduca_at || '',
        source: 'dashboard_qr',
      })
      setMensajePreview(`Preview de ${data.destino === 'hub' ? 'hub' : 'carta'} copiada. Caduca ${data.caduca_en_minutos >= 60 ? `en ${Math.round(data.caduca_en_minutos / 60)} h` : `en ${data.caduca_en_minutos} min`}.`)
      setTimeout(() => setCopiado(''), 1800)
    } catch (error) {
      setMensajePreview(error.message || 'No se pudo crear la vista previa privada.')
    } finally {
      setGenerandoPreview(false)
    }
  }

  async function cambiarPublicacion(activa) {
    if (!restaurante?.id || guardandoPublicacion) return
    if (activa && !contenidoPreparado) {
      setMensajePublicacion(contenidoCarta.error || 'Completa vinos visibles y precios antes de publicar la carta.')
      return
    }
    if (activa && (previewApprovalLoading || previewApprovalPendiente || previewApprovalError || !previewApprovalLista)) {
      setMensajePublicacion(
        previewApprovalPendiente
          ? 'Aplica supabase/add_preview_approvals.sql para registrar aprobaciones antes de publicar.'
          : previewApprovalError ||
            (previewApprovalObsoleta
              ? 'La carta cambio despues de la aprobacion. Genera una nueva preview y apruebala antes de publicar.'
              : `Aprueba primero la preview privada de ${destinoPreview === 'hub' ? 'hub' : 'carta'} antes de publicar.`)
      )
      return
    }
    setGuardandoPublicacion(true)
    setMensajePublicacion('')
    try {
    const token = await tokenSesion()
    const res = await fetch('/api/publicacion', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ restaurante_id: restaurante.id, activa }),
    })
    const data = await res.json()

    if (!res.ok) {
      if (data.contenido) setContenidoCarta({ ...data.contenido, loading: false, error: '' })
      setHistorialPublicacionPendiente(Boolean(data.historial_pendiente))
      setSnapshotPublicacionPendiente(Boolean(data.snapshot_pendiente))
      if (data.aprobaciones_pendientes) setPreviewApprovalPendiente(true)
      if (data.aprobacion_requerida) {
        setPreviewApproval(null)
        setPreviewApprovalVigente(false)
        setPreviewApprovalObsoleta(false)
      }
      if (data.aprobacion_obsoleta) {
        setPreviewApproval(data.ultima_aprobacion || previewApproval)
        setPreviewApprovalVigente(false)
        setPreviewApprovalObsoleta(true)
      }
      setMensajePublicacion(data.error || 'No se pudo cambiar el estado. Ejecuta supabase/add_publication_status.sql en Supabase.')
    } else {
      setRestaurante(data.restaurante)
      if (data.contenido) setContenidoCarta({ ...data.contenido, loading: false, error: '' })
      if (data.aprobacion_preview) {
        setPreviewApproval(data.aprobacion_preview)
        setPreviewApprovalVigente(true)
        setPreviewApprovalObsoleta(false)
      }
      if (data.evento) {
        setHistorialPublicacion(prev => [data.evento, ...prev.filter(item => item.id !== data.evento.id)].slice(0, 6))
      }
      setHistorialPublicacionPendiente(Boolean(data.historial_pendiente))
      setSnapshotPublicacionPendiente(Boolean(data.snapshot_pendiente))
      if (data.snapshot) setUltimoSnapshot(data.snapshot)
      if (data.analytics_pendiente) setDeliveryAnalytics(prev => ({ ...prev, pendiente: true }))
      cargarDeliveryAnalytics(restaurante.id)
      setMensajePublicacion(activa ? 'Carta publicada. El enlace público ya puede compartirse.' : 'Carta pausada. Solo se podrá abrir con prueba interna.')
    }
    } catch {
      setMensajePublicacion('No se pudo conectar con el servidor para cambiar la publicacion.')
    } finally {
      setGuardandoPublicacion(false)
    }
  }

  if (loading) return <LoadingState />

  if (esPerfilBodega(restaurante)) {
    return (
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Accesos"
        title="QR no incluido en Sommelier"
        subtitle="La membresia sommelier trabaja con bodega interna: referencias, stock, inventario, TPV y mapa estrella/joya. No genera carta publica ni QR de mesa."
        actions={<Link className={styles.secondary} href="/dashboard/ajustes">Volver a ajustes</Link>}
        narrow
      >
        <section className={styles.empty}>
          <div>
            <strong>Sin carta publica</strong>
            <p>Para esta cuenta, los accesos utiles estan en Referencias, Bodega, Inventario y Estrellas/Joyas.</p>
          </div>
        </section>
      </ModuleShell>
    )
  }

  const pruebas = [
    { titulo: 'Abrir enlace público', detalle: cartaPublicada ? (restaurante?.hub_activo ? 'El QR abre el hub público. Si consultas ArmonIA, contará como cliente real.' : 'El QR abre la carta digital. Si consultas ArmonIA, contará como cliente real.') : 'Aún está en borrador. Usa la prueba interna y publica cuando esté lista.', href: urlDirecta, publico: true, evento: 'public_destination_opened' },
    { titulo: 'Carta directa', detalle: 'Comprueba platos, vinos, precios y tiempos de carga. Esta apertura se registra como prueba interna.', pruebaCarta: true },
    { titulo: 'Versión impresión', detalle: cartaPublicada ? 'Abre la vista preparada para imprimir o guardar PDF.' : 'Disponible cuando publiques la carta.', href: urlPrint, publico: true, evento: 'qr_print_opened' },
  ]

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Código QR"
      title="Entrega de QR y accesos"
      subtitle="Pantalla de entrega para probar el enlace, descargar el QR y preparar materiales de mesa."
      narrow
      actions={
        <>
          <Link className={styles.secondary} href="/dashboard/versiones">Ver versiones</Link>
          <button type="button" className={styles.primary} onClick={abrirVistaRapida}>Vista rápida</button>
        </>
      }
      help={{
        title: 'Antes de imprimir',
        intro: 'El QR es el punto de entrada del cliente. Conviene probarlo antes de llevarlo a mesa.',
        items: [
          { title: 'Destino', text: 'Si el hub está activo abre reservas, cartas y redes. Si no, abre la carta de vinos directamente.' },
          { title: 'Prueba real', text: 'Escanea con el móvil antes de imprimir para revisar velocidad, logo, colores y enlaces.' },
          { title: 'Uso', text: 'Descarga el PNG y úsalo en sobremesa, metacrilato, cartel o enlace de Instagram.' },
        ],
      }}
    >
      <section className={styles.handoffHero} aria-label="Estado de entrega">
        <div className={styles.handoffCopy}>
          <p className={styles.eyebrow}>Centro de entrega</p>
          <h2>{entregaTitulo}</h2>
          <p>{entregaDetalle}</p>
          <div className={styles.handoffMeta}>
            <span>{destino === 'r' ? 'Hub publico' : 'Carta publica'}</span>
            <span>{migracionPublicacionPendiente ? 'Migracion pendiente' : estadoPublicacion}</span>
            <span>{contenidoCarta.vinosActivos} vinos</span>
          </div>
        </div>
        <div className={styles.handoffAction}>
          <span>{entregaAccion.hint}</span>
          {entregaAccion.href && !entregaAccion.disabled ? (
            <Link className={styles.primary} href={entregaAccion.href}>{entregaAccion.label}</Link>
          ) : (
            <button type="button" className={styles.primary} onClick={entregaAccion.onClick} disabled={entregaAccion.disabled}>
              {entregaAccion.label}
            </button>
          )}
          <button type="button" className={styles.ghost} onClick={abrirVistaRapida}>
            Vista rapida
          </button>
        </div>
        <div className={styles.handoffSteps}>
          {entregaPasos.map((paso, index) => (
            <article
              key={paso.label}
              className={`${styles.handoffStep} ${paso.ok ? styles.handoffStepOk : styles.handoffStepPending} ${paso.current ? styles.handoffStepCurrent : ''}`}
              aria-current={paso.current ? 'step' : undefined}
            >
              <span>{index + 1}</span>
              <strong>{paso.label}</strong>
              <small>{paso.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Estado de publicación</h2>
            <p className={styles.panelSub}>
              {cartaPublicada
                ? 'La experiencia pública responde sin token. Lista para QR, Instagram o materiales de mesa.'
                : 'La carta está en borrador. Puedes probarla internamente sin abrirla a clientes.'}
            </p>
          </div>
          <span className={styles.badge}>{migracionPublicacionPendiente ? 'Migración pendiente' : estadoPublicacion}</span>
        </div>
        <div className={styles.panelBody}>
          {contenidoCarta.loading ? (
            <p className={styles.panelSub} style={{ marginBottom: 14 }}>Comprobando contenido antes de permitir la publicacion...</p>
          ) : (
            <div className={styles.publishReadiness} aria-label="Contenido minimo para publicar">
              {criteriosContenido.map(criterio => (
                <article
                  className={`${styles.readinessItem} ${criterio.ok ? styles.readinessOk : criterio.required ? styles.readinessBlocked : styles.readinessPending}`}
                  key={criterio.label}
                >
                  <span>{criterio.required ? 'Obligatorio' : 'Recomendado'}</span>
                  <strong>{criterio.label}</strong>
                  <small>{criterio.detail}</small>
                  <Link href={criterio.href}>{criterio.ok ? 'Revisar' : 'Completar'}</Link>
                </article>
              ))}
            </div>
          )}
          {contenidoCarta.error && <p className={styles.panelSub} style={{ marginBottom: 14 }}>{contenidoCarta.error}</p>}
          {contenidoBloqueado && <p className={styles.panelSub} style={{ marginBottom: 14 }}>No publiques todavia: faltan referencias activas o precios visibles para que el cliente no llegue a una carta vacia.</p>}
          {!cartaPublicada && !contenidoBloqueado && previewApprovalLoading && <p className={styles.panelSub} style={{ marginBottom: 14 }}>Comprobando si la preview privada ya esta aprobada...</p>}
          {!cartaPublicada && !contenidoBloqueado && previewApprovalPendiente && <p className={styles.panelSub} style={{ marginBottom: 14 }}>No publiques todavia: falta aplicar supabase/add_preview_approvals.sql para registrar la aprobacion de preview.</p>}
          {!cartaPublicada && !contenidoBloqueado && !previewApprovalPendiente && previewApprovalError && <p className={styles.panelSub} style={{ marginBottom: 14 }}>{previewApprovalError}</p>}
          {!cartaPublicada && !contenidoBloqueado && previewApprovalObsoleta && !previewApprovalError && <p className={styles.panelSub} style={{ marginBottom: 14 }}>No publiques todavia: la carta cambio despues de la aprobacion. Genera una nueva preview y vuelve a aprobarla.</p>}
          {!cartaPublicada && !contenidoBloqueado && previewApprovalBloqueada && !previewApprovalObsoleta && !previewApprovalError && <p className={styles.panelSub} style={{ marginBottom: 14 }}>No publiques todavia: comparte la preview privada y pide que pulsen Aprobar preview desde el enlace.</p>}
          <div className={styles.actionRow}>
            <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar sin publicar</OpenCartaPruebaButton>
            {cartaPublicada ? (
              <button type="button" className={styles.ghost} onClick={() => cambiarPublicacion(false)} disabled={guardandoPublicacion || migracionPublicacionPendiente}>
                {guardandoPublicacion ? 'Guardando...' : 'Pausar pública'}
              </button>
            ) : (
              <button type="button" className={styles.primary} onClick={() => cambiarPublicacion(true)} disabled={publicacionDeshabilitada}>
                {guardandoPublicacion ? 'Publicando...' : 'Publicar carta'}
              </button>
            )}
          </div>
          {migracionPublicacionPendiente && <p className={styles.panelSub} style={{ marginTop: 12 }}>Aplica supabase/add_publication_status.sql para activar el control de borrador/publicado. Hasta entonces, las cartas existentes siguen respondiendo como antes.</p>}
          {mensajePublicacion && <p className={styles.panelSub} style={{ marginTop: 12 }}>{mensajePublicacion}</p>}
        </div>
      </section>

      <section className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Historial de publicación</h2>
            <p className={styles.panelSub}>Últimos cambios de borrador/publicado con responsable y contenido revisado.</p>
          </div>
          <span className={styles.badge}>{historialPublicacionPendiente || snapshotPublicacionPendiente ? 'SQL pendiente' : `${historialPublicacion.length} eventos`}</span>
        </div>
        <div className={styles.panelBody}>
          {snapshotPublicacionPendiente ? (
            <p className={styles.panelSub} style={{ marginBottom: 14 }}>Aplica supabase/add_publication_snapshots.sql para guardar versiones de carta al publicar.</p>
          ) : ultimoSnapshot ? (
            <article className={styles.itemCard} style={{ marginBottom: 12 }}>
              <div className={styles.sectionHead} style={{ margin: 0 }}>
                <div>
                  <h3 className={styles.sectionTitle}>Última versión publicada</h3>
                  <p className={styles.sectionText}>{textoSnapshot(ultimoSnapshot)}</p>
                </div>
                <span className={styles.badge}>v{ultimoSnapshot.version_number}</span>
              </div>
            </article>
          ) : null}
          {historialPublicacionPendiente ? (
            <p className={styles.panelSub}>Aplica supabase/add_publication_history.sql para guardar el historial de publicar, pausar y restaurar.</p>
          ) : historialPublicacionError ? (
            <p className={styles.panelSub}>{historialPublicacionError}</p>
          ) : historialPublicacion.length === 0 ? (
            <p className={styles.panelSub}>Todavia no hay cambios registrados. El proximo publicar, pausar o restaurar quedara guardado aqui.</p>
          ) : (
            <div className={styles.itemStack}>
              {historialPublicacion.map(evento => (
                <article className={styles.itemCard} key={evento.id}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>{tituloEventoPublicacion(evento)}</h3>
                      <p className={styles.sectionText}>
                        {formatoFechaHistorial(evento.created_at)} · {evento.actor_email || 'responsable'} · {resumenContenidoHistorial(evento.contenido_resumen)}
                      </p>
                    </div>
                    <span className={styles.badge}>{evento.estado_anterior} → {evento.estado_nuevo}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Analitica de entrega</h2>
            <p className={styles.panelSub}>Senales de uso del embudo de preview, aprobacion, QR y enlaces en los ultimos 30 dias.</p>
          </div>
          <span className={styles.badge}>
            {deliveryAnalytics.pendiente ? 'SQL pendiente' : deliveryAnalytics.loading ? 'Cargando' : '30 dias'}
          </span>
        </div>
        <div className={styles.panelBody}>
          {deliveryAnalytics.pendiente ? (
            <p className={styles.panelSub}>Aplica supabase/add_publication_delivery_events.sql para activar la analitica de entrega.</p>
          ) : deliveryAnalytics.error ? (
            <p className={styles.panelSub}>{deliveryAnalytics.error}</p>
          ) : (
            <>
              <div className={styles.statsGrid}>
                {deliveryStats.map(stat => (
                  <article className={styles.stat} key={stat.label}>
                    <p className={styles.statValue}>{stat.value}</p>
                    <p className={styles.statLabel}>{stat.label}</p>
                    <p className={styles.statHint}>{stat.hint}</p>
                  </article>
                ))}
              </div>
              <article className={styles.itemCard} style={{ marginBottom: 12 }}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>Lectura de uso real</h3>
                    <p className={styles.sectionText}>{lecturaUsoReal}</p>
                    {usoReal.actividad_iniciada && usoReal.desde && (
                      <p className={styles.sectionText}>Periodo real desde {formatoFechaHistorial(usoReal.desde)}.</p>
                    )}
                  </div>
                  <span className={styles.badge}>
                    {usoReal.actividad_iniciada ? `${usoReal.escaneos_total || 0} escaneos` : 'Sin servicio'}
                  </span>
                </div>
              </article>
              <article className={styles.itemCard} style={{ marginBottom: 12 }}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>Experiencia activa</h3>
                    <p className={styles.sectionText}>{lecturaExperienciaReal}</p>
                    {experienciasUsoReal.length > 0 && (
                      <p className={styles.sectionText}>
                        {experienciasUsoReal.map(item => `${item.label}: ${item.total}`).join(' - ')}
                      </p>
                    )}
                  </div>
                  <span className={styles.badge}>
                    {experienciaActiva ? experienciaActiva.badge : 'Generico'}
                  </span>
                </div>
              </article>
              {deliveryEventosRecientes.length === 0 ? (
                <p className={styles.panelSub}>Todavia no hay eventos de entrega. Genera una preview, copia un enlace o descarga el QR para empezar a medir.</p>
              ) : (
                <div className={styles.itemStack}>
                  {deliveryEventosRecientes.map(evento => (
                    <article className={styles.itemCard} key={evento.id}>
                      <div className={styles.sectionHead} style={{ margin: 0 }}>
                        <div>
                          <h3 className={styles.sectionTitle}>{tituloEventoEntrega(evento)}</h3>
                          <p className={styles.sectionText}>{detalleEventoEntrega(evento)}</p>
                        </div>
                        <span className={styles.badge}>{evento.destino === 'hub' ? 'Hub' : 'Carta'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className={styles.qrHero}>
        <div>
          <p className={styles.eyebrow}>Material de mesa</p>
          <h2>{cartaPublicada ? 'QR listo para imprimir' : 'QR en borrador'}</h2>
          <p>{cartaPublicada ? 'Una pieza limpia para sobremesa, metacrilato o carta física. Prueba el destino antes de mandar a imprenta.' : 'Primero prueba la carta internamente. Publica cuando precios, platos y marca estén revisados.'}</p>
        </div>
        <div className={styles.qrHeroActions}>
          <button className={styles.primary} onClick={descargar} disabled={!cartaPublicada}>Descargar QR</button>
          <button className={styles.secondary} onClick={imprimir} disabled={!cartaPublicada}>Imprimir esta página</button>
          <button className={styles.ghost} onClick={() => copiar(urlDirecta, 'url')} disabled={!cartaPublicada}>{copiado === 'url' ? 'Copiado' : 'Copiar enlace'}</button>
        </div>
      </section>

      <section className={styles.panel} style={{ marginBottom: 16 }} id="pack-entrega">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Pack de entrega</h2>
            <p className={styles.panelSub}>Crea una pieza lista para mesa, barra, tarjeta o redes con el QR final. {estadoExperienciaEntrega}</p>
          </div>
          <span className={styles.badge}>{formatoEntregaActivo.label}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.deliveryPackLayout}>
            <div className={styles.deliveryPackPreview}>
              <article
                ref={materialRef}
                className={`${styles.deliveryMaterial} ${styles[`deliveryMaterial_${formatoEntregaActivo.id}`] || ''}`}
                style={{
                  '--pack-primary': restaurante?.color_primario || '#74223d',
                  '--pack-bg': restaurante?.color_fondo || '#fffaf3',
                  '--pack-accent': restaurante?.color_acento || '#bfa984',
                }}
                aria-label={`Material ${formatoEntregaActivo.label}`}
              >
                <div className={styles.deliveryMaterialBrand}>
                  <span>{nombreMaterial.slice(0, 2)}</span>
                  <strong>{nombreMaterial}</strong>
                </div>
                <div className={styles.deliveryMaterialCopy}>
                  <small>{etiquetaMaterial}</small>
                  <h3>{taglineMaterial}</h3>
                  <p>{detalleMaterial}</p>
                </div>
                <div className={styles.deliveryMaterialQr}>
                  {qrDataUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en cliente como data URL para exportacion PNG. */}
                      <img src={qrDataUrl} alt={`QR ${nombreMaterial}`} />
                    </>
                  ) : (
                    <span>QR</span>
                  )}
                </div>
                <p className={styles.deliveryMaterialUrl}>{urlDirecta}</p>
                <span className={styles.deliveryMaterialFooter}>Carta Viva - @cataconjuanjo</span>
              </article>
            </div>
            <div className={styles.deliveryPackControls}>
              <div>
                <span className={styles.label}>Formato</span>
                <div className={styles.deliveryFormatGrid} role="group" aria-label="Formato del material de entrega">
                  {FORMATOS_ENTREGA.map(formato => (
                    <button
                      type="button"
                      key={formato.id}
                      className={formato.id === formatoEntrega ? styles.deliveryFormatActive : styles.deliveryFormatButton}
                      onClick={() => setFormatoEntrega(formato.id)}
                      aria-pressed={formato.id === formatoEntrega}
                    >
                      <strong>{formato.label}</strong>
                      <span>{formato.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.actionRow}>
                <button type="button" className={styles.primary} onClick={descargarMaterial} disabled={!cartaPublicada || !qrDataUrl || exportandoMaterial}>
                  {exportandoMaterial ? 'Exportando...' : 'Descargar material PNG'}
                </button>
                <button type="button" className={styles.secondary} onClick={descargar} disabled={!cartaPublicada}>Descargar solo QR</button>
                <button type="button" className={styles.ghost} onClick={imprimir} disabled={!cartaPublicada}>Imprimir pagina</button>
              </div>
              {!cartaPublicada && (
                <p className={styles.panelSub}>Publica primero la carta para generar material final. Mientras este en borrador, usa la preview privada.</p>
              )}
              <article className={styles.itemCard}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>{experienciaActiva ? experienciaActiva.label : 'Plantilla activa'}</h3>
                    <p className={styles.sectionText}>{estadoExperienciaEntrega}</p>
                  </div>
                  <Link className={styles.ghost} href="/dashboard/plantillas">Plantillas</Link>
                </div>
              </article>
              {mensajeMaterial && <p className={styles.panelSub}>{mensajeMaterial}</p>}
              <div className={styles.deliveryCopyGrid}>
                {textosMaterial.map(item => (
                  <article className={styles.itemCard} key={item.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{item.label}</h3>
                        <p className={styles.sectionText}>{item.texto}</p>
                      </div>
                      <button type="button" className={styles.ghost} onClick={() => copiar(item.texto, item.id)} disabled={!cartaPublicada}>
                        {copiado === item.id ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.qrLayout}>
        <div className={styles.qrCard}>
          <div className={styles.tableTentPreview}>
            <p>Escanea para ver la carta viva</p>
            <canvas ref={canvasRef} />
            <span>{restaurante?.nombre}</span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p className={styles.sectionTitle}>{restaurante?.nombre}</p>
            <p className={styles.sectionText}>{restaurante?.hub_activo ? 'Hub público' : 'Carta digital'}</p>
          </div>
          <button className={styles.primary} onClick={descargar} disabled={!cartaPublicada}>Descargar PNG</button>
          {cartaPublicada ? <a className={styles.secondary} href={urlPrint} target="_blank" rel="noreferrer" onClick={() => registrarDeliveryEvent('qr_print_opened', { destino: destinoPreview, source: 'qr_card' })}>Imprimir / PDF</a> : <button type="button" className={styles.secondary} disabled>Imprimir / PDF</button>}
          <button className={styles.ghost} onClick={imprimir} disabled={!cartaPublicada}>Imprimir página</button>
        </div>

        <div className={styles.itemStack}>
          <div className={styles.panel} id="preview-privada">
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Vista previa privada</h2>
                <p className={styles.panelSub}>Genera un enlace temporal para revisar, aprobar y despues publicar con control.</p>
              </div>
              <span className={styles.badge}>{destinoPreviewLabel}</span>
            </div>
            <div className={styles.panelBody}>
              {previewApprovalLoading ? (
                <article className={styles.itemCard} style={{ marginBottom: 14 }}>
                  <h3 className={styles.sectionTitle}>Comprobando aprobacion</h3>
                  <p className={styles.sectionText}>Estamos verificando si la preview privada ya fue aprobada.</p>
                </article>
              ) : previewApprovalPendiente ? (
                <article className={styles.itemCard} style={{ marginBottom: 14 }}>
                  <h3 className={styles.sectionTitle}>Aprobacion pendiente de base de datos</h3>
                  <p className={styles.sectionText}>Aplica supabase/add_preview_approvals.sql para registrar aprobaciones desde enlaces privados.</p>
                </article>
              ) : previewApprovalLista ? (
                <article className={styles.itemCard} style={{ marginBottom: 14 }}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>Preview aprobada</h3>
                      <p className={styles.sectionText}>
                        {formatoFechaHistorial(previewApproval.approved_at)} · {firmantePreview(previewApproval)} · {previewApproval.destino === 'hub' ? 'Hub' : 'Carta'}
                      </p>
                      {previewApproval.reviewer_email && <p className={styles.sectionText}>{previewApproval.reviewer_email}</p>}
                      {previewApproval.note && <p className={styles.sectionText}>Nota: {previewApproval.note}</p>}
                      {previewApproval.content_summary && <p className={styles.sectionText}>Contenido aprobado: {resumenPreviewAprobada(previewApproval)}</p>}
                    </div>
                    <span className={styles.badge}>OK</span>
                  </div>
                </article>
              ) : previewApprovalObsoleta && previewApproval ? (
                <article className={styles.itemCard} style={{ marginBottom: 14 }}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>Aprobacion obsoleta</h3>
                      <p className={styles.sectionText}>
                        Ultima aprobacion: {formatoFechaHistorial(previewApproval.approved_at)} · {firmantePreview(previewApproval)}. La carta cambio despues; genera otra preview y apruebala de nuevo.
                      </p>
                      {previewApproval.note && <p className={styles.sectionText}>Nota anterior: {previewApproval.note}</p>}
                    </div>
                    <span className={styles.badge}>Revisar</span>
                  </div>
                </article>
              ) : (
                <article className={styles.itemCard} style={{ marginBottom: 14 }}>
                  <h3 className={styles.sectionTitle}>Sin aprobacion registrada</h3>
                  <p className={styles.sectionText}>Comparte el enlace privado para que puedan revisar y pulsar Aprobar preview antes de publicar.</p>
                </article>
              )}
              {previewApprovalError && <p className={styles.panelSub} style={{ marginBottom: 12 }}>{previewApprovalError}</p>}
              <div className={styles.actionRow} style={{ marginBottom: 14 }}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={actualizarAprobacionPreview}
                  disabled={!restaurante?.id || previewApprovalLoading}
                >
                  {previewApprovalLoading ? 'Actualizando...' : 'Actualizar aprobacion'}
                </button>
              </div>
              <div className={styles.previewBuilder}>
                <div className={styles.previewBuilderHead}>
                  <div>
                    <span className={styles.label}>Destino privado</span>
                    <strong>{previewDestinoActivoLabel}</strong>
                    <small>
                      {previewDestinoActivo === destinoPreview
                        ? 'Este es el destino que desbloquea la publicacion actual.'
                        : 'Util para revisar la carta directa, aunque el QR final abra el hub.'}
                    </small>
                  </div>
                  <span className={styles.badge}>No publico</span>
                </div>
                <div
                  className={`${styles.previewDestinationControl} ${previewOpcionesDestino.length === 1 ? styles.previewDestinationControlSingle : ''}`}
                  role="group"
                  aria-label="Destino de la preview"
                >
                  {previewOpcionesDestino.map(opcion => (
                    <button
                      key={opcion.id}
                      type="button"
                      className={opcion.id === previewDestinoActivo ? styles.previewDestinationActive : styles.previewDestinationButton}
                      onClick={() => cambiarDestinoPreview(opcion.id)}
                      aria-pressed={opcion.id === previewDestinoActivo}
                    >
                      <strong>{opcion.label}</strong>
                      <span>{opcion.detail}</span>
                    </button>
                  ))}
                </div>
                <p className={styles.sectionText}>
                  El revisor vera un boton de aprobacion dentro del enlace. Si despues cambias la carta, tendra que aprobar otra preview.
                </p>
              </div>
              <div className={styles.formGrid}>
                <label>
                  <span className={styles.label}>Caducidad</span>
                  <select
                    className={styles.select}
                    value={previewDuracionHoras}
                    onChange={event => setPreviewDuracionHoras(event.target.value)}
                  >
                    <option value="1">1 hora</option>
                    <option value="24">24 horas</option>
                    <option value="72">72 horas</option>
                  </select>
                </label>
                <div>
                  <span className={styles.label}>Accion</span>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={crearPreviewCompartible}
                    disabled={!restaurante?.id || generandoPreview}
                    style={{ width: '100%' }}
                  >
                    {generandoPreview ? 'Generando...' : copiado === 'preview' ? 'Copiado' : 'Generar preview'}
                  </button>
                </div>
              </div>
              {previewLink && (
                <article className={styles.previewResultCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>Enlace privado generado</h3>
                      <p className={styles.sectionText}>
                        {previewDestinoGeneradoLabel}{previewCaducaAt ? ` · Caduca ${formatoFechaHistorial(previewCaducaAt)}` : ''}
                      </p>
                    </div>
                    <span className={styles.badge}>{copiado === 'preview' ? 'Copiado' : 'Preview'}</span>
                  </div>
                  <div className={styles.urlBox} style={{ marginTop: 14 }}>{previewLink}</div>
                  <div className={styles.previewInstruction}>
                    <span>Mensaje para el revisor</span>
                    <p>{textoPreviewRevisor}</p>
                  </div>
                  <div className={styles.actionRow} style={{ marginTop: 14 }}>
                    <a className={styles.secondary} href={previewLink} target="_blank" rel="noreferrer" onClick={() => registrarDeliveryEvent('preview_opened_from_dashboard', { destino: previewDestinoGenerado, source: 'preview_result' })}>Abrir preview</a>
                    <button className={styles.ghost} onClick={() => copiar(previewLink, 'preview')}>{copiado === 'preview' ? 'Copiado' : 'Copiar enlace'}</button>
                    <button className={styles.ghost} onClick={() => copiar(textoPreviewRevisor, 'preview-texto')}>{copiado === 'preview-texto' ? 'Copiado' : 'Copiar mensaje'}</button>
                  </div>
                </article>
              )}
              {mensajePreview && <p className={styles.panelSub} style={{ marginTop: 12 }}>{mensajePreview}</p>}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{restaurante?.hub_activo ? 'URL del hub' : 'URL directa'}</h2>
                <p className={styles.panelSub}>Enlace público para compartir, probar o enviar al proveedor de imprenta.</p>
              </div>
              <span className={styles.badge}>{destino === 'r' ? 'Hub' : 'Carta'}</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.urlBox}>{urlDirecta}</div>
              <div className={styles.actionRow} style={{ marginTop: 14 }}>
                {cartaPublicada ? <a className={styles.secondary} href={urlDirecta} target="_blank" rel="noreferrer" onClick={() => registrarDeliveryEvent('public_destination_opened', { destino: destinoPreview, source: 'url_panel' })}>Abrir destino</a> : <button type="button" className={styles.secondary} disabled>Abrir destino</button>}
                <button className={styles.ghost} onClick={() => copiar(urlDirecta, 'url')} disabled={!cartaPublicada}>{copiado === 'url' ? 'Copiado' : 'Copiar URL'}</button>
                <button className={styles.ghost} onClick={() => copiar(textoEquipo, 'equipo')} disabled={!cartaPublicada}>{copiado === 'equipo' ? 'Copiado' : 'Copiar para equipo'}</button>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Pruebas rápidas</h2>
                <p className={styles.panelSub}>Tres aperturas para comprobar qué verá el cliente antes de imprimir.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.itemStack}>
                {pruebas.map(prueba => prueba.pruebaCarta ? (
                  <OpenCartaPruebaButton key={prueba.titulo} restauranteId={restaurante?.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{prueba.titulo}</h3>
                        <p className={styles.sectionText}>{prueba.detalle}</p>
                      </div>
                      <span className={styles.badge}>Abrir</span>
                    </div>
                  </OpenCartaPruebaButton>
                ) : prueba.publico && !cartaPublicada ? (
                  <button key={prueba.titulo} type="button" disabled className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{prueba.titulo}</h3>
                        <p className={styles.sectionText}>{prueba.detalle}</p>
                      </div>
                      <span className={styles.badge}>Borrador</span>
                    </div>
                  </button>
                ) : (
                  <a key={prueba.titulo} href={prueba.href} target="_blank" rel="noreferrer" className={styles.itemCard} onClick={() => registrarDeliveryEvent(prueba.evento, { destino: destinoPreview, source: 'quick_tests', href: prueba.href })}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{prueba.titulo}</h3>
                        <p className={styles.sectionText}>{prueba.detalle}</p>
                      </div>
                      <span className={styles.badge}>Abrir</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <ResponsiveOverlay
        open={vistaRapida}
        onClose={() => setVistaRapida(false)}
        size="modal"
        eyebrow="QR y accesos"
        title="Acceso rápido"
        description="Comparte o prueba el enlace público desde el móvil. La página completa sigue disponible para imprimir."
        footer={<button type="button" className={styles.ghost} onClick={() => setVistaRapida(false)}>Cerrar</button>}
      >
        <div className={styles.itemStack}>
          <div className={styles.urlBox}>{urlDirecta}</div>
          {cartaPublicada ? <a className={styles.primary} href={urlDirecta} target="_blank" rel="noreferrer" onClick={() => registrarDeliveryEvent('public_destination_opened', { destino: destinoPreview, source: 'quick_overlay' })}>Abrir destino público</a> : <button type="button" className={styles.primary} disabled>Abrir destino público</button>}
          <button className={styles.secondary} onClick={() => copiar(urlDirecta, 'quick')} disabled={!cartaPublicada}>{copiado === 'quick' ? 'Enlace copiado' : 'Copiar enlace'}</button>
          <button className={styles.secondary} onClick={descargar} disabled={!cartaPublicada}>Descargar QR</button>
          {cartaPublicada ? <a className={styles.ghost} href={urlPrint} target="_blank" rel="noreferrer" onClick={() => registrarDeliveryEvent('qr_print_opened', { destino: destinoPreview, source: 'quick_overlay' })}>Abrir impresión / PDF</a> : <button type="button" className={styles.ghost} disabled>Abrir impresión / PDF</button>}
        </div>
      </ResponsiveOverlay>
    </ModuleShell>
  )
}
