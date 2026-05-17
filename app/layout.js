import './globals.css'

export const metadata = {
  metadataBase: new URL('https://cataconjuanjo.com'),
  title: {
    default: 'Cata con Juanjo · Consultoria de vino para restaurantes',
    template: '%s · Cata con Juanjo',
  },
  description: 'Consultoria de vino para restaurantes, hoteles y hospitality. Cartas rentables, formacion de sala y Carta Viva: carta digital con QR y sommelier IA.',
  openGraph: {
    title: 'Cata con Juanjo · Consultoria de vino hospitality',
    description: 'Cartas de vino con criterio, margen y memoria. Consultoria, formacion y Carta Viva para restaurantes.',
    url: 'https://cataconjuanjo.com',
    siteName: 'Cata con Juanjo',
    locale: 'es_ES',
    type: 'website',
    images: ['/assets/og-image.jpg'],
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
