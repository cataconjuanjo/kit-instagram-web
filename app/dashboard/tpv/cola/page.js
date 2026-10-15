'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../supabase'
import { getEffectiveRestaurantEmail } from '../../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../../lib/clientSupabaseSelects'
import { esPerfilBodega } from '../../../lib/plans'
import { FeatureGate, LoadingState, ModuleShell } from '../../moduleComponents'
import styles from '../../module.module.css'

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function incidenciaLabel(tipo) {
  return {
    sin_mapeo:          'Sin mapeo',
    cantidad_no_entera: 'Cantidad decimal',
    cantidad_cero:      'Cantidad cero',
    mapeo_invalido:     'Mapeo inválido',
  }[tipo] || tipo || '—'
}

function agruparPorProducto(lineas) {
  const grupos = new Map()
  for (const l of lineas) {
    const key = l.producto_externo_id || `__sin_id__${l.nombre_producto || l.id}`
    if (!grupos.has(key)) {
      grupos.set(key, {
        producto_externo_id: l.producto_externo_id,
        fuente:              l.fuente,
        nombre_producto:     l.nombre_producto,
        tipo_incidencia:     l.tipo_incidencia,
        lineas:              [],
      })
    }
    grupos.get(key).lineas.push(l)
  }
  return [...grupos.values()]
}

export default function ColaTPV() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos]             = useState([])
  const [lineas, setLineas]           = useState([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [mensaje, setMensaje]         = useState('')
  const [expandidos, setExpandidos]   = useState({})

  // Por grupo: { vinoId, formato }
  const [asignacion, setAsignacion] = useState({})

  const restauranteId = restaurante?.id

  const cargarLineas = useCallback(async (rId) => {
    if (!rId) return
    const { data } = await supabase
      .from('tpv_lineas_sin_asignar')
      .select('*')
      .eq('restaurante_id', rId)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true })
      .limit(500)
    setLineas(data || [])
    setTotal((data || []).length)
  }, [])

  useEffect(() => {
    async function init() {
      const { email, restauranteId: rId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !rId) { window.location.href = '/login'; return }

      const q = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = rId ? await q.eq('id', rId).single() : await q.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data: vData } = await supabase
          .from('vinos')
          .select('id, nombre, formato_venta, por_copa')
          .eq('restaurante_id', rest.id)
          .order('nombre')
        setVinos(vData || [])
        await cargarLineas(rest.id)
      }
      setLoading(false)
    }
    init()
  }, [cargarLineas])

  async function accion(body) {
    setMensaje('')
    const headers = await authHeaders()
    const res = await fetch('/api/tpv/sin-asignar', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurante_id: restauranteId, ...body }),
    })
    const json = await res.json()
    if (!res.ok) { setMensaje(`Error: ${json.error}`); return }
    await cargarLineas(restauranteId)
    const procesadas = json.procesadas ?? 1
    setMensaje(`${procesadas} línea(s) procesada(s)`)
  }

  async function asignar(grupo) {
    const { vinoId, formato } = asignacion[grupo.producto_externo_id] || {}
    if (!vinoId || !formato) { setMensaje('Selecciona vino y formato'); return }
    await accion({
      fuente:              grupo.fuente,
      accion:              'asignar',
      producto_externo_id: grupo.producto_externo_id,
      vino_id:             vinoId,
      formato_venta:       formato,
    })
  }

  async function ignorar(grupo) {
    await accion({
      fuente:              grupo.fuente,
      accion:              'ignorar',
      producto_externo_id: grupo.producto_externo_id,
    })
  }

  async function descartarLinea(linea) {
    await accion({ accion: 'descartar_linea', linea_id: linea.id })
  }

  if (loading) return <LoadingState />

  if (!restaurante) return null

  if (!esPerfilBodega(restaurante)) {
    return (
      <FeatureGate mensaje="La cola TPV está disponible en el plan Bodega." />
    )
  }

  const grupos = agruparPorProducto(lineas)

  return (
    <ModuleShell titulo="Cola TPV — líneas sin asignar">
      <div className={styles.headerRow} style={{ marginBottom: '1rem' }}>
        <span style={{ color: 'var(--color-muted)' }}>
          {total} línea(s) pendiente(s)
        </span>
        {mensaje && (
          <span style={{ color: mensaje.startsWith('Error') ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {mensaje}
          </span>
        )}
      </div>

      {grupos.length === 0 && (
        <p style={{ color: 'var(--color-muted)' }}>No hay líneas pendientes.</p>
      )}

      {grupos.map(grupo => {
        const key = grupo.producto_externo_id || grupo.nombre_producto
        const abierto = expandidos[key]
        const sel = asignacion[key] || {}
        const vinosFiltrados = grupo.tipo_incidencia === 'sin_mapeo' || grupo.tipo_incidencia === 'mapeo_invalido'
          ? vinos
          : []
        const vinoSeleccionado = vinos.find(v => v.id === sel.vinoId)
        const permiteCopa = vinoSeleccionado?.por_copa

        return (
          <div key={key} style={{
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            marginBottom: '0.75rem',
            padding: '0.75rem 1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, flexGrow: 1 }}>
                {grupo.nombre_producto || '(sin nombre)'}
              </span>
              <span style={{ fontSize: '0.8em', color: 'var(--color-muted)' }}>
                {incidenciaLabel(grupo.tipo_incidencia)} · {grupo.lineas.length} línea(s)
              </span>
              <button
                className={styles.btnSecondary}
                style={{ fontSize: '0.8em' }}
                onClick={() => setExpandidos(e => ({ ...e, [key]: !abierto }))}
              >
                {abierto ? 'Ocultar' : 'Ver líneas'}
              </button>
            </div>

            {/* Selector de vino para asignar */}
            {grupo.producto_externo_id && (
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={sel.vinoId || ''}
                  onChange={e => setAsignacion(a => ({
                    ...a, [key]: { ...sel, vinoId: e.target.value, formato: '' },
                  }))}
                  style={{ flexGrow: 1, minWidth: '180px' }}
                >
                  <option value="">— Selecciona vino —</option>
                  {vinos.map(v => (
                    <option key={v.id} value={v.id}>{v.nombre}</option>
                  ))}
                </select>
                <select
                  value={sel.formato || ''}
                  onChange={e => setAsignacion(a => ({
                    ...a, [key]: { ...sel, formato: e.target.value },
                  }))}
                  style={{ width: '110px' }}
                >
                  <option value="">Formato</option>
                  <option value="botella">Botella</option>
                  {permiteCopa && <option value="copa">Copa</option>}
                </select>
                <button
                  className={styles.btnPrimary}
                  onClick={() => asignar(grupo)}
                  disabled={!sel.vinoId || !sel.formato}
                >
                  Asignar
                </button>
                <button
                  className={styles.btnDanger}
                  onClick={() => ignorar(grupo)}
                >
                  Ignorar producto
                </button>
              </div>
            )}

            {/* Líneas individuales */}
            {abierto && (
              <table style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.85em', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--color-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>Fecha</th>
                    <th style={{ padding: '4px 8px' }}>Qty</th>
                    <th style={{ padding: '4px 8px' }}>Importe</th>
                    <th style={{ padding: '4px 8px' }}>Ticket</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.lineas.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '4px 8px' }}>
                        {l.fecha ? new Date(l.fecha).toLocaleDateString('es-ES') : '—'}
                      </td>
                      <td style={{ padding: '4px 8px' }}>{l.cantidad ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>
                        {l.importe_bruto_iva != null
                          ? `${Number(l.importe_bruto_iva).toFixed(2)} €`
                          : '—'}
                      </td>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: '0.8em' }}>
                        {l.referencia_ticket?.slice(-8)}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                        <button
                          className={styles.btnDanger}
                          style={{ fontSize: '0.78em', padding: '2px 8px' }}
                          onClick={() => descartarLinea(l)}
                        >
                          Descartar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </ModuleShell>
  )
}
