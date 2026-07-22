export function consultarMaridaje(payload) {
  return fetch('/api/maridaje', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
