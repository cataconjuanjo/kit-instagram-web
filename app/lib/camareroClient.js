export async function solicitarSesionCamarero({ restauranteId, pin, demo = false }) {
  const res = await fetch('/api/camarero/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurante_id: restauranteId, pin, demo }),
  })
  const data = res.ok ? await res.json() : null
  return { res, data }
}

export async function cargarDatosCamarero({ restauranteId, salaToken }) {
  const res = await fetch('/api/camarero/datos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurante_id: restauranteId, sala_token: salaToken }),
  })
  if (!res.ok) throw new Error(`POST camarero datos ${res.status}`)
  return res.json()
}

function parsearDetalleEstadistica(item) {
  try { return JSON.parse(item.detalle || '{}') } catch { return null }
}

export async function cargarHistorialCamarero({ restauranteId, salaToken }) {
  const query = new URLSearchParams({ restaurante_id: restauranteId })
  const res = await fetch(`/api/estadisticas?${query.toString()}`, {
    headers: { Authorization: `Bearer ${salaToken}` },
  })
  if (!res.ok) throw new Error(`GET historial sala ${res.status}`)
  const data = await res.json()
  return {
    ventas: (data.ventas || []).map(parsearDetalleEstadistica).filter(Boolean),
    recomendaciones: (data.recomendaciones || []).map(parsearDetalleEstadistica).filter(Boolean),
  }
}
