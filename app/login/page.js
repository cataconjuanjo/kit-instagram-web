'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, clearDemoEmail, isAdminEmail, setDemoEmail } from '../demo'

export default function Login() {
  const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO === 'true'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email o contraseña incorrectos')
    } else {
      clearAdminRestaurantEmail()
      clearDemoEmail()
      window.location.href = isAdminEmail(email) ? '/admin/consultoria' : '/dashboard'
    }
    setLoading(false)
  }

  async function entrarDemo(demoEmail) {
    setDemoEmail(demoEmail)
    await supabase.auth.signOut()
    window.location.href = '/dashboard'
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Link href="/cartavinos" className="brand login-brand login-brand-logo">
          <img src="/brand/carta-viva/logo-horizontal-negative.png" alt="Carta Viva" />
          <small>Volver a la web</small>
        </Link>
        <div className="login-brand-copy">
          <p className="eyebrow">Carta Viva</p>
          <h1>Acceso privado para restaurantes.</h1>
          <p>
            Gestiona tu carta, actualiza referencias, revisa señales de sala y mantén viva la bodega desde un mismo
            panel.
          </p>
        </div>
        <div className="login-proof">
          <span>QR</span>
          <span>Guía de maridaje</span>
          <span>Modo sala</span>
          <span>Dashboard</span>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={handleLogin}>
          <div>
            <p className="login-kicker">Área clientes</p>
            <h2>Entrar en Carta Viva</h2>
            <p className="login-muted">Usa las credenciales de tu restaurante.</p>
          </div>

          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="login-help">
            <span>¿No tienes acceso?</span>
            <Link href="/cartavinos#contacto">Solicitar demo privada</Link>
          </div>

          {showDemo && (
            <div className="login-demo">
              <p>Acceso demo</p>
              <div>
                <button type="button" onClick={() => entrarDemo('casapepe@cartavinos.com')}>Casa Pepe</button>
                <button type="button" onClick={() => entrarDemo('lodecarmen@cartavinos.com')}>Lo de Carmen</button>
              </div>
            </div>
          )}
        </form>
      </section>
    </main>
  )
}
