import './globals.css'
import CookieConsent from './components/CookieConsent'

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata = {
  metadataBase: new URL('https://cataconjuanjo.com'),
  applicationName: 'Carta Viva',
  manifest: '/manifest.webmanifest',
  title: {
    default: 'Cata con Juanjo · Consultoría de vino para restaurantes',
    template: '%s · Cata con Juanjo',
  },
  description: 'Consultoría de vino para restaurantes, hoteles y hospitality. Cartas rentables, formación de sala y Carta Viva: carta digital con QR y guía de maridaje.',
  appleWebApp: {
    capable: true,
    title: 'Carta Viva',
    statusBarStyle: 'black',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/brand/carta-viva/icons/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/carta-viva/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/carta-viva/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/brand/carta-viva/icons/favicon.svg',
    apple: [
      { url: '/brand/carta-viva/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Cata con Juanjo · Consultoría de vino hospitality',
    description: 'Cartas de vino con criterio, margen y memoria. Consultoría, formación y Carta Viva para restaurantes.',
    url: 'https://cataconjuanjo.com',
    siteName: 'Cata con Juanjo',
    locale: 'es_ES',
    type: 'website',
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cata con Juanjo · Consultoría de vino hospitality',
    description: 'Cartas de vino con criterio, margen y memoria. Consultoría, formación y Carta Viva para restaurantes.',
    images: ['/assets/og-carta-viva-2026.jpg'],
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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
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
