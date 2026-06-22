'use client'

import { useState } from 'react'
import { supabase } from '../supabase'

export default function OpenCartaPruebaButton({ restauranteId, className = '', children = 'Probar carta' }) {
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState('')

  async function abrir() {
    if (!restauranteId || abriendo) return
    setError('')
    const nuevaVentana = window.open('about:blank', '_blank')
    if (nuevaVentana) nuevaVentana.opener = null
    setAbriendo(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/prueba-carta', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ restaurante_id: restauranteId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'No se pudo abrir la carta.')
      if (nuevaVentana) nuevaVentana.location.href = body.url
      else window.open(body.url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      nuevaVentana?.close()
      setError(error.message || 'No se pudo abrir la carta.')
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={abrir} disabled={!restauranteId || abriendo}>
        {abriendo ? 'Abriendo...' : children}
      </button>
      {error && (
        <span role="alert" style={{ color: '#a33b3b', fontSize: 12, lineHeight: 1.35 }}>
          {error}
        </span>
      )}
    </>
  )
}
