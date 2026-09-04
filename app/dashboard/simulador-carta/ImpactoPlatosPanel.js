'use client'

import { useEffect, useRef, useState } from 'react'
import simStyles from './simulador.module.css'

function eur(v) {
  if (!Number(v)) return '—'
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// Dumbbell SVG por categoría: dos puntos (antes / después) unidos por una línea.
function DumbbellChart({ categorias }) {
  if (!categorias || categorias.length === 0) return null

  const rowH  = 36
  const padT  = 12
  const padL  = 160
  const padR  = 64
  const dotR  = 5
  const totalW = 520
  const barW   = totalW - padL - padR
  const svgH   = padT * 2 + rowH * categorias.length

  const maxVal = Math.max(...categorias.map(c => c.total), 1)
  const x = val => padL + (val / maxVal) * barW

  return (
    <div className={simStyles.dumbbellWrap} role="img" aria-label="Cobertura de platos por categoría antes y después">
      <div className={simStyles.dumbbellLeyenda}>
        <span className={simStyles.dumbbellLeyendaAntes}>● Antes</span>
        <span className={simStyles.dumbbellLeyendaDespues}>● Después</span>
      </div>
      <svg viewBox={`0 0 ${totalW} ${svgH}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
        {categorias.map((cat, i) => {
          const cy      = padT + i * rowH + rowH / 2
          const xAntes  = x(cat.antes)
          const xDespues = x(cat.despues)
          const mejora  = cat.despues - cat.antes
          return (
            <g key={cat.categoria}>
              {/* Etiqueta categoría */}
              <text x={padL - 8} y={cy + 4} textAnchor="end"
                fontSize={11} fill="#4a3f36" fontFamily="inherit">
                {cat.categoria.length > 22 ? cat.categoria.slice(0, 21) + '…' : cat.categoria}
              </text>
              {/* Línea de fondo (carril) */}
              <line x1={padL} y1={cy} x2={padL + barW} y2={cy}
                stroke="#e8e2d9" strokeWidth={1} />
              {/* Conector antes→después */}
              <line
                x1={xAntes} y1={cy} x2={xDespues} y2={cy}
                stroke={mejora > 0 ? 'var(--cv-green)' : mejora < 0 ? 'var(--cv-red)' : '#c0b89a'}
                strokeWidth={2.5}
              />
              {/* Punto "antes" */}
              <circle cx={xAntes} cy={cy} r={dotR} fill="#a89478" />
              {/* Punto "después" */}
              <circle cx={xDespues} cy={cy} r={dotR}
                fill={mejora > 0 ? 'var(--cv-green)' : mejora < 0 ? 'var(--cv-red)' : '#a89478'}
              />
              {/* Delta texto */}
              {mejora !== 0 && (
                <text x={xDespues + dotR + 4} y={cy + 4}
                  fontSize={10} fontWeight={700}
                  fill={mejora > 0 ? 'var(--cv-green)' : 'var(--cv-red)'}
                  fontFamily="inherit">
                  {mejora > 0 ? '+' : ''}{mejora}
                </text>
              )}
              {/* Totales */}
              <text x={padL + barW + padR - 4} y={cy + 4}
                textAnchor="end" fontSize={10} fill="#8a7e72" fontFamily="inherit">
                /{cat.total}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function ImpactoPlatosPanel({ lineas, restauranteId, token }) {
  const [datos, setDatos]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [mostrarAporte, setMostrarAporte] = useState(false)

  // Ref para evitar cargas duplicadas cuando lineas no cambia en contenido
  const lineasKey = useRef(null)

  useEffect(() => {
    const nuevaKey = lineas.map(l => `${l.id}:${l.estado}`).join('|')
    if (nuevaKey === lineasKey.current) return
    lineasKey.current = nuevaKey

    if (!restauranteId || lineas.length === 0) return

    setLoading(true)
    setError(null)

    fetch('/api/simulador/impacto-platos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ restaurante_id: restauranteId, lineas }),
    })
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error || 'Error al cargar')))
      .then(json => { setDatos(json); setLoading(false) })
      .catch(e  => { setError(String(e)); setLoading(false) })
  }, [lineas, restauranteId, token])

  if (loading) {
    return <div className={simStyles.panelLoading}>Analizando cobertura de platos…</div>
  }

  if (error) {
    return <div className={simStyles.panelError}>No se pudo calcular el impacto: {error}</div>
  }

  if (!datos) {
    return (
      <div className={simStyles.panelVacio}>
        <p>El análisis aparecerá aquí cuando haya platos y vinos en el simulador.</p>
        <p>Asegúrate de tener platos registrados en la sección <strong>Platos</strong> del dashboard.</p>
      </div>
    )
  }

  const { resumen, categorias, huecos, aporteVinos, totalPlatosRestaurante, _debug } = datos
  const tieneNuevos = lineas.some(l => l.estado === 'nuevo')
  const platosExcluidos = totalPlatosRestaurante > resumen.totalPlatos
    ? totalPlatosRestaurante - resumen.totalPlatos
    : 0
  const cartaYaCubre100 = tieneNuevos
    && resumen.cubiertosAntes === resumen.totalPlatos
    && resumen.deltaPlatos === 0

  return (
    <div className={simStyles.panelRoot}>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className={simStyles.kpiGrid}>
        <div className={simStyles.kpiCard}>
          <span className={simStyles.kpiValor}>{resumen.cubiertosAntes}</span>
          <span className={simStyles.kpiLabel}>Platos cubiertos<br/>carta actual</span>
          <span className={simStyles.kpiSub}>de {resumen.totalPlatos}</span>
        </div>
        <div className={simStyles.kpiCard}>
          <span className={simStyles.kpiValor} style={
            resumen.cubiertosDespues > resumen.cubiertosAntes ? { color: 'var(--cv-green)' }
            : resumen.cubiertosDespues < resumen.cubiertosAntes ? { color: 'var(--cv-red)' }
            : undefined
          }>
            {resumen.cubiertosDespues}
          </span>
          <span className={simStyles.kpiLabel}>Platos cubiertos<br/>carta simulada</span>
          <span className={simStyles.kpiSub}>de {resumen.totalPlatos}</span>
        </div>
        <div className={simStyles.kpiCard}>
          <span className={simStyles.kpiValor} style={
            resumen.deltaPlatos > 0 ? { color: 'var(--cv-green)' }
            : resumen.deltaPlatos < 0 ? { color: 'var(--cv-red)' }
            : undefined
          }>
            {resumen.deltaPlatos > 0 ? '+' : ''}{resumen.deltaPlatos}
          </span>
          <span className={simStyles.kpiLabel}>Platos ganados<br/>con esta carta</span>
          {resumen.sinCoberturaDespues > 0 && (
            <span className={simStyles.kpiSub} style={{ color: 'var(--cv-red)' }}>
              {resumen.sinCoberturaDespues} sin cubrir
            </span>
          )}
        </div>
      </div>

      {platosExcluidos > 0 && (
        <div className={simStyles.panelHint}>
          Evaluado sobre {resumen.totalPlatos} de {totalPlatosRestaurante} platos registrados — los {platosExcluidos} restantes están marcados como inactivos y no se incluyen en este análisis.
        </div>
      )}

      {cartaYaCubre100 && (
        <div className={simStyles.panelHint}>
          Tu carta actual ya cubre el 100% de los platos — los cambios simulados no abren ni cierran ningún hueco de maridaje.
        </div>
      )}

      {!tieneNuevos && (
        <div className={simStyles.panelHint}>
          No hay cambios pendientes en el simulador. Añade vinos del catálogo para ver el impacto.
        </div>
      )}

      {/* ── Dumbbell por categoría ────────────────────────────────────── */}
      {categorias.length > 0 && (
        <section className={simStyles.panelSeccion}>
          <h3 className={simStyles.panelSeccionTitle}>Cobertura por familia de platos</h3>
          <p className={simStyles.panelSeccionSub}>
            Platos cubiertos por al menos un vino compatible — antes y después de aplicar los cambios simulados.
          </p>
          <DumbbellChart categorias={categorias} />
        </section>
      )}

      {/* ── Tabla de huecos ──────────────────────────────────────────── */}
      <section className={simStyles.panelSeccion}>
        <h3 className={simStyles.panelSeccionTitle}>
          Platos sin cobertura tras los cambios
          {huecos.length > 0 && <span className={simStyles.panelBadgeRojo}>{huecos.length}</span>}
        </h3>
        {huecos.length === 0 ? (
          <div className={simStyles.panelVacioInline}>
            Todos los platos quedan cubiertos con la carta simulada.
          </div>
        ) : (
          <div className={simStyles.tableWrap} style={{ marginTop: 8 }}>
            <table className={simStyles.table}>
              <thead>
                <tr>
                  <th>Plato</th>
                  <th>Categoría</th>
                  <th className={simStyles.thNum}>Vinos compat. antes</th>
                  <th className={simStyles.thNum}>Vinos compat. después</th>
                </tr>
              </thead>
              <tbody>
                {huecos.map(h => (
                  <tr key={h.id}>
                    <td>{h.nombre}</td>
                    <td style={{ color: 'var(--cv-text-muted)', fontSize: 11 }}>{h.categoria}</td>
                    <td className={simStyles.tdNum} style={h.antes === 0 ? { color: 'var(--cv-red)' } : undefined}>
                      {h.antes}
                    </td>
                    <td className={simStyles.tdNum} style={{ color: 'var(--cv-red)', fontWeight: 700 }}>0</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Aporte marginal de vinos nuevos (bonus) ───────────────────── */}
      {aporteVinos && aporteVinos.length > 0 && (
        <section className={simStyles.panelSeccion}>
          <button
            type="button"
            className={simStyles.panelToggleBtn}
            onClick={() => setMostrarAporte(v => !v)}
          >
            {mostrarAporte ? '▲' : '▼'} Aporte marginal de vinos nuevos ({aporteVinos.length})
          </button>
          {mostrarAporte && (
            <>
              <p className={simStyles.panelSeccionSub} style={{ marginTop: 6 }}>
                Platos sin cobertura en la carta actual que quedan cubiertos gracias a cada vino nuevo.
                Ordena por relevancia real, no solo por tipo o precio.
              </p>
              <div className={simStyles.tableWrap} style={{ marginTop: 8 }}>
                <table className={simStyles.table}>
                  <thead>
                    <tr>
                      <th>Vino nuevo</th>
                      <th>Bodega</th>
                      <th className={simStyles.thNum}>Platos huérfanos que cubre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aporteVinos.map(v => (
                      <tr key={v.id}>
                        <td>{v.nombre}</td>
                        <td style={{ color: 'var(--cv-text-muted)', fontSize: 11 }}>{v.bodega || '—'}</td>
                        <td className={simStyles.tdNum} style={{ color: 'var(--cv-green)', fontWeight: 700 }}>
                          +{v.cubrePlatos}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── DEBUG temporal ───────────────────────────────────────────────── */}
      {_debug && (
        <section className={simStyles.panelSeccion} style={{ background: '#f5f0e8', borderRadius: 6, padding: 12, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
          <strong>DEBUG (temporal)</strong>
          <div style={{ marginTop: 6 }}>
            Conjuntos — vinosAntes: <strong>{_debug.conjuntos.vinosAntes}</strong> · vinosDespues: <strong>{_debug.conjuntos.vinosDespues}</strong> · intersección: <strong>{_debug.conjuntos.interseccion}</strong>
          </div>
          <div style={{ marginTop: 4 }}>
            Cobertura — solo actual (54): <strong>{_debug.cobertura.soloActual}</strong> · antes (80): <strong>{_debug.cobertura.antes}</strong> · después (89): <strong>{_debug.cobertura.despues}</strong>
          </div>
          {Object.keys(_debug.categoriasSoloActual).length > 0 && (
            <div style={{ marginTop: 4 }}>
              Categorías solo-actual: {Object.entries(_debug.categoriasSoloActual).map(([cat, val]) => `${cat}: ${val}`).join(' · ')}
            </div>
          )}
          {_debug.platosFragiles.length > 0 ? (
            <div style={{ marginTop: 4, color: '#b85c00' }}>
              Platos frágiles (1 solo vino actual compatible): {_debug.platosFragiles.map(f => `"${f.plato}" → ${f.vino}`).join(' / ')}
            </div>
          ) : (
            <div style={{ marginTop: 4, color: '#5a7a3a' }}>Sin platos frágiles (todos cubiertos por ≥2 vinos actuales)</div>
          )}
        </section>
      )}
    </div>
  )
}
