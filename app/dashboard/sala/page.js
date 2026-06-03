'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
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

function decimal(valor) {
  return parseFloat(valor) || 0
}

function eur(valor) {
  return `${decimal(valor).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`
}

function prepararBriefing(vinos = [], platos = [], restaurante = {}) {
  const activos = vinos.filter(vino => vino.activo !== false)
  const ciudad = (restaurante?.ciudad || '').toLowerCase()

  const vinosServicio = activos
    .filter(vino => decimal(vino.stock) > 0 && decimal(vino.precio_botella) > 0)
    .map(vino => {
      const venta = decimal(vino.precio_botella)
      const coste = decimal(vino.coste_compra)
      const margenPct = venta && coste ? Math.round(((venta - coste) / venta) * 100) : null
      const stock = decimal(vino.stock)
      const score =
        (margenPct || 45) +
        (decimal(vino.precio_copa) > 0 ? 12 : 0) +
        (stock >= Math.max(8, decimal(vino.stock_minimo) * 2) ? 10 : 0) +
        ((vino.region || '').toLowerCase().includes(ciudad) ? 8 : 0)
      return { ...vino, margenPct, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  const vinosRiesgo = activos
    .filter(vino => decimal(vino.stock) === 0 || (decimal(vino.stock_minimo) > 0 && decimal(vino.stock) <= decimal(vino.stock_minimo)))
    .sort((a, b) => decimal(a.stock) - decimal(b.stock))
    .slice(0, 3)

  const platosArgumento = platos
    .filter(plato => plato.activo !== false && plato.descripcion && plato.descripcion.trim().length >= 8)
    .sort((a, b) => decimal(b.precio) - decimal(a.precio))
    .slice(0, 3)

  return { vinosServicio, vinosRiesgo, platosArgumento }
}

function objetivoBriefing(briefing) {
  if (briefing.vinosServicio.some(vino => decimal(vino.precio_copa) > 0)) {
    return 'Empujar vinos por copa y referencias faciles de defender.'
  }
  if (briefing.vinosRiesgo.length) {
    return 'Vender con intencion sin prometer referencias criticas de stock.'
  }
  return 'Subir la calidad de recomendacion y marcar senales utiles durante el servicio.'
}

function detalleVinoServicio(vino) {
  return [
    vino.bodega,
    vino.margenPct ? `${vino.margenPct}% margen` : 'coste pendiente',
    decimal(vino.precio_copa) > 0 ? 'por copa' : eur(vino.precio_botella),
  ].filter(Boolean).join(' · ')
}

function detalleVinoRiesgo(vino) {
  return `Stock ${decimal(vino.stock)}${decimal(vino.stock_minimo) ? ` / minimo ${decimal(vino.stock_minimo)}` : ''}`
}

function detallePlato(plato) {
  return [plato.categoria, decimal(plato.precio) ? eur(plato.precio) : null].filter(Boolean).join(' · ')
}

function construirBriefingCompartible(restaurante, briefing, urlCamarero) {
  const lineas = [
    `Briefing de sala - ${restaurante?.nombre || 'Restaurante'}`,
    new Date().toLocaleDateString('es-ES'),
    '',
    `Objetivo: ${objetivoBriefing(briefing)}`,
    '',
    'Empujar hoy:',
    ...(briefing.vinosServicio.length
      ? briefing.vinosServicio.map(vino => `- ${vino.nombre}${detalleVinoServicio(vino) ? ` (${detalleVinoServicio(vino)})` : ''}`)
      : ['- Completar stock, precio y coste para generar recomendaciones.']),
    '',
    'Revisar antes de prometer:',
    ...(briefing.vinosRiesgo.length
      ? briefing.vinosRiesgo.map(vino => `- ${vino.nombre}: ${detalleVinoRiesgo(vino)}`)
      : ['- Sin referencias criticas de stock para este servicio.']),
    '',
    'Argumentos rapidos:',
    ...(briefing.platosArgumento.length
      ? briefing.platosArgumento.map(plato => `- ${plato.nombre}${detallePlato(plato) ? ` (${detallePlato(plato)})` : ''}`)
      : ['- Completar descripciones de platos para preparar mejores argumentos.']),
    '',
    `Modo camarero: ${urlCamarero}`,
  ]

  return lineas.join('\n')
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

function LineaBriefing({ titulo, detalle }) {
  return (
    <div style={{ borderTop: '1px solid rgba(90, 72, 55, 0.12)', paddingTop: 10 }}>
      <p className={styles.sectionTitle} style={{ fontSize: 14 }}>{titulo}</p>
      {detalle && <p className={styles.sectionText} style={{ marginTop: 3 }}>{detalle}</p>}
    </div>
  )
}

export default function SalaHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [eventos, setEventos] = useState([])
  const [briefing, setBriefing] = useState({ vinosServicio: [], vinosRiesgo: [], platosArgumento: [] })
  const [mensajeBriefing, setMensajeBriefing] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const [{ data: estadisticas }, { data: vinos }, { data: platos }] = await Promise.all([
          supabase
            .from('estadisticas')
            .select('*')
            .eq('restaurante_id', rest.id)
            .gte('created_at', inicioDiaISO())
            .order('created_at', { ascending: false }),
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
        ])
        setEventos((estadisticas || []).map(item => ({ ...item, parsed: leerDetalle(item.detalle) })))
        setBriefing(prepararBriefing(vinos || [], platos || [], rest))
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const ventas = eventos.filter(e => e.tipo === 'venta' && e.parsed?.resultado === 'vendida').length
  const incidencias = eventos.filter(e => e.tipo === 'venta' && ['no_stock', 'agotado'].includes(e.parsed?.resultado)).length
  const dudas = eventos.filter(e => e.tipo === 'venta' && ['no_convence', 'otra'].includes(e.parsed?.resultado)).length
  const consultas = eventos.filter(e => e.tipo === 'sommelier').length
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const urlCamarero = `${origin}/camarero/${restaurante?.slug || ''}`

  async function copiarBriefing() {
    const texto = construirBriefingCompartible(restaurante, briefing, urlCamarero)
    await copiarTexto(texto)
    setMensajeBriefing('Briefing copiado para compartir.')
    setTimeout(() => setMensajeBriefing(''), 1800)
  }

  return (
    <FeatureGate restaurante={restaurante} feature="modo_camarero" title="Modo sala no incluido">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Sala"
      title="Servicio y actividad"
      subtitle="Rutina diaria para revisar lo que ha pasado en mesa y dejar la carta lista para el siguiente servicio."
      actions={<a className={styles.secondary} href={urlCamarero} target="_blank" rel="noreferrer">Abrir modo camarero</a>}
      help={{
        title: 'Rutina de sala',
        intro: 'No es para tocarlo todo durante el servicio. Es para recoger señales y decidir después con calma.',
        items: [
          { title: 'Durante el servicio', text: 'El camarero marca ventas, falta de stock o cambios de decisión desde su pantalla simple.' },
          { title: 'Al cierre', text: 'Revisa incidencias y dudas en Cierre de servicio. Ahí decides si ajustar stock o solo tomar nota.' },
          { title: 'Semanalmente', text: 'Actividad sirve para ver tendencias: qué se consulta, qué convence y qué necesita mejor argumento.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        <div className={styles.stat}><p className={styles.statValue}>{ventas}</p><p className={styles.statLabel}>Ventas marcadas hoy</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{incidencias}</p><p className={styles.statLabel}>Incidencias de stock</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{dudas}</p><p className={styles.statLabel}>Dudas o cambios</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{consultas}</p><p className={styles.statLabel}>Consultas maridaje</p></div>
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <p className={styles.eyebrow}>Antes de abrir</p>
            <h2 className={styles.panelTitle}>Briefing de sala</h2>
            <p className={styles.panelSub}>Qué vender con intención, qué revisar antes de prometer y qué platos usar para abrir conversación.</p>
            {mensajeBriefing && <p className={styles.tiny}>{mensajeBriefing}</p>}
          </div>
          <div className={styles.actionRow}>
            <button type="button" className={styles.primary} onClick={copiarBriefing}>Copiar briefing</button>
            <Link className={styles.secondary} href="/dashboard/cierre">Ir a cierre</Link>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.gridTwo}>
            <article className={styles.itemCard}>
              <p className={styles.eyebrow}>Empujar hoy</p>
              <h3 className={styles.sectionTitle}>Vinos con recorrido</h3>
              <div className={styles.itemStack} style={{ marginTop: 12 }}>
                {briefing.vinosServicio.length ? briefing.vinosServicio.map(vino => (
                  <LineaBriefing
                    key={vino.id}
                    titulo={vino.nombre}
                    detalle={detalleVinoServicio(vino)}
                  />
                )) : <p className={styles.sectionText}>Añade stock, precio y coste para generar recomendaciones de venta.</p>}
              </div>
            </article>

            <article className={styles.itemCard}>
              <p className={styles.eyebrow}>Revisar antes</p>
              <h3 className={styles.sectionTitle}>No prometer sin mirar bodega</h3>
              <div className={styles.itemStack} style={{ marginTop: 12 }}>
                {briefing.vinosRiesgo.length ? briefing.vinosRiesgo.map(vino => (
                  <LineaBriefing
                    key={vino.id}
                    titulo={vino.nombre}
                    detalle={detalleVinoRiesgo(vino)}
                  />
                )) : <p className={styles.sectionText}>No hay referencias críticas de stock para este servicio.</p>}
              </div>
            </article>

            <article className={styles.itemCard}>
              <p className={styles.eyebrow}>Argumentos</p>
              <h3 className={styles.sectionTitle}>Platos para vender mejor</h3>
              <div className={styles.itemStack} style={{ marginTop: 12 }}>
                {briefing.platosArgumento.length ? briefing.platosArgumento.map(plato => (
                  <LineaBriefing
                    key={plato.id}
                    titulo={plato.nombre}
                    detalle={detallePlato(plato)}
                  />
                )) : <p className={styles.sectionText}>Completa descripciones de platos para preparar mejores argumentos de sala.</p>}
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.hubGrid}>
        <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/cierre">
          <p className={styles.eyebrow}>Hoy</p>
          <h2>Cierre de servicio</h2>
          <p>Resolver incidencias, limpiar dudas y detectar vinos con tracción.</p>
          <span>{incidencias + dudas} señales pendientes</span>
        </Link>
        <Link className={styles.hubCard} href="/dashboard/estadisticas">
          <p className={styles.eyebrow}>Histórico</p>
          <h2>Actividad</h2>
          <p>Escaneos, consultas de maridaje y feedback acumulado.</p>
          <span>Ver tendencias</span>
        </Link>
      </section>
    </ModuleShell>
    </FeatureGate>
  )
}
