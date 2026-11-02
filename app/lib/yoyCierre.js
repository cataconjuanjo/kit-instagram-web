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

/**
 * Texto humano para el motivo (tooltip UI). Redactado para ser
 * agnóstico del modo (MoM / YoY): "mes de referencia" en lugar de
 * "año anterior", y sin jerga interna (seed, re-cierre, snapshot).
 */
export const MOTIVOS_TEXTO = {
  'ok':                      '',
  'sin-cierre-prev':         'Sin cierre del mes de referencia',
  'metrica-no-util':         'No hay comparación útil para esta métrica',
  'ambos-null':              'Dato no disponible en ninguno de los dos meses',
  'metrica-ausente-prev':    'Dato no disponible en el mes de referencia',
  'prev-cero':               'El mes de referencia tenía valor 0 (comparación no significativa)',
  'metrica-desconocida':     'Métrica no catalogada para la comparación',
}

/**
 * Overrides por métrica: cuando una métrica concreta quiere un texto
 * más específico para el usuario final que el genérico. Devueltos por
 * motivoText(motivo, metricKey).
 */
const MOTIVOS_POR_METRICA = {
  'merma_copa_eur': {
    'prev-cero': 'El mes de referencia no registra merma de copa, no es comparable.',
  },
}

/**
 * Texto humano para la UI, con override opcional por métrica.
 * Nunca lanza; devuelve '' si el motivo es 'ok' o desconocido.
 */
export function motivoText(motivo, metricKey) {
  return MOTIVOS_POR_METRICA[metricKey]?.[motivo]
      ?? MOTIVOS_TEXTO[motivo]
      ?? ''
}

/**
 * deltaResultado(snapActual, snapPrev) — regla especial para la
 * comparativa del campo `resultado`.
 *
 * Problema que resuelve: `snapshot.resultado` incluye `-merma_copa_eur`
 * en su fórmula. En el demo, los snapshots 2025 tienen merma=0 por un
 * artefacto previo; los 2026 (y oct en adelante tras los fixes de
 * [5c]) ya la incluyen. Comparar directamente `resultado` cuando una
 * de las dos partes tiene merma y la otra no mezcla cosas distintas.
 *
 * Regla:
 *   · Si una tiene merma > 0 y la otra tiene 0 o ausente, comparamos
 *     "resultado antes de merma" = resultado + merma_copa_eur en AMBOS
 *     lados. La parte con merma=0 no cambia (sumar 0). Devuelve
 *     base='antes_de_merma' para que la UI etiquete el delta.
 *   · Si ambas tienen merma > 0 (o ambas 0 / ambas ausentes), compara
 *     `resultado` directamente. Devuelve base='resultado'.
 *
 * Devuelve { delta, deltaPct, base, valor, prev }. delta/deltaPct
 * siguen las reglas de deltaMetrica('importe').
 */
export function deltaResultado(snapActual, snapPrev) {
  const SENTINEL = { delta: null, deltaPct: null, base: 'resultado', valor: null, prev: null }
  if (snapActual == null || snapPrev == null) return SENTINEL
  // Cuidado: Number(null) === 0 → check explícito null/undefined antes.
  if (snapActual.resultado == null || snapPrev.resultado == null) return SENTINEL
  const rA = Number(snapActual.resultado)
  const rB = Number(snapPrev.resultado)
  if (!Number.isFinite(rA) || !Number.isFinite(rB)) return SENTINEL

  // Nota: tratamos merma ausente como 0 a efectos de simetría (si no
  // está en el snapshot, no se descontó). Esto hace que ausencia y 0
  // sean equivalentes para la asimetría.
  const mAraw = snapActual.merma_copa_eur
  const mBraw = snapPrev.merma_copa_eur
  const mA = (mAraw == null || !Number.isFinite(Number(mAraw))) ? 0 : Number(mAraw)
  const mB = (mBraw == null || !Number.isFinite(Number(mBraw))) ? 0 : Number(mBraw)

  const asymmetric = (mA > 0 && mB === 0) || (mA === 0 && mB > 0)
  if (asymmetric) {
    const valor = round2(rA + mA)
    const prev  = round2(rB + mB)
    const r = deltaMetrica(valor, prev, 'importe')
    return { ...r, base: 'antes_de_merma', valor, prev }
  }
  const r = deltaMetrica(rA, rB, 'importe')
  return { ...r, base: 'resultado', valor: round2(rA), prev: round2(rB) }
}

/** Texto fijo para la etiqueta "antes de merma" en el delta de resultado. */
export const TOOLTIP_RESULTADO_ANTES_DE_MERMA =
  'Comparado antes de merma: el mes de referencia no registra merma de copa.'

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
