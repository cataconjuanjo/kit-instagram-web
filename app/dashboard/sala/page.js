'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import ParteServicio from './ParteServicio'
import InformeSemanal from './InformeSemanal'
import { getEffectiveRestaurantEmail } from '../../demo'
import {
  SELECT_CLIENT_ESTADISTICA_DASHBOARD,
  SELECT_CLIENT_PLATO_DASHBOARD,
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
  SELECT_CLIENT_VINO_DASHBOARD,
} from '../../lib/clientSupabaseSelects'
import { aplicarVentana, resolverVentanaDiaOperativo } from '../../lib/demoServiceDay'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
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

function LineaBriefing({ titulo, detalle, chipTipo }) {
  return (
    <div className={styles.briefingRow}>
      <span className={styles.briefingRowTitle}>{titulo}</span>
      <div className={styles.briefingRowRight}>
        {chipTipo === 'out' && <span className={styles.stockChipOut}>sin stock</span>}
        {chipTipo === 'min' && <span className={styles.stockChipMin}>stock en mínimo</span>}
        {!chipTipo && detalle && <span className={styles.briefingRowDetail}>{detalle}</span>}
      </div>
    </div>
  )
}

export default function SalaHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [eventos, setEventos] = useState([])
  const [briefing, setBriefing] = useState({ vinosServicio: [], vinosRiesgo: [], platosArgumento: [] })
  const [mensajeBriefing, setMensajeBriefing] = useState('')
  const [etiquetaDia, setEtiquetaDia] = useState('hoy')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('hoy')

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD).eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const ventanaDia = await resolverVentanaDiaOperativo(supabase, rest, { tipo: 'venta' })
        setEtiquetaDia(ventanaDia.etiqueta)
        const [{ data: estadisticas }, { data: vinos }, { data: platos }] = await Promise.all([
          aplicarVentana(
            supabase
              .from('estadisticas')
              .select(SELECT_CLIENT_ESTADISTICA_DASHBOARD)
              .eq('restaurante_id', rest.id)
              .order('created_at', { ascending: false }),
            ventanaDia
          ),
          supabase.from('vinos').select(SELECT_CLIENT_VINO_DASHBOARD).eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('platos').select(SELECT_CLIENT_PLATO_DASHBOARD).eq('restaurante_id', rest.id).eq('activo', true),
        ])
        setVinos(vinos || [])
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
  const etiquetaServicio = etiquetaDia === 'ultimo_dia_demo' ? 'último servicio demo' : 'hoy'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const urlCamarero = `${origin}/camarero/${restaurante?.slug || ''}`

  async function copiarBriefing() {
    const texto = construirBriefingCompartible(restaurante, briefing, urlCamarero)
    await copiarTexto(texto)
    setMensajeBriefing('Briefing copiado para compartir.')
    setTimeout(() => setMensajeBriefing(''), 1800)
  }

  function abrirWhatsAppBriefing() {
    const texto = encodeURIComponent(construirBriefingCompartible(restaurante, briefing, urlCamarero))
    window.open(`https://wa.me/?text=${texto}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <FeatureGate restaurante={restaurante} feature="modo_camarero" title="Modo sala no incluido">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Sala"
      title="Sala"
      subtitle="Prepara el servicio de hoy y revisa cómo fue."
      centered
      actions={<a className={styles.primary} href={urlCamarero} target="_blank" rel="noreferrer">Abrir modo camarero</a>}
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
      <nav className={styles.tabsNav}>
        <button type="button" className={tab === 'hoy' ? `${styles.tabPill} ${styles.tabPillActive}` : styles.tabPill} onClick={() => setTab('hoy')}>Hoy</button>
        <button type="button" className={tab === 'parte' ? `${styles.tabPill} ${styles.tabPillActive}` : styles.tabPill} onClick={() => setTab('parte')}>Parte de servicio</button>
        <button type="button" className={tab === 'semana' ? `${styles.tabPill} ${styles.tabPillActive}` : styles.tabPill} onClick={() => setTab('semana')}>Semana</button>
      </nav>

      {tab === 'hoy' && (
        <div className={styles.salaGrid}>
          <article className={styles.inicioCard}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.cardH2}>Briefing de hoy</h2>
                <p className={styles.cardH2Sub}>Qué empujar y qué no prometer hoy en sala.</p>
                {mensajeBriefing && <p className={styles.tiny}>{mensajeBriefing}</p>}
              </div>
              <div className={styles.actionRow}>
                <button type="button" className={styles.secondary} onClick={copiarBriefing}>Copiar</button>
                <button type="button" className={styles.secondary} onClick={abrirWhatsAppBriefing}>WhatsApp</button>
              </div>
            </div>

            <div className={styles.briefingSection}>
              <p className={styles.briefingSectionTitle}>
                <span className={styles.briefingDot} style={{ background: '#af8b52' }} />
                Empujar hoy
              </p>
              <div className={styles.itemStack}>
                {briefing.vinosServicio.length ? briefing.vinosServicio.map(vino => (
                  <LineaBriefing key={vino.id} titulo={vino.nombre} detalle={detalleVinoServicio(vino)} />
                )) : <p className={styles.sectionText}>Añade stock, precio y coste para generar recomendaciones de venta.</p>}
              </div>
            </div>

            <div className={styles.briefingSection}>
              <p className={styles.briefingSectionTitle}>
                <span className={styles.briefingDot} style={{ background: '#b4532a' }} />
                Revisar antes de prometer
              </p>
              <div className={styles.itemStack}>
                {briefing.vinosRiesgo.length ? briefing.vinosRiesgo.map(vino => (
                  <LineaBriefing
                    key={vino.id}
                    titulo={vino.nombre}
                    chipTipo={decimal(vino.stock) === 0 ? 'out' : 'min'}
                  />
                )) : <p className={styles.sectionText}>Sin referencias críticas de stock para este servicio.</p>}
              </div>
            </div>

            <div className={styles.briefingSection}>
              <p className={styles.briefingSectionTitle}>
                <span className={styles.briefingDot} style={{ background: '#74223d' }} />
                Platos para vender mejor
              </p>
              <div className={styles.itemStack}>
                {briefing.platosArgumento.length ? briefing.platosArgumento.map(plato => (
                  <LineaBriefing key={plato.id} titulo={plato.nombre} detalle={detallePlato(plato)} />
                )) : <p className={styles.sectionText}>Completa descripciones de platos para preparar mejores argumentos de sala.</p>}
              </div>
            </div>
          </article>

          <div className={styles.salaRightCol}>
            <ParteServicio restauranteId={restaurante.id} vinos={vinos} />
            <article className={styles.salaLinksCard}>
              <Link className={styles.salaLinkRow} href="/dashboard/cierre">
                <span>Cierre de servicio</span>
                <span className={styles.salaLinkBadge}>{incidencias + dudas} señales</span>
              </Link>
              <Link className={styles.salaLinkRow} href="/dashboard/estadisticas">
                <span>Actividad</span>
                <span className={styles.salaLinkBadge}>Ver →</span>
              </Link>
            </article>
          </div>
        </div>
      )}

      {tab === 'parte' && <ParteServicio restauranteId={restaurante.id} vinos={vinos} />}

      {tab === 'semana' && <InformeSemanal restauranteId={restaurante.id} restaurante={restaurante} />}
    </ModuleShell>
    </FeatureGate>
  )
}
