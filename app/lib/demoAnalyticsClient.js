const CONSENT_KEY = 'ccj_cookie_consent'
const ENDPOINT = '/api/demo/analytics'

function canTrackAnalytics() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'accepted'
  } catch {
    return false
  }
}

function cleanValue(value, max = 160) {
  return String(value || '').slice(0, max)
}

export function trackDemoEvent(event, payload = {}) {
  if (!canTrackAnalytics()) return

  const body = {
    consent: 'accepted',
    event: cleanValue(event, 80),
    demo: cleanValue(payload.demo || 'taberna-del-puerto', 80),
    role: cleanValue(payload.role || '', 40),
    target: cleanValue(payload.target || '', 180),
    source: cleanValue(payload.source || '', 80),
    path: cleanValue(window.location.pathname, 180),
  }

  if (typeof window.gtag === 'function') {
    window.gtag('event', body.event, {
      event_category: 'demo',
      event_label: [body.demo, body.role, body.target].filter(Boolean).join(' / '),
      demo: body.demo,
      role: body.role,
    })
  }

  const json = JSON.stringify(body)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }))
    return
  }

  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
    keepalive: true,
  }).catch(() => {})
}
