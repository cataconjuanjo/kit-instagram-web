'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '../../../supabase'
import { isAdminEmail, setAdminRestaurantEmail, setAdminRestaurantId } from '../../../demo'
import { openRestaurantDashboard } from '../../openRestaurantDashboard'
import {
  SELECT_CLIENT_ESTADISTICA_ADMIN,
  SELECT_CLIENT_PLATO_ADMIN,
  SELECT_CLIENT_PROPUESTA_ADMIN,
  SELECT_CLIENT_RESTAURANTE_ADMIN,
  SELECT_CLIENT_SELECCION_ESPECIAL_ADMIN,
  SELECT_CLIENT_VINO_ADMIN,
} from '../../../lib/clientSupabaseSelects'
import {
  calcCapitalLiberable,
  calcCandidatosCopa,
  calcAlertasCriticas,
  calcPuntuacion,
  limpiarRutasTecnicas,
  seleccionarMatchesParaAutoAplicar,
} from '../../../lib/consultoriaMetricas'
import { analizarRestaurante as analizar } from '../../../lib/analizarRestaurante'
import { TABS_VALIDOS, TAB_POR_DEFECTO, resolverTab } from '../../../lib/fichaTabs'
import { diasDesdeUltimoContacto } from '../../../lib/consultorContactos'
import { indiceSeguimiento, puedeTransicionar, PASOS_UI, indiceDePaso, agregarSeguimiento } from '../../../lib/propuestasSeguimiento'
import { construirInformeCliente } from '../../../lib/informeCliente'
import OpenCartaPruebaButton from '../../../dashboard/OpenCartaPruebaButton'


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
  if (!ticket) return { gamas: [], desajustes: [], referencias: null }
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
  if (referencias.estado === 'corta') desajustes.unshift(`Carta corta: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)
  if (referencias.estado === 'larga') desajustes.unshift(`Carta larga: ${total} referencias vs ${referencias.minimo}-${referencias.maximo} recomendadas`)
  return { gamas, desajustes, referencias }
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

function ImplantarForm({ seguimiento, onImplantar }) {
  const [euros, setEuros] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function enviar(e) {
    e.preventDefault()
    setEnviando(true)
    await onImplantar(euros === '' ? null : Number(euros))
    setEnviando(false)
    setEuros('')
  }
  return (
    <form onSubmit={enviar} className="ws-seguimiento-implantar">
      <label>
        € capturados
        <input type="number" step="0.01" min="0" value={euros} onChange={e => setEuros(e.target.value)} placeholder="opcional" />
      </label>
      <button type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Marcar implantada'}</button>
    </form>
  )
}

function RegistrarContactoModal({ onSubmit, onClose }) {
  const [canal, setCanal] = useState('llamada')
  const [resumen, setResumen] = useState('')
  const [proximo, setProximo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  function atajoDias(dias) {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    setProximo(d.toISOString().slice(0, 10))
  }
  async function enviar(e) {
    e.preventDefault()
    if (!resumen.trim()) { setError('Añade un breve resumen'); return }
    setGuardando(true); setError('')
    const r = await onSubmit({ canal, resumen: resumen.trim(), proximo_contacto: proximo || null })
    setGuardando(false)
    if (!r.ok) setError(r.error || 'No se pudo registrar.')
  }
  return (
    <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Registrar contacto">
      <div className="admin-modal-card">
        <h3>Registrar contacto</h3>
        <form onSubmit={enviar} className="ws-form-grid">
          <label>
            Canal
            <select value={canal} onChange={e => setCanal(e.target.value)}>
              <option value="llamada">Llamada</option>
              <option value="visita">Visita</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label className="ws-form-full">
            Qué se habló
            <textarea maxLength={1000} rows={4} value={resumen} onChange={e => setResumen(e.target.value)} placeholder="Resumen del contacto…" />
          </label>
          <div className="ws-form-full">
            <label>
              Próximo contacto (opcional)
              <input type="date" value={proximo} onChange={e => setProximo(e.target.value)} />
            </label>
            <div className="ws-form-shortcuts">
              <button type="button" onClick={() => atajoDias(3)}>+3 días</button>
              <button type="button" onClick={() => atajoDias(7)}>+1 semana</button>
              <button type="button" onClick={() => atajoDias(14)}>+2 semanas</button>
            </div>
          </div>
          {error && <p className="admin-alert admin-alert-error">{error}</p>}
          <div className="ws-form-actions">
            <button type="button" className="ws-btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="ws-btn-primary" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function RestauranteWorkspace() {
  const params = useParams()
  const id = params?.id
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tab = resolverTab(searchParams?.get('tab'))
  const setTab = useCallback((siguiente) => {
    const limpio = TABS_VALIDOS.includes(siguiente) ? siguiente : TAB_POR_DEFECTO
    const q = new URLSearchParams(searchParams?.toString() || '')
    if (limpio === TAB_POR_DEFECTO) q.delete('tab')
    else q.set('tab', limpio)
    const qs = q.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: true })
  }, [pathname, router, searchParams])

  const [user, setUser] = useState(null)
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [contactos, setContactos] = useState([])
  const [contactosPendienteMigracion, setContactosPendienteMigracion] = useState(false)
  const [contactoModalOpen, setContactoModalOpen] = useState(false)
  const [seguimientos, setSeguimientos] = useState([])
  const [seguimientoPendienteMigracion, setSeguimientoPendienteMigracion] = useState(false)
  const [proveedoresCatalogo, setProveedoresCatalogo] = useState([])
  const [vinosCatalogo, setVinosCatalogo] = useState([])
  const [loading, setLoading] = useState(true)
  const [candidatosSalida, setCandidatosSalida] = useState([])

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
  const [soloConCandidato, setSoloConCandidato] = useState(true)
  const [paginaMatches, setPaginaMatches] = useState(0)
  const [ultimoBulk, setUltimoBulk] = useState(null) // para deshacer
  const [bulkPlan, setBulkPlan] = useState(null) // { auto: [{vino,candidato,...,incluir:true}], revision: [...] }
  const [guardandoPropuesta, setGuardandoPropuesta] = useState(false)
  const [errorPropuesta, setErrorPropuesta] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [ultimoCampoEco, setUltimoCampoEco] = useState('precio')

  const [alertaAbierta, setAlertaAbierta] = useState(null)
  const [consultoriaFase1, setConsultoriaFase1] = useState(null)
  const [cargandoFase1, setCargandoFase1] = useState(false)
  const [recalculandoFase1, setRecalculandoFase1] = useState(false)
  const [errorFase1, setErrorFase1] = useState('')
  const propuestaFormRef = useRef(null)

  const [seleccion, setSeleccion] = useState([])
  const [vinoElegido, setVinoElegido] = useState('')
  const [notaSeleccion, setNotaSeleccion] = useState('')
  const [guardandoSeleccion, setGuardandoSeleccion] = useState(false)
  const [accionesMobileOpen, setAccionesMobileOpen] = useState(false)
  const [sigMovOpen, setSigMovOpen] = useState(false)
  const [planConsultorOpen, setPlanConsultorOpen] = useState(false)
  const [politica, setPolitica] = useState(null)
  const [politicaDraft, setPoliticaDraft] = useState('')
  const [guardandoPolitica, setGuardandoPolitica] = useState(false)

  const RESTAURANTE_PREFIX = '[RESTAURANTE] '
  const esSeleccionJuanjo = item => !String(item.nota_personal || '').startsWith(RESTAURANTE_PREFIX)

  const cargarContactos = useCallback(async (tokenRecibido) => {
    if (!id) return
    try {
      const token = tokenRecibido || await tokenAdmin()
      const res = await fetch(`/api/admin/contactos?restaurante_id=${id}`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      setContactos(Array.isArray(data.items) ? data.items : [])
      setContactosPendienteMigracion(!!data.pendiente_migracion)
    } catch { /* degrada en silencio */ }
  }, [id])

  const cargarSeguimientos = useCallback(async (tokenRecibido) => {
    if (!id) return
    try {
      const token = tokenRecibido || await tokenAdmin()
      const res = await fetch(`/api/admin/propuestas-seguimiento?restaurante_id=${id}`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      setSeguimientos(Array.isArray(data.items) ? data.items : [])
      setSeguimientoPendienteMigracion(!!data.pendiente_migracion)
    } catch { /* degrada */ }
  }, [id])

  async function registrarContacto({ canal, resumen, proximo_contacto }) {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/contactos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ restaurante_id: id, canal, resumen, proximo_contacto: proximo_contacto || null }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || 'No se pudo registrar.' }
    setContactos(prev => [data.contacto, ...prev])
    return { ok: true }
  }

  async function borrarUltimoContacto() {
    const ultimo = contactos[0]
    if (!ultimo) return
    const token = await tokenAdmin()
    const res = await fetch(`/api/admin/contactos?id=${ultimo.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setContactos(prev => prev.slice(1))
  }

  async function guardarSeguimiento(propuestaId, parche) {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/propuestas-seguimiento', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        propuesta_id: propuestaId,
        restaurante_id: id,
        ...parche,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.error || 'No se pudo guardar.' }
    setSeguimientos(prev => {
      const sinEste = prev.filter(s => String(s.propuesta_id) !== String(propuestaId))
      return [data.item, ...sinEste]
    })
    return { ok: true }
  }

  const cargarConsultoriaFase1 = useCallback(async (tokenRecibido) => {
    if (!id) return
    setCargandoFase1(true)
    setErrorFase1('')
    try {
      const token = tokenRecibido || await tokenAdmin()
      const res = await fetch(`/api/admin/consultoria-fase1/recalcular?restaurante_id=${id}`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar la consultoria inteligente.')
      setConsultoriaFase1(data)
    } catch (error) {
      setErrorFase1(error.message || 'No se pudo cargar la consultoria inteligente.')
    } finally {
      setCargandoFase1(false)
    }
  }, [id])

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) { window.location.href = '/login'; return }
      setUser(user)
      const desde = haceDiasISO(30)
      const token = await tokenAdmin()
      const [{ data: rest }, { data: vinosData }, { data: platosData }, { data: statsData }, { data: propuestasData }, { data: selData }, catalogoRes] = await Promise.all([
        supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_ADMIN).eq('id', id).single(),
        supabase.from('vinos').select(SELECT_CLIENT_VINO_ADMIN).eq('restaurante_id', id),
        supabase.from('platos').select(SELECT_CLIENT_PLATO_ADMIN).eq('restaurante_id', id),
        supabase.from('estadisticas').select(SELECT_CLIENT_ESTADISTICA_ADMIN).eq('restaurante_id', id).gte('created_at', desde),
        supabase.from('consultor_propuestas').select(SELECT_CLIENT_PROPUESTA_ADMIN).eq('restaurante_id', id).order('created_at', { ascending: false }),
        supabase.from('seleccion_especial').select(SELECT_CLIENT_SELECCION_ESPECIAL_ADMIN).eq('restaurante_id', id).eq('activo', true).order('orden'),
        fetch('/api/admin/proveedores', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const catalogoData = await catalogoRes.json().catch(() => ({}))
      setRestaurante(rest)
      if (rest?.id) {
        setAdminRestaurantId(rest.id)
        setAdminRestaurantEmail(rest.email)
      }
      setTicketDraft(rest?.ticket_medio_comida || rest?.ticket_medio || rest?.ticket_comida || '')
      setVinos(vinosData || [])
      setPlatos(platosData || [])
      setEstadisticas(statsData || [])
      setPropuestas(propuestasData || [])
      setProveedoresCatalogo(catalogoRes.ok ? catalogoData.proveedores || [] : [])
      setVinosCatalogo(catalogoRes.ok ? catalogoData.vinos || [] : [])
      setSeleccion((selData || []).filter(item => !String(item.nota_personal || '').startsWith('[RESTAURANTE] ')))
      setLoading(false)
      cargarConsultoriaFase1(token)
      cargarContactos(token)
      cargarSeguimientos(token)
      const politicaRes = await fetch(`/api/politica-precio?restaurante_id=${id}`)
      if (politicaRes.ok) {
        const politicaData = await politicaRes.json().catch(() => ({}))
        if (politicaData.politica) {
          setPolitica(politicaData.politica)
          setPoliticaDraft(String(Math.round(100 - Number(politicaData.politica.margen_objetivo || 65))))
        }
      }
    }
    if (id) cargar()
  }, [id, cargarConsultoriaFase1])

  useEffect(() => {
    if (!id) return
    try {
      setCandidatosSalida(JSON.parse(localStorage.getItem(`candidatos_salida_${id}`) || '[]'))
    } catch {
      setCandidatosSalida([])
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    localStorage.setItem(`candidatos_salida_${id}`, JSON.stringify(candidatosSalida))
  }, [id, candidatosSalida])

  const analisis = useMemo(
    () => restaurante ? analizar(restaurante, vinos, platos, estadisticas, propuestas) : null,
    [restaurante, vinos, platos, estadisticas, propuestas]
  )
  const candidatosSalidaSet = useMemo(() => new Set(candidatosSalida.map(String)), [candidatosSalida])
  const candidatosSalidaDetalle = useMemo(
    () => vinos.filter(vino => candidatosSalidaSet.has(String(vino.id))),
    [vinos, candidatosSalidaSet]
  )

  useEffect(() => {
    if (analisis?.alertas?.[0] && !alertaAbierta) setAlertaAbierta(analisis.alertas[0].titulo)
  }, [analisis, alertaAbierta])

  function gestionar() {
    openRestaurantDashboard(restaurante.id, restaurante.email)
  }

  function alternarCandidatoSalida(vinoId) {
    const idVino = String(vinoId)
    setCandidatosSalida(prev => prev.map(String).includes(idVino)
      ? prev.filter(item => String(item) !== idVino)
      : [...prev, idVino]
    )
  }

  async function recalcularConsultoriaFase1() {
    setRecalculandoFase1(true)
    setErrorFase1('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/consultoria-fase1/recalcular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ restaurante_id: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo recalcular la consultoria inteligente.')
      await cargarConsultoriaFase1(token)
    } catch (error) {
      setErrorFase1(error.message || 'No se pudo recalcular la consultoria inteligente.')
    } finally {
      setRecalculandoFase1(false)
    }
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

  function construirPlanBulk(umbral = 95) {
    // Nueva regla fase J-fix: aplica solo si (a) único candidato, o
    // (b) ventaja ≥ 10 puntos sobre el 2º con formato coincidente.
    // Si el vino de la carta no tiene formato, auto solo si todos los
    // candidatos ≥umbral son 75 cl (asumido). El resto va a revisión.
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(matchesCatalogo, { umbral, ventajaMinima: 10 })
    if (auto.length === 0) {
      setMensajeMatch(`Ningún vino cumple la regla de auto-aplicación con umbral ${umbral}%. Revisa los ${revision.length} dudosos.`)
      setBulkPlan(null)
      return
    }
    setBulkPlan({
      auto: auto.map(a => ({
        ...a,
        incluir: true,
        clave: `${a.vino.id}-${a.candidato.vino.id}`,
      })),
      revision,
      umbral,
    })
    setMensajeMatch('')
  }

  function toggleBulkIncluir(clave) {
    setBulkPlan(prev => prev && {
      ...prev,
      auto: prev.auto.map(item => item.clave === clave ? { ...item, incluir: !item.incluir } : item),
    })
  }

  async function ejecutarPlanBulk() {
    if (!bulkPlan) return
    const seleccionados = bulkPlan.auto.filter(item => item.incluir)
    if (seleccionados.length === 0) {
      setMensajeMatch('No has dejado ningún vino marcado.')
      return
    }
    const antes = seleccionados.map(({ vino }) => ({
      id: vino.id,
      proveedor: vino.proveedor,
      coste_compra: vino.coste_compra,
      referencia_proveedor: vino.referencia_proveedor,
      formato_compra: vino.formato_compra,
    }))
    let ok = 0
    let error = 0
    for (const item of seleccionados) {
      try {
        await aplicarMatchCatalogo(item.vino, item.candidato)
        ok++
      } catch { error++ }
    }
    setUltimoBulk({ antes, cuando: Date.now() })
    setBulkPlan(null)
    setMensajeMatch(`${ok} coincidencias aplicadas (${error} con error). ${bulkPlan.revision.length} dudosas quedaron en revisión. Puedes pulsar “Deshacer” antes de recargar.`)
  }

  async function deshacerUltimoBulk() {
    if (!ultimoBulk) return
    for (const original of ultimoBulk.antes) {
      await supabase
        .from('vinos')
        .update({
          proveedor: original.proveedor || null,
          coste_compra: original.coste_compra || null,
          referencia_proveedor: original.referencia_proveedor || null,
          formato_compra: original.formato_compra || null,
        })
        .eq('id', original.id)
        .eq('restaurante_id', id)
    }
    setVinos(prev => prev.map(vino => {
      const original = ultimoBulk.antes.find(a => String(a.id) === String(vino.id))
      return original ? { ...vino, ...original } : vino
    }))
    setUltimoBulk(null)
    setMensajeMatch('Cambios deshechos.')
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

  async function guardarPolitica() {
    setGuardandoPolitica(true)
    try {
      const token = await tokenAdmin()
      const margenObjetivo = 100 - Number(politicaDraft)
      const res = await fetch('/api/politica-precio', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: id, margen_objetivo: margenObjetivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPolitica(data.politica)
    } catch (err) {
      alert(err.message || 'Error al guardar la política de precios')
    } finally {
      setGuardandoPolitica(false)
    }
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

  function copiarPlanConsultor() {
    const diagnostico = consultoriaFase1?.consultor?.diagnostic
    const items = consultoriaFase1?.consultor?.items || []
    if (!diagnostico) return
    const porFase = fase => items.filter(item => item.fase === fase)
    const lineas = [
      `Plan consultor - ${restaurante.nombre}`,
      '',
      diagnostico.resumen_ejecutivo,
      '',
      `Estado actual: ${diagnostico.estado_actual}`,
      `Problema principal: ${diagnostico.problema_principal}`,
      '',
      'Acciones rapidas:',
      ...(porFase('accion_rapida').length ? porFase('accion_rapida').map((item, index) => `${index + 1}. ${item.titulo}: ${item.accion}`) : ['Sin acciones rapidas detectadas.']),
      '',
      'Medio plazo:',
      ...(porFase('medio_plazo').length ? porFase('medio_plazo').map((item, index) => `${index + 1}. ${item.titulo}: ${item.accion}`) : ['Sin acciones de medio plazo detectadas.']),
      '',
      'Estrategico:',
      ...(porFase('estrategico').length ? porFase('estrategico').map((item, index) => `${index + 1}. ${item.titulo}: ${item.accion}`) : ['Sin acciones estrategicas detectadas.']),
    ]
    navigator.clipboard.writeText(lineas.join('\n'))
  }

  function copiarInformeEjecutivo() {
    const diagnostico = consultoriaFase1?.consultor?.diagnostic
    const oportunidad = consultoriaFase1?.oportunidad?.snapshot
    const oportunidades = consultoriaFase1?.oportunidad?.items || []
    const alertasMotor = consultoriaFase1?.alertas || []
    const copa = consultoriaFase1?.copa?.snapshot
    if (!diagnostico && !oportunidad && !alertasMotor.length) return
    const lineas = [
      `Informe ejecutivo - ${restaurante.nombre}`,
      '',
      diagnostico?.resumen_ejecutivo || `Diagnostico pendiente de recalculo para ${restaurante.nombre}.`,
      '',
      diagnostico?.estado_actual ? `Estado actual: ${diagnostico.estado_actual}` : '',
      diagnostico?.problema_principal ? `Problema principal: ${diagnostico.problema_principal}` : '',
      oportunidad ? `Recuperación anual estimada: ${Number(oportunidad.recuperacion_anual_estimada).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR` : '',
      `Capital liberable: ${Number(calcCapitalLiberable({ snapshotOportunidad: oportunidad, metricas }).valor).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR`,
      `Candidatos para venta por copa: ${calcCandidatosCopa({ snapshotCopa: copa, metricas }).valor}`,
      '',
      'Alertas principales:',
      ...(alertasMotor.length
        ? alertasMotor.slice(0, 5).map((alerta, index) => `${index + 1}. ${alerta.titulo}: ${limpiarRutasTecnicas(alerta.accion_sugerida || alerta.detalle)}`)
        : ['Sin alertas abiertas por resolver.']),
      '',
      'Oportunidades económicas:',
      ...(oportunidades.length
        ? oportunidades.slice(0, 5).map((item, index) => `${index + 1}. ${item.titulo}: ${limpiarRutasTecnicas(item.accion)} (${Number(item.impacto_estimado).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR estimados)`)
        : ['Sin oportunidades cuantificadas todavía.']),
    ].filter(Boolean)
    navigator.clipboard.writeText(lineas.join('\n'))
  }

  function imprimirInforme() {
    // El informe imprimible solo existe cuando la pestaña 'informe' está
    // montada. Nos aseguramos de cambiar a esa pestaña y esperamos un
    // frame para que React monte el DOM antes de invocar print().
    if (tab !== 'informe') setTab('informe')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
      })
    })
  }

  const [modoInformeCliente, setModoInformeCliente] = useState(false)
  function imprimirInformeCliente() {
    setModoInformeCliente(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
        // Al volver del diálogo, salir del modo cliente.
        setTimeout(() => setModoInformeCliente(false), 500)
      })
    })
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
    }]).select(SELECT_CLIENT_SELECCION_ESPECIAL_ADMIN)
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
  const decisionesPrioritarias = alertas.slice(0, 3)

  return (
    <div className="admin-main ws-main">

          {/* Workspace header */}
          <div className="ws-header" style={(restaurante.color_primario || restaurante.color_acento) ? { borderTop: `3px solid ${restaurante.color_primario || restaurante.color_acento}` } : undefined}>
            <div className="ws-header-left">
              <Link href="/admin/consultoria" className="ws-back">← Radar</Link>
              <div>
                <h2 className="ws-title">{restaurante.nombre}</h2>
                <span className="ws-sub">
                  {restaurante.color_primario && <span aria-hidden="true" title={`Primario ${restaurante.color_primario}`} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: restaurante.color_primario, border: '1px solid rgba(0,0,0,.12)', verticalAlign: 'middle', marginRight: 4 }} />}
                  {restaurante.color_acento && restaurante.color_acento !== restaurante.color_primario && <span aria-hidden="true" title={`Acento ${restaurante.color_acento}`} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: restaurante.color_acento, border: '1px solid rgba(0,0,0,.12)', verticalAlign: 'middle', marginRight: 6 }} />}
                  {[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ')} · {metricas.vinos} vinos · {metricas.platos} platos
                </span>
              </div>
            </div>
            <div className="ws-header-actions">
              <button onClick={copiarResumen} aria-label="Copiar resumen del restaurante">Copiar datos</button>
              <button onClick={gestionar}>Abrir dashboard</button>
              <button onClick={() => imprimirInforme()} aria-label="Imprimir esta página">Imprimir página</button>
              <button onClick={() => imprimirInformeCliente()} aria-label="Informe para el cliente (1 página A4)">Informe para el cliente</button>
              <a href={`/admin/informe/${id}`} target="_blank" rel="noreferrer">Descargar informe</a>
              <OpenCartaPruebaButton restauranteId={restaurante.id}>Probar carta</OpenCartaPruebaButton>
            </div>
            <div className="ws-actions-mobile">
              <button
                type="button"
                className="ws-actions-toggle"
                onClick={() => setAccionesMobileOpen(o => !o)}
                aria-expanded={accionesMobileOpen}
              >
                Acciones {accionesMobileOpen ? '▲' : '▼'}
              </button>
              {accionesMobileOpen && (
                <div className="ws-actions-dropdown-panel">
                  <button onClick={() => { copiarResumen(); setAccionesMobileOpen(false) }}>Copiar datos</button>
                  <button onClick={() => { gestionar(); setAccionesMobileOpen(false) }}>Abrir dashboard</button>
                  <button onClick={() => { imprimirInforme(); setAccionesMobileOpen(false) }}>Imprimir página</button>
                  <a href={`/admin/informe/${id}`} target="_blank" rel="noreferrer" onClick={() => setAccionesMobileOpen(false)}>Descargar informe</a>
                  <OpenCartaPruebaButton restauranteId={restaurante.id}>Probar carta</OpenCartaPruebaButton>
                </div>
              )}
            </div>
          </div>

          {/* Pestañas reales con ?tab=. El mount es lazy: sólo la activa se renderiza. */}
          <nav className="ws-tabs" role="tablist" aria-label="Secciones del restaurante">
            <button role="tab" aria-selected={tab === 'resumen'} className={tab === 'resumen' ? 'is-active' : ''} onClick={() => setTab('resumen')}>
              Resumen {propuestasAbiertas.length > 0 && <span className="ws-badge">{propuestasAbiertas.length}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'inteligencia'} className={tab === 'inteligencia' ? 'is-active' : ''} onClick={() => setTab('inteligencia')}>
              Inteligencia {consultoriaFase1?.alertas?.length > 0 && <span className="ws-badge">{consultoriaFase1.alertas.length}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'hallazgos'} className={tab === 'hallazgos' ? 'is-active' : ''} onClick={() => setTab('hallazgos')}>
              Hallazgos {alertas.length > 0 && <span className="ws-badge">{alertas.length}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'matching'} className={tab === 'matching' ? 'is-active' : ''} onClick={() => setTab('matching')}>
              Matching {matchesCatalogo.length > 0 && <span className="ws-badge">{matchesCatalogo.length}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'propuestas'} className={tab === 'propuestas' ? 'is-active' : ''} onClick={() => setTab('propuestas')}>
              Propuestas {propuestasActivas.length > 0 && <span className="ws-badge">{propuestasActivas.length}</span>}
            </button>
            <button role="tab" aria-selected={tab === 'seleccion'} className={tab === 'seleccion' ? 'is-active' : ''} onClick={() => setTab('seleccion')}>
              Selección {seleccion.length > 0 && <span className="ws-badge">{seleccion.length}/4</span>}
            </button>
            <button role="tab" aria-selected={tab === 'informe'} className={tab === 'informe' ? 'is-active' : ''} onClick={() => setTab('informe')}>
              Informe
            </button>
          </nav>

          {/* ═══════════════════════════════════════
              SECCIÓN: RESUMEN
          ═══════════════════════════════════════ */}
          {tab === 'resumen' && (
          <section id="ws-resumen" className="ws-section">
            <div className="ws-resumen-top">
              <div className="ws-score-block">
                <div className={`ws-score ws-score-${calcPuntuacion(analisis).prioridad.toLowerCase()}`}>
                  <span>{calcPuntuacion(analisis).score}</span>
                  <strong>{calcPuntuacion(analisis).prioridad}</strong>
                </div>
                <div className="ws-next-block">
                  <button
                    type="button"
                    className="ws-next-header"
                    onClick={() => setSigMovOpen(o => !o)}
                    aria-expanded={sigMovOpen}
                  >
                    <p className="ws-next-label">Siguiente movimiento</p>
                    <span className="ws-next-chevron">{sigMovOpen ? '−' : '+'}</span>
                  </button>
                  <p className={`ws-next-text${sigMovOpen ? '' : ' ws-next-collapsed'}`}>{siguienteMovimiento}</p>
                </div>
              </div>
              <div className="ws-metrics-grid">
                <div><span>Vinos activos</span><strong>{metricas.vinos}</strong></div>
                <div><span>Vinos servidos por copa</span><strong>{metricas.copa}</strong></div>
                <div><span>Margen medio</span><strong>{metricas.margenMedio ?? '—'}%</strong></div>
                <div><span>Precio medio</span><strong>{metricas.precioMedioVino} EUR</strong></div>
                <div><span>Escaneos 30d</span><strong>{metricas.escaneos30}</strong></div>
                <div><span>Maridajes 30d</span><strong>{metricas.sommelier30}</strong></div>
                <div><span>Bodega a coste</span><strong>{eur(metricas.valorCoste)}</strong></div>
                <div><span>Propuestas abiertas</span><strong>{propuestasAbiertas.length}</strong></div>
                <div>
                  <span>Último contacto</span>
                  <strong>
                    {(() => {
                      const d = diasDesdeUltimoContacto(contactos)
                      if (contactosPendienteMigracion) return <em style={{ fontWeight: 400, color: 'var(--ink-muted, #666)' }}>Pendiente de activar</em>
                      if (d == null) return <em style={{ fontWeight: 400, color: 'var(--ink-muted, #666)' }}>Sin contactos</em>
                      if (d === 0) return 'hoy'
                      if (d === 1) return 'ayer'
                      return `hace ${d} días`
                    })()}
                  </strong>
                </div>
              </div>
            </div>

            {/* Registro de contactos (FASE K) */}
            <div className="ws-contactos-block">
              <div className="ws-contactos-head">
                <div>
                  <p className="admin-kicker">Registro de contactos</p>
                  <small>{contactos.length} contactos registrados</small>
                </div>
                <button
                  type="button"
                  className="ws-btn-primary"
                  onClick={() => setContactoModalOpen(true)}
                  disabled={contactosPendienteMigracion}
                  title={contactosPendienteMigracion ? 'La tabla aún no está aplicada en Supabase.' : ''}
                >
                  Registrar contacto
                </button>
              </div>
              {contactosPendienteMigracion && (
                <p className="admin-alert">Pendiente de activar en servidor — aplica la migración de fase K para empezar a registrar contactos.</p>
              )}
              {!contactosPendienteMigracion && contactos.length === 0 && (
                <p className="ws-contactos-empty">Aún no hay contactos registrados.</p>
              )}
              {!contactosPendienteMigracion && contactos.length > 0 && (
                <ul className="ws-contactos-list">
                  {contactos.slice(0, 5).map(c => (
                    <li key={c.id}>
                      <div>
                        <strong>{c.canal}</strong>
                        <span>{new Date(c.ocurrido_en).toLocaleDateString('es-ES')}</span>
                        {c.proximo_contacto && <em>Próximo: {new Date(c.proximo_contacto).toLocaleDateString('es-ES')}</em>}
                      </div>
                      <p>{limpiarRutasTecnicas(c.resumen)}</p>
                    </li>
                  ))}
                  {contactos.length > 0 && (
                    <li className="ws-contactos-list-actions">
                      <button type="button" className="admin-plain-button" onClick={borrarUltimoContacto}>
                        Borrar último
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {contactoModalOpen && (
              <RegistrarContactoModal
                onSubmit={async (datos) => {
                  const r = await registrarContacto(datos)
                  if (r.ok) setContactoModalOpen(false)
                  return r
                }}
                onClose={() => setContactoModalOpen(false)}
              />
            )}
            {servicios.length > 0 && (
              <div className="ws-servicios">
                <span className="ws-servicios-label">Servicios detectados</span>
                {servicios.map(s => <span key={s} className="ws-servicio-pill">{s}</span>)}
              </div>
            )}

            <div className="consultant-decision-board">
              <div className="consultant-decision-head">
                <div>
                  <p className="admin-kicker">Decisión ejecutiva</p>
                  <h3>Qué mover ahora</h3>
                </div>
                <span>{decisionesPrioritarias.length || 1} acciones priorizadas</span>
              </div>
              <div className="consultant-decision-grid">
                {decisionesPrioritarias.length ? decisionesPrioritarias.map((alerta, index) => (
                  <article key={alerta.titulo}>
                    <div className="consultant-decision-number">{index + 1}</div>
                    <div>
                      <span>{alerta.servicio}</span>
                      <strong>{alerta.titulo}</strong>
                      <p>{alerta.detalle}</p>
                    </div>
                    <div className="consultant-decision-actions">
                      <button
                        type="button"
                        onClick={() => abrirFormNuevo({
                          titulo: alerta.titulo,
                          motivo: `${alerta.detalle}\n\nAcción sugerida: ${alerta.accion || alerta.servicio}`,
                          prioridad: index === 0 ? 'alta' : 'media',
                        })}
                      >
                        Crear propuesta
                      </button>
                      <button type="button" onClick={() => setTab('hallazgos')}>Ver diagnóstico</button>
                    </div>
                  </article>
                )) : (
                  <article className="consultant-decision-clear">
                    <div className="consultant-decision-number">✓</div>
                    <div>
                      <span>Mantenimiento</span>
                      <strong>Sin bloqueos prioritarios</strong>
                      <p>Revisa pequeños ajustes de relato, sala y rotación antes de abrir nuevas propuestas.</p>
                    </div>
                    <div className="consultant-decision-actions">
                      <button type="button" onClick={gestionar}>Abrir dashboard</button>
                    </div>
                  </article>
                )}
              </div>
            </div>
          </section>
          )}

          {tab === 'inteligencia' && (
          <section id="ws-inteligencia" className="ws-section consulting-intelligence">
            <div className="ws-section-head">
              <div className="ws-section-title-wrap">
                <h3 className="ws-section-title">Diagnóstico del restaurante</h3>
                <p className="ws-section-lead">Calcula KPIs, detecta problemas, genera recomendaciones y clasifica referencias con los últimos 30 días.</p>
              </div>
              <button className="ws-btn-primary" onClick={recalcularConsultoriaFase1} disabled={recalculandoFase1}>
                {recalculandoFase1 ? 'Recalculando...' : 'Recalcular y guardar'}
              </button>
            </div>

            {errorFase1 && <p className="admin-alert admin-alert-error">{errorFase1}</p>}
            {cargandoFase1 && <div className="ws-empty-block">Cargando datos guardados...</div>}
            {!cargandoFase1 && !consultoriaFase1?.ultima && (
              <div className="ws-empty-block">
                Todavía no hay datos guardados para este restaurante. Pulsa &ldquo;Recalcular y guardar&rdquo; para generar el primer análisis.
              </div>
            )}

            {consultoriaFase1?.ultima && (
              <>
                <div className="intelligence-meta">
                  <span>Ultima foto: {new Date(consultoriaFase1.ultima.created_at).toLocaleString('es-ES')}</span>
                  <span>Periodo: {new Date(consultoriaFase1.ultima.periodo_inicio).toLocaleDateString('es-ES')} - {new Date(consultoriaFase1.ultima.periodo_fin).toLocaleDateString('es-ES')}</span>
                </div>

                {consultoriaFase1.consultor_pendiente_migracion && (
                  <p className="admin-alert admin-alert-error">
                    Modo consultor pendiente: falta aplicar en Supabase la migracion supabase/add_consultant_mode.sql.
                  </p>
                )}

                {consultoriaFase1.oportunidad_pendiente_migracion && (
                  <p className="admin-alert admin-alert-error">
                    Oportunidad economica pendiente: falta aplicar en Supabase la migracion supabase/add_opportunity_engine.sql.
                  </p>
                )}

                {consultoriaFase1.consultor?.diagnostic && (
                  <div className={`consultant-plan is-historic${planConsultorOpen ? ' is-expanded' : ''}`}>
                    <div className="consultant-plan-head">
                      <div>
                        <button
                          type="button"
                          className="consultant-plan-toggle"
                          onClick={() => setPlanConsultorOpen(o => !o)}
                          aria-expanded={planConsultorOpen}
                        >
                          <h4>Plan consultor</h4>
                          <span className="consultant-plan-chevron">{planConsultorOpen ? '−' : '+'}</span>
                        </button>
                        {consultoriaFase1.ultima?.created_at && (
                          <p className="consultant-plan-dateline">
                            Plan guardado el {new Date(consultoriaFase1.ultima.created_at).toLocaleDateString('es-ES')} · valoración de entonces
                          </p>
                        )}
                        <p>{consultoriaFase1.consultor.diagnostic.resumen_ejecutivo}</p>
                      </div>
                      <button type="button" onClick={copiarPlanConsultor}>Copiar resumen para cliente</button>
                    </div>
                    <div className="consultant-plan-body">
                    <div className="consultant-plan-status">
                      <div>
                        <span>Problema principal</span>
                        <strong>{consultoriaFase1.consultor.diagnostic.problema_principal}</strong>
                      </div>
                    </div>
                    <p className="consultant-current-state">{consultoriaFase1.consultor.diagnostic.estado_actual}</p>
                    <div className="consultant-plan-columns">
                      {[
                        ['accion_rapida', 'Acciones rapidas'],
                        ['medio_plazo', 'Medio plazo'],
                        ['estrategico', 'Estrategico'],
                      ].map(([fase, label]) => {
                        const items = (consultoriaFase1.consultor.items || []).filter(item => item.fase === fase)
                        return (
                          <div key={fase}>
                            <h5>{label}</h5>
                            {items.slice(0, 6).map(item => (
                              <article key={item.id || `${fase}-${item.titulo}`}>
                                <strong>{item.titulo}</strong>
                                <span>{limpiarRutasTecnicas(item.detalle)}</span>
                                <small>{limpiarRutasTecnicas(item.accion)}</small>
                                <em>{item.prioridad} · impacto {item.impacto} · esfuerzo {item.esfuerzo}</em>
                              </article>
                            ))}
                            {!items.length && <p className="ws-empty-inline">Sin acciones en este bloque.</p>}
                          </div>
                        )
                      })}
                    </div>

                    {consultoriaFase1.oportunidad?.snapshot && (
                      <div className="opportunity-engine">
                        <div className="opportunity-head">
                          <div>
                            <h5>Oportunidad económica</h5>
                            <p>{consultoriaFase1.oportunidad.snapshot.resumen}</p>
                          </div>
                        </div>
                        <div className="opportunity-kpis">
                          <div>
                            <span>Recuperacion anual estimada</span>
                            <strong>{Number(consultoriaFase1.oportunidad.snapshot.recuperacion_anual_estimada).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</strong>
                          </div>
                          <div>
                            <span>Capital liberable</span>
                            <strong>{Number(calcCapitalLiberable({ snapshotOportunidad: consultoriaFase1.oportunidad.snapshot, metricas }).valor).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</strong>
                          </div>
                          <div>
                            <span>Acciones rapidas</span>
                            <strong>{Number(consultoriaFase1.oportunidad.snapshot.impacto_acciones_rapidas).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</strong>
                          </div>
                          <div>
                            <span>Confianza media</span>
                            <strong>{Number(consultoriaFase1.oportunidad.snapshot.confianza_media_pct).toFixed(0)}%</strong>
                          </div>
                        </div>
                        <div className="opportunity-list">
                          {(consultoriaFase1.oportunidad.items || []).slice(0, 6).map(item => (
                            <article key={item.id || `${item.area}-${item.titulo}`}>
                              <div>
                                <strong>{item.titulo}</strong>
                                <span>{limpiarRutasTecnicas(item.detalle)}</span>
                                <small>{limpiarRutasTecnicas(item.accion)}</small>
                              </div>
                              <div>
                                <b>{Number(item.impacto_estimado).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</b>
                                <em>{item.area} · {item.horizonte.replace('_', ' ')} · confianza {Number(item.confianza_pct).toFixed(0)}%</em>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                    </div>{/* consultant-plan-body */}
                  </div>
                )}

                <div className="intelligence-kpis">
                  {(consultoriaFase1.kpis || []).slice(0, 10).map(kpi => (
                    <div key={kpi.id || kpi.clave}>
                      <span>{kpi.nombre}</span>
                      <strong>{Number(kpi.valor).toLocaleString('es-ES', { maximumFractionDigits: 2 })} {kpi.unidad}</strong>
                      <small>{kpi.interpretacion}</small>
                    </div>
                  ))}
                </div>

                <div className="intelligence-columns">
                  <div>
                    <h4>Alertas activas</h4>
                    {(consultoriaFase1.alertas || []).length ? consultoriaFase1.alertas.slice(0, 6).map(alerta => (
                      <article className={`intelligence-alert is-${alerta.severidad}`} key={alerta.id}>
                        <strong>{alerta.titulo}</strong>
                        <span>{limpiarRutasTecnicas(alerta.detalle)}</span>
                        <small>{limpiarRutasTecnicas(alerta.accion_sugerida)}</small>
                      </article>
                    )) : <p className="ws-empty-inline">Sin alertas activas guardadas.</p>}
                  </div>

                  <div>
                    <h4>Recomendaciones automaticas</h4>
                    {(consultoriaFase1.recomendaciones || []).length ? consultoriaFase1.recomendaciones.slice(0, 6).map(rec => (
                      <article className="intelligence-rec" key={rec.id}>
                        <strong>{rec.titulo}</strong>
                        <span>{rec.detalle}</span>
                        <small>{rec.prioridad} - esfuerzo {rec.esfuerzo} - {rec.accion}</small>
                      </article>
                    )) : <p className="ws-empty-inline">Sin recomendaciones pendientes guardadas.</p>}
                  </div>
                </div>

                <div className="intelligence-classifications">
                  <h4>Clasificacion de referencias</h4>
                  <div>
                    {['estrella', 'joya', 'caballo', 'revisar'].map(categoria => {
                      const items = (consultoriaFase1.clasificaciones || []).filter(item => item.categoria === categoria)
                      const label = categoria === 'estrella' ? 'Estrellas'
                        : categoria === 'joya' ? 'Joyas ocultas'
                          : categoria === 'caballo' ? 'Caballos de batalla'
                            : 'A revisar'
                      return (
                        <details key={categoria} className={`classification-group is-${categoria}`}>
                          <summary><strong>{label}</strong><span>{items.length}</span></summary>
                          {items.slice(0, 12).map(item => (
                            <div className="classification-wine" key={item.id}>
                              <span>{item.vinos?.nombre || 'Vino sin nombre'}</span>
                              <small>{Number(item.margen_bruto_pct).toFixed(1)}% margen - {Number(item.popularidad_pct).toFixed(1)}% popularidad</small>
                            </div>
                          ))}
                          {!items.length && <p className="ws-empty-inline">Sin referencias en esta categoría.</p>}
                        </details>
                      )
                    })}
                  </div>
                </div>

                {consultoriaFase1.inventario_pendiente_migracion && (
                  <p className="admin-alert admin-alert-error">
                    Inventario inteligente pendiente: falta aplicar en Supabase la migracion supabase/add_inventory_intelligence.sql.
                  </p>
                )}

                {consultoriaFase1.carta_pendiente_migracion && (
                  <p className="admin-alert admin-alert-error">
                    Inteligencia de carta pendiente: falta aplicar en Supabase la migracion supabase/add_wine_list_intelligence.sql.
                  </p>
                )}

                {consultoriaFase1.copa_pendiente_migracion && (
                  <p className="admin-alert admin-alert-error">
                    Motor por copa pendiente: falta aplicar en Supabase la migracion supabase/add_btg_engine.sql.
                  </p>
                )}

                {consultoriaFase1.inventario?.snapshot && (
                  <div className="inventory-intelligence">
                    <div className="inventory-intelligence-head">
                      <div>
                        <h4>Inventario inteligente</h4>
                        <p>Foto de bodega guardada con stock inmovilizado, referencias lentas, exceso, proveedor principal y mermas.</p>
                      </div>
                      <Link href="/dashboard/bodega" className="ws-btn-secondary">Abrir bodega</Link>
                    </div>
                    <div className="inventory-intelligence-kpis">
                      <div>
                        <span>Valor a coste</span>
                        <strong>{Number(consultoriaFase1.inventario.snapshot.valor_coste_total).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</strong>
                      </div>
                      <div>
                        <span>Stock inmovilizado</span>
                        <strong>{consultoriaFase1.inventario.snapshot.stock_inmovilizado_refs}</strong>
                        <small>{Number(consultoriaFase1.inventario.snapshot.stock_inmovilizado_valor).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</small>
                      </div>
                      <div>
                        <span>Referencias lentas</span>
                        <strong>{consultoriaFase1.inventario.snapshot.referencias_lentas}</strong>
                      </div>
                      <div>
                        <span>Exceso de stock</span>
                        <strong>{consultoriaFase1.inventario.snapshot.exceso_stock_refs}</strong>
                      </div>
                      <div>
                        <span>Proveedor principal</span>
                        <strong>{consultoriaFase1.inventario.snapshot.proveedor_principal || 'Sin datos'}</strong>
                        <small>{Number(consultoriaFase1.inventario.snapshot.proveedor_principal_pct).toFixed(1)}%</small>
                      </div>
                      <div>
                        <span>Merma / ajustes</span>
                        <strong>{Number(consultoriaFase1.inventario.snapshot.tasa_merma_pct).toFixed(1)}%</strong>
                        <small>{consultoriaFase1.inventario.snapshot.merma_unidades} uds.</small>
                      </div>
                    </div>
                    <div className="inventory-risk-list">
                      {(consultoriaFase1.inventario.items || [])
                        .filter(item => ['inmovilizado', 'lento', 'exceso', 'bajo_minimo', 'sin_datos'].includes(item.estado_inventario))
                        .slice(0, 12)
                        .map(item => (
                          <div className={`inventory-risk-item is-${item.estado_inventario}`} key={item.id || `${item.vino_id}-${item.estado_inventario}`}>
                            <div>
                              <strong>{item.vinos?.nombre || 'Vino sin nombre'}</strong>
                              <span>{item.motivo}</span>
                            </div>
                            <div>
                              <b>{item.estado_inventario.replace('_', ' ')}</b>
                              <small>{item.stock_actual} uds. · {Number(item.valor_stock_coste).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</small>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {consultoriaFase1.carta?.snapshot && (
                  <div className="wine-list-intelligence">
                    <div className="inventory-intelligence-head">
                      <div>
                        <h4>Inteligencia de carta</h4>
                        <p>Lee productividad por referencia, concentración de ventas, huecos de precio y bajo rendimiento.</p>
                      </div>
                      <Link href="/dashboard/menu-engineering" className="ws-btn-secondary">Ver menu engineering</Link>
                    </div>
                    <div className="inventory-intelligence-kpis">
                      <div>
                        <span>Pareto top 20%</span>
                        <strong>{Number(consultoriaFase1.carta.snapshot.pareto_top20_ventas_pct).toFixed(1)}%</strong>
                        <small>{consultoriaFase1.carta.snapshot.pareto_top20_refs} refs.</small>
                      </div>
                      <div>
                        <span>Refs. con venta</span>
                        <strong>{consultoriaFase1.carta.snapshot.referencias_con_venta}</strong>
                        <small>de {consultoriaFase1.carta.snapshot.referencias_total}</small>
                      </div>
                      <div>
                        <span>Productividad media</span>
                        <strong>{Number(consultoriaFase1.carta.snapshot.productividad_media).toFixed(1)}</strong>
                        <small>sobre 100</small>
                      </div>
                      <div>
                        <span>Bajo rendimiento</span>
                        <strong>{consultoriaFase1.carta.snapshot.bottom10_refs}</strong>
                        <small>bottom 10%</small>
                      </div>
                      <div>
                        <span>Huecos de precio</span>
                        <strong>{(consultoriaFase1.carta.snapshot.huecos_precio || []).length}</strong>
                      </div>
                      <div>
                        <span>Estado carta</span>
                        <strong>{consultoriaFase1.carta.snapshot.carta_inflada ? 'Inflada' : 'Controlada'}</strong>
                      </div>
                    </div>

                    {(consultoriaFase1.carta.snapshot.huecos_precio || []).length > 0 && (
                      <div className="wine-list-gaps">
                        {(consultoriaFase1.carta.snapshot.huecos_precio || []).map(item => (
                          <span key={`${item.gama}-${item.rango}`}>{item.gama}: {item.rango} EUR</span>
                        ))}
                      </div>
                    )}

                    <div className="wine-list-gamas">
                      {(consultoriaFase1.carta.snapshot.resumen_gamas || []).map(gama => (
                        <div key={gama.id}>
                          <strong>{gama.nombre}</strong>
                          <span>{gama.referencias} refs. · {gama.ventas_pct}% ventas</span>
                          <small>{gama.rango} EUR · productividad {Number(gama.productividad_media).toFixed(1)}</small>
                        </div>
                      ))}
                    </div>

                    <div className="inventory-risk-list">
                      {(consultoriaFase1.carta.items || [])
                        .filter(item => item.es_bottom10)
                        .slice(0, 10)
                        .map(item => (
                          <div className="inventory-risk-item is-lento" key={item.id || item.vino_id}>
                            <div>
                              <strong>{item.vinos?.nombre || item.nombre || 'Vino sin nombre'}</strong>
                              <span>{item.motivo}</span>
                            </div>
                            <div>
                              <b>{Number(item.productividad_score).toFixed(1)}/100</b>
                              <small>{item.ventas_unidades} ventas · {Number(item.margen_bruto_pct).toFixed(1)}% margen</small>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {consultoriaFase1.copa?.snapshot && (
                  <div className="btg-intelligence">
                    <div className="inventory-intelligence-head">
                      <div>
                        <h4>Motor de venta por copa</h4>
                        <p>Detecta candidatos por copa, copa premium, Coravin y copas de descubrimiento para llevar una propuesta concreta al restaurante.</p>
                      </div>
                      <Link href="/dashboard/sala" className="ws-btn-secondary">Abrir sala</Link>
                    </div>
                    <div className="inventory-intelligence-kpis">
                      <div>
                        <span>Cobertura por copa</span>
                        <strong>{Number(consultoriaFase1.copa.snapshot.cobertura_copa_pct).toFixed(1)}%</strong>
                        <small>{consultoriaFase1.copa.snapshot.referencias_por_copa} de {consultoriaFase1.copa.snapshot.referencias_activas}</small>
                      </div>
                      <div>
                        <span>Candidatos copa</span>
                        <strong>{consultoriaFase1.copa.snapshot.candidatos_copa}</strong>
                      </div>
                      <div>
                        <span>Copa premium</span>
                        <strong>{consultoriaFase1.copa.snapshot.candidatos_copa_premium}</strong>
                      </div>
                      <div>
                        <span>Coravin</span>
                        <strong>{consultoriaFase1.copa.snapshot.candidatos_coravin}</strong>
                      </div>
                      <div>
                        <span>Beneficio potencial</span>
                        <strong>{Number(consultoriaFase1.copa.snapshot.beneficio_potencial_estimado).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</strong>
                        <small>si se vende una botella de cada candidato por copa</small>
                      </div>
                    </div>

                    <div className="btg-candidates">
                      {(consultoriaFase1.copa.candidates || []).slice(0, 10).map(item => {
                        const esDescubrimiento = /descubrimiento/i.test(`${item.motivo || ''} ${item.accion || ''}`)
                        return (
                          <div className={`btg-candidate is-${item.categoria_copa}${esDescubrimiento ? ' is-discovery' : ''}`} key={item.id || item.vino_id}>
                            <div>
                              <strong>{item.vinos?.nombre || item.nombre || 'Vino sin nombre'}</strong>
                              <span>{item.motivo}</span>
                              <small>{item.accion}</small>
                            </div>
                            <div>
                              <b>{Number(item.score_copa).toFixed(0)}/100</b>
                              <span>{esDescubrimiento ? 'descubrimiento' : item.categoria_copa.replace('_', ' ')}</span>
                              <small>{Number(item.precio_copa_sugerido).toFixed(2)} EUR/copa · margen {Number(item.margen_copa_pct).toFixed(1)}%</small>
                            </div>
                          </div>
                        )
                      })}
                      {!(consultoriaFase1.copa.candidates || []).length && (
                        <p className="ws-empty-inline">No hay candidatos claros con los datos actuales.</p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
          )}

          {/* ═══════════════════════════════════════
              SECCIÓN: HALLAZGOS
          ═══════════════════════════════════════ */}
          {tab === 'hallazgos' && (
          <section id="ws-diagnostico" className="ws-section">
            <h3 className="ws-section-title">Hallazgos</h3>

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
                          {alertaAbierta !== alerta.titulo && <small>{limpiarRutasTecnicas(alerta.detalle)}</small>}
                        </span>
                      </div>
                      <span className="ws-alerta-chevron">{alertaAbierta === alerta.titulo ? '▲' : '▼'}</span>
                    </button>
                    {alertaAbierta === alerta.titulo && (
                      <div className="ws-alerta-body">
                        <p className="ws-alerta-detalle">{limpiarRutasTecnicas(alerta.detalle)}</p>
                        <p className="ws-alerta-accion">{limpiarRutasTecnicas(alerta.accion)}</p>
                        <button
                          className="ws-alerta-proponer"
                          onClick={() => {
                            setTab('propuestas')
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
                {diagnostico.ticket.valor != null && diagnostico.wineMapping?.referencias && (
                  <div className={`mapping-row mapping-row-summary is-${diagnostico.wineMapping.referencias.estado}`}>
                    <div>
                      <strong>Numero de referencias</strong>
                      <span>
                        {diagnostico.wineMapping.referencias.actual} actuales · recomendado {diagnostico.wineMapping.referencias.minimo}-{diagnostico.wineMapping.referencias.maximo} · ideal {diagnostico.wineMapping.referencias.ideal}
                      </span>
                    </div>
                    <div className="mapping-bar"><i style={{ width: `${Math.min(100, (diagnostico.wineMapping.referencias.actual / Math.max(1, diagnostico.wineMapping.referencias.maximo)) * 100)}%` }} /></div>
                    <div className="mapping-tags">
                      <b>{diagnostico.wineMapping.referencias.estado}</b>
                      <em>Precio vino × 1–1,5 del ticket</em>
                    </div>
                  </div>
                )}
                {diagnostico.ticket.valor != null && diagnostico.wineMapping?.reequilibrio && (
                  <div className="mapping-rebalance">
                    <div>
                      <span className="admin-kicker">Reequilibrio recomendado</span>
                      <strong>{diagnostico.wineMapping.reequilibrio.resumen}</strong>
                      <p>
                        Objetivo operativo: {diagnostico.wineMapping.reequilibrio.totalObjetivo} referencias
                        {diagnostico.wineMapping.reequilibrio.quitarTotal > 0 && ` · quitar ${diagnostico.wineMapping.reequilibrio.quitarTotal}`}
                        {diagnostico.wineMapping.reequilibrio.agregarTotal > 0 && ` · añadir ${diagnostico.wineMapping.reequilibrio.agregarTotal}`}
                      </p>
                    </div>
                    {diagnostico.wineMapping.reequilibrio.movimientos.length > 0 && (
                      <div className="strategy-pills">
                        {diagnostico.wineMapping.reequilibrio.movimientos.map((movimiento, index) => (
                          <span key={`${movimiento.desde}-${movimiento.hacia}-${index}`} className="is-warning">{movimiento.texto}</span>
                        ))}
                      </div>
                    )}
                    {candidatosSalidaDetalle.length > 0 && (
                      <div className="mapping-exit-summary">
                        <strong>{candidatosSalidaDetalle.length} candidatos marcados para salir</strong>
                        <span>{candidatosSalidaDetalle.slice(0, 4).map(vino => vino.nombre).join(' · ')}{candidatosSalidaDetalle.length > 4 ? ' · ...' : ''}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="ws-strategy-col ws-strategy-col-wide">
                  {diagnostico.ticket.valor == null ? (
                    <p className="ws-sin-ticket">Ticket medio no disponible — introdúcelo arriba para ver la arquitectura de precios.</p>
                  ) : (diagnostico.wineMapping?.gamas || []).map(gama => (
                    <details className={`mapping-gama-detail ${gama.delta > 0 ? 'is-surplus' : gama.delta < 0 ? 'is-deficit' : 'is-balanced'}`} key={gama.id}>
                      <summary className="mapping-row">
                        <div>
                          <strong>{gama.label}</strong>
                          <span>Objetivo {gama.objetivoNumero ?? 0} refs. · actual {gama.vinos}</span>
                        <span>{gama.rangoTexto} EUR · {gama.vinos} vinos</span>
                      </div>
                      <div className="mapping-bar"><i style={{ width: `${Math.min(100, gama.real)}%` }} /></div>
                        <b>{gama.delta > 0 ? `+${gama.delta}` : (gama.delta ?? 0)}</b>
                        <em>{gama.delta > 0 ? 'sobran' : gama.delta < 0 ? 'faltan' : 'ok'}</em>
                      </summary>
                      <div className="mapping-wine-list">
                        {(gama.vinosDetalle || []).length ? gama.vinosDetalle.map(vino => (
                          <div className={`mapping-wine-item ${candidatosSalidaSet.has(String(vino.id)) ? 'is-exit-candidate' : ''}`} key={vino.id}>
                            <div>
                              <strong>{vino.nombre}</strong>
                              <span>{[vino.bodega, vino.tipo, vino.region].filter(Boolean).join(' · ') || 'Sin datos extra'}</span>
                            </div>
                            <div className="mapping-wine-actions">
                              <b>{eur(vino.precio)}</b>
                              <button type="button" onClick={() => alternarCandidatoSalida(vino.id)}>
                                {candidatosSalidaSet.has(String(vino.id)) ? 'Quitar marca' : 'Candidato salida'}
                              </button>
                            </div>
                          </div>
                        )) : (
                          <p>No hay vinos en esta gama.</p>
                        )}
                      </div>
                    </details>
                  ))}
                </div>

                <div className="ws-strategy-col">
                  <p className="ws-strategy-col-title">Salud operativa</p>
                  <div className="strategy-pills">
                    {(diagnostico.salud || []).map(item => (
                      <span key={item.label} className={item.valor > Math.max(0, item.total * 0.2) ? 'is-warning' : ''}>
                        {item.label}: {item.valor}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="ws-strategy-col">
                  <p className="ws-strategy-col-title">Equilibrio comercial</p>
                  <div className="strategy-pills">
                    {(diagnostico.equilibrio || []).map(item => (
                      <span key={item.label}>{item.label}: {item.valor} <b>{item.pct}%</b></span>
                    ))}
                  </div>
                </div>

                {diagnostico.brechaCocina?.length > 0 && (
                  <div className="ws-strategy-col ws-strategy-col-wide">
                    <p className="ws-strategy-col-title">Cobertura cocina → vinos</p>
                    <div className="wine-list-gaps">
                      {diagnostico.brechaCocina.map(b => (
                        <span key={b.cocina}>{b.cocina} · falta {b.falta}</span>
                      ))}
                    </div>
                    <small style={{ color: 'var(--ink-muted, #555)', fontSize: '0.72rem' }}>Estilos que tu cocina pide y tu carta no cubre</small>
                  </div>
                )}
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
          )}

          {/* ═══════════════════════════════════════
              SECCIÓN: MATCHING
          ═══════════════════════════════════════ */}
          {tab === 'matching' && (
          <section id="ws-matching" className="ws-section">
            <div className="ws-section-head">
              <div className="ws-section-title-wrap">
                <h3 className="ws-section-title">Cruce de carta con catálogo del proveedor</h3>
                <p className="ws-section-lead">Completa proveedor, coste, referencia y formato sin pedirle más trabajo al encargado.</p>
              </div>
              <Link href="/admin/proveedores" className="ws-btn-secondary">Gestionar catálogos</Link>
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

            {mensajeMatch && <p className={`admin-alert ${mensajeMatch.startsWith('No se pudo') || mensajeMatch.startsWith('No hay') ? 'admin-alert-error' : 'admin-alert-ok'}`}>
              {mensajeMatch}
              {ultimoBulk && <> · <button type="button" className="ws-btn-secondary" onClick={deshacerUltimoBulk}>Deshacer</button></>}
            </p>}

            {(() => {
              const matchesRelevantes = soloConCandidato
                ? matchesCatalogo.filter(m => (m.candidatos || []).length > 0)
                : matchesCatalogo
              const planPreview = seleccionarMatchesParaAutoAplicar(matchesCatalogo, { umbral: 95, ventajaMinima: 10 })
              const autoCount = planPreview.auto.length
              const revisionCount = planPreview.revision.length
              const dudosos = matchesRelevantes.filter(m => {
                // Mostrar en el listado los que NO se van a autoaplicar.
                return !planPreview.auto.some(a => a.vino.id === m.vino.id)
              })
              const porPagina = 10
              const paginas = Math.max(1, Math.ceil(dudosos.length / porPagina))
              const pagina = Math.min(paginaMatches, paginas - 1)
              const slice = dudosos.slice(pagina * porPagina, pagina * porPagina + porPagina)
              return (
                <>
                  <div className="ws-match-controls">
                    <label>
                      <input type="checkbox" checked={soloConCandidato} onChange={e => setSoloConCandidato(e.target.checked)} />
                      Mostrar sólo vinos con candidato
                    </label>
                    <button
                      type="button"
                      className="ws-btn-primary"
                      disabled={autoCount === 0}
                      onClick={() => construirPlanBulk(95)}
                      title="Aplica en lote solo los candidatos sin ambigüedad (ventaja ≥10 puntos y formato que cuadra)"
                    >
                      Aplicar los seguros ({autoCount}) · dudosos: {revisionCount}
                    </button>
                  </div>

                  {bulkPlan && (
                    <div className="admin-alert ws-bulk-plan" role="alertdialog" aria-label="Confirmar auto-aplicación">
                      <p>
                        Vas a modificar <strong>{bulkPlan.auto.filter(a => a.incluir).length}</strong> de {bulkPlan.auto.length} vinos
                        (quedan <strong>{bulkPlan.revision.length}</strong> en revisión manual).
                        Desmarca los que no quieras tocar.
                      </p>
                      <ul className="ws-bulk-plan-list">
                        {bulkPlan.auto.map(item => {
                          const costeAntes = Number(item.vino.coste_compra) || 0
                          const costeDespues = Number(item.candidato.vino.coste_estimado) || 0
                          const motivoLabel = item.motivo === 'unico_candidato' ? 'único candidato'
                            : item.motivo === 'formato_coincide' ? 'formato coincide + ventaja ≥10'
                            : item.motivo === 'asumido_75cl' ? 'todos los candidatos son 75 cl'
                            : item.motivo
                          return (
                            <li key={item.clave}>
                              <label>
                                <input type="checkbox" checked={item.incluir} onChange={() => toggleBulkIncluir(item.clave)} />
                                <span className="ws-bulk-plan-main">
                                  <strong>{item.vino.nombre}</strong>
                                  <span>
                                    → {item.candidato.vino.nombre}
                                    {item.candidato.vino.formato ? ` · ${item.candidato.vino.formato}` : ''}
                                    {costeDespues ? ` · ${costeAntes.toFixed(2)} € → ${costeDespues.toFixed(2)} €` : ''}
                                  </span>
                                  <small>{motivoLabel} · confianza {item.score}%</small>
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="ws-match-controls">
                        <button type="button" className="ws-btn-primary" onClick={ejecutarPlanBulk}>
                          Aplicar {bulkPlan.auto.filter(a => a.incluir).length}
                        </button>
                        <button type="button" className="ws-btn-secondary" onClick={() => setBulkPlan(null)}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  <div className="ws-match-list">
                    {vinosCatalogo.length === 0 && (
                      <div className="ws-empty-block">Aún no hay catálogos de proveedor cargados. Cuando subas tarifas, aquí aparecerán cruces automáticos.</div>
                    )}
                    {vinosCatalogo.length > 0 && dudosos.length === 0 && autoCount === 0 && (
                      <div className="ws-empty-block">No hay coincidencias claras con los filtros actuales.</div>
                    )}
                    {slice.map(({ vino, candidatos }) => {
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
                            {faltantes.length > 0 && (
                              <span className="ws-match-faltantes">Falta: {faltantes.join(', ')}</span>
                            )}
                          </div>
                          <div className="ws-match-candidates">
                            {candidatos.slice(0, 3).map(match => {
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

                  {paginas > 1 && (
                    <div className="ws-match-pager">
                      <button type="button" disabled={pagina === 0} onClick={() => setPaginaMatches(p => Math.max(0, p - 1))}>Anterior</button>
                      <span>Página {pagina + 1} de {paginas}</span>
                      <button type="button" disabled={pagina >= paginas - 1} onClick={() => setPaginaMatches(p => p + 1)}>Siguiente</button>
                    </div>
                  )}
                </>
              )
            })()}
          </section>
          )}

          {tab === 'propuestas' && (
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
                {seguimientoPendienteMigracion && (
                  <p className="admin-alert">Seguimiento de propuestas: pendiente de activar en servidor (fase K).</p>
                )}
                {(() => {
                  const idxSeg = indiceSeguimiento(seguimientos)
                  return propuestas.map(p => {
                    const seg = idxSeg[String(p.id)] || { estado: 'propuesta' }
                    const pasoActual = indiceDePaso(seg.estado === 'rechazada' ? 'propuesta' : seg.estado)
                    return (
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
                          </div>
                          {p.motivo && <p className="ws-propuesta-motivo">{limpiarRutasTecnicas(p.motivo)}</p>}
                          {(p.coste_estimado || p.precio_recomendado) && (
                            <small>
                              {p.coste_estimado ? `Coste: ${p.coste_estimado} EUR` : ''}
                              {p.precio_recomendado ? ` · PVP rec: ${p.precio_recomendado} EUR` : ''}
                              {p.margen_objetivo ? ` · Margen: ${p.margen_objetivo}%` : ''}
                            </small>
                          )}

                          {!seguimientoPendienteMigracion && (
                            <div className="ws-seguimiento">
                              <div className="ws-seguimiento-pasos" role="list" aria-label="Estado comercial">
                                {PASOS_UI.map((paso, idx) => {
                                  const alcanzado = idx <= pasoActual && seg.estado !== 'rechazada'
                                  const esActivo = idx === pasoActual && seg.estado !== 'rechazada'
                                  return (
                                    <span key={paso.id} role="listitem" className={`ws-seguimiento-paso${alcanzado ? ' is-ok' : ''}${esActivo ? ' is-activo' : ''}`}>
                                      {paso.label}
                                    </span>
                                  )
                                })}
                                {seg.estado === 'rechazada' && <span className="ws-seguimiento-paso is-rechazada">Rechazada</span>}
                              </div>
                              <div className="ws-seguimiento-actions">
                                {seg.estado === 'propuesta' && (
                                  <button type="button" onClick={() => guardarSeguimiento(p.id, { estado: 'enviada' })}>Marcar enviada</button>
                                )}
                                {seg.estado === 'enviada' && (
                                  <>
                                    <button type="button" onClick={() => guardarSeguimiento(p.id, { estado: 'aceptada' })}>Marcar aceptada</button>
                                    <button type="button" className="admin-plain-button" onClick={() => guardarSeguimiento(p.id, { estado: 'rechazada' })}>Rechazar</button>
                                  </>
                                )}
                                {seg.estado === 'aceptada' && (
                                  <ImplantarForm seguimiento={seg} onImplantar={(euros) => guardarSeguimiento(p.id, { estado: 'implantada', importe_capturado_eur: euros })} />
                                )}
                                {seg.estado === 'implantada' && seg.implantada_en && (
                                  <small>Implantada el {new Date(seg.implantada_en).toLocaleDateString('es-ES')}{seg.importe_capturado_eur ? ` · ${Number(seg.importe_capturado_eur).toLocaleString('es-ES')} EUR capturados` : ''}</small>
                                )}
                                {seg.estado === 'rechazada' && (
                                  <button type="button" className="admin-plain-button" onClick={() => guardarSeguimiento(p.id, { estado: 'propuesta' })}>Reabrir</button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="ws-propuesta-actions">
                          {p.estado !== 'incorporada' && <button onClick={() => completarPropuesta(p)}>Marcar completada</button>}
                          <button onClick={() => abrirFormEditar(p)}>Editar</button>
                          <button className="admin-plain-button" onClick={() => borrarPropuesta(p.id)}>Borrar</button>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </section>
          )}

          {/* ═══════════════════════════════════════
              SECCIÓN: SELECCIÓN JUANJO
          ═══════════════════════════════════════ */}
          {tab === 'seleccion' && (
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
          )}

          {/* ═══════════════════════════════════════
              SECCIÓN: INFORME
          ═══════════════════════════════════════ */}
          {tab === 'informe' && (
          <section id="ws-informe" className="ws-section">
            <div className="ws-section-head">
              <h3 className="ws-section-title">Informe ejecutivo</h3>
              <div className="report-inline-actions">
                <button type="button" onClick={copiarInformeEjecutivo}>Copiar resumen</button>
                <button type="button" onClick={() => imprimirInforme()} aria-label="Imprimir esta página">Imprimir</button>
                <a href={`/admin/informe/${id}`} target="_blank" rel="noreferrer" className="ws-btn-secondary">Abrir version imprimible</a>
              </div>
            </div>

            <div className="ws-informe-preview">
              <div className="ws-informe-hero">
                <div>
                  <p className="admin-kicker">Informe privado de consultoría</p>
                  <h4>Estado de la carta de vinos de {restaurante.nombre}</h4>
                  <p>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ')} · {fecha}</p>
                  {consultoriaFase1?.consultor?.diagnostic?.resumen_ejecutivo && (
                    <p className="ws-informe-lead">{consultoriaFase1.consultor.diagnostic.resumen_ejecutivo}</p>
                  )}
                </div>
                <div className={`report-score report-score-${calcPuntuacion(analisis).prioridad.toLowerCase()}`}>
                  <span>{calcPuntuacion(analisis).score}</span>
                  <strong>{calcPuntuacion(analisis).prioridad}</strong>
                </div>
              </div>

              <div className="ws-informe-metrics">
                <div><span>Recuperación anual</span><strong>{consultoriaFase1?.oportunidad?.snapshot ? `${Number(consultoriaFase1.oportunidad.snapshot.recuperacion_anual_estimada).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR` : eur(metricas.valorVenta)}</strong></div>
                <div><span>Capital liberable</span><strong>{`${Number(calcCapitalLiberable({ snapshotOportunidad: consultoriaFase1?.oportunidad?.snapshot, metricas }).valor).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR`}</strong></div>
                <div><span>Alertas críticas</span><strong>{calcAlertasCriticas({ alertasDb: consultoriaFase1?.alertas, analisis: { alertas } }).valor}</strong></div>
                <div><span>Candidatos a copa</span><strong>{calcCandidatosCopa({ snapshotCopa: consultoriaFase1?.copa?.snapshot, metricas }).valor}</strong></div>
              </div>

              <div className="ws-informe-alertas">
                <p className="admin-kicker">Oportunidades principales</p>
                {(consultoriaFase1?.oportunidad?.items || []).slice(0, 5).map(item => (
                  <div key={item.id || `${item.area}-${item.titulo}`} className="ws-informe-alerta">
                    <strong>{item.titulo}</strong>
                    <p>{limpiarRutasTecnicas(item.detalle)}</p>
                    <em>{limpiarRutasTecnicas(item.accion)} - {Number(item.impacto_estimado).toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR - confianza {Number(item.confianza_pct).toFixed(0)}%</em>
                  </div>
                ))}
                {!(consultoriaFase1?.oportunidad?.items || []).length && (consultoriaFase1?.alertas || alertas).slice(0, 5).map(a => (
                  <div key={a.titulo} className="ws-informe-alerta">
                    <strong>{a.titulo}</strong>
                    <p>{limpiarRutasTecnicas(a.detalle)}</p>
                    <em>{limpiarRutasTecnicas(a.accion_sugerida || a.accion)}</em>
                  </div>
                ))}
              </div>

              <div className="ws-informe-plan">
                <p className="admin-kicker">Hoja de ruta propuesta</p>
                {((consultoriaFase1?.consultor?.items || []).length ? consultoriaFase1.consultor.items : alertas.map(a => ({ titulo: a.titulo, accion: a.accion }))).slice(0, 6).map((item, i) => (
                  <div key={item.id || item.titulo} className="ws-informe-plan-item">
                    <span>{i + 1}</span>
                    <div>
                      <strong>{item.titulo}</strong>
                      <p>{limpiarRutasTecnicas(item.accion)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          )}

          {/* Informe de cliente de 1 página (fase K - bloque 3).
              Montado siempre fuera de las pestañas; sólo visible cuando
              modoInformeCliente === true (al pulsar "Informe para el
              cliente") o en impresión. */}
          <section id="ws-informe-cliente" className={`ws-informe-cliente${modoInformeCliente ? ' is-visible' : ''}`} aria-hidden={!modoInformeCliente}>
            {(() => {
              const agg = agregarSeguimiento(seguimientos || [])
              const oportunidad = consultoriaFase1?.oportunidad?.snapshot?.recuperacion_anual_estimada
                || analisis?.ejecutivo?.resumen?.recuperacion_anual_estimada
                || 0
              const prioridades = (alertas || []).slice(0, 3).map(a => ({
                titulo: a.titulo,
                detalle: a.detalle,
                accion: a.accion,
                euros: null,
              }))
              const proximo = (contactos || [])
                .map(c => c.proximo_contacto)
                .filter(Boolean)
                .sort()[0] || null
              const informe = construirInformeCliente({
                restaurante,
                oportunidadEuros: oportunidad,
                prioridades,
                seguimiento: agg,
                proximoContacto: proximo,
              })
              return (
                <article className="informe-cliente-page">
                  <header className="informe-cliente-head">
                    <h1>{informe.titulo}</h1>
                    <p>{informe.fechaLegible} · {informe.restaurante.nombre}{informe.restaurante.ubicacion ? ` · ${informe.restaurante.ubicacion}` : ''}</p>
                  </header>
                  <section className="informe-cliente-cifra">
                    {informe.cifraPrincipal.valor && <strong>{informe.cifraPrincipal.valor}</strong>}
                    <p>{informe.cifraPrincipal.frase}</p>
                  </section>
                  <section className="informe-cliente-prioridades">
                    <h2>Las 3 prioridades</h2>
                    {informe.prioridades.length === 0 && <p>No hay prioridades abiertas. La carta está sana.</p>}
                    <ol>
                      {informe.prioridades.map(p => (
                        <li key={p.numero}>
                          <strong>{p.titulo}{p.euros ? ` · ${p.euros}` : ''}</strong>
                          {p.detalle && <p>{p.detalle}</p>}
                        </li>
                      ))}
                    </ol>
                  </section>
                  {informe.seguimiento && (
                    <section className="informe-cliente-seguimiento">
                      <h2>Estado de las propuestas</h2>
                      <p>
                        {informe.seguimiento.enviadas} enviadas · {informe.seguimiento.aceptadas} aceptadas · {informe.seguimiento.implantadas} implantadas
                        {informe.seguimiento.capturado ? ` · ${informe.seguimiento.capturado} capturados` : ''}
                      </p>
                    </section>
                  )}
                  {informe.proximoContacto && (
                    <section className="informe-cliente-proximo">
                      <h2>Próximo contacto</h2>
                      <p>{informe.proximoContacto}</p>
                    </section>
                  )}
                  <footer className="informe-cliente-foot">
                    Cata con Juanjo — hoja de ruta trimestral.
                  </footer>
                </article>
              )
            })()}
          </section>

          <section id="ws-politica-precio" className="ws-section">
            <div className="ws-section-head">
              <h3 className="ws-section-title">Política de precios</h3>
            </div>
            <div style={{ padding: '16px 0' }}>
              {!politica ? (
                <p style={{ color: '#756d63', fontSize: 14 }}>Cargando…</p>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 13, color: '#17120f', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      Coste objetivo (food cost)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min="15" max="55" step="1"
                        value={politicaDraft}
                        onChange={e => setPoliticaDraft(e.target.value)}
                        style={{ width: 68, padding: '4px 8px', border: '1px solid #e0d4bc', borderRadius: 6, fontSize: 14 }}
                      />
                      <span style={{ fontSize: 13, color: '#756d63' }}>
                        % → margen {100 - Number(politicaDraft)}%
                      </span>
                      <button
                        disabled={guardandoPolitica || politicaDraft === String(Math.round(100 - Number(politica.margen_objetivo || 65)))}
                        onClick={guardarPolitica}
                        style={{ padding: '4px 12px', background: '#74223d', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
                      >
                        {guardandoPolitica ? 'Guardando…' : 'Guardar'}
                      </button>
                    </div>
                    <p style={{ fontSize: 12, color: '#756d63', marginTop: 6 }}>
                      {politica.restaurante_id
                        ? 'Política específica para este restaurante.'
                        : 'Heredando política global. Guarda para crear una específica.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <footer className="ws-audit-footer">
            <span>Ultima actualizacion: {user?.email || 'Consultor'} · {fecha}</span>
            <a href="#ws-diagnostico">Ver historial de cambios completo</a>
          </footer>

    </div>
  )
}
