'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '../../supabase'

export default function KioskoActivar({ params }) {
  const { slug } = use(params)
  const [estado, setEstado] = useState('cargando') // cargando | listo | sin-token | exito
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
        setEstado('listo')
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setEstado('listo'); return }
      if (typeof window !== 'undefined' && !window.location.hash.includes('access_token')) {
        setEstado('sin-token')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function activarCuenta(e) {
    e.preventDefault()
    setErrorMsg('')
    if (password.length < 8) { setErrorMsg('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirm) { setErrorMsg('Las contraseñas no coinciden.'); return }

    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorMsg('No se pudo guardar la contraseña. El enlace puede haber caducado; solicita uno nuevo.')
      setGuardando(false)
      return
    }
    setEstado('exito')
    setTimeout(() => { window.location.href = `/kiosko-admin/${slug}` }, 2000)
  }

  const estilos = {
    page:   { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f3f0', padding: '24px 16px' },
    card:   { background: '#fff', borderRadius: 16, padding: '40px 36px', maxWidth: 420, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,.08)' },
    titulo: { fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: '0 0 8px' },
    sub:    { fontSize: 14, color: '#777', margin: '0 0 28px', lineHeight: 1.6 },
    label:  { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 14 },
    input:  { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, color: '#1a1a2e', background: '#fafafa', outline: 'none' },
    btn:    { width: '100%', padding: '13px', background: '#1a1a2e', color: '#c9a96e', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
    error:  { background: '#fee', border: '1px solid #f99', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c00', margin: '8px 0 0' },
  }

  if (estado === 'cargando') return (
    <div style={estilos.page}>
      <div style={estilos.card}>
        <p style={{ color: '#888', textAlign: 'center' }}>Verificando tu invitación...</p>
      </div>
    </div>
  )

  if (estado === 'sin-token') return (
    <div style={estilos.page}>
      <div style={estilos.card}>
        <h2 style={estilos.titulo}>Enlace no válido</h2>
        <p style={estilos.sub}>Este enlace ha caducado o ya fue usado. Solicita al equipo de Carta Viva que te envíe uno nuevo.</p>
      </div>
    </div>
  )

  if (estado === 'exito') return (
    <div style={estilos.page}>
      <div style={{ ...estilos.card, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <h2 style={estilos.titulo}>Contraseña guardada</h2>
        <p style={estilos.sub}>Entrando a tu kiosko...</p>
      </div>
    </div>
  )

  return (
    <div style={estilos.page}>
      <form style={estilos.card} onSubmit={activarCuenta}>
        <h2 style={estilos.titulo}>Activa tu acceso</h2>
        <p style={estilos.sub}>
          Elige la contraseña con la que entrarás a gestionar tu kiosko de vinos.<br />
          Solo tienes que hacerlo una vez.
        </p>

        <label style={estilos.label}>
          Nueva contraseña
          <input
            style={estilos.input}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            required
            minLength={8}
          />
        </label>

        <label style={estilos.label}>
          Confirmar contraseña
          <input
            style={estilos.input}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="Repite la contraseña"
            required
          />
        </label>

        {errorMsg && <p style={estilos.error}>{errorMsg}</p>}

        <button style={estilos.btn} type="submit" disabled={guardando}>
          {guardando ? 'Guardando...' : 'Crear contraseña y entrar'}
        </button>
      </form>
    </div>
  )
}
