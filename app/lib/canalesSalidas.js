/**
 * canalesSalidas.js — Lógica pura de la Fase 3 (canales de venta,
 * salidas no-venta y consumo derivado).
 *
 * No depende de Supabase ni del DOM. Todas las funciones son
 * idempotentes, null-safe y testables desde node --test.
 *
 * DOMINIO
 *   Botella estándar (750 ml) = 6 copas de 125 ml.
 *   Fortificado 750 ml       = 8 copas de 90 ml. Puede configurarse
 *   por vino cuando el formato cambia (p. ej. media botella 375 ml
 *   = 3 copas de 125 ml).
 *
 *   CONSUMO (método inventario)
 *     consumo = stock_inicial + compras_netas − stock_final_real
 *   STOCK FINAL TEÓRICO
 *     teorico = stock_inicial + compras_netas − salidas_totales
 *     salidas_totales = ventas_botella + copa_en_uds_botella + salidas_no_venta
 *   DIFERENCIA DE INVENTARIO
 *     diferencia = stock_final_real − stock_final_teorico
 *
 *   Todos los importes en euros a 4 decimales de precisión interna;
 *   el formato (es-ES, 1 decimal, etc.) se delega al consumer.
 */

// ── Constantes del dominio ────────────────────────────────────────────

/** ml por botella estándar. */
export const ML_BOTELLA_ESTANDAR = 750
/** ml por copa estándar. */
export const ML_COPA_ESTANDAR = 125
/** ml por copa de fortificado/licoroso. */
export const ML_COPA_FORTIFICADO = 90

// ── Helpers internos ──────────────────────────────────────────────────

function finito(n) {
  return typeof n === 'number' && Number.isFinite(n)
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return finito(n) ? n : null
}
function r4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000
}
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// ── Conversión copa ↔ botella ─────────────────────────────────────────

/**
 * Número de copas servibles por botella dado (ml_botella, ml_copa).
 * Devuelve siempre un entero ≥ 1 (una copa entera como mínimo cuando
 * la botella tenga capacidad). null si los parámetros son inválidos.
 */
export function copasPorBotella({ ml_botella = ML_BOTELLA_ESTANDAR, ml_copa = ML_COPA_ESTANDAR } = {}) {
  const b = toNum(ml_botella)
  const c = toNum(ml_copa)
  if (b == null || c == null || b <= 0 || c <= 0 || c > b) return null
  return Math.max(1, Math.floor(b / c))
}

/**
 * Convierte un número de COPAS servidas a UDS fraccionarias de
 * botella, usando la proporción (ml_copa / ml_botella).
 *
 *   copasAUdsBotella(6)                    → 1       (750/125)
 *   copasAUdsBotella(8,  { ml_copa: 90 })  → 0.96    (8*90/750)
 *   copasAUdsBotella(3)                    → 0.5
 *
 * Nota: usar `copasAUdsBotella` sólo cuando el consumo de copas se
 * vaya a sumar con unidades enteras de botella (p. ej. stock_final
 * teórico). Si ya tienes "botellas abiertas para copas" como entero,
 * no mezcles.
 */
export function copasAUdsBotella(copas, { ml_botella = ML_BOTELLA_ESTANDAR, ml_copa = ML_COPA_ESTANDAR } = {}) {
  const n = toNum(copas)
  const b = toNum(ml_botella)
  const c = toNum(ml_copa)
  if (n == null || b == null || c == null || b <= 0 || c <= 0) return null
  if (n <= 0) return 0
  return r4((n * c) / b)
}

/**
 * Inversa: cuántas copas sacas de N uds de botella.
 *   udsBotellaACopas(1)                     → 6
 *   udsBotellaACopas(1, { ml_copa: 90 })    → 8 (al redondear hacia abajo con 750/90=8.33)
 */
export function udsBotellaACopas(uds, { ml_botella = ML_BOTELLA_ESTANDAR, ml_copa = ML_COPA_ESTANDAR } = {}) {
  const n = toNum(uds)
  const copas = copasPorBotella({ ml_botella, ml_copa })
  if (n == null || copas == null || n < 0) return null
  return Math.floor(n * copas)
}

// ── Agregación de canales ─────────────────────────────────────────────

/**
 * Canales que forman las VENTAS NETAS en la hoja "Canales venta".
 *
 * Decisión informada: en la shape REAL del agregador
 * (app/lib/agregarPeriodoBodega.js) sólo `botella` y `copa` llevan
 * `ingresos` facturados por líneas de TPV. `maridaje` y `evento`
 * guardan `valor` (PVP interno del vino consumido, NO facturación)
 * y se contabilizan como salidas no-venta — hasta que la Fase 3
 * active la tabla `eventos_bodega` con el importe NETO del menú /
 * grupo, momento en el que se añadirán a esta lista.
 *
 * Así el total NETO de la hoja cuadra exactamente con
 * `ventas_neto` del snapshot (sin IVA).
 */
export const CANALES_VENTA = Object.freeze(['botella', 'copa'])

/**
 * Canales de SALIDA NO-VENTA (no suman facturado; sí descuentan stock).
 * El agregador emite `invitacion` COMO ÚNICO CANAL con sub-campos
 * botella_uds/copa_uds/botella_coste/copa_coste; listarSalidasNoVenta
 * lo expande en dos filas canónicas invitacion_botella/invitacion_copa.
 *
 * `evento` (que emite el agregador) es alias de `grupo_evento` (clave
 * canónica usada por cierreDesglose.CATEGORIAS_SALIDA_SIN_VENTA y en
 * la UI del cierre).
 */
export const CANALES_SALIDA_SIN_VENTA = Object.freeze([
  'invitacion_botella', 'invitacion_copa',
  'cocina', 'grupo_evento', 'maridaje', 'rotura', 'cata',
])

/**
 * Normaliza el bloque `por_canal` del snapshot en una lista
 * homogénea `[{ canal, uds, copas, ingresos_neto, ingresos_bruto,
 * coste, beneficio }]` sólo para los canales de VENTA.
 *
 * El campo `ingresos` que emite agregarPeriodoBodega es BRUTO
 * (precio_unitario × cantidad, PVP con IVA). Para que la hoja
 * cuadre con el resto del informe económico y con `ventas_neto`
 * del snapshot, dividimos por (1 + iva_pct/100) y exponemos el
 * neto como importe principal. `ingresos_bruto` queda disponible
 * para auditorías.
 *
 * `iva_pct` null/omitted → no se convierte (ingresos_neto =
 * ingresos_bruto). El caller debería pasar siempre el iva_pct del
 * snapshot.
 *
 * `beneficio = ingresos_neto − coste`.
 */
export function listarCanalesVenta(porCanal = {}, { iva_pct = null, eventos = null } = {}) {
  const iva = toNum(iva_pct)
  const factor = iva != null && iva >= 0 ? (1 + iva / 100) : 1
  const out = []
  for (const canal of CANALES_VENTA) {
    const c = porCanal?.[canal]
    if (!c) continue
    const uds = toNum(c.uds) ?? 0
    const bruto = toNum(c.ingresos) ?? toNum(c.valor) ?? 0
    const neto = factor > 0 ? bruto / factor : bruto
    const coste = toNum(c.coste) ?? 0
    out.push({
      canal,
      uds: r4(uds),
      copas: toNum(c.copas) ?? null,
      // Importes monetarios a 2 decimales (idéntica semántica que
      // agregarPeriodoBodega.r2 y ventas_neto del snapshot).
      ingresos_neto:  r2(neto),
      ingresos_bruto: r2(bruto),
      coste:          r2(coste),
      beneficio:      r2(neto - coste),
    })
  }

  // Fase A — eventos de bodega: cabeceras de maridajes y grupos con
  // importe NETO facturado (la columna `ingresos` ya es neto, no se
  // convierte por iva). `eventos` tiene la forma
  //   { maridaje: { num, importe_neto_total, comensales_total },
  //     grupo:    { num, importe_neto_total, comensales_total } }
  // (producida por `sumarEventosPorTipo` en app/lib/eventosBodega.js).
  //
  // Sólo añadimos la fila si hay dato (importe_neto_total > 0). El
  // coste no viene de aquí: el consumo de vino de esos eventos sigue
  // en `por_canal.evento.coste` / `por_canal.maridaje.coste` desde
  // movimientos_stock. Para el beneficio del Excel sumamos ambos.
  const addEventoRow = (canal, agregado) => {
    if (!agregado) return
    const neto = toNum(agregado.importe_neto_total) ?? 0
    if (neto <= 0) return
    const costeCanal = toNum(porCanal?.[canal]?.coste) ?? 0
    const uds = toNum(agregado.comensales_total) ?? toNum(agregado.n) ?? 0
    const bruto = (iva != null && iva >= 0) ? neto * (1 + iva / 100) : neto
    out.push({
      canal,
      uds: r4(uds),
      copas: null,
      ingresos_neto:  r2(neto),
      ingresos_bruto: r2(bruto),
      coste:          r2(costeCanal),
      beneficio:      r2(neto - costeCanal),
    })
  }
  if (eventos && typeof eventos === 'object') {
    addEventoRow('maridaje', eventos.maridaje)
    addEventoRow('evento',   eventos.grupo)
  }
  return out
}

/**
 * Normaliza salidas no-venta. Dos puntos clave vs lo que emite
 * hoy app/lib/agregarPeriodoBodega.js:
 *
 *  1) El canal `invitacion` viene AGREGADO con sub-campos
 *     `botella_uds / copa_uds / botella_coste / copa_coste`. Aquí
 *     lo EXPANDIMOS a dos filas canónicas (`invitacion_botella`,
 *     `invitacion_copa`) con la shape estándar { uds, coste, copas }.
 *     Si futuras versiones del agregador ya emiten las claves
 *     separadas, también se respetan; se evita duplicar.
 *
 *  2) `grupo_evento` ↔ `evento`: el agregador emite `evento`; la
 *     clave canónica (cierreDesglose + CATEGORIAS_SALIDA_SIN_VENTA)
 *     es `grupo_evento`. Aceptamos ambas al leer.
 *
 * Importes `coste` se dejan tal cual (ya son coste a inventario,
 * no PVP). `valor` se ignora excepto cuando `coste` no existe y
 * `rotura` (que no tiene valor) va con `coste` directo.
 */
export function listarSalidasNoVenta(porCanal = {}) {
  const out = []
  const visto = new Set()
  const push = (canal, fila) => { out.push({ canal, ...fila }); visto.add(canal) }

  for (const canal of CANALES_SALIDA_SIN_VENTA) {
    // Expansión especial de 'invitacion' → 2 filas canónicas.
    if (canal === 'invitacion_botella' || canal === 'invitacion_copa') {
      // ¿ya emitida por la fuente con la clave canónica?
      const canonica = porCanal?.[canal]
      if (canonica) {
        push(canal, {
          uds:   r4(toNum(canonica.uds) ?? 0),
          copas: toNum(canonica.copas) ?? null,
          coste: r4(toNum(canonica.coste) ?? 0),
        })
        continue
      }
      // Si no, mirar si el agregador emite 'invitacion' con subcampos.
      const inv = porCanal?.invitacion
      if (!inv) continue
      if (canal === 'invitacion_botella') {
        const uds = toNum(inv.botella_uds)
        if (uds == null || uds === 0) continue
        push('invitacion_botella', {
          uds:   r4(uds),
          copas: null,
          coste: r4(toNum(inv.botella_coste) ?? 0),
        })
      } else {
        const copas = toNum(inv.copa_uds)
        if (copas == null || copas === 0) continue
        push('invitacion_copa', {
          uds:   r4(copas),   // uds = copas servidas (consistente con cierreDesglose)
          copas: r4(copas),
          coste: r4(toNum(inv.copa_coste) ?? 0),
        })
      }
      continue
    }

    // 'grupo_evento' canónico; también aceptamos 'evento' del agregador.
    if (canal === 'grupo_evento') {
      const c = porCanal?.grupo_evento || porCanal?.evento
      if (!c) continue
      push('grupo_evento', {
        uds:   r4(toNum(c.uds) ?? 0),
        copas: null,
        coste: r4(toNum(c.coste) ?? toNum(c.valor) ?? 0),
      })
      continue
    }

    const c = porCanal?.[canal]
    if (!c) continue
    push(canal, {
      uds:   r4(toNum(c.uds) ?? 0),
      copas: null,
      coste: r4(toNum(c.coste) ?? toNum(c.valor) ?? 0),
    })
  }
  return out
}

// ── Helper puro de coincidencia de periodo ─────────────────────────────
//
// Protege al Excel/PDF de usar datos obsoletos cuando el usuario
// cambia rápido entre meses: el export sólo usa el `cached` si su
// `mes` coincide EXACTAMENTE con el periodo pedido. Si no, el
// consumer recibe null y decide (deshabilitar botón, degradar
// hojas, etc.).

/**
 * `datosParaPeriodo({ mes, datos }, periodo)`:
 *   - cached null / sin mes / mes distinto → null
 *   - cached con mes === periodo → datos (puede ser null si no
 *     había payload, lo cual también vale como "sin dato")
 */
export function datosParaPeriodo(cached, periodo) {
  if (!cached || typeof cached !== 'object') return null
  if (typeof periodo !== 'string' || !periodo) return null
  if (cached.mes !== periodo) return null
  return cached.datos != null ? cached.datos : null
}

// ── Consumo derivado y conciliación teórico vs real ───────────────────

/**
 * Devuelve el "stock_final_teorico" según el método inventario:
 *
 *   teorico = stock_inicial + compras_netas − salidas_total
 *
 * donde `salidas_total` incluye TODO lo que descuenta stock:
 *   ventas_botella (uds enteros)
 *   copas en uds fraccionarias de botella
 *   salidas_no_venta (invitaciones + cocina + grupo + maridaje + rotura + cata)
 *
 * Null si cualquiera de los operandos inicial/compras falta.
 * Si `copas` viene sin `ml_copa`/`ml_botella`, se asume
 * (ML_BOTELLA_ESTANDAR, ML_COPA_ESTANDAR) → 6 copas por botella.
 */
export function calcularStockFinalTeorico({
  stock_inicial, compras_netas,
  ventas_botella_uds = 0,
  ventas_copa_copas  = 0,
  salidas_no_venta_uds = 0,
  ml_botella = ML_BOTELLA_ESTANDAR,
  ml_copa    = ML_COPA_ESTANDAR,
} = {}) {
  const ini = toNum(stock_inicial)
  const compras = toNum(compras_netas)
  if (ini == null || compras == null) return null
  const vb = toNum(ventas_botella_uds) ?? 0
  const copasUds = copasAUdsBotella(ventas_copa_copas, { ml_botella, ml_copa }) ?? 0
  const sin = toNum(salidas_no_venta_uds) ?? 0
  return r4(ini + compras - vb - copasUds - sin)
}

/**
 * Método inventario: consumo = inicial + compras − final_real.
 * Null si falta alguno de los tres operandos (NUNCA devuelve 0 para
 * "sin dato"; respeta la regla del repo: 0 es valor real).
 */
export function calcularConsumoDerivado({ stock_inicial, compras_netas, stock_final_real } = {}) {
  const ini = toNum(stock_inicial)
  const compras = toNum(compras_netas)
  const fin = toNum(stock_final_real)
  if (ini == null || compras == null || fin == null) return null
  return r4(ini + compras - fin)
}

/**
 * Conciliación teórico vs real. Devuelve:
 *   {
 *     teorico,                   // null si no se puede calcular
 *     real,                      // null si falta el conteo
 *     diferencia,                // real − teorico, null si falta alguno
 *     diferencia_pct,            // diferencia / teorico, null si teorico=0/null
 *     signo,                     // 'cuadra' | 'faltan' | 'sobran' | null
 *   }
 *
 * Tolerancia por defecto 0.5 uds para marcar "cuadra" (ajustable).
 */
export function conciliarTeoricoReal({
  stock_inicial, compras_netas,
  ventas_botella_uds, ventas_copa_copas, salidas_no_venta_uds,
  stock_final_real,
  ml_botella, ml_copa,
  tolerancia_uds = 0.5,
} = {}) {
  const teorico = calcularStockFinalTeorico({
    stock_inicial, compras_netas,
    ventas_botella_uds, ventas_copa_copas, salidas_no_venta_uds,
    ml_botella, ml_copa,
  })
  const real = toNum(stock_final_real)
  if (teorico == null || real == null) {
    return { teorico, real, diferencia: null, diferencia_pct: null, signo: null }
  }
  const dif = r4(real - teorico)
  const pct = teorico !== 0 ? r4(dif / teorico) : null
  let signo = 'cuadra'
  if (Math.abs(dif) > tolerancia_uds) signo = dif < 0 ? 'faltan' : 'sobran'
  return { teorico, real, diferencia: dif, diferencia_pct: pct, signo }
}
