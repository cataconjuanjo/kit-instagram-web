import styles from './layout.module.css'

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
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kiosko de Vinos',
  },
}

export default function KioskoLayout({ children }) {
  return (
    <div className={styles.shell}>
      <div className={styles.frame}>
        {children}
      </div>
    </div>
  )
}
