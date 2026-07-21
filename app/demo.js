'use client'

const DEMO_EMAIL_KEY = 'cartavinos_demo_email'
const ADMIN_RESTAURANT_EMAIL_KEY = 'carta_viva_admin_restaurant_email'
const ADMIN_RESTAURANT_ID_KEY = 'carta_viva_admin_restaurant_id'
const TABERNA_DEMO_EMAIL = 'demo@taberna-del-puerto.com'
const SUMILLER_DEMO_EMAIL = 'sumiller.demo@cartaviva.local'
const DEMO_PRESENTATION_PARAMS = new Set(['demo_presentacion', 'demo_sumiller'])
const DEMO_EMAILS = new Set([TABERNA_DEMO_EMAIL, SUMILLER_DEMO_EMAIL])
const DEMO_EMAIL_BY_PRESENTATION_PARAM = {
  demo_presentacion: TABERNA_DEMO_EMAIL,
  demo_sumiller: SUMILLER_DEMO_EMAIL,
}

export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

export function isAdminEmail(email) {
  return Boolean(email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase())
}

export function setDemoEmail(email) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEMO_EMAIL_KEY, email)
  } catch {}
}

export function getDemoEmail() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(DEMO_EMAIL_KEY)
  } catch {
    return null
  }
}

export function clearDemoEmail() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DEMO_EMAIL_KEY)
  } catch {}
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

function isDemoPresentationRoute() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return Array.from(DEMO_PRESENTATION_PARAMS).some(param => params.get(param) === '1')
}

function isAllowedDemoEmail(email) {
  return Boolean(email && DEMO_EMAILS.has(email.toLowerCase()))
}

function isDashboardRoute() {
  if (typeof window === 'undefined') return false
  return window.location.pathname === '/dashboard' || window.location.pathname.startsWith('/dashboard/')
}

function getRouteDemoEmail() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  for (const param of DEMO_PRESENTATION_PARAMS) {
    if (params.get(param) !== '1') continue
    const email = DEMO_EMAIL_BY_PRESENTATION_PARAM[param]
    if (email === SUMILLER_DEMO_EMAIL && process.env.NEXT_PUBLIC_SHOW_DEMO !== 'true') return null
    return email
  }
  return null
}

function getDemoSessionEmail() {
  const routeDemoEmail = getRouteDemoEmail()
  if (routeDemoEmail) {
    setDemoEmail(routeDemoEmail)
    return routeDemoEmail
  }

  const storedDemoEmail = getDemoEmail()
  const canUseStoredDemo = process.env.NEXT_PUBLIC_SHOW_DEMO === 'true' || (!isDemoPresentationRoute() && isDashboardRoute())
  if (!canUseStoredDemo || !isAllowedDemoEmail(storedDemoEmail)) return null
  if (storedDemoEmail.toLowerCase() === SUMILLER_DEMO_EMAIL && process.env.NEXT_PUBLIC_SHOW_DEMO !== 'true') return null
  return storedDemoEmail
}

export async function getEffectiveRestaurantEmail(supabase) {
  const { data: { user } } = await supabase.auth.getUser()
  const demoEmail = getDemoSessionEmail()

  if (!user && demoEmail) return { email: demoEmail, user: null, isAdmin: false, isDemo: true }
  if (!user) return { email: null, user: null, isAdmin: false, isDemo: false }

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
      isDemo: false,
    }
  }

  return { email: user.email, restauranteId: null, user, isAdmin: false, isDemo: false }
}
