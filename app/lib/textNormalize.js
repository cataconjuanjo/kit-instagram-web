export function normalizarTexto(texto = '') {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Normalizaci\u00f3n base para tipos y regiones de vinos.
// Aplica trim, lowercase, elimina diacr\u00edticos y quita prefijos "D.O."/"D.O.C." para
// que "D.O.BIERZO" y "Bierzo" caigan en el mismo grupo.
export function normWine(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^d\.o\.(?:ca?\.?)?\s*/, '')
    .trim()
}

// Normalizaci\u00f3n de regi\u00f3n para comparaciones de huecos.
// Adem\u00e1s de normWine, elimina art\u00edculos iniciales para que
// "La Rioja", "El Bierzo" y "Rioja", "Bierzo" caigan en el mismo grupo.
export function normWineRegion(s) {
  return normWine(s).replace(/^(la |el |los |las |de |del |l')/, '').trim()
}

// Normalizaci\u00f3n de tipo para comparaciones de huecos.
// Adem\u00e1s de normWine, singulariza plurales espa\u00f1oles para que
// "Tintos", "Blancos" y "Tinto", "Blanco" caigan en el mismo grupo.
export function normWineTipo(s) {
  const base = normWine(s)
  return base.endsWith('os') ? base.slice(0, -1) : base
}
