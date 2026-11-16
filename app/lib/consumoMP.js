/**
 * consumoMP.js — Consumo de materia prima calculado a partir del desglose
 * del cierre mensual.
 *
 * Función pura, sin efectos. Se usa en /dashboard/explotacion para ofrecer
 * un valor sugerido del consumo (botón "Usar consumo calculado") sin
 * sobrescribir el valor manual que el usuario pueda tener introducido.
 *
 * El consumo canónico del desglose v1 ya está calculado como:
 *   consumo = stock_inicial + compras_netas − stock_final_real
 * y es null si falta stock_inicial o stock_final_real. Este módulo sólo
 * añade semántica de "¿se puede ofrecer como sugerencia?" y un motivo
 * humano para el fallback.
 */

/** Lectura ESTRICTA: solo números finitos reales. Sin coerción. */
function numLegit(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null
}

/**
 * @param {{ desglose?: object|null, datos?: object|null }} input
 * @returns {{ valor: number|null, estado: 'calculado'|'parcial'|'sin_datos',
 *             motivo: string|null }}
 */
export function calcularConsumoMP({ desglose, datos } = {}) {
  const dg = desglose || null
  // Si no hay desglose en absoluto (cierres firmados antes de v1 o
  // respuesta sin bloque desglose), no hay nada que ofrecer. El caso se
  // identifica explícitamente para que la UI pueda mostrar un texto
  // distinto de "sin conteos del mes".
  if (!dg || dg.desglose_v !== 1) {
    return {
      valor: null,
      estado: 'sin_datos',
      caso: 'snapshot_antiguo',
      motivo: 'El cierre de este periodo no incluye desglose (snapshot anterior a v1).',
    }
  }

  const stockIni       = numLegit(dg?.stock_inicial?.valor_eur)
  const stockFinalReal = numLegit(dg?.stock_final_real?.valor_eur)
  const consumoVal     = numLegit(dg?.consumo?.valor_eur)

  // Caso principal: tenemos saldo inicial y saldo final reales y el
  // desglose ya ha calculado el consumo. Lo exponemos como "calculado".
  if (stockIni != null && stockFinalReal != null && consumoVal != null) {
    return {
      valor: consumoVal,
      estado: 'calculado',
      caso: 'ambos_saldos',
      motivo: null,
    }
  }

  // Parcial: tenemos saldo final pero no saldo inicial. No podemos
  // calcular el consumo (requiere los dos), pero avisamos del motivo
  // para que el usuario sepa qué le falta.
  if (stockIni == null && stockFinalReal != null) {
    return {
      valor: null,
      estado: 'parcial',
      caso: 'falta_inicial',
      motivo: 'Falta inventario inicial',
    }
  }

  // Sin conteos (o faltan ambos saldos). El agregador actual sólo
  // acumula stock_inicial cuando hay 2+ conteos y stock_final_real
  // cuando el desglose puede cerrarse: si los dos son null, es que no
  // hubo conteos del mes.
  //
  // `datos` se mantiene en la firma por si el consumer necesita pistas
  // adicionales; de momento no lo inspeccionamos.
  void datos
  return {
    valor: null,
    estado: 'sin_datos',
    caso: 'sin_conteos',
    motivo: 'Sin inventario inicial y final contado en este mes',
  }
}
