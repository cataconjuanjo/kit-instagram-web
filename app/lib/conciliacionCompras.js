/**
 * conciliacionCompras.js — Comparación entre las compras del cierre
 * (cabecera_compras + lineas_compra.importe_neto) y las facturas del
 * Libro de Compras (libro_compras.facturas[]).
 *
 * Función pura, sin efectos. Nunca modifica compras ni facturas. El
 * consumer sólo avisa al usuario si los dos totales no cuadran.
 *
 * CRITERIOS DOCUMENTADOS
 *
 *   Filtrado por mes:
 *     - "mes" (YYYY-MM) es el filtro canónico.
 *     - Para libro_compras se filtra por la columna `periodo` (YYYY-MM,
 *       ya guardada por el bridge upsert_libro_compras_factura). La
 *       `facturas[].fecha` se usa sólo para el desglose por factura y
 *       NO para re-filtrar, porque facturas sin fecha quedan en la
 *       fila del mes correcto si el bridge lo guardó así.
 *     - Facturas sin `fecha`: se CUENTAN en el total del mes (la fila
 *       las agrupa correctamente) y se marcan en `meta.sin_fecha`.
 *
 *   Unidad de los importes:
 *     - comprasApp = compras_netas del cierre → base imponible (sin IVA).
 *     - facturasLibro[].importe → ambiguo por convención. El bridge
 *       desde /dashboard/bodega (Formulario de Compra → /api/compras)
 *       pasa importe_neto (sin IVA). Las facturas que se meten a mano
 *       en /dashboard/compras-somm no distinguen neto vs bruto.
 *     - Este helper asume base imponible (neto) para ambos lados. Si el
 *       encargado introdujo facturas con IVA en /dashboard/compras-somm
 *       la conciliación saldrá "revisar" por diseño, que es lo que
 *       queremos: mejor un aviso que una cuadratura falsa.
 *
 *   Tolerancia:
 *     - estado 'ok' si |diferencia| <= 1 € o |pct| <= 1 %.
 *     - estado 'revisar' si se supera cualquiera de los dos umbrales.
 *     - estado 'sin_libro' si no hay facturas del mes en libro_compras.
 *     - estado 'sin_app' si compras_netas del cierre es 0.
 *     - Si ambos lados están a 0, se devuelve 'sin_libro' (es más
 *       accionable para el usuario: "añade el albarán o la factura").
 *
 *   Cruce por proveedor:
 *     - libro_compras tiene una fila por proveedor/periodo con un array
 *       de facturas. El lado "app" expone compras_netas TOTAL del
 *       cierre (snapshot no guarda compras por proveedor). Por tanto
 *       sólo se concilia el TOTAL. El desglose por proveedor del Libro
 *       se expone en meta.top_libro_por_proveedor (informativo), pero
 *       no se cruza con el app side porque no tenemos la otra mitad.
 */

/** Lectura ESTRICTA: solo números finitos reales. */
function numLegit(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null
}

function r2(n) { return Math.round(Number(n) * 100) / 100 }

const TOL_EUR = 1
const TOL_PCT = 0.01   // 1 %

/**
 * @param {{
 *   comprasApp: number|null|undefined,
 *   facturasLibro: Array<{ proveedor?: string, periodo?: string,
 *                           facturas?: Array<{ fecha?: string, importe?: number,
 *                                               albaran?: string, concepto?: string }> }>|null|undefined,
 *   mes: string,
 * }} input
 */
export function conciliarCompras({ comprasApp, facturasLibro, mes } = {}) {
  const totalApp = numLegit(comprasApp) ?? 0

  // Filtrar filas del libro al mes solicitado y aplanar facturas.
  const filasMes = Array.isArray(facturasLibro)
    ? facturasLibro.filter(row => typeof row?.periodo === 'string' && row.periodo === mes)
    : []
  let totalLibro = 0
  let cuentaFacturas = 0
  let sinFecha = 0
  const porProveedor = new Map()
  for (const row of filasMes) {
    const prov = (typeof row.proveedor === 'string' && row.proveedor.trim()) || 'Sin proveedor'
    let suma = 0
    for (const f of (Array.isArray(row.facturas) ? row.facturas : [])) {
      const imp = numLegit(f?.importe)
      if (imp == null) continue
      totalLibro += imp
      suma += imp
      cuentaFacturas += 1
      if (!f?.fecha) sinFecha += 1
    }
    if (suma !== 0) porProveedor.set(prov, (porProveedor.get(prov) || 0) + suma)
  }
  totalLibro = r2(totalLibro)

  const diferencia = r2(totalApp - totalLibro)
  const pct = totalLibro !== 0
    ? (totalApp - totalLibro) / totalLibro
    : null

  // Estado.
  let estado
  const sinApp   = numLegit(comprasApp) == null || totalApp === 0
  const sinLibro = cuentaFacturas === 0
  if (sinLibro) {
    estado = 'sin_libro'
  } else if (sinApp) {
    estado = 'sin_app'
  } else {
    const dentroEuro = Math.abs(diferencia) <= TOL_EUR
    const dentroPct  = (pct != null) && Math.abs(pct) <= TOL_PCT
    estado = (dentroEuro || dentroPct) ? 'ok' : 'revisar'
  }

  // Top 5 proveedores del Libro por importe (informativo). No se cruza
  // con app porque no tenemos compras por proveedor en el snapshot.
  const topLibro = [...porProveedor.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([proveedor, total]) => ({ proveedor, total: r2(total) }))

  return {
    totalApp: r2(totalApp),
    totalLibro,
    diferencia,
    pct,               // ratio (0.03 = 3 %), null si totalLibro = 0
    estado,            // 'ok' | 'revisar' | 'sin_libro' | 'sin_app'
    meta: {
      mes,
      cuenta_facturas: cuentaFacturas,
      sin_fecha: sinFecha,                 // facturas sin campo fecha
      proveedores_libro: porProveedor.size,
      top_libro_por_proveedor: topLibro,   // sólo informativo
      tolerancia: { eur: TOL_EUR, pct: TOL_PCT },
      // El cruce por proveedor NO se intenta porque el snapshot del
      // cierre no guarda compras por proveedor. Si en el futuro se
      // añade, basta con pasar un mapa adicional a esta función.
      cruce_por_proveedor: false,
    },
  }
}
