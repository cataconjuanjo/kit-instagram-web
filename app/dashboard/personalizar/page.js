'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

const PALETTES = [
  { nombre: 'Bodega',        primario: '#1C3A2A', fondo: '#FAFAF7', acento: '#B8860B', tipografia: 'serif' },
  { nombre: 'Moderno',       primario: '#111111', fondo: '#FFFFFF', acento: '#4A8C6F', tipografia: 'sans'  },
  { nombre: 'Burdeos',       primario: '#5C1A1A', fondo: '#FDF8F3', acento: '#B87333', tipografia: 'serif' },
  { nombre: 'Bistró',        primario: '#1A2E4A', fondo: '#FAF7F2', acento: '#C4603A', tipografia: 'sans'  },
  { nombre: 'Mineral',       primario: '#2D2D2D', fondo: '#FAFAFA', acento: '#7B8FA0', tipografia: 'sans'  },
  { nombre: 'Rústico',       primario: '#3D2B1F', fondo: '#F7F3EE', acento: '#A0522D', tipografia: 'serif' },
  { nombre: 'Mediterráneo',  primario: '#1B4F72', fondo: '#F8FBFF', acento: '#E67E22', tipografia: 'sans'  },
  { nombre: 'Oro',           primario: '#0A0A0A', fondo: '#F5F0E8', acento: '#C9A84C', tipografia: 'serif' },
]

export default function Personalizar() {
  const [restaurante, setRestaurante] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [colorPrimario, setColorPrimario] = useState('#111111')
  const [colorFondo, setColorFondo] = useState('#ffffff')
  const [colorAcento, setColorAcento] = useState('#4A8C6F')
  const [tipografia, setTipografia] = useState('serif')
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
        setColorAcento(rest.color_acento || '#4A8C6F')
        setTipografia(rest.tipografia || 'serif')
        setLogoUrl(rest.logo_url || null)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  function aplicarPaleta(p) {
    setColorPrimario(p.primario)
    setColorFondo(p.fondo)
    setColorAcento(p.acento)
    setTipografia(p.tipografia)
  }

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
      color_fondo: colorFondo,
      color_acento: colorAcento,
      tipografia,
    }).eq('id', restaurante.id)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
    setGuardando(false)
  }

  const fontPreview = tipografia === 'sans' ? 'system-ui, sans-serif' : 'Georgia, serif'

  if (loading) return <LoadingState />

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Personalizacion"
      title="Identidad visual de la carta"
      subtitle="Elige una paleta base y ajusta los colores para que la carta encaje con la marca del establecimiento."
      narrow
      actions={
        <a className={styles.secondary} href={`/carta/${restaurante?.slug || ''}`} target="_blank" rel="noreferrer">
          Ver carta
        </a>
      }
    >
      {/* Paletas curadas */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Paletas curadas</h2>
            <p className={styles.panelSub}>Punto de partida testeado. Puedes ajustar cualquier color después.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {PALETTES.map(p => {
              const activa = colorPrimario === p.primario && colorFondo === p.fondo && colorAcento === p.acento
              return (
                <button
                  key={p.nombre}
                  onClick={() => aplicarPaleta(p)}
                  style={{
                    border: activa ? `2px solid ${p.primario}` : '2px solid transparent',
                    borderRadius: 10,
                    padding: 0,
                    cursor: 'pointer',
                    background: p.fondo,
                    overflow: 'hidden',
                    boxShadow: activa ? `0 0 0 2px ${p.primario}` : '0 1px 4px rgba(0,0,0,0.08)',
                  }}
                >
                  <div style={{ background: p.primario, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.acento }} />
                  </div>
                  <div style={{ padding: '6px 8px 8px' }}>
                    <p style={{
                      margin: 0, fontSize: 11, fontWeight: 600, color: p.primario,
                      fontFamily: p.tipografia === 'sans' ? 'system-ui, sans-serif' : 'Georgia, serif',
                    }}>{p.nombre}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Colores + tipografía + logo */}
      <section className={styles.gridTwo} style={{ marginTop: 16 }}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Colores</h2>
              <p className={styles.panelSub}>Ajuste fino sobre la paleta elegida.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>Color principal</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Cabecera y estructura</p>
                <div className={styles.swatchRow}>
                  <input className={styles.colorSwatch} type="color" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)} />
                  <input className={styles.input} type="text" value={colorPrimario} onChange={e => setColorPrimario(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Color de acento</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Botones y elementos activos</p>
                <div className={styles.swatchRow}>
                  <input className={styles.colorSwatch} type="color" value={colorAcento} onChange={e => setColorAcento(e.target.value)} />
                  <input className={styles.input} type="text" value={colorAcento} onChange={e => setColorAcento(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Color de fondo</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Fondo de la página</p>
                <div className={styles.swatchRow}>
                  <input className={styles.colorSwatch} type="color" value={colorFondo} onChange={e => setColorFondo(e.target.value)} />
                  <input className={styles.input} type="text" value={colorFondo} onChange={e => setColorFondo(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={styles.label}>Tipografía</label>
                <p className={styles.tiny} style={{ marginTop: 0, marginBottom: 6 }}>Nombre y títulos de la carta</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { id: 'serif', label: 'Clásica', sample: 'Vino' },
                    { id: 'sans',  label: 'Moderna', sample: 'Vino' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTipografia(t.id)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                        border: tipografia === t.id ? `2px solid ${colorPrimario}` : '2px solid #e8e8e8',
                        background: tipografia === t.id ? `${colorPrimario}10` : '#fafafa',
                      }}
                    >
                      <p style={{ margin: '0 0 2px', fontSize: 16, fontFamily: t.id === 'sans' ? 'system-ui, sans-serif' : 'Georgia, serif', color: colorPrimario }}>{t.sample}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#aaa' }}>{t.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.panelDark}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Vista rápida</h2>
              <p className={styles.panelSub}>Comprobación visual antes de guardar.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.previewCard} style={{ background: colorFondo, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ background: colorPrimario, padding: '14px 16px' }}>
                {logoUrl && <img src={logoUrl} alt="Logo" style={{ height: 28, objectFit: 'contain', display: 'block', marginBottom: 8 }} />}
                <p style={{ margin: '0 0 2px', color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: 850, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Carta de vinos</p>
                <p style={{ margin: 0, color: '#fff', fontSize: 18, fontFamily: fontPreview }}>{restaurante?.nombre}</p>
              </div>
              {/* Chips */}
              <div style={{ display: 'flex', gap: 6, padding: '10px 12px', flexWrap: 'wrap' }}>
                {['Todos', 'Tintos', 'Blancos'].map((label, i) => (
                  <span key={label} style={{
                    padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: i === 0 ? colorAcento : 'transparent',
                    border: `1px solid ${i === 0 ? colorAcento : '#ddd'}`,
                    color: i === 0 ? '#fff' : '#888',
                  }}>{label}</span>
                ))}
              </div>
              {/* Wine row */}
              <div style={{ margin: '0 12px 8px', background: '#fff', borderRadius: 8, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111', fontFamily: fontPreview }}>Pago de Capellanes</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>Ribera del Duero · Tinto</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: colorAcento }}>28 €</span>
                </div>
              </div>
              {/* CTA */}
              <div style={{ padding: '0 12px 12px' }}>
                <div style={{ background: colorAcento, borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, color: '#fff', fontSize: 11, fontWeight: 850, letterSpacing: '0.1em' }}>SOMMELIER IA</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo */}
      <section className={styles.panel} style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Logo del restaurante</h2>
            <p className={styles.panelSub}>Aparece en la cabecera de la carta pública. PNG con fondo transparente funciona mejor.</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 92, height: 92, border: '1px solid #dfddd6', borderRadius: 8, display: 'grid', placeItems: 'center', background: colorPrimario, overflow: 'hidden', flexShrink: 0 }}>
              {logoUrl
                ? <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Sin logo</span>
              }
            </div>
            <div>
              <input type="file" accept="image/*" ref={fileRef} onChange={subirLogo} style={{ display: 'none' }} />
              <button className={styles.secondary} onClick={() => fileRef.current.click()} disabled={subiendoLogo}>
                {subiendoLogo ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <button
        className={styles.primary}
        onClick={guardar}
        disabled={guardando}
        style={{ width: '100%', marginTop: 16, background: guardado ? '#4A8C6F' : undefined, borderColor: guardado ? '#4A8C6F' : undefined }}
      >
        {guardado ? 'Guardado' : guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </ModuleShell>
  )
}
