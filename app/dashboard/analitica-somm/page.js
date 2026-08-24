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

// ── Gráfico de barras simple (SVG) ───────────────────────────────────────────

function BarChart({ datos, titulo, colorFn }) {
  const MAX_BARRAS = 24
  const visibles = datos.slice(-MAX_BARRAS)
  const maxVal = Math.max(...visibles.map(d => Math.abs(d.valor)), 1)
  const HEIGHT = 120
  const BAR_W = 18
  const GAP = 4
  const width = visibles.length * (BAR_W + GAP)

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{titulo}</p>
      <div style={{ overflowX: 'auto' }}>
        <svg width={Math.max(width, 300)} height={HEIGHT + 36} style={{ display: 'block' }}>
          {visibles.map((d, i) => {
            const h = Math.max(2, (Math.abs(d.valor) / maxVal) * HEIGHT)
            const x = i * (BAR_W + GAP)
            const y = d.valor >= 0 ? HEIGHT - h : HEIGHT
            const color = colorFn ? colorFn(d) : '#2a2723'
            return (
              <g key={i}>
                <rect x={x} y={y} width={BAR_W} height={h} fill={color} rx={2} opacity={0.85}>
                  <title>{d.label}: {eur(d.valor)}{d.yoy != null ? ` (${pct(d.yoy)})` : ''}</title>
                </rect>
                <text x={x + BAR_W / 2} y={HEIGHT + 14} textAnchor="middle" fontSize={9} fill="#999">{d.label}</text>
                {d.yoy != null && (
                  <text x={x + BAR_W / 2} y={y - 3} textAnchor="middle" fontSize={8} fill={d.yoy >= 0 ? '#27ae60' : '#e74c3c'}>
                    {d.yoy > 0 ? '+' : ''}{Math.round(d.yoy)}%
                  </text>
                )}
              </g>
            )
          })}
          {/* Línea base */}
          <line x1={0} y1={HEIGHT} x2={width} y2={HEIGHT} stroke="#e8e3d8" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
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

  // Calcular YoY por mes
  const datosIngresos = useMemo(() => {
    const resultado = []
    anios.forEach(anio => {
      MESES_LABEL.forEach((mes, i) => {
        const mesNum = i + 1
        const actual = porAnioMes[`${anio}-${mesNum}`]
        const anterior = porAnioMes[`${anio - 1}-${mesNum}`]
        if (actual) {
          resultado.push({
            label: `${mes} ${String(anio).slice(2)}`,
            valor: actual.ingresos,
            yoy: anterior?.ingresos ? redondear(((actual.ingresos - anterior.ingresos) / anterior.ingresos) * 100, 1) : null,
            anio,
            mes: mesNum,
          })
        }
      })
    })
    return resultado
  }, [porAnioMes, anios])

  const datosMargen = useMemo(() => {
    return datosIngresos.map(d => {
      const h = porAnioMes[`${d.anio}-${d.mes}`]
      const margen = h?.margen_explotacion ?? (h ? h.ingresos - h.consumo_mp - h.gastos_fijos : 0)
      const anterior = porAnioMes[`${d.anio - 1}-${d.mes}`]
      const margenAnterior = anterior ? (anterior.margen_explotacion ?? anterior.ingresos - anterior.consumo_mp - anterior.gastos_fijos) : null
      return {
        ...d,
        valor: margen,
        yoy: margenAnterior ? redondear(((margen - margenAnterior) / Math.abs(margenAnterior)) * 100, 1) : null,
      }
    })
  }, [datosIngresos, porAnioMes])

  const totalPorAnio = useMemo(() => {
    const t = {}
    historico.forEach(h => {
      if (!t[h.anio]) t[h.anio] = { ingresos: 0, consumo: 0, margen: 0 }
      t[h.anio].ingresos += h.ingresos
      t[h.anio].consumo += h.consumo_mp
      t[h.anio].margen += h.margen_explotacion ?? (h.ingresos - h.consumo_mp - h.gastos_fijos)
    })
    return t
  }, [historico])

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
                  const dAnt = totalPorAnio[anio - 1]
                  const yoy = dAnt?.ingresos ? redondear(((d.ingresos - dAnt.ingresos) / dAnt.ingresos) * 100, 1) : null
                  return (
                    <tr key={anio} style={{ borderBottom: '1px solid #f0ece4' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 600 }}>{anio}</td>
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
