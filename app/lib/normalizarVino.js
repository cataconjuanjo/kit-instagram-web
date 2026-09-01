import { titleCaseNombre } from './normalizarNombre.js'
import { splitZonaTipo, sospechaZona, splitFormato } from './normalizarCatalogo.js'

/**
 * Aplica las normalizaciones de nombre/zona/formato a una fila del catálogo.
 * Fuente de verdad compartida entre el API admin y los scripts de importación.
 *
 * @param {{ nombre?: string, tipo?: string, region?: string, formato?: string }} row
 * @returns objeto con campos normalizados + columnas derivadas (_raw, zona, tamanyo, …)
 */
export function normalizarCamposVino(row) {
  const nombreRaw  = (row.nombre  || '').trim()
  const regionRaw  = (row.region  || '').trim() || null
  const formatoRaw = (row.formato || '').trim() || null

  const nombreNorm = nombreRaw ? titleCaseNombre(nombreRaw) : nombreRaw

  let zona = null
  let tipoNorm = (row.tipo || '').trim() || null
  let regionRawGuardado = null
  if (regionRaw) {
    const { zona: z, tipo: tipoExtraido } = splitZonaTipo(regionRaw)
    if (!sospechaZona(z) && z !== regionRaw) {
      zona = z
      regionRawGuardado = regionRaw
      if (tipoExtraido && !tipoNorm) tipoNorm = tipoExtraido
    }
  }

  let tamanyo = null, unidades_por_caja = null, referencia_proveedor = null
  let almacen_proveedor = null, graduacion = null, formatoRawGuardado = null
  if (formatoRaw) {
    const r = splitFormato(formatoRaw)
    const hayExtraccion =
      r.tamanyo !== formatoRaw || r.unidades_por_caja !== null ||
      r.referencia_proveedor || r.almacen_proveedor || r.graduacion
    if (hayExtraccion) {
      formatoRawGuardado = formatoRaw
      if (!r.revisar) {
        tamanyo = r.tamanyo || null
        unidades_por_caja = r.unidades_por_caja
        referencia_proveedor = r.referencia_proveedor || null
        graduacion = r.graduacion || null
        almacen_proveedor = r.almacen_proveedor || null
      } else if (r.revisarMsg === 'código almacén ambiguo') {
        tamanyo = r.tamanyo || null
        unidades_por_caja = r.unidades_por_caja
        referencia_proveedor = r.referencia_proveedor || null
        graduacion = r.graduacion || null
        // almacen_proveedor queda null intencionadamente
      }
      // posible unidades / sin clasificar → no tocar campos de formato
    }
  }

  return {
    nombre: nombreNorm,
    nombre_raw: nombreRaw !== nombreNorm ? nombreRaw : null,
    tipo: tipoNorm,
    region: regionRaw,
    region_raw: regionRawGuardado,
    zona,
    formato: formatoRaw,
    formato_raw: formatoRawGuardado,
    tamanyo,
    unidades_por_caja,
    referencia_proveedor,
    graduacion,
    almacen_proveedor,
  }
}
