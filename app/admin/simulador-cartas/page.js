'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'

const ESCENARIOS = {
  conservador: {
    label: 'Conservador',
    bajas: 4,
    altas: 6,
    objetivoMargen: 62,
    descripcion: 'Ajuste fino con pocas bajas y referencias muy defendibles.'
  },
  optimizado: {
    label: 'Optimizado',
    bajas: 8,
    altas: 12,
    objetivoMargen: 65,
    descripcion: 'Reequilibra la carta, mejora margen y cubre huecos claros.'
  },
  ambicioso: {
    label: 'Ambicioso',
    bajas: 14,
    altas: 18,
    objetivoMargen: 68,
    descripcion: 'Replanteamiento amplio para una propuesta comercial potente.'
  }
}

const TIPOS_OBJETIVO = [
  { key: 'tinto', label: 'Tintos', minPct: 0.35 },
  { key: 'blanco', label: 'Blancos', minPct: 0.24 },
  { key: 'espumoso', label: 'Espumosos', minPct: 0.08 },
  { key: 'rosado', label: 'Rosados', minPct: 0.04 },
  { key: 'generoso', label: 'Generosos / dulces', minPct: 0.03 }
]

function normalizar(valor = '') {
  return String(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const limpio = String(valor).replace(/\s/g, '').replace(/[^\d,.-]/g, '')
  if (!limpio) return 0
  const decimal = limpio.includes(',') && limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(/,/g, '')
  const n = Number(decimal)
  return Number.isFinite(n) ? n : 0
}

function dinero(valor) {
  const n = numero(valor)
  if (!n) return '-'
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function porcentaje(valor) {
  if (!Number.isFinite(valor)) return '-'
  return `${Math.round(valor)} %`
}

function tipoCanon(valor = '') {
  const texto = normalizar(valor)
  if (!texto) return 'otros'
  if (texto.includes('blanc') || texto.includes('white')) return 'blanco'
  if (texto.includes('tint') || texto.includes('red')) return 'tinto'
  if (texto.includes('ros') || texto.includes('rose')) return 'rosado'
  if (texto.includes('espum') || texto.includes('cava') || texto.includes('champ') || texto.includes('spark')) return 'espumoso'
  if (texto.includes('dulce') || texto.includes('generoso') || texto.includes('jerez') || texto.includes('porto') || texto.includes('sherry')) return 'generoso'
  if (texto.includes('vermut')) return 'generoso'
  return texto.split(' ')[0] || 'otros'
}

function labelTipo(tipo) {
  return TIPOS_OBJETIVO.find(item => item.key === tipo)?.label || 'Otros'
}

function pvpBotella(coste) {
  const c = numero(coste)
  if (c <= 0) return null
  const iva = 1.10
  const margen = pvpSinIva => ((pvpSinIva - c) / pvpSinIva) * 100
  if (c <= 6) {
    const pvpSinIva = c * 3.5
    return { pvp: pvpSinIva * iva, regla: 'x3,5', margen: margen(pvpSinIva) }
  }
  if (c <= 11) {
    const pvpSinIva = 2 * c + 9
    return { pvp: pvpSinIva * iva, regla: 'x2+9', margen: margen(pvpSinIva) }
  }
  const pvpSinIva = c + 20
  return { pvp: pvpSinIva * iva, regla: '+20', margen: margen(pvpSinIva) }
}

function margenDesdePrecio(coste, precio) {
  const c = numero(coste)
  const p = numero(precio)
  if (!c || !p || p <= 0) return null
  const pvpSinIva = p / 1.10
  return ((pvpSinIva - c) / pvpSinIva) * 100
}

function claveVino(vino) {
  return normalizar([vino.nombre, vino.bodega].filter(Boolean).join(' '))
}

function textoZona(vino) {
  return [vino.region, vino.zona, vino.uva, vino.anada].filter(Boolean).join(' · ')
}

function proveedorNombre(vino, proveedoresPorId = {}) {
  return proveedoresPorId[vino.proveedor_id]?.nombre || vino.proveedores_vino?.nombre || vino.proveedor || 'Proveedor'
}

function activoCarta(vino) {
  return vino.activo !== false && vino.visible !== false && vino.oculto !== true
}

function metricasCarta(vinos) {
  const activos = vinos.filter(activoCarta)
  const conPrecio = activos.filter(vino => numero(vino.precio_botella) > 0)
  const margenes = activos
    .map(vino => margenDesdePrecio(vino.coste_compra, vino.precio_botella))
    .filter(valor => valor !== null && Number.isFinite(valor))
  const tipos = activos.reduce((acc, vino) => {
    const tipo = tipoCanon(vino.tipo)
    acc[tipo] = (acc[tipo] || 0) + 1
    return acc
  }, {})

  return {
    total: activos.length,
    conPrecio: conPrecio.length,
    sinPrecio: activos.length - conPrecio.length,
    sinCoste: activos.filter(vino => numero(vino.coste_compra) <= 0).length,
    porCopa: activos.filter(vino => vino.por_copa || numero(vino.precio_copa) > 0).length,
    pvpMedio: conPrecio.length ? conPrecio.reduce((sum, vino) => sum + numero(vino.precio_botella), 0) / conPrecio.length : 0,
    margenMedio: margenes.length ? margenes.reduce((sum, margen) => sum + margen, 0) / margenes.length : null,
    tipos
  }
}

function razonesBaja(vino, metricas) {
  const razones = []
  const margen = margenDesdePrecio(vino.coste_compra, vino.precio_botella)
  const stock = Number(vino.stock)
  if (margen !== null && margen < 50) razones.push(`margen bajo (${porcentaje(margen)})`)
  if (numero(vino.precio_botella) <= 0) razones.push('sin PVP de botella')
  if (numero(vino.coste_compra) <= 0) razones.push('sin coste de compra')
  if (Number.isFinite(stock) && stock <= 0) razones.push('stock a cero')
  const tipo = tipoCanon(vino.tipo)
  const pesoTipo = metricas.total ? (metricas.tipos[tipo] || 0) / metricas.total : 0
  if (pesoTipo > 0.52) razones.push(`${labelTipo(tipo).toLowerCase()} muy dominante en carta`)
  if (!razones.length) razones.push('referencia revisable para abrir hueco a novedad')
  return razones
}

function scoreBaja(vino, metricas) {
  const margen = margenDesdePrecio(vino.coste_compra, vino.precio_botella)
  let score = 0
  if (margen !== null && margen < 45) score += 45 - margen
  if (margen !== null && margen < 55) score += 8
  if (numero(vino.precio_botella) <= 0) score += 18
  if (numero(vino.coste_compra) <= 0) score += 14
  const stock = Number(vino.stock)
  if (Number.isFinite(stock) && stock <= 0) score += 14
  if (vino.por_copa || numero(vino.precio_copa) > 0) score -= 6
  const tipo = tipoCanon(vino.tipo)
  const pesoTipo = metricas.total ? (metricas.tipos[tipo] || 0) / metricas.total : 0
  if (pesoTipo > 0.52) score += 6
  return score
}

function carenciasTipo(metricas) {
  return TIPOS_OBJETIVO.reduce((acc, item) => {
    const actual = metricas.total ? (metricas.tipos[item.key] || 0) / metricas.total : 0
    acc[item.key] = Math.max(0, item.minPct - actual)
    return acc
  }, {})
}

function scoreCatalogo(vino, metricas, proveedoresPorId) {
  const coste = numero(vino.coste_estimado)
  const rb = pvpBotella(coste)
  const margen = rb?.margen ?? null
  const tipo = tipoCanon(vino.tipo)
  const huecos = carenciasTipo(metricas)
  let score = 0
  if (coste > 0) score += 30
  if (vino.favorito) score += 12
  if (margen !== null) score += Math.max(0, margen - 50)
  if (huecos[tipo]) score += huecos[tipo] * 180
  if (normalizar(vino.disponibilidad).includes('agot')) score -= 30
  if (normalizar(vino.disponibilidad).includes('cup')) score -= 6
  if (normalizar(vino.formato).includes('magnum')) score -= 8
  if (!vino.nombre) score -= 50
  if (!proveedorNombre(vino, proveedoresPorId)) score -= 3
  return score
}

function razonesAlta(vino, metricas, proveedoresPorId) {
  const coste = numero(vino.coste_estimado)
  const rb = pvpBotella(coste)
  const margen = rb?.margen ?? null
  const tipo = tipoCanon(vino.tipo)
  const huecos = carenciasTipo(metricas)
  const razones = []
  if (huecos[tipo]) razones.push(`refuerza ${labelTipo(tipo).toLowerCase()}`)
  if (margen !== null && margen >= 60) razones.push(`margen objetivo ${porcentaje(margen)}`)
  if (vino.favorito) razones.push('marcada como favorita en catalogo')
  if (vino.formato) razones.push(`formato ${vino.formato}`)
  if (!razones.length) razones.push(`novedad defendible de ${proveedorNombre(vino, proveedoresPorId)}`)
  return razones
}

function generarSimulacion({ vinosRestaurante, vinosCatalogo, proveedoresPorId, proveedorId, escenario, soloConCoste, soloFavoritos }) {
  const cfg = ESCENARIOS[escenario] || ESCENARIOS.optimizado
  const actuales = vinosRestaurante.filter(activoCarta)
  const metricas = metricasCarta(actuales)
  const clavesActuales = new Set(actuales.map(claveVino).filter(Boolean))
  const bajas = actuales
    .map(vino => ({
      vino,
      score: scoreBaja(vino, metricas),
      margen: margenDesdePrecio(vino.coste_compra, vino.precio_botella),
      razones: razonesBaja(vino, metricas)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(cfg.bajas, Math.max(2, Math.ceil(actuales.length * 0.18))))

  const candidatos = vinosCatalogo
    .filter(vino => vino.activo !== false)
    .filter(vino => !proveedorId || String(vino.proveedor_id) === String(proveedorId))
    .filter(vino => !soloConCoste || numero(vino.coste_estimado) > 0)
    .filter(vino => !soloFavoritos || vino.favorito)
    .filter(vino => !clavesActuales.has(claveVino(vino)))
    .map(vino => {
      const coste = numero(vino.coste_estimado)
      const rb = pvpBotella(coste)
      return {
        vino,
        coste,
        pvp: rb?.pvp || numero(vino.pvp_recomendado),
        regla: rb?.regla || 'catalogo',
        margen: rb?.margen ?? null,
        score: scoreCatalogo(vino, metricas, proveedoresPorId),
        razones: razonesAlta(vino, metricas, proveedoresPorId)
      }
    })
    .sort((a, b) => {
      const score = b.score - a.score
      if (score !== 0) return score
      return (a.coste || Number.MAX_SAFE_INTEGER) - (b.coste || Number.MAX_SAFE_INTEGER)
    })

  const usadas = new Set()
  const altas = []
  for (const candidato of candidatos) {
    const clave = claveVino(candidato.vino)
    if (!clave || usadas.has(clave)) continue
    usadas.add(clave)
    altas.push(candidato)
    if (altas.length >= cfg.altas) break
  }

  const bajasClaves = new Set(bajas.map(item => String(item.vino.id)))
  const conservados = actuales.filter(vino => !bajasClaves.has(String(vino.id)))
  const simulados = [
    ...conservados.map(vino => ({
      origen: 'actual',
      nombre: vino.nombre,
      bodega: vino.bodega,
      tipo: tipoCanon(vino.tipo),
      zona: textoZona(vino),
      proveedor: vino.proveedor || '',
      coste: numero(vino.coste_compra),
      pvp: numero(vino.precio_botella),
      margen: margenDesdePrecio(vino.coste_compra, vino.precio_botella)
    })),
    ...altas.map(item => ({
      origen: 'alta',
      nombre: item.vino.nombre,
      bodega: item.vino.bodega,
      tipo: tipoCanon(item.vino.tipo),
      zona: textoZona(item.vino),
      proveedor: proveedorNombre(item.vino, proveedoresPorId),
      coste: item.coste,
      pvp: item.pvp,
      margen: item.margen
    }))
  ]

  const metricasSimuladas = metricasCarta(simulados.map(vino => ({
    activo: true,
    nombre: vino.nombre,
    tipo: vino.tipo,
    coste_compra: vino.coste,
    precio_botella: vino.pvp
  })))

  return { cfg, metricas, bajas, altas, simulados, metricasSimuladas }
}

function agruparCarta(vinos) {
  return vinos.reduce((acc, vino) => {
    const tipo = vino.tipo || 'otros'
    if (!acc[tipo]) acc[tipo] = []
    acc[tipo].push(vino)
    return acc
  }, {})
}

function textoPropuesta(restaurante, simulacion) {
  if (!simulacion) return ''
  const lineas = [
    `Propuesta de carta para ${restaurante?.nombre || 'restaurante'}`,
    '',
    `Escenario: ${simulacion.cfg.label}`,
    `Carta actual: ${simulacion.metricas.total} refs · PVP medio ${dinero(simulacion.metricas.pvpMedio)} · margen medio ${porcentaje(simulacion.metricas.margenMedio ?? NaN)}`,
    `Carta propuesta: ${simulacion.metricasSimuladas.total} refs · PVP medio ${dinero(simulacion.metricasSimuladas.pvpMedio)} · margen medio ${porcentaje(simulacion.metricasSimuladas.margenMedio ?? NaN)}`,
    '',
    'Bajas propuestas:'
  ]
  simulacion.bajas.forEach(item => {
    lineas.push(`- ${item.vino.nombre} (${item.razones.join(', ')})`)
  })
  lineas.push('', 'Altas propuestas:')
  simulacion.altas.forEach(item => {
    lineas.push(`- ${item.vino.nombre}${item.vino.bodega ? ` · ${item.vino.bodega}` : ''} · ${proveedorNombre(item.vino)} · coste ${dinero(item.coste)} · PVP ${dinero(item.pvp)} (${item.razones.join(', ')})`)
  })
  return lineas.join('\n')
}

async function seleccionarVinosCarta() {
  let from = 0
  const rows = []

  while (true) {
    const { data, error } = await supabase
      .from('vinos')
      .select('*')
      .order('nombre')
      .range(from, from + 999)

    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
    from += 1000
  }

  return rows
}

function leerFavoritosLocales() {
  if (typeof window === 'undefined') return new Set()
  try { return new Set(JSON.parse(localStorage.getItem('favoritos_catalogo') || '[]').map(String)) } catch { return new Set() }
}

function Stat({ label, value, trend }) {
  return (
    <div className="sim-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {trend ? <em>{trend}</em> : null}
    </div>
  )
}

export default function SimuladorCartas() {
  const [restaurantes, setRestaurantes] = useState([])
  const [vinos, setVinos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [catalogo, setCatalogo] = useState([])
  const [restauranteId, setRestauranteId] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [escenario, setEscenario] = useState('optimizado')
  const [soloConCoste, setSoloConCoste] = useState(true)
  const [soloFavoritos, setSoloFavoritos] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [simulacionManual, setSimulacionManual] = useState(null)
  const [bajasSeleccionadas, setBajasSeleccionadas] = useState([])
  const [altasSeleccionadas, setAltasSeleccionadas] = useState([])
  const [bajasManuales, setBajasManuales] = useState([])
  const [altasManuales, setAltasManuales] = useState([])
  const [busquedaBaja, setBusquedaBaja] = useState('')
  const [busquedaAlta, setBusquedaAlta] = useState('')
  const [selectorAltasAbierto, setSelectorAltasAbierto] = useState(false)
  const [selectorBusqueda, setSelectorBusqueda] = useState('')
  const [selectorProveedor, setSelectorProveedor] = useState('')
  const [selectorTipo, setSelectorTipo] = useState('')
  const [selectorSoloFavoritos, setSelectorSoloFavoritos] = useState(true)
  const [selectorSoloConCoste, setSelectorSoloConCoste] = useState(true)
  const [selectorAltas, setSelectorAltas] = useState([])

  async function tokenAdmin() {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData?.session?.access_token
  }

  useEffect(() => {
    async function cargar() {
      setLoading(true)
      setError('')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }

      const token = await tokenAdmin()
      const [{ data: rests, error: restError }, vinosResult, catalogoRes] = await Promise.all([
        supabase.from('restaurantes').select('*').order('nombre'),
        seleccionarVinosCarta()
          .then(data => ({ data }))
          .catch(error => ({ error })),
        fetch('/api/admin/proveedores', { headers: { Authorization: `Bearer ${token}` } })
      ])
      const { data: vinosData, error: vinosError } = vinosResult

      if (restError || vinosError) {
        setError(restError?.message || vinosError?.message || 'No se pudieron cargar los datos.')
        setLoading(false)
        return
      }

      const catalogoData = await catalogoRes.json().catch(() => ({}))
      if (!catalogoRes.ok) {
        setError(catalogoData.error || 'No se pudo cargar el catalogo de proveedores.')
      }

      const restaurantesData = rests || []
      setRestaurantes(restaurantesData)
      setVinos(vinosData || [])
      const favoritosLocales = leerFavoritosLocales()
      setProveedores(catalogoRes.ok ? catalogoData.proveedores || [] : [])
      setCatalogo(catalogoRes.ok ? (catalogoData.vinos || []).map(vino => ({
        ...vino,
        favorito: vino.favorito || favoritosLocales.has(String(vino.id))
      })) : [])

      const params = new URLSearchParams(window.location.search)
      const restauranteUrl = params.get('restaurante')
      setRestauranteId(restauranteUrl || restaurantesData[0]?.id || '')
      setLoading(false)
    }

    cargar()
  }, [])

  const proveedoresPorId = useMemo(() => {
    return proveedores.reduce((acc, proveedor) => {
      acc[proveedor.id] = proveedor
      return acc
    }, {})
  }, [proveedores])

  const restaurante = useMemo(() => {
    return restaurantes.find(item => String(item.id) === String(restauranteId))
  }, [restaurantes, restauranteId])

  const vinosRestaurante = useMemo(() => {
    return vinos.filter(vino => String(vino.restaurante_id) === String(restauranteId))
  }, [vinos, restauranteId])

  const simulacionAuto = useMemo(() => {
    if (!restauranteId) return null
    return generarSimulacion({
      vinosRestaurante,
      vinosCatalogo: catalogo,
      proveedoresPorId,
      proveedorId,
      escenario,
      soloConCoste,
      soloFavoritos
    })
  }, [restauranteId, vinosRestaurante, catalogo, proveedoresPorId, proveedorId, escenario, soloConCoste, soloFavoritos])

  const simulacion = simulacionManual || simulacionAuto
  const bajasSet = useMemo(() => new Set(bajasSeleccionadas.map(String)), [bajasSeleccionadas])
  const altasSet = useMemo(() => new Set(altasSeleccionadas.map(String)), [altasSeleccionadas])

  const bajasDisponibles = useMemo(() => {
    const mapa = new Map()
    ;[...(simulacion?.bajas || []), ...bajasManuales].forEach(item => {
      if (item?.vino?.id) mapa.set(String(item.vino.id), item)
    })
    return Array.from(mapa.values())
  }, [simulacion, bajasManuales])

  const altasDisponibles = useMemo(() => {
    const mapa = new Map()
    ;[...(simulacion?.altas || []), ...altasManuales].forEach(item => {
      if (item?.vino?.id) mapa.set(String(item.vino.id), item)
    })
    return Array.from(mapa.values())
  }, [simulacion, altasManuales])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!simulacion) {
        setBajasSeleccionadas([])
        setAltasSeleccionadas([])
        return
      }
      setBajasSeleccionadas(simulacion.bajas.map(item => String(item.vino.id)))
      setAltasSeleccionadas(simulacion.altas.map(item => String(item.vino.id)))
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [simulacion])

  const simulacionEditada = useMemo(() => {
    if (!simulacion) return null
    const bajas = bajasDisponibles.filter(item => bajasSet.has(String(item.vino.id)))
    const altas = altasDisponibles.filter(item => altasSet.has(String(item.vino.id)))
    const bajasIds = new Set(bajas.map(item => String(item.vino.id)))
    const conservados = vinosRestaurante.filter(vino => activoCarta(vino) && !bajasIds.has(String(vino.id)))
    const simulados = [
      ...conservados.map(vino => ({
        origen: 'actual',
        nombre: vino.nombre,
        bodega: vino.bodega,
        tipo: tipoCanon(vino.tipo),
        zona: textoZona(vino),
        proveedor: vino.proveedor || '',
        coste: numero(vino.coste_compra),
        pvp: numero(vino.precio_botella),
        margen: margenDesdePrecio(vino.coste_compra, vino.precio_botella)
      })),
      ...altas.map(item => ({
        origen: 'alta',
        nombre: item.vino.nombre,
        bodega: item.vino.bodega,
        tipo: tipoCanon(item.vino.tipo),
        zona: textoZona(item.vino),
        proveedor: proveedorNombre(item.vino, proveedoresPorId),
        coste: item.coste,
        pvp: item.pvp,
        margen: item.margen
      }))
    ]
    const metricasSimuladas = metricasCarta(simulados.map(vino => ({
      activo: true,
      nombre: vino.nombre,
      tipo: vino.tipo,
      coste_compra: vino.coste,
      precio_botella: vino.pvp
    })))

    return { ...simulacion, bajas, altas, simulados, metricasSimuladas }
  }, [simulacion, bajasDisponibles, altasDisponibles, bajasSet, altasSet, vinosRestaurante, proveedoresPorId])

  const cartaAgrupada = simulacionEditada ? agruparCarta(simulacionEditada.simulados) : {}

  const catalogoManualBase = useMemo(() => {
    const existentes = new Set(altasDisponibles.map(item => String(item.vino.id)))
    return catalogo
      .filter(vino => vino.activo !== false)
      .filter(vino => !existentes.has(String(vino.id)))
      .filter(vino => !proveedorId || String(vino.proveedor_id) === String(proveedorId))
      .filter(vino => !soloConCoste || numero(vino.coste_estimado) > 0)
      .filter(vino => !soloFavoritos || vino.favorito)
  }, [catalogo, altasDisponibles, proveedorId, soloConCoste, soloFavoritos])

  const catalogoManual = useMemo(() => {
    const terminos = normalizar(busquedaAlta).split(' ').filter(Boolean)
    const base = !terminos.length
      ? (soloFavoritos ? catalogoManualBase : [])
      : catalogoManualBase.filter(vino => {
        const texto = normalizar([
          vino.nombre,
          vino.bodega,
          vino.region,
          vino.tipo,
          vino.uva,
          vino.formato,
          vino.referencia,
          vino.disponibilidad,
          vino.notas,
          proveedorNombre(vino, proveedoresPorId)
        ].filter(Boolean).join(' '))
        return terminos.every(termino => texto.includes(termino))
      })
    return base
      .sort((a, b) => {
        const proveedorA = proveedorNombre(a, proveedoresPorId)
        const proveedorB = proveedorNombre(b, proveedoresPorId)
        return normalizar(`${proveedorA} ${a.bodega || ''} ${a.nombre || ''}`)
          .localeCompare(normalizar(`${proveedorB} ${b.bodega || ''} ${b.nombre || ''}`))
      })
      .slice(0, soloFavoritos ? 300 : 100)
  }, [catalogoManualBase, busquedaAlta, soloFavoritos, proveedoresPorId])

  const totalFavoritosDisponibles = useMemo(() => {
    return catalogoManualBase.filter(vino => vino.favorito).length
  }, [catalogoManualBase])

  const tiposSelector = useMemo(() => {
    const map = new Map()
    catalogo
      .filter(vino => vino.activo !== false)
      .forEach(vino => {
        const key = tipoCanon(vino.tipo)
        map.set(key, labelTipo(key))
      })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [catalogo])

  const selectorAltasSet = useMemo(() => new Set(selectorAltas.map(String)), [selectorAltas])

  const catalogoSelector = useMemo(() => {
    const existentes = new Set(altasDisponibles.map(item => String(item.vino.id)))
    const terminos = normalizar(selectorBusqueda).split(' ').filter(Boolean)
    return catalogo
      .filter(vino => vino.activo !== false)
      .filter(vino => !existentes.has(String(vino.id)))
      .filter(vino => !selectorProveedor || String(vino.proveedor_id) === String(selectorProveedor))
      .filter(vino => !selectorTipo || tipoCanon(vino.tipo) === selectorTipo)
      .filter(vino => !selectorSoloConCoste || numero(vino.coste_estimado) > 0)
      .filter(vino => !selectorSoloFavoritos || vino.favorito)
      .filter(vino => {
        if (!terminos.length) return selectorSoloFavoritos
        const texto = normalizar([
          vino.nombre,
          vino.bodega,
          vino.region,
          vino.tipo,
          vino.uva,
          vino.formato,
          vino.referencia,
          vino.disponibilidad,
          vino.notas,
          proveedorNombre(vino, proveedoresPorId)
        ].filter(Boolean).join(' '))
        return terminos.every(termino => texto.includes(termino))
      })
      .sort((a, b) => {
        const selA = selectorAltasSet.has(String(a.id)) ? 0 : 1
        const selB = selectorAltasSet.has(String(b.id)) ? 0 : 1
        if (selA !== selB) return selA - selB
        return normalizar(`${proveedorNombre(a, proveedoresPorId)} ${a.bodega || ''} ${a.nombre || ''}`)
          .localeCompare(normalizar(`${proveedorNombre(b, proveedoresPorId)} ${b.bodega || ''} ${b.nombre || ''}`))
      })
      .slice(0, 400)
  }, [catalogo, altasDisponibles, selectorBusqueda, selectorProveedor, selectorTipo, selectorSoloConCoste, selectorSoloFavoritos, selectorAltasSet, proveedoresPorId])

  const selectorSeleccionados = useMemo(() => {
    const porId = new Map(catalogo.map(vino => [String(vino.id), vino]))
    return selectorAltas.map(id => porId.get(String(id))).filter(Boolean)
  }, [catalogo, selectorAltas])

  const vinosBajaManual = useMemo(() => {
    const terminos = normalizar(busquedaBaja).split(' ').filter(Boolean)
    if (!terminos.length) return []
    const existentes = new Set(bajasDisponibles.map(item => String(item.vino.id)))
    return vinosRestaurante
      .filter(activoCarta)
      .filter(vino => !existentes.has(String(vino.id)))
      .filter(vino => {
        const texto = normalizar([
          vino.nombre,
          vino.bodega,
          vino.region,
          vino.tipo,
          vino.proveedor
        ].filter(Boolean).join(' '))
        return terminos.every(termino => texto.includes(termino))
      })
      .slice(0, 80)
  }, [vinosRestaurante, bajasDisponibles, busquedaBaja])

  function generar() {
    setStatus('')
    setBajasManuales([])
    setAltasManuales([])
    setBusquedaBaja('')
    setBusquedaAlta('')
    setSimulacionManual(generarSimulacion({
      vinosRestaurante,
      vinosCatalogo: catalogo,
      proveedoresPorId,
      proveedorId,
      escenario,
      soloConCoste,
      soloFavoritos
    }))
  }

  function limpiarManual() {
    setStatus('')
    setSimulacionManual(null)
    setBajasManuales([])
    setAltasManuales([])
    setBusquedaBaja('')
    setBusquedaAlta('')
  }

  function toggleBaja(id) {
    setStatus('')
    const clave = String(id)
    setBajasSeleccionadas(prev => prev.includes(clave) ? prev.filter(item => item !== clave) : [...prev, clave])
  }

  function toggleAlta(id) {
    setStatus('')
    const clave = String(id)
    setAltasSeleccionadas(prev => prev.includes(clave) ? prev.filter(item => item !== clave) : [...prev, clave])
  }

  function abrirSelectorAltas() {
    setSelectorBusqueda('')
    setSelectorProveedor(proveedorId || '')
    setSelectorTipo('')
    setSelectorSoloFavoritos(soloFavoritos)
    setSelectorSoloConCoste(soloConCoste)
    setSelectorAltas([])
    setSelectorAltasAbierto(true)
  }

  function toggleSelectorAlta(id) {
    const clave = String(id)
    setSelectorAltas(prev => prev.includes(clave) ? prev.filter(item => item !== clave) : [...prev, clave])
  }

  function limpiarSelectorAltas() {
    setSelectorBusqueda('')
    setSelectorProveedor('')
    setSelectorTipo('')
    setSelectorSoloFavoritos(true)
    setSelectorSoloConCoste(true)
    setSelectorAltas([])
  }

  function altaDesdeCatalogo(vino) {
    const coste = numero(vino.coste_estimado)
    const rb = pvpBotella(coste)
    return {
      vino,
      coste,
      pvp: rb?.pvp || numero(vino.pvp_recomendado),
      regla: rb?.regla || 'catalogo',
      margen: rb?.margen ?? margenDesdePrecio(coste, vino.pvp_recomendado),
      score: 99,
      razones: ['seleccionada manualmente desde catalogo']
    }
  }

  function agregarBajaManual(vino) {
    const clave = String(vino.id)
    if (!bajasDisponibles.some(item => String(item.vino.id) === clave)) {
      setBajasManuales(prev => [...prev, {
        vino,
        score: 99,
        margen: margenDesdePrecio(vino.coste_compra, vino.precio_botella),
        razones: ['seleccionada manualmente para revisar']
      }])
    }
    setBajasSeleccionadas(prev => prev.includes(clave) ? prev : [...prev, clave])
    setBusquedaBaja('')
    setStatus('Baja añadida a la propuesta.')
  }

  function agregarAltaManual(vino) {
    const clave = String(vino.id)
    if (!altasDisponibles.some(item => String(item.vino.id) === clave)) {
      setAltasManuales(prev => [...prev, altaDesdeCatalogo(vino)])
    }
    setAltasSeleccionadas(prev => prev.includes(clave) ? prev : [...prev, clave])
    setBusquedaAlta('')
    setStatus('Alta añadida a la propuesta.')
  }

  function confirmarSelectorAltas() {
    const existentes = new Set(altasDisponibles.map(item => String(item.vino.id)))
    const nuevas = selectorSeleccionados.filter(vino => !existentes.has(String(vino.id)))
    const ids = nuevas.map(vino => String(vino.id))
    if (nuevas.length) {
      setAltasManuales(prev => [...prev, ...nuevas.map(altaDesdeCatalogo)])
      setAltasSeleccionadas(prev => Array.from(new Set([...prev.map(String), ...ids])))
    }
    setSelectorAltas([])
    setSelectorAltasAbierto(false)
    setStatus(nuevas.length ? `${nuevas.length} altas añadidas a la propuesta.` : 'No se añadieron nuevas referencias.')
  }

  async function copiarPropuesta() {
    if (!simulacionEditada) return
    const texto = textoPropuesta(restaurante, simulacionEditada)
    await navigator.clipboard.writeText(texto)
    setStatus('Propuesta copiada al portapapeles.')
  }

  async function guardarPropuestas() {
    if (!simulacionEditada || !restauranteId) return
    setGuardando(true)
    setError('')
    setStatus('')
    const token = await tokenAdmin()
    const propuestas = [
      ...simulacionEditada.bajas.map(item => ({
        restaurante_id: restauranteId,
        titulo: `Revisar o retirar ${item.vino.nombre}`,
        vino: item.vino.nombre || '',
        tipo: 'Retirar referencia',
        zona: item.vino.region || item.vino.zona || '',
        proveedor_sugerido: item.vino.proveedor || '',
        coste_estimado: numero(item.vino.coste_compra),
        precio_recomendado: numero(item.vino.precio_botella),
        margen_objetivo: Math.round(item.margen || 0),
        motivo: item.razones.join('. '),
        prioridad: item.score >= 24 ? 'alta' : 'media',
        estado: 'propuesta'
      })),
      ...simulacionEditada.altas.map(item => ({
        restaurante_id: restauranteId,
        titulo: `Incorporar ${item.vino.nombre}`,
        vino: item.vino.nombre || '',
        tipo: item.vino.tipo || 'Alta de catalogo',
        zona: item.vino.region || '',
        proveedor_sugerido: proveedorNombre(item.vino, proveedoresPorId),
        coste_estimado: item.coste,
        precio_recomendado: item.pvp,
        margen_objetivo: Math.round(item.margen || 0),
        motivo: item.razones.join('. '),
        prioridad: item.score >= 44 ? 'alta' : 'media',
        estado: 'propuesta'
      }))
    ]

    let creadas = 0
    for (const propuesta of propuestas) {
      const res = await fetch('/api/admin/propuestas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(propuesta)
      })
      if (res.ok) creadas += 1
    }

    setGuardando(false)
    setStatus(`Guardadas ${creadas} propuestas internas para ${restaurante?.nombre || 'el restaurante'}.`)
  }

  if (loading) {
    return (
      <main className="sim-page">
        <div className="sim-loading">Cargando simulador de cartas...</div>
      </main>
    )
  }

  return (
    <main className="sim-page">
      <section className="sim-hero no-print">
        <div>
          <p className="eyebrow">Consultoria de carta</p>
          <h1>Simulador de cartas para restaurantes</h1>
          <p>{simulacion?.cfg.descripcion}</p>
        </div>
        <div className="sim-hero-actions">
          <button type="button" className="sim-btn sim-btn-secondary" onClick={copiarPropuesta} disabled={!simulacionEditada}>Copiar propuesta</button>
          <button type="button" className="sim-btn sim-btn-secondary" onClick={() => window.print()} disabled={!simulacionEditada}>Imprimir / PDF</button>
          <button type="button" className="sim-btn sim-btn-primary" onClick={guardarPropuestas} disabled={!simulacionEditada || guardando}>
            {guardando ? 'Guardando...' : 'Guardar propuestas'}
          </button>
        </div>
      </section>

      {error ? <div className="sim-alert sim-alert-error no-print">{error}</div> : null}
      {status ? <div className="sim-alert sim-alert-ok no-print">{status}</div> : null}

      <section className="sim-controls no-print">
        <label>
          Restaurante
          <select value={restauranteId} onChange={event => { setRestauranteId(event.target.value); limpiarManual() }}>
            {restaurantes.map(rest => <option key={rest.id} value={rest.id}>{rest.nombre}</option>)}
          </select>
        </label>
        <label>
          Escenario
          <select value={escenario} onChange={event => { setEscenario(event.target.value); limpiarManual() }}>
            {Object.entries(ESCENARIOS).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>
        </label>
        <label>
          Proveedor
          <select value={proveedorId} onChange={event => { setProveedorId(event.target.value); limpiarManual() }}>
            <option value="">Todos los proveedores</option>
            {proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
          </select>
        </label>
        <label className="sim-check">
          <input type="checkbox" checked={soloConCoste} onChange={event => { setSoloConCoste(event.target.checked); limpiarManual() }} />
          Solo catalogo con coste
        </label>
        <label className="sim-check">
          <input type="checkbox" checked={soloFavoritos} onChange={event => { setSoloFavoritos(event.target.checked); limpiarManual() }} />
          Solo favoritos
        </label>
        <button type="button" className="sim-btn sim-btn-primary" onClick={generar}>Generar simulacion</button>
      </section>

      {simulacion && simulacionEditada ? (
        <>
          <section className="sim-manual-grid no-print">
            <article className="sim-panel">
              <div className="sim-panel-head">
                <h2>Añadir altas manualmente</h2>
                <span>{soloFavoritos ? `${totalFavoritosDisponibles} favoritos` : `${catalogoManualBase.length} refs disponibles`}</span>
              </div>
              <div className="sim-selector-entry">
                <strong>{simulacionEditada.altas.length} altas incluidas</strong>
                <span>Filtra el catalogo, marca varias referencias y recogelos en la propuesta de una vez.</span>
                <button type="button" className="sim-btn sim-btn-primary" onClick={abrirSelectorAltas}>Abrir selector de catalogo</button>
              </div>
              <div className="sim-search-box">
                <input
                  value={busquedaAlta}
                  onChange={event => setBusquedaAlta(event.target.value)}
                  placeholder="Buscar por vino, bodega, zona, uva o proveedor..."
                />
              </div>
              <div className="sim-search-meta">
                {busquedaAlta.trim()
                  ? <span>{catalogoManual.length} resultados mostrados</span>
                  : <span>{soloFavoritos ? `${catalogoManual.length} favoritos disponibles` : 'Escribe para buscar en el catalogo filtrado'}</span>}
                {soloFavoritos ? <button type="button" onClick={() => setSoloFavoritos(false)}>Ver todo</button> : null}
              </div>
              <div className="sim-pick-list">
                {catalogoManual.map(vino => {
                  const coste = numero(vino.coste_estimado)
                  const rb = pvpBotella(coste)
                  return (
                    <button type="button" key={vino.id} onClick={() => agregarAltaManual(vino)}>
                      <strong>{vino.nombre}</strong>
                      <span>{[vino.bodega, vino.region, vino.formato, proveedorNombre(vino, proveedoresPorId)].filter(Boolean).join(' · ')}</span>
                      <em>{dinero(coste)} · {rb ? dinero(rb.pvp) : dinero(vino.pvp_recomendado)}</em>
                    </button>
                  )
                })}
                {!busquedaAlta.trim() && !soloFavoritos ? <p>Busca por vino, bodega, proveedor, zona, uva, formato o referencia.</p> : null}
                {!busquedaAlta.trim() && soloFavoritos && catalogoManual.length === 0 ? <p>No hay favoritos disponibles con estos filtros.</p> : null}
                {busquedaAlta.trim() && catalogoManual.length === 0 ? <p>No hay referencias con ese filtro. Revisa favoritos, proveedor o coste.</p> : null}
              </div>
            </article>

            <article className="sim-panel">
              <div className="sim-panel-head">
                <h2>Marcar bajas manualmente</h2>
                <span>{vinosRestaurante.filter(activoCarta).length} refs carta</span>
              </div>
              <div className="sim-search-box">
                <input
                  value={busquedaBaja}
                  onChange={event => setBusquedaBaja(event.target.value)}
                  placeholder="Buscar una referencia de la carta actual..."
                />
              </div>
              <div className="sim-search-meta">
                {busquedaBaja.trim()
                  ? <span>{vinosBajaManual.length} resultados mostrados</span>
                  : <span>Escribe para buscar en la carta actual</span>}
              </div>
              <div className="sim-pick-list">
                {vinosBajaManual.map(vino => (
                  <button type="button" key={vino.id} onClick={() => agregarBajaManual(vino)}>
                    <strong>{vino.nombre}</strong>
                    <span>{[vino.bodega, vino.region, vino.tipo, vino.proveedor].filter(Boolean).join(' · ')}</span>
                    <em>{dinero(vino.coste_compra)} · {dinero(vino.precio_botella)}</em>
                  </button>
                ))}
                {!busquedaBaja.trim() ? <p>Busca por vino, bodega, zona, tipo o proveedor.</p> : null}
                {busquedaBaja.trim() && vinosBajaManual.length === 0 ? <p>No hay referencias con ese filtro.</p> : null}
              </div>
            </article>
          </section>

          <section className="sim-stats no-print">
            <Stat label="Referencias actuales" value={simulacion.metricas.total} />
            <Stat label="PVP medio actual" value={dinero(simulacion.metricas.pvpMedio)} />
            <Stat label="Margen medio actual" value={porcentaje(simulacion.metricas.margenMedio ?? NaN)} />
            <Stat label="Referencias finales" value={simulacionEditada.metricasSimuladas.total} trend={`${simulacionEditada.altas.length} altas · ${simulacionEditada.bajas.length} bajas`} />
            <Stat label="PVP medio final" value={dinero(simulacionEditada.metricasSimuladas.pvpMedio)} />
            <Stat label="Margen medio final" value={porcentaje(simulacionEditada.metricasSimuladas.margenMedio ?? NaN)} />
          </section>

          <section className="sim-workgrid no-print">
            <article className="sim-panel">
              <div className="sim-panel-head">
                <h2>Bajas propuestas</h2>
                <div className="sim-panel-tools">
                  <button type="button" onClick={() => setBajasSeleccionadas(bajasDisponibles.map(item => String(item.vino.id)))}>Todas</button>
                  <button type="button" onClick={() => setBajasSeleccionadas([])}>Ninguna</button>
                  <span>{simulacionEditada.bajas.length}/{bajasDisponibles.length} incluidas</span>
                </div>
              </div>
              <div className="sim-table sim-table-bajas">
                <div className="sim-table-head">
                  <span></span>
                  <span>Vino</span>
                  <span>Coste</span>
                  <span>PVP</span>
                  <span>Margen</span>
                  <span>Motivo</span>
                </div>
                {bajasDisponibles.map(item => (
                  <div className={`sim-table-row ${bajasSet.has(String(item.vino.id)) ? '' : 'is-muted'}`} key={item.vino.id}>
                    <label className="sim-row-check" title="Incluir en propuesta">
                      <input type="checkbox" checked={bajasSet.has(String(item.vino.id))} onChange={() => toggleBaja(item.vino.id)} />
                    </label>
                    <strong>{item.vino.nombre}</strong>
                    <span>{dinero(item.vino.coste_compra)}</span>
                    <span>{dinero(item.vino.precio_botella)}</span>
                    <span>{porcentaje(item.margen ?? NaN)}</span>
                    <span>{item.razones.join(' · ')}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="sim-panel">
              <div className="sim-panel-head">
                <h2>Altas desde catalogo</h2>
                <div className="sim-panel-tools">
                  <button type="button" onClick={() => setAltasSeleccionadas(altasDisponibles.map(item => String(item.vino.id)))}>Todas</button>
                  <button type="button" onClick={() => setAltasSeleccionadas([])}>Ninguna</button>
                  <span>{simulacionEditada.altas.length}/{altasDisponibles.length} incluidas</span>
                </div>
              </div>
              <div className="sim-table sim-table-altas">
                <div className="sim-table-head">
                  <span></span>
                  <span>Vino</span>
                  <span>Proveedor</span>
                  <span>Coste</span>
                  <span>PVP</span>
                  <span>Motivo</span>
                </div>
                {altasDisponibles.map(item => (
                  <div className={`sim-table-row ${altasSet.has(String(item.vino.id)) ? '' : 'is-muted'}`} key={item.vino.id}>
                    <label className="sim-row-check" title="Incluir en propuesta">
                      <input type="checkbox" checked={altasSet.has(String(item.vino.id))} onChange={() => toggleAlta(item.vino.id)} />
                    </label>
                    <strong>
                      {item.vino.nombre}
                      <small>{[item.vino.bodega, item.vino.region, item.vino.formato].filter(Boolean).join(' · ')}</small>
                    </strong>
                    <span>{proveedorNombre(item.vino, proveedoresPorId)}</span>
                    <span>{dinero(item.coste)}</span>
                    <span>{dinero(item.pvp)} <small>{item.regla}</small></span>
                    <span>{item.razones.join(' · ')}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="sim-client-proposal">
            <div className="sim-proposal-head">
              <div>
                <p>Propuesta de carta</p>
                <h2>{restaurante?.nombre || 'Restaurante'}</h2>
                <span>{restaurante?.ciudad || restaurante?.provincia || 'Carta simulada'} · Escenario {simulacion.cfg.label}</span>
              </div>
              <div>
                <strong>{simulacionEditada.metricasSimuladas.total}</strong>
                <span>referencias finales</span>
              </div>
            </div>

            <div className="sim-client-summary">
              <span>Altas incluidas <strong>{simulacionEditada.altas.length}</strong></span>
              <span>Bajas incluidas <strong>{simulacionEditada.bajas.length}</strong></span>
              <span>Margen medio <strong>{porcentaje(simulacionEditada.metricasSimuladas.margenMedio ?? NaN)}</strong></span>
              <span>PVP medio <strong>{dinero(simulacionEditada.metricasSimuladas.pvpMedio)}</strong></span>
            </div>

            <div className="sim-client-grid">
              {Object.entries(cartaAgrupada).map(([tipo, vinosGrupo]) => (
                <section key={tipo} className="sim-menu-section">
                  <h3>{labelTipo(tipo)}</h3>
                  {vinosGrupo
                    .sort((a, b) => (a.pvp || 0) - (b.pvp || 0))
                    .map((vino, index) => (
                      <div className={`sim-menu-row ${vino.origen === 'alta' ? 'is-new' : ''}`} key={`${tipo}-${vino.nombre}-${index}`}>
                        <div>
                          <strong>{vino.nombre}</strong>
                          <span>{[vino.bodega, vino.zona, vino.proveedor].filter(Boolean).join(' · ')}</span>
                        </div>
                        <em>{vino.pvp ? dinero(vino.pvp) : 'S/P'}</em>
                      </div>
                    ))}
                </section>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="sim-empty">
          <h2>Selecciona un restaurante para empezar.</h2>
          <p>El simulador necesita una carta actual y el catalogo comun de proveedores.</p>
        </section>
      )}

      {selectorAltasAbierto ? (
        <div className="sim-modal-backdrop no-print" role="dialog" aria-modal="true" aria-label="Selector de catalogo">
          <section className="sim-modal">
            <div className="sim-modal-head">
              <div>
                <p>Catalogo privado</p>
                <h2>Añadir referencias a la propuesta</h2>
                <span>{selectorSeleccionados.length} seleccionadas · {catalogoSelector.length} visibles</span>
              </div>
              <button type="button" className="sim-modal-close" onClick={() => setSelectorAltasAbierto(false)}>Cerrar</button>
            </div>

            <div className="sim-modal-filters">
              <input
                value={selectorBusqueda}
                onChange={event => setSelectorBusqueda(event.target.value)}
                placeholder="Buscar vino, bodega, proveedor, zona, uva, formato..."
              />
              <select value={selectorProveedor} onChange={event => setSelectorProveedor(event.target.value)}>
                <option value="">Todos los proveedores</option>
                {proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
              </select>
              <select value={selectorTipo} onChange={event => setSelectorTipo(event.target.value)}>
                <option value="">Todos los tipos</option>
                {tiposSelector.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <label>
                <input type="checkbox" checked={selectorSoloFavoritos} onChange={event => setSelectorSoloFavoritos(event.target.checked)} />
                Favoritos
              </label>
              <label>
                <input type="checkbox" checked={selectorSoloConCoste} onChange={event => setSelectorSoloConCoste(event.target.checked)} />
                Con coste
              </label>
              <button type="button" onClick={limpiarSelectorAltas}>Limpiar</button>
            </div>

            <div className="sim-modal-body">
              <div className="sim-modal-results">
                {catalogoSelector.map(vino => {
                  const coste = numero(vino.coste_estimado)
                  const rb = pvpBotella(coste)
                  const seleccionado = selectorAltasSet.has(String(vino.id))
                  return (
                    <button
                      type="button"
                      key={vino.id}
                      className={seleccionado ? 'is-selected' : ''}
                      onClick={() => toggleSelectorAlta(vino.id)}
                    >
                      <span className="sim-modal-check">{seleccionado ? '✓' : ''}</span>
                      <strong>{vino.nombre}</strong>
                      <small>{[vino.bodega, vino.region, vino.uva, vino.formato, proveedorNombre(vino, proveedoresPorId)].filter(Boolean).join(' · ')}</small>
                      <em>{dinero(coste)} · {rb ? dinero(rb.pvp) : dinero(vino.pvp_recomendado)}</em>
                    </button>
                  )
                })}
                {catalogoSelector.length === 0 ? <p>No hay referencias con estos filtros.</p> : null}
              </div>

              <aside className="sim-modal-selected">
                <h3>Seleccionadas</h3>
                {selectorSeleccionados.map(vino => (
                  <button type="button" key={vino.id} onClick={() => toggleSelectorAlta(vino.id)}>
                    <strong>{vino.nombre}</strong>
                    <span>{[vino.bodega, proveedorNombre(vino, proveedoresPorId)].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
                {selectorSeleccionados.length === 0 ? <p>Marca referencias del listado.</p> : null}
              </aside>
            </div>

            <div className="sim-modal-actions">
              <button type="button" className="sim-btn sim-btn-secondary" onClick={() => setSelectorAltasAbierto(false)}>Cancelar</button>
              <button type="button" className="sim-btn sim-btn-primary" onClick={confirmarSelectorAltas} disabled={selectorSeleccionados.length === 0}>
                Añadir {selectorSeleccionados.length || ''} a la propuesta
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
