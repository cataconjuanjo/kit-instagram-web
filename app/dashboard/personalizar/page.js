'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

export default function Personalizar() {
  const [restaurante, setRestaurante] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [colorPrimario, setColorPrimario] = useState('#111111')
  const [colorFondo, setColorFondo] = useState('#ffffff')
  const [logoUrl, setLogoUrl] = useState(null)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        setColorPrimario(rest.color_primario || '#111111')
        setColorFondo(rest.color_fondo || '#ffffff')
        setLogoUrl(rest.logo_url || null)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function subirLogo(e) {
    const file = e.target.files[0]
    if (!file) return
    setSubiendoLogo(true)
    const ext = file.name.split('.').pop()
    const fileName = `${restaurante.slug}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(fileName, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('logos').getPublicUrl(fileName)
      const url = data.publicUrl
      await supabase.from('restaurantes').update({ logo_url: url }).eq('id', restaurante.id)
      setLogoUrl(url)
    }
    setSubiendoLogo(false)
  }

  async function guardar() {
    setGuardando(true)
    await supabase.from('restaurantes').update({
      color_primario: colorPrimario,
      color_fondo: colorFondo
    }).eq('id', restaurante.id)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    setGuardando(false)
  }

  if (loading) return <LoadingState />

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Personalizacion"
      title="Identidad visual de la carta"
      subtitle="Ajusta logo y colores para que la carta publica se sienta integrada con la marca del establecimiento."
      narrow
      actions={
        <a className={styles.secondary} href={`/carta/${restaurante?.slug || ''}`} target="_blank" rel="noreferrer">
          Ver carta
        </a>
      }
    >
      <section className={styles.gridTwo}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Logo del restaurante</h2>
              <p className={styles.panelSub}>La imagen que aparece en la cabecera publica.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ width: 92, height: 92, border: '1px solid #dfddd6', borderRadius: 8, display: 'grid', placeItems: 'center', background: '#fff', overflow: 'hidden', flexShrink: 0 }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span className={styles.tiny}>Sin logo</span>
                )}
              </div>
              <div>
                <p className={styles.sectionText} style={{ marginTop: 0 }}>PNG con fondo transparente funciona mejor sobre cartas claras y oscuras.</p>
                <input type="file" accept="image/*" ref={fileRef} onChange={subirLogo} style={{ display: 'none' }} />
                <button className={styles.secondary} onClick={() => fileRef.current.click()} disabled={subiendoLogo}>
                  {subiendoLogo ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.panelDark}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Vista rapida</h2>
              <p className={styles.panelSub}>Comprobacion visual antes de guardar.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.previewCard} style={{ background: colorFondo }}>
              <div style={{ background: colorPrimario, borderRadius: 8, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {logoUrl && <img src={logoUrl} alt="Logo" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }} />}
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 850, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 3px' }}>{restaurante?.ciudad || 'Ciudad'}</p>
                  <p style={{ color: '#fff', fontSize: 17, fontFamily: 'Georgia, serif', margin: 0 }}>{restaurante?.nombre}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {['Todos', 'Tintos', 'Blancos'].map((filtro, index) => (
                  <span
                    key={filtro}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 999,
                      background: index === 0 ? colorPrimario : 'transparent',
                      border: `1px solid ${colorPrimario}`,
                      color: index === 0 ? '#fff' : colorPrimario,
                      fontSize: 11,
                      fontWeight: 750,
                    }}
                  >
                    {filtro}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Paleta de marca</h2>
            <p className={styles.panelSub}>Dos colores son suficientes para mantener una carta elegante y legible.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.formGrid}>
            <div>
              <label className={styles.label}>Color principal</label>
              <div className={styles.swatchRow}>
                <input className={styles.colorSwatch} type="color" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)} />
                <input className={styles.input} type="text" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={styles.label}>Color de fondo</label>
              <div className={styles.swatchRow}>
                <input className={styles.colorSwatch} type="color" value={colorFondo} onChange={e => setColorFondo(e.target.value)} />
                <input className={styles.input} type="text" value={colorFondo} onChange={e => setColorFondo(e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <button className={styles.primary} onClick={guardar} disabled={guardando} style={{ width: '100%', marginTop: 16, background: guardado ? '#4A8C6F' : undefined, borderColor: guardado ? '#4A8C6F' : undefined }}>
        {guardado ? 'Guardado' : guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </ModuleShell>
  )
}
