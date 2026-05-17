'use client'

const DEMO_EMAIL_KEY = 'cartavinos_demo_email'
const ADMIN_RESTAURANT_EMAIL_KEY = 'carta_viva_admin_restaurant_email'

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
  window.localStorage.setItem(ADMIN_RESTAURANT_EMAIL_KEY, email)
}

export function getAdminRestaurantEmail() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ADMIN_RESTAURANT_EMAIL_KEY)
}

export function clearAdminRestaurantEmail() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ADMIN_RESTAURANT_EMAIL_KEY)
}

export async function getEffectiveRestaurantEmail(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  const demoEmail = process.env.NEXT_PUBLIC_SHOW_DEMO === 'true' ? getDemoEmail() : null

  if (!user && demoEmail) return { email: demoEmail, user: null, isAdmin: false }
  if (!user) return { email: null, user: null, isAdmin: false }

  if (isAdminEmail(user.email)) {
    return {
      email: getAdminRestaurantEmail() || user.email,
      user,
      isAdmin: true,
    }
  }

  return { email: user.email, user, isAdmin: false }
}
