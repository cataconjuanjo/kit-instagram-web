'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, clearDemoEmail, getEffectiveRestaurantEmail } from '../demo'
import { nombrePlan, puedeUsar } from '../lib/plans'
import UsageTracker from './UsageTracker'
import styles from './layout.module.css'
import OpenCartaPruebaButton from './OpenCartaPruebaButton'

const icon = {
  home: <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16}><path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3h2v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z"/></svg>,
  wine: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><path d="M8 3h8l1 9a5 5 0 0 1-10 0L8 3z"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>,
  bodega: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><path d="M4 20h16"/><path d="M6 20V7l6-3 6 3v13"/><path d="M9 20v-6h6v6"/><path d="M8 10h2M14 10h2"/></svg>,
  sala: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><path d="M8 3h8"/><path d="M9 3v5a3 3 0 0 1-6 0V3h6Z"/><path d="M15 3v18"/><path d="M19 8v13"/><path d="M5 21h14"/></svg>,
  ajustes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname()
  const [restaurante, setRestaurante] = useState(null)
  const [vinoCount, setVinoCount] = useState(0)
  const [platoCount, setPlatoCount] = useState(0)
  const [propuestasCount, setPropuestasCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) return
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (!rest) return
      setRestaurante(rest)
      const [{ count: vinos }, { count: platos }, { count: propuestas }] = await Promise.all([
        supabase.from('vinos').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).eq('activo', true),
        supabase.from('platos').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).eq('activo', true),
        supabase.from('consultor_propuestas').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).neq('estado', 'descartada').neq('estado', 'incorporada'),
      ])
      setVinoCount(vinos || 0)
      setPlatoCount(platos || 0)
      setPropuestasCount(propuestas || 0)
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

  const inicialesRestaurante = (restaurante?.nombre || 'CV')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(palabra => palabra[0])
    .join('')
    .toUpperCase()

  const planVisible = restaurante ? nombrePlan(restaurante) : ''

  const navItems = [
    { href: '/dashboard', label: 'Inicio', exact: true, icon: icon.home },
    {
      href: '/dashboard/carta',
      label: 'Carta',
      icon: icon.wine,
      stat: vinoCount + platoCount || null,
      children: [
        { href: '/dashboard/vinos', label: 'Vinos', stat: vinoCount || null },
        { href: '/dashboard/platos', label: 'Platos', stat: platoCount || null },
        { href: '/dashboard/seleccion', label: 'Sugerencia' },
      ],
    },
    {
      href: '/dashboard/sala',
      label: 'Sala',
      icon: icon.sala,
      feature: 'modo_camarero',
      children: [
        { href: '/dashboard/cierre', label: 'Cierre servicio', feature: 'cierre_servicio' },
        { href: '/dashboard/estadisticas', label: 'Actividad', feature: 'estadisticas' },
        { href: '/dashboard/menu-engineering', label: 'Rentabilidad', feature: 'estadisticas' },
      ],
    },
    {
      href: propuestasCount > 0 ? '/dashboard/bodega#propuestas' : '/dashboard/bodega',
      label: 'Bodega',
      icon: icon.bodega,
      feature: 'bodega',
      alert: propuestasCount || null,
      children: [
        { href: '/dashboard/inventario', label: 'Inventario', feature: 'inventario' },
      ],
    },
    {
      href: '/dashboard/ajustes',
      label: 'Ajustes',
      icon: icon.ajustes,
      children: [
        { href: '/dashboard/qr', label: 'QR y accesos' },
        { href: '/dashboard/personalizar', label: 'Diseño y marca' },
      ],
    },
  ].filter(item => !item.feature || puedeUsar(restaurante, item.feature))
    .map(item => ({
      ...item,
      children: item.children?.filter(child => !child.feature || puedeUsar(restaurante, child.feature)),
    }))

  return (
    <div className={styles.shell}>
      {restaurante && <UsageTracker restauranteId={restaurante.id} />}
      <nav className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <div className={styles.brandIdentity}>
            {restaurante?.logo_url ? (
              <img className={styles.brandLogo} src={restaurante.logo_url} alt={restaurante.nombre || 'Logo restaurante'} />
            ) : (
              <span className={styles.brandLogoFallback}>{inicialesRestaurante}</span>
            )}
            <div className={styles.brandText}>
              <p className={styles.brandLabel}>Panel restaurante</p>
              <p className={styles.brandName}>{restaurante?.nombre || '-'}</p>
              {restaurante?.ciudad && <p className={styles.brandCity}>{restaurante.ciudad}</p>}
            </div>
          </div>
          {restaurante && <p className={styles.brandPlan}>{planVisible}</p>}
        </div>

        <ul className={styles.nav}>
          {navItems.map(item => {
            const active = isActive(item.href, item.exact) || item.children?.some(child => isActive(child.href))
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.navLink} ${active ? styles.navActive : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.alert != null && <span className={styles.navAlert}>{item.alert}</span>}
                  {item.stat != null && <span className={styles.navStat}>{item.stat}</span>}
                </Link>
                {active && item.children?.length > 0 && (
                  <div className={styles.subnav}>
                    {item.children.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`${styles.subnavLink} ${isActive(child.href, child.exact) ? styles.subnavActive : ''}`}
                        onClick={() => setMenuOpen(false)}
                      >
                        <span>{child.label}</span>
                        {child.stat != null && <span className={styles.navStat}>{child.stat}</span>}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className={styles.sidebarFooter}>
          <div className={styles.footerLinks}>
            <OpenCartaPruebaButton restauranteId={restaurante?.id} className={styles.footerLink}>
              Probar carta
            </OpenCartaPruebaButton>
            {puedeUsar(restaurante, 'modo_camarero') && (
              <a href={restaurante?.slug ? `/camarero/${restaurante.slug}` : '#'} target="_blank" rel="noreferrer" className={styles.footerLink}>
                Modo camarero
              </a>
            )}
            <Link href="/dashboard/sugerencias" className={styles.footerLink}>
              Enviar sugerencia
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
          <p className={styles.mobileName}>{restaurante?.nombre || '-'}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
