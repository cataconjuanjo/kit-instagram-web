'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

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

function etiquetaResultado(resultado) {
  return {
    vendida: 'Vendida',
    no_convence: 'No convenció',
    otra: 'Pidió otra',
    no_stock: 'No quedaba',
    agotado: 'Agotado',
  }[resultado] || 'Feedback'
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const [{ data: vinosData }, { data: statsData }] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id),
          supabase
            .from('estadisticas')
            .select('*')
            .eq('restaurante_id', rest.id)
            .eq('tipo', 'venta')
            .gte('created_at', inicioDiaISO())
            .order('created_at', { ascending: false })
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
    if (!vinoId || !restaurante?.id) return
    const vinoActual = vinos.find(vino => String(vino.id) === String(vinoId))
    const stockAnterior = Number(vinoActual?.stock) || 0
    const { error } = await supabase.from('vinos').update({ stock: 0 }).eq('id', vinoId)
    if (!error) {
      setVinos(vinos.map(vino => String(vino.id) === String(vinoId) ? { ...vino, stock: 0 } : vino))
      await ocultarEvento(evento.id)
      await supabase.from('movimientos_stock').insert([{
        restaurante_id: restaurante.id,
        vino_id: vinoId,
        tipo: 'ajuste',
        cantidad: -stockAnterior,
        stock_anterior: stockAnterior,
        stock_nuevo: 0,
        motivo: `Cierre de servicio: ${etiquetaResultado(evento.parsed?.resultado)}`
      }])
    }
  }

  async function descontarVenta(evento) {
    const vinoId = evento.parsed?.vino_id
    if (!vinoId || !restaurante?.id) return
    const vinoActual = vinos.find(vino => String(vino.id) === String(vinoId))
    const stockAnterior = Number(vinoActual?.stock) || 0
    const stockNuevo = Math.max(0, stockAnterior - 1)
    const { error } = await supabase.from('vinos').update({ stock: stockNuevo }).eq('id', vinoId)
    if (!error) {
      setVinos(vinos.map(vino => String(vino.id) === String(vinoId) ? { ...vino, stock: stockNuevo } : vino))
      await ocultarEvento(evento.id)
      await supabase.from('movimientos_stock').insert([{
        restaurante_id: restaurante.id,
        vino_id: vinoId,
        tipo: 'venta',
        cantidad: -1,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        motivo: `Cierre de servicio: venta marcada por sala`
      }])
    }
  }

  async function cerrarTurno() {
    const nuevos = [...new Set([...ocultos, ...datos.visibles.map(evento => evento.id)])]
    await guardarOcultos(nuevos, true)
  }

  async function reabrirTurno() {
    setOcultos([])
    setTurnoCerrado(false)
    if (restaurante?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(claveCierreDia(restaurante.id))
    }
    await guardarOcultos([], false)
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
            <button type="button" className={styles.primary} onClick={cerrarTurno}>Cerrar turno</button>
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
      <section className={styles.statsGrid}>
        <div className={styles.stat}><p className={styles.statValue}>{datos.vendidas.length}</p><p className={styles.statLabel}>Ventas marcadas</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.incidencias.length}</p><p className={styles.statLabel}>Incidencias stock</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.dudas.length}</p><p className={styles.statLabel}>Dudas o cambios</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.visibles.length}</p><p className={styles.statLabel}>Señales pendientes</p></div>
      </section>

      <section className={turnoCerrado || datos.visibles.length === 0 ? styles.panel : styles.panelDark} style={{ marginBottom: 16 }}>
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
          <div style={{ height: 8, borderRadius: 99, background: turnoCerrado || datos.visibles.length === 0 ? '#e7e0d2' : 'rgba(255,250,243,0.16)', overflow: 'hidden' }}>
            <div style={{ width: `${progresoCierre}%`, height: '100%', background: turnoCerrado || datos.visibles.length === 0 ? '#5fa882' : '#f0c36a' }} />
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
              <article key={paso.titulo} className={styles.itemCard}>
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
                    <button type="button" className={styles.primary} onClick={cerrarTurno}>Cerrar</button>
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
                return (
                  <article className={styles.itemCard} key={evento.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{etiquetaResultado(evento.parsed?.resultado)}</p>
                        <h3 className={styles.sectionTitle}>{evento.parsed?.vino || vino?.nombre || 'Vino'}</h3>
                        <p className={styles.sectionText}>{evento.parsed?.plato || 'Sin contexto'}{vino ? ` · stock actual ${vino.stock || 0}` : ''}</p>
                      </div>
                      <div className={styles.actionRow}>
                        <button className={styles.primary} onClick={() => marcarStockCero(evento)}>Marcar stock 0</button>
                        <button className={styles.ghost} onClick={() => ocultarEvento(evento.id)}>Ignorar</button>
                      </div>
                    </div>
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
                        <button className={styles.primary} onClick={() => descontarVenta(evento)}>Descontar 1</button>
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
          </div>
          <div className={styles.panelBody}>
            {datos.porVino.filter(item => item.no_convence + item.otra > 0).length ? (
              <div className={styles.itemStack}>
                {datos.porVino.filter(item => item.no_convence + item.otra > 0).slice(0, 6).map(item => (
                  <article className={styles.itemCard} key={item.vino_id || item.vino}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{item.vino}</h3>
                        <p className={styles.sectionText}>{item.no_convence} no convenció · {item.otra} pidió otra</p>
                      </div>
                      <Link className={styles.ghost} href="/dashboard/vinos">Revisar</Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className={styles.empty}>Sin dudas marcadas hoy.</div>}
          </div>
        </div>
      </section>
    </ModuleShell>
    </FeatureGate>
  )
}
