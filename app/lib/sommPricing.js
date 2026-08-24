/**
 * Motor de precios SUMILLER — cálculos exclusivos del tier Carta Viva Somm.
 *
 * Complementa pricingUtils.js y wineEconomics.js sin modificarlos.
 * Todos los precios son netos (sin IVA) salvo que se indique lo contrario.
 */

import { anadirIva, redondear, costeNetoCompra } from './wineEconomics'

// ── Utilidad interna ─────────────────────────────────────────────────────────

function num(valor) {
  if (typeof valor === 'string') valor = valor.replace(',', '.')
  return Number(valor) || 0
}

// ── Tramos de multiplicador ──────────────────────────────────────────────────

/**
 * Plantillas predefinidas de tramos por modelo de negocio.
 * Cada tramo: { coste_min, coste_max (null = sin límite), factor, pvp_minimo_carta, orden }
 */
export const PLANTILLAS_TRAMOS = {
  gastrotaberna: {
    nombre: 'Gastrotaberna',
    pvp_minimo_default: 15,
    tramos: [
      { coste_min: 0,     coste_max: 5.00,  factor: 3.0, pvp_minimo_carta: 15, orden: 1 },
      { coste_min: 5.01,  coste_max: 9.00,  factor: 2.8, pvp_minimo_carta: 15, orden: 2 },
      { coste_min: 9.01,  coste_max: 14.00, factor: 2.6, pvp_minimo_carta: 15, orden: 3 },
      { coste_min: 14.01, coste_max: 20.00, factor: 2.4, pvp_minimo_carta: 15, orden: 4 },
      { coste_min: 20.01, coste_max: 30.00, factor: 2.2, pvp_minimo_carta: 15, orden: 5 },
      { coste_min: 30.01, coste_max: null,  factor: 2.0, pvp_minimo_carta: 15, orden: 6 },
    ],
  },
  restaurante_lujo: {
    nombre: 'Restaurante Lujo',
    pvp_minimo_default: 35,
    tramos: [
      { coste_min: 0,      coste_max: 25.00,   factor: 2.6, pvp_minimo_carta: 35, orden: 1 },
      { coste_min: 25.01,  coste_max: 45.00,   factor: 2.4, pvp_minimo_carta: 35, orden: 2 },
      { coste_min: 45.01,  coste_max: 100.00,  factor: 2.2, pvp_minimo_carta: 35, orden: 3 },
      { coste_min: 100.01, coste_max: 250.00,  factor: 2.0, pvp_minimo_carta: 35, orden: 4 },
      { coste_min: 250.01, coste_max: 500.00,  factor: 1.8, pvp_minimo_carta: 35, orden: 5 },
      { coste_min: 500.01, coste_max: null,    factor: 1.5, pvp_minimo_carta: 35, orden: 6 },
    ],
  },
}

/**
 * Calcula el PVP neto de botella aplicando la tabla de tramos configurada por el restaurante.
 * El tramo se selecciona comparando el coste neto de compra.
 *
 * @param {number} costeNeto - Coste neto de compra del vino
 * @param {Array}  tramos    - Filas de la tabla tramos_multiplicador, ordenadas por orden ASC
 * @returns {{ pvpNeto: number, factor: number, tramoAplicado: object|null }}
 */
export function calcularPvpConTramos(costeNeto, tramos = []) {
  const coste = num(costeNeto)
  if (!coste || !tramos.length) return { pvpNeto: 0, factor: 0, tramoAplicado: null }

  const tramo = tramos.find(t => {
    const min = num(t.coste_min)
    const max = t.coste_max != null ? num(t.coste_max) : Infinity
    return coste >= min && coste <= max
  })

  if (!tramo) return { pvpNeto: 0, factor: 0, tramoAplicado: null }

  const factor = num(tramo.factor)
  const pvpNeto = coste * factor
  const pvpMinimo = num(tramo.pvp_minimo_carta)
  const pvpFinal = pvpMinimo ? Math.max(pvpNeto, pvpMinimo) : pvpNeto

  return { pvpNeto: redondear(pvpFinal, 4), factor, tramoAplicado: tramo }
}

// ── Método descorche (Método 2) ──────────────────────────────────────────────

/**
 * PVP con descorche: (coste × factor) + descorche_fijo.
 * Aplica IVA al final si se solicita.
 *
 * Tramos predefinidos del Método 2:
 *   5,01-15€: factor 2.0 / 15,01-30€: 1.9 / 30,01-100€: 1.8 / 100,01-500€: 1.7 / >500€: 1.6
 *
 * @param {number} costeNeto      - Coste neto de compra
 * @param {number} factor         - Factor multiplicador del tramo (ej: 2.0)
 * @param {number} descorcheFijo  - Precio fijo de servicio (ej: 9 EUR)
 * @param {number} ivaVentaPct    - IVA a aplicar (ej: 10)
 * @param {boolean} incluyeIva    - Si true, devuelve PVP con IVA incluido
 * @returns {{ pvpNeto: number, pvpConIva: number }}
 */
export function calcularPvpConDescorche(costeNeto, factor, descorcheFijo, ivaVentaPct = 10, incluyeIva = true) {
  const coste = num(costeNeto)
  const f = num(factor)
  const descorche = num(descorcheFijo)
  if (!coste || !f) return { pvpNeto: 0, pvpConIva: 0 }

  const pvpNeto = redondear(coste * f + descorche, 4)
  const pvpConIva = incluyeIva ? anadirIva(pvpNeto, ivaVentaPct) : pvpNeto
  return { pvpNeto, pvpConIva }
}

/**
 * Selecciona el factor del Método 2 (descorche) según el coste neto.
 * Usa los tramos predefinidos del PDF de fijación de precios.
 */
export function factorDescorchePorCoste(costeNeto) {
  const c = num(costeNeto)
  if (c <= 5)    return 2.0   // coste muy bajo: mismo factor que tramo base
  if (c <= 15)   return 2.0
  if (c <= 30)   return 1.9
  if (c <= 100)  return 1.8
  if (c <= 500)  return 1.7
  return 1.6
}

// ── Copas estándar por formato y tipo de vino (Gap 26) ──────────────────────

/**
 * Devuelve el número de copas vendibles a partir de la botella según el formato
 * (ml) y el tipo de vino. Con Coravin se resta 1 copa.
 *
 * Reglas (PDF Fijación de Precios):
 *   75cl tranquilo/espumoso → 6 copas de 12,5cl
 *   75cl generoso/dulce     → 8 copas de 9cl
 *   50cl generoso/dulce     → 5 copas de 9cl
 *   37,5cl generoso/dulce   → 4 copas de 9cl
 *   Con Coravin             → copas_base - 1 (por el gas consumido)
 */
export function copasEstandarPorFormato(ml, tipoVino = '', usaCoravin = false) {
  const mililitros = num(ml) || 750
  const tipo = String(tipoVino).toLowerCase()
  const esGeneroso = tipo.includes('generoso') || tipo.includes('dulce') ||
    tipo.includes('jerez') || tipo.includes('oporto') || tipo.includes('licor')

  let copasBase
  if (esGeneroso) {
    if (mililitros >= 700)      copasBase = 8
    else if (mililitros >= 475) copasBase = 5
    else                         copasBase = 4
  } else {
    // Tranquilo, espumoso, rosado, etc.
    copasBase = 6
  }

  return usaCoravin ? Math.max(1, copasBase - 1) : copasBase
}

/**
 * PVP copa derivado del PVP de botella (no desde el coste).
 * Garantiza que vender la botella entera por copas = ingreso equivalente al PVP botella.
 *
 * @param {number} pvpBotella   - PVP de botella (con o sin IVA, consistente con copas)
 * @param {number} copasEstandar - Número de copas de la botella (de copasEstandarPorFormato)
 * @returns {number} pvpCopa redondeado al tramo de 0,50€ más cercano
 */
export function pvpCopaDesBotella(pvpBotella, copasEstandar) {
  const pvp = num(pvpBotella)
  const copas = Math.max(1, num(copasEstandar))
  if (!pvp) return 0
  const copaBruta = pvp / copas
  return redondear(Math.round(copaBruta * 2) / 2, 2)   // redondeo a 0,50€
}

// ── Rentabilidad sobre coste (Gap 27) ────────────────────────────────────────

/**
 * % Rentabilidad sobre coste: (PVP_neto - coste_neto) / coste_neto × 100.
 * Es la métrica "cuánto multiplico el coste" que usa el PDF de fijación de precios.
 * Distinta del margenBrutoPct (que divide sobre el PVP).
 *
 * Ejemplo: coste 4€, PVP 12€ → rentabilidad = 200% (×3) / margen = 66,7%
 */
export function rentabilidadSobreCoste(pvpVenta, costeCompra, config = {}) {
  const { ivaVentaPct = 10, pvpIncluyeIva = true, costeIncluyeIva = false } = config
  const pvpNeto = pvpIncluyeIva
    ? pvpVenta / (1 + ivaVentaPct / 100)
    : num(pvpVenta)
  const costeNeto = costeIncluyeIva
    ? costeCompra / (1 + ivaVentaPct / 100)
    : num(costeCompra)
  if (!costeNeto) return 0
  return redondear(((pvpNeto - costeNeto) / costeNeto) * 100, 2)
}

/**
 * Factor multiplicador implícito: PVP_neto / coste_neto.
 * Ej: rentabilidad 200% → factor ×3.
 */
export function factorMultiplicadorImplicito(pvpVenta, costeCompra, config = {}) {
  const { ivaVentaPct = 10, pvpIncluyeIva = true, costeIncluyeIva = false } = config
  const pvpNeto = pvpIncluyeIva ? pvpVenta / (1 + ivaVentaPct / 100) : num(pvpVenta)
  const costeNeto = costeIncluyeIva ? costeCompra / (1 + ivaVentaPct / 100) : num(costeCompra)
  if (!costeNeto) return 0
  return redondear(pvpNeto / costeNeto, 2)
}

// ── Simulador What-If (Gap 28) ───────────────────────────────────────────────

/**
 * Calcula el impacto en beneficio anual al cambiar el PVP de un vino.
 *
 * @param {number} pvpNuevo       - PVP propuesto (con IVA si pvpIncluyeIva=true)
 * @param {number} pvpActual      - PVP actual del vino
 * @param {number} ventasAnuales  - Unidades vendidas al año
 * @param {object} config         - { ivaVentaPct, pvpIncluyeIva }
 * @returns {{ impacto: number, impactoNeto: number, pctVariacion: number }}
 */
export function impactoSubidaPrecio(pvpNuevo, pvpActual, ventasAnuales, config = {}) {
  const { ivaVentaPct = 10, pvpIncluyeIva = true } = config
  const divisor = pvpIncluyeIva ? (1 + ivaVentaPct / 100) : 1
  const pvpNetoNuevo = num(pvpNuevo) / divisor
  const pvpNetoActual = num(pvpActual) / divisor
  const ventas = num(ventasAnuales)
  const impactoNeto = redondear((pvpNetoNuevo - pvpNetoActual) * ventas, 2)
  const impacto = redondear((num(pvpNuevo) - num(pvpActual)) * ventas, 2)
  const pctVariacion = pvpActual
    ? redondear(((num(pvpNuevo) - num(pvpActual)) / num(pvpActual)) * 100, 2)
    : 0
  return { impacto, impactoNeto, pctVariacion }
}

/**
 * Calcula el total de impacto para una selección de vinos.
 * @param {Array} seleccion - [{ pvpNuevo, pvpActual, ventasAnuales }]
 */
export function impactoTotalSeleccion(seleccion = [], config = {}) {
  return seleccion.reduce((acc, item) => {
    const r = impactoSubidaPrecio(item.pvpNuevo, item.pvpActual, item.ventasAnuales, config)
    return {
      impacto: redondear(acc.impacto + r.impacto, 2),
      impactoNeto: redondear(acc.impactoNeto + r.impactoNeto, 2),
    }
  }, { impacto: 0, impactoNeto: 0 })
}

// ── Diferencial copa vs botella (Gap 14) ─────────────────────────────────────

/**
 * Diferencia de ingreso neto entre vender la botella completa por copas
 * vs vender la botella entera. Positivo = copa más rentable.
 *
 * @param {number} pvpCopa    - Precio de copa real en carta
 * @param {number} pvpBotella - Precio de botella en carta
 * @param {number} copas      - Número de copas vendibles (puede incluir merma)
 * @param {object} config     - { ivaVentaPct, pvpIncluyeIva }
 */
export function diferencialCopaVsBotella(pvpCopa, pvpBotella, copas, config = {}) {
  const { ivaVentaPct = 10, pvpIncluyeIva = true } = config
  const divisor = pvpIncluyeIva ? (1 + ivaVentaPct / 100) : 1
  const ingresoCopasNeto = (num(pvpCopa) / divisor) * Math.max(1, num(copas))
  const ingresoBotellaaNeto = num(pvpBotella) / divisor
  return redondear(ingresoCopasNeto - ingresoBotellaaNeto, 2)
}
