'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import styles from '../module.module.css'

// ── Utilidades de semana ──────────────────────────────────────────────────────

function localDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function semanaActual() {
  const hoy = new Date()
  const dia = hoy.getDay() // 0=Dom, 1=Lun, ..., 6=Sab
  const diasDesdeEsteLunes = dia === 0 ? 6 : dia - 1
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - diasDesdeEsteLunes)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  return fmtSemana(lunes, domingo)
}

function navegarSemana(desde, delta) {
  // desde is always a local YYYY-MM-DD string; parse as local midnight
  const [y, mo, dd] = desde.split('-').map(Number)
  const d = new Date(y, mo - 1, dd)
  d.setDate(d.getDate() + delta * 7)
  const h = new Date(d)
  h.setDate(d.getDate() + 6)
  return fmtSemana(d, h)
}

function fmtSemana(d, h) {
  return {
    desde: localDateStr(d),
    hasta: localDateStr(h),
  }
}

function fechaMadrid() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

function semanaEnCurso(sem) {
  const hoy = fechaMadrid()
  return hoy >= sem.desde && hoy <= sem.hasta
}

function diasTranscurridosMadrid(sem) {
  const [y, m, d] = sem.desde.split('-').map(Number)
  const hoy = fechaMadrid()
  const [yh, mh, dh] = hoy.split('-').map(Number)
  const lunes = new Date(y, m - 1, d)
  const hoyDate = new Date(yh, mh - 1, dh)
  // Días COMPLETOS transcurridos: hoy no cuenta (su parte puede no estar cerrado aún)
  return Math.min(Math.round((hoyDate - lunes) / 86400000), 7)
}

function offsetDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return localDateStr(date)
}

function labelSemana({ desde, hasta }) {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const d = new Date(desde + 'T00:00:00')
  const h = new Date(hasta + 'T00:00:00')
  if (d.getMonth() === h.getMonth()) {
    return `${d.getDate()}–${h.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
  }
  return `${d.getDate()} ${MESES[d.getMonth()]} – ${h.getDate()} ${MESES[h.getMonth()]} ${h.getFullYear()}`
}

// ── Helpers de formato ────────────────────────────────────────────────────────

function eur(n) {
  return `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function variPct(actual, anterior) {
  if (!anterior || anterior === 0) return null
  const pct = Math.round(((actual - anterior) / anterior) * 100)
  return pct
}

function variTag(pct) {
  if (pct === null) return ''
  const sign = pct >= 0 ? '+' : ''
  return ` (${sign}${pct}%)`
}

const LABEL_TURNO  = { mediodia: 'Mediodía', noche: 'Noche', unico: 'Único' }
const LABEL_CANAL  = {
  botella: 'Venta botella', copa: 'Venta copa', invitacion: 'Invitación',
  cocina: 'Cocina', evento: 'Evento', maridaje: 'Maridaje', rotura: 'Rotura', cata: 'Cata',
}

// ── apiFetch ─────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Error cargando informe')
  return body
}

// ── Generador PDF ─────────────────────────────────────────────────────────────

async function generarPDF(informe, semanaAnterior, semana, restaurante) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const { meta, resumen, por_canal, por_vino, por_dia_turno, top_ingresos, top_uds } = informe
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
    const ROW_H = 6
    const HEADER_H = 7
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
      row.forEach((cell, i) => {
        doc.text(String(cell ?? ''), cx, y + 4, { align: i > 0 ? 'right' : 'left', maxWidth: colWidths[i] - 2 })
        cx += colWidths[i]
      })
      y += ROW_H
    })
    doc.setDrawColor(210, 210, 210)
    doc.rect(ML, y - rows.length * ROW_H - HEADER_H, CW, rows.length * ROW_H + HEADER_H, 'S')
    y += 4
  }

  // — Cabecera —
  doc.setFillColor(30, 30, 30)
  doc.rect(0, 0, PW, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(restaurante?.nombre || 'Restaurante', ML, 10)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Informe semanal de vinos · ${labelSemana(semana)}`, ML, 17)
  y = 28

  sub(`Partes incluidos: ${meta.partes_incluidos}${meta.borradores_excluidos ? ` · ${meta.borradores_excluidos} borrador(es) excluido(s)` : ''}`)
  sep()

  // — Resumen —
  hdr('Resumen del periodo', 10)
  const anteriores = semanaAnterior?.resumen || {}
  const filaResumen = [
    ['Ingresos de venta',      eur(resumen.ingresos_venta),      variTag(variPct(resumen.ingresos_venta, anteriores.ingresos_venta))],
    ['Botellas vendidas',      resumen.botellas_vendidas,         variTag(variPct(resumen.botellas_vendidas, anteriores.botellas_vendidas))],
    ['Copas servidas',         resumen.copas_vendidas,            variTag(variPct(resumen.copas_vendidas, anteriores.copas_vendidas))],
    ['Botellas equivalentes',  resumen.botellas_equivalentes,     ''],
    ['Invitaciones (uds)',     resumen.invitaciones_uds,          ''],
    ['Consumos (uds)',         resumen.consumos_uds,              ''],
    ['Consumos (valor carta)', eur(resumen.consumos_valor),       ''],
  ]
  tabla(['Concepto', 'Valor', 'vs sem. ant.'], filaResumen, [80, 45, 57])

  // — Por canal —
  hdr('Por canal', 10)
  const canalRows = [
    ['Venta botella',  por_canal.botella.uds,    eur(por_canal.botella.ingresos)],
    ['Venta copa',     `${por_canal.copa.copas} copas`,  eur(por_canal.copa.ingresos)],
    ['Invitación',     por_canal.invitacion.uds, '—'],
    ['Cocina',         por_canal.cocina.uds,     por_canal.cocina.valor ? eur(por_canal.cocina.valor) : '—'],
    ['Evento',         por_canal.evento.uds,     por_canal.evento.valor ? eur(por_canal.evento.valor) : '—'],
    ['Maridaje',       por_canal.maridaje.uds,   por_canal.maridaje.valor ? eur(por_canal.maridaje.valor) : '—'],
    ['Rotura',         por_canal.rotura.uds,     '—'],
    ['Cata',           por_canal.cata.uds,       por_canal.cata.valor ? eur(por_canal.cata.valor) : '—'],
  ].filter(r => r[1] !== 0)
  if (canalRows.length) tabla(['Canal', 'Uds', 'Ingresos carta'], canalRows, [70, 50, 62])

  // — Top 5 por ingresos —
  if (top_ingresos.length) {
    hdr('Top 5 por ingresos', 10)
    const top5Filas = top_ingresos.map((v, i) => {
      const vAnt = semanaAnterior?.top_ingresos?.find(x => x.vino_id === v.vino_id)
      return [`${i + 1}. ${v.nombre}`, eur(v.ingresos), variTag(variPct(v.ingresos, vAnt?.ingresos))]
    })
    tabla(['Vino', 'Ingresos', 'vs sem. ant.'], top5Filas, [95, 45, 42])
  }

  // — Por vino —
  if (por_vino.length) {
    hdr('Desglose por vino', 10)
    const vinoFilas = por_vino.map(v => [
      v.nombre,
      v.uds || '—',
      v.copas || '—',
      eur(v.ingresos),
      v.tiene_coste && v.margen_pct !== null ? `${v.margen_pct}%` : 'sin coste',
    ])
    tabla(['Vino', 'Uds', 'Copas', 'Ingresos', 'Margen'], vinoFilas, [67, 18, 20, 35, 42])
  }

  // — Por día y turno —
  if (por_dia_turno.length) {
    hdr('Por día y turno', 10)
    const diaFilas = por_dia_turno.map(d => [
      d.fecha, LABEL_TURNO[d.turno] || d.turno, d.lineas, eur(d.ingresos),
    ])
    tabla(['Fecha', 'Turno', 'Líneas', 'Ingresos'], diaFilas, [40, 40, 30, 72])
  }

  // — Pie —
  const totalPags = doc.getNumberOfPages()
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(160, 160, 160)
    doc.text(`Carta Viva · ${new Date().toLocaleDateString('es-ES')} · Pág. ${p}/${totalPags}`, PW / 2, 292, { align: 'center' })
  }

  const filename = `informe-vinos-${semana.desde}-${semana.hasta}.pdf`
  doc.save(filename)
}

// ── Generador Excel ───────────────────────────────────────────────────────────

async function generarExcel(informe, semana, restaurante) {
  const XLSX = await import('xlsx')
  const { meta, resumen, por_canal, por_vino, por_dia_turno, por_mesa } = informe
  const wb = XLSX.utils.book_new()

  function sheet(nombre, filas) {
    const ws = XLSX.utils.aoa_to_sheet(filas)
    XLSX.utils.book_append_sheet(wb, ws, nombre)
    return ws
  }

  // Hoja 1: Resumen
  sheet('Resumen', [
    [`Informe semanal de vinos — ${restaurante?.nombre || ''}`],
    [`Semana: ${labelSemana(semana)}`],
    [`Partes incluidos: ${meta.partes_incluidos}   Borradores excluidos: ${meta.borradores_excluidos}`],
    [],
    ['Concepto', 'Valor'],
    ['Ingresos de venta (€)',    resumen.ingresos_venta],
    ['Botellas vendidas',        resumen.botellas_vendidas],
    ['Copas servidas',           resumen.copas_vendidas],
    ['Botellas equivalentes',    resumen.botellas_equivalentes],
    ['Invitaciones (uds)',       resumen.invitaciones_uds],
    ['Consumos (uds)',           resumen.consumos_uds],
    ['Consumos valor carta (€)', resumen.consumos_valor],
    [],
    ['Canal', 'Uds', 'Copas', 'Ingresos (€)', 'Valor consumo (€)'],
    ['Venta botella', por_canal.botella.uds,   '',                  por_canal.botella.ingresos,  ''],
    ['Venta copa',    por_canal.copa.uds,       por_canal.copa.copas, por_canal.copa.ingresos,   ''],
    ['Invitación',    por_canal.invitacion.uds, '',                  '',                          ''],
    ['Cocina',        por_canal.cocina.uds,     '',                  '',                          por_canal.cocina.valor],
    ['Evento',        por_canal.evento.uds,     '',                  '',                          por_canal.evento.valor],
    ['Maridaje',      por_canal.maridaje.uds,   '',                  '',                          por_canal.maridaje.valor],
    ['Rotura',        por_canal.rotura.uds,     '',                  '',                          ''],
    ['Cata',          por_canal.cata.uds,       '',                  '',                          por_canal.cata.valor],
    // Fila de totales con fórmulas
    ['TOTAL', { f: 'SUM(B15:B22)' }, { f: 'SUM(C15:C22)' }, { f: 'SUM(D15:D22)' }, { f: 'SUM(E15:E22)' }],
  ])

  // Hoja 2: Por vino
  const vinoHeader = ['Vino', 'Uds (botella)', 'Copas', 'Ingresos (€)', 'Margen (%)']
  const vinoRows = por_vino.map(v => [
    v.nombre, v.uds, v.copas, v.ingresos,
    v.tiene_coste && v.margen_pct !== null ? v.margen_pct : 'sin coste',
  ])
  // Fila de totales con fórmulas
  const n = vinoRows.length
  const startRow = 2  // row 1 = header
  const endRow   = startRow + n - 1
  sheet('Por vino', [
    vinoHeader,
    ...vinoRows,
    ['TOTAL',
      { f: `SUM(B${startRow}:B${endRow})` },
      { f: `SUM(C${startRow}:C${endRow})` },
      { f: `SUM(D${startRow}:D${endRow})` },
      '',
    ],
  ])

  // Hoja 3: Por día
  const diaRows = por_dia_turno.map(d => [
    d.fecha, LABEL_TURNO[d.turno] || d.turno, d.lineas, d.ingresos,
  ])
  const nd = diaRows.length
  sheet('Por día', [
    ['Fecha', 'Turno', 'Líneas', 'Ingresos (€)'],
    ...diaRows,
    ['TOTAL', '', { f: `SUM(C2:C${nd + 1})` }, { f: `SUM(D2:D${nd + 1})` }],
  ])

  // Hoja 4: Por mesa (solo Excel)
  const mesaRows = por_mesa.map(m => [m.mesa, m.uds, m.ingresos])
  const nm = mesaRows.length
  sheet('Por mesa', [
    ['Mesa', 'Uds', 'Ingresos (€)'],
    ...mesaRows,
    ...(nm > 0 ? [['TOTAL', { f: `SUM(B2:B${nm + 1})` }, { f: `SUM(C2:C${nm + 1})` }]] : []),
  ])

  const filename = `informe-vinos-${semana.desde}-${semana.hasta}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function InformeSemanal({ restauranteId, restaurante }) {
  const [semana, setSemana]         = useState(() => semanaActual())
  const [informe, setInforme]       = useState(null)
  const [semAnt, setSemAnt]         = useState(null)
  const [semAntComparable, setSemAntComparable] = useState(null)
  const [cargando, setCargando]     = useState(false)
  const [error, setError]           = useState('')
  const [genPDF, setGenPDF]         = useState(false)
  const [genXLS, setGenXLS]         = useState(false)

  useEffect(() => {
    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semana.desde, semana.hasta])

  async function cargar() {
    if (!restauranteId) return
    setCargando(true)
    setError('')
    setInforme(null)
    try {
      const { informe: inf, semana_anterior: ant } = await apiFetch(
        `/api/partes/informe?restaurante_id=${restauranteId}&desde=${semana.desde}&hasta=${semana.hasta}`
      )
      setInforme(inf)
      setSemAnt(ant)
      if (semanaEnCurso(semana)) {
        const diasElapsed = diasTranscurridosMadrid(semana)
        if (diasElapsed >= 1) {
          const desdeComp = offsetDate(semana.desde, -7)
          const hastaComp = offsetDate(semana.desde, diasElapsed - 8)
          const { informe: antComp } = await apiFetch(
            `/api/partes/informe?restaurante_id=${restauranteId}&desde=${desdeComp}&hasta=${hastaComp}`
          )
          setSemAntComparable(antComp)
        } else {
          setSemAntComparable(null)
        }
      } else {
        setSemAntComparable(null)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  async function onPDF() {
    if (!informe) return
    setGenPDF(true)
    try { await generarPDF(informe, semAnt, semana, restaurante) }
    catch (e) { setError(`Error PDF: ${e.message}`) }
    finally { setGenPDF(false) }
  }

  async function onExcel() {
    if (!informe) return
    setGenXLS(true)
    try { await generarExcel(informe, semana, restaurante) }
    catch (e) { setError(`Error Excel: ${e.message}`) }
    finally { setGenXLS(false) }
  }

  const sinDatos = informe && informe.meta.partes_incluidos === 0
  const enCurso = semanaEnCurso(semana)
  const semBase = enCurso ? semAntComparable : semAnt
  const vsLabel = enCurso ? 'vs mismos días sem. ant.' : 'vs sem. ant.'

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>Semanal</p>
          <h2 className={styles.panelTitle}>Informe de vinos</h2>
          <p className={styles.panelSub}>
            Hoja de venta semanal: ingresos, botellas, copas y consumos registrados en los partes cerrados.
          </p>
        </div>
        <div className={styles.actionRow}>
          <button className={styles.ghost} onClick={() => setSemana(s => navegarSemana(s.desde, -1))} title="Semana anterior">←</button>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{labelSemana(semana)}</span>
          <button className={styles.ghost} onClick={() => setSemana(s => navegarSemana(s.desde, +1))} title="Semana siguiente">→</button>
          {informe && !sinDatos && (
            <>
              <button className={styles.secondary} onClick={onPDF}   disabled={genPDF}>{genPDF   ? 'Generando…' : 'PDF'}</button>
              <button className={styles.secondary} onClick={onExcel} disabled={genXLS}>{genXLS ? 'Generando…' : 'Excel'}</button>
            </>
          )}
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontSize: 13, padding: '4px 0' }}>{error}</p>}

      <div className={styles.panelBody}>
        {cargando && <p className={styles.sectionText}>Cargando informe…</p>}

        {!cargando && sinDatos && (
          <div>
            <p className={styles.sectionText}>
              No hay partes cerrados en la semana del {labelSemana(semana)}.
            </p>
            {informe.meta.borradores_excluidos > 0 && (
              <p className={styles.sectionText} style={{ marginTop: 6 }}>
                Hay {informe.meta.borradores_excluidos} parte(s) en borrador — ciérralos para incluirlos.
              </p>
            )}
          </div>
        )}

        {!cargando && informe && !sinDatos && (
          <div>
            {informe.meta.borradores_excluidos > 0 && (
              <p style={{ fontSize: 12, color: '#856404', marginBottom: 10 }}>
                {informe.meta.borradores_excluidos} parte(s) en borrador excluido(s) de este informe.
              </p>
            )}

            {/* Resumen */}
            <div className={styles.gridTwo} style={{ marginBottom: 20 }}>
              <Kpi label="Ingresos venta"    valor={eur(informe.resumen.ingresos_venta)}
                   variacion={variPct(informe.resumen.ingresos_venta, semBase?.resumen?.ingresos_venta)}
                   labelVsAnt={vsLabel} />
              <Kpi label="Botellas vendidas" valor={informe.resumen.botellas_vendidas}
                   variacion={variPct(informe.resumen.botellas_vendidas, semBase?.resumen?.botellas_vendidas)}
                   labelVsAnt={vsLabel} />
              <Kpi label="Copas servidas"    valor={informe.resumen.copas_vendidas}
                   variacion={variPct(informe.resumen.copas_vendidas, semBase?.resumen?.copas_vendidas)}
                   labelVsAnt={vsLabel} />
              <Kpi label="Bots. equivalentes" valor={informe.resumen.botellas_equivalentes} variacion={null} />
              <Kpi label="Invitaciones"       valor={`${informe.resumen.invitaciones_uds} uds`} variacion={null} />
              <Kpi label="Consumos no venta"  valor={`${informe.resumen.consumos_uds} uds · ${eur(informe.resumen.consumos_valor)}`} variacion={null} />
            </div>

            {/* Por canal */}
            {Object.values(informe.por_canal).some(c => (c.uds || 0) > 0) && (
              <>
                <p className={styles.eyebrow} style={{ marginBottom: 8 }}>Por canal</p>
                <TablaSimple
                  headers={['Canal', 'Uds', 'Copas', 'Ingresos']}
                  rows={Object.entries(informe.por_canal)
                    .filter(([, c]) => (c.uds || 0) > 0 || (c.copas || 0) > 0)
                    .map(([k, c]) => [
                      LABEL_CANAL[k] || k,
                      c.uds || '—',
                      c.copas || '—',
                      c.ingresos ? eur(c.ingresos) : (c.valor ? eur(c.valor) : '—'),
                    ])}
                />
              </>
            )}

            {/* Por vino */}
            {informe.por_vino.length > 0 && (
              <>
                <p className={styles.eyebrow} style={{ marginBottom: 8, marginTop: 16 }}>Por vino</p>
                <TablaSimple
                  headers={['Vino', 'Uds', 'Copas', 'Ingresos', 'Margen']}
                  rows={informe.por_vino.map(v => [
                    v.nombre,
                    v.uds || '—',
                    v.copas || '—',
                    eur(v.ingresos),
                    v.tiene_coste && v.margen_pct !== null ? `${v.margen_pct}%` : <span style={{ color: '#aaa' }}>sin coste</span>,
                  ])}
                />
              </>
            )}

            {/* Por día */}
            {informe.por_dia_turno.length > 0 && (
              <>
                <p className={styles.eyebrow} style={{ marginBottom: 8, marginTop: 16 }}>Por día y turno</p>
                <TablaSimple
                  headers={['Fecha', 'Turno', 'Ingresos']}
                  rows={informe.por_dia_turno.map(d => [
                    d.fecha,
                    LABEL_TURNO[d.turno] || d.turno,
                    eur(d.ingresos),
                  ])}
                />
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function Kpi({ label, valor, variacion, labelVsAnt = 'vs sem. ant.' }) {
  return (
    <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#222' }}>{valor}</p>
      {variacion !== null && (
        <p style={{ fontSize: 11, margin: '3px 0 0', color: variacion >= 0 ? '#2e7d32' : '#c62828' }}>
          {variacion >= 0 ? '▲' : '▼'} {Math.abs(variacion)}% {labelVsAnt}
        </p>
      )}
    </div>
  )
}

function TablaSimple({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 4 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '6px 10px', textAlign: i === 0 ? 'left' : 'right',
                fontWeight: 600, fontSize: 11, color: '#666', borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid #f0f0f0' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '6px 10px', textAlign: ci === 0 ? 'left' : 'right',
                  color: '#333', verticalAlign: 'middle' }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
