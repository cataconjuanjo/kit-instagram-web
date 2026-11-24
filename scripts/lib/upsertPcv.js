'use strict'

/**
 * resolverPcv({ supabase, proveedor_id, codigo_articulo, claveDura, datosInsert, datosUpdate })
 *   → { id, accion: 'insert' | 'update', filaPrevia? }
 *
 * Resuelve (o crea) la fila de proveedor_catalogo_vinos correspondiente a una
 * oferta recién publicada.  Idempotente por diseño:
 *
 *  1. Busca por (proveedor_id, referencia = codigo_articulo).  Si aparece,
 *     UPDATE conservativo.
 *  2. Si no, busca por claveDura dentro del mismo proveedor (sin referencia
 *     fiable).  Si aparece, UPDATE y rellena referencia cuando esté null.
 *  3. Si no, INSERT.
 *
 * El UPDATE NO pisa campos que edita el usuario (favorito, notas,
 * pvp_recomendado, pvp_copa, motivo, ambito).  vino_id solo se rellena si
 * estaba null.  disponibilidad se respeta cuando la fuente no la trae.
 *
 * Firma del mock supabase requerida (equivalente a supabase-js):
 *   supabase.from(tabla)
 *     .select(cols).eq(c,v).eq(c,v).maybeSingle()
 *     .insert(obj).select(cols).single()
 *     .update(obj).eq(c,v).select(cols).single()
 *
 * El caller es responsable de computar `claveDura` y los objetos
 * `datosInsert` / `datosUpdate`.  Esto mantiene este módulo libre de la
 * lógica de normalización concreta del CLI.
 *
 * Columnas GENERATED ALWAYS (nombre_norm, bodega_norm) NO se incluyen aquí.
 * Columnas gestionadas por el usuario (favorito, notas, pvp_recomendado,
 * pvp_copa, motivo, ambito) NO entran en datosUpdate.
 */
async function resolverPcv({
  supabase,
  proveedor_id,
  codigo_articulo,
  claveDura,
  datosInsert,
  datosUpdate,
}) {
  if (!proveedor_id) throw new Error('resolverPcv: proveedor_id obligatorio')
  if (!datosInsert || !datosInsert.nombre) throw new Error('resolverPcv: datosInsert.nombre obligatorio')

  // 1. Match por referencia (codigo_articulo) dentro del mismo proveedor.
  let existente = null
  if (codigo_articulo) {
    const { data, error } = await supabase
      .from('proveedor_catalogo_vinos')
      .select('id, referencia, vino_id, disponibilidad, favorito, notas, pvp_recomendado, pvp_copa')
      .eq('proveedor_id', proveedor_id)
      .eq('referencia', String(codigo_articulo))
      .maybeSingle()
    if (error) throw error
    existente = data || null
  }

  // 2. Match por claveDura: cargamos candidatos del proveedor y filtramos.
  //    Nota: la columna `clave_dura` NO existe en la tabla; comparamos en JS
  //    porque claveDura es una proyección (nombre, bodega, formato_ml, anada).
  if (!existente && claveDura) {
    const { data, error } = await supabase
      .from('proveedor_catalogo_vinos')
      .select('id, nombre, bodega, formato, anada, referencia, vino_id, disponibilidad, favorito, notas, pvp_recomendado, pvp_copa')
      .eq('proveedor_id', proveedor_id)
    if (error) throw error
    const candidatos = Array.isArray(data) ? data : []
    existente = candidatos.find(row => claveDura.matches(row)) || null
  }

  if (existente) {
    const update = construirUpdateIdempotente(datosUpdate, existente)
    if (!existente.referencia && codigo_articulo) {
      update.referencia = String(codigo_articulo)
    }
    const { data: actualizado, error } = await supabase
      .from('proveedor_catalogo_vinos')
      .update(update)
      .eq('id', existente.id)
      .select('id')
      .single()
    if (error) throw error
    return { id: actualizado?.id || existente.id, accion: 'update', filaPrevia: existente }
  }

  // 3. INSERT nuevo.
  const insertRow = { ...datosInsert, proveedor_id }
  if (codigo_articulo && !insertRow.referencia) {
    insertRow.referencia = String(codigo_articulo)
  }
  // Defaults defensivos (la tabla tiene NOT NULL en activo; mantener claro).
  if (typeof insertRow.activo !== 'boolean') insertRow.activo = true
  if (!insertRow.updated_at) insertRow.updated_at = new Date().toISOString()

  const { data: nuevo, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .insert(insertRow)
    .select('id')
    .single()
  if (error) throw error
  return { id: nuevo?.id || null, accion: 'insert' }
}

/**
 * Construye el objeto UPDATE respetando los campos que gestiona el usuario.
 * Reglas:
 *   - disponibilidad: solo si la fuente trae valor no vacío.
 *   - vino_id:       solo si estaba null.
 *   - favorito/notas/pvp_recomendado/pvp_copa/motivo/ambito: NUNCA se pisan.
 *   - resto de campos en `datosUpdate`: se escriben tal cual.
 */
function construirUpdateIdempotente(datosUpdate, filaPrevia) {
  const out = { ...datosUpdate }
  // Protecciones hard-coded por invariante de producto:
  delete out.favorito
  delete out.notas
  delete out.pvp_recomendado
  delete out.pvp_copa
  delete out.motivo
  delete out.ambito
  delete out.id
  delete out.proveedor_id  // nunca cambia en update
  delete out.created_at
  // nombre_norm / bodega_norm NUNCA se incluyen (GENERATED ALWAYS).
  delete out.nombre_norm
  delete out.bodega_norm

  if (out.disponibilidad != null && String(out.disponibilidad).trim() === '') {
    delete out.disponibilidad
  }
  if (filaPrevia && filaPrevia.vino_id && 'vino_id' in out) {
    delete out.vino_id
  }
  out.updated_at = out.updated_at || new Date().toISOString()
  return out
}

module.exports = { resolverPcv, construirUpdateIdempotente }
