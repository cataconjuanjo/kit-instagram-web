'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { SELECT_CLIENT_RESTAURANTE_DASHBOARD } from '../../lib/clientSupabaseSelects'
import { puedeUsar } from '../../lib/plans'
import { normWine } from '../../lib/textNormalize'
import { analizarMaridaje } from '../../lib/maridajeEngine'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import ConfirmationDialog from '../ConfirmationDialog'
import ResponsiveOverlay from '../ResponsiveOverlay'
import styles from '../module.module.css'
import simStyles from './simulador.module.css'
import PreviewCarta from './PreviewCarta'

const ESTADO_LABEL = { actual: 'Actual', nuevo: 'Nuevo', fuera: 'Fuera' }
const ESTADO_ORDER = { actual: 0, nuevo: 1, fuera: 2 }

function eur(valor) {
  if (!Number(valor)) return '—'
  return Number(valor).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function margenBotella(pvp, coste) {
  const p = Number(pvp), c = Number(coste)
  if (!p || !c) return null
  return Math.round(((p - c) / p) * 100)
}

function textoPlatoMaridaje(p) {
  return [p.nombre, p.categoria, p.descripcion].filter(Boolean).join(' ')
}

// ── Sugerencias automáticas: helpers fuera del componente ─────────

function normRegionAlgo(r) {
  return String(r || '').toLowerCase()
    .replace(/d\.o\.ca\./gi, '').replace(/d\.o\.p\./gi, '').replace(/d\.o\./gi, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Devuelve { anadir: [...], sustituir: [] }
// anadir    → vinos del catálogo que cubren huecos de tipo o región (Señal A)
// sustituir → vacío hasta que el simulador tenga datos de rotación (Señal B requiere
//             margen × popularidad; solo margen filtra incorrectamente los "caballos de batalla")
function generarSugerencias(lineas, catalogo) {
  const activas    = lineas.filter(l => l.estado !== 'fuera')
  const enBorrador = new Set(activas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))

  // Cobertura actual: tipo → Set<regionNorm>
  const coberturaRegion = {}
  for (const l of activas) {
    const tipo = (l.tipo || '').toLowerCase()
    if (!coberturaRegion[tipo]) coberturaRegion[tipo] = new Set()
    coberturaRegion[tipo].add(normRegionAlgo(l.region))
  }
  const tiposCubiertos = new Set(Object.keys(coberturaRegion))

  const sugsAnadir    = []
  const usedCatalogIds = new Set()
  const huecosSugeridos = new Set()

  // ── Señal A: huecos de tipo o región ─────────────────────────────
  for (const v of catalogo) {
    if (sugsAnadir.length >= 8) break
    if (enBorrador.has(v.id)) continue
    const tipo = (v.tipo || '').toLowerCase()
    const regionNorm = normRegionAlgo(v.region)
    if (!tipo) continue

    const claveHueco = !tiposCubiertos.has(tipo)
      ? `tipo_${tipo}`
      : (regionNorm && !coberturaRegion[tipo]?.has(regionNorm)) ? `region_${tipo}_${regionNorm}` : null

    if (claveHueco && !huecosSugeridos.has(claveHueco)) {
      sugsAnadir.push({
        key: v.id,
        vino: v,
        razon: !tiposCubiertos.has(tipo)
          ? `Sin ${v.tipo || tipo} en la carta`
          : `Sin ${v.tipo || tipo} de ${v.region || 'esta zona'}`,
        prioridad: !tiposCubiertos.has(tipo) ? 3 : 2,
      })
      usedCatalogIds.add(v.id)
      huecosSugeridos.add(claveHueco)
    }
  }

  return {
    anadir:    sugsAnadir.sort((a, b) => b.prioridad - a.prioridad),
    sustituir: [],   // Señal B activable cuando el simulador integre datos de rotación
  }
}

function computarPlatosVino(vino, platos, limite = 4) {
  const obj = { ...vino, activo: true, stock: null, precio_botella: Number(vino.precio_botella) > 0 ? vino.precio_botella : 20 }
  const catCount = {}
  return platos
    .filter(p => p.activo !== false)
    .map(p => {
      try {
        const a = analizarMaridaje(textoPlatoMaridaje(p), [obj])
        const r = a?.candidatos?.[0] || a?.recomendados?.[0]
        if (!r?.compatible) return null
        return { plato: p, motivo: r.motivo, score: Number(r.score) || 0 }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .filter(item => {
      const cat = item.plato.categoria || '—'
      catCount[cat] = (catCount[cat] || 0) + 1
      return catCount[cat] <= 2
    })
    .slice(0, limite)
}

export default function SimuladorCarta() {
  const [restaurante, setRestaurante] = useState(null)
  const [lineas, setLineas] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [guardando, setGuardando] = useState('')
  const [inlineEdit, setInlineEdit] = useState(null) // { id, campo, valor }
  const [confirmPublicar, setConfirmPublicar] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [celebracion, setCelebracion] = useState(null)   // { nuevos, retirados, deltaMargen }
  const [sustituyendoId, setSustituyendoId] = useState(null)
  const [catalogoSustituir, setCatalogoSustituir] = useState(null) // null=no cargado
  const [loadingCatalogoSustituir, setLoadingCatalogoSustituir] = useState(false)
  const [busquedaSustituir, setBusquedaSustituir] = useState('')
  const [revision, setRevision] = useState(undefined)
  const [revisionDismissed, setRevisionDismissed] = useState(false)
  const [vistaPrevia, setVistaPrevia] = useState(false)
  const [mensajeRevision, setMensajeRevision] = useState('')
  const [modalEnviarRevision, setModalEnviarRevision] = useState(false)
  const [enviandoRevision, setEnviandoRevision] = useState(false)
  const [platosMaridaje, setPlatosMaridaje] = useState(null)
  const [cargandoPlatos, setCargandoPlatos] = useState(false)
  const [maridajeVinoId, setMaridajeVinoId] = useState(null)
  const [mostrarBriefing, setMostrarBriefing] = useState(false)
  const [mostrarSugeridor, setMostrarSugeridor] = useState(false)
  const [sugerencias, setSugerencias] = useState(null)       // null=sin calcular, {}=calculado
  const [selSugerencias, setSelSugerencias] = useState(new Set())
  const [aplicandoSugerencias, setAplicandoSugerencias] = useState(false)
  const [descartandoSugerencias, setDescartandoSugerencias] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }

      const { data: rest } = await supabase
        .from('restaurantes')
        .select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
        .eq('email', email)
        .single()

      if (!rest) { setLoading(false); return }
      setRestaurante(rest)

      if (puedeUsar(rest, 'catalogo_consultor')) {
        const { data: { session } } = await supabase.auth.getSession()
        const t = session?.access_token
        const [resLineas, resRevision] = await Promise.all([
          fetch(
            `/api/simulador?${new URLSearchParams({ restaurante_id: rest.id })}`,
            { headers: { Authorization: `Bearer ${t}` } }
          ).catch(() => null),
          fetch(
            `/api/simulador/revision?${new URLSearchParams({ restaurante_id: rest.id })}`,
            { headers: { Authorization: `Bearer ${t}` } }
          ).catch(() => null),
        ])
        if (resLineas?.ok) {
          const json = await resLineas.json()
          setLineas(json.lineas || [])
        }
        if (resRevision?.ok) {
          const jr = await resRevision.json()
          setRevision(jr.revision || null)
        } else {
          setRevision(null)
        }
      } else {
        setRevision(null)
      }
      setLoading(false)
    }
    cargar()
  }, [])

  // ── Resumen calculado en tiempo real ───────────────────────────────
  const resumen = useMemo(() => {
    const activas = lineas.filter(l => l.estado !== 'fuera')
    const conMargen = activas.filter(l => Number(l.coste_compra) > 0 && Number(l.precio_botella) > 0)
    const margenMedio = conMargen.length
      ? Math.round(
          conMargen.reduce((sum, l) =>
            sum + ((Number(l.precio_botella) - Number(l.coste_compra)) / Number(l.precio_botella)) * 100, 0
          ) / conMargen.length
        )
      : null
    return {
      total: activas.length,
      nuevos: lineas.filter(l => l.estado === 'nuevo').length,
      retirados: lineas.filter(l => l.estado === 'fuera').length,
      margenMedio,
    }
  }, [lineas])

  // ── Comparación borrador vs carta oficial ─────────────────────────
  const comparacion = useMemo(() => {
    const tieneNuevos = lineas.some(l => l.estado === 'nuevo')
    const tieneFuera  = lineas.some(l => l.estado === 'fuera')
    if (!tieneNuevos && !tieneFuera) return null

    function margenMedioOf(lista) {
      const v = lista.filter(l => Number(l.precio_botella) > 0 && Number(l.coste_compra) > 0)
      if (!v.length) return null
      return Math.round(
        v.reduce((sum, l) =>
          sum + ((Number(l.precio_botella) - Number(l.coste_compra)) / Number(l.precio_botella)) * 100, 0
        ) / v.length
      )
    }

    const oficial  = lineas.filter(l => l.estado === 'actual' || l.estado === 'fuera')
    const borrador = lineas.filter(l => l.estado === 'actual' || l.estado === 'nuevo')

    const margenOficial  = margenMedioOf(oficial)
    const margenBorrador = margenMedioOf(borrador)
    const deltaMargen = (margenOficial !== null && margenBorrador !== null)
      ? margenBorrador - margenOficial
      : null

    const regionesOficial  = new Set(oficial.map(l => normWine(l.region)).filter(Boolean))
    const regionesBorrador = new Set(borrador.map(l => normWine(l.region)).filter(Boolean))
    const deltaRegiones = regionesBorrador.size - regionesOficial.size

    return { deltaMargen, deltaRegiones }
  }, [lineas])

  // ── Proyección de inversión inicial (solo vinos nuevos, 6 uds/ref.) ─
  const proyeccion = useMemo(() => {
    const nuevas = lineas.filter(l => l.estado === 'nuevo')
    if (!nuevas.length) return null
    const conCoste = nuevas.filter(l => Number(l.coste_compra) > 0)
    const sinCoste = nuevas.length - conCoste.length
    const total    = conCoste.reduce((sum, l) => sum + Number(l.coste_compra) * 6, 0)
    return { total, sinCoste, refs: nuevas.length }
  }, [lineas])

  // Map: id del vino "fuera" → línea "nuevo" que lo sustituye
  const sustitutoPorFueraId = useMemo(() => {
    const map = {}
    for (const l of lineas) {
      if (l.sustituye_a) map[l.sustituye_a] = l
    }
    return map
  }, [lineas])

  // Orden: actuals → pares (fuera + su nuevo) → fuera sin par → nuevos sin par
  const lineasOrdenadas = useMemo(() => {
    const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    const idsEnPar  = new Set(Object.values(sustitutoPorFueraId).map(l => l.id))

    const actuals       = lineas.filter(l => l.estado === 'actual').sort(porNombre)
    const fueraConPar   = lineas.filter(l => l.estado === 'fuera' && sustitutoPorFueraId[l.id]).sort(porNombre)
    const fueraSolos    = lineas.filter(l => l.estado === 'fuera' && !sustitutoPorFueraId[l.id]).sort(porNombre)
    const nuevosSolos   = lineas.filter(l => l.estado === 'nuevo' && !idsEnPar.has(l.id)).sort(porNombre)

    const result = [...actuals]
    for (const fuera of fueraConPar) {
      result.push(fuera)
      result.push(sustitutoPorFueraId[fuera.id])
    }
    result.push(...fueraSolos, ...nuevosSolos)
    return result
  }, [lineas, sustitutoPorFueraId])

  // Set de catalogo_vino_id ya presentes en el borrador (para el selector)
  const simEnBorradorSet = useMemo(
    () => new Set(lineas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id)),
    [lineas]
  )

  // Catálogo filtrado por búsqueda en el selector de sustitución
  const catalogoFiltradoSustituir = useMemo(() => {
    if (!catalogoSustituir) return []
    const q = busquedaSustituir.trim().toLowerCase()
    if (!q) return catalogoSustituir
    return catalogoSustituir.filter(v =>
      [v.nombre, v.bodega, v.tipo, v.region].some(f => f?.toLowerCase().includes(q))
    )
  }, [catalogoSustituir, busquedaSustituir])

  // ── Helpers de llamadas a la API ───────────────────────────────────
  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function patchLinea(id, cambios) {
    const t = await getToken()
    return fetch(`/api/simulador/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id, ...cambios }),
    })
  }

  async function deleteLinea(id) {
    const t = await getToken()
    return fetch(`/api/simulador/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id }),
    })
  }

  async function recargarLineas() {
    const t = await getToken()
    const res = await fetch(
      `/api/simulador?${new URLSearchParams({ restaurante_id: restaurante.id })}`,
      { headers: { Authorization: `Bearer ${t}` } }
    ).catch(() => null)
    if (res?.ok) {
      const json = await res.json()
      setLineas(json.lineas || [])
    }
  }

  async function publicar() {
    // Capturar stats antes de limpiar el estado (para la celebración)
    const statsAntes = {
      nuevos:     resumen.nuevos,
      retirados:  resumen.retirados,
      deltaMargen: comparacion?.deltaMargen ?? null,
    }

    setPublicando(true)
    const t = await getToken()
    const res = await fetch('/api/simulador/publicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id }),
    }).catch(() => null)

    if (!res?.ok) {
      setPublicando(false)
      setConfirmPublicar(false)
      setErrorMsg('No se pudo publicar la carta. Inténtalo de nuevo.')
      return
    }

    // Optimistic: quitar fuera y nuevo inmediatamente
    setLineas(prev => prev.filter(l => l.estado === 'actual'))
    setConfirmPublicar(false)
    setPublicando(false)

    // Celebración con los datos reales del cambio
    if (statsAntes.nuevos > 0 || statsAntes.retirados > 0) {
      setCelebracion(statsAntes)
      setTimeout(() => setCelebracion(null), 3500)
    } else {
      setSuccessMsg('¡Carta publicada! Los cambios ya están activos en tu bodega.')
      setTimeout(() => setSuccessMsg(''), 6000)
    }

    // Re-sincronizar para cargar los vinos recién creados como 'actual'
    await recargarLineas()
  }

  // ── Edición inline de precios ──────────────────────────────────────
  function startInline(linea, campo) {
    setInlineEdit({ id: linea.id, campo, valor: String(linea[campo] ?? '') })
  }

  async function saveInline() {
    if (!inlineEdit) return
    const { id, campo, valor } = inlineEdit
    const parsed = parseFloat(String(valor).replace(',', '.'))
    const nuevo = isNaN(parsed) || parsed < 0 ? null : parsed
    setInlineEdit(null)
    setLineas(prev => prev.map(l => l.id === id ? { ...l, [campo]: nuevo } : l))
    const res = await patchLinea(id, { [campo]: nuevo })
    if (!res.ok) setErrorMsg('No se pudo guardar el cambio de precio')
  }

  // ── Cambio de estado: actual ↔ fuera ───────────────────────────────
  async function cambiarEstado(linea, nuevoEstado) {
    setGuardando(linea.id)
    setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, estado: nuevoEstado } : l))
    const res = await patchLinea(linea.id, { estado: nuevoEstado })
    if (!res.ok) {
      setLineas(prev => prev.map(l => l.id === linea.id ? { ...l, estado: linea.estado } : l))
      setErrorMsg('No se pudo actualizar el estado')
    }
    setGuardando('')
  }

  // ── Eliminar línea nueva (DELETE real, no PATCH a 'fuera') ─────────
  async function eliminarNuevo(linea) {
    setGuardando(linea.id)
    setLineas(prev => prev.filter(l => l.id !== linea.id))
    const res = await deleteLinea(linea.id)
    if (!res.ok) {
      setLineas(prev =>
        [...prev, linea].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
      )
      setErrorMsg('No se pudo eliminar la referencia')
    }
    setGuardando('')
  }

  // ── Abrir selector "Sustituir por..." ─────────────────────────────
  async function abrirSustituir(linea) {
    setSustituyendoId(linea.id)
    setBusquedaSustituir('')
    if (catalogoSustituir !== null) return   // ya cargado, reusar
    setLoadingCatalogoSustituir(true)
    const { data } = await supabase
      .from('proveedor_catalogo_vinos')
      .select('id, nombre, bodega, tipo, region, anada, pvp_recomendado, coste_estimado')
      .eq('activo', true)
      .order('nombre')
    setCatalogoSustituir(data || [])
    setLoadingCatalogoSustituir(false)
  }

  // ── Ejecutar sustitución — atómica vía RPC, sin riesgo de estado partido ──
  async function handleSustituir(catalogoVino) {
    const lineaId = sustituyendoId
    setSustituyendoId(null)

    // Optimista: mostrar el par antes de que el servidor confirme
    setLineas(prev => prev.map(l => l.id === lineaId ? { ...l, estado: 'fuera' } : l))

    const t = await getToken()
    const res = await fetch('/api/simulador/sustituir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        restaurante_id:   restaurante.id,
        linea_fuera_id:   lineaId,
        catalogo_vino_id: catalogoVino.id,
      }),
    }).catch(() => null)

    if (!res?.ok) {
      // Revertir la actualización optimista — la BD no cambió (transacción fallida)
      setLineas(prev => prev.map(l => l.id === lineaId ? { ...l, estado: 'actual' } : l))
      const json = res ? await res.json().catch(() => null) : null
      setErrorMsg(json?.error || 'No se pudo realizar la sustitución. Inténtalo de nuevo.')
      return
    }

    const json = await res.json()
    setLineas(prev => [...prev, json.linea])
  }

  async function enviarRevision() {
    setEnviandoRevision(true)
    const t = await getToken()
    const res = await fetch('/api/simulador/revision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id, mensaje: mensajeRevision.trim() }),
    }).catch(() => null)
    setEnviandoRevision(false)
    if (!res?.ok) {
      const json = res ? await res.json().catch(() => null) : null
      setErrorMsg(json?.error || 'No se pudo enviar la revisión. Inténtalo de nuevo.')
      return
    }
    const json = await res.json()
    setRevision(json.revision)
    setRevisionDismissed(false)
    setModalEnviarRevision(false)
    setMensajeRevision('')
  }

  async function cargarPlatosMaridaje() {
    if (platosMaridaje !== null) return
    setCargandoPlatos(true)
    const { data } = await supabase
      .from('platos')
      .select('id, nombre, categoria, descripcion, precio, activo')
      .eq('restaurante_id', restaurante.id)
      .eq('activo', true)
      .order('categoria')
      .limit(100)
    setPlatosMaridaje(data || [])
    setCargandoPlatos(false)
  }

  // ── Sugerencias automáticas ────────────────────────────────────────

  async function abrirSugerencias() {
    setMostrarSugeridor(true)
    setSugerencias(null)

    let catalogo = catalogoSustituir
    if (catalogo === null) {
      setLoadingCatalogoSustituir(true)
      const t = await getToken()
      const res = await fetch(
        `/api/catalogo-consultor?${new URLSearchParams({ restaurante_id: restaurante.id })}`,
        { headers: { Authorization: `Bearer ${t}` } }
      ).catch(() => null)
      catalogo = res?.ok ? (await res.json()).vinos || [] : []
      setCatalogoSustituir(catalogo)
      setLoadingCatalogoSustituir(false)
    }

    const resultado = generarSugerencias(lineas, catalogo)
    setSugerencias(resultado)
    setSelSugerencias(new Set([
      ...resultado.anadir.map(s => s.key),
      ...resultado.sustituir.map(s => s.key),
    ]))
  }

  async function aplicarSugerencias() {
    if (!sugerencias || selSugerencias.size === 0) return
    setAplicandoSugerencias(true)
    const t = await getToken()

    const selectedAnadir    = sugerencias.anadir.filter(s => selSugerencias.has(s.key))
    const selectedSustituir = sugerencias.sustituir.filter(s => selSugerencias.has(s.key))

    await Promise.all([
      ...selectedAnadir.map(s =>
        fetch('/api/simulador/anadir-catalogo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({
            restaurante_id:   restaurante.id,
            catalogo_vino_id: s.vino.id,
            origen:           'sugerido_gap',
            force:            true,
          }),
        }).catch(() => null)
      ),
      ...selectedSustituir.map(s =>
        fetch('/api/simulador/sustituir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({
            restaurante_id:   restaurante.id,
            linea_fuera_id:   s.lineaActual.id,
            catalogo_vino_id: s.vino.id,
            origen:           'sugerido_sustitucion',
          }),
        }).catch(() => null)
      ),
    ])

    setAplicandoSugerencias(false)
    setMostrarSugeridor(false)
    setSugerencias(null)
    setSelSugerencias(new Set())
    await recargarLineas()
  }

  async function descartarSugerencias() {
    setDescartandoSugerencias(true)
    const t = await getToken()
    const res = await fetch('/api/simulador/descartar-sugerencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ restaurante_id: restaurante.id }),
    }).catch(() => null)
    setDescartandoSugerencias(false)
    if (res?.ok) {
      await recargarLineas()
    } else {
      setErrorMsg('No se pudieron descartar las sugerencias. Inténtalo de nuevo.')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  const isBlocked = revision?.estado === 'pendiente'
  if (loading) return <LoadingState title="Preparando el simulador…" />

  return (
    <FeatureGate restaurante={restaurante} feature="catalogo_consultor" title="Simulador de carta">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Carta pública"
        title="Simulador de carta"
        subtitle="Prepara el borrador de tu futura carta sin afectar a la que ven tus clientes."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(resumen.nuevos > 0 || resumen.retirados > 0) && (
              <button
                type="button"
                className={simStyles.accionBtn}
                onClick={() => setMostrarBriefing(true)}
              >
                Briefing de sala
              </button>
            )}
            {lineas.some(l => l.origen?.startsWith('sugerido')) && (
              <button
                type="button"
                className={simStyles.accionBtn}
                style={{ color: 'var(--cv-text-muted)', borderColor: '#e0d4bc' }}
                disabled={descartandoSugerencias}
                onClick={descartarSugerencias}
              >
                {descartandoSugerencias ? 'Descartando…' : 'Descartar sugerencias'}
              </button>
            )}
            <button
              type="button"
              className={simStyles.accionBtn}
              onClick={abrirSugerencias}
            >
              Sugerir carta
            </button>
            <button
              type="button"
              className={simStyles.accionBtn}
              onClick={() => setVistaPrevia(true)}
            >
              Vista previa
            </button>
            {revision === null && (
              <button
                type="button"
                className={simStyles.accionBtn}
                disabled={lineas.filter(l => l.estado === 'actual' || l.estado === 'nuevo').length === 0}
                onClick={() => { setMensajeRevision(''); setModalEnviarRevision(true) }}
              >
                Enviar al consultor
              </button>
            )}
            <button
              type="button"
              className={styles.primary}
              disabled={isBlocked || (resumen.nuevos === 0 && resumen.retirados === 0)}
              title={
                isBlocked ? 'Tienes una revisión pendiente con el consultor'
                : resumen.nuevos === 0 && resumen.retirados === 0 ? 'Sin cambios pendientes'
                : 'Publicar los cambios en la carta real'
              }
              onClick={() => setConfirmPublicar(true)}
            >
              Publicar como carta oficial
            </button>
          </div>
        }
      >
        {/* ── Resumen en vivo ───────────────────────────────── */}
        <div className={simStyles.summary}>
          <StatCard value={resumen.total} label="Referencias activas" />
          <StatCard
            value={resumen.nuevos}
            label="Nuevas"
            hint="Vienen del catálogo del consultor"
            valueStyle={resumen.nuevos > 0 ? { color: 'var(--cv-gold)' } : undefined}
          />
          <StatCard
            value={resumen.retirados}
            label="Para retirar"
            hint="Se ocultarán al publicar"
            valueStyle={resumen.retirados > 0 ? { color: 'var(--cv-red)' } : undefined}
          />
          <StatCard
            value={resumen.margenMedio !== null ? `${resumen.margenMedio} %` : '—'}
            label="Margen medio est."
            hint="Solo activas con coste registrado"
            valueStyle={
              resumen.margenMedio !== null
                ? { color: resumen.margenMedio >= 65 ? 'var(--cv-green)' : resumen.margenMedio < 55 ? 'var(--cv-red)' : undefined }
                : undefined
            }
          />
        </div>

        {/* ── Comparación borrador vs carta actual ──────────── */}
        {comparacion && (
          <div className={simStyles.comparacion}>
            <span className={simStyles.comparacionLabel}>Si publicas:</span>

            {comparacion.deltaMargen !== null ? (
              <span>
                Margen{' '}
                <span className={
                  comparacion.deltaMargen > 0 ? simStyles.comparacionPos
                  : comparacion.deltaMargen < 0 ? simStyles.comparacionNeg
                  : simStyles.comparacionNeutral
                }>
                  {comparacion.deltaMargen > 0 ? '+' : ''}{comparacion.deltaMargen} pp
                </span>
              </span>
            ) : (
              <span className={simStyles.comparacionNeutral}>
                registra costes en tu carta actual para comparar margen
              </span>
            )}

            {comparacion.deltaRegiones !== 0 && (
              <span>
                Regiones D.O.{' '}
                <span className={comparacion.deltaRegiones > 0 ? simStyles.comparacionPos : simStyles.comparacionNeg}>
                  {comparacion.deltaRegiones > 0 ? '+' : ''}{comparacion.deltaRegiones}
                </span>
              </span>
            )}

            {comparacion.deltaMargen === 0 && comparacion.deltaRegiones === 0 && (
              <span className={simStyles.comparacionNeutral}>sin cambios en margen ni regiones</span>
            )}
          </div>
        )}

        {/* ── Banner de revisión ─────────────────────────────── */}
        {revision?.estado === 'pendiente' && (
          <div className={`${simStyles.revisionBanner} ${simStyles.revisionBannerPendiente}`}>
            <span className={simStyles.revisionEyebrow}>En revisión con el consultor</span>
            <p className={simStyles.revisionTitle}>Borrador enviado — edición bloqueada</p>
            <p className={simStyles.revisionSub}>Recibirás el feedback por aquí en cuanto el consultor responda.</p>
            {revision.mensaje_restaurante && (
              <p className={simStyles.revisionSub} style={{ fontStyle: 'italic', marginTop: 2 }}>
                Tu nota: {revision.mensaje_restaurante}
              </p>
            )}
          </div>
        )}
        {revision?.estado === 'revisado' && !revisionDismissed && (
          <div className={`${simStyles.revisionBanner} ${simStyles.revisionBannerRevisado}`}>
            <span className={`${simStyles.revisionEyebrow} ${simStyles.revisionEyebrowRevisado}`}>
              Feedback del consultor
            </span>
            {revision.respuesta_consultor && (
              <div className={simStyles.revisionRespuesta}>{revision.respuesta_consultor}</div>
            )}
            <div className={simStyles.revisionActions}>
              <button
                type="button"
                className={simStyles.accionBtn}
                onClick={() => { setMensajeRevision(''); setModalEnviarRevision(true) }}
              >
                Enviar nueva revisión
              </button>
              <button
                type="button"
                className={simStyles.accionBtn}
                style={{ color: 'var(--cv-text-muted)', borderColor: '#e0d4bc' }}
                onClick={() => setRevisionDismissed(true)}
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* ── Tabla ─────────────────────────────────────────── */}
        {lineas.length === 0 ? (
          <section className={styles.empty}>
            <p>No hay ninguna referencia en el simulador todavía.</p>
            <p>
              Los vinos activos de tu carta aparecerán aquí automáticamente la primera vez que cargues el simulador.
              Abre el <strong>Catálogo del consultor</strong> en Bodega y pulsa <strong>+ Simular</strong> en cualquier referencia para añadir novedades al borrador.
            </p>
          </section>
        ) : (
          <div className={simStyles.tableWrap}>
            <table className={simStyles.table}>
              <thead>
                <tr>
                  <th className={simStyles.thVino}>Vino</th>
                  <th>Tipo</th>
                  <th>D.O. / Zona</th>
                  <th>Añada</th>
                  <th className={simStyles.thNum}>PVP bot. €</th>
                  <th className={simStyles.thNum}>PVP copa €</th>
                  <th className={simStyles.thNum}>Coste €</th>
                  <th className={simStyles.thNum}>Mrg. %</th>
                  <th className={simStyles.thEstado}>Estado</th>
                  <th className={simStyles.thAccionWide}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {lineasOrdenadas.map(linea => {
                  const mrg = margenBotella(linea.precio_botella, linea.coste_compra)
                  const isFuera    = linea.estado === 'fuera'
                  const isNuevo    = linea.estado === 'nuevo'
                  const esSustituto = isNuevo && !!linea.sustituye_a
                  const busy = guardando === linea.id
                  return (
                    <tr
                      key={linea.id}
                      className={[
                        isFuera      ? simStyles.rowFuera    : '',
                        esSustituto  ? simStyles.rowSustituto : isNuevo ? simStyles.rowNuevo : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {/* Nombre + bodega */}
                      <td>
                        <div className={simStyles.nombreWrap}>
                          {esSustituto && (
                            <span className={simStyles.sustitutoIndicador}>↳ Sustituye a</span>
                          )}
                          <span className={isFuera ? simStyles.tachado : ''}>{linea.nombre}</span>
                          {linea.bodega && <span className={simStyles.bodega}>{linea.bodega}</span>}
                          {linea.origen?.startsWith('sugerido') && (
                            <span className={simStyles.origenAuto}>✦ Auto</span>
                          )}
                        </div>
                      </td>

                      <td>{linea.tipo || '—'}</td>
                      <td>{linea.region || '—'}</td>
                      <td>{linea.anada || '—'}</td>

                      {/* Precios editables inline */}
                      {['precio_botella', 'precio_copa', 'coste_compra'].map(campo => {
                        const editando = inlineEdit?.id === linea.id && inlineEdit?.campo === campo
                        return (
                          <td
                            key={campo}
                            className={`${simStyles.tdNum} ${simStyles.tdEditable}`}
                            title="Pulsa para editar"
                            onClick={() => !editando && !isBlocked && startInline(linea, campo)}
                          >
                            {editando ? (
                              <input
                                autoFocus
                                className={simStyles.inlineInput}
                                type="number"
                                min="0"
                                step="0.5"
                                value={inlineEdit.valor}
                                onChange={e => setInlineEdit({ ...inlineEdit, valor: e.target.value })}
                                onBlur={saveInline}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); saveInline() }
                                  if (e.key === 'Escape') setInlineEdit(null)
                                }}
                              />
                            ) : eur(linea[campo])}
                          </td>
                        )
                      })}

                      {/* Margen calculado */}
                      <td className={simStyles.tdNum}>
                        {mrg !== null ? (
                          <span style={mrg >= 65 ? { color: 'var(--cv-green)' } : mrg < 55 ? { color: 'var(--cv-red)' } : {}}>
                            {mrg} %
                          </span>
                        ) : '—'}
                      </td>

                      {/* Badge de estado */}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`${simStyles.badge} ${simStyles[`badge_${linea.estado}`]}`}>
                          {ESTADO_LABEL[linea.estado]}
                        </span>
                      </td>

                      {/* Acción: Quitar / Restaurar / Sustituir + Platos */}
                      <td style={{ textAlign: 'center' }}>
                        {isFuera ? (
                          <div className={simStyles.accionGroup}>
                            <button
                              type="button"
                              className={simStyles.accionBtn}
                              disabled={busy || isBlocked}
                              onClick={() => cambiarEstado(linea, 'actual')}
                            >
                              Restaurar
                            </button>
                            <button
                              type="button"
                              className={simStyles.maridajeBtn}
                              onClick={async () => { await cargarPlatosMaridaje(); setMaridajeVinoId(linea.id) }}
                            >
                              Platos
                            </button>
                          </div>
                        ) : isNuevo ? (
                          <div className={simStyles.accionGroup}>
                            <button
                              type="button"
                              className={`${simStyles.accionBtn} ${simStyles.accionBtnDanger}`}
                              disabled={busy || isBlocked}
                              onClick={() => eliminarNuevo(linea)}
                            >
                              Quitar
                            </button>
                            <button
                              type="button"
                              className={simStyles.maridajeBtn}
                              onClick={async () => { await cargarPlatosMaridaje(); setMaridajeVinoId(linea.id) }}
                            >
                              Platos
                            </button>
                          </div>
                        ) : (
                          <div className={simStyles.accionGroup}>
                            <button
                              type="button"
                              className={`${simStyles.accionBtn} ${simStyles.accionBtnDanger}`}
                              disabled={busy || isBlocked}
                              onClick={() => cambiarEstado(linea, 'fuera')}
                            >
                              Quitar
                            </button>
                            <button
                              type="button"
                              className={simStyles.accionBtn}
                              disabled={busy || isBlocked}
                              onClick={() => abrirSustituir(linea)}
                            >
                              Sustituir
                            </button>
                            <button
                              type="button"
                              className={simStyles.maridajeBtn}
                              onClick={async () => { await cargarPlatosMaridaje(); setMaridajeVinoId(linea.id) }}
                            >
                              Platos
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Proyección de inversión inicial ──────────────── */}
        {proyeccion && (
          <div className={simStyles.proyeccion}>
            <span>Inversión estimada</span>
            <span className={simStyles.proyeccionTotal}>{eur(proyeccion.total)}</span>
            <span className={simStyles.proyeccionNota}>
              · estimado a 6 uds/referencia
              {proyeccion.sinCoste > 0 && ` · ${proyeccion.sinCoste} ref. sin coste no incluidas`}
            </span>
          </div>
        )}

        {/* ── Toast de éxito ────────────────────────────────── */}
        {successMsg && (
          <div className={styles.inlineToast} role="status" style={{ marginTop: 12, borderColor: 'var(--cv-green)', color: 'var(--cv-green)' }}>
            {successMsg}
            <button type="button" onClick={() => setSuccessMsg('')} aria-label="Cerrar aviso">Cerrar</button>
          </div>
        )}

        {/* ── Toast de error ────────────────────────────────── */}
        {errorMsg && (
          <div className={styles.inlineToast} role="alert" style={{ marginTop: 12 }}>
            {errorMsg}
            <button type="button" onClick={() => setErrorMsg('')} aria-label="Cerrar aviso">Cerrar</button>
          </div>
        )}

        {/* ── Vista previa tipo carta real ──────────────────── */}
        <ResponsiveOverlay
          open={vistaPrevia}
          onClose={() => setVistaPrevia(false)}
          size="modal"
          eyebrow="Simulador"
          title="Vista previa del borrador"
        >
          <PreviewCarta lineas={lineas} restaurante={restaurante} />
        </ResponsiveOverlay>

        {/* ── Modal: enviar borrador al consultor ───────────── */}
        <ResponsiveOverlay
          open={modalEnviarRevision}
          onClose={() => !enviandoRevision && setModalEnviarRevision(false)}
          size="modal"
          eyebrow="Consultor"
          title="Enviar borrador al consultor"
          description="El consultor revisará tu borrador y te enviará feedback personalizado."
        >
          <textarea
            className={simStyles.revisionModalTextarea}
            rows={4}
            placeholder="(Opcional) Añade una nota o pregunta al consultor…"
            value={mensajeRevision}
            onChange={e => setMensajeRevision(e.target.value)}
            maxLength={2000}
            disabled={enviandoRevision}
          />
          <p className={simStyles.revisionModalHint}>
            Mientras la revisión esté pendiente no podrás editar ni publicar el borrador.
          </p>
          <div className={simStyles.revisionModalActions}>
            <button
              type="button"
              className={simStyles.accionBtn}
              disabled={enviandoRevision}
              onClick={() => setModalEnviarRevision(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={enviandoRevision}
              onClick={enviarRevision}
            >
              {enviandoRevision ? 'Enviando…' : 'Enviar borrador'}
            </button>
          </div>
        </ResponsiveOverlay>

        {/* ── Modal selector "Sustituir por..." ────────────── */}
        <ResponsiveOverlay
          open={!!sustituyendoId}
          onClose={() => setSustituyendoId(null)}
          size="modal"
          eyebrow="Simulador"
          title="Sustituir por..."
          description="Elige el vino del catálogo que reemplazará al seleccionado. El vino actual quedará marcado como retirado."
        >
          <input
            className={simStyles.sustituirSearch}
            placeholder="Buscar por nombre, bodega, tipo, zona…"
            value={busquedaSustituir}
            onChange={e => setBusquedaSustituir(e.target.value)}
            autoFocus
          />
          {loadingCatalogoSustituir ? (
            <div className={simStyles.sustituirVacio}>Cargando catálogo…</div>
          ) : catalogoFiltradoSustituir.length === 0 ? (
            <div className={simStyles.sustituirVacio}>
              {busquedaSustituir ? 'Sin resultados para esa búsqueda.' : 'El catálogo del consultor está vacío.'}
            </div>
          ) : (
            <div className={simStyles.sustituirLista}>
              {catalogoFiltradoSustituir.map(v => {
                const yaEnBorrador = simEnBorradorSet.has(v.id)
                return (
                  <div key={v.id} className={simStyles.sustituirItem}>
                    <div className={simStyles.sustituirItemInfo}>
                      <div className={simStyles.sustituirItemNombre}>{v.nombre}</div>
                      <div className={simStyles.sustituirItemMeta}>
                        {[v.bodega, v.tipo, v.region].filter(Boolean).join(' · ')}
                        {Number(v.pvp_recomendado) > 0 && ` · ${eur(v.pvp_recomendado)}`}
                      </div>
                    </div>
                    {yaEnBorrador ? (
                      <span className={simStyles.sustituirYaEnBorrador}>Ya en borrador</span>
                    ) : (
                      <button
                        type="button"
                        className={simStyles.accionBtn}
                        onClick={() => handleSustituir(v)}
                      >
                        Elegir
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ResponsiveOverlay>

        {/* ── Modal: maridajes para un vino ─────────────────── */}
        <ResponsiveOverlay
          open={!!maridajeVinoId}
          onClose={() => setMaridajeVinoId(null)}
          size="modal"
          eyebrow="Maridaje"
          title="Platos compatibles"
        >
          {(() => {
            const linea = lineas.find(l => l.id === maridajeVinoId)
            if (!linea) return null
            if (cargandoPlatos) return <p className={simStyles.maridajeVacio}>Cargando platos…</p>
            if (!platosMaridaje?.length) return (
              <p className={simStyles.maridajeVacio}>
                {platosMaridaje === null ? 'Cargando platos…' : 'No hay platos en la carta de este restaurante.'}
              </p>
            )
            const resultados = computarPlatosVino(linea, platosMaridaje)
            if (!resultados.length) return (
              <p className={simStyles.maridajeVacio}>No se encontraron platos especialmente compatibles con este vino.</p>
            )
            return (
              <>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--cv-text-muted)' }}>{linea.nombre}</p>
                <div className={simStyles.maridajeLista}>
                  {resultados.map(({ plato, motivo }) => (
                    <div key={plato.id} className={simStyles.maridajeItem}>
                      <p className={simStyles.maridajeItemNombre}>{plato.nombre}</p>
                      {plato.categoria && <p className={simStyles.maridajeItemMeta}>{plato.categoria}</p>}
                      {motivo && <p className={simStyles.maridajeMotivo}>{motivo}</p>}
                    </div>
                  ))}
                </div>
                <p className={simStyles.maridajeFuente}>Motor Chartier KB · WSET — análisis estructural</p>
              </>
            )
          })()}
        </ResponsiveOverlay>

        {/* ── Modal: sugerencias automáticas ───────────────────── */}
        <ResponsiveOverlay
          open={mostrarSugeridor}
          onClose={() => { if (!aplicandoSugerencias) { setMostrarSugeridor(false) } }}
          size="modal"
          eyebrow="Simulador"
          title="Propuesta automática"
          description="Selecciona las sugerencias que quieres incorporar al borrador."
        >
          {sugerencias === null ? (
            <p className={simStyles.maridajeVacio}>Analizando carta y catálogo…</p>
          ) : sugerencias.anadir.length === 0 && sugerencias.sustituir.length === 0 ? (
            <div className={simStyles.sugerenciasVacio}>
              {catalogoSustituir?.length === 0
                ? 'El catálogo del consultor está vacío. Añade vinos al catálogo para poder generar sugerencias automáticas.'
                : 'El borrador ya cubre todos los tipos y zonas disponibles en el catálogo del consultor.'}
            </div>
          ) : (
            <>
              {sugerencias.anadir.length > 0 && (
                <div className={simStyles.sugerenciasSeccion}>
                  <p className={simStyles.sugerenciasEyebrow}>
                    Añadir al borrador ({sugerencias.anadir.length})
                  </p>
                  {sugerencias.anadir.map(s => (
                    <label key={s.key} className={simStyles.sugerenciaItem}>
                      <input
                        type="checkbox"
                        checked={selSugerencias.has(s.key)}
                        onChange={e => setSelSugerencias(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(s.key) : next.delete(s.key)
                          return next
                        })}
                      />
                      <div className={simStyles.sugerenciaInfo}>
                        <div className={simStyles.sugerenciaNombre}>{s.vino.nombre}</div>
                        <div className={simStyles.sugerenciaMeta}>
                          {[s.vino.bodega, s.vino.tipo, s.vino.region].filter(Boolean).join(' · ')}
                          {Number(s.vino.pvp_recomendado) > 0 ? ` · ${eur(s.vino.pvp_recomendado)}` : ''}
                        </div>
                        <div className={simStyles.sugerenciaRazon}>{s.razon}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {sugerencias.sustituir.length > 0 && (
                <div className={simStyles.sugerenciasSeccion}>
                  <p className={`${simStyles.sugerenciasEyebrow} ${simStyles.sugerenciasEyebrowOrange}`}>
                    Sustituir — margen bajo o sin coste ({sugerencias.sustituir.length})
                  </p>
                  {sugerencias.sustituir.map(s => (
                    <label key={s.key} className={simStyles.sugerenciaItem}>
                      <input
                        type="checkbox"
                        checked={selSugerencias.has(s.key)}
                        onChange={e => setSelSugerencias(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(s.key) : next.delete(s.key)
                          return next
                        })}
                      />
                      <div className={simStyles.sugerenciaInfo}>
                        <div className={simStyles.sugerenciaReemplaza}>
                          Reemplaza: {s.lineaActual.nombre}
                          <span className={simStyles.sugerenciaReemplazaMeta}> · {s.razon}</span>
                        </div>
                        <div className={simStyles.sugerenciaNombre}>{s.vino.nombre}</div>
                        <div className={simStyles.sugerenciaMeta}>
                          {[s.vino.bodega, s.vino.tipo, s.vino.region].filter(Boolean).join(' · ')}
                          {Number(s.vino.pvp_recomendado) > 0 ? ` · ${eur(s.vino.pvp_recomendado)}` : ''}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className={simStyles.sugerenciasFooter}>
                <button
                  type="button"
                  className={simStyles.accionBtn}
                  disabled={aplicandoSugerencias}
                  onClick={() => setMostrarSugeridor(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={aplicandoSugerencias || selSugerencias.size === 0}
                  onClick={aplicarSugerencias}
                >
                  {aplicandoSugerencias
                    ? 'Aplicando…'
                    : `Aplicar ${selSugerencias.size} sugerencia${selSugerencias.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </ResponsiveOverlay>

        {/* ── Modal: briefing de sala ────────────────────────── */}
        <ResponsiveOverlay
          open={mostrarBriefing}
          onClose={() => setMostrarBriefing(false)}
          size="modal"
          eyebrow="Sala"
          title="Briefing para sala"
          description="Cambios pendientes de publicar — para briefing antes de servicio."
        >
          {lineas.filter(l => l.estado === 'nuevo').length > 0 && (
            <div className={simStyles.briefingSection}>
              <p className={simStyles.briefingEyebrow}>Incorporaciones</p>
              {lineas.filter(l => l.estado === 'nuevo').map(v => {
                const compatibles = platosMaridaje ? computarPlatosVino(v, platosMaridaje, 3) : []
                return (
                  <div key={v.id} className={`${simStyles.briefingVinoCard} ${simStyles.briefingVinoNuevo}`}>
                    <p className={simStyles.briefingVinoNombre}>
                      {v.nombre}{v.anada ? ` ${v.anada}` : ''}
                    </p>
                    <p className={simStyles.briefingVinoMeta}>
                      {[v.bodega, v.tipo, v.region].filter(Boolean).join(' · ')}
                    </p>
                    {(Number(v.precio_copa) > 0 || Number(v.precio_botella) > 0) && (
                      <p className={simStyles.briefingVinoPrecio}>
                        {Number(v.precio_copa) > 0 ? `Copa ${eur(v.precio_copa)}` : ''}
                        {Number(v.precio_copa) > 0 && Number(v.precio_botella) > 0 ? ' · ' : ''}
                        {Number(v.precio_botella) > 0 ? `Bot. ${eur(v.precio_botella)}` : ''}
                      </p>
                    )}
                    {compatibles.length > 0 && (
                      <p className={simStyles.briefingPlatos}>
                        Marida con: {compatibles.map(c => c.plato.nombre).join(', ')}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {lineas.filter(l => l.estado === 'fuera').length > 0 && (
            <div className={simStyles.briefingSection}>
              <p className={`${simStyles.briefingEyebrow} ${simStyles.briefingEyebrowRed}`}>Se retiran</p>
              {lineas.filter(l => l.estado === 'fuera').map(v => (
                <div key={v.id} className={simStyles.briefingVinoCard}>
                  <p className={simStyles.briefingVinoNombre}>
                    {v.nombre}{v.anada ? ` ${v.anada}` : ''}
                  </p>
                  <p className={simStyles.briefingVinoMeta}>
                    {[v.bodega, v.tipo, v.region].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className={simStyles.briefingPrintBtn}
            onClick={() => window.print()}
          >
            Imprimir / guardar PDF
          </button>
        </ResponsiveOverlay>

        {/* ── Diálogo de confirmación de publicación ────────── */}
        <ConfirmationDialog
          open={confirmPublicar}
          onClose={() => setConfirmPublicar(false)}
          onConfirm={publicar}
          title="Publicar como carta oficial"
          description={[
            resumen.nuevos > 0
              ? `${resumen.nuevos} ${resumen.nuevos === 1 ? 'vino nuevo se añadirá' : 'vinos nuevos se añadirán'} a tu bodega.`
              : null,
            resumen.retirados > 0
              ? `${resumen.retirados} ${resumen.retirados === 1 ? 'referencia se ocultará' : 'referencias se ocultarán'} de tu carta.`
              : null,
            'Esta acción no se puede deshacer.',
          ].filter(Boolean).join(' ')}
          confirmLabel="Publicar carta"
          busy={publicando}
        />
      </ModuleShell>

      {/* ── Micro-celebración al publicar ─────────────────── */}
      {celebracion && (
        <div
          className={simStyles.celebBackdrop}
          onClick={() => setCelebracion(null)}
          role="status"
          aria-live="polite"
        >
          <div className={simStyles.celebCard} onClick={e => e.stopPropagation()}>
            <span className={simStyles.celebCheckmark}>✓</span>
            <p className={simStyles.celebTitulo}>Carta actualizada</p>
            <p className={simStyles.celebSub}>Los cambios ya están activos en tu bodega.</p>
            {(celebracion.nuevos > 0 || celebracion.retirados > 0 || celebracion.deltaMargen !== null) && (
              <div className={simStyles.celebStats}>
                {celebracion.nuevos > 0 && (
                  <div className={simStyles.celebStat}>
                    <span className={`${simStyles.celebStatVal} ${simStyles.celebStatValGold}`}>
                      +{celebracion.nuevos}
                    </span>
                    <span className={simStyles.celebStatLabel}>
                      {celebracion.nuevos === 1 ? 'nuevo' : 'nuevos'}
                    </span>
                  </div>
                )}
                {celebracion.retirados > 0 && (
                  <div className={simStyles.celebStat}>
                    <span className={simStyles.celebStatVal}>{celebracion.retirados}</span>
                    <span className={simStyles.celebStatLabel}>
                      {celebracion.retirados === 1 ? 'retirado' : 'retirados'}
                    </span>
                  </div>
                )}
                {celebracion.deltaMargen !== null && celebracion.deltaMargen !== 0 && (
                  <div className={simStyles.celebStat}>
                    <span className={`${simStyles.celebStatVal} ${
                      celebracion.deltaMargen > 0 ? simStyles.celebStatValGreen : simStyles.celebStatValRed
                    }`}>
                      {celebracion.deltaMargen > 0 ? '+' : ''}{celebracion.deltaMargen} pp
                    </span>
                    <span className={simStyles.celebStatLabel}>margen</span>
                  </div>
                )}
              </div>
            )}
            <p className={simStyles.celebDismiss}>Pulsa en cualquier lugar para cerrar</p>
          </div>
        </div>
      )}
    </FeatureGate>
  )
}
