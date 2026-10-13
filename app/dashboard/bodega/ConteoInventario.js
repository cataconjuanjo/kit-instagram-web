'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import styles from '../module.module.css'

const MOTIVOS = [
  { value: '',                  label: '— sin motivo —' },
  { value: 'rotura',            label: 'Rotura / defecto' },
  { value: 'invitacion_no_reg', label: 'Invitación no registrada' },
  { value: 'error_anterior',    label: 'Error de conteo anterior' },
  { value: 'venta_no_reg',      label: 'Venta no registrada' },
  { value: 'otro',              label: 'Otro' },
]

function eur(n) {
  if (n == null) return '—'
  return `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function signo(n) {
  if (n == null || n === 0) return null
  return n > 0 ? `+${n}` : String(n)
}

async function apiFetch(path, opts = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

// ── Fila de un vino en el conteo ──────────────────────────────────────────────
function FilaVino({ linea, onGuardar, guardandoId }) {
  const [contado, setContado] = useState(
    linea.contado && linea.stock_contado != null ? String(linea.stock_contado) : ''
  )
  const [motivo, setMotivo] = useState(linea.motivo || '')
  const guardando = guardandoId === linea.vino_id

  const diferencia = contado !== '' && !Number.isNaN(Number(contado))
    ? Number(contado) - linea.stock_teorico
    : null

  function colorDiff(d) {
    if (d == null || d === 0) return {}
    return { color: d > 0 ? '#2e7d32' : '#c0392b', fontWeight: 600 }
  }

  function handleBlur() {
    if (contado === '' && !linea.contado) return
    if (contado === '' && linea.contado) {
      onGuardar(linea.vino_id, null, null, false)
      return
    }
    const val = Number(contado)
    if (Number.isNaN(val) || val < 0) return
    onGuardar(linea.vino_id, Math.round(val), motivo || null, true)
  }

  return (
    <tr style={{ borderBottom: '1px solid #f0ecea' }}>
      <td style={{ padding: '6px 10px', fontSize: 13, fontWeight: 500 }}>
        {linea.vino?.nombre || linea.vino_id}
        {linea.vino?.bodega && <span style={{ color: '#999', fontWeight: 400 }}> · {linea.vino.bodega}</span>}
      </td>
      <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 13, color: '#555' }}>
        {linea.stock_teorico}
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <input
          type="number"
          min="0"
          value={contado}
          onChange={e => setContado(e.target.value)}
          onBlur={handleBlur}
          placeholder="—"
          style={{
            width: 60, textAlign: 'right', padding: '3px 6px',
            border: '1px solid #d4c8be', borderRadius: 5, fontSize: 13,
            background: linea.contado ? '#f0faf2' : '#fff',
          }}
        />
      </td>
      <td style={{ padding: '6px 10px', textAlign: 'right', fontSize: 13, ...colorDiff(diferencia) }}>
        {signo(diferencia) ?? '—'}
      </td>
      <td style={{ padding: '6px 8px' }}>
        <select
          value={motivo}
          onChange={e => { setMotivo(e.target.value) }}
          onBlur={handleBlur}
          disabled={!linea.contado && contado === ''}
          style={{
            fontSize: 12, padding: '3px 6px', border: '1px solid #d4c8be',
            borderRadius: 5, color: motivo ? '#333' : '#aaa',
            background: 'white', maxWidth: 160,
          }}
        >
          {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 12, color: '#aaa' }}>
        {guardando ? '…' : linea.contado ? '✓' : ''}
      </td>
    </tr>
  )
}

// ── Resumen antes de cerrar ────────────────────────────────────────────────────
function Resumen({ lineas }) {
  const contadas = lineas.filter(l => l.contado)
  const diferencias = contadas.filter(l => l.diferencia !== 0 && l.diferencia != null)
  const totalDescuadre = diferencias.reduce((acc, l) => {
    if (l.diferencia == null) return acc
    const coste = l.coste_unitario_snapshot
    return coste != null ? acc + l.diferencia * coste : acc
  }, 0)
  const tieneCosteTodo = diferencias.every(l => l.coste_unitario_snapshot != null)

  return (
    <div style={{ marginTop: 16, padding: 14, background: '#fafaf8', border: '1px solid #e8e2db', borderRadius: 8 }}>
      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Resumen del conteo</p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: '#555' }}>
        <span>Contados: <strong>{contadas.length}</strong> / {lineas.length}</span>
        <span>Con diferencia: <strong>{diferencias.length}</strong></span>
        {diferencias.length > 0 && (
          <span>
            Descuadre valor:{' '}
            <strong style={{ color: Math.abs(totalDescuadre) > 0 ? '#c0392b' : 'inherit' }}>
              {tieneCosteTodo ? eur(totalDescuadre) : '—  (falta coste en algún vino)'}
            </strong>
          </span>
        )}
      </div>
      {diferencias.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Vinos con diferencia:</p>
          {diferencias.map(l => (
            <div key={l.vino_id} style={{ display: 'flex', gap: 12, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0ece8' }}>
              <span style={{ flex: 1 }}>{l.vino?.nombre}</span>
              <span style={{ color: l.diferencia > 0 ? '#2e7d32' : '#c0392b', fontWeight: 600 }}>
                {signo(l.diferencia)} ud
              </span>
              <span style={{ color: '#888' }}>
                {l.coste_unitario_snapshot
                  ? eur(l.diferencia * l.coste_unitario_snapshot)
                  : 'sin coste'}
              </span>
              <span style={{ color: '#aaa' }}>{MOTIVOS.find(m => m.value === l.motivo)?.label || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function ConteoInventario({ restauranteId, onVinosActualizados }) {
  const [estado, setEstado] = useState('cargando') // cargando|vacio|borrador|cerrado
  const [conteo, setConteo] = useState(null)
  const [lineas, setLineas] = useState([])
  const [controlStockDesde, setControlStockDesde] = useState(undefined)
  const [tipoNuevo, setTipoNuevo] = useState(null)
  const [creando, setCreando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [guardandoId, setGuardandoId] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [soloDiferencias, setSoloDiferencias] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)
  const guardandoRef = useRef({})

  useEffect(() => {
    if (restauranteId) cargarEstado()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restauranteId])

  async function cargarEstado() {
    setEstado('cargando')
    setError('')
    try {
      const resp = await apiFetch(`/api/conteos?restaurante_id=${restauranteId}`)
      setControlStockDesde(resp.control_stock_desde ?? null)

      if (resp.borrador) {
        setConteo(resp.borrador)
        await cargarLineas(resp.borrador.id)
        setEstado('borrador')
      } else {
        setEstado('vacio')
        const ultimo = resp.conteos.find(c => c.estado === 'cerrado')
        if (ultimo) setConteo(ultimo)
      }
    } catch (e) {
      setError(e.message)
      setEstado('vacio')
    }
  }

  async function cargarLineas(conteoId) {
    const resp = await apiFetch(`/api/conteos/${conteoId}`)
    setLineas(resp.lineas || [])
  }

  async function crearConteo() {
    if (!tipoNuevo) return
    setCreando(true)
    setError('')
    try {
      const resp = await apiFetch('/api/conteos', {
        method: 'POST',
        body: JSON.stringify({ restaurante_id: restauranteId, tipo: tipoNuevo }),
      })
      setConteo(resp.conteo)
      await cargarLineas(resp.conteo.id)
      setEstado('borrador')
      setTipoNuevo(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreando(false)
    }
  }

  async function guardarLinea(vinoId, stockContado, motivo, contado) {
    if (guardandoRef.current[vinoId]) return
    guardandoRef.current[vinoId] = true
    setGuardandoId(vinoId)
    try {
      const body = contado === false
        ? { vino_id: vinoId, contado: false }
        : { vino_id: vinoId, stock_contado: stockContado, motivo, contado: true }
      await apiFetch(`/api/conteos/${conteo.id}/lineas`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      setLineas(prev => prev.map(l =>
        l.vino_id === vinoId
          ? { ...l, stock_contado: stockContado, motivo: motivo || null, contado: contado !== false, diferencia: contado !== false ? stockContado - l.stock_teorico : null }
          : l
      ))
    } catch (e) {
      setError(e.message)
    } finally {
      guardandoRef.current[vinoId] = false
      setGuardandoId(null)
    }
  }

  async function cerrarConteo() {
    setCerrando(true)
    setError('')
    try {
      const data = await apiFetch(`/api/conteos/${conteo.id}/cerrar`, { method: 'POST' })
      setResultado(data)
      setEstado('cerrado')
      setConfirmar(false)
      if (onVinosActualizados) {
        const stockMap = new Map()
        for (const l of lineas) {
          if (l.contado && l.stock_contado != null) {
            stockMap.set(String(l.vino_id), l.stock_contado)
          }
        }
        onVinosActualizados(stockMap)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setCerrando(false)
    }
  }

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const lineasFiltradas = lineas.filter(l => {
    if (busqueda) {
      const q = busqueda.toLowerCase()
      if (!(l.vino?.nombre || '').toLowerCase().includes(q) &&
          !(l.vino?.bodega || '').toLowerCase().includes(q)) return false
    }
    if (soloDiferencias) {
      return l.contado && l.diferencia !== 0 && l.diferencia != null
    }
    return true
  })

  const contadasCount = lineas.filter(l => l.contado).length
  const esInicial = conteo?.tipo === 'inicial'

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>Bodega</p>
          <h2 className={styles.panelTitle}>Conteo de inventario</h2>
          <p className={styles.panelSub}>
            Compara el stock teórico de la app con el recuento físico de bodega.
            Las diferencias generan ajustes de stock.
          </p>
        </div>
        {estado === 'borrador' && (
          <div className={styles.actionRow} style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#888' }}>{contadasCount}/{lineas.length} contados</span>
            <button
              className={styles.primary}
              onClick={() => setConfirmar(true)}
              disabled={cerrando || contadasCount === 0}
            >
              Cerrar conteo
            </button>
          </div>
        )}
      </div>

      {error && (
        <p style={{ color: '#c0392b', fontSize: 13, padding: '6px 0' }}>{error}</p>
      )}

      <div className={styles.panelBody}>

        {/* ── Cargando ─────────────────────────────────────────── */}
        {estado === 'cargando' && (
          <p className={styles.sectionText}>Cargando…</p>
        )}

        {/* ── Resultado cierre ──────────────────────────────────── */}
        {estado === 'cerrado' && resultado && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#d4edda', borderRadius: 8, border: '1px solid #c3e6cb' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#155724', margin: 0 }}>
              ✓ Conteo cerrado — {resultado.ajustes_aplicados} ajuste(s) aplicado(s)
            </p>
            {esInicial && (
              <p style={{ fontSize: 13, color: '#155724', marginTop: 4 }}>
                El descuento automático de ventas queda activado desde hoy.
              </p>
            )}
          </div>
        )}

        {/* ── Sin conteo / selector de tipo ─────────────────────── */}
        {estado === 'vacio' && (
          <div>
            {controlStockDesde == null && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff8e1', borderRadius: 7, border: '1px solid #ffe082', fontSize: 13, color: '#795548' }}>
                <strong>Primer conteo pendiente.</strong> Hasta que hagas el conteo inicial,
                las ventas del parte no descuentan stock.
              </div>
            )}
            <p className={styles.sectionText} style={{ marginBottom: 12 }}>
              {controlStockDesde
                ? 'No hay conteo en curso. Inicia un conteo periódico para comprobar desviaciones.'
                : 'Haz el conteo inicial para empezar a controlar el stock real de tu bodega.'}
            </p>
            {tipoNuevo == null ? (
              <div className={styles.actionRow}>
                {controlStockDesde == null && (
                  <button className={styles.primary} onClick={() => setTipoNuevo('inicial')}>
                    Conteo inicial
                  </button>
                )}
                <button
                  className={controlStockDesde == null ? styles.secondary : styles.primary}
                  onClick={() => setTipoNuevo('periodico')}
                >
                  Conteo periódico
                </button>
              </div>
            ) : (
              <div style={{ padding: '12px 14px', background: '#fafaf8', borderRadius: 8, border: '1px solid #e8e2db', maxWidth: 480 }}>
                <p style={{ fontSize: 13, marginBottom: 10 }}>
                  {tipoNuevo === 'inicial'
                    ? 'Se creará el conteo inicial. Al cerrarlo se activará el descuento automático de ventas desde ese momento.'
                    : 'Se creará un conteo periódico. Al cerrarlo se ajustará el stock a los valores que cuentes.'}
                </p>
                <div className={styles.actionRow}>
                  <button className={styles.primary} onClick={crearConteo} disabled={creando}>
                    {creando ? 'Creando…' : `Crear conteo ${tipoNuevo}`}
                  </button>
                  <button className={styles.ghost} onClick={() => setTipoNuevo(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Borrador activo ───────────────────────────────────── */}
        {estado === 'borrador' && (
          <div>
            <p className={styles.eyebrow} style={{ marginBottom: 4 }}>
              {esInicial ? 'Conteo inicial' : 'Conteo periódico'} · borrador
            </p>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Buscar vino…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ flex: '1 1 180px', padding: '5px 10px', border: '1px solid #d4c8be', borderRadius: 6, fontSize: 13 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555' }}>
                <input
                  type="checkbox"
                  checked={soloDiferencias}
                  onChange={e => setSoloDiferencias(e.target.checked)}
                />
                Solo diferencias
              </label>
            </div>

            {/* Tabla */}
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f7f3ef', borderBottom: '2px solid #e8e2db' }}>
                    <th style={{ textAlign: 'left',   padding: '7px 10px' }}>Vino</th>
                    <th style={{ textAlign: 'right',  padding: '7px 10px' }}>Teórico</th>
                    <th style={{ textAlign: 'center', padding: '7px 10px' }}>Contado</th>
                    <th style={{ textAlign: 'right',  padding: '7px 10px' }}>Dif.</th>
                    <th style={{ textAlign: 'left',   padding: '7px 10px' }}>Motivo</th>
                    <th style={{ textAlign: 'center', padding: '7px 10px', width: 28 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineasFiltradas.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                          {busqueda || soloDiferencias ? 'Sin resultados con este filtro.' : 'Sin vinos.'}
                        </td>
                      </tr>
                    )
                    : lineasFiltradas.map(l => (
                      <FilaVino
                        key={l.vino_id}
                        linea={l}
                        onGuardar={guardarLinea}
                        guardandoId={guardandoId}
                      />
                    ))
                  }
                </tbody>
              </table>
            </div>

            <Resumen lineas={lineas} />

            {/* Confirmación de cierre */}
            {confirmar && (
              <div style={{ marginTop: 16, padding: '14px 16px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#856404' }}>
                  ¿Cerrar el conteo?
                </p>
                {esInicial && (
                  <p style={{ fontSize: 13, color: '#856404', marginBottom: 8 }}>
                    Esto activará el descuento automático de ventas. Los partes ya cerrados
                    antes de este momento <strong>no</strong> se reaplicarán.
                  </p>
                )}
                <p style={{ fontSize: 13, color: '#856404', marginBottom: 10 }}>
                  Se aplicarán {lineas.filter(l => l.contado && l.diferencia !== 0 && l.diferencia != null).length} ajuste(s).
                  Los vinos sin contar quedan sin cambios.
                </p>
                <div className={styles.actionRow}>
                  <button className={styles.primary} onClick={cerrarConteo} disabled={cerrando}>
                    {cerrando ? 'Cerrando…' : 'Confirmar cierre'}
                  </button>
                  <button className={styles.ghost} onClick={() => setConfirmar(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </section>
  )
}
