/**
 * Parámetros económicos de bodega — módulo puro (sin supabase, sin DOM).
 *
 * Centraliza:
 *   - DEFAULTS reales que verá un restaurante SIN fila en
 *     `restaurant_economic_settings`. Son los MISMOS valores que
 *     aplica `agregarPeriodoBodega.js` cuando la fila falta
 *     (iva=10, copas=5, merma=0 en el agregador, 10 en el schema).
 *   - VALIDOS canónicos para `fuente_ventas` (según CHECK del schema
 *     en `supabase/b1_movimientos_expand.sql:47-48`: 'tpv' / 'parte' /
 *     'ambas' / NULL).
 *   - Validación + normalización de los 4 campos editables. El
 *     endpoint PUT la usa para rechazar input inválido (rangos,
 *     tipos) antes de escribir.
 *
 * Mantener invariantes:
 *   - `copas_por_botella` sigue siendo numeric(6,2) en BD, pero la
 *     UI lo expone como entero 1-12 (es lo que entiende el sumiller).
 *   - `iva_venta_pct` y `merma_copa_pct` admiten 2 decimales, rango 0-30.
 *   - `fuente_ventas` acepta uno de VALIDOS o null. "No disponible
 *     todavía" sólo se aplica en la UI; el backend acepta cualquiera
 *     de los valores del CHECK sin re-escribirlos (preserva 'tpv'/
 *     'ambas' si ya estaban guardados antes).
 *
 * El handler de GET usa `DEFAULTS` cuando no hay fila; el handler de
 * PUT usa `validarParametros` para rechazar inválidos y `normalizar`
 * para dejarlo en el shape canónico antes de escribir sólo las claves
 * tocadas (upsert parcial).
 */

/**
 * Defaults REALES cuando el restaurante no tiene fila en
 * `restaurant_economic_settings`. Coinciden con:
 *   - schema `add_economic_traceability.sql` (iva=10, copas=5, merma=10)
 *   - agregador `agregarPeriodoBodega.js:16-33` (cae a estos cuando
 *     el campo es null/undefined)
 * `fuente_ventas` por defecto null → el agregador lee PARTES (único
 * flujo real hoy; TPV es stub B8 sin implementar).
 */
export const DEFAULTS = Object.freeze({
  copas_por_botella: 5,
  iva_venta_pct: 10,
  merma_copa_pct: 10,
  fuente_ventas: null,
})

/**
 * Valores que el CHECK de la BD acepta para `fuente_ventas`. NULL
 * también es válido (ver schema expand). El endpoint acepta cualquier
 * valor del array o null; la UI sólo deja al propietario cambiar a
 * 'parte' (único implementado). 'tpv' y 'ambas' se preservan si ya
 * estaban guardados (B8 pendiente).
 */
export const FUENTES_VENTAS_VALIDAS = Object.freeze(['parte', 'tpv', 'ambas'])

/** Único valor de `fuente_ventas` que la UI permite ELEGIR hoy. */
export const FUENTE_VENTAS_UI_ELEGIBLE = 'parte'

/**
 * Fuentes que la UI debe pintar como deshabilitadas con el motivo.
 * Si una fila ya guardada tiene 'tpv' o 'ambas' NO se re-escribe:
 * el handler PUT ignora la clave si el usuario no la tocó.
 */
export const FUENTES_VENTAS_NO_DISPONIBLES = Object.freeze(['tpv', 'ambas'])

/**
 * Valida un objeto parcial de parámetros. Devuelve
 *   { ok: true,  normalizado: {...} }  ← solo contiene las claves tocadas,
 *                                        normalizadas al tipo canónico.
 *   { ok: false, errores: [{campo, mensaje}, ...] }
 *
 * Reglas (una por campo, en el orden del brief):
 *   copas_por_botella → entero 1..12 (rechaza decimales)
 *   iva_venta_pct     → número 0..30, se redondea a 2 decimales
 *   merma_copa_pct    → número 0..30, se redondea a 2 decimales
 *   fuente_ventas     → null | 'parte' | 'tpv' | 'ambas'
 *
 * Clave ausente o undefined → NO se incluye en `normalizado`
 * (upsert parcial). `null` se permite sólo para `fuente_ventas`.
 */
export function validarParametros(entrada) {
  const errores = []
  const out = {}
  if (!entrada || typeof entrada !== 'object') {
    return { ok: false, errores: [{ campo: '_', mensaje: 'Entrada inválida' }] }
  }

  if ('copas_por_botella' in entrada && entrada.copas_por_botella !== undefined) {
    const v = entrada.copas_por_botella
    const n = Number(v)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 12) {
      errores.push({ campo: 'copas_por_botella', mensaje: 'Debe ser un entero entre 1 y 12' })
    } else {
      out.copas_por_botella = n
    }
  }

  if ('iva_venta_pct' in entrada && entrada.iva_venta_pct !== undefined) {
    const n = Number(entrada.iva_venta_pct)
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      errores.push({ campo: 'iva_venta_pct', mensaje: 'Debe ser un número entre 0 y 30' })
    } else {
      out.iva_venta_pct = Math.round(n * 100) / 100
    }
  }

  if ('merma_copa_pct' in entrada && entrada.merma_copa_pct !== undefined) {
    const n = Number(entrada.merma_copa_pct)
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      errores.push({ campo: 'merma_copa_pct', mensaje: 'Debe ser un número entre 0 y 30' })
    } else {
      out.merma_copa_pct = Math.round(n * 100) / 100
    }
  }

  if ('fuente_ventas' in entrada) {
    const v = entrada.fuente_ventas
    if (v === null || v === '') {
      out.fuente_ventas = null
    } else if (typeof v === 'string' && FUENTES_VENTAS_VALIDAS.includes(v)) {
      out.fuente_ventas = v
    } else {
      errores.push({
        campo: 'fuente_ventas',
        mensaje: `Debe ser uno de: ${FUENTES_VENTAS_VALIDAS.join(', ')} o null`,
      })
    }
  }

  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, normalizado: out }
}

/**
 * Para GET sin fila: mezcla los defaults con lo que diga el agregador
 * y marca cada campo como "por defecto" para que la UI lo pinte en
 * gris. Estructura:
 *   { valores: { ... }, por_defecto: { campo: true, ... }, existe_fila: false }
 *
 * Si la fila existe, `valores` trae lo persistido; cualquier campo
 * null/undefined cae a su default y se marca por_defecto=true.
 */
export function construirVistaParametros(fila) {
  const existe_fila = Boolean(fila)
  const valores = {}
  const por_defecto = {}

  for (const k of Object.keys(DEFAULTS)) {
    const raw = existe_fila ? fila?.[k] : undefined
    if (raw === undefined || raw === null) {
      // `fuente_ventas` admite null como valor válido ("parte por defecto
      // en el agregador"); lo tratamos como "sin guardar" porque sin
      // persistirlo el agregador cae al mismo flujo.
      valores[k] = DEFAULTS[k]
      por_defecto[k] = true
    } else {
      valores[k] = raw
      por_defecto[k] = false
    }
  }
  return { valores, por_defecto, existe_fila }
}
