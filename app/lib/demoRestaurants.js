// Allowlist de restaurantes marcados como "demo piloto" para la UI.
// No es un flag de BD: es una decisión de presentación (cosmética) para
// que en la demo no se vean cifras comerciales o ciudades concretas.
// Para añadir un demo: inclúyelo aquí por slug y/o por UUID.

const DEMO_SLUGS = new Set([
  'casa-marisma',
  'sumiller-casa-marisma',
  'taberna-del-puerto',
])

const DEMO_IDS = new Set([
  '65d26545-7c7e-424c-9c29-33bfe8bbaafa',
])

export function esRestauranteDemo(restaurante) {
  if (!restaurante) return false
  if (restaurante.is_demo === true) return true
  if (restaurante.slug && DEMO_SLUGS.has(String(restaurante.slug).toLowerCase())) return true
  if (restaurante.id && DEMO_IDS.has(String(restaurante.id).toLowerCase())) return true
  return false
}
