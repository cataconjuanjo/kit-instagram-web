/**
 * historicoExtras.js — Lectura y utilidades puras para las 4 columnas
 * "extras" de `historico_mensual`:
 *   valor_stock_bodega, stock_inicial_valor, stock_final_valor, compras_total
 *
 * Historia del campo: se añadieron como NOT NULL DEFAULT 0, así que
 * las filas antiguas (p. ej. Casa Marisma 2025) tienen esos campos a 0
 * sin que eso signifique "cero reales" — es "sin dato". La migración
 * pendiente `relax_historico_mensual_stock_compras` libera esas
 * columnas a NULL y rellena con NULL donde los cuatro valgan 0.
 *
 * Mientras tanto, y también DESPUÉS de la migración, este módulo
 * aplica la regla única:
 *
 *   "Sin dato" ≡ las cuatro columnas son null o 0 a la vez.
 *   "Con dato" ≡ al menos una de las cuatro tiene un número finito ≠ 0.
 *
 * Así el código funciona exactamente igual antes y después del SQL.
 */

export const EXTRAS_KEYS = Object.freeze([
  'valor_stock_bodega',
  'stock_inicial_valor',
  'stock_final_valor',
  'compras_total',
])

function esFinito(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

function toNumOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return esFinito(n) ? n : null
}

/**
 * Devuelve `{ valor_stock_bodega, stock_inicial_valor, stock_final_valor,
 * compras_total }` con null donde no hay dato aprovechable.
 *
 * Si los CUATRO valores son null o 0, se devuelven los cuatro como null.
 * Si al menos uno es un número finito ≠ 0, se preservan los números
 * (los 0 individuales se mantienen; pueden representar un dato real).
 */
export function leerExtrasHistorico(row) {
  const r = row || {}
  const vals = EXTRAS_KEYS.map(k => toNumOrNull(r[k]))
  const hayAlgunoNoCero = vals.some(v => v != null && v !== 0)
  if (!hayAlgunoNoCero) {
    return {
      valor_stock_bodega: null,
      stock_inicial_valor: null,
      stock_final_valor: null,
      compras_total: null,
    }
  }
  return {
    valor_stock_bodega:  vals[0],
    stock_inicial_valor: vals[1],
    stock_final_valor:   vals[2],
    compras_total:       vals[3],
  }
}

/** true si al menos una de las 4 columnas tiene dato (finito y ≠ 0). */
export function tieneHistoricoExtras(row) {
  const r = row || {}
  return EXTRAS_KEYS.some(k => {
    const v = toNumOrNull(r[k])
    return v != null && v !== 0
  })
}

// ── Formato numérico español (coma decimal) ────────────────────────────

/**
 * Parsea una cadena en formato español ("1.234,56", "1234,5", "0,05")
 * a `number`. Devuelve `null` para:
 *   - null / undefined / ''
 *   - cadenas que no parsean a número finito
 *   - valores negativos (los importes aquí no pueden serlo)
 *
 * Acepta ya números: `parseComaEs(5)` → 5.
 */
export function parseComaEs(valor) {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') return esFinito(valor) && valor >= 0 ? valor : null
  if (typeof valor !== 'string') return null
  const s = valor.trim()
  if (s === '') return null
  // Normaliza: elimina separadores de miles (.) y convierte la coma en
  // punto decimal. Si hay varias comas → inválido.
  if ((s.match(/,/g) || []).length > 1) return null
  const normalizado = s.replace(/\./g, '').replace(',', '.')
  const n = Number(normalizado)
  if (!esFinito(n) || n < 0) return null
  return n
}

/** Formatea un número a cadena es-ES. null/undefined → ''. */
export function formatComaEs(n, { decimales = 2 } = {}) {
  if (n === null || n === undefined || !esFinito(Number(n))) return ''
  // Fijamos useGrouping:true para que Node (que en algunas builds ICU
  // devuelve el formato sin separador de miles) emita "1.234,50" y no
  // "1234,50". En navegador el valor por defecto también agrupa.
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: true,
  }).format(Number(n))
}

// ── Payload para el upsert de historico_mensual (desde el form manual)

/**
 * Prepara las claves de las 4 columnas para incluir en un upsert.
 * Pasa valores leídos del form (strings con coma o number) y devuelve
 * un objeto con solo las claves presentes.
 *
 * Regla:
 *   - Entradas vacías (null/''/undefined) → se omiten (preservan valor
 *     existente en update, o caen al default en insert).
 *   - Números finitos ≥ 0 → se escriben tal cual.
 *
 * NO escribe NULL explícito: así el upsert es seguro tanto antes como
 * después de la migración (antes, las columnas son NOT NULL con default 0).
 * Para "borrar" un valor desde la UI, el usuario pone 0; si queda a 0
 * en las cuatro, la lectura futura lo mostrará como "Sin dato".
 */
export function extrasHistoricoPayload(entrada) {
  const e = entrada || {}
  const out = {}
  for (const k of EXTRAS_KEYS) {
    const v = parseComaEs(e[k])
    if (v !== null) out[k] = v
  }
  return out
}

// ── Ratios históricos (equivalentes a ratiosCierre pero sobre la fila
//    de historico_mensual del año anterior) ────────────────────────────

/**
 * Valida que una fila de `historico_mensual` corresponde exactamente
 * al MISMO MES del AÑO ANTERIOR del cierre que se está visualizando.
 *
 *   - mesActual: cadena 'YYYY-MM' del cierre mostrado en pantalla.
 *   - row:       fila de la tabla con `.anio` y `.mes` (numéricos).
 *
 * Devuelve `true` sólo cuando row.anio === mesActual.year − 1 y
 * row.mes === mesActual.month. Si alguno falta, no es numérico, o la
 * fila es null/undefined, devuelve `false`. Sirve como guarda
 * defensiva contra renders con estado obsoleto cuando el usuario
 * cambia de mes antes de que termine el fetch del histórico.
 */
export function coincideMesHistorico(mesActual, row) {
  if (!row || typeof row !== 'object') return false
  if (typeof mesActual !== 'string' || !/^\d{4}-\d{2}$/.test(mesActual)) return false
  const [yStr, mStr] = mesActual.split('-')
  const yEsp = parseInt(yStr, 10) - 1
  const mEsp = parseInt(mStr, 10)
  const yRow = typeof row.anio === 'number' ? row.anio : Number(row.anio)
  const mRow = typeof row.mes  === 'number' ? row.mes  : Number(row.mes)
  if (!Number.isFinite(yRow) || !Number.isFinite(mRow)) return false
  return yRow === yEsp && mRow === mEsp
}

/**
 * Devuelve `true` cuando el `datos` de un cierre (o el cálculo en
 * vivo) trae informe con al menos una entrada por vino. Es la misma
 * condición que usa `construirCierreWorkbook` para el `early return`
 * con `empty: true`: la usamos en la UI para avisar antes de pulsar
 * el botón de exportar, en lugar de que la descarga falle en silencio.
 */
export function tieneDatosExportables(datos) {
  const porVino = datos?.informe?.por_vino
  return Array.isArray(porVino) && porVino.length > 0
}

/**
 * Deriva rotación / cobertura / consumo-vs-compras a partir de los
 * cuatro extras + consumo_mp + días del mes. Null-safe: cualquier
 * ingrediente faltante → el ratio correspondiente sale null.
 *
 * Fórmulas:
 *   stock_medio       = (stock_inicial_valor + stock_final_valor) / 2
 *   rotacion          = consumo_mp / stock_medio                       (si stock_medio > 0)
 *   cobertura_dias    = stock_final_valor × dias / consumo_mp          (si consumo_mp > 0)
 *   consumo_vs_compras = consumo_mp / compras_total                    (si compras_total > 0)
 *
 * `consumo_mp` ya existe en historico_mensual como columna propia.
 */
export function ratiosHistoricos({ extras, consumo_mp, dias }) {
  const e = extras || {}
  const ini = toNumOrNull(e.stock_inicial_valor)
  const fin = toNumOrNull(e.stock_final_valor)
  const compras = toNumOrNull(e.compras_total)
  const consumo = toNumOrNull(consumo_mp)
  const d = toNumOrNull(dias)

  const stock_medio = (esFinito(ini) && esFinito(fin)) ? (ini + fin) / 2 : null
  const rotacion = (esFinito(consumo) && esFinito(stock_medio) && stock_medio > 0)
    ? consumo / stock_medio : null
  const cobertura_dias = (esFinito(fin) && esFinito(consumo) && esFinito(d) && consumo > 0)
    ? (fin * d) / consumo : null
  const consumo_vs_compras = (esFinito(consumo) && esFinito(compras) && compras > 0)
    ? consumo / compras : null

  return { rotacion, cobertura_dias, consumo_vs_compras, stock_medio }
}
