import { setAdminRestaurantEmail, setAdminRestaurantId } from '../demo'

/**
 * Sets the admin impersonation context in localStorage and navigates to the
 * restaurant dashboard. Pass `navigate` (e.g. router.push) for SPA navigation;
 * omit it to fall back to window.location.href (full-page navigation).
 */
export function openRestaurantDashboard(id, email, navigate) {
  setAdminRestaurantEmail(email)
  setAdminRestaurantId(id)
  const url = `/dashboard?restaurante_id=${id}`
  if (typeof navigate === 'function') {
    navigate(url)
  } else if (typeof window !== 'undefined') {
    window.location.href = url
  }
}
