/**
 * facturasPath.js — Validación pura del `path` de un adjunto de factura
 * antes de pedir una URL firmada en Storage.
 *
 * La regla: el path tiene que empezar por `${restaurante_id}/` y no puede
 * contener `..` (ningún uso legítimo en nuestro esquema `restauranteId/…`).
 * No se permiten backslashes ni ascenso relativo entre segmentos.
 *
 * Devuelve siempre un objeto `{ ok: boolean, reason?: string }` para que
 * el endpoint pueda decidir el status (400/403) sin exponer detalles
 * internos al cliente.
 */

export function validarPathFactura(path, restauranteId) {
  if (typeof path !== 'string' || path.length === 0) {
    return { ok: false, reason: 'path_vacio' }
  }
  if (typeof restauranteId !== 'string' || restauranteId.length === 0) {
    return { ok: false, reason: 'restaurante_id_vacio' }
  }
  // Basta con detectar el patrón `..` en cualquier posición: aunque el
  // cliente lo codifique, los que llegan al endpoint vienen decodificados.
  if (path.includes('..')) {
    return { ok: false, reason: 'path_con_ascenso' }
  }
  // Nada de backslashes: Storage siempre usa `/`.
  if (path.includes('\\')) {
    return { ok: false, reason: 'path_con_backslash' }
  }
  // El prefijo del restaurante es obligatorio y el siguiente carácter
  // debe ser `/` (no basta con startsWith, p. ej. `abc-xy/` empezaría
  // por `abc` si el id fuera `abc`).
  const prefijo = `${restauranteId}/`
  if (!path.startsWith(prefijo)) {
    return { ok: false, reason: 'path_fuera_de_restaurante' }
  }
  // El flujo normal guarda los adjuntos de IA en `${rid}/_ia/…`. No
  // forzamos la carpeta `_ia/` porque existen adjuntos vinculados a
  // cabeceras (`${rid}/${cabecera_id}/…`). Ambos son del propio
  // restaurante y la RLS/RLS-less del bucket privado los cubre; aquí
  // nos basta con el prefijo del restaurante.
  return { ok: true }
}
