'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../supabase'
import { exportarCSV } from '../../lib/libroBodega'
import styles from '../module.module.css'
import bStyles from './bodega.module.css'
import { GraficoMermaImplicita } from '../somm-graficos/GraficoMermaImplicita'

const EUR = n => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '€'
const N   = n => String(Math.round(Number(n) || 0))

function BadgeEstado({ estado }) {
  const base = { display: 'inline-block', padding: '1px 7px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.02em' }
  const color = estado === 'cerrado'
    ? { background: 'var(--c-success-bg, #e6f4ea)', color: 'var(--c-success, #1e7e34)' }
    : { background: 'var(--c-warn-bg, #fff3cd)',    color: 'var(--c-warn, #856404)' }
  return <span style={{ ...base, ...color }}>{estado === 'cerrado' ? 'cerrado' : 'estimado'}</span>
}

export default function LibroBodegaTable({ restauranteId }) {
  const [anio,       setAnio]       = useState(new Date().getFullYear())
  const [filtroMes,  setFiltroMes]  = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  const cargar = useCallback(async () => {
    if (!restauranteId) return
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const params = new URLSearchParams({ restaurante_id: restauranteId, anio: String(anio) })
      const res = await fetch(`/api/libro-bodega?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cargar')
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [restauranteId, anio])

  useEffect(() => { cargar() }, [cargar])

  const handleExportCSV = () => {
    if (!data) return
    const csv  = exportarCSV(data.meses)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `libro-bodega-${anio}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const meses = data?.meses ?? []
  // Solo listar en el selector los meses que tienen datos
  const mesesConDatos   = meses.filter(m => m.vinos.length > 0)
  const mesesFiltrados  = meses.filter(m => !filtroMes || m.mes === filtroMes)

  const tiposDisponibles = [...new Set(
    meses.flatMap(m => m.vinos.map(v => v.tipo)).filter(Boolean)
  )].sort()

  return (
    <div>
      {/* ── Barra de herramientas ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <select
          className={bStyles.catalogoSelect}
          value={String(anio)}
          onChange={e => setAnio(Number(e.target.value))}
        >
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          className={bStyles.catalogoSelect}
          value={filtroMes}
          onChange={e => setFiltroMes(e.target.value)}
        >
          <option value="">Todos los meses</option>
          {mesesConDatos.map(m => (
            <option key={m.mes} value={m.mes}>{m.mes}</option>
          ))}
        </select>
        <select
          className={bStyles.catalogoSelect}
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {tiposDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          type="button"
          className={styles.ghost}
          onClick={handleExportCSV}
          disabled={!data || loading}
          style={{ marginLeft: 'auto' }}
        >
          Exportar CSV
        </button>
      </div>

      {loading && <p style={{ color: 'var(--c-muted, #888)', padding: '24px 0' }}>Cargando libro…</p>}
      {error   && <p style={{ color: 'var(--c-error, #c00)', padding: '24px 0' }}>{error}</p>}

      {!loading && mesesFiltrados.map(mes => {
        const vinosFiltrados = mes.vinos.filter(v => !filtroTipo || v.tipo === filtroTipo)
        if (vinosFiltrados.length === 0) return null
        return (
          <div key={mes.mes} style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{mes.mes}</h3>
              <BadgeEstado estado={mes.estado} />
            </div>
            <div className={bStyles.cellarTableWrap}>
              <table className={bStyles.cellarTable} style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>Vino</th>
                    <th>Tipo</th>
                    <th title="Stock al inicio del mes">Ini</th>
                    <th title="Entradas (unidades)">Ent.u</th>
                    <th title="Entradas (€ neto)">Ent.€</th>
                    <th title="Ventas botella unidades">Bot.u</th>
                    <th title="Ventas botella € neto">Bot.€</th>
                    <th title="Botellas abiertas para copa (impacto en stock)">Copa.bot</th>
                    <th title="Copas servidas (ingresos)">Copa.cop</th>
                    <th title="Ventas copa € neto">Copa.€</th>
                    <th title="Otras salidas (merma, cata, invitación…)">Otras</th>
                    <th title="Ajustes de inventario">Aj.</th>
                    <th title="Stock fin de mes">Fin</th>
                    <th title="(a) Coste teórico de ventas = (bot + bot_copa) × coste_medio">CoGS€</th>
                    <th title="(b) Consumo real por stock = BI_valor + compras − EI_valor">Consumo€</th>
                    <th title="(c) Merma implícita / diferencia (b − a)">ΔCoGS€</th>
                    <th title="Descuadre respecto a stock_mensual_bodega (0 = cuadra)">Δu</th>
                  </tr>
                </thead>
                <tbody>
                  {vinosFiltrados.map(v => (
                    <tr key={v.vino_id} style={v.descuadre !== 0 ? { background: 'var(--c-warn-bg-light, #fff8e1)' } : {}}>
                      <td title={v.nombre} style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.nombre}
                      </td>
                      <td>{v.tipo ?? '—'}</td>
                      <td>{v.stock_ini ?? '—'}</td>
                      <td>{N(v.entradas_u)}</td>
                      <td>{EUR(v.entradas_eur)}</td>
                      <td>{N(v.ventas_bot_u)}</td>
                      <td>{EUR(v.ventas_bot_eur)}</td>
                      <td>{N(v.ventas_copa_u)}</td>
                      <td>{N(v.copas_servidas_u)}</td>
                      <td>{EUR(v.ventas_copa_eur)}</td>
                      <td>{N(v.otras_salidas_u)}</td>
                      <td>{v.ajustes_u !== 0 ? (v.ajustes_u > 0 ? `+${v.ajustes_u}` : v.ajustes_u) : '—'}</td>
                      <td>{v.stock_fin ?? '—'}</td>
                      <td>{EUR(v.coste_teorico_ventas)}</td>
                      <td>{EUR(v.consumo_real_stock)}</td>
                      <td title="Merma implícita = (b)−(a)" style={{ color: 'var(--c-muted, #888)' }}>
                        {v.diferencia_consumo !== 0 ? EUR(v.diferencia_consumo) : '—'}
                      </td>
                      <td style={v.descuadre !== 0 ? { color: 'var(--c-error, #b00)', fontWeight: 600 } : { color: 'var(--c-muted, #888)' }}>
                        {v.descuadre !== 0 ? (v.descuadre > 0 ? `+${v.descuadre}` : v.descuadre) : '✓'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, background: 'var(--c-surface-2, #f5f5f5)' }}>
                    <td colSpan={2}>TOTAL {filtroTipo || 'todos'}</td>
                    <td>{N(mes.totales.stock_ini)}</td>
                    <td>{N(mes.totales.entradas_u)}</td>
                    <td>{EUR(mes.totales.entradas_eur)}</td>
                    <td>{N(mes.totales.ventas_bot_u)}</td>
                    <td>{EUR(mes.totales.ventas_bot_eur)}</td>
                    <td>{N(mes.totales.ventas_copa_u)}</td>
                    <td>{N(mes.totales.copas_servidas_u)}</td>
                    <td>{EUR(mes.totales.ventas_copa_eur)}</td>
                    <td>{N(mes.totales.otras_salidas_u)}</td>
                    <td>—</td>
                    <td>{N(mes.totales.stock_fin)}</td>
                    <td>{EUR(mes.totales.coste_teorico_ventas)}</td>
                    <td>{EUR(mes.totales.consumo_real_stock)}</td>
                    <td>{EUR(mes.totales.diferencia_consumo)}</td>
                    <td>—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}

      {restauranteId && !loading && (
        <GraficoMermaImplicita restauranteId={restauranteId} anio={anio} enabled />
      )}
    </div>
  )
}
