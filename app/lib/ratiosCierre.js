/**
 * ratiosCierre.js — Ratios derivados del cierre mensual de bodega.
 *
 * Función pura. No persiste nada. No depende de ExcelJS / jsPDF.
 * Entra el snapshot (datos) y su desglose (desglose_v=1); salen los
 * ratios ya calculados o null cuando no se pueden calcular.
 *
 * Cada ratio devuelve null si falta alguno de los operandos o si el
 * denominador es 0. Nunca devuelve NaN ni 0 como "falta de dato":
 *     - los porcentajes se exponen como ratio (0.32 para 32 %)
 *     - los importes en euros a 4 decimales de precisión interna
 *     - el formateo lo hace el consumer (es-ES / 1 decimal / etc.)
 */

function num(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** true si todos los args son números finitos */
function finite(...args) {
  return args.every(v => typeof v === 'number' && Number.isFinite(v))
}

/** Días naturales del mes YYYY-MM. 31 para enero, 28/29 para febrero… */
export function diasDelMes(mesYYYYMM) {
  if (typeof mesYYYYMM !== 'string' || !/^\d{4}-\d{2}$/.test(mesYYYYMM)) return null
  const [y, m] = mesYYYYMM.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/**
 * @param {{ datos: object, desglose?: object|null }} input
 * @returns {{ margen_botella_pct, margen_botella_eur, margen_copa_pct,
 *             margen_copa_eur, coste_pct_sobre_ventas, consumo_vs_compras,
 *             rotacion, cobertura_dias, diferencia_inventario_pct,
 *             meta: { ... } }}
 */
export function calcularRatios({ datos, desglose } = {}) {
  const d  = datos || {}
  const dg = desglose || null

  // Ingresos por canal (BRUTO con IVA) desde el agregador. Se netean
  // dividiendo por (1 + iva/100). No se altera el snapshot ni el
  // informe original.
  const iva          = num(d.iva_pct)
  const porCanal     = d?.informe?.por_canal
  const ingrBotBruto = num(porCanal?.botella?.ingresos)
  const ingrCopBruto = num(porCanal?.copa?.ingresos)

  const factorIva = (iva != null && iva >= 0) ? (1 + iva / 100) : 1
  const ingrBotNeto = (ingrBotBruto != null) ? ingrBotBruto / factorIva : null
  const ingrCopNeto = (ingrCopBruto != null) ? ingrCopBruto / factorIva : null

  // Coste por canal: viene del desglose ya cuadrado al céntimo.
  const costeBot = num(dg?.ventas_botella?.valor_eur)
  const costeCop = num(dg?.ventas_copa?.valor_eur)

  // ── Margen por canal (€ y %) ───────────────────────────────────────
  const margen_botella_eur = finite(ingrBotNeto, costeBot)
    ? ingrBotNeto - costeBot
    : null
  const margen_botella_pct = finite(ingrBotNeto, costeBot) && ingrBotNeto !== 0
    ? (ingrBotNeto - costeBot) / ingrBotNeto
    : null

  const margen_copa_eur = finite(ingrCopNeto, costeCop)
    ? ingrCopNeto - costeCop
    : null
  const margen_copa_pct = finite(ingrCopNeto, costeCop) && ingrCopNeto !== 0
    ? (ingrCopNeto - costeCop) / ingrCopNeto
    : null

  // ── Coste sobre ventas (food cost de bodega) ───────────────────────
  const ventasNeto = num(d.ventas_neto)
  const costeTot   = num(d.coste_ventas_teorico)
  const coste_pct_sobre_ventas = finite(ventasNeto, costeTot) && ventasNeto !== 0
    ? costeTot / ventasNeto
    : null

  // ── Consumo vs compras ─────────────────────────────────────────────
  const consumoValor  = num(dg?.consumo?.valor_eur)
  const comprasNetas  = num(dg?.entradas?.compras_netas?.valor_eur) ?? num(d.compras_netas)
  const consumo_vs_compras = finite(consumoValor, comprasNetas) && comprasNetas !== 0
    ? consumoValor / comprasNetas
    : null

  // ── Rotación (coste / stock medio) ─────────────────────────────────
  const stockIni = num(dg?.stock_inicial?.valor_eur) ?? num(d.stock_inicial)
  const stockFin = num(dg?.stock_final_real?.valor_eur) ?? num(d.stock_final)
  const stockMedio = finite(stockIni, stockFin) ? (stockIni + stockFin) / 2 : null
  const rotacion = finite(costeTot, stockMedio) && stockMedio > 0
    ? costeTot / stockMedio
    : null

  // ── Cobertura (días) ───────────────────────────────────────────────
  // stock_final / (coste_ventas / días) = stock_final * días / coste_ventas
  const dias = diasDelMes(d.mes)
  const cobertura_dias = finite(stockFin, costeTot, dias) && costeTot > 0
    ? (stockFin * dias) / costeTot
    : null

  // ── Diferencia de inventario (%) ───────────────────────────────────
  const ajuste  = num(dg?.ajuste_inventario?.valor_eur)
  const teorico = num(dg?.stock_final_teorico?.valor_eur)
  const diferencia_inventario_pct = finite(ajuste, teorico) && teorico !== 0
    ? ajuste / teorico
    : null

  return {
    margen_botella_pct,
    margen_botella_eur,
    margen_copa_pct,
    margen_copa_eur,
    coste_pct_sobre_ventas,
    consumo_vs_compras,
    rotacion,
    cobertura_dias,
    diferencia_inventario_pct,
    meta: {
      iva_pct: iva,
      dias_mes: dias,
      ingresos_botella_neto: ingrBotNeto,
      ingresos_copa_neto: ingrCopNeto,
      coste_botella_eur: costeBot,
      coste_copa_eur: costeCop,
      stock_medio: stockMedio,
      // Motivos por los que un ratio puede ser null, útiles para tooltips.
      faltantes: {
        inventario: !finite(stockIni, stockFin),
        ventas_netas: !(ventasNeto != null && ventasNeto !== 0),
        compras_netas: !(comprasNetas != null && comprasNetas !== 0),
        iva_pct: iva == null,
        canal_botella_ingresos: ingrBotBruto == null,
        canal_copa_ingresos: ingrCopBruto == null,
        desglose: dg == null || dg.desglose_v !== 1,
      },
    },
  }
}
