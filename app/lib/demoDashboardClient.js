export async function cargarDemoDashboard(email) {
  if (!email) return null
  const query = new URLSearchParams({ email })
  const res = await fetch(`/api/demo/dashboard?${query.toString()}`)
  if (!res.ok) return null
  return res.json()
}
