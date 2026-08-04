'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../supabase'

export default function InformesPage() {
  const { slug } = useParams()
  const router = useRouter()
  const [informes, setInformes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [viendoId, setViendoId] = useState(null)
  const [htmlVista, setHtmlVista] = useState('')
  const [cargandoHtml, setCargandoHtml] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push(`/kiosko-admin/${slug}`); return }

      const res = await fetch(`/api/kiosko/${slug}/admin/informes`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { setError('Sin acceso'); setCargando(false); return }
      const data = await res.json()
      setInformes(data.informes || [])
      setCargando(false)
    }
    cargar()
  }, [slug])

  async function verInforme(id) {
    if (viendoId === id) { setViendoId(null); setHtmlVista(''); return }
    setCargandoHtml(true)
    setViendoId(id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/kiosko/${slug}/admin/informes?id=${id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    setHtmlVista(data.informe?.html || '')
    setCargandoHtml(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f3f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>

        <div style={{ marginBottom: 24 }}>
          <button onClick={() => router.push(`/kiosko-admin/${slug}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.85rem', color: '#999', padding: 0 }}>
            ← Volver al admin
          </button>
          <h1 style={{ margin: '8px 0 4px', fontSize: '1.4rem', fontWeight: 800, color: '#1a1a2e' }}>
            Historial de informes
          </h1>
          <p style={{ margin: 0, fontSize: '.82rem', color: '#999' }}>
            Informes semanales enviados automáticamente cada martes a las 8:00
          </p>
        </div>

        {cargando && <p style={{ color: '#999', textAlign: 'center', padding: '40px 0' }}>Cargando...</p>}
        {error && <p style={{ color: '#c44', textAlign: 'center', padding: '40px 0' }}>{error}</p>}

        {!cargando && !error && informes.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '1.1rem', color: '#999' }}>Aun no hay informes generados</p>
            <p style={{ margin: '8px 0 0', fontSize: '.82rem', color: '#bbb' }}>
              El primer informe se enviara el proximo martes a las 8:00
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {informes.map(inf => (
            <div key={inf.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#1a1a2e', fontSize: '.95rem' }}>
                    Semana del {inf.semana_label}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: '.75rem', color: '#999' }}>
                    {new Date(inf.created_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    {' - '}{inf.email_destino}{' - '}
                    <span style={{ color: inf.enviado_ok ? '#2ea55a' : '#c44' }}>
                      {inf.enviado_ok ? 'Enviado' : 'Error'}
                    </span>
                  </p>
                  {inf.datos && (
                    <p style={{ margin: '4px 0 0', fontSize: '.78rem', color: '#666' }}>
                      {inf.datos.semanaActual || 0} busquedas esta semana - {inf.datos.totalMes || 0} en 30 dias
                    </p>
                  )}
                </div>
                <button onClick={() => verInforme(inf.id)}
                  style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 8, border: '1px solid #e0ddd8', background: viendoId === inf.id ? '#1a1a2e' : '#fff', color: viendoId === inf.id ? '#fff' : '#1a1a2e', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                  {viendoId === inf.id ? 'Cerrar' : 'Ver email'}
                </button>
              </div>

              {viendoId === inf.id && (
                <div style={{ borderTop: '1px solid #f0ede8' }}>
                  {cargandoHtml
                    ? <p style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '.85rem' }}>Cargando...</p>
                    : <iframe srcDoc={htmlVista} style={{ width: '100%', height: 600, border: 'none', display: 'block' }} title="Informe" />
                  }
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
