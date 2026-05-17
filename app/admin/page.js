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

        <div className="admin-grid">
          {restaurantes.map(restaurante => (
            <article className="admin-card" key={restaurante.id}>
              <div>
                <h3>{restaurante.nombre}</h3>
                <p>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ') || 'Sin ubicacion'}</p>
                <span>{restaurante.email}</span>
              </div>
              <div className="admin-card-actions">
                <button onClick={() => gestionar(restaurante)}>Gestionar dashboard</button>
                <a href={`/carta/${restaurante.slug}`} target="_blank" rel="noreferrer">Ver carta publica</a>
                <a href={`/camarero/${restaurante.slug}`} target="_blank" rel="noreferrer">Modo sala</a>
              </div>
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
