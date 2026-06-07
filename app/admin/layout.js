'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../supabase'
import styles from './layout.module.css'

export default function AdminLayout({ children }) {
  const [restaurantes, setRestaurantes] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const pathname = usePathname()

  async function cerrarSesion() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email || ''))
    supabase.from('restaurantes').select('id, nombre, ciudad, provincia, subscription_status').order('nombre')
      .then(({ data }) => setRestaurantes(data || []))
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.getElementById('admin-global-search')?.focus()
      }
      if (event.key === 'Escape') {
        setSearch('')
        setProfileOpen(false)
        setNotificationOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const matchRest = pathname.match(/\/admin\/restaurante\/([^/]+)/)
  const currentId = matchRest?.[1]
  const activeRestaurant = restaurantes.find(r => String(r.id) === String(currentId))
  const filteredRestaurants = search.trim()
    ? restaurantes.filter(r => `${r.nombre || ''} ${r.ciudad || ''} ${r.provincia || ''}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : []
  const pendientes = restaurantes.filter(r => r.subscription_status === 'trialing' || r.subscription_status === 'past_due').length
  const breadcrumbs = [
    { label: 'Panel', href: '/admin/consultoria' },
    pathname === '/admin/consultoria' && { label: 'Radar' },
    pathname === '/admin/acciones' && { label: 'Acciones' },
    pathname === '/admin/alertas' && { label: 'Alertas' },
    pathname === '/admin/sugerencias' && { label: 'Buzon sugerencias' },
    pathname === '/admin/proveedores' && { label: 'Proveedores' },
    pathname === '/admin' && { label: 'Restaurantes' },
    activeRestaurant && { label: activeRestaurant.nombre },
  ].filter(Boolean)

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
            <p className={styles.navGroupTitle}><span>🎯</span> Trabajo</p>
            <Link
              href="/admin/consultoria"
              className={`${styles.navLink} ${pathname === '/admin/consultoria' ? styles.navActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Radar global
            </Link>
            <Link
              href="/admin/alertas"
              className={`${styles.navLink} ${pathname === '/admin/alertas' ? styles.navActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Alertas
            </Link>
            <Link
              href="/admin/acciones"
              className={`${styles.navLink} ${pathname === '/admin/acciones' ? styles.navActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Acciones
            </Link>
            <Link
              href="/admin/sugerencias"
              className={`${styles.navLink} ${pathname === '/admin/sugerencias' ? styles.navActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              Buzón sugerencias
            </Link>
          </li>

          <li className={styles.navGroup}>
            <p className={styles.navGroupTitle}><span>🏪</span> Restaurantes</p>
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
            <p className={styles.navGroupTitle}><span>🤝</span> Proveedores</p>
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
          <p className={styles.restLabel}>Restaurantes activos <span>{restaurantes.length}</span></p>
          {restaurantes.map(r => (
            <Link
              key={r.id}
              href={`/admin/restaurante/${r.id}`}
              className={`${styles.restLink} ${currentId === String(r.id) ? styles.restLinkActive : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className={styles.restName}>{r.nombre}</span>
              <span className={styles.restMeta}>
                <span>{r.ciudad || r.provincia || 'Sin ubicacion'}</span>
                <span className={styles.restStatus}>{r.subscription_status || 'activo'}</span>
              </span>
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
        <header className={styles.topbar}>
          <nav className={styles.breadcrumbs} aria-label="Ruta actual">
            {breadcrumbs.map((item, index) => (
              item.href && index < breadcrumbs.length - 1
                ? <Link key={item.label} href={item.href}>{item.label}</Link>
                : <span key={item.label}>{item.label}</span>
            ))}
          </nav>

          <div className={styles.globalSearch}>
            <span aria-hidden="true">⌕</span>
            <input
              id="admin-global-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar restaurante..."
              aria-label="Buscar restaurante"
            />
            <kbd>Ctrl K</kbd>
            {filteredRestaurants.length > 0 && (
              <div className={styles.searchResults}>
                {filteredRestaurants.map(restaurante => (
                  <Link key={restaurante.id} href={`/admin/restaurante/${restaurante.id}`} onClick={() => setSearch('')}>
                    <strong>{restaurante.nombre}</strong>
                    <span>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ') || 'Sin ubicacion'}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className={styles.topActions}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Notificaciones"
              onClick={() => setNotificationOpen(open => !open)}
            >
              🔔
              {pendientes > 0 && <span>{pendientes}</span>}
            </button>
            {notificationOpen && (
              <div className={styles.notificationsDropdown}>
                <strong>Alertas operativas</strong>
                {pendientes === 0 ? (
                  <p>Sin restaurantes con accion pendiente.</p>
                ) : restaurantes
                  .filter(restaurante => restaurante.subscription_status === 'trialing' || restaurante.subscription_status === 'past_due')
                  .slice(0, 6)
                  .map(restaurante => (
                    <Link
                      key={restaurante.id}
                      href={`/admin/restaurante/${restaurante.id}`}
                      onClick={() => setNotificationOpen(false)}
                    >
                      <span>{restaurante.nombre}</span>
                      <small>{restaurante.subscription_status === 'past_due' ? 'Pago pendiente' : 'En prueba'}</small>
                    </Link>
                  ))}
                <Link href="/admin?vista=accesos" onClick={() => setNotificationOpen(false)}>Ver todos los accesos</Link>
              </div>
            )}
            <div className={styles.profileMenu}>
              <button type="button" className={styles.avatarButton} onClick={() => setProfileOpen(open => !open)} aria-label="Abrir perfil">
                {userEmail ? userEmail.slice(0, 1).toUpperCase() : 'U'}
              </button>
              {profileOpen && (
                <div className={styles.profileDropdown}>
                  <strong>{userEmail || 'Consultor'}</strong>
                  <Link href="/admin?vista=accesos" onClick={() => setProfileOpen(false)}>Accesos</Link>
                  <button type="button" onClick={cerrarSesion}>Cerrar sesion</button>
                </div>
              )}
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
