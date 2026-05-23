'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SommelierRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/admin/consultoria')
  }, [router])
  return null
}
