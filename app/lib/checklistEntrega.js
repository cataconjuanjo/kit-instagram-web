/**
 * Checklist de entrega — módulo puro (sin supabase, sin DOM).
 *
 * Decide "Listo / Pendiente" por ítem del checklist que ve el
 * propietario en `app/dashboard/ajustes/page.js`. La política es
 * dura: si no hay señal REAL registrada, el ítem queda PENDIENTE.
 * Nunca mostrar "Listo" por defecto (es engañoso en un restaurante
 * recién creado — fue el bug de FASE G).
 *
 * Señales:
 *   1. Inventario preparado → viene del decisor
 *      `estadoConteoInicial(respuesta_de_/api/conteos)`.
 *      'hecho' → Listo; cualquier otra cosa → Pendiente.
 *
 *   2. Referencias completas → al menos UN vino activo Y todos los
 *      activos tienen nombre + tipo + precio_botella + coste.
 *      Criterio del brief FASE I, más estricto que el genérico de
 *      `app/dashboard/vinos/page.js` (que suma 6 dimensiones,
 *      incluidas etiqueta y proveedor). Aquí basta con lo que
 *      necesita el motor económico para no producir NaN: nombre
 *      (para listarlo), tipo (clasificar), precio_botella (ingreso)
 *      y coste (margen). Sin vinos activos → Pendiente.
 *
 *   3. QR probado en móvil → confirmación manual: checklist_entrega.
 *      qr_probado_en != null (ISO date string).
 *
 *   4. Mapa estrella/joya revisado → confirmación manual:
 *      checklist_entrega.mapa_revisado_en != null.
 *
 * El JSONB `restaurantes.checklist_entrega` almacena sólo FECHAS ISO
 * para los ítems de confirmación manual, bajo claves fijas en la
 * lista permitida (`CLAVES_CONFIRMACION_MANUAL`). El endpoint POST
 * valida que la clave esté en esa lista antes de escribir.
 */

/**
 * Claves de `restaurantes.checklist_entrega` que el usuario puede
 * marcar/desmarcar desde la UI. Cualquier clave fuera de esta lista
 * se rechaza en el endpoint (evita input libre al JSONB).
 */
export const CLAVES_CONFIRMACION_MANUAL = Object.freeze([
  'qr_probado_en',
  'mapa_revisado_en',
])

/**
 * ¿La respuesta de GET /api/conteos indica conteo inicial hecho?
 * Reexporta la lógica canónica (vive en `conteoInicial.js`, misma
 * fuente que el checklist de Inicio) para que un solo lugar decida
 * el estado del inventario.
 */
export function inventarioPreparado(respuestaConteos) {
  if (!respuestaConteos || typeof respuestaConteos !== 'object') return false
  if (respuestaConteos.control_stock_desde != null && respuestaConteos.control_stock_desde !== '') return true
  const lista = Array.isArray(respuestaConteos.conteos) ? respuestaConteos.conteos : null
  if (lista === null) return false
  for (const c of lista) {
    if (!c || c.tipo !== 'inicial') continue
    if (c.estado === 'cerrado') return true
    if (c.cerrado_en != null && c.cerrado_en !== '') return true
  }
  return false
}

/**
 * ¿La base de vinos cubre el mínimo económico? Criterio FASE I:
 *   - al menos 1 vino activo
 *   - todos los activos tienen nombre + tipo + precio_botella + coste
 *     (coste = coste_compra || coste_medio_pmp > 0)
 */
export function referenciasCompletas(vinos) {
  if (!Array.isArray(vinos)) return false
  const activos = vinos.filter(v => v && v.activo !== false)
  if (activos.length === 0) return false
  return activos.every(v => {
    const nombreOk = typeof v.nombre === 'string' && v.nombre.trim().length > 0
    const tipoOk   = typeof v.tipo === 'string' && v.tipo.trim().length > 0
    const precioOk = Number(v.precio_botella) > 0
    const costeOk  = Number(v.coste_compra) > 0 || Number(v.coste_medio_pmp) > 0
    return nombreOk && tipoOk && precioOk && costeOk
  })
}

/**
 * ¿Está confirmado un ítem manual? Lee `checklist_entrega[clave]`
 * y lo considera "Listo" si es una fecha ISO no vacía.
 */
export function confirmacionMarcada(checklistEntrega, clave) {
  if (!checklistEntrega || typeof checklistEntrega !== 'object') return false
  if (!CLAVES_CONFIRMACION_MANUAL.includes(clave)) return false
  const v = checklistEntrega[clave]
  return typeof v === 'string' && v.trim() !== ''
}

/**
 * Dado todo el input, calcula el estado de los 4 ítems del
 * checklist de entrega del BRIEF FASE I. Cada ítem devuelve
 * `{ pendiente: boolean, confirmable: boolean, clave?: 'qr_probado_en'|... }`.
 *   - `confirmable=true`  → la UI pinta botón "Marcar como hecho" /
 *                           "Desmarcar"
 *   - `confirmable=false` → la UI pinta un enlace a la pantalla que
 *                           produce la señal real (bodega, vinos)
 *
 * Estructura devuelta estable para el consumer (page.js).
 */
export function estadoChecklistEntrega({
  respuestaConteos,
  vinos,
  checklistEntrega,
} = {}) {
  const inv = inventarioPreparado(respuestaConteos)
  const refs = referenciasCompletas(vinos)
  const qr  = confirmacionMarcada(checklistEntrega, 'qr_probado_en')
  const map = confirmacionMarcada(checklistEntrega, 'mapa_revisado_en')
  return {
    inventario_preparado:    { pendiente: !inv, confirmable: false },
    referencias_completas:   { pendiente: !refs, confirmable: false },
    qr_probado:              { pendiente: !qr,  confirmable: true, clave: 'qr_probado_en' },
    mapa_revisado:           { pendiente: !map, confirmable: true, clave: 'mapa_revisado_en' },
  }
}

/**
 * Valida input del endpoint POST /api/checklist-entrega.
 *   body = { clave: string, marcar: boolean }
 * Devuelve { ok:true, clave, marcar } o { ok:false, mensaje }.
 */
export function validarMarcarConfirmacion(body) {
  if (!body || typeof body !== 'object') return { ok: false, mensaje: 'Body inválido' }
  const { clave, marcar } = body
  if (typeof clave !== 'string' || !CLAVES_CONFIRMACION_MANUAL.includes(clave)) {
    return { ok: false, mensaje: `clave debe ser uno de: ${CLAVES_CONFIRMACION_MANUAL.join(', ')}` }
  }
  if (typeof marcar !== 'boolean') return { ok: false, mensaje: 'marcar debe ser boolean' }
  return { ok: true, clave, marcar }
}
