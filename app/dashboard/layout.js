'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, clearDemoEmail, getEffectiveRestaurantEmail } from '../demo'
import { esPerfilBodega, nombrePlan, puedeUsar } from '../lib/plans'
import UsageTracker from './UsageTracker'
import styles from './layout.module.css'
import OpenCartaPruebaButton from './OpenCartaPruebaButton'
import { GuideModeProvider, GuidePanel, GuideToggle } from './GuideMode'

const icon = {
  home: <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16}><path d="M10.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L4 10.414V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-3h2v3a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-6.586l.293.293a1 1 0 0 0 1.414-1.414l-7-7z"/></svg>,
  wine: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><path d="M8 3h8l1 9a5 5 0 0 1-10 0L8 3z"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/></svg>,
  bodega: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><path d="M4 20h16"/><path d="M6 20V7l6-3 6 3v13"/><path d="M9 20v-6h6v6"/><path d="M8 10h2M14 10h2"/></svg>,
  sala: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><path d="M8 3h8"/><path d="M9 3v5a3 3 0 0 1-6 0V3h6Z"/><path d="M15 3v18"/><path d="M19 8v13"/><path d="M5 21h14"/></svg>,
  ajustes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={16} height={16}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
}

function formatoTrial(segundos) {
  if (segundos == null) return ''
  const totalMinutos = Math.max(0, Math.ceil(Number(segundos || 0) / 60))
  const horas = Math.floor(totalMinutos / 60)
  const minutos = totalMinutos % 60
  if (!horas) return `${minutos} min`
  return minutos ? `${horas} h ${minutos} min` : `${horas} h`
}

function fechaTrial(fecha) {
  if (!fecha) return ''
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(fecha))
}

function TrialUsageNotice({ trial }) {
  if (!trial?.enabled) return null

  const remaining = trial.remaining_seconds
  const low = remaining != null && remaining <= 60 * 60
  const exhausted = trial.expired || trial.blocked
  const reasonText = trial.reason === 'date_limit'
    ? 'La fecha de prueba ha vencido.'
    : trial.reason === 'usage_limit'
      ? 'Se han consumido las horas incluidas.'
      : ''

  return (
    <div style={{
      margin: '0 0 16px',
      padding: '12px 16px',
      border: exhausted ? '1px solid #e0b4aa' : low ? '1px solid #d8c18b' : '1px solid #e8e3d8',
      background: exhausted ? '#fff4f1' : low ? '#fff9e8' : '#fbfaf6',
      color: '#2a2723',
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap',
      fontSize: 13,
    }}>
      <span>
        <strong>{exhausted ? 'Prueba finalizada' : 'Prueba por horas reales'}</strong>
        {' · '}
        {remaining != null ? `${formatoTrial(remaining)} restantes` : 'Sin limite de horas'}
        {trial.expires_at ? ` · disponible hasta ${fechaTrial(trial.expires_at)}` : ''}
      </span>
      {reasonText && <span>{reasonText}</span>}
    </div>
  )
}

function TrialExpiredScreen({ trial, onLogout }) {
  return (
    <main style={{ padding: '56px 24px', minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <section style={{ maxWidth: 560, border: '1px solid #eee', padding: 28, background: '#fff' }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999' }}>Prueba finalizada</p>
        <h1 style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 400, color: '#111' }}>Has consumido la prueba de Carta Viva</h1>
        <p style={{ margin: '0 0 18px', color: '#666', lineHeight: 1.6 }}>
          {trial?.reason === 'date_limit'
            ? 'La ventana de calendario de la prueba ha vencido.'
            : 'Se han consumido las horas reales incluidas en la prueba.'}
          {' '}Para continuar, contacta con Carta Viva y activamos el acceso definitivo.
        </p>
        <button type="button" onClick={onLogout} style={{ border: 'none', background: '#111', color: '#fff', padding: '12px 18px', cursor: 'pointer' }}>
          Salir
        </button>
      </section>
    </main>
  )
}

function PendingStripeScreen({ restaurante, onLogout }) {
  return (
    <main style={{ padding: '56px 24px', minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <section style={{ maxWidth: 560, border: '1px solid #eee', padding: 28, background: '#fff' }}>
        <p style={{ margin: '0 0 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#999' }}>Prueba pendiente</p>
        <h1 style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 400, color: '#111' }}>Activa la prueba gratuita de Carta Viva</h1>
        <p style={{ margin: '0 0 18px', color: '#666', lineHeight: 1.6 }}>
          El acceso de {restaurante?.nombre || 'tu restaurante'} esta preparado. Para abrir la prueba gratuita, completa primero el enlace de Stripe que te hemos enviado.
          No se cobra nada durante el periodo de prueba y puedes cancelar antes de que empiece el cobro.
        </p>
        <button type="button" onClick={onLogout} style={{ border: 'none', background: '#111', color: '#fff', padding: '12px 18px', cursor: 'pointer' }}>
          Salir
        </button>
      </section>
    </main>
  )
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [restaurante, setRestaurante] = useState(null)
  const [vinoCount, setVinoCount] = useState(0)
  const [platoCount, setPlatoCount] = useState(0)
  const [propuestasCount, setPropuestasCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchItems, setSearchItems] = useState([])
  const [clock, setClock] = useState('')
  const [darkMode, setDarkMode] = useState(() => (
    typeof window !== 'undefined' && window.localStorage.getItem('dashboard_dark_mode') === '1'
  ))
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [shortcutMessage, setShortcutMessage] = useState('')
  const [trialInfo, setTrialInfo] = useState(null)
  const [isAdminSession, setIsAdminSession] = useState(false)
  const [demoPresentacion] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo_presentacion') === '1'
  ))
  const [demoSumiller] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo_sumiller') === '1'
  ))
  const perfilBodega = esPerfilBodega(restaurante)

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId, isAdmin } = await getEffectiveRestaurantEmail(supabase)
      setIsAdminSession(Boolean(isAdmin))
      if (!email && !restauranteId) return
      const queryRestaurante = supabase.from('restaurantes').select('*')
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      if (!rest) return
      setRestaurante(rest)
      try {
        const cachedSearch = JSON.parse(window.localStorage.getItem(`dashboard_search_cache_${rest.id}`) || '[]')
        if (Array.isArray(cachedSearch) && cachedSearch.length) setSearchItems(cachedSearch)
      } catch {}
      const [{ count: vinos }, { count: platos }, { count: propuestas }, { data: vinosSearch }, { data: platosSearch }] = await Promise.all([
        supabase.from('vinos').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).eq('activo', true),
        supabase.from('platos').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).eq('activo', true),
        supabase.from('consultor_propuestas').select('id', { count: 'exact', head: true }).eq('restaurante_id', rest.id).neq('estado', 'descartada').neq('estado', 'incorporada'),
        supabase.from('vinos').select('id, nombre, bodega, region').eq('restaurante_id', rest.id).eq('activo', true).limit(80),
        supabase.from('platos').select('id, nombre, categoria').eq('restaurante_id', rest.id).eq('activo', true).limit(80),
      ])
      setVinoCount(vinos || 0)
      setPlatoCount(platos || 0)
      setPropuestasCount(propuestas || 0)
      const nextSearchItems = [
        ...(vinosSearch || []).map(item => ({ ...item, tipo: 'Vino', href: '/dashboard/vinos', meta: [item.bodega, item.region].filter(Boolean).join(' · ') })),
        ...(esPerfilBodega(rest) ? [] : (platosSearch || []).map(item => ({ ...item, tipo: 'Plato', href: '/dashboard/platos', meta: item.categoria || '' }))),
      ]
      setSearchItems(nextSearchItems)
      window.localStorage.setItem(`dashboard_search_cache_${rest.id}`, JSON.stringify(nextSearchItems))
    }
    cargar()
  }, [])

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        setTimeout(() => document.getElementById('dashboard-global-search')?.focus(), 20)
        return
      }
      if ((event.ctrlKey || event.metaKey) && ['1', '2', '3', '4', '5'].includes(event.key)) {
        event.preventDefault()
        const routes = perfilBodega
          ? ['/dashboard', '/dashboard/vinos', '/dashboard/bodega', '/dashboard/catalogo', '/dashboard/ajustes']
          : ['/dashboard', '/dashboard/carta', '/dashboard/sala', '/dashboard/bodega', '/dashboard/ajustes']
        router.push(routes[Number(event.key) - 1])
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        if (pathname.includes('/platos')) router.push('/dashboard/platos?new=1')
        else router.push('/dashboard/vinos?new=1')
        setShortcutMessage(pathname.includes('/platos') ? 'Nuevo plato' : 'Nuevo vino')
        setTimeout(() => setShortcutMessage(''), 1500)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        const editButton = document.querySelector('[data-shortcut-edit], button[aria-label*="Editar"]')
        editButton?.focus()
        setShortcutMessage(editButton ? 'Elemento editable enfocado' : 'No hay elemento para editar')
        setTimeout(() => setShortcutMessage(''), 1500)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        const saveButton = document.querySelector('[data-shortcut-save], button[type="submit"]')
        saveButton?.click()
        setShortcutMessage(saveButton ? 'Guardando cambios' : 'No hay cambios para guardar')
        setTimeout(() => setShortcutMessage(''), 1500)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        const undoButton = document.querySelector('[data-shortcut-undo]')
        if (undoButton) {
          event.preventDefault()
          undoButton.click()
          setShortcutMessage('Ultimo cambio deshecho')
          setTimeout(() => setShortcutMessage(''), 1500)
        }
        return
      }
      if (!event.ctrlKey && !event.metaKey && event.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setProfileOpen(false)
        setShortcutsOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pathname, router, perfilBodega])

  function toggleDarkMode() {
    setDarkMode(value => {
      const next = !value
      window.localStorage.setItem('dashboard_dark_mode', next ? '1' : '0')
      return next
    })
  }

  async function cerrarSesion() {
    clearAdminRestaurantEmail()
    clearDemoEmail()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const isActive = (href, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  const planVisible = restaurante ? nombrePlan(restaurante) : ''

  const navItems = [
    { href: '/dashboard', label: 'Inicio', hint: 'Prioridad y puesta en marcha', exact: true, icon: icon.home },
    {
      href: perfilBodega ? '/dashboard/vinos' : '/dashboard/carta',
      label: perfilBodega ? 'Referencias' : 'Carta pública',
      hint: perfilBodega ? 'Vinos, costes y fichas' : 'Vinos, platos y QR',
      icon: icon.wine,
      feature: perfilBodega ? 'bodega' : 'carta_qr',
      stat: perfilBodega ? (vinoCount || null) : (vinoCount + platoCount || null),
      children: perfilBodega
        ? [
            { href: '/dashboard/vinos', label: 'Vinos', hint: 'Fichas, precios y stock', stat: vinoCount || null, feature: 'bodega' },
          ]
        : [
            { href: '/dashboard/vinos', label: 'Vinos', hint: 'Precios y perfiles', stat: vinoCount || null },
            { href: '/dashboard/platos', label: 'Platos', hint: 'Pistas para maridar', stat: platoCount || null },
          ],
    },
    {
      href: '/dashboard/sala',
      label: 'Sala',
      hint: 'Servicio y cierre',
      icon: icon.sala,
      feature: 'modo_camarero',
      children: [
        { href: '/dashboard/cierre', label: 'Cierre del turno', hint: 'Ventas e incidencias', feature: 'cierre_servicio' },
        { href: '/dashboard/estadisticas', label: 'Actividad de sala', hint: 'Escaneos y consultas', feature: 'estadisticas' },
        { href: '/dashboard/tpv', label: 'Importar TPV', hint: 'Ventas reales CSV', feature: 'tpv_import' },
        { href: '/dashboard/menu-engineering', label: 'Rentabilidad', hint: 'Qué empujar o revisar', feature: 'estadisticas' },
      ],
    },
    {
      href: propuestasCount > 0 ? '/dashboard/bodega#propuestas' : '/dashboard/bodega',
      label: 'Bodega',
      hint: perfilBodega ? 'Stock, compras y mapa' : 'Stock, pedidos y margen',
      icon: icon.bodega,
      feature: 'bodega',
      alert: propuestasCount || null,
      children: [
        { href: '/dashboard/bodega', label: 'Stock y pedido', hint: 'Compra sugerida', feature: 'bodega' },
        ...(perfilBodega ? [
          { href: '/dashboard/menu-engineering', label: 'Estrellas y joyas', hint: 'Salida, margen y capital', feature: 'estadisticas' },
          { href: '/dashboard/menu-engineering#winemapping', label: 'Wine mapping', hint: 'Gamas por ticket medio', feature: 'estadisticas' },
          { href: '/dashboard/catalogo', label: 'Catalogo distribuidores', hint: 'Tarifas y altas', feature: 'bodega' },
          { href: '/dashboard/constructor', label: 'Constructor de carta', hint: 'Ordenar y exportar', feature: 'bodega' },
        ] : []),
        { href: '/dashboard/precios', label: 'Márgenes', hint: 'Precio y coste', feature: 'precios_margenes' },
        { href: '/dashboard/simulador', label: 'Simulador de rentabilidad', hint: 'Copa, margen y escenarios', feature: 'precios_margenes' },
        { href: '/dashboard/trazabilidad', label: 'Trazabilidad', hint: 'Fuentes y formulas', feature: 'precios_margenes' },
        { href: '/dashboard/bodega#propuestas', label: 'Propuestas', hint: 'Ideas por decidir', feature: 'bodega', alert: propuestasCount || null },
        { href: '/dashboard/bodega#movimientos', label: 'Movimientos', hint: 'Historial de stock', feature: 'bodega' },
        { href: '/dashboard/inventario', label: 'Inventario físico', hint: 'Conteo real', feature: 'inventario' },
      ],
    },
    {
      href: '/dashboard/ajustes',
      label: 'Ajustes',
      hint: perfilBodega ? 'Cuenta y accesos' : 'QR, marca y accesos',
      icon: icon.ajustes,
      children: perfilBodega
        ? []
        : [
            { href: '/dashboard/qr', label: 'QR y accesos', hint: 'Mesa y camarero' },
            { href: '/dashboard/personalizar', label: 'Diseño de carta', hint: 'Logo y colores' },
          ],
    },
  ].filter(item => !item.feature || puedeUsar(restaurante, item.feature))
    .map(item => ({
      ...item,
      children: item.children?.filter(child => !child.feature || puedeUsar(restaurante, child.feature)),
    }))

  const filteredSearch = query.trim()
    ? searchItems.filter(item => `${item.nombre || ''} ${item.meta || ''} ${item.tipo}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []
  const turnoAbierto = Boolean(restaurante?.actividad_real_desde)
  const pinActivo = Boolean(restaurante?.camarero_pin_bloqueo_activo)
  const entidadNombre = restaurante?.nombre || (perfilBodega ? 'Bodega' : 'Restaurante')
  const entidadUbicacion = [restaurante?.ciudad, restaurante?.provincia].filter(Boolean).join(' · ') || (perfilBodega ? 'Sin ubicacion de bodega' : 'Sin ubicacion')
  const estadoActividad = perfilBodega
    ? (turnoAbierto ? 'Bodega activa' : 'Sin actividad reciente')
    : (turnoAbierto ? 'Abierto' : 'Cerrado')

  return (
    <GuideModeProvider restaurantId={restaurante?.id}>
    <div className={`${styles.shell} ${darkMode ? styles.darkShell : ''}`}>
      {restaurante && <UsageTracker restauranteId={restaurante.id} onTrialChange={setTrialInfo} />}
      <nav id="dashboard-navigation" aria-label="Navegación principal" className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          <div className={styles.brandHeader}>
            <div className={styles.brandIdentity}>
              {restaurante?.logo_url ? (
                <img className={styles.brandLogo} src={restaurante.logo_url} alt={restaurante.nombre || (perfilBodega ? 'Logo bodega' : 'Logo restaurante')} loading="lazy" />
              ) : (
                <img className={styles.brandLogo} src="/brand/carta-viva/isotipo-dark.svg" alt="Carta Viva" />
              )}
              <div className={styles.brandText}>
                <p className={styles.brandLabel}>{perfilBodega ? 'Panel bodega' : 'Panel restaurante'}</p>
                <p className={styles.brandName}>{entidadNombre}</p>
                {restaurante?.ciudad && <p className={styles.brandCity}>{restaurante.ciudad}</p>}
                {!perfilBodega && <p className={styles.pinState}>{pinActivo ? 'PIN activo' : 'PIN inactivo'}</p>}
              </div>
            </div>
            <button type="button" className={styles.sidebarClose} onClick={() => setMenuOpen(false)}>
              Cerrar
            </button>
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
                  <span className={styles.navCopy}>
                    <span className={styles.navLabel}>{item.label}</span>
                    {item.hint && <small className={styles.navHint}>{item.hint}</small>}
                  </span>
                  {item.alert != null && <span className={styles.navAlert}>{item.alert}</span>}
                  {item.stat != null && <span className={styles.navStat}>{item.stat}</span>}
                </Link>
                {(active || menuOpen) && item.children?.length > 0 && (
                  <div className={styles.subnav}>
                    {item.children.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`${styles.subnavLink} ${isActive(child.href, child.exact) ? styles.subnavActive : ''}`}
                        onClick={() => setMenuOpen(false)}
                      >
                        <span className={styles.subnavCopy}>
                          <span>{child.label}</span>
                          {child.hint && <small>{child.hint}</small>}
                        </span>
                        {child.alert != null && <span className={styles.navAlert}>{child.alert}</span>}
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
            {puedeUsar(restaurante, 'carta_qr') && (
              <OpenCartaPruebaButton restauranteId={restaurante?.id} className={styles.footerLink}>
                Probar carta
              </OpenCartaPruebaButton>
            )}
            {puedeUsar(restaurante, 'modo_camarero') && (
              <a href={restaurante?.slug ? `/camarero/${restaurante.slug}` : '#'} target="_blank" rel="noreferrer" className={styles.footerLink}>
                Modo camarero
              </a>
            )}
            <Link href="/dashboard/sugerencias#nueva" className={styles.footerLink}>
              {perfilBodega ? 'Enviar mejora' : 'Enviar sugerencia'}
            </Link>
          </div>
          <button type="button" onClick={cerrarSesion} className={styles.logoutButton}>Salir</button>
        </div>
      </nav>

      {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} />}

      <div className={styles.main}>
        {(demoPresentacion || demoSumiller) && (
          <div className={styles.demoManagerBar}>
            {demoSumiller ? (
              <>
                <span>Vista sumiller - Demo Bodega</span>
                <a href="/demo/sumiller">Volver a demo sumiller</a>
              </>
            ) : (
              <>
                <span>Vista gerente - Demo La Taberna</span>
                <a href="/demo/taberna-del-puerto">Volver a la muestra</a>
              </>
            )}
          </div>
        )}
        <div className={styles.mobileBar}>
          <button
            type="button"
            className={styles.menuToggle}
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú principal"
            aria-controls="dashboard-navigation"
            aria-expanded={menuOpen}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width={18} height={18}>
              <path fillRule="evenodd" d="M3 5h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 4h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2zm0 4h14a1 1 0 0 1 0 2H3a1 1 0 0 1 0-2z" clipRule="evenodd"/>
            </svg>
            <span>Menú</span>
          </button>
          <p className={styles.mobileName}>{entidadNombre}</p>
        </div>
        <header className={styles.operationalTopbar}>
          <div className={styles.restaurantTitle}>
            <strong>{entidadNombre}</strong>
            <span className={styles.restaurantMeta}>
              {entidadUbicacion}
              <span className={`${styles.statusDot} ${turnoAbierto ? styles.statusDotOpen : styles.statusDotClosed}`} />
              {estadoActividad}
            </span>
          </div>

          <div className={styles.topSearch}>
            <button
              type="button"
              onClick={() => setSearchOpen(open => !open)}
              aria-expanded={searchOpen}
              aria-label={searchOpen ? 'Cerrar busqueda' : (perfilBodega ? 'Buscar vinos' : 'Buscar vinos o platos')}
            >
              {searchOpen ? 'Cerrar busqueda' : (perfilBodega ? 'Buscar vinos' : 'Buscar vinos/platos')}
            </button>
            <kbd>Ctrl K</kbd>
            {searchOpen && (
              <div className={styles.searchPopover}>
                <div className={styles.searchHeader}>
                  <input
                    id="dashboard-global-search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={perfilBodega ? 'Buscar vino, bodega, proveedor...' : 'Buscar vino, bodega, plato...'}
                    aria-label="Busqueda global del dashboard"
                  />
                  <button type="button" onClick={() => { setSearchOpen(false); setQuery('') }} aria-label="Cerrar busqueda">Cerrar</button>
                </div>
                <div className={styles.searchResults}>
                  {filteredSearch.map(item => (
                    <Link key={`${item.tipo}-${item.id}`} href={item.href} onClick={() => { setSearchOpen(false); setQuery('') }}>
                      <span>{item.tipo}</span>
                      <strong>{item.nombre}</strong>
                      {item.meta && <small>{item.meta}</small>}
                    </Link>
                  ))}
                  {query && filteredSearch.length === 0 && <p>Sin resultados rápidos.</p>}
                </div>
              </div>
            )}
          </div>

          <div className={styles.topStatus}>
            <GuideToggle compact />
            <Link href="/dashboard/bodega#propuestas" className={propuestasCount > 0 ? styles.alertPillCritical : styles.alertPillOk}>
              {propuestasCount > 0 ? `${propuestasCount} propuestas` : 'Sin propuestas'}
            </Link>
            <span className={styles.clock}>{clock}</span>
            <div className={styles.profileMenu}>
              <button type="button" onClick={() => setProfileOpen(open => !open)} aria-label="Abrir perfil">Perfil</button>
              {profileOpen && (
                <div className={styles.profileDropdown}>
                  <Link href="/dashboard/ajustes" onClick={() => setProfileOpen(false)}>Ajustes</Link>
                  <Link href="/admin?vista=accesos" onClick={() => setProfileOpen(false)}>{perfilBodega ? 'Cambiar bodega' : 'Cambiar restaurante'}</Link>
                  <button type="button" onClick={toggleDarkMode}>{darkMode ? 'Modo claro' : 'Modo oscuro'}</button>
                  <button type="button" onClick={cerrarSesion}>Salir</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <GuidePanel />
        <TrialUsageNotice trial={trialInfo} />
        {shortcutMessage && <div className={styles.shortcutToast} role="status">{shortcutMessage}</div>}
        {shortcutsOpen && (
          <div className={styles.shortcutsBackdrop} role="dialog" aria-modal="true" aria-labelledby="dashboard-shortcuts-title" onClick={() => setShortcutsOpen(false)}>
            <div className={styles.shortcutsModal} onClick={event => event.stopPropagation()}>
              <div className={styles.shortcutsHead}>
                <h2 id="dashboard-shortcuts-title">Atajos de teclado</h2>
                <button type="button" onClick={() => setShortcutsOpen(false)} aria-label="Cerrar ayuda de atajos">Cerrar</button>
              </div>
              <dl>
                <div><dt>Ctrl+K</dt><dd>Busqueda global</dd></div>
                <div><dt>Ctrl+N</dt><dd>Nuevo vino o plato segun contexto</dd></div>
                <div><dt>Ctrl+E</dt><dd>Enfocar accion de edicion visible</dd></div>
                <div><dt>Ctrl+S</dt><dd>Guardar formulario visible</dd></div>
                <div><dt>Ctrl+1-5</dt><dd>{perfilBodega ? 'Inicio, Referencias, Bodega, Inventario, Ajustes' : 'Inicio, Carta, Sala, Bodega, Ajustes'}</dd></div>
                <div><dt>?</dt><dd>Ver esta ayuda</dd></div>
              </dl>
            </div>
          </div>
        )}
        {!isAdminSession && restaurante && !['active', 'trialing'].includes(restaurante.subscription_status || 'trialing') ? (
          <PendingStripeScreen restaurante={restaurante} onLogout={cerrarSesion} />
        ) : trialInfo?.blocked ? (
          <TrialExpiredScreen trial={trialInfo} onLogout={cerrarSesion} />
        ) : children}
      </div>
    </div>
    </GuideModeProvider>
  )
}
