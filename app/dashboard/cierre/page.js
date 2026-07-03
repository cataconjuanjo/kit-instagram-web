'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { aplicarVentana, resolverVentanaDiaOperativo } from '../../lib/demoServiceDay'
import { aplicarAjustesStock } from '../../lib/stockClient'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import ResponsiveOverlay from '../ResponsiveOverlay'

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

function etiquetaResultado(resultado) {
  return {
    vendida: 'Vendida',
    no_convence: 'No convenció',
    otra: 'Pidió otra',
    no_stock: 'No quedaba',
    agotado: 'Agotado',
  }[resultado] || 'Feedback'
}

function decimal(valor) {
  return Number(valor) || 0
}

function normalizar(texto = '') {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function margenPct(vino) {
  const precio = decimal(vino?.precio_botella)
  const coste = decimal(vino?.coste_compra)
  if (!precio || !coste) return null
  return Math.round(((precio - coste) / precio) * 100)
}

function distanciaPrecio(origen, candidato) {
  const precioOrigen = decimal(origen?.precio_botella)
  const precioCandidato = decimal(candidato?.precio_botella)
  if (!precioOrigen || !precioCandidato) return 0
  return Math.abs(precioOrigen - precioCandidato) / precioOrigen
}

function palabrasPerfil(vino) {
  return normalizar(`${vino?.notas_cata || ''} ${vino?.uva || ''} ${vino?.region || ''}`)
    .split(/[^a-z0-9]+/)
    .filter(palabra => palabra.length > 3)
}

function explicarSustituto(origen, candidato) {
  const motivos = []
  if (origen?.tipo && candidato?.tipo === origen.tipo) motivos.push(`mismo tipo (${candidato.tipo})`)
  const distancia = distanciaPrecio(origen, candidato)
  if (distancia > 0 && distancia <= 0.25) motivos.push('precio parecido')
  if (origen?.uva && candidato?.uva && normalizar(origen.uva) === normalizar(candidato.uva)) motivos.push('uva similar')
  if (origen?.region && candidato?.region && normalizar(origen.region) === normalizar(candidato.region)) motivos.push('misma zona')
  const margen = margenPct(candidato)
  if (margen != null && margen >= 55) motivos.push(`${margen}% margen`)
  if (decimal(candidato.stock) > Math.max(2, decimal(candidato.stock_minimo))) motivos.push(`stock ${decimal(candidato.stock)}`)
  return motivos.slice(0, 3).join(' · ') || 'alternativa disponible'
}

function sugerirSustitutos(vinos, vinoOrigen) {
  if (!vinoOrigen) return []
  const origenPerfil = new Set(palabrasPerfil(vinoOrigen))
  return vinos
    .filter(vino => vino.activo !== false)
    .filter(vino => String(vino.id) !== String(vinoOrigen.id))
    .filter(vino => decimal(vino.stock) > 0)
    .map(vino => {
      const distancia = distanciaPrecio(vinoOrigen, vino)
      const perfilComun = palabrasPerfil(vino).filter(palabra => origenPerfil.has(palabra)).length
      const margen = margenPct(vino)
      const score =
        (vino.tipo && vino.tipo === vinoOrigen.tipo ? 35 : 0) +
        (distancia > 0 && distancia <= 0.15 ? 22 : distancia <= 0.30 ? 14 : distancia <= 0.50 ? 5 : -18) +
        Math.min(18, perfilComun * 6) +
        (vino.uva && vinoOrigen.uva && normalizar(vino.uva) === normalizar(vinoOrigen.uva) ? 10 : 0) +
        (vino.region && vinoOrigen.region && normalizar(vino.region) === normalizar(vinoOrigen.region) ? 8 : 0) +
        (margen != null && margen >= 60 ? 10 : margen != null && margen >= 50 ? 5 : 0) +
        (decimal(vino.stock) >= Math.max(3, decimal(vino.stock_minimo) + 1) ? 8 : 0)
      return { ...vino, score, motivoSustituto: explicarSustituto(vinoOrigen, vino) }
    })
    .filter(vino => vino.score > 12)
    .sort((a, b) => b.score - a.score || decimal(b.stock) - decimal(a.stock))
    .slice(0, 3)
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

export default function CierreServicio() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [eventos, setEventos] = useState([])
  const [ocultos, setOcultos] = useState([])
  const [turnoCerrado, setTurnoCerrado] = useState(false)
  const [sustitutoCopiado, setSustitutoCopiado] = useState('')
  const [eventoProcesando, setEventoProcesando] = useState('')
  const [mensajeCierre, setMensajeCierre] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmarCierre, setConfirmarCierre] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const ventanaDia = await resolverVentanaDiaOperativo(supabase, rest, { tipo: 'venta' })
        const [{ data: vinosData }, { data: statsData }] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id),
          aplicarVentana(
            supabase
              .from('estadisticas')
              .select('*')
              .eq('restaurante_id', rest.id)
              .eq('tipo', 'venta')
              .order('created_at', { ascending: false }),
            ventanaDia
          )
        ])
        const eventosParseados = (statsData || []).map(item => ({ ...item, parsed: leerDetalle(item.detalle) }))
        setVinos(vinosData || [])
        setEventos(eventosParseados)
        if (typeof window !== 'undefined') {
          try {
            const locales = JSON.parse(window.localStorage.getItem(claveCierreDia(rest.id)) || '[]')
            const cierreRemoto = await cargarCierreRemoto(rest.id)
            const guardados = cierreRemoto?.eventos_revisados || locales
            setOcultos(Array.isArray(guardados) ? guardados : [])
            setTurnoCerrado(Boolean(cierreRemoto?.cerrado))
          } catch {
            setOcultos([])
          }
        }
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function guardarOcultos(nuevos, cerrado = false) {
    setOcultos(nuevos)
    setTurnoCerrado(cerrado)
    if (restaurante?.id && typeof window !== 'undefined') {
      window.localStorage.setItem(claveCierreDia(restaurante.id), JSON.stringify(nuevos))
    }
    if (!restaurante?.id) return
    const token = await tokenSesion()
    if (!token) return
    await fetch('/api/cierres-servicio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        restaurante_id: restaurante.id,
        fecha: fechaLocalClave(),
        eventos_revisados: nuevos,
        cerrado,
      }),
    })
  }

  async function ocultarEvento(id) {
    await guardarOcultos([...new Set([...ocultos, id])])
    setMensajeCierre('Señal marcada como revisada')
  }

  const datos = useMemo(() => {
    const visibles = eventos.filter(evento => !ocultos.includes(evento.id))
    const incidencias = visibles.filter(evento => ['no_stock', 'agotado'].includes(evento.parsed?.resultado))
    const dudas = visibles.filter(evento => ['no_convence', 'otra'].includes(evento.parsed?.resultado))
    const vendidas = visibles.filter(evento => evento.parsed?.resultado === 'vendida')
    const porVino = Object.entries(visibles.reduce((acc, evento) => {
      const id = evento.parsed?.vino_id || evento.parsed?.vino || 'sin-id'
      acc[id] = acc[id] || {
        vino_id: evento.parsed?.vino_id,
        vino: evento.parsed?.vino || 'Vino',
        vendida: 0,
        no_convence: 0,
        otra: 0,
        no_stock: 0,
        agotado: 0,
        total: 0
      }
      const resultado = evento.parsed?.resultado || 'total'
      acc[id][resultado] = (acc[id][resultado] || 0) + 1
      acc[id].total += 1
      return acc
    }, {})).map(([, value]) => value).sort((a, b) => b.total - a.total)

    return { visibles, incidencias, dudas, vendidas, porVino }
  }, [eventos, ocultos])

  async function marcarStockCero(evento) {
    const vinoId = evento.parsed?.vino_id
    if (!vinoId || !restaurante?.id || eventoProcesando === evento.id) return
    setEventoProcesando(evento.id)
    try {
      const [ajuste] = await aplicarAjustesStock(supabase, {
        restaurante_id: restaurante.id,
        ajustes: [{
          vino_id: vinoId,
          modo: 'establecer',
          valor: 0,
          tipo: 'ajuste',
          motivo: `Cierre de servicio: ${etiquetaResultado(evento.parsed?.resultado)}`,
        }],
      })
      setVinos(actuales => actuales.map(vino =>
        String(vino.id) === String(vinoId) ? { ...vino, stock: ajuste?.stock_nuevo ?? 0 } : vino
      ))
      await ocultarEvento(evento.id)
      setMensajeCierre('Stock ajustado a 0 y movimiento registrado')
    } catch (error) {
      setMensajeCierre(error.message || 'No se pudo ajustar el stock.')
    } finally {
      setEventoProcesando('')
    }
  }

  async function descontarVenta(evento) {
    const vinoId = evento.parsed?.vino_id
    if (!vinoId || !restaurante?.id || eventoProcesando === evento.id) return
    setEventoProcesando(evento.id)
    try {
      const [ajuste] = await aplicarAjustesStock(supabase, {
        restaurante_id: restaurante.id,
        ajustes: [{
          vino_id: vinoId,
          modo: 'delta',
          valor: -1,
          tipo: 'venta',
          motivo: 'Cierre de servicio: venta marcada por sala',
        }],
      })
      setVinos(actuales => actuales.map(vino =>
        String(vino.id) === String(vinoId)
          ? { ...vino, stock: ajuste?.stock_nuevo ?? vino.stock }
          : vino
      ))
      await ocultarEvento(evento.id)
      setMensajeCierre('Venta descontada del stock')
    } catch (error) {
      setMensajeCierre(error.message || 'No se pudo descontar la venta.')
    } finally {
      setEventoProcesando('')
    }
  }

  async function cerrarTurno() {
    setConfirmarCierre(false)
    const nuevos = [...new Set([...ocultos, ...datos.visibles.map(evento => evento.id)])]
    await guardarOcultos(nuevos, true)
    setMensajeCierre('Turno cerrado')
  }

  async function reabrirTurno() {
    setOcultos([])
    setTurnoCerrado(false)
    if (restaurante?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(claveCierreDia(restaurante.id))
    }
    await guardarOcultos([], false)
    setMensajeCierre('Turno reabierto')
  }

  async function copiarSustitutosSala(evento, vinoOrigen, sustitutos) {
    if (!sustitutos.length) return
    const texto = [
      `Sustituto para sala - ${evento.parsed?.vino || vinoOrigen?.nombre || 'vino agotado'}`,
      '',
      `Si piden ${evento.parsed?.vino || vinoOrigen?.nombre || 'este vino'} y no queda, ofrecer:`,
      ...sustitutos.map((vino, index) => `${index + 1}. ${vino.nombre}${vino.precio_botella ? ` (${vino.precio_botella} €)` : ''}: ${vino.motivoSustituto}.`),
      '',
      'Frase corta:',
      `"Ahora mismo no queda, pero puedo ofrecerte ${sustitutos[0].nombre}: encaja por perfil y tenemos stock."`,
    ].join('\n')
    await copiarTexto(texto)
    setSustitutoCopiado(evento.id)
    setTimeout(() => setSustitutoCopiado(''), 1800)
  }

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const acciones = [
    datos.incidencias.length > 0 && `Aplicar o ignorar ${datos.incidencias.length} incidencias de stock.`,
    datos.dudas.length > 0 && `Revisar ${datos.dudas.length} dudas de sala: precio, argumento o alternativa.`,
    datos.vendidas.length > 0 && `Detectar vinos con tracción: ${datos.vendidas.length} ventas marcadas hoy.`,
    datos.visibles.length === 0 && 'Sin señales de sala hoy. El cierre queda limpio.',
  ].filter(Boolean)

  const pasosCierre = [
    {
      titulo: 'Resolver incidencias de stock',
      detalle: datos.incidencias.length ? `${datos.incidencias.length} avisos pendientes` : 'Sin incidencias pendientes',
      hecho: datos.incidencias.length === 0,
      href: '#incidencias',
    },
    {
      titulo: 'Decidir ventas marcadas',
      detalle: datos.vendidas.length ? `${datos.vendidas.length} ventas para descontar o dejar como señal` : 'Sin ventas pendientes de decisión',
      hecho: datos.vendidas.length === 0,
      href: '#ventas',
    },
    {
      titulo: 'Revisar dudas de sala',
      detalle: datos.dudas.length ? `${datos.dudas.length} dudas para mejorar argumento o alternativa` : 'Sin dudas pendientes',
      hecho: datos.dudas.length === 0,
      href: '#dudas',
    },
    {
      titulo: 'Cerrar turno',
      detalle: turnoCerrado || datos.visibles.length === 0 ? 'Turno revisado' : 'Guarda el cierre cuando no quieras ver más señales hoy',
      hecho: turnoCerrado || datos.visibles.length === 0,
    },
  ]
  const pasosHechos = pasosCierre.filter(paso => paso.hecho).length
  const progresoCierre = Math.round((pasosHechos / pasosCierre.length) * 100)

  return (
    <FeatureGate restaurante={restaurante} feature="cierre_servicio" title="Cierre de servicio no incluido">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Cierre de servicio"
      title="Revisar la noche en 3 minutos"
      subtitle="El camarero deja señales durante el servicio. El encargado decide después: aplicar stock, revisar argumentos y detectar oportunidades."
      actions={
        <>
          <Link href="/dashboard/bodega" className={styles.secondary}>Ir a bodega</Link>
          {datos.visibles.length > 0 ? (
            <button type="button" className={styles.primary} onClick={() => setConfirmarCierre(true)}>Cerrar turno</button>
          ) : (
            <button type="button" className={styles.ghost} onClick={reabrirTurno}>Reabrir turno</button>
          )}
        </>
      }
      help={{
        title: 'Cierre sin agobio',
        intro: 'Esta pantalla convierte lo que pasó en sala en decisiones pequeñas y útiles para mañana.',
        items: [
          { title: 'Stock', text: 'Si varias veces aparece sin stock o agotado, aplica el ajuste o revisa esa referencia en bodega.' },
          { title: 'Dudas', text: 'No convenció o pidió otra suele indicar precio, argumento flojo o alternativa mejor.' },
          { title: 'Ventas', text: 'Las ventas marcadas no sustituyen al TPV; sirven para detectar vinos que la sala puede empujar.' },
        ],
      }}
    >
      {mensajeCierre && (
        <div className={styles.inlineToast} role="status">
          {mensajeCierre}
          <button type="button" onClick={() => setMensajeCierre('')} aria-label="Cerrar aviso">Cerrar</button>
        </div>
      )}

      <section className={styles.closeHero}>
        <div>
          <p className={styles.eyebrow}>Cierre guiado</p>
          <h2>{turnoCerrado || datos.visibles.length === 0 ? 'Servicio limpio' : 'Quedan decisiones por resolver'}</h2>
          <p>Revisa señales de sala, ajusta stock cuando proceda y deja preparada la bodega para el siguiente turno.</p>
        </div>
        <div className={styles.closeHeroScore}>
          <strong>{progresoCierre}%</strong>
          <span>{pasosHechos} de {pasosCierre.length} pasos</span>
        </div>
      </section>

      <section className={`${styles.statsGrid} ${styles.closeStats}`}>
        <div className={styles.stat}><p className={styles.statValue}>{datos.vendidas.length}</p><p className={styles.statLabel}>Ventas marcadas</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.incidencias.length}</p><p className={styles.statLabel}>Incidencias stock</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.dudas.length}</p><p className={styles.statLabel}>Dudas o cambios</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.visibles.length}</p><p className={styles.statLabel}>Señales pendientes</p></div>
      </section>

      <section className={`${turnoCerrado || datos.visibles.length === 0 ? styles.panel : styles.panelDark} ${styles.closeProgressPanel}`} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{turnoCerrado || datos.visibles.length === 0 ? 'Turno revisado' : 'Turno pendiente de cierre'}</h2>
            <p className={styles.panelSub}>
              {turnoCerrado || datos.visibles.length === 0
                ? 'Las señales de hoy quedan limpias en esta pantalla. Puedes reabrir si necesitas revisar de nuevo.'
                : 'Resuelve stock, descuenta ventas útiles o cierra el turno si solo quieres guardar las señales como revisadas.'}
            </p>
          </div>
          <span className={styles.badge}>{datos.visibles.length} pendientes</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.closeProgressTrack}>
            <div className={styles.closeProgressFill} style={{ width: `${progresoCierre}%` }} />
          </div>
          <p className={styles.sectionText} style={{ color: turnoCerrado || datos.visibles.length === 0 ? undefined : 'rgba(255,250,243,0.66)' }}>{pasosHechos} de {pasosCierre.length} pasos completados</p>
        </div>
      </section>

      <section className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Rutina de cierre</h2>
            <p className={styles.panelSub}>Una secuencia simple para no dejar decisiones sueltas al final del servicio.</p>
          </div>
          <Link className={styles.secondary} href="/dashboard/sala">Ver briefing</Link>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.itemStack}>
            {pasosCierre.map((paso, index) => (
              <article key={paso.titulo} className={`${styles.itemCard} ${styles.closeStep} ${paso.hecho ? styles.closeStepDone : ''}`}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <p className={styles.eyebrow}>Paso {index + 1}</p>
                    <h3 className={styles.sectionTitle}>{paso.titulo}</h3>
                    <p className={styles.sectionText}>{paso.detalle}</p>
                  </div>
                  {paso.hecho ? (
                    <span className={styles.badge}>Hecho</span>
                  ) : paso.href ? (
                    <a className={styles.ghost} href={paso.href}>Revisar</a>
                  ) : (
                    <button type="button" className={styles.primary} onClick={() => setConfirmarCierre(true)}>Cerrar</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Acción recomendada</h2>
            <p className={styles.panelSub}>No es contabilidad de TPV. Es una limpieza rápida para que la bodega no se desordene.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.itemStack}>
            {acciones.map(accion => (
              <article key={accion} className={styles.itemCard} style={{ background: '#231e20', borderColor: '#3a3033' }}>
                <p className={styles.sectionTitle} style={{ color: '#fffaf3' }}>{accion}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {datos.incidencias.length > 0 && (
        <section className={styles.panel} id="incidencias" style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Incidencias de stock</h2>
              <p className={styles.panelSub}>Aplica solo lo que tenga sentido. El resto se puede ignorar.</p>
            </div>
            <span className={styles.badge}>{datos.incidencias.length}</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              {datos.incidencias.map(evento => {
                const vino = vinos.find(item => String(item.id) === String(evento.parsed?.vino_id))
                const sustitutos = sugerirSustitutos(vinos, vino)
                return (
                  <article className={styles.itemCard} key={evento.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{etiquetaResultado(evento.parsed?.resultado)}</p>
                        <h3 className={styles.sectionTitle}>{evento.parsed?.vino || vino?.nombre || 'Vino'}</h3>
                        <p className={styles.sectionText}>{evento.parsed?.plato || 'Sin contexto'}{vino ? ` · stock actual ${vino.stock || 0}` : ''}</p>
                      </div>
                      <div className={styles.actionRow}>
                        <button className={styles.primary} disabled={eventoProcesando === evento.id} onClick={() => marcarStockCero(evento)}>
                          {eventoProcesando === evento.id ? 'Aplicando...' : 'Marcar stock 0'}
                        </button>
                        <button className={styles.ghost} onClick={() => ocultarEvento(evento.id)}>Ignorar</button>
                      </div>
                    </div>
                    {vino && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(23,20,22,0.08)' }}>
                        <div className={styles.sectionHead} style={{ margin: 0 }}>
                          <div>
                            <p className={styles.eyebrow}>Sustitutos para no perder la venta</p>
                            <p className={styles.sectionText}>
                              Basado en tipo, precio parecido, perfil de venta, margen y stock disponible.
                            </p>
                          </div>
                          {sustitutos.length > 0 && (
                            <button className={styles.ghost} onClick={() => copiarSustitutosSala(evento, vino, sustitutos)}>
                              {sustitutoCopiado === evento.id ? 'Copiado' : 'Copiar para sala'}
                            </button>
                          )}
                        </div>
                        {sustitutos.length ? (
                          <div className={styles.itemStack} style={{ marginTop: 10 }}>
                            {sustitutos.map(sustituto => (
                              <div key={sustituto.id} className={styles.sectionHead} style={{ margin: 0, padding: '8px 0', borderTop: '1px solid rgba(23,20,22,0.06)' }}>
                                <div>
                                  <h4 className={styles.sectionTitle} style={{ fontSize: 14 }}>{sustituto.nombre}</h4>
                                  <p className={styles.sectionText}>
                                    {[sustituto.bodega, sustituto.tipo, sustituto.precio_botella ? `${sustituto.precio_botella} €` : null].filter(Boolean).join(' · ')}
                                  </p>
                                  <p className={styles.sectionText}>{sustituto.motivoSustituto}</p>
                                </div>
                                <span className={styles.badge}>Stock {decimal(sustituto.stock)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.empty} style={{ minHeight: 80, marginTop: 10 }}>
                            No hay sustitutos claros con stock. Revisa bodega o completa perfiles de venta.
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {datos.vendidas.length > 0 && (
        <section className={styles.panel} id="ventas" style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Ventas para descontar</h2>
              <p className={styles.panelSub}>Aplica solo las ventas que quieras convertir en movimiento de stock.</p>
            </div>
            <span className={styles.badge}>{datos.vendidas.length}</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              {datos.vendidas.slice(0, 8).map(evento => {
                const vino = vinos.find(item => String(item.id) === String(evento.parsed?.vino_id))
                return (
                  <article className={styles.itemCard} key={evento.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>Venta marcada</p>
                        <h3 className={styles.sectionTitle}>{evento.parsed?.vino || vino?.nombre || 'Vino'}</h3>
                        <p className={styles.sectionText}>{evento.parsed?.plato || 'Sin contexto'}{vino ? ` · stock actual ${vino.stock || 0}` : ''}</p>
                      </div>
                      <div className={styles.actionRow}>
                        <button className={styles.primary} disabled={eventoProcesando === evento.id} onClick={() => descontarVenta(evento)}>
                          {eventoProcesando === evento.id ? 'Aplicando...' : 'Descontar 1'}
                        </button>
                        <button className={styles.ghost} onClick={() => ocultarEvento(evento.id)}>Dejar como señal</button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section className={styles.gridTwo}>
        <div className={styles.panel} id="traccion">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Vinos con tracción</h2>
              <p className={styles.panelSub}>Candidatos para destacar, formar a sala o reforzar compra.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            {datos.porVino.filter(item => item.vendida > 0).length ? (
              <div className={styles.itemStack}>
                {datos.porVino.filter(item => item.vendida > 0).slice(0, 6).map(item => (
                  <article className={styles.itemCard} key={item.vino_id || item.vino}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <h3 className={styles.sectionTitle}>{item.vino}</h3>
                      <span className={styles.badge}>{item.vendida} ventas</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className={styles.empty}>Sin ventas marcadas hoy.</div>}
          </div>
        </div>

        <div className={styles.panel} id="dudas">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Dudas de sala</h2>
              <p className={styles.panelSub}>Si un vino no convence, puede faltar argumento, precio o alternativa.</p>
            </div>
            <span className={styles.badge}>{datos.dudas.length}</span>
          </div>
          <div className={styles.panelBody}>
            {datos.dudas.length ? (
              <div className={styles.itemStack}>
                {datos.dudas.slice(0, 8).map(evento => {
                  const vino = vinos.find(item => String(item.id) === String(evento.parsed?.vino_id))
                  return (
                  <article className={styles.itemCard} key={evento.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{etiquetaResultado(evento.parsed?.resultado)}</p>
                        <h3 className={styles.sectionTitle}>{evento.parsed?.vino || vino?.nombre || 'Vino'}</h3>
                        <p className={styles.sectionText}>{evento.parsed?.plato || 'Sin contexto'}{vino?.precio_botella ? ` · ${vino.precio_botella} €` : ''}</p>
                      </div>
                      <div className={styles.actionRow}>
                        <button type="button" className={styles.primary} onClick={() => ocultarEvento(evento.id)}>Marcar revisada</button>
                        <Link className={styles.ghost} href="/dashboard/vinos">Revisar vino</Link>
                      </div>
                    </div>
                  </article>
                  )
                })}
              </div>
            ) : <div className={styles.empty}>Sin dudas marcadas hoy.</div>}
          </div>
        </div>
      </section>
      {datos.visibles.length > 0 && !turnoCerrado && (
        <div className={styles.closeStickyAction}>
          <div>
            <strong>{datos.visibles.length} señales pendientes</strong>
            <span>Revisa lo importante o cierra el turno si ya está decidido.</span>
          </div>
          <button type="button" className={styles.primary} onClick={() => setConfirmarCierre(true)}>Cerrar turno</button>
        </div>
      )}
      <ResponsiveOverlay
        open={confirmarCierre}
        onClose={() => setConfirmarCierre(false)}
        size="modal"
        eyebrow="Final del servicio"
        title="Cerrar turno"
        description={`Se marcarán ${datos.visibles.length} señales como revisadas y podrás reabrir el turno si fuera necesario.`}
        footer={
          <>
            <button type="button" className={styles.ghost} onClick={() => setConfirmarCierre(false)}>Cancelar</button>
            <button type="button" className={styles.primary} onClick={cerrarTurno}>Confirmar cierre</button>
          </>
        }
      >
        <div className={styles.statsGrid}>
          <div className={styles.stat}><p className={styles.statValue}>{datos.incidencias.length}</p><p className={styles.statLabel}>Incidencias</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{datos.vendidas.length}</p><p className={styles.statLabel}>Ventas marcadas</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{datos.dudas.length}</p><p className={styles.statLabel}>Dudas de sala</p></div>
        </div>
      </ResponsiveOverlay>
    </ModuleShell>
    </FeatureGate>
  )
}
