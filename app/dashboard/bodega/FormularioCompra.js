'use client'

import { useState, useMemo, useCallback } from 'react'
import { supabase } from '../../supabase'
import styles from '../module.module.css'

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
  return res
}

function r4(n) { return Math.round(n * 10000) / 10000 }
function r2(n) { return Math.round(n * 100) / 100 }

function calcLinea(linea, descGlobal) {
  const uds     = Math.max(0, Number(linea.uds) || 0)
  const bon     = Math.max(0, Number(linea.uds_bonificadas) || 0)
  const tarifa  = Math.max(0, Number(linea.precio_tarifa) || 0)
  const dLin    = Math.max(0, Math.min(99.99, Number(linea.descuento_linea) || 0))
  const dGlob   = Math.max(0, Math.min(99.99, Number(descGlobal) || 0))
  const totUds  = uds + bon
  const neto    = r4(tarifa * uds * (1 - dLin / 100) * (1 - dGlob / 100))
  const netoUd  = totUds > 0 ? r4(neto / totUds) : 0
  return { importe_neto: neto, precio_neto_ud: netoUd }
}

function hoy() {
  return new Date().toLocaleDateString('sv').slice(0, 10) // 'YYYY-MM-DD'
}

function lineaVacia() {
  return { vino_id: '', uds: 1, uds_bonificadas: 0, precio_tarifa: '', descuento_linea: 0 }
}

export default function FormularioCompra({ restauranteId, vinosActivos = [], onCompraRegistrada }) {
  const [proveedor,   setProveedor]   = useState('')
  const [fecha,       setFecha]       = useState(hoy)
  const [numDoc,      setNumDoc]      = useState('')
  const [descGlobal,  setDescGlobal]  = useState(0)
  const [ivaPct,      setIvaPct]      = useState(21)
  const [notas,       setNotas]       = useState('')
  const [lineas,      setLineas]      = useState([lineaVacia()])
  const [enviando,    setEnviando]    = useState(false)
  const [resultado,   setResultado]   = useState(null) // {ok, cabecera_id} | {error}
  // referencia_externa fija por instancia del formulario (anti doble-clic)
  const [refExt]  = useState(() => crypto.randomUUID())
  const [busqueda, setBusqueda]       = useState('')

  const vinosOrdenados = useMemo(
    () => [...vinosActivos].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
    [vinosActivos]
  )

  const totales = useMemo(() => {
    const neto = lineas.reduce((s, l) => s + calcLinea(l, descGlobal).importe_neto, 0)
    const iva  = r2(neto * (Number(ivaPct) || 0) / 100)
    return { neto: r2(neto), iva, total: r2(neto + iva) }
  }, [lineas, descGlobal, ivaPct])

  const setLinea = useCallback((i, campo, valor) => {
    setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l))
  }, [])

  const addLinea = () => setLineas(prev => [...prev, lineaVacia()])
  const removeLinea = i => setLineas(prev => prev.filter((_, idx) => idx !== i))

  const vinosPorId = useMemo(
    () => Object.fromEntries(vinosActivos.map(v => [v.id, v])),
    [vinosActivos]
  )

  const resetForm = () => {
    setProveedor(''); setFecha(hoy()); setNumDoc(''); setDescGlobal(0); setIvaPct(21)
    setNotas(''); setLineas([lineaVacia()]); setResultado(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (enviando) return

    const lineasValidas = lineas.filter(l => l.vino_id && Number(l.uds) > 0 && Number(l.precio_tarifa) >= 0)
    if (!proveedor.trim() || lineasValidas.length === 0) {
      setResultado({ error: 'Completa proveedor y al menos una línea con vino y precio.' })
      return
    }

    setEnviando(true)
    setResultado(null)

    try {
      const res = await apiFetch('/api/compras', {
        method: 'POST',
        body: JSON.stringify({
          restaurante_id: restauranteId,
          cabecera: {
            proveedor:          proveedor.trim(),
            fecha,
            numero_documento:   numDoc.trim() || undefined,
            referencia_externa: refExt,
            descuento_global:   Number(descGlobal) || 0,
            iva_pct:            Number(ivaPct) || 21,
            notas:              notas.trim() || undefined,
            origen:             'manual',
          },
          lineas: lineasValidas.map(l => ({
            vino_id:          l.vino_id,
            uds:              Math.floor(Number(l.uds)),
            uds_bonificadas:  Math.floor(Number(l.uds_bonificadas) || 0),
            precio_tarifa:    Number(l.precio_tarifa),
            descuento_linea:  Number(l.descuento_linea) || 0,
          })),
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        if (json.error === 'already_exists') {
          setResultado({ error: 'Esta compra ya fue registrada (misma referencia de formulario). Si es un reintento, está guardada correctamente.' })
        } else {
          setResultado({ error: json.error || 'Error al registrar la compra.' })
        }
        return
      }

      setResultado({ ok: true, cabecera_id: json.cabecera_id, lineas: json.lineas })
      onCompraRegistrada?.()
    } catch {
      setResultado({ error: 'Error de red. Comprueba la conexión.' })
    } finally {
      setEnviando(false)
    }
  }

  const vinosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return vinosOrdenados
    const q = busqueda.toLowerCase()
    return vinosOrdenados.filter(v =>
      (v.nombre || '').toLowerCase().includes(q) ||
      (v.bodega || '').toLowerCase().includes(q) ||
      (v.proveedor || '').toLowerCase().includes(q)
    )
  }, [vinosOrdenados, busqueda])

  if (resultado?.ok) {
    return (
      <div style={{ padding: '20px 0' }}>
        <p style={{ color: '#4a8c6f', fontWeight: 600, marginBottom: 8 }}>
          Compra registrada correctamente ({resultado.lineas?.length ?? 0} líneas)
        </p>
        <p style={{ color: '#8b8278', fontSize: 13, marginBottom: 16 }}>
          El PMP de cada vino ha sido actualizado.
        </p>
        <div className={styles.actionRow}>
          <button type="button" className={styles.secondary} onClick={resetForm}>
            Nueva compra
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Cabecera ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div>
          <label className={styles.label}>Proveedor *</label>
          <input
            className={styles.input}
            type="text"
            value={proveedor}
            onChange={e => setProveedor(e.target.value)}
            placeholder="Nombre del proveedor"
            required
          />
        </div>
        <div>
          <label className={styles.label}>Fecha *</label>
          <input
            className={styles.input}
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={styles.label}>Nº documento</label>
          <input
            className={styles.input}
            type="text"
            value={numDoc}
            onChange={e => setNumDoc(e.target.value)}
            placeholder="Factura / albarán"
          />
        </div>
        <div>
          <label className={styles.label}>Dto. global %</label>
          <input
            className={styles.input}
            type="number"
            min="0" max="99.99" step="0.01"
            value={descGlobal}
            onChange={e => setDescGlobal(e.target.value)}
          />
        </div>
        <div>
          <label className={styles.label}>IVA %</label>
          <input
            className={styles.input}
            type="number"
            min="0" max="100" step="1"
            value={ivaPct}
            onChange={e => setIvaPct(e.target.value)}
          />
        </div>
        <div>
          <label className={styles.label}>Notas</label>
          <input
            className={styles.input}
            type="text"
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>

      {/* ── Buscador de vino para añadir líneas ─────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <label className={styles.label}>Buscar vino para añadir línea</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.input}
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Nombre, bodega o proveedor…"
            style={{ flex: 1 }}
          />
          {vinosFiltrados.length > 0 && busqueda.trim() && (
            <button
              type="button"
              className={styles.ghost}
              onClick={() => {
                const v = vinosFiltrados[0]
                setLineas(prev => [...prev.filter(l => l.vino_id !== ''), {
                  vino_id: v.id,
                  uds: 1,
                  uds_bonificadas: 0,
                  precio_tarifa: Number(v.coste_compra) > 0 ? v.coste_compra : '',
                  descuento_linea: 0,
                }])
                setBusqueda('')
              }}
            >
              + {vinosFiltrados[0].nombre}
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla de líneas ──────────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #3a3033', color: '#8b8278' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 500 }}>Vino</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>Uds</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>Bon.</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>Tarifa €</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>Dto %</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>P.neto/ud</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>Importe</th>
              <th style={{ padding: '4px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea, i) => {
              const { importe_neto, precio_neto_ud } = calcLinea(linea, descGlobal)
              const vino = vinosPorId[linea.vino_id]
              return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(58,48,51,0.5)' }}>
                  <td style={{ padding: '4px 8px', minWidth: 200 }}>
                    <select
                      className={styles.input}
                      value={linea.vino_id}
                      onChange={e => {
                        const v = vinosPorId[e.target.value]
                        setLinea(i, 'vino_id', e.target.value)
                        if (v && Number(v.coste_compra) > 0 && !Number(linea.precio_tarifa)) {
                          setLinea(i, 'precio_tarifa', v.coste_compra)
                        }
                      }}
                      style={{ fontSize: 12, padding: '3px 6px' }}
                      required
                    >
                      <option value="">— seleccionar vino —</option>
                      {vinosOrdenados.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.nombre}{v.bodega ? ` · ${v.bodega}` : ''}{Number(v.coste_compra) > 0 ? ` · ${Number(v.coste_compra).toFixed(2)}€` : ''}
                        </option>
                      ))}
                    </select>
                    {vino && Number(vino.coste_medio_pmp) > 0 && (
                      <span style={{ fontSize: 11, color: '#6b5f63', marginTop: 2, display: 'block' }}>
                        PMP actual: {Number(vino.coste_medio_pmp).toFixed(4)} €
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input
                      className={styles.input}
                      type="number" min="1" step="1"
                      value={linea.uds}
                      onChange={e => setLinea(i, 'uds', e.target.value)}
                      style={{ width: 56, textAlign: 'center', fontSize: 12, padding: '3px 4px' }}
                      required
                    />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input
                      className={styles.input}
                      type="number" min="0" step="1"
                      value={linea.uds_bonificadas}
                      onChange={e => setLinea(i, 'uds_bonificadas', e.target.value)}
                      style={{ width: 52, textAlign: 'center', fontSize: 12, padding: '3px 4px' }}
                      title="Unidades bonificadas (gratis)"
                    />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input
                      className={styles.input}
                      type="number" min="0" step="0.0001"
                      value={linea.precio_tarifa}
                      onChange={e => setLinea(i, 'precio_tarifa', e.target.value)}
                      style={{ width: 80, textAlign: 'right', fontSize: 12, padding: '3px 6px' }}
                      required
                    />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input
                      className={styles.input}
                      type="number" min="0" max="99.99" step="0.01"
                      value={linea.descuento_linea}
                      onChange={e => setLinea(i, 'descuento_linea', e.target.value)}
                      style={{ width: 60, textAlign: 'right', fontSize: 12, padding: '3px 4px' }}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: Number(linea.precio_tarifa) > 0 ? '#fffaf3' : '#6b5f63', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {Number(linea.precio_tarifa) > 0 ? precio_neto_ud.toFixed(4) : '—'}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: Number(linea.precio_tarifa) > 0 ? '#fffaf3' : '#6b5f63', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                    {Number(linea.precio_tarifa) > 0 ? importe_neto.toFixed(2) : '—'}
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => removeLinea(i)}
                        style={{ background: 'none', border: 'none', color: '#6b5f63', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
                        title="Eliminar línea"
                      >×</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.actionRow} style={{ marginBottom: 20 }}>
        <button type="button" className={styles.ghost} onClick={addLinea}>
          + Añadir línea
        </button>
      </div>

      {/* ── Totales ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 24,
        padding: '12px 0', borderTop: '1px solid #3a3033',
        marginBottom: 20, fontSize: 13,
      }}>
        <span style={{ color: '#8b8278' }}>
          Base imponible: <strong style={{ color: '#fffaf3' }}>{totales.neto.toFixed(2)} €</strong>
        </span>
        <span style={{ color: '#8b8278' }}>
          IVA ({ivaPct}%): <strong style={{ color: '#fffaf3' }}>{totales.iva.toFixed(2)} €</strong>
        </span>
        <span style={{ color: '#8b8278' }}>
          Total: <strong style={{ color: '#4a8c6f', fontSize: 15 }}>{totales.total.toFixed(2)} €</strong>
        </span>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {resultado?.error && (
        <p style={{ color: '#c0393b', fontSize: 13, marginBottom: 12 }}>{resultado.error}</p>
      )}

      {/* ── Submit ───────────────────────────────────────────────────────────── */}
      <div className={styles.actionRow}>
        <button type="submit" className={styles.secondary} disabled={enviando}>
          {enviando ? 'Registrando…' : 'Registrar compra'}
        </button>
      </div>
    </form>
  )
}
