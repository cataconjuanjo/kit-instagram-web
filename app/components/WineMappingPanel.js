'use client'

import { useState } from 'react'
import { supabase } from '../supabase'
import { calcularWineMapping, ticketReferencia } from '../lib/wineMapping'
import styles from '../dashboard/module.module.css'

const TIPOS_BODEGA = [
  { id: 'espumoso', label: 'Espumosos' },
  { id: 'blanco', label: 'Blancos' },
  { id: 'rosado', label: 'Rosados' },
  { id: 'tinto', label: 'Tintos' },
  { id: 'generoso', label: 'Generosos' },
  { id: 'dulce', label: 'Dulces' },
  { id: 'naranja', label: 'Naranjas' },
  { id: 'sin_alcohol', label: 'Sin alcohol' },
]

const WINEMAPPING_PAGE_SIZE = 10
const PALETTE = ['#8b5e34', '#bfa984', '#7f5570', '#4f6f75', '#252025']

function decimal(val) { return parseFloat(val) || 0 }

export default function WineMappingPanel({ restaurante, vinos = [] }) {
  const [ticketDraft, setTicketDraft] = useState(
    String(restaurante?.ticket_medio_comida || restaurante?.ticket_medio || restaurante?.ticket_comida || '')
  )
  const [ticketSaving, setTicketSaving] = useState(false)
  const [gamaActivaMapping, setGamaActivaMapping] = useState('')
  const [mappingPage, setMappingPage] = useState(1)

  const ticketGuardado = ticketReferencia(restaurante)
  const ticketManual = decimal(ticketDraft)
  const ticketMapping = ticketManual > 0
    ? { valor: ticketManual, fuente: 'ticket editable', esEstimado: false }
    : ticketGuardado
  const wineMapping = calcularWineMapping(vinos, ticketMapping.valor)
  const gamasConDesajuste = wineMapping.gamas.filter(g => g.delta !== 0)
  const gamasHueco = wineMapping.gamas.filter(g => g.vinos === 0 && g.objetivoNumero > 0)
  const tipoCounts = TIPOS_BODEGA.map(tipo => ({
    ...tipo,
    count: vinos.filter(v => String(v.tipo || '').toLowerCase() === tipo.id).length,
  }))
  const tipoOtros = vinos.filter(v => {
    const tipo = String(v.tipo || '').toLowerCase()
    return tipo && !TIPOS_BODEGA.some(t => t.id === tipo)
  }).length
  const totalVinosTipo = tipoCounts.reduce((s, t) => s + t.count, 0) + tipoOtros
  const maxGamaRefs = wineMapping.gamas.length
    ? Math.max(...wineMapping.gamas.map(g => g.vinos), ...wineMapping.gamas.map(g => g.objetivoNumero), 1)
    : 1
  const gamaDetalle = wineMapping.gamas.find(g => g.id === gamaActivaMapping) || null
  const mappingTotalPaginas = Math.max(1, Math.ceil((gamaDetalle?.vinosDetalle.length || 0) / WINEMAPPING_PAGE_SIZE))
  const mappingPaginaSegura = Math.min(mappingPage, mappingTotalPaginas)
  const mappingInicio = (mappingPaginaSegura - 1) * WINEMAPPING_PAGE_SIZE
  const mappingVinosPagina = gamaDetalle?.vinosDetalle.slice(mappingInicio, mappingInicio + WINEMAPPING_PAGE_SIZE) || []

  async function guardarTicketMapping() {
    if (!restaurante?.id) return
    const valor = ticketDraft === '' ? null : decimal(ticketDraft)
    setTicketSaving(true)
    try {
      await supabase
        .from('restaurantes')
        .update({ ticket_medio_comida: valor })
        .eq('id', restaurante.id)
    } catch { /* silent */ } finally {
      setTicketSaving(false)
    }
  }

  return (
    <div>
      <div className={styles.actionRow} style={{ marginBottom: 16 }}>
        <input
          className={styles.input}
          inputMode="decimal"
          value={ticketDraft}
          onChange={e => { setTicketDraft(e.target.value); setGamaActivaMapping(''); setMappingPage(1) }}
          placeholder="Ticket medio (€)"
          style={{ width: 150 }}
        />
        <button className={styles.secondary} type="button" disabled={ticketSaving} onClick={guardarTicketMapping}>
          {ticketSaving ? 'Guardando...' : 'Guardar ticket'}
        </button>
      </div>

      {!ticketMapping.valor ? (
        <div className={styles.empty}>Introduce un ticket medio estimado para activar el mapa. No hace falta cargar carta de comida.</div>
      ) : (
        <>
          <div className={styles.statsGrid} style={{ marginBottom: 16 }}>
            <div className={styles.stat}>
              <p className={styles.statValue}>{wineMapping.referencias?.actual || 0}</p>
              <p className={styles.statLabel}>Referencias con PVP</p>
            </div>
            <div className={styles.stat}>
              <p className={styles.statValue}>{wineMapping.referencias?.minimo}-{wineMapping.referencias?.maximo}</p>
              <p className={styles.statLabel}>Rango recomendado</p>
            </div>
            <div className={styles.stat}>
              <p className={styles.statValue}>{wineMapping.referencias?.estado || '-'}</p>
              <p className={styles.statLabel}>Longitud de carta</p>
            </div>
            <div className={styles.stat}>
              <p className={styles.statValue}>{gamasHueco.length}</p>
              <p className={styles.statLabel}>Gamas sin cubrir</p>
            </div>
          </div>

          <div className={styles.panelDark} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Distribución visual por gamas</h3>
                <p className={styles.panelSub}>La barra muestra el peso real de cada gama. Las tarjetas comparan actual contra objetivo.</p>
              </div>
              <span className={styles.badge}>{ticketMapping.fuente}</span>
            </div>
            <div style={{ display: 'flex', height: 28, overflow: 'hidden', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', margin: '12px 0' }}>
              {wineMapping.gamas.map((gama, i) => (
                <button
                  key={gama.id}
                  type="button"
                  onClick={() => { setGamaActivaMapping(gamaActivaMapping === gama.id ? '' : gama.id); setMappingPage(1) }}
                  title={`${gama.label}: ${gama.vinos} refs.`}
                  style={{ width: `${Math.max(3, gama.real)}%`, minWidth: 20, border: 'none', background: PALETTE[i], cursor: 'pointer' }}
                  aria-label={`Abrir ${gama.label}`}
                />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8 }}>
              {wineMapping.gamas.map((gama, i) => {
                const actualPct = Math.min(100, (gama.vinos / maxGamaRefs) * 100)
                const objetivoPct = Math.min(100, (gama.objetivoNumero / maxGamaRefs) * 100)
                const estado = gama.delta > 0 ? `+${gama.delta}` : gama.delta < 0 ? String(gama.delta) : 'ok'
                return (
                  <button
                    key={gama.id}
                    type="button"
                    onClick={() => { setGamaActivaMapping(gamaActivaMapping === gama.id ? '' : gama.id); setMappingPage(1) }}
                    style={{
                      textAlign: 'left',
                      border: gamaActivaMapping === gama.id ? '1px solid #fffaf3' : '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      color: '#fffaf3',
                      padding: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <p className={styles.eyebrow} style={{ color: '#d8c898' }}>{gama.rangoTexto} EUR</p>
                    <strong style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>{gama.label}</strong>
                    <div style={{ position: 'relative', height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginBottom: 6 }}>
                      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${actualPct}%`, background: PALETTE[i] }} />
                      <span style={{ position: 'absolute', left: `${objetivoPct}%`, top: 0, bottom: 0, width: 2, background: '#fffaf3' }} />
                    </div>
                    <small style={{ color: 'rgba(255,250,243,0.66)' }}>{gama.vinos} refs. / objetivo {gama.objetivoNumero} — {estado}</small>
                  </button>
                )
              })}
            </div>
          </div>

          <div className={styles.panel} style={{ marginBottom: 16 }}>
            <div className={styles.panelHead}>
              <div>
                <h3 className={styles.panelTitle}>Familias de vino</h3>
                <p className={styles.panelSub}>Foto rápida por tipo para ver si la bodega está equilibrada por estilo.</p>
              </div>
              <span className={styles.badge}>{totalVinosTipo} refs.</span>
            </div>
            <div className={styles.panelBody}>
              <div className={styles.statsGrid} style={{ marginBottom: 0 }}>
                {tipoCounts.filter(t => t.count > 0).map(tipo => (
                  <div className={styles.stat} key={tipo.id}>
                    <p className={styles.statValue}>{tipo.count}</p>
                    <p className={styles.statLabel}>{tipo.label}</p>
                  </div>
                ))}
                {tipoOtros > 0 && (
                  <div className={styles.stat}>
                    <p className={styles.statValue}>{tipoOtros}</p>
                    <p className={styles.statLabel}>Otros</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {wineMapping.reequilibrio && (
            <div className={styles.panelDark} style={{ marginBottom: 16 }}>
              <div className={styles.panelHead}>
                <div>
                  <h3 className={styles.panelTitle}>Lectura accionable</h3>
                  <p className={styles.panelSub}>{wineMapping.reequilibrio.resumen}</p>
                </div>
                <span className={styles.badge}>Objetivo {wineMapping.reequilibrio.totalObjetivo} refs.</span>
              </div>
            </div>
          )}

          {gamaDetalle && (
            <div className={styles.panel} style={{ marginBottom: 16 }}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Detalle abierto</p>
                  <h3 className={styles.panelTitle}>{gamaDetalle.label}</h3>
                  <p className={styles.panelSub}>{gamaDetalle.rangoTexto} EUR — {gamaDetalle.vinos} referencias. Página {mappingPaginaSegura} de {mappingTotalPaginas}.</p>
                </div>
                <button className={styles.ghost} type="button" onClick={() => setGamaActivaMapping('')}>Cerrar</button>
              </div>
              <div className={styles.panelBody}>
                {mappingVinosPagina.length ? (
                  <div className={styles.itemStack}>
                    {mappingVinosPagina.map(vino => (
                      <div key={vino.id} className={styles.itemCard} style={{ padding: 10 }}>
                        <div className={styles.sectionHead} style={{ margin: 0, alignItems: 'center' }}>
                          <div>
                            <h4 className={styles.sectionTitle} style={{ fontSize: 13, marginBottom: 2 }}>{vino.nombre}</h4>
                            <p className={styles.sectionText}>{[vino.bodega, vino.region, vino.tipo].filter(Boolean).join(' — ') || 'Sin detalle'}</p>
                          </div>
                          <span className={styles.badge}>{vino.precio} EUR</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}>No hay referencias en esta gama.</div>
                )}
                {gamaDetalle.vinosDetalle.length > WINEMAPPING_PAGE_SIZE && (
                  <div className={styles.actionRow} style={{ marginTop: 12, justifyContent: 'space-between' }}>
                    <button className={styles.secondary} type="button" disabled={mappingPaginaSegura <= 1} onClick={() => setMappingPage(p => Math.max(1, p - 1))}>Anterior</button>
                    <span className={styles.badge}>{mappingInicio + 1}–{mappingInicio + mappingVinosPagina.length} de {gamaDetalle.vinosDetalle.length}</span>
                    <button className={styles.secondary} type="button" disabled={mappingPaginaSegura >= mappingTotalPaginas} onClick={() => setMappingPage(p => Math.min(mappingTotalPaginas, p + 1))}>Siguiente</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {gamasConDesajuste.length > 0 && (
            <div className={styles.actionRow} style={{ marginBottom: 16 }}>
              <a className={styles.secondary} href="/dashboard/catalogo">Buscar referencias para cubrir huecos</a>
              <a className={styles.ghost} href="/dashboard/constructor">Reordenar carta</a>
            </div>
          )}

          <div style={{ textAlign: 'right', paddingTop: 4 }}>
            <a className={styles.ghost} href="/dashboard/menu-engineering#winemapping">Ver análisis completo →</a>
          </div>
        </>
      )}
    </div>
  )
}
