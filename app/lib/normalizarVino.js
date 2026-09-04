import { titleCaseNombre } from './normalizarNombre.js'
import { splitZonaTipo, sospechaZona, splitFormato } from './normalizarCatalogo.js'
import { resolverZona } from './normalizarDenominacion.js'

/**
 * Aplica las normalizaciones de nombre/zona/formato a una fila del catálogo.
 * Fuente de verdad compartida entre el API admin y los scripts de importación.
 *
 * @param {{ nombre?: string, tipo?: string, region?: string, formato?: string }} row
 * @param {Map|null} mapaRefDenom - resultado de construirMapaDenominaciones().
 *   Si se pasa, añade pais/comunidad_autonoma/do_igp/zona_revisar/zona_original.
 *   Si es null, esos campos no se incluyen en el retorno.
 * @returns objeto con campos normalizados + columnas derivadas (_raw, zona, tamanyo, …)
 */
export function normalizarCamposVino(row, mapaRefDenom = null) {
  const nombreRaw  = (row.nombre  || '').trim()
  const regionRaw  = (row.region  || '').trim() || null
  const formatoRaw = (row.formato || '').trim() || null

  const nombreNorm = nombreRaw ? titleCaseNombre(nombreRaw) : nombreRaw

  let zona = null
  let tipoNorm = (row.tipo || '').trim() || null
  let regionRawGuardado = null
  if (regionRaw) {
    const { zona: z, tipo: tipoExtraido } = splitZonaTipo(regionRaw)
    if (!sospechaZona(z)) {
      zona = z
      if (z !== regionRaw) regionRawGuardado = regionRaw  // solo cuando hubo split real
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

  // ── Normalización DOP/IGP (solo si se pasa el mapa de referencia) ──────────
  let pais = undefined
  let comunidad_autonoma = undefined
  let do_igp = undefined
  let zona_revisar = undefined
  let zona_original = undefined

  if (mapaRefDenom !== null) {
    // zona_original: el texto de zona extraído antes de cualquier mapeo DOP
    zona_original = zona ?? null
    if (zona) {
      const res = resolverZona(zona, mapaRefDenom)
      pais               = res.pais ?? null
      comunidad_autonoma = res.comunidad_autonoma ?? null
      do_igp             = res.do_igp ?? null
      zona_revisar       = res.zona_revisar
    } else {
      pais = null; comunidad_autonoma = null; do_igp = null; zona_revisar = false
    }
  }

  const base = {
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

  if (mapaRefDenom !== null) {
    base.zona_original       = zona_original
    base.pais                = pais
    base.comunidad_autonoma  = comunidad_autonoma
    base.do_igp              = do_igp
    base.zona_revisar        = zona_revisar
  }

  return base
}
