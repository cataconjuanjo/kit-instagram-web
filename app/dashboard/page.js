'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../supabase'
import { getEffectiveRestaurantEmail } from '../demo'
import { puedeUsar } from '../lib/plans'
import styles from './dashboard.module.css'
import OpenCartaPruebaButton from './OpenCartaPruebaButton'

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

function eur(valor) {
  return `${decimal(valor).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`
}

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function inicioDiaISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
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

const OBJETIVOS_SERVICIO = [
  { id: 'equilibrado', label: 'Equilibrado' },
  { id: 'vender_copas', label: 'Vender por copas' },
  { id: 'subir_ticket', label: 'Subir ticket' },
  { id: 'rotar_stock', label: 'Rotar stock' },
  { id: 'vino_local', label: 'Producto local' },
]

export default function DashboardHome() {
  const [restaurante, setRestaurante] = useState(null)
  const [stats, setStats] = useState({ escaneos: 0, sommelier: 0, ventasHoy: 0, incidenciasSala: 0, dudasSala: 0 })
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [mostrarAyuda, setMostrarAyuda] = useState(false)
  const [tareasOcultas, setTareasOcultas] = useState([])
  const [turnoCerrado, setTurnoCerrado] = useState(false)
  const [objetivoServicio, setObjetivoServicio] = useState('equilibrado')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        if (typeof window !== 'undefined') {
          try {
            const guardadas = JSON.parse(window.localStorage.getItem(`carta_viva_inicio_${rest.id}`) || '[]')
            setTareasOcultas(Array.isArray(guardadas) ? guardadas : [])
            setObjetivoServicio(window.localStorage.getItem(`cartavinos_objetivo_${rest.id}`) || 'equilibrado')
          } catch {
            setTareasOcultas([])
          }
        }
        const hoy = inicioDiaISO()
        const [
          { data: vinosData },
          { data: platosData },
          { data: statsHoy },
          { data: propuestasData },
        ] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id),
          supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('estadisticas').select('tipo, detalle, created_at').eq('restaurante_id', rest.id).gte('created_at', hoy),
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
      }
      setLoading(false)
    }
    cargar()
  }, [])

  function completarTareaInicio(id) {
    if (!restaurante?.id || typeof window === 'undefined') return
    const nuevas = [...new Set([...tareasOcultas, id])]
    setTareasOcultas(nuevas)
    window.localStorage.setItem(`carta_viva_inicio_${restaurante.id}`, JSON.stringify(nuevas))
  }

  function cambiarObjetivoServicio(value) {
    setObjetivoServicio(value)
    if (restaurante?.id && typeof window !== 'undefined') {
      window.localStorage.setItem(`cartavinos_objetivo_${restaurante.id}`, value)
    }
  }

  function restaurarTareasInicio() {
    if (!restaurante?.id || typeof window === 'undefined') return
    setTareasOcultas([])
    window.localStorage.removeItem(`carta_viva_inicio_${restaurante.id}`)
  }

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
  const propuestasActivas = propuestas.filter(item => item.estado !== 'incorporada')
  const calidadPlatos = Math.round((porcentaje(platos.length - platosSinDescripcion.length, platos.length) * 0.65) + (porcentaje(platos.length - platosSinPrecio.length, platos.length) * 0.35))
  const calidadVinos = Math.round((porcentaje(vinosActivos.length - vinosSinPrecio.length, vinosActivos.length) * 0.45) + (porcentaje(vinosActivos.length - vinosSinPerfil.length, vinosActivos.length) * 0.45) + (porcentaje(vinosActivos.length - vinosSinStock.length, vinosActivos.length) * 0.1))
  const calidadStock = porcentaje(vinosActivos.length - vinosSinStock.length, vinosActivos.length)
  const calidadGlobal = Math.round((calidadVinos * 0.58) + (calidadPlatos * 0.42))
  const estadoCarta = calidadGlobal >= 80 ? 'Lista para trabajar' : calidadGlobal >= 55 ? 'Necesita ajustes' : 'Requiere orden'

  const acciones = [
    stats.incidenciasSala > 0 && { texto: `Resolver ${stats.incidenciasSala} incidencias de stock`, href: '/dashboard/cierre#incidencias', tipo: 'Urgente' },
    stats.dudasSala > 0 && { texto: `Revisar ${stats.dudasSala} dudas de sala`, href: '/dashboard/cierre#dudas', tipo: 'Sala' },
    bajoMinimo.length > 0 && { texto: `Preparar reposición de ${bajoMinimo.length} vinos`, href: '/dashboard/bodega#pedido', tipo: 'Bodega' },
    sinCosteCompra.length > 0 && { texto: `Completar coste de ${sinCosteCompra.length} vinos`, href: '/dashboard/bodega#referencias', tipo: 'Margen' },
    vinosSinPrecio.length + vinosSinPerfil.length > 0 && { texto: `Completar datos de ${vinosSinPrecio.length + vinosSinPerfil.length} vinos`, href: '/dashboard/vinos?filtro=pendientes', tipo: 'Carta' },
    platosSinDescripcion.length > 0 && { texto: `Completar descripcion interna de ${platosSinDescripcion.length} platos`, href: '/dashboard/platos?filtro=descripcion', tipo: 'Maridaje' },
    propuestasActivas.length > 0 && { texto: `Valorar ${propuestasActivas.length} propuestas pendientes`, href: '/dashboard/bodega#propuestas', tipo: 'Propuesta' },
  ].filter(Boolean)

  const metricas = [
    { label: 'Salud carta', valor: `${calidadGlobal}%`, detalle: estadoCarta },
    { label: 'Alertas hoy', valor: stats.incidenciasSala + stats.dudasSala, detalle: `${stats.incidenciasSala} stock, ${stats.dudasSala} sala` },
    { label: 'Ventas hoy', valor: stats.ventasHoy, detalle: turnoCerrado ? 'Turno revisado' : 'Pendientes de cierre' },
  ]

  const modulos = [
    { label: 'Carta', title: 'Vinos y platos', text: 'Gestiona la información que ve el cliente y usa sala.', stat: `${vinosActivos.length} vinos · ${platos.length} platos`, href: '/dashboard/carta' },
    { label: 'Sala', title: 'Cierre de servicio', text: 'Revisa ventas, dudas e incidencias después del turno.', stat: `${stats.ventasHoy} ventas hoy`, href: '/dashboard/sala', feature: 'modo_camarero' },
    { label: 'Bodega', title: 'Stock y margen', text: 'Valor, pedido sugerido, proveedor y datos pendientes.', stat: `${bajoMinimo.length} bajo mínimo`, href: '/dashboard/bodega', feature: 'bodega' },
  ].filter(modulo => !modulo.feature || puedeUsar(restaurante, modulo.feature))

  const vinosServicio = vinosActivos
    .filter(vino => decimal(vino.stock) > 0 && decimal(vino.precio_botella) > 0)
    .map(vino => {
      const venta = decimal(vino.precio_botella)
      const coste = decimal(vino.coste_compra)
      const margenPct = venta && coste ? Math.round(((venta - coste) / venta) * 100) : null
      const stock = decimal(vino.stock)
      const local = normalizar(vino.region).includes(normalizar(restaurante?.ciudad || ''))
      const score =
        (margenPct || 45) +
        (decimal(vino.precio_copa) > 0 ? objetivoServicio === 'vender_copas' ? 30 : 8 : 0) +
        (stock >= Math.max(8, decimal(vino.stock_minimo) * 2) ? objetivoServicio === 'rotar_stock' ? 30 : 8 : 0) +
        (local ? objetivoServicio === 'vino_local' ? 30 : 6 : 0) +
        (objetivoServicio === 'subir_ticket' ? Math.min(24, venta / 3) : 0)
      return { ...vino, margenPct, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const riesgosServicio = [
    ...bajoMinimo.map(vino => ({ ...vino, motivo: `Stock ${decimal(vino.stock)} / mínimo ${decimal(vino.stock_minimo)}` })),
    ...vinosActivos.filter(vino => decimal(vino.stock) === 0).map(vino => ({ ...vino, motivo: 'Sin stock informado' })),
  ].filter((vino, index, lista) => lista.findIndex(item => item.id === vino.id) === index).slice(0, 4)

  const platosServicio = platos
    .filter(plato => plato.descripcion && plato.descripcion.trim().length >= 8)
    .sort((a, b) => decimal(b.precio) - decimal(a.precio))
    .slice(0, 3)

  const enlacesServicio = [
    { label: 'Probar carta', pruebaCarta: true },
    puedeUsar(restaurante, 'modo_camarero') && { label: 'Modo camarero', href: restaurante?.slug ? `/camarero/${restaurante.slug}` : '/dashboard/sala', external: Boolean(restaurante?.slug) },
    puedeUsar(restaurante, 'cierre_servicio') && { label: 'Cerrar servicio', href: '/dashboard/cierre' },
    { label: 'QR mesa', href: '/dashboard/qr' },
  ].filter(Boolean)

  const checksSalud = [
    { label: 'Vinos', valor: calidadVinos, detalle: `${vinosSinPrecio.length} sin precio · ${vinosSinPerfil.length} sin perfil`, href: '/dashboard/vinos?filtro=pendientes' },
    { label: 'Platos', valor: calidadPlatos, detalle: `${platosSinDescripcion.length} sin descripcion interna · ${platosSinPrecio.length} sin precio`, href: '/dashboard/platos?filtro=descripcion' },
    { label: 'Stock', valor: calidadStock, detalle: `${vinosSinStock.length} sin stock actualizado`, href: '/dashboard/bodega', feature: 'bodega' },
    { label: 'Bodega', valor: porcentaje(vinosActivos.length - sinCosteCompra.length - sinProveedor.length, vinosActivos.length), detalle: `${sinCosteCompra.length} sin coste · ${sinProveedor.length} sin proveedor`, href: '/dashboard/bodega#referencias', feature: 'bodega' },
  ].filter(check => !check.feature || puedeUsar(restaurante, check.feature))

  const tareasInicio = [
    { id: 'vinos', titulo: 'Cargar carta de vinos', texto: 'Importa o crea las referencias principales con precio, uva y stock inicial.', href: '/dashboard/vinos?importar=1', autoHide: () => vinosActivos.length > 0 },
    { id: 'platos', titulo: 'Cargar platos clave', texto: 'Anade los platos que mas se venden para que el maridaje tenga contexto real.', href: '/dashboard/platos?importar=1', autoHide: () => platos.length > 0 },
    { id: 'descripciones_platos', titulo: 'Definir platos para maridaje', texto: 'Describe tecnica, salsa, intensidad e ingredientes clave. Es informacion interna: no se muestra como receta en la carta publica.', href: '/dashboard/platos?filtro=descripcion', autoHide: () => platos.length === 0 || platosSinDescripcion.length === 0 },
    { id: 'bodega', titulo: 'Completar margen y proveedor', texto: 'Coste, proveedor y stock mínimo convierten la carta en control de bodega.', href: '/dashboard/bodega', feature: 'bodega', autoHide: () => sinCosteCompra.length === 0 && sinProveedor.length === 0 },
    { id: 'qr', titulo: 'Probar QR y modo camarero', texto: 'Abre la carta pública, revisa móvil y deja listo el PIN de sala.', href: '/dashboard/qr' },
  ]
  const tareasInicioVisibles = tareasInicio.filter(tarea =>
    !tareasOcultas.includes(tarea.id) &&
    (!tarea.feature || puedeUsar(restaurante, tarea.feature)) &&
    !tarea.autoHide?.()
  )

  const alertasSala = stats.incidenciasSala + stats.dudasSala
  const haySenalesSala = stats.ventasHoy + alertasSala > 0
  const siguienteTurno = alertasSala > 0
    ? { label: 'Resolver señales', href: '/dashboard/cierre', detalle: `${alertasSala} señales requieren decisión` }
    : stats.ventasHoy > 0 && !turnoCerrado
      ? { label: 'Cerrar turno', href: '/dashboard/cierre', detalle: `${stats.ventasHoy} ventas marcadas hoy` }
      : bajoMinimo.length > 0
        ? { label: 'Preparar pedido', href: '/dashboard/bodega#pedido', detalle: `${bajoMinimo.length} referencias bajo mínimo` }
        : { label: 'Abrir briefing', href: '/dashboard/sala', detalle: 'Sala lista para preparar el servicio' }
  const estadoTurno = turnoCerrado
    ? 'Turno cerrado'
    : haySenalesSala
      ? 'Turno con señales'
      : 'Turno limpio'
  return (
    <main>
      <div className={styles.wrap}>
        {tareasInicioVisibles.length > 0 && <section className={styles.onboardingPanel}>
          <div className={styles.onboardingHead}>
            <div>
              <p className={styles.eyebrow}>Primeros 30 minutos</p>
              <h2>Tareas de puesta en marcha</h2>
              <p>Márcalas como hechas y desaparecen de este inicio. La pantalla se queda limpia para el trabajo diario.</p>
            </div>
            {tareasInicioVisibles.length === 0 && (
              <button type="button" className={styles.resetTasksButton} onClick={restaurarTareasInicio}>
                Restaurar tareas
              </button>
            )}
          </div>
          {tareasInicioVisibles.length > 0 ? (
            <div className={styles.onboardingGrid}>
              {tareasInicioVisibles.map((tarea, index) => (
                <article className={styles.onboardingTask} key={tarea.id}>
                  <span className={styles.onboardingNumber}>{index + 1}</span>
                  <div>
                    <h3>{tarea.titulo}</h3>
                    <p>{tarea.texto}</p>
                    <div className={styles.onboardingActions}>
                      <Link href={tarea.href}>Abrir</Link>
                      <button type="button" onClick={() => completarTareaInicio(tarea.id)}>Hecho</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.onboardingComplete}>
              <strong>Puesta en marcha completada</strong>
              <span>Estas tareas ya no molestarán en el inicio.</span>
            </div>
          )}
        </section>}

        <section className={styles.healthStrip}>
          <div className={styles.healthHead}>
            <div>
              <p className={styles.eyebrow}>Salud de carta</p>
              <h2>Estado operativo</h2>
            </div>
            <button type="button" className={styles.infoButton} onClick={() => setMostrarAyuda(!mostrarAyuda)} title="Ayuda de inicio" aria-label="Ayuda de inicio">i</button>
          </div>
          <div className={styles.checkGrid}>
            {checksSalud.map(check => (
              <Link key={check.label} href={check.href} className={styles.checkItem}>
                <div className={styles.checkRow}>
                  <span className={styles.checkLabel}>{check.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: check.valor >= 80 ? '#5fa882' : check.valor >= 55 ? '#d4941a' : '#c0482a' }}>{check.valor}%</span>
                </div>
                <div style={{ height: 3, background: 'rgba(23,20,22,0.08)', overflow: 'hidden', borderRadius: 2, margin: '6px 0' }}>
                  <div style={{ width: `${check.valor}%`, height: '100%', background: check.valor >= 80 ? '#5fa882' : check.valor >= 55 ? '#d4941a' : '#c0482a' }} />
                </div>
                <p className={styles.checkDetail}>{check.detalle}</p>
              </Link>
            ))}
          </div>
          {mostrarAyuda && (
            <div className={styles.helpInline}>
              <p><strong>Cómo usar inicio:</strong> revisa la salud de carta, atiende la prioridad del día y entra solo al módulo necesario. Ajustes, QR y marca viven en el menú lateral.</p>
            </div>
          )}
        </section>

        <section className={styles.shiftCard}>
          <div className={styles.shiftMain}>
            <p className={styles.eyebrow}>Turno de hoy</p>
            <h2>{estadoTurno}</h2>
            <p>{siguienteTurno.detalle}</p>
          </div>
          <div className={styles.shiftStats}>
            <div>
              <strong>{stats.ventasHoy}</strong>
              <span>ventas</span>
            </div>
            <div>
              <strong>{alertasSala}</strong>
              <span>señales</span>
            </div>
            <div>
              <strong>{turnoCerrado ? 'Sí' : 'No'}</strong>
              <span>cerrado</span>
            </div>
          </div>
          <Link className={styles.shiftAction} href={siguienteTurno.href}>{siguienteTurno.label}</Link>
        </section>

        <section className={styles.servicePlan}>
          <div className={styles.servicePlanHead}>
            <div>
              <p className={styles.eyebrow}>Plan de servicio</p>
              <h2>Antes de abrir sala</h2>
              <p>Un resumen operativo para saber qué vender, qué vigilar y qué enlaces necesita el equipo.</p>
            </div>
            <div className={styles.servicePlanActions}>
              <select value={objetivoServicio} onChange={event => cambiarObjetivoServicio(event.target.value)} aria-label="Objetivo comercial del servicio">
                {OBJETIVOS_SERVICIO.map(objetivo => <option key={objetivo.id} value={objetivo.id}>{objetivo.label}</option>)}
              </select>
              {enlacesServicio.map(enlace => enlace.pruebaCarta ? (
                <OpenCartaPruebaButton key={enlace.label} restauranteId={restaurante?.id}>{enlace.label}</OpenCartaPruebaButton>
              ) : enlace.external ? (
                <a key={enlace.label} href={enlace.href} target="_blank" rel="noreferrer">{enlace.label}</a>
              ) : (
                <Link key={enlace.label} href={enlace.href}>{enlace.label}</Link>
              ))}
            </div>
          </div>

          <div className={styles.servicePlanGrid}>
            <article className={styles.servicePlanCard}>
              <span className={styles.servicePlanLabel}>Empujar hoy</span>
              {vinosServicio.length ? (
                <div className={styles.servicePlanList}>
                  {vinosServicio.map(vino => (
                    <Link key={vino.id} href="/dashboard/vinos" className={styles.servicePlanItem}>
                      <strong>{vino.nombre}</strong>
                      <span>{[vino.bodega, vino.margenPct ? `${vino.margenPct}% margen` : 'completar coste', decimal(vino.precio_copa) > 0 ? 'por copa' : null].filter(Boolean).join(' · ')}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.servicePlanEmpty}>Añade precio y stock para proponer vinos de servicio.</p>
              )}
            </article>

            <article className={styles.servicePlanCard}>
              <span className={styles.servicePlanLabel}>Vigilar stock</span>
              {riesgosServicio.length ? (
                <div className={styles.servicePlanList}>
                  {riesgosServicio.map(vino => (
                    <Link key={vino.id} href="/dashboard/bodega" className={styles.servicePlanItem}>
                      <strong>{vino.nombre}</strong>
                      <span>{vino.motivo}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.servicePlanEmpty}>Sin alertas de stock con los datos actuales.</p>
              )}
            </article>

            <article className={styles.servicePlanCard}>
              <span className={styles.servicePlanLabel}>Platos para argumentar</span>
              {platosServicio.length ? (
                <div className={styles.servicePlanList}>
                  {platosServicio.map(plato => (
                    <Link key={plato.id} href="/dashboard/platos" className={styles.servicePlanItem}>
                      <strong>{plato.nombre}</strong>
                      <span>{[plato.categoria, decimal(plato.precio) ? eur(plato.precio) : null].filter(Boolean).join(' · ')}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.servicePlanEmpty}>Completa descripciones internas de platos para preparar argumentos y afinar maridajes.</p>
              )}
            </article>
          </div>
        </section>

        <section className={styles.metricGrid}>
          {metricas.map(metrica => (
            <div key={metrica.label} className={styles.metric}>
              <p className={styles.eyebrow}>{metrica.label}</p>
              <p className={styles.metricValue}>{metrica.valor}</p>
              <p className={styles.metricLabel}>{metrica.detalle}</p>
            </div>
          ))}
        </section>

        <section className={styles.quickGrid}>
          {modulos.map(modulo => (
            <Link key={modulo.title} href={modulo.href} className={`${styles.quickCard} ${modulo.dark ? styles.quickCardDark : ''}`}>
              <div>
                <p className={styles.moduleLabel}>{modulo.label}</p>
                <h2 className={styles.quickTitle}>{modulo.title}</h2>
                <p className={styles.quickText}>{modulo.text}</p>
              </div>
              <div className={styles.quickFooter}>
                <span className={styles.quickStat}>{modulo.stat}</span>
                <span className={styles.moduleArrow}>Entrar</span>
              </div>
            </Link>
          ))}
        </section>

      </div>
    </main>
  )
}
