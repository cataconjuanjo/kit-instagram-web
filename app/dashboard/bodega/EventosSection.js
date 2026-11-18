'use client'

/**
 * EventosSection — Fase A. Alta y listado de eventos de bodega
 * (grupos y maridajes) por mes. Sección en /dashboard/bodega
 * detrás de la pestaña "Eventos".
 *
 * Reglas del dominio implementadas en app/lib/eventosBodega.js:
 *   - incluido_en_tpv=true → NO suma al canal (evita doble conteo).
 *   - El evento no modifica ventas_neto del cierre; se expone como
 *     canal propio en la hoja "Canales venta" del Excel.
 *
 * Si la tabla no existe (SQL pendiente), el endpoint devuelve 503
 * con `sql_pendiente:true` y la UI muestra un aviso claro.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import {
  TIPOS_EVENTO,
  MENU_TIPOS,
  netoDesdeBruto,
  sumarEventosPorTipo,
} from '../../lib/eventosBodega'

async function apiFetch(path, opts = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  return fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
}

function periodoHoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fechaHoy() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtEur(n) {
  if (!Number.isFinite(Number(n))) return '—'
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(n)) + ' €'
}

const INIT_FORM = {
  fecha: fechaHoy(),
  tipo: 'grupo',
  menu_tipo: '',
  menu_nombre: '',
  num_comensales: '',
  importe_bruto: '',
  iva_pct: '10',
  incluido_en_tpv: false,
  notas: '',
}

export default function EventosSection({ restauranteId }) {
  const [mes, setMes] = useState(periodoHoy())
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(false)
  const [sqlPendiente, setSqlPendiente] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(INIT_FORM)
  const [guardando, setGuardando] = useState(false)
  const [guardadoMsg, setGuardadoMsg] = useState('')

  const cargar = useCallback(async () => {
    if (!restauranteId || !mes) return
    setLoading(true); setError(''); setSqlPendiente(false)
    try {
      const res = await apiFetch(`/api/eventos-bodega?restaurante_id=${restauranteId}&mes=${mes}`)
      const json = await res.json().catch(() => ({}))
      if (res.status === 503 && json.sql_pendiente) {
        setSqlPendiente(true); setEventos([]); return
      }
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      setEventos(Array.isArray(json.eventos) ? json.eventos : [])
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los eventos.')
      setEventos([])
    } finally {
      setLoading(false)
    }
  }, [restauranteId, mes])

  useEffect(() => { cargar() }, [cargar])

  const totales = useMemo(() => sumarEventosPorTipo(eventos), [eventos])

  // Neto en vivo según bruto + IVA del form.
  const netoLive = useMemo(() => netoDesdeBruto(form.importe_bruto, form.iva_pct), [form.importe_bruto, form.iva_pct])

  async function crearEvento(e) {
    e.preventDefault()
    if (guardando) return
    setGuardando(true); setError(''); setGuardadoMsg('')
    try {
      const res = await apiFetch('/api/eventos-bodega', {
        method: 'POST',
        body: JSON.stringify({ restaurante_id: restauranteId, ...form }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 503 && json.sql_pendiente) {
        setSqlPendiente(true)
        return
      }
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      setGuardadoMsg('Evento guardado.')
      setForm(INIT_FORM)
      await cargar()
    } catch (e) {
      setError(e.message || 'No se pudo guardar el evento.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrarEvento(id) {
    if (!id) return
    if (!confirm('¿Borrar este evento?')) return
    try {
      const res = await apiFetch(`/api/eventos-bodega/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
      await cargar()
    } catch (e) {
      setError(e.message || 'No se pudo borrar.')
    }
  }

  if (sqlPendiente) {
    return (
      <div style={{ padding: 20, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8 }}>
        <h3 style={{ color: '#b15a00', marginBottom: 8, fontSize: 15, fontWeight: 700 }}>
          Eventos pendientes de activar
        </h3>
        <p style={{ fontSize: 13, color: '#8b6a1b', lineHeight: 1.5 }}>
          La tabla <code>eventos_bodega</code> todavía no está aplicada en Supabase. Para activarla, aplica la
          migración <code>supabase/migrations_pendientes/add_eventos_bodega.up.sql</code>. Una vez aplicada,
          podrás dar de alta aquí los maridajes y grupos del mes, y aparecerán en &ldquo;Canales venta&rdquo;
          del informe económico.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Cabecera: selector de mes */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: '#8b8278' }}>Mes</span>
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6 }}
          />
        </label>
        {loading && <span style={{ fontSize: 12, color: '#8b8278' }}>Cargando…</span>}
      </div>

      {/* Alta rápida */}
      <form onSubmit={crearEvento} style={{ marginBottom: 20, padding: '14px 16px', border: '1px solid rgba(26,26,26,0.12)', borderRadius: 8, background: '#fafaf8' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, color: '#444' }}>
          Nuevo evento
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8278' }}>Fecha</span>
            <input type="date" required value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8278' }}>Tipo</span>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6, background: '#fff' }}>
              {TIPOS_EVENTO.map(t => <option key={t} value={t}>{t === 'grupo' ? 'Grupo' : 'Maridaje'}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8278' }}>Menú</span>
            <select value={form.menu_tipo} onChange={e => setForm(f => ({ ...f, menu_tipo: e.target.value }))}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6, background: '#fff' }}>
              <option value="">— sin menú —</option>
              {MENU_TIPOS.map(m => <option key={m} value={m}>{m === 'rock' ? 'Rock' : m === 'premium' ? 'Premium' : 'Otro'}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8278' }}>Nombre del menú (opcional)</span>
            <input type="text" value={form.menu_nombre} onChange={e => setForm(f => ({ ...f, menu_nombre: e.target.value }))}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8278' }}>Comensales</span>
            <input type="number" min="0" step="1" value={form.num_comensales}
              onChange={e => setForm(f => ({ ...f, num_comensales: e.target.value }))}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8278' }}>Importe con IVA (€)</span>
            <input type="text" inputMode="decimal" value={form.importe_bruto}
              onChange={e => setForm(f => ({ ...f, importe_bruto: e.target.value }))}
              placeholder="0,00"
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6 }} />
            {netoLive !== null && (
              <small style={{ fontSize: 10.5, color: '#8b8278' }}>
                Neto estimado: <strong>{fmtEur(netoLive)}</strong>
              </small>
            )}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#8b8278' }}>IVA %</span>
            <input type="number" min="0" max="25" step="0.1" value={form.iva_pct}
              onChange={e => setForm(f => ({ ...f, iva_pct: e.target.value }))}
              style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6 }} />
          </label>
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10 }}>
          <input type="checkbox" checked={form.incluido_en_tpv}
            onChange={e => setForm(f => ({ ...f, incluido_en_tpv: e.target.checked }))}
            style={{ marginTop: 3 }} />
          <span style={{ fontSize: 12, color: '#444', lineHeight: 1.4 }}>
            <strong>Ya facturado por el TPV.</strong> Márcalo si la venta del evento ya entró por el webhook del
            TPV (Square u otro). El evento se registra aquí para dejar constancia del PAX/menú, pero
            <strong> no sumará como canal propio </strong>
            en el informe para evitar doble conteo.
          </span>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: '#8b8278' }}>Notas (opcional)</span>
          <textarea rows="2" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
            style={{ padding: '6px 10px', fontSize: 13, border: '1px solid #d8d3c8', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit' }} />
        </label>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button type="submit" disabled={guardando} style={{
            padding: '7px 16px', background: '#1a1a1a', color: '#fff', border: 'none',
            borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: guardando ? 'wait' : 'pointer',
          }}>
            {guardando ? 'Guardando…' : 'Añadir evento'}
          </button>
          {guardadoMsg && <span style={{ fontSize: 12, color: '#4a8c6f' }}>{guardadoMsg}</span>}
          {error && <span style={{ fontSize: 12, color: '#b85454' }}>{error}</span>}
        </div>
      </form>

      {/* Totales por tipo */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(26,26,26,0.12)', background: '#fff' }}>
          <div style={{ fontSize: 10.5, color: '#8b8278', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Grupos</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{totales.grupo.n} · {fmtEur(totales.grupo.importe_neto_total)}</div>
          <div style={{ fontSize: 11, color: '#8b8278', marginTop: 2 }}>PAX totales: {totales.grupo.comensales_total}</div>
        </div>
        <div style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(26,26,26,0.12)', background: '#fff' }}>
          <div style={{ fontSize: 10.5, color: '#8b8278', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Maridajes</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{totales.maridaje.n} · {fmtEur(totales.maridaje.importe_neto_total)}</div>
          <div style={{ fontSize: 11, color: '#8b8278', marginTop: 2 }}>Comensales: {totales.maridaje.comensales_total}</div>
        </div>
        <div style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(26,26,26,0.12)', background: '#fff' }}>
          <div style={{ fontSize: 10.5, color: '#8b8278', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Suma canal</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtEur(totales.ingresos_netos_para_canal)}</div>
          <div style={{ fontSize: 11, color: '#8b8278', marginTop: 2 }}>
            {totales.excluidos_tpv > 0
              ? `${totales.excluidos_tpv} evento(s) excluidos (ya TPV)`
              : 'Importes netos no incluidos en TPV'}
          </div>
        </div>
      </div>

      {/* Lista */}
      <div style={{ overflowX: 'auto', border: '1px solid rgba(26,26,26,0.08)', borderRadius: 8, background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f7f1e6', color: '#444' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Fecha</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Tipo</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Menú</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>PAX</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600 }}>Neto</th>
              <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 600 }}>TPV</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Notas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {eventos.length === 0 && !loading && (
              <tr><td colSpan={8} style={{ padding: '14px 10px', fontStyle: 'italic', color: '#8b8278', textAlign: 'center' }}>
                Sin eventos este mes.
              </td></tr>
            )}
            {eventos.map(ev => (
              <tr key={ev.id} style={{ borderTop: '1px solid #f0ebe0' }}>
                <td style={{ padding: '7px 10px' }}>{ev.fecha}</td>
                <td style={{ padding: '7px 10px', textTransform: 'capitalize' }}>{ev.tipo}</td>
                <td style={{ padding: '7px 10px' }}>
                  {ev.menu_nombre || (ev.menu_tipo ? `(${ev.menu_tipo})` : '—')}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right' }}>{ev.num_comensales ?? '—'}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right' }}>{fmtEur(ev.importe_neto)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center' }}>{ev.incluido_en_tpv ? '✓' : ''}</td>
                <td style={{ padding: '7px 10px', color: '#8b8278', fontSize: 12 }}>{ev.notas || ''}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                  <button type="button" onClick={() => borrarEvento(ev.id)}
                    style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #d8d3c8', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
