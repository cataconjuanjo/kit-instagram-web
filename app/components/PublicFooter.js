import Link from 'next/link'

export default function PublicFooter() {
  return (
    <footer className="footer">
      <span>© 2026 Juanjo Garcia · Cata con Juanjo · Málaga</span>
      <div>
        <Link href="/">Consultoría</Link>
        <Link href="/catas">Catas</Link>
        <Link href="/cartavinos">Carta Viva</Link>
        <Link href="/recursos">Recursos</Link>
        <Link href="/formación-sala">Formación de sala</Link>
        <Link href="/aviso-legal">Aviso legal</Link>
        <Link href="/privacidad">Privacidad</Link>
      </div>
    </footer>
  )
}
