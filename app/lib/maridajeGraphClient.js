export async function consultarMaridajeGrafo(payload, { signal } = {}) {
  const res = await fetch('/api/maridaje-grafo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })

  if (!res.ok) throw new Error(`POST maridaje grafo ${res.status}`)
  return res.json()
}
