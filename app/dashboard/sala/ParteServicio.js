'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import styles from '../module.module.css'

const TURNOS = ['mediodia', 'noche', 'unico']
const LABEL_TURNO = { mediodia: 'Mediodía', noche: 'Noche', unico: 'Único' }
const TIPOS_LINEA = [
  'venta_botella', 'venta_copa',
  'invitacion_botella', 'invitacion_copa',
  'cocina', 'grupo_evento', 'maridaje', 'rotura', 'cata',
]
const LABEL_TIPO = {
  venta_botella:      'Venta botella',
  venta_copa:         'Venta copa',
  invitacion_botella: 'Invitación',
  invitacion_copa:    'Inv. copa',
  cocina:             'Cocina',
  grupo_evento:       'Evento',
  maridaje:           'Maridaje',
  rotura:             'Rotura',
  cata:               'Cata',
}

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

async function apiFetch(path, options = {}) {
  const token = await tokenSesion()
  if (!token) throw new Error('Sesión caducada. Vuelve a entrar.')
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Error en la operación')
  return body
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10)
}

export default function ParteServicio({ restauranteId, vinos = [] }) {
  const [partes, setPartes] = useState([])
  const [parteActivo, setParteActivo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [turnoNuevo, setTurnoNuevo] = useState('mediodia')
  const [resultado, setResultado] = useState(null)
  const [controlStockDesde, setControlStockDesde] = useState(undefined)

  // Form línea
  const [filtroVino, setFiltroVino] = useState('')
  const [vinoId, setVinoId] = useState('')
  const [tipo, setTipo] = useState('venta_botella')
  const [cantidad, setCantidad] = useState(1)
  const [copas, setCopas] = useState('')
  const [mesa, setMesa] = useState('')
  const [anadiendo, setAnadiendo] = useState(false)

  useEffect(() => {
    if (restauranteId) cargarPartes()
  }, [restauranteId])

  async function cargarPartes() {
    setCargando(true)
    setError('')
    try {
      const resp = await apiFetch(
        `/api/partes?restaurante_id=${restauranteId}&fecha=${fechaHoy()}`
      )
      setPartes(resp.partes || [])
      setControlStockDesde(resp.control_stock_desde ?? null)
      const borrador = (resp.partes || []).find(p => p.estado === 'borrador')
      setParteActivo(borrador || (resp.partes || [])[0] || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }

  async function crearParte() {
    setCreando(true)
    setError('')
    try {
      const { parte } = await apiFetch('/api/partes', {
        method: 'POST',
        body: JSON.stringify({ restaurante_id: restauranteId, turno: turnoNuevo, fecha: fechaHoy() }),
      })
      setPartes(prev => [...prev, parte])
      setParteActivo(parte)
      setResultado(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreando(false)
    }
  }

  async function anadirLinea(e) {
    e.preventDefault()
    if (!parteActivo || !vinoId || anadiendo) return
    setAnadiendo(true)
    setError('')
    try {
      const vino = vinos.find(v => v.id === vinoId)
      const esCopa = tipo === 'venta_copa' || tipo === 'invitacion_copa'
      const precioUnitario = esCopa
        ? (vino?.precio_copa ?? null)
        : (vino?.precio_botella ?? null)

      const { linea } = await apiFetch(`/api/partes/${parteActivo.id}/lineas`, {
        method: 'POST',
        body: JSON.stringify({
          vino_id:         vinoId,
          tipo,
          cantidad:        esCopa ? 1 : Number(cantidad),
          copas_vendidas:  esCopa && copas ? Number(copas) : null,
          mesa:            mesa || null,
          precio_unitario: precioUnitario,
        }),
      })
      actualizarLineasParte(parteActivo.id, lineas => [...lineas, linea])
      resetForm()
    } catch (e) {
      setError(e.message)
    } finally {
      setAnadiendo(false)
    }
  }

  async function eliminarLinea(lineaId) {
    if (!parteActivo) return
    setError('')
    try {
      await apiFetch(`/api/partes/${parteActivo.id}/lineas?linea_id=${lineaId}`, { method: 'DELETE' })
      actualizarLineasParte(parteActivo.id, lineas => lineas.filter(l => l.id !== lineaId))
    } catch (e) {
      setError(e.message)
    }
  }

  async function cerrarParte() {
    if (!parteActivo || cerrando) return
    setCerrando(true)
    setError('')
    try {
      const data = await apiFetch(`/api/partes/${parteActivo.id}/cerrar`, { method: 'POST' })
      if (data.status === 'closed' || data.status === 'already_closed') {
        actualizarEstadoParte(parteActivo.id, 'cerrado')
        setResultado(data)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setCerrando(false)
    }
  }

  function actualizarLineasParte(parteId, fn) {
    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, lineas: fn(p.lineas || []) } : p))
    setParteActivo(prev => prev?.id === parteId ? { ...prev, lineas: fn(prev.lineas || []) } : prev)
  }

  function actualizarEstadoParte(parteId, estado) {
    setPartes(prev => prev.map(p => p.id === parteId ? { ...p, estado } : p))
    setParteActivo(prev => prev?.id === parteId ? { ...prev, estado } : prev)
  }

  function resetForm() {
    setVinoId('')
    setCantidad(1)
    setCopas('')
    setMesa('')
    setFiltroVino('')
  }

  const esCopa = tipo === 'venta_copa' || tipo === 'invitacion_copa'

  const vinosFiltrados = vinos
    .filter(v => v.activo !== false)
    .filter(v => !esCopa || v.por_copa === true)
    .filter(v => !filtroVino || v.nombre?.toLowerCase().includes(filtroVino.toLowerCase()))
    .slice(0, 40)
  const lineas = parteActivo?.lineas || []
  const esBorrador = parteActivo?.estado === 'borrador'
  const turnosDisponibles = TURNOS.filter(t => !partes.some(p => p.turno === t))
  const hayVentasSinStock = controlStockDesde === null &&
    lineas.some(l => l.tipo === 'venta_botella' || l.tipo === 'venta_copa')

  if (cargando) return (
    <section className={styles.panel}>
      <p className={styles.sectionText}>Cargando parte de servicio…</p>
    </section>
  )

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>Al cierre</p>
          <h2 className={styles.panelTitle}>Parte de servicio</h2>
          <p className={styles.panelSub}>
            Registra ventas, invitaciones y consumos del turno. El stock se actualiza al cerrar el parte.
          </p>
        </div>
        {partes.length > 1 && (
          <div className={styles.actionRow}>
            {partes.map(p => (
              <button
                key={p.id}
                className={parteActivo?.id === p.id ? styles.primary : styles.ghost}
                onClick={() => { setParteActivo(p); setResultado(null) }}
              >
                {LABEL_TURNO[p.turno] || p.turno} {p.estado === 'cerrado' ? '✓' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p style={{ color: '#c0392b', fontSize: 13, padding: '6px 0' }}>{error}</p>
      )}

      <div className={styles.panelBody}>

        {/* Sin parte para hoy */}
        {partes.length === 0 && (
          <div>
            <p className={styles.sectionText} style={{ marginBottom: 12 }}>
              No hay parte para hoy. Crea uno para empezar a registrar el servicio.
            </p>
            <div className={styles.actionRow}>
              <select
                value={turnoNuevo}
                onChange={e => setTurnoNuevo(e.target.value)}
                style={selectStyle}
              >
                {TURNOS.map(t => <option key={t} value={t}>{LABEL_TURNO[t]}</option>)}
              </select>
              <button className={styles.primary} onClick={crearParte} disabled={creando}>
                {creando ? 'Creando…' : 'Nuevo parte'}
              </button>
            </div>
          </div>
        )}

        {/* Parte activo */}
        {parteActivo && (
          <div>
            {/* Cabecera estado */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={badgeStyle(esBorrador)}>
                  {esBorrador ? 'En curso' : 'Cerrado'}
                </span>
                <span style={{ fontSize: 13, color: '#888' }}>
                  {LABEL_TURNO[parteActivo.turno] || parteActivo.turno} · {parteActivo.fecha}
                  {' · '}{lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}
                </span>
              </div>
              {esBorrador && lineas.length > 0 && (
                <button
                  className={styles.primary}
                  onClick={cerrarParte}
                  disabled={cerrando}
                >
                  {cerrando ? 'Cerrando…' : 'Cerrar y descontar stock'}
                </button>
              )}
            </div>

            {/* Tabla de líneas */}
            {lineas.length > 0 && (
              <div className={styles.itemStack} style={{ marginBottom: 16 }}>
                {lineas.map(linea => (
                  <div key={linea.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderRadius: 8, background: '#fafafa', border: '1px solid #eee' }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {linea.vino?.nombre || linea.vino_id}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#777' }}>
                        {LABEL_TIPO[linea.tipo]}
                        {linea.tipo !== 'venta_copa' && linea.tipo !== 'invitacion_copa' && (
                          <>{' · '}{linea.cantidad} {linea.cantidad === 1 ? 'ud' : 'uds'}</>
                        )}
                        {linea.copas_vendidas ? ` · ${linea.copas_vendidas} copas` : ''}
                        {linea.mesa ? ` · mesa ${linea.mesa}` : ''}
                        {linea.precio_unitario ? ` · ${Number(linea.precio_unitario).toFixed(2)} € carta` : ''}
                      </span>
                    </div>
                    {esBorrador && (
                      <button
                        onClick={() => eliminarLinea(linea.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16, padding: '0 4px' }}
                        title="Eliminar línea"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {lineas.length === 0 && !esBorrador && (
              <p className={styles.sectionText} style={{ marginBottom: 12 }}>Parte cerrado sin líneas.</p>
            )}

            {/* Aviso control_stock_desde NULL */}
            {hayVentasSinStock && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff8e1', borderRadius: 7, border: '1px solid #ffe082', fontSize: 13, color: '#795548' }}>
                Las ventas aún no descuentan stock — falta el conteo inicial de bodega.
              </div>
            )}

            {/* Resultado del cierre */}
            {resultado?.status === 'closed' && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: '#d4edda', borderRadius: 8, border: '1px solid #c3e6cb' }}>
                <p style={{ fontSize: 13, color: '#155724', fontWeight: 600, margin: 0 }}>
                  ✓ Parte cerrado — {Array.isArray(resultado.movimientos) ? resultado.movimientos.length : 0} movimientos registrados
                </p>
              </div>
            )}

            {/* Formulario añadir línea */}
            {esBorrador && (
              <form onSubmit={anadirLinea}>
                <p className={styles.eyebrow} style={{ marginBottom: 8 }}>Añadir línea</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input
                    placeholder="Buscar vino…"
                    value={filtroVino}
                    onChange={e => { setFiltroVino(e.target.value); setVinoId('') }}
                    style={{ ...inputStyle, flex: '1 1 160px' }}
                  />
                  <select
                    value={vinoId}
                    onChange={e => setVinoId(e.target.value)}
                    required
                    style={{ ...inputStyle, flex: '1 1 200px' }}
                  >
                    <option value="">— vino —</option>
                    {vinosFiltrados.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.nombre} (stock {v.stock ?? 0})
                      </option>
                    ))}
                  </select>
                  <select
                    value={tipo}
                    onChange={e => setTipo(e.target.value)}
                    style={{ ...inputStyle, flex: '1 1 150px' }}
                  >
                    {TIPOS_LINEA.map(t => <option key={t} value={t}>{LABEL_TIPO[t]}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {!esCopa && (
                    <div>
                      <label style={labelStyle}>Botellas</label>
                      <input
                        type="number" min="1" max="999"
                        value={cantidad}
                        onChange={e => setCantidad(e.target.value)}
                        required
                        style={{ ...inputStyle, width: 76 }}
                      />
                    </div>
                  )}
                  {esCopa && (
                    <div>
                      <label style={labelStyle}>Copas servidas</label>
                      <input
                        type="number" min="1"
                        value={copas}
                        onChange={e => setCopas(e.target.value)}
                        placeholder="ej. 6"
                        style={{ ...inputStyle, width: 90 }}
                      />
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Mesa (opcional)</label>
                    <input
                      type="text" maxLength={60}
                      value={mesa}
                      onChange={e => setMesa(e.target.value)}
                      placeholder="ej. 12"
                      style={{ ...inputStyle, width: 90 }}
                    />
                  </div>
                  <button type="submit" className={styles.primary} disabled={anadiendo || !vinoId}>
                    {anadiendo ? 'Añadiendo…' : '+ Añadir'}
                  </button>
                </div>
              </form>
            )}

            {/* Crear parte de otro turno */}
            {!esBorrador && turnosDisponibles.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className={styles.actionRow}>
                  <select
                    value={turnoNuevo}
                    onChange={e => setTurnoNuevo(e.target.value)}
                    style={selectStyle}
                  >
                    {turnosDisponibles.map(t => <option key={t} value={t}>{LABEL_TURNO[t]}</option>)}
                  </select>
                  <button className={styles.secondary} onClick={crearParte} disabled={creando}>
                    {creando ? 'Creando…' : 'Añadir turno'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

const inputStyle = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #ddd',
  fontSize: 14,
  background: '#fff',
}

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  color: '#666',
  marginBottom: 3,
}

function badgeStyle(esBorrador) {
  return {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    background: esBorrador ? '#fff3cd' : '#d4edda',
    color:      esBorrador ? '#856404' : '#155724',
    border:     `1px solid ${esBorrador ? '#ffc107' : '#c3e6cb'}`,
  }
}
