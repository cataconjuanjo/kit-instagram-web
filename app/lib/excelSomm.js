import { readDesglose, CATEGORIAS_SALIDA_SIN_VENTA } from './cierreDesglose.js'
import { calcularRatios, diasDelMes } from './ratiosCierre.js'
import { conciliarCompras } from './conciliacionCompras.js'
import {
  leerExtrasHistorico,
  tieneHistoricoExtras,
  ratiosHistoricos,
  coincideMesHistorico,
} from './historicoExtras.js'

/**
 * Construye las filas "Histórico mes del año anterior" que se inyectan
 * al final de la hoja "Ratios" del cierre mensual. Devuelve siempre
 * texto plano (nunca fórmulas): "Sin dato" cuando la fila de
 * historico_mensual no tiene extras utilizables, cuando la fila no
 * corresponde exactamente al (año-1, mes) del cierre exportado, o
 * cuando no se pasa fila alguna.
 *
 * La guarda `coincideMesHistorico` es la última red de seguridad: si
 * aun así la UI pasase una fila obsoleta de otro mes (p. ej. tras un
 * cambio rápido con los botones ◄ ►), aquí se trata como "Sin dato"
 * y la hoja Ratios no contiene cifras cruzadas.
 *
 * Firma export para poder testearla aislada.
 */
export function construirFilasHistoricoPrevYear(mesActual, historicoPrevYear) {
  if (!historicoPrevYear) return []
  const [yStr, mStr] = String(mesActual || '').split('-')
  const y = parseInt(yStr, 10)
  const m = parseInt(mStr, 10)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return []
  const prevYearMesStr = `${y - 1}-${String(m).padStart(2, '0')}`
  const coincide = coincideMesHistorico(mesActual, historicoPrevYear)
  const extras   = coincide ? leerExtrasHistorico(historicoPrevYear) : {}
  const hayDato  = coincide && tieneHistoricoExtras(historicoPrevYear)
  const rh = hayDato
    ? ratiosHistoricos({
        extras,
        consumo_mp: Number(historicoPrevYear.consumo_mp),
        dias: diasDelMes(prevYearMesStr),
      })
    : { rotacion: null, cobertura_dias: null, consumo_vs_compras: null }
  const texto = (v) => (hayDato && v != null) ? v : 'Sin dato'
  return [
    { concepto: `Histórico ${prevYearMesStr} · Rotación`,          valor: texto(rh.rotacion) },
    { concepto: `Histórico ${prevYearMesStr} · Cobertura (días)`,  valor: texto(rh.cobertura_dias) },
    { concepto: `Histórico ${prevYearMesStr} · Consumo / compras`, valor: texto(rh.consumo_vs_compras) },
  ]
}

/**
 * excelSomm.js — Construye SPECS de workbook para las 3 exportaciones del
 * perfil Somm: libro de bodega, libro de compras, cierre mensual.
 *
 * Las funciones NO dependen de ExcelJS; devuelven una estructura de datos
 * pura y testeable. El runtime (dashboard client) se encarga de convertir
 * la spec en un .xlsx vía import() dinámico. Separación testeable/download.
 *
 * Estructura de spec:
 *   {
 *     filename: string,                       // 'slug-libro-2026.xlsx'
 *     sheets: [{
 *       name: string,                         // nombre de hoja
 *       columns: [{
 *         header, key, width,
 *         format?,                            // ExcelJS numFmt string
 *       }],
 *       rows: [{ [key]: value }, ...],
 *       totals?: { [key]: { formula, result } | number | string },
 *                  // result = suma numérica real precalculada (número),
 *                  // para que Numbers/LibreOffice muestren el valor sin
 *                  // recalcular. Excel la respeta y la actualiza al abrir.
 *       freezeHeader: boolean,                // panel congelado fila 1
 *     }]
 *   }
 */

/**
 * Suma numérica de una clave sobre un array de filas. Ignora no-números.
 * Redondea a 2 decimales (coherente con el resto del dominio).
 */
function sumNumeric(rows, key) {
  let s = 0
  for (const r of rows) {
    const v = r[key]
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return Math.round(s * 100) / 100
}

const FMT_EUR     = '#,##0.00 €'
const FMT_INT     = '#,##0'
const FMT_PCT_1   = '0.0 %'    // ExcelJS lo renderiza como porcentaje si el valor es ratio
const FMT_PCT_RAW = '0.0'       // Para cuando ya guardamos el valor como entero + '%' visual
const FMT_DATE    = 'yyyy-mm-dd'

export function slugRestaurante(nombre) {
  if (!nombre) return 'restaurante'
  return String(nombre).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    || 'restaurante'
}

/**
 * Devuelve la columna Excel (A, B, …, AA, AB) para un índice 1-basado.
 */
export function colLetter(idx1) {
  let n = idx1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

// ── 1) LIBRO DE BODEGA ───────────────────────────────────────────────────────

const COLS_LIBRO = [
  { header: 'Vino',                 key: 'nombre',           width: 36 },
  { header: 'Tipo',                 key: 'tipo',             width: 10 },
  { header: 'Stock inicial',        key: 'stock_ini',        width: 12, format: FMT_INT },
  { header: 'Entradas (u)',         key: 'entradas_u',       width: 12, format: FMT_INT },
  { header: 'Entradas (€)',         key: 'entradas_eur',     width: 14, format: FMT_EUR },
  { header: 'Botella vendida (u)',  key: 'ventas_bot_u',     width: 14, format: FMT_INT },
  { header: 'Botella vendida (€)',  key: 'ventas_bot_eur',   width: 14, format: FMT_EUR },
  { header: 'Botella abierta copa', key: 'ventas_copa_u',    width: 16, format: FMT_INT },
  { header: 'Copas servidas',       key: 'copas_servidas_u', width: 14, format: FMT_INT },
  { header: 'Copa vendida (€)',     key: 'ventas_copa_eur',  width: 14, format: FMT_EUR },
  { header: 'Otras salidas (u)',    key: 'otras_salidas_u',  width: 12, format: FMT_INT },
  { header: 'Ajustes (u)',          key: 'ajustes_u',        width: 10, format: FMT_INT },
  { header: 'Stock final',          key: 'stock_fin',        width: 12, format: FMT_INT },
  { header: 'CoGS teórico (€)',     key: 'coste_teorico_ventas', width: 15, format: FMT_EUR },
  { header: 'Consumo real (€)',     key: 'consumo_real_stock',   width: 15, format: FMT_EUR },
  { header: 'Δ consumo (€)',        key: 'diferencia_consumo',   width: 14, format: FMT_EUR },
  { header: 'Coste medio (€)',      key: 'coste_medio',      width: 12, format: FMT_EUR },
  { header: 'Descuadre u',          key: 'descuadre',        width: 10, format: FMT_INT },
]

const COLS_LIBRO_SUMABLES = [
  'entradas_u', 'entradas_eur', 'ventas_bot_u', 'ventas_bot_eur',
  'ventas_copa_u', 'copas_servidas_u', 'ventas_copa_eur',
  'otras_salidas_u', 'coste_teorico_ventas', 'consumo_real_stock',
  'diferencia_consumo',
]

const COLS_RESUMEN_LIBRO = [
  { header: 'Mes',                key: 'mes',                  width: 10 },
  { header: 'Estado',             key: 'estado',               width: 10 },
  { header: 'Vinos activos',      key: 'vinos_activos',        width: 12, format: FMT_INT },
  { header: 'CoGS teórico (€)',   key: 'coste_teorico_ventas', width: 15, format: FMT_EUR },
  { header: 'Consumo real (€)',   key: 'consumo_real_stock',   width: 15, format: FMT_EUR },
  { header: 'Δ consumo (€)',      key: 'diferencia_consumo',   width: 14, format: FMT_EUR },
]

export function filtrarMesesLibro(meses, { filtroMes = '', filtroTipo = '' } = {}) {
  const mesesFiltrados = (meses || []).filter(m => !filtroMes || m.mes === filtroMes)
  return mesesFiltrados
    .map(m => {
      const vinos = (m.vinos || []).filter(v => !filtroTipo || v.tipo === filtroTipo)
      return { ...m, vinos }
    })
    .filter(m => m.vinos.length > 0)
}

export function construirLibroWorkbook({
  meses, anio, filtroMes = '', filtroTipo = '', restauranteNombre,
}) {
  const slug = slugRestaurante(restauranteNombre)
  const periodo = filtroMes || String(anio)
  const filename = `${slug}-libro-${periodo}.xlsx`

  const mesesVisibles = filtrarMesesLibro(meses, { filtroMes, filtroTipo })
  if (mesesVisibles.length === 0) {
    return { filename, sheets: [], empty: true }
  }

  // Hoja Resumen (por mes)
  const sheets = []
  const resumenRows = mesesVisibles.map(m => ({
    mes:                  m.mes,
    estado:               m.estado,
    vinos_activos:        m.vinos.length,
    coste_teorico_ventas: m.totales?.coste_teorico_ventas ?? 0,
    consumo_real_stock:   m.totales?.consumo_real_stock   ?? 0,
    diferencia_consumo:   m.totales?.diferencia_consumo   ?? 0,
  }))
  sheets.push({
    name: 'Resumen',
    columns: COLS_RESUMEN_LIBRO,
    rows: resumenRows,
    totals: totalesResumenLibro(resumenRows),
    freezeHeader: true,
  })

  // Hoja por mes visible
  for (const m of mesesVisibles) {
    const vinosRows = m.vinos.map(v => ({
      nombre:               v.nombre,
      tipo:                 v.tipo ?? '',
      stock_ini:            v.stock_ini,
      entradas_u:           v.entradas_u,
      entradas_eur:         v.entradas_eur,
      ventas_bot_u:         v.ventas_bot_u,
      ventas_bot_eur:       v.ventas_bot_eur,
      ventas_copa_u:        v.ventas_copa_u,
      copas_servidas_u:     v.copas_servidas_u,
      ventas_copa_eur:      v.ventas_copa_eur,
      otras_salidas_u:      v.otras_salidas_u,
      ajustes_u:            v.ajustes_u,
      stock_fin:            v.stock_fin,
      coste_teorico_ventas: v.coste_teorico_ventas,
      consumo_real_stock:   v.consumo_real_stock,
      diferencia_consumo:   v.diferencia_consumo,
      coste_medio:          v.coste_medio,
      descuadre:            v.descuadre,
    }))
    sheets.push({
      name: m.mes,  // 'YYYY-MM'
      columns: COLS_LIBRO,
      rows: vinosRows,
      totals: totalesLibroMes(vinosRows),
      freezeHeader: true,
    })
  }

  return { filename, sheets }
}

function totalesLibroMes(rows) {
  const nFilas = rows.length
  const row = { nombre: 'TOTAL' }
  const fIni = 2
  const fFin = nFilas + 1
  for (const key of COLS_LIBRO_SUMABLES) {
    const idx = COLS_LIBRO.findIndex(c => c.key === key)
    if (idx < 0) continue
    const col = colLetter(idx + 1)
    row[key] = {
      formula: `SUM(${col}${fIni}:${col}${fFin})`,
      result:  sumNumeric(rows, key),
    }
  }
  return row
}

function totalesResumenLibro(rows) {
  const nMeses = rows.length
  const row = { mes: 'TOTAL' }
  const fIni = 2
  const fFin = nMeses + 1
  for (const key of ['coste_teorico_ventas', 'consumo_real_stock', 'diferencia_consumo']) {
    const idx = COLS_RESUMEN_LIBRO.findIndex(c => c.key === key)
    const col = colLetter(idx + 1)
    row[key] = {
      formula: `SUM(${col}${fIni}:${col}${fFin})`,
      result:  sumNumeric(rows, key),
    }
  }
  return row
}

// ── 2) LIBRO DE COMPRAS ──────────────────────────────────────────────────────

const COLS_COMPRAS = [
  { header: 'Fecha',          key: 'fecha',     width: 12 },
  { header: 'Proveedor',      key: 'proveedor', width: 32 },
  { header: 'Importe (€)',    key: 'importe',   width: 14, format: FMT_EUR },
  { header: 'Albarán / Ref.', key: 'albaran',   width: 20 },
]

export function filasComprasVisibles(registros, periodoFiltro) {
  const filtrados = (registros || []).filter(r => r.periodo === periodoFiltro)
  return filtrados.flatMap(r =>
    (r.facturas || []).map(f => ({
      fecha:     f.fecha || '',
      proveedor: r.proveedor || '',
      importe:   Number(f.importe) || 0,
      albaran:   f.albaran || '',
    }))
  ).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
}

export function construirComprasWorkbook({
  registros, periodoFiltro, restauranteNombre,
}) {
  const slug     = slugRestaurante(restauranteNombre)
  const periodo  = periodoFiltro || 'periodo'
  const filename = `${slug}-compras-${periodo}.xlsx`

  const filas = filasComprasVisibles(registros, periodoFiltro)
  if (filas.length === 0) return { filename, sheets: [], empty: true }

  return {
    filename,
    sheets: [{
      name: periodoFiltro,
      columns: COLS_COMPRAS,
      rows: filas,
      totals: totalesCompras(filas),
      freezeHeader: true,
    }],
  }
}

function totalesCompras(rows) {
  const nFilas = rows.length
  const idx = COLS_COMPRAS.findIndex(c => c.key === 'importe')
  const col = colLetter(idx + 1)
  return {
    proveedor: 'TOTAL',
    importe:   {
      formula: `SUM(${col}2:${col}${nFilas + 1})`,
      result:  sumNumeric(rows, 'importe'),
    },
  }
}

// ── 3) CIERRE MENSUAL (Vinos) ────────────────────────────────────────────────

const COLS_CIERRE_VINOS = [
  { header: 'Vino',              key: 'nombre',         width: 36 },
  { header: 'Botellas vendidas', key: 'uds',            width: 14, format: FMT_INT },
  { header: 'Copas servidas',    key: 'copas',          width: 14, format: FMT_INT },
  { header: 'Ingresos (€ brutos)', key: 'ingresos',     width: 14, format: FMT_EUR },
  { header: 'Coste unitario (€)',  key: 'coste_unitario', width: 14, format: FMT_EUR },
  { header: 'Margen (%)',        key: 'margen_pct',     width: 10, format: FMT_PCT_RAW },
  { header: 'Tiene coste',       key: 'tiene_coste',    width: 10 },
]

export function construirCierreWorkbook({
  datos, mes, restauranteNombre,
  esSomm = false, facturasLibro = [],
  historicoPrevYear = null,
}) {
  const slug = slugRestaurante(restauranteNombre)
  const filename = `${slug}-cierre-${mes}.xlsx`

  const porVino = datos?.informe?.por_vino || []
  if (porVino.length === 0) return { filename, sheets: [], empty: true }

  // Hoja Vinos
  const vinosRows = porVino.map(v => ({
    nombre:         v.nombre || '',
    uds:            Number(v.uds) || 0,
    copas:          Number(v.copas) || 0,
    ingresos:       Number(v.ingresos) || 0,
    coste_unitario: Number(v.coste_unitario) || 0,
    margen_pct:     v.margen_pct ?? null,
    tiene_coste:    v.tiene_coste ? 'sí' : 'no',
  }))
  const sheetVinos = {
    name: 'Vinos',
    columns: COLS_CIERRE_VINOS,
    rows: vinosRows,
    totals: totalesCierreVinos(vinosRows),
    freezeHeader: true,
  }

  // Hoja Resumen: réplica fiel de las 16 filas del código xlsx anterior
  // (ver 8dc966e7^:app/dashboard/bodega/CierreMensual.js:256-282). Etiquetas
  // y orden idénticos para no regresionar al abrir cierres antiguos.
  // En perfil Somm se omite "Total gastos" y "Resultado neto bodega" y
  // se añade "Margen tras merma"; el resto del resumen queda igual.
  const margenBruto    = Number(datos?.margen_bruto)      || 0
  const mermaCopa      = Number(datos?.merma_copa_eur)    || 0
  const salidasNoVenta = Number(datos?.salidas_no_venta)  || 0
  const difInv         = Number(datos?.diferencias_inventario) || 0
  const margenTrasMermaEur = Math.round((margenBruto - mermaCopa - salidasNoVenta + difInv) * 100) / 100
  const filasComunes = [
    { concepto: 'Ventas brutas (con IVA, €)',       valor: Number(datos?.ventas_bruto)        || 0 },
    { concepto: `IVA ${datos?.iva_pct ?? 10}% (€)`, valor: (Number(datos?.ventas_bruto) || 0) - (Number(datos?.ventas_neto) || 0) },
    { concepto: 'Ventas netas (sin IVA, €)',        valor: Number(datos?.ventas_neto)         || 0 },
    { concepto: 'Coste ventas teórico (€)',         valor: Number(datos?.coste_ventas_teorico) || 0 },
    { concepto: 'Margen bruto (€)',                 valor: margenBruto },
    { concepto: 'Margen bruto (%)',                 valor: datos?.margen_pct ?? null },
    { concepto: 'Compras brutas (€)',               valor: Number(datos?.compras_bruto)       || 0 },
    { concepto: 'Devoluciones (€)',                 valor: Number(datos?.devoluciones)        || 0 },
    { concepto: 'Compras netas (€)',                valor: Number(datos?.compras_netas)       || 0 },
    { concepto: 'Salidas no venta (€)',             valor: salidasNoVenta },
    { concepto: 'Merma copa (€)',                   valor: mermaCopa },
    { concepto: 'Diferencias inventario (€)',       valor: datos?.diferencias_inventario ?? null },
    { concepto: 'Stock inicial (€)',                valor: datos?.stock_inicial ?? null },
    { concepto: 'Stock final (€)',                  valor: datos?.stock_final ?? null },
  ]
  const resumenRowsOld = esSomm
    ? [...filasComunes, { concepto: 'Margen tras merma (€)', valor: margenTrasMermaEur }]
    : [...filasComunes,
        { concepto: 'Total gastos (€)',          valor: Number(datos?.gastos_total) || 0 },
        { concepto: 'Resultado neto bodega (€)', valor: Number(datos?.resultado)    || 0 },
      ]
  const sheetResumen = {
    name: 'Resumen',
    columns: [
      { header: 'Concepto', key: 'concepto', width: 32 },
      { header: 'Valor',    key: 'valor',    width: 16, format: FMT_EUR },
    ],
    rows: resumenRowsOld,
    freezeHeader: true,
  }

  // Hoja Gastos (réplica del OLD). En perfil Somm no se incluye.
  const sheets = [sheetResumen, sheetVinos]

  // Hoja "Desglose" (v1): sólo si el snapshot trae un desglose reconocido.
  // Los cierres antiguos (sin desglose o versión desconocida) se exportan
  // igual que antes, sin esta hoja.
  const sheetDesglose = construirSheetDesgloseCierre(datos)
  if (sheetDesglose) sheets.push(sheetDesglose)

  // Hoja "Ratios" (F2): se añade siempre que haya desglose. Las fórmulas
  // referencian las celdas de la hoja Desglose; si el Desglose no existe
  // los ratios dejan de tener sentido porque los costes por canal viven
  // allí. El layout del Desglose se congela en el commit anterior y los
  // números de fila usados aquí dependen de él.
  const sheetRatios = construirSheetRatios(datos, mes)
  if (sheetRatios) {
    // Si viene la fila de historico_mensual del mismo mes del año
    // anterior, añadimos 3 filas de ratios históricos a la hoja Ratios.
    // Texto plano, sin fórmulas; "Sin dato" cuando no hay extras.
    const filasHistoricas = construirFilasHistoricoPrevYear(mes, historicoPrevYear)
    if (filasHistoricas && filasHistoricas.length > 0) {
      sheetRatios.rows.push({ concepto: '' })   // separador
      sheetRatios.rows.push(...filasHistoricas)
    }
    sheets.push(sheetRatios)
  }

  // Hoja "Conciliacion" (F3): compara compras_netas del cierre con la
  // suma de importes del Libro de Compras del mismo mes. Se añade
  // siempre, incluso cuando el libro está vacío (en ese caso la fórmula
  // deja Diferencia = totalApp y el estado marca "Sin facturas").
  const sheetConcil = construirSheetConciliacion({ datos, mes, facturasLibro })
  if (sheetConcil) sheets.push(sheetConcil)

  const gastos = Array.isArray(datos?.gastos) ? datos.gastos : []
  if (!esSomm && gastos.length > 0) {
    const gastosRows = gastos.map(g => ({
      concepto: g.concepto || '',
      importe:  Number(g.importe) || 0,
    }))
    sheets.push({
      name: 'Gastos',
      columns: [
        { header: 'Concepto',    key: 'concepto', width: 32 },
        { header: 'Importe (€)', key: 'importe',  width: 14, format: FMT_EUR },
      ],
      rows: gastosRows,
      totals: {
        concepto: 'TOTAL',
        importe:  {
          formula: `SUM(B2:B${gastosRows.length + 1})`,
          result:  sumNumeric(gastosRows, 'importe'),
        },
      },
      freezeHeader: true,
    })
  }

  return {
    filename,
    sheets,
    restauranteNombre: restauranteNombre || '',
    periodo:           mes               || '',
  }
}

function totalesCierreVinos(rows) {
  const nFilas = rows.length
  const row = { nombre: 'TOTAL' }
  for (const key of ['uds', 'copas', 'ingresos']) {
    const idx = COLS_CIERRE_VINOS.findIndex(c => c.key === key)
    const col = colLetter(idx + 1)
    row[key] = {
      formula: `SUM(${col}2:${col}${nFilas + 1})`,
      result:  sumNumeric(rows, key),
    }
  }
  return row
}

// ── Hoja "Desglose" del cierre mensual (desglose_v = 1) ─────────────────────
//
// Tres columnas: Concepto | uds | Valor (€). Secciones vacías (fila con
// sólo el título en A) separan los bloques como en la UI. Las fórmulas se
// pasan SIN "=" inicial para alinear con el resto del dominio (ExcelJS
// lo añade solo). Cada fórmula referencia celdas con valor real.
//
// Layout determinista (necesario para que las fórmulas no apunten a hueco):
//    1  header
//    2  sección "STOCK INICIAL"
//    3  Stock inicial (valorado)
//    4  sección "ENTRADAS"
//    5  Compras brutas
//    6  Devoluciones
//    7  Compras netas              (fórmula: C5-C6)
//    8  sección "VENTAS"
//    9  Botella
//   10  Copa
//   11  sección "SALIDAS SIN VENTA"
//   12  Invitación (botella)
//   13  Invitación (copa)
//   14  Cocina
//   15  Grupo / Evento
//   16  Maridaje
//   17  Rotura / defecto
//   18  Cata interna
//   19  Total salidas sin venta    (uds: SUM(B12:B18), valor: SUM(C12:C18))
//   20  sección "CIERRE DE INVENTARIO"
//   21  Stock final teórico        (fórmula: C3+C7-C9-C10-C19, si hay stock_inicial)
//   22  Ajuste de inventario       (fórmula: C23-C21, si hay teórico y real)
//   23  Stock final real
//   24  Consumo                    (fórmula: C3+C7-C23, si hay stock_inicial y real)
export function construirSheetDesgloseCierre(datos) {
  const d = readDesglose(datos)
  if (!d) return null

  const rows = []
  const section = (label) => rows.push({ concepto: label, uds: null, valor: null })
  const r2 = (n) => Math.round(Number(n || 0) * 100) / 100

  // 2–3: STOCK INICIAL
  section('STOCK INICIAL')
  rows.push({
    concepto: 'Stock inicial (valorado)',
    uds:      d.stock_inicial?.uds ?? null,
    valor:    d.stock_inicial?.valor_eur ?? null,
  })

  // 4–7: ENTRADAS
  section('ENTRADAS')
  rows.push({
    concepto: 'Compras brutas',
    uds:      d.entradas?.compras_bruto?.uds ?? null,
    valor:    Number(d.entradas?.compras_bruto?.valor_eur) || 0,
  })
  rows.push({
    concepto: 'Devoluciones',
    uds:      d.entradas?.devoluciones?.uds ?? null,
    valor:    Number(d.entradas?.devoluciones?.valor_eur) || 0,
  })
  rows.push({
    concepto: 'Compras netas',
    uds:      d.entradas?.compras_netas?.uds ?? null,
    valor:    { formula: 'C5-C6', result: r2(d.entradas?.compras_netas?.valor_eur) },
  })

  // 8–10: VENTAS
  section('VENTAS')
  rows.push({
    concepto: 'Botella',
    uds:      Number(d.ventas_botella?.uds) || 0,
    valor:    Number(d.ventas_botella?.valor_eur) || 0,
  })
  rows.push({
    concepto: 'Copa (copas servidas)',
    uds:      Number(d.ventas_copa?.uds) || 0,
    valor:    Number(d.ventas_copa?.valor_eur) || 0,
  })

  // 11–19: SALIDAS SIN VENTA
  section('SALIDAS SIN VENTA')
  for (const cat of CATEGORIAS_SALIDA_SIN_VENTA) {
    const line = d.salidas_sin_venta?.[cat.key]
    rows.push({
      concepto: cat.label,
      uds:      Number(line?.uds) || 0,
      valor:    Number(line?.valor_eur) || 0,
    })
  }
  rows.push({
    concepto: 'Total salidas sin venta',
    uds:   { formula: 'SUM(B12:B18)', result: Number(d.salidas_sin_venta?.total?.uds) || 0 },
    valor: { formula: 'SUM(C12:C18)', result: r2(d.salidas_sin_venta?.total?.valor_eur) },
  })

  // 20–24: CIERRE DE INVENTARIO
  section('CIERRE DE INVENTARIO')
  const stockIni       = d.stock_inicial?.valor_eur
  const stockFinalReal = d.stock_final_real?.valor_eur
  const puedeTeorico   = stockIni != null
  const puedeRealAjuste = puedeTeorico && stockFinalReal != null

  rows.push({
    concepto: 'Stock final teórico',
    uds:      d.stock_final_teorico?.uds ?? null,
    valor:    puedeTeorico
      ? { formula: 'C3+C7-C9-C10-C19', result: r2(d.stock_final_teorico?.valor_eur) }
      : (d.stock_final_teorico?.valor_eur ?? null),
  })
  rows.push({
    concepto: 'Ajuste de inventario',
    uds:      d.ajuste_inventario?.uds ?? null,
    valor:    puedeRealAjuste
      ? { formula: 'C23-C21', result: r2(d.ajuste_inventario?.valor_eur) }
      : (d.ajuste_inventario?.valor_eur ?? null),
  })
  rows.push({
    concepto: 'Stock final real',
    uds:      d.stock_final_real?.uds ?? null,
    valor:    d.stock_final_real?.valor_eur ?? null,
  })
  rows.push({
    concepto: 'Consumo (identidad de inventario)',
    uds:      d.consumo?.uds ?? null,
    valor:    puedeRealAjuste
      ? { formula: 'C3+C7-C23', result: r2(d.consumo?.valor_eur) }
      : (d.consumo?.valor_eur ?? null),
  })

  return {
    name: 'Desglose',
    columns: [
      { header: 'Concepto', key: 'concepto', width: 34 },
      { header: 'uds',      key: 'uds',      width: 10, format: FMT_INT },
      { header: 'Valor',    key: 'valor',    width: 14, format: FMT_EUR },
    ],
    rows,
    freezeHeader: true,
  }
}

// ── Hoja "Ratios" del cierre mensual (F2) ──────────────────────────────────
//
// Layout (determinista — las fórmulas de la mitad inferior referencian
// a estas celdas por número de fila):
//    1  header (Concepto | Valor)
//    2  sección "INPUTS"
//    3  Ingresos netos botella (€)   ← valor (bruto / (1+iva))
//    4  Ingresos netos copa (€)      ← valor
//    5  Coste botella (€)            ← fórmula Desglose!C9
//    6  Coste copa (€)               ← fórmula Desglose!C10
//    7  Ventas netas (€)             ← fórmula Resumen!B4
//    8  Coste de ventas teórico (€)  ← fórmula Resumen!B5
//    9  Compras netas (€)            ← fórmula Desglose!C7
//   10  Consumo (€)                  ← fórmula Desglose!C24
//   11  Stock inicial (€)            ← fórmula Desglose!C3
//   12  Stock final real (€)         ← fórmula Desglose!C23
//   13  Stock final teórico (€)      ← fórmula Desglose!C21
//   14  Ajuste inventario (€)        ← fórmula Desglose!C22
//   15  Días del mes                 ← valor (del nombre del mes)
//   16  sección "RATIOS"
//   17  Margen botella %             IFERROR(IF(B3<=0,"",(B3-B5)/B3),"")
//   18  Margen copa %                IFERROR(IF(B4<=0,"",(B4-B6)/B4),"")
//   19  Margen botella (€)           IF(OR(B3="",B5=""),"",B3-B5)
//   20  Margen copa (€)              IF(OR(B4="",B6=""),"",B4-B6)
//   21  Coste s/ ventas              IFERROR(IF(B7<=0,"",B8/B7),"")
//   22  Consumo / compras            IFERROR(IF(B9<=0,"",B10/B9),"")
//   23  Rotación                     IFERROR(IF((B11+B12)=0,"",B8/((B11+B12)/2)),"")
//   24  Cobertura (días)             IFERROR(IF(B8<=0,"",B12*B15/B8),"")
//   25  Diferencia inventario %      IFERROR(IF(B13=0,"",B14/B13),"")
//
// Fórmulas SIN "=" inicial. Los result precalculados se dejan vacíos
// (null) cuando el ratio es null, para que Numbers/LibreOffice no
// muestren "0" en vez del "—" que renderiza Excel al evaluar "".
export function construirSheetRatios(datos, mes) {
  const d = readDesglose(datos)
  if (!d) return null
  const ratios = calcularRatios({ datos, desglose: d })
  const dias = diasDelMes(mes) ?? diasDelMes(datos?.mes)

  const section = (concepto) => ({ concepto, valor: null })
  const valorPlano = (concepto, v) => ({ concepto, valor: v })
  const valorRef = (concepto, formula, result) => ({
    concepto, valor: { formula, result },
  })
  const resultOrEmpty = (v) => (v == null || Number.isNaN(Number(v))) ? '' : v

  const rows = []
  rows.push(section('INPUTS'))
  rows.push(valorPlano('Ingresos netos botella (€)', ratios.meta.ingresos_botella_neto))
  rows.push(valorPlano('Ingresos netos copa (€)',    ratios.meta.ingresos_copa_neto))
  rows.push(valorRef('Coste botella (€)',          'Desglose!C9',  ratios.meta.coste_botella_eur))
  rows.push(valorRef('Coste copa (€)',             'Desglose!C10', ratios.meta.coste_copa_eur))
  rows.push(valorRef('Ventas netas (€)',           'Resumen!B4',   Number(datos?.ventas_neto) || 0))
  rows.push(valorRef('Coste de ventas teórico (€)','Resumen!B5',   Number(datos?.coste_ventas_teorico) || 0))
  rows.push(valorRef('Compras netas (€)',          'Desglose!C7',  Number(d.entradas?.compras_netas?.valor_eur) || 0))
  rows.push(valorRef('Consumo (€)',                'Desglose!C24', d.consumo?.valor_eur))
  rows.push(valorRef('Stock inicial (€)',          'Desglose!C3',  d.stock_inicial?.valor_eur))
  rows.push(valorRef('Stock final real (€)',       'Desglose!C23', d.stock_final_real?.valor_eur))
  rows.push(valorRef('Stock final teórico (€)',    'Desglose!C21', d.stock_final_teorico?.valor_eur))
  rows.push(valorRef('Ajuste inventario (€)',      'Desglose!C22', d.ajuste_inventario?.valor_eur))
  rows.push(valorPlano('Días del mes', dias ?? null))

  rows.push(section('RATIOS'))
  // Porcentajes: formato FMT_PCT ("0.0 %") → el result ya viene como
  // ratio (0.32) desde calcularRatios; la fórmula también produce ratio.
  rows.push({ concepto: 'Margen botella %', valor: {
    formula: 'IFERROR(IF(B3<=0,"",(B3-B5)/B3),"")',
    result: resultOrEmpty(ratios.margen_botella_pct),
  }})
  rows.push({ concepto: 'Margen copa %', valor: {
    formula: 'IFERROR(IF(B4<=0,"",(B4-B6)/B4),"")',
    result: resultOrEmpty(ratios.margen_copa_pct),
  }})
  rows.push({ concepto: 'Margen botella (€)', valor: {
    formula: 'IF(OR(B3="",B5=""),"",B3-B5)',
    result: resultOrEmpty(ratios.margen_botella_eur),
  }})
  rows.push({ concepto: 'Margen copa (€)', valor: {
    formula: 'IF(OR(B4="",B6=""),"",B4-B6)',
    result: resultOrEmpty(ratios.margen_copa_eur),
  }})
  rows.push({ concepto: 'Coste s/ ventas', valor: {
    formula: 'IFERROR(IF(B7<=0,"",B8/B7),"")',
    result: resultOrEmpty(ratios.coste_pct_sobre_ventas),
  }})
  // Para los ratios que dependen de celdas del Desglose, hay que
  // distinguir "celda vacía" de "0": Excel trata celda vacía como 0 al
  // operar aritméticamente, lo que producía cobertura = 0 cuando
  // Desglose!C23 estaba vacío. ISNUMBER(celda_vacía) = FALSE, así que
  // la guarda detecta el caso correctamente y la fórmula devuelve "".
  rows.push({ concepto: 'Consumo / compras', valor: {
    formula: 'IFERROR(IF(OR(NOT(ISNUMBER(B9)),NOT(ISNUMBER(B10)),B9=0),"",B10/B9),"")',
    result: resultOrEmpty(ratios.consumo_vs_compras),
  }})
  rows.push({ concepto: 'Rotación', valor: {
    formula: 'IFERROR(IF(OR(NOT(ISNUMBER(B11)),NOT(ISNUMBER(B12)),(B11+B12)=0),"",B8/((B11+B12)/2)),"")',
    result: resultOrEmpty(ratios.rotacion),
  }})
  rows.push({
    concepto: 'Cobertura (días)',
    valor: {
      formula: 'IFERROR(IF(OR(NOT(ISNUMBER(B12)),NOT(ISNUMBER(B8)),B8<=0),"",B12*B15/B8),"")',
      result: resultOrEmpty(ratios.cobertura_dias),
    },
    // Texto plano (no fórmula) en columna adyacente cuando el dato es
    // parcial por mes en curso. ExcelJS guarda el string tal cual; al no
    // empezar por "=" no se interpreta como fórmula.
    nota: ratios.cobertura_parcial ? 'Dato parcial · mes en curso' : '',
  })
  rows.push({ concepto: 'Diferencia inventario %', valor: {
    formula: 'IFERROR(IF(OR(NOT(ISNUMBER(B13)),NOT(ISNUMBER(B14)),B13=0),"",B14/B13),"")',
    result: resultOrEmpty(ratios.diferencia_inventario_pct),
  }})

  // Formato por columna: la columna "Valor" debe mostrar € en los inputs
  // y % en los ratios. Como ExcelJS aplica un único numFmt por columna,
  // y mezclar € y % en una sola columna es incoherente visualmente, se
  // deja sin formato por defecto (el usuario puede aplicar formato por
  // rangos). Los números siguen siendo números; sólo cambia la pintura.
  return {
    name: 'Ratios',
    columns: [
      { header: 'Concepto', key: 'concepto', width: 34 },
      { header: 'Valor',    key: 'valor',    width: 18 },
      // Nota: texto plano opcional (nunca fórmula). Hoy la usa la fila
      // "Cobertura (días)" para avisar "Dato parcial · mes en curso"
      // cuando `cobertura_parcial` es true.
      { header: 'Nota',     key: 'nota',     width: 28 },
    ],
    rows,
    freezeHeader: true,
  }
}

// ── Hoja "Conciliacion" del cierre mensual (F3) ───────────────────────────
//
// Dos columnas: Concepto | Valor. Layout determinista (las fórmulas
// referencian estas filas):
//    1  header
//    2  "Mes" (texto YYYY-MM)
//    3  Compras app (cierre)        — valor numérico (compras_netas)
//    4  Libro de Compras (total)    — valor numérico (suma importe)
//    5  Diferencia                  — fórmula sin "=" inicial: B3-B4
//    6  % sobre Libro               — fórmula con IFERROR + ISNUMBER
//    7  Facturas del Libro          — contador (número entero)
//    8  Estado                      — texto precalculado
//    9  Nota de tolerancia          — texto fijo
export function construirSheetConciliacion({ datos, mes, facturasLibro = [] } = {}) {
  const c = conciliarCompras({
    comprasApp: datos?.compras_netas,
    facturasLibro,
    mes,
  })
  const etiqueta = {
    ok:        'Coincide',
    revisar:   'Revisar',
    sin_libro: 'Sin facturas en el Libro',
    sin_app:   'Sin compras en la app',
  }[c.estado] || '-'

  const rows = [
    { concepto: 'Mes',                  valor: c.meta.mes || mes || '' },
    { concepto: 'Compras app (cierre)', valor: c.totalApp },
    { concepto: 'Libro de Compras',     valor: c.totalLibro },
    { concepto: 'Diferencia (app − libro)', valor: {
      formula: 'B3-B4',
      result:  c.diferencia,
    }},
    { concepto: '% sobre Libro', valor: {
      // IFERROR + ISNUMBER para distinguir vacío/0: si B4 es 0 o vacío,
      // devolvemos "" en vez de #DIV/0! o 0 engañoso. Ratio (0.03 = 3 %).
      formula: 'IFERROR(IF(OR(NOT(ISNUMBER(B4)),B4=0),"",(B3-B4)/B4),"")',
      result:  (c.pct == null) ? '' : c.pct,
    }},
    { concepto: `Facturas del Libro${c.meta.sin_fecha ? ` (${c.meta.sin_fecha} sin fecha)` : ''}`,
      valor: c.meta.cuenta_facturas },
    { concepto: 'Estado', valor: etiqueta },
    { concepto: 'Tolerancia', valor: `${c.meta.tolerancia.eur} € o ${c.meta.tolerancia.pct * 100} %` },
  ]
  return {
    name: 'Conciliacion',
    columns: [
      { header: 'Concepto', key: 'concepto', width: 36 },
      { header: 'Valor',    key: 'valor',    width: 18 },
    ],
    rows,
    freezeHeader: true,
  }
}
