'use client'

import { useMemo, useState } from 'react'
import { supabase } from '../supabase'
import ResponsiveOverlay from './ResponsiveOverlay'
import styles from './module.module.css'

const RESTAURANTE_PREFIX = '[RESTAURANTE] '
const esSugerenciaRestaurante = item => String(item.nota_personal || '').startsWith(RESTAURANTE_PREFIX)

export default function SuggestionDialog({ open, onClose, restaurante, vinos, seleccion, onChange }) {
  const actual = useMemo(
    () => (seleccion || []).find(esSugerenciaRestaurante),
    [seleccion]
  )
  const [vinoElegido, setVinoElegido] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const vinoActual = vinos.find(vino => String(vino.id) === String(actual?.vino_id))
  const disponibles = vinos.filter(vino => vino.activo !== false && String(vino.id) !== String(actual?.vino_id))

  async function guardar() {
    if (!restaurante?.id || !vinoElegido || !nota.trim()) return
    setGuardando(true)
    setError('')
    const { data, error: insertError } = await supabase.from('seleccion_especial').insert([{
      restaurante_id: restaurante.id,
      vino_id: vinoElegido,
      nota_personal: `${RESTAURANTE_PREFIX}${nota.trim()}`,
      orden: 0,
    }]).select().single()

    if (insertError) {
      setError('No se ha podido guardar. Inténtalo de nuevo.')
    } else {
      onChange?.([...(seleccion || []).filter(item => !esSugerenciaRestaurante(item)), data])
      setVinoElegido('')
      setNota('')
      onClose()
    }
    setGuardando(false)
  }

  async function quitar() {
    if (!actual?.id) return
    setGuardando(true)
    setError('')
    const { error: updateError } = await supabase
      .from('seleccion_especial')
      .update({ activo: false })
      .eq('id', actual.id)

    if (updateError) {
      setError('No se ha podido quitar la sugerencia.')
    } else {
      onChange?.((seleccion || []).filter(item => item.id !== actual.id))
      onClose()
    }
    setGuardando(false)
  }

  return (
    <ResponsiveOverlay
      open={open}
      onClose={() => !guardando && onClose()}
      size="modal"
      eyebrow="Escaparate de la carta"
      title="Sugerencia de la casa"
      description="Elige un único vino y explica en una frase por qué merece la pena pedirlo hoy."
      footer={actual ? (
        <>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={guardando}>Cerrar</button>
          <button type="button" className={styles.danger} onClick={quitar} disabled={guardando}>
            {guardando ? 'Quitando…' : 'Quitar sugerencia'}
          </button>
        </>
      ) : (
        <>
          <button type="button" className={styles.ghost} onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className={styles.primary} onClick={guardar} disabled={guardando || !vinoElegido || !nota.trim()}>
            {guardando ? 'Guardando…' : 'Publicar sugerencia'}
          </button>
        </>
      )}
    >
      {actual ? (
        <article className={styles.itemCard}>
          <p className={styles.eyebrow}>Recomendación activa</p>
          <h3 className={styles.sectionTitle}>{vinoActual?.nombre || 'Vino recomendado'}</h3>
          <p className={styles.sectionText}>{vinoActual?.bodega || ''}{vinoActual?.region ? ` · ${vinoActual.region}` : ''}</p>
          <p className={styles.lead} style={{ marginTop: 16, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
            {String(actual.nota_personal || '').replace(RESTAURANTE_PREFIX, '')}
          </p>
        </article>
      ) : (
        <div className={styles.formGrid}>
          <div className={styles.full}>
            <label className={styles.label}>Vino</label>
            <select className={styles.select} value={vinoElegido} onChange={event => setVinoElegido(event.target.value)}>
              <option value="">Selecciona un vino…</option>
              {disponibles.map(vino => (
                <option key={vino.id} value={vino.id}>{vino.nombre} · {vino.bodega}</option>
              ))}
            </select>
          </div>
          <div className={styles.full}>
            <label className={styles.label}>Nota personal</label>
            <textarea
              className={styles.textarea}
              value={nota}
              onChange={event => setNota(event.target.value)}
              placeholder="Por qué lo recomendáis, con qué plato o qué lo hace especial…"
              maxLength={240}
            />
            <p className={styles.sectionText}>{nota.length}/240 caracteres</p>
          </div>
        </div>
      )}
      {error && <div className={styles.empty} role="alert" style={{ color: '#9b3535', minHeight: 0 }}>{error}</div>}
    </ResponsiveOverlay>
  )
}
