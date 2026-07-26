'use client'

import React, { useEffect, useState, useCallback } from 'react'
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
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: s.color + '22', color: s.color,
    }}>{s.label}</span>
  )
}

function fmtSeg(s) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}

function fmtFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
}

export default function AdminKioscosPage() {
  const [tiendas, setTiendas]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [token, setToken]         = useState(null)

  // modal nueva tienda
  const [modal, setModal]         = useState(false)
  const [enviando, setEnviando]   = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError]         = useState('')
  const [form, setForm] = useState({
    nombre: '', email: '', slug: '', ciudad: '', color_primario: '#1a1a2e', color_acento: '#c9a96e',
  })

  // modal edición
  const [editando, setEditando]   = useState(null) // tienda completa
  const [editForm, setEditForm]   = useState({})
  const [editGuardando, setEditGuardando] = useState(false)
  const [editMsg, setEditMsg]     = useState('')

  // activación Stripe por kiosko
  const [confirmActivacion, setConfirmActivacion] = useState(null) // tienda pendiente de confirmar
  const [preview, setPreview]         = useState(null)  // { url, access_link, email, email_html }
  const [previewing, setPreviewing]   = useState(false)
  const [activando, setActivando]     = useState({}) // { [id]: bool }
  const [activResult, setActivResult] = useState({}) // { [id]: { ok, url, email, error } }
  const [copiadoActiv, setCopiadoActiv] = useState({}) // { [id]: bool }

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

  function abrirEdicion(tienda) {
    setEditando(tienda)
    setEditForm({
      plan:              tienda.plan || '',
      precio_especial:   tienda.precio_especial ?? '',
      setup_fee_incluido: tienda.setup_fee_incluido ?? false,
      propietario_email: tienda.propietario_email || '',
      reset_trial:       false,
    })
    setEditMsg('')
  }

  async function previsualizarActivacion(tienda) {
    const plan = tienda.plan && tienda.plan !== 'trial' ? tienda.plan : 'premium'
    setPreviewing(true)
    setPreview(null)
    try {
      const res = await fetch('/api/admin/kiosko/activacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tienda_slug: tienda.slug, plan, preview: true }),
      })
      const data = await res.json()
      if (res.ok) {
        setPreview({ ...data, tienda, plan })
      } else {
        setPreview({ error: data.error || 'Error al generar preview', tienda, plan })
      }
    } catch (err) {
      setPreview({ error: err.message, tienda, plan })
    } finally {
      setPreviewing(false)
    }
  }

  async function enviarActivacionKiosko(tienda, previewData) {
    const plan = previewData?.plan || (tienda.plan && tienda.plan !== 'trial' ? tienda.plan : 'premium')
    setActivando(prev => ({ ...prev, [tienda.id]: true }))
    setActivResult(prev => { const n = { ...prev }; delete n[tienda.id]; return n })
    try {
      const res = await fetch('/api/admin/kiosko/activacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tienda_slug: tienda.slug, plan }),
      })
      const data = await res.json()
      if (res.ok) {
        setActivResult(prev => ({ ...prev, [tienda.id]: { ok: true, url: data.checkout_url, email: data.email } }))
        setTiendas(prev => prev.map(t => t.id === tienda.id ? { ...t, subscription_status: 'pending' } : t))
      } else {
        setActivResult(prev => ({ ...prev, [tienda.id]: { ok: false, error: data.error || 'Error al enviar activación' } }))
      }
    } catch (err) {
      setActivResult(prev => ({ ...prev, [tienda.id]: { ok: false, error: err.message } }))
    } finally {
      setActivando(prev => { const n = { ...prev }; delete n[tienda.id]; return n })
    }
  }

  function copiarUrlActivacion(tiendaId) {
    const url = activResult[tiendaId]?.url
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopiadoActiv(prev => ({ ...prev, [tiendaId]: true }))
    setTimeout(() => setCopiadoActiv(prev => ({ ...prev, [tiendaId]: false })), 2500)
  }

  async function guardarEdicion(e) {
    e.preventDefault()
    setEditGuardando(true)
    setEditMsg('')
    try {
      const payload = {
        id:                editando.id,
        plan:              editForm.plan || null,
        precio_especial:   editForm.precio_especial !== '' ? Number(editForm.precio_especial) : null,
        setup_fee_incluido: editForm.setup_fee_incluido,
        propietario_email: editForm.propietario_email || null,
      }
      if (editForm.reset_trial) payload.trial_expires_at = null

      const res = await fetch('/api/admin/kiosko/lista', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setTiendas(prev => prev.map(t => t.id === editando.id ? { ...t, ...payload, trial_expires_at: editForm.reset_trial ? null : t.trial_expires_at } : t))
      setEditando(null)
    } catch (err) {
      setEditMsg(err.message)
    } finally {
      setEditGuardando(false)
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
                <th>Email propietario</th>
                <th>Slug</th>
                <th>Plan</th>
                <th>Trial</th>
                <th>Inicio trial</th>
                <th>Estado</th>
                <th>Activo</th>
                <th>Alta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tiendas.length === 0 && (
                <tr><td colSpan={10} className={styles.empty}>Sin tiendas todavía</td></tr>
              )}
              {tiendas.map(t => {
                const esTrial = t.plan === 'trial'
                const expMs = t.trial_expires_at ? new Date(t.trial_expires_at).getTime() : null
                const inicioMs = expMs ? expMs - 2 * 3600 * 1000 : null
                const segsRestantes = esTrial && expMs ? Math.max(0, Math.round((expMs - Date.now()) / 1000)) : null
                const res = activResult[t.id]
                return (
                  <React.Fragment key={t.id}>
                    <tr>
                      <td className={styles.tdNombre}>{t.nombre}</td>
                      <td className={styles.tdEmail}>{t.propietario_email || t.email || '—'}</td>
                      <td>
                        <a href={`/kiosko/${t.slug}`} target="_blank" rel="noreferrer" className={styles.slugLink}>
                          {t.slug}
                        </a>
                      </td>
                      <td>
                        {t.plan ? (
                          <span className={`${styles.planBadge} ${t.plan === 'premium' ? styles.planPremium : t.plan === 'trial' ? styles.planTrial : styles.planBasico}`}>
                            {t.plan}{t.precio_especial ? ` · ${t.precio_especial}€` : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={styles.tdTrial}>
                        {!esTrial ? '—' : expMs === null ? (
                          <span className={styles.trialNone}>Sin iniciar</span>
                        ) : segsRestantes === 0 ? (
                          <span className={styles.trialExp}>Expirado</span>
                        ) : (
                          <span className={styles.trialOk}>{fmtSeg(segsRestantes)} restante</span>
                        )}
                      </td>
                      <td className={styles.tdFecha}>{inicioMs ? fmtFecha(new Date(inicioMs).toISOString()) : '—'}</td>
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
                      <td className={styles.tdAcciones}>
                        <button className={styles.btnEditar} onClick={() => abrirEdicion(t)}>Editar</button>
                        <a href={`/kiosko-admin/${t.slug}`} target="_blank" rel="noreferrer" className={styles.linkAdmin}>
                          Panel →
                        </a>
                        <button
                          className={styles.btnStripe}
                          onClick={() => setConfirmActivacion(t)}
                          disabled={activando[t.id]}
                          title="Enviar email de activación con link de pago Stripe"
                        >
                          {activando[t.id] ? '...' : 'Stripe'}
                        </button>
                      </td>
                    </tr>
                    {res && (
                      <tr className={styles.trResult}>
                        <td colSpan={10}>
                          {res.ok ? (
                            <span className={styles.resultOk}>
                              ✓ Email enviado a <strong>{res.email}</strong>
                              <a href={res.url} target="_blank" rel="noreferrer" className={styles.resultUrlLink}>Ver checkout</a>
                              <button className={styles.btnCopiar} onClick={() => copiarUrlActivacion(t.id)}>
                                {copiadoActiv[t.id] ? '✓ Copiado' : 'Copiar URL'}
                              </button>
                            </span>
                          ) : (
                            <span className={styles.resultError}>Error: {res.error}</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal activación Stripe — dos fases: preview → envío */}
      {confirmActivacion && (
        <div className={styles.modalOverlay} onClick={() => { setConfirmActivacion(null); setPreview(null) }}>
          <div className={styles.modal} style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{preview ? 'Revisar antes de enviar' : 'Activación Stripe'}</h2>
              <button className={styles.modalClose} onClick={() => { setConfirmActivacion(null); setPreview(null) }}>✕</button>
            </div>
            <div className={styles.form}>

              {!preview ? (
                /* ── Fase 1: confirmación inicial ── */
                <>
                  <p style={{ margin: 0, fontSize: 14, color: '#444', lineHeight: 1.6 }}>
                    Destinatario: <strong>{confirmActivacion.propietario_email || confirmActivacion.email}</strong>
                  </p>
                  <p style={{ margin: 0, fontSize: 14, color: '#444', lineHeight: 1.6 }}>
                    Plan: <strong>
                      {confirmActivacion.plan && confirmActivacion.plan !== 'trial' ? confirmActivacion.plan : 'premium'}
                      {' · '}
                      {confirmActivacion.plan === 'basico' ? '59 €/mes' : '99 €/mes'}
                    </strong>
                    {confirmActivacion.precio_especial ? ` (precio especial: ${confirmActivacion.precio_especial} €)` : ''}
                  </p>
                  {preview?.error && (
                    <p style={{ margin: 0, fontSize: 13, color: '#c00' }}>Error: {preview.error}</p>
                  )}
                  <div className={styles.formActions}>
                    <button className={styles.btnCancel} onClick={() => { setConfirmActivacion(null); setPreview(null) }}>Cancelar</button>
                    <button
                      className={styles.btnCancel}
                      disabled={previewing}
                      onClick={() => previsualizarActivacion(confirmActivacion)}
                    >
                      {previewing ? 'Generando...' : 'Ver enlaces primero'}
                    </button>
                    <button
                      className={styles.btnNuevo}
                      disabled={previewing}
                      onClick={() => {
                        const t = confirmActivacion
                        setConfirmActivacion(null)
                        setPreview(null)
                        enviarActivacionKiosko(t, null)
                      }}
                    >
                      Enviar directamente
                    </button>
                  </div>
                </>
              ) : preview.error ? (
                /* ── Error en preview ── */
                <>
                  <p style={{ margin: 0, fontSize: 13, color: '#c00' }}>Error al generar enlaces: {preview.error}</p>
                  <div className={styles.formActions}>
                    <button className={styles.btnCancel} onClick={() => setPreview(null)}>Volver</button>
                  </div>
                </>
              ) : (
                /* ── Fase 2: muestra los enlaces reales ── */
                <>
                  <p style={{ margin: 0, fontSize: 13, color: '#888' }}>
                    Se han generado los enlaces reales. Pruébalos antes de enviar el email.
                  </p>

                  <div className={styles.previewBox}>
                    <p className={styles.previewLabel}>1 · Enlace crear contraseña (para el cliente)</p>
                    <a href={preview.access_link} target="_blank" rel="noreferrer" className={styles.previewLink}>
                      Abrir enlace →
                    </a>
                  </div>

                  <div className={styles.previewBox}>
                    <p className={styles.previewLabel}>2 · Enlace de pago Stripe</p>
                    <a href={preview.checkout_url} target="_blank" rel="noreferrer" className={styles.previewLink}>
                      Abrir checkout →
                    </a>
                  </div>

                  <details style={{ fontSize: 13, color: '#555' }}>
                    <summary style={{ cursor: 'pointer', marginBottom: 8 }}>Ver email completo que recibirá el cliente</summary>
                    <div
                      style={{ border: '1px solid #e8e5df', borderRadius: 8, padding: 16, background: '#fafafa', maxHeight: 320, overflowY: 'auto' }}
                      dangerouslySetInnerHTML={{ __html: preview.email_html }}
                    />
                  </details>

                  <div className={styles.formActions}>
                    <button className={styles.btnCancel} onClick={() => setPreview(null)}>Volver</button>
                    <button
                      className={styles.btnNuevo}
                      onClick={() => {
                        const t = confirmActivacion
                        const p = preview
                        setConfirmActivacion(null)
                        setPreview(null)
                        enviarActivacionKiosko(t, p)
                      }}
                    >
                      Todo correcto — Enviar email al cliente
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal edición */}
      {editando && (
        <div className={styles.modalOverlay} onClick={() => setEditando(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Editar: {editando.nombre}</h2>
              <button className={styles.modalClose} onClick={() => setEditando(null)}>✕</button>
            </div>
            <form className={styles.form} onSubmit={guardarEdicion}>
              <div className={styles.row2}>
                <label>
                  Plan
                  <select value={editForm.plan} onChange={e => setEditForm(f => ({ ...f, plan: e.target.value }))}>
                    <option value="">Sin plan</option>
                    <option value="trial">Trial</option>
                    <option value="basico">Básico</option>
                    <option value="premium">Premium</option>
                  </select>
                </label>
                <label>
                  Precio especial (€/mes)
                  <input
                    type="number" min="0" step="1"
                    value={editForm.precio_especial}
                    onChange={e => setEditForm(f => ({ ...f, precio_especial: e.target.value }))}
                    placeholder="129"
                  />
                </label>
              </div>
              <div className={styles.row2}>
                <label>
                  Email propietario
                  <input
                    type="email"
                    value={editForm.propietario_email}
                    onChange={e => setEditForm(f => ({ ...f, propietario_email: e.target.value }))}
                    placeholder="cliente@ejemplo.com"
                  />
                </label>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={editForm.setup_fee_incluido}
                    onChange={e => setEditForm(f => ({ ...f, setup_fee_incluido: e.target.checked }))}
                  />
                  Puesta en marcha incluida (sin cobrar alta)
                </label>
              </div>

              {editando.plan === 'trial' && (
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={editForm.reset_trial}
                    onChange={e => setEditForm(f => ({ ...f, reset_trial: e.target.checked }))}
                  />
                  Reiniciar contador trial (las 2h vuelven a estar disponibles desde cero)
                </label>
              )}

              {editMsg && <p className={styles.formError}>{editMsg}</p>}

              <div className={styles.formActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setEditando(null)}>Cancelar</button>
                <button type="submit" className={styles.btnNuevo} disabled={editGuardando}>
                  {editGuardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nueva tienda */}
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
