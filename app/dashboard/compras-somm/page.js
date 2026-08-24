'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatEur(n) {
  return (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function periodoActual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nombreMes(periodo) {
  const [anio, mes] = periodo.split('-')
  return `${MESES[parseInt(mes) - 1]} ${anio}`
}

// Genera los últimos 12 meses como opciones
function ultimosMeses(n = 12) {
  const meses = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const anio = d.getFullYear()
    const mes = String(d.getMonth() + 1).padStart(2, '0')
    meses.push(`${anio}-${mes}`)
    d.setMonth(d.getMonth() - 1)
  }
  return meses
}

// ── Formulario nueva factura ──────────────────────────────────────────────────

function FormFactura({ proveedores, onGuardar }) {
  const [form, setForm] = useState({
    proveedor: '',
    nuevoProveedor: '',
    periodo: periodoActual(),
    fecha: new Date().toISOString().slice(0, 10),
    importe: '',
    albaran: '',
  })
  const [guardando, setGuardando] = useState(false)

  const proveedorFinal = form.proveedor === '__nuevo__' ? form.nuevoProveedor.trim() : form.proveedor

  async function handleSubmit(e) {
    e.preventDefault()
    if (!proveedorFinal || !form.importe) return
    setGuardando(true)
    await onGuardar({
      proveedor: proveedorFinal,
      periodo: form.periodo,
      factura: { fecha: form.fecha, importe: parseFloat(form.importe), albaran: form.albaran },
    })
    setForm(f => ({ ...f, importe: '', albaran: '', fecha: new Date().toISOString().slice(0, 10) }))
    setGuardando(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr auto', gap: 10, alignItems: 'end' }}>
      <div>
        <div style={labelS}>Proveedor</div>
        <select
          value={form.proveedor}
          onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
          required
          style={inputS}
        >
          <option value="">Seleccionar o añadir...</option>
          {proveedores.map(p => <option key={p} value={p}>{p}</option>)}
          <option value="__nuevo__">+ Nuevo proveedor</option>
        </select>
        {form.proveedor === '__nuevo__' && (
          <input
            value={form.nuevoProveedor}
            onChange={e => setForm(f => ({ ...f, nuevoProveedor: e.target.value }))}
            placeholder="Nombre del proveedor..."
            required
            style={{ ...inputS, marginTop: 6 }}
          />
        )}
      </div>
      <div>
        <div style={labelS}>Periodo</div>
        <select value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} style={inputS}>
          {ultimosMeses().map(p => <option key={p} value={p}>{nombreMes(p)}</option>)}
        </select>
      </div>
      <div>
        <div style={labelS}>Fecha factura</div>
        <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={inputS} />
      </div>
      <div>
        <div style={labelS}>Importe (€)</div>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form.importe}
          onChange={e => setForm(f => ({ ...f, importe: e.target.value }))}
          placeholder="0.00"
          required
          style={inputS}
        />
      </div>
      <div>
        <div style={labelS}>Albarán / Referencia</div>
        <input
          type="text"
          value={form.albaran}
          onChange={e => setForm(f => ({ ...f, albaran: e.target.value }))}
          placeholder="FAC-2026-001..."
          style={inputS}
        />
      </div>
      <button
        type="submit"
        disabled={guardando || !proveedorFinal || !form.importe}
        style={{
          padding: '9px 18px',
          background: guardando || !proveedorFinal || !form.importe ? '#ccc' : '#1a1a1a',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {guardando ? 'Guardando...' : 'Añadir factura'}
      </button>
    </form>
  )
}

// ── Tabla de facturas del periodo ─────────────────────────────────────────────

function TablaFacturas({ registros, periodoFiltro, onEliminarFactura }) {
  const filtrados = registros.filter(r => r.periodo === periodoFiltro)
  if (filtrados.length === 0) return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
      Sin facturas registradas para {nombreMes(periodoFiltro)}.
    </div>
  )

  const filas = filtrados.flatMap(r =>
    (r.facturas || []).map((f, fi) => ({ ...f, proveedor: r.proveedor, registroId: r.id, fi }))
  ).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#faf8f4' }}>
            {['Fecha', 'Proveedor', 'Importe', 'Albarán / Ref.', ''].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: '0.05em', borderBottom: '2px solid #e8e3d8' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f0ece4' }}>
              <td style={tdS}>{f.fecha || '—'}</td>
              <td style={tdS}><strong>{f.proveedor}</strong></td>
              <td style={{ ...tdS, fontWeight: 600 }}>{formatEur(f.importe)}</td>
              <td style={{ ...tdS, color: '#888' }}>{f.albaran || '—'}</td>
              <td style={{ ...tdS, textAlign: 'right' }}>
                <button
                  onClick={() => onEliminarFactura(f.registroId, f.fi)}
                  style={{ padding: '3px 8px', fontSize: 11, border: '1px solid #e8e3d8', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#888' }}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#faf8f4' }}>
            <td colSpan={2} style={{ ...tdS, fontWeight: 700, fontSize: 13 }}>Total {nombreMes(periodoFiltro)}</td>
            <td style={{ ...tdS, fontWeight: 700, fontSize: 15 }}>{formatEur(filas.reduce((s, f) => s + (f.importe || 0), 0))}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Concentración de proveedores ──────────────────────────────────────────────

function ConcentracionProveedores({ registros, anioFiltro }) {
  const resumen = useMemo(() => {
    const porProveedor = {}
    registros.forEach(r => {
      if (!r.periodo?.startsWith(String(anioFiltro))) return
      const total = (r.facturas || []).reduce((s, f) => s + (f.importe || 0), 0)
      porProveedor[r.proveedor] = (porProveedor[r.proveedor] || 0) + total
    })
    const total = Object.values(porProveedor).reduce((s, v) => s + v, 0)
    return Object.entries(porProveedor)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([proveedor, importe]) => ({
        proveedor,
        importe,
        pct: total > 0 ? (importe / total) * 100 : 0,
        alerta: total > 0 && (importe / total) > 0.25,
      }))
  }, [registros, anioFiltro])

  const totalAnio = resumen.reduce((s, r) => s + r.importe, 0)

  if (resumen.length === 0) return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
      Sin datos de compras para {anioFiltro}.
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: '#555' }}>
        Gasto total {anioFiltro}: <strong>{formatEur(totalAnio)}</strong>
      </div>
      {resumen.map((r, i) => (
        <div key={r.proveedor} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#aaa', width: 20 }}>#{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: r.alerta ? 700 : 500, color: r.alerta ? '#e74c3c' : '#1a1a1a' }}>{r.proveedor}</span>
              {r.alerta && (
                <span style={{ fontSize: 10, background: '#fdecea', color: '#e74c3c', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                  ⚠ Concentración &gt;25%
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <span style={{ color: '#666' }}>{r.pct.toFixed(1)}%</span>
              <span style={{ fontWeight: 600 }}>{formatEur(r.importe)}</span>
            </div>
          </div>
          <div style={{ height: 6, background: '#f0ece4', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(r.pct, 100)}%`,
              background: r.alerta ? '#e74c3c' : r.pct > 15 ? '#e67e22' : '#27ae60',
              borderRadius: 3,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ComprasSomm() {
  const [restaurante, setRestaurante] = useState(null)
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodoFiltro, setPeriodoFiltro] = useState(periodoActual())
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear())
  const [tab, setTab] = useState('facturas')

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }
      const consulta = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await consulta.eq('id', restauranteId).single()
        : await consulta.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        await cargarRegistros(rest.id)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function cargarRegistros(restId) {
    const { data } = await supabase
      .from('libro_compras')
      .select('id, proveedor, periodo, facturas, importe_total')
      .eq('restaurante_id', restId)
      .order('periodo', { ascending: false })
    setRegistros(data || [])
  }

  async function handleGuardarFactura({ proveedor, periodo, factura }) {
    const existente = registros.find(r => r.proveedor === proveedor && r.periodo === periodo)
    if (existente) {
      const nuevasFacturas = [...(existente.facturas || []), factura]
      await supabase
        .from('libro_compras')
        .update({ facturas: nuevasFacturas })
        .eq('id', existente.id)
    } else {
      await supabase.from('libro_compras').insert({
        restaurante_id: restaurante.id,
        proveedor,
        periodo,
        facturas: [factura],
      })
    }
    await cargarRegistros(restaurante.id)
  }

  async function handleEliminarFactura(registroId, indiceFactura) {
    const reg = registros.find(r => r.id === registroId)
    if (!reg) return
    const nuevasFacturas = (reg.facturas || []).filter((_, i) => i !== indiceFactura)
    if (nuevasFacturas.length === 0) {
      await supabase.from('libro_compras').delete().eq('id', registroId)
    } else {
      await supabase.from('libro_compras').update({ facturas: nuevasFacturas }).eq('id', registroId)
    }
    await cargarRegistros(restaurante.id)
  }

  const proveedores = [...new Set(registros.map(r => r.proveedor))].sort()

  const aniosDisponibles = [...new Set(
    registros.map(r => parseInt(r.periodo?.slice(0, 4))).filter(Boolean)
  )].sort((a, b) => b - a)
  if (!aniosDisponibles.includes(new Date().getFullYear())) {
    aniosDisponibles.unshift(new Date().getFullYear())
  }

  if (loading) return <LoadingState />

  return (
    <FeatureGate restaurante={restaurante} feature="somm_libro_compras" title="Libro de Compras no incluido">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Carta Viva Somm"
        title="Libro de Compras"
        subtitle="Registra facturas por proveedor, analiza la concentración de gasto y detecta dependencias."
        help={{
          title: 'Libro de Compras',
          intro: 'Un registro estructurado de compras por proveedor y mes para controlar el gasto en bodega.',
          items: [
            { title: 'Añade facturas', text: 'Registra cada factura con su proveedor, fecha e importe. El albarán es opcional.' },
            { title: 'Analiza concentración', text: 'La pestaña de concentración muestra qué proveedores acumulan mayor % del gasto anual.' },
            { title: 'Alerta >25%', text: 'Si un proveedor supera el 25% del gasto anual, aparece alerta de concentración de riesgo.' },
          ],
        }}
      >
        {/* Formulario nueva factura */}
        <div style={{ padding: 20, background: '#faf8f4', borderRadius: 8, border: '1px solid #e8e3d8', marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' }}>Nueva factura</div>
          <FormFactura proveedores={proveedores} onGuardar={handleGuardarFactura} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e8e3d8', marginBottom: 24 }}>
          {[
            { id: 'facturas', label: 'Facturas por periodo' },
            { id: 'concentracion', label: 'Concentración proveedores' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid #1a1a1a' : '2px solid transparent',
                background: 'none',
                fontSize: 13,
                fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? '#1a1a1a' : '#888',
                cursor: 'pointer',
                marginBottom: -2,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Facturas */}
        {tab === 'facturas' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {ultimosMeses().map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodoFiltro(p)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 20,
                    border: '1px solid #e8e3d8',
                    background: periodoFiltro === p ? '#1a1a1a' : 'transparent',
                    color: periodoFiltro === p ? '#fff' : '#555',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: periodoFiltro === p ? 600 : 400,
                  }}
                >
                  {nombreMes(p)}
                </button>
              ))}
            </div>
            <TablaFacturas
              registros={registros}
              periodoFiltro={periodoFiltro}
              onEliminarFactura={handleEliminarFactura}
            />
          </div>
        )}

        {/* Tab: Concentración */}
        {tab === 'concentracion' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              {aniosDisponibles.map(a => (
                <button
                  key={a}
                  onClick={() => setAnioFiltro(a)}
                  style={{
                    padding: '5px 14px',
                    borderRadius: 20,
                    border: '1px solid #e8e3d8',
                    background: anioFiltro === a ? '#1a1a1a' : 'transparent',
                    color: anioFiltro === a ? '#fff' : '#555',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: anioFiltro === a ? 600 : 400,
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
            <ConcentracionProveedores registros={registros} anioFiltro={anioFiltro} />
          </div>
        )}
      </ModuleShell>
    </FeatureGate>
  )
}

const inputS = { width: '100%', padding: '8px 10px', border: '1px solid #d8d3c8', borderRadius: 6, fontSize: 13, background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }
const labelS = { fontSize: 11, color: '#666', fontWeight: 500, marginBottom: 4 }
const tdS = { padding: '10px 12px', verticalAlign: 'middle', fontSize: 13, color: '#1a1a1a' }
