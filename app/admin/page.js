'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, isAdminEmail, setAdminRestaurantEmail } from '../demo'

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
  const [editandoId, setEditandoId] = useState(null)
  const [edicion, setEdicion] = useState(null)
  const [nuevoRestaurante, setNuevoRestaurante] = useState({
    nombre: '',
    email: '',
    ciudad: '',
    slug: '',
    password: ''
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
      tipografia: restaurante.tipografia || 'serif'
    })
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

  async function guardarEdicion(e) {
    e.preventDefault()
    if (!edicion) return
    setGuardandoEdicion(true)
    setErrorEdicion('')

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token

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
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la edicion.')

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
      setNuevoRestaurante({ nombre: '', email: '', ciudad: '', slug: '', password: '' })
    } catch (error) {
      setErrorAlta(error.message)
    }

    setCreando(false)
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
          <h1>Carta Viva</h1>
          <p>{user?.email}</p>
        </div>
        <button onClick={salir}>Salir</button>
      </header>

      <section className="admin-wrap">
        <div className="admin-head">
          <div>
            <p className="eyebrow">Restaurantes</p>
            <h2>Elige una carta para gestionarla.</h2>
          </div>
          <Link href="/sommelier" className="btn btn-secondary">Selecciones Juanjo</Link>
        </div>

        <section className="admin-create">
          <div>
            <p className="eyebrow">Alta nueva</p>
            <h2>Crear restaurante y acceso privado</h2>
            <p>Genera la ficha, el usuario de login y las URLs de carta publica y modo sala.</p>
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
              Contrasena inicial
              <input
                value={nuevoRestaurante.password}
                onChange={e => actualizarCampo('password', e.target.value)}
                placeholder="Dejalo vacio para generar una automaticamente"
              />
            </label>
            <button disabled={creando}>
              {creando ? 'Creando alta...' : 'Crear alta'}
            </button>
          </form>

          {errorAlta && <p className="admin-alert admin-alert-error">{errorAlta}</p>}
          {altaCreada && (
            <div className="admin-alert admin-alert-ok">
              <strong>{altaCreada.restaurante.nombre} creado.</strong>
              <span>Usuario: {altaCreada.credenciales.email}</span>
              <span>Contrasena: {altaCreada.credenciales.password}</span>
              <span>Carta: {altaCreada.urls.carta}</span>
              <span>Modo sala: {altaCreada.urls.camarero}</span>
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
                  <label>Tipografia<select value={edicion.tipografia} onChange={e => actualizarEdicion('tipografia', e.target.value)}><option value="serif">Serif</option><option value="sans">Sans</option></select></label>
                  {errorEdicion && <p className="admin-inline-error">{errorEdicion}</p>}
                  <div className="admin-card-actions">
                    <button type="submit" disabled={guardandoEdicion}>{guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}</button>
                    <button type="button" className="admin-plain-button" onClick={() => { setEditandoId(null); setEdicion(null); setErrorEdicion('') }}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <>
              <div>
                <h3>{restaurante.nombre}</h3>
                <p>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ') || 'Sin ubicacion'}</p>
                <span>{restaurante.email}</span>
                <small className="admin-slug">/{restaurante.slug}</small>
              </div>
              <div className="admin-card-actions">
                <button onClick={() => gestionar(restaurante)}>Gestionar dashboard</button>
                <button className="admin-plain-button" onClick={() => empezarEdicion(restaurante)}>Editar datos</button>
                <a href={`/carta/${restaurante.slug}`} target="_blank" rel="noreferrer">Ver carta publica</a>
                <a href={`/camarero/${restaurante.slug}`} target="_blank" rel="noreferrer">Modo sala</a>
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
      </section>
    </main>
  )
}
