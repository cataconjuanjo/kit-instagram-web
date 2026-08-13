'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DEFAULT_WINE_ECONOMICS } from './wineEconomics'

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

export const ECONOMIC_DEFAULTS = {
  iva_venta_pct: DEFAULT_WINE_ECONOMICS.ivaVentaPct,
  pvp_incluye_iva: DEFAULT_WINE_ECONOMICS.pvpIncluyeIva,
  coste_incluye_iva: DEFAULT_WINE_ECONOMICS.costeIncluyeIva,
  copas_por_botella: DEFAULT_WINE_ECONOMICS.copasPorBotella,
  merma_copa_pct: DEFAULT_WINE_ECONOMICS.mermaCopaPct,
  formato_botella_ml: 750,
  margen_objetivo_botella_pct: DEFAULT_WINE_ECONOMICS.margenObjetivoBotellaPct,
  margen_objetivo_copa_pct: DEFAULT_WINE_ECONOMICS.margenObjetivoCopaPct,
  precio_minimo_copa: DEFAULT_WINE_ECONOMICS.precioMinimoCopa,
}

/**
 * Fuente única de ajustes económicos del restaurante.
 *
 * Flujo al montar:
 * 1. GET /api/economic-traceability
 * 2. Si hay precios_margenes_{id} en localStorage Y la API no tiene ajuste propio:
 *    PATCH con esos valores (migración de datos) y limpia la key vieja.
 * 3. Si la API devuelve 409 (migración pendiente): usa ECONOMIC_DEFAULTS +
 *    localStorage como fallback silencioso.
 *
 * La función guardarAjustes actualiza el estado local de forma optimista antes
 * de confirmar con la API, para que la UI reaccione sin esperar la red.
 */
export function useEconomicSettings(restauranteId) {
  const [settings, setSettings] = useState(ECONOMIC_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [apiDisponible, setApiDisponible] = useState(false)

  useEffect(() => {
    if (!restauranteId) return
    setLoading(true)

    async function cargar() {
      const token = await tokenSesion()
      if (!token) { setLoading(false); return }

      const LS_KEY = `precios_margenes_${restauranteId}`
      let localData = null
      try {
        const raw = window.localStorage.getItem(LS_KEY)
        if (raw) localData = JSON.parse(raw)
      } catch {}

      try {
        const res = await fetch(`/api/economic-traceability?restaurante_id=${restauranteId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.status === 409) {
          setApiDisponible(false)
          if (localData) {
            setSettings(prev => ({
              ...prev,
              ...(localData.margen ? { margen_objetivo_botella_pct: Number(localData.margen) } : {}),
              ...(localData.copas ? { copas_por_botella: Number(localData.copas) } : {}),
            }))
          }
          setLoading(false)
          return
        }

        if (!res.ok) {
          setApiDisponible(false)
          setLoading(false)
          return
        }

        const data = await res.json()
        const apiSettings = { ...ECONOMIC_DEFAULTS, ...(data.settings || {}) }
        setApiDisponible(true)

        const apiTieneAjuste = data.settings?.margen_objetivo_botella_pct != null
          || data.settings?.copas_por_botella != null

        if (localData && !apiTieneAjuste) {
          // Migración: localStorage → API (una sola vez)
          const settingsMigrados = {
            ...apiSettings,
            ...(localData.margen ? { margen_objetivo_botella_pct: Number(localData.margen) } : {}),
            ...(localData.copas ? { copas_por_botella: Number(localData.copas) } : {}),
          }
          try {
            const patchRes = await fetch('/api/economic-traceability', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ restaurante_id: restauranteId, settings: settingsMigrados }),
            })
            const patchData = await patchRes.json()
            setSettings({ ...ECONOMIC_DEFAULTS, ...(patchRes.ok ? patchData.settings : settingsMigrados) })
          } catch {
            setSettings(apiSettings)
          }
          window.localStorage.removeItem(LS_KEY)
        } else {
          if (localData) window.localStorage.removeItem(LS_KEY)
          setSettings(apiSettings)
        }
      } catch {
        setApiDisponible(false)
        if (localData) {
          setSettings(prev => ({
            ...prev,
            ...(localData.margen ? { margen_objetivo_botella_pct: Number(localData.margen) } : {}),
            ...(localData.copas ? { copas_por_botella: Number(localData.copas) } : {}),
          }))
        }
      }

      setLoading(false)
    }

    cargar()
  }, [restauranteId])

  const guardarAjustes = useCallback(async (nuevoSettings) => {
    if (!restauranteId) return { ok: false, error: 'Sin restaurante' }

    // Actualización optimista: la UI reacciona sin esperar la red
    setSettings(prev => ({ ...prev, ...nuevoSettings }))

    if (!apiDisponible) {
      window.localStorage.setItem(`precios_margenes_${restauranteId}`, JSON.stringify({
        margen: nuevoSettings.margen_objetivo_botella_pct,
        copas: nuevoSettings.copas_por_botella,
      }))
      return { ok: true, fallback: true }
    }

    const token = await tokenSesion()
    if (!token) return { ok: false, error: 'Sin sesión' }

    try {
      const res = await fetch('/api/economic-traceability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restauranteId, settings: nuevoSettings }),
      })
      const data = await res.json()
      if (res.ok) {
        setSettings({ ...ECONOMIC_DEFAULTS, ...(data.settings || nuevoSettings) })
        return { ok: true }
      }
      return { ok: false, error: data.error }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  }, [restauranteId, apiDisponible])

  return { settings, loading, guardarAjustes, apiDisponible }
}
