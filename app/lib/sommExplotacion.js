/**
 * Cálculos de Cuenta de Explotación para Carta Viva Somm.
 *
 * Implementa la estructura P&L completa de bodega:
 *   Facturación − Consumo MP − Personal − Generales − Alquiler − Bancarios = Margen Explotación
 */

import { redondear } from './wineEconomics'

function num(valor) {
  if (typeof valor === 'string') valor = valor.replace(',', '.')
  return Number(valor) || 0
}

// ── Personal (Gap 20) ────────────────────────────────────────────────────────

/**
 * Suma el coste total de personal con desglose completo.
 * La SS de empresa suele ser ~33% sobre la nómina bruta y es la partida
 * más infravalorada cuando solo se mira el salario neto.
 */
export function calcularTotalPersonal(params = {}) {
  const nominas = num(params.nominas_brutas)
  const ss = num(params.ss_empresa)
  const retenciones = num(params.retenciones_irpf)
  const extras = num(params.extras_personal)
  const total = nominas + ss + retenciones + extras
  return {
    nominas,
    ss,
    retenciones,
    extras,
    total: redondear(total, 2),
    pctSobreNominas: nominas ? redondear(((total - nominas) / nominas) * 100, 1) : 0,
  }
}

// ── Gastos operacionales con amortización (Gap 22) ──────────────────────────

/**
 * Suma total de gastos operacionales.
 * Cada partida puede tener `amortizar_meses` > 1: el importe anual se proratea.
 * Esto permite registrar compras anuales (ej: carta física 8.630€/año) y que
 * el sistema las distribuya en 12 meses (720€/mes).
 *
 * @param {Array} partidas - [{ id, categoria, importe, amortizar_meses }]
 * @returns {{ total: number, desglose: Array }}
 */
export function calcularTotalGastos(partidas = []) {
  const desglose = partidas.map(p => {
    const importe = num(p.importe)
    const meses = Math.max(1, num(p.amortizar_meses) || 1)
    const importeMensual = redondear(importe / meses, 2)
    return { ...p, importeMensual }
  })
  const total = redondear(desglose.reduce((s, p) => s + p.importeMensual, 0), 2)
  return { total, desglose }
}

/**
 * Suma total de alquileres mensuales.
 * @param {Array} partidas - [{ id, concepto, importe }]
 */
export function calcularTotalAlquiler(partidas = []) {
  const total = redondear(partidas.reduce((s, p) => s + num(p.importe), 0), 2)
  return { total, desglose: partidas }
}

/**
 * Suma total de gastos bancarios.
 */
export function calcularTotalBancarios(params = {}) {
  const comisiones = num(params.comisiones_datafono)
  const mantenimiento = num(params.mantenimiento_datafono)
  const resto = num(params.resto_comisiones)
  return { comisiones, mantenimiento, resto, total: redondear(comisiones + mantenimiento + resto, 2) }
}

// ── Break-Even (Gap 3) ───────────────────────────────────────────────────────

/**
 * Punto de equilibrio mensual de la bodega.
 *
 * Fórmula: BE = Gastos Fijos / (1 - %MP)
 *
 * Donde:
 *   - Gastos Fijos = Personal + Generales + Alquiler + Bancarios (no varían con las ventas)
 *   - %MP = % de Materia Prima sobre ventas (único coste variable)
 *
 * @param {number} personal   - Coste total de personal del mes
 * @param {number} generales  - Gastos operacionales del mes (prorrateados)
 * @param {number} alquiler   - Alquileres del mes
 * @param {number} bancarios  - Gastos bancarios del mes
 * @param {number} pctMp      - % Materia Prima sobre ventas (0-100)
 * @returns {{ breakEven: number, gastosFijos: number, margenContribucion: number }}
 */
export function calcularBreakEven(personal, generales, alquiler, bancarios, pctMp) {
  const gastosFijos = redondear(num(personal) + num(generales) + num(alquiler) + num(bancarios), 2)
  const mp = Math.min(99, Math.max(0, num(pctMp)))
  const margenContribucion = (100 - mp) / 100
  if (!margenContribucion) return { breakEven: null, gastosFijos, margenContribucion: 0 }
  const breakEven = redondear(gastosFijos / margenContribucion, 2)
  return { breakEven, gastosFijos, margenContribucion: redondear(margenContribucion * 100, 2) }
}

// ── Resultado de Explotación (Gap 1, Gap 15) ─────────────────────────────────

/**
 * Calcula el Resultado de Explotación completo de la bodega para un periodo.
 *
 * Estructura P&L:
 *   + Facturación Total (100%)
 *   − Consumo MP (wine cost)
 *   − Personal (nóminas + SS + retenciones + extras)
 *   − Gastos Generales (operacionales prorrateados)
 *   − Alquileres
 *   − Gastos Bancarios
 *   = Resultado / Margen de Explotación
 *
 * Nota: el P&L usa CONSUMO (no compras). Consumo = compras + EI − EF.
 */
export function calcularResultadoExplotacion({ facturacion, consumoMp, personal, generales, alquiler, bancarios }) {
  const fact = num(facturacion)
  const mp = num(consumoMp)
  const pers = num(personal)
  const gen = num(generales)
  const alq = num(alquiler)
  const ban = num(bancarios)
  const resultado = redondear(fact - mp - pers - gen - alq - ban, 2)

  const pct = (valor) => fact ? redondear((valor / fact) * 100, 2) : 0

  return {
    facturacion: fact,
    consumoMp: mp,
    personal: pers,
    generales: gen,
    alquiler: alq,
    bancarios: ban,
    resultado,
    pctMp: pct(mp),
    pctPersonal: pct(pers),
    pctGenerales: pct(gen),
    pctAlquiler: pct(alq),
    pctBancarios: pct(ban),
    pctResultado: pct(resultado),
    enPerdidas: resultado < 0,
  }
}

// ── Análisis de Desviaciones (Gap 2) ─────────────────────────────────────────

/**
 * Desviación entre consumo teórico (ventas × coste unitario) y consumo real
 * (movimientos de inventario). Supera el 3% → alerta de mermas no registradas.
 *
 * @param {number} consumoTeorico - Ventas registradas × coste unitario
 * @param {number} consumoReal    - Entradas − stock final (movimientos físicos)
 * @returns {{ desviacion: number, pctDesviacion: number, alerta: boolean }}
 */
export function calcularDesviacion(consumoTeorico, consumoReal) {
  const teorico = num(consumoTeorico)
  const real = num(consumoReal)
  const desviacion = redondear(real - teorico, 2)
  const pctDesviacion = teorico ? redondear((desviacion / teorico) * 100, 2) : 0
  return {
    consumoTeorico: teorico,
    consumoReal: real,
    desviacion,
    pctDesviacion,
    alerta: Math.abs(pctDesviacion) > 3,
  }
}

// ── Coste Medio Ponderado / PMP (Gap 10) ─────────────────────────────────────

/**
 * Coste Medio Ponderado (PMP) para valorar las salidas del mes.
 * Más preciso que usar el último precio de compra cuando hay stock de distintos
 * lotes a precios diferentes.
 *
 * PMP = (stock_inicial_valor + entradas_coste) / stock_disponible_ud
 *
 * @param {number} stockInicialValor  - Valor € del stock al inicio del periodo
 * @param {number} entradasCoste      - Valor € de compras del periodo
 * @param {number} stockDisponibleUd  - Unidades disponibles (stock inicial + entradas)
 * @returns {number} coste medio por unidad
 */
export function calcularPmp(stockInicialValor, entradasCoste, stockDisponibleUd) {
  const valor = num(stockInicialValor) + num(entradasCoste)
  const uds = num(stockDisponibleUd)
  if (!uds) return 0
  return redondear(valor / uds, 4)
}

// ── Rotación de stock ────────────────────────────────────────────────────────

/**
 * Rotación = Consumo / ((Stock Inicial + Stock Final) / 2)
 * Valor > 1 = alta rotación. El benchmark del sector bodega ≈ 0,88 mensual.
 */
export function calcularRotacionStock(consumo, stockInicial, stockFinal) {
  const stockMedio = (num(stockInicial) + num(stockFinal)) / 2
  if (!stockMedio) return 0
  return redondear(num(consumo) / stockMedio, 2)
}

// ── KPI Stock/Ventas (Gap 19) ────────────────────────────────────────────────

/**
 * % Stock sobre Ventas: inversión en bodega como % de la facturación del periodo.
 * Indica la eficiencia de capital. Benchmark: 30-45% es el rango saludable.
 *
 * Semáforo: verde <30% / amarillo 30-45% / rojo >45%
 */
export function kpiStockVentas(valorStock, facturacion) {
  const pct = facturacion ? redondear((num(valorStock) / num(facturacion)) * 100, 1) : null
  const semaforo = pct === null ? 'neutral'
    : pct < 30 ? 'verde'
    : pct <= 45 ? 'amarillo'
    : 'rojo'
  return { pct, semaforo }
}

// ── Sistema de Bonus Variable (Gap 17) ───────────────────────────────────────

/**
 * Calcula el bonus mensual del sumiller basado en crecimiento interanual.
 *
 * Lógica: si el crecimiento YoY del mes supera el umbral, el bonus es
 * un % del exceso sobre el objetivo.
 *
 * bonus = IF(crecimiento_yoy > umbral%, (facturado - objetivo) × bonus_pct%, 0)
 *
 * @param {number} facturadoMes  - Facturación real del mes actual
 * @param {number} objetivoMes   - Objetivo del mes (basado en año anterior × factor)
 * @param {number} umbralPct     - % mínimo de crecimiento YoY para activar el bonus
 * @param {number} bonusPct      - % del exceso que se paga como bonus
 * @param {number} realAnterior  - Facturación del mismo mes del año anterior (para calcular crecimiento)
 * @returns {{ bonus: number, crecimientoYoyPct: number, superaUmbral: boolean, exceso: number }}
 */
export function calcularBonus(facturadoMes, objetivoMes, umbralPct, bonusPct, realAnterior) {
  const fact = num(facturadoMes)
  const obj = num(objetivoMes)
  const umbral = num(umbralPct)
  const bonusTasa = num(bonusPct)
  const anterior = num(realAnterior)

  const crecimientoYoyPct = anterior ? redondear(((fact - anterior) / anterior) * 100, 2) : 0
  const superaUmbral = crecimientoYoyPct > umbral
  const exceso = superaUmbral ? Math.max(0, redondear(fact - obj, 2)) : 0
  const bonus = superaUmbral ? redondear(exceso * (bonusTasa / 100), 2) : 0

  return { bonus, crecimientoYoyPct, superaUmbral, exceso }
}

/**
 * Acumula los bonus mensuales y proyecta el total anual.
 *
 * @param {Array} meses - [{ bonus, facturadoMes, objetivoMes, ... }]
 * @param {number} mesesRestantes - Meses del año aún no cerrados
 * @param {number} promedioBonus  - Bonus promedio de los meses que sí han generado bonus
 * @returns {{ acumulado: number, proyeccionAnual: number }}
 */
export function acumularBonus(meses = []) {
  const acumulado = redondear(meses.reduce((s, m) => s + num(m.bonus), 0), 2)
  const mesesConBonus = meses.filter(m => m.bonus > 0)
  const promedioBonus = mesesConBonus.length
    ? redondear(acumulado / mesesConBonus.length, 2)
    : 0
  return { acumulado, promedioBonus }
}

// ── Presupuesto YoY automático (Gap 18) ──────────────────────────────────────

/**
 * Genera los objetivos mensuales automáticamente desde el año anterior.
 * El sumiller solo introduce el % de crecimiento objetivo.
 *
 * objetivo_mes = real_mes_año_anterior × (1 + factor_crecimiento/100)
 *
 * @param {Array}  historialAnioBase - [{ mes: 1..12, ingresos }]
 * @param {number} factorCrecimientoPct - % de crecimiento objetivo (ej: 10 para +10%)
 * @returns {Array} [{ mes, objetivo, ingresoBase }]
 */
export function generarObjetivosYoY(historialAnioBase = [], factorCrecimientoPct) {
  const factor = 1 + num(factorCrecimientoPct) / 100
  return historialAnioBase.map(fila => ({
    mes: fila.mes,
    ingresoBase: num(fila.ingresos),
    objetivo: redondear(num(fila.ingresos) * factor, 2),
  }))
}

// ── Benchmarking por tipo de negocio (Gap 5) ─────────────────────────────────

export const BENCHMARKS_SECTOR = {
  fast_food: { nombre: 'Fast Food', mp: 28, personal: 28, alquiler: 16, generales: 8, margen: 20 },
  de_moda: { nombre: 'De Moda', mp: 27, personal: 31, alquiler: 10, generales: 9, margen: 23 },
  copas: { nombre: 'Copas', mp: 21, personal: 18, alquiler: 8, generales: 13, margen: 40 },
  lujo: { nombre: 'Lujo', mp: 35, personal: 36, alquiler: 9, generales: 9, margen: 11 },
  bodega_profesional: { nombre: 'Bodega Profesional', mp: 38, personal: 21, alquiler: 2, generales: 9, margen: 21 },
}

/**
 * Compara los KPIs reales del mes con el benchmark del tipo de negocio.
 * Devuelve semáforo por categoría: 'bien' | 'aviso' | 'alerta'.
 */
export function compararConBenchmark(resultado, tipoBenchmark) {
  const ref = BENCHMARKS_SECTOR[tipoBenchmark]
  if (!ref) return null

  const evaluar = (real, objetivo, margenPermitido = 3) => {
    const diff = real - objetivo
    if (Math.abs(diff) <= margenPermitido) return 'bien'
    if (diff > 0) return 'alerta'   // peor que el benchmark
    return 'bien'
  }

  return {
    benchmark: ref,
    mp: { real: resultado.pctMp, ref: ref.mp, estado: evaluar(resultado.pctMp, ref.mp) },
    personal: { real: resultado.pctPersonal, ref: ref.personal, estado: evaluar(resultado.pctPersonal, ref.personal) },
    alquiler: { real: resultado.pctAlquiler, ref: ref.alquiler, estado: evaluar(resultado.pctAlquiler, ref.alquiler, 1) },
    margen: { real: resultado.pctResultado, ref: ref.margen, estado: resultado.pctResultado >= ref.margen - 3 ? 'bien' : 'alerta' },
  }
}

// ── Catálogo predefinido de gastos de bodega (Gap 22) ────────────────────────

export const CATEGORIAS_GASTOS_PRESET = [
  { id: 'coravin_capsulas', categoria: 'Cápsulas Coravin', importe: 0, amortizar_meses: 1 },
  { id: 'copas_riedel', categoria: 'Copas Riedel', importe: 0, amortizar_meses: 12 },
  { id: 'copas_schott', categoria: 'Copas Schott Zwiesel', importe: 0, amortizar_meses: 12 },
  { id: 'decantadores', categoria: 'Decantadores', importe: 0, amortizar_meses: 12 },
  { id: 'menaje', categoria: 'Menaje y vajilla', importe: 0, amortizar_meses: 12 },
  { id: 'pastillas_limpieza', categoria: 'Pastillas limpieza decantadores', importe: 0, amortizar_meses: 1 },
  { id: 'litos_carta', categoria: 'Carta de vinos física (Lito)', importe: 0, amortizar_meses: 12 },
  { id: 'papeleria', categoria: 'Papelería y materiales oficina', importe: 0, amortizar_meses: 1 },
  { id: 'luz', categoria: 'Luz / Electricidad', importe: 0, amortizar_meses: 1 },
  { id: 'alarma', categoria: 'Alarma y seguridad', importe: 0, amortizar_meses: 1 },
  { id: 'limpieza', categoria: 'Limpieza', importe: 0, amortizar_meses: 1 },
  { id: 'gestoria', categoria: 'Gestoría / Asesoría', importe: 0, amortizar_meses: 1 },
  { id: 'desratizacion', categoria: 'Desratización y extintores', importe: 0, amortizar_meses: 12 },
  { id: 'mantenimiento', categoria: 'Mantenimiento instalaciones', importe: 0, amortizar_meses: 1 },
  { id: 'seguros', categoria: 'Seguros', importe: 0, amortizar_meses: 12 },
  { id: 'formacion', categoria: 'Formación y cursos', importe: 0, amortizar_meses: 1 },
  { id: 'marketing', categoria: 'Marketing y publicidad', importe: 0, amortizar_meses: 1 },
  { id: 'suscripciones', categoria: 'Suscripciones y software', importe: 0, amortizar_meses: 1 },
  { id: 'transportes', categoria: 'Transportes y mensajería', importe: 0, amortizar_meses: 1 },
  { id: 'varios', categoria: 'Varios', importe: 0, amortizar_meses: 1 },
]
