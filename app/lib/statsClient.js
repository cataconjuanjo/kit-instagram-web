export function enviarEstadisticas(payload) {
  return fetch('/api/estadisticas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
