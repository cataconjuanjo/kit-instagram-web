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

const adminEmail = (process.env.ADMIN_EMAIL || 'cataconjuanjo@gmail.com').toLowerCase()

export function isConsultorEmail(email) {
  if (!email) return false
  return String(email).toLowerCase() === adminEmail
}

export function isConsultorFromAuth(auth) {
  const email = auth?.user?.email || ''
  return isConsultorEmail(email)
}
