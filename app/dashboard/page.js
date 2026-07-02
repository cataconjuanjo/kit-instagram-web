'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../supabase'
import { getEffectiveRestaurantEmail } from '../demo'
import { maxFechaISO } from '../lib/actividadReal'
import { puedeUsar } from '../lib/plans'
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

export default function DashboardHome() {
  const [restaurante, setRestaurante] = useState(null)
  const [stats, setStats] = useState({ escaneos: 0, sommelier: 0, ventasHoy: 0, incidenciasSala: 0, dudasSala: 0 })
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [tareasOcultas, setTareasOcultas] = useState([])
  const [turnoCerrado, setTurnoCerrado] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }
      const queryRestaurante = supabase.from('restaurantes').select('*')
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        if (typeof window !== 'undefined') {
          try {
            const guardadas = JSON.parse(window.localStorage.getItem(`carta_viva_inicio_${rest.id}`) || '[]')
            setTareasOcultas(Array.isArray(guardadas) ? guardadas : [])
          } catch {
            setTareasOcultas([])
          }
        }
        const hoy = inicioDiaISO()
        const desdeActividad = rest.actividad_real_desde ? maxFechaISO(hoy, rest.actividad_real_desde) : null
        const [
          { data: vinosData },
          { data: platosData },
          { data: statsHoy },
          { data: propuestasData },
        ] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id),
          supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
          desdeActividad
            ? supabase.from('estadisticas').select('tipo, detalle, created_at').eq('restaurante_id', rest.id).gte('created_at', desdeActividad)
            : Promise.resolve({ data: [] }),
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
  const tareasInicioAplicables = tareasInicio.filter(tarea => !tarea.feature || puedeUsar(restaurante, tarea.feature))
  const tareasInicioCompletadas = tareasInicioAplicables.length - tareasInicioVisibles.length
  const progresoActivacion = porcentaje(tareasInicioCompletadas, tareasInicioAplicables.length)
  const activacionCompacta = progresoActivacion >= 60 && tareasInicioVisibles.length <= 2
  const tareasActivacionMostradas = activacionCompacta ? tareasInicioVisibles : tareasInicioAplicables
  const mostrarOperativaDiaria = tareasInicioVisibles.length === 0 || activacionCompacta

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
  const faltasOperativas = [
    vinosSinPrecio.length > 0 && `${vinosSinPrecio.length} vinos sin precio`,
    vinosSinPerfil.length > 0 && `${vinosSinPerfil.length} vinos sin descripcion`,
    platosSinPrecio.length > 0 && `${platosSinPrecio.length} platos sin precio`,
    platosSinDescripcion.length > 0 && `${platosSinDescripcion.length} platos sin descripcion`,
    bajoMinimo.length > 0 && `${bajoMinimo.length} referencias bajo minimo`,
  ].filter(Boolean)
  const accionPrincipal = acciones[0]
    ? { label: acciones[0].texto, href: acciones[0].href, detalle: acciones[0].tipo }
    : siguienteTurno
  const accionesSecundarias = acciones.slice(1, 4)
  const accionesInicio = (acciones.length ? acciones.slice(0, 4) : [siguienteTurno])
  const resumenOperativo = [
    `${calidadGlobal}% salud de carta`,
    `${stats.ventasHoy} ventas hoy`,
    `${alertasSala} señales de sala`,
  ].join(' · ')

  return (
    <main>
      <div className={styles.wrap}>
        {tareasInicioVisibles.length > 0 && (
          <section className={`${styles.activationPanel} ${activacionCompacta ? styles.activationCompact : ''}`}>
            <div className={styles.activationHead}>
              <div>
                <p className={styles.eyebrow}>Puesta en marcha</p>
                <h1>Publica tu primera Carta Viva</h1>
                <p>Completa estos pasos en orden. Cuando termines, tendrás carta pública, maridaje y QR listos para probar.</p>
              </div>
              <div className={styles.activationProgress}>
                <strong>{progresoActivacion}%</strong>
                <span>{tareasInicioCompletadas} de {tareasInicioAplicables.length} pasos</span>
              </div>
            </div>
            <div className={styles.activationBar}><span style={{ width: `${progresoActivacion}%` }} /></div>
            <div className={styles.activationSteps}>
              {tareasActivacionMostradas.map((tarea) => {
                const pendiente = tareasInicioVisibles.some(item => item.id === tarea.id)
                const siguiente = pendiente && tarea.id === tareasInicioVisibles[0]?.id
                const index = tareasInicioAplicables.findIndex(item => item.id === tarea.id)
                return (
                  <article key={tarea.id} className={`${!pendiente ? styles.activationDone : ''} ${siguiente ? styles.activationCurrent : ''}`}>
                    <span>{pendiente ? index + 1 : '✓'}</span>
                    <div>
                      <strong>{tarea.titulo}</strong>
                      <small>{pendiente ? tarea.texto : 'Completado'}</small>
                    </div>
                    {pendiente && <Link href={tarea.href}>{siguiente ? 'Continuar' : 'Abrir'}</Link>}
                  </article>
                )
              })}
            </div>
            <div className={styles.activationTrust}>
              <span>Los cambios se guardan automáticamente</span>
              <span>Tu carta no se publica sola</span>
              <Link href="/dashboard/qr">Revisar QR</Link>
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
                  <span><strong>{calidadGlobal}%</strong> salud de carta</span>
                  <span><strong>{estadoTurno}</strong> sala</span>
                  <span><strong>{alertasSala}</strong> señales pendientes</span>
                </div>
                <div className={styles.stateCallout}>
                  {faltasOperativas.length ? faltasOperativas.slice(0, 3).join(' · ') : 'Carta, sala y bodega sin bloqueos visibles.'}
                </div>
                <div className={styles.focusActions}>
                  <Link href="/dashboard/carta">Carta</Link>
                  {puedeUsar(restaurante, 'modo_camarero') && <Link href="/dashboard/sala">Sala</Link>}
                  {puedeUsar(restaurante, 'bodega') && <Link href="/dashboard/bodega">Bodega</Link>}
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
