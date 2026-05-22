'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { isAdminEmail } from '../demo'

const RESTAURANTE_PREFIX = '[RESTAURANTE] '
const esSeleccionJuanjo = item => !String(item.nota_personal || '').startsWith(RESTAURANTE_PREFIX)

export default function SommelierDashboard() {
  const [user, setUser] = useState(null)
  const [restaurantes, setRestaurantes] = useState([])
  const [restauranteActivo, setRestauranteActivo] = useState(null)
  const [vinos, setVinos] = useState([])
  const [seleccion, setSeleccion] = useState([])
  const [loading, setLoading] = useState(true)
  const [vinoElegido, setVinoElegido] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }
      setUser(user)
      const { data: rests } = await supabase.from('restaurantes').select('*').order('nombre')
      setRestaurantes(rests || [])
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!restauranteActivo) return
    async function cargarRestaurante() {
      const { data: vinosData } = await supabase.from('vinos').select('*').eq('restaurante_id', restauranteActivo.id).eq('activo', true)
      setVinos(vinosData || [])
      const { data: selData } = await supabase
        .from('seleccion_especial')
        .select('*, vinos(nombre, bodega, tipo, region)')
        .eq('restaurante_id', restauranteActivo.id)
        .eq('activo', true)
        .order('orden')
      setSeleccion((selData || []).filter(esSeleccionJuanjo))
    }
    cargarRestaurante()
  }, [restauranteActivo])

  async function añadirSeleccion() {
    if (!vinoElegido || !nota.trim()) return
    setGuardando(true)
    const { data, error } = await supabase.from('seleccion_especial').insert([{
      restaurante_id: restauranteActivo.id,
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

  async function cerrarSesion() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const tipoDot = { tinto: '#7B2D2D', blanco: '#C4A55A', rosado: '#C47A8A', espumoso: '#4A8C6F' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.15em', color: '#bbb' }}>CARGANDO</p>
    </div>
  )

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <p className="admin-kicker">Superadmin</p>
          <h1>Selección Juanjo</h1>
          <p>@cataconjuanjo</p>
        </div>
        <button onClick={cerrarSesion}>Salir</button>
      </header>

      <section className="admin-shell">
        <aside className="admin-sidebar">
          <p className="admin-kicker">Consultor</p>
          <a href="/admin/consultoria">Radar</a>
          <a href="/admin/propuestas">Propuestas</a>
          <a href="/admin/proveedores">Proveedores</a>
          <a className="active" href="/sommelier">Selección Juanjo</a>
          <a href="/admin">Restaurantes</a>
        </aside>

        <div className="admin-main">
      <div style={{ maxWidth: 860, padding: '0 0 48px' }}>

        {/* Selector de restaurante */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>Selecciona un restaurante</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {restaurantes.map(r => (
              <div key={r.id} onClick={() => { setRestauranteActivo(r); setVinoElegido(''); setNota('') }}
                style={{
                  background: restauranteActivo?.id === r.id ? '#111' : '#fff',
                  border: '1px solid #f0f0f0',
                  padding: '16px 20px',
                  cursor: 'pointer',
                }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: restauranteActivo?.id === r.id ? '#fff' : '#111' }}>{r.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: restauranteActivo?.id === r.id ? '#aaa' : '#bbb' }}>{r.ciudad}</p>
              </div>
            ))}
          </div>
        </div>

        {restauranteActivo && (
          <>
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Selección Juanjo</p>
              <h1 style={{ fontSize: 24, fontWeight: 300, fontFamily: 'Georgia, serif', color: '#111', margin: '0 0 4px' }}>{restauranteActivo.nombre}</h1>
              <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>{seleccion.length}/4 vinos seleccionados</p>
            </div>

            {seleccion.length < 4 && (
              <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '24px', marginBottom: 32 }}>
                <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>Añadir vino</p>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Vino</label>
                  <select value={vinoElegido} onChange={e => setVinoElegido(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e8e8e8', borderRadius: 0, fontSize: 14, background: '#fff', color: '#111' }}>
                    <option value="">Selecciona un vino...</option>
                    {vinos.filter(v => !seleccion.some(s => s.vino_id === v.id)).map(v => (
                      <option key={v.id} value={v.id}>{v.nombre} · {v.bodega}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: '#aaa', display: 'block', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Nota personal</label>
                  <textarea value={nota} onChange={e => setNota(e.target.value)}
                    placeholder="Por qué recomiendas este vino, con qué platos, qué lo hace especial..."
                    rows={4}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e8e8e8', borderRadius: 0, fontSize: 14, resize: 'vertical', fontFamily: 'system-ui, sans-serif', color: '#111', boxSizing: 'border-box' }}
                  />
                </div>
                <button onClick={añadirSeleccion} disabled={guardando || !vinoElegido || !nota.trim()} style={{
                  background: guardando || !vinoElegido || !nota.trim() ? '#ccc' : '#111',
                  color: '#fff', border: 'none', padding: '12px 28px', fontSize: 11,
                  letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer'
                }}>
                  {guardando ? 'Guardando...' : 'Añadir a la selección'}
                </button>
              </div>
            )}

            {seleccion.length > 0 && (
              <div>
                <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 16px' }}>Selección actual</p>
                {seleccion.map(s => (
                  <div key={s.id} style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '20px 24px', marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[s.vinos?.tipo] || '#888' }} />
                        <div>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#111' }}>{s.vinos?.nombre}</p>
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#bbb' }}>{s.vinos?.bodega} · {s.vinos?.region}</p>
                        </div>
                      </div>
                      <button onClick={() => quitarSeleccion(s.id)} style={{ background: 'none', border: '1px solid #e8e8e8', padding: '4px 12px', fontSize: 11, color: '#aaa', cursor: 'pointer' }}>
                        Quitar
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.7, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{s.nota_personal}</p>
                  </div>
                ))}
              </div>
            )}

            {seleccion.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', border: '1px solid #f0f0f0', background: '#fff' }}>
                <p style={{ color: '#ccc', fontSize: 14, fontWeight: 300 }}>Aún no hay vinos en la selección de este restaurante.</p>
              </div>
            )}
          </>
        )}
      </div>
        </div>
      </section>
    </main>
  )
}
