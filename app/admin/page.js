'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, isAdminEmail, setAdminRestaurantEmail } from '../demo'

const PLAN_LABEL = { basic: 'Básico', pro: 'Sala', premium: 'Acompañado' }

function formatoDuracion(segundos = 0) {
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

function formatoFecha(fecha) {
  if (!fecha) return 'Sin accesos'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(fecha))
}

function formatoCosteIa(importe = 0) {
  return `${Number(importe || 0).toFixed(2)} USD`
}

function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Modo reset: 'email' = enviar enlace | 'manual' = generar contraseña
// Se usa en el botón de "reset password" de cada tarjeta de restaurante

function AdminPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const vistaAdmin = searchParams.get('vista') === 'accesos' ? 'accesos' : 'altas'
  const esAltas = vistaAdmin === 'altas'
  const [user, setUser] = useState(null)
  const [restaurantes, setRestaurantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [creando, setCreando] = useState(false)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorAlta, setErrorAlta] = useState('')
  const [errorEdicion, setErrorEdicion] = useState('')
  const [altaCreada, setAltaCreada] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [edicion, setEdicion] = useState(null)
  const [resetandoId, setResetandoId] = useState(null)
  const [nuevaPass, setNuevaPass] = useState('')
  const [resetResult, setResetResult] = useState(null)
  const [copiadoReset, setCopiadoReset] = useState(false)
  const [bajaId, setBajaId] = useState(null) // id del restaurante pendiente de confirmar baja
  const [dandoDeBaja, setDandoDeBaja] = useState(false)
  const [hubLinks, setHubLinks] = useState([])
  const [uso, setUso] = useState({ resumen: {}, recientes: [], ia: { resumen: {}, preparacion: { resumen: {}, total: {} }, total: {}, disponible: false } })
  const [usoError, setUsoError] = useState('')
  const [nuevoLink, setNuevoLink] = useState({ titulo: '', url: '', tipo: 'link' })
  const [pageSize, setPageSize] = useState(10)
  const [pagina, setPagina] = useState(1)
  const [orden, setOrden] = useState('nombre')
  const [filtroTabla, setFiltroTabla] = useState('')
  const [menuAccionesId, setMenuAccionesId] = useState(null)
  const [nuevoRestaurante, setNuevoRestaurante] = useState({
    nombre: '',
    email: '',
    ciudad: '',
    slug: '',
    plan: 'pro',
    subscription_status: 'trialing',
  })

  const camposAlta = ['nombre', 'email', 'slug']
  const camposAltaCompletos = camposAlta.filter(campo => String(nuevoRestaurante[campo] || '').trim()).length
  const progresoAlta = Math.round((camposAltaCompletos / camposAlta.length) * 100)
  const emailValido = !nuevoRestaurante.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nuevoRestaurante.email)
  const slugValido = !nuevoRestaurante.slug || /^[a-z0-9-]+$/.test(nuevoRestaurante.slug)

  function estadoCampo(campo) {
    const valor = String(nuevoRestaurante[campo] || '').trim()
    if (!valor) return ''
    if (campo === 'email') return emailValido ? 'ok' : 'error'
    if (campo === 'slug') return slugValido ? 'ok' : 'error'
    return 'ok'
  }

  function guardarBorradorAlta() {
    window.localStorage.setItem('admin_alta_restaurante_draft', JSON.stringify(nuevoRestaurante))
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1800)
  }

  function copiarRestaurante(restaurante) {
    const texto = [
      restaurante.nombre,
      restaurante.email,
      [restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · '),
      `/${restaurante.slug}`,
      restaurante.subscription_status || ''
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(texto)
    setMenuAccionesId(null)
  }

  const restaurantesOrdenados = [...restaurantes]
    .filter(restaurante => `${restaurante.nombre || ''} ${restaurante.email || ''} ${restaurante.ciudad || ''} ${restaurante.slug || ''}`.toLowerCase().includes(filtroTabla.toLowerCase()))
    .sort((a, b) => String(a[orden] || '').localeCompare(String(b[orden] || '')))
  const totalPaginas = Math.max(1, Math.ceil(restaurantesOrdenados.length / pageSize))
  const restaurantesPagina = restaurantesOrdenados.slice((pagina - 1) * pageSize, pagina * pageSize)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }

      setUser(user)
      try {
        const draft = JSON.parse(window.localStorage.getItem('admin_alta_restaurante_draft') || 'null')
        if (draft?.nombre || draft?.email || draft?.slug) setNuevoRestaurante(prev => ({ ...prev, ...draft }))
      } catch {}
      const { data } = await supabase.from('restaurantes').select('*').order('nombre')
      setRestaurantes(data || [])
      const token = await tokenAdmin()
      const usoRes = await fetch('/api/uso', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const usoData = await usoRes.json()
      if (usoRes.ok) {
        setUso(usoData)
      } else {
        setUsoError(usoData.error || 'No se pudo cargar el uso.')
      }
      setLoading(false)
    }
    cargar()
  }, [])

  function gestionar(restaurante) {
    setAdminRestaurantEmail(restaurante.email)
    router.push('/dashboard')
  }

  function empezarEdicion(restaurante) {
    setErrorEdicion('')
    setEditandoId(restaurante.id)
    setEdicion({
      id: restaurante.id,
      nombre: restaurante.nombre || '',
      email: restaurante.email || '',
      ciudad: restaurante.ciudad || '',
      slug: restaurante.slug || '',
      color_primario: restaurante.color_primario || '#531827',
      color_fondo: restaurante.color_fondo || '#fffaf3',
      color_acento: restaurante.color_acento || '#bfa984',
      tipografia: restaurante.tipografia || 'serif',
      hub_activo: Boolean(restaurante.hub_activo),
      hub_titulo: restaurante.hub_titulo || '',
      hub_subtitulo: restaurante.hub_subtitulo || '',
      instagram_url: restaurante.instagram_url || '',
      facebook_url: restaurante.facebook_url || '',
      plan: restaurante.plan || 'basic',
      subscription_status: restaurante.subscription_status || 'trialing',
    })
    cargarHubLinks(restaurante.id)
  }

  function slugDesdeNombre(nombre) {
    return nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
  }

  function actualizarCampo(campo, valor) {
    setAltaCreada(null)
    setErrorAlta('')
    setNuevoRestaurante(prev => ({
      ...prev,
      [campo]: valor,
      ...(campo === 'nombre' && !prev.slug ? { slug: slugDesdeNombre(valor) } : {})
    }))
  }

  function actualizarEdicion(campo, valor) {
    setErrorEdicion('')
    setEdicion(prev => ({
      ...prev,
      [campo]: campo === 'slug' ? slugDesdeNombre(valor) : valor,
      ...(campo === 'nombre' && !prev.slug ? { slug: slugDesdeNombre(valor) } : {})
    }))
  }

  async function tokenAdmin() {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData?.session?.access_token
  }

  async function cargarHubLinks(restauranteId) {
    const token = await tokenAdmin()
    const res = await fetch(`/api/admin/hub-links?restaurante_id=${restauranteId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    setHubLinks(res.ok ? data.links || [] : [])
  }

  async function crearHubLink() {
    if (!edicion?.id || !nuevoLink.titulo.trim() || !nuevoLink.url.trim()) return
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/hub-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...nuevoLink, restaurante_id: edicion.id, orden: hubLinks.length })
    })
    const data = await res.json()
    if (res.ok) {
      setHubLinks([...hubLinks, data.link])
      setNuevoLink({ titulo: '', url: '', tipo: 'link' })
    } else {
      setErrorEdicion(data.error || 'No se pudo crear el enlace.')
    }
  }

  async function guardarHubLink(link) {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/hub-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(link)
    })
    const data = await res.json()
    if (res.ok) {
      setHubLinks(hubLinks.map(item => item.id === data.link.id ? data.link : item))
    } else {
      setErrorEdicion(data.error || 'No se pudo editar el enlace.')
    }
  }

  async function borrarHubLink(id) {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/hub-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id })
    })
    if (res.ok) setHubLinks(hubLinks.filter(link => link.id !== id))
  }

  async function guardarEdicion(e) {
    e.preventDefault()
    if (!edicion) return
    setGuardandoEdicion(true)
    setErrorEdicion('')

    const token = await tokenAdmin()

    try {
      const res = await fetch('/api/admin/restaurantes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(edicion)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la edición.')

      setRestaurantes(prev => prev.map(r => r.id === data.restaurante.id ? data.restaurante : r).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setEditandoId(null)
      setEdicion(null)
    } catch (error) {
      setErrorEdicion(error.message)
    }

    setGuardandoEdicion(false)
  }

  async function crearRestaurante(e) {
    e.preventDefault()
    setCreando(true)
    setErrorAlta('')
    setAltaCreada(null)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

    try {
      const res = await fetch('/api/admin/restaurantes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(nuevoRestaurante)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear el restaurante.')

      setRestaurantes(prev => [...prev, data.restaurante].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setAltaCreada(data)
      setNuevoRestaurante({ nombre: '', email: '', ciudad: '', slug: '', plan: 'pro', subscription_status: 'trialing' })
    } catch (error) {
      setErrorAlta(error.message)
    }

    setCreando(false)
  }

  function copiarAcceso() {
    if (!altaCreada) return
    const texto = `Bienvenido a Carta Viva 🍷\n\nHola, te hemos dado de alta en Carta Viva.\n\nRevisa tu email (${altaCreada.invitacion.email}) — recibirás un enlace para activar tu cuenta y elegir tu contraseña.\n\nUna vez activo, accede a tu panel desde:\nhttps://cataconjuanjo.com/login\n\nTu carta pública: https://cataconjuanjo.com${altaCreada.urls.carta}\nModo sala (camareros): https://cataconjuanjo.com${altaCreada.urls.camarero}`
    navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  async function enviarEnlaceAcceso(restaurante) {
    setResetandoId(restaurante.id)
    setResetResult(null)
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/restaurantes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: restaurante.email, modo: 'email' })
    })
    const data = await res.json()
    if (res.ok) {
      setResetResult({ ok: true, modo: 'email', email: restaurante.email, link: data.link })
    } else {
      setResetResult({ ok: false, error: data.error })
    }
  }

  async function resetPasswordManual(restaurante) {
    const pass = generarPassword()
    setResetandoId(restaurante.id)
    setNuevaPass(pass)
    setResetResult(null)
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/restaurantes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: restaurante.email, modo: 'manual', password: pass })
    })
    const data = await res.json()
    if (res.ok) {
      setResetResult({ ok: true, modo: 'manual', email: restaurante.email, password: pass })
    } else {
      setResetResult({ ok: false, error: data.error })
    }
  }

  async function darDeBaja(restaurante) {
    setDandoDeBaja(true)
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/restaurantes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: restaurante.id, email: restaurante.email })
    })
    const data = await res.json()
    if (res.ok) {
      setRestaurantes(prev => prev.filter(r => r.id !== restaurante.id))
      setBajaId(null)
    } else {
      alert(data.error || 'No se pudo dar de baja el restaurante.')
    }
    setDandoDeBaja(false)
  }

  function copiarReset() {
    if (!resetResult?.ok) return
    let texto = ''
    if (resetResult.modo === 'email') {
      texto = `Enlace de acceso a Carta Viva\n\nHola, usa este enlace para entrar en tu panel y elegir tu contraseña:\n${resetResult.link}\n\nSi el enlace no funciona, entra en: https://cataconjuanjo.com/login`
    } else {
      texto = `Nuevas credenciales de acceso\n\nEmail: ${resetResult.email}\nContraseña: ${resetResult.password}\n\nPanel: https://cataconjuanjo.com/login`
    }
    navigator.clipboard.writeText(texto)
    setCopiadoReset(true)
    setTimeout(() => setCopiadoReset(false), 2500)
  }

  async function salir() {
    clearAdminRestaurantEmail()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return <p className="admin-loading">Cargando</p>
  }

  return (
    <div className="admin-main">
        <div className="admin-head">
          <div>
            <p className="eyebrow">Restaurantes</p>
            <h2>{esAltas ? 'Alta de restaurante y entrega de acceso.' : 'Accesos y gestion rapida de restaurantes.'}</h2>
          </div>
        </div>

        {esAltas && (
        <section className="admin-create admin-create-compact">
          <div>
            <p className="eyebrow">Alta nueva</p>
            <h2>Crear restaurante y acceso privado</h2>
            <p>Genera la ficha, el usuario de login y las URLs de carta pública y modo sala.</p>
          </div>
          <div className="form-progress" aria-label="Progreso del alta">
            <span><b style={{ width: `${progresoAlta}%` }} /></span>
            <strong>{progresoAlta}% completo</strong>
          </div>
          <form onSubmit={crearRestaurante} className="admin-create-form">
            <label>
              <span>Nombre comercial <b>*</b><em title="Nombre visible en panel, carta publica e informes.">?</em>{estadoCampo('nombre') && <i className={`field-state ${estadoCampo('nombre')}`}>{estadoCampo('nombre') === 'ok' ? '✓' : '×'}</i>}</span>
              <input
                value={nuevoRestaurante.nombre}
                onChange={e => actualizarCampo('nombre', e.target.value)}
                placeholder="Ej. Casa Pepe"
                required
              />
            </label>
            <label>
              <span>Email de acceso <b>*</b><em title="Email que recibira la invitacion y usara para entrar.">?</em>{estadoCampo('email') && <i className={`field-state ${estadoCampo('email')}`}>{estadoCampo('email') === 'ok' ? '✓' : '×'}</i>}</span>
              <input
                type="email"
                value={nuevoRestaurante.email}
                onChange={e => actualizarCampo('email', e.target.value)}
                placeholder="restaurante@email.com"
                required
              />
            </label>
            <label>
              <span>Ciudad <em title="Ayuda a ubicar el restaurante en busquedas e informes.">?</em>{estadoCampo('ciudad') && <i className="field-state ok">✓</i>}</span>
              <input
                value={nuevoRestaurante.ciudad}
                onChange={e => actualizarCampo('ciudad', e.target.value)}
                placeholder="Ej. Jerez"
              />
            </label>
            <label>
              <span>Slug URL <b>*</b><em title="Ruta publica corta, sin espacios ni acentos.">?</em>{estadoCampo('slug') && <i className={`field-state ${estadoCampo('slug')}`}>{estadoCampo('slug') === 'ok' ? '✓' : '×'}</i>}</span>
              <input
                value={nuevoRestaurante.slug}
                onChange={e => actualizarCampo('slug', slugDesdeNombre(e.target.value))}
                placeholder="casa-pepe"
                required
              />
            </label>
            {/* La contraseña la elige el propio restaurante al activar su cuenta vía email de invitación */}
            <label>
              Plan
              <select value={nuevoRestaurante.plan} onChange={e => actualizarCampo('plan', e.target.value)}>
                <option value="basic">Básico</option>
                <option value="pro">Sala</option>
                <option value="premium">Acompañado</option>
              </select>
            </label>
            <label>
              Estado
              <select value={nuevoRestaurante.subscription_status} onChange={e => actualizarCampo('subscription_status', e.target.value)}>
                <option value="trialing">Prueba</option>
                <option value="active">Activo</option>
                <option value="past_due">Pago pendiente</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </label>
            <div className="form-button-row admin-create-wide">
              <button type="button" className="admin-secondary-action" onClick={guardarBorradorAlta}>
                {copiado ? 'Borrador guardado' : 'Guardar borrador'}
              </button>
              <button disabled={creando || !emailValido || !slugValido}>
                {creando ? 'Creando alta...' : 'Crear alta'}
              </button>
            </div>
          </form>

          {errorAlta && <p className="admin-alert admin-alert-error">{errorAlta}</p>}
          {altaCreada && (
            <div className="admin-alert admin-alert-ok">
              <strong>✓ {altaCreada.restaurante.nombre} creado</strong>
              <span>📧 Invitación enviada a <strong>{altaCreada.invitacion.email}</strong></span>
              <span style={{ fontSize: 13, color: '#555' }}>
                El restaurante recibirá un email con un enlace para activar su cuenta y elegir su contraseña.
                El enlace caduca en 24 horas.
              </span>
              <span style={{ fontSize: 12, color: '#777' }}>Carta: {altaCreada.urls.carta}</span>
              <span style={{ fontSize: 12, color: '#777' }}>Modo sala: {altaCreada.urls.camarero}</span>
              <button
                type="button"
                onClick={copiarAcceso}
                style={{ marginTop: 10, background: copiado ? '#3a6b4e' : '#111', color: '#fff', border: 'none', padding: '10px 18px', fontSize: 12, cursor: 'pointer', letterSpacing: '0.08em' }}
              >
                {copiado ? '✓ Copiado' : 'Copiar mensaje de bienvenida'}
              </button>
            </div>
          )}
        </section>
        )}

        {!esAltas && (
        <section className="admin-access-panel">
          <div className="admin-access-toolbar">
            <div>
              <p className="eyebrow">Accesos</p>
              <h3>{restaurantes.length} restaurantes</h3>
            </div>
            <Link href="/admin?vista=altas" className="admin-access-new">Nueva alta</Link>
          </div>

        <div className="admin-usage-overview">
          <div>
            <p className="eyebrow">Uso del panel</p>
            <h3>Actividad reciente</h3>
            {uso.ia?.disponible && (
              <>
                <p>IA operativa este mes: {uso.ia.total?.consultas || 0} consultas · {formatoCosteIa(uso.ia.total?.coste_estimado_usd)}</p>
                {(uso.ia.preparacion?.total?.consultas || 0) > 0 && (
                  <p>Preparación interna: {uso.ia.preparacion.total.consultas} consultas · {formatoCosteIa(uso.ia.preparacion.total.coste_estimado_usd)}</p>
                )}
              </>
            )}
          </div>
          {usoError ? (
            <p className="admin-inline-error">{usoError}</p>
          ) : uso.recientes.length === 0 ? (
            <p className="admin-usage-empty">Todavía no hay sesiones registradas.</p>
          ) : (
            <div className="admin-usage-recent">
              {uso.recientes.slice(0, 6).map(sesion => {
                const restaurante = restaurantes.find(item => item.id === sesion.restaurante_id)
                return (
                  <div key={sesion.id}>
                    <strong>{restaurante?.nombre || 'Restaurante'}</strong>
                    <span>{sesion.user_email}</span>
                    <span>{formatoFecha(sesion.started_at)}</span>
                    <span>{formatoDuracion(sesion.active_seconds)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="table-toolbar">
          <input value={filtroTabla} onChange={e => { setFiltroTabla(e.target.value); setPagina(1) }} placeholder="Filtrar por nombre, email, ciudad..." aria-label="Filtrar restaurantes" />
          <select value={orden} onChange={e => setOrden(e.target.value)} aria-label="Ordenar restaurantes">
            <option value="nombre">Ordenar: nombre</option>
            <option value="ciudad">Ordenar: ciudad</option>
            <option value="email">Ordenar: email</option>
            <option value="subscription_status">Ordenar: estado</option>
          </select>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPagina(1) }} aria-label="Registros por pagina">
            <option value={10}>10 por pagina</option>
            <option value={25}>25 por pagina</option>
            <option value={50}>50 por pagina</option>
          </select>
          <button type="button" onClick={() => navigator.clipboard.writeText(restaurantesOrdenados.map(r => [r.nombre, r.email, r.ciudad, r.slug, r.subscription_status].join(',')).join('\n'))}>Copiar CSV</button>
          <button type="button" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>

        <div className="admin-access-list">
          {restaurantesPagina.map(restaurante => {
            const resumenUso = uso.resumen[restaurante.id]
            const resumenIa = uso.ia?.resumen?.[restaurante.id]
            const resumenPreparacionIa = uso.ia?.preparacion?.resumen?.[restaurante.id]
            return (
            <article className="admin-card admin-access-card" key={restaurante.id}>
              {editandoId === restaurante.id && edicion ? (
                <form className="admin-edit-form" onSubmit={guardarEdicion}>
                  <label>Nombre<input value={edicion.nombre} onChange={e => actualizarEdicion('nombre', e.target.value)} required /></label>
                  <label>Email<input type="email" value={edicion.email} onChange={e => actualizarEdicion('email', e.target.value)} required /></label>
                  <label>Ciudad<input value={edicion.ciudad} onChange={e => actualizarEdicion('ciudad', e.target.value)} /></label>
                  <label>Slug<input value={edicion.slug} onChange={e => actualizarEdicion('slug', e.target.value)} required /></label>
                  <div className="admin-color-row">
                    <label>Principal<input type="color" value={edicion.color_primario} onChange={e => actualizarEdicion('color_primario', e.target.value)} /></label>
                    <label>Fondo<input type="color" value={edicion.color_fondo} onChange={e => actualizarEdicion('color_fondo', e.target.value)} /></label>
                    <label>Acento<input type="color" value={edicion.color_acento} onChange={e => actualizarEdicion('color_acento', e.target.value)} /></label>
                  </div>
                  <label>Tipografía<select value={edicion.tipografia} onChange={e => actualizarEdicion('tipografia', e.target.value)}><option value="serif">Serif</option><option value="sans">Sans</option></select></label>
                  <label>Plan<select value={edicion.plan} onChange={e => actualizarEdicion('plan', e.target.value)}><option value="basic">Basico</option><option value="pro">Sala</option><option value="premium">Acompanado</option></select></label>
                  <label>Estado<select value={edicion.subscription_status} onChange={e => actualizarEdicion('subscription_status', e.target.value)}><option value="trialing">Prueba</option><option value="active">Activo</option><option value="past_due">Pago pendiente</option><option value="cancelled">Cancelado</option></select></label>
                  <label className="admin-hub-switch">
                    <input type="checkbox" checked={edicion.hub_activo} onChange={e => actualizarEdicion('hub_activo', e.target.checked)} />
                    Activar hub tipo link en bio
                  </label>
                  {edicion.hub_activo && (
                    <>
                      <label>Título hub<input value={edicion.hub_titulo} onChange={e => actualizarEdicion('hub_titulo', e.target.value)} placeholder={edicion.nombre} /></label>
                      <label>Subtítulo hub<input value={edicion.hub_subtitulo} onChange={e => actualizarEdicion('hub_subtitulo', e.target.value)} placeholder="Restaurante · ciudad" /></label>
                      <label>Instagram<input value={edicion.instagram_url} onChange={e => actualizarEdicion('instagram_url', e.target.value)} placeholder="https://instagram.com/..." /></label>
                      <label>Facebook<input value={edicion.facebook_url} onChange={e => actualizarEdicion('facebook_url', e.target.value)} placeholder="https://facebook.com/..." /></label>
                      <div className="admin-hub-links">
                        <strong>Botones del hub</strong>
                        {hubLinks.map(link => (
                          <div className="admin-hub-link-row" key={link.id}>
                            <input value={link.titulo} onChange={e => setHubLinks(hubLinks.map(item => item.id === link.id ? { ...item, titulo: e.target.value } : item))} onBlur={() => guardarHubLink(hubLinks.find(item => item.id === link.id) || link)} />
                            <input value={link.url} onChange={e => setHubLinks(hubLinks.map(item => item.id === link.id ? { ...item, url: e.target.value } : item))} onBlur={() => guardarHubLink(hubLinks.find(item => item.id === link.id) || link)} />
                            <select value={link.tipo || 'link'} onChange={e => guardarHubLink({ ...link, tipo: e.target.value })}>
                              <option value="link">Link</option>
                              <option value="tarta">Tarta</option>
                              <option value="carta">Carta</option>
                              <option value="carta_vinos">Carta vinos</option>
                              <option value="gintonics">Gintonics</option>
                              <option value="pdf">PDF</option>
                              <option value="reservas">Reservas</option>
                              <option value="grupos">Grupos</option>
                              <option value="alergenos">Alérgenos</option>
                              <option value="instagram">Instagram</option>
                              <option value="facebook">Facebook</option>
                              <option value="maps">Maps</option>
                            </select>
                            <button type="button" onClick={() => borrarHubLink(link.id)}>×</button>
                          </div>
                        ))}
                        <div className="admin-hub-link-row">
                          <input value={nuevoLink.titulo} onChange={e => setNuevoLink({ ...nuevoLink, titulo: e.target.value })} placeholder="Carta restaurante" />
                          <input value={nuevoLink.url} onChange={e => setNuevoLink({ ...nuevoLink, url: e.target.value })} placeholder="https://..." />
                          <select value={nuevoLink.tipo} onChange={e => setNuevoLink({ ...nuevoLink, tipo: e.target.value })}>
                            <option value="link">Link</option>
                            <option value="tarta">Tarta</option>
                            <option value="carta">Carta</option>
                            <option value="carta_vinos">Carta vinos</option>
                            <option value="gintonics">Gintonics</option>
                            <option value="pdf">PDF</option>
                            <option value="reservas">Reservas</option>
                            <option value="grupos">Grupos</option>
                            <option value="alergenos">Alérgenos</option>
                            <option value="instagram">Instagram</option>
                            <option value="facebook">Facebook</option>
                            <option value="maps">Maps</option>
                          </select>
                          <button type="button" onClick={crearHubLink}>+</button>
                        </div>
                      </div>
                    </>
                  )}
                  {errorEdicion && <p className="admin-inline-error">{errorEdicion}</p>}
                  <div className="admin-card-actions">
                    <button type="submit" disabled={guardandoEdicion}>{guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}</button>
                    <button type="button" className="admin-plain-button" onClick={() => { setEditandoId(null); setEdicion(null); setErrorEdicion('') }}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <>
              <div className="admin-access-main">
                <div className="admin-access-title">
                  <h3>{restaurante.nombre}</h3>
                  <span className={`admin-plan-pill admin-plan-${restaurante.plan || 'basic'}`}>
                    {PLAN_LABEL[restaurante.plan] || restaurante.plan}
                  </span>
                </div>
                <p>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ') || 'Sin ubicación'}</p>
                <span>{restaurante.email}</span>
                <small className="admin-slug">/{restaurante.slug}</small>
                <div className="admin-usage-stats">
                  <span className={resumenUso?.activo_ahora ? 'is-online' : ''}>
                    {resumenUso?.activo_ahora ? 'Activo ahora' : `Último acceso: ${formatoFecha(resumenUso?.ultimo_acceso)}`}
                  </span>
                  <span>{resumenUso?.sesiones || 0} sesiones</span>
                  <span>{formatoDuracion(resumenUso?.active_seconds)} de uso activo</span>
                  <span>Media: {formatoDuracion(resumenUso?.sesiones ? resumenUso.active_seconds / resumenUso.sesiones : 0)}</span>
                  <span>IA operativa este mes: {resumenIa?.consultas || 0} consultas</span>
                  <span>Coste IA operativo: {formatoCosteIa(resumenIa?.coste_estimado_usd)}</span>
                  {(resumenIa?.consultas || 0) > 0 && (
                    <span>Clientes: {resumenIa?.origenes?.cliente_real?.consultas || 0} · Pruebas restaurante: {resumenIa?.origenes?.restaurante_prueba?.consultas || 0}</span>
                  )}
                  {(resumenPreparacionIa?.consultas || 0) > 0 && (
                    <span>Preparación interna IA: {resumenPreparacionIa.consultas} consultas · {formatoCosteIa(resumenPreparacionIa.coste_estimado_usd)}</span>
                  )}
                </div>
              </div>
              <div className="admin-access-actions">
                <div className="admin-context-menu">
                  <button
                    type="button"
                    className="admin-menu-button"
                    title="Mas acciones"
                    aria-label="Mas acciones"
                    onClick={() => setMenuAccionesId(menuAccionesId === restaurante.id ? null : restaurante.id)}
                  >
                    ⋮
                  </button>
                  {menuAccionesId === restaurante.id && (
                    <div className="admin-context-dropdown">
                      <button type="button" onClick={() => copiarRestaurante(restaurante)}>Copiar datos</button>
                      <Link href={`/admin/restaurante/${restaurante.id}`} onClick={() => setMenuAccionesId(null)}>Ver ficha consultor</Link>
                      <button type="button" onClick={() => setMenuAccionesId(null)}>Cerrar menu</button>
                    </div>
                  )}
                </div>
                <button onClick={() => gestionar(restaurante)}>Abrir dashboard</button>
                <button className="admin-plain-button" onClick={() => empezarEdicion(restaurante)}>Editar</button>
                <button
                  className="admin-plain-button"
                  onClick={() => { setResetResult(null); enviarEnlaceAcceso(restaurante) }}
                  disabled={resetandoId === restaurante.id && !resetResult}
                >
                  {resetandoId === restaurante.id && !resetResult ? 'Enviando...' : 'Enviar enlace de acceso'}
                </button>
                <button
                  className="admin-plain-button"
                  onClick={() => { setResetResult(null); resetPasswordManual(restaurante) }}
                  disabled={resetandoId === restaurante.id && !resetResult}
                  title="Genera una contraseña aleatoria sin mandar email"
                >
                  Pass manual
                </button>
                <button
                  className="admin-plain-button"
                  style={{ color: '#c0392b' }}
                  onClick={() => { setBajaId(restaurante.id); setResetResult(null) }}
                >
                  Dar de baja
                </button>
              </div>

              {bajaId === restaurante.id && (
                <div className="admin-alert admin-alert-error" style={{ marginTop: 10 }}>
                  <strong>¿Dar de baja a {restaurante.nombre}?</strong>
                  <span style={{ fontSize: 13 }}>
                    Se borrará el restaurante y su acceso de forma permanente. Esta acción no se puede deshacer.
                  </span>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => darDeBaja(restaurante)}
                      disabled={dandoDeBaja}
                      style={{ background: '#c0392b', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}
                    >
                      {dandoDeBaja ? 'Borrando...' : 'Sí, dar de baja'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBajaId(null)}
                      style={{ background: 'transparent', border: '1px solid #ccc', padding: '8px 16px', fontSize: 12, cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {resetandoId === restaurante.id && resetResult && (
                <div className={`admin-alert ${resetResult.ok ? 'admin-alert-ok' : 'admin-alert-error'}`} style={{ marginTop: 10 }}>
                  {resetResult.ok && resetResult.modo === 'email' ? (
                    <>
                      <span>✓ Enlace de activación generado para <strong>{resetResult.email}</strong></span>
                      <span style={{ fontSize: 12, color: '#555' }}>
                        Si Supabase no ha enviado el email, usa el botón de copiar y envíalo tú manualmente.
                      </span>
                      <button
                        type="button"
                        onClick={copiarReset}
                        style={{ marginTop: 8, background: copiadoReset ? '#3a6b4e' : '#111', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 11, cursor: 'pointer' }}
                      >
                        {copiadoReset ? '✓ Copiado' : 'Copiar enlace para enviar'}
                      </button>
                    </>
                  ) : resetResult.ok && resetResult.modo === 'manual' ? (
                    <>
                      <span>Email: <strong>{resetResult.email}</strong></span>
                      <span>Contraseña: <strong style={{ fontFamily: 'monospace' }}>{resetResult.password}</strong></span>
                      <button
                        type="button"
                        onClick={copiarReset}
                        style={{ marginTop: 8, background: copiadoReset ? '#3a6b4e' : '#111', color: '#fff', border: 'none', padding: '8px 16px', fontSize: 11, cursor: 'pointer' }}
                      >
                        {copiadoReset ? '✓ Copiado' : 'Copiar para enviar'}
                      </button>
                    </>
                  ) : (
                    <span>{resetResult.error}</span>
                  )}
                </div>
              )}
                </>
              )}
            </article>
            )
          })}
        </div>
        <div className="table-pagination">
          <span>Pagina {pagina} de {totalPaginas} · {restaurantesOrdenados.length} registros</span>
          <div>
            <button type="button" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>Anterior</button>
            <button type="button" onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>Siguiente</button>
          </div>
        </div>
        </section>
        )}

        {!esAltas && restaurantes.length === 0 && (
          <div className="admin-empty">
            <p>No hay restaurantes creados todavia.</p>
          </div>
        )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="admin-loading">Cargando</p>}>
      <AdminPageContent />
    </Suspense>
  )
}
