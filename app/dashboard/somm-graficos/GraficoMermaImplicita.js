'use client'

/**
 * Gráfico #3 — Merma implícita mensual (€).
 * Barras: diferencia_consumo (consumo_real_stock − coste_teorico_ventas),
 * aisla el coste de abrir botellas enteras cuando con menos copas vendibles
 * ya bastaría + cualquier salida no-venta.
 *
 * Montado en: app/dashboard/bodega/LibroBodegaTable.js (pestaña Libro).
 */

import { useState } from 'react'
import { Bars, fmtEur } from '../../components/charts'
import { useGraficosSomm } from './GraficosSommProvider'

export function GraficoMermaImplicita({ restauranteId, anio: anioProp, enabled = true }) {
  const [anioLocal, setAnioLocal] = useState(anioProp ?? new Date().getFullYear())
  const anio = anioProp ?? anioLocal
  const { data, loading, error } = useGraficosSomm({ restauranteId, anio, enabled })

  if (!enabled) return null

  const dataChart = (data?.meses || []).map(m => ({
    mes:    m.mes,
    estado: m.estado,
    valor:  m.merma_implicita,
  }))

  return (
    <section style={{ marginTop: 24 }}>
      <HeaderConSelector
        titulo="Merma implícita"
        subtitulo="Diferencia entre consumo real de stock y coste teórico de ventas"
        anio={anio}
        setAnio={anioProp == null ? setAnioLocal : null}
      />
      {error && <p style={{ color: 'var(--c-error, #c00)', fontSize: 12 }} role="alert">{error}</p>}
      <Bars
        data={dataChart}
        loading={loading}
        formatValor={fmtEur}
        titulo="MERMA IMPLÍCITA MENSUAL (€)"
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
      {setAnio && (
        <select value={String(anio)} onChange={e => setAnio(Number(e.target.value))}
                style={{ padding: '4px 8px', fontSize: 13 }}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
    </div>
  )
}
