'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { maxFechaISO } from '../../lib/actividadReal'
import { aplicarAjustesStock } from '../../lib/stockClient'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import ResponsiveOverlay from '../ResponsiveOverlay'

const VINOS_POR_TANDA = 10

function decimal(valor) {
  return Number(valor) || 0
}

function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function eur(valor) {
  return `${decimal(valor).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
}

function haceDiasISO(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function setConteoSeguro(setConteos, vinoId, valor) {
  const numero = Math.max(0, Number(valor) || 0)
  setConteos(prev => ({ ...prev, [vinoId]: String(numero) }))
}

export default function InventarioSemanal() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [eventos, setEventos] = useState([])
  const [conteos, setConteos] = useState({})
  const [motivos, setMotivos] = useState({})
  const [filtro, setFiltro] = useState('prioridad')
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [soloAjustes, setSoloAjustes] = useState(false)
  const [confirmarAjustes, setConfirmarAjustes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [aplicando, setAplicando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const desdeActividad = rest.actividad_real_desde ? maxFechaISO(haceDiasISO(7), rest.actividad_real_desde) : null
        const [{ data: vinosData }, { data: statsData }] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true).order('nombre'),
          desdeActividad
            ? supabase
              .from('estadisticas')
              .select('*')
              .eq('restaurante_id', rest.id)
              .eq('tipo', 'venta')
              .gte('created_at', desdeActividad)
              .order('created_at', { ascending: false })
            : Promise.resolve({ data: [] })
        ])
        setVinos(vinosData || [])
        setEventos((statsData || []).map(item => ({ ...item, parsed: leerDetalle(item.detalle) })))
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const datos = useMemo(() => {
    const actividad = eventos.reduce((acc, evento) => {
      const id = evento.parsed?.vino_id
      if (!id) return acc
      acc[id] = acc[id] || { ventas: 0, incidencias: 0, dudas: 0 }
      if (evento.parsed?.resultado === 'vendida') acc[id].ventas += 1
      if (['no_stock', 'agotado'].includes(evento.parsed?.resultado)) acc[id].incidencias += 1
      if (['no_convence', 'otra'].includes(evento.parsed?.resultado)) acc[id].dudas += 1
      return acc
    }, {})

    const enriquecidos = vinos.map(vino => {
      const mov = actividad[vino.id] || { ventas: 0, incidencias: 0, dudas: 0 }
      const stock = decimal(vino.stock)
      const minimo = decimal(vino.stock_minimo)
      const coste = decimal(vino.coste_compra)
      const venta = decimal(vino.precio_botella)
      const premium = venta >= 35
      const porCopa = decimal(vino.precio_copa) > 0
      const bajoMinimo = minimo > 0 && stock <= minimo
      const sinCoste = !coste
      const stockAltoSinSalida = stock >= Math.max(8, minimo * 3) && mov.ventas === 0
      const prioridad =
        (bajoMinimo ? 28 : 0) +
        (mov.incidencias ? 26 : 0) +
        (premium ? 16 : 0) +
        (porCopa ? 14 : 0) +
        (mov.ventas ? Math.min(18, mov.ventas * 4) : 0) +
        (stockAltoSinSalida ? 10 : 0) +
        (sinCoste ? 8 : 0)

      return { ...vino, actividad: mov, premium, porCopa, bajoMinimo, sinCoste, stockAltoSinSalida, prioridad }
    }).sort((a, b) => b.prioridad - a.prioridad || a.nombre.localeCompare(b.nombre))

    const filtrados = enriquecidos.filter(vino => {
      if (filtro === 'prioridad') return vino.prioridad > 0
      if (filtro === 'premium') return vino.premium
      if (filtro === 'copa') return vino.porCopa
      if (filtro === 'minimo') return vino.bajoMinimo
      if (filtro === 'incidencias') return vino.actividad.incidencias > 0
      if (filtro === 'sin_coste') return vino.sinCoste
      return true
    })

    const ajustes = enriquecidos
      .map(vino => {
        const valor = conteos[vino.id]
        if (valor === '' || valor === undefined || valor === null) return null
        const contado = Number(valor)
        if (Number.isNaN(contado)) return null
        const stockActual = decimal(vino.stock)
        const diferencia = contado - stockActual
        if (!diferencia) return null
        return {
          vino,
          contado,
          stockActual,
          diferencia,
          coste: diferencia * decimal(vino.coste_compra),
          venta: diferencia * decimal(vino.precio_botella),
          motivo: motivos[vino.id] || 'ajuste'
        }
      })
      .filter(Boolean)

    return { actividad, enriquecidos, filtrados, ajustes }
  }, [vinos, eventos, conteos, motivos, filtro])

  async function aplicarAjustes() {
    if (!restaurante?.id || !datos.ajustes.length) return
    setConfirmarAjustes(false)
    setAplicando(true)
    setMensaje('')

    try {
      const resultados = await aplicarAjustesStock(supabase, {
        restaurante_id: restaurante.id,
        ajustes: datos.ajustes.map(({ vino, contado, diferencia, motivo }) => ({
          vino_id: vino.id,
          modo: 'establecer',
          valor: contado,
          tipo: motivo === 'venta' ? 'venta' : 'ajuste',
          motivo: `Inventario semanal: ${motivo}`,
          registrar_venta: motivo === 'venta' && diferencia < 0,
        })),
      })
      const stockPorVino = new Map(resultados.map(item => [String(item.vino_id), item.stock_nuevo]))
      setVinos(actuales => actuales.map(vino =>
        stockPorVino.has(String(vino.id))
          ? { ...vino, stock: stockPorVino.get(String(vino.id)) }
          : vino
      ))
      setConteos({})
      setMotivos({})
      setMensaje(`${resultados.length} ajustes aplicados.`)
    } catch (error) {
      setMensaje(error.message || 'No se pudieron aplicar los ajustes.')
    } finally {
      setAplicando(false)
    }
  }

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const ajustesPorId = new Set(datos.ajustes.map(ajuste => ajuste.vino.id))
  const vinosInventarioBase = soloAjustes
    ? datos.filtrados.filter(vino => ajustesPorId.has(vino.id))
    : datos.filtrados
  const vinosInventario = vinosInventarioBase.filter(vino => {
    const q = normalizar(busqueda.trim())
    if (!q) return true
    return normalizar([
      vino.nombre,
      vino.bodega,
      vino.proveedor,
      vino.region,
      vino.uva,
    ].filter(Boolean).join(' ')).includes(q)
  })
  const totalPaginas = Math.max(1, Math.ceil(vinosInventario.length / VINOS_POR_TANDA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicioTanda = (paginaActual - 1) * VINOS_POR_TANDA
  const vinosTanda = vinosInventario.slice(inicioTanda, inicioTanda + VINOS_POR_TANDA)
  const revisadosFiltro = vinosInventario.filter(vino =>
    conteos[vino.id] !== '' && conteos[vino.id] !== undefined && conteos[vino.id] !== null
  ).length
  const rangoTanda = vinosInventario.length
    ? `${inicioTanda + 1}-${Math.min(inicioTanda + VINOS_POR_TANDA, vinosInventario.length)}`
    : '0'

  const costeDiferencia = datos.ajustes.reduce((sum, ajuste) => sum + ajuste.coste, 0)
  const ventaDiferencia = datos.ajustes.reduce((sum, ajuste) => sum + ajuste.venta, 0)
  const bajoMinimo = datos.enriquecidos.filter(vino => vino.bajoMinimo).length
  const incidencias = datos.enriquecidos.filter(vino => vino.actividad.incidencias > 0).length
  const sinCoste = datos.enriquecidos.filter(vino => vino.sinCoste).length
  const progreso = vinosInventario.length ? Math.round((revisadosFiltro / vinosInventario.length) * 100) : 0

  const filtros = [
    ['prioridad', 'Revisar primero', datos.enriquecidos.filter(vino => vino.prioridad > 0).length],
    ['minimo', 'Bajo mínimo', bajoMinimo],
    ['incidencias', 'Incidencias', incidencias],
    ['premium', 'Premium', datos.enriquecidos.filter(vino => vino.premium).length],
    ['copa', 'Por copa', datos.enriquecidos.filter(vino => vino.porCopa).length],
    ['sin_coste', 'Sin coste', sinCoste],
    ['todo', 'Todo', datos.enriquecidos.length],
  ]

  return (
    <FeatureGate restaurante={restaurante} feature="inventario" title="Inventario no incluido">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Inventario inteligente"
      title="Revisar solo lo importante"
      subtitle="Una rutina semanal para contar vinos de riesgo, aplicar diferencias y medir el impacto económico sin revisar toda la bodega."
      actions={<button className={styles.primary} onClick={() => setConfirmarAjustes(true)} disabled={aplicando || !datos.ajustes.length}>{aplicando ? 'Aplicando...' : `Aplicar ${datos.ajustes.length} ajustes`}</button>}
      help={{
        title: 'Inventario práctico',
        intro: 'La idea no es contar todo cada día, sino revisar primero las referencias que pueden generar problemas.',
        items: [
          { title: 'Empieza por prioridad', text: 'Bajo mínimo, incidencias, vinos premium y copa tienen más impacto que una lista alfabética.' },
          { title: 'Cuenta y compara', text: 'Rellena solo las unidades contadas cuando haya diferencia real con el stock de la app.' },
          { title: 'Aplica al final', text: 'El botón de aplicar actualiza stock y guarda el movimiento para mantener trazabilidad.' },
          { title: 'Separa motivos', text: 'Venta no registrada, merma, invitacion y ajuste no son lo mismo: solo la venta explica coste asociado a ingreso.' },
        ],
      }}
    >
      {mensaje && <div className={styles.inlineToast} style={{ marginTop: 0 }}><span>{mensaje}</span><button type="button" onClick={() => setMensaje('')}>Cerrar</button></div>}

      <section className={styles.inventoryHero}>
        <div>
          <p className={styles.eyebrow}>Modo conteo rápido</p>
          <h2>Cuenta por impacto, no por alfabeto</h2>
          <p>
            Empieza por bajo mínimo, incidencias, copa y premium. Cada referencia muestra qué revisar,
            cuánto stock declara la app y si la diferencia corresponde a venta, merma, invitacion o ajuste.
          </p>
          <div className={styles.inventoryHeroActions}>
            <button type="button" className={styles.primary} onClick={() => document.getElementById('inventario-conteo')?.scrollIntoView({ behavior: 'smooth' })}>
              Empezar conteo
            </button>
            <button type="button" className={styles.secondary} onClick={() => { setFiltro('minimo'); setPagina(1) }}>
              Bajo mínimo ({bajoMinimo})
            </button>
            <button type="button" className={styles.ghost} onClick={() => { setFiltro('incidencias'); setPagina(1) }}>
              Incidencias ({incidencias})
            </button>
          </div>
        </div>
        <div className={styles.inventoryHeroScore}>
          <strong>{progreso}%</strong>
          <span>{revisadosFiltro} revisados</span>
        </div>
      </section>
      <ResponsiveOverlay
        open={confirmarAjustes}
        onClose={() => !aplicando && setConfirmarAjustes(false)}
        size="modal"
        eyebrow="Confirmar inventario"
        title={`Aplicar ${datos.ajustes.length} ajustes`}
        description="Se actualizará el stock y quedará registrado el motivo de cada diferencia."
        footer={
          <>
            <button type="button" className={styles.ghost} onClick={() => setConfirmarAjustes(false)} disabled={aplicando}>Cancelar</button>
            <button type="button" className={styles.primary} onClick={aplicarAjustes} disabled={aplicando}>{aplicando ? 'Aplicando…' : 'Confirmar ajustes'}</button>
          </>
        }
      >
        <div className={styles.itemStack}>
          {datos.ajustes.slice(0, 8).map(ajuste => (
            <article className={styles.itemCard} key={ajuste.vino.id}>
              <h3 className={styles.sectionTitle}>{ajuste.vino.nombre}</h3>
              <p className={styles.sectionText}>Stock {ajuste.vino.stock || 0} → {ajuste.contado} · {ajuste.motivo}</p>
            </article>
          ))}
          {datos.ajustes.length > 8 && <p className={styles.sectionText}>Y {datos.ajustes.length - 8} ajustes más.</p>}
        </div>
      </ResponsiveOverlay>

      <section className={`${styles.statsGrid} ${styles.inventoryStats}`}>
        <div className={styles.stat}><p className={styles.statValue}>{datos.filtrados.length}</p><p className={styles.statLabel}>Referencias a revisar</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.ajustes.length}</p><p className={styles.statLabel}>Ajustes preparados</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{eur(costeDiferencia)}</p><p className={styles.statLabel}>Diferencia a coste</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{eur(ventaDiferencia)}</p><p className={styles.statLabel}>Diferencia a venta</p></div>
      </section>

      <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Prioridades</h2>
            <p className={styles.panelSub}>El inventario no empieza por la A. Empieza por lo que puede afectar a servicio, margen o compra.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.inventoryFilterGrid}>
            {filtros.map(([id, label, total]) => (
              <button key={id} className={filtro === id ? styles.inventoryFilterActive : styles.inventoryFilter} onClick={() => { setFiltro(id); setPagina(1) }}>
                <span>{label}</span>
                <strong>{total}</strong>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.panel} id="inventario-conteo">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Conteo rápido</h2>
            <p className={styles.panelSub}>Introduce solo las unidades contadas donde haya diferencia o quieras confirmar stock.</p>
          </div>
          <span className={styles.badge}>{vinosInventario.length}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.inventorySearchRow}>
            <label>
              <span className={styles.label}>Buscar vino</span>
              <input
                className={styles.input}
                value={busqueda}
                onChange={event => { setBusqueda(event.target.value); setPagina(1) }}
                placeholder="Nombre, bodega, proveedor, uva o región..."
              />
            </label>
            <label className={styles.bulkSelectAll}>
              <input
                type="checkbox"
                checked={soloAjustes}
                onChange={event => { setSoloAjustes(event.target.checked); setPagina(1) }}
              />
              <span>Solo ajustes preparados ({datos.ajustes.length})</span>
            </label>
          </div>

          <div className={styles.inventoryToolbar}>
            <div>
              <p className={styles.eyebrow}>Progreso de revisión</p>
              <strong>{revisadosFiltro} de {vinosInventario.length} visibles revisados</strong>
            </div>
            <div className={styles.inventoryProgressTrack} aria-label={`Progreso ${progreso}%`}>
              <span style={{ width: `${progreso}%` }} />
            </div>
          </div>

          {vinosInventario.length ? (
            <>
              <div className={styles.inventoryPager}>
                <button type="button" onClick={() => setPagina(Math.max(1, paginaActual - 1))} disabled={paginaActual === 1}>
                  Anterior
                </button>
                <span>Tanda {paginaActual} de {totalPaginas} · {rangoTanda} de {vinosInventario.length}</span>
                <button type="button" onClick={() => setPagina(Math.min(totalPaginas, paginaActual + 1))} disabled={paginaActual === totalPaginas}>
                  Siguiente tanda
                </button>
              </div>

              <div className={styles.itemStack}>
              {vinosTanda.map(vino => {
                const stockActual = decimal(vino.stock)
                const minimo = decimal(vino.stock_minimo)
                const contado = conteos[vino.id]
                const tieneConteo = contado !== '' && contado !== undefined && contado !== null
                const diferencia = tieneConteo ? Number(contado) - stockActual : null
                const stockRatio = minimo > 0 ? Math.min(100, Math.round((stockActual / Math.max(minimo, 1)) * 100)) : 100
                const etiquetas = [
                  vino.bajoMinimo && ['danger', 'Bajo mínimo'],
                  vino.actividad.incidencias > 0 && ['danger', `${vino.actividad.incidencias} incidencias`],
                  vino.actividad.ventas > 0 && ['success', `${vino.actividad.ventas} ventas`],
                  vino.premium && ['info', 'Premium'],
                  vino.porCopa && ['warning', 'Por copa'],
                  vino.sinCoste && ['warning', 'Sin coste']
                ].filter(Boolean)
                return (
                  <article className={styles.inventoryCard} key={vino.id}>
                    <div className={styles.inventoryCardHead}>
                      <div>
                        <h3>{vino.nombre}</h3>
                        <p>
                          {vino.bodega || 'Sin bodega'} · stock app {stockActual} · coste {eur(vino.coste_compra)} · venta {eur(vino.precio_botella)}
                        </p>
                      </div>
                      <span className={`${styles.inventoryDelta} ${diferencia > 0 ? styles.inventoryDeltaPositive : diferencia < 0 ? styles.inventoryDeltaNegative : ''}`}>
                        {!tieneConteo || Number.isNaN(diferencia) ? 'Pendiente' : diferencia > 0 ? `+${diferencia}` : String(diferencia)}
                      </span>
                    </div>

                    <div className={styles.inventoryBadges}>
                      {(etiquetas.length ? etiquetas : [['neutral', 'Revisión general']]).map(([tipo, texto]) => (
                        <span key={texto} className={styles[`inventoryBadge${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}`]}>{texto}</span>
                      ))}
                    </div>

                    <div className={styles.inventoryStockBar}>
                      <div>
                        <span style={{ width: `${stockRatio}%` }} className={vino.bajoMinimo ? styles.inventoryStockDanger : ''} />
                      </div>
                      <p>Stock {stockActual}{minimo > 0 ? ` / mínimo ${minimo}` : ' · sin mínimo definido'}</p>
                    </div>

                    <div className={styles.inventoryCountGrid}>
                      <div>
                        <span className={styles.label}>Stock contado</span>
                        <div className={styles.stepper}>
                          <button type="button" aria-label={`Restar una unidad a ${vino.nombre}`} onClick={() => setConteoSeguro(setConteos, vino.id, (tieneConteo ? Number(contado) : stockActual) - 1)}>-</button>
                          <input
                            className={styles.input}
                            type="number"
                            value={conteos[vino.id] ?? ''}
                            onChange={e => setConteos({ ...conteos, [vino.id]: e.target.value })}
                            placeholder={String(stockActual)}
                          />
                          <button type="button" aria-label={`Sumar una unidad a ${vino.nombre}`} onClick={() => setConteoSeguro(setConteos, vino.id, (tieneConteo ? Number(contado) : stockActual) + 1)}>+</button>
                        </div>
                      </div>
                      <div>
                        <label className={styles.label}>Motivo</label>
                        <select className={styles.select} value={motivos[vino.id] || 'ajuste'} onChange={e => setMotivos({ ...motivos, [vino.id]: e.target.value })}>
                          <option value="ajuste">Ajuste inventario</option>
                          <option value="venta">Venta no registrada</option>
                          <option value="merma">Merma</option>
                          <option value="invitacion">Invitación</option>
                          <option value="cata">Cata interna</option>
                          <option value="error">Error anterior</option>
                        </select>
                      </div>
                      <div className={styles.inventoryQuickButtons}>
                        <button type="button" className={styles.secondary} onClick={() => setConteos(prev => ({ ...prev, [vino.id]: String(stockActual) }))}>
                          Confirmar stock
                        </button>
                        <button type="button" className={styles.ghost} onClick={() => setConteos(prev => {
                          const next = { ...prev }
                          delete next[vino.id]
                          return next
                        })}>
                          Limpiar
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
              </div>

              {totalPaginas > 1 && (
                <div className={styles.inventoryPager}>
                  <button type="button" onClick={() => setPagina(Math.max(1, paginaActual - 1))} disabled={paginaActual === 1}>
                    Anterior
                  </button>
                  <span>Tanda {paginaActual} de {totalPaginas}</span>
                  <button type="button" onClick={() => setPagina(Math.min(totalPaginas, paginaActual + 1))} disabled={paginaActual === totalPaginas}>
                    Siguiente tanda
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className={styles.empty}>
              {soloAjustes ? 'No hay ajustes preparados en este filtro.' : 'No hay vinos en este filtro.'}
            </div>
          )}
        </div>
      </section>
    </ModuleShell>
    </FeatureGate>
  )
}
