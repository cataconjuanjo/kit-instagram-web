'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'

const EJEMPLOS = [
  'Tataki de atun con soja y sesamo',
  'Pulpo a la brasa con parmentier y pimenton',
  'Bacalao gratinado con alioli',
  'Carrillera iberica al Pedro Ximenez',
  'Ensalada de queso de cabra con nueces y miel',
]

async function tokenAdmin() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token || ''
}

function listaCandidatos(version) {
  return version?.grafo?.candidatos?.length
    ? version.grafo.candidatos
    : version?.motor?.recomendados?.length
      ? version.motor.recomendados
      : version?.motor?.candidatos || []
}

function CandidateList({ title, version }) {
  const candidatos = listaCandidatos(version).slice(0, 6)
  return (
    <article className="admin-card lab-card">
      <span className="admin-slug">{version?.grafo ? `Grafo ${version.grafo.confianza}` : 'Motor estructural'}</span>
      <h3>{title}</h3>
      {candidatos.length === 0 && <p className="consult-empty">Sin candidatos claros.</p>}
      <div className="lab-candidates">
        {candidatos.map((item, index) => (
          <div key={`${item.vino_id || item.nombre}-${index}`} className="lab-candidate">
            <strong>{index + 1}. {item.nombre}</strong>
            <span>{[item.bodega, item.tipo, item.precio ? `${item.precio} EUR` : '', item.score ? `score ${item.score}` : ''].filter(Boolean).join(' · ')}</span>
            {item.fuente && <small>{item.fuente}</small>}
            {item.motivo && <small>{item.motivo}</small>}
            {item.evidencias?.length > 0 && (
              <small>
                Evidencia: {item.evidencias.map(ev => [ev.concepto, ev.familia, ev.origen].filter(Boolean).join('/')).join(' · ')}
              </small>
            )}
            {item.riesgos?.length > 0 && <small className="lab-risk">Riesgo: {item.riesgos.join(' · ')}</small>}
          </div>
        ))}
      </div>
    </article>
  )
}

export default function MaridajeLabPage() {
  const [restaurantes, setRestaurantes] = useState([])
  const [restauranteId, setRestauranteId] = useState('')
  const [consulta, setConsulta] = useState(EJEMPLOS[0])
  const [resultado, setResultado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analizando, setAnalizando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/maridaje-lab', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setRestaurantes(data.restaurantes || [])
        setRestauranteId(data.restaurantes?.[0]?.id || '')
      } else {
        setError(data.error || 'No se pudo cargar el laboratorio.')
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const flavor = resultado?.flavorLectura
  const comparacion = resultado?.comparacion
  const resumenFlavor = useMemo(() => {
    if (!flavor) return []
    return [
      flavor.ingredientes?.length ? `Ingredientes: ${flavor.ingredientes.map(item => item.nombre).join(', ')}` : '',
      flavor.tecnicas?.length ? `Tecnicas: ${flavor.tecnicas.join(', ')}` : '',
      flavor.rasgosAltos?.length ? `Rasgos altos: ${flavor.rasgosAltos.map(item => `${item.dimension} ${item.valor}/5`).join(', ')}` : '',
      flavor.afinidades?.length ? `Afinidades: ${flavor.afinidades.map(item => item.ingrediente).join(', ')}` : '',
    ].filter(Boolean)
  }, [flavor])

  async function analizar(e) {
    e?.preventDefault()
    if (!restauranteId || !consulta.trim()) return
    setAnalizando(true)
    setError('')
    setResultado(null)
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/maridaje-lab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ restaurante_id: restauranteId, consulta })
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setResultado(data)
    else setError(data.error || 'No se pudo analizar el maridaje.')
    setAnalizando(false)
  }

  if (loading) return <p className="admin-loading">Cargando laboratorio</p>

  return (
    <div className="admin-main lab-main">
      <div className="admin-head">
        <div>
          <p className="admin-kicker">Laboratorio privado</p>
          <h1>Maridaje A/B con Flavor</h1>
          <p>Compara el motor actual con una version experimental que primero interpreta ingredientes, tecnica y rasgos sensoriales. No afecta a clientes ni a sala.</p>
        </div>
      </div>

      <section className="admin-create lab-panel">
        <form onSubmit={analizar} className="admin-create-form">
          <label>
            Restaurante
            <select value={restauranteId} onChange={e => setRestauranteId(e.target.value)}>
              {restaurantes.map(restaurante => (
                <option key={restaurante.id} value={restaurante.id}>
                  {[restaurante.nombre, restaurante.ciudad].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-create-wide">
            Plato o consulta
            <textarea value={consulta} onChange={e => setConsulta(e.target.value)} placeholder="Ej. Tataki de atun con soja y sesamo" />
          </label>
          <div className="admin-card-actions lab-examples">
            {EJEMPLOS.map(ejemplo => (
              <button key={ejemplo} type="button" className="admin-plain-button" onClick={() => setConsulta(ejemplo)}>
                {ejemplo}
              </button>
            ))}
          </div>
          <button disabled={analizando || !restauranteId || !consulta.trim()}>
            {analizando ? 'Analizando...' : 'Comparar maridajes'}
          </button>
        </form>
      </section>

      {error && <p className="admin-alert admin-alert-error">{error}</p>}

      {resultado && (
        <>
          <section className="admin-grid lab-summary-grid">
            <article className="admin-card lab-card">
              <span className="admin-slug">Lectura Flavor</span>
              <h3>Que ha entendido del plato</h3>
              {resumenFlavor.length ? resumenFlavor.map(linea => <p key={linea}>{linea}</p>) : <p>No ha detectado ingredientes de la base Flavor.</p>}
              {flavor?.alertas?.length > 0 && <small className="lab-risk">Alertas: {flavor.alertas.join(' · ')}</small>}
            </article>
            <article className="admin-card lab-card">
              <span className="admin-slug">Diferencia</span>
              <h3>{comparacion?.cambiaPrimero ? 'Cambia el primer vino' : 'Mantiene el primer vino'}</h3>
              <p>Actual: <strong>{comparacion?.primeroActual || 'Sin candidato'}</strong></p>
              <p>Con Flavor: <strong>{comparacion?.primeroFlavor || 'Sin candidato'}</strong></p>
              {comparacion?.movimientos?.length > 0 && (
                <small>Movimientos: {comparacion.movimientos.map(item => `${item.nombre} ${item.antes}->${item.ahora}`).join(' · ')}</small>
              )}
              {comparacion?.nuevosEnTop?.length > 0 && (
                <small>Nuevos en top: {comparacion.nuevosEnTop.map(item => item.nombre).join(' · ')}</small>
              )}
            </article>
          </section>

          <section className="admin-grid lab-results-grid">
            <CandidateList title="Motor actual" version={resultado.actual} />
            <CandidateList title="Motor + Flavor experimental" version={resultado.conFlavor} />
          </section>
        </>
      )}
    </div>
  )
}

