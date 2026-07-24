export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata = {
  title: 'Kiosko de Vinos',
  robots: { index: false, follow: false },
}

export default function KioskoLayout({ children }) {
  return children
}
