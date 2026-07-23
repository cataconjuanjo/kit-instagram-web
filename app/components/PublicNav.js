'use client'

import { useState } from 'react'
import Link from 'next/link'
import BrandLogo from './BrandLogo'

const labels = {
  home: 'Consultoría',
  catas: 'Catas',
  carta: 'Carta Viva',
  recursos: 'Recursos',
}

export default function PublicNav({ active = 'home', eyebrow = 'Consultoría de vino hospitality' }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <nav className={`topbar${open ? ' nav-open' : ''}`} aria-label="Navegación principal">
      <Link href="/cartavinos" className="brand brand-logo" onClick={close}>
        <BrandLogo priority />
      </Link>

      <button
        className="nav-hamburger"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        aria-controls="main-nav-links"
        onClick={() => setOpen(o => !o)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className="navlinks" id="main-nav-links" aria-label="Navegación principal">
        <Link className={active === 'home' ? 'active' : ''} href="/" aria-current={active === 'home' ? 'page' : undefined} onClick={close}>{labels.home}</Link>
        <Link className={active === 'catas' ? 'active' : ''} href="/catas" aria-current={active === 'catas' ? 'page' : undefined} onClick={close}>{labels.catas}</Link>
        <Link className={active === 'carta' ? 'active' : ''} href="/cartavinos" aria-current={active === 'carta' ? 'page' : undefined} onClick={close}>{labels.carta}</Link>
        <Link className={active === 'recursos' ? 'active' : ''} href="/recursos" aria-current={active === 'recursos' ? 'page' : undefined} onClick={close}>{labels.recursos}</Link>
        <Link href="/#contacto" onClick={close}>Contacto</Link>
        <Link href="/login" className="nav-cta" title="Zona privada para restaurantes dados de alta" onClick={close}>Acceso clientes</Link>
      </div>
    </nav>
  )
}
