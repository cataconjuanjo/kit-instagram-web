'use client'

const DEMO_EMAIL_KEY = 'cartavinos_demo_email'
const ADMIN_RESTAURANT_EMAIL_KEY = 'carta_viva_admin_restaurant_email'
const ADMIN_RESTAURANT_ID_KEY = 'carta_viva_admin_restaurant_id'

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

export function isAdminEmail(email) {
  return Boolean(email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase())
}

export function setDemoEmail(email) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DEMO_EMAIL_KEY, email)
}

export function getDemoEmail() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(DEMO_EMAIL_KEY)
}

export function clearDemoEmail() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(DEMO_EMAIL_KEY)
}

export function setAdminRestaurantEmail(email) {
  if (typeof window === 'undefined') return
  if (email) window.localStorage.setItem(ADMIN_RESTAURANT_EMAIL_KEY, email)
  else window.localStorage.removeItem(ADMIN_RESTAURANT_EMAIL_KEY)
}

export function setAdminRestaurantId(id) {
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(ADMIN_RESTAURANT_ID_KEY, id)
}

export function getAdminRestaurantEmail() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ADMIN_RESTAURANT_EMAIL_KEY)
}

export function getAdminRestaurantId() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ADMIN_RESTAURANT_ID_KEY)
}

export function clearAdminRestaurantEmail() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ADMIN_RESTAURANT_EMAIL_KEY)
  window.localStorage.removeItem(ADMIN_RESTAURANT_ID_KEY)
}

export async function getEffectiveRestaurantEmail(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  const demoEmail = process.env.NEXT_PUBLIC_SHOW_DEMO === 'true' ? getDemoEmail() : null

  if (!user && demoEmail) return { email: demoEmail, user: null, isAdmin: false }
  if (!user) return { email: null, user: null, isAdmin: false }

  if (isAdminEmail(user.email)) {
    const restauranteIdUrl = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('restaurante_id')
      : null
    if (restauranteIdUrl) setAdminRestaurantId(restauranteIdUrl)
    return {
      email: getAdminRestaurantEmail() || user.email,
      restauranteId: restauranteIdUrl || getAdminRestaurantId(),
      user,
      isAdmin: true,
    }
  }

  return { email: user.email, restauranteId: null, user, isAdmin: false }
}
