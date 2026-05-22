'use client'

import Script from 'next/script'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

const GA_ID = 'G-393413201'
const CONSENT_KEY = 'ccj_cookie_consent'
const PRIVATE_PREFIXES = ['/admin', '/dashboard', '/login', '/carta', '/camarero', '/r']

function isPrivateRoute(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export default function CookieConsent() {
  const pathname = usePathname()
  const analyticsEnabledRoute = useMemo(() => !isPrivateRoute(pathname || '/'), [pathname])
  const [consent, setConsent] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const storedConsent = window.localStorage.getItem(CONSENT_KEY)
    window.requestAnimationFrame(() => {
      setConsent(storedConsent)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!analyticsEnabledRoute || consent !== 'accepted' || typeof window.gtag !== 'function') return

    window.gtag('config', GA_ID, {
      page_path: pathname,
      anonymize_ip: true,
    })
  }, [analyticsEnabledRoute, consent, pathname])

  if (!analyticsEnabledRoute || !ready) return null

  const accept = () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted')
    setConsent('accepted')
  }

  const reject = () => {
    window.localStorage.setItem(CONSENT_KEY, 'rejected')
    setConsent('rejected')
  }

  return (
    <>
      {consent === 'accepted' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ccj-google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {!consent && (
        <section className="cookie-consent" aria-label="Aviso de cookies">
          <p>
            Usamos Google Analytics para medir visitas y mejorar la web. Puedes aceptar o rechazar las cookies
            analíticas. Las zonas privadas de Carta Viva no usan esta medición.
          </p>
          <div className="cookie-consent__actions">
            <button type="button" className="cookie-consent__secondary" onClick={reject}>
              Rechazar
            </button>
            <button type="button" className="cookie-consent__primary" onClick={accept}>
              Aceptar
            </button>
          </div>
        </section>
      )}
    </>
  )
}
