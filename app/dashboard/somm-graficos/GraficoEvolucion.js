'use client'

/**
 * Gráfico #1 — Evolución de ventas y margen mes a mes.
 * Barras: ventas_neto (€). Línea: resultado neto bodega (€).
 * Mes abierto: barra opaca + línea discontinua (estado='estimado').
 *
 * Montado en: app/dashboard/explotacion/page.js (solo esPerfilSomm).
 *
 * Comparar YoY: casilla "Comparar con año anterior" (activa por defecto
 * si existe el año anterior con datos; si no, no se renderiza y la
 * llamada no lleva comparar_con). Pasa serieB (ventas_neto y resultado
 * del año prev) + comparables al componente BarsLine.
 */

import { useState } from 'react'
import { BarsLine, fmtEur } from '../../components/charts'
import { useGraficosSomm } from './GraficosSommProvider'

export function GraficoEvolucion({ restauranteId, enabled = true }) {
  const [anio, setAnio]           = useState(new Date().getFullYear())
  const [compararOn, setComparar] = useState(true)

  // Fetch con comparar_con para detectar si hay año prev con datos cerrados.
  const compararCon = compararOn ? (anio - 1) : null
  const { data, loading, error } = useGraficosSomm({
    restauranteId, anio, compararCon, enabled,
  })

  // La casilla NO se muestra:
  //   - mientras loading=true (evita parpadeo "Comparar con 2024" al
  //     cambiar de año);
  //   - si el data recibido no corresponde al año seleccionado (ocurre
  //     entre que el user cambia año y llega la nueva respuesta);
  //   - si comparables está vacío (p.ej. 2025 sin 2024 en la base).
  const dataListo    = !loading && data?.anio === anio
  const hayAnioPrev  = dataListo && Array.isArray(data?.comparables) && data.comparables.length > 0

  if (!enabled) return null

  const dataChart = (data?.meses || []).map(m => ({
    mes:    m.mes,
    estado: m.estado,
    bar:    m.ventas_neto,
    linea:  m.resultado,
  }))

  const serieB = (compararOn && data?.mesesPrev) ? data.mesesPrev.map(m => ({
    mes:   m.mes,
    bar:   m.ventas_neto,
    linea: m.resultado,
  })) : null

  const comparables   = compararOn ? (data?.comparables || []) : []
  const etiquetaSeries = compararOn && hayAnioPrev
    ? `${anio} / ${anio - 1}`
    : null

  return (
    <section style={{ marginTop: 32 }}>
      <HeaderConSelector
        titulo="Evolución mensual" subtitulo="Ventas netas y resultado neto de bodega"
        anio={anio} setAnio={setAnio}
        compararOn={compararOn} setComparar={setComparar}
        mostrarComparar={hayAnioPrev}
        anioPrev={anio - 1}
      />
      {error && <p style={{ color: 'var(--c-error, #c00)', fontSize: 12 }} role="alert">{error}</p>}
      <BarsLine
        data={dataChart}
        loading={loading}
        formatBar={fmtEur}
        formatLine={fmtEur}
        titulo="VENTAS vs RESULTADO"
        subtitulo="Mes con rayado = en curso o estimado"
        mensajeVacio="Aún no hay datos suficientes para este año"
        serieB={serieB}
        comparables={comparables}
        etiquetaSeries={etiquetaSeries}
      />
    </section>
  )
}

function HeaderConSelector({ titulo, subtitulo, anio, setAnio, compararOn, setComparar, mostrarComparar, anioPrev }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{titulo}</h3>
        {subtitulo && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8b8278' }}>{subtitulo}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {mostrarComparar && (
          <label style={{ fontSize: 12, color: '#555', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={compararOn}
                   onChange={e => setComparar(e.target.checked)} />
            Comparar con {anioPrev}
          </label>
        )}
        <select value={String(anio)} onChange={e => setAnio(Number(e.target.value))}
                style={{ padding: '4px 8px', fontSize: 13 }}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  )
}
