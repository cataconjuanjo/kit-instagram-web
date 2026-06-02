'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

const VINOS_POR_TANDA = 10

function decimal(valor) {
  return Number(valor) || 0
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

export default function InventarioSemanal() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [eventos, setEventos] = useState([])
  const [conteos, setConteos] = useState({})
  const [motivos, setMotivos] = useState({})
  const [filtro, setFiltro] = useState('prioridad')
  const [pagina, setPagina] = useState(1)
  const [soloAjustes, setSoloAjustes] = useState(false)
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
        const [{ data: vinosData }, { data: statsData }] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true).order('nombre'),
          supabase
            .from('estadisticas')
            .select('*')
            .eq('restaurante_id', rest.id)
            .eq('tipo', 'venta')
            .gte('created_at', haceDiasISO(7))
            .order('created_at', { ascending: false })
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
    setAplicando(true)
    setMensaje('')

    for (const ajuste of datos.ajustes) {
      const { vino, contado, stockActual, diferencia, motivo } = ajuste
      const { error } = await supabase.from('vinos').update({ stock: contado }).eq('id', vino.id)
      if (!error) {
        await supabase.from('movimientos_stock').insert([{
          restaurante_id: restaurante.id,
          vino_id: vino.id,
          tipo: motivo === 'venta' ? 'venta' : 'ajuste',
          cantidad: diferencia,
          stock_anterior: stockActual,
          stock_nuevo: contado,
          motivo: `Inventario semanal: ${motivo}`
        }])

        // Si el motivo es "venta no registrada" y hay botellas de menos,
        // registrar en estadísticas para que Rentabilidad las cuente
        if (motivo === 'venta' && diferencia < 0) {
          await supabase.from('estadisticas').insert([{
            restaurante_id: restaurante.id,
            tipo: 'venta',
            detalle: JSON.stringify({
              vino_id: vino.id,
              vino: vino.nombre,
              resultado: 'vendida',
              cantidad: Math.abs(diferencia),
              origen: 'inventario',
            }),
          }])
        }
      }
    }

    setVinos(vinos.map(vino => {
      const ajuste = datos.ajustes.find(item => item.vino.id === vino.id)
      return ajuste ? { ...vino, stock: ajuste.contado } : vino
    }))
    setConteos({})
    setMotivos({})
    setMensaje(`${datos.ajustes.length} ajustes aplicados.`)
    setAplicando(false)
  }

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const ajustesPorId = new Set(datos.ajustes.map(ajuste => ajuste.vino.id))
  const vinosInventario = soloAjustes
    ? datos.filtrados.filter(vino => ajustesPorId.has(vino.id))
    : datos.filtrados
  const totalPaginas = Math.max(1, Math.ceil(vinosInventario.length / VINOS_POR_TANDA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicioTanda = (paginaActual - 1) * VINOS_POR_TANDA
  const vinosTanda = vinosInventario.slice(inicioTanda, inicioTanda + VINOS_POR_TANDA)
  const revisadosFiltro = datos.filtrados.filter(vino =>
    conteos[vino.id] !== '' && conteos[vino.id] !== undefined && conteos[vino.id] !== null
  ).length
  const rangoTanda = vinosInventario.length
    ? `${inicioTanda + 1}-${Math.min(inicioTanda + VINOS_POR_TANDA, vinosInventario.length)}`
    : '0'

  const costeDiferencia = datos.ajustes.reduce((sum, ajuste) => sum + ajuste.coste, 0)
  const ventaDiferencia = datos.ajustes.reduce((sum, ajuste) => sum + ajuste.venta, 0)

  const filtros = [
    ['prioridad', 'Revisar primero'],
    ['minimo', 'Bajo mínimo'],
    ['incidencias', 'Incidencias'],
    ['premium', 'Premium'],
    ['copa', 'Por copa'],
    ['sin_coste', 'Sin coste'],
    ['todo', 'Todo'],
  ]

  return (
    <FeatureGate restaurante={restaurante} feature="inventario" title="Inventario no incluido">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Inventario inteligente"
      title="Revisar solo lo importante"
      subtitle="Una rutina semanal para contar vinos de riesgo, aplicar diferencias y medir el impacto económico sin revisar toda la bodega."
      actions={<button className={styles.primary} onClick={aplicarAjustes} disabled={aplicando || !datos.ajustes.length}>{aplicando ? 'Aplicando...' : `Aplicar ${datos.ajustes.length} ajustes`}</button>}
      help={{
        title: 'Inventario práctico',
        intro: 'La idea no es contar todo cada día, sino revisar primero las referencias que pueden generar problemas.',
        items: [
          { title: 'Empieza por prioridad', text: 'Bajo mínimo, incidencias, vinos premium y copa tienen más impacto que una lista alfabética.' },
          { title: 'Cuenta y compara', text: 'Rellena solo las unidades contadas cuando haya diferencia real con el stock de la app.' },
          { title: 'Aplica al final', text: 'El boton de aplicar actualiza stock y guarda el movimiento para mantener trazabilidad.' },
        ],
      }}
    >
      {mensaje && <div className={styles.empty} style={{ minHeight: 70, marginBottom: 16 }}>{mensaje}</div>}

      <section className={styles.statsGrid}>
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
          <div className={styles.actionRow}>
            {filtros.map(([id, label]) => (
              <button key={id} className={filtro === id ? styles.secondary : styles.ghost} onClick={() => { setFiltro(id); setPagina(1) }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Conteo rápido</h2>
            <p className={styles.panelSub}>Introduce solo las unidades contadas donde haya diferencia o quieras confirmar stock.</p>
          </div>
          <span className={styles.badge}>{datos.filtrados.length}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.inventoryToolbar}>
            <div>
              <p className={styles.eyebrow}>Progreso de revisión</p>
              <strong>{revisadosFiltro} de {datos.filtrados.length} revisados</strong>
            </div>
            <label className={styles.bulkSelectAll}>
              <input
                type="checkbox"
                checked={soloAjustes}
                onChange={event => { setSoloAjustes(event.target.checked); setPagina(1) }}
              />
              <span>Solo ajustes preparados ({datos.ajustes.length})</span>
            </label>
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
                const contado = conteos[vino.id]
                const diferencia = contado === '' || contado === undefined ? null : Number(contado) - decimal(vino.stock)
                return (
                  <article className={styles.itemCard} key={vino.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                        <p className={styles.sectionText}>
                          {vino.bodega || 'Sin bodega'} · stock app {vino.stock || 0} · coste {eur(vino.coste_compra)} · venta {eur(vino.precio_botella)}
                        </p>
                        <p className={styles.tiny}>
                          {[
                            vino.bajoMinimo && 'bajo mínimo',
                            vino.actividad.incidencias > 0 && `${vino.actividad.incidencias} incidencias`,
                            vino.actividad.ventas > 0 && `${vino.actividad.ventas} ventas marcadas`,
                            vino.premium && 'premium',
                            vino.porCopa && 'por copa',
                            vino.sinCoste && 'sin coste'
                          ].filter(Boolean).join(' · ') || 'revisión general'}
                        </p>
                      </div>
                      <span className={styles.badge}>{diferencia === null || Number.isNaN(diferencia) ? 'Pendiente' : diferencia > 0 ? `+${diferencia}` : String(diferencia)}</span>
                    </div>
                    <div className={styles.formGrid} style={{ marginTop: 14 }}>
                      <div>
                        <label className={styles.label}>Stock contado</label>
                        <input className={styles.input} type="number" value={conteos[vino.id] ?? ''} onChange={e => setConteos({ ...conteos, [vino.id]: e.target.value })} placeholder={String(vino.stock || 0)} />
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
