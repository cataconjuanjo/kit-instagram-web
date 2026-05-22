import Link from 'next/link'

const labels = {
  home: 'Consultoría',
  catas: 'Catas',
  carta: 'Carta Viva',
}

export default function PublicNav({ active = 'home', eyebrow = 'Consultoría de vino hospitality' }) {
  return (
    <nav className="topbar">
      <Link href="/" className="brand">
        <span>Cata con Juanjo</span>
        <small>{eyebrow}</small>
      </Link>
      <div className="navlinks" aria-label="Navegación principal">
        <Link className={active === 'home' ? 'active' : ''} href="/">{labels.home}</Link>
        <Link className={active === 'catas' ? 'active' : ''} href="/catas">{labels.catas}</Link>
        <Link className={active === 'carta' ? 'active' : ''} href="/cartavinos">{labels.carta}</Link>
        <Link href="/#contacto">Contacto</Link>
        <Link href="/login" className="nav-cta" title="Zona privada para restaurantes dados de alta">Acceso clientes</Link>
      </div>
    </nav>
  )
}
