'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { esPerfilSomm } from '../../lib/plans'
import styles from '../module.module.css'
import { GraficoCogsPct } from '../somm-graficos/GraficoCogsPct'
import { construirCierreWorkbook } from '../../lib/excelSomm'
import { descargarWorkbook } from '../../lib/excelSommDownload'

async function authedFetch(path, opts = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  return fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
}

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
  const m = now.getMonth()
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

function variPct(actual, anterior) {
  if (anterior == null || anterior === 0) return null
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
}

function variTag(pct) {
  if (pct == null) return null
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct}%`
}

function SectionRow({ label }) {
  return (
    <tr>
      <td colSpan={3} style={{ paddingTop: 18, paddingBottom: 4, fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45 }}>
        {label}
      </td>
    </tr>
  )
}

function DataRow({ label, value, strong, dim, color, vari }) {
  const tag = variTag(vari)
  const tagColor = vari == null ? null : vari >= 0 ? '#4A8C6F' : '#b85454'
  return (
    <tr>
      <td style={{ padding: '3px 0 3px 8px', fontSize: 14, fontWeight: strong ? 600 : 400, opacity: dim ? 0.55 : 1 }}>{label}</td>
      <td style={{ padding: '3px 0', textAlign: 'right', fontSize: 14, fontWeight: strong ? 700 : 400, color: color || 'inherit', opacity: dim ? 0.55 : 1, whiteSpace: 'nowrap' }}>{value}</td>
      <td style={{ padding: '3px 0 3px 6px', textAlign: 'right', fontSize: 11, color: tagColor || 'transparent', opacity: dim ? 0.55 : 0.8, whiteSpace: 'nowrap', minWidth: 54 }}>
        {tag || ''}
      </td>
    </tr>
  )
}

// ── PDF ────────────────────────────────────────────────────────────────────────

async function generarPDF(datos, datosAnt, mes, restaurante) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210, ML = 14, MR = 14, CW = PW - ML - MR
  let y = 14

  function hdr(txt, size = 11, bold = true) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(40, 40, 40)
    doc.text(txt, ML, y)
    y += size * 0.5 + 2
  }

  function sub(txt) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 100, 100)
    doc.text(txt, ML, y)
    y += 5
  }

  function sep() {
    doc.setDrawColor(200, 200, 200)
    doc.line(ML, y, PW - MR, y)
    y += 3
  }

  function tabla(headers, rows, colWidths) {
    const ROW_H = 6, HEADER_H = 7
    doc.setFillColor(245, 245, 245)
    doc.rect(ML, y, CW, HEADER_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(60, 60, 60)
    let x = ML + 2
    headers.forEach((h, i) => {
      doc.text(String(h), x, y + 4.5, { align: i > 0 ? 'right' : 'left', maxWidth: colWidths[i] - 2 })
      x += colWidths[i]
    })
    y += HEADER_H
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    rows.forEach((row, ri) => {
      if (y > 270) { doc.addPage(); y = 14 }
      if (ri % 2 === 1) {
        doc.setFillColor(252, 252, 252)
        doc.rect(ML, y, CW, ROW_H, 'F')
      }
      doc.setTextColor(40, 40, 40)
      let cx = ML + 2
      row.forEach((cell, ci) => {
        doc.text(String(cell ?? ''), cx, y + 4, { align: ci > 0 ? 'right' : 'left', maxWidth: colWidths[ci] - 2 })
        cx += colWidths[ci]
      })
      y += ROW_H
    })
    doc.setDrawColor(210, 210, 210)
    doc.rect(ML, y - rows.length * ROW_H - HEADER_H, CW, rows.length * ROW_H + HEADER_H, 'S')
    y += 4
  }

  function vTag(actual, anterior) {
    if (anterior == null || anterior === 0) return ''
    const p = Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
    return `${p >= 0 ? '+' : ''}${p}%`
  }

  // Cabecera
  doc.setFillColor(30, 30, 30)
  doc.rect(0, 0, PW, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(restaurante?.nombre || 'Restaurante', ML, 10)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Cierre mensual de bodega · ${mesLabel(mes)}`, ML, 17)
  y = 28

  sub(`${datos.partes_incluidos} partes · ${datos.desde} → ${datos.hasta}${datos.borradores_excluidos > 0 ? ` · ${datos.borradores_excluidos} borrador(es) excluido(s)` : ''}`)
  sep()

  hdr('Ventas', 10)
  tabla(
    ['Concepto', 'Valor', 'vs mes ant.'],
    [
      ['Bruto (con IVA)',       eur(datos.ventas_bruto),  vTag(datos.ventas_bruto, datosAnt?.ventas_bruto)],
      [`IVA ${datos.iva_pct}%`, `− ${eur(datos.ventas_bruto - datos.ventas_neto)}`, ''],
      ['Netas (sin IVA)',       eur(datos.ventas_neto),   vTag(datos.ventas_neto, datosAnt?.ventas_neto)],
    ],
    [90, 52, 40]
  )

  hdr('Coste de ventas', 10)
  tabla(
    ['Concepto', 'Valor', 'vs mes ant.'],
    [
      ['Coste teórico (botellas + copas)', `− ${eur(datos.coste_ventas_teorico)}`, vTag(datos.coste_ventas_teorico, datosAnt?.coste_ventas_teorico)],
      [`Margen bruto${datos.margen_pct != null ? ` (${datos.margen_pct}%)` : ''}`, eur(datos.margen_bruto), vTag(datos.margen_bruto, datosAnt?.margen_bruto)],
    ],
    [110, 40, 32]
  )

  hdr('Compras', 10)
  const comprasRows = [
    ['Compras brutas',  eur(datos.compras_bruto),  vTag(datos.compras_bruto, datosAnt?.compras_bruto)],
  ]
  if (datos.devoluciones > 0) comprasRows.push(['Devoluciones', `− ${eur(datos.devoluciones)}`, ''])
  comprasRows.push(['Compras netas', eur(datos.compras_netas), vTag(datos.compras_netas, datosAnt?.compras_netas)])
  tabla(['Concepto', 'Valor', 'vs mes ant.'], comprasRows, [90, 52, 40])

  hdr('Diferencias inventario', 10)
  if (datos.diferencias_inventario != null) {
    const d = datos.diferencias_inventario
    tabla(['Concepto', 'Valor', ''],
      [['Diferencia física vs teórico', `${d >= 0 ? '+' : '−'} ${eur(Math.abs(d))}`, '']],
      [90, 52, 40]
    )
  } else {
    sub(datos.aviso_stock || 'Sin conteos en el mes')
    y += 2
  }

  if ((datos.gastos || []).length > 0) {
    hdr('Gastos del mes', 10)
    tabla(['Concepto', 'Importe', ''],
      [...datos.gastos.map(g => [g.concepto, eur(g.importe), '']), ['TOTAL', eur(datos.gastos_total), '']],
      [110, 52, 20]
    )
  }

  sep()
  const signo = datos.resultado >= 0 ? '' : '− '
  hdr(`Resultado neto bodega: ${signo}${eur(Math.abs(datos.resultado))}`, 12)
  if (datosAnt?.resultado != null) {
    const antSigno = datosAnt.resultado >= 0 ? '' : '− '
    sub(`Mes anterior: ${antSigno}${eur(Math.abs(datosAnt.resultado))}  ${vTag(datos.resultado, datosAnt.resultado)}`)
  }

  const totalPags = doc.getNumberOfPages()
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(160, 160, 160)
    doc.text(`Carta Viva · ${new Date().toLocaleDateString('es-ES')} · Pág. ${p}/${totalPags}`, PW / 2, 292, { align: 'center' })
  }

  doc.save(`cierre-mensual-${mes}.pdf`)
}

// ── Excel ──────────────────────────────────────────────────────────────────────

async function generarExcel(datos, mes, restaurante) {
  // Delegamos en la spec pura de app/lib/excelSomm.js, que ya incluye
  // la hoja Vinos (informe.por_vino con TOTAL en fórmulas SUM) y el
  // Resumen económico. ExcelJS vía dynamic import.
  const spec = construirCierreWorkbook({
    datos, mes, restauranteNombre: restaurante?.nombre,
  })
  await descargarWorkbook(spec)
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function CierreMensual({ restauranteId, restaurante }) {
  const [mes, setMes] = useState(mesAnterior)
  const [estado, setEstado] = useState(null)
  const [datosMesAnt, setDatosMesAnt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cerrando, setCerrando] = useState(false)
  const [reabriendo, setReabriendo] = useState(false)
  const [conflicto, setConflicto] = useState(null)
  const [nuevoConcepto, setNuevoConcepto] = useState('')
  const [nuevoImporte, setNuevoImporte] = useState('')
  const [guardandoGasto, setGuardandoGasto] = useState(false)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const [exportandoXLS, setExportandoXLS] = useState(false)

  const cargar = useCallback(async () => {
    if (!restauranteId || !mes) return
    setLoading(true)
    setError(null)
    try {
      const [resActual, resAnt] = await Promise.all([
        authedFetch(`/api/cierres-mes?restaurante_id=${restauranteId}&mes=${mes}`),
        authedFetch(`/api/cierres-mes?restaurante_id=${restauranteId}&mes=${prevMes(mes)}`),
      ])
      const jsonActual = await resActual.json()
      if (!resActual.ok) throw new Error(jsonActual.error || 'Error al cargar')
      setEstado(jsonActual)

      if (resAnt.ok) {
        const jsonAnt = await resAnt.json()
        setDatosMesAnt(jsonAnt.cerrado ? jsonAnt.cierre?.snapshot : jsonAnt.datos)
      } else {
        setDatosMesAnt(null)
      }
    } catch (e) {
      setError(e.message)
      setEstado(null)
      setDatosMesAnt(null)
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
    setConflicto(null)
    try {
      const res = await authedFetch('/api/cierres-mes', {
        method: 'POST',
        body: JSON.stringify({ restaurante_id: restauranteId, mes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cerrar')
      if (json.conflicto) setConflicto(json.conflicto)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setCerrando(false)
    }
  }

  async function usarValoresCierre() {
    setError(null)
    try {
      const res = await authedFetch('/api/cierres-mes', {
        method: 'PATCH',
        body: JSON.stringify({ restaurante_id: restauranteId, mes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al actualizar')
      setConflicto(null)
    } catch (e) {
      setError(e.message)
    }
  }

  async function reabrirMes() {
    setReabriendo(true)
    setError(null)
    try {
      const res = await authedFetch(`/api/cierres-mes/${mes}/reabrir`, {
        method: 'POST',
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
    const res = await authedFetch('/api/cierres-mes/gastos', {
      method: 'PATCH',
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

  async function exportarPDF() {
    if (!datos) return
    setExportandoPDF(true)
    try { await generarPDF(datos, datosMesAnt, mes, restaurante) }
    catch (e) { setError(e.message) }
    finally { setExportandoPDF(false) }
  }

  async function exportarExcel() {
    if (!datos) return
    setExportandoXLS(true)
    try { await generarExcel(datos, mes, restaurante) }
    catch (e) { setError(e.message) }
    finally { setExportandoXLS(false) }
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
        <div className={styles.actionRow} style={{ alignItems: 'flex-end', gap: 8 }}>
          {datos && !loading && (
            <>
              <button className={styles.ghost} onClick={exportarPDF} disabled={exportandoPDF} style={{ fontSize: 12 }}>
                {exportandoPDF ? 'Generando…' : 'PDF'}
              </button>
              <button className={styles.ghost} onClick={exportarExcel} disabled={exportandoXLS} style={{ fontSize: 12 }}>
                {exportandoXLS ? 'Generando…' : 'Excel'}
              </button>
            </>
          )}
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
              <DataRow label="Bruto (con IVA)" value={eur(datos.ventas_bruto)} vari={variPct(datos.ventas_bruto, datosMesAnt?.ventas_bruto)} />
              <DataRow label={`IVA ${datos.iva_pct}%`} value={`− ${eur(datos.ventas_bruto - datos.ventas_neto)}`} dim />
              <DataRow label="Netas (sin IVA)" value={eur(datos.ventas_neto)} strong vari={variPct(datos.ventas_neto, datosMesAnt?.ventas_neto)} />

              <SectionRow label="Coste de ventas teórico" />
              <DataRow label="Botellas y copas" value={`− ${eur(datos.coste_ventas_teorico)}`} vari={variPct(datos.coste_ventas_teorico, datosMesAnt?.coste_ventas_teorico)} />
              <DataRow
                label={`Margen bruto${datos.margen_pct != null ? ` (${datos.margen_pct}%)` : ''}`}
                value={eur(datos.margen_bruto)}
                strong
                color={datos.margen_pct == null ? null : datos.margen_pct >= 55 ? '#4A8C6F' : '#b85454'}
                vari={variPct(datos.margen_bruto, datosMesAnt?.margen_bruto)}
              />

              <SectionRow label="Compras" />
              <DataRow label="Compras" value={eur(datos.compras_bruto)} vari={variPct(datos.compras_bruto, datosMesAnt?.compras_bruto)} />
              {datos.devoluciones > 0 && (
                <DataRow label="Devoluciones" value={`− ${eur(datos.devoluciones)}`} dim />
              )}
              <DataRow label="Compras netas" value={eur(datos.compras_netas)} strong vari={variPct(datos.compras_netas, datosMesAnt?.compras_netas)} />

              {datos.salidas_no_venta > 0 && (
                <>
                  <SectionRow label="Salidas no venta" />
                  <DataRow label="Cocina · eventos · roturas" value={`− ${eur(datos.salidas_no_venta)}`} />
                </>
              )}

              {datos.merma_copa_eur > 0 && (
                <>
                  <SectionRow label="Merma copa" />
                  <DataRow
                    label="Copas descartadas (botellas cerradas)"
                    value={`− ${eur(datos.merma_copa_eur)}`}
                    color="#b85454"
                    vari={variPct(datos.merma_copa_eur, datosMesAnt?.merma_copa_eur)}
                  />
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
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              {esPerfilSomm(restaurante) ? 'Resultado antes de comisiones bancarias' : 'Resultado neto bodega'}
            </span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 700, fontSize: 20, color: resultadoColor }}>
                {datos.resultado >= 0 ? '' : '− '}{eur(Math.abs(datos.resultado))}
              </span>
              {variPct(datos.resultado, datosMesAnt?.resultado) != null && (
                <div style={{ fontSize: 12, marginTop: 2, color: variPct(datos.resultado, datosMesAnt?.resultado) >= 0 ? '#4A8C6F' : '#b85454', opacity: 0.8 }}>
                  {variTag(variPct(datos.resultado, datosMesAnt?.resultado))} vs {mesLabel(prevMes(mes))}
                </div>
              )}
            </div>
          </div>

          {/* Stock valorado */}
          {(datos.stock_inicial != null || datos.stock_final != null) && (
            <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45, marginBottom: 8 }}>
                Stock valorado (conteos)
              </p>
              {datos.stock_inicial != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, opacity: 0.75 }}>
                  <span>Inicial (1.er conteo del mes)</span>
                  <span>{eur(datos.stock_inicial)}</span>
                </div>
              )}
              {datos.stock_final != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.75 }}>
                  <span>{datos.diferencias_inventario != null ? 'Final (último conteo del mes)' : 'Final (valoración de inventario)'}</span>
                  <span>{eur(datos.stock_final)}</span>
                </div>
              )}
              <p style={{ fontSize: 11, opacity: 0.35, marginTop: 6 }}>
                Base: uds. contadas × coste snapshot · La cifra «Valor a coste» de la cabecera usa stock teórico × coste medio (PMP), con fallback a coste_compra.
              </p>
            </div>
          )}

          {/* Rendimiento por copa — B4 */}
          {datos.rendimiento_copa?.length > 0 && (
            <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45, marginBottom: 8 }}>
                Rendimiento copa (botellas cerradas)
              </p>
              {datos.rendimiento_copa.map(r => (
                <div key={r.vino_id} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.85 }}>
                    <span>{r.nombre}</span>
                    <span style={{ color: r.rendimiento_pct != null && r.rendimiento_pct < 90 ? '#b85454' : '#4A8C6F' }}>
                      {r.rendimiento_pct != null ? `${r.rendimiento_pct}%` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.5 }}>
                    <span>{r.botellas} bot. · {r.copas_reales} / {r.copas_teoricas} copas</span>
                    {r.merma_eur > 0 && <span style={{ color: '#b85454' }}>−{r.merma_eur.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>}
                  </div>
                </div>
              ))}
              <p style={{ fontSize: 11, opacity: 0.35, marginTop: 6 }}>
                Copas reales / teóricas (copas_por_botella × (1−merma)). Merma en € = copas perdidas × coste copa.
              </p>
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

          {esPerfilSomm(restaurante) && restauranteId && (
            <GraficoCogsPct restauranteId={restauranteId} enabled={!!restauranteId} />
          )}

          {conflicto && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.25)' }}>
              <p style={{ color: '#F59E0B', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                Hay datos manuales en Explotación que difieren del cierre
              </p>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', opacity: 0.6, paddingBottom: 4, fontWeight: 500 }}>Campo</th>
                    <th style={{ textAlign: 'right', opacity: 0.6, paddingBottom: 4, fontWeight: 500 }}>Manual</th>
                    <th style={{ textAlign: 'right', opacity: 0.6, paddingBottom: 4, fontWeight: 500 }}>Cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(conflicto).map(([campo, vals]) => (
                    <tr key={campo}>
                      <td style={{ padding: '2px 0', opacity: 0.85 }}>
                        {{ ingresos: 'Ingresos netos', consumo_mp: 'Consumo MP', gastos_fijos: 'Gastos fijos', stock_final_valor: 'Stock final' }[campo] || campo}
                      </td>
                      <td style={{ textAlign: 'right', padding: '2px 0', opacity: 0.7 }}>{eur(vals.manual)}</td>
                      <td style={{ textAlign: 'right', padding: '2px 0', color: '#F59E0B' }}>{eur(vals.auto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className={styles.secondary} onClick={usarValoresCierre} style={{ fontSize: 13 }}>
                  Usar valores del cierre
                </button>
                <button className={styles.ghost} onClick={() => setConflicto(null)} style={{ fontSize: 13 }}>
                  Mantener manual
                </button>
              </div>
            </div>
          )}

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
