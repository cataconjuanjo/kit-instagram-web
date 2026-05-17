'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

export default function SeleccionEspecial() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [seleccion, setSeleccion] = useState([])
  const [loading, setLoading] = useState(true)
  const [vinoElegido, setVinoElegido] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data: vinosData } = await supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true)
        setVinos(vinosData || [])
        const { data: selData } = await supabase
          .from('seleccion_especial')
          .select('*, vinos(nombre, bodega, tipo, region)')
          .eq('restaurante_id', rest.id)
          .eq('activo', true)
          .order('orden')
        setSeleccion(selData || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function anadirSeleccion() {
    if (!vinoElegido || !nota.trim()) return
    setGuardando(true)
    const { data, error } = await supabase.from('seleccion_especial').insert([{
      restaurante_id: restaurante.id,
      vino_id: vinoElegido,
      nota_personal: nota,
      orden: seleccion.length
    }]).select('*, vinos(nombre, bodega, tipo, region)')
    if (!error) {
      setSeleccion([...seleccion, data[0]])
      setVinoElegido('')
      setNota('')
    }
    setGuardando(false)
  }

  async function quitarSeleccion(id) {
    await supabase.from('seleccion_especial').update({ activo: false }).eq('id', id)
    setSeleccion(seleccion.filter(s => s.id !== id))
  }

  const tipoDot = { tinto: '#7B2D2D', blanco: '#C4A55A', rosado: '#C47A8A', espumoso: '#4A8C6F', generoso: '#854F0B', dulce: '#993556', naranja: '#D85A30' }
  const disponibles = vinos.filter(v => !seleccion.some(s => s.vino_id === v.id))

  if (loading) return <LoadingState />

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Seleccion destacada"
      title="@cataconjuanjo"
      subtitle="El escaparate editorial de la carta: hasta cuatro vinos que merece la pena empujar por calidad, oportunidad comercial o relato de sala."
      narrow
    >
      <section className={styles.statsGrid}>
        <div className={styles.stat}>
          <p className={styles.statValue}>{seleccion.length}/4</p>
          <p className={styles.statLabel}>Vinos destacados</p>
        </div>
        <div className={styles.stat}>
          <p className={styles.statValue}>{disponibles.length}</p>
          <p className={styles.statLabel}>Referencias disponibles</p>
        </div>
      </section>

      {seleccion.length < 4 && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Anadir vino destacado</h2>
              <p className={styles.panelSub}>Selecciona una referencia y deja una nota breve, vendible y humana.</p>
            </div>
            <span className={styles.badge}>{4 - seleccion.length} huecos</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div className={styles.full}>
                <label className={styles.label}>Vino</label>
                <select className={styles.select} value={vinoElegido} onChange={e => setVinoElegido(e.target.value)}>
                  <option value="">Selecciona un vino...</option>
                  {disponibles.map(v => (
                    <option key={v.id} value={v.id}>{v.nombre} · {v.bodega}</option>
                  ))}
                </select>
              </div>
              <div className={styles.full}>
                <label className={styles.label}>Nota personal</label>
                <textarea
                  className={styles.textarea}
                  value={nota}
                  onChange={e => setNota(e.target.value)}
                  placeholder="Por que lo recomiendas, con que plato lo defenderias o que lo hace especial..."
                />
              </div>
              <div className={styles.full}>
                <button
                  className={styles.primary}
                  onClick={anadirSeleccion}
                  disabled={guardando || !vinoElegido || !nota.trim()}
                >
                  {guardando ? 'Guardando...' : 'Anadir seleccion'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={styles.sectionHead}>
        <div>
          <h2 className={styles.sectionTitle}>Seleccion actual</h2>
          <p className={styles.sectionText}>Estos vinos aparecen destacados en la carta publica.</p>
        </div>
      </section>

      {seleccion.length ? (
        <div className={styles.itemStack}>
          {seleccion.map((s, index) => (
            <article className={styles.itemCard} key={s.id}>
              <div className={styles.sectionHead} style={{ margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                  <span className={styles.dot} style={{ background: tipoDot[s.vinos?.tipo] || '#8b8278', marginTop: 6 }} />
                  <div>
                    <p className={styles.eyebrow} style={{ marginBottom: 5 }}>Seleccion {index + 1}</p>
                    <h3 className={styles.sectionTitle}>{s.vinos?.nombre}</h3>
                    <p className={styles.sectionText}>{s.vinos?.bodega} · {s.vinos?.region || 'Sin region'}</p>
                  </div>
                </div>
                <button className={styles.ghost} onClick={() => quitarSeleccion(s.id)}>Quitar</button>
              </div>
              <p className={styles.lead} style={{ marginTop: 14, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {s.nota_personal}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>Aun no hay vinos destacados.</div>
      )}
    </ModuleShell>
  )
}
