'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const LAST_ACTIVITY_KEY = 'carta_viva_private_last_activity'
const FORCED_LOGOUT_KEY = 'carta_viva_private_forced_logout'
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll']

function readLastActivity() {
  try {
    return Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) || 0)
  } catch {
    return 0
  }
}

function writeLastActivity() {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()))
  } catch {}
}

export default function PrivateSessionTimeout({
  timeoutMinutes = 60,
  redirectTo = '/login?session=expired',
}) {
  const loggingOutRef = useRef(false)
  const lastWriteRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const timeoutMs = Math.max(5, Number(timeoutMinutes || 60)) * 60 * 1000
    let intervalId

    async function hasSession() {
      const { data } = await supabase.auth.getSession()
      return Boolean(data?.session?.access_token)
    }

    async function forceLogout() {
      if (loggingOutRef.current) return
      loggingOutRef.current = true
      try {
        window.localStorage.setItem(FORCED_LOGOUT_KEY, String(Date.now()))
        window.localStorage.removeItem(LAST_ACTIVITY_KEY)
        window.localStorage.removeItem('carta_viva_admin_restaurant_email')
        window.localStorage.removeItem('carta_viva_admin_restaurant_id')
      } catch {}
      await supabase.auth.signOut()
      window.location.href = redirectTo
    }

    async function checkExpired() {
      if (!await hasSession()) return
      const lastActivity = readLastActivity()
      if (!lastActivity) {
        writeLastActivity()
        return
      }
      if (Date.now() - lastActivity > timeoutMs) {
        await forceLogout()
      }
    }

    function markActivity() {
      const lastActivity = readLastActivity()
      const now = Date.now()
      if (lastActivity && now - lastActivity > timeoutMs) {
        void forceLogout()
        return
      }
      if (now - lastWriteRef.current < 30_000) return
      lastWriteRef.current = now
      writeLastActivity()
    }

    function checkOnWake() {
      if (document.visibilityState === 'hidden') return
      void checkExpired()
    }

    function syncLogout(event) {
      if (event.key !== FORCED_LOGOUT_KEY || !event.newValue) return
      void forceLogout()
    }

    void checkExpired()
    intervalId = window.setInterval(() => void checkExpired(), 60_000)

    ACTIVITY_EVENTS.forEach(eventName => {
      window.addEventListener(eventName, markActivity, { passive: true })
    })
    window.addEventListener('focus', checkOnWake)
    document.addEventListener('visibilitychange', checkOnWake)
    window.addEventListener('storage', syncLogout)

    return () => {
      window.clearInterval(intervalId)
      ACTIVITY_EVENTS.forEach(eventName => {
        window.removeEventListener(eventName, markActivity)
      })
      window.removeEventListener('focus', checkOnWake)
      document.removeEventListener('visibilitychange', checkOnWake)
      window.removeEventListener('storage', syncLogout)
    }
  }, [redirectTo, timeoutMinutes])

  return null
}
