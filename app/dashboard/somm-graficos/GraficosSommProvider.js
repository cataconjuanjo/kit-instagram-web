'use client'

/**
 * GraficosSommProvider — fetch único por (restauranteId, anio) hacia
 * /api/graficos-somm. Expone hook useGraficosSomm({ restauranteId, anio }).
 *
 * Nota: NO consulta Supabase directamente desde el navegador porque RLS
 * puede devolver vacío a admin viewers. Siempre pasa por /api con
 * requireRestaurantAccess (ver app/api/graficos-somm/route.js).
 */

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

export function useGraficosSomm({ restauranteId, anio, enabled = true }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!enabled || !restauranteId || !anio) { setData(null); return }
    let cancelled = false
    async function cargar() {
      setLoading(true); setError(null)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token  = session?.access_token
        const params = new URLSearchParams({ restaurante_id: restauranteId, anio: String(anio) })
        const res = await fetch(`/api/graficos-somm?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(json.error || 'Error al cargar gráficos')
        setData(json)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    cargar()
    return () => { cancelled = true }
  }, [restauranteId, anio, enabled])

  return { data, loading, error }
}
