'use client'

import { useEffect, useMemo, useState } from 'react'
import { calcularPreciosSugeridos } from '../../lib/pricingUtils'
import styles from '../module.module.css'
import priceStyles from '../precios/precios.module.css'


function num(v) {
  if (typeof v === 'string') v = v.replace(',', '.')
  return Number(v) || 0
}

function eur(v, d = 2) {
  return `${num(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })} €`
}

function diff(actual, recomendado) {
  const a = num(actual)
  if (!a) return { texto: 'Sin precio', tono: 'pending' }
  const delta = recomendado - a
  if (Math.abs(delta) < 0.01) return { texto: 'En precio', tono: 'ok' }
  return { texto: `${delta > 0 ? '+' : ''}${eur(delta, delta % 1 === 0 ? 0 : 2)}`, tono: delta > 0 ? 'up' : 'down' }
}

export default function PreciosPanel({ settings, guardarAjustes, apiDisponible, vinos = [], onAjustesChange }) {
  const [tab, setTab] = useState('precios')
  const [trabajando, setTrabajando] = useState(settings)
  const [guardandoConfig, setGuardandoConfig] = useState(false)
  const [mensajeConfig, setMensajeConfig] = useState('')
  const [sim, setSim] = useState({ coste: '' })
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(1)

  const mlInicial = settings?.formato_botella_ml && settings?.copas_por_botella
    ? Math.round(settings.formato_botella_ml / settings.copas_por_botella)
    : 150
  const [mlCopaActual, setMlCopaActual] = useState(mlInicial)
  const [esPersonalizado, setEsPersonalizado] = useState(![125, 150].includes(mlInicial))
  const [mlPersonalizado, setMlPersonalizado] = useState(![125, 150].includes(mlInicial) ? mlInicial : 150)

  useEffect(() => {
    setTrabajando(settings)
    if (settings?.formato_botella_ml && settings?.copas_por_botella) {
      const ml = Math.round(settings.formato_botella_ml / settings.copas_por_botella)
      setMlCopaActual(ml)
      setEsPersonalizado(![125, 150].includes(ml))
      if (![125, 150].includes(ml)) setMlPersonalizado(ml)
    }
  }, [settings])

  const ajustes = useMemo(() => trabajando || {}, [trabajando])

  function cambiarCriterio(campo, valor) {
    const next = { ...trabajando, [campo]: num(valor) }
    setTrabajando(next)
    onAjustesChange?.(next)
  }

  async function guardarCriterio() {
    const result = await guardarAjustes(trabajando)
    setMensajeConfig(result.ok ? (result.fallback ? 'Guardado localmente.' : 'Criterio guardado.') : `Error: ${result.error}`)
  }

  async function guardarConfiguracion() {
    setGuardandoConfig(true)
    setMensajeConfig('')
    const result = await guardarAjustes(trabajando)
    setGuardandoConfig(false)
    if (result.ok) {
      setMensajeConfig(result.fallback ? 'Guardado localmente.' : 'Configuración guardada.')
      onAjustesChange?.(trabajando)
    } else {
      setMensajeConfig(`Error: ${result.error}`)
    }
  }

  const resultadoSim = calcularPreciosSugeridos(sim.coste, ajustes)
  const vinosActivos = useMemo(() => vinos.filter(v => v.activo !== false), [vinos])
  const conCoste = useMemo(() => vinosActivos.filter(v => num(v.coste_compra) > 0), [vinosActivos])
  const porRevisar = useMemo(() => conCoste.filter(vino => {
    const rec = calcularPreciosSugeridos(vino.coste_compra, ajustes)
    return num(vino.precio_botella) !== rec.botella || num(vino.precio_copa) !== rec.copa
  }), [conCoste, ajustes])

  const referencias = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return vinosActivos
      .filter(vino => {
        if (filtro === 'sin_coste') return !num(vino.coste_compra)
        if (filtro === 'revisar') {
          if (!num(vino.coste_compra)) return false
          const rec = calcularPreciosSugeridos(vino.coste_compra, ajustes)
          return num(vino.precio_botella) !== rec.botella || num(vino.precio_copa) !== rec.copa
        }
        return true
      })
      .filter(vino => !termino || `${vino.nombre} ${vino.bodega || ''}`.toLowerCase().includes(termino))
  }, [vinosActivos, busqueda, filtro, ajustes])

  const totalPaginas = Math.max(1, Math.ceil(referencias.length / 10))
  const paginaActual = Math.min(pagina, totalPaginas)
  const referenciasPagina = referencias.slice((paginaActual - 1) * 10, paginaActual * 10)


  const tabStyle = active => ({
    padding: '7px 16px',
    border: '1px solid',
    borderColor: active ? '#9b7430' : '#e0d4bc',
    borderRadius: 6,
    background: active ? '#9b7430' : 'transparent',
    color: active ? '#fffaf3' : '#756d63',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 750,
    transition: 'background 0.12s',
  })

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={tabStyle(tab === 'precios')} onClick={() => setTab('precios')}>Precios y márgenes</button>
        <button type="button" style={tabStyle(tab === 'configuracion')} onClick={() => setTab('configuracion')}>Configuración</button>
      </div>

      {tab === 'precios' && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Criterio de cálculo</h2>
                <p className={styles.panelSub}>Botella usa la formula del catalogo consultor. Copa se deriva del PVP botella con divisor escalonado por precio (Carta Viva).</p>
              </div>
              <span className={styles.badge}>{conCoste.length} con coste · {porRevisar.length} para revisar</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.formGrid}>
              </div>
              <div className={styles.actionRow} style={{ marginTop: 12 }}>
                <button type="button" className={styles.ghost} onClick={guardarCriterio}>Guardar criterio</button>
              </div>
            </div>
          </section>

          <section className={`${styles.panelDark} ${priceStyles.simulator}`}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>Vino nuevo</p>
                <h2 className={styles.panelTitle}>Simular un precio</h2>
                <p className={styles.panelSub}>Prueba una referencia antes de incorporarla a la carta.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <div className={priceStyles.simulatorGrid}>
                <div className={priceStyles.simulatorFields}>
                  <div>
                    <label className={styles.label}>Coste de compra</label>
                    <div className={priceStyles.inputSuffix}>
                      <input className={styles.input} type="number" min="0" step="0.01" value={sim.coste} onChange={e => setSim({ coste: e.target.value })} placeholder="8,50" />
                      <span>€</span>
                    </div>
                  </div>
                </div>
                <div className={priceStyles.results}>
                  <article>
                    <span>Botella calculada</span>
                    <strong>{eur(resultadoSim.botella, 0)}</strong>
                    <small>{resultadoSim.reglaBotella || 'Sin coste'} + IVA + redondeo al euro</small>
                  </article>
                  <article>
                    <span>Copa calculada</span>
                    <strong>{eur(resultadoSim.copa)}</strong>
                    <small>Margen estimado: {Math.round(resultadoSim.margenCopas)}%</small>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Revisar la carta actual</h2>
                <p className={styles.panelSub}>Compara los precios vigentes con el calculo; los cambios se hacen editando las celdas de la tabla.</p>
              </div>
              <span className={styles.badge}>{referencias.length} referencias</span>
            </div>
            <div className={styles.panelBody}>
              <div className={priceStyles.toolbar}>
                <input className={styles.input} value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1) }} placeholder="Buscar vino o bodega..." />
                <select className={styles.select} value={filtro} onChange={e => { setFiltro(e.target.value); setPagina(1) }}>
                  <option value="todos">Todos</option>
                  <option value="revisar">Precios para revisar</option>
                  <option value="sin_coste">Sin coste informado</option>
                </select>
              </div>
              {mensajeConfig && <div className={priceStyles.notice} role="status">{mensajeConfig}</div>}
              <div className={priceStyles.priceList}>
                {referenciasPagina.map(vino => {
                  const rec = calcularPreciosSugeridos(vino.coste_compra, ajustes)
                  const botella = diff(vino.precio_botella, rec.botella)
                  const copa = diff(vino.precio_copa, rec.copa)
                  const sinCoste = !num(vino.coste_compra)
                  return (
                    <article className={`${priceStyles.priceRow} ${priceStyles.priceRowReadOnly}`} key={vino.id}>
                      <div className={priceStyles.wineIdentity}>
                        <strong>{vino.nombre}</strong>
                        <span>{vino.bodega || 'Sin bodega'} · coste {sinCoste ? 'pendiente' : eur(vino.coste_compra)}</span>
                      </div>
                      <div className={priceStyles.comparison}>
                        <span>Botella</span>
                        <strong>{eur(vino.precio_botella, 0)} → {sinCoste ? '—' : eur(rec.botella, 0)}</strong>
                        {!sinCoste && <small data-tone={botella.tono}>{botella.texto}</small>}
                      </div>
                      <div className={priceStyles.comparison}>
                        <span>Copa</span>
                        <strong>{eur(vino.precio_copa)} → {sinCoste ? '—' : eur(rec.copa)}</strong>
                        {!sinCoste && <small data-tone={copa.tono}>{copa.texto}</small>}
                      </div>
                    </article>
                  )
                })}
                {referencias.length === 0 && <div className={styles.empty}>No hay referencias para este filtro.</div>}
              </div>
              {totalPaginas > 1 && (
                <nav className={priceStyles.pagination} aria-label="Paginación de precios">
                  <button type="button" className={styles.ghost} disabled={paginaActual === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>Anterior</button>
                  <div className={priceStyles.pageTabs}>
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(n => (
                      <button type="button" key={n} className={n === paginaActual ? priceStyles.pageActive : priceStyles.pageButton} onClick={() => setPagina(n)} aria-current={n === paginaActual ? 'page' : undefined}>{n}</button>
                    ))}
                  </div>
                  <button type="button" className={styles.ghost} disabled={paginaActual === totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>Siguiente</button>
                </nav>
              )}
            </div>
          </section>
        </>
      )}


      {tab === 'configuracion' && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Configuración económica</h2>
              <p className={styles.panelSub}>Parametros base para el calculo de margenes, copas y precios calculados.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>Tamaño de copa</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {[
                    { ml: 125, label: '125 ml', copas: Number(((trabajando.formato_botella_ml || 750) / 125).toFixed(2)) },
                    { ml: 150, label: '150 ml', copas: Number(((trabajando.formato_botella_ml || 750) / 150).toFixed(2)) },
                  ].map(opcion => {
                    const seleccionado = mlCopaActual === opcion.ml && !esPersonalizado
                    return (
                      <button
                        key={opcion.ml}
                        type="button"
                        style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                          borderColor: seleccionado ? '#9b7430' : '#e0d4bc',
                          background: seleccionado ? '#9b7430' : 'transparent',
                          color: seleccionado ? '#fffaf3' : '#756d63',
                        }}
                        onClick={() => {
                          setMlCopaActual(opcion.ml)
                          setEsPersonalizado(false)
                          setTrabajando(prev => ({ ...prev, copas_por_botella: opcion.copas }))
                        }}
                      >
                        {opcion.label}
                        <span style={{ fontSize: '0.7em', opacity: 0.7, marginLeft: '0.25rem' }}>({opcion.copas} cop)</span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    style={{
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
                      borderColor: esPersonalizado ? '#9b7430' : '#e0d4bc',
                      background: esPersonalizado ? '#9b7430' : 'transparent',
                      color: esPersonalizado ? '#fffaf3' : '#756d63',
                    }}
                    onClick={() => setEsPersonalizado(true)}
                  >
                    Personalizado
                  </button>
                </div>
                {esPersonalizado && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <input
                      className={styles.input}
                      type="number"
                      min="50"
                      max="300"
                      step="5"
                      style={{ width: '80px' }}
                      value={mlPersonalizado}
                      onChange={e => {
                        const ml = Number(e.target.value)
                        setMlPersonalizado(ml)
                        setMlCopaActual(ml)
                        if (ml > 0) {
                          const copas = Number(((trabajando.formato_botella_ml || 750) / ml).toFixed(2))
                          setTrabajando(prev => ({ ...prev, copas_por_botella: copas }))
                        }
                      }}
                    />
                    <span style={{ fontSize: '0.85em', color: 'var(--cv-text-muted)' }}>ml</span>
                    {mlPersonalizado > 0 && (
                      <span style={{ fontSize: '0.8em', opacity: 0.7 }}>
                        → {Number(((trabajando.formato_botella_ml || 750) / mlPersonalizado).toFixed(2))} copas
                      </span>
                    )}
                  </div>
                )}
                <p style={{ fontSize: '0.75em', color: 'var(--cv-text-muted)', marginTop: '0.25rem' }}>
                  {trabajando.copas_por_botella} cop × {100 - (trabajando.merma_copa_pct ?? 10)}% → {Number((trabajando.copas_por_botella * (1 - (trabajando.merma_copa_pct ?? 10) / 100)).toFixed(2))} vendibles
                </p>
              </div>
              <div>
                <label className={styles.label}>Merma copa (%)</label>
                <div className={priceStyles.inputSuffix}>
                  <input className={styles.input} type="number" min="0" max="30" step="1" value={trabajando.merma_copa_pct} onChange={e => setTrabajando(prev => ({ ...prev, merma_copa_pct: num(e.target.value) }))} />
                  <span>%</span>
                </div>
              </div>
              <div>
                <label className={styles.label}>IVA venta (%)</label>
                <div className={priceStyles.inputSuffix}>
                  <input className={styles.input} type="number" min="0" max="25" step="0.1" value={trabajando.iva_venta_pct} onChange={e => setTrabajando(prev => ({ ...prev, iva_venta_pct: num(e.target.value) }))} />
                  <span>%</span>
                </div>
              </div>
              <div>
                <label className={styles.label}>Formato botella (ml)</label>
                <input className={styles.input} type="number" min="100" max="1500" step="1" value={trabajando.formato_botella_ml} onChange={e => setTrabajando(prev => ({ ...prev, formato_botella_ml: num(e.target.value) }))} />
              </div>
              <div>
                <label className={styles.label}>PVP incluye IVA</label>
                <select className={styles.select} value={String(trabajando.pvp_incluye_iva)} onChange={e => setTrabajando(prev => ({ ...prev, pvp_incluye_iva: e.target.value === 'true' }))}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div>
                <label className={styles.label}>Coste incluye IVA</label>
                <select className={styles.select} value={String(trabajando.coste_incluye_iva)} onChange={e => setTrabajando(prev => ({ ...prev, coste_incluye_iva: e.target.value === 'true' }))}>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
            {mensajeConfig && <div className={priceStyles.notice} role="status" style={{ marginTop: 12 }}>{mensajeConfig}</div>}
            <div className={styles.actionRow} style={{ marginTop: 16 }}>
              <button type="button" className={styles.primary} onClick={guardarConfiguracion} disabled={guardandoConfig}>
                {guardandoConfig ? 'Guardando...' : 'Guardar configuración'}
              </button>
              {!apiDisponible && <span className={styles.tiny}>Sin API — se guarda localmente.</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
