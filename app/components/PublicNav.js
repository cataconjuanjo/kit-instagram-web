import Link from 'next/link'

const labels = {
  home: 'Consultoría',
  catas: 'Catas',
  carta: 'Carta Viva',
}

export default function PublicNav({ active = 'home', eyebrow = 'Consultoría de vino hospitality' }) {
  return (
    <nav className="topbar">
      <Link href="/cartavinos" className="brand brand-logo">
        <img src="/brand/carta-viva/logo-horizontal.png" alt="Carta Viva" />
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
