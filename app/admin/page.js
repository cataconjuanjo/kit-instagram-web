'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, isAdminEmail, setAdminRestaurantEmail } from '../demo'

const PLAN_LABEL = { basic: 'Básico', pro: 'Sala', premium: 'Acompañado' }

function generarPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function AdminPage() {
  const router = useRouter()
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
  const [hubLinks, setHubLinks] = useState([])
  const [nuevoLink, setNuevoLink] = useState({ titulo: '', url: '', tipo: 'link' })
  const [nuevoRestaurante, setNuevoRestaurante] = useState({
    nombre: '',
    email: '',
    ciudad: '',
    slug: '',
    password: generarPassword(),
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
      setNuevoRestaurante({ nombre: '', email: '', ciudad: '', slug: '', password: generarPassword(), plan: 'pro', subscription_status: 'trialing' })
    } catch (error) {
      setErrorAlta(error.message)
    }

    setCreando(false)
  }

  function copiarAcceso() {
    if (!altaCreada) return
    const texto = `Acceso a Carta Viva\n\nEmail: ${altaCreada.credenciales.email}\nContraseña: ${altaCreada.credenciales.password}\n\nTu carta pública: ${altaCreada.urls.carta}\nModo camarero (para sala): ${altaCreada.urls.camarero}\n\nEntra en tu panel: https://cataconjuanjo.com/login`
    navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  async function salir() {
    clearAdminRestaurantEmail()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <main className="admin-page">
        <p className="admin-loading">Cargando</p>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <p className="admin-kicker">Superadmin</p>
          <h1>Restaurantes</h1>
          <p>{user?.email}</p>
        </div>
        <button onClick={salir}>Salir</button>
      </header>

      <section className="admin-shell">
        <aside className="admin-sidebar">
          <p className="admin-kicker">Consultor</p>
          <Link href="/admin/consultoria">Radar</Link>
          <Link href="/admin/propuestas">Propuestas</Link>
          <Link href="/admin/proveedores">Proveedores</Link>
          <Link href="/sommelier">Selección Juanjo</Link>
          <Link className="active" href="/admin">Restaurantes</Link>
        </aside>

        <div className="admin-main">
        <div className="admin-head">
          <div>
            <p className="eyebrow">Restaurantes</p>
            <h2>Altas, accesos y configuración de cada restaurante.</h2>
          </div>
        </div>

        <section className="admin-create">
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
            <label className="admin-create-wide">
              Contraseña inicial
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={nuevoRestaurante.password}
                  onChange={e => actualizarCampo('password', e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button type="button" onClick={() => actualizarCampo('password', generarPassword())} style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                  Regenerar
                </button>
              </div>
            </label>
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
              <strong>{altaCreada.restaurante.nombre} creado.</strong>
              <span>Email: {altaCreada.credenciales.email}</span>
              <span style={{ fontFamily: 'monospace' }}>Contraseña: {altaCreada.credenciales.password}</span>
              <span>Carta: {altaCreada.urls.carta}</span>
              <span>Modo sala: {altaCreada.urls.camarero}</span>
              <button
                type="button"
                onClick={copiarAcceso}
                style={{ marginTop: 10, background: copiado ? '#3a6b4e' : '#111', color: '#fff', border: 'none', padding: '10px 18px', fontSize: 12, cursor: 'pointer', letterSpacing: '0.08em' }}
              >
                {copiado ? '✓ Copiado' : 'Copiar acceso para enviar'}
              </button>
            </div>
          )}
        </section>

        <div className="admin-grid">
          {restaurantes.map(restaurante => (
            <article className="admin-card" key={restaurante.id}>
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
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h3 style={{ margin: 0 }}>{restaurante.nombre}</h3>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: restaurante.plan === 'premium' ? '#f1e4e7' : restaurante.plan === 'pro' ? '#e8f0eb' : '#f5f5f5', color: restaurante.plan === 'premium' ? '#74223d' : restaurante.plan === 'pro' ? '#385f4f' : '#888', padding: '2px 8px', borderRadius: 99 }}>
                    {PLAN_LABEL[restaurante.plan] || restaurante.plan}
                  </span>
                </div>
                <p>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ') || 'Sin ubicación'}</p>
                <span>{restaurante.email}</span>
                <small className="admin-slug">/{restaurante.slug}</small>
              </div>
              <div className="admin-card-actions">
                <button onClick={() => gestionar(restaurante)}>Gestionar dashboard</button>
                <button className="admin-plain-button" onClick={() => empezarEdicion(restaurante)}>Editar datos</button>
              </div>
                </>
              )}
            </article>
          ))}
        </div>

        {restaurantes.length === 0 && (
          <div className="admin-empty">
            <p>No hay restaurantes creados todavia.</p>
          </div>
        )}
        </div>
      </section>
    </main>
  )
}
