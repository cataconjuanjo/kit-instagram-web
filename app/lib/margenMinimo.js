/**
 * margenMinimo — Cálculo del PVP mínimo y descuento máximo.
 *
 * Fórmula (idéntica a la que usa la app para MRG. BOT./COPA):
 *   margen = (PVP_neto − coste_neto) / PVP_neto
 *   ⟹  PVP_neto = coste_neto / (1 − margen)
 *   ⟹  PVP_con_iva = PVP_neto × (1 + iva/100)  [si pvp_incluye_iva=true]
 *
 * Coste base: coste_medio_pmp con fallback a coste_compra.
 * Coste copa: coste_botella / (copas_por_botella × (1 − merma_copa_pct/100)).
 *
 * Redondeo: hacia arriba (Math.ceil) al paso comercial, para garantizar el
 * suelo de margen — diferente de PVP sugerido que usa Math.round.
 *   Botella: paso = redondeoBotellaEur (defecto 1,00 €)
 *   Copa:    paso = redondeoCopaEur    (defecto 0,50 €)
 *
 * Módulo autocontenido (sin imports locales) para permitir tests con Node.js
 * sin necesitar el bundler de Next.js.
 */

// ── Helpers internos ──────────────────────────────────────────────────────────

function n(v) {
  if (typeof v === 'string') v = v.replace(',', '.')
  return Number(v) || 0
}

function redondear(v, decimales) {
  const factor = Math.pow(10, decimales)
  return Math.round(n(v) * factor) / factor
}

function bool(v, fallback) {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === '1') return true
  if (v === 'false' || v === '0') return false
  return fallback
}

// Normaliza ajustes DB (snake_case) o wineEconomics (camelCase) a un config unificado.
function normConfig(ajustes = {}) {
  const a = ajustes || {}
  const iva = n(a.iva_venta_pct ?? a.ivaVentaPct) || 10
  return {
    ivaVentaPct:       iva,
    pvpIncluyeIva:     bool(a.pvp_incluye_iva ?? a.pvpIncluyeIva, true),
    costeIncluyeIva:   bool(a.coste_incluye_iva ?? a.costeIncluyeIva, false),
    copasPorBotella:   n(a.copas_por_botella ?? a.copasPorBotella) || 5,
    mermaCopaPct:      Math.min(95, Math.max(0, n(a.merma_copa_pct ?? a.mermaCopaPct))),
    redondeoBotellaEur: n(a.redondeo_botella ?? a.redondeoBotellaEur) || 1.00,
    redondeoCopaEur:    n(a.redondeo_copa    ?? a.redondeoCopaEur)    || 0.50,
  }
}

function costeNeto(coste, config) {
  const c = n(coste)
  if (!c) return 0
  // Si el coste YA incluye IVA, quitarlo para obtener el neto
  return config.costeIncluyeIva
    ? c / (1 + config.ivaVentaPct / 100)
    : c
}

function copasVendibles(config) {
  return Math.max(1, config.copasPorBotella * (1 - config.mermaCopaPct / 100))
}

function pvpConIva(pvpNeto, config) {
  return config.pvpIncluyeIva
    ? redondear(pvpNeto * (1 + config.ivaVentaPct / 100), 4)
    : redondear(pvpNeto, 4)
}

function redondearHaciaArriba(exacto, paso) {
  const p = paso || 1
  return redondear(Math.ceil(exacto / p) * p, 2)
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * PVP mínimo para venta en botella.
 * @returns {{ exacto: number, redondeado: number } | null}
 */
export function pvpMinimoBottle(coste, margenMinPct, ajustes = {}) {
  const config = normConfig(ajustes)
  const cn = costeNeto(coste, config)
  if (!cn || margenMinPct == null || margenMinPct <= 0 || margenMinPct >= 100) return null
  const pvpNeto = cn / (1 - margenMinPct / 100)
  const exacto  = redondear(pvpConIva(pvpNeto, config), 2)
  return { exacto, redondeado: redondearHaciaArriba(exacto, config.redondeoBotellaEur) }
}

/**
 * PVP mínimo para venta por copa.
 * @returns {{ exacto: number, redondeado: number } | null}
 */
export function pvpMinimoCopa(coste, margenMinPct, ajustes = {}) {
  const config = normConfig(ajustes)
  const cn = costeNeto(coste, config)
  if (!cn || margenMinPct == null || margenMinPct <= 0 || margenMinPct >= 100) return null
  const copas     = copasVendibles(config)
  const costeCopa = cn / copas
  const pvpNeto   = costeCopa / (1 - margenMinPct / 100)
  const exacto    = redondear(pvpConIva(pvpNeto, config), 2)
  return { exacto, redondeado: redondearHaciaArriba(exacto, config.redondeoCopaEur) }
}

/**
 * Descuento máximo aplicable sin bajar del PVP mínimo exacto.
 * @returns {{ pct: number|null, eur: number|null, porDebajo: boolean }}
 */
export function descuentoMaximo(pvpActual, pvpMinExacto) {
  const actual = n(pvpActual)
  const minimo = n(pvpMinExacto)
  if (!actual || !minimo) return { pct: null, eur: null, porDebajo: false }
  const eur = redondear(actual - minimo, 2)
  if (eur < 0) return { pct: null, eur: null, porDebajo: true }
  return { pct: redondear((eur / actual) * 100, 1), eur, porDebajo: false }
}

/**
 * Estado de la fila para botella o copa.
 * @returns {'ok'|'por_debajo'|'sin_pvp'|'sin_coste'}
 */
export function estadoFila(pvpActual, pvpMinExacto, tieneCoste) {
  if (!tieneCoste) return 'sin_coste'
  if (!n(pvpActual)) return 'sin_pvp'
  if (pvpMinExacto === null) return 'sin_coste'
  return n(pvpActual) < pvpMinExacto ? 'por_debajo' : 'ok'
}

/**
 * Extrae el coste base del vino: coste_medio_pmp con fallback a coste_compra.
 */
export function costeBase(vino = {}) {
  const pmp    = n(vino.coste_medio_pmp)
  const compra = n(vino.coste_compra)
  return pmp > 0 ? pmp : compra
}
