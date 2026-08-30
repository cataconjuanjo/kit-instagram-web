export function normalizarTexto(texto = '') {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Normalizaci\u00f3n para agrupar tipos y regiones de vinos.
// Aplica trim, lowercase, elimina diacr\u00edticos y quita prefijos "D.O."/"D.O.C." para
// que "D.O.BIERZO" y "Bierzo" caigan en el mismo grupo.
export function normWine(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^d\.o\.c?\.?\s*/, '')
    .trim()
}
