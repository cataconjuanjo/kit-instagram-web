'use client'

import { useEffect, useMemo, useState } from 'react'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { supabase } from '../../supabase'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import styles from '../module.module.css'
import { redondear } from '../../lib/wineEconomics'
import {
  generarObjetivosYoY,
  calcularBonus,
  acumularBonus,
} from '../../lib/sommExplotacion'
import { calcularYoY, mesesComparables } from '../../lib/yoyAgregacion'

const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TABS = [
  { id: 'historico', label: 'Histórico multianual' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'bonus', label: 'Bonus variable' },
]

function num(v) {
  if (typeof v === 'string') v = v.replace(',', '.')
  return Number(v) || 0
}

function eur(v, dec = 0) {
  return `${redondear(num(v), dec).toLocaleString('es-ES', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })} €`
}

function pct(v, dec = 1) {
  const val = redondear(num(v), dec)
  return `${val > 0 ? '+' : ''}${val} %`
}

// ── Gráfico de barras (div/flex, sin SVG) ────────────────────────────────────

function BarChart({ datos, titulo, colorFn }) {
  const MAX_BARRAS = 24
  const visibles    = datos.slice(-MAX_BARRAS)
  const CHART_H     = 190

  const maxPositive = Math.max(...visibles.map(d => d.valor), 0)
  const maxNegative = Math.max(...visibles.map(d => -d.valor), 0)
  const totalRange  = Math.max(maxPositive + maxNegative, 1)
  const posH = maxPositive > 0 ? Math.round((maxPositive / totalRange) * CHART_H) : 0
  const negH = CHART_H - posH

  if (!visibles.length) return null

  return (
    <div style={{ marginBottom: 24 }}>
      <style>{`.bc-col{flex:1;display:flex;flex-direction:column;min-width:0;cursor:default}.bc-label{overflow:hidden}@media(max-width:599px){.bc-col:nth-child(even) .bc-label{visibility:hidden}}`}</style>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{titulo}</p>
      <div style={{ display: 'flex', width: '100%' }}>
        {visibles.map((d, i) => {
          const color    = colorFn ? colorFn(d) : '#2a2723'
          const parts    = d.label.split(' ')
          const mesLabel = parts[0]
          const yearLabel = parts[1]
          const showYear = i === 0 || mesLabel === 'Ene'
          const posBarH  = d.valor > 0 ? Math.max(2, Math.round((d.valor / totalRange) * CHART_H)) : 0
          const negBarH  = d.valor < 0 ? Math.max(2, Math.round((-d.valor / totalRange) * CHART_H)) : 0
          const tooltip  = `${d.label}: ${eur(d.valor)}${d.yoy != null ? ` (${pct(d.yoy)})` : ''}`

          return (
            <div key={i} className="bc-col" title={tooltip}>
              {posH > 0 && (
                <div style={{ height: posH, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  {posBarH > 0 && (
                    <div style={{ height: posBarH, background: color, borderRadius: '2px 2px 0 0', opacity: 0.85, margin: '0 1px' }} />
                  )}
                </div>
              )}
              <div style={{ height: 1, background: '#e8e3d8', flexShrink: 0 }} />
              {negH > 0 && (
                <div style={{ height: negH, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                  {negBarH > 0 && (
                    <div style={{ height: negBarH, background: color, borderRadius: '0 0 2px 2px', opacity: 0.85, margin: '0 1px' }} />
                  )}
                </div>
              )}
              <div className="bc-label" style={{ textAlign: 'center', lineHeight: 1.1, marginTop: 4 }}>
                <span style={{ fontSize: 9, color: '#999', display: 'block' }}>{mesLabel}</span>
                {showYear && yearLabel && (
                  <span style={{ fontSize: 8, color: '#bbb', display: 'block' }}>{yearLabel}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── KPI YTD con variación (reutiliza colores de la pantalla) ─────────────────

function KpiYtd({ label, ytd, tipo = 'importe', invertirColor = false }) {
  if (!ytd) return <StatCard value="—" label={label} hint="Sin datos" />
  const esRatio = tipo === 'ratio'
  const valor   = esRatio ? redondear(ytd.valor ?? 0, 1) + ' %' : eur(ytd.valor ?? 0)
  const prev    = ytd.valorPrev
  const delta   = ytd.delta
  const dpct    = ytd.deltaPct

  // Hint: variación visible debajo del valor
  let hintTxt = ''
  if (prev == null) {
    hintTxt = 'Sin año anterior'
  } else if (esRatio) {
    // delta en pp
    hintTxt = `${delta >= 0 ? '+' : ''}${redondear(delta, 1)} pp vs ${redondear(prev, 1)} %`
  } else if (dpct != null) {
    hintTxt = `${dpct >= 0 ? '+' : ''}${redondear(dpct, 1)} % · ${delta >= 0 ? '+' : '−'}${eur(Math.abs(delta))}`
  } else if (delta != null) {
    hintTxt = `${delta >= 0 ? '+' : '−'}${eur(Math.abs(delta))} (prev = 0)`
  } else {
    hintTxt = 'Sin año anterior'
  }

  // Color: por convención, delta positiva = verde (invertirColor para
  // métricas donde bajar es bueno: Consumo MP, % MP).
  const signo = esRatio ? Math.sign(delta ?? 0) : Math.sign(delta ?? 0)
  const bueno = invertirColor ? signo < 0 : signo > 0
  const malo  = invertirColor ? signo > 0 : signo < 0
  const color = prev == null || signo === 0 ? '#888'
              : bueno ? '#27ae60'
              : malo  ? '#e74c3c'
              : '#888'

  return <StatCard value={valor} label={label} hint={hintTxt}
                   valueStyle={{ color: prev == null ? '#1a1a1a' : color }} />
}

// ── Tab Histórico multianual ─────────────────────────────────────────────────

function TabHistorico({ historico }) {
  // Agrupar por año y mes
  const porAnioMes = useMemo(() => {
    const mapa = {}
    historico.forEach(h => {
      const key = `${h.anio}-${h.mes}`
      mapa[key] = h
    })
    return mapa
  }, [historico])

  const anios = useMemo(() => {
    return [...new Set(historico.map(h => h.anio))].sort()
  }, [historico])

  // ── YoY vía helper puro ────────────────────────────────────────────────
  // Para cada año construye filas normalizadas (con margen_explotacion
  // derivado si falta) y llama a calcularYoY con el año anterior.
  // El helper devuelve meses comparables (excluye mes en curso), porMes
  // y YTD. UI mantiene el redondeo a 1 decimal en los Δ% por fidelidad
  // visual con la versión previa (el helper redondea a 2).
  const filasAnuales = useMemo(() => {
    const porAnio = {}
    for (const h of historico) {
      if (!porAnio[h.anio]) porAnio[h.anio] = []
      porAnio[h.anio].push({
        anio:               h.anio,
        mes:                h.mes,
        ingresos:           Number(h.ingresos)   || 0,
        consumo_mp:         Number(h.consumo_mp) || 0,
        pct_mp:             Number(h.pct_mp)     || 0,
        margen_explotacion: Number(h.margen_explotacion
                                  ?? (h.ingresos - h.consumo_mp - h.gastos_fijos)) || 0,
      })
    }
    return porAnio
  }, [historico])

  const yoyPorAnio = useMemo(() => {
    const out = {}
    for (const anio of anios) {
      out[anio] = calcularYoY({
        actual: filasAnuales[anio]     || [],
        prev:   filasAnuales[anio - 1] || [],
        metricas: [
          { key: 'ingresos',           tipo: 'importe' },
          { key: 'consumo_mp',         tipo: 'importe' },
          { key: 'margen_explotacion', tipo: 'importe' },
          // % MP ponderado: Σ(consumo_mp) / Σ(ingresos) × 100 por año,
          // NO promedio simple (que infla cuando los meses pesan distinto).
          { key: 'pct_mp', tipo: 'ratio', num: 'consumo_mp', den: 'ingresos', escala: 100 },
        ],
      })
    }
    return out
  }, [anios, filasAnuales])

  const datosIngresos = useMemo(() => {
    const resultado = []
    for (const anio of anios) {
      const porMes = yoyPorAnio[anio]?.porMes?.ingresos || {}
      MESES_LABEL.forEach((mesLabel, i) => {
        const mesNum = i + 1
        const celda  = porMes[mesNum]
        if (celda && celda.valor != null) {
          resultado.push({
            label: `${mesLabel} ${String(anio).slice(2)}`,
            valor: celda.valor,
            yoy:   celda.deltaPct != null ? redondear(celda.deltaPct, 1) : null,
            anio,
            mes:   mesNum,
          })
        }
      })
    }
    return resultado
  }, [anios, yoyPorAnio])

  const datosMargen = useMemo(() => {
    return datosIngresos.map(d => {
      const celda = yoyPorAnio[d.anio]?.porMes?.margen_explotacion?.[d.mes]
      return {
        ...d,
        valor: celda?.valor ?? 0,
        yoy:   celda?.deltaPct != null ? redondear(celda.deltaPct, 1) : null,
      }
    })
  }, [datosIngresos, yoyPorAnio])

  const totalPorAnio = useMemo(() => {
    // Compat con el resumen anual: {ingresos, consumo, margen, meses} por año.
    // La suma es sobre TODOS los meses presentes del año (como antes); el
    // YoY mostrado al lado usa SOLO meses comparables vía yoyPorAnio[anio].ytd.
    const t = {}
    historico.forEach(h => {
      if (!t[h.anio]) t[h.anio] = { ingresos: 0, consumo: 0, margen: 0, meses: new Set() }
      t[h.anio].ingresos += h.ingresos
      t[h.anio].consumo += h.consumo_mp
      t[h.anio].margen += h.margen_explotacion ?? (h.ingresos - h.consumo_mp - h.gastos_fijos)
      t[h.anio].meses.add(h.mes)
    })
    return t
  }, [historico])

  // ── KPI YTD YoY: año más reciente con dato vs anterior ────────────────
  const anioActual = anios.length ? anios[anios.length - 1] : null
  const ytdActual  = anioActual != null ? yoyPorAnio[anioActual] : null
  const hayYtd     = ytdActual && ytdActual.meses.length > 0
  const mesesYtdLabel = hayYtd
    ? `${MESES_LABEL[ytdActual.meses[0] - 1]}–${MESES_LABEL[ytdActual.meses[ytdActual.meses.length - 1] - 1]}`
    : ''

  // Mes abierto: fila presente en el año actual que NO está en meses comparables
  // (típicamente el mes en curso). Para visibilidad de "en curso (parcial)".
  const mesesPresentesActual = (filasAnuales[anioActual] || []).map(f => f.mes).sort((a, b) => a - b)
  const mesesComp = ytdActual?.meses || []
  const mesAbierto = mesesPresentesActual.find(m => !mesesComp.includes(m)) || null

  if (!historico.length) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelBody}>
          <p style={{ color: '#888', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            Sin datos históricos. Guarda un periodo en la pantalla de Explotación para empezar a construir el histórico.
          </p>
        </div>
      </section>
    )
  }

  return (
    <>
      {/* KPI YTD YoY del año más reciente */}
      {hayYtd && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>
              YTD {anioActual} <span style={{ fontWeight: 400, fontSize: 13, color: '#888' }}>
                ({mesesYtdLabel}) vs mismos meses {anioActual - 1}
              </span>
            </h2>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.statsGrid}>
              <KpiYtd label="Ventas netas" tipo="importe"
                      ytd={ytdActual.ytd.ingresos} />
              <KpiYtd label="Consumo MP" tipo="importe"
                      ytd={ytdActual.ytd.consumo_mp}
                      invertirColor />
              <KpiYtd label="% MP" tipo="ratio"
                      ytd={ytdActual.ytd.pct_mp}
                      invertirColor />
              <KpiYtd label="Margen explotación" tipo="importe"
                      ytd={ytdActual.ytd.margen_explotacion} />
            </div>
            {mesAbierto && (
              <p style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
                {MESES_LABEL[mesAbierto - 1]} en curso (parcial, no entra en el YTD):
                {' '}<strong>{eur((porAnioMes[`${anioActual}-${mesAbierto}`]?.ingresos) || 0)}</strong>
                {' '}en ingresos.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Resumen anual */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Resumen anual</h2>
        </div>
        <div className={styles.panelBody}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e8e3d8' }}>
                  <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 600 }}>Año</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Ingresos</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>vs año ant.</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Consumo MP</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>% MP</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Margen explot.</th>
                  <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>% Margen</th>
                </tr>
              </thead>
              <tbody>
                {anios.slice().reverse().map(anio => {
                  const d = totalPorAnio[anio]
                  // YoY del año: delegado al helper puro (mesesComparables
                  // intersecta meses presentes en ambos años y excluye el
                  // mes en curso del año actual).
                  const yoyAnio    = yoyPorAnio[anio]
                  const comunes    = yoyAnio?.meses || []
                  const yoyRaw     = yoyAnio?.ytd?.ingresos?.deltaPct ?? null
                  const yoy        = yoyRaw != null ? redondear(yoyRaw, 1) : null
                  const mesesLabel = comunes.length > 0 && comunes.length < 12
                    ? ` (${MESES_LABEL[comunes[0] - 1]}–${MESES_LABEL[comunes[comunes.length - 1] - 1]})`
                    : null
                  return (
                    <tr key={anio} style={{ borderBottom: '1px solid #f0ece4' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 600 }}>
                        {anio}{mesesLabel && <span style={{ fontWeight: 400, fontSize: 11, color: '#888' }}>{mesesLabel}</span>}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{eur(d.ingresos)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: yoy == null ? '#888' : yoy >= 0 ? '#27ae60' : '#e74c3c', fontSize: 12 }}>
                        {yoy != null ? `${yoy >= 0 ? '+' : ''}${yoy}%` : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right' }}>{eur(d.consumo)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>
                        {d.ingresos ? redondear((d.consumo / d.ingresos) * 100, 1) + '%' : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 600, color: d.margen >= 0 ? '#27ae60' : '#e74c3c' }}>
                        {eur(d.margen)}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>
                        {d.ingresos ? redondear((d.margen / d.ingresos) * 100, 1) + '%' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Gráficos */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Evolución mensual</h2>
        </div>
        <div className={styles.panelBody}>
          <BarChart
            titulo="Ingresos mensuales"
            datos={datosIngresos}
            colorFn={d => '#2a2723'}
          />
          <BarChart
            titulo="Margen de Explotación mensual"
            datos={datosMargen}
            colorFn={d => d.valor >= 0 ? '#27ae60' : '#e74c3c'}
          />
        </div>
      </section>
    </>
  )
}

// ── Tab Presupuesto ──────────────────────────────────────────────────────────

function TabPresupuesto({ restauranteId, historico }) {
  const anioHoy = new Date().getFullYear()
  const [anio, setAnio] = useState(anioHoy)
  const [modoYoY, setModoYoY] = useState(true)
  const [factorCrecimiento, setFactorCrecimiento] = useState('10')
  const [objetivosManuales, setObjetivosManuales] = useState(Array.from({ length: 12 }, () => ''))
  const [realActual, setRealActual] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  // Datos del año base (año anterior)
  const historialBase = useMemo(() => {
    return historico
      .filter(h => h.anio === anio - 1)
      .reduce((acc, h) => { acc[h.mes] = h; return acc }, {})
  }, [historico, anio])

  // Datos reales del año actual
  useEffect(() => {
    const real = historico
      .filter(h => h.anio === anio)
      .reduce((acc, h) => { acc[h.mes] = h; return acc }, {})
    setRealActual(real)
  }, [historico, anio])

  // Cargar presupuesto guardado
  useEffect(() => {
    async function cargar() {
      if (!restauranteId) return
      const { data } = await supabase
        .from('presupuesto_mensual')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .eq('anio', anio)
        .order('mes')
      if (data?.length) {
        const primeraFila = data[0]
        setModoYoY(Boolean(primeraFila.factor_crecimiento_pct))
        if (primeraFila.factor_crecimiento_pct) {
          setFactorCrecimiento(String(primeraFila.factor_crecimiento_pct))
        }
        const manuales = Array.from({ length: 12 }, (_, i) => {
          const fila = data.find(d => d.mes === i + 1)
          return fila?.objetivo_facturacion ? String(fila.objetivo_facturacion) : ''
        })
        setObjetivosManuales(manuales)
      }
    }
    cargar()
  }, [restauranteId, anio])

  const objetivosYoY = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      ingresos: historialBase[i + 1]?.ingresos || 0,
    }))
    return generarObjetivosYoY(base, factorCrecimiento)
  }, [historialBase, factorCrecimiento])

  async function guardar() {
    setGuardando(true)
    const filas = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const objYoY = objetivosYoY.find(o => o.mes === mes)
      return {
        restaurante_id: restauranteId,
        anio,
        mes,
        objetivo_facturacion: modoYoY
          ? (objYoY?.objetivo || null)
          : (num(objetivosManuales[i]) || null),
        anio_base: modoYoY ? anio - 1 : null,
        factor_crecimiento_pct: modoYoY ? num(factorCrecimiento) : null,
      }
    })
    for (const fila of filas) {
      await supabase.from('presupuesto_mensual').upsert(fila, { onConflict: 'restaurante_id,anio,mes' })
    }
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  const filasMeses = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    const objYoY = objetivosYoY.find(o => o.mes === mes)
    const objetivo = modoYoY
      ? (objYoY?.objetivo || 0)
      : num(objetivosManuales[i])
    const ingresoBase = objYoY?.ingresoBase || 0
    const real = realActual[mes]?.ingresos || 0
    const crecimientoReal = ingresoBase ? redondear(((real - ingresoBase) / ingresoBase) * 100, 1) : null
    const superaObjetivo = objetivo && real >= objetivo
    return { mes, label: MESES_LABEL[i], ingresoBase, objetivo, real, crecimientoReal, superaObjetivo }
  })

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Presupuesto {anio}</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className={styles.select} value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {[anioHoy - 1, anioHoy, anioHoy + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <div className={styles.panelBody}>
        {/* Selector modo */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button type="button" className={modoYoY ? styles.primary : styles.ghost} onClick={() => setModoYoY(true)}>
            Modo YoY automático
          </button>
          <button type="button" className={!modoYoY ? styles.primary : styles.ghost} onClick={() => setModoYoY(false)}>
            Modo manual
          </button>
        </div>

        {modoYoY && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: '#f7f5f0', borderRadius: 4 }}>
            <label className={styles.label} style={{ margin: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              Crecimiento objetivo sobre {anio - 1}:
              <input
                className={styles.input}
                type="number"
                step="1"
                min="0"
                max="100"
                value={factorCrecimiento}
                onChange={e => setFactorCrecimiento(e.target.value)}
                style={{ width: 70 }}
              />
              <span>%</span>
            </label>
            <small style={{ color: '#888' }}>Los objetivos mensuales se calculan automáticamente como: Real {anio - 1} × (1 + {factorCrecimiento}%)</small>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e8e3d8' }}>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 600 }}>Mes</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Real {anio - 1}</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Objetivo {anio}</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Real {anio}</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>% crecim. YoY</th>
                <th style={{ textAlign: 'center', padding: '7px 8px', fontWeight: 600 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filasMeses.map(f => (
                <tr key={f.mes} style={{ borderBottom: '1px solid #f0ece4' }}>
                  <td style={{ padding: '7px 8px', fontWeight: 500 }}>{f.label}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#888' }}>
                    {f.ingresoBase ? eur(f.ingresoBase) : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                    {!modoYoY ? (
                      <input
                        className={styles.input}
                        type="number"
                        step="100"
                        min="0"
                        value={objetivosManuales[f.mes - 1]}
                        onChange={e => {
                          const next = [...objetivosManuales]
                          next[f.mes - 1] = e.target.value
                          setObjetivosManuales(next)
                        }}
                        style={{ width: 90, textAlign: 'right' }}
                      />
                    ) : (
                      <span>{f.objetivo ? eur(f.objetivo) : '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: f.real > 0 ? 600 : 400 }}>
                    {f.real ? eur(f.real) : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: f.crecimientoReal == null ? '#888' : f.crecimientoReal >= 0 ? '#27ae60' : '#e74c3c', fontWeight: 500 }}>
                    {f.crecimientoReal != null ? `${f.crecimientoReal >= 0 ? '+' : ''}${f.crecimientoReal}%` : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'center', fontSize: 15 }}>
                    {f.real && f.objetivo ? (f.superaObjetivo ? '✅' : '❌') : '·'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" className={styles.primary} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar presupuesto'}
          </button>
          {guardado && <span style={{ color: '#27ae60', fontSize: 13 }}>Guardado ✓</span>}
        </div>
      </div>
    </section>
  )
}

// ── Tab Bonus Variable ───────────────────────────────────────────────────────

function TabBonus({ restauranteId, historico }) {
  const anioHoy = new Date().getFullYear()
  const [anio, setAnio] = useState(anioHoy)
  const [umbral, setUmbral] = useState('10')
  const [bonusPct, setBonusPct] = useState('5')
  const [activo, setActivo] = useState(true)
  const [presupuesto, setPresupuesto] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    async function cargar() {
      if (!restauranteId) return
      const [{ data: config }, { data: presup }] = await Promise.all([
        supabase.from('configuracion_bonus').select('*').eq('restaurante_id', restauranteId).eq('anio', anio).maybeSingle(),
        supabase.from('presupuesto_mensual').select('*').eq('restaurante_id', restauranteId).eq('anio', anio),
      ])
      if (config) {
        setUmbral(String(config.umbral_crecimiento_pct))
        setBonusPct(String(config.bonus_pct))
        setActivo(config.activo)
      }
      const presupMap = {}
      ;(presup || []).forEach(p => { presupMap[p.mes] = p })
      setPresupuesto(presupMap)
    }
    cargar()
  }, [restauranteId, anio])

  // Datos reales del año y anterior
  const realActual = useMemo(() => {
    return historico.filter(h => h.anio === anio).reduce((acc, h) => { acc[h.mes] = h; return acc }, {})
  }, [historico, anio])

  const realAnterior = useMemo(() => {
    return historico.filter(h => h.anio === anio - 1).reduce((acc, h) => { acc[h.mes] = h; return acc }, {})
  }, [historico, anio])

  const filasMeses = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const facturado = realActual[mes]?.ingresos || 0
      const anterior = realAnterior[mes]?.ingresos || 0
      const objetivo = presupuesto[mes]?.objetivo_facturacion || (anterior * (1 + num(umbral) / 100))
      const r = calcularBonus(facturado, objetivo, num(umbral), num(bonusPct), anterior)
      return { mes, label: MESES_LABEL[i], facturado, anterior, objetivo, ...r }
    })
  }, [realActual, realAnterior, presupuesto, umbral, bonusPct])

  const { acumulado } = useMemo(() => acumularBonus(filasMeses), [filasMeses])
  const mesesConBonus = filasMeses.filter(f => f.bonus > 0)
  const mesesCerrados = filasMeses.filter(f => f.facturado > 0)

  async function guardar() {
    setGuardando(true)
    await supabase.from('configuracion_bonus').upsert({
      restaurante_id: restauranteId,
      anio,
      umbral_crecimiento_pct: num(umbral),
      bonus_pct: num(bonusPct),
      activo,
    }, { onConflict: 'restaurante_id,anio' })
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Remuneración Variable {anio}</h2>
        <select className={styles.select} value={anio} onChange={e => setAnio(Number(e.target.value))}>
          {[anioHoy - 1, anioHoy, anioHoy + 1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className={styles.panelBody}>
        {/* Configuración */}
        <div style={{ padding: '14px 16px', background: '#f7f5f0', borderRadius: 4, marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 13 }}>Configuración del sistema de bonus</p>
          <div className={styles.formGrid}>
            <label className={styles.label}>
              Umbral de crecimiento interanual para activar bonus
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className={styles.input} type="number" step="1" min="0" max="100" value={umbral} onChange={e => setUmbral(e.target.value)} style={{ width: 70 }} />
                <span style={{ fontSize: 13 }}>%</span>
              </div>
            </label>
            <label className={styles.label}>
              Porcentaje del exceso como bonus
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input className={styles.input} type="number" step="0.5" min="0" max="50" value={bonusPct} onChange={e => setBonusPct(e.target.value)} style={{ width: 70 }} />
                <span style={{ fontSize: 13 }}>%</span>
              </div>
            </label>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: '#666' }}>
            Fórmula: si el crecimiento YoY del mes &gt; {umbral}%, el bonus = (facturado − objetivo) × {bonusPct}%
          </p>
        </div>

        {/* KPIs */}
        <div className={styles.statsGrid} style={{ marginBottom: 20 }}>
          <StatCard
            value={`${eur(acumulado, 2)}`}
            label="Bonus acumulado (meses cerrados)"
            hint={`${mesesConBonus.length} de ${mesesCerrados.length} meses con bonus`}
            valueStyle={{ color: acumulado > 0 ? '#27ae60' : '#888' }}
          />
          <StatCard
            value={mesesConBonus.length > 0 ? eur(acumulado / mesesConBonus.length, 2) : '—'}
            label="Bonus promedio por mes activo"
          />
          <StatCard
            value={`${umbral}%`}
            label="Umbral de crecimiento"
            hint={`Activado ${mesesConBonus.length} de ${mesesCerrados.length} meses`}
          />
        </div>

        {/* Tabla mensual */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e8e3d8' }}>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 600 }}>Mes</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Real {anio - 1}</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Objetivo</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Real {anio}</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Crecim. YoY</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Exceso</th>
                <th style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 600 }}>Bonus</th>
              </tr>
            </thead>
            <tbody>
              {filasMeses.map(f => (
                <tr key={f.mes} style={{ borderBottom: '1px solid #f0ece4', background: f.bonus > 0 ? '#f0faf4' : undefined }}>
                  <td style={{ padding: '7px 8px', fontWeight: 500 }}>{f.label}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#888' }}>{f.anterior ? eur(f.anterior) : '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{f.objetivo ? eur(f.objetivo) : '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: f.facturado > 0 ? 600 : 400 }}>{f.facturado ? eur(f.facturado) : '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: f.crecimientoYoyPct >= num(umbral) ? '#27ae60' : '#e74c3c', fontWeight: 500 }}>
                    {f.facturado && f.anterior ? `${f.crecimientoYoyPct >= 0 ? '+' : ''}${f.crecimientoYoyPct}%` : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#888' }}>
                    {f.exceso > 0 ? eur(f.exceso) : '—'}
                  </td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: f.bonus > 0 ? '#27ae60' : '#888' }}>
                    {f.bonus > 0 ? eur(f.bonus, 2) : f.facturado ? '—' : '·'}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid #2a2723', background: '#faf9f6' }}>
                <td colSpan={6} style={{ padding: '10px 8px', fontWeight: 700 }}>Total bonus {anio}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: acumulado > 0 ? '#27ae60' : '#888' }}>
                  {eur(acumulado, 2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" className={styles.primary} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar configuración'}
          </button>
          {guardado && <span style={{ color: '#27ae60', fontSize: 13 }}>Guardado ✓</span>}
        </div>
      </div>
    </section>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AnaliticaSommPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [historico, setHistorico] = useState([])
  const [loading, setLoading] = useState(true)
  const [tabActiva, setTabActiva] = useState('historico')

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }

      const q = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await q.eq('id', restauranteId).single()
        : await q.eq('email', email).single()
      if (!rest) return setLoading(false)
      setRestaurante(rest)

      const { data: hist } = await supabase
        .from('historico_mensual')
        .select('*')
        .eq('restaurante_id', rest.id)
        .order('anio')
        .order('mes')
      setHistorico(hist || [])
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState title="Cargando analítica" text="Preparando histórico multianual y presupuesto." />

  return (
    <FeatureGate restaurante={restaurante} feature="somm_historico" title="Analítica Somm">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Carta Viva Somm"
        title="Analítica y Bonus"
        subtitle="Dashboard histórico multianual, presupuesto con modo YoY automático y sistema de remuneración variable."
        help={{
          eyebrow: 'Cómo funciona',
          title: 'Analítica y Bonus',
          items: [
            { title: 'Histórico multianual', text: 'Evolución de ingresos y margen mes a mes durante varios años. Se alimenta automáticamente al guardar cada periodo en Explotación.' },
            { title: 'Presupuesto YoY', text: 'Introduce solo el % de crecimiento objetivo y el sistema genera los 12 objetivos mensuales basándose en el año anterior.' },
            { title: 'Bonus variable', text: 'Configura el umbral de crecimiento YoY y el % del exceso como bonus. El sistema calcula automáticamente cada mes si se ha devengado bonus.' },
          ],
        }}
      >
        <div className={styles.innerTabs} role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tabActiva === tab.id}
              className={tabActiva === tab.id ? styles.primary : styles.ghost}
              onClick={() => setTabActiva(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" style={{ marginTop: 4 }}>
          {tabActiva === 'historico' && <TabHistorico historico={historico} />}
          {tabActiva === 'presupuesto' && <TabPresupuesto restauranteId={restaurante?.id} historico={historico} />}
          {tabActiva === 'bonus' && <TabBonus restauranteId={restaurante?.id} historico={historico} />}
        </div>
      </ModuleShell>
    </FeatureGate>
  )
}
