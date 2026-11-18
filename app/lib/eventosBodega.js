/**
 * eventosBodega.js — Lógica pura de la Fase A "Eventos de bodega".
 *
 * No depende de Supabase ni del DOM. Testeable desde node --test.
 *
 * Shape canónica de un evento (fila de `public.eventos_bodega`):
 *   {
 *     id, restaurante_id, fecha ('YYYY-MM-DD'),
 *     tipo: 'grupo' | 'maridaje',
 *     menu_tipo: 'rock' | 'premium' | 'otro' | null,
 *     menu_nombre: string | null,
 *     num_comensales: int | null,
 *     importe_bruto: number | null,       -- con IVA, opcional
 *     importe_neto:  number,              -- sin IVA, obligatorio
 *     iva_pct: number,                    -- 0..25
 *     incluido_en_tpv: boolean,           -- evita doble conteo
 *     notas: string | null,
 *     created_by: string | null,
 *     created_at, updated_at,
 *   }
 *
 * REGLA DE DOBLE CONTEO
 *   `incluido_en_tpv = true`  → el evento se muestra pero NO suma a
 *                                por_canal (ya entró por TPV).
 *   `incluido_en_tpv = false` → el evento SÍ suma como ingreso del
 *                                canal correspondiente (grupo → evento;
 *                                maridaje → maridaje).
 *
 * REGLA DE VENTAS_NETO
 *   El agregador NO suma los eventos a `ventas_neto` del snapshot.
 *   Razón (documentada): `ventas_neto` del cierre es la venta
 *   agregada desde partes_servicio/movimientos_stock (TPV); mezclarla
 *   con cabeceras de eventos rompería la coherencia con los cierres
 *   firmados y con el flujo YoY de Explotación. Los eventos se
 *   exponen por separado en `informe.eventos` y como filas propias
 *   en la hoja "Canales venta" del Excel.
 */

const TIPOS         = Object.freeze(['grupo', 'maridaje'])
const MENU_TIPOS    = Object.freeze(['rock', 'premium', 'otro'])
const IVA_MIN = 0
const IVA_MAX = 25

export { TIPOS as TIPOS_EVENTO, MENU_TIPOS }

// ── Helpers numéricos ────────────────────────────────────────────────

function finito(n) {
  return typeof n === 'number' && Number.isFinite(n)
}
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return finito(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return finito(n) ? n : null
}

/**
 * neto = bruto / (1 + iva/100). Null si cualquier operando falta.
 * Redondea a 2 decimales.
 */
export function netoDesdeBruto(bruto, iva) {
  const b = toNum(bruto)
  const i = toNum(iva)
  if (b == null || i == null || i < IVA_MIN || i > IVA_MAX) return null
  return r2(b / (1 + i / 100))
}

/**
 * bruto = neto × (1 + iva/100).
 */
export function brutoDesdeNeto(neto, iva) {
  const n = toNum(neto)
  const i = toNum(iva)
  if (n == null || i == null || i < IVA_MIN || i > IVA_MAX) return null
  return r2(n * (1 + i / 100))
}

// ── Validación de formulario ─────────────────────────────────────────

/**
 * Valida un payload de alta/edición y devuelve el payload canónico.
 * Devuelve `{ ok: true, value }` o `{ ok: false, error, field }`.
 *
 * Normaliza:
 *   - fecha: 'YYYY-MM-DD' (ISO).
 *   - tipo / menu_tipo: lowercase.
 *   - importes: parse coma decimal es-ES, round r2.
 *   - Si llega importe_bruto + iva_pct y falta importe_neto → se calcula.
 *   - num_comensales / notas / menu_nombre: trim, null si vacío.
 */
export function parseEventoForm(input = {}) {
  const fecha = typeof input.fecha === 'string' ? input.fecha.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, field: 'fecha', error: 'La fecha debe ser YYYY-MM-DD.' }
  }
  const d = new Date(fecha + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) {
    return { ok: false, field: 'fecha', error: 'Fecha no válida.' }
  }

  const tipo = String(input.tipo || '').toLowerCase().trim()
  if (!TIPOS.includes(tipo)) {
    return { ok: false, field: 'tipo', error: 'Tipo debe ser "grupo" o "maridaje".' }
  }

  const menu_tipo_raw = input.menu_tipo == null ? null : String(input.menu_tipo).toLowerCase().trim()
  const menu_tipo = (menu_tipo_raw && menu_tipo_raw !== '')
    ? menu_tipo_raw
    : null
  if (menu_tipo && !MENU_TIPOS.includes(menu_tipo)) {
    return { ok: false, field: 'menu_tipo', error: 'Menú debe ser "rock", "premium" u "otro".' }
  }

  const menu_nombre = typeof input.menu_nombre === 'string' && input.menu_nombre.trim()
    ? input.menu_nombre.trim().slice(0, 120)
    : null

  const num_comensales_raw = toNum(input.num_comensales)
  if (num_comensales_raw != null && (num_comensales_raw < 0 || !Number.isInteger(num_comensales_raw))) {
    return { ok: false, field: 'num_comensales', error: 'Comensales debe ser entero ≥ 0.' }
  }
  const num_comensales = num_comensales_raw == null ? null : Math.floor(num_comensales_raw)

  const iva_pct = toNum(input.iva_pct) ?? 10
  if (iva_pct < IVA_MIN || iva_pct > IVA_MAX) {
    return { ok: false, field: 'iva_pct', error: 'IVA debe estar entre 0 y 25.' }
  }

  let importe_bruto = toNum(input.importe_bruto)
  let importe_neto  = toNum(input.importe_neto)
  if (importe_bruto != null && importe_bruto < 0) {
    return { ok: false, field: 'importe_bruto', error: 'El importe no puede ser negativo.' }
  }
  if (importe_neto != null && importe_neto < 0) {
    return { ok: false, field: 'importe_neto', error: 'El importe no puede ser negativo.' }
  }
  // Si solo llega bruto, derivar neto (y viceversa).
  if (importe_neto == null && importe_bruto != null) {
    importe_neto = netoDesdeBruto(importe_bruto, iva_pct)
  } else if (importe_neto != null && importe_bruto == null) {
    importe_bruto = brutoDesdeNeto(importe_neto, iva_pct)
  }
  // Si siguen sin datos, 0 (evento gratuito o pendiente de importe).
  if (importe_neto == null) importe_neto = 0

  const incluido_en_tpv = !!input.incluido_en_tpv

  const notas = typeof input.notas === 'string' && input.notas.trim()
    ? input.notas.trim().slice(0, 500)
    : null

  return {
    ok: true,
    value: {
      fecha,
      tipo,
      menu_tipo,
      menu_nombre,
      num_comensales,
      importe_bruto: importe_bruto == null ? null : r2(importe_bruto),
      importe_neto:  r2(importe_neto),
      iva_pct:       r2(iva_pct),
      incluido_en_tpv,
      notas,
    },
  }
}

// ── Agregación por tipo ──────────────────────────────────────────────

/**
 * Agrega una lista de eventos por tipo, filtrando por `incluido_en_tpv`.
 *
 * Devuelve:
 *   {
 *     grupo:   { n, comensales_total, importe_neto_total, importe_bruto_total },
 *     maridaje:{ n, comensales_total, importe_neto_total, importe_bruto_total },
 *     ingresos_netos_para_canal: number,  -- SOLO los NO incluidos en TPV
 *     excluidos_tpv: number,              -- cuenta de eventos descartados
 *   }
 *
 * Si todos los eventos están "incluido_en_tpv=true", ingresos_netos_para_canal = 0.
 */
export function sumarEventosPorTipo(eventos = []) {
  const sumar = () => ({ n: 0, comensales_total: 0, importe_neto_total: 0, importe_bruto_total: 0 })
  const out = { grupo: sumar(), maridaje: sumar() }
  let ingresosParaCanal = 0
  let excluidosTpv = 0
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev || !out[ev.tipo]) continue
    const b = out[ev.tipo]
    b.n += 1
    b.comensales_total   += Math.max(0, Number(ev.num_comensales) || 0)
    b.importe_neto_total += Math.max(0, Number(ev.importe_neto)   || 0)
    b.importe_bruto_total+= Math.max(0, Number(ev.importe_bruto)  || 0)
    if (ev.incluido_en_tpv) {
      excluidosTpv += 1
    } else {
      ingresosParaCanal += Math.max(0, Number(ev.importe_neto) || 0)
    }
  }
  // r2 final
  for (const k of ['grupo', 'maridaje']) {
    out[k].importe_neto_total  = r2(out[k].importe_neto_total)
    out[k].importe_bruto_total = r2(out[k].importe_bruto_total)
  }
  return {
    ...out,
    ingresos_netos_para_canal: r2(ingresosParaCanal),
    excluidos_tpv: excluidosTpv,
  }
}

/**
 * Devuelve los ingresos NETOS por canal provenientes de eventos
 * NO incluidos en TPV:
 *   { evento: number, maridaje: number }
 * El mapeo es 1:1 con `por_canal.evento` y `por_canal.maridaje` del
 * snapshot del agregador.
 */
export function ingresosCanalDesdeEventos(eventos = []) {
  let evento = 0
  let maridaje = 0
  for (const ev of Array.isArray(eventos) ? eventos : []) {
    if (!ev || ev.incluido_en_tpv) continue
    const neto = Math.max(0, Number(ev.importe_neto) || 0)
    if (ev.tipo === 'grupo')    evento += neto
    if (ev.tipo === 'maridaje') maridaje += neto
  }
  return { evento: r2(evento), maridaje: r2(maridaje) }
}

// ── Degradación: relación inexistente ────────────────────────────────

/**
 * Detecta si un error de Supabase/PostgREST corresponde a tabla
 * ausente (42P01 "relation does not exist") — devuelve true cuando
 * la pestaña de Eventos debe mostrar "SQL pendiente" y el agregador
 * debe tratar los eventos como lista vacía.
 */
export function esRelacionInexistente(err) {
  if (!err) return false
  if (err.code === '42P01') return true
  const msg = String(err.message || err.error || '').toLowerCase()
  if (!msg) return false
  return msg.includes('relation') && msg.includes('does not exist')
}
