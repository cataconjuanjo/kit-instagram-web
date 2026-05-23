'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

function resumenVenta(detalle) {
  try {
    const data = JSON.parse(detalle || '{}')
    const resultado = {
      vendida: 'vendida',
      no_convence: 'no convenció',
      otra: 'pidió otra',
      no_stock: 'no quedaba',
      agotado: 'agotado',
    }[data.resultado] || 'feedback'

    return `${data.vino || 'vino'} · ${resultado}`
  } catch {
    return 'feedback registrado'
  }
}

function leerJSON(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return null }
}

function fechaLocalISO(fecha) {
  if (!fecha) return ''
  const date = new Date(fecha)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}

function servicioDeFecha(fecha) {
  const hora = new Date(fecha).getHours()
  if (hora >= 12 && hora < 17) return 'comida'
  if (hora >= 20 || hora < 2) return 'cena'
  return 'otro'
}

export default function Estadisticas() {
  const [restaurante, setRestaurante] = useState(null)
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [servicio, setServicio] = useState('todos')

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data } = await supabase
          .from('estadisticas')
          .select('*')
          .eq('restaurante_id', rest.id)
          .order('created_at', { ascending: false })
        setStats(data || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const hoy = fechaLocalISO(new Date())
  const statsFiltradas = stats.filter(s => {
    const fecha = fechaLocalISO(s.created_at)
    if (fechaInicio && fecha < fechaInicio) return false
    if (fechaFin && fecha > fechaFin) return false
    if (servicio !== 'todos' && servicioDeFecha(s.created_at) !== servicio) return false
    return true
  })
  const escaneos = statsFiltradas.filter(s => s.tipo === 'escaneo').length
  const consultas = statsFiltradas.filter(s => s.tipo === 'sommelier').length
  const recomendaciones = statsFiltradas.filter(s => s.tipo === 'recomendacion')
  const feedbacksVenta = statsFiltradas.filter(s => s.tipo === 'venta')
  const escaneosHoy = stats.filter(s => s.tipo === 'escaneo' && fechaLocalISO(s.created_at) === hoy).length
  const consultasHoy = stats.filter(s => s.tipo === 'sommelier' && fechaLocalISO(s.created_at) === hoy).length
  const ventasMarcadas = feedbacksVenta.filter(s => {
    try { return JSON.parse(s.detalle || '{}').resultado === 'vendida' } catch { return false }
  }).length

  const feedbackVenta = feedbacksVenta.map(s => leerJSON(s.detalle)).filter(Boolean)
  const recomendacionesVino = recomendaciones.map(s => leerJSON(s.detalle)).filter(Boolean)

  const rendimientoVinos = Object.entries(feedbackVenta.reduce((acc, item) => {
    const vino = item.vino || 'Vino sin nombre'
    acc[vino] = acc[vino] || { vendida: 0, no_convence: 0, otra: 0, total: 0 }
    acc[vino][item.resultado] = (acc[vino][item.resultado] || 0) + 1
    acc[vino].total += 1
    return acc
  }, {}))
    .sort((a, b) => (b[1].vendida - b[1].no_convence) - (a[1].vendida - a[1].no_convence))
    .slice(0, 6)

  const platosFrecuentes = statsFiltradas
    .filter(s => s.tipo === 'sommelier' && s.detalle)
    .flatMap(s => s.detalle.split(', ').map(p => p.trim()))
    .reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc }, {})

  const topPlatos = Object.entries(platosFrecuentes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)

  const vinosRecomendados = Object.entries(recomendacionesVino.reduce((acc, item) => {
    const vino = item.vino || 'Vino sin nombre'
    acc[vino] = acc[vino] || { total: 0, cliente: 0, camarero: 0 }
    const origen = item.origen === 'camarero' ? 'camarero' : 'cliente'
    acc[vino][origen] += 1
    acc[vino].total += 1
    return acc
  }, {}))
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)

  const metricas = [
    { label: 'Escaneos totales', valor: escaneos },
    { label: 'Escaneos hoy', valor: escaneosHoy },
    { label: 'Consultas maridaje', valor: consultas },
    { label: 'Vinos recomendados', valor: recomendaciones.length },
    { label: 'Maridaje hoy', valor: consultasHoy },
    { label: 'Ventas marcadas', valor: ventasMarcadas },
    { label: 'Conversion', valor: escaneos > 0 ? `${Math.round((consultas / escaneos) * 100)}%` : '0%' },
  ]

  return (
    <FeatureGate restaurante={restaurante} feature="estadisticas" title="Actividad no incluida">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Estadisticas"
      title="Actividad de la carta"
      subtitle="Lectura rápida de escaneos, consultas de maridaje y feedback de sala para tomar decisiones comerciales con criterio."
      help={{
        title: 'Como leer los datos',
        intro: 'No hace falta mirarlo cada hora. Funciona mejor como lectura semanal o mensual.',
        items: [
          { title: 'Escaneos', text: 'Indican uso de la carta, pero no venta. Si bajan, revisa QR, ubicación o comunicación en sala.' },
          { title: 'Consultas', text: 'Muestran platos o momentos donde el cliente necesita ayuda para elegir vino.' },
          { title: 'Feedback', text: 'Ventas, cambios y rechazos ayudan a mejorar precio, relato, stock y destacados.' },
        ],
      }}
    >
      <section className={styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Filtrar actividad</h2>
            <p className={styles.panelSub}>Revisa escaneos y consultas por día, rango de fechas o servicio.</p>
          </div>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => { setFechaInicio(''); setFechaFin(''); setServicio('todos') }}
          >
            Limpiar
          </button>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formGridThree}>
            <label>
              <span className={styles.label}>Desde</span>
              <input className={styles.input} type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
            </label>
            <label>
              <span className={styles.label}>Hasta</span>
              <input className={styles.input} type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
            </label>
            <label>
              <span className={styles.label}>Servicio</span>
              <select className={styles.select} value={servicio} onChange={e => setServicio(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="comida">Comida · 12:00-17:00</option>
                <option value="cena">Cena · 20:00-02:00</option>
                <option value="otro">Fuera de servicio</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.statsGrid}>
        {metricas.map(metrica => (
          <div className={styles.stat} key={metrica.label}>
            <p className={styles.statValue}>{metrica.valor}</p>
            <p className={styles.statLabel}>{metrica.label}</p>
          </div>
        ))}
      </section>

      <section className={styles.gridTwo}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Vinos más recomendados</h2>
              <p className={styles.panelSub}>Cuenta las recomendaciones generadas en carta pública y modo camarero.</p>
            </div>
            <span className={styles.badge}>{vinosRecomendados.length}</span>
          </div>
          <div className={styles.panelBody}>
            {vinosRecomendados.length ? (
              <div className={styles.itemStack}>
                {vinosRecomendados.map(([vino, datos], index) => (
                  <article className={styles.itemCard} key={vino}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow} style={{ marginBottom: 5 }}>#{index + 1}</p>
                        <h3 className={styles.sectionTitle}>{vino}</h3>
                        <p className={styles.sectionText}>Cliente {datos.cliente} · Camarero {datos.camarero}</p>
                      </div>
                      <span className={styles.badge}>{datos.total}x</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aún no hay recomendaciones registradas.</div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Feedback del camarero</h2>
              <p className={styles.panelSub}>Vinos que se aceptan, se rechazan o se cambian en mesa.</p>
            </div>
            <span className={styles.badge}>{rendimientoVinos.length}</span>
          </div>
          <div className={styles.panelBody}>
            {rendimientoVinos.length ? (
              <div className={styles.itemStack}>
                {rendimientoVinos.map(([vino, datos]) => (
                  <article className={styles.itemCard} key={vino}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino}</h3>
                        <p className={styles.sectionText}>{datos.no_convence} no convenció · {datos.otra} pidió otra cosa</p>
                      </div>
                      <span className={styles.badge}>{datos.vendida}/{datos.total} ventas</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Sin feedback de venta todavia.</div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Platos más consultados</h2>
              <p className={styles.panelSub}>Lo que más aparece cuando el cliente o sala pide maridaje.</p>
            </div>
            <span className={styles.badge}>{topPlatos.length}</span>
          </div>
          <div className={styles.panelBody}>
            {topPlatos.length ? (
              <div className={styles.itemStack}>
                {topPlatos.map(([plato, veces], index) => (
                  <article className={styles.itemCard} key={plato}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow} style={{ marginBottom: 5 }}>#{index + 1}</p>
                        <h3 className={styles.sectionTitle}>{plato}</h3>
                      </div>
                      <span className={styles.badge}>{veces}x</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aún no hay consultas suficientes.</div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Actividad reciente</h2>
            <p className={styles.panelSub}>Últimos movimientos registrados en carta, maridaje y venta.</p>
          </div>
          <span className={styles.badge}>{statsFiltradas.length}</span>
        </div>
        <div className={styles.panelBody}>
          {statsFiltradas.length ? (
            <div className={styles.itemStack}>
              {statsFiltradas.slice(0, 10).map(s => (
                <article className={styles.itemCard} key={s.id}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className={styles.dot}
                        style={{ background: s.tipo === 'escaneo' ? '#4A8C6F' : s.tipo === 'venta' ? '#bfa984' : s.tipo === 'recomendacion' ? '#3266a8' : '#531827' }}
                      />
                      <p className={styles.sectionTitle}>
                        {s.tipo === 'escaneo'
                          ? 'Escaneo de carta'
                          : s.tipo === 'venta'
                            ? `Venta sala: ${resumenVenta(s.detalle)}`
                            : s.tipo === 'recomendacion'
                              ? `Recomendado: ${leerJSON(s.detalle)?.vino || 'vino'}`
                              : `Maridaje: ${s.detalle?.substring(0, 46)}${s.detalle?.length > 46 ? '...' : ''}`}
                      </p>
                    </div>
                    <p className={styles.tiny}>
                      {new Date(s.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>Sin actividad aún.</div>
          )}
        </div>
      </section>
    </ModuleShell>
    </FeatureGate>
  )
}
