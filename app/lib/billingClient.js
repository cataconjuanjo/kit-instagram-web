'use client'

import { supabase } from '../supabase'

async function sessionToken() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesion no disponible. Vuelve a iniciar sesion.')
  return token
}

async function postStripe(path, payload) {
  const token = await sessionToken()
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || 'No se pudo conectar con Stripe.')
  }
  if (!data.url) {
    throw new Error('Stripe no devolvio una URL valida.')
  }
  return data.url
}

export async function crearCheckoutStripe({ restauranteId, plan }) {
  return postStripe('/api/stripe/checkout', {
    restaurante_id: restauranteId,
    plan,
  })
}

export async function abrirPortalStripe({ restauranteId }) {
  return postStripe('/api/stripe/portal', {
    restaurante_id: restauranteId,
  })
}
