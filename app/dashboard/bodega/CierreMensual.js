'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { esPerfilSomm } from '../../lib/plans'
import styles from '../module.module.css'
import { GraficoCogsPct } from '../somm-graficos/GraficoCogsPct'
import { construirCierreWorkbook } from '../../lib/excelSomm'
import { descargarWorkbook } from '../../lib/excelSommDownload'
import {
  deltaMetrica, esComparable, metricaPorKey, motivoText,
  colorDelta, deltaResultado, TOOLTIP_RESULTADO_ANTES_DE_MERMA,
} from '../../lib/yoyCierre'
import { formatoMoneda } from '../../lib/formatoEs'
import { margenTrasMerma } from '../../lib/margenBodega'
import {
  cargarLogoPdf,
  formatPeriodoPdfEs,
  pintarCabecera,
  pintarPiesEnTodas,
} from '../../lib/pdfEstilos'
import { readDesglose, CATEGORIAS_SALIDA_SIN_VENTA } from '../../lib/cierreDesglose'
import { calcularRatios, diasDelMes } from '../../lib/ratiosCierre'
import { conciliarCompras } from '../../lib/conciliacionCompras'
import {
  leerExtrasHistorico,
  tieneHistoricoExtras,
  ratiosHistoricos,
  coincideMesHistorico,
  tieneDatosExportables,
} from '../../lib/historicoExtras'

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

// A1: delega en formatoMoneda (es-ES canonico).
function eur(v) {
  return formatoMoneda(v, { decimales: 2 })
}

// Formateo seguro de unidades para el bloque "Desglose del cierre".
// null/undefined → "—"; números → entero sin decimales (consumo físico).
function uds(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('es-ES').format(Number(v))
}

// Importes del desglose. Separador de miles + coma, sin "€" (la columna
// ya se titula "Valor (€)"). Muestra "—" para null/undefined.
function eurDesglose(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(v))
}

// Ratio (0..1) → "32,0 %". Null/NaN → "—".
function pctRatio(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const pct = Number(v) * 100
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(pct) + ' %'
}
// Número con decimales (rotación 1,28 / cobertura 28,2 d). Null → "—".
function numDec(v, dec = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
  }).format(Number(v))
}

// Motivo humano por el que un ratio es null, para el tooltip.
function motivoRatio(faltantes, which) {
  if (!faltantes) return ''
  const m = []
  if (which === 'margen_botella' || which === 'margen_copa') {
    if (faltantes.iva_pct) m.push('Requiere iva_pct')
    if (which === 'margen_botella' && faltantes.canal_botella_ingresos) m.push('Sin ingresos de botella')
    if (which === 'margen_copa'    && faltantes.canal_copa_ingresos)    m.push('Sin ingresos de copa')
    if (faltantes.desglose) m.push('Snapshot sin desglose')
  }
  if (which === 'coste_pct')          if (faltantes.ventas_netas)   m.push('Requiere ventas netas > 0')
  if (which === 'consumo_vs_compras') {
    if (faltantes.compras_netas) m.push('Requiere compras netas > 0')
    if (faltantes.inventario)    m.push('Requiere inventario inicial y final')
  }
  if (which === 'rotacion' || which === 'cobertura_dias' || which === 'diferencia_inv') {
    if (faltantes.inventario) m.push('Requiere inventario inicial y final')
  }
  return m.join(' · ')
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

// Mismo mes del año anterior (H4b YoY).
function prevYearMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  return `${y - 1}-${String(m).padStart(2, '0')}`
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

function DataRow({ label, value, strong, dim, color, vari, variTitle, variDir }) {
  const tag = variTag(vari)
  // Fix H4b: color por dirección de métrica. Si `variDir` llega del
  // llamador (vía vn/METRICAS_CIERRE_YOY), 'up-good' pinta positivo en
  // verde y 'up-bad' en rojo. Si no llega (fallback), mantiene el
  // comportamiento previo "cualquier positivo = verde".
  let tagColor = null
  if (vari != null) {
    tagColor = variDir ? colorDelta(vari, variDir) : (vari >= 0 ? '#4A8C6F' : '#b85454')
  }
  const mostrarGuion = tag == null && variTitle
  return (
    <tr>
      <td style={{ padding: '3px 0 3px 8px', fontSize: 14, fontWeight: strong ? 600 : 400, opacity: dim ? 0.55 : 1 }}>{label}</td>
      <td style={{ padding: '3px 0', textAlign: 'right', fontSize: 14, fontWeight: strong ? 700 : 400, color: color || 'inherit', opacity: dim ? 0.55 : 1, whiteSpace: 'nowrap' }}>{value}</td>
      <td
        style={{ padding: '3px 0 3px 6px', textAlign: 'right', fontSize: 11, color: tagColor || (mostrarGuion ? '#8b8278' : 'transparent'), opacity: dim ? 0.55 : 0.8, whiteSpace: 'nowrap', minWidth: 54, cursor: mostrarGuion ? 'help' : 'default' }}
        title={variTitle || ''}
      >
        {tag || (mostrarGuion ? '—' : '')}
      </td>
    </tr>
  )
}

// ── PDF ────────────────────────────────────────────────────────────────────────

async function generarPDF(datos, datosAnt, mes, restaurante, facturasLibro = [], historicoPrevYear = null) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210, ML = 14, MR = 14, CW = PW - ML - MR
  let y = 14

  // jsPDF con helvetica estándar sólo soporta WinAnsi-1252: caracteres como
  // "−" (U+2212), en/em dashes, comillas tipográficas o espacios finos
  // acaban causando que ExcelJS/jsPDF cambien la codificación de la línea y
  // aparezcan separaciones raras o bytes raros (U+0000, U+0012) en los
  // streams. ascii() sanea todos los strings antes de pintarlos.
  function ascii(txt) {
    if (txt == null) return ''
    return String(txt)
      .replace(/[−‐‑–—]/g, '-')
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[    ]/g, ' ')
  }

  function hdr(txt, size = 11, bold = true) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(40, 40, 40)
    doc.text(ascii(txt), ML, y)
    y += size * 0.5 + 2
  }

  function sub(txt) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(100, 100, 100)
    doc.text(ascii(txt), ML, y)
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
      doc.text(ascii(String(h)), x, y + 4.5, { align: i > 0 ? 'right' : 'left', maxWidth: colWidths[i] - 2 })
      x += colWidths[i]
    })
    y += HEADER_H
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    rows.forEach((row, ri) => {
      if (y > 270) { y = nuevaPagina() }
      if (ri % 2 === 1) {
        doc.setFillColor(252, 252, 252)
        doc.rect(ML, y, CW, ROW_H, 'F')
      }
      doc.setTextColor(40, 40, 40)
      let cx = ML + 2
      row.forEach((cell, ci) => {
        doc.text(ascii(String(cell ?? '')), cx, y + 4, { align: ci > 0 ? 'right' : 'left', maxWidth: colWidths[ci] - 2 })
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

  // Cabecera Carta Viva (Fase E): banda burdeos + logo isotipo + pie
  // "Página X de N" en todas las páginas. Las cifras del cuerpo
  // siguen idénticas (test de invariancia en pdfCierreMensualInvariante).
  const logoCv = cargarLogoPdf()
  function pintarCabeceraCv() {
    pintarCabecera(doc, {
      W: PW, margin: ML,
      restauranteNombre: restaurante?.nombre || 'Restaurante',
      periodoEs:         formatPeriodoPdfEs(mes),
      subtitulo:         'Cierre mensual de bodega',
      logo:              logoCv,
    })
  }
  function nuevaPagina() {
    doc.addPage()
    pintarCabeceraCv()
    return 34
  }
  pintarCabeceraCv()
  y = 34

  // El carácter "→" NO existe en WinAnsi (CP1252), la fuente estándar
  // de jsPDF-helvetica. Si llegara, jsPDF reencoda la línea en UTF-16
  // y aparecen bytes nulos intercalados en el stream. Usamos " a "
  // (letra "a"), consistente con las fechas ISO del resto del PDF.
  sub(`${datos.partes_incluidos} partes · ${datos.desde} a ${datos.hasta}${datos.borradores_excluidos > 0 ? ` · ${datos.borradores_excluidos} borrador(es) excluido(s)` : ''}`)
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

  // Perfil Somm: se omite el bloque "Gastos del mes" y la línea final
  // "Resultado neto bodega". En su lugar se imprime "Margen tras merma".
  const soloBodega = esPerfilSomm(restaurante)

  if (!soloBodega && (datos.gastos || []).length > 0) {
    hdr('Gastos del mes', 10)
    tabla(['Concepto', 'Importe', ''],
      [...datos.gastos.map(g => [g.concepto, eur(g.importe), '']), ['TOTAL', eur(datos.gastos_total), '']],
      [110, 52, 20]
    )
  }

  sep()
  if (soloBodega) {
    const mtm    = margenTrasMerma(datos)
    const mtmAnt = datosAnt ? margenTrasMerma(datosAnt) : null
    if (mtm != null) {
      const signo = mtm >= 0 ? '' : '- '
      hdr(`Margen tras merma: ${signo}${eur(Math.abs(mtm))}`, 12)
      if (mtmAnt != null) {
        const antSigno = mtmAnt >= 0 ? '' : '- '
        sub(`Mes anterior: ${antSigno}${eur(Math.abs(mtmAnt))}  ${vTag(mtm, mtmAnt)}`)
      }
    }
  } else {
    const signo = datos.resultado >= 0 ? '' : '- '
    hdr(`Resultado neto bodega: ${signo}${eur(Math.abs(datos.resultado))}`, 12)
    if (datosAnt?.resultado != null) {
      const antSigno = datosAnt.resultado >= 0 ? '' : '- '
      sub(`Mes anterior: ${antSigno}${eur(Math.abs(datosAnt.resultado))}  ${vTag(datos.resultado, datosAnt.resultado)}`)
    }
  }

  // Ratios del mes (F2). Se pinta ANTES del Desglose para que un lector
  // rápido lo vea arriba y el Desglose quede como material de respaldo.
  const ratios = calcularRatios({ datos, desglose: readDesglose(datos) })
  const pdfPct = (v) => (v == null || !Number.isFinite(Number(v))) ? '-' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(v) * 100) + ' %'
  const pdfNum = (v, dec = 2) => (v == null || !Number.isFinite(Number(v))) ? '-' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(v))
  if (y > 230) { y = nuevaPagina() }
  sep()
  hdr('Ratios del mes', 10)
  tabla(
    ['Ratio', 'Valor', ''],
    [
      ['Margen botella %',   pdfPct(ratios.margen_botella_pct), ''],
      ['Margen copa %',      pdfPct(ratios.margen_copa_pct),    ''],
      ['Coste s/ ventas',    pdfPct(ratios.coste_pct_sobre_ventas), ''],
      ['Consumo / compras',  pdfPct(ratios.consumo_vs_compras), ''],
      ['Rotacion',           pdfNum(ratios.rotacion, 2),        ''],
      [
        'Cobertura (dias)',
        pdfNum(ratios.cobertura_dias, 1),
        // Cuando el mes está en curso, pdfjs no admite caracteres no ASCII
        // sin reencode; usamos ascii() para dejar claro que es parcial.
        ratios.cobertura_parcial ? ascii('Dato parcial · mes en curso') : '',
      ],
      ['Dif. inventario %',  pdfPct(ratios.diferencia_inventario_pct), ''],
    ],
    [100, 52, 30]
  )

  // Histórico año anterior. Si el usuario introdujo los extras manuales
  // (stock inicial/final, compras, consumo), mostramos los 3 ratios
  // históricos. Cuando no hay dato → "Sin dato" (siempre con ascii()
  // para evitar que pdfjs rompa caracteres no ASCII).
  if (historicoPrevYear) {
    if (y > 220) { y = nuevaPagina() }
    sep()
    hdr(`Historico ${mesLabel(prevYearMes(mes))}`, 10)
    const extrasPY = leerExtrasHistorico(historicoPrevYear)
    const hayDato  = tieneHistoricoExtras(historicoPrevYear)
    const rh       = ratiosHistoricos({
      extras: extrasPY,
      consumo_mp: Number(historicoPrevYear.consumo_mp),
      dias: diasDelMes(prevYearMes(mes)),
    })
    const txt = (v, fn) => (hayDato && v != null) ? fn(v) : ascii('Sin dato')
    tabla(
      ['Ratio historico', 'Valor', 'Nota'],
      [
        ['Rotacion',          txt(rh.rotacion,         v => pdfNum(v, 2)), ''],
        ['Cobertura (dias)', txt(rh.cobertura_dias,   v => pdfNum(v, 1)), ''],
        ['Consumo / compras', txt(rh.consumo_vs_compras, v => pdfPct(v)), ''],
      ],
      [100, 52, 30],
    )
  }

  // Desglose del cierre (v1). Snapshots antiguos no lo tienen: se omite.
  const desg = readDesglose(datos)
  if (desg) {
    if (y > 220) { y = nuevaPagina() }
    sep()
    hdr('Desglose del cierre', 10)

    const pdfUds = (v) => (v == null || !Number.isFinite(Number(v))) ? '-' : new Intl.NumberFormat('es-ES').format(Number(v))
    const pdfEur = (v) => (v == null || !Number.isFinite(Number(v))) ? '-' : eur(v)
    const sinv = desg.salidas_sin_venta || {}

    const filas = [
      ['Stock inicial (valorado)',       pdfUds(desg.stock_inicial?.uds),            pdfEur(desg.stock_inicial?.valor_eur)],
      ['Compras brutas',                 pdfUds(desg.entradas?.compras_bruto?.uds),  pdfEur(desg.entradas?.compras_bruto?.valor_eur)],
      ['Devoluciones',                   pdfUds(desg.entradas?.devoluciones?.uds),   pdfEur(desg.entradas?.devoluciones?.valor_eur)],
      ['Compras netas',                  pdfUds(desg.entradas?.compras_netas?.uds),  pdfEur(desg.entradas?.compras_netas?.valor_eur)],
      ['Ventas - Botella',               pdfUds(desg.ventas_botella?.uds),           pdfEur(desg.ventas_botella?.valor_eur)],
      ['Ventas - Copa (copas servidas)', pdfUds(desg.ventas_copa?.uds),              pdfEur(desg.ventas_copa?.valor_eur)],
      ...CATEGORIAS_SALIDA_SIN_VENTA.map(cat => {
        const r = sinv[cat.key] || {}
        return [`Salidas - ${cat.label}`, pdfUds(r.uds), pdfEur(r.valor_eur)]
      }),
      ['Total salidas sin venta',        pdfUds(sinv.total?.uds),                    pdfEur(sinv.total?.valor_eur)],
      ['Stock final teorico',            pdfUds(desg.stock_final_teorico?.uds),      pdfEur(desg.stock_final_teorico?.valor_eur)],
      ['Ajuste de inventario',           pdfUds(desg.ajuste_inventario?.uds),        pdfEur(desg.ajuste_inventario?.valor_eur)],
      ['Stock final real',               pdfUds(desg.stock_final_real?.uds),         pdfEur(desg.stock_final_real?.valor_eur)],
      ['Consumo (identidad de inventario)', pdfUds(desg.consumo?.uds),               pdfEur(desg.consumo?.valor_eur)],
    ]
    tabla(['Concepto', 'uds', 'Valor (EUR)'], filas, [100, 30, 52])
  }

  // Conciliación de compras (F3): compara compras_netas del cierre con
  // suma de importes del Libro de Compras del mismo mes. Solo avisa.
  const concil = conciliarCompras({
    comprasApp: datos?.compras_netas,
    facturasLibro,
    mes,
  })
  if (y > 230) { y = nuevaPagina() }
  sep()
  hdr('Conciliacion de compras', 10)
  const etiqConcil = {
    ok:        'Coincide',
    revisar:   'Revisar',
    sin_libro: 'Sin facturas en el Libro',
    sin_app:   'Sin compras en la app',
  }[concil.estado] || '-'
  const pctTxt = concil.pct != null
    ? ` (${(concil.pct * 100).toFixed(1).replace('.', ',')} %)`
    : ''
  const signo = concil.diferencia >= 0 ? '+' : '-'
  tabla(
    ['Concepto', 'Valor', 'Nota'],
    [
      ['Compras app (cierre)',           eur(concil.totalApp),   ''],
      [`Libro de Compras (${concil.meta.cuenta_facturas} fact.)`, eur(concil.totalLibro), ''],
      ['Diferencia',                     `${signo} ${eur(Math.abs(concil.diferencia))}${pctTxt}`, etiqConcil],
    ],
    [92, 54, 36]
  )
  if (concil.estado === 'revisar') {
    sub('Las compras registradas en la app y las facturas del Libro de Compras no coinciden. Revisa antes de cerrar el mes.')
  }
  if (concil.meta.sin_fecha > 0) {
    sub(`${concil.meta.sin_fecha} factura(s) del Libro sin fecha explicita (se cuentan en el mes ${concil.meta.mes}).`)
  }

  // Fase E-3: un único pie por página, el de pdfEstilos, con la
  // fecha de generación integrada en el lado izquierdo para no
  // duplicar información (antes convivían este pie antiguo centrado
  // + el de pintarPie → dos textos de pie por página).
  const fechaGen = new Date().toLocaleDateString('es-ES')
  pintarPiesEnTodas(doc, {
    W: PW,
    textoIzda: `Carta Viva · Cierre mensual · ${fechaGen}`,
  })
  doc.save(`cierre-mensual-${mes}.pdf`)
}

// ── Excel ──────────────────────────────────────────────────────────────────────

async function generarExcel(datos, mes, restaurante, facturasLibro = [], historicoPrevYear = null) {
  // Delegamos en la spec pura de app/lib/excelSomm.js, que ya incluye
  // la hoja Vinos (informe.por_vino con TOTAL en fórmulas SUM) y el
  // Resumen económico. ExcelJS vía dynamic import.
  // esSomm omite "Total gastos" y "Resultado neto bodega" del resumen
  // y añade "Margen tras merma"; también omite la hoja Gastos.
  // facturasLibro (F3): se añade la hoja "Conciliacion" en el workbook.
  // historicoPrevYear: fila de historico_mensual del mismo mes del año
  // anterior; si viene, añadimos filas "Histórico año anterior" a la
  // hoja Ratios (texto plano "Sin dato" si no hay extras).
  const spec = construirCierreWorkbook({
    datos, mes, restauranteNombre: restaurante?.nombre,
    esSomm: esPerfilSomm(restaurante),
    facturasLibro,
    historicoPrevYear,
  })
  await descargarWorkbook(spec)
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function CierreMensual({ restauranteId, restaurante }) {
  const [mes, setMes] = useState(mesAnterior)
  const [estado, setEstado] = useState(null)
  const [datosMesAnt, setDatosMesAnt] = useState(null)
  // Modo de comparación: 'mes_anterior' (default, septiembre vs agosto)
  //                     | 'anio_anterior' (septiembre 2026 vs septiembre 2025)
  const [modoComparar, setModoComparar] = useState('mes_anterior')
  // Cache del snapshot YoY. Se carga perezosamente al activar el toggle.
  // Estructura: { [mes]: { datos, cerrado } }. mes = del mes ACTUAL en la UI.
  const [yoyCache, setYoyCache] = useState({})
  const [loadingYoY, setLoadingYoY] = useState(false)
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
  // Facturas del Libro de Compras del mes — lectura directa de la tabla
  // libro_compras (jsonb). Se usa sólo para conciliar; nunca se escribe.
  const [facturasLibro, setFacturasLibro] = useState(null)
  // Fila de historico_mensual del MISMO MES del año anterior. Se usa
  // en la comparativa cuando `modoComparar === 'anio_anterior'` para
  // añadir rotación/cobertura/consumo-vs-compras calculadas desde los
  // extras manuales (stock inicial/final, compras_total).
  //
  //   historicoPrevYear = null  → aún cargando (o modo != anio_anterior).
  //   historicoPrevYear = {...} → fila cargada para ESTE mes concreto.
  //
  // Se recarga en un useEffect propio con deps [restauranteId, mes,
  // modoComparar] y cancelación (ignora respuestas obsoletas si el mes
  // cambió mientras la query estaba en vuelo). Guarda defensiva adicional
  // en UI/PDF/Excel con `coincideMesHistorico`.
  const [historicoPrevYear, setHistoricoPrevYear] = useState(null)
  const [loadingHistorico, setLoadingHistorico] = useState(false)

  // Carga datos del mes actual + mes anterior (MoM) + libro_compras.
  // Devuelve un token de cancelación (array con flag) para que el caller
  // pueda invalidar la respuesta si el usuario cambia de mes antes de
  // que llegue el resultado.
  const cargar = useCallback(async (cancelado) => {
    if (!restauranteId || !mes) return
    setLoading(true)
    setError(null)
    // Reset inmediato de comparadores para no dejar "colgando" los
    // datos del mes anterior visibles mientras llega el fetch.
    setEstado(null)
    setDatosMesAnt(null)
    setFacturasLibro(null)
    try {
      const [resActual, resAnt, resLibro] = await Promise.all([
        authedFetch(`/api/cierres-mes?restaurante_id=${restauranteId}&mes=${mes}`),
        authedFetch(`/api/cierres-mes?restaurante_id=${restauranteId}&mes=${prevMes(mes)}`),
        supabase
          .from('libro_compras')
          .select('proveedor, periodo, facturas')
          .eq('restaurante_id', restauranteId)
          .eq('periodo', mes),
      ])
      if (cancelado?.flag) return
      const jsonActual = await resActual.json()
      if (!resActual.ok) throw new Error(jsonActual.error || 'Error al cargar')
      if (cancelado?.flag) return
      setEstado(jsonActual)

      if (resAnt.ok) {
        const jsonAnt = await resAnt.json()
        if (cancelado?.flag) return
        setDatosMesAnt(jsonAnt.cerrado ? jsonAnt.cierre?.snapshot : jsonAnt.datos)
      } else {
        if (cancelado?.flag) return
        setDatosMesAnt(null)
      }

      // RLS filtra por restaurante; aquí solo preparamos la lista para
      // la conciliación. Si la query falla silenciosamente, usamos [].
      if (cancelado?.flag) return
      setFacturasLibro(Array.isArray(resLibro?.data) ? resLibro.data : [])
    } catch (e) {
      if (cancelado?.flag) return
      setError(e.message)
      setEstado(null)
      setDatosMesAnt(null)
      setFacturasLibro(null)
    } finally {
      if (!cancelado?.flag) setLoading(false)
    }
  }, [restauranteId, mes])

  useEffect(() => {
    // Cancelación: cada vez que cambia `mes` se marca la carga anterior
    // como obsoleta antes de disparar la nueva, impidiendo que una
    // respuesta tardía pise a la actual.
    const token = { flag: false }
    cargar(token)
    return () => { token.flag = true }
  }, [cargar])

  // ── YoY: fetch perezoso del mes del año anterior, cacheado por `mes` ──
  const cargarYoY = useCallback(async () => {
    if (!restauranteId || !mes) return
    if (yoyCache[mes]) return   // ya cacheado por mes (keyed), no se refresca
    setLoadingYoY(true)
    try {
      const resYoY = await authedFetch(
        `/api/cierres-mes?restaurante_id=${restauranteId}&mes=${prevYearMes(mes)}`
      )
      if (resYoY.ok) {
        const jsonYoY = await resYoY.json()
        const datosYoY = jsonYoY.cerrado ? jsonYoY.cierre?.snapshot : jsonYoY.datos
        setYoyCache(c => ({ ...c, [mes]: { datos: datosYoY ?? null, cerrado: !!jsonYoY.cerrado } }))
      } else {
        setYoyCache(c => ({ ...c, [mes]: { datos: null, cerrado: false } }))
      }
    } catch {
      setYoyCache(c => ({ ...c, [mes]: { datos: null, cerrado: false } }))
    } finally {
      setLoadingYoY(false)
    }
  }, [restauranteId, mes, yoyCache])

  // Dispara el fetch YoY cuando se activa el toggle y aún no hay caché.
  useEffect(() => {
    if (modoComparar === 'anio_anterior' && !yoyCache[mes]) cargarYoY()
  }, [modoComparar, mes, yoyCache, cargarYoY])

  // Fetch de la fila `historico_mensual` del MISMO MES del año anterior.
  // Efecto PROPIO con cancelación — NUNCA cacheado por mes, para evitar
  // que al volver a un mes ya visitado se muestre la fila de otro mes.
  // Al cambiar mes/toggle/restaurante reseteamos a null inmediatamente
  // (el bloque muestra estado "cargando") y la primera respuesta que
  // llega con `cancelado=false` fija el valor. Si cambió el mes antes
  // de resolverse, la respuesta obsoleta se descarta.
  useEffect(() => {
    if (!restauranteId || !mes) return
    setHistoricoPrevYear(null)
    if (modoComparar !== 'anio_anterior') { setLoadingHistorico(false); return }
    let cancelado = false
    setLoadingHistorico(true)
    ;(async () => {
      try {
        const [yPrevStr, mPrevStr] = prevYearMes(mes).split('-')
        const { data: hist } = await supabase
          .from('historico_mensual')
          .select('anio, mes, valor_stock_bodega, stock_inicial_valor, stock_final_valor, compras_total, consumo_mp, ingresos')
          .eq('restaurante_id', restauranteId)
          .eq('anio', parseInt(yPrevStr, 10))
          .eq('mes', parseInt(mPrevStr, 10))
          .maybeSingle()
        if (cancelado) return
        setHistoricoPrevYear(hist || {})
      } catch {
        if (cancelado) return
        setHistoricoPrevYear({})
      } finally {
        if (!cancelado) setLoadingHistorico(false)
      }
    })()
    return () => { cancelado = true }
  }, [restauranteId, mes, modoComparar])

  const cerrado = estado?.cerrado ?? false
  const datos   = cerrado ? estado?.cierre?.snapshot : estado?.datos
  // Perfil Somm: el cierre habla solo de vino. Oculta "Gastos del mes"
  // y la línea final "Resultado neto bodega"; en su lugar muestra
  // "Margen tras merma". No cambia datos almacenados: solo presentación.
  const esSomm = esPerfilSomm(restaurante)

  // Fuente de comparación según el modo + flag "prevCerrado" para la regla
  // de comparabilidad de yoyCierre (sin-cierre-prev se decide con el flag
  // `cerrado` del endpoint, NO con ventas_neto===0).
  const yoyEntry = yoyCache[mes]
  const datosComparar = modoComparar === 'anio_anterior'
    ? (yoyEntry?.datos ?? null)
    : (datosMesAnt ?? null)
  const prevCerrado = modoComparar === 'anio_anterior'
    ? !!yoyEntry?.cerrado
    : true  // en MoM asumimos cerrado (comportamiento previo)

  // vn(key): calcula el % para la columna de delta de DataRow usando
  // yoyCierre. Devuelve { pct, title, delta, dir, base? }. pct=número
  // (para `vari`) o null. title=tooltip (vacío si comparable).
  //
  // Caso especial 'resultado': aplica deltaResultado para rebalancear
  // "antes de merma" cuando solo uno de los dos lados tiene merma > 0.
  // Esto evita comparar snapshot.resultado (que incluye −merma) de un
  // mes con el de otro cuando la base aritmética no es la misma.
  function vn(key) {
    const meta = metricaPorKey(key)
    if (!meta) {
      return { pct: variPct(datos?.[key], datosComparar?.[key]), title: '' }
    }
    const motivo = esComparable(datos, datosComparar, meta, { prevCerrado })
    if (motivo !== 'ok') {
      return { pct: null, title: motivoText(motivo, key) }
    }
    if (key === 'resultado') {
      const r = deltaResultado(datos, datosComparar)
      if (r.delta == null) return { pct: null, title: '' }
      return {
        pct: r.deltaPct,
        title: r.base === 'antes_de_merma' ? TOOLTIP_RESULTADO_ANTES_DE_MERMA : '',
        delta: r.delta,
        dir: meta.dir,
        base: r.base,
      }
    }
    const { delta, deltaPct } = deltaMetrica(datos[key], datosComparar[key], meta.tipo)
    const pct = meta.tipo === 'ratio' ? delta : deltaPct
    return { pct, title: '', delta, dir: meta.dir }
  }

  // Spread helper para <DataRow>: convierte el resultado de vn(key) en
  // las tres props que DataRow consume. Mantiene el JSX legible.
  // variDir habilita el color por dirección de la métrica (up-bad para
  // merma/gastos/coste/compras/salidas; up-good para ventas/margen/
  // resultado/stock/devoluciones).
  function varProps(v) {
    return { vari: v.pct, variTitle: v.title, variDir: v.dir }
  }

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

  // Sanitiza la fila histórica justo antes de exportar: si el usuario
  // acaba de cambiar de mes y aún no llegó el fetch, pasa null; si la
  // fila que hay en memoria no corresponde al (anio-1, mes) del cierre
  // que se está exportando, también pasa null (coincideMesHistorico).
  // Así el PDF/Excel nunca cuelan datos de otro mes.
  function historicoSeguroParaExportar() {
    if (loadingHistorico) return null
    if (!coincideMesHistorico(mes, historicoPrevYear)) return null
    return historicoPrevYear
  }

  async function exportarPDF() {
    if (!datos) return
    if (!tieneDatosExportables(datos)) {
      setError('Este mes aún no tiene datos para exportar.')
      return
    }
    setExportandoPDF(true)
    try { await generarPDF(datos, datosMesAnt, mes, restaurante, facturasLibro || [], historicoSeguroParaExportar()) }
    catch (e) { setError(e.message) }
    finally { setExportandoPDF(false) }
  }

  async function exportarExcel() {
    if (!datos) return
    if (!tieneDatosExportables(datos)) {
      // La spec de construirCierreWorkbook devuelve `{ empty: true }`
      // cuando informe.por_vino está vacío, y descargarWorkbook retorna
      // en silencio sin descargar. En la UI anterior el botón parecía
      // no hacer nada. Avisamos antes de llamar al generador; no se
      // cambia el comportamiento interno del generador.
      setError('Este mes aún no tiene datos para exportar.')
      return
    }
    setExportandoXLS(true)
    try { await generarExcel(datos, mes, restaurante, facturasLibro || [], historicoSeguroParaExportar()) }
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
          {/* Toggle "Comparar con" — H4b. En móvil se envuelve bajo la fila
              anterior. Fetch del YoY es perezoso (al activar el toggle). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            <span style={{ opacity: 0.6 }}>Comparar con:</span>
            <button
              className={styles.ghost}
              onClick={() => setModoComparar('mes_anterior')}
              style={{
                padding: '2px 8px',
                fontWeight: modoComparar === 'mes_anterior' ? 700 : 400,
                opacity:    modoComparar === 'mes_anterior' ? 1 : 0.55,
              }}
            >
              Mes anterior
            </button>
            <button
              className={styles.ghost}
              onClick={() => setModoComparar('anio_anterior')}
              style={{
                padding: '2px 8px',
                fontWeight: modoComparar === 'anio_anterior' ? 700 : 400,
                opacity:    modoComparar === 'anio_anterior' ? 1 : 0.55,
              }}
            >
              {`Mismo mes ${prevYearMes(mes).slice(0, 4)}`}
            </button>
            {loadingYoY && modoComparar === 'anio_anterior' && (
              <span style={{ fontSize: 11, opacity: 0.5 }}>cargando…</span>
            )}
            {modoComparar === 'anio_anterior' && yoyCache[mes] && !yoyCache[mes].cerrado && (
              <span style={{ fontSize: 11, color: '#b8860b', opacity: 0.85 }} title="El mismo mes del año anterior no tiene cierre firmado">
                sin cierre año anterior
              </span>
            )}
          </div>
          {!cerrado && (
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
              Mes en curso: dato parcial. El cierre se firma al cerrar el mes.
            </div>
          )}
        </div>
        <div className={styles.actionRow} style={{ alignItems: 'flex-end', gap: 8 }}>
          {datos && !loading && (() => {
            // Gate de exportación: si el mes aún no tiene vinos (p. ej.
            // un mes futuro sin movimientos), los generadores existentes
            // devuelven spec vacía y la descarga nunca ocurre. Lo
            // anunciamos con un tooltip en el botón y además bloqueamos
            // el click mientras el histórico se está cargando, para que
            // no se exporte un PDF/Excel con "Histórico" de otro mes.
            const sinDatos      = !tieneDatosExportables(datos)
            const waitHistorico = modoComparar === 'anio_anterior' && loadingHistorico
            const tooltipSin    = sinDatos ? 'Este mes aún no tiene datos para exportar.' : ''
            const tooltipWait   = waitHistorico ? 'Esperando datos del histórico del año anterior…' : ''
            const tip           = tooltipSin || tooltipWait
            const disabledPdf   = exportandoPDF || sinDatos || waitHistorico
            const disabledXls   = exportandoXLS || sinDatos || waitHistorico
            return (
              <>
                <button className={styles.ghost} onClick={exportarPDF} disabled={disabledPdf} title={tip} style={{ fontSize: 12 }}>
                  {exportandoPDF ? 'Generando…' : 'PDF'}
                </button>
                <button className={styles.ghost} onClick={exportarExcel} disabled={disabledXls} title={tip} style={{ fontSize: 12 }}>
                  {exportandoXLS ? 'Generando…' : 'Excel'}
                </button>
              </>
            )
          })()}
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

      {!loading && datos && !tieneDatosExportables(datos) && (
        <p style={{
          color: '#b15a00', fontSize: 13, padding: '6px 10px',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 6,
        }}>
          Este mes aún no tiene datos para exportar. La hoja de vinos del Excel
          y las tablas del PDF se construyen a partir del detalle por vino del
          mes (informe · por_vino); si no hay ventas o movimientos registrados,
          los generadores devuelven una exportación vacía y la descarga no se
          dispara.
        </p>
      )}

      {!loading && datos && (
        <div className={styles.panelBody}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <SectionRow label="Ventas" />
              <DataRow label="Bruto (con IVA)" value={eur(datos.ventas_bruto)} {...varProps(vn('ventas_bruto'))} />
              <DataRow label={`IVA ${datos.iva_pct}%`} value={`− ${eur(datos.ventas_bruto - datos.ventas_neto)}`} dim />
              <DataRow label="Netas (sin IVA)" value={eur(datos.ventas_neto)} strong {...varProps(vn('ventas_neto'))} />

              <SectionRow label="Coste de ventas teórico" />
              <DataRow label="Botellas y copas" value={`− ${eur(datos.coste_ventas_teorico)}`} {...varProps(vn('coste_ventas_teorico'))} />
              <DataRow
                label={`Margen bruto${datos.margen_pct != null ? ` (${datos.margen_pct}%)` : ''}`}
                value={eur(datos.margen_bruto)}
                strong
                color={datos.margen_pct == null ? null : datos.margen_pct >= 55 ? '#4A8C6F' : '#b85454'}
                {...varProps(vn('margen_bruto'))}
              />

              <SectionRow label="Compras" />
              <DataRow label="Compras" value={eur(datos.compras_bruto)} {...varProps(vn('compras_bruto'))} />
              {datos.devoluciones > 0 && (
                <DataRow label="Devoluciones" value={`− ${eur(datos.devoluciones)}`} dim />
              )}
              <DataRow label="Compras netas" value={eur(datos.compras_netas)} strong {...varProps(vn('compras_netas'))} />

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
                    {...varProps(vn('merma_copa_eur'))}
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

          {/* Desglose del cierre — v1. Añadido a los snapshots a partir de
              2026-11. Los cierres antiguos no lo tienen: readDesglose()
              devuelve null y mostramos un aviso en gris en vez de la
              tabla. El bloque es coherente con el espíritu del cierre
              Somm (sólo bodega) y no contiene ningún campo de los que
              ya se ocultan a Somm (personal / alquileres / bancarios /
              resultado neto), así que se renderiza en ambos perfiles. */}
          {(() => {
            const d = readDesglose(datos)
            return (
              <div style={{ marginTop: 20, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45, marginBottom: 10 }}>
                  Desglose del cierre
                </p>
                {!d && (
                  <p style={{ fontSize: 13, opacity: 0.45 }}>
                    Desglose detallado no disponible para este cierre (snapshot anterior a v1).
                  </p>
                )}
                {d && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left',  padding: '4px 0', opacity: 0.55, fontWeight: 500, fontSize: 11 }}>Concepto</th>
                        <th style={{ textAlign: 'right', padding: '4px 0', opacity: 0.55, fontWeight: 500, fontSize: 11 }}>uds</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', opacity: 0.55, fontWeight: 500, fontSize: 11 }}>Valor (€)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td colSpan={3} style={{ paddingTop: 10, fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.4 }}>Stock inicial</td></tr>
                      <tr>
                        <td style={{ padding: '3px 0 3px 8px' }}>Stock inicial (valorado)</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.stock_inicial?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.stock_inicial?.valor_eur)}</td>
                      </tr>

                      <tr><td colSpan={3} style={{ paddingTop: 10, fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.4 }}>Entradas</td></tr>
                      <tr>
                        <td style={{ padding: '3px 0 3px 8px' }}>Compras brutas</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.entradas?.compras_bruto?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.entradas?.compras_bruto?.valor_eur)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '3px 0 3px 8px' }}>Devoluciones</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.entradas?.devoluciones?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.entradas?.devoluciones?.valor_eur)}</td>
                      </tr>
                      <tr style={{ fontWeight: 600 }}>
                        <td style={{ padding: '3px 0 3px 8px' }}>Compras netas</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.entradas?.compras_netas?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.entradas?.compras_netas?.valor_eur)}</td>
                      </tr>

                      <tr><td colSpan={3} style={{ paddingTop: 10, fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.4 }}>Ventas</td></tr>
                      <tr>
                        <td style={{ padding: '3px 0 3px 8px' }}>Botella</td>
                        <td style={{ padding: '3px 0', textAlign: 'right' }}>{uds(d.ventas_botella?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.ventas_botella?.valor_eur)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '3px 0 3px 8px' }}>Copa (copas servidas)</td>
                        <td style={{ padding: '3px 0', textAlign: 'right' }}>{uds(d.ventas_copa?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.ventas_copa?.valor_eur)}</td>
                      </tr>

                      <tr><td colSpan={3} style={{ paddingTop: 10, fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.4 }}>Salidas sin venta</td></tr>
                      {CATEGORIAS_SALIDA_SIN_VENTA.map(cat => {
                        const r = d.salidas_sin_venta?.[cat.key]
                        return (
                          <tr key={cat.key}>
                            <td style={{ padding: '3px 0 3px 8px' }}>{cat.label}</td>
                            <td style={{ padding: '3px 0', textAlign: 'right' }}>{uds(r?.uds)}</td>
                            <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(r?.valor_eur)}</td>
                          </tr>
                        )
                      })}
                      <tr style={{ fontWeight: 600 }}>
                        <td style={{ padding: '3px 0 3px 8px' }}>Total salidas sin venta</td>
                        <td style={{ padding: '3px 0', textAlign: 'right' }}>{uds(d.salidas_sin_venta?.total?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.salidas_sin_venta?.total?.valor_eur)}</td>
                      </tr>

                      <tr><td colSpan={3} style={{ paddingTop: 10, fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.4 }}>Cierre de inventario</td></tr>
                      <tr>
                        <td style={{ padding: '3px 0 3px 8px' }}>Stock final teórico</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.stock_final_teorico?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.stock_final_teorico?.valor_eur)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '3px 0 3px 8px' }}>Ajuste de inventario</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.ajuste_inventario?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.ajuste_inventario?.valor_eur)}</td>
                      </tr>
                      <tr style={{ fontWeight: 600 }}>
                        <td style={{ padding: '3px 0 3px 8px' }}>Stock final real</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.stock_final_real?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.stock_final_real?.valor_eur)}</td>
                      </tr>
                      <tr style={{ fontWeight: 700 }}>
                        <td style={{ padding: '3px 0 3px 8px' }}>Consumo (identidad de inventario)</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', opacity: 0.55 }}>{uds(d.consumo?.uds)}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eurDesglose(d.consumo?.valor_eur)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )
          })()}

          {/* Ratios del mes (F2 feat/cierre-ratios). Función pura que
              acepta null en cualquier operando y devuelve null por
              ratio. La UI muestra "—" + tooltip con el motivo. */}
          {(() => {
            // Cuando el mes del snapshot coincide con el mes en curso,
            // `calcularRatios` usa días transcurridos (no días totales)
            // como denominador del consumo diario, y marca
            // `cobertura_parcial = true` para que la tarjeta y los
            // informes (PDF/Excel) avisen de que el dato es parcial.
            const r = calcularRatios({ datos, desglose: readDesglose(datos) })
            const f = r.meta?.faltantes || {}
            const tarjeta = (titulo, valor, motivo, extra) => (
              <div
                style={{
                  flex: '1 1 160px', minWidth: 140,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.02)',
                }}
                title={valor === '—' ? motivo : ''}
              >
                <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.55, marginBottom: 4 }}>{titulo}</div>
                <div style={{ fontSize: 17, fontWeight: 700, cursor: valor === '—' && motivo ? 'help' : 'default' }}>{valor}</div>
                {extra && (
                  <div style={{ fontSize: 10.5, opacity: 0.55, marginTop: 4 }}>{extra}</div>
                )}
              </div>
            )
            return (
              <div style={{ marginTop: 20, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45, marginBottom: 10 }}>
                  Ratios del mes
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {tarjeta('Margen botella %', pctRatio(r.margen_botella_pct), motivoRatio(f, 'margen_botella'))}
                  {tarjeta('Margen copa %',    pctRatio(r.margen_copa_pct),    motivoRatio(f, 'margen_copa'))}
                  {tarjeta('Coste s/ ventas',  pctRatio(r.coste_pct_sobre_ventas), motivoRatio(f, 'coste_pct'))}
                  {tarjeta('Consumo / compras',pctRatio(r.consumo_vs_compras), motivoRatio(f, 'consumo_vs_compras'))}
                  {tarjeta('Rotación',         numDec(r.rotacion, 2),           motivoRatio(f, 'rotacion'))}
                  {tarjeta(
                    r.cobertura_parcial ? 'Cobertura (días) · dato parcial' : 'Cobertura (días)',
                    numDec(r.cobertura_dias, 1),
                    motivoRatio(f, 'cobertura_dias'),
                    r.cobertura_parcial ? `Mes en curso · ${r.meta?.dias_cobertura ?? '?'} días transcurridos` : null,
                  )}
                  {tarjeta('Dif. inventario %',pctRatio(r.diferencia_inventario_pct), motivoRatio(f, 'diferencia_inv'))}
                </div>
              </div>
            )
          })()}

          {/* Histórico año anterior: rotación / cobertura / consumo-compras
              calculados desde los extras manuales de historico_mensual
              (stock inicial/final, compras_total, consumo_mp). Solo aparece
              cuando el usuario está comparando con el año anterior.
              Guarda defensiva doble:
                - loadingHistorico: mientras llega el fetch, no se intenta
                  pintar ratios (evita flash de datos del mes anterior al
                  cambiar con ◄ ►).
                - coincideMesHistorico(mes, row): si la fila responde a
                  otro (anio, mes), se trata como "Sin dato" en vez de
                  mostrar datos cruzados. */}
          {modoComparar === 'anio_anterior' && (() => {
            const coincide = coincideMesHistorico(mes, historicoPrevYear)
            const extras   = coincide ? leerExtrasHistorico(historicoPrevYear) : {}
            const hayDato  = coincide && tieneHistoricoExtras(historicoPrevYear)
            const rh = hayDato
              ? ratiosHistoricos({
                  extras,
                  consumo_mp: Number(historicoPrevYear.consumo_mp),
                  dias: diasDelMes(prevYearMes(mes)),
                })
              : { rotacion: null, cobertura_dias: null, consumo_vs_compras: null }
            const tarjetaHist = (titulo, valor) => (
              <div style={{
                flex: '1 1 160px', minWidth: 140,
                padding: '10px 12px', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
              }}>
                <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.55, marginBottom: 4 }}>{titulo}</div>
                <div style={{ fontSize: 17, fontWeight: 700, fontStyle: valor === 'Sin dato' ? 'italic' : 'normal', opacity: valor === 'Sin dato' ? 0.55 : 1 }}>
                  {valor}
                </div>
              </div>
            )
            return (
              <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.45, marginBottom: 10 }}>
                  Histórico {mesLabel(prevYearMes(mes))}
                </p>
                {loadingHistorico && (
                  <p style={{ fontSize: 12, color: '#8b8278', fontStyle: 'italic', marginBottom: 10 }}>
                    Cargando histórico…
                  </p>
                )}
                {!loadingHistorico && !hayDato && (
                  <p style={{ fontSize: 12, color: '#8b8278', fontStyle: 'italic', marginBottom: 10 }}>
                    Sin dato — introduce stock y compras del año anterior en Explotación para activar esta comparativa.
                  </p>
                )}
                {!loadingHistorico && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {tarjetaHist('Rotación hist.',       hayDato && rh.rotacion != null ? numDec(rh.rotacion, 2) : 'Sin dato')}
                    {tarjetaHist('Cobertura hist. (d)', hayDato && rh.cobertura_dias != null ? numDec(rh.cobertura_dias, 1) : 'Sin dato')}
                    {tarjetaHist('Consumo / compras',    hayDato && rh.consumo_vs_compras != null ? pctRatio(rh.consumo_vs_compras) : 'Sin dato')}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Conciliación de compras (F3). Compara compras_netas del
              cierre con la suma de importes del Libro de Compras del
              mismo mes. Sólo avisa; no modifica compras ni facturas. */}
          {(() => {
            const c = conciliarCompras({
              comprasApp: datos?.compras_netas,
              facturasLibro: facturasLibro || [],
              mes,
            })
            const colorPorEstado = {
              ok:        { bg: 'rgba(74,140,111,0.10)', dot: '#4A8C6F', txt: '#4A8C6F' },
              revisar:   { bg: 'rgba(184,84,84,0.12)',  dot: '#b85454', txt: '#b85454' },
              sin_libro: { bg: 'rgba(255,255,255,0.03)', dot: '#8b8278', txt: '#8b8278' },
              sin_app:   { bg: 'rgba(255,255,255,0.03)', dot: '#8b8278', txt: '#8b8278' },
            }
            const col = colorPorEstado[c.estado] || colorPorEstado.sin_libro
            const etiquetaEstado = {
              ok:        'Coincide',
              revisar:   'Revisar',
              sin_libro: 'Sin facturas en el Libro',
              sin_app:   'Sin compras en la app',
            }[c.estado]
            const avisoRevisar = c.estado === 'revisar'
              ? 'Las compras registradas en la app y las facturas del Libro de Compras no coinciden. Revisa antes de cerrar el mes.'
              : null
            return (
              <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 8, background: col.bg, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.55, margin: 0 }}>
                    Conciliación de compras
                  </p>
                  <span style={{ fontSize: 12, color: col.txt, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, display: 'inline-block' }} />
                    {etiquetaEstado}
                  </span>
                </div>
                <div style={{ marginTop: 10, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>Compras app (cierre)</div>
                    <div style={{ fontWeight: 700 }}>{eur(c.totalApp)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>
                      Libro de Compras ({c.meta.cuenta_facturas} factura{c.meta.cuenta_facturas === 1 ? '' : 's'})
                    </div>
                    <div style={{ fontWeight: 700 }}>{eur(c.totalLibro)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 2 }}>Diferencia</div>
                    <div style={{ fontWeight: 700, color: col.txt }}>
                      {c.diferencia >= 0 ? '+' : '−'} {eur(Math.abs(c.diferencia))}
                      {c.pct != null && (
                        <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.7 }}>
                          ({(c.pct * 100).toFixed(1).replace('.', ',')} %)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {c.meta.sin_fecha > 0 && (
                  <p style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
                    {c.meta.sin_fecha} factura{c.meta.sin_fecha === 1 ? '' : 's'} del Libro sin fecha explícita (se cuentan en el mes {c.meta.mes}).
                  </p>
                )}
                {avisoRevisar && (
                  <p style={{ marginTop: 8, fontSize: 12, color: col.txt }}>{avisoRevisar}</p>
                )}
                <p style={{ marginTop: 6, fontSize: 11, opacity: 0.5 }}>
                  Tolerancia: 1 € o 1 %. Se concilia sólo el total; no se cruza por proveedor (el snapshot no guarda compras por proveedor).
                </p>
              </div>
            )
          })()}

          {/* Gastos — se oculta por completo en perfil Somm.
              Motivo: el Somm solo gestiona vino; personal/alquileres/
              bancarios se llevan en Explotación. Los datos almacenados
              siguen intactos. */}
          {!esSomm && (
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
            {datos.gastos_total > 0 && (() => {
              // F4.1: Δ MoM/YoY en Total gastos. gastos_total está en
              // METRICAS_CIERRE_YOY como 'up-bad' (subir es malo).
              const g = vn('gastos_total')
              const pct = g.pct
              const tag = pct == null ? null : (pct >= 0 ? '+' : '') + pct + '%'
              const col = tag != null ? colorDelta(pct, 'up-bad') : null
              const guion = tag == null && g.title
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', fontWeight: 600, fontSize: 14 }}>
                  <span>Total gastos</span>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
                    <span>− {eur(datos.gastos_total)}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: col || (guion ? '#8b8278' : 'transparent'),
                        opacity: 0.8,
                        minWidth: 54,
                        textAlign: 'right',
                        cursor: guion ? 'help' : 'default',
                      }}
                      title={g.title || ''}
                    >
                      {tag || (guion ? '—' : '')}
                    </span>
                  </span>
                </div>
              )
            })()}
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
          )}

          {/* Resultado (perfil general) / Margen tras merma (perfil Somm).
              Somm: no se enseña el resultado neto porque no suma ni resta
              gastos operativos, personal, alquileres ni bancarios. La
              métrica útil para el sumiller es cuánto queda tras merma
              de copa. */}
          {!esSomm && (
          <div style={{ marginTop: 20, padding: '14px 0', borderTop: '2px solid rgba(255,255,255,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Resultado neto bodega</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontWeight: 700, fontSize: 20, color: resultadoColor }}>
                {datos.resultado >= 0 ? '' : '− '}{eur(Math.abs(datos.resultado))}
              </span>
              {(() => {
                const r = vn('resultado')
                if (r.pct == null) return null
                const refLabel = modoComparar === 'anio_anterior'
                  ? mesLabel(prevYearMes(mes))
                  : mesLabel(prevMes(mes))
                const esAntesDeMerma = r.base === 'antes_de_merma'
                return (
                  <div
                    style={{
                      fontSize: 12, marginTop: 2,
                      color: r.pct >= 0 ? '#4A8C6F' : '#b85454',
                      opacity: 0.8,
                      cursor: esAntesDeMerma ? 'help' : 'default',
                    }}
                    title={esAntesDeMerma ? r.title : ''}
                  >
                    {variTag(r.pct)}{esAntesDeMerma ? ' *' : ''} vs {refLabel}
                  </div>
                )
              })()}
            </div>
          </div>
          )}

          {esSomm && (() => {
            // Margen tras merma: métrica derivada del snapshot. Ver
            // app/lib/margenBodega.js. La comparación MoM/YoY se calcula
            // "fresca" desde el snapshot de referencia, respetando la
            // regla de comparabilidad de yoyCierre (prevCerrado).
            const mtm = margenTrasMerma(datos)
            if (mtm == null) return null
            const mtmColor = mtm >= 0 ? '#4A8C6F' : '#b85454'
            const prevMtm = datosComparar ? margenTrasMerma(datosComparar) : null
            const puedeComparar = (modoComparar !== 'anio_anterior' || prevCerrado) && prevMtm != null
            const refLabel = modoComparar === 'anio_anterior'
              ? mesLabel(prevYearMes(mes))
              : mesLabel(prevMes(mes))
            const pct = puedeComparar ? variPct(mtm, prevMtm) : null
            return (
              <div style={{ marginTop: 20, padding: '14px 0', borderTop: '2px solid rgba(255,255,255,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Margen tras merma</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, fontSize: 20, color: mtmColor }}>
                    {mtm >= 0 ? '' : '− '}{eur(Math.abs(mtm))}
                  </span>
                  {pct != null && (
                    <div style={{ fontSize: 12, marginTop: 2, color: pct >= 0 ? '#4A8C6F' : '#b85454', opacity: 0.8 }}>
                      {variTag(pct)} vs {refLabel}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

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
