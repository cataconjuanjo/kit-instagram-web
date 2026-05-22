import './globals.css'
import CookieConsent from './components/CookieConsent'

export const metadata = {
  metadataBase: new URL('https://cataconjuanjo.com'),
  title: {
    default: 'Cata con Juanjo · Consultoría de vino para restaurantes',
    template: '%s · Cata con Juanjo',
  },
  description: 'Consultoría de vino para restaurantes, hoteles y hospitality. Cartas rentables, formación de sala y Carta Viva: carta digital con QR y guía de maridaje.',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
    apple: '/apple-icon.svg',
  },
  openGraph: {
    title: 'Cata con Juanjo · Consultoría de vino hospitality',
    description: 'Cartas de vino con criterio, margen y memoria. Consultoría, formación y Carta Viva para restaurantes.',
    url: 'https://cataconjuanjo.com',
    siteName: 'Cata con Juanjo',
    locale: 'es_ES',
    type: 'website',
    images: [{ url: '/assets/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cata con Juanjo · Consultoría de vino hospitality',
    description: 'Cartas de vino con criterio, margen y memoria. Consultoría, formación y Carta Viva para restaurantes.',
    images: ['/assets/og-image.jpg'],
  },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'Cata con Juanjo',
  description: 'Consultoría de vino para restaurantes, hoteles y hospitality en Málaga.',
  url: 'https://cataconjuanjo.com',
  email: 'cataconjuanjo@gmail.com',
  telephone: '+34601502868',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Málaga',
    addressRegion: 'Andalucía',
    addressCountry: 'ES',
  },
  founder: {
    '@type': 'Person',
    name: 'Juanjo García',
    jobTitle: 'Consultor de vino WSET Level 3',
    sameAs: 'https://instagram.com/cataconjuanjo',
  },
  sameAs: ['https://instagram.com/cataconjuanjo'],
  areaServed: ['Málaga', 'Andalucía', 'España'],
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
        <CookieConsent />
      </body>
    </html>
  )
}
