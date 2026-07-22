'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { esPerfilBodega } from '../../lib/plans'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

function eur(valor, decimales = 2) {
  return `${(Number(valor) || 0).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} EUR`
}

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const CAMPOS = [
  ['fecha', 'Fecha'],
  ['hora', 'Hora'],
  ['producto', 'Producto'],
  ['cantidad', 'Cantidad'],
  ['importe', 'Importe'],
  ['precio_unitario', 'Precio unidad'],
  ['servicio', 'Servicio'],
]

function estadoLabel(estado) {
  return {
    match: 'Match',
    manual: 'Manual',
    revision: 'Revisar',
    sin_match: 'Sin match',
    duplicada: 'Duplicada',
  }[estado] || 'Sin match'
}

export default function ImportarTPV() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [batches, setBatches] = useState([])
  const [pendingMigration, setPendingMigration] = useState(false)
  const [file, setFile] = useState(null)
  const [fileBase64, setFileBase64] = useState('')
  const [preview, setPreview] = useState(null)
  const [mapping, setMapping] = useState({})
  const [overrides, setOverrides] = useState({})
  const [guardarAliases, setGuardarAliases] = useState(true)
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) {
        window.location.href = '/login'
        return
      }
      const consulta = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await consulta.eq('id', restauranteId).single()
        : await consulta.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const [{ data: vinosData }, headers] = await Promise.all([
          supabase
            .from('vinos')
            .select('id, nombre, bodega, precio_botella, precio_copa, activo')
            .eq('restaurante_id', rest.id)
            .eq('activo', true)
            .order('nombre'),
          authHeaders(),
        ])
        setVinos(vinosData || [])
        const res = await fetch(`/api/pos-import?restaurante_id=${rest.id}`, { headers })
        const data = await res.json().catch(() => ({}))
        setBatches(data.batches || [])
        setPendingMigration(Boolean(data.pending_migration))
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function prepararArchivo(e) {
    const seleccionado = e.target.files?.[0]
    setFile(seleccionado || null)
    setPreview(null)
    setOverrides({})
    setMensaje('')
    if (!seleccionado) {
      setFileBase64('')
      return
    }
    setFileBase64(await archivoABase64(seleccionado))
  }

  async function previsualizar(mappingManual = mapping) {
    if (!restaurante?.id || !fileBase64) {
      setMensaje('Selecciona un CSV o Excel antes de previsualizar.')
      return
    }
    setProcesando(true)
    setMensaje('')
    const headers = await authHeaders()
    const res = await fetch('/api/pos-import', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'preview',
        restaurante_id: restaurante.id,
        fileBase64,
        filename: file?.name,
        mediaType: file?.type,
        mapping: mappingManual,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMensaje(data.error || 'No se pudo leer el archivo.')
    } else {
      setPreview(data)
      setMapping(data.mapping || {})
      setOverrides({})
      setMensaje(data.duplicate_file
        ? 'Este archivo ya fue importado. La confirmacion queda bloqueada para proteger los KPI.'
        : 'Previsualizacion lista. Revisa los matches antes de confirmar.')
    }
    setProcesando(false)
  }

  async function confirmar() {
    if (!preview || !restaurante?.id || !fileBase64) return
    setProcesando(true)
    setMensaje('')
    const headers = await authHeaders()
    const res = await fetch('/api/pos-import', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'confirm',
        restaurante_id: restaurante.id,
        fileBase64,
        filename: file?.name,
        mediaType: file?.type,
        mapping,
        overrides,
        guardar_aliases: guardarAliases,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMensaje(data.duplicate_file
        ? `Archivo ya importado: ${data.duplicate_batch?.archivo_nombre || 'TPV anterior'}.`
        : data.error || 'No se pudo confirmar la importacion.')
    } else {
      setMensaje(`Importacion guardada: ${data.resumen?.filas_match || 0} ventas vinculadas, ${data.resumen?.filas_duplicadas || 0} duplicadas omitidas, ${data.eventos_venta || 0} eventos creados. TPV atribuido: ${data.ventas_tpv_atribuidas || 0}; no atribuido: ${data.ventas_tpv_no_atribuidas || 0}.`)
      setPreview(null)
      setFile(null)
      setFileBase64('')
      setOverrides({})
      setBatches(actuales => [data.batch, ...actuales].filter(Boolean).slice(0, 8))
    }
    setProcesando(false)
  }

  function cambiarMapping(campo, columna) {
    const siguiente = { ...mapping, [campo]: columna }
    setMapping(siguiente)
  }

  const resumen = preview?.resumen
  const filas = preview?.filas || []
  const filasImportables = filas.filter(fila => {
    const override = overrides[fila.source_index]
    return !fila.duplicada && (override || ['match', 'manual'].includes(fila.estado_match))
  }).length

  if (loading) return <LoadingState />
  if (!restaurante) return null
  const perfilBodega = esPerfilBodega(restaurante)

  return (
    <FeatureGate restaurante={restaurante} feature="tpv_import" title="Importacion TPV no incluida">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="TPV"
        title="Importar ventas TPV"
        subtitle={perfilBodega
          ? 'Sube ventas reales desde CSV o Excel, revisa coincidencias con tu bodega y alimenta KPI de rotacion, margen y estrellas/joyas.'
          : 'Sube ventas reales desde CSV o Excel, revisa coincidencias con tu bodega y alimenta KPI sin depender solo del marcado de sala.'}
        help={{
          title: 'Importacion controlada',
          intro: 'La app no toca precios ni stock automaticamente. Primero lee, propone matches y deja revisar antes de guardar.',
          items: [
            { title: 'Columnas', text: 'Necesitamos fecha, producto, cantidad e importe. Si el archivo trae otros nombres, puedes mapearlos.' },
            { title: 'Alias', text: 'Cuando confirmas, el sistema aprende nombres del TPV para que la siguiente carga sea mas automatica.' },
            { title: 'KPI', text: 'Las lineas vinculadas se registran como ventas TPV y alimentan estadisticas, rentabilidad y atribucion.' },
          ],
        }}
      >
        {pendingMigration && (
          <section className={styles.panelDark} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Migracion pendiente</h2>
                <p className={styles.panelSub}>Aplica `supabase/add_pos_imports.sql` para guardar importaciones, alias y lineas TPV.</p>
              </div>
            </div>
          </section>
        )}

        <section className={styles.statsGrid}>
          <div className={styles.stat}><p className={styles.statValue}>{resumen?.filas_total ?? '-'}</p><p className={styles.statLabel}>Filas leidas</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{resumen?.filas_match ?? '-'}</p><p className={styles.statLabel}>Matches directos</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{resumen?.filas_revision ?? '-'}</p><p className={styles.statLabel}>A revisar</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{resumen?.filas_duplicadas ?? '-'}</p><p className={styles.statLabel}>Duplicadas</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{resumen ? eur(resumen.importe_total, 0) : '-'}</p><p className={styles.statLabel}>Importe detectado</p></div>
        </section>

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>1. Subir archivo</h2>
              <p className={styles.panelSub}>Acepta CSV, XLSX o XLS exportado desde el TPV.</p>
            </div>
            {file && <span className={styles.badge}>{file.name}</span>}
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <label>
                <span className={styles.label}>Archivo TPV</span>
                <input className={styles.input} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={prepararArchivo} />
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'end', minHeight: 72 }}>
                <input type="checkbox" checked={guardarAliases} onChange={e => setGuardarAliases(e.target.checked)} />
                <span className={styles.sectionText}>Guardar alias aprendidos del TPV</span>
              </label>
            </div>
            <div className={styles.actionRow} style={{ marginTop: 14 }}>
              <button type="button" className={styles.primary} disabled={!fileBase64 || procesando} onClick={() => previsualizar()}>
                {procesando ? 'Leyendo...' : 'Previsualizar'}
              </button>
              {mensaje && <p className={styles.tiny}>{mensaje}</p>}
            </div>
          </div>
        </section>

        {preview && (
          <section className={styles.panel} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>2. Mapear columnas</h2>
                <p className={styles.panelSub}>La app propone el mapeo; ajustalo si el TPV usa nombres raros.</p>
              </div>
              <button type="button" className={styles.secondary} disabled={procesando} onClick={() => previsualizar(mapping)}>Releer con mapping</button>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.formGridThree}>
                {CAMPOS.map(([campo, label]) => (
                  <label key={campo}>
                    <span className={styles.label}>{label}</span>
                    <select className={styles.select} value={mapping[campo] || ''} onChange={e => cambiarMapping(campo, e.target.value)}>
                      <option value="">Sin mapear</option>
                      {(preview.columnas || []).map(columna => (
                        <option key={columna} value={columna}>{columna}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </section>
        )}

        {preview?.duplicate_file && (
          <section className={styles.panelDark} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Archivo ya importado</h2>
                <p className={styles.panelSub}>
                  Coincide con {preview.duplicate_batch?.archivo_nombre || 'una importacion anterior'}.
                  Para no duplicar ventas ni margen, la confirmacion queda bloqueada.
                </p>
              </div>
              <span className={styles.badge}>{preview.duplicate_batch?.filas_total || 0} filas</span>
            </div>
          </section>
        )}

        {preview && (
          <section className={styles.panel} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>3. Revisar coincidencias</h2>
                <p className={styles.panelSub}>Corrige las lineas dudosas. Las lineas sin vino no se importan como venta de vino.</p>
              </div>
              <span className={styles.badge}>{filasImportables} importables</span>
            </div>
            <div className={styles.panelBody}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Fecha', 'Producto TPV', 'Cant.', 'Importe', 'Match', 'Conf.', 'Corregir'].map(head => (
                        <th key={head} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #dfddd6', color: '#706a64' }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.slice(0, 120).map(fila => {
                      const override = overrides[fila.source_index]
                      const vinoOverride = override ? vinos.find(vino => String(vino.id) === String(override)) : null
                      const vinoNombre = vinoOverride?.nombre || fila.vino_nombre || 'Sin vino'
                      const estado = fila.duplicada ? 'duplicada' : override ? 'manual' : fila.estado_match
                      return (
                        <tr key={fila.source_index}>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee' }}>{fila.fecha}</td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee', minWidth: 220 }}>
                            <strong>{fila.producto_original}</strong>
                            <br />
                            <span style={{ color: '#8a8278' }}>{fila.match_motivo || 'sin lectura'}</span>
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee' }}>{fila.cantidad}</td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee' }}>{eur(fila.importe)}</td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee' }}>
                            <span className={styles.badge}>{estadoLabel(estado)}</span>
                            <p className={styles.sectionText} style={{ margin: '5px 0 0' }}>{vinoNombre}</p>
                            {fila.duplicada && <p className={styles.tiny}>Ya importada en otro batch.</p>}
                          </td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee' }}>{override ? '100%' : `${fila.match_confidence_pct || 0}%`}</td>
                          <td style={{ padding: '10px 8px', borderBottom: '1px solid #eee', minWidth: 220 }}>
                            <select
                              className={styles.select}
                              value={override || ''}
                              disabled={fila.duplicada}
                              onChange={e => setOverrides(actual => ({ ...actual, [fila.source_index]: e.target.value }))}
                            >
                              <option value="">Usar propuesta</option>
                              {vinos.map(vino => (
                                <option key={vino.id} value={vino.id}>
                                  {vino.nombre}{vino.bodega ? ` - ${vino.bodega}` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filas.length > 120 && <p className={styles.tiny}>Mostrando 120 de {filas.length} filas. La confirmacion importa todo el archivo.</p>}
              <div className={styles.actionRow} style={{ marginTop: 16 }}>
                <button type="button" className={styles.primary} disabled={procesando || filasImportables === 0 || pendingMigration || preview.duplicate_file} onClick={confirmar}>
                  {procesando ? 'Importando...' : 'Confirmar importacion'}
                </button>
                <button type="button" className={styles.secondary} disabled={procesando} onClick={() => { setPreview(null); setOverrides({}) }}>
                  Cancelar revision
                </button>
              </div>
            </div>
          </section>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Historial reciente</h2>
              <p className={styles.panelSub}>{perfilBodega ? 'Ultimas importaciones confirmadas para esta bodega.' : 'Ultimas importaciones confirmadas para este restaurante.'}</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            {batches.length ? (
              <div className={styles.itemStack}>
                {batches.map(batch => (
                  <article className={styles.itemCard} key={batch.id}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{batch.archivo_nombre || 'Archivo TPV'}</h3>
                        <p className={styles.sectionText}>
                          {batch.filas_total} filas - {batch.filas_match} match - {batch.filas_revision} revision - {batch.filas_sin_match} sin match - {batch.filas_duplicadas || 0} duplicadas
                        </p>
                      </div>
                      <span className={styles.badge}>{eur(batch.importe_total, 0)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aun no hay importaciones TPV.</div>
            )}
          </div>
        </section>
      </ModuleShell>
    </FeatureGate>
  )
}
