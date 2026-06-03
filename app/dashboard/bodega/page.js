'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { actividadRealDesdeISO } from '../../lib/actividadReal'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

function eur(valor) {
  return `${(Number(valor) || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`
}

function decimal(valor) {
  return Number(valor) || 0
}

function margen(vino) {
  const venta = decimal(vino.precio_botella)
  const coste = decimal(vino.coste_compra)
  if (!venta || !coste) return null
  return Math.round(((venta - coste) / venta) * 100)
}

function margenColor(valor) {
  if (valor == null) return '#8b8278'
  if (valor >= 68) return '#4A8C6F'
  if (valor >= 55) return '#b8860b'
  return '#b85454'
}

export default function ControlBodega() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [incidencias, setIncidencias] = useState([])
  const [eventosSala, setEventosSala] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [editando, setEditando] = useState(null)
  const [mostrarPropuestas, setMostrarPropuestas] = useState(false)
  const [mostrarReferencias, setMostrarReferencias] = useState(false)
  const [pedidoCopiado, setPedidoCopiado] = useState(false)
  const [proveedorCopiado, setProveedorCopiado] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const desdeActividad = actividadRealDesdeISO(rest)
        let ventasQuery = Promise.resolve({ data: [] })
        if (desdeActividad) {
          ventasQuery = supabase.from('estadisticas').select('*').eq('restaurante_id', rest.id).eq('tipo', 'venta').gte('created_at', desdeActividad).order('created_at', { ascending: false }).limit(80)
        }
        const [{ data: vinosData }, { data: propuestasData }, { data: incidenciasData }, { data: movimientosData }] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id).order('nombre'),
          supabase.from('consultor_propuestas').select('*').eq('restaurante_id', rest.id).neq('estado', 'descartada').order('created_at', { ascending: false }),
          ventasQuery,
          supabase.from('movimientos_stock').select('*, vinos(nombre, bodega)').eq('restaurante_id', rest.id).order('created_at', { ascending: false }).limit(10),
        ])
        setVinos(vinosData || [])
        setPropuestas(propuestasData || [])
        setMovimientos(movimientosData || [])
        const eventosVenta = (incidenciasData || []).map(item => {
          try { return { ...item, parsed: JSON.parse(item.detalle || '{}') } } catch { return null }
        }).filter(Boolean)
        setEventosSala(eventosVenta)
        setIncidencias(eventosVenta.filter(item => ['no_stock', 'agotado'].includes(item.parsed?.resultado)))
      }
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    if (window.location.hash !== '#propuestas') return
    window.requestAnimationFrame(() => {
      setMostrarPropuestas(true)
      document.getElementById('propuestas')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [loading, propuestas.length])

  const datos = useMemo(() => {
    const activos = vinos.filter(vino => vino.activo !== false)
    const conCoste = activos.filter(vino => decimal(vino.coste_compra) > 0 && decimal(vino.precio_botella) > 0)
    const valorCoste = activos.reduce((sum, vino) => sum + decimal(vino.stock) * decimal(vino.coste_compra), 0)
    const valorVenta = activos.reduce((sum, vino) => sum + decimal(vino.stock) * decimal(vino.precio_botella), 0)
    const margenMedio = conCoste.length
      ? Math.round(conCoste.reduce((sum, vino) => sum + (margen(vino) || 0), 0) / conCoste.length)
      : null
    const margenPotencial = Math.max(0, valorVenta - valorCoste)
    const bajoMinimo = activos.filter(vino => decimal(vino.stock_minimo) > 0 && decimal(vino.stock) <= decimal(vino.stock_minimo))
    const sinCoste = activos.filter(vino => !decimal(vino.coste_compra))
    const margenBajo = conCoste.filter(vino => (margen(vino) || 0) < 55)
    const sinPrecio = activos.filter(vino => !decimal(vino.precio_botella))
    const sinProveedor = activos.filter(vino => !vino.proveedor)
    const sinStockMinimo = activos.filter(vino => !decimal(vino.stock_minimo))
    const pedido = bajoMinimo.map(vino => {
      const minimo = decimal(vino.stock_minimo)
      const objetivo = Math.max(minimo * 2, minimo + 3)
      return { ...vino, pedir: Math.max(1, objetivo - decimal(vino.stock)) }
    })
    const pedidoPorProveedor = Object.entries(pedido.reduce((acc, vino) => {
      const proveedor = vino.proveedor?.trim() || 'Sin proveedor'
      acc[proveedor] = acc[proveedor] || []
      acc[proveedor].push(vino)
      return acc
    }, {})).sort((a, b) => a[0].localeCompare(b[0]))
    const proveedores = Object.entries(activos.reduce((acc, vino) => {
      const proveedor = vino.proveedor?.trim() || 'Sin proveedor'
      acc[proveedor] = acc[proveedor] || { refs: 0, coste: 0 }
      acc[proveedor].refs += 1
      acc[proveedor].coste += decimal(vino.stock) * decimal(vino.coste_compra)
      return acc
    }, {})).sort((a, b) => b[1].coste - a[1].coste).slice(0, 5)
    const proveedoresExistentes = [...new Set(activos.map(vino => vino.proveedor?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    const ventasPorVino = eventosSala.reduce((acc, evento) => {
      if (evento.parsed?.resultado !== 'vendida') return acc
      const id = evento.parsed?.vino_id
      if (!id) return acc
      acc[id] = (acc[id] || 0) + 1
      return acc
    }, {})
    const sinRotacion = activos
      .filter(vino => decimal(vino.stock) >= Math.max(8, decimal(vino.stock_minimo) * 3) && !ventasPorVino[vino.id])
      .sort((a, b) => (decimal(b.stock) * decimal(b.coste_compra)) - (decimal(a.stock) * decimal(a.coste_compra)))
    const topRotacion = activos
      .map(vino => ({ ...vino, ventasMarcadas: ventasPorVino[vino.id] || 0 }))
      .filter(vino => vino.ventasMarcadas > 0)
      .sort((a, b) => b.ventasMarcadas - a.ventasMarcadas)
      .slice(0, 5)

    return { activos, valorCoste, valorVenta, margenMedio, margenPotencial, bajoMinimo, sinCoste, margenBajo, sinPrecio, sinProveedor, sinStockMinimo, pedido, pedidoPorProveedor, proveedores, proveedoresExistentes, sinRotacion, topRotacion }
  }, [vinos, eventosSala])

  function iniciarEdicion(vino) {
    setError('')
    setEditando({
      id: vino.id,
      coste_compra: vino.coste_compra || '',
      stock_minimo: vino.stock_minimo || '',
      proveedor: vino.proveedor || '',
      referencia_proveedor: vino.referencia_proveedor || '',
      formato_compra: vino.formato_compra || '',
    })
  }

  function editarProveedorDesdePedido(vino) {
    setMostrarReferencias(true)
    iniciarEdicion(vino)
    window.requestAnimationFrame(() => {
      document.getElementById('referencias')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function guardarBodega() {
    if (!editando) return
    setGuardando(true)
    setError('')
    const cambios = {
      coste_compra: parseFloat(editando.coste_compra) || 0,
      stock_minimo: parseInt(editando.stock_minimo, 10) || 0,
      proveedor: editando.proveedor || '',
      referencia_proveedor: editando.referencia_proveedor || '',
      formato_compra: editando.formato_compra || '',
    }
    const { error: updateError } = await supabase.from('vinos').update(cambios).eq('id', editando.id)
    if (updateError) {
      setError('No se pudo guardar el control de bodega.')
    } else {
      setVinos(vinos.map(vino => vino.id === editando.id ? { ...vino, ...cambios } : vino))
      setEditando(null)
    }
    setGuardando(false)
  }

  async function cambiarEstadoPropuesta(propuesta, estado) {
    const { error: updateError } = await supabase
      .from('consultor_propuestas')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', propuesta.id)

    if (!updateError) {
      setPropuestas(propuestas.map(item => item.id === propuesta.id ? { ...item, estado } : item).filter(item => item.estado !== 'descartada'))
    }
  }

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const acciones = [
    incidencias.length > 0 && { texto: `${incidencias.length} incidencias de sala pendientes`, href: '/dashboard/cierre#incidencias' },
    datos.bajoMinimo.length > 0 && { texto: `Preparar pedido de ${datos.bajoMinimo.length} vinos bajo mínimo`, href: '#pedido' },
    datos.sinCoste.length > 0 && { texto: `Completar coste de ${datos.sinCoste.length} referencias`, href: '#referencias' },
    datos.margenBajo.length > 0 && { texto: `Revisar ${datos.margenBajo.length} vinos con margen bajo`, href: '#referencias' },
    datos.sinRotacion.length > 0 && { texto: `Revisar ${datos.sinRotacion.length} vinos con stock alto sin ventas marcadas`, href: '#rotacion' },
    propuestas.length > 0 && { texto: `Valorar ${propuestas.length} propuestas`, href: '#propuestas' },
  ].filter(Boolean)

  async function copiarPedido() {
    if (!datos.pedido.length || typeof navigator === 'undefined') return
    const texto = [
      `Pedido sugerido - ${restaurante?.nombre || 'Carta Viva'}`,
      '',
      ...datos.pedidoPorProveedor.flatMap(([proveedor, vinosProveedor]) => [
        proveedor,
        ...vinosProveedor.map(vino => `- ${vino.nombre}: pedir ${vino.pedir} uds. Stock ${vino.stock || 0}, mínimo ${vino.stock_minimo}`),
        '',
      ]),
    ].join('\n')
    await navigator.clipboard.writeText(texto)
    setPedidoCopiado(true)
    setTimeout(() => setPedidoCopiado(false), 1800)
  }

  function textoPedidoProveedor(proveedor, vinosProveedor) {
    return [
      `Hola, te paso pedido para ${restaurante?.nombre || 'el restaurante'}:`,
      '',
      `Proveedor: ${proveedor}`,
      '',
      ...vinosProveedor.map(vino => {
        const referencia = vino.referencia_proveedor ? ` · ref. ${vino.referencia_proveedor}` : ''
        const formato = vino.formato_compra ? ` · ${vino.formato_compra}` : ''
        return `- ${vino.nombre}${referencia}: ${vino.pedir} uds.${formato}`
      }),
      '',
      'Gracias.',
    ].join('\n')
  }

  async function copiarPedidoProveedor(proveedor, vinosProveedor) {
    if (!vinosProveedor?.length || typeof navigator === 'undefined') return
    await navigator.clipboard.writeText(textoPedidoProveedor(proveedor, vinosProveedor))
    setProveedorCopiado(proveedor)
    setTimeout(() => setProveedorCopiado(''), 1800)
  }

  function abrirWhatsAppProveedor(proveedor, vinosProveedor) {
    const texto = encodeURIComponent(textoPedidoProveedor(proveedor, vinosProveedor))
    window.open(`https://wa.me/?text=${texto}`, '_blank', 'noopener,noreferrer')
  }

  function renderGrupoPedido([proveedor, vinosProveedor]) {
    const faltaProveedor = proveedor === 'Sin proveedor'

    return (
      <article key={proveedor} className={styles.itemCard}>
        <div className={styles.sectionHead} style={{ margin: 0 }}>
          <div>
            <p className={styles.eyebrow}>{vinosProveedor.length} referencias</p>
            <h3 className={styles.sectionTitle}>{faltaProveedor ? `${vinosProveedor.length} vinos no se pueden mandar todavia` : proveedor}</h3>
            {faltaProveedor && (
              <p className={styles.sectionText} style={{ marginTop: 4 }}>
                Falta proveedor. Completalo para que cada referencia entre en el mensaje correcto.
              </p>
            )}
          </div>
          <div className={styles.actionRow}>
            <span className={styles.badge}>{vinosProveedor.reduce((sum, vino) => sum + vino.pedir, 0)} uds.</span>
            {!faltaProveedor && (
              <>
                <button className={styles.ghost} onClick={() => copiarPedidoProveedor(proveedor, vinosProveedor)}>
                  {proveedorCopiado === proveedor ? 'Copiado' : 'Copiar mensaje'}
                </button>
                <button className={styles.ghost} onClick={() => abrirWhatsAppProveedor(proveedor, vinosProveedor)}>
                  Enviar WhatsApp
                </button>
              </>
            )}
          </div>
        </div>
        <div className={styles.itemStack} style={{ marginTop: 12 }}>
          {vinosProveedor.map(vino => (
            <div key={vino.id} className={styles.sectionHead} style={{ margin: 0, paddingTop: 8, borderTop: '1px solid rgba(23,20,22,0.08)' }}>
              <p className={styles.sectionText} style={{ margin: 0 }}>{vino.nombre} - stock {vino.stock || 0} - minimo {vino.stock_minimo}</p>
              <div className={styles.actionRow}>
                <strong className={styles.badge}>Pedir {vino.pedir}</strong>
                {faltaProveedor && (
                  <button className={styles.ghost} onClick={() => editarProveedorDesdePedido(vino)}>
                    Completar proveedor
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </article>
    )
  }

  return (
    <FeatureGate restaurante={restaurante} feature="bodega" title="Bodega no incluida">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Bodega"
      title="Stock, margen y reposición"
      subtitle="Vista operativa: cuánto hay en bodega, qué comprar y qué datos faltan. La edición completa queda plegada."
      actions={<Link className={styles.secondary} href="/dashboard/inventario">Inventario</Link>}
      help={{
        title: 'Qué hacer aquí',
        intro: 'Bodega es la pantalla de control, no la de carga masiva. Sirve para ver riesgos y preparar compras.',
        items: [
          { title: 'Mira urgencias', text: 'Bajo mínimo, margen bajo y datos sin completar son las acciones que más impacto tienen.' },
          { title: 'Prepara pedido', text: 'Usa la lista sugerida como punto de partida antes de hablar con proveedor o consultor.' },
          { title: 'Edita lo necesario', text: 'Coste, proveedor y stock mínimo alimentan margen, reposición e inventario inteligente.' },
        ],
      }}
    >
      {error && <div className={styles.empty} style={{ minHeight: 70, marginBottom: 16, color: '#9b3535' }}>{error}</div>}

      <section className={styles.statsGrid}>
        <div className={styles.stat}><p className={styles.statValue}>{eur(datos.valorCoste)}</p><p className={styles.statLabel}>Valor a coste</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{eur(datos.valorVenta)}</p><p className={styles.statLabel}>Potencial venta</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{eur(datos.margenPotencial)}</p><p className={styles.statLabel}>Margen bruto potencial</p></div>
        <div className={styles.stat}><p className={styles.statValue} style={{ color: margenColor(datos.margenMedio) }}>{datos.margenMedio == null ? '-' : datos.margenMedio}%</p><p className={styles.statLabel}>Margen medio</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.bajoMinimo.length}</p><p className={styles.statLabel}>Bajo mínimo</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{datos.sinRotacion.length}</p><p className={styles.statLabel}>Stock alto sin salida</p></div>
      </section>

      <section className={styles.gridTwo}>
        <div className={styles.panelDark}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Qué mirar ahora</h2>
              <p className={styles.panelSub}>Solo acciones que merecen atención.</p>
            </div>
            <span className={styles.badge}>{acciones.length}</span>
          </div>
          <div className={styles.panelBody}>
            {acciones.length ? (
              <div className={styles.itemStack}>
                {acciones.slice(0, 5).map(accion => (
                  <Link key={accion.texto} href={accion.href} className={styles.itemCard} style={{ background: '#231e20', borderColor: '#3a3033', textDecoration: 'none' }}>
                    <p className={styles.sectionTitle} style={{ color: '#fffaf3' }}>{accion.texto}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className={styles.panelSub}>Sin urgencias de bodega con los datos actuales.</p>
            )}
          </div>
        </div>

        <div className={styles.panel} id="pedido">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Pedido sugerido</h2>
              <p className={styles.panelSub}>Agrupado por proveedor para copiar y pegar a cada distribuidor.</p>
            </div>
            <div className={styles.actionRow}>
              <span className={styles.badge}>{datos.pedido.length}</span>
              {datos.pedido.length > 0 && <button className={styles.ghost} onClick={copiarPedido}>{pedidoCopiado ? 'Copiado' : 'Copiar pedido'}</button>}
            </div>
          </div>
          <div className={styles.panelBody}>
            {datos.pedido.length ? (
              <div className={styles.itemStack}>
                {datos.pedidoPorProveedor.map(renderGrupoPedido)}
              </div>
            ) : (
              <div className={styles.empty}>No hay pedido sugerido ahora.</div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.gridTwo} id="rotacion" style={{ marginTop: 16 }}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Stock alto sin salida</h2>
              <p className={styles.panelSub}>Dinero inmovilizado que conviene destacar, formar o retirar.</p>
            </div>
            <span className={styles.badge}>{datos.sinRotacion.length}</span>
          </div>
          <div className={styles.panelBody}>
            {datos.sinRotacion.length ? (
              <div className={styles.itemStack}>
                {datos.sinRotacion.slice(0, 5).map(vino => (
                  <article key={vino.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                        <p className={styles.sectionText}>{vino.proveedor || 'Sin proveedor'} · stock {vino.stock || 0} · coste inmovilizado {eur(decimal(vino.stock) * decimal(vino.coste_compra))}</p>
                      </div>
                      <span className={styles.badge}>Sin ventas marcadas</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>No hay stock alto sin salida marcada.</div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Referencias con tracción</h2>
              <p className={styles.panelSub}>Vinos que sala está consiguiendo vender o defender.</p>
            </div>
            <span className={styles.badge}>{datos.topRotacion.length}</span>
          </div>
          <div className={styles.panelBody}>
            {datos.topRotacion.length ? (
              <div className={styles.itemStack}>
                {datos.topRotacion.map(vino => (
                  <article key={vino.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                        <p className={styles.sectionText}>{vino.bodega || 'Sin bodega'} · margen {margen(vino) ?? '-'}%</p>
                      </div>
                      <span className={styles.badge}>{vino.ventasMarcadas} ventas</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aún no hay ventas marcadas desde sala.</div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Libro de movimientos</h2>
            <p className={styles.panelSub}>Últimos cambios de stock con motivo y trazabilidad.</p>
          </div>
          <span className={styles.badge}>{movimientos.length}</span>
        </div>
        <div className={styles.panelBody}>
          {movimientos.length ? (
            <div className={styles.itemStack}>
              {movimientos.map(mov => (
                <article key={mov.id} className={styles.itemCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <p className={styles.eyebrow}>{mov.tipo}</p>
                      <h3 className={styles.sectionTitle}>{mov.vinos?.nombre || 'Vino'}</h3>
                      <p className={styles.sectionText}>{mov.motivo || 'Sin motivo'} · {mov.stock_anterior ?? '-'} → {mov.stock_nuevo ?? '-'}</p>
                    </div>
                    <span className={styles.badge}>{mov.cantidad > 0 ? `+${mov.cantidad}` : mov.cantidad}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>Aún no hay movimientos de stock registrados.</div>
          )}
        </div>
      </section>

      <section className={styles.gridTwo} style={{ marginTop: 16 }}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Datos pendientes</h2>
              <p className={styles.panelSub}>Completar esto convierte la bodega en una herramienta fiable.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              <article className={styles.itemCard}><p className={styles.sectionTitle}>{datos.sinCoste.length} vinos sin coste de compra</p></article>
              <article className={styles.itemCard}><p className={styles.sectionTitle}>{datos.sinProveedor.length} vinos sin proveedor</p></article>
              <article className={styles.itemCard}><p className={styles.sectionTitle}>{datos.sinStockMinimo.length} vinos sin stock mínimo</p></article>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Proveedores</h2>
              <p className={styles.panelSub}>Peso aproximado por proveedor.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            {datos.proveedores.length ? (
              <div className={styles.itemStack}>
                {datos.proveedores.map(([proveedor, info]) => (
                  <article className={styles.itemCard} key={proveedor}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{proveedor}</h3>
                        <p className={styles.sectionText}>{info.refs} referencias</p>
                      </div>
                      <span className={styles.badge}>{eur(info.coste)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aún no hay proveedores informados.</div>
            )}
          </div>
        </div>
      </section>

      {propuestas.length > 0 && (
        <section className={`${styles.panelDark} ${styles.notificationFocus}`} id="propuestas" style={{ marginTop: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Propuestas recibidas</h2>
              <p className={styles.panelSub}>Ideas de compra o ajuste listas para decidir.</p>
            </div>
            <button className={styles.secondary} onClick={() => setMostrarPropuestas(!mostrarPropuestas)}>
              {mostrarPropuestas ? 'Ocultar' : `Ver ${propuestas.length}`}
            </button>
          </div>
          {mostrarPropuestas && (
            <div className={styles.panelBody}>
              <div className={styles.itemStack}>
                {propuestas.map(propuesta => (
                  <article key={propuesta.id} className={styles.itemCard} style={{ background: '#231e20', borderColor: '#3a3033' }}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{propuesta.prioridad} · {propuesta.estado}</p>
                        <h3 className={styles.sectionTitle} style={{ color: '#fffaf3' }}>{propuesta.titulo}</h3>
                        <p className={styles.sectionText} style={{ color: 'rgba(255,250,243,0.62)' }}>{[propuesta.vino, propuesta.tipo, propuesta.zona].filter(Boolean).join(' · ') || 'Propuesta'}</p>
                      </div>
                    </div>
                    {propuesta.motivo && <p className={styles.lead} style={{ color: 'rgba(255,250,243,0.72)', marginTop: 12 }}>{propuesta.motivo}</p>}
                    <div className={styles.actionRow} style={{ marginTop: 14 }}>
                      <button className={styles.secondary} onClick={() => cambiarEstadoPropuesta(propuesta, 'interesa')}>Me interesa</button>
                      <button className={styles.ghost} onClick={() => cambiarEstadoPropuesta(propuesta, 'incorporada')}>Incorporada</button>
                      <button className={styles.ghost} onClick={() => cambiarEstadoPropuesta(propuesta, 'descartada')}>Descartar</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className={styles.panel} id="referencias" style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Referencias de bodega</h2>
            <p className={styles.panelSub}>Edición avanzada de coste, proveedor y stock mínimo.</p>
          </div>
          <button className={styles.ghost} onClick={() => setMostrarReferencias(!mostrarReferencias)}>
            {mostrarReferencias ? 'Ocultar' : `Editar ${datos.activos.length}`}
          </button>
        </div>
        {mostrarReferencias && (
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              {datos.activos.map(vino => {
                const m = margen(vino)
                const bajo = decimal(vino.stock_minimo) > 0 && decimal(vino.stock) <= decimal(vino.stock_minimo)
                const isEditing = editando?.id === vino.id
                return (
                  <article key={vino.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                        <p className={styles.sectionText}>{vino.bodega || 'Sin bodega'} · stock {vino.stock || 0} · venta {eur(vino.precio_botella)}</p>
                      </div>
                      <div className={styles.actionRow}>
                        {bajo && <span className={styles.badge}>Bajo mínimo</span>}
                        <span className={styles.badge} style={{ color: margenColor(m) }}>{m == null ? 'Sin margen' : `${m}% margen`}</span>
                        <button className={styles.ghost} onClick={() => isEditing ? setEditando(null) : iniciarEdicion(vino)}>{isEditing ? 'Cerrar' : 'Editar'}</button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className={styles.formGrid} style={{ marginTop: 16 }}>
                        <div>
                          <label className={styles.label}>Coste compra</label>
                          <input className={styles.input} type="number" step="0.01" value={editando.coste_compra} onChange={e => setEditando({ ...editando, coste_compra: e.target.value })} />
                          {parseFloat(editando.coste_compra) > 0 && (
                            <p style={{ margin: '5px 0 0', fontSize: 11, color: '#8b8278' }}>
                              x2 {(parseFloat(editando.coste_compra) * 2).toFixed(2)} EUR · x3 {(parseFloat(editando.coste_compra) * 3).toFixed(2)} EUR
                            </p>
                          )}
                        </div>
                        <div><label className={styles.label}>Stock mínimo</label><input className={styles.input} type="number" value={editando.stock_minimo} onChange={e => setEditando({ ...editando, stock_minimo: e.target.value })} /></div>
                        <div>
                          <label className={styles.label}>Proveedor</label>
                          <input
                            className={styles.input}
                            list="proveedores-bodega"
                            value={editando.proveedor}
                            onChange={e => setEditando({ ...editando, proveedor: e.target.value })}
                          />
                          <datalist id="proveedores-bodega">
                            {datos.proveedoresExistentes.map(proveedor => <option key={proveedor} value={proveedor} />)}
                          </datalist>
                        </div>
                        <div><label className={styles.label}>Referencia proveedor</label><input className={styles.input} value={editando.referencia_proveedor} onChange={e => setEditando({ ...editando, referencia_proveedor: e.target.value })} /></div>
                        <div className={styles.full}><label className={styles.label}>Formato compra</label><input className={styles.input} placeholder="Caja 6, caja 12, unidad..." value={editando.formato_compra} onChange={e => setEditando({ ...editando, formato_compra: e.target.value })} /></div>
                        <div className={styles.full}><button className={styles.primary} onClick={guardarBodega} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar control'}</button></div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </ModuleShell>
    </FeatureGate>
  )
}
