'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import ResponsiveOverlay from '../ResponsiveOverlay'

const TIPOS = [
  { id: 'mejora', label: 'Algo que mejoraría' },
  { id: 'problema', label: 'Algo no funciona' },
  { id: 'nueva_funcion', label: 'Nueva función' },
  { id: 'otro', label: 'Otro comentario' },
]

const ESTADO_LABEL = {
  nueva: 'Recibida',
  revisando: 'En revisión',
  resuelta: 'Resuelta',
  descartada: 'Descartada',
}

function fecha(value) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value))
}

export default function SugerenciasPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [sugerencias, setSugerencias] = useState([])
  const [tipo, setTipo] = useState('mejora')
  const [mensaje, setMensaje] = useState('')
  const [estadoEnvio, setEstadoEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [formAbierto, setFormAbierto] = useState(false)

  const cargarSugerencias = useCallback(async (restauranteId) => {
    if (!restauranteId) return
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch(`/api/sugerencias?restaurante_id=${restauranteId}`, {
      headers: { Authorization: `Bearer ${token || ''}` },
    })
    const body = await res.json()
    if (res.ok) setSugerencias(body.sugerencias || [])
  }, [])

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data } = await supabase.from('restaurantes').select('id, nombre').eq('email', email).single()
      setRestaurante(data || null)
      if (data?.id) await cargarSugerencias(data.id)
      setLoading(false)
    }
    cargar()
  }, [cargarSugerencias])

  async function enviar(event) {
    event.preventDefault()
    if (!restaurante?.id || mensaje.trim().length < 10) return
    setEnviando(true)
    setEstadoEnvio('')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch('/api/sugerencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify({
        restaurante_id: restaurante.id,
        tipo,
        mensaje,
        pagina: document.referrer || window.location.pathname,
      }),
    })
    const body = await res.json()
    if (res.ok) {
      setMensaje('')
      setTipo('mejora')
      setEstadoEnvio('Gracias. La sugerencia ha llegado correctamente.')
      await cargarSugerencias(restaurante.id)
      setFormAbierto(false)
    } else {
      setEstadoEnvio(body.error || 'No se pudo enviar. Inténtalo de nuevo.')
    }
    setEnviando(false)
  }

  if (loading) return <LoadingState />

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Tu opinión"
      title="Buzón de sugerencias"
      subtitle="Cuéntanos qué te falta, qué cambiarías o si algo no está funcionando como esperabas."
      narrow
    >
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>¿Quieres contarnos algo?</h2>
            <p className={styles.panelSub}>Envía un comentario breve sin perder el historial.</p>
          </div>
          <button type="button" className={styles.primary} onClick={() => setFormAbierto(true)}>Enviar sugerencia</button>
        </div>
        {estadoEnvio && <div className={styles.panelBody}><p className={styles.sectionText}>{estadoEnvio}</p></div>}
      </section>

      <ResponsiveOverlay
        open={formAbierto}
        onClose={() => !enviando && setFormAbierto(false)}
        size="modal"
        eyebrow="Tu opinión"
        title="Enviar sugerencia"
        description="Cuéntanos qué mejorarías o si algo no funciona como esperabas."
        footer={
          <>
            <button type="button" className={styles.ghost} onClick={() => setFormAbierto(false)} disabled={enviando}>Cancelar</button>
            <button type="submit" form="restaurant-feedback-form" className={styles.primary} disabled={enviando || mensaje.trim().length < 10}>
              {enviando ? 'Enviando…' : 'Enviar sugerencia'}
            </button>
          </>
        }
      >
        <form id="restaurant-feedback-form" onSubmit={enviar}>
          <div className={styles.formGrid}>
            <label>
              <span className={styles.label}>Tipo de comentario</span>
              <select className={styles.select} value={tipo} onChange={event => setTipo(event.target.value)}>
                {TIPOS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className={styles.full}>
              <span className={styles.label}>¿Qué nos quieres contar?</span>
              <textarea className={styles.textarea} value={mensaje} onChange={event => setMensaje(event.target.value)} rows={8} maxLength={3000} required />
            </label>
          </div>
          <p className={styles.tiny}>{mensaje.length} / 3000</p>
          {estadoEnvio && <p className={styles.sectionText}>{estadoEnvio}</p>}
        </form>
      </ResponsiveOverlay>

      <section className={styles.panel} style={{ display: 'none' }} aria-hidden="true">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Enviar comentario</h2>
            <p className={styles.panelSub}>Lo revisaremos para priorizar mejoras útiles para el trabajo diario.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <form onSubmit={enviar}>
            <div className={styles.formGrid}>
              <label>
                <span className={styles.label}>Tipo de comentario</span>
                <select className={styles.select} value={tipo} onChange={event => setTipo(event.target.value)}>
                  {TIPOS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className={styles.full}>
                <span className={styles.label}>¿Qué nos quieres contar?</span>
                <textarea
                  className={styles.textarea}
                  value={mensaje}
                  onChange={event => setMensaje(event.target.value)}
                  rows={8}
                  maxLength={3000}
                  placeholder="Por ejemplo: en inventario me vendría bien filtrar por proveedor, o al guardar un vino aparece un error..."
                  required
                />
              </label>
            </div>
            <p className={styles.tiny}>{mensaje.length} / 3000</p>
            {estadoEnvio && <p className={styles.sectionText}>{estadoEnvio}</p>}
            <button className={styles.primary} type="submit" disabled={enviando || mensaje.trim().length < 10}>
              {enviando ? 'Enviando...' : 'Enviar sugerencia'}
            </button>
          </form>
        </div>
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Tus últimas sugerencias</h2>
            <p className={styles.panelSub}>Aquí puedes ver si ya están recibidas, en revisión o resueltas.</p>
          </div>
          <span className={styles.badge}>{sugerencias.length}</span>
        </div>
        <div className={styles.panelBody}>
          {sugerencias.length ? (
            <div className={styles.itemStack}>
              {sugerencias.map(item => (
                <article className={styles.itemCard} key={item.id}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <p className={styles.eyebrow}>{TIPOS.find(tipoItem => tipoItem.id === item.tipo)?.label || item.tipo} · {fecha(item.created_at)}</p>
                      <h3 className={styles.sectionTitle}>{item.mensaje}</h3>
                      {item.respuesta_publica && <p className={styles.sectionText} style={{ marginTop: 8 }}>{item.respuesta_publica}</p>}
                    </div>
                    <span className={styles.badge}>{ESTADO_LABEL[item.estado] || item.estado}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>Aún no has enviado sugerencias desde este restaurante.</div>
          )}
        </div>
      </section>
    </ModuleShell>
  )
}
