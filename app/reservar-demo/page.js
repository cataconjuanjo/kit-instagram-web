import DemoBookingSection from '../components/DemoBookingSection'
import PublicFooter from '../components/PublicFooter'
import PublicNav from '../components/PublicNav'

export const metadata = {
  title: 'Reservar demo',
  description: 'Elige un hueco para una demo online de Carta Viva con Juanjo Garcia.',
  alternates: {
    canonical: '/reservar-demo',
  },
  openGraph: {
    title: 'Reservar demo de Carta Viva',
    description: 'Agenda 30 minutos para ver Carta Viva Restaurantes, Carta Viva Sumiller o Kiosko.',
    url: 'https://cataconjuanjo.com/reservar-demo',
    images: [{ url: '/assets/og-carta-viva-2026.jpg', width: 1200, height: 630 }],
  },
}

export default function ReservarDemoPage() {
  return (
    <main className="site-shell reservation-page">
      <PublicNav />
      <section className="reservation-hero">
        <div>
          <p className="eyebrow">Agenda directa</p>
          <h1>Reserva tu demo de Carta Viva.</h1>
        </div>
        <p>
          Elige un hueco de 30 minutos. Te llegara la confirmacion por email con un archivo de calendario para guardarlo en iPhone, Google Calendar u Outlook.
        </p>
      </section>
      <DemoBookingSection id="reservar" calendarOnly />
      <PublicFooter />
    </main>
  )
}
