'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getEffectiveRestaurantEmail } from '../../demo'
import { supabase } from '../../supabase'
import { esPerfilBodega } from '../../lib/plans'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

function numero(valor) {
  return Number(valor) || 0
}

function eur(valor, decimales = 0) {
  return `${numero(valor).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} EUR`
}

function pct(valor) {
  return `${Math.round(numero(valor))}%`
}

function fecha(valor) {
  if (!valor) return '-'
  return new Date(valor).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function leerJson(valor) {
  if (!valor) return {}
  if (typeof valor === 'object') return valor
  try {
    return JSON.parse(valor)
  } catch {
    return {}
  }
}

function badgeClass(confianza) {
  if (confianza === 'alta') return `${styles.trafficBadge} ${styles.trafficGreen}`
  if (confianza === 'media') return `${styles.trafficBadge} ${styles.trafficAmber}`
  if (confianza === 'baja') return `${styles.trafficBadge} ${styles.trafficRed}`
  return `${styles.trafficBadge} ${styles.trafficNeutral}`
}

function severidadClass(severidad) {
  if (severidad === 'alta') return `${styles.trafficBadge} ${styles.trafficRed}`
  if (severidad === 'media') return `${styles.trafficBadge} ${styles.trafficAmber}`
  return `${styles.trafficBadge} ${styles.trafficNeutral}`
}

function defensaClass(estado) {
  if (estado === 'presentable') return `${styles.trafficBadge} ${styles.trafficGreen}`
  if (estado === 'presentar_con_contexto') return `${styles.trafficBadge} ${styles.trafficAmber}`
  if (estado === 'no_presentar') return `${styles.trafficBadge} ${styles.trafficRed}`
  return `${styles.trafficBadge} ${styles.trafficNeutral}`
}

function defensaLabel(estado) {
  if (estado === 'presentable') return 'Presentable'
  if (estado === 'presentar_con_contexto') return 'Con contexto'
  if (estado === 'no_presentar') return 'No presentar'
  return 'Sin dato'
}

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

function inputNumber(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export default function TrazabilidadEconomica() {
  const [restaurante, setRestaurante] = useState(null)
  const [trace, setTrace] = useState(null)
  const [ajustes, setAjustes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) {
        window.location.href = '/login'
        return
      }

      const consulta = supabase.from('restaurantes').select('*')
      const { data: rest } = restauranteId
        ? await consulta.eq('id', restauranteId).single()
        : await consulta.eq('email', email).single()

      if (rest) {
        setRestaurante(rest)
        await cargarTrazabilidad(rest.id)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarTrazabilidad(restauranteId) {
    const token = await tokenSesion()
    if (!token || !restauranteId) return
    const query = new URLSearchParams({ restaurante_id: restauranteId })
    const res = await fetch(`/api/economic-traceability?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (!res.ok) {
      setMensaje(data.error || 'No se pudo cargar la trazabilidad.')
      return
    }
    setTrace(data.trazabilidad)
    setAjustes(data.settings)
  }

  function cambiarAjuste(campo, valor, tipo = 'number') {
    setAjustes(actual => ({
      ...(actual || {}),
      [campo]: tipo === 'boolean' ? valor === 'true' : valor,
    }))
  }

  async function guardarAjustes() {
    const token = await tokenSesion()
    if (!token || !restaurante?.id || !ajustes) return
    setGuardando(true)
    setMensaje('')
    try {
      const res = await fetch('/api/economic-traceability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id, settings: ajustes }),
      })
      const data = await res.json()
      if (res.status === 409) throw new Error('Aplica supabase/add_economic_traceability.sql para guardar ajustes.')
      if (!res.ok) throw new Error(data.error || 'No se pudieron guardar los ajustes.')
      setTrace(data.trazabilidad)
      setAjustes(data.settings)
      setMensaje('Ajustes económicos guardados.')
    } catch (error) {
      setMensaje(error.message || 'No se pudieron guardar los ajustes.')
    } finally {
      setGuardando(false)
    }
  }

  async function guardarFoto() {
    const token = await tokenSesion()
    if (!token || !restaurante?.id) return
    setGuardando(true)
    setMensaje('')
    try {
      const res = await fetch('/api/economic-traceability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurante_id: restaurante.id }),
      })
      const data = await res.json()
      if (res.status === 409) throw new Error('Aplica supabase/add_economic_traceability.sql para guardar fotos.')
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la foto.')
      setTrace(data.trazabilidad)
      setAjustes(data.settings)
      setMensaje('Foto de trazabilidad guardada.')
    } catch (error) {
      setMensaje(error.message || 'No se pudo guardar la foto.')
    } finally {
      setGuardando(false)
    }
  }

  const resumen = useMemo(() => trace?.resumen || {}, [trace])
  const comparacion = trace?.comparacion_reportes || null
  const hayMigracionPendiente = (trace?.metadata?.migration_pending || []).length > 0
  const formulas = trace?.formulas || []
  const fuentes = trace?.fuentes || []
  const advertencias = trace?.advertencias || []
  const cambiosSnapshot = trace?.cambios_snapshot || []
  const beneficioLineas = trace?.beneficio_lineas || []
  const defensaCifras = trace?.defensa_cifras || []
  const reports = trace?.reports || []

  const informeCorto = useMemo(() => {
    if (!trace) return ''
    return [
      `Trazabilidad económica - ${restaurante?.nombre || 'Restaurante'}`,
      `Rigor: ${pct(resumen.puntuacion_rigor)}`,
      `Beneficio real TPV: ${eur(resumen.beneficio_real_tpv)}`,
      `Confirmado sala: ${eur(resumen.beneficio_confirmado_sala)}`,
      `Inferido: ${eur(resumen.beneficio_inferido)}`,
      `Oportunidad estimada: ${eur(resumen.oportunidad_estimada)}`,
      `Advertencias: ${resumen.advertencias || 0}`,
      '',
      'Defensa de cifras:',
      ...defensaCifras.map(item => `- ${item.titulo}: ${defensaLabel(item.estado)} (${pct(item.confianza_pct)})`),
    ].join('\n')
  }, [trace, restaurante, resumen, defensaCifras])

  async function copiarInforme() {
    await navigator.clipboard?.writeText(informeCorto)
    setMensaje('Resumen copiado.')
  }

  if (loading) return <LoadingState />
  if (!restaurante) return null
  const perfilBodega = esPerfilBodega(restaurante)

  return (
    <FeatureGate restaurante={restaurante} feature="precios_margenes" title="Trazabilidad no incluida">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Fase 8"
        title="Trazabilidad económica"
        subtitle={perfilBodega
          ? 'Separa TPV real, movimientos confirmados, inferidos y estimados para defender la foto economica de la bodega.'
          : 'Separa venta real, confirmada, inferida y estimada. Cada cifra muestra fuente, confianza y la foto económica usada.'}
        actions={
          <>
            <button type="button" className={styles.secondary} onClick={copiarInforme} disabled={!trace}>Copiar resumen</button>
            <button type="button" className={styles.secondary} onClick={guardarAjustes} disabled={guardando || !ajustes}>
              {guardando ? 'Guardando...' : 'Guardar ajustes'}
            </button>
            <button type="button" className={styles.primary} onClick={guardarFoto} disabled={guardando || !trace}>
              Guardar foto
            </button>
          </>
        }
        help={{
          title: 'Cómo defender los números',
          intro: 'Esta pantalla no optimiza la carta. Audita si las cifras pueden explicarse ante gerencia.',
          items: [
            { title: 'Real', text: 'TPV o importacion con linea vinculada a vino.' },
            { title: 'Confirmado', text: perfilBodega ? 'Movimiento o ajuste operativo validado.' : 'Cierre o sala con resultado validado.' },
            { title: 'Estimado', text: 'Simulador, oportunidad o historico sin venta real.' },
          ],
        }}
      >
        {mensaje && <div className={styles.panel} style={{ marginBottom: 16, padding: 14 }}>{mensaje}</div>}
        {hayMigracionPendiente && (
          <div className={styles.panel} style={{ marginBottom: 16, padding: 14, borderLeft: '3px solid #d4a636' }}>
            La base de datos aun no permite guardar ajustes y fotos de auditoria. Puedes revisar la lectura y guardar cuando este activa.
          </div>
        )}

        <section className={styles.statsGrid}>
          <div className={styles.stat}><p className={styles.statValue}>{pct(resumen.puntuacion_rigor)}</p><p className={styles.statLabel}>Rigor económico</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{eur(resumen.beneficio_real_tpv)}</p><p className={styles.statLabel}>Beneficio real TPV</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{eur(resumen.beneficio_confirmado_sala)}</p><p className={styles.statLabel}>{perfilBodega ? 'Confirmado operativo' : 'Confirmado sala'}</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{eur(resumen.beneficio_inferido)}</p><p className={styles.statLabel}>Inferido separado</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{eur(resumen.oportunidad_estimada)}</p><p className={styles.statLabel}>Oportunidad estimada</p></div>
        </section>

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Defensa de cifras</h2>
              <p className={styles.panelSub}>Que puedes presentar a gerencia, que requiere contexto y que conviene arreglar antes.</p>
            </div>
            <span className={styles.badge}>{defensaCifras.filter(item => item.estado === 'presentable').length} presentables</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.gridThree}>
              {defensaCifras.map(item => (
                <article className={styles.itemCard} key={item.id}>
                  <span className={defensaClass(item.estado)}><span className={styles.trafficDot} />{defensaLabel(item.estado)}</span>
                  <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>
                    {item.unidad === 'pct' ? pct(item.valor) : eur(item.valor)}
                  </h3>
                  <p className={styles.eyebrow}>{item.titulo} · {item.tipo}</p>
                  <p className={styles.sectionText}>{item.lectura}</p>
                  <p className={styles.sectionText}>{item.base}</p>
                  <p className={styles.sectionText}><strong>Falta:</strong> {item.falta}</p>
                  <Link href={item.href} className={styles.secondary} style={{ marginTop: 10, display: 'inline-flex' }}>{item.accion}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.panelDark} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Semaforo de defensa</h2>
              <p className={styles.panelSub}>Si baja, no es que el restaurante venda peor: falta evidencia para sostener la cifra.</p>
            </div>
            <span className={badgeClass(resumen.puntuacion_rigor >= 75 ? 'alta' : resumen.puntuacion_rigor >= 45 ? 'media' : 'baja')}>
              <span className={styles.trafficDot} />{pct(resumen.puntuacion_rigor)}
            </span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.closeProgressTrack}>
              <div className={styles.closeProgressFill} style={{ width: `${Math.max(4, Math.min(100, numero(resumen.puntuacion_rigor)))}%` }} />
            </div>
            <div className={styles.gridThree} style={{ marginTop: 14 }}>
              <article className={styles.itemCard}>
                <p className={styles.eyebrow}>Datos base</p>
                <h3 className={styles.sectionTitle}>{pct(resumen.datos_economicos_pct)}</h3>
                <p className={styles.sectionText}>Vinos con coste y PVP suficientes para calcular margen.</p>
              </article>
              <article className={styles.itemCard}>
                <p className={styles.eyebrow}>Fotos</p>
                <h3 className={styles.sectionTitle}>{pct(resumen.snapshots_completos_pct)}</h3>
                <p className={styles.sectionText}>Recomendaciones con precio, coste y stock del momento.</p>
              </article>
              <article className={styles.itemCard}>
                <p className={styles.eyebrow}>Criterio</p>
                <h3 className={styles.sectionTitle}>{pct(resumen.formula_version_pct)}</h3>
                <p className={styles.sectionText}>Registros que explican qué criterio de cálculo se usó.</p>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.gridTwo} style={{ marginBottom: 16 }}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Reglas económicas</h2>
                <p className={styles.panelSub}>Ajustes usados para defender margen, copa, stock y comparativas.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <div className={`${styles.formGrid} ${styles.formGridThree}`}>
                <label>
                  <span className={styles.label}>IVA venta %</span>
                  <input className={styles.input} value={inputNumber(ajustes?.iva_venta_pct)} onChange={e => cambiarAjuste('iva_venta_pct', e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  <span className={styles.label}>PVP incluye IVA</span>
                  <select className={styles.select} value={String(Boolean(ajustes?.pvp_incluye_iva))} onChange={e => cambiarAjuste('pvp_incluye_iva', e.target.value, 'boolean')}>
                    <option value="true">Si</option>
                    <option value="false">No</option>
                  </select>
                </label>
                <label>
                  <span className={styles.label}>Coste incluye IVA</span>
                  <select className={styles.select} value={String(Boolean(ajustes?.coste_incluye_iva))} onChange={e => cambiarAjuste('coste_incluye_iva', e.target.value, 'boolean')}>
                    <option value="false">No</option>
                    <option value="true">Si</option>
                  </select>
                </label>
                <label>
                  <span className={styles.label}>Copas botella</span>
                  <input className={styles.input} value={inputNumber(ajustes?.copas_por_botella)} onChange={e => cambiarAjuste('copas_por_botella', e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  <span className={styles.label}>Merma copa %</span>
                  <input className={styles.input} value={inputNumber(ajustes?.merma_copa_pct)} onChange={e => cambiarAjuste('merma_copa_pct', e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  <span className={styles.label}>Botella ml</span>
                  <input className={styles.input} value={inputNumber(ajustes?.formato_botella_ml)} onChange={e => cambiarAjuste('formato_botella_ml', e.target.value)} inputMode="numeric" />
                </label>
                <label>
                  <span className={styles.label}>Margen botella %</span>
                  <input className={styles.input} value={inputNumber(ajustes?.margen_objetivo_botella_pct)} onChange={e => cambiarAjuste('margen_objetivo_botella_pct', e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  <span className={styles.label}>Margen copa %</span>
                  <input className={styles.input} value={inputNumber(ajustes?.margen_objetivo_copa_pct)} onChange={e => cambiarAjuste('margen_objetivo_copa_pct', e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  <span className={styles.label}>Precio minimo copa</span>
                  <input className={styles.input} value={inputNumber(ajustes?.precio_minimo_copa)} onChange={e => cambiarAjuste('precio_minimo_copa', e.target.value)} inputMode="decimal" />
                </label>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Criterios activos</h2>
                <p className={styles.panelSub}>Reglas que explican por que dos informes pueden cambiar.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.itemStack}>
                {formulas.map(item => (
                  <article className={styles.itemCard} key={item.version}>
                    <p className={styles.eyebrow}>{item.version}</p>
                    <h3 className={styles.sectionTitle}>{item.nombre}</h3>
                    <p className={styles.sectionText}>{item.uso}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Fuentes de la cifra</h2>
              <p className={styles.panelSub}>La app no mezcla real, probable y estimado en un único número opaco.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.gridThree}>
              {fuentes.map(item => (
                <article className={styles.itemCard} key={item.id}>
                  <span className={badgeClass(item.confianza)}><span className={styles.trafficDot} />{item.confianza}</span>
                  <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{item.titulo}</h3>
                  <p className={styles.sectionText}>{item.detalle}</p>
                  <p className={styles.sectionText}>Cobertura {pct(item.porcentaje)} · criterio guardado</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.gridTwo} style={{ marginBottom: 16 }}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Beneficio separado</h2>
                <p className={styles.panelSub}>{perfilBodega ? 'Muestra que parte es TPV real, ajuste confirmado o estimacion inferida.' : 'Muestra que parte es TPV real, sala confirmada o inferida.'}</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              {beneficioLineas.length ? (
                <div className={styles.itemStack}>
                  {beneficioLineas.slice(0, 6).map(item => (
                    <article className={styles.itemCard} key={item.id || `${item.vino}-${item.fecha}`}>
                      <p className={styles.eyebrow}>{item.tipo_margen} · {item.fuente} · {fecha(item.fecha)}</p>
                      <h3 className={styles.sectionTitle}>{item.vino}</h3>
                      <p className={styles.sectionText}>Beneficio defendible {eur(item.beneficio, 2)} · confianza {pct(item.confianza_pct)}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>Aún no hay ventas con margen defendible. Importa TPV o cierra un turno para separar venta real y probable.</div>
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Por que cambian las cifras</h2>
                <p className={styles.panelSub}>Compara la foto historica contra precio, coste y stock actual.</p>
              </div>
            </div>
            <div className={styles.panelBody}>
              {cambiosSnapshot.length ? (
                <div className={styles.itemStack}>
                  {cambiosSnapshot.slice(0, 6).map(item => (
                    <article className={styles.itemCard} key={item.id}>
                      <p className={styles.eyebrow}>{fecha(item.fecha)}</p>
                      <h3 className={styles.sectionTitle}>{item.vino}</h3>
                      <p className={styles.sectionText}>
                        PVP {eur(item.precio_snapshot)}{' -> '}{eur(item.precio_actual)} · coste {eur(item.coste_snapshot)}{' -> '}{eur(item.coste_actual)} · stock {item.stock_snapshot}{' -> '}{item.stock_actual}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>No hay cambios relevantes entre la foto historica y los datos actuales.</div>
              )}
            </div>
          </div>
        </section>

        <section className={styles.gridTwo}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Advertencias</h2>
                <p className={styles.panelSub}>Huecos que bajan confianza antes de presentar un informe.</p>
              </div>
              <span className={styles.badge}>{advertencias.length}</span>
            </div>
            <div className={styles.panelBody}>
              {advertencias.length ? (
                <div className={styles.itemStack}>
                  {advertencias.map(item => (
                    <article className={styles.itemCard} key={`${item.titulo}-${item.href}`}>
                      <span className={severidadClass(item.severidad)}><span className={styles.trafficDot} />{item.severidad}</span>
                      <h3 className={styles.sectionTitle} style={{ marginTop: 12 }}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.detalle}</p>
                      <p className={styles.sectionText}>{item.accion}</p>
                      <Link href={item.href} className={styles.secondary} style={{ marginTop: 10, display: 'inline-flex' }}>Abrir</Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.empty}>Sin advertencias graves de trazabilidad.</div>
              )}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Fotos guardadas</h2>
                <p className={styles.panelSub}>Sirven para explicar por que un informe cambia con el tiempo.</p>
              </div>
              <span className={styles.badge}>{reports.length}</span>
            </div>
            <div className={styles.panelBody}>
              {comparacion && (
                <div className={styles.itemCard} style={{ marginBottom: 10 }}>
                  <p className={styles.eyebrow}>Comparacion</p>
                  <h3 className={styles.sectionTitle}>Rigor {comparacion.delta_rigor > 0 ? '+' : ''}{comparacion.delta_rigor} pts</h3>
                  <p className={styles.sectionText}>TPV real {eur(comparacion.delta_real_tpv)} · oportunidad {eur(comparacion.delta_oportunidad)}</p>
                </div>
              )}
              {reports.length ? (
                <div className={styles.itemStack}>
                  {reports.slice(0, 6).map(report => {
                    const r = leerJson(report.resumen)
                    return (
                      <article className={styles.itemCard} key={report.id}>
                        <p className={styles.eyebrow}>{fecha(report.created_at)} · foto guardada</p>
                        <h3 className={styles.sectionTitle}>Rigor {pct(r.puntuacion_rigor)}</h3>
                        <p className={styles.sectionText}>TPV {eur(r.beneficio_real_tpv)} · estimado {eur(r.oportunidad_estimada)} · advertencias {r.advertencias || 0}</p>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <div className={styles.empty}>Guarda una foto cuando vayas a presentar datos a gerencia.</div>
              )}
            </div>
          </div>
        </section>
      </ModuleShell>
    </FeatureGate>
  )
}
