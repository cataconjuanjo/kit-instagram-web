'use client'

import { useEffect, useRef } from 'react'

export default function StepsReveal({ children }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    el.classList.add('steps-js-ready')
    const steps = el.querySelectorAll('.step')

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('step--visible')
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -32px 0px' }
    )

    steps.forEach((step) => obs.observe(step))
    return () => obs.disconnect()
  }, [])

  return <div ref={ref}>{children}</div>
}
