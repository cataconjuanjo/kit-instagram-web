'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

const TIPOS = [
  { id: 'mejora', label: 'Algo que mejoraría' },
  { id: 'problema', label: 'Algo no funciona' },
  { id: 'nueva_funcion', label: 'Nueva función' },
  { id: 'otro', label: 'Otro comentario' },
]

export default function SugerenciasPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [tipo, setTipo] = useState('mejora')
  const [mensaje, setMensaje] = useState('')
  const [estadoEnvio, setEstadoEnvio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data } = await supabase.from('restaurantes').select('id, nombre').eq('email', email).single()
      setRestaurante(data || null)
      setLoading(false)
    }
    cargar()
  }, [])

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
    </ModuleShell>
  )
}
