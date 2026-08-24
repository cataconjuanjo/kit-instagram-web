'use client'

import { useEffect, useMemo, useState } from 'react'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { supabase } from '../../supabase'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import styles from '../module.module.css'
import { redondear } from '../../lib/wineEconomics'
import {
  calcularTotalPersonal,
  calcularTotalGastos,
  calcularTotalAlquiler,
  calcularTotalBancarios,
  calcularBreakEven,
  calcularResultadoExplotacion,
  calcularDesviacion,
  calcularRotacionStock,
  kpiStockVentas,
  BENCHMARKS_SECTOR,
  compararConBenchmark,
  CATEGORIAS_GASTOS_PRESET,
} from '../../lib/sommExplotacion'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function periodoHoy() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
}

function eur(v, dec = 0) {
  return `${redondear(Number(v) || 0, dec).toLocaleString('es-ES', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })} €`
}

function pct(v) {
  return `${redondear(Number(v) || 0, 1)} %`
}

function num(v) {
  if (typeof v === 'string') v = v.replace(',', '.')
  return Number(v) || 0
}

const SEMAFORO_COLORES = { verde: '#27ae60', amarillo: '#f39c12', rojo: '#e74c3c', neutral: '#888' }

// ── Selector de periodo ───────────────────────────────────────────────────────

function SelectorPeriodo({ valor, onChange }) {
  const anioHoy = new Date().getFullYear()
  const opciones = []
  for (let m = 11; m >= 0; m--) {
    const fecha = new Date(anioHoy, new Date().getMonth() - m, 1)
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
    opciones.push({ key, label: `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}` })
  }
  return (
    <select className={styles.select} value={valor} onChange={e => onChange(e.target.value)}>
      {opciones.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  )
}

// ── Sección de Personal ──────────────────────────────────────────────────────

function SeccionPersonal({ params, onChange }) {
  const campos = [
    { key: 'nominas_brutas', label: 'Nóminas brutas' },
    { key: 'ss_empresa', label: 'Seguridad Social (empresa)' },
    { key: 'retenciones_irpf', label: 'Retenciones IRPF' },
    { key: 'extras_personal', label: 'Extras y horas complementarias' },
  ]
  const total = calcularTotalPersonal(params)

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Personal</h2>
        <p className={styles.panelSub}>Desglosa el coste real de personal. La SS de empresa supone ~33% más sobre la nómina bruta.</p>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.formGrid}>
          {campos.map(({ key, label }) => (
            <label key={key} className={styles.label}>
              {label}
              <input
                className={styles.input}
                type="number"
                min="0"
                step="10"
                value={params[key] || ''}
                onChange={e => onChange({ ...params, [key]: e.target.value })}
                placeholder="0 €"
              />
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#f7f5f0', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Total personal: {eur(total.total)}</strong>
          {total.pctSobreNominas > 0 && (
            <span style={{ fontSize: 12, color: '#888' }}>
              +{pct(total.pctSobreNominas)} sobre nóminas brutas (SS + retenciones)
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Sección de Gastos Operacionales ──────────────────────────────────────────

function SeccionGastos({ partidas, onChange }) {
  function actualizarPartida(id, campo, valor) {
    onChange(partidas.map(p => p.id === id ? { ...p, [campo]: valor } : p))
  }

  function agregarCustom() {
    onChange([...partidas, {
      id: `custom_${Date.now()}`,
      categoria: '',
      importe: '',
      amortizar_meses: 1,
    }])
  }

  function eliminar(id) {
    onChange(partidas.filter(p => p.id !== id))
  }

  const activadas = partidas.filter(p => num(p.importe) > 0)
  const { total } = calcularTotalGastos(partidas)

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Gastos Operacionales</h2>
        <p className={styles.panelSub}>Introduce el importe mensual. Para compras anuales (ej: carta impresa), activa "Repartir en 12 meses".</p>
      </div>
      <div className={styles.panelBody}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e3d8' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Categoría</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>Importe (€)</th>
                <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 500 }}>÷12 meses</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>€/mes</th>
                <th style={{ padding: '6px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {partidas.map(p => {
                const meses = Math.max(1, num(p.amortizar_meses) || 1)
                const mensual = num(p.importe) / meses
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f5f2ec' }}>
                    <td style={{ padding: '4px 8px' }}>
                      {p.id.startsWith('custom_') ? (
                        <input className={styles.input} value={p.categoria} onChange={e => actualizarPartida(p.id, 'categoria', e.target.value)} placeholder="Nombre gasto" style={{ width: '100%' }} />
                      ) : (
                        <span style={{ color: num(p.importe) > 0 ? '#2a2723' : '#bbb' }}>{p.categoria}</span>
                      )}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <input className={styles.input} type="number" min="0" step="10" value={p.importe || ''} onChange={e => actualizarPartida(p.id, 'importe', e.target.value)} placeholder="0" style={{ width: 90, textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <input type="checkbox" checked={num(p.amortizar_meses) === 12} onChange={e => actualizarPartida(p.id, 'amortizar_meses', e.target.checked ? 12 : 1)} title="Repartir importe anual entre 12 meses" />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: num(p.importe) > 0 ? 600 : 400, color: num(p.importe) > 0 ? '#2a2723' : '#bbb' }}>
                      {num(p.importe) > 0 ? eur(mensual, 0) : '—'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      {p.id.startsWith('custom_') && (
                        <button type="button" className={styles.danger} onClick={() => eliminar(p.id)} style={{ fontSize: 11, padding: '3px 8px' }}>✕</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button type="button" className={styles.ghost} onClick={agregarCustom}>+ Añadir categoría personalizada</button>
          <strong style={{ fontSize: 14 }}>Total gastos: {eur(total)}</strong>
        </div>
        {activadas.length === 0 && (
          <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>Introduce un importe en cualquier categoría para activarla.</p>
        )}
      </div>
    </section>
  )
}

// ── Sección de Alquileres ────────────────────────────────────────────────────

function SeccionAlquileres({ partidas, onChange }) {
  function cambiar(id, campo, valor) {
    onChange(partidas.map(p => p.id === id ? { ...p, [campo]: valor } : p))
  }

  function agregar() {
    onChange([...partidas, { id: `alq_${Date.now()}`, concepto: '', importe: '' }])
  }

  function eliminar(id) {
    onChange(partidas.filter(p => p.id !== id))
  }

  const total = calcularTotalAlquiler(partidas).total

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Alquileres</h2>
        <p className={styles.panelSub}>Local, almacén, garajes… Introduce el importe mensual de cada espacio.</p>
      </div>
      <div className={styles.panelBody}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {partidas.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input className={styles.input} value={p.concepto} onChange={e => cambiar(p.id, 'concepto', e.target.value)} placeholder="Concepto (Local, Almacén…)" style={{ flex: 2 }} />
              <input className={styles.input} type="number" min="0" step="10" value={p.importe || ''} onChange={e => cambiar(p.id, 'importe', e.target.value)} placeholder="0 €/mes" style={{ width: 110 }} />
              <button type="button" className={styles.danger} onClick={() => eliminar(p.id)} style={{ fontSize: 11, padding: '5px 8px' }}>✕</button>
            </div>
          ))}
          <button type="button" className={styles.ghost} onClick={agregar} style={{ alignSelf: 'flex-start', marginTop: 4 }}>+ Añadir alquiler</button>
        </div>
        {total > 0 && (
          <div style={{ marginTop: 12, padding: '8px 14px', background: '#f7f5f0', borderRadius: 4 }}>
            <strong>Total alquileres: {eur(total)}/mes</strong>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Sección de Gastos Bancarios ───────────────────────────────────────────────

function SeccionBancarios({ params, onChange }) {
  const campos = [
    { key: 'comisiones_datafono', label: 'Comisiones datáfono' },
    { key: 'mantenimiento_datafono', label: 'Mantenimiento datáfono' },
    { key: 'resto_comisiones', label: 'Resto de comisiones bancarias' },
  ]
  const total = calcularTotalBancarios(params).total

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Gastos Bancarios</h2>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.formGrid}>
          {campos.map(({ key, label }) => (
            <label key={key} className={styles.label}>
              {label}
              <input className={styles.input} type="number" min="0" step="5" value={params[key] || ''} onChange={e => onChange({ ...params, [key]: e.target.value })} placeholder="0 €" />
            </label>
          ))}
        </div>
        {total > 0 && (
          <div style={{ marginTop: 10, padding: '8px 14px', background: '#f7f5f0', borderRadius: 4 }}>
            <strong>Total bancarios: {eur(total)}/mes</strong>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Mapa de calor de estacionalidad ──────────────────────────────────────────

function MapaCalorEstacional({ historico, objetivoMargenPct = 20 }) {
  if (!historico.length) return null

  const porAnio = {}
  historico.forEach(h => {
    if (!porAnio[h.anio]) porAnio[h.anio] = {}
    const pctMargen = h.ingresos > 0
      ? redondear((h.margen_explotacion / h.ingresos) * 100, 1)
      : null
    porAnio[h.anio][h.mes] = pctMargen
  })

  const anios = Object.keys(porAnio).sort().reverse().slice(0, 3)

  function colorMes(pct) {
    if (pct === null) return '#f0f0f0'
    if (pct < 0) return '#e74c3c'
    if (pct < objetivoMargenPct) return '#f39c12'
    return '#27ae60'
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Estacionalidad del margen</h2>
        <p className={styles.panelSub}>Mapa de calor del margen de explotación mensual. Rojo = pérdidas · Amarillo = por debajo del objetivo · Verde = en objetivo.</p>
      </div>
      <div className={styles.panelBody} style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500, width: 48 }}>Año</th>
              {MESES.map((m, i) => <th key={i} style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 500, width: 52 }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {anios.map(anio => (
              <tr key={anio}>
                <td style={{ padding: '4px 8px', fontWeight: 600 }}>{anio}</td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
                  const val = porAnio[anio]?.[mes] ?? null
                  return (
                    <td key={mes} title={val !== null ? `${pct(val)} margen` : 'Sin datos'} style={{ padding: '6px 4px', textAlign: 'center', background: colorMes(val), color: val !== null && val >= 0 ? '#fff' : val !== null ? '#fff' : '#bbb', borderRadius: 3, fontSize: 11 }}>
                      {val !== null ? `${val > 0 ? '' : ''}${val}%` : '·'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ExplotacionPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState(periodoHoy())
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  // Datos de la P&L
  const [facturacion, setFacturacion] = useState('')
  const [consumoMp, setConsumoMp] = useState('')
  const [tipoBenchmark, setTipoBenchmark] = useState('bodega_profesional')
  const [personal, setPersonal] = useState({
    nominas_brutas: '', ss_empresa: '', retenciones_irpf: '', extras_personal: '',
  })
  const [gastosPartidas, setGastosPartidas] = useState(
    CATEGORIAS_GASTOS_PRESET.map(c => ({ ...c }))
  )
  const [alquilerPartidas, setAlquilerPartidas] = useState([
    { id: 'alq_local', concepto: 'Local', importe: '' },
    { id: 'alq_almacen', concepto: 'Almacén', importe: '' },
    { id: 'alq_otros', concepto: 'Otros', importe: '' },
  ])
  const [bancarios, setBancarios] = useState({
    comisiones_datafono: '', mantenimiento_datafono: '', resto_comisiones: '',
  })
  const [historico, setHistorico] = useState([])

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
        .order('anio', { ascending: false })
        .order('mes')
        .limit(60)
      setHistorico(hist || [])

      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    async function cargarPeriodo() {
      if (!restaurante) return
      const { data } = await supabase
        .from('parametros_explotacion')
        .select('*')
        .eq('restaurante_id', restaurante.id)
        .eq('periodo', periodo)
        .maybeSingle()

      if (data) {
        setFacturacion(data.facturacion_total || '')
        setConsumoMp(data.consumo_mp || '')
        setPersonal({
          nominas_brutas: data.nominas_brutas || '',
          ss_empresa: data.ss_empresa || '',
          retenciones_irpf: data.retenciones_irpf || '',
          extras_personal: data.extras_personal || '',
        })
        if (data.partidas_gastos?.length) setGastosPartidas(data.partidas_gastos)
        if (data.partidas_alquiler?.length) setAlquilerPartidas(data.partidas_alquiler)
        setBancarios({
          comisiones_datafono: data.comisiones_datafono || '',
          mantenimiento_datafono: data.mantenimiento_datafono || '',
          resto_comisiones: data.resto_comisiones || '',
        })
      } else {
        setFacturacion('')
        setConsumoMp('')
        setPersonal({ nominas_brutas: '', ss_empresa: '', retenciones_irpf: '', extras_personal: '' })
        setGastosPartidas(CATEGORIAS_GASTOS_PRESET.map(c => ({ ...c })))
        setAlquilerPartidas([
          { id: 'alq_local', concepto: 'Local', importe: '' },
          { id: 'alq_almacen', concepto: 'Almacén', importe: '' },
          { id: 'alq_otros', concepto: 'Otros', importe: '' },
        ])
        setBancarios({ comisiones_datafono: '', mantenimiento_datafono: '', resto_comisiones: '' })
      }
    }
    cargarPeriodo()
  }, [restaurante, periodo])

  const totales = useMemo(() => {
    const totalPersonal = calcularTotalPersonal(personal).total
    const { total: totalGastos } = calcularTotalGastos(gastosPartidas)
    const totalAlquiler = calcularTotalAlquiler(alquilerPartidas).total
    const totalBancarios = calcularTotalBancarios(bancarios).total
    const resultado = calcularResultadoExplotacion({
      facturacion: num(facturacion),
      consumoMp: num(consumoMp),
      personal: totalPersonal,
      generales: totalGastos,
      alquiler: totalAlquiler,
      bancarios: totalBancarios,
    })
    const { breakEven } = calcularBreakEven(totalPersonal, totalGastos, totalAlquiler, totalBancarios, resultado.pctMp)
    return { ...resultado, totalPersonal, totalGastos, totalAlquiler, totalBancarios, breakEven }
  }, [facturacion, consumoMp, personal, gastosPartidas, alquilerPartidas, bancarios])

  const benchmark = useMemo(() => {
    if (!totales.facturacion) return null
    return compararConBenchmark(totales, tipoBenchmark)
  }, [totales, tipoBenchmark])

  const kpiStock = useMemo(() => {
    // Sin stock disponible aquí; se muestra solo si hay datos
    return null
  }, [])

  const alertaBreakEven = totales.facturacion > 0 && totales.breakEven && totales.facturacion < totales.breakEven

  async function guardar() {
    if (!restaurante) return
    setGuardando(true)

    const payload = {
      restaurante_id: restaurante.id,
      periodo,
      facturacion_total: num(facturacion),
      consumo_mp: num(consumoMp),
      nominas_brutas: num(personal.nominas_brutas),
      ss_empresa: num(personal.ss_empresa),
      retenciones_irpf: num(personal.retenciones_irpf),
      extras_personal: num(personal.extras_personal),
      partidas_gastos: gastosPartidas,
      partidas_alquiler: alquilerPartidas,
      comisiones_datafono: num(bancarios.comisiones_datafono),
      mantenimiento_datafono: num(bancarios.mantenimiento_datafono),
      resto_comisiones: num(bancarios.resto_comisiones),
      updated_at: new Date().toISOString(),
    }

    await supabase.from('parametros_explotacion').upsert(payload, { onConflict: 'restaurante_id,periodo' })

    // Actualizar histórico mensual
    const [anioStr, mesStr] = periodo.split('-')
    await supabase.from('historico_mensual').upsert({
      restaurante_id: restaurante.id,
      anio: parseInt(anioStr),
      mes: parseInt(mesStr),
      ingresos: num(facturacion),
      consumo_mp: num(consumoMp),
      gastos_fijos: totales.totalPersonal + totales.totalGastos + totales.totalAlquiler + totales.totalBancarios,
    }, { onConflict: 'restaurante_id,anio,mes' })

    // Refrescar histórico
    const { data: hist } = await supabase
      .from('historico_mensual')
      .select('*')
      .eq('restaurante_id', restaurante.id)
      .order('anio', { ascending: false })
      .order('mes')
      .limit(60)
    setHistorico(hist || [])

    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  if (loading) return <LoadingState title="Cargando cuenta de explotación" text="Preparando el P&L de la bodega." />

  const facturacionNum = num(facturacion)

  return (
    <FeatureGate restaurante={restaurante} feature="somm_explotacion" title="Cuenta de Explotación Somm">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Carta Viva Somm"
        title="Cuenta de Explotación"
        subtitle="P&L completo de bodega: personal, gastos, alquileres, bancarios y margen de explotación real."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <SelectorPeriodo valor={periodo} onChange={setPeriodo} />
            <button type="button" className={styles.primary} onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar periodo'}
            </button>
            <a
              href={restaurante ? `/api/somm/informe-mensual?restaurante_id=${restaurante.id}&periodo=${periodo}` : '#'}
              download
              style={{
                padding: '8px 16px',
                border: '1px solid #d8d3c8',
                borderRadius: 6,
                fontSize: 13,
                color: '#444',
                textDecoration: 'none',
                background: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ↓ PDF
            </a>
            {guardado && <span style={{ fontSize: 13, color: '#27ae60' }}>Guardado ✓</span>}
          </div>
        }
        help={{
          eyebrow: 'Cómo funciona',
          title: 'Cuenta de Explotación',
          intro: 'Introduce los datos del periodo seleccionado. El sistema calcula el margen de explotación real de tu bodega y lo compara con el benchmark del sector.',
          items: [
            { title: 'Facturación y materia prima', text: 'Introduce la facturación total neta del mes y el consumo real de materia prima (no las compras).' },
            { title: 'Personal', text: 'Desglosa nóminas brutas, SS de empresa (suele ser ~33% sobre la nómina), retenciones y extras.' },
            { title: 'Break-even', text: 'El punto de equilibrio se calcula como: Gastos Fijos / (1 − %MP). Si tus ventas están por debajo, el mes cierra en pérdidas.' },
            { title: 'Mapa de calor', text: 'Visualiza qué meses son rentables y cuáles no a lo largo del año. Agosto suele ser una trampa: revenue bajo pero costes fijos inalterables.' },
          ],
        }}
      >
        {/* Facturación y MP */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Facturación y Materia Prima</h2>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <label className={styles.label}>
                Facturación total neta (€)
                <input className={styles.input} type="number" min="0" step="100" value={facturacion} onChange={e => setFacturacion(e.target.value)} placeholder="0 €" />
              </label>
              <label className={styles.label}>
                Consumo de materia prima (€)
                <input className={styles.input} type="number" min="0" step="100" value={consumoMp} onChange={e => setConsumoMp(e.target.value)} placeholder="0 €" />
                <small style={{ color: '#888', marginTop: 4, display: 'block', fontSize: 11 }}>
                  Consumo = Compras + Stock Inicial − Stock Final (no es lo mismo que las compras del mes)
                </small>
              </label>
            </div>
          </div>
        </section>

        {/* KPIs resumen */}
        {facturacionNum > 0 && (
          <div className={styles.statsGrid} style={{ marginBottom: 4 }}>
            <StatCard
              value={eur(facturacionNum)}
              label="Facturación"
            />
            <StatCard
              value={pct(totales.pctMp)}
              label="% Materia Prima"
              hint="Benchmark: 30-45% hostelería"
              valueStyle={{ color: totales.pctMp > 45 ? '#e74c3c' : totales.pctMp > 38 ? '#f39c12' : '#27ae60' }}
            />
            <StatCard
              value={pct(totales.pctPersonal)}
              label="% Personal"
              hint="Benchmark: 15-22%"
              valueStyle={{ color: totales.pctPersonal > 25 ? '#e74c3c' : totales.pctPersonal > 22 ? '#f39c12' : '#27ae60' }}
            />
            <StatCard
              value={pct(totales.pctResultado)}
              label="Margen de Explotación"
              hint="Objetivo: >20%"
              valueStyle={{ color: totales.resultado < 0 ? '#e74c3c' : totales.pctResultado < 10 ? '#f39c12' : '#27ae60' }}
            />
            <StatCard
              value={totales.breakEven ? eur(totales.breakEven) : '—'}
              label="Break-Even del mes"
              hint="Facturación mínima para cubrir costes fijos"
              valueStyle={{ color: alertaBreakEven ? '#e74c3c' : undefined }}
            />
          </div>
        )}

        {alertaBreakEven && (
          <div style={{ margin: '8px 0 16px', padding: '12px 16px', background: '#fff4f1', border: '1px solid #e0b4aa', borderRadius: 4, fontSize: 13 }}>
            <strong>Alerta: el mes cierra en pérdidas a este ritmo.</strong>{' '}
            Break-even: {eur(totales.breakEven)}. Facturación actual: {eur(facturacionNum)}.
            Faltan {eur(totales.breakEven - facturacionNum)} para cubrir costes.
          </div>
        )}

        {/* Resultado P&L completo */}
        {facturacionNum > 0 && (
          <section className={styles.panel} style={{ marginBottom: 4 }}>
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Cuenta de Explotación — {periodo}</h2>
              <label className={styles.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 0 }}>
                <span style={{ fontSize: 12, color: '#666' }}>Benchmark:</span>
                <select className={styles.select} value={tipoBenchmark} onChange={e => setTipoBenchmark(e.target.value)} style={{ fontSize: 12 }}>
                  {Object.entries(BENCHMARKS_SECTOR).map(([k, v]) => (
                    <option key={k} value={k}>{v.nombre}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.panelBody}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e8e3d8' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Concepto</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>Importe</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>% s/fact</th>
                    {benchmark && <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 500 }}>Benchmark</th>}
                    {benchmark && <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 500 }}>Estado</th>}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Facturación total neta', importe: totales.facturacion, pct: 100, bKey: null, bold: true },
                    { label: '− Materia Prima (consumo)', importe: -totales.consumoMp, pct: totales.pctMp, bKey: 'mp', color: '#e74c3c' },
                    { label: '− Personal', importe: -totales.personal, pct: totales.pctPersonal, bKey: 'personal', color: '#e74c3c' },
                    { label: '− Gastos Generales', importe: -totales.generales, pct: totales.pctGenerales, bKey: null },
                    { label: '− Alquileres', importe: -totales.alquiler, pct: totales.pctAlquiler, bKey: 'alquiler' },
                    { label: '− Gastos Bancarios', importe: -totales.bancarios, pct: totales.pctBancarios, bKey: null },
                  ].map((fila, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f2ec' }}>
                      <td style={{ padding: '7px 8px', fontWeight: fila.bold ? 600 : 400 }}>{fila.label}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: fila.bold ? 600 : 400 }}>{eur(Math.abs(fila.importe))}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>{pct(fila.pct)}</td>
                      {benchmark && fila.bKey && benchmark[fila.bKey] && (
                        <td style={{ padding: '7px 8px', textAlign: 'right', color: '#888', fontSize: 12 }}>
                          ref. {benchmark[fila.bKey].ref}%
                        </td>
                      )}
                      {benchmark && fila.bKey && benchmark[fila.bKey] && (
                        <td style={{ padding: '7px 8px', textAlign: 'center', fontSize: 12 }}>
                          {benchmark[fila.bKey].estado === 'bien' ? '✓' : '⚠'}
                        </td>
                      )}
                      {benchmark && (!fila.bKey || !benchmark[fila.bKey]) && <td colSpan={2} />}
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid #2a2723', background: totales.resultado >= 0 ? '#f0faf4' : '#fff4f1' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 700, fontSize: 14 }}>= Resultado de Explotación</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: totales.resultado >= 0 ? '#27ae60' : '#e74c3c' }}>
                      {totales.resultado >= 0 ? '' : '−'}{eur(Math.abs(totales.resultado))}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: totales.resultado >= 0 ? '#27ae60' : '#e74c3c' }}>
                      {pct(totales.pctResultado)}
                    </td>
                    {benchmark && (
                      <>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#888', fontSize: 12 }}>
                          ref. {benchmark.benchmark.margen}%
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 12 }}>
                          {benchmark.margen.estado === 'bien' ? '✓' : '⚠'}
                        </td>
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}

        <SeccionPersonal params={personal} onChange={setPersonal} />
        <SeccionGastos partidas={gastosPartidas} onChange={setGastosPartidas} />
        <SeccionAlquileres partidas={alquilerPartidas} onChange={setAlquilerPartidas} />
        <SeccionBancarios params={bancarios} onChange={setBancarios} />

        <MapaCalorEstacional historico={historico} />

        <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" className={styles.primary} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar periodo'}
          </button>
          {guardado && <span style={{ fontSize: 13, color: '#27ae60' }}>Guardado ✓</span>}
        </div>
      </ModuleShell>
    </FeatureGate>
  )
}
