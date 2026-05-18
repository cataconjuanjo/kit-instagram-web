'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, clearDemoEmail, getEffectiveRestaurantEmail } from '../demo'
import styles from './layout.module.css'

export default function DashboardLayout({ children }) {
  const pathname = usePathname()
  const [restaurante, setRestaurante] = useState(null)
  const [vinoCount, setVinoCount] = useState(0)
  const [platoCount, setPlatoCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) return
      const { data: rest } = await supabase.from('restaurantes').select('id, nombre, ciudad, slug').eq('email', email).single()
      if (!rest) return
      setRestaurante(rest)
      const [{ count: vinos }, { count: platos }] = await Promise.all([
        supabase.from('vinos').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).eq('activo', true),
        supabase.from('platos').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).eq('activo', true),
      ])
      setVinoCount(vinos || 0)
      setPlatoCount(platos || 0)
    }
    cargar()
  }, [])

  async function cerrarSesion() {
    clearAdminRestaurantEmail()
    clearDemoEmail()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  const navItems = [
    {
      href: '/dashboard', label: 'Inicio', exact: true,
      icon: <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16}><path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3h2v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z"/></svg>,
    },
    {
      href: '/dashboard/vinos', label: 'Vinos', stat: vinoCount || null,
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><path d="M8 3h8l1 9a5 5 0 0 1-10 0L8 3z"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>,
    },
    {
      href: '/dashboard/platos', label: 'Platos', stat: platoCount || null,
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><circle cx="12" cy="12" r="9"/><path d="M12 3v9"/><path d="M8 12h8"/></svg>,
    },
    {
      href: '/dashboard/estadisticas', label: 'Estadísticas',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    },
    {
      href: '/dashboard/seleccion', label: 'Selección destacada',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    },
    {
      href: '/dashboard/qr', label: 'QR de sala',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>,
    },
    {
      href: '/dashboard/personalizar', label: 'Diseño y marca',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    },
  ]

  return (
    <div className={styles.shell}>
      <nav className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <p className={styles.brandLabel}>Panel de gestión</p>
          <p className={styles.brandName}>{restaurante?.nombre || '—'}</p>
          {restaurante?.ciudad && <p className={styles.brandCity}>{restaurante.ciudad}</p>}
        </div>

        <ul className={styles.nav}>
          {navItems.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.navLink} ${isActive(item.href, item.exact) ? styles.navActive : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
                {item.stat != null && <span className={styles.navStat}>{item.stat}</span>}
              </Link>
            </li>
          ))}
        </ul>

        <div className={styles.sidebarFooter}>
          <div className={styles.footerLinks}>
            <a
              href={restaurante ? `/carta/${restaurante.slug}` : '#'}
              target="_blank"
              className={styles.footerLink}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width={12} height={12}><path d="M11 3h6v6M17 3l-7 7M9 5H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"/></svg>
              Carta pública
            </a>
            <a
              href={restaurante ? `/camarero/${restaurante.slug}` : '#'}
              target="_blank"
              className={styles.footerLink}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width={12} height={12}><path d="M11 3h6v6M17 3l-7 7M9 5H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"/></svg>
              Modo camarero
            </a>
          </div>
          <button type="button" onClick={cerrarSesion} className={styles.logoutButton}>
            Salir
          </button>
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
          <p className={styles.mobileName}>{restaurante?.nombre || '—'}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
