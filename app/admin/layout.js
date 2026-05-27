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
          <li className={styles.navGroup}>
            <p className={styles.navGroupTitle}>Trabajo</p>
            <Link
              href="/admin/consultoria"
              className={`${styles.navLink} ${pathname === '/admin/consultoria' ? styles.navActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Radar global
            </Link>
          </li>

          <li className={styles.navGroup}>
            <p className={styles.navGroupTitle}>Restaurantes</p>
            <div className={styles.subnavAdmin}>
              <Link
                href="/admin?vista=altas"
                className={styles.subnavAdminLink}
                onClick={() => setMenuOpen(false)}
              >
                Altas
              </Link>
              <Link
                href="/admin?vista=accesos"
                className={styles.subnavAdminLink}
                onClick={() => setMenuOpen(false)}
              >
                Accesos
              </Link>
            </div>
          </li>

          <li className={styles.navGroup}>
            <p className={styles.navGroupTitle}>Proveedores</p>
            <div
              className={`${styles.navLink} ${pathname === '/admin/proveedores' ? styles.navActive : ''}`}
            >
              Proveedores
            </div>
            <div className={styles.subnavAdmin}>
              <Link
                href="/admin/proveedores?vista=gestion"
                className={styles.subnavAdminLink}
                onClick={() => setMenuOpen(false)}
              >
                Fichas e importacion
              </Link>
              <Link
                href="/admin/proveedores?vista=catalogo"
                className={styles.subnavAdminLink}
                onClick={() => setMenuOpen(false)}
              >
                Catalogo comun
              </Link>
            </div>
          </li>
        </ul>

        <hr className={styles.divider} />

        <div className={styles.restSection}>
          <p className={styles.restLabel}>Restaurantes activos</p>
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
