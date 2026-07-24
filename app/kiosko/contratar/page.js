'use client'

import { useState } from 'react'
import Link from 'next/link'
import BrandLogo from '../../components/BrandLogo'
import styles from './contratar.module.css'

export default function ContratarKioskoPage() {
  const [form, setForm]         = useState({ nombre: '', email: '', ciudad: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError]       = useState('')

  const set = (campo) => (e) => setForm(f => ({ ...f, [campo]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const res  = await fetch('/api/kiosko/contratar', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al procesar la solicitud')
      window.location.href = data.url
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <Link href="/">
          <BrandLogo variant="horizontalDark" />
        </Link>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <p className={styles.eyebrow}>Kiosko Digital</p>
          <h1 className={styles.titulo}>Crea tu kiosko de vinos</h1>
          <p className={styles.desc}>
            Un panel completo para gestionar tu carta de vinos con fotos, precios y stock.<br />
            Sin instalaciones. Empieza en minutos.
          </p>
        </div>

        <div className={styles.features}>
          <div className={styles.feat}><span>🍷</span> Catálogo ilimitado de vinos</div>
          <div className={styles.feat}><span>📸</span> Fotos de botella por referencia</div>
          <div className={styles.feat}><span>📦</span> Control de stock y ubicación</div>
          <div className={styles.feat}><span>📄</span> Importación desde Excel o PDF</div>
          <div className={styles.feat}><span>🌐</span> Página pública de tu carta</div>
          <div className={styles.feat}><span>⚡</span> Actualizaciones en tiempo real</div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            Nombre de tu vinoteca / bodega *
            <input
              type="text"
              value={form.nombre}
              onChange={set('nombre')}
              required
              placeholder="Vinoteca El Catador"
              autoComplete="organization"
            />
          </label>
          <label>
            Tu email de acceso *
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </label>
          <label>
            Ciudad (opcional)
            <input
              type="text"
              value={form.ciudad}
              onChange={set('ciudad')}
              placeholder="Madrid"
              autoComplete="address-level2"
            />
          </label>

          {error && <p className={styles.errorMsg}>{error}</p>}

          <button type="submit" className={styles.btnPagar} disabled={enviando}>
            {enviando ? 'Redirigiendo...' : 'Continuar al pago →'}
          </button>

          <p className={styles.legal}>
            Al continuar aceptas los términos de uso. Puedes cancelar en cualquier momento.
          </p>
        </form>
      </div>

      <p className={styles.footer}>
        ¿Tienes dudas? <a href="mailto:cataconjuanjo@gmail.com">Escríbenos</a>
      </p>
    </main>
  )
}
