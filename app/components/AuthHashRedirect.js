'use client'

import { useEffect } from 'react'

export default function AuthHashRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash || ''
    if (!hash.includes('access_token') && !hash.includes('refresh_token')) return
    window.location.replace(`/bienvenida${hash}`)
  }, [])

  return null
}
