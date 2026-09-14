'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtFormato (ml) {
  if (!ml) return '?'
  if (ml === 375) return '37,5 cl (media)'
  if (ml === 750) return '75 cl'
  if (ml === 1500) return 'Magnum 1,5 L'
  if (ml === 3000) return 'Jeroboam 3 L'
  return `${ml} ml`
}

// ── Componentes ──────────────────────────────────────────────────────────────

function Lado ({ side, label }) {
  if (!side) return <div style={styles.lado}><em>Sin datos</em></div>
  return (
    <div style={styles.lado}>
      <div style={styles.ladoLabel}>{label}</div>
      <div style={styles.nombre}>{side.nombre || '—'}</div>
      <div style={styles.bodega}>{side.bodega}</div>
      <div style={styles.meta}>
        {fmtFormato(side.formato_ml)} · {side.anada || 'S/A'}
      </div>
      <div style={styles.meta}>
        {side.proveedor || '—'}{side.coste != null ? ` — ${Number(side.coste).toFixed(2)} €` : ''}
      </div>
    </div>
  )
}

function CandidatoCard ({ c, procesando, onDecide }) {
  const busy    = procesando === c.id
  const costeA  = c.lado_a?.coste ?? 0
  const costeB  = c.lado_b?.coste ?? 0
  const diffEur = Math.abs(costeA - costeB).toFixed(2)
  const simPct  = c.similitud != null ? `${(c.similitud * 100).toFixed(1)} %` : '?'

  return (
    <div style={styles.card}>
      <div style={styles.sides}>
        <Lado side={c.lado_a} label="A" />
        <div style={styles.centro}>
          <div style={styles.sim}>sim {simPct}</div>
          <div style={styles.diff}>Δ {diffEur} €</div>
        </div>
        <Lado side={c.lado_b} label="B" />
      </div>
      <div style={styles.actions}>
        <button
          style={{ ...styles.btn, ...styles.btnMismo }}
          disabled={busy}
          onClick={() => onDecide(c.id, 'fusionado')}
        >
          Es el mismo vino
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnDistinto }}
          disabled={busy}
          onClick={() => onDecide(c.id, 'distintos')}
        >
          Son distintos
        </button>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function DuplicadosPage () {
  const [candidatos, setCandidatos]   = useState([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [procesando, setProcesando]   = useState(null)
  const [error, setError]             = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const res  = await fetch('/api/admin/duplicados', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setCandidatos(data.candidatos || [])
      setTotal(data.total || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function decidir (candidatoId, decision) {
    setProcesando(candidatoId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''
      const res = await fetch('/api/admin/duplicados', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ candidato_id: candidatoId, decision }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Error al guardar')
      }
      setCandidatos(prev => prev.filter(c => c.id !== candidatoId))
      setTotal(t => Math.max(0, t - 1))
    } catch (e) {
      setError(e.message)
    } finally {
      setProcesando(null)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h2 style={styles.titulo}>Cola de duplicados</h2>
        {!loading && (
          <span style={styles.badge}>
            {total} pendientes{total > candidatos.length ? ` (mostrando ${candidatos.length})` : ''}
          </span>
        )}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading && <div style={styles.empty}>Cargando…</div>}

      {!loading && candidatos.length === 0 && !error && (
        <div style={styles.empty}>Sin candidatos pendientes. Cola vacía.</div>
      )}

      {candidatos.map(c => (
        <CandidatoCard
          key={c.id}
          c={c}
          procesando={procesando}
          onDecide={decidir}
        />
      ))}
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = {
  page:    { padding: '24px 32px', maxWidth: 960, margin: '0 auto' },
  header:  { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 },
  titulo:  { margin: 0, fontSize: 20, fontWeight: 600 },
  badge:   { fontSize: 13, color: '#666', background: '#f3f3f3', borderRadius: 12,
             padding: '2px 10px' },
  errorBox:{ background: '#fee', border: '1px solid #fcc', borderRadius: 6,
             padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#c00' },
  empty:   { color: '#666', fontSize: 14, padding: '32px 0' },

  card:    { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
             marginBottom: 12, padding: '16px 20px' },
  sides:   { display: 'flex', gap: 16, alignItems: 'flex-start' },

  lado:    { flex: 1 },
  ladoLabel:{ fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: '0.05em',
              marginBottom: 4, textTransform: 'uppercase' },
  nombre:  { fontSize: 15, fontWeight: 600, marginBottom: 2 },
  bodega:  { fontSize: 13, color: '#555', marginBottom: 2 },
  meta:    { fontSize: 12, color: '#888' },

  centro:  { flexShrink: 0, width: 90, textAlign: 'center', paddingTop: 20 },
  sim:     { fontSize: 13, fontWeight: 600, color: '#333' },
  diff:    { fontSize: 12, color: '#888', marginTop: 2 },

  actions: { marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' },
  btn:     { padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
             fontSize: 13, fontWeight: 500, transition: 'opacity 0.15s' },
  btnMismo:  { background: '#16a34a', color: '#fff' },
  btnDistinto: { background: '#f3f3f3', color: '#333' },
}
