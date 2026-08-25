'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { calcularPmp, kpiStockVentas } from '../../lib/sommExplotacion'

const ZONAS = ['todas', 'Sin zona', 'Almacen', 'Cava1', 'Cava2', 'Cava3']

const TIPOS_SALIDA = [
  { value: 'merma', label: 'Merma' },
  { value: 'cata', label: 'Cata interna' },
  { value: 'invitacion', label: 'Invitación' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'grupo_evento', label: 'Grupo / Evento' },
  { value: 'maridaje', label: 'Maridaje' },
  { value: 'rotura', label: 'Rotura' },
  { value: 'ajuste', label: 'Ajuste' },
]

function formatEur(n) {
  return (n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export default function SommStockSection({ restauranteId }) {
  const [vinosSomm, setVinosSomm] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [facturacionMes, setFacturacionMes] = useState(0)
  const [zonaFiltro, setZonaFiltro] = useState('todas')
  const [ubicacionEdit, setUbicacionEdit] = useState(null)
  const [movForm, setMovForm] = useState({ vino_id: '', tipo: 'merma', cantidad: 1, motivo: '' })
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargarDatos() }, [restauranteId])

  async function cargarDatos() {
    setCargando(true)
    const ahora = new Date()
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()

    const [{ data: vs }, { data: movs }, { data: hist }] = await Promise.all([
      supabase
        .from('vinos')
        .select('id, nombre, bodega, tipo, coste_compra, stock, precio_botella, precio_copa, formato_compra, zona_bodega, balda_codigo, usa_coravin')
        .eq('restaurante_id', restauranteId)
        .eq('activo', true)
        .order('nombre'),
      supabase
        .from('movimientos_stock')
        .select('id, vino_id, tipo, cantidad, coste_medio_ponderado, created_at')
        .eq('restaurante_id', restauranteId)
        .gte('created_at', inicioMes)
        .order('created_at'),
      supabase
        .from('historico_mensual')
        .select('ingresos')
        .eq('restaurante_id', restauranteId)
        .eq('anio', ahora.getFullYear())
        .eq('mes', ahora.getMonth() + 1)
        .maybeSingle(),
    ])

    setVinosSomm(vs || [])
    setMovimientos(movs || [])
    setFacturacionMes(hist?.ingresos || 0)
    setCargando(false)
  }

  function calcularPmpVino(vino, movs) {
    const movVino = movs.filter(m => m.vino_id === vino.id && m.tipo === 'entrada')
    const entradasCoste = movVino.reduce((sum, m) => {
      const cu = m.coste_medio_ponderado || vino.coste_compra || 0
      return sum + m.cantidad * cu
    }, 0)
    const entradasUds = movVino.reduce((sum, m) => sum + m.cantidad, 0)
    const stockInicial = Math.max(0, (vino.stock || 0) - entradasUds)
    const stockInicialValor = stockInicial * (vino.coste_compra || 0)
    return calcularPmp(stockInicialValor, entradasCoste, vino.stock || 0)
  }

  const valorStockTotal = vinosSomm.reduce(
    (sum, v) => sum + (v.stock || 0) * (v.coste_compra || 0),
    0,
  )
  const kpi = kpiStockVentas(valorStockTotal, facturacionMes)

  const vinosFiltrados = zonaFiltro === 'todas'
    ? vinosSomm
    : vinosSomm.filter(v => (v.zona_bodega || 'Sin zona') === zonaFiltro)

  async function guardarMovimiento() {
    if (!movForm.vino_id || movForm.cantidad < 1) return
    const vino = vinosSomm.find(v => v.id === movForm.vino_id)
    if (!vino) return
    setGuardando(true)
    const stockNuevo = Math.max(0, (vino.stock || 0) - Number(movForm.cantidad))
    await Promise.all([
      supabase.from('movimientos_stock').insert({
        restaurante_id: restauranteId,
        vino_id: movForm.vino_id,
        tipo: movForm.tipo,
        cantidad: Number(movForm.cantidad),
        stock_anterior: vino.stock,
        stock_nuevo: stockNuevo,
        motivo: movForm.motivo || null,
        coste_medio_ponderado: vino.coste_compra || null,
      }),
      supabase.from('vinos').update({ stock: stockNuevo }).eq('id', movForm.vino_id),
    ])
    setMovForm({ vino_id: '', tipo: 'merma', cantidad: 1, motivo: '' })
    setGuardando(false)
    cargarDatos()
  }

  async function guardarUbicacion() {
    if (!ubicacionEdit) return
    setGuardando(true)
    await supabase
      .from('vinos')
      .update({ zona_bodega: ubicacionEdit.zona_bodega || null, balda_codigo: ubicacionEdit.balda_codigo || null })
      .eq('id', ubicacionEdit.id)
    setVinosSomm(prev =>
      prev.map(v => v.id === ubicacionEdit.id
        ? { ...v, zona_bodega: ubicacionEdit.zona_bodega, balda_codigo: ubicacionEdit.balda_codigo }
        : v,
      ),
    )
    setUbicacionEdit(null)
    setGuardando(false)
  }

  const semaforoColor = {
    verde: '#27ae60',
    amarillo: '#e67e22',
    rojo: '#e74c3c',
    neutral: '#888',
  }[kpi.semaforo]

  if (cargando) return <div className="admin-loading">Cargando datos Somm</div>

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 12, borderBottom: '2px solid #e8e3d8' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888' }}>Stock Avanzado Somm</span>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div style={cardStyle}>
          <div style={cardLabel}>Valor stock bodega</div>
          <div style={cardValue}>{formatEur(valorStockTotal)}</div>
        </div>
        <div style={{ ...cardStyle, borderLeft: `3px solid ${semaforoColor}` }}>
          <div style={cardLabel}>Stock / Facturación mes</div>
          <div style={{ ...cardValue, color: semaforoColor }}>
            {kpi.pct !== null ? `${kpi.pct.toFixed(1)} %` : facturacionMes === 0 ? 'Sin facturación' : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
            Verde &lt;30% · Amarillo 30-45% · Rojo &gt;45%
          </div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Refs en bodega</div>
          <div style={cardValue}>{vinosSomm.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={cardLabel}>Salidas este mes</div>
          <div style={cardValue}>{movimientos.filter(m => m.tipo !== 'entrada').length}</div>
        </div>
      </div>

      {/* Filtro zona */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ZONAS.map(z => {
          const count = z === 'todas'
            ? vinosSomm.length
            : vinosSomm.filter(v => (v.zona_bodega || 'Sin zona') === z).length
          return (
            <button
              key={z}
              onClick={() => setZonaFiltro(z)}
              style={{
                padding: '5px 14px',
                borderRadius: 20,
                border: '1px solid #e8e3d8',
                background: zonaFiltro === z ? '#1a1a1a' : 'transparent',
                color: zonaFiltro === z ? '#fff' : '#555',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: zonaFiltro === z ? 600 : 400,
              }}
            >
              {z} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Tabla PMP + ubicación */}
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#faf8f4' }}>
              {['Vino', 'Stock', 'Coste reg.', 'PMP mes', 'Zona', 'Balda', ''].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#888', letterSpacing: '0.05em', borderBottom: '2px solid #e8e3d8', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vinosFiltrados.map(v => {
              const pmp = calcularPmpVino(v, movimientos)
              const enEdicion = ubicacionEdit?.id === v.id
              const delta = pmp > 0 && v.coste_compra ? pmp - v.coste_compra : null
              return (
                <tr key={v.id} style={{ borderBottom: '1px solid #f0ece4' }}>
                  <td style={tdStyle}>
                    <strong style={{ fontSize: 13 }}>{v.nombre}</strong>
                    <br />
                    <span style={{ fontSize: 11, color: '#888' }}>{v.bodega}</span>
                    {v.usa_coravin && <span style={{ marginLeft: 6, fontSize: 10, background: '#f5f0e8', color: '#8a6d3b', padding: '1px 6px', borderRadius: 10 }}>Coravin</span>}
                  </td>
                  <td style={tdStyle}>{v.stock ?? 0} ud</td>
                  <td style={tdStyle}>{v.coste_compra ? `${v.coste_compra.toFixed(2)} €` : '—'}</td>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500, color: pmp > 0 ? '#1a1a1a' : '#bbb' }}>
                      {pmp > 0 ? `${pmp.toFixed(2)} €` : '—'}
                    </span>
                    {delta !== null && Math.abs(delta) > 0.01 && (
                      <span style={{ fontSize: 11, marginLeft: 4, color: delta > 0 ? '#e74c3c' : '#27ae60' }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {enEdicion ? (
                      <select
                        value={ubicacionEdit.zona_bodega || ''}
                        onChange={e => setUbicacionEdit(u => ({ ...u, zona_bodega: e.target.value }))}
                        style={inputStyle}
                      >
                        <option value="">Sin zona</option>
                        <option value="Almacen">Almacén</option>
                        <option value="Cava1">Cava 1</option>
                        <option value="Cava2">Cava 2</option>
                        <option value="Cava3">Cava 3</option>
                      </select>
                    ) : (
                      <span style={{ color: v.zona_bodega ? '#1a1a1a' : '#bbb' }}>{v.zona_bodega || 'Sin zona'}</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {enEdicion ? (
                      <input
                        value={ubicacionEdit.balda_codigo || ''}
                        onChange={e => setUbicacionEdit(u => ({ ...u, balda_codigo: e.target.value }))}
                        placeholder="A-3..."
                        style={{ ...inputStyle, width: 80 }}
                      />
                    ) : (
                      <span style={{ color: v.balda_codigo ? '#1a1a1a' : '#bbb' }}>{v.balda_codigo || '—'}</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {enEdicion ? (
                      <>
                        <button onClick={guardarUbicacion} disabled={guardando} style={btnSave}>Guardar</button>
                        <button onClick={() => setUbicacionEdit(null)} style={btnCancel}>✕</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setUbicacionEdit({ id: v.id, zona_bodega: v.zona_bodega, balda_codigo: v.balda_codigo })}
                        style={btnEdit}
                      >
                        Ubicar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {vinosFiltrados.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  Sin vinos en esta zona
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Formulario salida ampliado */}
      <div style={{ padding: 20, background: '#faf8f4', borderRadius: 8, border: '1px solid #e8e3d8' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: '#1a1a1a' }}>Registrar salida (tipos ampliados)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 2fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={labelStyle}>Vino</div>
            <select
              value={movForm.vino_id}
              onChange={e => setMovForm(f => ({ ...f, vino_id: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Seleccionar...</option>
              {vinosSomm.map(v => (
                <option key={v.id} value={v.id}>{v.nombre} · {v.stock ?? 0} ud</option>
              ))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Tipo</div>
            <select
              value={movForm.tipo}
              onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}
              style={inputStyle}
            >
              {TIPOS_SALIDA.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Uds.</div>
            <input
              type="number"
              min="1"
              value={movForm.cantidad}
              onChange={e => setMovForm(f => ({ ...f, cantidad: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={labelStyle}>Motivo (opcional)</div>
            <input
              type="text"
              value={movForm.motivo}
              onChange={e => setMovForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="Ej: evento grupo 15 pax..."
              style={inputStyle}
            />
          </div>
          <button
            onClick={guardarMovimiento}
            disabled={guardando || !movForm.vino_id}
            style={{
              padding: '9px 18px',
              background: guardando || !movForm.vino_id ? '#ccc' : '#1a1a1a',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: guardando || !movForm.vino_id ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {guardando ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #e8e3d8',
  borderRadius: 8,
  padding: '14px 16px',
}
const cardLabel = { fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }
const cardValue = { fontSize: 22, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.2 }
const tdStyle = { padding: '10px 12px', verticalAlign: 'middle', fontSize: 13, color: '#1a1a1a' }
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #d8d3c8', borderRadius: 6, fontSize: 13, background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }
const labelStyle = { fontSize: 11, color: '#666', fontWeight: 500, marginBottom: 4 }
const btnEdit = { padding: '4px 10px', fontSize: 12, border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#555' }
const btnSave = { padding: '4px 10px', fontSize: 12, border: 'none', borderRadius: 4, background: '#1a1a1a', color: '#fff', cursor: 'pointer', marginRight: 4 }
const btnCancel = { padding: '4px 8px', fontSize: 12, border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#888' }
