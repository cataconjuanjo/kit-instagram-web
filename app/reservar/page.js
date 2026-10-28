import Link from 'next/link'
import DemoBookingSection from '../components/DemoBookingSection'

export const metadata = {
  title: 'Reservar demo',
  description: 'Elige fecha y hora para una demo de 30 minutos de Carta Viva o Kiosko. Agenda propia, sin intermediarios.',
  robots: { index: true, follow: true },
}

export default function ReservarPage() {
  return (
    <main className="reservar-page">
      <header className="reservar-page-header">
        <Link href="/" className="reservar-page-brand">Cata con Juanjo</Link>
        <span className="reservar-page-header-sep" aria-hidden="true">·</span>
        <span className="reservar-page-header-sub">Demo · 30 min</span>
      </header>
      <DemoBookingSection id="reservar" calendarOnly />
    </main>
  )
}
