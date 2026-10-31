'use client'

/**
 * Gráfico #1 — Evolución de ventas y margen mes a mes.
 * Barras: ventas_neto (€). Línea: resultado neto bodega (€).
 * Mes abierto: barra opaca + línea discontinua (estado='estimado').
 *
 * Montado en: app/dashboard/explotacion/page.js (solo esPerfilSomm).
 */

import { useState } from 'react'
import { BarsLine, fmtEur } from '../../components/charts'
import { useGraficosSomm } from './GraficosSommProvider'

export function GraficoEvolucion({ restauranteId, enabled = true }) {
  const [anio, setAnio] = useState(new Date().getFullYear())
  const { data, loading, error } = useGraficosSomm({ restauranteId, anio, enabled })

  if (!enabled) return null

  const dataChart = (data?.meses || []).map(m => ({
    mes:    m.mes,
    estado: m.estado,
    bar:    m.ventas_neto,
    linea:  m.resultado,
  }))

  return (
    <section style={{ marginTop: 32 }}>
      <HeaderConSelector titulo="Evolución mensual" subtitulo="Ventas netas y resultado neto de bodega"
                         anio={anio} setAnio={setAnio} />
      {error && <p style={{ color: 'var(--c-error, #c00)', fontSize: 12 }} role="alert">{error}</p>}
      <BarsLine
        data={dataChart}
        loading={loading}
        formatBar={fmtEur}
        formatLine={fmtEur}
        titulo="VENTAS vs RESULTADO"
        subtitulo="Mes con rayado = en curso o estimado"
        mensajeVacio="Aún no hay datos suficientes para este año"
      />
    </section>
  )
}

function HeaderConSelector({ titulo, subtitulo, anio, setAnio }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{titulo}</h3>
        {subtitulo && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8b8278' }}>{subtitulo}</p>}
      </div>
      <select value={String(anio)} onChange={e => setAnio(Number(e.target.value))}
              style={{ padding: '4px 8px', fontSize: 13 }}>
        {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  )
}
