'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, isAdminEmail, setAdminRestaurantEmail } from '../demo'

const PLAN_LABEL = { basic: 'Básico', pro: 'Sala', premium: 'Acompañado' }

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
  const [nuevoLink, setNuevoLink] = useState({ titulo: '', url: '', tipo: 'link' })
  const [nuevoRestaurante, setNuevoRestaurante] = useState({
    nombre: '',
    email: '',
    ciudad: '',
    slug: '',
    plan: 'pro',
    subscription_status: 'trialing',
  })

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }

      setUser(user)
      const { data } = await supabase.from('restaurantes').select('*').order('nombre')
      setRestaurantes(data || [])
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
          <form onSubmit={crearRestaurante} className="admin-create-form">
            <label>
              Nombre comercial
              <input
                value={nuevoRestaurante.nombre}
                onChange={e => actualizarCampo('nombre', e.target.value)}
                placeholder="Ej. Casa Pepe"
                required
              />
            </label>
            <label>
              Email de acceso
              <input
                type="email"
                value={nuevoRestaurante.email}
                onChange={e => actualizarCampo('email', e.target.value)}
                placeholder="restaurante@email.com"
                required
              />
            </label>
            <label>
              Ciudad
              <input
                value={nuevoRestaurante.ciudad}
                onChange={e => actualizarCampo('ciudad', e.target.value)}
                placeholder="Ej. Jerez"
              />
            </label>
            <label>
              Slug URL
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
            <button disabled={creando}>
              {creando ? 'Creando alta...' : 'Crear alta'}
            </button>
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

        <div className="admin-access-list">
          {restaurantes.map(restaurante => (
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
              </div>
              <div className="admin-access-actions">
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
          ))}
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
