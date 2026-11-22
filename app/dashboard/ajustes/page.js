'use client'

import Link from 'next/link'
import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { etiquetaActividadReal } from '../../lib/actividadReal'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { esPerfilBodega } from '../../lib/plans'
import { estadoChecklistEntrega } from '../../lib/checklistEntrega'
import {
  DEFAULTS as PARAMS_DEFAULTS,
  FUENTE_VENTAS_UI_ELEGIBLE,
  FUENTES_VENTAS_NO_DISPONIBLES,
  validarParametros,
} from '../../lib/parametrosBodega'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'
import BillingPanel from '../BillingPanel'

export default function AjustesHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [pinSala, setPinSala] = useState('')
  const [pinConfigurado, setPinConfigurado] = useState(false)
  const [guardandoPin, setGuardandoPin] = useState(false)
  const [mensajePin, setMensajePin] = useState('')
  const [mensajeActividad, setMensajeActividad] = useState('')
  const [guardandoActividad, setGuardandoActividad] = useState(false)
  const [modalActividad, setModalActividad] = useState(null) // null | 'reiniciar' | 'pausar'
  const [confirmInput, setConfirmInput] = useState('')
  const [copiado, setCopiado] = useState('')
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

  // FASE I — señales para el checklist de entrega REAL.
  // - vinos: para "Referencias completas" (≥1 activo + nombre + tipo +
  //   precio_botella + coste). Mismo criterio que lib pura.
  // - respuestaConteos: para "Inventario preparado" (conteo inicial
  //   cerrado). Misma fuente que el checklist de Inicio.
  // - checklistEntrega: JSONB con confirmaciones manuales (QR, mapa).
  // Si cualquiera falla, la UI mantiene el ítem "Pendiente" (nunca
  // asume Listo por defecto; política heredada de FASE G).
  const [vinos, setVinos] = useState(null)
  const [respuestaConteos, setRespuestaConteos] = useState(null)
  const [checklistEntrega, setChecklistEntrega] = useState({})
  const [marcandoConfirmacion, setMarcandoConfirmacion] = useState(null)

  // FASE I — Parámetros de bodega (sección nueva).
  const [paramsCarga, setParamsCarga] = useState('loading') // 'loading'|'ok'|'error'
  const [paramsValores, setParamsValores] = useState({ ...PARAMS_DEFAULTS })
  const [paramsPorDefecto, setParamsPorDefecto] = useState({
    copas_por_botella: true, iva_venta_pct: true, merma_copa_pct: true, fuente_ventas: true,
  })
  const [paramsExisteFila, setParamsExisteFila] = useState(false)
  const [paramsEditados, setParamsEditados] = useState({})
  const [guardandoParams, setGuardandoParams] = useState(false)
  const [mensajeParams, setMensajeParams] = useState('')
  const [erroresParams, setErroresParams] = useState([])

  useEffect(() => {
    async function cargar() {
      const { email, isAdmin } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      setEsAdmin(Boolean(isAdmin))
      const { data: rest } = await supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD).eq('email', email).single()
      setRestaurante(rest || null)
      setPinConfigurado(Boolean(rest?.camarero_pin_bloqueo_activo))
      setLoading(false)
    }
    cargar()
  }, [])

  // FASE I — Cargar señales reales del checklist y los parámetros de
  // bodega. Todo pasa por endpoints service_role (RLS bloquea leer
  // restaurant_economic_settings y checklist_entrega desde cliente).
  useEffect(() => {
    if (!restaurante?.id) return
    let vivo = true
    ;(async () => {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const token = sess?.session?.access_token || ''
        const headers = { Authorization: `Bearer ${token}` }
        const url = p => `${p}?restaurante_id=${encodeURIComponent(restaurante.id)}`
        const [resConteos, resChecklist, resParams, vinosRes] = await Promise.all([
          fetch(url('/api/conteos'), { headers }),
          fetch(url('/api/checklist-entrega'), { headers }),
          fetch(url('/api/restaurant-economic-settings'), { headers }),
          // vinos desde el cliente: RLS permite propietario leer sus vinos.
          supabase.from('vinos')
            .select('id, activo, nombre, tipo, precio_botella, coste_compra, coste_medio_pmp')
            .eq('restaurante_id', restaurante.id),
        ])
        if (!vivo) return

        if (resConteos.ok) {
          const body = await resConteos.json().catch(() => null)
          setRespuestaConteos(body)
        } else {
          setRespuestaConteos(null)
        }

        if (resChecklist.ok) {
          const body = await resChecklist.json().catch(() => ({}))
          setChecklistEntrega(body?.checklist_entrega && typeof body.checklist_entrega === 'object' ? body.checklist_entrega : {})
        } else {
          setChecklistEntrega({})
        }

        if (resParams.ok) {
          const body = await resParams.json().catch(() => null)
          if (body) {
            setParamsValores({ ...PARAMS_DEFAULTS, ...(body.valores || {}) })
            setParamsPorDefecto(body.por_defecto || { copas_por_botella: true, iva_venta_pct: true, merma_copa_pct: true, fuente_ventas: true })
            setParamsExisteFila(Boolean(body.existe_fila))
            setParamsCarga('ok')
          } else {
            setParamsCarga('error')
          }
        } else {
          setParamsCarga('error')
        }

        setVinos(Array.isArray(vinosRes?.data) ? vinosRes.data : [])
      } catch {
        if (!vivo) return
        setRespuestaConteos(null)
        setChecklistEntrega({})
        setParamsCarga('error')
        setVinos([])
      }
    })()
    return () => { vivo = false }
  }, [restaurante?.id])

  useEffect(() => {
    if (!modalActividad) return
    function onKeyDown(e) {
      if (e.key === 'Escape') { setModalActividad(null); setConfirmInput('') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalActividad])

  if (loading) return <LoadingState />

  const perfilBodega = esPerfilBodega(restaurante)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const destino = restaurante?.hub_activo ? `/r/${restaurante.slug}` : `/carta/${restaurante?.slug || ''}`
  const urlPublica = `${origin}${destino}`
  const urlCarta = `${origin}/carta/${restaurante?.slug || ''}`
  const urlCamarero = `${origin}/camarero/${restaurante?.slug || ''}`
  const urlReferencias = `${origin}/dashboard/vinos`
  const urlBodega = `${origin}/dashboard/bodega`
  const urlMapa = `${origin}/dashboard/menu-engineering`
  const urlInventario = `${origin}/dashboard/inventario`
  const actividadIniciada = Boolean(restaurante?.actividad_real_desde)
  const cartaPublicada = restaurante?.carta_publica_activa !== false

  // FASE I: cada ítem solo pasa a "Listo" si hay una señal REAL. Los
  // 4 ítems que antes vivían con `pendiente: true` de oficio ahora
  // leen su estado del decisor puro `estadoChecklistEntrega`:
  //   - Inventario preparado   → /api/conteos (reusa estadoConteoInicial)
  //   - Referencias completas  → vinos activos con nombre+tipo+precio+coste
  //   - QR probado en móvil    → checklist_entrega.qr_probado_en (manual)
  //   - Mapa estrella/joya     → checklist_entrega.mapa_revisado_en (manual)
  //
  // Señales derivables del restaurante (no cambian):
  //   - Actividad real → `restaurantes.actividad_real_desde`
  //   - PIN sala       → `restaurantes.camarero_pin_bloqueo_activo`
  //   - Marca          → `restaurantes.logo_url`
  //   - Carta pública  → `restaurantes.carta_publica_activa`
  const tieneLogo = Boolean(restaurante?.logo_url)
  const marcaDetalle = tieneLogo
    ? 'Logo subido. Revisa colores y banner para dejarla al punto.'
    : 'Sube el logo y revisa colores y banner.'

  const estadoReal = estadoChecklistEntrega({
    respuestaConteos,
    vinos: vinos || [],
    checklistEntrega,
  })

  const checklist = perfilBodega ? [
    {
      titulo: 'Actividad real definida',
      detalle: actividadIniciada ? `Cuenta desde ${etiquetaActividadReal(restaurante)}` : 'Define desde cuándo cuentan ventas, stock y movimientos.',
      href: '#actividad-real',
      pendiente: !actividadIniciada,
    },
    {
      titulo: 'Referencias completas',
      detalle: estadoReal.referencias_completas.pendiente
        ? 'Revisa que todos los vinos activos tengan nombre, tipo, precio y coste.'
        : 'Todos los vinos activos tienen nombre, tipo, precio y coste.',
      href: '/dashboard/vinos?filtro=pendientes',
      pendiente: estadoReal.referencias_completas.pendiente,
    },
    {
      titulo: 'Mapa estrella/joya revisado',
      detalle: estadoReal.mapa_revisado.pendiente
        ? 'Detecta estrellas, joyas, caballos de batalla y referencias a archivar. Cuando lo mires, márcalo como hecho.'
        : 'Revisión confirmada por el propietario.',
      href: '/dashboard/menu-engineering',
      pendiente: estadoReal.mapa_revisado.pendiente,
      confirmable: true,
      clave: 'mapa_revisado_en',
    },
    {
      titulo: 'Inventario preparado',
      detalle: estadoReal.inventario_preparado.pendiente
        ? 'Haz el conteo inicial en Bodega → Inventario para empezar a controlar stock.'
        : 'Conteo inicial cerrado.',
      href: '/dashboard/inventario',
      pendiente: estadoReal.inventario_preparado.pendiente,
    },
  ] : [
    {
      titulo: 'QR probado en móvil',
      detalle: estadoReal.qr_probado.pendiente
        ? (restaurante?.hub_activo ? 'Prueba el QR y márcalo como hecho (abre el hub público).' : 'Prueba el QR y márcalo como hecho (abre la carta directa).')
        : 'QR probado y confirmado por el propietario.',
      href: '/dashboard/qr',
      pendiente: estadoReal.qr_probado.pendiente,
      confirmable: true,
      clave: 'qr_probado_en',
    },
    { titulo: 'Marca revisada', detalle: marcaDetalle, href: '/dashboard/personalizar', pendiente: !tieneLogo },
    { titulo: 'Acceso de sala revisado', detalle: pinConfigurado ? 'El modo camarero pide PIN.' : 'El modo camarero queda abierto sin PIN.', href: '#pin-sala', pendiente: !pinConfigurado },
    { titulo: cartaPublicada ? 'Carta pública abierta' : 'Carta en borrador', detalle: cartaPublicada ? 'Comprueba que precios, platos y enlaces cargan bien.' : 'Publícala desde QR cuando marca, precios y contenido estén revisados.', href: cartaPublicada ? destino : '/dashboard/qr', pendiente: !cartaPublicada },
  ]
  const checklistPendiente = checklist.some(item => item.pendiente)

  async function guardarPinSala() {
    if (!restaurante?.id) return
    setGuardandoPin(true)
    setMensajePin('')
    const pinLimpio = String(pinSala || '').trim()
    if (pinLimpio.length < 4) {
      setMensajePin('Usa al menos 4 digitos.')
      setGuardandoPin(false)
      return
    }
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch('/api/camarero/configurar-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify({ restaurante_id: restaurante.id, pin: pinLimpio, habilitado: true }),
    })
    if (res.ok) {
      setRestaurante({ ...restaurante, camarero_pin_requerido: true, camarero_pin_bloqueo_activo: true })
      setPinConfigurado(true)
      setPinSala('')
    }
    setMensajePin(res.ok ? 'PIN de sala guardado.' : 'No se pudo guardar el PIN.')
    setGuardandoPin(false)
  }

  async function deshabilitarPinSala() {
    if (!restaurante?.id) return
    setGuardandoPin(true)
    setMensajePin('')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch('/api/camarero/configurar-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify({ restaurante_id: restaurante.id, habilitado: false }),
    })
    if (res.ok) {
      setRestaurante({ ...restaurante, camarero_pin_requerido: false, camarero_pin_bloqueo_activo: false, camarero_pin_hash: null, camarero_pin: null })
      setPinConfigurado(false)
      setPinSala('')
    }
    setMensajePin(res.ok ? 'Modo camarero deshabilitado.' : 'No se pudo deshabilitar el PIN.')
    setGuardandoPin(false)
  }

  // FASE I — Marca / desmarca una confirmación manual del checklist
  // de entrega. Refresca sólo la clave tocada en el estado local.
  async function toggleConfirmacion(clave, marcar) {
    if (!restaurante?.id || marcandoConfirmacion) return
    setMarcandoConfirmacion(clave)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token || ''
      const res = await fetch('/api/checklist-entrega', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id, clave, marcar }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.checklist_entrega) {
        setChecklistEntrega(body.checklist_entrega)
      }
    } finally {
      setMarcandoConfirmacion(null)
    }
  }

  // FASE I — Edita un parámetro de bodega localmente. Los cambios se
  // acumulan hasta pulsar "Guardar" (upsert parcial, solo las claves
  // tocadas).
  function editarParametro(campo, valor) {
    setParamsEditados(prev => ({ ...prev, [campo]: valor }))
    setMensajeParams('')
    setErroresParams([])
  }

  async function guardarParametros() {
    if (!restaurante?.id || guardandoParams) return
    const campos = Object.keys(paramsEditados)
    if (campos.length === 0) {
      setMensajeParams('No hay cambios que guardar.')
      return
    }
    // Validación previa en el cliente (coincide con la del servidor).
    const val = validarParametros(paramsEditados)
    if (!val.ok) {
      setErroresParams(val.errores)
      setMensajeParams('')
      return
    }
    setGuardandoParams(true)
    setMensajeParams('')
    setErroresParams([])
    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token || ''
      const res = await fetch('/api/restaurant-economic-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id, ...val.normalizado }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        if (body?.detalles) setErroresParams(body.detalles)
        setMensajeParams(body?.error || 'No se pudieron guardar los parámetros.')
      } else if (body) {
        setParamsValores({ ...PARAMS_DEFAULTS, ...(body.valores || {}) })
        setParamsPorDefecto(body.por_defecto || paramsPorDefecto)
        setParamsExisteFila(true)
        setParamsEditados({})
        setMensajeParams('Parámetros guardados.')
      }
    } catch (e) {
      setMensajeParams(e?.message || 'Error inesperado al guardar.')
    } finally {
      setGuardandoParams(false)
    }
  }

  async function copiar(texto, tipo) {
    if (!texto) return
    await navigator.clipboard?.writeText(texto)
    setCopiado(tipo)
    setTimeout(() => setCopiado(''), 1800)
  }

  function abrirModalActividad(tipo) {
    setModalActividad(tipo)
    setConfirmInput('')
  }

  async function confirmarActividad() {
    const fechaISO = modalActividad === 'reiniciar' ? new Date().toISOString() : null
    setModalActividad(null)
    setConfirmInput('')
    await guardarInicioActividad(fechaISO)
  }

  async function guardarInicioActividad(fechaISO) {
    if (!restaurante?.id || guardandoActividad) return
    setGuardandoActividad(true)
    setMensajeActividad('')
    const { data, error } = await supabase
      .from('restaurantes')
      .update({ actividad_real_desde: fechaISO })
      .eq('id', restaurante.id)
      .select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      .single()

    if (!error && data) {
      setRestaurante(data)
      setMensajeActividad(fechaISO ? 'Actividad real iniciada desde hoy.' : 'Actividad real pausada. Las pruebas no alimentaran decisiones.')
    } else {
      setMensajeActividad('No se pudo guardar el estado de actividad real.')
    }
    setGuardandoActividad(false)
  }

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Ajustes"
      title={perfilBodega ? 'Cuenta y puesta en marcha de bodega' : 'Accesos, marca y puesta en marcha'}
      subtitle={perfilBodega
        ? 'Ajustes operativos de la membresía sommelier: actividad real, accesos internos y enlaces de trabajo. Sin QR, sin carta pública.'
        : 'QR, diseño de carta, acceso de sala y suscripción. Configúralo una vez antes del lanzamiento.'}
      actions={perfilBodega
        ? <Link className={styles.secondary} href="/dashboard/menu-engineering">Ver mapa estrella/joya</Link>
        : <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>}
      help={perfilBodega ? {
        title: 'Ajustes de membresía sommelier',
        intro: 'Esta zona deja la cuenta lista para trabajar con datos reales de bodega.',
        items: [
          { title: 'Actividad real', text: 'Separa pruebas de datos que alimentan compras, inventario y decisiones económicas.' },
          { title: 'Accesos internos', text: 'Vuelve rápido a referencias, stock, inventario y mapa estrella/joya.' },
          { title: 'Datos de bodega', text: 'El foco está en coste, rotación, proveedor, stock mínimo y capital inmovilizado.' },
        ],
      } : {
        title: 'Cuándo tocar ajustes',
        intro: 'Esta zona se usa sobre todo al dar de alta el restaurante o cuando cambia la identidad visual.',
        items: [
          { title: 'QR y accesos', text: 'Comprueba si el QR debe abrir la carta de vinos directa o el hub con reservas y otros enlaces.' },
          { title: 'Diseño', text: 'Ajusta logo, banner, colores y tipografía para que la carta parezca del restaurante, no de una plantilla.' },
          { title: 'Después de lanzar', text: 'No hace falta revisarlo a diario. Solo vuelve aquí si cambias enlaces, imagen o material impreso.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        {perfilBodega ? (
          <>
            <div className={styles.stat}><p className={styles.statValue}>Sommelier</p><p className={styles.statLabel}>Membresía</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{etiquetaActividadReal(restaurante)}</p><p className={styles.statLabel}>Actividad real</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{restaurante?.slug || '-'}</p><p className={styles.statLabel}>Identificador interno</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{esAdmin ? 'Admin' : 'Cliente'}</p><p className={styles.statLabel}>Acceso</p></div>
          </>
        ) : (
          <>
            <div className={styles.stat}><p className={styles.statValue}>{restaurante?.hub_activo ? 'Hub' : 'Carta'}</p><p className={styles.statLabel}>Destino del QR</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{pinConfigurado ? 'Activo' : 'Sin PIN'}</p><p className={styles.statLabel}>PIN camarero</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{restaurante?.slug || '-'}</p><p className={styles.statLabel}>Slug público</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{etiquetaActividadReal(restaurante)}</p><p className={styles.statLabel}>Actividad real</p></div>
          </>
        )}
      </section>

      {checklistPendiente && <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{perfilBodega ? 'Checklist de arranque bodega' : 'Checklist de entrega'}</h2>
            <p className={styles.panelSub}>{perfilBodega ? 'Lo minimo para que el sumiller pueda sustituir el Excel con datos fiables.' : 'Lo minimo que debe quedar comprobado antes de poner el QR en mesa.'}</p>
          </div>
          <span className={styles.badge}>{checklist.filter(item => !item.pendiente).length} / {checklist.length}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.itemStack}>
            {checklist.map(item => {
              const Head = (
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                    <p className={styles.sectionText}>{item.detalle}</p>
                  </div>
                  <span className={styles.badge}>{item.pendiente ? 'Pendiente' : 'Listo'}</span>
                </div>
              )
              // `.itemStack` es `display: grid` y antes de FASE I cada
              // ítem era un <a>/<Link> grid-child directo, blockificado
              // por el grid y estirado al 100 % de la columna. Al añadir
              // el botón "Marcar como hecho" necesitamos agrupar enlace
              // + botón; si envolvemos con un <div> plano, el <a>
              // interior vuelve a ser inline (defecto del user-agent),
              // y la cabecera flex se colapsa a min-content → tira de
              // ~15 px. Solución: el grid-child es SIEMPRE el <a>/<Link>
              // (sigue blockificado). El botón se añade como SIGUIENTE
              // grid-child vía Fragment con key — mantiene el gap de 10 px
              // del grid y el ancho completo en ambos. Aceptamos la
              // separación visual de 10 px (coincide con el resto de
              // componentes de la página).
              const Enlace = item.href.startsWith('#') ? (
                <a href={item.href} className={styles.itemCard}>{Head}</a>
              ) : (
                <Link href={item.href} target={item.href.startsWith('/') ? undefined : '_blank'} className={styles.itemCard}>{Head}</Link>
              )
              if (!item.confirmable) {
                return <Fragment key={item.titulo}>{Enlace}</Fragment>
              }
              return (
                <Fragment key={item.titulo}>
                  {Enlace}
                  <div style={{ marginTop: -4, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className={styles.ghost}
                      disabled={marcandoConfirmacion === item.clave}
                      onClick={() => toggleConfirmacion(item.clave, item.pendiente)}
                    >
                      {marcandoConfirmacion === item.clave
                        ? 'Guardando...'
                        : (item.pendiente ? 'Marcar como hecho' : 'Desmarcar')}
                    </button>
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>
      </section>}

      {(perfilBodega || esAdmin) && (
        <section className={styles.panel} style={{ marginBottom: 16 }} id="parametros-bodega">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Parámetros de bodega</h2>
              <p className={styles.panelSub}>
                Copas por botella, IVA de venta, merma por copa y fuente de ventas.
                Cambiar IVA, copas o merma afecta a los meses abiertos; los meses ya
                cerrados conservan sus cifras (se guardan en el snapshot del cierre).
              </p>
            </div>
            <span className={styles.badge}>
              {paramsCarga === 'loading' ? 'Cargando' : paramsExisteFila ? 'Guardado' : 'Por defecto'}
            </span>
          </div>
          <div className={styles.panelBody}>
            {paramsCarga === 'error' ? (
              <p className={styles.tiny}>No se pudieron cargar los parámetros. Prueba a recargar la página.</p>
            ) : (
              <>
                <div className={styles.formGrid}>
                  <div>
                    <label className={styles.label} htmlFor="param-copas">Copas por botella (1-12)</label>
                    <input
                      id="param-copas"
                      className={styles.input}
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      value={(paramsEditados.copas_por_botella ?? paramsValores.copas_por_botella) ?? ''}
                      onChange={e => editarParametro('copas_por_botella', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    {paramsPorDefecto.copas_por_botella && !('copas_por_botella' in paramsEditados) && (
                      <p className={styles.tiny}>Por defecto: {PARAMS_DEFAULTS.copas_por_botella}</p>
                    )}
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="param-iva">IVA de venta (%)</label>
                    <input
                      id="param-iva"
                      className={styles.input}
                      type="number"
                      min={0}
                      max={30}
                      step={0.01}
                      value={(paramsEditados.iva_venta_pct ?? paramsValores.iva_venta_pct) ?? ''}
                      onChange={e => editarParametro('iva_venta_pct', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    {paramsPorDefecto.iva_venta_pct && !('iva_venta_pct' in paramsEditados) && (
                      <p className={styles.tiny}>Por defecto: {PARAMS_DEFAULTS.iva_venta_pct}</p>
                    )}
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="param-merma">Merma por copa (%)</label>
                    <input
                      id="param-merma"
                      className={styles.input}
                      type="number"
                      min={0}
                      max={30}
                      step={0.01}
                      value={(paramsEditados.merma_copa_pct ?? paramsValores.merma_copa_pct) ?? ''}
                      onChange={e => editarParametro('merma_copa_pct', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    {paramsPorDefecto.merma_copa_pct && !('merma_copa_pct' in paramsEditados) && (
                      <p className={styles.tiny}>Por defecto: {PARAMS_DEFAULTS.merma_copa_pct}</p>
                    )}
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="param-fuente">Fuente de ventas</label>
                    {(() => {
                      // Valor actual en el formulario. Si el usuario no ha
                      // tocado el campo, usa el guardado (o '' si es null).
                      const guardado = paramsValores.fuente_ventas ?? ''
                      const actual = 'fuente_ventas' in paramsEditados
                        ? (paramsEditados.fuente_ventas ?? '')
                        : guardado
                      return (
                        <select
                          id="param-fuente"
                          className={styles.select}
                          value={actual}
                          onChange={e => editarParametro('fuente_ventas', e.target.value === '' ? null : e.target.value)}
                        >
                          <option value="">(sin elegir — usa partes de servicio por defecto)</option>
                          <option value={FUENTE_VENTAS_UI_ELEGIBLE}>Partes de servicio</option>
                          {/* 'tpv'/'ambas': no implementadas (stub B8 en
                              el agregador). Se muestran DESHABILITADAS
                              salvo que ya estén guardadas → preservar. */}
                          {FUENTES_VENTAS_NO_DISPONIBLES.map(v => (
                            <option
                              key={v}
                              value={v}
                              disabled={guardado !== v}
                            >
                              {v === 'tpv' ? 'TPV' : 'Ambas'} — No disponible todavía
                            </option>
                          ))}
                        </select>
                      )
                    })()}
                  </div>
                </div>
                {erroresParams.length > 0 && (
                  <ul className={styles.tiny} style={{ marginTop: 10 }}>
                    {erroresParams.map((e, i) => (
                      <li key={i}><strong>{e.campo}:</strong> {e.mensaje}</li>
                    ))}
                  </ul>
                )}
                {mensajeParams && <p className={styles.tiny} style={{ marginTop: 10 }}>{mensajeParams}</p>}
                <button
                  className={styles.primary}
                  onClick={guardarParametros}
                  disabled={guardandoParams || paramsCarga !== 'ok' || Object.keys(paramsEditados).length === 0}
                  style={{ marginTop: 14 }}
                >
                  {guardandoParams ? 'Guardando...' : 'Guardar parámetros'}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {perfilBodega && (
        <section className={styles.hubGrid}>
          <Link className={styles.hubCard} href="/dashboard/vinos">
            <p className={styles.eyebrow}>Base de bodega</p>
            <h2>Referencias</h2>
            <p>Fichas, anadas, coste, proveedor, stock mínimo y estado comercial.</p>
            <span>Gestionar vinos</span>
          </Link>
          <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/bodega">
            <p className={styles.eyebrow}>Compra</p>
            <h2>Stock y pedido</h2>
            <p>Bajo mínimo, compra sugerida, movimientos y capital inmovilizado.</p>
            <span>Ver bodega</span>
          </Link>
          <Link className={styles.hubCard} href="/dashboard/menu-engineering">
            <p className={styles.eyebrow}>Decision</p>
            <h2>Estrellas y joyas</h2>
            <p>Mapa de salida real, margen, rotacion y potencial de cada referencia.</p>
            <span>Analizar mapa</span>
          </Link>
          <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/inventario">
            <p className={styles.eyebrow}>Conteo</p>
            <h2>Inventario</h2>
            <p>Prioriza conteos, revisa desviaciones y protege las referencias clave.</p>
            <span>Preparar inventario</span>
          </Link>
        </section>
      )}

      <section className={styles.gridTwo} style={{ marginTop: 16 }}>
        <BillingPanel restaurante={restaurante} />

        {(esAdmin || perfilBodega) && <div className={styles.panel} id="actividad-real">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{perfilBodega ? 'Arranque de datos reales' : 'Arranque de actividad real'}</h2>
              <p className={styles.panelSub}>{perfilBodega
                ? 'Hasta que la bodega trabaje con datos reales, las pruebas no deben alimentar mapa estrella/joya, inventario ni compras.'
                : 'Hasta que el restaurante empiece de verdad, las pruebas no deben alimentar Actividad, Briefing, Inventario ni Rentabilidad.'}</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemCard} style={{ marginBottom: 12 }}>
              <p className={styles.eyebrow}>Estado actual</p>
              <h3 className={styles.sectionTitle}>{actividadIniciada ? `Cuenta desde ${etiquetaActividadReal(restaurante)}` : 'Actividad real no iniciada'}</h3>
              <p className={styles.sectionText}>No borra datos antiguos. Solo evita que el histórico de pruebas se use para decisiones comerciales.</p>
            </div>
            {esAdmin && (
              <div className={styles.itemStack}>
                {/* A4.2: 'Empezar actividad' sigue siendo accion principal; 'Reiniciar'
                    es destructiva (borra fecha anterior) y pasa a estilo secundario para
                    no confundirse con la principal. La confirmacion escrita ya esta en el modal. */}
                <button
                  className={actividadIniciada ? styles.ghost : styles.primary}
                  onClick={() => abrirModalActividad('reiniciar')}
                  disabled={guardandoActividad}
                >
                  {actividadIniciada ? 'Reiniciar desde hoy' : 'Empezar actividad real hoy'}
                </button>
                {actividadIniciada && (
                  <button className={styles.ghost} onClick={() => abrirModalActividad('pausar')} disabled={guardandoActividad}>
                    Pausar actividad real
                  </button>
                )}
              </div>
            )}
            {mensajeActividad && <p className={styles.tiny}>{mensajeActividad}</p>}
          </div>
        </div>}

        {!perfilBodega && <div className={styles.panel} id="pin-sala">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>PIN de modo camarero</h2>
              <p className={styles.panelSub}>Sin PIN por defecto. Si el restaurante quiere proteger el acceso de sala, guarda un PIN activo.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>PIN sala</label>
                <input
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  value={pinSala}
                  onChange={e => setPinSala(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Ej. 4826"
                />
                {mensajePin && <p className={styles.tiny}>{mensajePin}</p>}
              </div>
              <div>
                <label className={styles.label}>Enlace camarero</label>
                <a className={styles.secondary} href={urlCamarero} target="_blank" rel="noreferrer">
                  Abrir modo camarero
                </a>
              </div>
            </div>
            <button className={styles.primary} onClick={guardarPinSala} disabled={guardandoPin} style={{ marginTop: 14 }}>
              {guardandoPin ? 'Guardando...' : (pinConfigurado ? 'Cambiar PIN' : 'Activar PIN')}
            </button>
            {pinConfigurado && (
              <button className={styles.ghost} onClick={deshabilitarPinSala} disabled={guardandoPin} style={{ marginTop: 8 }}>
                Desactivar PIN
              </button>
            )}
          </div>
        </div>}

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{perfilBodega ? 'Enlaces internos de trabajo' : 'Enlaces de la carta'}</h2>
              <p className={styles.panelSub}>{perfilBodega ? 'Atajos para compartir con el equipo de bodega o volver rápido a pantallas clave.' : 'Copia y comparte la carta y el acceso de sala con quien lo necesite.'}</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              {perfilBodega ? (
                <>
                  <button className={styles.ghost} onClick={() => copiar(urlReferencias, 'referencias')}>{copiado === 'referencias' ? 'Copiado' : 'Copiar referencias'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlBodega, 'bodega')}>{copiado === 'bodega' ? 'Copiado' : 'Copiar bodega'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlMapa, 'mapa')}>{copiado === 'mapa' ? 'Copiado' : 'Copiar mapa estrella/joya'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlInventario, 'inventario')}>{copiado === 'inventario' ? 'Copiado' : 'Copiar inventario'}</button>
                </>
              ) : (
                <>
                  <button className={styles.ghost} onClick={() => copiar(urlCarta, 'carta')}>{copiado === 'carta' ? 'Copiado' : 'Copiar carta directa'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlCamarero, 'camarero')}>{copiado === 'camarero' ? 'Copiado' : 'Copiar camarero'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      {modalActividad && (
        <div className={styles.actividadModalOverlay} onClick={() => { setModalActividad(null); setConfirmInput('') }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="actividad-modal-title"
            className={styles.actividadModalDialog}
            onClick={e => e.stopPropagation()}
          >
            <h3 id="actividad-modal-title" className={styles.sectionTitle}>
              {modalActividad === 'reiniciar' ? 'Reiniciar actividad real desde hoy' : 'Pausar actividad real'}
            </h3>
            {modalActividad === 'reiniciar' ? (
              <p className={styles.sectionText}>
                Las estadísticas, el análisis de carta y el simulador mostrarán únicamente datos desde hoy.
                Hasta que haya actividad nueva, las pantallas aparecerán vacías.
                No se borra ningún dato: el historial anterior permanece en la base de datos.
              </p>
            ) : (
              <p className={styles.sectionText}>
                Se elimina la fecha de corte. Las pantallas de Estadísticas y Análisis de carta quedan
                vacías (no muestran datos sin fecha de inicio). El modo camarero deja de registrar ventas
                nuevas. El panel mostrará el restaurante como &ldquo;Cerrado&rdquo;. No se borra ningún dato.
              </p>
            )}
            <p className={styles.sectionText}>
              Escribe <strong>{modalActividad === 'reiniciar' ? 'REINICIAR' : 'PAUSAR'}</strong> para confirmar:
            </p>
            <input
              className={styles.input}
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder={modalActividad === 'reiniciar' ? 'REINICIAR' : 'PAUSAR'}
              autoFocus
            />
            <div className={styles.actividadModalActions}>
              <button className={styles.ghost} onClick={() => { setModalActividad(null); setConfirmInput('') }}>
                Cancelar
              </button>
              <button
                className={styles.primary}
                disabled={confirmInput.trim().toUpperCase() !== (modalActividad === 'reiniciar' ? 'REINICIAR' : 'PAUSAR') || guardandoActividad}
                onClick={confirmarActividad}
              >
                {guardandoActividad ? 'Aplicando...' : modalActividad === 'reiniciar' ? 'Reiniciar' : 'Pausar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}
