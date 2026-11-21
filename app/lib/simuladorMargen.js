/**
 * simuladorMargen.js — Simulador de margen mínimo de bodega.
 *
 * Reproduce la hoja de "Simulador de margen mínimo de bodega" de la
 * formación Grand Cru Academy que algún usuario usa como referencia:
 *
 *   1) Gastos mensuales de bodega (personal, roturas/mermas/
 *      invitaciones, materiales, suministros, alquiler proporcional,
 *      otros gastos como el coste del tiempo de vino inmovilizado).
 *   2) Beneficio neto objetivo mensual de la bodega.
 *   3) Ventas mensuales previstas en vinos (sin IVA).
 *   4) Margen bruto necesario (€) = gastos + beneficio objetivo.
 *   5) % margen bruto mínimo = margen necesario / ventas previstas.
 *      % materia prima máximo = 1 − margen mínimo.
 *      Multiplicador medio mínimo = 1 / % materia prima.
 *
 * Decisiones explícitas:
 *   - Todo es PURO: ni red, ni supabase, ni DOM. La UI pasa números.
 *   - Entrada tolerante: acepta strings con coma decimal es-ES.
 *     El helper `num()` normaliza y sanea.
 *   - Si ventas_previstas ≤ 0 o inválidas → resultado null con
 *     `motivo: 'ventas_no_validas'` (nunca 0 como si fuese dato).
 *   - Si %MP = 0 o ≥ 100 % → multiplicador null. No dividimos por
 *     cero ni devolvemos Infinity: la UI debe mostrar "Sin dato".
 *   - Los porcentajes auxiliares (personal/alquiler/beneficio sobre
 *     ventas) ayudan a la didáctica: tal cual los muestra la hoja.
 */

// ── Helpers de entrada ────────────────────────────────────────────────

/**
 * Convierte una entrada (número o string es-ES "1.234,56") a Number.
 * Devuelve 0 para NaN / null / undefined / cadenas vacías. No
 * aceptamos negativos como costes, pero SÍ los admitimos si llegan
 * (el consumidor es el que decide si avisar). No clampeamos: aquí
 * sólo convertimos.
 */
export function num(v) {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).trim()
  if (!s) return 0
  // es-ES: "1.234,56" → "1234.56". Respeta signos y decimales.
  // Reemplazamos puntos de millar (todos menos los que haya en
  // posición de decimal) y la coma decimal final.
  const normalizado = s.replace(/\./g, '').replace(/,/g, '.')
  const n = Number(normalizado)
  return Number.isFinite(n) ? n : 0
}

// ── Núcleo de cálculo ─────────────────────────────────────────────────

/**
 * Calcula el simulador. Entrada:
 *   {
 *     gastos: {
 *       personal, roturas_invitaciones, materiales, suministros,
 *       alquiler, otros,
 *     },
 *     beneficio_objetivo,
 *     ventas_previstas,  // netas, sin IVA
 *   }
 *
 * Salida (o null si no hay base para calcular):
 *   {
 *     total_gastos,
 *     margen_bruto_necesario,
 *     pct_margen_minimo,        // 0..100
 *     pct_materia_prima_max,    // 0..100
 *     multiplicador_minimo,     // null si %MP ∉ (0, 100)
 *     pct_por_concepto: {
 *       personal, roturas_invitaciones, materiales, suministros,
 *       alquiler, otros, beneficio_objetivo,
 *     }, // % de cada partida sobre ventas_previstas
 *     ventas_previstas,          // eco, para la UI
 *     motivo: null | 'ventas_no_validas',
 *   }
 */
export function calcularSimuladorMargen(entrada) {
  const g = entrada?.gastos ?? {}
  const personal              = num(g.personal)
  const roturas_invitaciones  = num(g.roturas_invitaciones)
  const materiales            = num(g.materiales)
  const suministros           = num(g.suministros)
  const alquiler              = num(g.alquiler)
  const otros                 = num(g.otros)
  const beneficio_objetivo    = num(entrada?.beneficio_objetivo)
  const ventas_previstas      = num(entrada?.ventas_previstas)

  const total_gastos =
    personal + roturas_invitaciones + materiales +
    suministros + alquiler + otros
  const margen_bruto_necesario = total_gastos + beneficio_objetivo

  if (!(ventas_previstas > 0)) {
    return {
      total_gastos,
      margen_bruto_necesario,
      pct_margen_minimo: null,
      pct_materia_prima_max: null,
      multiplicador_minimo: null,
      pct_por_concepto: null,
      ventas_previstas,
      motivo: 'ventas_no_validas',
    }
  }

  // Dos decimales redondeando half-away-from-zero coherente con es-ES.
  const r2 = (x) => Math.round(x * 100) / 100
  const pct_margen_minimo     = r2((margen_bruto_necesario / ventas_previstas) * 100)
  const pct_materia_prima_max = r2(100 - pct_margen_minimo)

  let multiplicador_minimo = null
  if (pct_materia_prima_max > 0 && pct_materia_prima_max < 100) {
    multiplicador_minimo = r2(100 / pct_materia_prima_max)
  }

  const p = (v) => r2((v / ventas_previstas) * 100)

  return {
    total_gastos: r2(total_gastos),
    margen_bruto_necesario: r2(margen_bruto_necesario),
    pct_margen_minimo,
    pct_materia_prima_max,
    multiplicador_minimo,
    pct_por_concepto: {
      personal:             p(personal),
      roturas_invitaciones: p(roturas_invitaciones),
      materiales:           p(materiales),
      suministros:          p(suministros),
      alquiler:             p(alquiler),
      otros:                p(otros),
      beneficio_objetivo:   p(beneficio_objetivo),
    },
    ventas_previstas: r2(ventas_previstas),
    motivo: null,
  }
}

// ── Normalización del snapshot ────────────────────────────────────────

/**
 * Extrae los campos del snapshot con tolerancia a dos shapes:
 *   - Forma REAL del repo (calcularMesBodega): ventas_neto en raíz,
 *     informe.por_canal.
 *   - Forma legacy "resumen" que algunos tests antiguos usaban:
 *     resumen.ventas_neto, por_canal en raíz.
 *
 * Devuelve siempre el shape normalizado o nulls cuando la fuente no
 * aporta. NO inventa 0 cuando no hay dato (null).
 */
export function normalizarSnapshot(snapshotMes) {
  if (!snapshotMes || typeof snapshotMes !== 'object') {
    return { ventas_neto: null, coste_ventas_teorico: null, margen_bruto: null, por_canal: null, periodo: null }
  }
  const resumen  = snapshotMes.resumen  || null
  const por_canal = snapshotMes.informe?.por_canal ?? snapshotMes.por_canal ?? null
  const periodo  = snapshotMes.mes || snapshotMes.periodo || null
  const ventas_neto         = pickNumber(snapshotMes.ventas_neto, resumen?.ventas_neto)
  const coste_ventas_teorico = pickNumber(snapshotMes.coste_ventas_teorico, resumen?.coste_ventas_teorico)
  const margen_bruto        = pickNumber(snapshotMes.margen_bruto, resumen?.margen_bruto)
  return { ventas_neto, coste_ventas_teorico, margen_bruto, por_canal, periodo }
}

function pickNumber(...candidatos) {
  for (const c of candidatos) {
    if (c === undefined || c === null) continue
    const n = typeof c === 'number' ? c : Number(c)
    if (Number.isFinite(n)) return n
  }
  return null
}

// ── Precarga desde datos reales ───────────────────────────────────────

/**
 * Dado un snapshot/agregado de un mes (la forma REAL devuelta por
 * `calcularMesBodega` / endpoint `/api/cierres-mes`) y
 * `parametros_explotacion` con su imputacion_pct, devuelve los
 * valores sugeridos para el simulador y su origen.
 *
 * Shape del snapshot (verificado en preview Casa Marisma 2026-10):
 *   {
 *     mes, desde, hasta,
 *     ventas_bruto, ventas_neto, iva_pct,
 *     coste_ventas_teorico, margen_bruto, margen_pct,
 *     informe: { por_canal: { botella, copa, invitacion: {botella_coste, copa_coste},
 *                             cocina: {coste}, rotura: {coste}, cata: {coste},
 *                             evento, maridaje }, ... },
 *     ...
 *   }
 *
 * Toleramos AMBAS formas para no romper tests antiguos ni usos
 * server-side: si `resumen` existe, se usa; si no, leemos la raíz
 * y `informe.por_canal`.
 *
 * Entrada:
 *   {
 *     snapshotMes: snapshot | null,
 *     parametros: {
 *       total_personal, total_alquiler,
 *       imputacion_pct: { personal?, alquileres?, ... },  // % a bodega
 *     } | null,
 *     referencia: 'mes' | 'media_n',  // sólo etiqueta origen
 *     mesesUsados: number,              // sólo etiqueta origen
 *   }
 *
 * Salida: { valores: {...}, origen: {...} } donde cada clave de
 * `valores` tiene su etiqueta en `origen` ("manual" | "calculado del
 * mes X" | "media de N meses").
 *
 * Decisiones:
 *   - personal / alquiler: total_personal × (imputacion_pct.personal/100).
 *     imputacion_pct ausente o null → degrada a 100 % (coherente con
 *     cómo lo trata `imputarParametros`). Si se quiere 0 explícito,
 *     el usuario debe meter 0 en parametros_explotacion.imputacion_pct.
 *   - roturas_invitaciones: suma de todos los costes "no venta" que
 *     tocan directamente a bodega. En el por_canal del repo:
 *       invitacion.botella_coste + invitacion.copa_coste
 *       + rotura.coste + cocina.coste + cata.coste
 *     NO incluye eventos ni maridajes (ya facturan al cliente: no
 *     son coste de bodega sin contrapartida). Documentado en el
 *     README del simulador.
 *   - ventas_previstas: `ventas_neto` del mes si existe; si sólo hay
 *     `ingresos_venta` (bruto), devolvemos null y marcamos origen
 *     "Sin dato" — la precarga no inventa cifras.
 *   - materiales, suministros, otros, beneficio_objetivo: SIEMPRE
 *     manuales. Precargamos null + origen "manual".
 */
export function precargarDesdeSnapshot({
  snapshotMes = null,
  parametros = null,
  referencia = 'mes',
  mesesUsados = 1,
} = {}) {
  const snap = normalizarSnapshot(snapshotMes)
  const origenMes =
    referencia === 'media_n'
      ? `media de ${mesesUsados} meses`
      : `calculado del mes ${snap.periodo || '—'}`

  const valores = {
    personal: null,
    alquiler: null,
    roturas_invitaciones: null,
    materiales: null,
    suministros: null,
    otros: null,
    beneficio_objetivo: null,
    ventas_previstas: null,
  }
  const origen = {
    personal: 'manual',
    alquiler: 'manual',
    roturas_invitaciones: 'manual',
    materiales: 'manual',
    suministros: 'manual',
    otros: 'manual',
    beneficio_objetivo: 'manual',
    ventas_previstas: 'manual',
  }

  // Personal y alquiler imputados a bodega. Dos modos:
  //   a) Compat: `imputacion_pct.personal|alquileres` = número → se
  //      multiplica el total crudo. Lo usan los tests que tratan
  //      imputación a nivel de bloque (100/50/0/null).
  //   b) Nuevo flujo: el llamador ya aplica `imputarParametros` (per
  //      partida) + `calcularTotalPersonal/Alquiler` y pasa el total
  //      imputado; en ese caso debe marcar `ya_imputado: true` para
  //      que NO volvamos a multiplicar.
  //
  // NUNCA mostramos 0 como "sin dato": si `total_personal` no es
  // un número válido, el campo queda null y el origen "manual".
  if (parametros) {
    const yaImputado = parametros.ya_imputado === true
    const totalP = numeroValido(parametros.total_personal)
    const totalA = numeroValido(parametros.total_alquiler)
    if (yaImputado) {
      if (totalP !== null) {
        valores.personal = redondear2(totalP)
        origen.personal  = `${origenMes} · imputado a bodega`
      }
      if (totalA !== null) {
        valores.alquiler = redondear2(totalA)
        origen.alquiler  = `${origenMes} · imputado a bodega`
      }
    } else {
      const pctP = pctImputacion(parametros.imputacion_pct?.personal)
      const pctA = pctImputacion(parametros.imputacion_pct?.alquileres)
      if (totalP !== null && pctP !== null) {
        valores.personal = redondear2(totalP * pctP / 100)
        origen.personal = `${origenMes} · imputación ${pctP}%`
      }
      if (totalA !== null && pctA !== null) {
        valores.alquiler = redondear2(totalA * pctA / 100)
        origen.alquiler = `${origenMes} · imputación ${pctA}%`
      }
    }
  }

  // Roturas, invitaciones, cocina, cata — coste sin ingreso.
  // Si el snapshot está presente pero todos los canales son 0, el
  // resultado es 0 LEGÍTIMO (hay dato, dice que no hubo nada). Si el
  // snapshot falta, queda null → "Sin dato".
  if (snap.por_canal) {
    const pc = snap.por_canal
    const r  = num(pc.rotura?.coste)
    const iB = num(pc.invitacion?.botella_coste)
    const iC = num(pc.invitacion?.copa_coste)
    const co = num(pc.cocina?.coste)
    const ct = num(pc.cata?.coste)
    const total = r + iB + iC + co + ct
    valores.roturas_invitaciones = redondear2(total)
    origen.roturas_invitaciones =
      `${origenMes} · rotura+invitacion+cocina+cata`
  }

  // Ventas previstas: ventas_neto del snapshot si existe (incluye 0
  // legítimo). Si no hay snapshot, null → "Sin dato".
  if (snap.ventas_neto !== null && snap.ventas_neto > 0) {
    valores.ventas_previstas = redondear2(snap.ventas_neto)
    origen.ventas_previstas = `${origenMes} · ventas_neto`
  }

  return { valores, origen }
}

function numeroValido(v) {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

function pctImputacion(v) {
  if (v === null || v === undefined || v === '') return 100
  const n = num(v)
  if (!Number.isFinite(n)) return 100
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

function redondear2(n) {
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

// ── Comparación con la realidad ───────────────────────────────────────

/**
 * Compara el resultado del simulador con el margen bruto real del
 * mes de referencia.
 *
 *   {
 *     simulacion: salida de calcularSimuladorMargen(),
 *     snapshotMes: ... (para ventas_neto + coste_ventas_teorico),
 *     catalogo:   [{ pvp_sin_iva?, pvp?, coste?, iva_pct? }, ...] | null,
 *   }
 *
 * Devuelve:
 *   {
 *     margen_bruto_real,       // € del mes
 *     pct_materia_prima_real,  // %
 *     multiplicador_medio_real,// null si no hay catálogo fiable
 *     diferencia_vs_minimo: {
 *       eur,      // real − necesario (positivo = cubre)
 *       puntos,   // pctMargen real − pctMargen minimo
 *       cubre,    // boolean
 *     } | null,
 *   }
 */
export function compararConReal({
  simulacion = null,
  snapshotMes = null,
  catalogo   = null,
} = {}) {
  const snap = normalizarSnapshot(snapshotMes)
  const ventasNeto = snap.ventas_neto
  const costeMp    = snap.coste_ventas_teorico

  let margen_bruto_real = null
  let pct_materia_prima_real = null
  if (ventasNeto !== null && ventasNeto > 0) {
    // Preferimos margen_bruto ya calculado por el agregador (con sus
    // redondeos de cuadre); si no viene, lo derivamos.
    margen_bruto_real = snap.margen_bruto !== null
      ? redondear2(snap.margen_bruto)
      : redondear2(ventasNeto - (costeMp ?? 0))
    pct_materia_prima_real = costeMp !== null
      ? redondear2((costeMp / ventasNeto) * 100)
      : null
  }

  // Multiplicador medio real: Σ(pvpNeto × uds) / Σ(coste × uds).
  // Si el catálogo no trae uds, ponderamos por 1 (media simple).
  // Si faltan pvpNeto o coste, descartamos la línea.
  let multiplicador_medio_real = null
  if (Array.isArray(catalogo) && catalogo.length > 0) {
    let numer = 0
    let denom = 0
    for (const v of catalogo) {
      const uds = num(v?.unidades) || 1
      const coste = num(v?.coste)
      // pvp_sin_iva es el ideal; si sólo hay pvp (con IVA), neteamos.
      let pvpNeto = num(v?.pvp_sin_iva)
      if (!pvpNeto) {
        const iva = num(v?.iva_pct)
        const pvp = num(v?.pvp)
        if (pvp > 0 && iva >= 0) pvpNeto = pvp / (1 + iva / 100)
      }
      if (coste > 0 && pvpNeto > 0) {
        numer += pvpNeto * uds
        denom += coste * uds
      }
    }
    if (denom > 0) multiplicador_medio_real = redondear2(numer / denom)
  }

  let diferencia_vs_minimo = null
  if (
    simulacion
    && Number.isFinite(simulacion.margen_bruto_necesario)
    && Number.isFinite(simulacion.pct_margen_minimo)
    && Number.isFinite(margen_bruto_real)
    && Number.isFinite(pct_materia_prima_real)
  ) {
    const pctMargenReal = redondear2(100 - pct_materia_prima_real)
    diferencia_vs_minimo = {
      eur:    redondear2(margen_bruto_real - simulacion.margen_bruto_necesario),
      puntos: redondear2(pctMargenReal - simulacion.pct_margen_minimo),
      cubre:  margen_bruto_real >= simulacion.margen_bruto_necesario,
    }
  }

  return {
    margen_bruto_real,
    pct_materia_prima_real,
    multiplicador_medio_real,
    diferencia_vs_minimo,
  }
}
