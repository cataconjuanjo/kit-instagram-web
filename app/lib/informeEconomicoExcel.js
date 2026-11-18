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
import { getPct } from './imputacionBodega.js'
import { listarCanalesVenta, listarSalidasNoVenta } from './canalesSalidas.js'

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
  facturacion, restoIngresos = 0,
  consumoMp, totalPersonal, totalGastos, totalAlquiler,
  totalBancarios, breakEven, esSomm,
}) {
  // Layout V2: dos líneas de ingresos y un TOTAL INGRESOS que es el
  // denominador de todos los ratios y la base del resultado.
  //   row 2  Ventas netas
  //   row 3  + Resto de ingresos
  //   row 4  = TOTAL INGRESOS          (B4 = B2 + B3)
  //   row 5  − Consumo MP
  //   row 6  = Margen bruto            (B6 = B4 − B5)
  //   Acompañado:
  //     row 7  − Personal
  //     row 8  − Gastos operacionales
  //     row 9  − Alquileres
  //     row 10 − Gastos bancarios
  //     row 11 = Resultado de explotación (B11 = B6 − B7 − B8 − B9 − B10)
  //   Separador + Punto de equilibrio (sólo Acompañado con breakEven).
  //
  // Fórmulas sin "=" inicial (convención del repo). Los `result`
  // precalculados mantienen el PDF/preview coherente en Numbers y
  // LibreOffice que no recalculan al abrir.
  const resto = Number(restoIngresos) || 0
  const totalIngresos = r2(Number(facturacion) + resto)
  const margenBruto   = r2(totalIngresos - consumoMp)
  const resultadoNum  = r2(totalIngresos - consumoMp - totalPersonal - totalGastos - totalAlquiler - totalBancarios)
  const ratio = (n) => totalIngresos > 0 ? r4(n / totalIngresos) : 0

  const rowsPL = []
  // row 2 — Ventas netas
  rowsPL.push({
    concepto: 'Ventas netas',
    valor: Number(facturacion) || 0,
    pct: { formula: 'B2/B4', result: ratio(Number(facturacion) || 0) },
  })
  // row 3 — Resto de ingresos
  rowsPL.push({
    concepto: '+ Resto de ingresos de explotación',
    valor: resto,
    pct: { formula: 'B3/B4', result: ratio(resto) },
  })
  // row 4 — TOTAL INGRESOS (fórmula)
  rowsPL.push({
    concepto: '= TOTAL INGRESOS',
    valor: { formula: 'B2+B3', result: totalIngresos },
    pct: { formula: 'B4/B4', result: totalIngresos > 0 ? 1 : 0 },
  })
  // row 5 — Consumo MP
  rowsPL.push({
    concepto: '- Consumo de materia prima',
    valor: consumoMp,
    pct: { formula: 'B5/B4', result: ratio(consumoMp) },
  })
  // row 6 — Margen Bruto
  rowsPL.push({
    concepto: '= Margen bruto',
    valor: { formula: 'B4-B5', result: margenBruto },
    pct: { formula: 'B6/B4', result: ratio(margenBruto) },
  })

  const rowsExtra = []
  if (!esSomm) {
    rowsExtra.push({
      concepto: '- Personal',
      valor: totalPersonal,
      pct: { formula: 'B7/B4', result: ratio(totalPersonal) },
    })
    rowsExtra.push({
      concepto: '- Gastos operacionales',
      valor: totalGastos,
      pct: { formula: 'B8/B4', result: ratio(totalGastos) },
    })
    rowsExtra.push({
      concepto: '- Alquileres',
      valor: totalAlquiler,
      pct: { formula: 'B9/B4', result: ratio(totalAlquiler) },
    })
    rowsExtra.push({
      concepto: '- Gastos bancarios',
      valor: totalBancarios,
      pct: { formula: 'B10/B4', result: ratio(totalBancarios) },
    })
    rowsExtra.push({
      concepto: '= Resultado de explotación',
      valor: { formula: 'B6-B7-B8-B9-B10', result: resultadoNum },
      pct: { formula: 'B11/B4', result: ratio(resultadoNum) },
    })
  }

  const rows = [...rowsPL, ...rowsExtra]
  if (!esSomm && Number.isFinite(breakEven) && breakEven > 0) {
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
      { header: 'Concepto',        key: 'concepto', width: 38 },
      { header: 'Valor',           key: 'valor',    width: 16, format: FMT_EUR },
      // El denominador pasa de "Facturación" a "Total ingresos"; se
      // refleja en el header para no inducir a error al lector.
      { header: '% s/total ingresos', key: 'pct',  width: 16, format: FMT_PCT },
    ],
    rows,
    freezeHeader: true,
  }
}

// ── Hoja "Personal" (sólo Acompañado) ──────────────────────────────────────
//
// nóminas, SS, extras, total con fórmula, retenciones informativas.

// personal viene con los importes TOTAL del concepto. imputacion_pct
// se lee aquí para pintar la columna "% bodega" y una fórmula del
// "Imputado". Si imputacion_pct no está (SQL pendiente o %-default),
// el % sale 100 y el imputado = importe total → ningún número cambia.
function construirSheetPersonal(personal, imputacion_pct) {
  const nominas     = num(personal?.nominas_brutas)
  const ss          = num(personal?.ss_empresa)
  const extras      = num(personal?.extras_personal)
  const retenciones = num(personal?.retenciones_irpf)
  // % como ratio (0..1) para que el numFmt '0.0 %' lo pinte como "X,X %".
  const pctNom = getPct(imputacion_pct, 'nominas_brutas')   / 100
  const pctSs  = getPct(imputacion_pct, 'ss_empresa')       / 100
  const pctEx  = getPct(imputacion_pct, 'extras_personal')  / 100
  const pctRe  = getPct(imputacion_pct, 'retenciones_irpf') / 100
  const totalImputado = r2(nominas * pctNom + ss * pctSs + extras * pctEx)

  // Header fila 1 → data filas 2..5, total en fila 6.
  // Columnas: A=Concepto · B=Importe total (€) · C=% bodega (ratio) ·
  //           D=Imputado (€) (fórmula B*C sin "=" inicial)
  const filaImp = (rowNum) => ({
    formula: `IF(OR(NOT(ISNUMBER(B${rowNum})),NOT(ISNUMBER(C${rowNum}))),"",B${rowNum}*C${rowNum})`,
    result:  0,  // se completa abajo con el valor real por fila
  })
  const rows = [
    // row 2
    { concepto: 'Nóminas brutas',                 valor: nominas,     pct: pctNom, imputado: { ...filaImp(2), result: r2(nominas * pctNom) } },
    // row 3
    { concepto: 'Seguridad Social (empresa)',     valor: ss,          pct: pctSs,  imputado: { ...filaImp(3), result: r2(ss      * pctSs) } },
    // row 4
    { concepto: 'Extras y horas complementarias', valor: extras,      pct: pctEx,  imputado: { ...filaImp(4), result: r2(extras  * pctEx) } },
    // row 5 (total imputado)
    { concepto: 'Total personal (imputado)',      valor: null,        pct: null,
      imputado: { formula: 'SUM(D2:D4)', result: totalImputado } },
    // row 6 (retenciones informativas; no suman)
    { concepto: 'Retenciones IRPF (informativo, no suma)', valor: retenciones, pct: pctRe,
      imputado: { ...filaImp(6), result: r2(retenciones * pctRe) } },
  ]
  return {
    name: 'Personal',
    columns: [
      { header: 'Concepto',           key: 'concepto', width: 44 },
      { header: 'Importe total (€)',  key: 'valor',    width: 16, format: FMT_EUR },
      { header: '% bodega',           key: 'pct',      width: 10, format: FMT_PCT },
      { header: 'Imputado a bodega',  key: 'imputado', width: 18, format: FMT_EUR },
    ],
    rows,
    freezeHeader: true,
  }
}

// ── Hoja "Gastos" (sólo Acompañado) ────────────────────────────────────────
//
// Combina gastos generales (prorrateados), alquileres y bancarios en una
// sola tabla con columna "tipo". Total con fórmula al final.

function construirSheetGastos({ gastosPartidas, alquilerPartidas, bancarios, imputacion_pct }) {
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
      pct: getPct(imputacion_pct, 'partidas_gastos', p.id) / 100,
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
      pct: getPct(imputacion_pct, 'partidas_alquiler', p.id) / 100,
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
    rows.push({
      tipo: 'Bancario',
      concepto: b.concepto,
      importe: r2(importe),
      pct: getPct(imputacion_pct, b.key) / 100,
    })
  }

  // Imputado por fila: fórmula C*D (sin "=" inicial), result precalculado
  // para Numbers/LibreOffice. IF para mostrar "" si C o D no son números.
  const nFilas = rows.length
  rows.forEach((r, i) => {
    const row = i + 2  // data empieza en fila 2 (header=1)
    r.imputado = {
      formula: `IF(OR(NOT(ISNUMBER(C${row})),NOT(ISNUMBER(D${row}))),"",C${row}*D${row})`,
      result:  r2(num(r.importe) * num(r.pct)),
    }
  })
  const totalImporte  = r2(rows.reduce((s, r) => s + num(r.importe), 0))
  const totalImputado = r2(rows.reduce((s, r) => s + (num(r.importe) * num(r.pct)), 0))

  return {
    name: 'Gastos',
    columns: [
      { header: 'Tipo',               key: 'tipo',     width: 20 },
      { header: 'Concepto',           key: 'concepto', width: 34 },
      { header: 'Importe total (€)',  key: 'importe',  width: 16, format: FMT_EUR },
      { header: '% bodega',           key: 'pct',      width: 10, format: FMT_PCT },
      { header: 'Imputado a bodega',  key: 'imputado', width: 18, format: FMT_EUR },
    ],
    rows,
    totals: nFilas > 0 ? {
      tipo: 'TOTAL',
      importe: {
        formula: `SUM(C2:C${nFilas + 1})`,
        result: totalImporte,
      },
      imputado: {
        formula: `SUM(E2:E${nFilas + 1})`,
        result: totalImputado,
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

// ── Hoja "Canales de venta" (Fase 3) ──────────────────────────────────────
//
// Derivada del snapshot del cierre (`datosVino.informe.por_canal`) y de
// la lógica pura `listarCanalesVenta`. Fila por canal con facturado,
// coste y beneficio. Totales como fórmula SUM; % como ratio.
// Devuelve null si no hay datos (el workbook omitirá la hoja).

function construirSheetCanalesVenta({ datosVino }) {
  const porCanal = datosVino?.informe?.por_canal
  if (!porCanal) return null
  const ivaPct = Number.isFinite(Number(datosVino?.iva_pct)) ? Number(datosVino.iva_pct) : null
  // Fase A: si el snapshot trae `informe.eventos` (producido por
  // calcularMesBodega leyendo la tabla eventos_bodega), lo pasamos a
  // listarCanalesVenta para que añada las filas "Maridaje" y
  // "Grupos / Eventos" con sus ingresos NETOS NO incluidos en TPV.
  // Si no hay eventos (tabla ausente o mes sin cabeceras), queda
  // igual que main.
  const eventos = datosVino?.informe?.eventos || null
  const filas = listarCanalesVenta(porCanal, { iva_pct: ivaPct, eventos })
  if (filas.length === 0) return null

  const CANAL_LABEL = {
    botella:  'Botella (mesa)',
    copa:     'Copa',
    maridaje: 'Maridaje',
    evento:   'Grupos / Eventos',
  }
  const nFilas   = filas.length
  const rowTotal = nFilas + 2  // header=1, filas 2..nFilas+1, total nFilas+2

  // Layout (Fase B — PAX separada de uds):
  //   A canal | B uds | C copas | D pax | E bruto | F neto | G coste | H beneficio
  // uds sólo recoge botellas (no comensales). pax sólo recoge
  // comensales de eventos. El TOTAL de cada columna suma SOLO su
  // columna; ningún total mezcla uds con pax.
  const rows = filas.map((f, i) => {
    const rowNum = i + 2
    return {
      canal: CANAL_LABEL[f.canal] || f.canal,
      uds:   f.uds ?? '',
      copas: f.copas ?? '',
      pax:   f.pax ?? '',
      ingresos_bruto: f.ingresos_bruto,
      ingresos_neto:  f.ingresos_neto,
      coste: f.coste,
      // Beneficio como fórmula F-G (ingresos_neto − coste) para que
      // Excel lo recalcule si el usuario edita. Sin IVA.
      beneficio: {
        formula: `F${rowNum}-G${rowNum}`,
        result: f.beneficio,
      },
    }
  })

  const r2 = (n) => Math.round(Number(n) * 100) / 100
  const sum = (key) => r2(filas.reduce((s, f) => s + Number(f[key] || 0), 0))
  const totals = {
    canal: 'TOTAL',
    uds:            { formula: `SUM(B2:B${nFilas + 1})`, result: sum('uds') },
    copas:          '',
    pax:            { formula: `SUM(D2:D${nFilas + 1})`, result: sum('pax') },
    ingresos_bruto: { formula: `SUM(E2:E${nFilas + 1})`, result: sum('ingresos_bruto') },
    ingresos_neto:  { formula: `SUM(F2:F${nFilas + 1})`, result: sum('ingresos_neto') },
    coste:          { formula: `SUM(G2:G${nFilas + 1})`, result: sum('coste') },
    beneficio: {
      formula: `F${rowTotal}-G${rowTotal}`,
      result: sum('beneficio'),
    },
  }

  return {
    name: 'Canales venta',
    columns: [
      { header: 'Canal',               key: 'canal',          width: 22 },
      { header: 'uds',                 key: 'uds',            width: 10 },
      { header: 'copas',               key: 'copas',          width: 10 },
      { header: 'PAX',                 key: 'pax',            width: 10 },
      { header: `Facturado bruto c/IVA ${ivaPct ?? ''}% (€)`.trim(), key: 'ingresos_bruto', width: 22, format: FMT_EUR },
      { header: 'Facturado NETO (€)',  key: 'ingresos_neto',  width: 20, format: FMT_EUR },
      { header: 'Coste (€)',           key: 'coste',          width: 14, format: FMT_EUR },
      { header: 'Beneficio (€)',       key: 'beneficio',      width: 16, format: FMT_EUR },
    ],
    rows,
    totals,
    freezeHeader: true,
  }
}

// ── Hoja "Salidas no-venta" (Fase 3) ──────────────────────────────────────

function construirSheetSalidasNoVenta({ datosVino }) {
  const porCanal = datosVino?.informe?.por_canal
  if (!porCanal) return null
  const filas = listarSalidasNoVenta(porCanal)
  if (filas.length === 0) return null

  const LABEL = {
    invitacion_botella: 'Invitación (botella)',
    invitacion_copa:    'Invitación (copa)',
    cocina:             'Cocina',
    grupo_evento:       'Grupo / Evento',
    maridaje:           'Maridaje',
    rotura:             'Rotura / defecto',
    cata:               'Cata interna',
  }
  const nFilas = filas.length

  const rows = filas.map(f => ({
    canal: LABEL[f.canal] || f.canal,
    uds:   f.uds,
    copas: f.copas ?? '',
    coste: f.coste,
  }))

  const totals = {
    canal: 'TOTAL',
    uds:   { formula: `SUM(B2:B${nFilas + 1})`, result: filas.reduce((s, f) => s + f.uds, 0) },
    copas: '',
    coste: { formula: `SUM(D2:D${nFilas + 1})`, result: filas.reduce((s, f) => s + f.coste, 0) },
  }

  return {
    name: 'Salidas no-venta',
    columns: [
      { header: 'Canal',     key: 'canal', width: 22 },
      { header: 'uds',       key: 'uds',   width: 10 },
      { header: 'copas',     key: 'copas', width: 10 },
      { header: 'Coste (€)', key: 'coste', width: 14, format: FMT_EUR },
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
  facturacion,           // ventas netas
  restoIngresos = 0,     // resto de ingresos de explotación (nueva columna)
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
  // % imputable a bodega por concepto (ver app/lib/imputacionBodega.js).
  // Default {} ≡ 100 % en todo ≡ comportamiento histórico.
  imputacion_pct = {},
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
    facturacion: fact, restoIngresos: num(restoIngresos), consumoMp: cmp,
    totalPersonal: tp, totalGastos: tg, totalAlquiler: ta, totalBancarios: tb,
    breakEven, esSomm,
  }))

  if (!esSomm) {
    sheets.push(construirSheetPersonal(personal, imputacion_pct))
    sheets.push(construirSheetGastos({ gastosPartidas, alquilerPartidas, bancarios, imputacion_pct }))
  }

  const sheetCompras = construirSheetCompras({ registrosCompras, periodo, restauranteNombre })
  if (sheetCompras) sheets.push(sheetCompras)

  sheets.push(construirSheetCanales({ canales }))

  // Hojas de Fase 3: desglose REAL por canal y salidas no-venta
  // extraídas del snapshot del cierre (`datosVino.informe.por_canal`).
  // Se añaden sólo si hay datos para no inflar el .xlsx con hojas
  // vacías cuando el mes no se ha cerrado todavía.
  const sheetCanalesReales = construirSheetCanalesVenta({ datosVino })
  if (sheetCanalesReales) sheets.push(sheetCanalesReales)

  const sheetSalidasNoVenta = construirSheetSalidasNoVenta({ datosVino })
  if (sheetSalidasNoVenta) sheets.push(sheetSalidasNoVenta)

  const sheetCierre = construirSheetCierre({ datosVino })
  if (sheetCierre) sheets.push(sheetCierre)

  // Metadata a nivel raíz consumida por excelSommDownload.js para
  // pintar el header/footer de impresión con identidad Carta Viva.
  // Si no se pasa restauranteNombre/periodo quedan vacíos → el header
  // simplemente no muestra esos campos (degradación limpia).
  return {
    filename,
    sheets,
    restauranteNombre: restauranteNombre || '',
    periodo:           periodo           || '',
  }
}
