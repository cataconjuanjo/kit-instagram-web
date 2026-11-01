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
 *       totals?: { [key]: { formula: 'SUM(B2:B10)' } | number | string },
 *       freezeHeader: boolean,                // panel congelado fila 1
 *     }]
 *   }
 */

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
  sheets.push({
    name: 'Resumen',
    columns: COLS_RESUMEN_LIBRO,
    rows: mesesVisibles.map(m => ({
      mes:                  m.mes,
      estado:               m.estado,
      vinos_activos:        m.vinos.length,
      coste_teorico_ventas: m.totales?.coste_teorico_ventas ?? 0,
      consumo_real_stock:   m.totales?.consumo_real_stock   ?? 0,
      diferencia_consumo:   m.totales?.diferencia_consumo   ?? 0,
    })),
    totals: totalesResumenLibro(mesesVisibles.length),
    freezeHeader: true,
  })

  // Hoja por mes visible
  for (const m of mesesVisibles) {
    sheets.push({
      name: m.mes,  // 'YYYY-MM'
      columns: COLS_LIBRO,
      rows: m.vinos.map(v => ({
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
      })),
      totals: totalesLibroMes(m.vinos.length),
      freezeHeader: true,
    })
  }

  return { filename, sheets }
}

function totalesLibroMes(nFilas) {
  const row = { nombre: 'TOTAL' }
  // header=fila 1; datos filas 2..(nFilas+1)
  const fIni = 2
  const fFin = nFilas + 1
  for (const key of COLS_LIBRO_SUMABLES) {
    const idx = COLS_LIBRO.findIndex(c => c.key === key)
    if (idx < 0) continue
    const col = colLetter(idx + 1)
    row[key] = { formula: `SUM(${col}${fIni}:${col}${fFin})` }
  }
  return row
}

function totalesResumenLibro(nMeses) {
  const row = { mes: 'TOTAL' }
  const fIni = 2
  const fFin = nMeses + 1
  for (const key of ['coste_teorico_ventas', 'consumo_real_stock', 'diferencia_consumo']) {
    const idx = COLS_RESUMEN_LIBRO.findIndex(c => c.key === key)
    const col = colLetter(idx + 1)
    row[key] = { formula: `SUM(${col}${fIni}:${col}${fFin})` }
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
      totals: totalesCompras(filas.length),
      freezeHeader: true,
    }],
  }
}

function totalesCompras(nFilas) {
  const idx = COLS_COMPRAS.findIndex(c => c.key === 'importe')
  const col = colLetter(idx + 1)
  return {
    proveedor: 'TOTAL',
    importe:   { formula: `SUM(${col}2:${col}${nFilas + 1})` },
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

export function construirCierreWorkbook({ datos, mes, restauranteNombre }) {
  const slug = slugRestaurante(restauranteNombre)
  const filename = `${slug}-cierre-${mes}.xlsx`

  const porVino = datos?.informe?.por_vino || []
  if (porVino.length === 0) return { filename, sheets: [], empty: true }

  // Hoja Vinos
  const sheetVinos = {
    name: 'Vinos',
    columns: COLS_CIERRE_VINOS,
    rows: porVino.map(v => ({
      nombre:         v.nombre || '',
      uds:            Number(v.uds) || 0,
      copas:          Number(v.copas) || 0,
      ingresos:       Number(v.ingresos) || 0,
      coste_unitario: Number(v.coste_unitario) || 0,
      margen_pct:     v.margen_pct ?? null,
      tiene_coste:    v.tiene_coste ? 'sí' : 'no',
    })),
    totals: totalesCierreVinos(porVino.length),
    freezeHeader: true,
  }

  // Hoja Resumen económico (opcional, 1 fila: datos del cierre)
  const sheetResumen = {
    name: 'Resumen',
    columns: [
      { header: 'Concepto', key: 'concepto', width: 32 },
      { header: 'Valor',    key: 'valor',    width: 16, format: FMT_EUR },
    ],
    rows: [
      { concepto: 'Mes',                             valor: mes },
      { concepto: `Ventas brutas (IVA ${datos?.iva_pct ?? 10}%)`, valor: Number(datos?.ventas_bruto)        || 0 },
      { concepto: 'Ventas netas',                    valor: Number(datos?.ventas_neto)        || 0 },
      { concepto: 'Coste de ventas teórico',         valor: Number(datos?.coste_ventas_teorico) || 0 },
      { concepto: 'Margen bruto',                    valor: Number(datos?.margen_bruto)       || 0 },
      { concepto: 'Compras netas',                   valor: Number(datos?.compras_netas)      || 0 },
      { concepto: 'Salidas no venta',                valor: Number(datos?.salidas_no_venta)   || 0 },
      { concepto: 'Merma copa (€)',                  valor: Number(datos?.merma_copa_eur)     || 0 },
      { concepto: 'Diferencias inventario',          valor: Number(datos?.diferencias_inventario) || 0 },
      { concepto: 'Gastos del mes',                  valor: Number(datos?.gastos_total)       || 0 },
      { concepto: 'Resultado neto bodega',           valor: Number(datos?.resultado)          || 0 },
    ],
    freezeHeader: true,
  }

  return { filename, sheets: [sheetResumen, sheetVinos] }
}

function totalesCierreVinos(nFilas) {
  const row = { nombre: 'TOTAL' }
  for (const key of ['uds', 'copas', 'ingresos']) {
    const idx = COLS_CIERRE_VINOS.findIndex(c => c.key === key)
    const col = colLetter(idx + 1)
    row[key] = { formula: `SUM(${col}2:${col}${nFilas + 1})` }
  }
  return row
}
