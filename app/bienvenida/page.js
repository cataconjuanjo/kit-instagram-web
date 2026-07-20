'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '../supabase'
import BrandLogo from '../components/BrandLogo'

export default function Bienvenida() {
  const [estado, setEstado] = useState('cargando')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
        setEstado('listo')
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setEstado('listo')
        return
      }
      if (typeof window !== 'undefined' && !window.location.hash.includes('access_token')) {
        setEstado('sin-token')
      }
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
      setErrorMsg('No se pudo establecer la contraseña. El enlace puede haber caducado; pide al equipo de Carta Viva que te envíe uno nuevo.')
      setGuardando(false)
      return
    }

    setEstado('exito')
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('carta_viva_recien_activado', '1')
    }
    setTimeout(() => { window.location.href = '/dashboard?bienvenida=1' }, 2500)
  }

  if (estado === 'cargando') {
    return (
      <main className="login-page">
        <section className="login-brand-panel">
          <Link href="/cartavinos" className="brand login-brand login-brand-logo">
            <BrandLogo variant="horizontalNegative" priority />
            <small>por Cata con Juanjo</small>
          </Link>
        </section>
        <section className="login-form-panel">
          <div className="login-card" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <p style={{ color: '#888', fontSize: 15 }}>Verificando tu invitación...</p>
          </div>
        </section>
      </main>
    )
  }

  if (estado === 'sin-token') {
    return (
      <main className="login-page">
        <section className="login-brand-panel">
          <Link href="/cartavinos" className="brand login-brand login-brand-logo">
            <BrandLogo variant="horizontalNegative" priority />
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

  if (estado === 'exito') {
    return (
      <main className="login-page">
        <section className="login-brand-panel">
          <Link href="/cartavinos" className="brand login-brand login-brand-logo">
            <BrandLogo variant="horizontalNegative" priority />
            <small>por Cata con Juanjo</small>
          </Link>
          <div className="login-brand-copy">
            <p className="eyebrow">Todo listo</p>
            <h1>Tu cuenta está activa.</h1>
            <p>En un momento empezamos el recorrido para publicar tu primera carta.</p>
          </div>
        </section>
        <section className="login-form-panel">
          <div className="login-card" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 40 }}>✓</span>
            <h2 style={{ textAlign: 'center', fontSize: 22 }}>Bienvenido a Carta Viva</h2>
            <p className="login-muted" style={{ textAlign: 'center' }}>
              Tu contraseña está guardada. El siguiente paso será cargar vinos y platos.
            </p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <Link href="/cartavinos" className="brand login-brand login-brand-logo">
          <BrandLogo variant="horizontalNegative" priority />
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
            {guardando ? 'Activando cuenta...' : 'Activar mi cuenta'}
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
