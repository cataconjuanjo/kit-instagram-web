'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../supabase'
import styles from './layout.module.css'

export default function AdminLayout({ children }) {
  const [restaurantes, setRestaurantes] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  async function cerrarSesion() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  useEffect(() => {
    supabase.from('restaurantes').select('id, nombre, ciudad').order('nombre')
      .then(({ data }) => setRestaurantes(data || []))
  }, [])

  const matchRest = pathname.match(/\/admin\/restaurante\/([^/]+)/)
  const currentId = matchRest?.[1]

  return (
    <div className={styles.shell}>
      <nav className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <div className={styles.brandIdentity}>
            <span className={styles.brandMark}>CV</span>
            <div className={styles.brandText}>
              <p className={styles.brandLabel}>Panel consultor</p>
              <p className={styles.brandName}>Carta Viva</p>
            </div>
          </div>
        </div>

        <ul className={styles.nav}>
          <li>
            <Link
              href="/admin/proveedores"
              className={`${styles.navLink} ${pathname === '/admin/proveedores' ? styles.navActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Proveedores
            </Link>
          </li>
        </ul>

        <hr className={styles.divider} />

        <div className={styles.restSection}>
          <p className={styles.restLabel}>Restaurantes</p>
          {restaurantes.map(r => (
            <Link
              key={r.id}
              href={`/admin/restaurante/${r.id}`}
              className={`${styles.restLink} ${currentId === String(r.id) ? styles.restLinkActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className={styles.restName}>{r.nombre}</span>
              {r.ciudad && <span className={styles.restCity}>{r.ciudad}</span>}
            </Link>
          ))}
          {restaurantes.length === 0 && (
            <span className={styles.restEmpty}>Sin restaurantes</span>
          )}
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.footerLinks}>
            <Link
              href="/admin/consultoria"
              className={`${styles.footerLink} ${pathname === '/admin/consultoria' ? styles.footerLinkActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Radar global
            </Link>
            <Link
              href="/admin"
              className={`${styles.footerLink} ${pathname === '/admin' ? styles.footerLinkActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Altas y accesos
            </Link>
          </div>
          <button type="button" onClick={cerrarSesion} className={styles.logoutButton}>Salir</button>
        </div>
      </nav>

      {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} />}

      <div className={styles.main}>
        <div className={styles.mobileBar}>
          <button type="button" className={styles.menuToggle} onClick={() => setMenuOpen(true)}>
            <svg viewBox="0 0 20 20" fill="currentColor" width={18} height={18}>
              <path fillRule="evenodd" d="M3 5h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 4h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 4h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2z" clipRule="evenodd"/>
            </svg>
          </button>
          <p className={styles.mobileName}>Panel consultor</p>
        </div>
        {children}
      </div>
    </div>
  )
}
