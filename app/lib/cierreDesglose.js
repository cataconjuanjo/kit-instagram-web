/**
 * cierreDesglose.js — Lectura segura del "desglose" de un snapshot de
 * cierre mensual de bodega.
 *
 * Los cierres firmados antes de noviembre 2026 están guardados en la
 * tabla cierres_mensuales_bodega.snapshot SIN el objeto `desglose`. Para
 * que la UI, el PDF y el Excel no revienten al abrir esos cierres y
 * muestren un estado "desglose no disponible", todos los consumidores
 * deben entrar por este helper y NO leer `snapshot.desglose` directo.
 *
 * El formato actual es desglose_v = 1 (ver app/lib/agregarPeriodoBodega.js).
 * Si en el futuro cambia la forma del objeto, este archivo es el único
 * sitio donde hay que decidir cómo migrar / descartar al leer.
 */

/**
 * Devuelve el objeto desglose del snapshot si existe y la versión es
 * reconocida. En cualquier otro caso devuelve null. Nunca lanza.
 *
 * @param {object|null|undefined} snapshot
 * @returns {object|null}
 */
export function readDesglose(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const d = snapshot.desglose
  if (!d || typeof d !== 'object') return null
  if (d.desglose_v !== 1) return null
  return d
}

/**
 * @param {object|null|undefined} snapshot
 * @returns {boolean}
 */
export function hasDesglose(snapshot) {
  return readDesglose(snapshot) != null
}

/**
 * Orden canónico de las categorías de salida sin venta para la UI/Excel/PDF.
 * Se expone aquí para que los tres consumers rendericen las mismas filas
 * en el mismo orden y no se diverja.
 */
export const CATEGORIAS_SALIDA_SIN_VENTA = [
  { key: 'invitacion_botella', label: 'Invitación (botella)' },
  { key: 'invitacion_copa',    label: 'Invitación (copa)' },
  { key: 'cocina',             label: 'Cocina' },
  { key: 'grupo_evento',       label: 'Grupo / Evento' },
  { key: 'maridaje',           label: 'Maridaje' },
  { key: 'rotura',             label: 'Rotura / defecto' },
  { key: 'cata',               label: 'Cata interna' },
]
