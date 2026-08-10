import Link from 'next/link'

export default function PublicFooter() {
  return (
    <footer className="footer">
      <span>© 2026 Juanjo Garcia · Cata con Juanjo</span>
      <div>
        <Link href="/">Consultoría</Link>
        <Link href="/catas">Catas</Link>
        <Link href="/cartavinos">Carta Viva</Link>
        <Link href="/recursos">Recursos</Link>
        <Link href="/formacion-sala">Formación de sala</Link>
        <Link href="/aviso-legal">Aviso legal</Link>
        <Link href="/privacidad">Privacidad</Link>
        <Link href="/terminos">Terminos</Link>
      </div>
    </footer>
  )
}
