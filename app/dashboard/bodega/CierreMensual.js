'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from '../module.module.css'

function eur(v) {
  return (Number(v) || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + ' €'
}

function mesLabel(mes) {
  if (!mes) return ''
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^./, c => c.toUpperCase())
}

function mesAnterior() {
  const now = new Date()
  const m = now.getMonth()  // 0-indexed
  const y = now.getFullYear()
  if (m === 0) return `${y - 1}-12`
  return `${y}-${String(m).padStart(2, '0')}`
}

function prevMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

function nextMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

function SectionRow({ label }) {
  return (
    <tr>
      <td colSpan={2} style={{ paddingTop: 18, paddingBottom: 4, fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45 }}>
        {label}
      </td>
    </tr>
  )
}

function DataRow({ label, value, strong, dim, color }) {
  return (
    <tr>
      <td style={{ padding: '3px 0 3px 8px', fontSize: 14, fontWeight: strong ? 600 : 400, opacity: dim ? 0.55 : 1 }}>{label}</td>
      <td style={{ padding: '3px 0', textAlign: 'right', fontSize: 14, fontWeight: strong ? 700 : 400, color: color || 'inherit', opacity: dim ? 0.55 : 1, whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )
}

export default function CierreMensual({ restauranteId }) {
  const [mes, setMes] = useState(mesAnterior)
  const [estado, setEstado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cerrando, setCerrando] = useState(false)
  const [reabriendo, setReabriendo] = useState(false)
  const [nuevoConcepto, setNuevoConcepto] = useState('')
  const [nuevoImporte, setNuevoImporte] = useState('')
  const [guardandoGasto, setGuardandoGasto] = useState(false)

  const cargar = useCallback(async () => {
    if (!restauranteId || !mes) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cierres-mes?restaurante_id=${restauranteId}&mes=${mes}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cargar')
      setEstado(json)
    } catch (e) {
      setError(e.message)
      setEstado(null)
    } finally {
      setLoading(false)
    }
  }, [restauranteId, mes])

  useEffect(() => { cargar() }, [cargar])

  const cerrado = estado?.cerrado ?? false
  const datos   = cerrado ? estado?.cierre?.snapshot : estado?.datos

  async function cerrarMes() {
    setCerrando(true)
    setError(null)
    try {
      const res = await fetch('/api/cierres-mes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurante_id: restauranteId, mes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cerrar')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setCerrando(false)
    }
  }

  async function reabrirMes() {
    setReabriendo(true)
    setError(null)
    try {
      const res = await fetch(`/api/cierres-mes/${mes}/reabrir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurante_id: restauranteId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al reabrir')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setReabriendo(false)
    }
  }

  async function guardarGastos(nuevosGastos) {
    const res = await fetch('/api/cierres-mes/gastos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurante_id: restauranteId, mes, gastos: nuevosGastos }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Error al guardar')
  }

  async function añadirGasto(e) {
    e.preventDefault()
    if (!nuevoConcepto.trim() || !nuevoImporte) return
    setGuardandoGasto(true)
    setError(null)
    try {
      const actuales = (datos?.gastos || [])
      await guardarGastos([...actuales, { concepto: nuevoConcepto.trim(), importe: Number(nuevoImporte) }])
      setNuevoConcepto('')
      setNuevoImporte('')
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardandoGasto(false)
    }
  }

  async function eliminarGasto(idx) {
    setGuardandoGasto(true)
    setError(null)
    try {
      const actuales = (datos?.gastos || [])
      await guardarGastos(actuales.filter((_, i) => i !== idx))
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardandoGasto(false)
    }
  }

  const resultadoColor = datos?.resultado == null
    ? 'inherit'
    : datos.resultado >= 0 ? '#4A8C6F' : '#b85454'

  return (
    <div>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Cierre mensual</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <button className={styles.ghost} onClick={() => setMes(prevMes(mes))} style={{ padding: '2px 10px' }}>◄</button>
            <span style={{ fontWeight: 600, minWidth: 150, textAlign: 'center', fontSize: 15 }}>{mesLabel(mes)}</span>
            <button className={styles.ghost} onClick={() => setMes(nextMes(mes))} style={{ padding: '2px 10px' }}>►</button>
          </div>
        </div>
        <div className={styles.actionRow} style={{ alignItems: 'flex-end' }}>
          {cerrado && (
            <span style={{ fontSize: 12, color: '#4A8C6F' }}>
              Cerrado {new Date(estado.cierre.cerrado_en).toLocaleDateString('es-ES')}
            </span>
          )}
          {cerrado && (
            <button className={styles.ghost} onClick={reabrirMes} disabled={reabriendo}>
              {reabriendo ? 'Reabriendo…' : 'Reabrir'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p style={{ color: '#b85454', padding: '6px 0', fontSize: 13 }}>{error}</p>
      )}

      {loading && (
        <p style={{ color: '#8b8278', padding: '16px 0', fontSize: 14 }}>Calculando…</p>
      )}

      {!loading && !datos && !error && (
        <p className={styles.empty}>Sin datos para {mesLabel(mes)}.</p>
      )}

      {!loading && datos && (
        <div className={styles.panelBody}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <SectionRow label="Ventas" />
              <DataRow label="Bruto (con IVA)" value={eur(datos.ventas_bruto)} />
              <DataRow label={`IVA ${datos.iva_pct}%`} value={`− ${eur(datos.ventas_bruto - datos.ventas_neto)}`} dim />
              <DataRow label="Netas (sin IVA)" value={eur(datos.ventas_neto)} strong />

              <SectionRow label="Coste de ventas teórico" />
              <DataRow label="Botellas y copas" value={`− ${eur(datos.coste_ventas_teorico)}`} />
              <DataRow
                label={`Margen bruto${datos.margen_pct != null ? ` (${datos.margen_pct}%)` : ''}`}
                value={eur(datos.margen_bruto)}
                strong
                color={datos.margen_pct == null ? null : datos.margen_pct >= 55 ? '#4A8C6F' : '#b85454'}
              />

              <SectionRow label="Compras" />
              <DataRow label="Compras" value={eur(datos.compras_bruto)} />
              {datos.devoluciones > 0 && (
                <DataRow label="Devoluciones" value={`− ${eur(datos.devoluciones)}`} dim />
              )}
              <DataRow label="Compras netas" value={eur(datos.compras_netas)} strong />

              {datos.salidas_no_venta > 0 && (
                <>
                  <SectionRow label="Salidas no venta" />
                  <DataRow label="Cocina · eventos · roturas" value={`− ${eur(datos.salidas_no_venta)}`} />
                </>
              )}

              <SectionRow label="Diferencias inventario" />
              {datos.diferencias_inventario != null ? (
                <DataRow
                  label="Diferencia física vs teórico"
                  value={`${datos.diferencias_inventario >= 0 ? '+' : '−'} ${eur(Math.abs(datos.diferencias_inventario))}`}
                  color={datos.diferencias_inventario < 0 ? '#b85454' : '#4A8C6F'}
                />
              ) : (
                <DataRow label={datos.aviso_stock || 'Sin conteos en el mes'} value="—" dim />
              )}
            </tbody>
          </table>

          {/* Gastos */}
          <div style={{ marginTop: 20 }}>
            <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45, marginBottom: 10 }}>
              Gastos del mes
            </p>
            {(datos.gastos || []).length === 0 && (
              <p style={{ fontSize: 13, opacity: 0.4, marginBottom: 8 }}>Sin gastos registrados.</p>
            )}
            {(datos.gastos || []).map((g, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 14 }}>{g.concepto}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14 }}>{eur(g.importe)}</span>
                  {!cerrado && (
                    <button
                      className={styles.ghost}
                      onClick={() => eliminarGasto(i)}
                      disabled={guardandoGasto}
                      style={{ padding: '1px 7px', fontSize: 13 }}
                    >×</button>
                  )}
                </div>
              </div>
            ))}
            {datos.gastos_total > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 600, fontSize: 14 }}>
                <span>Total gastos</span>
                <span>− {eur(datos.gastos_total)}</span>
              </div>
            )}
            {!cerrado && (
              <form onSubmit={añadirGasto} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className={styles.input}
                  placeholder="Concepto"
                  value={nuevoConcepto}
                  onChange={e => setNuevoConcepto(e.target.value)}
                  style={{ flex: 2, minWidth: 0 }}
                />
                <input
                  className={styles.input}
                  placeholder="€"
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevoImporte}
                  onChange={e => setNuevoImporte(e.target.value)}
                  style={{ flex: 1, minWidth: 0, maxWidth: 90 }}
                />
                <button
                  type="submit"
                  className={styles.secondary}
                  disabled={guardandoGasto || !nuevoConcepto.trim() || !nuevoImporte}
                >+</button>
              </form>
            )}
          </div>

          {/* Resultado */}
          <div style={{ marginTop: 20, padding: '14px 0', borderTop: '2px solid rgba(255,255,255,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Resultado neto bodega</span>
            <span style={{ fontWeight: 700, fontSize: 20, color: resultadoColor }}>
              {datos.resultado >= 0 ? '' : '− '}{eur(Math.abs(datos.resultado))}
            </span>
          </div>

          {/* Stock valorado */}
          {(datos.stock_inicial != null || datos.stock_final != null) && (
            <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45, marginBottom: 8 }}>
                Stock valorado
              </p>
              {datos.stock_inicial != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, opacity: 0.75 }}>
                  <span>Inicial (sistema)</span>
                  <span>{eur(datos.stock_inicial)}</span>
                </div>
              )}
              {datos.stock_final != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.75 }}>
                  <span>Final (físico)</span>
                  <span>{eur(datos.stock_final)}</span>
                </div>
              )}
            </div>
          )}

          {/* Cobertura warnings */}
          {(datos.cobertura?.sin_coste?.length > 0 || datos.borradores_excluidos > 0) && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(184,134,11,0.10)', borderRadius: 8 }}>
              <p style={{ color: '#b8860b', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Cobertura parcial</p>
              {datos.cobertura.sin_coste?.length > 0 && (
                <p style={{ color: '#8b8278', fontSize: 13 }}>
                  Sin coste: {datos.cobertura.sin_coste.join(', ')}
                </p>
              )}
              {datos.borradores_excluidos > 0 && (
                <p style={{ color: '#8b8278', fontSize: 13 }}>
                  {datos.borradores_excluidos} parte(s) en borrador excluidos
                </p>
              )}
            </div>
          )}

          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.35 }}>
            {datos.partes_incluidos} parte(s) · {datos.desde} → {datos.hasta}
          </p>

          {!cerrado && (
            <div style={{ marginTop: 20 }}>
              <button className={styles.secondary} onClick={cerrarMes} disabled={cerrando}>
                {cerrando ? 'Cerrando…' : 'Cerrar mes'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
