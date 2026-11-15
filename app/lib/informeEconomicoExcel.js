/**
 * informeEconomicoExcel.js — Spec de workbook para el "Informe económico"
 * del periodo desde /dashboard/explotacion.
 *
 * Reutiliza:
 *   - construirComprasWorkbook, slugRestaurante (de excelSomm.js)
 *   - descargarWorkbook (de excelSommDownload.js, en el llamador)
 *
 * No depende de ExcelJS: devuelve una spec plana que descargarWorkbook
 * convierte en .xlsx vía import dinámico.
 *
 * Reglas:
 *  - Importes como números reales (no strings) con formato numérico es-ES.
 *  - Importes sin IVA (parametros_explotacion ya son netos).
 *  - Totales y márgenes como FÓRMULAS con result precalculado.
 *  - Perfil Somm (esSomm=true) omite las hojas Personal y Gastos y las
 *    filas de personal/alquiler/bancarios del Resumen, igual que la UI.
 */

import { construirComprasWorkbook, slugRestaurante } from './excelSomm.js'

const FMT_EUR = '#,##0.00 €'
const FMT_PCT = '0.0 %'        // numFmt sobre ratio (0.32 → "32.0 %")

function num(v) {
  if (v === null || v === undefined) return 0
  if (typeof v === 'string') v = v.replace(',', '.')
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function r2(n) { return Math.round(n * 100) / 100 }
function r4(n) { return Math.round(n * 10000) / 10000 }

// ── Hoja "Resumen" ─────────────────────────────────────────────────────────
//
// Cada fila es { concepto, valor, pct }. "valor" y "pct" pueden ser número o
// { formula, result }. ExcelJS respeta ambos. Los ratios van como fracción
// (0.32) con numFmt "0.0 %", para que Excel los muestre como "32.0 %" sin
// tener que multiplicar por 100 en la fórmula.

function construirSheetResumen({
  facturacion, consumoMp, totalPersonal, totalGastos, totalAlquiler,
  totalBancarios, breakEven, esSomm,
}) {
  const margenBruto = r2(facturacion - consumoMp)
  const resultadoNum = r2(facturacion - consumoMp - totalPersonal - totalGastos - totalAlquiler - totalBancarios)
  const ratio = (n) => facturacion > 0 ? r4(n / facturacion) : 0

  // Filas; la fila 1 de Excel es el header, así que las data rows empiezan en 2.
  // Los índices que uso en las fórmulas son los de la columna "valor" = B.
  // Convención del dominio (ver excelSomm.js): las fórmulas se pasan a
  // ExcelJS SIN "=" inicial. El "=" lo añade Excel al mostrarlas; si lo
  // incluimos acaba literal en <f>=...</f> y rompe el recálculo.
  const rowsPL = []
  // Fila 2: Facturación (siempre 100%)
  rowsPL.push({
    concepto: 'Facturación',
    valor: facturacion,
    pct: { formula: 'B2/B2', result: facturacion > 0 ? 1 : 0 },
  })
  // Fila 3: Consumo MP
  rowsPL.push({
    concepto: '- Consumo de materia prima',
    valor: consumoMp,
    pct: { formula: 'B3/B2', result: ratio(consumoMp) },
  })
  // Fila 4: Margen Bruto (fórmula)
  rowsPL.push({
    concepto: '= Margen bruto',
    valor: { formula: 'B2-B3', result: margenBruto },
    pct: { formula: 'B4/B2', result: ratio(margenBruto) },
  })

  const rowsExtra = []
  if (!esSomm) {
    // Filas 5–8: Personal, Gastos, Alquileres, Bancarios
    rowsExtra.push({
      concepto: '- Personal',
      valor: totalPersonal,
      pct: { formula: 'B5/B2', result: ratio(totalPersonal) },
    })
    rowsExtra.push({
      concepto: '- Gastos operacionales',
      valor: totalGastos,
      pct: { formula: 'B6/B2', result: ratio(totalGastos) },
    })
    rowsExtra.push({
      concepto: '- Alquileres',
      valor: totalAlquiler,
      pct: { formula: 'B7/B2', result: ratio(totalAlquiler) },
    })
    rowsExtra.push({
      concepto: '- Gastos bancarios',
      valor: totalBancarios,
      pct: { formula: 'B8/B2', result: ratio(totalBancarios) },
    })
    // Fila 9: Resultado de explotación
    rowsExtra.push({
      concepto: '= Resultado de explotación',
      valor: { formula: 'B4-B5-B6-B7-B8', result: resultadoNum },
      pct: { formula: 'B9/B2', result: ratio(resultadoNum) },
    })
  }

  const rows = [...rowsPL, ...rowsExtra]
  // Fila final: Punto de equilibrio (sólo si tiene sentido, es decir, si hay
  // gastos fijos; en Somm reducido no se muestra porque no cargamos costes).
  if (!esSomm && Number.isFinite(breakEven) && breakEven > 0) {
    // separador visual: una fila vacía
    rows.push({ concepto: '', valor: null, pct: null })
    rows.push({
      concepto: 'Punto de equilibrio',
      valor: r2(breakEven),
      pct: null,
    })
  }

  return {
    name: 'Resumen',
    columns: [
      { header: 'Concepto',    key: 'concepto', width: 34 },
      { header: 'Valor',       key: 'valor',    width: 16, format: FMT_EUR },
      { header: '% s/fact.',   key: 'pct',      width: 12, format: FMT_PCT },
    ],
    rows,
    freezeHeader: true,
  }
}

// ── Hoja "Personal" (sólo Acompañado) ──────────────────────────────────────
//
// nóminas, SS, extras, total con fórmula, retenciones informativas.

function construirSheetPersonal(personal) {
  const nominas     = num(personal?.nominas_brutas)
  const ss          = num(personal?.ss_empresa)
  const extras      = num(personal?.extras_personal)
  const retenciones = num(personal?.retenciones_irpf)
  const totalPersonal = r2(nominas + ss + extras)

  // Header fila 1 → data filas 2..5, total en fila 6.
  const rows = [
    { concepto: 'Nóminas brutas',               valor: nominas },
    { concepto: 'Seguridad Social (empresa)',   valor: ss },
    { concepto: 'Extras y horas complementarias', valor: extras },
    { concepto: 'Total personal',
      valor: { formula: 'SUM(B2:B4)', result: totalPersonal } },
    { concepto: 'Retenciones IRPF (informativo, no suma)', valor: retenciones },
  ]
  return {
    name: 'Personal',
    columns: [
      { header: 'Concepto',     key: 'concepto', width: 42 },
      { header: 'Importe (€)',  key: 'valor',    width: 14, format: FMT_EUR },
    ],
    rows,
    freezeHeader: true,
  }
}

// ── Hoja "Gastos" (sólo Acompañado) ────────────────────────────────────────
//
// Combina gastos generales (prorrateados), alquileres y bancarios en una
// sola tabla con columna "tipo". Total con fórmula al final.

function construirSheetGastos({ gastosPartidas, alquilerPartidas, bancarios }) {
  const rows = []
  // Gastos operacionales con prorrateo por amortizar_meses.
  for (const p of (gastosPartidas || [])) {
    const importe = num(p.importe)
    const meses = Math.max(1, num(p.amortizar_meses) || 1)
    const importeMensual = r2(importe / meses)
    if (!importe) continue
    rows.push({
      tipo: 'Gasto operacional',
      concepto: p.categoria || p.id || '—',
      importe: importeMensual,
    })
  }
  // Alquileres.
  for (const p of (alquilerPartidas || [])) {
    const importe = num(p.importe)
    if (!importe) continue
    rows.push({
      tipo: 'Alquiler',
      concepto: p.concepto || p.id || '—',
      importe: r2(importe),
    })
  }
  // Bancarios.
  const bancariosDef = [
    { key: 'comisiones_datafono',    concepto: 'Comisiones datáfono' },
    { key: 'mantenimiento_datafono', concepto: 'Mantenimiento datáfono' },
    { key: 'resto_comisiones',       concepto: 'Resto de comisiones' },
  ]
  for (const b of bancariosDef) {
    const importe = num(bancarios?.[b.key])
    if (!importe) continue
    rows.push({ tipo: 'Bancario', concepto: b.concepto, importe: r2(importe) })
  }

  const totalImporte = r2(rows.reduce((s, r) => s + num(r.importe), 0))
  const nFilas = rows.length

  return {
    name: 'Gastos',
    columns: [
      { header: 'Tipo',         key: 'tipo',     width: 20 },
      { header: 'Concepto',     key: 'concepto', width: 34 },
      { header: 'Importe (€)',  key: 'importe',  width: 14, format: FMT_EUR },
    ],
    rows,
    totals: nFilas > 0 ? {
      tipo: 'TOTAL',
      importe: {
        formula: `SUM(C2:C${nFilas + 1})`,
        result: totalImporte,
      },
    } : null,
    freezeHeader: true,
  }
}

// ── Hoja "Compras" ─────────────────────────────────────────────────────────
//
// Reutilizamos construirComprasWorkbook y tomamos su primera (única) hoja,
// renombrándola a "Compras". Si no hay facturas, devolvemos null para
// que el llamador no añada la hoja.

function construirSheetCompras({ registrosCompras, periodo, restauranteNombre }) {
  const spec = construirComprasWorkbook({
    registros: registrosCompras,
    periodoFiltro: periodo,
    restauranteNombre,
  })
  if (spec.empty || !spec.sheets.length) return null
  const sh = spec.sheets[0]
  return { ...sh, name: 'Compras' }
}

// ── Hoja "Canales" ─────────────────────────────────────────────────────────

function construirSheetCanales({ canales }) {
  const canalesDef = [
    { key: 'copa_barra',      label: 'Copa en barra' },
    { key: 'botella_mesa',    label: 'Botella en mesa' },
    { key: 'grupos_eventos',  label: 'Grupos / Eventos' },
    { key: 'take_away',       label: 'Para llevar' },
  ]
  // 1) Importes crudos por canal.
  const rawRows = canalesDef.map(c => ({
    canal: c.label,
    importe: r2(num(canales?.[c.key])),
  }))
  // 2) TOTAL y layout de celdas. Header en fila 1, canales en 2..nFilas+1,
  //    fila TOTAL en nFilas+2. Para 4 canales ⇒ TOTAL en fila 6.
  const nFilas   = rawRows.length
  const totalRow = nFilas + 2
  const totalImporte = r2(rawRows.reduce((s, r) => s + r.importe, 0))

  // 3) % por canal = importe / TOTAL de canales. Si todos los canales están
  //    asignados a la facturación, coincide con % s/facturación. Si no,
  //    el TOTAL siempre suma 100 %, que es lo que espera el lector del
  //    informe (el detalle del reparto dentro del vino).
  const rows = rawRows.map((r, i) => {
    const fila = i + 2
    if (totalImporte > 0) {
      return {
        ...r,
        pct: {
          formula: `B${fila}/B${totalRow}`,
          result: r4(r.importe / totalImporte),
        },
      }
    }
    return { ...r, pct: 0 }
  })

  const totals = {
    canal: 'TOTAL',
    importe: {
      formula: `SUM(B2:B${nFilas + 1})`,
      result: totalImporte,
    },
    pct: totalImporte > 0
      ? { formula: `B${totalRow}/B${totalRow}`, result: 1 }
      : 0,
  }
  return {
    name: 'Canales',
    columns: [
      { header: 'Canal',        key: 'canal',   width: 22 },
      { header: 'Importe (€)',  key: 'importe', width: 14, format: FMT_EUR },
      { header: '%',            key: 'pct',     width: 10, format: FMT_PCT },
    ],
    rows,
    totals,
    freezeHeader: true,
  }
}

// ── Hoja "Cierre bodega" (sólo si hay cierre del periodo) ──────────────────

function construirSheetCierre({ datosVino }) {
  if (!datosVino) return null
  const d = datosVino
  const ventasBruto = num(d.ventas_bruto)
  const ventasNeto  = num(d.ventas_neto)
  const ivaPct      = num(d.iva_pct) || 10
  const ivaImporte  = r2(ventasBruto - ventasNeto)

  const rows = [
    { concepto: 'Ventas brutas (con IVA)',           valor: r2(ventasBruto) },
    { concepto: `IVA ${ivaPct}%`,                    valor: ivaImporte },
    { concepto: 'Ventas netas (sin IVA)',            valor: r2(ventasNeto) },
    { concepto: 'Coste de ventas teórico',           valor: r2(num(d.coste_ventas_teorico)) },
    { concepto: 'Margen bruto',                      valor: r2(num(d.margen_bruto)) },
    { concepto: 'Compras brutas',                    valor: r2(num(d.compras_bruto)) },
    { concepto: 'Devoluciones',                      valor: r2(num(d.devoluciones)) },
    { concepto: 'Compras netas',                     valor: r2(num(d.compras_netas)) },
    { concepto: 'Salidas no venta',                  valor: r2(num(d.salidas_no_venta)) },
    { concepto: 'Merma copa',                        valor: r2(num(d.merma_copa_eur)) },
    { concepto: 'Diferencias de inventario',         valor: d.diferencias_inventario == null ? null : r2(num(d.diferencias_inventario)) },
    { concepto: 'Stock inicial',                     valor: d.stock_inicial == null ? null : r2(num(d.stock_inicial)) },
    { concepto: 'Stock final',                       valor: d.stock_final   == null ? null : r2(num(d.stock_final)) },
  ]
  return {
    name: 'Cierre bodega',
    columns: [
      { header: 'Concepto',    key: 'concepto', width: 34 },
      { header: 'Valor (€)',   key: 'valor',    width: 16, format: FMT_EUR },
    ],
    rows,
    freezeHeader: true,
  }
}

// ── Entrypoint ─────────────────────────────────────────────────────────────

export function construirInformeEconomicoWorkbook({
  restauranteNombre,
  periodo,
  esSomm = false,
  // datos del P&L (ya calculados en la pantalla de Explotación)
  facturacion,
  consumoMp,
  totalPersonal,
  totalGastos,
  totalAlquiler,
  totalBancarios,
  breakEven,
  // detalle para las hojas Personal/Gastos (sólo Acompañado los usa)
  personal,
  gastosPartidas,
  alquilerPartidas,
  bancarios,
  // canales
  canales,
  // compras del periodo (array crudo de libro_compras)
  registrosCompras,
  // cierre mensual de bodega (snapshot) o null si no existe
  datosVino,
}) {
  const slug = slugRestaurante(restauranteNombre)
  const filename = `informe-economico-${slug}-${periodo}.xlsx`

  const fact = num(facturacion)
  const cmp  = num(consumoMp)
  const tp   = num(totalPersonal)
  const tg   = num(totalGastos)
  const ta   = num(totalAlquiler)
  const tb   = num(totalBancarios)

  const sheets = []
  sheets.push(construirSheetResumen({
    facturacion: fact, consumoMp: cmp,
    totalPersonal: tp, totalGastos: tg, totalAlquiler: ta, totalBancarios: tb,
    breakEven, esSomm,
  }))

  if (!esSomm) {
    sheets.push(construirSheetPersonal(personal))
    sheets.push(construirSheetGastos({ gastosPartidas, alquilerPartidas, bancarios }))
  }

  const sheetCompras = construirSheetCompras({ registrosCompras, periodo, restauranteNombre })
  if (sheetCompras) sheets.push(sheetCompras)

  sheets.push(construirSheetCanales({ canales }))

  const sheetCierre = construirSheetCierre({ datosVino })
  if (sheetCierre) sheets.push(sheetCierre)

  return { filename, sheets }
}
