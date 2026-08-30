export function normalizarTexto(texto = '') {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Normalizaci\u00f3n para agrupar tipos y regiones de vinos: trim + lowercase + sin diacr\u00edticos.
// Usada en el an\u00e1lisis de huecos del cat\u00e1logo y en el \u0394 regiones del simulador.
export function normWine(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
