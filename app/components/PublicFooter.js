import Link from 'next/link'

export default function PublicFooter() {
  return (
    <footer className="footer">
      <span>© 2026 Juanjo Garcia · Cata con Juanjo · Malaga</span>
      <div>
        <Link href="/">Consultoría</Link>
        <Link href="/catas">Catas</Link>
        <Link href="/cartavinos">Carta Viva</Link>
        <Link href="/aviso-legal">Aviso legal</Link>
        <Link href="/privacidad">Privacidad</Link>
      </div>
    </footer>
  )
}
