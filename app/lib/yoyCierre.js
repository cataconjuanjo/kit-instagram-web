/**
 * yoyCierre.js — Helper puro para la comparativa YoY del Cierre mensual.
 *
 * Pensado para dos snapshots (actual y mismo mes del año anterior)
 * leídos del endpoint /api/cierres-mes. Toda la lógica de delta /
 * comparabilidad / semántica de signo vive aquí para que la UI quede
 * simple y los tests cubran bien las reglas.
 *
 * Reglas (coherentes con app/lib/yoyAgregacion.js y con
 * app/dashboard/bodega/CierreMensual.js:variPct):
 *
 *   deltaMetrica(valor, prev, tipo):
 *     'importe' → { delta: valor − prev, deltaPct: delta / |prev| * 100 }
 *                 deltaPct = null si prev == 0 o cualquiera null/undefined.
 *     'ratio'   → { delta: (valor − prev) en PUNTOS PORCENTUALES,
 *                   deltaPct: null }  (no %/%).
 *
 *   esComparable(snapActual, snapPrev, metrica, flags):
 *     Devuelve string: 'ok' | 'sin-cierre-prev' | 'metrica-no-util'
 *                     | 'prev-cero' | 'ambos-null' | 'metrica-ausente-prev'
 *     Casos:
 *       · flags.prevCerrado === false     → 'sin-cierre-prev'
 *       · metrica.sinYoY === true          → 'metrica-no-util'
 *       · prev == null, actual == null     → 'ambos-null'
 *       · metrica no está en snapPrev      → 'metrica-ausente-prev'
 *       · tipo='importe' y prev === 0      → 'prev-cero'
 *       · resto                             → 'ok'
 *
 * Lista cerrada de métricas con dirección (sube = bueno|malo):
 *   Para colorear el delta correctamente. "bueno" significa que subir
 *   es favorable para el negocio (ventas, margen, resultado). "malo"
 *   lo contrario (merma, coste, gastos, compras, salidas).
 *
 *   La lista también declara `tipo` ('importe'|'ratio') y `sinYoY`
 *   cuando una métrica no debe mostrar YoY aunque exista en snapshot.
 */

export function deltaMetrica(valor, prev, tipo = 'importe') {
  const noNum = v => v == null || typeof v !== 'number' || !Number.isFinite(v)
  if (noNum(valor) || noNum(prev)) return { delta: null, deltaPct: null }
  if (tipo === 'ratio') {
    const delta = round1(valor - prev)       // puntos porcentuales
    return { delta, deltaPct: null }
  }
  const delta = round2(valor - prev)
  const deltaPct = (prev === 0) ? null : Math.round(delta / Math.abs(prev) * 100)
  return { delta, deltaPct }
}

function round2(n) { return Math.round(n * 100) / 100 }
function round1(n) { return Math.round(n * 10)  / 10 }

/**
 * Lista cerrada de métricas comparables YoY en el Cierre mensual.
 * key  = ruta del campo en el snapshot (datos.<key>).
 * tipo = 'importe' | 'ratio'.
 * dir  = 'up-good' | 'up-bad'  (semántica para colorear el delta).
 * sinYoY = true   (métrica presente en snapshot pero NO útil para YoY:
 *                   rendimiento_copa es por vino, snapshot anterior
 *                   suele estar vacío).
 */
export const METRICAS_CIERRE_YOY = [
  { key: 'ventas_bruto',          tipo: 'importe', dir: 'up-good' },
  { key: 'ventas_neto',           tipo: 'importe', dir: 'up-good' },
  { key: 'coste_ventas_teorico',  tipo: 'importe', dir: 'up-bad'  },
  { key: 'margen_bruto',          tipo: 'importe', dir: 'up-good' },
  { key: 'margen_pct',            tipo: 'ratio',   dir: 'up-good' },
  { key: 'compras_bruto',         tipo: 'importe', dir: 'up-bad'  },
  { key: 'compras_netas',         tipo: 'importe', dir: 'up-bad'  },
  { key: 'devoluciones',          tipo: 'importe', dir: 'up-good' },
  { key: 'salidas_no_venta',      tipo: 'importe', dir: 'up-bad'  },
  { key: 'merma_copa_eur',        tipo: 'importe', dir: 'up-bad'  },
  { key: 'stock_final',           tipo: 'importe', dir: 'up-good' },
  { key: 'gastos_total',          tipo: 'importe', dir: 'up-bad'  },
  { key: 'resultado',             tipo: 'importe', dir: 'up-good' },
  // Marcadas sinYoY: no se usan en la vista YoY (el helper lo filtra).
  { key: 'rendimiento_copa',      sinYoY: true },
]

/** Lookup rápido por key. */
const META_BY_KEY = Object.fromEntries(METRICAS_CIERRE_YOY.map(m => [m.key, m]))

export function metricaPorKey(key) {
  return META_BY_KEY[key] || null
}

/**
 * esComparable: devuelve un código motivo. 'ok' = se puede mostrar YoY.
 * flags.prevCerrado proviene de la respuesta /api/cierres-mes
 * (jsonAnt.cerrado); si false, el mes del año anterior NO es un cierre
 * firmado y no se compara (no se usa ventas_neto===0 como criterio).
 */
export function esComparable(snapActual, snapPrev, metrica, flags = {}) {
  const meta = typeof metrica === 'string' ? metricaPorKey(metrica) : metrica
  if (!meta)                return 'metrica-desconocida'
  if (meta.sinYoY)          return 'metrica-no-util'
  if (flags.prevCerrado === false) return 'sin-cierre-prev'
  const valor = snapActual?.[meta.key]
  const prev  = snapPrev?.[meta.key]
  if (valor == null && prev == null) return 'ambos-null'
  if (prev == null)                   return 'metrica-ausente-prev'
  if (meta.tipo === 'importe' && prev === 0 && Number(valor) !== 0) {
    // Ej. merma_copa_eur 2025=0 (artefacto seed) vs 2026 > 0 → no es
    // una comparación útil. Lo marcamos como "prev-cero" para pintar
    // "—" con tooltip, no "+inf%".
    return 'prev-cero'
  }
  if (meta.tipo === 'importe' && prev === 0 && Number(valor) === 0) {
    // Ambos 0: no hay nada que comparar, es simétrico.
    return 'prev-cero'
  }
  return 'ok'
}

/** Texto humano para el motivo (tooltip UI). */
export const MOTIVOS_TEXTO = {
  'ok':                      '',
  'sin-cierre-prev':         'Sin cierre del mismo mes del año anterior',
  'metrica-no-util':         'No hay comparación interanual útil para esta métrica',
  'ambos-null':              'Dato no disponible en ninguno de los dos meses',
  'metrica-ausente-prev':    'Dato no disponible en el mes del año anterior',
  'prev-cero':               'El mes del año anterior tenía valor 0 (comparación no significativa)',
  'metrica-desconocida':     'Métrica no catalogada para YoY',
}

/**
 * Decide el color (tagColor) del delta según la dirección de la métrica.
 * Reemplaza el patrón previo "delta>0 => verde SIEMPRE".
 *
 *   dir='up-good' → delta>0 verde, delta<0 rojo.
 *   dir='up-bad'  → delta>0 rojo,  delta<0 verde.
 *   dir ausente   → neutral (gris / sin color).
 *
 * COLOR_VERDE/ROJO son los mismos que CierreMensual.js:78 usa hoy, para
 * no introducir una nueva paleta.
 */
export const COLOR_VERDE = '#4A8C6F'
export const COLOR_ROJO  = '#b85454'

export function colorDelta(delta, dir) {
  if (delta == null || delta === 0 || !dir) return null
  if (dir === 'up-good') return delta > 0 ? COLOR_VERDE : COLOR_ROJO
  if (dir === 'up-bad')  return delta > 0 ? COLOR_ROJO  : COLOR_VERDE
  return null
}
