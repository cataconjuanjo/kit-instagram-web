// FASE J2-fix: agregador de conteos del catálogo de proveedores.
// Centraliza la lógica para que /api/admin/proveedores?scope=lite devuelva
// los mismos totales que calcularía /scope=full contando filas en memoria.
// Función pura → testeable sin BD.

export function agregarConteos(filas = []) {
  const conteos = {
    total: 0,
    conCoste: 0,
    sinPrecio: 0,
    porProveedor: {},
    porProveedorConCoste: {},
  }
  for (const fila of filas) {
    if (!fila) continue
    conteos.total++
    const pid = fila.proveedor_id
    if (pid != null) {
      conteos.porProveedor[pid] = (conteos.porProveedor[pid] || 0) + 1
    }
    const coste = Number(fila.coste_estimado) || 0
    if (coste > 0) {
      conteos.conCoste++
      if (pid != null) {
        conteos.porProveedorConCoste[pid] = (conteos.porProveedorConCoste[pid] || 0) + 1
      }
    }
  }
  conteos.sinPrecio = conteos.total - conteos.conCoste
  return conteos
}
