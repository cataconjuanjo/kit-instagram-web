'use client'

import { useEffect, useMemo, useState } from 'react'
import { getEffectiveRestaurantEmail } from '../../demo'
import {
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
  SELECT_CLIENT_VINO_DASHBOARD,
} from '../../lib/clientSupabaseSelects'
import { supabase } from '../../supabase'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import styles from '../module.module.css'
import { redondear, anadirIva } from '../../lib/wineEconomics'
import { normalizarAjustesPrecios, calcularPreciosSugeridos } from '../../lib/pricingUtils'
import {
  PLANTILLAS_TRAMOS,
  calcularPvpConTramos,
  calcularPvpConDescorche,
  factorDescorchePorCoste,
  copasEstandarPorFormato,
  pvpCopaDesBotella,
  rentabilidadSobreCoste,
  factorMultiplicadorImplicito,
  impactoSubidaPrecio,
  impactoTotalSeleccion,
  diferencialCopaVsBotella,
} from '../../lib/sommPricing'

const TABS = [
  { id: 'simulador', label: 'Simulador multiplicador' },
  { id: 'tramos', label: 'Tramos de precio' },
  { id: 'metodo', label: 'Método PVP' },
  { id: 'previz', label: 'Previsualización' },
  { id: 'whatif', label: 'What-If' },
]

const PERIODO_HOY = (() => {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
})()

function eur(v, dec = 2) {
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

// ── Simulador de Multiplicador ───────────────────────────────────────────────

function SimuladorMultiplicador({ restauranteId, ivaVentaPct }) {
  const camposGastos = [
    { key: 'personal_bodega', label: 'Personal asignado a bodega' },
    { key: 'roturas_mermas', label: 'Roturas, mermas e invitaciones' },
    { key: 'materiales', label: 'Materiales (copas, sacacorchos…)' },
    { key: 'suministros', label: 'Suministros y mantenimiento' },
    { key: 'alquiler_proporcional', label: 'Alquiler proporcional bodega' },
    { key: 'otros', label: 'Otros / vino inmovilizado' },
  ]

  const [form, setForm] = useState({
    personal_bodega: '',
    roturas_mermas: '',
    materiales: '',
    suministros: '',
    alquiler_proporcional: '',
    otros: '',
    beneficio_objetivo: '',
    ventas_previstas: '',
  })
  const [guardado, setGuardado] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('parametros_explotacion')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .eq('periodo', PERIODO_HOY)
        .maybeSingle()
      if (data) {
        setForm({
          personal_bodega: data.nominas_brutas || '',
          roturas_mermas: data.ss_empresa || '',
          materiales: data.retenciones_irpf || '',
          suministros: data.extras_personal || '',
          alquiler_proporcional: data.alquiler_proporcional || '',
          otros: data.otros || '',
          beneficio_objetivo: data.beneficio_objetivo || '',
          ventas_previstas: data.ventas_previstas || '',
        })
      }
    }
    if (restauranteId) cargar()
  }, [restauranteId])

  const totalGastos = useMemo(() => {
    return camposGastos.reduce((s, c) => s + num(form[c.key]), 0)
  }, [form])

  const multiplicador = useMemo(() => {
    const ventas = num(form.ventas_previstas)
    if (!ventas) return null
    const margenNecesario = (totalGastos + num(form.beneficio_objetivo)) / ventas
    if (margenNecesario >= 1) return null
    return redondear(1 / (1 - margenNecesario), 3)
  }, [form, totalGastos])

  const pctMargen = multiplicador ? redondear((1 - 1 / multiplicador) * 100, 1) : null

  async function guardar() {
    setGuardando(true)
    await supabase.from('parametros_explotacion').upsert({
      restaurante_id: restauranteId,
      periodo: PERIODO_HOY,
      beneficio_objetivo: num(form.beneficio_objetivo),
      ventas_previstas: num(form.ventas_previstas),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'restaurante_id,periodo' })
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Simulador de Multiplicador</h2>
        <p className={styles.panelSub}>Calcula el multiplicador que necesitas para cubrir tus costes y alcanzar tu objetivo de beneficio.</p>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.formGrid}>
          {camposGastos.map(({ key, label }) => (
            <label key={key} className={styles.label}>
              {label}
              <input
                className={styles.input}
                type="number"
                min="0"
                step="10"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder="0 €"
              />
            </label>
          ))}
        </div>

        <div style={{ margin: '16px 0', padding: '12px 16px', background: 'var(--panel-bg, #f7f5f0)', borderRadius: 4 }}>
          <strong>Total gastos fijos: {eur(totalGastos)}</strong>
        </div>

        <div className={styles.formGrid}>
          <label className={styles.label}>
            Beneficio neto objetivo (€/mes)
            <input
              className={styles.input}
              type="number"
              min="0"
              step="100"
              value={form.beneficio_objetivo}
              onChange={e => setForm(f => ({ ...f, beneficio_objetivo: e.target.value }))}
              placeholder="0 €"
            />
          </label>
          <label className={styles.label}>
            Ventas previstas (€/mes)
            <input
              className={styles.input}
              type="number"
              min="0"
              step="1000"
              value={form.ventas_previstas}
              onChange={e => setForm(f => ({ ...f, ventas_previstas: e.target.value }))}
              placeholder="0 €"
            />
          </label>
        </div>

        {multiplicador !== null && (
          <div className={styles.statsGrid} style={{ marginTop: 20 }}>
            <StatCard
              value={`×${multiplicador}`}
              label="Multiplicador necesario"
              hint={`Para cubrir ${eur(totalGastos + num(form.beneficio_objetivo))} con ${eur(num(form.ventas_previstas))} de ventas`}
            />
            <StatCard
              value={pct(pctMargen)}
              label="Margen sobre ventas objetivo"
              hint="Porcentaje que necesitas conservar tras el coste del vino"
            />
            <StatCard
              value={eur(totalGastos + num(form.beneficio_objetivo))}
              label="Cobertura necesaria"
              hint="Gastos fijos + beneficio objetivo"
            />
          </div>
        )}

        {multiplicador === null && num(form.ventas_previstas) > 0 && (
          <p style={{ color: '#c0392b', marginTop: 12 }}>
            Los gastos + beneficio superan las ventas previstas. Revisa los valores.
          </p>
        )}

        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" className={styles.primary} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar parámetros'}
          </button>
          {guardado && <span style={{ color: '#27ae60', fontSize: 13 }}>Guardado ✓</span>}
        </div>
      </div>
    </section>
  )
}

// ── Tramos de Multiplicador ──────────────────────────────────────────────────

function TramosMultiplicador({ restauranteId, tramos, onTramosChange }) {
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [editables, setEditables] = useState(tramos)

  useEffect(() => { setEditables(tramos) }, [tramos])

  function cambiarFila(idx, campo, valor) {
    setEditables(prev => prev.map((t, i) => i === idx ? { ...t, [campo]: valor } : t))
  }

  function agregarFila() {
    const ultimo = editables[editables.length - 1]
    setEditables(prev => [...prev, {
      id: null,
      restaurante_id: restauranteId,
      coste_min: ultimo ? num(ultimo.coste_max) + 0.01 : 0,
      coste_max: '',
      factor: 2.0,
      pvp_minimo_carta: '',
      orden: prev.length + 1,
    }])
  }

  function eliminarFila(idx) {
    setEditables(prev => prev.filter((_, i) => i !== idx))
  }

  async function guardar() {
    setGuardando(true)
    await supabase.from('tramos_multiplicador').delete().eq('restaurante_id', restauranteId)
    const filas = editables.map((t, i) => ({
      restaurante_id: restauranteId,
      coste_min: num(t.coste_min),
      coste_max: t.coste_max !== '' && t.coste_max != null ? num(t.coste_max) : null,
      factor: num(t.factor),
      pvp_minimo_carta: t.pvp_minimo_carta !== '' ? num(t.pvp_minimo_carta) : null,
      orden: i + 1,
    }))
    await supabase.from('tramos_multiplicador').insert(filas)
    onTramosChange(filas)
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  function aplicarPlantilla(key) {
    const plantilla = PLANTILLAS_TRAMOS[key]
    if (!plantilla) return
    setEditables(plantilla.tramos.map(t => ({ ...t, id: null, restaurante_id: restauranteId })))
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Tramos de Multiplicador</h2>
        <p className={styles.panelSub}>Define los factores de precio por rango de coste. Se aplican a todos los vinos de tu carta.</p>
      </div>
      <div className={styles.panelBody}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#666', alignSelf: 'center' }}>Plantillas:</span>
          {Object.entries(PLANTILLAS_TRAMOS).map(([key, p]) => (
            <button key={key} type="button" className={styles.ghost} onClick={() => aplicarPlantilla(key)}>
              {p.nombre}
            </button>
          ))}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e3d8' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Coste desde (€)</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Hasta (€)</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>Factor ×</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>PVP mínimo carta</th>
                <th style={{ padding: '6px 8px' }} />
              </tr>
            </thead>
            <tbody>
              {editables.map((t, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f0ece4' }}>
                  <td style={{ padding: '4px 8px' }}>
                    <input className={styles.input} type="number" step="0.01" min="0" value={t.coste_min} onChange={e => cambiarFila(idx, 'coste_min', e.target.value)} style={{ width: 90 }} />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input className={styles.input} type="number" step="0.01" min="0" value={t.coste_max ?? ''} placeholder="sin límite" onChange={e => cambiarFila(idx, 'coste_max', e.target.value)} style={{ width: 100 }} />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input className={styles.input} type="number" step="0.1" min="1" max="10" value={t.factor} onChange={e => cambiarFila(idx, 'factor', e.target.value)} style={{ width: 70 }} />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <input className={styles.input} type="number" step="0.5" min="0" value={t.pvp_minimo_carta ?? ''} placeholder="—" onChange={e => cambiarFila(idx, 'pvp_minimo_carta', e.target.value)} style={{ width: 90 }} />
                  </td>
                  <td style={{ padding: '4px 8px' }}>
                    <button type="button" className={styles.danger} onClick={() => eliminarFila(idx)} style={{ fontSize: 11, padding: '3px 8px' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className={styles.secondary} onClick={agregarFila}>+ Añadir tramo</button>
          <button type="button" className={styles.primary} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar tramos'}
          </button>
          {guardado && <span style={{ color: '#27ae60', fontSize: 13 }}>Guardado ✓</span>}
        </div>
      </div>
    </section>
  )
}

// ── Método PVP ───────────────────────────────────────────────────────────────

function MetodoPvp({ restauranteId, configPricing, onConfigChange }) {
  const [metodo, setMetodo] = useState(configPricing?.metodo_pvp || 'multiplicador')
  const [descorche, setDescorche] = useState(configPricing?.descorche_fijo ?? 9)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    setMetodo(configPricing?.metodo_pvp || 'multiplicador')
    setDescorche(configPricing?.descorche_fijo ?? 9)
  }, [configPricing])

  async function guardar() {
    setGuardando(true)
    await supabase.from('configuracion_pricing').upsert({
      restaurante_id: restauranteId,
      metodo_pvp: metodo,
      descorche_fijo: num(descorche),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'restaurante_id' })
    onConfigChange({ metodo_pvp: metodo, descorche_fijo: num(descorche) })
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2000)
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Método de cálculo de PVP</h2>
        <p className={styles.panelSub}>Elige cómo se calcula el PVP sugerido de botella para todos los vinos de tu carta.</p>
      </div>
      <div className={styles.panelBody}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 16px', border: `2px solid ${metodo === 'multiplicador' ? '#2a2723' : '#e8e3d8'}`, borderRadius: 4 }}>
            <input type="radio" value="multiplicador" checked={metodo === 'multiplicador'} onChange={() => setMetodo('multiplicador')} style={{ marginTop: 2 }} />
            <div>
              <strong>Método 1 — Multiplicador por tramos</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
                PVP = Coste × Factor del tramo. El factor lo defines en la pestaña "Tramos de precio".
              </p>
            </div>
          </label>

          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 16px', border: `2px solid ${metodo === 'descorche' ? '#2a2723' : '#e8e3d8'}`, borderRadius: 4 }}>
            <input type="radio" value="descorche" checked={metodo === 'descorche'} onChange={() => setMetodo('descorche')} style={{ marginTop: 2 }} />
            <div>
              <strong>Método 2 — Multiplicador + Descorche fijo</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
                PVP = (Coste × Factor) + Descorche fijo. Añade un precio de servicio fijo que cubre parte de la estructura.
              </p>
            </div>
          </label>

          {metodo === 'descorche' && (
            <label className={styles.label} style={{ maxWidth: 200 }}>
              Precio de descorche (€)
              <input
                className={styles.input}
                type="number"
                min="0"
                step="0.5"
                value={descorche}
                onChange={e => setDescorche(e.target.value)}
              />
              <small style={{ color: '#888', marginTop: 4, display: 'block' }}>
                Típicamente entre 6€ y 12€. Se suma al precio calculado por factor.
              </small>
            </label>
          )}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="button" className={styles.primary} onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar método'}
          </button>
          {guardado && <span style={{ color: '#27ae60', fontSize: 13 }}>Guardado ✓</span>}
        </div>
      </div>
    </section>
  )
}

// ── Previsualización de carta ────────────────────────────────────────────────

function PrevisualizacionCarta({ vinos, tramos, configPricing, ajustes, restauranteId, onVinosActualizados }) {
  const [aplicando, setAplicando] = useState(false)
  const [aplicado, setAplicado] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [seleccionados, setSeleccionados] = useState(new Set())

  const metodo = configPricing?.metodo_pvp || 'multiplicador'
  const descorcheFijo = num(configPricing?.descorche_fijo) || 9
  const ivaVentaPct = num(ajustes?.ivaVentaPct) || 10
  const pvpIncluyeIva = ajustes?.pvpIncluyeIva !== false

  const vinosConPvp = useMemo(() => {
    return vinos.map(vino => {
      const coste = num(vino.coste_compra)
      const costeNeto = coste  // asumimos coste sin IVA (costeIncluyeIva=false por defecto)

      let pvpNetoPropuesto = 0
      if (metodo === 'multiplicador' && tramos.length) {
        const r = calcularPvpConTramos(costeNeto, tramos)
        pvpNetoPropuesto = r.pvpNeto
      } else if (metodo === 'descorche') {
        const factor = factorDescorchePorCoste(costeNeto)
        const r = calcularPvpConDescorche(costeNeto, factor, descorcheFijo, ivaVentaPct, false)
        pvpNetoPropuesto = r.pvpNeto
      }

      const pvpBotellaPropuesto = pvpIncluyeIva
        ? Math.round(anadirIva(pvpNetoPropuesto, ivaVentaPct))
        : Math.round(pvpNetoPropuesto)

      const copasEstandar = copasEstandarPorFormato(vino.ml, vino.tipo, vino.usa_coravin)
      const pvpCopasPropuesto = pvpBotellaPropuesto
        ? pvpCopaDesBotella(pvpBotellaPropuesto, copasEstandar)
        : 0

      const margenActual = vino.precio_botella && coste
        ? redondear(((num(vino.precio_botella) / (pvpIncluyeIva ? 1.1 : 1) - coste) / (num(vino.precio_botella) / (pvpIncluyeIva ? 1.1 : 1))) * 100, 1)
        : null
      const margenPropuesto = pvpBotellaPropuesto && coste
        ? redondear(((pvpNetoPropuesto - coste) / pvpNetoPropuesto) * 100, 1)
        : null

      const rentActual = vino.precio_botella && coste
        ? rentabilidadSobreCoste(num(vino.precio_botella), coste, { ivaVentaPct, pvpIncluyeIva })
        : null
      const rentPropuesta = pvpBotellaPropuesto && coste
        ? rentabilidadSobreCoste(pvpBotellaPropuesto, coste, { ivaVentaPct, pvpIncluyeIva })
        : null

      const factorActual = vino.precio_botella && coste
        ? factorMultiplicadorImplicito(num(vino.precio_botella), coste, { ivaVentaPct, pvpIncluyeIva })
        : null

      const diferencial = vino.precio_copa && vino.precio_botella
        ? diferencialCopaVsBotella(num(vino.precio_copa), num(vino.precio_botella), copasEstandar, { ivaVentaPct, pvpIncluyeIva })
        : null

      return {
        ...vino,
        pvpBotellaPropuesto,
        pvpCopasPropuesto,
        copasEstandar,
        margenActual,
        margenPropuesto,
        rentActual,
        rentPropuesta,
        factorActual,
        diferencial,
        cambio: pvpBotellaPropuesto && vino.precio_botella
          ? pvpBotellaPropuesto - num(vino.precio_botella)
          : 0,
      }
    })
  }, [vinos, tramos, configPricing, ajustes])

  const vinosFiltrados = useMemo(() => {
    if (!filtro.trim()) return vinosConPvp
    const q = filtro.toLowerCase()
    return vinosConPvp.filter(v =>
      (v.nombre || '').toLowerCase().includes(q) ||
      (v.bodega || '').toLowerCase().includes(q)
    )
  }, [vinosConPvp, filtro])

  async function aplicarPvpSugeridos() {
    const targets = seleccionados.size > 0
      ? vinosConPvp.filter(v => seleccionados.has(v.id))
      : vinosConPvp.filter(v => v.pvpBotellaPropuesto > 0)

    if (!targets.length) return
    setAplicando(true)
    for (const v of targets) {
      if (!v.pvpBotellaPropuesto) continue
      await supabase.from('vinos').update({
        precio_botella: v.pvpBotellaPropuesto,
        ...(v.pvpCopasPropuesto ? { precio_copa: v.pvpCopasPropuesto } : {}),
      }).eq('id', v.id)
    }
    onVinosActualizados()
    setAplicando(false)
    setAplicado(true)
    setTimeout(() => setAplicado(false), 3000)
  }

  function toggleSeleccion(id) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const vinosConCambio = vinosConPvp.filter(v => Math.abs(v.cambio) >= 0.5)
  const subidaMedia = vinosConCambio.length
    ? redondear(vinosConCambio.reduce((s, v) => s + v.cambio, 0) / vinosConCambio.length, 2)
    : 0

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Previsualización de carta</h2>
        <p className={styles.panelSub}>Compara los PVPs actuales con los propuestos según tus tramos. Aplica los cambios con un clic.</p>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.statsGrid} style={{ marginBottom: 20 }}>
          <StatCard value={vinosConCambio.length} label="Vinos con cambio de PVP" />
          <StatCard
            value={subidaMedia >= 0 ? `+${eur(subidaMedia)}` : eur(subidaMedia)}
            label="Variación media de PVP"
            valueStyle={{ color: subidaMedia >= 0 ? '#27ae60' : '#e74c3c' }}
          />
          <StatCard value={vinosConPvp.filter(v => !v.coste_compra).length} label="Vinos sin coste (sin PVP propuesto)" />
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className={styles.input}
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Filtrar por vino o bodega…"
            style={{ maxWidth: 260 }}
          />
          <button type="button" className={styles.primary} onClick={aplicarPvpSugeridos} disabled={aplicando}>
            {aplicando ? 'Aplicando…' : seleccionados.size > 0 ? `Aplicar ${seleccionados.size} seleccionados` : 'Aplicar todos los PVP propuestos'}
          </button>
          {aplicado && <span style={{ color: '#27ae60', fontSize: 13 }}>PVPs actualizados ✓</span>}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e8e3d8', background: '#faf9f6' }}>
                <th style={{ padding: '8px 6px', textAlign: 'left', width: 32 }}>
                  <input type="checkbox"
                    checked={seleccionados.size === vinosFiltrados.length && vinosFiltrados.length > 0}
                    onChange={e => setSeleccionados(e.target.checked ? new Set(vinosFiltrados.map(v => v.id)) : new Set())}
                  />
                </th>
                <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600 }}>Vino</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>Coste</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>PVP actual</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>PVP propuesto</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>Copa propuesta</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>Margen s/ventas</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>Rent. s/coste</th>
                <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>Dif. copa/bot.</th>
              </tr>
            </thead>
            <tbody>
              {vinosFiltrados.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f0ece4' }}>
                  <td style={{ padding: '6px' }}>
                    <input type="checkbox" checked={seleccionados.has(v.id)} onChange={() => toggleSeleccion(v.id)} />
                  </td>
                  <td style={{ padding: '6px' }}>
                    <strong style={{ display: 'block', fontSize: 12 }}>{v.nombre}</strong>
                    <span style={{ color: '#888', fontSize: 11 }}>{v.bodega}</span>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{v.coste_compra ? eur(v.coste_compra) : '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>{v.precio_botella ? eur(v.precio_botella) : '—'}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontWeight: v.cambio !== 0 ? 600 : 400, color: v.cambio > 0 ? '#27ae60' : v.cambio < 0 ? '#e74c3c' : undefined }}>
                    {v.pvpBotellaPropuesto ? eur(v.pvpBotellaPropuesto) : '—'}
                    {v.cambio !== 0 && v.pvpBotellaPropuesto ? <small style={{ display: 'block', fontWeight: 400, fontSize: 10 }}>{v.cambio > 0 ? '+' : ''}{eur(v.cambio)}</small> : null}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>
                    {v.pvpCopasPropuesto ? eur(v.pvpCopasPropuesto) : '—'}
                    {v.copasEstandar ? <small style={{ display: 'block', color: '#888', fontSize: 10 }}>{v.copasEstandar} copas</small> : null}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', fontSize: 11 }}>
                    {v.margenActual != null ? <span style={{ color: '#888' }}>{pct(v.margenActual)} →</span> : null}
                    {v.margenPropuesto != null ? <strong> {pct(v.margenPropuesto)}</strong> : ' —'}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', fontSize: 11 }}>
                    {v.rentActual != null ? <span style={{ color: '#888' }}>{pct(v.rentActual)} →</span> : null}
                    {v.rentPropuesta != null ? <strong> {pct(v.rentPropuesta)}</strong> : ' —'}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right', fontSize: 11, color: v.diferencial != null && v.diferencial >= 0 ? '#27ae60' : '#e74c3c' }}>
                    {v.diferencial != null ? (v.diferencial >= 0 ? '+' : '') + eur(v.diferencial) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vinosFiltrados.length === 0 && (
          <p style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 24 }}>Sin vinos que coincidan con el filtro.</p>
        )}
      </div>
    </section>
  )
}

// ── Simulador What-If ─────────────────────────────────────────────────────────

function SimuladorWhatIf({ vinos, ajustes }) {
  const ivaVentaPct = num(ajustes?.ivaVentaPct) || 10
  const pvpIncluyeIva = ajustes?.pvpIncluyeIva !== false
  const [seleccion, setSeleccion] = useState([])
  const [filtro, setFiltro] = useState('')

  const vinosFiltrados = useMemo(() => {
    const q = filtro.toLowerCase()
    return vinos.filter(v => v.precio_botella && v.coste_compra && (
      !q || (v.nombre || '').toLowerCase().includes(q) || (v.bodega || '').toLowerCase().includes(q)
    ))
  }, [vinos, filtro])

  function toggleVino(vino) {
    setSeleccion(prev => {
      const existe = prev.find(s => s.id === vino.id)
      if (existe) return prev.filter(s => s.id !== vino.id)
      return [...prev, {
        id: vino.id,
        nombre: vino.nombre,
        bodega: vino.bodega,
        pvpActual: num(vino.precio_botella),
        pvpNuevo: num(vino.precio_botella),
        ventasAnuales: 100,
      }]
    })
  }

  function cambiarSeleccion(id, campo, valor) {
    setSeleccion(prev => prev.map(s => s.id === id ? { ...s, [campo]: valor } : s))
  }

  const resultado = useMemo(() => {
    return impactoTotalSeleccion(
      seleccion.map(s => ({ pvpNuevo: s.pvpNuevo, pvpActual: s.pvpActual, ventasAnuales: s.ventasAnuales })),
      { ivaVentaPct, pvpIncluyeIva }
    )
  }, [seleccion, ivaVentaPct, pvpIncluyeIva])

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Simulador What-If</h2>
        <p className={styles.panelSub}>¿Cuánto ganas al año si subes el precio de los vinos más vendidos?</p>
      </div>
      <div className={styles.panelBody}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <input
            className={styles.input}
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Buscar vino para añadir…"
            style={{ maxWidth: 280 }}
          />
        </div>

        {filtro.trim() && (
          <div style={{ border: '1px solid #e8e3d8', borderRadius: 4, maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
            {vinosFiltrados.slice(0, 15).map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => { toggleVino(v); setFiltro('') }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f5f2ec', cursor: 'pointer', fontSize: 13 }}
              >
                <strong>{v.nombre}</strong> — {v.bodega} <span style={{ color: '#888' }}>({eur(v.precio_botella)})</span>
              </button>
            ))}
            {vinosFiltrados.length === 0 && <p style={{ padding: 12, color: '#888', fontSize: 13 }}>Sin resultados</p>}
          </div>
        )}

        {seleccion.length > 0 ? (
          <>
            <div className={styles.statsGrid} style={{ marginBottom: 20 }}>
              <StatCard
                value={resultado.impacto >= 0 ? `+${eur(resultado.impacto)}` : eur(resultado.impacto)}
                label="Impacto anual bruto estimado"
                valueStyle={{ color: resultado.impacto >= 0 ? '#27ae60' : '#e74c3c' }}
                hint="Suma del aumento de PVP × unidades anuales de todos los vinos seleccionados"
              />
              <StatCard
                value={resultado.impactoNeto >= 0 ? `+${eur(resultado.impactoNeto)}` : eur(resultado.impactoNeto)}
                label="Impacto neto (sin IVA)"
                valueStyle={{ color: resultado.impactoNeto >= 0 ? '#27ae60' : '#e74c3c' }}
              />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e8e3d8', background: '#faf9f6' }}>
                    <th style={{ padding: '8px 8px', textAlign: 'left', fontWeight: 600 }}>Vino</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>PVP actual</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>PVP nuevo</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>Uds/año</th>
                    <th style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>Impacto anual</th>
                    <th style={{ padding: '8px 8px' }} />
                  </tr>
                </thead>
                <tbody>
                  {seleccion.map(s => {
                    const r = impactoSubidaPrecio(s.pvpNuevo, s.pvpActual, s.ventasAnuales, { ivaVentaPct, pvpIncluyeIva })
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f0ece4' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <strong style={{ fontSize: 12 }}>{s.nombre}</strong>
                          <br /><span style={{ color: '#888', fontSize: 11 }}>{s.bodega}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{eur(s.pvpActual)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <input
                            className={styles.input}
                            type="number"
                            step="0.5"
                            min="0"
                            value={s.pvpNuevo}
                            onChange={e => cambiarSeleccion(s.id, 'pvpNuevo', e.target.value)}
                            style={{ width: 80, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <input
                            className={styles.input}
                            type="number"
                            step="10"
                            min="0"
                            value={s.ventasAnuales}
                            onChange={e => cambiarSeleccion(s.id, 'ventasAnuales', e.target.value)}
                            style={{ width: 70, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: r.impacto >= 0 ? '#27ae60' : '#e74c3c' }}>
                          {r.impacto >= 0 ? '+' : ''}{eur(r.impacto)}
                          <br /><span style={{ fontWeight: 400, fontSize: 10, color: '#888' }}>{pct(r.pctVariacion)} variación PVP</span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <button type="button" className={styles.danger} onClick={() => toggleVino({ id: s.id })} style={{ fontSize: 11, padding: '3px 8px' }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ color: '#888', fontSize: 13, padding: '24px 0' }}>
            Busca un vino arriba y añádelo para simular el impacto de cambiar su precio.
          </p>
        )}
      </div>
    </section>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PreciosSommPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [tramos, setTramos] = useState([])
  const [configPricing, setConfigPricing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tabActiva, setTabActiva] = useState('simulador')
  const [ajustes, setAjustes] = useState(null)

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

      const [{ data: vinosData }, { data: tramosData }, { data: configData }] = await Promise.all([
        supabase.from('vinos').select(`${SELECT_CLIENT_VINO_DASHBOARD}, ml, tipo, usa_coravin`).eq('restaurante_id', rest.id).eq('activo', true),
        supabase.from('tramos_multiplicador').select('*').eq('restaurante_id', rest.id).order('orden'),
        supabase.from('configuracion_pricing').select('*').eq('restaurante_id', rest.id).maybeSingle(),
      ])

      setVinos(vinosData || [])
      setTramos(tramosData || [])
      setConfigPricing(configData)

      try {
        const ajustesGuardados = JSON.parse(localStorage.getItem(`economic_settings_${rest.id}`) || 'null')
        setAjustes(normalizarAjustesPrecios(ajustesGuardados || {}))
      } catch {
        setAjustes(normalizarAjustesPrecios({}))
      }

      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState title="Cargando motor de precios" text="Preparando vinos, tramos y configuración." />

  return (
    <FeatureGate restaurante={restaurante} feature="somm_simulador_mult" title="Motor de Precios Somm">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Carta Viva Somm"
        title="Motor de Precios"
        subtitle="Simulador de multiplicador, tramos configurables, método de descorche y análisis de impacto."
        help={{
          eyebrow: 'Cómo funciona',
          title: 'Motor de Precios Somm',
          intro: 'Calcula tu multiplicador óptimo a partir de tus costes reales, define los tramos de precio por rango de coste, y simula el impacto de subir precios en tu facturación anual.',
          items: [
            { title: 'Simulador de multiplicador', text: 'Introduce tus gastos fijos de bodega y tu objetivo de beneficio. El sistema calcula el multiplicador que necesitas para cubrirlos.' },
            { title: 'Tramos de precio', text: 'Define factores distintos según el rango de coste del vino. Vinos baratos se marcan más, vinos caros menos. Elige plantilla o personaliza.' },
            { title: 'Previsualización', text: 'Ve cómo quedarían los PVPs de toda tu carta y aplica los cambios con un clic.' },
            { title: 'What-If', text: 'Simula cuánto ganarías al año si subes el precio de los vinos más vendidos.' },
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
          {tabActiva === 'simulador' && (
            <SimuladorMultiplicador restauranteId={restaurante?.id} ivaVentaPct={ajustes?.ivaVentaPct} />
          )}
          {tabActiva === 'tramos' && (
            <TramosMultiplicador
              restauranteId={restaurante?.id}
              tramos={tramos}
              onTramosChange={setTramos}
            />
          )}
          {tabActiva === 'metodo' && (
            <MetodoPvp
              restauranteId={restaurante?.id}
              configPricing={configPricing}
              onConfigChange={setConfigPricing}
            />
          )}
          {tabActiva === 'previz' && (
            <PrevisualizacionCarta
              vinos={vinos}
              tramos={tramos}
              configPricing={configPricing}
              ajustes={ajustes}
              restauranteId={restaurante?.id}
              onVinosActualizados={() => {
                supabase.from('vinos').select(`${SELECT_CLIENT_VINO_DASHBOARD}, ml, tipo, usa_coravin`).eq('restaurante_id', restaurante.id).eq('activo', true)
                  .then(({ data }) => setVinos(data || []))
              }}
            />
          )}
          {tabActiva === 'whatif' && (
            <SimuladorWhatIf vinos={vinos} ajustes={ajustes} />
          )}
        </div>
      </ModuleShell>
    </FeatureGate>
  )
}
