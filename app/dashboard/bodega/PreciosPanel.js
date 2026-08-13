'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { calcularPreciosSugeridos } from '../../lib/pricingUtils'
import styles from '../module.module.css'
import priceStyles from '../precios/precios.module.css'

const AJUSTES_INICIALES = { margen: 65, copas: 5 }

const ESCENARIOS_CONFIG = [
  { key: 'prudente',    label: 'Prudente',    margen: 60, descripcion: 'Cambios fáciles de defender, bajo riesgo.' },
  { key: 'equilibrado', label: 'Equilibrado', margen: 63, descripcion: 'Mejora margen y copa sin rediseñar la carta.' },
  { key: 'ambicioso',   label: 'Ambicioso',   margen: 66, descripcion: 'Máxima palanca comercial, requiere seguimiento.' },
]

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

export default function PreciosPanel({ restauranteId, vinos = [], onPreciosActualizados, onAjustesChange }) {
  const [tab, setTab] = useState('precios')
  const [ajustes, setAjustes] = useState(AJUSTES_INICIALES)
  const [sim, setSim] = useState({ coste: '' })
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [guardandoId, setGuardandoId] = useState(null)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (!restauranteId) return
    try {
      const guardados = JSON.parse(window.localStorage.getItem(`precios_margenes_${restauranteId}`) || '{}')
      const next = { ...AJUSTES_INICIALES, ...guardados, copas: num(guardados.copas) || AJUSTES_INICIALES.copas }
      setAjustes(next)
      onAjustesChange?.(next)
    } catch {}
  }, [restauranteId])

  function cambiarAjuste(campo, valor) {
    const next = { ...ajustes, [campo]: valor }
    setAjustes(next)
    setPagina(1)
    if (restauranteId) window.localStorage.setItem(`precios_margenes_${restauranteId}`, JSON.stringify(next))
    onAjustesChange?.(next)
  }

  async function aplicarPrecio(vino) {
    const rec = calcularPreciosSugeridos(vino.coste_compra, ajustes)
    if (!rec.botella || !rec.copa) return
    setGuardandoId(vino.id)
    setMensaje('')
    const cambios = { precio_botella: rec.botella, precio_copa: rec.copa }
    const { error } = await supabase.from('vinos').update(cambios).eq('id', vino.id)
    if (error) {
      setMensaje('No se pudieron aplicar los precios.')
    } else {
      onPreciosActualizados?.({ id: vino.id, ...cambios })
      setMensaje(`Precios actualizados en ${vino.nombre}.`)
    }
    setGuardandoId(null)
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

  const escenarioComparacion = useMemo(() => {
    const muestra = conCoste.slice(0, 5)
    return ESCENARIOS_CONFIG.map(cfg => ({
      ...cfg,
      pvps: muestra.map(v => ({ vino: v, ...calcularPreciosSugeridos(v.coste_compra, { copas: num(ajustes.copas) || 5, margen: cfg.margen }) })),
    }))
  }, [conCoste, ajustes.copas])

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
        <button type="button" style={tabStyle(tab === 'escenarios')} onClick={() => setTab('escenarios')}>Escenarios</button>
      </div>

      {tab === 'precios' && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Criterio de cálculo</h2>
                <p className={styles.panelSub}>Se aplica a la columna PVP sugerido de la tabla de bodega.</p>
              </div>
              <span className={styles.badge}>{conCoste.length} con coste · {porRevisar.length} para revisar</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.formGrid}>
                <div>
                  <label className={styles.label}>Margen bruto objetivo</label>
                  <div className={priceStyles.inputSuffix}>
                    <input className={styles.input} type="number" min="5" max="90" value={ajustes.margen} onChange={e => cambiarAjuste('margen', e.target.value)} />
                    <span>%</span>
                  </div>
                </div>
                <div>
                  <label className={styles.label}>Copas servidas por botella</label>
                  <input className={styles.input} type="number" min="1" max="10" step="1" value={ajustes.copas} onChange={e => cambiarAjuste('copas', e.target.value)} />
                </div>
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
                    <span>Botella recomendada</span>
                    <strong>{eur(resultadoSim.botella, 0)}</strong>
                    <small>Base calculada: {eur(resultadoSim.baseBotella)}</small>
                  </article>
                  <article>
                    <span>Copa recomendada</span>
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
                <p className={styles.panelSub}>Compara los precios vigentes y aplica la recomendación vino a vino.</p>
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
              {mensaje && <div className={priceStyles.notice} role="status">{mensaje}</div>}
              <div className={priceStyles.priceList}>
                {referenciasPagina.map(vino => {
                  const rec = calcularPreciosSugeridos(vino.coste_compra, ajustes)
                  const botella = diff(vino.precio_botella, rec.botella)
                  const copa = diff(vino.precio_copa, rec.copa)
                  const sinCoste = !num(vino.coste_compra)
                  return (
                    <article className={priceStyles.priceRow} key={vino.id}>
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
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={sinCoste || guardandoId === vino.id || (botella.tono === 'ok' && copa.tono === 'ok')}
                        onClick={() => aplicarPrecio(vino)}
                      >
                        {sinCoste ? 'Falta coste' : guardandoId === vino.id ? 'Guardando...' : botella.tono === 'ok' && copa.tono === 'ok' ? 'En precio' : 'Aplicar precios'}
                      </button>
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

      {tab === 'escenarios' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <p className={styles.panelSub} style={{ margin: 0 }}>Compara tres niveles de margen objetivo para orientar la estrategia de precios sin modificar la carta.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {escenarioComparacion.map(({ key, label, margen, descripcion, pvps }) => (
              <div key={key} className={styles.panel} style={{ margin: 0 }}>
                <div className={styles.panelHead} style={{ padding: '14px 16px 10px' }}>
                  <div>
                    <p className={styles.eyebrow}>{label}</p>
                    <h3 className={styles.panelTitle} style={{ fontSize: 20 }}>{margen}%</h3>
                    <p className={styles.panelSub} style={{ fontSize: 11 }}>{descripcion}</p>
                  </div>
                </div>
                {pvps.length > 0 && (
                  <div className={styles.panelBody} style={{ padding: '0 16px 14px' }}>
                    <div style={{ display: 'grid', gap: 5 }}>
                      {pvps.map(({ vino, botella, copa }) => (
                        <div key={vino.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, borderBottom: '1px solid #f0ece4', paddingBottom: 4 }}>
                          <span style={{ color: '#5a524c', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '52%', whiteSpace: 'nowrap' }}>{vino.nombre}</span>
                          <span style={{ color: '#9b7430', fontWeight: 700, whiteSpace: 'nowrap' }}>{eur(botella, 0)} / {eur(copa)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pvps.length === 0 && (
                  <div className={styles.panelBody} style={{ padding: '0 16px 14px' }}>
                    <div className={styles.empty} style={{ padding: 0 }}>Sin referencias con coste.</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Comparar un coste en los tres escenarios</h2>
                <p className={styles.panelSub}>Introduce un coste y ve el PVP recomendado en cada escenario.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label className={styles.label}>Coste de compra</label>
                  <div className={priceStyles.inputSuffix}>
                    <input className={styles.input} type="number" min="0" step="0.01" value={sim.coste} onChange={e => setSim({ coste: e.target.value })} placeholder="8,50" />
                    <span>€</span>
                  </div>
                </div>
                <div>
                  <label className={styles.label}>Copas por botella</label>
                  <input className={styles.input} type="number" min="1" max="10" step="1" value={ajustes.copas} onChange={e => cambiarAjuste('copas', e.target.value)} />
                </div>
              </div>
              {num(sim.coste) > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {ESCENARIOS_CONFIG.map(cfg => {
                    const rec = calcularPreciosSugeridos(sim.coste, { copas: num(ajustes.copas) || 5, margen: cfg.margen })
                    return (
                      <div key={cfg.key} style={{ padding: '12px 14px', border: '1px solid #e0d4bc', borderRadius: 8, background: '#fffaf3' }}>
                        <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 850, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9b7430' }}>{cfg.label} · {cfg.margen}%</p>
                        <p style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 600, color: '#171416' }}>{eur(rec.botella, 0)}</p>
                        <p style={{ margin: 0, fontSize: 12, color: '#756d63' }}>Copa {eur(rec.copa)}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
