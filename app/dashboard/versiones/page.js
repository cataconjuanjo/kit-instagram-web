'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'
import ConfirmationDialog from '../ConfirmationDialog'
import styles from '../module.module.css'

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

function formatoFecha(fecha) {
  if (!fecha) return 'Sin fecha'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function resumenContenido(resumen = {}) {
  return `${resumen.vinosActivos || 0} vinos · ${resumen.vinosConPrecio || 0} con precio · ${resumen.platosActivos || 0} platos`
}

function precio(valor) {
  const numero = Number(valor || 0)
  if (!numero) return '-'
  return `${numero.toLocaleString('es-ES', { maximumFractionDigits: 2 })} EUR`
}

function cambioTexto(cambio) {
  if (['precio_botella', 'precio_copa', 'precio'].includes(cambio.campo)) {
    return `${cambio.label}: ${precio(cambio.anterior)} -> ${precio(cambio.actual)}`
  }
  return `${cambio.label}: ${cambio.anterior || '-'} -> ${cambio.actual || '-'}`
}

function totalCambiosComparacion(comparacion) {
  if (!comparacion) return 0
  return Object.values(comparacion.resumen || {}).reduce((sum, value) => sum + Number(value || 0), 0)
}

function contarCambiosPrecio(comparacion) {
  const items = [
    ...(comparacion?.vinos?.cambiados || []),
    ...(comparacion?.platos?.cambiados || []),
  ]
  return items.reduce((sum, item) => (
    sum + (item.cambios || []).filter(cambio => ['precio_botella', 'precio_copa', 'precio'].includes(cambio.campo)).length
  ), 0)
}

function contarRetirados(comparacion) {
  const resumen = comparacion?.resumen || {}
  return Number(resumen.vinos_eliminados || 0) + Number(resumen.platos_eliminados || 0)
}

function contarAgregados(comparacion) {
  const resumen = comparacion?.resumen || {}
  return Number(resumen.vinos_agregados || 0) + Number(resumen.platos_agregados || 0)
}

function lecturaOperativa({ totalCambios, cambiosPrecio, retirados, agregados, versionSeleccionadaEsUltima, cartaPublicada }) {
  if (totalCambios === 0) {
    return {
      etiqueta: 'Segura',
      titulo: 'La carta actual coincide con la version seleccionada',
      texto: cartaPublicada
        ? 'Puedes usar QR, enlace o impresion con bajo riesgo: no hay diferencias detectadas frente a la foto publicada.'
        : 'La carta coincide con esta version, pero sigue en borrador. Revisa la preview antes de volver a publicar.',
      accion: versionSeleccionadaEsUltima ? 'Mantener version actual' : 'Puedes comparar con la ultima version publicada antes de decidir.',
    }
  }

  if (cambiosPrecio > 0 || retirados > 0) {
    return {
      etiqueta: 'Revisar',
      titulo: 'Hay cambios sensibles antes de imprimir o publicar',
      texto: `${cambiosPrecio} cambios de precio y ${retirados} elementos retirados pueden afectar a mesa, imprenta o aprobacion previa.`,
      accion: 'Si necesitas volver a una base fiable, restaura esta version como borrador y genera una nueva preview.',
    }
  }

  if (agregados > 0) {
    return {
      etiqueta: 'Moderada',
      titulo: 'La carta actual ha crecido desde esta version',
      texto: `${agregados} elementos nuevos no estaban en la version publicada seleccionada.`,
      accion: 'Revisa que las altas tengan precio y encajen con el QR antes de publicar.',
    }
  }

  return {
    etiqueta: 'Ligera',
    titulo: 'Hay cambios de contenido no criticos',
    texto: 'No se detectan retiradas ni cambios de precio, pero si ajustes de datos visibles para el cliente.',
    accion: 'Haz una prueba privada y aprueba la preview antes de publicar de nuevo.',
  }
}

function DiffList({ title, items = [], empty, type = 'changed' }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          <p className={styles.panelSub}>{items.length ? `${items.length} cambios detectados` : empty}</p>
        </div>
        <span className={styles.badge}>{items.length}</span>
      </div>
      <div className={styles.panelBody}>
        {items.length ? (
          <div className={styles.itemStack}>
            {items.slice(0, 8).map((item, index) => (
              <article className={styles.itemCard} key={`${title}-${item.id || item.nombre}-${index}`}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>{item.nombre || 'Elemento sin nombre'}</h3>
                    {type === 'changed' ? (
                      <p className={styles.sectionText}>{item.cambios.map(cambioTexto).join(' · ')}</p>
                    ) : (
                      <p className={styles.sectionText}>{type === 'added' ? 'Existe ahora, no estaba en la version publicada.' : 'Estaba publicado y ya no existe en la carta actual.'}</p>
                    )}
                  </div>
                  <span className={styles.badge}>{type === 'added' ? 'Nuevo' : type === 'removed' ? 'Quitado' : 'Cambio'}</span>
                </div>
              </article>
            ))}
            {items.length > 8 && (
              <p className={styles.panelSub}>Mostrando los primeros 8 cambios. Revisa la carta completa antes de publicar.</p>
            )}
          </div>
        ) : (
          <div className={styles.empty}>{empty}</div>
        )}
      </div>
    </section>
  )
}

export default function VersionesPublicacionPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [snapshots, setSnapshots] = useState([])
  const [snapshot, setSnapshot] = useState(null)
  const [actual, setActual] = useState(null)
  const [comparacion, setComparacion] = useState(null)
  const [snapshotPendiente, setSnapshotPendiente] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [cargandoVersion, setCargandoVersion] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [confirmarRestauracion, setConfirmarRestauracion] = useState(null)
  const [mensaje, setMensaje] = useState('')

  const cargarVersiones = useCallback(async (restauranteId, snapshotId = '') => {
    if (!restauranteId) return
    setCargandoVersion(true)
    setError('')
    try {
      const token = await tokenSesion()
      const query = new URLSearchParams({ restaurante_id: restauranteId })
      if (snapshotId) query.set('snapshot_id', snapshotId)
      const res = await fetch(`/api/publicacion/snapshots?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.snapshot_pendiente) {
          setSnapshotPendiente(true)
          setSnapshots([])
          setSnapshot(null)
          setActual(null)
          setComparacion(null)
          return
        }
        throw new Error(data.error || 'No se pudieron cargar las versiones.')
      }
      setSnapshotPendiente(false)
      setSnapshots(data.snapshots || [])
      setSnapshot(data.snapshot || null)
      setActual(data.actual || null)
      setComparacion(data.comparacion || null)
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las versiones.')
    } finally {
      setCargandoVersion(false)
    }
  }, [])

  async function restaurarSnapshot() {
    if (!restaurante?.id || !confirmarRestauracion?.id) return
    setRestaurando(true)
    setError('')
    setMensaje('')
    try {
      const token = await tokenSesion()
      const res = await fetch('/api/publicacion/snapshots/restaurar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          snapshot_id: confirmarRestauracion.id,
          confirmar: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo restaurar la version.')
      setRestaurante(prev => prev ? { ...prev, carta_publica_activa: false } : prev)
      setConfirmarRestauracion(null)
      setMensaje(data.historial_error
        ? 'Version restaurada como borrador, pero no se pudo registrar el historial.'
        : `Version v${data.snapshot?.version_number || confirmarRestauracion.version_number} restaurada como borrador. Revisa y publica cuando este lista.`
      )
      await cargarVersiones(restaurante.id, confirmarRestauracion.id)
    } catch (err) {
      setError(err.message || 'No se pudo restaurar la version.')
    } finally {
      setRestaurando(false)
    }
  }

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      setRestaurante(rest || null)
      if (rest?.id) await cargarVersiones(rest.id)
      setLoading(false)
    }
    cargar()
  }, [cargarVersiones])

  if (loading) return <LoadingState />

  const totalCambios = totalCambiosComparacion(comparacion)
  const cambiosPrecio = contarCambiosPrecio(comparacion)
  const retirados = contarRetirados(comparacion)
  const agregados = contarAgregados(comparacion)
  const ultimaVersion = snapshots[0] || null
  const versionSeleccionadaEsUltima = Boolean(snapshot?.id && ultimaVersion?.id && snapshot.id === ultimaVersion.id)
  const cartaPublicada = restaurante?.carta_publica_activa !== false
  const lectura = lecturaOperativa({
    totalCambios,
    cambiosPrecio,
    retirados,
    agregados,
    versionSeleccionadaEsUltima,
    cartaPublicada,
  })

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Publicacion"
      title="Versiones publicadas"
      subtitle="Compara una foto publicada de la carta con el contenido actual antes de volver a imprimir, compartir o revisar QR."
      actions={
        <>
          <Link className={styles.secondary} href="/dashboard/qr">Volver a QR</Link>
          <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>
        </>
      }
      help={{
        title: 'Como leer una version',
        intro: 'Cada version es una foto del contenido visible cuando pulsaste Publicar carta.',
        items: [
          { title: 'Cambios de precio', text: 'Son los mas sensibles antes de imprimir o compartir materiales.' },
          { title: 'Altas y bajas', text: 'Ayudan a detectar si el QR publico esta mostrando algo distinto a lo aprobado.' },
          { title: 'Restaurar', text: 'Devuelve vinos y platos visibles a esa foto y deja la carta en borrador para revisar antes de publicar.' },
        ],
      }}
    >
      {mensaje && (
        <section className={styles.empty} style={{ marginBottom: 16 }}>
          <div>
            <strong>Restauracion completada</strong>
            <p>{mensaje}</p>
          </div>
        </section>
      )}
      {snapshotPendiente ? (
        <section className={styles.empty}>
          <div>
            <strong>Versiones pendientes de base de datos</strong>
            <p>Aplica supabase/add_publication_snapshots.sql para guardar y comparar versiones publicadas.</p>
          </div>
        </section>
      ) : error ? (
        <section className={styles.empty}>
          <div>
            <strong>No se pudieron cargar las versiones</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : snapshots.length === 0 ? (
        <section className={styles.empty}>
          <div>
            <strong>Aun no hay versiones publicadas</strong>
            <p>Publica la carta desde QR para crear la primera foto versionada.</p>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.panelDark} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Version segura</h2>
                <p className={styles.panelSub}>Lectura operativa antes de imprimir, compartir QR o volver a publicar.</p>
              </div>
              <span className={styles.badge}>{lectura.etiqueta}</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.gridTwo}>
                <article className={styles.itemCard}>
                  <h3 className={styles.sectionTitle}>Version seleccionada</h3>
                  <p className={styles.sectionText}>
                    {snapshot
                      ? `v${snapshot.version_number} - ${formatoFecha(snapshot.created_at)} - ${snapshot.actor_email || 'responsable'}`
                      : 'Sin version seleccionada'}
                  </p>
                  <p className={styles.sectionText}>
                    {versionSeleccionadaEsUltima ? 'Es la ultima version publicada.' : `No es la ultima version publicada${ultimaVersion ? `: la mas reciente es v${ultimaVersion.version_number}` : ''}.`}
                  </p>
                </article>
                <article className={styles.itemCard}>
                  <h3 className={styles.sectionTitle}>Carta actual</h3>
                  <p className={styles.sectionText}>{actual ? resumenContenido(actual.contenido_resumen) : '-'}</p>
                  <p className={styles.sectionText}>{cartaPublicada ? 'La carta esta publicada.' : 'La carta esta en borrador.'}</p>
                </article>
              </div>
              <article className={styles.itemCard} style={{ marginTop: 12 }}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <div>
                    <h3 className={styles.sectionTitle}>{lectura.titulo}</h3>
                    <p className={styles.sectionText}>{lectura.texto}</p>
                    <p className={styles.sectionText}>{lectura.accion}</p>
                  </div>
                  <span className={styles.badge}>{totalCambios} cambios</span>
                </div>
              </article>
              <div className={styles.actionRow} style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className={totalCambios > 0 ? styles.danger : styles.ghost}
                  onClick={() => setConfirmarRestauracion(snapshot)}
                  disabled={!snapshot || restaurando || cargandoVersion}
                >
                  {restaurando ? 'Restaurando...' : 'Restaurar esta version'}
                </button>
                <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar borrador</OpenCartaPruebaButton>
                <Link className={styles.secondary} href="/dashboard/qr">Ir a QR</Link>
              </div>
            </div>
          </section>

          <section className={styles.statsGrid}>
            <div className={styles.stat}><p className={styles.statValue}>v{snapshot?.version_number || '-'}</p><p className={styles.statLabel}>Version seleccionada</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{snapshots.length}</p><p className={styles.statLabel}>Versiones guardadas</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{totalCambios}</p><p className={styles.statLabel}>Cambios frente a actual</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{cambiosPrecio}</p><p className={styles.statLabel}>Cambios de precio</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{retirados}</p><p className={styles.statLabel}>Elementos retirados</p></div>
          </section>

          <section className={styles.gridTwo}>
            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <div>
                  <h2 className={styles.panelTitle}>Versiones</h2>
                  <p className={styles.panelSub}>Elige una version para compararla con la carta actual.</p>
                </div>
                {cargandoVersion && <span className={styles.badge}>Cargando</span>}
              </div>
              <div className={styles.panelBody}>
                <div className={styles.itemStack}>
                  {snapshots.map(item => (
                    <button
                      type="button"
                      className={styles.itemCard}
                      key={item.id}
                      onClick={() => cargarVersiones(restaurante.id, item.id)}
                    >
                      <div className={styles.sectionHead} style={{ margin: 0 }}>
                        <div>
                          <h3 className={styles.sectionTitle}>Version v{item.version_number}</h3>
                          <p className={styles.sectionText}>{formatoFecha(item.created_at)} · {item.actor_email || 'responsable'}</p>
                          <p className={styles.sectionText}>{resumenContenido(item.contenido_resumen)}</p>
                        </div>
                        <span className={styles.badge}>
                          {snapshot?.id === item.id ? 'Seleccionada' : item.id === ultimaVersion?.id ? 'Ultima' : 'Ver'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.panelDark}>
              <div className={styles.panelHead}>
                <div>
                  <h2 className={styles.panelTitle}>Resumen comparativo</h2>
                  <p className={styles.panelSub}>{lectura.titulo}</p>
                </div>
                <span className={styles.badge}>{totalCambios ? `${totalCambios} cambios` : 'Sin cambios'}</span>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.itemStack}>
                  <div className={styles.itemCard}>
                    <h3 className={styles.sectionTitle}>Publicado</h3>
                    <p className={styles.sectionText}>{snapshot ? resumenContenido(snapshot.contenido_resumen) : '-'}</p>
                  </div>
                  <div className={styles.itemCard}>
                    <h3 className={styles.sectionTitle}>Actual</h3>
                    <p className={styles.sectionText}>{actual ? resumenContenido(actual.contenido_resumen) : '-'}</p>
                  </div>
                  <div className={styles.gridTwo}>
                    <div className={styles.itemCard}>
                      <h3 className={styles.sectionTitle}>Cambios sensibles</h3>
                      <p className={styles.sectionText}>{cambiosPrecio} cambios de precio Â· {retirados} retirados</p>
                    </div>
                    <div className={styles.itemCard}>
                      <h3 className={styles.sectionTitle}>Altas nuevas</h3>
                      <p className={styles.sectionText}>{agregados} elementos nuevos frente a esta version.</p>
                    </div>
                  </div>
                  <div className={styles.actionRow}>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => setConfirmarRestauracion(snapshot)}
                      disabled={!snapshot || restaurando || cargandoVersion}
                    >
                      {restaurando ? 'Restaurando...' : 'Restaurar como borrador'}
                    </button>
                    <Link className={styles.secondary} href="/dashboard/vinos">Revisar vinos</Link>
                    <Link className={styles.secondary} href="/dashboard/platos">Revisar platos</Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {comparacion && (
            <section className={styles.itemStack} style={{ marginTop: 16 }}>
              <DiffList title="Vinos con precio o datos cambiados" items={comparacion.vinos.cambiados} empty="No hay cambios en vinos comunes." />
              <div className={styles.gridTwo}>
                <DiffList title="Vinos añadidos" items={comparacion.vinos.agregados} empty="No hay vinos nuevos frente a la version." type="added" />
                <DiffList title="Vinos quitados" items={comparacion.vinos.eliminados} empty="No hay vinos retirados frente a la version." type="removed" />
              </div>
              <DiffList title="Platos con cambios" items={comparacion.platos.cambiados} empty="No hay cambios en platos comunes." />
              <div className={styles.gridTwo}>
                <DiffList title="Platos añadidos" items={comparacion.platos.agregados} empty="No hay platos nuevos frente a la version." type="added" />
                <DiffList title="Platos quitados" items={comparacion.platos.eliminados} empty="No hay platos retirados frente a la version." type="removed" />
              </div>
            </section>
          )}
        </>
      )}
      <ConfirmationDialog
        open={Boolean(confirmarRestauracion)}
        onClose={() => setConfirmarRestauracion(null)}
        onConfirm={restaurarSnapshot}
        title={`Restaurar version v${confirmarRestauracion?.version_number || ''}`}
        description="La carta publica se pausara y los vinos y platos visibles volveran a la foto seleccionada. Despues tendras que revisar, generar preview y aprobar antes de publicar."
        confirmLabel="Restaurar borrador"
        busy={restaurando}
      >
        <div className={styles.itemStack}>
          <div className={styles.itemCard}>
            <h3 className={styles.sectionTitle}>Version seleccionada</h3>
            <p className={styles.sectionText}>
              {confirmarRestauracion
                ? `${formatoFecha(confirmarRestauracion.created_at)} · ${resumenContenido(confirmarRestauracion.contenido_resumen)}`
                : '-'}
            </p>
          </div>
          <div className={styles.itemCard}>
            <h3 className={styles.sectionTitle}>Que ocurrira</h3>
            <p className={styles.sectionText}>
              Los elementos actuales que no pertenezcan a esa version quedaran ocultos. No se publicara automaticamente ni saltara el control de aprobacion.
            </p>
          </div>
        </div>
      </ConfirmationDialog>
    </ModuleShell>
  )
}
