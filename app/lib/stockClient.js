export async function aplicarAjustesStock(supabase, payload) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('La sesion ha caducado. Vuelve a entrar.')

  const response = await fetch('/api/stock/ajustes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || 'No se pudo actualizar el stock.')
  }
  return body.ajustes || []
}
