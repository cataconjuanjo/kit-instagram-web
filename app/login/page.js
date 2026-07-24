'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '../supabase'
import { clearAdminRestaurantEmail, clearDemoEmail, isAdminEmail } from '../demo'
import BrandLogo from '../components/BrandLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

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
      if (isAdminEmail(email)) {
        window.location.href = '/admin/consultoria'
      } else {
        // Comprobar si este usuario tiene un kiosko asociado
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            const res  = await fetch('/api/kiosko/me', {
              headers: { Authorization: `Bearer ${session.access_token}` },
            })
            const data = await res.json()
            if (data.tienda?.slug) {
              window.location.href = `/kiosko-admin/${data.tienda.slug}`
              return
            }
          }
        } catch { /* si falla, continúa al dashboard normal */ }
        window.location.href = '/dashboard'
      }
    }
    setLoading(false)
  }

  async function handlePasswordReset() {
    setError('')
    setResetSent(false)
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Introduce tu email para enviarte el enlace de recuperación')
      return
    }
    setResetLoading(true)
    await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setResetSent(true)
    setResetLoading(false)
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Link href="/cartavinos" className="brand login-brand login-brand-logo">
          <BrandLogo variant="horizontalNegative" priority />
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
            <p className="login-kicker">Área clientes</p>
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
          {resetSent && <p className="login-muted">Si el email pertenece a una cuenta activa, recibirás un enlace para crear una nueva contraseña.</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="login-help">
            <button type="button" onClick={handlePasswordReset} disabled={resetLoading} style={{ border: 'none', background: 'transparent', padding: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
              {resetLoading ? 'Enviando...' : 'He olvidado mi contraseña'}
            </button>
            <Link href="/cartavinos#contacto">Solicitar demo privada</Link>
          </div>
        </form>
      </section>
    </main>
  )
}
