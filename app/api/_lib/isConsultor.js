// Comprobación centralizada "sesión autenticada es el consultor".
//
// El consultor es la cuenta admin única del proyecto (ADMIN_EMAIL,
// por defecto cataconjuanjo@gmail.com). Los campos privados del catálogo
// (coste_estimado, margen, contacto comercial del proveedor…) sólo deben
// servirse a esta cuenta; cualquier restaurante autenticado debe recibir
// únicamente lo que es público para él (PVP sugeridos, nombre, formato…).
//
// Importa esto en cada endpoint que mezcle ambos roles y usa isConsultorFromAuth
// pasándole el objeto { user } devuelto por requireRestaurantAccess / getUserFromRequest.
//
// Convenciones de variable:
//   - ADMIN_EMAIL (sin prefijo) es la variable canónica server-side.
//   - NEXT_PUBLIC_ADMIN_EMAIL existe para que el cliente también pueda saber
//     si la sesión es admin (app/demo.js lo lee); el server debería leer ADMIN_EMAIL.
// Comportamiento si ninguna de las dos está definida en Vercel:
//   - fail-closed: el default hardcoded sigue siendo 'cataconjuanjo@gmail.com'.
//     Si el admin real cambiara y la env var faltara, ningún otro email coincidiría
//     y toda la base de consultores perdería visibilidad de coste. El panel admin
//     también quedaría sin coste hasta que se defina ADMIN_EMAIL.
//   - Si el email definido en ADMIN_EMAIL no coincide con el login real del admin,
//     el admin pierde la vista de coste (mismo resultado práctico).

function resolveAdminEmail() {
  const raw = process.env.ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
  return String(raw).toLowerCase()
}

export function getAdminEmail() {
  // Evaluación perezosa por si el entorno cambia en runtime (tests).
  return resolveAdminEmail()
}

export function isConsultorEmail(email) {
  if (!email) return false
  return String(email).toLowerCase() === getAdminEmail()
}

export function isConsultorFromAuth(auth) {
  const email = auth?.user?.email || ''
  return isConsultorEmail(email)
}
