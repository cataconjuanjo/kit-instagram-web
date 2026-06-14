'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '../supabase'

export default function Bienvenida() {
  // estado: 'cargando' | 'listo' | 'sin-token' | 'exito' | 'error-expirado'
  const [estado, setEstado] = useState('cargando')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    // Supabase detecta automáticamente el access_token en el hash de la URL
    // y dispara onAuthStateChange con el evento correspondiente
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
        setEstado('listo')
      }
    })

    // También comprobamos si ya hay sesión activa (ej. el usuario vuelve a la página)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setEstado('listo')
        return
      }
      // Si no hay sesión y no hay token en la URL → no tiene acceso
      if (typeof window !== 'undefined' && !window.location.hash.includes('access_token')) {
        setEstado('sin-token')
      }
      // Si hay hash con access_token, esperamos a que onAuthStateChange lo procese
    })

    return () => subscription.unsubscribe()
  }, [])

  async function activarCuenta(e) {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      setErrorMsg('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setErrorMsg('Las contraseñas no coinciden.')
      return
    }

    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setErrorMsg('No se pudo establecer la contraseña. El enlace puede haber caducado — pide al equipo de Carta Viva que te envíe uno nuevo.')
      setGuardando(false)
      return
    }

    setEstado('exito')
    setTimeout(() => { window.location.href = '/dashboard' }, 2500)
  }

  // ── Cargando ────────────────────────────────────────────────
  if (estado === 'cargando') {
    return (
      <main className="login-page">
        <section className="login-brand-panel">
          <Link href="/cartavinos" className="brand login-brand login-brand-logo">
            <img src="/brand/carta-viva/logo-horizontal-negative.png" alt="Carta Viva" />
            <small>por Cata con Juanjo</small>
          </Link>
        </section>
        <section className="login-form-panel">
          <div className="login-card" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <p style={{ color: '#888', fontSize: 15 }}>Verificando tu invitación…</p>
          </div>
        </section>
      </main>
    )
  }

  // ── Sin token válido ─────────────────────────────────────────
  if (estado === 'sin-token') {
    return (
      <main className="login-page">
        <section className="login-brand-panel">
          <Link href="/cartavinos" className="brand login-brand login-brand-logo">
            <img src="/brand/carta-viva/logo-horizontal-negative.png" alt="Carta Viva" />
            <small>por Cata con Juanjo</small>
          </Link>
        </section>
        <section className="login-form-panel">
          <div className="login-card">
            <div>
              <p className="login-kicker">Acceso no válido</p>
              <h2>Enlace no reconocido</h2>
              <p className="login-muted">
                Este enlace no es válido o ya ha caducado. Si ya tienes cuenta, entra desde el acceso habitual.
                Si acabas de recibir una invitación, asegúrate de hacer clic en el enlace completo del email.
              </p>
            </div>
            <Link href="/login" className="btn btn-primary login-submit" style={{ textAlign: 'center' }}>
              Ir al acceso
            </Link>
          </div>
        </section>
      </main>
    )
  }

  // ── Éxito ────────────────────────────────────────────────────
  if (estado === 'exito') {
    return (
      <main className="login-page">
        <section className="login-brand-panel">
          <Link href="/cartavinos" className="brand login-brand login-brand-logo">
            <img src="/brand/carta-viva/logo-horizontal-negative.png" alt="Carta Viva" />
            <small>por Cata con Juanjo</small>
          </Link>
          <div className="login-brand-copy">
            <p className="eyebrow">Todo listo</p>
            <h1>Tu cuenta está activa.</h1>
            <p>En un momento te llevamos a tu panel de restaurante.</p>
          </div>
        </section>
        <section className="login-form-panel">
          <div className="login-card" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 40 }}>🎉</span>
            <h2 style={{ textAlign: 'center', fontSize: 22 }}>¡Bienvenido a Carta Viva!</h2>
            <p className="login-muted" style={{ textAlign: 'center' }}>
              Tu contraseña está guardada. Accediendo a tu panel…
            </p>
          </div>
        </section>
      </main>
    )
  }

  // ── Formulario principal ─────────────────────────────────────
  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Link href="/cartavinos" className="brand login-brand login-brand-logo">
          <img src="/brand/carta-viva/logo-horizontal-negative.png" alt="Carta Viva" />
          <small>por Cata con Juanjo</small>
        </Link>
        <div className="login-brand-copy">
          <p className="eyebrow">Bienvenido</p>
          <h1>Activa tu cuenta de restaurante.</h1>
          <p>
            Elige la contraseña con la que entrarás a tu panel. Solo tienes que hacerlo una vez.
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
        <form className="login-card" onSubmit={activarCuenta}>
          <div>
            <p className="login-kicker">Activación de cuenta</p>
            <h2>Elige tu contraseña</h2>
            <p className="login-muted">
              Mínimo 8 caracteres. Podrás cambiarla cuando quieras desde Ajustes.
            </p>
          </div>

          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
            />
          </label>

          <label>
            Confirmar contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              required
            />
          </label>

          {errorMsg && <p className="login-error">{errorMsg}</p>}

          <button type="submit" className="btn btn-primary login-submit" disabled={guardando}>
            {guardando ? 'Activando cuenta…' : 'Activar mi cuenta'}
          </button>

          <div className="login-help">
            <span>¿Ya tienes acceso?</span>
            <Link href="/login">Entrar con mis credenciales</Link>
          </div>
        </form>
      </section>
    </main>
  )
}
