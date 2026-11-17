/**
 * facturaIA.js — Normalización, validación y emparejado de la respuesta
 * de la IA al extraer una factura de proveedor.
 *
 * Todas las funciones son puras y sin efectos. La IA es la herramienta
 * de LECTURA, no la fuente de verdad: lo que devuelva se normaliza a
 * un esquema estricto, se valida y se marca con avisos. El usuario
 * CONFIRMA siempre antes de crear la compra.
 */

// ── Esquema estricto ──────────────────────────────────────────────────────
//
// La forma canónica después de normalizarRespuestaIA():
//
//   {
//     proveedor: { nombre: string|null, nif: string|null, confianza: 'alta'|'media'|'baja' },
//     numero_factura: string|null,
//     numero_factura_confianza: 'alta'|'media'|'baja',
//     fecha: string|null,            // 'YYYY-MM-DD'
//     fecha_confianza: 'alta'|'media'|'baja',
//     base_imponible: number|null,
//     base_imponible_confianza: 'alta'|'media'|'baja',
//     iva_pct: number|null,
//     iva_pct_confianza: 'alta'|'media'|'baja',
//     iva_importe: number|null,
//     iva_importe_confianza: 'alta'|'media'|'baja',
//     total: number|null,
//     total_confianza: 'alta'|'media'|'baja',
//     lineas: [
//       { descripcion: string|null, uds: number|null, uds_bonificadas: number|null,
//         precio_unitario: number|null, importe_neto: number|null,
//         confianza: 'alta'|'media'|'baja' }, ...
//     ],
//   }

const CONFIANZAS = new Set(['alta', 'media', 'baja'])

/** typeof === 'number' && isFinite. Sin coerción. */
function numLegit(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null
}
function strLegit(v) {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length ? s.slice(0, 500) : null
}
function confLegit(v) {
  return CONFIANZAS.has(v) ? v : 'baja'
}
function fechaIso(v) {
  const s = strLegit(v)
  if (!s) return null
  // Acepta YYYY-MM-DD; si viene dd/mm/yyyy intenta normalizar.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const [, y, m, d] = iso
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    if (!Number.isNaN(dt.getTime())
        && dt.getUTCFullYear() === Number(y)
        && dt.getUTCMonth() === Number(m) - 1
        && dt.getUTCDate() === Number(d)) return s
    return null
  }
  const es = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (es) {
    const [, d, m, y] = es
    const yy = y.length === 2 ? 2000 + Number(y) : Number(y)
    const dt = new Date(Date.UTC(yy, Number(m) - 1, Number(d)))
    if (!Number.isNaN(dt.getTime())
        && dt.getUTCFullYear() === yy
        && dt.getUTCMonth() === Number(m) - 1
        && dt.getUTCDate() === Number(d)) {
      return `${yy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return null
}

/**
 * Normaliza la respuesta cruda de la IA al esquema estricto. Campos
 * ausentes o tipos erróneos → null. Nunca lanza. Confianza por defecto
 * 'baja' si no viene o es desconocida.
 */
export function normalizarRespuestaIA(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {}
  const prov = (r.proveedor && typeof r.proveedor === 'object') ? r.proveedor : {}
  const lineas = Array.isArray(r.lineas) ? r.lineas : []

  return {
    proveedor: {
      nombre: strLegit(prov.nombre),
      nif: strLegit(prov.nif) ?? strLegit(prov.cif),
      confianza: confLegit(prov.confianza),
    },
    numero_factura: strLegit(r.numero_factura),
    numero_factura_confianza: confLegit(r.numero_factura_confianza),
    fecha: fechaIso(r.fecha),
    fecha_confianza: confLegit(r.fecha_confianza),
    base_imponible: numLegit(r.base_imponible),
    base_imponible_confianza: confLegit(r.base_imponible_confianza),
    iva_pct: numLegit(r.iva_pct),
    iva_pct_confianza: confLegit(r.iva_pct_confianza),
    iva_importe: numLegit(r.iva_importe),
    iva_importe_confianza: confLegit(r.iva_importe_confianza),
    total: numLegit(r.total),
    total_confianza: confLegit(r.total_confianza),
    lineas: lineas.slice(0, 200).map(l => {
      const o = (l && typeof l === 'object') ? l : {}
      return {
        descripcion: strLegit(o.descripcion),
        uds: numLegit(o.uds),
        uds_bonificadas: numLegit(o.uds_bonificadas),
        precio_unitario: numLegit(o.precio_unitario),
        importe_neto: numLegit(o.importe_neto),
        confianza: confLegit(o.confianza),
      }
    }),
  }
}

// ── Validación ────────────────────────────────────────────────────────────

const TOL_EUR = 1
const TOL_PCT = 0.01

/**
 * Devuelve una lista de avisos (strings) sobre incoherencias de los
 * datos ya normalizados. NO lanza; no bloquea. El usuario decide.
 */
export function validarFactura(datos) {
  const avisos = []
  const d = datos || {}

  // Fecha
  if (!d.fecha) {
    avisos.push('No se ha podido leer una fecha de factura.')
  } else {
    const anio = Number(d.fecha.slice(0, 4))
    const now = new Date()
    if (anio < 2000 || anio > now.getUTCFullYear() + 1) {
      avisos.push(`Fecha sospechosa (${d.fecha}): comprueba si es correcta.`)
    }
  }

  // Importes negativos
  const campos = ['base_imponible', 'iva_pct', 'iva_importe', 'total']
  for (const k of campos) {
    const v = d[k]
    if (typeof v === 'number' && v < 0) avisos.push(`${k} es negativo (${v}). Factura de abono o error de lectura.`)
  }

  // Suma de líneas ≈ base imponible
  const sumaLineas = (d.lineas || []).reduce((s, l) => {
    const n = (typeof l?.importe_neto === 'number' && Number.isFinite(l.importe_neto)) ? l.importe_neto : 0
    return s + n
  }, 0)
  const base = (typeof d.base_imponible === 'number') ? d.base_imponible : null
  if (base != null && (d.lineas || []).some(l => typeof l?.importe_neto === 'number')) {
    const diff = Math.abs(sumaLineas - base)
    const relDiff = base !== 0 ? diff / Math.abs(base) : null
    const dentroEuro = diff <= TOL_EUR
    const dentroPct  = relDiff != null && relDiff <= TOL_PCT
    if (!dentroEuro && !dentroPct) {
      avisos.push(`La suma de las líneas (${sumaLineas.toFixed(2)} €) no cuadra con la base imponible (${base.toFixed(2)} €).`)
    }
  }

  // Base + IVA importe ≈ total
  if (typeof d.base_imponible === 'number'
      && typeof d.iva_importe === 'number'
      && typeof d.total === 'number') {
    const esperado = d.base_imponible + d.iva_importe
    const diff = Math.abs(esperado - d.total)
    const relDiff = d.total !== 0 ? diff / Math.abs(d.total) : null
    const dentroEuro = diff <= TOL_EUR
    const dentroPct  = relDiff != null && relDiff <= TOL_PCT
    if (!dentroEuro && !dentroPct) {
      avisos.push(`Base (${d.base_imponible.toFixed(2)}) + IVA (${d.iva_importe.toFixed(2)}) = ${esperado.toFixed(2)} ≠ total ${d.total.toFixed(2)}.`)
    }
  }

  // uds con muchos decimales (botella en principio es entera, pero copa / dosis puede no serlo)
  for (const l of (d.lineas || [])) {
    if (typeof l?.uds === 'number' && Math.abs(l.uds % 1) > 0.001 && Math.abs(l.uds % 1) < 0.999) {
      avisos.push(`Línea "${(l.descripcion || '').slice(0, 40)}…" con uds no enteras (${l.uds}). Revísala.`)
    }
    if (typeof l?.uds === 'number' && l.uds < 0) avisos.push('Línea con uds negativas.')
    if (typeof l?.importe_neto === 'number' && l.importe_neto < 0) avisos.push('Línea con importe negativo.')
  }

  return avisos
}

// ── Emparejado con vinos del restaurante ─────────────────────────────────

/** Normaliza texto para comparar: sin tildes, minúsculas, sin añada,
 *  sin formato (750 ml), sin signos de puntuación. */
export function normalizarTextoVino(txt) {
  if (typeof txt !== 'string') return ''
  return txt
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quita diacríticos
    .replace(/\b(19|20)\d{2}\b/g, ' ')                  // añada
    .replace(/\b\d+(?:[.,]\d+)?\s*(ml|cl|l|litros?)\b/g, ' ')  // formato
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(txt) {
  return normalizarTextoVino(txt).split(' ').filter(Boolean)
}

// Puntuación por "containment sobre el vino": fracción de tokens del
// NOMBRE del vino que aparecen en la descripción. 1.0 si la
// descripción contiene todas las palabras del vino (aunque añada otras
// como "6 botellas" o la cantidad). Es más tolerante a descripciones
// largas de albarán que Jaccard puro, sin inflar falsos positivos:
// un vino corto en el catálogo ("Rioja") puede salir 1.0 fácilmente,
// pero el desempate con el segundo (diferencia >= 0.15) evita marcarlo
// como 'seguro' si hay varios candidatos empatados.
function puntuar(descripcion, nombreVino) {
  const tDesc  = new Set(tokens(descripcion))
  const tVino  = tokens(nombreVino)
  if (tVino.length === 0 || tDesc.size === 0) return 0
  let inter = 0
  for (const t of tVino) if (tDesc.has(t)) inter++
  return inter / tVino.length
}

/**
 * Para cada línea, devuelve { linea, candidatos: [{ vino_id, nombre, score }...],
 * mejor: vino|null, estado: 'seguro'|'dudoso'|'sin_match' }.
 *
 * Nunca asigna por sí solo; el usuario SIEMPRE revisa en la UI.
 *
 * Umbral:
 *   'seguro':  mejor score >= 0.75  y  diferencia con el 2.º >= 0.15
 *   'dudoso':  mejor score >= 0.4
 *   'sin_match': resto
 */
export function emparejarLineasConVinos(lineas, vinos) {
  const safeVinos = Array.isArray(vinos) ? vinos : []
  const safeLineas = Array.isArray(lineas) ? lineas : []
  return safeLineas.map(linea => {
    const texto = typeof linea?.descripcion === 'string' ? linea.descripcion : ''
    const candidatos = safeVinos
      .map(v => ({ vino_id: v.id, nombre: v.nombre, score: puntuar(texto, v.nombre || '') }))
      .filter(c => c.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
    const mejor = candidatos[0] || null
    const segundo = candidatos[1] || null
    let estado = 'sin_match'
    if (mejor && mejor.score >= 0.75 && (!segundo || mejor.score - segundo.score >= 0.15)) {
      estado = 'seguro'
    } else if (mejor && mejor.score >= 0.4) {
      estado = 'dudoso'
    }
    return { linea, candidatos, mejor, estado }
  })
}

// ── Detección de duplicados ──────────────────────────────────────────────

/**
 * Busca si la factura ya está registrada en libro_compras / cabecera_compras.
 *
 * Se consideran "posible duplicado" las combinaciones que cuadren en al
 * menos dos de los tres criterios:
 *   - mismo proveedor (normalizado).
 *   - mismo número de factura (si está en los dos lados).
 *   - misma fecha + importe próximo (tolerancia 1 € o 1 %).
 *
 * `existentes` es un array con filas del libro_compras ya aplanadas:
 *   [{ proveedor, fecha, importe, albaran, cabecera_compra_id?, origen }, ...]
 */
export function detectarDuplicado(datos, existentes = []) {
  const d = datos || {}
  const provN = normalizarTextoVino(d?.proveedor?.nombre || '')
  const num = (d?.numero_factura || '').trim().toLowerCase()
  const base = (typeof d?.base_imponible === 'number') ? d.base_imponible : (typeof d?.total === 'number' ? d.total : null)
  const fecha = d?.fecha || null

  for (const e of (existentes || [])) {
    let puntos = 0
    const sameProv = provN && normalizarTextoVino(e?.proveedor || '') === provN
    const sameNum  = num && (e?.albaran || '').trim().toLowerCase() === num
    const sameFecha = fecha && e?.fecha === fecha
    const sameImp = (base != null && typeof e?.importe === 'number')
      ? (Math.abs(base - e.importe) <= TOL_EUR || (base !== 0 && Math.abs(base - e.importe) / Math.abs(base) <= TOL_PCT))
      : false
    if (sameProv) puntos++
    if (sameNum) puntos++
    if (sameFecha && sameImp) puntos++
    if (puntos >= 2) {
      return {
        encontrado: true,
        motivo: {
          mismo_proveedor: !!sameProv,
          mismo_numero_factura: !!sameNum,
          misma_fecha_e_importe: !!(sameFecha && sameImp),
        },
        detalle: e,
      }
    }
  }
  return { encontrado: false }
}
