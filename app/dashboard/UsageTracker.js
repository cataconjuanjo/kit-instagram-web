'use client'

import { useEffect } from 'react'
import { supabase } from '../supabase'
import { getEffectiveRestaurantEmail } from '../demo'

const PULSE_MS = 60 * 1000

export default function UsageTracker({ restauranteId, onTrialChange }) {
  useEffect(() => {
    let sesionId = ''
    let timer = null
    let cerrado = false

    async function enviar(accion, keepalive = false) {
      if (accion !== 'inicio' && !sesionId) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const res = await fetch('/api/uso', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ accion, sesion_id: sesionId }),
        keepalive,
      })

      if (accion === 'inicio' && res.ok) {
        const data = await res.json()
        sesionId = data.sesion_id || ''
        if (data.trial) onTrialChange?.(data.trial)
        return
      }

      if (res.ok) {
        const data = await res.json()
        if (data.trial) onTrialChange?.(data.trial)
        return
      }

      if (res.status === 402) {
        const data = await res.json().catch(() => null)
        if (data?.trial) onTrialChange?.({ ...data.trial, blocked: true })
      }
    }

    async function iniciar() {
      const { user, isAdmin } = await getEffectiveRestaurantEmail(supabase)
      if (!user || isAdmin || cerrado) return
      await enviar('inicio')
      if (cerrado) return
      timer = window.setInterval(() => {
        if (document.visibilityState === 'visible') enviar('pulso')
      }, PULSE_MS)
    }

    function finalizar() {
      cerrado = true
      if (timer) window.clearInterval(timer)
      if (sesionId) enviar('fin', true)
    }

    iniciar()
    window.addEventListener('pagehide', finalizar)
    return () => {
      window.removeEventListener('pagehide', finalizar)
      finalizar()
    }
  }, [restauranteId, onTrialChange])

  return null
}
