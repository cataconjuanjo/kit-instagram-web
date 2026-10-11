/**
 * Vocabulario canónico de tipos de movimiento de stock.
 *
 * Durante la ventana expand (B1 aplicado, B1-contract pendiente) el CHECK de
 * la base admite tanto tipos canónicos como tipos legacy. Este módulo abstrae
 * esa dualidad: cada función y constante acepta ambos vocabularios.
 *
 * Mapa de backfill (legacy → canónico):
 *   entrada       → compra
 *   venta         → venta_botella
 *   merma         → rotura
 *   invitacion    → invitacion_botella
 *
 * Cuando se ejecute B1-contract, los tipos legacy desaparecerán de la base y
 * los arrays de constantes se podrán reducir a solo vocabulario canónico.
 */

// ── Entradas de stock (compra a proveedor) ────────────────────────────────────
export const TIPOS_ENTRADA = new Set([
  'compra',   // canónico
  'entrada',  // legacy → compra
])

// ── Salidas por venta (generan estadística de revenue) ───────────────────────
export const TIPOS_SALIDA_VENTA = new Set([
  'venta_botella',  // canónico — botella completa
  'venta_copa',     // canónico — servicio por copas
  'venta',          // legacy → venta_botella
])

// ── Salidas por consumo sin venta directa ────────────────────────────────────
// Reducen stock pero no generan ingresos de venta.
// 'devolucion' queda excluida: el stock va al proveedor, no se consume aquí.
export const TIPOS_SALIDA_SIN_VENTA = new Set([
  'invitacion_botella', // canónico
  'invitacion_copa',    // canónico
  'cocina',             // preexistente (add_carta_viva_somm)
  'grupo_evento',       // preexistente
  'maridaje',           // preexistente
  'rotura',             // preexistente
  'cata',               // preexistente
  'invitacion',         // legacy → invitacion_botella
  'merma',              // legacy → rotura
])

// ── Ajuste de inventario (corrección de conteo) ───────────────────────────────
// Puede ser positivo (faltaba stock contado) o negativo (sobraba stock contado).
// No representa ni consumo real ni compra: es una corrección técnica.
export const TIPOS_AJUSTE = new Set(['ajuste'])

// ── Tipos que NO representan consumo físico ───────────────────────────────────
// Uso: excluirlos de métricas de consumo, merma y "salidas del mes".
//
// · compra/entrada:  el stock llega al almacén — no sale.
// · ajuste:          corrección de inventario — no es uso real del producto.
// · devolucion:      el stock vuelve al proveedor. Sale del almacén pero NO fue
//                    consumido en el restaurante. Por esto se excluye de
//                    salidasUnidades, ajustesNegativos y "Salidas este mes".
export const TIPOS_NO_CONSUMO = new Set([
  'compra',
  'entrada',    // legacy de compra
  'devolucion', // devolución a proveedor — salida no consumo
  'ajuste',
])

// ── Funciones de clasificación ────────────────────────────────────────────────

/** Movimiento que añade stock (compra a proveedor, entrada manual). */
export function esEntrada(tipo) {
  return TIPOS_ENTRADA.has(tipo)
}

/** Movimiento que registra una venta con impacto en estadísticas de revenue. */
export function esVenta(tipo) {
  return TIPOS_SALIDA_VENTA.has(tipo)
}

/**
 * Salida de stock por consumo sin revenue directo:
 * invitaciones, cocina, eventos, maridaje, rotura, cata.
 * NO incluye devolución a proveedor ni ajuste de inventario.
 */
export function esSalidaSinVenta(tipo) {
  return TIPOS_SALIDA_SIN_VENTA.has(tipo)
}

/**
 * Consumo real: el vino fue usado en el restaurante (vendido, invitado,
 * consumido en cocina, roto, etc.).
 *
 * Excluye:
 *  · compra/entrada   — el stock entra, no sale
 *  · ajuste           — corrección técnica, no consumo real
 *  · devolucion       — vuelve al proveedor, no se consumió aquí
 *
 * Equivale a: esVenta(tipo) || esSalidaSinVenta(tipo)
 */
export function esConsumo(tipo) {
  return TIPOS_SALIDA_VENTA.has(tipo) || TIPOS_SALIDA_SIN_VENTA.has(tipo)
}
