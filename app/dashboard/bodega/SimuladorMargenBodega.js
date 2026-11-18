'use client'

/**
 * Simulador de margen mínimo de bodega. Reproduce la hoja de
 * Grand Cru Academy que usa el usuario, precargada con sus datos
 * reales (parametros_explotacion + agregador del mes de referencia)
 * y comparada con el margen real.
 *
 * Diseño:
 *   - Formulario minimalista (una columna en móvil, dos en desktop)
 *     con seis gastos + beneficio objetivo + ventas previstas.
 *   - Cada campo precargado lleva su "Origen:" debajo (calculado del
 *     mes X, imputación N %, manual). Sobreescribir no rompe la precarga.
 *   - Tarjetas de resultado: margen mínimo %, % MP máx, multiplicador
 *     mínimo, margen bruto necesario €.
 *   - Comparativa con la realidad en una tira horizontal.
 *   - Texto didáctico breve para que el usuario entienda el cálculo.
 *   - Estilo coherente con la paleta brand (burdeos/dorado/crema de
 *     globals.css); sin diseños nuevos.
 */

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { formatoMoneda, formatoPorcentaje } from '../../lib/formatoEs'
import {
  calcularSimuladorMargen,
  compararConReal,
  precargarDesdeSnapshot,
} from '../../lib/simuladorMargen'
import { cargarSupuestos, guardarSupuestos } from '../../lib/simuladorMargenCliente'
import {
  calcularTotalPersonal,
  calcularTotalAlquiler,
} from '../../lib/sommExplotacion'
import { datosParaPeriodo } from '../../lib/canalesSalidas'
import { costeBase } from '../../lib/margenMinimo'

const CLAVES_GASTO = [
  { k: 'personal',             label: 'Personal asignado a bodega' },
  { k: 'roturas_invitaciones', label: 'Roturas, mermas, invitaciones (cocina+cata)' },
  { k: 'materiales',           label: 'Materiales (copas, sacacorchos…)' },
  { k: 'suministros',          label: 'Suministros (gases, mantenimiento…)' },
  { k: 'alquiler',             label: 'Alquiler proporcional de bodega' },
  { k: 'otros',                label: 'Otros gastos (inmovilizado, etc.)' },
]

function inputNumerico(v) {
  if (v === null || v === undefined) return ''
  return String(v).replace('.', ',')
}

export default function SimuladorMargenBodega({
  restauranteId,
  snapshotMes: snapshotMesProp = null,
  parametros: parametrosProp = null,
  periodoReferencia: periodoProp = null,
  catalogo: catalogoProp = null,
}) {
  // Permite elegir mes de referencia: por defecto el mes anterior
  // (los datos del mes en curso suelen estar incompletos).
  const mesPorDefecto = useMemo(() => periodoProp || mesAnteriorISO(), [periodoProp])
  const [periodo, setPeriodo] = useState(mesPorDefecto)
  const [parametrosFetched, setParametrosFetched] = useState(null)
  const [paramsError, setParamsError] = useState(null)

  // Snapshot del mes (cerrado o cálculo en vivo) via /api/cierres-mes.
  // Guardamos { mes, datos } para que `datosParaPeriodo(cached, periodo)`
  // devuelva null en cuanto cambia `periodo` — mismo sello que el P&L de
  // Explotación. Mientras llega el nuevo dato, la precarga de
  // roturas/ventas queda vacía ("Sin dato") en lugar de mostrar las del
  // mes anterior.
  const [snapshotCache, setSnapshotCache] = useState(null)
  const [cargandoSnapshot, setCargandoSnapshot] = useState(false)
  const [snapshotError, setSnapshotError] = useState(null)

  // Catálogo de vinos activos para el multiplicador medio real. Sin
  // uds vendidas por vino, aplicamos media simple y lo etiquetamos.
  const [catalogoCache, setCatalogoCache] = useState(null)

  // Si el padre no pasa `parametros`, los traemos de parametros_explotacion
  // para el mes seleccionado. `imputacion_pct` puede faltar (columna
  // reciente) — en ese caso precargarDesdeSnapshot degrada a 100 %.
  // La llamada setState vive dentro del callback del fetch (patrón
  // canónico "subscribe to external system"), no en el cuerpo síncrono
  // del effect, para no provocar cascading renders.
  useEffect(() => {
    if (parametrosProp) return
    if (!restauranteId || !periodo) return
    let vivo = true
    supabase
      .from('parametros_explotacion')
      .select('*')
      .eq('restaurante_id', restauranteId)
      .eq('periodo', periodo)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) {
          setParamsError(error)
          setParametrosFetched(null)
          return
        }
        setParamsError(null)
        setParametrosFetched(data ? {
          total_personal: calcularTotalPersonal(data),
          total_alquiler: calcularTotalAlquiler(data?.alquileres || []),
          imputacion_pct: data?.imputacion_pct || null,
        } : null)
      })
    return () => { vivo = false }
  }, [restauranteId, periodo, parametrosProp])

  const parametros = parametrosProp || parametrosFetched

  // Fetch del snapshot del mes (cierres-mes). Si llega después de
  // cambiar `periodo`, `datosParaPeriodo` lo descarta por sello de
  // mes y no contamina la UI con datos del mes anterior.
  useEffect(() => {
    // Si el padre nos pasa snapshot, usamos SIEMPRE ese: no llamamos
    // al endpoint. snapshotCache queda sin actualizar (null inicial),
    // que es exactamente lo que queremos.
    if (snapshotMesProp) return
    if (!restauranteId || !periodo) return
    let vivo = true
    ;(async () => {
      // Todos los setState viven en la rama "al llegar algo del
      // exterior" — ningún setState en el cuerpo síncrono del effect.
      try {
        const { data: sess } = await supabase.auth.getSession()
        if (!vivo) return
        setCargandoSnapshot(true)
        setSnapshotError(null)
        const token = sess?.session?.access_token || ''
        const res = await fetch(
          `/api/cierres-mes?restaurante_id=${restauranteId}&mes=${periodo}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!vivo) return
        if (!res.ok) {
          setSnapshotCache({ mes: periodo, datos: null })
          setSnapshotError(new Error(`HTTP ${res.status}`))
          setCargandoSnapshot(false)
          return
        }
        const json = await res.json()
        if (!vivo) return
        const datos = json?.cerrado ? json?.cierre?.snapshot : json?.datos
        // Propagamos el periodo que pidió esta carga; si el usuario ha
        // cambiado de mes mientras tanto, el useMemo lo descarta.
        setSnapshotCache({ mes: periodo, datos: datos || null })
        setCargandoSnapshot(false)
      } catch (e) {
        if (!vivo) return
        setSnapshotCache({ mes: periodo, datos: null })
        setSnapshotError(e)
        setCargandoSnapshot(false)
      }
    })()
    return () => { vivo = false }
  }, [restauranteId, periodo, snapshotMesProp])

  // Fetch del catálogo activo para el multiplicador medio real.
  // Si el padre pasa `catalogoProp`, lo usamos tal cual y no hacemos
  // fetch: catalogoCache se queda en null, que es su inicial.
  useEffect(() => {
    if (catalogoProp) return
    if (!restauranteId) return
    let vivo = true
    supabase
      .from('vinos')
      .select('id, nombre, precio_botella, coste_medio_pmp, coste_compra, activo')
      .eq('restaurante_id', restauranteId)
      .then(({ data }) => {
        if (!vivo) return
        setCatalogoCache(Array.isArray(data) ? data : [])
      })
    return () => { vivo = false }
  }, [restauranteId, catalogoProp])

  // Snapshot "seguro" para el `periodo` actual (si hay desfase por
  // una petición aún en vuelo, datosParaPeriodo devuelve null).
  const snapshotMes = useMemo(
    () => snapshotMesProp || datosParaPeriodo(snapshotCache, periodo),
    [snapshotMesProp, snapshotCache, periodo],
  )

  const precarga = useMemo(() => precargarDesdeSnapshot({
    snapshotMes,
    parametros,
    referencia: 'mes',
  }), [snapshotMes, parametros])

  // Catálogo normalizado al shape que consume compararConReal:
  // sin ventas por-vino, va `unidades = 1` (media simple). La UI lo
  // etiqueta como "media simple del catálogo (sin ponderar por
  // ventas)". IVA de vino en España por defecto 10 %.
  const catalogo = useMemo(() => {
    if (catalogoProp) return catalogoProp
    const lista = catalogoCache || []
    const out = []
    for (const v of lista) {
      if (v?.activo === false) continue
      const coste = costeBase(v)
      const pvp   = Number(v?.precio_botella) || 0
      if (coste > 0 && pvp > 0) {
        out.push({ pvp, iva_pct: 10, coste, unidades: 1 })
      }
    }
    return out.length > 0 ? out : null
  }, [catalogoProp, catalogoCache])

  // Separamos edits del usuario de los valores precargados. El form
  // que ve la UI es un valor DERIVADO (no estado): overrides del
  // usuario encima de la precarga y los supuestos guardados. Así
  // evitamos setState dentro de useEffect y los cascading renders
  // que avisa react-hooks/set-state-in-effect.
  const [overrides, setOverrides] = useState({})
  const [supuestosGuardados, setSupuestosGuardados] = useState(null)
  const [faltaTabla, setFaltaTabla] = useState(false)
  const [persistError, setPersistError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [ultimoGuardado, setUltimoGuardado] = useState(null)

  // Carga supuestos persistidos al montar / al cambiar de restaurante.
  // setState vive en la rama del callback de la Promise (patrón
  // "subscribe to external system"), no en el cuerpo síncrono.
  useEffect(() => {
    if (!restauranteId) return
    let vivo = true
    cargarSupuestos(restauranteId).then((r) => {
      if (!vivo) return
      setSupuestosGuardados(r.supuestos)
      setFaltaTabla(r.falta_tabla)
      setPersistError(r.error)
    })
    return () => { vivo = false }
  }, [restauranteId])

  const form = useMemo(() => {
    const defecto = {
      personal:              inputNumerico(precarga.valores.personal),
      alquiler:              inputNumerico(precarga.valores.alquiler),
      roturas_invitaciones:  inputNumerico(precarga.valores.roturas_invitaciones),
      materiales:            inputNumerico(supuestosGuardados?.materiales),
      suministros:           inputNumerico(supuestosGuardados?.suministros),
      otros:                 inputNumerico(supuestosGuardados?.otros),
      beneficio_objetivo:    inputNumerico(supuestosGuardados?.beneficio_objetivo),
      ventas_previstas:      supuestosGuardados?.ventas_previstas_fijo != null
        ? inputNumerico(supuestosGuardados.ventas_previstas_fijo)
        : inputNumerico(precarga.valores.ventas_previstas),
    }
    const out = { ...defecto }
    for (const k of Object.keys(overrides)) {
      if (overrides[k] !== undefined) out[k] = overrides[k]
    }
    return out
  }, [precarga, supuestosGuardados, overrides])

  const origen = precarga.origen

  const resultado = useMemo(() => calcularSimuladorMargen({
    gastos: {
      personal:              form.personal,
      roturas_invitaciones:  form.roturas_invitaciones,
      materiales:            form.materiales,
      suministros:           form.suministros,
      alquiler:              form.alquiler,
      otros:                 form.otros,
    },
    beneficio_objetivo: form.beneficio_objetivo,
    ventas_previstas:   form.ventas_previstas,
  }), [form])

  const comparativa = useMemo(() => compararConReal({
    simulacion: resultado,
    snapshotMes,
    catalogo,
  }), [resultado, snapshotMes, catalogo])

  function setCampo(k, v) {
    setOverrides(prev => ({ ...prev, [k]: v }))
  }

  async function onGuardar() {
    if (!restauranteId) return
    setGuardando(true)
    setPersistError(null)
    const payload = {
      materiales:         form.materiales,
      suministros:        form.suministros,
      otros:              form.otros,
      beneficio_objetivo: form.beneficio_objetivo,
      // Sólo persiste ventas_previstas si el usuario la fijó (distinta de la precalculada).
      ventas_previstas_fijo: form.ventas_previstas,
    }
    const r = await guardarSupuestos(restauranteId, payload)
    setFaltaTabla(r.falta_tabla)
    setPersistError(r.error)
    setGuardando(false)
    if (r.ok) setUltimoGuardado(new Date())
  }

  return (
    <section style={estilos.wrap} aria-labelledby="sim-margen-titulo">
      <header style={estilos.header}>
        <h3 id="sim-margen-titulo" style={estilos.titulo}>
          Simulador de margen mínimo de bodega
        </h3>
        <p style={estilos.ayuda}>
          ¿Qué margen bruto mínimo necesitas para cubrir los gastos de
          bodega y tu beneficio objetivo? Los valores de personal,
          alquiler, roturas y ventas se precargan con tus datos reales
          del mes de referencia. Los materiales, suministros, otros y
          beneficio objetivo los pones tú.
        </p>
      </header>

      {faltaTabla && (
        <div role="status" style={estilos.aviso}>
          <strong>SQL pendiente:</strong> la tabla
          <code> simulador_margen_bodega </code>
          no está creada. Puedes usar el simulador normalmente; los
          supuestos manuales no se están guardando entre sesiones.
          Pide al admin que aplique
          <code> supabase/migrations_pendientes/fase_c_simulador_margen</code>.
        </div>
      )}
      {cargandoSnapshot && (
        <div role="status" style={estilos.hint}>
          Cargando datos del mes {periodo}…
        </div>
      )}
      {snapshotError && !cargandoSnapshot && (
        <div role="alert" style={estilos.error}>
          No se pudieron cargar los datos del mes {periodo}
          {snapshotError.message ? `: ${snapshotError.message}` : ''}.
          La precarga de roturas y ventas queda vacía (nunca 0 inventado).
        </div>
      )}
      {persistError && (
        <div role="alert" style={estilos.error}>
          Error al leer/guardar supuestos: {persistError.message || 'desconocido'}
        </div>
      )}

      <div style={estilos.grid}>
        <fieldset style={estilos.fieldset}>
          <legend style={estilos.legend}>Gastos mensuales de bodega</legend>
          {CLAVES_GASTO.map(({ k, label }) => (
            <CampoNumerico
              key={k}
              label={label}
              valor={form[k]}
              onChange={v => setCampo(k, v)}
              origen={origen[k]}
            />
          ))}
        </fieldset>

        <fieldset style={estilos.fieldset}>
          <legend style={estilos.legend}>Objetivo y ventas</legend>
          <CampoNumerico
            label="Beneficio neto objetivo mensual"
            valor={form.beneficio_objetivo}
            onChange={v => setCampo('beneficio_objetivo', v)}
            origen={origen.beneficio_objetivo}
          />
          <CampoNumerico
            label="Ventas mensuales previstas (sin IVA)"
            valor={form.ventas_previstas}
            onChange={v => setCampo('ventas_previstas', v)}
            origen={origen.ventas_previstas}
          />
          <div style={estilos.campo}>
            <label htmlFor="sim_mes_ref" style={estilos.label}>Mes de referencia</label>
            <input
              id="sim_mes_ref"
              type="month"
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
              style={estilos.input}
            />
            {paramsError && (
              <small style={estilos.origenManual}>
                Error al leer parametros_explotacion: {paramsError.message || 'desconocido'}
              </small>
            )}
          </div>
        </fieldset>
      </div>

      <TarjetasResultado resultado={resultado} />
      <Comparativa resultado={resultado} comparativa={comparativa} />
      <ExplicacionDidactica />

      <div style={estilos.botones}>
        <button type="button" onClick={onGuardar} disabled={guardando || faltaTabla} style={estilos.btnPrimario}>
          {guardando ? 'Guardando…' : 'Guardar supuestos'}
        </button>
        {ultimoGuardado && (
          <span style={estilos.pie}>
            Guardado a las {ultimoGuardado.toLocaleTimeString('es-ES')}
          </span>
        )}
      </div>
    </section>
  )
}

function mesAnteriorISO() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function CampoNumerico({ label, valor, onChange, origen }) {
  const id = 'sim_' + label.replace(/[^a-zA-Z0-9]+/g, '_')
  return (
    <div style={estilos.campo}>
      <label htmlFor={id} style={estilos.label}>{label}</label>
      <div style={estilos.inputWrap}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={e => onChange(e.target.value)}
          placeholder="0,00"
          style={estilos.input}
        />
        <span style={estilos.sufijo}>€</span>
      </div>
      {origen && (
        <small style={origen === 'manual' ? estilos.origenManual : estilos.origenCalc}>
          {origen === 'manual' ? 'manual' : `Origen: ${origen}`}
        </small>
      )}
    </div>
  )
}

function TarjetasResultado({ resultado }) {
  if (resultado?.motivo === 'ventas_no_validas') {
    return (
      <div role="status" style={estilos.hint}>
        Introduce las ventas mensuales previstas para calcular el margen mínimo.
      </div>
    )
  }
  return (
    <div style={estilos.tarjetas}>
      <Tarjeta titulo="Margen bruto necesario" valor={formatoMoneda(resultado.margen_bruto_necesario, { decimales: 2 })} />
      <Tarjeta titulo="Margen mínimo" valor={formatoPorcentaje(resultado.pct_margen_minimo, 2)} destacado />
      <Tarjeta titulo="% materia prima máx." valor={formatoPorcentaje(resultado.pct_materia_prima_max, 2)} />
      <Tarjeta titulo="Multiplicador mín." valor={resultado.multiplicador_minimo != null ? `${resultado.multiplicador_minimo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×` : '—'} />
    </div>
  )
}

function Tarjeta({ titulo, valor, destacado = false }) {
  return (
    <div style={{ ...estilos.tarjeta, ...(destacado ? estilos.tarjetaDestacada : {}) }}>
      <div style={estilos.tarjetaTitulo}>{titulo}</div>
      <div style={estilos.tarjetaValor}>{valor}</div>
    </div>
  )
}

function Comparativa({ resultado, comparativa }) {
  if (resultado?.motivo || !comparativa?.diferencia_vs_minimo) {
    return null
  }
  const d = comparativa.diferencia_vs_minimo
  return (
    <div style={{
      ...estilos.comparativa,
      borderColor: d.cubre ? '#4A8C6F' : '#b85454',
      background:  d.cubre ? '#f0f7f3' : '#fbf2f2',
    }}>
      <strong style={{ color: d.cubre ? '#2f6049' : '#8a3030' }}>
        {d.cubre
          ? 'Tu bodega cubre el margen mínimo'
          : 'Tu bodega NO cubre el margen mínimo'}
      </strong>
      <ul style={estilos.ulCmp}>
        <li>Margen bruto real del mes: <strong>{formatoMoneda(comparativa.margen_bruto_real, { decimales: 2 })}</strong></li>
        <li>% materia prima real: <strong>{formatoPorcentaje(comparativa.pct_materia_prima_real, 2)}</strong></li>
        <li>Diferencia frente a lo necesario: <strong>{formatoMoneda(d.eur, { decimales: 2 })}</strong> ({d.puntos >= 0 ? '+' : ''}{d.puntos} pts)</li>
        <li>
          Multiplicador medio real:{' '}
          <strong>{comparativa.multiplicador_medio_real != null
            ? `${comparativa.multiplicador_medio_real.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`
            : 'Sin dato'}</strong>
          {comparativa.multiplicador_medio_real != null && (
            <small style={estilos.notaMult}>
              {' '}(media simple del catálogo, sin ponderar por ventas: no disponemos de uds vendidas por vino en el snapshot del mes)
            </small>
          )}
        </li>
      </ul>
    </div>
  )
}

function ExplicacionDidactica() {
  return (
    <details style={estilos.explicacion}>
      <summary style={estilos.explicacionResumen}>¿Cómo se calcula?</summary>
      <ol style={estilos.ol}>
        <li>Sumas los gastos mensuales que carga la bodega.</li>
        <li>Les sumas el beneficio neto que quieres ganar al mes.</li>
        <li>El resultado es el <em>margen bruto necesario</em> (en €).</li>
        <li>Divides entre tus ventas previstas: ese % es tu <strong>margen mínimo</strong>.</li>
        <li>Lo contrario es el <strong>% máximo de materia prima</strong>. El <strong>multiplicador mínimo</strong> es 1 dividido entre ese porcentaje.</li>
      </ol>
    </details>
  )
}

// ── Estilos inline (se integran con la paleta brand ya cargada en globals.css) ──

const estilos = {
  wrap: {
    padding: '18px 20px', background: '#fff', borderRadius: 10,
    border: '1px solid #e8e2d4', boxShadow: '0 1px 3px rgba(42,33,28,0.04)',
  },
  header: { marginBottom: 14 },
  titulo: { margin: 0, fontSize: 18, color: '#7B1E3B', fontWeight: 700 },
  ayuda: { marginTop: 6, fontSize: 13, color: '#6b6258', lineHeight: 1.45 },
  aviso: {
    background: '#fff8e8', border: '1px solid #e8d495', borderRadius: 6,
    padding: '10px 12px', margin: '10px 0', fontSize: 13, color: '#6b5620',
  },
  error: {
    background: '#fbf2f2', border: '1px solid #e0b4b4', borderRadius: 6,
    padding: '10px 12px', margin: '10px 0', fontSize: 13, color: '#8a3030',
  },
  grid: {
    display: 'grid', gap: 14,
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  },
  fieldset: {
    border: '1px solid #ead9ca', borderRadius: 8, padding: '10px 14px 14px',
    background: '#fbf7f0',
  },
  legend: { padding: '0 6px', fontSize: 13, fontWeight: 700, color: '#7B1E3B' },
  campo: { marginBottom: 12 },
  label: {
    display: 'block', marginBottom: 4, fontSize: 13, color: '#2a211c', fontWeight: 500,
  },
  inputWrap: { position: 'relative' },
  input: {
    width: '100%', padding: '8px 28px 8px 10px', fontSize: 14,
    border: '1px solid #d8d3c8', borderRadius: 6, background: '#fff',
    fontFamily: 'inherit',
  },
  sufijo: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    color: '#8b8278', fontSize: 13,
  },
  origenCalc:   { display: 'block', marginTop: 3, fontSize: 11, color: '#4A8C6F' },
  origenManual: { display: 'block', marginTop: 3, fontSize: 11, color: '#8b8278', fontStyle: 'italic' },
  tarjetas: {
    display: 'grid', gap: 10, marginTop: 16,
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  },
  tarjeta: {
    padding: '12px 14px', borderRadius: 8, border: '1px solid #ead9ca',
    background: '#fff',
  },
  tarjetaDestacada: {
    background: 'linear-gradient(135deg, #7B1E3B, #5C1428)', color: '#fff',
    borderColor: '#5C1428',
  },
  tarjetaTitulo: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.8 },
  tarjetaValor:  { fontSize: 22, fontWeight: 700, marginTop: 4 },
  comparativa: {
    marginTop: 16, padding: '12px 14px', border: '1px solid',
    borderRadius: 8, fontSize: 14,
  },
  ulCmp: { margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.55 },
  explicacion: { marginTop: 14, fontSize: 13, color: '#6b6258' },
  explicacionResumen: { cursor: 'pointer', fontWeight: 600, color: '#7B1E3B' },
  ol: { margin: '6px 0 0', paddingLeft: 20, lineHeight: 1.6 },
  hint: { marginTop: 14, padding: '10px 12px', background: '#fff8e8', borderRadius: 6, fontSize: 13, color: '#6b5620' },
  botones: { marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 },
  btnPrimario: {
    padding: '8px 18px', fontSize: 14, fontWeight: 600,
    background: '#7B1E3B', color: '#fff', border: 'none', borderRadius: 6,
    cursor: 'pointer',
  },
  pie: { fontSize: 12, color: '#8b8278' },
  notaMult: { fontSize: 11, color: '#8b8278', fontStyle: 'italic' },
}
