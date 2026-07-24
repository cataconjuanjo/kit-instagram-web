'use client'

import { useEffect, useState } from 'react'
import styles from './admin-home.module.css'

const FORM_VACIO = {
  nombre: '', slug: '', ciudad: '', descripcion: '', direccion: '',
  telefono: '', email: '', logo_url: '',
  color_primario: '#1a1a2e', color_acento: '#c9a96e',
}

function slugificar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

export default function KioskoAdminHome() {
  const [tiendas, setTiendas]   = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(FORM_VACIO)
  const [slugManual, setSlugManual] = useState(false)
  const [guardando, setGuardando]   = useState(false)
  const [msg, setMsg]               = useState('')

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch('/api/kiosko/admin/tiendas')
      const data = await res.json()
      setTiendas(data.tiendas || [])
    } catch { /* silent */ }
    setCargando(false)
  }

  function cambiar(campo, valor) {
    setForm(prev => {
      const siguiente = { ...prev, [campo]: valor }
      // Auto-slug a partir del nombre mientras no se haya editado manualmente
      if (campo === 'nombre' && !slugManual) {
        siguiente.slug = slugificar(valor)
      }
      return siguiente
    })
  }

  function cambiarSlug(valor) {
    setSlugManual(true)
    setForm(prev => ({ ...prev, slug: slugificar(valor) }))
  }

  async function crear() {
    if (!form.nombre.trim()) return setMsg('El nombre es obligatorio')
    setGuardando(true)
    setMsg('')
    try {
      const res = await fetch('/api/kiosko/admin/tiendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear')
      await cargar()
      setModal(false)
      setForm(FORM_VACIO)
      setSlugManual(false)
    } catch (err) {
      setMsg(err.message)
    }
    setGuardando(false)
  }

  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.titulo}>Kiosko Admin</h1>
          <p className={styles.subtitulo}>Gestión de tiendas y kioscos virtuales de vino</p>
        </div>
        <button className={styles.btnPrimario} onClick={() => { setModal(true); setMsg('') }} type="button">
          + Nueva tienda
        </button>
      </header>

      <div className={styles.contenido}>
        {cargando ? (
          <p className={styles.cargando}>Cargando...</p>
        ) : tiendas.length === 0 ? (
          <div className={styles.vacio}>
            <p>No hay tiendas todavía.</p>
            <button className={styles.btnPrimario} onClick={() => setModal(true)} type="button">
              Crear la primera tienda
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {tiendas.map(t => (
              <div key={t.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={`${styles.estado} ${t.activo ? styles.activo : styles.inactivo}`}>
                    {t.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <h2 className={styles.cardNombre}>{t.nombre}</h2>
                {t.ciudad && <p className={styles.cardCiudad}>{t.ciudad}</p>}
                <p className={styles.cardSlug}>/{t.slug}</p>
                <div className={styles.cardActions}>
                  <a
                    href={`/kiosko-admin/${t.slug}`}
                    className={styles.btnSecundario}
                  >
                    Gestionar vinos
                  </a>
                  <a
                    href={`/kiosko/${t.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.btnLink}
                  >
                    Ver kiosko →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nueva tienda */}
      {modal && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Nueva tienda</h2>
              <button onClick={() => setModal(false)} type="button" className={styles.modalClose}>✕</button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGrid}>
                <div className={`${styles.formField} ${styles.full}`}>
                  <label>Nombre de la tienda *</label>
                  <input
                    value={form.nombre}
                    onChange={e => cambiar('nombre', e.target.value)}
                    placeholder="Vinoteca El Cepillo"
                    autoFocus
                  />
                </div>

                <div className={styles.formField}>
                  <label>
                    Slug (URL del kiosko)
                    <span className={styles.labelHint}> — solo letras, números y guiones</span>
                  </label>
                  <div className={styles.slugWrap}>
                    <span className={styles.slugPrefijo}>/kiosko/</span>
                    <input
                      value={form.slug}
                      onChange={e => cambiarSlug(e.target.value)}
                      placeholder="vinoteca-el-cepillo"
                    />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label>Ciudad</label>
                  <input value={form.ciudad} onChange={e => cambiar('ciudad', e.target.value)} placeholder="Málaga" />
                </div>

                <div className={`${styles.formField} ${styles.full}`}>
                  <label>Descripción (se muestra en la pantalla de bienvenida)</label>
                  <input value={form.descripcion} onChange={e => cambiar('descripcion', e.target.value)} placeholder="Más de 200 referencias de vino seleccionadas con criterio" />
                </div>

                <div className={styles.formField}>
                  <label>Email de contacto</label>
                  <input type="email" value={form.email} onChange={e => cambiar('email', e.target.value)} placeholder="info@tienda.com" />
                </div>

                <div className={styles.formField}>
                  <label>Teléfono</label>
                  <input value={form.telefono} onChange={e => cambiar('telefono', e.target.value)} placeholder="+34 600 000 000" />
                </div>

                <div className={`${styles.formField} ${styles.full}`}>
                  <label>URL del logo</label>
                  <input value={form.logo_url} onChange={e => cambiar('logo_url', e.target.value)} placeholder="https://..." />
                </div>

                <div className={styles.formField}>
                  <label>Color principal (fondo)</label>
                  <div className={styles.colorWrap}>
                    <input type="color" value={form.color_primario} onChange={e => cambiar('color_primario', e.target.value)} className={styles.colorPicker} />
                    <input value={form.color_primario} onChange={e => cambiar('color_primario', e.target.value)} placeholder="#1a1a2e" className={styles.colorText} />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label>Color acento (botones y precios)</label>
                  <div className={styles.colorWrap}>
                    <input type="color" value={form.color_acento} onChange={e => cambiar('color_acento', e.target.value)} className={styles.colorPicker} />
                    <input value={form.color_acento} onChange={e => cambiar('color_acento', e.target.value)} placeholder="#c9a96e" className={styles.colorText} />
                  </div>
                </div>
              </div>

              {form.slug && (
                <div className={styles.preview}>
                  <span>Kiosko disponible en: </span>
                  <strong>/kiosko/{form.slug}</strong>
                  <span> · Admin: </span>
                  <strong>/kiosko-admin/{form.slug}</strong>
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              {msg && <span className={styles.msgError}>{msg}</span>}
              <button onClick={() => setModal(false)} type="button" className={styles.btnSecundarioOscuro}>
                Cancelar
              </button>
              <button onClick={crear} disabled={guardando} type="button" className={styles.btnPrimario}>
                {guardando ? 'Creando...' : 'Crear tienda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
