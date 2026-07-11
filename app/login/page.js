'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, clearDemoEmail, isAdminEmail } from '../demo'

export default function Login() {
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
      setError('Email o contrasena incorrectos')
    } else {
      clearAdminRestaurantEmail()
      clearDemoEmail()
      window.location.href = isAdminEmail(email) ? '/admin/consultoria' : '/dashboard'
    }
    setLoading(false)
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
          <h1>Acceso privado Carta Viva.</h1>
          <p>
            Gestiona referencias, stock, actividad comercial y decisiones de bodega desde un mismo panel profesional.
          </p>
        </div>
        <div className="login-proof">
          <span>Bodega</span>
          <span>Referencias</span>
          <span>Rentabilidad</span>
          <span>Dashboard</span>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={handleLogin}>
          <div>
            <p className="login-kicker">Area clientes</p>
            <h2>Entrar en Carta Viva</h2>
            <p className="login-muted">Usa tus credenciales de acceso.</p>
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
            Contrasena
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
            <span>No tienes acceso?</span>
            <Link href="/cartavinos#contacto">Solicitar demo privada</Link>
          </div>

        </form>
      </section>
    </main>
  )
}
