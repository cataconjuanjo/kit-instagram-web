'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../supabase'
import styles from './kioscos.module.css'

const ESTADOS = {
  pending:   { label: 'Pendiente',  color: '#e8a83e' },
  active:    { label: 'Activo',     color: '#3ab77e' },
  past_due:  { label: 'Pago late',  color: '#e85e3e' },
  cancelled: { label: 'Cancelado',  color: '#999'    },
  inactive:  { label: 'Inactivo',   color: '#bbb'    },
}

function Badge({ status }) {
  const s = ESTADOS[status] || ESTADOS.inactive
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: s.color + '22',
      color: s.color,
    }}>{s.label}</span>
  )
}

export default function AdminKioscosPage() {
  const [tiendas, setTiendas]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [token, setToken]       = useState(null)
  const [modal, setModal]       = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError]       = useState('')

  const [form, setForm] = useState({
    nombre: '', email: '', slug: '', ciudad: '', color_primario: '#1a1a2e', color_acento: '#c9a96e',
  })

  const cargar = useCallback(async (tok) => {
    setLoading(true)
    const res = await fetch('/api/admin/kiosko/lista', {
      headers: { Authorization: `Bearer ${tok}` },
    })
    const data = await res.json()
    setTiendas(data.tiendas || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setToken(session.access_token)
        cargar(session.access_token)
      }
    })
  }, [cargar])

  function slugSugerido(nombre) {
    return nombre.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  }

  function handleNombreChange(e) {
    const v = e.target.value
    setForm(f => ({ ...f, nombre: v, slug: slugSugerido(v) }))
  }

  async function crearKiosko(e) {
    e.preventDefault()
    setError('')
    setResultado(null)
    setEnviando(true)
    try {
      const res = await fetch('/api/admin/kiosko/crear', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear')
      setResultado(data)
      await cargar(token)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  function cerrarModal() {
    setModal(false)
    setResultado(null)
    setError('')
    setForm({ nombre: '', email: '', slug: '', ciudad: '', color_primario: '#1a1a2e', color_acento: '#c9a96e' })
  }

  async function toggleActivo(tienda) {
    const res = await fetch('/api/admin/kiosko/lista', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ id: tienda.id, activo: !tienda.activo }),
    })
    if (res.ok) {
      setTiendas(prev => prev.map(t => t.id === tienda.id ? { ...t, activo: !tienda.activo } : t))
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Kioscos</h1>
          <p className={styles.sub}>{tiendas.length} tiendas registradas</p>
        </div>
        <button className={styles.btnNuevo} onClick={() => setModal(true)}>+ Nueva tienda</button>
      </div>

      {loading ? (
        <p className={styles.cargando}>Cargando...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Email</th>
                <th>Slug</th>
                <th>Ciudad</th>
                <th>Estado</th>
                <th>Activo</th>
                <th>Alta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tiendas.length === 0 && (
                <tr><td colSpan={8} className={styles.empty}>Sin tiendas todavía</td></tr>
              )}
              {tiendas.map(t => (
                <tr key={t.id}>
                  <td className={styles.tdNombre}>{t.nombre}</td>
                  <td className={styles.tdEmail}>{t.email || '—'}</td>
                  <td>
                    <a href={`/kiosko/${t.slug}`} target="_blank" rel="noreferrer" className={styles.slugLink}>
                      {t.slug}
                    </a>
                  </td>
                  <td>{t.ciudad || '—'}</td>
                  <td><Badge status={t.subscription_status} /></td>
                  <td>
                    <button
                      className={t.activo ? styles.toggleOn : styles.toggleOff}
                      onClick={() => toggleActivo(t)}
                      title={t.activo ? 'Desactivar' : 'Activar'}
                    >
                      {t.activo ? '✓ Sí' : '✗ No'}
                    </button>
                  </td>
                  <td className={styles.tdFecha}>{t.created_at ? new Date(t.created_at).toLocaleDateString('es-ES') : '—'}</td>
                  <td>
                    <a href={`/kiosko-admin/${t.slug}`} target="_blank" rel="noreferrer" className={styles.linkAdmin}>
                      Panel →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={cerrarModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{resultado ? '¡Tienda creada!' : 'Nueva tienda kiosko'}</h2>
              <button className={styles.modalClose} onClick={cerrarModal}>✕</button>
            </div>

            {resultado ? (
              <div className={styles.resultados}>
                <p>La tienda <strong>{form.nombre}</strong> ha sido creada y se ha enviado el email de activación.</p>
                <div className={styles.resultadoLinks}>
                  <div>
                    <p className={styles.resultLabel}>Link de pago</p>
                    <a href={resultado.checkout_url} target="_blank" rel="noreferrer" className={styles.resultLink}>
                      Abrir checkout →
                    </a>
                  </div>
                  <div>
                    <p className={styles.resultLabel}>Link de contraseña</p>
                    <a href={resultado.access_link} target="_blank" rel="noreferrer" className={styles.resultLink}>
                      Abrir link →
                    </a>
                  </div>
                </div>
                <button className={styles.btnNuevo} onClick={cerrarModal}>Cerrar</button>
              </div>
            ) : (
              <form className={styles.form} onSubmit={crearKiosko}>
                <div className={styles.row2}>
                  <label>
                    Nombre de la tienda *
                    <input value={form.nombre} onChange={handleNombreChange} required placeholder="Vinoteca El Catador" />
                  </label>
                  <label>
                    Slug (URL) *
                    <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} required placeholder="vinoteca-el-catador" />
                  </label>
                </div>
                <div className={styles.row2}>
                  <label>
                    Email del cliente *
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="cliente@ejemplo.com" />
                  </label>
                  <label>
                    Ciudad
                    <input value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} placeholder="Madrid" />
                  </label>
                </div>
                <div className={styles.row2}>
                  <label>
                    Color primario
                    <div className={styles.colorRow}>
                      <input type="color" value={form.color_primario} onChange={e => setForm(f => ({ ...f, color_primario: e.target.value }))} />
                      <input value={form.color_primario} onChange={e => setForm(f => ({ ...f, color_primario: e.target.value }))} />
                    </div>
                  </label>
                  <label>
                    Color acento
                    <div className={styles.colorRow}>
                      <input type="color" value={form.color_acento} onChange={e => setForm(f => ({ ...f, color_acento: e.target.value }))} />
                      <input value={form.color_acento} onChange={e => setForm(f => ({ ...f, color_acento: e.target.value }))} />
                    </div>
                  </label>
                </div>

                {error && <p className={styles.formError}>{error}</p>}

                <div className={styles.formActions}>
                  <button type="button" className={styles.btnCancel} onClick={cerrarModal}>Cancelar</button>
                  <button type="submit" className={styles.btnNuevo} disabled={enviando}>
                    {enviando ? 'Creando...' : 'Crear y enviar email'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
