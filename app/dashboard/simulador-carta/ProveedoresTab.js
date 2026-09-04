'use client'

import { useEffect, useRef, useState } from 'react'
import { getProveedorBreakdown, calcularConcentracion } from '../../lib/cartaCoverageUtils'
import simStyles from './simulador.module.css'

const UNIDADES_DEFAULT = 6

function eur(v) {
  if (!Number(v)) return '—'
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// Paleta fija por posición (categoríco, mismo orden siempre)
const COLORES_PROVEEDOR = [
  '#7b4f3a', '#c9a24b', '#4a7a6e', '#8b3a52', '#4a6e8b',
  '#7a6e3a', '#5a3a7a', '#3a7a5a', '#7a3a3a', '#3a5a7a',
]
function colorProveedor(i) {
  return COLORES_PROVEEDOR[i % COLORES_PROVEEDOR.length]
}

// ── Concentración (Feature C) ─────────────────────────────────────────────────
function ConcentracionSection({ lineasEnriquecidas }) {
  const [vistaEstado, setVistaEstado] = useState('simulada')

  const lineasFiltradas = vistaEstado === 'actual'
    ? lineasEnriquecidas.filter(l => l.estado === 'actual' || l.estado === 'fuera')
    : lineasEnriquecidas.filter(l => l.estado === 'actual' || l.estado === 'nuevo')

  const grupos = getProveedorBreakdown(lineasFiltradas)
  const totalRefs = grupos.reduce((s, g) => s + g.totalRefs, 0)
  const conc = calcularConcentracion(grupos, totalRefs)

  const MAXIMO_BARRAS = 8
  const visibles = grupos.slice(0, MAXIMO_BARRAS)
  const resto    = grupos.slice(MAXIMO_BARRAS)
  const refsResto = resto.reduce((s, g) => s + g.totalRefs, 0)
  const [mostrarTodos, setMostrarTodos] = useState(false)

  const coloresSemaforo = { verde: 'var(--cv-green)', ambar: '#d4a017', rojo: 'var(--cv-red)', neutral: '#8a7e72' }

  if (grupos.length === 0) {
    return (
      <div className={simStyles.panelVacioInline}>
        No hay vinos con proveedor asignado en esta vista.
      </div>
    )
  }

  const filasBarra = mostrarTodos ? grupos : [...visibles, refsResto > 0 ? { proveedor: { nombre: 'Otros' }, totalRefs: refsResto, inversionEstimada: 0, _esResto: true } : null].filter(Boolean)

  return (
    <>
      {/* Semáforo */}
      <div className={simStyles.concentracionSemaforo}>
        <span
          className={simStyles.concentracionIndicador}
          style={{ background: coloresSemaforo[conc.nivel] }}
        />
        <span className={simStyles.concentracionEtiqueta}>{conc.etiqueta}</span>
        <span className={simStyles.concentracionDetalle}>
          Top proveedor: {conc.topPct}% · {totalRefs} referencias
        </span>
      </div>

      {/* Toggle actual / simulada */}
      <div className={simStyles.toggleGroup}>
        <button
          type="button"
          className={`${simStyles.toggleBtn} ${vistaEstado === 'actual' ? simStyles.toggleBtnActive : ''}`}
          onClick={() => setVistaEstado('actual')}
        >
          Carta actual
        </button>
        <button
          type="button"
          className={`${simStyles.toggleBtn} ${vistaEstado === 'simulada' ? simStyles.toggleBtnActive : ''}`}
          onClick={() => setVistaEstado('simulada')}
        >
          Carta simulada
        </button>
      </div>

      {/* Barras horizontales */}
      <div className={simStyles.barraWrap}>
        {filasBarra.map((g, i) => {
          const pct = totalRefs > 0 ? Math.round((g.totalRefs / totalRefs) * 100) : 0
          const esResto = g._esResto
          return (
            <div key={g.proveedor.nombre + i} className={simStyles.barraFila}>
              <span className={simStyles.barraNombre} title={g.proveedor.nombre}>
                {g.proveedor.nombre.length > 26 ? g.proveedor.nombre.slice(0, 25) + '…' : g.proveedor.nombre}
              </span>
              <div className={simStyles.barraTrack}>
                <div
                  className={simStyles.barraFill}
                  style={{
                    width: `${pct}%`,
                    background: esResto ? '#c0b89a' : colorProveedor(i),
                  }}
                />
              </div>
              <span className={simStyles.barraPct}>{pct}%</span>
              <span className={simStyles.barraRefs}>{g.totalRefs} ref.</span>
            </div>
          )
        })}
        {resto.length > 0 && !mostrarTodos && (
          <button type="button" className={simStyles.panelToggleBtn} onClick={() => setMostrarTodos(true)}>
            Ver todos los proveedores ({resto.length} más)
          </button>
        )}
      </div>

      {/* Tabla detalle */}
      <div className={simStyles.tableWrap} style={{ marginTop: 16 }}>
        <table className={simStyles.table}>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th className={simStyles.thNum}>Refs.</th>
              <th className={simStyles.thNum}>% total</th>
              <th className={simStyles.thNum}>Inversión est. (6 uds)</th>
              <th>Contacto</th>
            </tr>
          </thead>
          <tbody>
            {(mostrarTodos ? grupos : visibles).map((g, i) => {
              const pct = totalRefs > 0 ? Math.round((g.totalRefs / totalRefs) * 100) : 0
              return (
                <tr key={g.proveedor.id || g.proveedor.nombre}>
                  <td>
                    <span className={simStyles.proveedorDot} style={{ background: colorProveedor(i) }} />
                    {g.proveedor.nombre}
                  </td>
                  <td className={simStyles.tdNum}>{g.totalRefs}</td>
                  <td className={simStyles.tdNum}>{pct}%</td>
                  <td className={simStyles.tdNum}>
                    {g.inversionEstimada > 0 ? eur(g.inversionEstimada) : '—'}
                    {g.sinCoste > 0 && (
                      <span className={simStyles.sinCosteHint}> ({g.sinCoste} sin coste)</span>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--cv-text-muted)' }}>
                    {g.proveedor.contacto || g.proveedor.email || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Pedidos (Feature B) ───────────────────────────────────────────────────────
function PedidosSection({ lineasEnriquecidas, restauranteId, restauranteNombre, token }) {
  const vinosNuevos = lineasEnriquecidas.filter(l => l.estado === 'nuevo')
  const grupos = getProveedorBreakdown(vinosNuevos)

  // Estado local de cantidades (editables) por linea id
  const [cantidades, setCantidades] = useState(() =>
    Object.fromEntries(vinosNuevos.map(l => [l.id, UNIDADES_DEFAULT]))
  )

  // Mensajes editados por proveedor key
  const [mensajes, setMensajes] = useState({})

  // Estado de pedidos persistidos: { [proveedorKey]: { id, estado, enviado_at } }
  const [pedidosDB, setPedidosDB] = useState({})
  const [loadingPedidos, setLoadingPedidos] = useState(true)
  const [guardando, setGuardando] = useState(null)
  const [copiado, setCopiado] = useState(null)
  const [errorGuardando, setErrorGuardando] = useState(null) // { key, msg }

  // Carga pedidos guardados
  useEffect(() => {
    if (!restauranteId) return
    fetch(`/api/simulador/pedidos?restaurante_id=${restauranteId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { pedidos: [] })
      .then(({ pedidos }) => {
        const map = {}
        for (const p of (pedidos || [])) {
          const key = p.proveedor_id || `txt:${p.proveedor_nombre}`
          map[key] = p
        }
        setPedidosDB(map)
        setLoadingPedidos(false)
      })
      .catch(() => setLoadingPedidos(false))
  }, [restauranteId, token])

  // Genera el mensaje de pedido para un grupo
  function generarMensaje(grupo) {
    const lineasGrupo = grupo.lineas
    const items = lineasGrupo
      .map(l => {
        const cant = cantidades[l.id] ?? UNIDADES_DEFAULT
        return `  - ${l.nombre}${l.bodega ? ` (${l.bodega})` : ''} — ${cant} uds`
      })
      .join('\n')

    return `Hola ${grupo.proveedor.nombre},\n\nOs hacemos un pedido de reposición para la nueva carta de ${restauranteNombre || 'nuestro restaurante'}:\n\n${items}\n\nGracias,\n${restauranteNombre || ''}`
  }

  function proveedorKey(grupo) {
    return grupo.proveedor.id || `txt:${grupo.proveedor.nombre}`
  }

  function getMensaje(grupo) {
    const key = proveedorKey(grupo)
    return mensajes[key] !== undefined ? mensajes[key] : generarMensaje(grupo)
  }

  async function guardarYMarcar(grupo, nuevoEstado) {
    const key = proveedorKey(grupo)
    setGuardando(key)
    setErrorGuardando(null)

    const vinos_snapshot = grupo.lineas.map(l => ({
      id: l.id,
      nombre: l.nombre,
      bodega: l.bodega,
      cantidad: cantidades[l.id] ?? UNIDADES_DEFAULT,
      coste_compra: l.coste_compra,
    }))

    const pedidoExistente = pedidosDB[key]

    try {
      // Paso 1: guardar/actualizar el pedido
      const resSave = await fetch('/api/simulador/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          restaurante_id: restauranteId,
          proveedor_id: grupo.proveedor.id || null,
          proveedor_nombre: grupo.proveedor.nombre,
          vinos_snapshot,
          mensaje_final: getMensaje(grupo),
        }),
      })
      const savedJson = await resSave.json()
      if (!resSave.ok) throw new Error(savedJson.error)

      const pedidoId = savedJson.pedido.id

      // Paso 2: actualizar estado si es necesario
      if (nuevoEstado) {
        const resPatch = await fetch('/api/simulador/pedidos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            restaurante_id: restauranteId,
            id: pedidoId,
            estado: nuevoEstado,
          }),
        })
        const patchJson = await resPatch.json()
        if (!resPatch.ok) throw new Error(patchJson.error)
        setPedidosDB(prev => ({ ...prev, [key]: patchJson.pedido }))
      } else {
        setPedidosDB(prev => ({ ...prev, [key]: savedJson.pedido }))
      }
    } catch (err) {
      setErrorGuardando({ key, msg: err?.message || 'Error al guardar el pedido' })
    }

    setGuardando(null)
  }

  async function copiar(grupo) {
    const key = proveedorKey(grupo)
    const texto = getMensaje(grupo)
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(key)
      setTimeout(() => setCopiado(c => c === key ? null : c), 2500)
    } catch { /* clipboard no disponible */ }
  }

  function mailtoLink(grupo) {
    const email = grupo.proveedor.email
    if (!email) return null
    const subject = encodeURIComponent(`Pedido para nueva carta — ${restauranteNombre || ''}`)
    const body = encodeURIComponent(getMensaje(grupo))
    return `mailto:${email}?subject=${subject}&body=${body}`
  }

  if (vinosNuevos.length === 0) {
    return (
      <div className={simStyles.panelVacioInline}>
        No hay vinos nuevos en el borrador. Añade referencias del catálogo del consultor para generar pedidos.
      </div>
    )
  }

  // Grupo "sin proveedor asignado"
  const sinProveedor = grupos.filter(g => !g.proveedor.id && !g.proveedor.nombre)
  const conProveedor = grupos.filter(g => g.proveedor.id || g.proveedor.nombre)

  return (
    <div className={simStyles.pedidosRoot}>
      {conProveedor.map(grupo => {
        const key = proveedorKey(grupo)
        const pedidoDB = pedidosDB[key]
        const yaEnviado = pedidoDB?.estado === 'enviado'
        const mensaje = getMensaje(grupo)
        const mailto = mailtoLink(grupo)

        return (
          <div key={key} className={`${simStyles.pedidoCard} ${yaEnviado ? simStyles.pedidoCardEnviado : ''}`}>
            {/* Cabecera proveedor */}
            <div className={simStyles.pedidoCardHeader}>
              <div>
                <span className={simStyles.pedidoNombreProveedor}>{grupo.proveedor.nombre}</span>
                {grupo.proveedor.contacto && (
                  <span className={simStyles.pedidoContacto}>{grupo.proveedor.contacto}</span>
                )}
                {grupo.proveedor.email && (
                  <span className={simStyles.pedidoEmail}>{grupo.proveedor.email}</span>
                )}
              </div>
              {yaEnviado && (
                <span className={simStyles.pedidoBadgeEnviado}>
                  Enviado {pedidoDB.enviado_at
                    ? new Date(pedidoDB.enviado_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                    : ''}
                </span>
              )}
            </div>

            {/* Lista de vinos con cantidad editable */}
            <div className={simStyles.pedidoVinosList}>
              {grupo.lineas.map(linea => (
                <div key={linea.id} className={simStyles.pedidoVinoFila}>
                  <span className={simStyles.pedidoVinoNombre}>
                    {linea.nombre}
                    {linea.bodega && <span className={simStyles.pedidoVinoBodega}> · {linea.bodega}</span>}
                  </span>
                  <span className={simStyles.pedidoVinoCoste}>
                    {Number(linea.coste_compra) > 0
                      ? `${eur(linea.coste_compra)}/ud`
                      : <span style={{ color: 'var(--cv-text-muted)' }}>sin coste registrado</span>
                    }
                  </span>
                  <div className={simStyles.pedidoCantidadWrap}>
                    <button type="button" className={simStyles.pedidoCantidadBtn}
                      onClick={() => setCantidades(prev => ({ ...prev, [linea.id]: Math.max(1, (prev[linea.id] ?? UNIDADES_DEFAULT) - 1) }))}>−</button>
                    <span className={simStyles.pedidoCantidad}>{cantidades[linea.id] ?? UNIDADES_DEFAULT} uds</span>
                    <button type="button" className={simStyles.pedidoCantidadBtn}
                      onClick={() => setCantidades(prev => ({ ...prev, [linea.id]: (prev[linea.id] ?? UNIDADES_DEFAULT) + 1 }))}>+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Subtotales */}
            <div className={simStyles.pedidoSubtotal}>
              <span>{grupo.totalRefs} referencia{grupo.totalRefs !== 1 ? 's' : ''}</span>
              {grupo.inversionEstimada > 0 && (
                <span>Importe estimado: <strong>{eur(grupo.inversionEstimada)}</strong></span>
              )}
              {grupo.sinCoste > 0 && (
                <span style={{ color: 'var(--cv-text-muted)' }}>
                  {grupo.sinCoste} ref. sin coste registrado — no incluidas en el importe
                </span>
              )}
            </div>

            {/* Mensaje editable */}
            <textarea
              className={simStyles.pedidoTextarea}
              rows={7}
              value={mensaje}
              onChange={e => setMensajes(prev => ({ ...prev, [key]: e.target.value }))}
            />

            {/* Acciones */}
            <div className={simStyles.pedidoAcciones}>
              <button
                type="button"
                className={simStyles.accionBtn}
                onClick={() => copiar(grupo)}
                disabled={guardando === key}
              >
                {copiado === key ? '✓ Copiado' : 'Copiar mensaje'}
              </button>

              {mailto && (
                <a
                  href={mailto}
                  className={simStyles.accionBtn}
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                >
                  Abrir en correo
                </a>
              )}

              {!yaEnviado ? (
                <button
                  type="button"
                  className={`${simStyles.accionBtn} ${simStyles.accionBtnEnviar}`}
                  disabled={guardando === key}
                  onClick={() => guardarYMarcar(grupo, 'enviado')}
                >
                  {guardando === key ? 'Guardando…' : 'Marcar como enviado'}
                </button>
              ) : (
                <button
                  type="button"
                  className={simStyles.accionBtn}
                  style={{ color: 'var(--cv-text-muted)' }}
                  disabled={guardando === key}
                  onClick={() => guardarYMarcar(grupo, 'borrador')}
                >
                  Marcar como no enviado
                </button>
              )}
            </div>
            {errorGuardando?.key === key && (
              <p style={{ color: 'var(--cv-red)', fontSize: 12, marginTop: 6 }}>
                {errorGuardando.msg} — reintentar
              </p>
            )}
          </div>
        )
      })}

      {/* Bloque "sin proveedor asignado" */}
      {sinProveedor.map(grupo => (
        <div key="__sin_proveedor__" className={`${simStyles.pedidoCard} ${simStyles.pedidoCardSinProveedor}`}>
          <div className={simStyles.pedidoCardHeader}>
            <span className={simStyles.pedidoNombreProveedor} style={{ color: 'var(--cv-text-muted)' }}>
              Sin proveedor asignado
            </span>
          </div>
          <p className={simStyles.pedidoSinProveedorHint}>
            Estos vinos no tienen proveedor registrado en el catálogo. Asígnales un proveedor
            en el <strong>Catálogo del consultor</strong> para incluirlos en los pedidos.
          </p>
          <div className={simStyles.pedidoVinosList}>
            {grupo.lineas.map(linea => (
              <div key={linea.id} className={simStyles.pedidoVinoFila}>
                <span className={simStyles.pedidoVinoNombre}>{linea.nombre}
                  {linea.bodega && <span className={simStyles.pedidoVinoBodega}> · {linea.bodega}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab principal Proveedores (C + B) ─────────────────────────────────────────
export default function ProveedoresTab({ lineas, restauranteId, token }) {
  const [lineasEnriquecidas, setLineasEnriquecidas] = useState(null)
  const [restauranteNombre, setRestauranteNombre] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [seccion, setSeccion] = useState('concentracion')

  const lineasKey = useRef(null)

  useEffect(() => {
    const nuevaKey = lineas.map(l => `${l.id}:${l.estado}`).join('|')
    if (nuevaKey === lineasKey.current) return
    lineasKey.current = nuevaKey

    if (!restauranteId) return
    setLoading(true)
    setError(null)

    fetch(`/api/simulador/proveedores-breakdown?restaurante_id=${restauranteId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error || 'Error')))
      .then(({ lineas: enriq, restaurante }) => {
        setLineasEnriquecidas(enriq)
        setRestauranteNombre(restaurante?.nombre || '')
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [lineas, restauranteId, token])

  if (loading) return <div className={simStyles.panelLoading}>Cargando datos de proveedores…</div>
  if (error)   return <div className={simStyles.panelError}>No se pudo cargar: {error}</div>
  if (!lineasEnriquecidas) return null

  return (
    <div className={simStyles.panelRoot}>

      {/* Sub-tabs Concentración / Pedidos */}
      <div className={simStyles.subSubNav}>
        <button
          type="button"
          className={`${simStyles.subSubNavBtn} ${seccion === 'concentracion' ? simStyles.subSubNavBtnActive : ''}`}
          onClick={() => setSeccion('concentracion')}
        >
          Concentración
        </button>
        <button
          type="button"
          className={`${simStyles.subSubNavBtn} ${seccion === 'pedidos' ? simStyles.subSubNavBtnActive : ''}`}
          onClick={() => setSeccion('pedidos')}
        >
          Pedidos a proveedores
          {lineas.filter(l => l.estado === 'nuevo').length > 0 && (
            <span className={simStyles.subSubNavBadge}>
              {lineas.filter(l => l.estado === 'nuevo').length}
            </span>
          )}
        </button>
      </div>

      {seccion === 'concentracion' && (
        <section className={simStyles.panelSeccion}>
          <h3 className={simStyles.panelSeccionTitle}>Concentración por proveedor</h3>
          <p className={simStyles.panelSeccionSub}>
            Distribución de referencias por distribuidor. Detecta dependencias de "todos los huevos en la misma cesta".
          </p>
          <ConcentracionSection lineasEnriquecidas={lineasEnriquecidas} />
        </section>
      )}

      {seccion === 'pedidos' && (
        <section className={simStyles.panelSeccion}>
          <h3 className={simStyles.panelSeccionTitle}>Pedido a proveedores</h3>
          <p className={simStyles.panelSeccionSub}>
            Vinos nuevos del borrador agrupados por proveedor. Edita el mensaje y marca el pedido como enviado.
            El estado persiste aunque recargues la página.
          </p>
          <PedidosSection
            lineasEnriquecidas={lineasEnriquecidas}
            restauranteId={restauranteId}
            restauranteNombre={restauranteNombre}
            token={token}
          />
        </section>
      )}
    </div>
  )
}
