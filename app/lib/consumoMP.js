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
  // Si no hay desglose en absoluto, no hay nada que ofrecer.
  if (!dg || dg.desglose_v !== 1) {
    return {
      valor: null,
      estado: 'sin_datos',
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
      motivo: 'Falta inventario inicial del periodo (necesita dos conteos del mes).',
    }
  }

  // Sin conteos o faltan ambos saldos.
  //
  // Nota: no probamos el "solo inicial sin final" porque hoy el cálculo
  // de calcularMesBodega sólo acumula stock_inicial cuando hay 2+ conteos
  // (es decir, hay inicial si y sólo si hay final también). El caso
  // teórico es irrelevante para el flujo actual; si en el futuro el
  // agregador cambia, cae en esta misma rama de "sin_datos".
  //
  // `datos` se expone en la firma por si el consumer necesita pistas
  // adicionales (p. ej. para el mensaje "sin conteos vs con un único
  // conteo"); de momento basta con el estado sin inspeccionarlo.
  void datos
  return {
    valor: null,
    estado: 'sin_datos',
    motivo: 'Sin conteos de inventario del periodo: no se puede calcular el consumo.',
  }
}
