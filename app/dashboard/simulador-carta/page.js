'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { puedeUsar } from '../../lib/plans'
import { normWine } from '../../lib/textNormalize'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import ConfirmationDialog from '../ConfirmationDialog'
import styles from '../module.module.css'
import simStyles from './simulador.module.css'

const ESTADO_LABEL = { actual: 'Actual', nuevo: 'Nuevo', fuera: 'Fuera' }
const ESTADO_ORDER = { actual: 0, nuevo: 1, fuera: 2 }

function eur(valor) {
  if (!Number(valor)) return '—'
  return Number(valor).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function margenBotella(pvp, coste) {
  const p = Number(pvp), c = Number(coste)
  if (!p || !c) return null
  return Math.round(((p - c) / p) * 100)
}

export default function SimuladorCarta() {
  const [restaurante, setRestaurante] = useState(null)
  const [lineas, setLineas] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [guardando, setGuardando] = useState('')
  const [inlineEdit, setInlineEdit] = useState(null) // { id, campo, valor }
  const [confirmPublicar, setConfirmPublicar] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }

      const { data: rest } = await supabase
        .from('restaurantes')
        .select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
        .eq('email', email)
        .single()

      if (!rest) { setLoading(false); return }
      setRestaurante(rest)

      if (puedeUsar(rest, 'catalogo_consultor')) {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(
          `/api/simulador?${new URLSearchParams({ restaurante_id: rest.id })}`,
          { headers: { Authorization: `Bearer ${session?.access_token}` } }
        ).catch(() => null)
        if (res?.ok) {
          const json = await res.json()
          setLineas(json.lineas || [])
        }
      }
      setLoading(false)
    }
    cargar()
  }, [])

  // ── Resumen calculado en tiempo real ───────────────────────────────
  const resumen = useMemo(() => {
    const activas = lineas.filter(l => l.estado !== 'fuera')
    const conMargen = activas.filter(l => Number(l.coste_compra) > 0 && Number(l.precio_botella) > 0)
    const margenMedio = conMargen.length
      ? Math.round(
          conMargen.reduce((sum, l) =>
            sum + ((Number(l.precio_botella) - Number(l.coste_compra)) / Number(l.precio_botella)) * 100, 0
          ) / conMargen.length
        )
      : null
    return {
      total: activas.length,
      nuevos: lineas.filter(l => l.estado === 'nuevo').length,
      retirados: lineas.filter(l => l.estado === 'fuera').length,
      margenMedio,
    }
  }, [lineas])

  // ── Comparación borrador vs carta oficial ─────────────────────────
  const comparacion = useMemo(() => {
    const tieneNuevos = lineas.some(l => l.estado === 'nuevo')
    const tieneFuera  = lineas.some(l => l.estado === 'fuera')
    if (!tieneNuevos && !tieneFuera) return null

    function margenMedioOf(lista) {
      const v = lista.filter(l => Number(l.precio_botella) > 0 && Number(l.coste_compra) > 0)
      if (!v.length) return null
      return Math.round(
        v.reduce((sum, l) =>
          sum + ((Number(l.precio_botella) - Number(l.coste_compra)) / Number(l.precio_botella)) * 100, 0
        ) / v.length
      )
    }

    const oficial  = lineas.filter(l => l.estado === 'actual' || l.estado === 'fuera')
    const borrador = lineas.filter(l => l.estado === 'actual' || l.estado === 'nuevo')

    const margenOficial  = margenMedioOf(oficial)
    const margenBorrador = margenMedioOf(borrador)
    const deltaMargen = (margenOficial !== null && margenBorrador !== null)
      ? margenBorrador - margenOficial
      : null

    const regionesOficial  = new Set(oficial.map(l => normWine(l.region)).filter(Boolean))
    const regionesBorrador = new Set(borrador.map(l => normWine(l.region)).filter(Boolean))
    const deltaRegiones = regionesBorrador.size - regionesOficial.size

    // Nada útil que mostrar: ni datos de margen ni cambio de regiones
    if (deltaMargen === null && deltaRegiones === 0) return null

    return { deltaMargen, deltaRegiones }
  }, [lineas])

  // ── Proyección de inversión inicial (solo vinos nuevos, 6 uds/ref.) ─
  const proyeccion = useMemo(() => {
    const nuevas = lineas.filter(l => l.estado === 'nuevo')
    if (!nuevas.length) return null
    const conCoste = nuevas.filter(l => Number(l.coste_compra) > 0)
    const sinCoste = nuevas.length - conCoste.length
    const total    = conCoste.reduce((sum, l) => sum + Number(l.coste_compra) * 6, 0)
    return { total, sinCoste, refs: nuevas.length }
  }, [lineas])

  // Ordenar: actual → nuevo → fuera; dentro de cada grupo, por nombre
  const lineasOrdenadas = useMemo(() =>
    [...lineas].sort((a, b) => {
      const ord = ESTADO_ORDER[a.estado] - ESTADO_ORDER[b.estado]
      return ord !== 0 ? ord : a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    }), [lineas])

  // ── Helpers de llamadas a la API ───────────────────────────────────
  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function patchLinea(id, cambios) {
    const t = await getToken()
    return fetch(`/api/simulador/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id, ...cambios }),
    })
  }

  async function deleteLinea(id) {
    const t = await getToken()
    return fetch(`/api/simulador/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id }),
    })
  }

  async function recargarLineas() {
    const t = await getToken()
    const res = await fetch(
      `/api/simulador?${new URLSearchParams({ restaurante_id: restaurante.id })}`,
      { headers: { Authorization: `Bearer ${t}` } }
    ).catch(() => null)
    if (res?.ok) {
      const json = await res.json()
      setLineas(json.lineas || [])
    }
  }

  async function publicar() {
    setPublicando(true)
    const t = await getToken()
    const res = await fetch('/api/simulador/publicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id }),
    }).catch(() => null)

    if (!res?.ok) {
      setPublicando(false)
      setConfirmPublicar(false)
      setErrorMsg('No se pudo publicar la carta. Inténtalo de nuevo.')
      return
    }

    // Optimistic: quitar fuera y nuevo inmediatamente
    setLineas(prev => prev.filter(l => l.estado === 'actual'))
    setConfirmPublicar(false)
    setPublicando(false)
    setSuccessMsg('¡Carta publicada! Los cambios ya están activos en tu bodega.')
    setTimeout(() => setSuccessMsg(''), 6000)
    // Re-sincronizar para cargar los vinos recién creados como 'actual'
    await recargarLineas()
  }

  // ── Edición inline de precios ──────────────────────────────────────
  function startInline(linea, campo) {
    setInlineEdit({ id: linea.id, campo, valor: String(linea[campo] ?? '') })
  }

  async function saveInline() {
    if (!inlineEdit) return
    const { id, campo, valor } = inlineEdit
    const parsed = parseFloat(String(valor).replace(',', '.'))
    const nuevo = isNaN(parsed) || parsed < 0 ? null : parsed
    setInlineEdit(null)
    setLineas(prev => prev.map(l => l.id === id ? { ...l, [campo]: nuevo } : l))
    const res = await patchLinea(id, { [campo]: nuevo })
    if (!res.ok) setErrorMsg('No se pudo guardar el cambio de precio')
  }

  // ── Cambio de estado: actual ↔ fuera ───────────────────────────────
  async function cambiarEstado(linea, nuevoEstado) {
    setGuardando(linea.id)
    setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, estado: nuevoEstado } : l))
    const res = await patchLinea(linea.id, { estado: nuevoEstado })
    if (!res.ok) {
      setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, estado: linea.estado } : l))
      setErrorMsg('No se pudo actualizar el estado')
    }
    setGuardando('')
  }

  // ── Eliminar línea nueva (DELETE real, no PATCH a 'fuera') ─────────
  async function eliminarNuevo(linea) {
    setGuardando(linea.id)
    setLineas(prev => prev.filter(l => l.id !== linea.id))
    const res = await deleteLinea(linea.id)
    if (!res.ok) {
      setLineas(prev =>
        [...prev, linea].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
      )
      setErrorMsg('No se pudo eliminar la referencia')
    }
    setGuardando('')
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (loading) return <LoadingState title="Preparando el simulador…" />

  return (
    <FeatureGate restaurante={restaurante} feature="catalogo_consultor" title="Simulador de carta">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Carta pública"
        title="Simulador de carta"
        subtitle="Prepara el borrador de tu futura carta sin afectar a la que ven tus clientes."
        actions={
          <button
            type="button"
            className={styles.primary}
            disabled={resumen.nuevos === 0 && resumen.retirados === 0}
            title={resumen.nuevos === 0 && resumen.retirados === 0 ? 'Sin cambios pendientes' : 'Publicar los cambios en la carta real'}
            onClick={() => setConfirmPublicar(true)}
          >
            Publicar como carta oficial
          </button>
        }
      >
        {/* ── Resumen en vivo ───────────────────────────────── */}
        <div className={simStyles.summary}>
          <StatCard value={resumen.total} label="Referencias activas" />
          <StatCard
            value={resumen.nuevos}
            label="Nuevas"
            hint="Vienen del catálogo del consultor"
            valueStyle={resumen.nuevos > 0 ? { color: 'var(--cv-gold)' } : undefined}
          />
          <StatCard
            value={resumen.retirados}
            label="Para retirar"
            hint="Se ocultarán al publicar"
            valueStyle={resumen.retirados > 0 ? { color: 'var(--cv-red)' } : undefined}
          />
          <StatCard
            value={resumen.margenMedio !== null ? `${resumen.margenMedio} %` : '—'}
            label="Margen medio est."
            hint="Solo activas con coste registrado"
            valueStyle={
              resumen.margenMedio !== null
                ? { color: resumen.margenMedio >= 65 ? 'var(--cv-green)' : resumen.margenMedio < 55 ? 'var(--cv-red)' : undefined }
                : undefined
            }
          />
        </div>

        {/* ── Comparación borrador vs carta actual ──────────── */}
        {comparacion && (
          <div className={simStyles.comparacion}>
            <span className={simStyles.comparacionLabel}>Si publicas:</span>
            {comparacion.deltaMargen !== null ? (
              <span>
                Margen{' '}
                <span className={
                  comparacion.deltaMargen > 0 ? simStyles.comparacionPos
                  : comparacion.deltaMargen < 0 ? simStyles.comparacionNeg
                  : simStyles.comparacionNeutral
                }>
                  {comparacion.deltaMargen > 0 ? '+' : ''}{comparacion.deltaMargen} pp
                </span>
              </span>
            ) : null}
            {comparacion.deltaRegiones !== 0 ? (
              <span>
                Regiones D.O.{' '}
                <span className={comparacion.deltaRegiones > 0 ? simStyles.comparacionPos : simStyles.comparacionNeg}>
                  {comparacion.deltaRegiones > 0 ? '+' : ''}{comparacion.deltaRegiones}
                </span>
              </span>
            ) : null}
            {(comparacion.deltaMargen === 0 || comparacion.deltaMargen === null) && comparacion.deltaRegiones === 0 && (
              <span className={simStyles.comparacionNeutral}>Sin cambios en margen ni diversidad de regiones</span>
            )}
          </div>
        )}

        {/* ── Tabla ─────────────────────────────────────────── */}
        {lineas.length === 0 ? (
          <section className={styles.empty}>
            <p>No hay ninguna referencia en el simulador todavía.</p>
            <p>
              Los vinos activos de tu carta aparecerán aquí automáticamente la primera vez que cargues el simulador.
              Abre el <strong>Catálogo del consultor</strong> en Bodega y pulsa <strong>+ Simular</strong> en cualquier referencia para añadir novedades al borrador.
            </p>
          </section>
        ) : (
          <div className={simStyles.tableWrap}>
            <table className={simStyles.table}>
              <thead>
                <tr>
                  <th className={simStyles.thVino}>Vino</th>
                  <th>Tipo</th>
                  <th>D.O. / Zona</th>
                  <th>Añada</th>
                  <th className={simStyles.thNum}>PVP bot. €</th>
                  <th className={simStyles.thNum}>PVP copa €</th>
                  <th className={simStyles.thNum}>Coste €</th>
                  <th className={simStyles.thNum}>Mrg. %</th>
                  <th className={simStyles.thEstado}>Estado</th>
                  <th className={simStyles.thAccion}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {lineasOrdenadas.map(linea => {
                  const mrg = margenBotella(linea.precio_botella, linea.coste_compra)
                  const isFuera = linea.estado === 'fuera'
                  const isNuevo = linea.estado === 'nuevo'
                  const busy = guardando === linea.id
                  return (
                    <tr
                      key={linea.id}
                      className={[
                        isFuera ? simStyles.rowFuera : '',
                        isNuevo ? simStyles.rowNuevo : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {/* Nombre + bodega */}
                      <td>
                        <div className={simStyles.nombreWrap}>
                          <span className={isFuera ? simStyles.tachado : ''}>{linea.nombre}</span>
                          {linea.bodega && <span className={simStyles.bodega}>{linea.bodega}</span>}
                        </div>
                      </td>

                      <td>{linea.tipo || '—'}</td>
                      <td>{linea.region || '—'}</td>
                      <td>{linea.anada || '—'}</td>

                      {/* Precios editables inline */}
                      {['precio_botella', 'precio_copa', 'coste_compra'].map(campo => {
                        const editando = inlineEdit?.id === linea.id && inlineEdit?.campo === campo
                        return (
                          <td
                            key={campo}
                            className={`${simStyles.tdNum} ${simStyles.tdEditable}`}
                            title="Pulsa para editar"
                            onClick={() => !editando && startInline(linea, campo)}
                          >
                            {editando ? (
                              <input
                                autoFocus
                                className={simStyles.inlineInput}
                                type="number"
                                min="0"
                                step="0.5"
                                value={inlineEdit.valor}
                                onChange={e => setInlineEdit({ ...inlineEdit, valor: e.target.value })}
                                onBlur={saveInline}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); saveInline() }
                                  if (e.key === 'Escape') setInlineEdit(null)
                                }}
                              />
                            ) : eur(linea[campo])}
                          </td>
                        )
                      })}

                      {/* Margen calculado */}
                      <td className={simStyles.tdNum}>
                        {mrg !== null ? (
                          <span style={mrg >= 65 ? { color: 'var(--cv-green)' } : mrg < 55 ? { color: 'var(--cv-red)' } : {}}>
                            {mrg} %
                          </span>
                        ) : '—'}
                      </td>

                      {/* Badge de estado */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`${simStyles.badge} ${simStyles[`badge_${linea.estado}`]}`}>
                          {ESTADO_LABEL[linea.estado]}
                        </span>
                      </td>

                      {/* Acción: Quitar / Restaurar */}
                      <td style={{ textAlign: 'center' }}>
                        {isFuera ? (
                          <button
                            type="button"
                            className={simStyles.accionBtn}
                            disabled={busy}
                            onClick={() => cambiarEstado(linea, 'actual')}
                          >
                            Restaurar
                          </button>
                        ) : isNuevo ? (
                          <button
                            type="button"
                            className={`${simStyles.accionBtn} ${simStyles.accionBtnDanger}`}
                            disabled={busy}
                            onClick={() => eliminarNuevo(linea)}
                          >
                            Quitar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`${simStyles.accionBtn} ${simStyles.accionBtnDanger}`}
                            disabled={busy}
                            onClick={() => cambiarEstado(linea, 'fuera')}
                          >
                            Quitar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Proyección de inversión inicial ──────────────── */}
        {proyeccion && (
          <div className={simStyles.proyeccion}>
            <span>Inversión estimada</span>
            <span className={simStyles.proyeccionTotal}>{eur(proyeccion.total)}</span>
            <span className={simStyles.proyeccionNota}>
              · estimado a 6 uds/referencia
              {proyeccion.sinCoste > 0 && ` · ${proyeccion.sinCoste} ref. sin coste no incluidas`}
            </span>
          </div>
        )}

        {/* ── Toast de éxito ────────────────────────────────── */}
        {successMsg && (
          <div className={styles.inlineToast} role="status" style={{ marginTop: 12, borderColor: 'var(--cv-green)', color: 'var(--cv-green)' }}>
            {successMsg}
            <button type="button" onClick={() => setSuccessMsg('')} aria-label="Cerrar aviso">Cerrar</button>
          </div>
        )}

        {/* ── Toast de error ────────────────────────────────── */}
        {errorMsg && (
          <div className={styles.inlineToast} role="alert" style={{ marginTop: 12 }}>
            {errorMsg}
            <button type="button" onClick={() => setErrorMsg('')} aria-label="Cerrar aviso">Cerrar</button>
          </div>
        )}

        {/* ── Diálogo de confirmación de publicación ────────── */}
        <ConfirmationDialog
          open={confirmPublicar}
          onClose={() => setConfirmPublicar(false)}
          onConfirm={publicar}
          title="Publicar como carta oficial"
          description={[
            resumen.nuevos > 0
              ? `${resumen.nuevos} ${resumen.nuevos === 1 ? 'vino nuevo se añadirá' : 'vinos nuevos se añadirán'} a tu bodega.`
              : null,
            resumen.retirados > 0
              ? `${resumen.retirados} ${resumen.retirados === 1 ? 'referencia se ocultará' : 'referencias se ocultarán'} de tu carta.`
              : null,
            'Esta acción no se puede deshacer.',
          ].filter(Boolean).join(' ')}
          confirmLabel="Publicar carta"
          busy={publicando}
        />
      </ModuleShell>
    </FeatureGate>
  )
}
