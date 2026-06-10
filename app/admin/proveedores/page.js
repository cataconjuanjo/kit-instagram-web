'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../supabase'
import { isAdminEmail } from '../../demo'


const proveedorInicial = {
  nombre: '',
  contacto: '',
  email: '',
  telefono: '',
  zona: '',
  notas: '',
  visible_restaurantes: false
}

const vinoInicial = {
  proveedor_id: '',
  nombre: '',
  bodega: '',
  tipo: '',
  region: '',
  uva: '',
  anada: '',
  referencia: '',
  formato: '',
  coste_estimado: '',
  pvp_recomendado: '',
  disponibilidad: '',
  notas: '',
  activo: true
}

function numeroCoste(valor) {
  if (valor === null || valor === undefined || valor === '') return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  const limpio = String(valor)
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')
  if (!limpio) return 0
  const decimal = limpio.includes(',') && limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(/,/g, '')
  const numero = Number(decimal)
  return Number.isFinite(numero) ? numero : 0
}

function dinero(valor) {
  const numero = numeroCoste(valor)
  return numero ? `${numero.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : ''
}

function normalizar(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function claveComparacion(vino) {
  const nombre = normalizar(vino.nombre).replace(/\b(19|20)\d{2}\b/g, '').trim()
  return [nombre, normalizar(vino.bodega), normalizar(vino.anada)].filter(Boolean).join('|')
}

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function leerRespuestaImportacion(res) {
  const texto = await res.text()
  if (!texto) return {}
  try {
    return JSON.parse(texto)
  } catch {
    if (/request entity too large|payload too large|body exceeded|too large/i.test(texto)) {
      return {
        error: 'El catálogo es demasiado grande para subirlo directo. Abre el PDF, copia el texto de las páginas de tarifa y pégalo en la alternativa de texto.',
      }
    }
    return {
      error: 'El servidor no devolvió una respuesta válida. Prueba con un archivo más pequeño o pega el texto del catálogo.',
    }
  }
}

function opcionesCampo(campo, base = []) {
  return Object.values(base.reduce((acc, vino) => {
    const valor = String(vino[campo] || '').trim()
    const key = normalizar(valor)
    if (!key) return acc
    acc[key] = acc[key] || { key, label: valor, total: 0 }
    acc[key].total += 1
    return acc
  }, {}))
    .sort((a, b) => (b.total - a.total) || a.label.localeCompare(b.label, 'es'))
}

async function tokenAdmin() {
  const { data: sessionData } = await supabase.auth.getSession()
  return sessionData?.session?.access_token
}

const LIMITE_PDF_DIRECTO_MB = 3
const REFERENCIAS_POR_PAGINA = 60
const RANGOS_PRECIO = [
  { id: '', label: 'Todos los precios' },
  { id: 'sin_precio', label: 'Sin precio' },
  { id: '0-10', label: 'Hasta 10 EUR', min: 0, max: 10 },
  { id: '10-20', label: '10-20 EUR', min: 10, max: 20 },
  { id: '20-40', label: '20-40 EUR', min: 20, max: 40 },
  { id: '40+', label: 'Mas de 40 EUR', min: 40 },
]

function costeEnRango(coste, rango) {
  if (!rango?.id) return true
  if (rango.id === 'sin_precio') return coste <= 0
  if (coste <= 0) return false
  if (rango.id === '0-10') return coste <= 10
  if (rango.id === '10-20') return coste > 10 && coste <= 20
  if (rango.id === '20-40') return coste > 20 && coste <= 40
  if (rango.id === '40+') return coste > 40
  return true
}

function ProveedoresPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState(null)
  const [proveedores, setProveedores] = useState([])
  const [vinos, setVinos] = useState([])
  const [proveedorForm, setProveedorForm] = useState(proveedorInicial)
  const [vinoForm, setVinoForm] = useState(vinoInicial)
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState('')
  const [editandoProveedor, setEditandoProveedor] = useState(null)
  const [editandoVino, setEditandoVino] = useState(null)
  const [catalogoImportar, setCatalogoImportar] = useState([])
  const [catalogoNombre, setCatalogoNombre] = useState('')
  const [leyendoCatalogo, setLeyendoCatalogo] = useState(false)
  const [guardandoCatalogo, setGuardandoCatalogo] = useState(false)
  const [errorCatalogo, setErrorCatalogo] = useState('')
  const [mensajeCatalogo, setMensajeCatalogo] = useState('')
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('')
  const [busquedaReferencias, setBusquedaReferencias] = useState('')
  const [filtroZona, setFiltroZona] = useState('')
  const [filtroBodega, setFiltroBodega] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroPrecio, setFiltroPrecio] = useState('')
  const [filtroAbierto, setFiltroAbierto] = useState('')
  const [paginaReferencias, setPaginaReferencias] = useState(1)
  const [ordenReferencias, setOrdenReferencias] = useState({ campo: 'nombre', dir: 'asc' })
  const [soloSinPrecio, setSoloSinPrecio] = useState(false)
  const [ocultarSinPrecio, setOcultarSinPrecio] = useState(false)
  const [soloFavoritos, setSoloFavoritos] = useState(false)
  const [margenCopaPct, setMargenCopaPct] = useState(70)
  const [togglingFavorito, setTogglingFavorito] = useState(new Set())
  const [filtroImportacion, setFiltroImportacion] = useState('')
  const [reemplazarCatalogo, setReemplazarCatalogo] = useState(false)
  const [progresoGuardado, setProgresoGuardado] = useState('')
  const [textoCatalogo, setTextoCatalogo] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [vistaProveedores, setVistaProveedores] = useState(searchParams.get('vista') === 'catalogo' ? 'catalogo' : 'gestion')
  const [acordeonAbierto, setAcordeonAbierto] = useState('ficha')
  const catalogoRef = useRef(null)

  function toggleAcordeon(seccion) {
    setAcordeonAbierto(prev => prev === seccion ? null : seccion)
  }

  useEffect(() => {
    setVistaProveedores(searchParams.get('vista') === 'catalogo' ? 'catalogo' : 'gestion')
  }, [searchParams])

  function cambiarVistaProveedores(vista) {
    setVistaProveedores(vista)
    router.push(`/admin/proveedores?vista=${vista}`)
  }

  const cargarCatalogo = useCallback(async () => {
    const token = await tokenAdmin()
    const res = await fetch('/api/admin/proveedores', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron cargar proveedores.')
    setProveedores(data.proveedores || [])
    const favoritosLocales = leerFavoritosLocales()
    const vinosCargados = (data.vinos || []).map(v => ({
      ...v,
      favorito: v.favorito || favoritosLocales.has(v.id)
    }))
    setVinos(vinosCargados)

    const primerProveedor = data.proveedores?.[0]?.id || ''
    setVinoForm(actual => ({
      ...actual,
      proveedor_id: actual.proveedor_id || primerProveedor
    }))
  }, [])

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }

      setUser(user)
      try {
        await cargarCatalogo()
      } catch (error) {
        setError(error.message)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [cargarCatalogo])

  useEffect(() => {
    setPaginaReferencias(1)
  }, [proveedorSeleccionado, busquedaReferencias, filtroZona, filtroBodega, filtroTipo, filtroPrecio, soloSinPrecio, ocultarSinPrecio, soloFavoritos, ordenReferencias])

  const vinosFiltrados = useMemo(() => {
    const terminos = normalizar(busquedaReferencias).split(' ').filter(Boolean)
    const rango = RANGOS_PRECIO.find(item => item.id === filtroPrecio)
    const filtrados = vinos.filter(vino => {
      if (proveedorSeleccionado && String(vino.proveedor_id) !== String(proveedorSeleccionado)) return false
      const costeVino = numeroCoste(vino.coste_estimado)
      if (soloSinPrecio && costeVino > 0) return false
      if (ocultarSinPrecio && costeVino <= 0) return false
      if (soloFavoritos && !vino.favorito) return false
      if (filtroZona && normalizar(vino.region) !== filtroZona) return false
      if (filtroBodega && normalizar(vino.bodega) !== filtroBodega) return false
      if (filtroTipo && normalizar(vino.tipo) !== filtroTipo) return false
      if (!costeEnRango(costeVino, rango)) return false
      if (!terminos.length) return true
      const texto = normalizar([
        vino.nombre,
        vino.bodega,
        vino.tipo,
        vino.region,
        vino.uva,
        vino.anada,
        vino.referencia,
        vino.formato,
        vino.disponibilidad,
      ].filter(Boolean).join(' '))
      return terminos.every(termino => texto.includes(termino))
    })
    const valorOrden = vino => {
      if (ordenReferencias.campo === 'coste') return numeroCoste(vino.coste_estimado)
      if (ordenReferencias.campo === 'pvp') return calcularBotella(numeroCoste(vino.coste_estimado))?.pvp ?? 0
      if (ordenReferencias.campo === 'bodega') return normalizar(vino.bodega)
      if (ordenReferencias.campo === 'zona') return normalizar(`${vino.region || ''} ${vino.tipo || ''} ${vino.uva || ''}`)
      if (ordenReferencias.campo === 'formato') return normalizar(`${vino.formato || ''} ${vino.referencia || ''}`)
      return normalizar(vino.nombre)
    }

    return [...filtrados].sort((a, b) => {
      const av = valorOrden(a)
      const bv = valorOrden(b)
      let resultado
      if (ordenReferencias.campo === 'coste' || ordenReferencias.campo === 'pvp') {
        const sinPrecioA = av <= 0
        const sinPrecioB = bv <= 0
        if (sinPrecioA !== sinPrecioB) return sinPrecioA ? 1 : -1
        resultado = av - bv
      } else if (typeof av === 'number' || typeof bv === 'number') {
        resultado = (av || 0) - (bv || 0)
      } else {
        resultado = String(av).localeCompare(String(bv), 'es', { numeric: true })
      }
      if (!resultado) resultado = normalizar(a.nombre).localeCompare(normalizar(b.nombre), 'es', { numeric: true })
      return ordenReferencias.dir === 'desc' ? -resultado : resultado
    })
  }, [vinos, proveedorSeleccionado, busquedaReferencias, filtroZona, filtroBodega, filtroTipo, filtroPrecio, soloSinPrecio, ocultarSinPrecio, soloFavoritos, ordenReferencias])

  const proveedorPorId = useMemo(
    () => Object.fromEntries(proveedores.map(proveedor => [proveedor.id, proveedor])),
    [proveedores]
  )

  const proveedorImportacion = vinoForm.proveedor_id || proveedorSeleccionado || proveedores[0]?.id || ''

  const conteoPorProveedor = useMemo(() => (
    vinos.reduce((acc, vino) => {
      acc[vino.proveedor_id] = (acc[vino.proveedor_id] || 0) + 1
      return acc
    }, {})
  ), [vinos])

  const metricas = useMemo(() => {
    const conCoste = vinos.filter(vino => numeroCoste(vino.coste_estimado) > 0).length
    const sinCoste = vinos.length - conCoste
    const proveedoresConCatalogo = proveedores.filter(proveedor => conteoPorProveedor[proveedor.id] > 0).length
    return { conCoste, sinCoste, proveedoresConCatalogo }
  }, [vinos, proveedores, conteoPorProveedor])

  const resumenPrecioFiltrado = useMemo(() => {
    const costes = vinosFiltrados
      .map(vino => numeroCoste(vino.coste_estimado))
      .filter(coste => coste > 0)
    if (!costes.length) return null
    return {
      min: Math.min(...costes),
      max: Math.max(...costes),
      total: costes.length,
    }
  }, [vinosFiltrados])

  const opcionesFiltros = useMemo(() => {
    const baseProveedor = proveedorSeleccionado
      ? vinos.filter(vino => String(vino.proveedor_id) === String(proveedorSeleccionado))
      : vinos
    const terminos = normalizar(busquedaReferencias).split(' ').filter(Boolean)
    const rango = RANGOS_PRECIO.find(item => item.id === filtroPrecio)
    const pasaBase = (vino, excluir = '') => {
      if (excluir !== 'zona' && filtroZona && normalizar(vino.region) !== filtroZona) return false
      if (excluir !== 'bodega' && filtroBodega && normalizar(vino.bodega) !== filtroBodega) return false
      if (excluir !== 'tipo' && filtroTipo && normalizar(vino.tipo) !== filtroTipo) return false
      const costeVino = numeroCoste(vino.coste_estimado)
      if (soloSinPrecio && costeVino > 0) return false
      if (ocultarSinPrecio && costeVino <= 0) return false
      if (soloFavoritos && !vino.favorito) return false
      if (!costeEnRango(costeVino, rango)) return false
      if (terminos.length) {
        const texto = normalizar([
          vino.nombre,
          vino.bodega,
          vino.tipo,
          vino.region,
          vino.uva,
          vino.anada,
          vino.referencia,
          vino.formato,
          vino.disponibilidad,
        ].filter(Boolean).join(' '))
        if (!terminos.every(termino => texto.includes(termino))) return false
      }
      return true
    }
    return {
      zonas: opcionesCampo('region', baseProveedor.filter(vino => pasaBase(vino, 'zona'))),
      bodegas: opcionesCampo('bodega', baseProveedor.filter(vino => pasaBase(vino, 'bodega'))),
      tipos: opcionesCampo('tipo', baseProveedor.filter(vino => pasaBase(vino, 'tipo'))),
      sinZona: baseProveedor.filter(vino => pasaBase(vino, 'zona') && !normalizar(vino.region)).length,
      sinBodega: baseProveedor.filter(vino => pasaBase(vino, 'bodega') && !normalizar(vino.bodega)).length,
      sinTipo: baseProveedor.filter(vino => pasaBase(vino, 'tipo') && !normalizar(vino.tipo)).length,
    }
  }, [vinos, proveedorSeleccionado, busquedaReferencias, filtroZona, filtroBodega, filtroTipo, filtroPrecio, soloSinPrecio, ocultarSinPrecio, soloFavoritos])

  const etiquetaFiltro = useCallback((opciones, valor, vacio = 'Todos') => (
    valor ? (opciones.find(opcion => opcion.key === valor)?.label || valor) : vacio
  ), [])

  function seleccionarZona(valor) {
    setFiltroZona(valor)
    setFiltroBodega('')
    setFiltroAbierto('')
  }

  function seleccionarBodega(valor) {
    setFiltroBodega(valor)
    setFiltroAbierto('')
  }

  function seleccionarTipo(valor) {
    setFiltroTipo(valor)
    setFiltroAbierto('')
  }

  function cambiarOrdenReferencias(campo) {
    setOrdenReferencias(actual => ({
      campo,
      dir: actual.campo === campo && actual.dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  function etiquetaOrden(campo) {
    if (ordenReferencias.campo !== campo) return '↕'
    return ordenReferencias.dir === 'asc' ? '↑' : '↓'
  }

  function calcularBotella(coste) {
    const c = numeroCoste(coste)
    if (c <= 0) return null
    const iva = 1.10
    const margenDesdePvp = pvpSinIva => Math.round(((pvpSinIva - c) / pvpSinIva) * 100)
    if (c <= 6) {
      const pvpSinIva = c * 3.5
      return { pvp: pvpSinIva * iva, etiqueta: '×3,5', margen: margenDesdePvp(pvpSinIva) }
    }
    if (c <= 11) {
      const pvpSinIva = 2 * c + 9
      return { pvp: pvpSinIva * iva, etiqueta: '×2+9€', margen: margenDesdePvp(pvpSinIva) }
    }
    const pvpSinIva = c + 20
    return { pvp: pvpSinIva * iva, etiqueta: '+20€', margen: margenDesdePvp(pvpSinIva) }
  }

  function calcularCopa(coste, margenPct) {
    const c = numeroCoste(coste)
    if (c <= 0) return null
    const costeCopa = c / 4.5
    const pvp = costeCopa / (1 - margenPct / 100)
    const botella = calcularBotella(c)
    const ratioPct = botella ? Math.round((pvp / botella.pvp) * 100) : null
    const copasHastaEmpatar = botella ? Math.ceil(botella.pvp / pvp) : null
    return { pvp, costeCopa, ratioPct, copasHastaEmpatar }
  }

  function leerFavoritosLocales() {
    try { return new Set(JSON.parse(localStorage.getItem('favoritos_catalogo') || '[]')) } catch { return new Set() }
  }

  function guardarFavoritoLocal(id, valor) {
    const set = leerFavoritosLocales()
    valor ? set.add(id) : set.delete(id)
    localStorage.setItem('favoritos_catalogo', JSON.stringify([...set]))
  }

  async function toggleFavorito(vino) {
    const nuevoValor = !vino.favorito
    setVinos(prev => prev.map(v => v.id === vino.id ? { ...v, favorito: nuevoValor } : v))
    setTogglingFavorito(prev => new Set([...prev, vino.id]))
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: vino.id, kind: 'favorito', favorito: nuevoValor })
      })
      if (!res.ok) {
        // columna no existe todavía — persiste en localStorage hasta que corra la migración
        guardarFavoritoLocal(vino.id, nuevoValor)
      }
    } catch {
      guardarFavoritoLocal(vino.id, nuevoValor)
    } finally {
      setTogglingFavorito(prev => { const s = new Set(prev); s.delete(vino.id); return s })
    }
  }

  const totalPaginasReferencias = Math.max(1, Math.ceil(vinosFiltrados.length / REFERENCIAS_POR_PAGINA))
  const referenciasVisibles = useMemo(() => {
    const inicio = (paginaReferencias - 1) * REFERENCIAS_POR_PAGINA
    return vinosFiltrados.slice(inicio, inicio + REFERENCIAS_POR_PAGINA)
  }, [vinosFiltrados, paginaReferencias])

  const totalFavoritos = useMemo(() => vinos.filter(v => v.favorito).length, [vinos])

  const gruposFavoritos = useMemo(() => {
    if (!soloFavoritos) return []
    const map = {}
    referenciasVisibles.forEach(vino => {
      const clave = claveComparacion(vino)
      if (!map[clave]) map[clave] = []
      map[clave].push(vino)
    })
    return Object.values(map).map(grupo => ({
      vinos: [...grupo].sort((a, b) => (numeroCoste(a.coste_estimado) || Number.MAX_SAFE_INTEGER) - (numeroCoste(b.coste_estimado) || Number.MAX_SAFE_INTEGER)),
      nombre: grupo[0].nombre,
      bodega: grupo[0].bodega,
      tipo: grupo[0].tipo,
      region: grupo[0].region,
    }))
  }, [referenciasVisibles, soloFavoritos])

  const clavesExistentesImportacion = useMemo(() => {
    const set = new Set()
    vinos
      .filter(vino => !proveedorImportacion || String(vino.proveedor_id) === String(proveedorImportacion))
      .forEach(vino => set.add(claveComparacion(vino)))
    return set
  }, [vinos, proveedorImportacion])

  const importacionFiltrada = useMemo(() => {
    const terminos = normalizar(filtroImportacion).split(' ').filter(Boolean)
    if (!terminos.length) return catalogoImportar
    return catalogoImportar.filter(vino => {
      const texto = normalizar([
        vino.nombre,
        vino.bodega,
        vino.tipo,
        vino.region,
        vino.uva,
        vino.formato,
        vino.referencia,
        vino.disponibilidad,
      ].filter(Boolean).join(' '))
      return terminos.every(termino => texto.includes(termino))
    })
  }, [catalogoImportar, filtroImportacion])

  const duplicadosImportacion = useMemo(() => (
    catalogoImportar.filter(vino => clavesExistentesImportacion.has(claveComparacion(vino))).length
  ), [catalogoImportar, clavesExistentesImportacion])

  const comparadorCatalogo = useMemo(() => {
    const terminos = normalizar(busquedaCatalogo).split(' ').filter(Boolean)
    if (!terminos.length) return []

    const candidatos = vinos.filter(vino => {
      const texto = normalizar([
        vino.nombre,
        vino.bodega,
        vino.region,
        vino.uva,
        vino.anada,
        vino.referencia,
        vino.proveedores_vino?.nombre,
        proveedorPorId[vino.proveedor_id]?.nombre,
      ].filter(Boolean).join(' '))
      return terminos.every(termino => texto.includes(termino))
    })

    const grupos = Object.values(candidatos.reduce((acc, vino) => {
      const key = claveComparacion(vino) || `${vino.id}`
      acc[key] = acc[key] || {
        key,
        nombre: vino.nombre,
        bodega: vino.bodega,
        anada: vino.anada,
        refs: []
      }
      acc[key].refs.push(vino)
      return acc
    }, {}))

    return grupos
      .map(grupo => {
        const refs = grupo.refs
          .map(vino => ({
            ...vino,
            costeNumero: numeroCoste(vino.coste_estimado),
            proveedorNombre: proveedorPorId[vino.proveedor_id]?.nombre || vino.proveedores_vino?.nombre || 'Proveedor'
          }))
          .sort((a, b) => (a.costeNumero || Number.MAX_SAFE_INTEGER) - (b.costeNumero || Number.MAX_SAFE_INTEGER))
        const conCoste = refs.filter(vino => vino.costeNumero > 0)
        const minimo = conCoste[0]?.costeNumero || 0
        const maximo = conCoste[conCoste.length - 1]?.costeNumero || 0
        return { ...grupo, refs, minimo, maximo, ahorro: minimo && maximo ? maximo - minimo : 0 }
      })
      .sort((a, b) => (b.refs.length - a.refs.length) || (b.ahorro - a.ahorro) || String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .slice(0, 12)
  }, [busquedaCatalogo, vinos, proveedorPorId])

  function cambiarProveedor(campo, valor) {
    setError('')
    setProveedorForm(prev => ({ ...prev, [campo]: valor }))
  }

  function cambiarVino(campo, valor) {
    setError('')
    setVinoForm(prev => ({ ...prev, [campo]: valor }))
  }

  function editarProveedor(proveedor) {
    setEditandoProveedor(proveedor.id)
    setProveedorForm({
      nombre: proveedor.nombre || '',
      contacto: proveedor.contacto || '',
      email: proveedor.email || '',
      telefono: proveedor.telefono || '',
      zona: proveedor.zona || '',
      notas: proveedor.notas || '',
      visible_restaurantes: Boolean(proveedor.visible_restaurantes)
    })
  }

  function editarVino(vino) {
    setEditandoVino(vino.id)
    setVinoForm({
      proveedor_id: vino.proveedor_id || proveedorSeleccionado || '',
      nombre: vino.nombre || '',
      bodega: vino.bodega || '',
      tipo: vino.tipo || '',
      region: vino.region || '',
      uva: vino.uva || '',
      anada: vino.anada || '',
      referencia: vino.referencia || '',
      formato: vino.formato || '',
      coste_estimado: vino.coste_estimado || '',
      pvp_recomendado: vino.pvp_recomendado || '',
      disponibilidad: vino.disponibilidad || '',
      notas: vino.notas || '',
      activo: vino.activo !== false
    })
  }

  async function guardarProveedor(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: editandoProveedor ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'proveedor',
          id: editandoProveedor,
          ...proveedorForm
        })
      })
      const data = await leerRespuestaImportacion(res)
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el proveedor.')
      await cargarCatalogo()
      setProveedorForm(proveedorInicial)
      setEditandoProveedor(null)
      if (data.proveedor?.id) setProveedorSeleccionado(data.proveedor.id)
    } catch (error) {
      setError(error.message)
    } finally {
      setGuardando(false)
    }
  }

  async function guardarVino(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: editandoVino ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'vino',
          id: editandoVino,
          ...vinoForm
        })
      })
      const data = await leerRespuestaImportacion(res)
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el vino.')
      await cargarCatalogo()
      setVinoForm({ ...vinoInicial, proveedor_id: vinoForm.proveedor_id })
      setEditandoVino(null)
      if (data.vino?.proveedor_id) setProveedorSeleccionado(data.vino.proveedor_id)
    } catch (error) {
      setError(error.message)
    } finally {
      setGuardando(false)
    }
  }

  async function procesarCatalogoProveedor(files) {
    const file = files?.[0]
    if (!file) return
    const proveedorId = proveedorImportacion
    if (!proveedorId) {
      setErrorCatalogo('Crea o selecciona un proveedor antes de importar su catálogo.')
      return
    }
    if (file.size > LIMITE_PDF_DIRECTO_MB * 1024 * 1024) {
      setCatalogoNombre(file.name)
      setErrorCatalogo(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Para catálogos grandes, abre el PDF, copia el texto de las páginas de tarifa y pégalo abajo.`)
      if (catalogoRef.current) catalogoRef.current.value = ''
      return
    }

    setLeyendoCatalogo(true)
    setErrorCatalogo('')
    setMensajeCatalogo('')
    setProgresoGuardado('')
    setCatalogoNombre(file.name)
    try {
      const token = await tokenAdmin()
      const fileBase64 = await archivoABase64(file)
      const proveedor = proveedorPorId[proveedorId]
      const res = await fetch('/api/admin/importar-proveedor-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fileBase64,
          mediaType: file.type || 'application/pdf',
          proveedorNombre: proveedor?.nombre || '',
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo leer el catálogo.')
      const vistos = new Set()
      const limpios = (data.vinos || []).filter(vino => {
        const key = `${vino.nombre || ''}|${vino.bodega || ''}|${vino.anada || ''}|${vino.formato || ''}`.toLowerCase()
        if (!vino.nombre || vistos.has(key)) return false
        vistos.add(key)
        return true
      })
      if (!limpios.length) {
        setCatalogoImportar([])
        setErrorCatalogo(data.aviso || 'No se detectaron referencias. Prueba pegando una tabla con nombre de vino y precio.')
        return
      }
      setMensajeCatalogo(data.aviso || `${limpios.length} referencias preparadas para revisar.`)
      setFiltroImportacion('')
      setCatalogoImportar(limpios.map(vino => ({
        proveedor_id: proveedorId,
        nombre: vino.nombre || '',
        bodega: vino.bodega || '',
        tipo: vino.tipo || '',
        region: vino.region || '',
        uva: vino.uva || '',
        anada: vino.anada || '',
        referencia: vino.referencia || '',
        formato: vino.formato || '',
        coste_estimado: numeroCoste(vino.coste_estimado) > 0 ? vino.coste_estimado : '',
        pvp_recomendado: numeroCoste(vino.pvp_recomendado) > 0 ? vino.pvp_recomendado : '',
        disponibilidad: vino.disponibilidad || '',
        notas: vino.notas || '',
        activo: true,
      })))
    } catch (error) {
      setErrorCatalogo(error.message)
    } finally {
      setLeyendoCatalogo(false)
      if (catalogoRef.current) catalogoRef.current.value = ''
    }
  }

  async function procesarTextoCatalogoProveedor() {
    const proveedorId = proveedorImportacion
    if (!proveedorId) {
      setErrorCatalogo('Crea o selecciona un proveedor antes de importar su catálogo.')
      return
    }
    if (textoCatalogo.trim().length < 20) {
      setErrorCatalogo('Pega más texto del catálogo para poder extraer referencias.')
      return
    }

    setLeyendoCatalogo(true)
    setErrorCatalogo('')
    setMensajeCatalogo('')
    setProgresoGuardado('')
    setCatalogoNombre('Texto pegado')
    try {
      const token = await tokenAdmin()
      const proveedor = proveedorPorId[proveedorId]
      const res = await fetch('/api/admin/importar-proveedor-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          textoCatalogo,
          mediaType: 'text/plain',
          proveedorNombre: proveedor?.nombre || '',
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo leer el catálogo.')
      const vistos = new Set()
      const limpios = (data.vinos || []).filter(vino => {
        const key = `${vino.nombre || ''}|${vino.bodega || ''}|${vino.anada || ''}|${vino.formato || ''}`.toLowerCase()
        if (!vino.nombre || vistos.has(key)) return false
        vistos.add(key)
        return true
      })
      if (!limpios.length) {
        setCatalogoImportar([])
        setErrorCatalogo(data.aviso || 'No se detectaron referencias. Prueba pegando una tabla con nombre de vino y precio.')
        return
      }
      setMensajeCatalogo(data.aviso || `${limpios.length} referencias preparadas para revisar.`)
      setFiltroImportacion('')
      setCatalogoImportar(limpios.map(vino => ({
        proveedor_id: proveedorId,
        nombre: vino.nombre || '',
        bodega: vino.bodega || '',
        tipo: vino.tipo || '',
        region: vino.region || '',
        uva: vino.uva || '',
        anada: vino.anada || '',
        referencia: vino.referencia || '',
        formato: vino.formato || '',
        coste_estimado: numeroCoste(vino.coste_estimado) > 0 ? vino.coste_estimado : '',
        pvp_recomendado: numeroCoste(vino.pvp_recomendado) > 0 ? vino.pvp_recomendado : '',
        disponibilidad: vino.disponibilidad || '',
        notas: vino.notas || '',
        activo: true,
      })))
    } catch (error) {
      setErrorCatalogo(error.message)
    } finally {
      setLeyendoCatalogo(false)
    }
  }

  function actualizarCatalogoImportar(index, cambios) {
    setCatalogoImportar(actual => actual.map((vino, i) => i === index ? { ...vino, ...cambios } : vino))
  }

  async function guardarCatalogoImportado() {
    const proveedorId = proveedorImportacion
    const vinosValidos = catalogoImportar.filter(vino => vino.activo && vino.nombre.trim())
    if (!proveedorId || !vinosValidos.length) return
    setGuardandoCatalogo(true)
    setErrorCatalogo('')
    setMensajeCatalogo('')
    setProgresoGuardado('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: 'vinos_bulk', proveedor_id: proveedorId, vinos: vinosValidos, reemplazar: reemplazarCatalogo })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el catálogo.')
      if (reemplazarCatalogo) setVinos(actual => [...(data.vinos || []), ...actual.filter(vino => String(vino.proveedor_id) !== String(proveedorId))])
      else setVinos(actual => [...(data.vinos || []), ...actual])
      setCatalogoImportar([])
      setCatalogoNombre('')
      setFiltroImportacion('')
      setMensajeCatalogo(`${(data.vinos || []).length} referencias guardadas en el fondo comun.`)
      setProveedorSeleccionado(proveedorId)
    } catch (error) {
      setErrorCatalogo(error.message)
    } finally {
      setGuardandoCatalogo(false)
    }
  }

  async function borrar(id, kind) {
    const mensaje = kind === 'vino'
      ? '¿Borrar este vino del catálogo privado?'
      : '¿Borrar este proveedor y su catálogo privado?'
    if (!confirm(mensaje)) return

    setError('')
    try {
      const token = await tokenAdmin()
      const res = await fetch('/api/admin/proveedores', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, kind })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo borrar.')
      if (kind === 'vino') setVinos(actual => actual.filter(vino => vino.id !== id))
      else {
        setProveedores(actual => actual.filter(proveedor => proveedor.id !== id))
        setVinos(actual => actual.filter(vino => vino.proveedor_id !== id))
        if (proveedorSeleccionado === id) setProveedorSeleccionado('')
      }
    } catch (error) {
      setError(error.message)
    }
  }

  if (loading) {
    return <p className="admin-loading">Cargando proveedores</p>
  }

  return (
    <div className="admin-main supplier-main">
          <div className="consult-hero supplier-hero">
            <div>
              <p className="eyebrow">Base privada de compra</p>
              <h2>Catálogo de distribuidores para preparar propuestas sin exponer precios.</h2>
              <p>Guarda contactos, zonas, referencias, coste estimado, PVP recomendado y disponibilidad. Por defecto queda fuera de la vista del restaurante.</p>
            </div>
            <div className="consult-summary">
              <strong>{proveedores.length}</strong><span>proveedores</span>
              <strong>{vinos.length}</strong><span>referencias</span>
              <strong>{metricas.conCoste}</strong><span>con coste</span>
              <strong>{metricas.sinCoste}</strong><span>sin precio</span>
            </div>
          </div>

          {error && <p className="admin-alert admin-alert-error">{error}</p>}

          {vistaProveedores === 'gestion' && (
          <>
          <div className="supplier-accordion-group">

            {/* ── Acordeón: Ficha privada ── */}
            <section className="supplier-accordion">
              <button
                type="button"
                className={`supplier-accordion-header${acordeonAbierto === 'ficha' ? ' is-open' : ''}`}
                onClick={() => toggleAcordeon('ficha')}
                aria-expanded={acordeonAbierto === 'ficha'}
              >
                <span>
                  <strong>{editandoProveedor ? 'Editar proveedor' : 'Ficha del proveedor'}</strong>
                  <small>Datos de contacto del distribuidor</small>
                </span>
                <span className="supplier-accordion-icon">{acordeonAbierto === 'ficha' ? '−' : '+'}</span>
              </button>
              {acordeonAbierto === 'ficha' && (
                <div className="supplier-accordion-body">
                  <form onSubmit={guardarProveedor} className="supplier-ficha-form">
                    <div className="supplier-ficha-grid">
                      <div className="alta-field">
                        <label>Nombre del proveedor</label>
                        <input value={proveedorForm.nombre} onChange={e => cambiarProveedor('nombre', e.target.value)} placeholder="Distribuidor, bodega o importador" required />
                      </div>
                      <div className="alta-field">
                        <label>Zona de trabajo</label>
                        <input value={proveedorForm.zona} onChange={e => cambiarProveedor('zona', e.target.value)} placeholder="Málaga, Andalucía, nacional..." />
                      </div>
                      <div className="alta-field">
                        <label>Contacto</label>
                        <input value={proveedorForm.contacto} onChange={e => cambiarProveedor('contacto', e.target.value)} placeholder="Persona de contacto" />
                      </div>
                      <div className="alta-field">
                        <label>Email comercial</label>
                        <input type="email" value={proveedorForm.email} onChange={e => cambiarProveedor('email', e.target.value)} placeholder="comercial@proveedor.com" />
                      </div>
                      <div className="alta-field">
                        <label>Teléfono</label>
                        <input value={proveedorForm.telefono} onChange={e => cambiarProveedor('telefono', e.target.value)} placeholder="+34..." />
                      </div>
                    </div>
                    <label className="admin-hub-switch" style={{ marginTop: 4 }}>
                      <input type="checkbox" checked={proveedorForm.visible_restaurantes} onChange={e => cambiarProveedor('visible_restaurantes', e.target.checked)} />
                      Preparado para mostrar a restaurantes
                    </label>
                    <div className="alta-field" style={{ marginTop: 12 }}>
                      <label>Notas privadas</label>
                      <textarea value={proveedorForm.notas} onChange={e => cambiarProveedor('notas', e.target.value)} placeholder="Condiciones, zonas fuertes, mínimos, tipo de catálogo, relación comercial..." />
                    </div>
                    <div className="supplier-ficha-actions">
                      <button type="submit" className="alta-btn-primary" disabled={guardando}>
                        {guardando ? 'Guardando...' : editandoProveedor ? 'Guardar cambios' : 'Crear proveedor'}
                      </button>
                      {editandoProveedor && (
                        <button type="button" className="alta-btn-ghost" onClick={() => { setEditandoProveedor(null); setProveedorForm(proveedorInicial) }}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </section>
          </div>
          </>
          )}

          {vistaProveedores === 'catalogo' && (
          <>
          <section className="admin-create supplier-panel">
            <div>
              <p className="eyebrow">Comparador de compra</p>
              <h2>Buscar en el fondo común</h2>
              <p>Busca un vino y compara qué distribuidor lo tiene, a qué coste, en qué formato y dónde sale más barato.</p>
            </div>
            <div className="admin-create-form">
              <label className="admin-create-wide">
                Buscar vino, bodega, uva, zona o referencia
                <input
                  value={busquedaCatalogo}
                  onChange={e => setBusquedaCatalogo(e.target.value)}
                  placeholder="Ej. Carraovejas, Albariño, Sancerre, Garnacha..."
                />
              </label>
            </div>
            {busquedaCatalogo.trim() && (
              <div className="supplier-list" style={{ marginTop: 18 }}>
                {comparadorCatalogo.length === 0 && <p className="consult-empty">No hay coincidencias en el fondo común.</p>}
                {comparadorCatalogo.map(grupo => (
                  <article className="admin-card supplier-card" key={grupo.key}>
                    <div>
                      <span className="admin-slug">
                        {grupo.refs.length} proveedor{grupo.refs.length === 1 ? '' : 'es'}
                        {grupo.ahorro > 0 ? ` · diferencia ${dinero(grupo.ahorro)}` : ''}
                      </span>
                      <h3>{grupo.nombre}</h3>
                      <p>{[grupo.bodega, grupo.anada].filter(Boolean).join(' · ') || 'Coincidencia por búsqueda'}</p>
                    </div>
                    <div style={{ display: 'grid', gap: 8, minWidth: 280 }}>
                      {grupo.refs.map((vino, index) => (
                        <div key={vino.id} className="admin-card" style={{ padding: 12, background: index === 0 && vino.costeNumero > 0 ? '#f3ead8' : '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                            <div>
                              <strong>{vino.proveedorNombre}</strong>
                              <p style={{ margin: '5px 0 0', color: '#777' }}>
                                {[vino.formato, vino.referencia, vino.disponibilidad].filter(Boolean).join(' · ') || 'Sin formato/referencia'}
                              </p>
                            </div>
                            <strong>{dinero(vino.coste_estimado) || '-'}</strong>
                          </div>
                          <div className="admin-card-actions" style={{ marginTop: 10 }}>
                            {index === 0 && vino.costeNumero > 0 && <span className="admin-slug">Más barato</span>}
                            <button type="button" onClick={() => { editarVino(vino); cambiarVistaProveedores('gestion') }}>Editar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          </>
          )}

          {vistaProveedores === 'gestion' && (
          <>
          <div className="supplier-accordion-group">

            {/* ── Acordeón: Importar PDF ── */}
            <section className="supplier-accordion">
              <button
                type="button"
                className={`supplier-accordion-header${acordeonAbierto === 'importar' ? ' is-open' : ''}`}
                onClick={() => toggleAcordeon('importar')}
                aria-expanded={acordeonAbierto === 'importar'}
              >
                <span>
                  <strong>Importar tarifa PDF</strong>
                  <small>Sube el catálogo del distribuidor</small>
                </span>
                <span className="supplier-accordion-icon">{acordeonAbierto === 'importar' ? '−' : '+'}</span>
              </button>
              {acordeonAbierto === 'importar' && (
                <div className="supplier-accordion-body">
            <div className="admin-card" style={{ marginBottom: 18 }}>
              <p className="eyebrow">Importar tarifa PDF</p>
              <h3 style={{ marginTop: 0 }}>Catálogo del distribuidor</h3>
              <p style={{ color: '#777', lineHeight: 1.6 }}>
                Sube el PDF que te ha mandado el proveedor. La app extrae vinos, referencias, formatos, coste y disponibilidad para revisar antes de guardar.
              </p>
              <div className="admin-card-actions" style={{ justifyContent: 'flex-start' }}>
                <select value={proveedorImportacion} onChange={e => { setProveedorSeleccionado(e.target.value); setVinoForm(actual => ({ ...actual, proveedor_id: e.target.value })) }}>
                  <option value="">Selecciona proveedor...</option>
                  {proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                </select>
              </div>
              <label style={{ display: 'grid', gap: 8, marginTop: 14, color: '#555', fontSize: 13 }}>
                PDF, Excel, CSV o imagen del catálogo
                <input
                  ref={catalogoRef}
                  type="file"
                  accept=".pdf,.csv,.xlsx,.xls,image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={e => procesarCatalogoProveedor(e.target.files)}
                  disabled={leyendoCatalogo || !proveedorImportacion}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 12, padding: 10, background: proveedorImportacion ? '#fff' : '#f3f3f3' }}
                />
              </label>
              {!proveedorImportacion && <p className="admin-alert admin-alert-error">Selecciona o crea un proveedor antes de subir el catálogo.</p>}
              {leyendoCatalogo && <p className="admin-slug">Leyendo catálogo, puede tardar unos segundos...</p>}
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'grid', gap: 8, color: '#555', fontSize: 13 }}>
                  Alternativa para PDFs pesados: pega texto del catálogo
                  <textarea
                    value={textoCatalogo}
                    onChange={e => setTextoCatalogo(e.target.value)}
                    placeholder="Abre el PDF, copia las páginas de tarifa o el listado de vinos y pégalo aquí..."
                    rows={5}
                    style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: 12, padding: 12, font: 'inherit' }}
                  />
                </label>
                <div className="admin-card-actions" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
                  <button type="button" onClick={procesarTextoCatalogoProveedor} disabled={leyendoCatalogo || !proveedorImportacion || textoCatalogo.trim().length < 20}>
                    Extraer desde texto
                  </button>
                  {textoCatalogo && <button type="button" className="admin-plain-button" onClick={() => setTextoCatalogo('')}>Limpiar texto</button>}
                </div>
              </div>
              {catalogoNombre && <small className="admin-slug">{catalogoNombre}</small>}
              {errorCatalogo && <p className="admin-alert admin-alert-error">{errorCatalogo}</p>}
              {mensajeCatalogo && <p className="admin-alert admin-alert-ok">{mensajeCatalogo}</p>}
              {progresoGuardado && <p className="admin-slug">{progresoGuardado}</p>}
              {catalogoImportar.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="supplier-import-summary">
                    <strong>{catalogoImportar.length}</strong><span>detectadas</span>
                    <strong>{catalogoImportar.filter(vino => vino.activo).length}</strong><span>activas</span>
                    <strong>{catalogoImportar.filter(vino => numeroCoste(vino.coste_estimado) > 0).length}</strong><span>con coste</span>
                    <strong>{duplicadosImportacion}</strong><span>duplicados</span>
                  </div>
                  <div className="supplier-import-tools">
                    <input value={filtroImportacion} onChange={e => setFiltroImportacion(e.target.value)} placeholder="Filtrar previsualizacion..." />
                    <label className="admin-hub-switch">
                      <input type="checkbox" checked={reemplazarCatalogo} onChange={e => setReemplazarCatalogo(e.target.checked)} />
                      Reemplazar catalogo actual de este proveedor
                    </label>
                  </div>
                  <div className="consult-filterbar" style={{ marginBottom: 12 }}>
                    <button type="button" className="active">{catalogoImportar.filter(vino => vino.activo).length} seleccionados</button>
                    <button type="button" onClick={() => setCatalogoImportar(actual => actual.map(vino => ({ ...vino, activo: true })))}>Marcar todos</button>
                    <button type="button" onClick={() => setCatalogoImportar(actual => actual.map(vino => ({ ...vino, activo: false })))}>Desmarcar</button>
                    {duplicadosImportacion > 0 && <button type="button" onClick={() => setCatalogoImportar(actual => actual.map(vino => clavesExistentesImportacion.has(claveComparacion(vino)) ? { ...vino, activo: false } : vino))}>Omitir duplicados</button>}
                    <button type="button" onClick={guardarCatalogoImportado} disabled={guardandoCatalogo}>
                      {guardandoCatalogo ? 'Guardando...' : 'Guardar catálogo'}
                    </button>
                    <button type="button" onClick={() => setCatalogoImportar([])}>Cancelar</button>
                  </div>
                  <div className="supplier-list">
                    {importacionFiltrada.slice(0, 80).map((vino) => {
                      const index = catalogoImportar.indexOf(vino)
                      const duplicado = clavesExistentesImportacion.has(claveComparacion(vino))
                      return (
                      <article className="admin-card supplier-card" key={`${vino.nombre}-${index}`}>
                        <div>
                          <label className="admin-hub-switch" style={{ marginBottom: 8 }}>
                            <input type="checkbox" checked={vino.activo} onChange={e => actualizarCatalogoImportar(index, { activo: e.target.checked })} />
                            Importar
                          </label>
                          {duplicado && <span className="admin-slug">Posible duplicado ya guardado</span>}
                          <h3>{vino.nombre}</h3>
                          <p>{[vino.bodega, vino.uva, vino.region, vino.anada].filter(Boolean).join(' · ') || 'Sin datos de estilo'}</p>
                          <span>{[dinero(vino.coste_estimado), vino.formato, vino.disponibilidad].filter(Boolean).join(' · ') || 'Sin coste/formato'}</span>
                        </div>
                        <div className="admin-card-actions">
                          <input value={vino.coste_estimado} onChange={e => actualizarCatalogoImportar(index, { coste_estimado: e.target.value })} placeholder="Coste" style={{ maxWidth: 92 }} />
                          <input value={vino.referencia} onChange={e => actualizarCatalogoImportar(index, { referencia: e.target.value })} placeholder="Ref." style={{ maxWidth: 120 }} />
                        </div>
                      </article>
                    )})}
                    {importacionFiltrada.length === 0 && <p className="consult-empty">No hay referencias con ese filtro.</p>}
                    {importacionFiltrada.length > 80 && <p className="consult-empty">Mostrando 80 de {importacionFiltrada.length}. Guarda el catalogo para ver todas las referencias.</p>}
                  </div>
                </div>
              )}
            </div>
                </div>
              )}
            </section>

            {/* ── Acordeón: Nueva referencia / Vino ── */}
            <section className="supplier-accordion">
              <button
                type="button"
                className={`supplier-accordion-header${acordeonAbierto === 'vino' ? ' is-open' : ''}`}
                onClick={() => toggleAcordeon('vino')}
                aria-expanded={acordeonAbierto === 'vino'}
              >
                <span>
                  <strong>{editandoVino ? 'Editar referencia' : 'Nueva referencia'}</strong>
                  <small>Vino, bodega, precios y disponibilidad</small>
                </span>
                <span className="supplier-accordion-icon">{acordeonAbierto === 'vino' ? '−' : '+'}</span>
              </button>
              {acordeonAbierto === 'vino' && (
                <div className="supplier-accordion-body">
                  <form onSubmit={guardarVino} className="supplier-ficha-form">
                    <div className="supplier-ficha-grid">
                      <div className="alta-field supplier-ficha-wide">
                        <label>Proveedor</label>
                        <select value={vinoForm.proveedor_id} onChange={e => cambiarVino('proveedor_id', e.target.value)} required>
                          <option value="">Selecciona...</option>
                          {proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                        </select>
                      </div>
                      <div className="alta-field supplier-ficha-wide">
                        <label>Nombre del vino</label>
                        <input value={vinoForm.nombre} onChange={e => cambiarVino('nombre', e.target.value)} placeholder="Nombre comercial" required />
                      </div>
                      <div className="alta-field">
                        <label>Bodega</label>
                        <input value={vinoForm.bodega} onChange={e => cambiarVino('bodega', e.target.value)} placeholder="Bodega" />
                      </div>
                      <div className="alta-field">
                        <label>Tipo</label>
                        <input value={vinoForm.tipo} onChange={e => cambiarVino('tipo', e.target.value)} placeholder="Tinto, blanco, generoso..." />
                      </div>
                      <div className="alta-field">
                        <label>Zona / D.O.</label>
                        <input value={vinoForm.region} onChange={e => cambiarVino('region', e.target.value)} placeholder="Rioja, Jerez, Málaga..." />
                      </div>
                      <div className="alta-field">
                        <label>Uva / blend</label>
                        <input value={vinoForm.uva} onChange={e => cambiarVino('uva', e.target.value)} placeholder="Tempranillo, Palomino, Garnacha..." />
                      </div>
                      <div className="alta-field">
                        <label>Añada</label>
                        <input value={vinoForm.anada} onChange={e => cambiarVino('anada', e.target.value)} placeholder="2022, saca 2024..." />
                      </div>
                      <div className="alta-field">
                        <label>Referencia proveedor</label>
                        <input value={vinoForm.referencia} onChange={e => cambiarVino('referencia', e.target.value)} placeholder="Código proveedor" />
                      </div>
                      <div className="alta-field">
                        <label>Formato</label>
                        <input value={vinoForm.formato} onChange={e => cambiarVino('formato', e.target.value)} placeholder="Botella 75 cl, caja 6..." />
                      </div>
                      <div className="alta-field">
                        <label>Coste estimado (€)</label>
                        <input type="number" step="0.01" value={vinoForm.coste_estimado} onChange={e => cambiarVino('coste_estimado', e.target.value)} />
                      </div>
                      <div className="alta-field">
                        <label>PVP recomendado (€)</label>
                        <input type="number" step="0.01" value={vinoForm.pvp_recomendado} onChange={e => cambiarVino('pvp_recomendado', e.target.value)} />
                      </div>
                      <div className="alta-field">
                        <label>Disponibilidad</label>
                        <input value={vinoForm.disponibilidad} onChange={e => cambiarVino('disponibilidad', e.target.value)} placeholder="Disponible, cupo, preguntar..." />
                      </div>
                    </div>
                    <label className="admin-hub-switch" style={{ marginTop: 4 }}>
                      <input type="checkbox" checked={vinoForm.activo} onChange={e => cambiarVino('activo', e.target.checked)} />
                      Referencia activa
                    </label>
                    <div className="alta-field" style={{ marginTop: 12 }}>
                      <label>Notas</label>
                      <textarea value={vinoForm.notas} onChange={e => cambiarVino('notas', e.target.value)} placeholder="Por qué interesa, estilo, restaurantes donde encaja, margen, maridajes..." />
                    </div>
                    <div className="supplier-ficha-actions">
                      <button type="submit" className="alta-btn-primary" disabled={guardando || proveedores.length === 0}>
                        {guardando ? 'Guardando...' : editandoVino ? 'Guardar referencia' : 'Añadir al catálogo'}
                      </button>
                      {editandoVino && (
                        <button type="button" className="alta-btn-ghost" onClick={() => { setEditandoVino(null); setVinoForm({ ...vinoInicial, proveedor_id: proveedorSeleccionado }) }}>
                          Cancelar
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </section>

          </div>
          </>
          )}

          {vistaProveedores === 'catalogo' && (
          <section className="supplier-catalog-workbench">
          <div className="consult-filterbar">
            <button className={!proveedorSeleccionado ? 'active' : ''} onClick={() => setProveedorSeleccionado('')}>Todos</button>
            {proveedores.map(proveedor => (
              <button key={proveedor.id} className={proveedorSeleccionado === proveedor.id ? 'active' : ''} onClick={() => setProveedorSeleccionado(proveedor.id)}>
                {proveedor.nombre} {conteoPorProveedor[proveedor.id] ? `(${conteoPorProveedor[proveedor.id]})` : ''}
              </button>
            ))}
          </div>

          <div className="supplier-reference-tools">
            <input
              value={busquedaReferencias}
              onChange={e => setBusquedaReferencias(e.target.value)}
              placeholder="Filtrar referencias guardadas por vino, bodega, zona, uva o referencia..."
            />
            <select value={filtroPrecio} onChange={e => { setFiltroPrecio(e.target.value); setSoloSinPrecio(e.target.value === 'sin_precio'); if (e.target.value === 'sin_precio') setOcultarSinPrecio(false) }}>
              {RANGOS_PRECIO.map(rango => <option key={rango.id || 'todos'} value={rango.id}>{rango.label}</option>)}
            </select>
            <label className="supplier-price-toggle">
              <input
                type="checkbox"
                checked={ocultarSinPrecio}
                onChange={e => { setOcultarSinPrecio(e.target.checked); if (e.target.checked && filtroPrecio === 'sin_precio') { setFiltroPrecio(''); setSoloSinPrecio(false) } }}
              />
              Ocultar sin precio
            </label>
            <button
              type="button"
              className={`supplier-fav-toggle${soloFavoritos ? ' is-active' : ''}`}
              onClick={() => setSoloFavoritos(s => !s)}
            >
              {soloFavoritos ? '★' : '☆'} {totalFavoritos > 0 ? `Favoritos (${totalFavoritos})` : 'Favoritos'}
            </button>
            <span>{vinosFiltrados.length} visibles</span>
          </div>

          <div className="supplier-filter-shop">
            <div className="supplier-filter-controls">
              <div className="supplier-filter-menu">
                <button type="button" className={filtroZona ? 'is-selected' : ''} onClick={() => setFiltroAbierto(filtroAbierto === 'zona' ? '' : 'zona')}>
                  <span>Zona / D.O.</span>
                  <strong>{etiquetaFiltro(opcionesFiltros.zonas, filtroZona, 'Todas')}</strong>
                </button>
                {filtroAbierto === 'zona' && (
                  <div className="supplier-filter-dropdown">
                    <button type="button" className={!filtroZona ? 'active' : ''} onClick={() => seleccionarZona('')}>Todas <span>{opcionesFiltros.zonas.reduce((total, opcion) => total + opcion.total, 0)}</span></button>
                    {opcionesFiltros.zonas.map(opcion => (
                      <button type="button" key={opcion.key} className={filtroZona === opcion.key ? 'active' : ''} onClick={() => seleccionarZona(opcion.key)}>
                        {opcion.label} <span>{opcion.total}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="supplier-filter-menu">
                <button type="button" className={filtroBodega ? 'is-selected' : ''} onClick={() => setFiltroAbierto(filtroAbierto === 'bodega' ? '' : 'bodega')}>
                  <span>Bodega</span>
                  <strong>{etiquetaFiltro(opcionesFiltros.bodegas, filtroBodega, 'Todas')}</strong>
                </button>
                {filtroAbierto === 'bodega' && (
                  <div className="supplier-filter-dropdown">
                    <button type="button" className={!filtroBodega ? 'active' : ''} onClick={() => seleccionarBodega('')}>Todas <span>{opcionesFiltros.bodegas.reduce((total, opcion) => total + opcion.total, 0)}</span></button>
                    {opcionesFiltros.bodegas.map(opcion => (
                      <button type="button" key={opcion.key} className={filtroBodega === opcion.key ? 'active' : ''} onClick={() => seleccionarBodega(opcion.key)}>
                        {opcion.label} <span>{opcion.total}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="supplier-filter-menu">
                <button type="button" className={filtroTipo ? 'is-selected' : ''} onClick={() => setFiltroAbierto(filtroAbierto === 'tipo' ? '' : 'tipo')}>
                  <span>Tipo</span>
                  <strong>{etiquetaFiltro(opcionesFiltros.tipos, filtroTipo, 'Todos')}</strong>
                </button>
                {filtroAbierto === 'tipo' && (
                  <div className="supplier-filter-dropdown">
                    <button type="button" className={!filtroTipo ? 'active' : ''} onClick={() => seleccionarTipo('')}>Todos <span>{opcionesFiltros.tipos.reduce((total, opcion) => total + opcion.total, 0)}</span></button>
                    {opcionesFiltros.tipos.map(opcion => (
                      <button type="button" key={opcion.key} className={filtroTipo === opcion.key ? 'active' : ''} onClick={() => seleccionarTipo(opcion.key)}>
                        {opcion.label} <span>{opcion.total}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(filtroZona || filtroBodega || filtroTipo || filtroPrecio || busquedaReferencias || soloSinPrecio || ocultarSinPrecio || soloFavoritos) && (
              <div className="supplier-active-filters">
                {filtroZona && <span>Zona: {etiquetaFiltro(opcionesFiltros.zonas, filtroZona)}</span>}
                {filtroBodega && <span>Bodega: {etiquetaFiltro(opcionesFiltros.bodegas, filtroBodega)}</span>}
                {filtroTipo && <span>Tipo: {etiquetaFiltro(opcionesFiltros.tipos, filtroTipo)}</span>}
                {filtroPrecio && <span>{RANGOS_PRECIO.find(rango => rango.id === filtroPrecio)?.label}</span>}
                {filtroPrecio && resumenPrecioFiltrado && (
                  <span>{resumenPrecioFiltrado.total} con coste · {dinero(resumenPrecioFiltrado.min)} - {dinero(resumenPrecioFiltrado.max)}</span>
                )}
                {ocultarSinPrecio && <span>Con precio</span>}
                {soloFavoritos && <span>★ Solo favoritos</span>}
                {busquedaReferencias && <span>Texto: {busquedaReferencias}</span>}
                <button className="admin-plain-button supplier-clear-filters" onClick={() => { setFiltroZona(''); setFiltroBodega(''); setFiltroTipo(''); setFiltroPrecio(''); setBusquedaReferencias(''); setSoloSinPrecio(false); setOcultarSinPrecio(false); setSoloFavoritos(false); setFiltroAbierto('') }}>
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>

          <div className="supplier-table-panel">
            <div className="supplier-section-head">
              <h2>Referencias de catalogo</h2>
              <span>Pagina {Math.min(paginaReferencias, totalPaginasReferencias)} de {totalPaginasReferencias}</span>
            </div>
            {vinosFiltrados.length === 0 && <p className="consult-empty">No hay vinos para este filtro.</p>}
            {soloFavoritos && vinosFiltrados.length > 0 && (
              <div className="supplier-price-calc">
                <span>Calculadora de carta</span>
                <label>
                  Margen copa
                  <select value={margenCopaPct} onChange={e => setMargenCopaPct(Number(e.target.value))}>
                    <option value={70}>70 %</option>
                    <option value={75}>75 %</option>
                    <option value={80}>80 %</option>
                  </select>
                </label>
                <label>
                  Ordenar por
                  <select value={ordenReferencias.campo} onChange={e => setOrdenReferencias(prev => ({ campo: e.target.value, dir: prev.campo === e.target.value ? prev.dir : 'asc' }))}>
                    <option value="nombre">Nombre</option>
                    <option value="coste">Coste botella</option>
                    <option value="pvp">PVP botella</option>
                  </select>
                </label>
                <button type="button" className="admin-plain-button" onClick={() => setOrdenReferencias(prev => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))}>
                  {ordenReferencias.dir === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
                <span className="supplier-price-formula">
                  Botella: ≤6€ ×3,5 · 6-11€ ×2+9€ · &gt;11€ +20€ · ×1,10 IVA · Copa: coste ÷ 4,5 (merma 10%) ÷ (1−{margenCopaPct}%)
                </span>
              </div>
            )}
            {vinosFiltrados.length > 0 && (
              <>
                {soloFavoritos ? (
                  <div className="supplier-fav-groups">
                    {gruposFavoritos.map(grupo => {
                      const tieneMultiples = grupo.vinos.length > 1
                      return (
                        <div key={grupo.vinos[0].id} className={`supplier-fav-group${tieneMultiples ? ' has-multiple' : ''}`}>
                          <div className="supplier-fav-group-head">
                            <div>
                              <span className="supplier-field-label">Vino</span>
                              <strong>{grupo.nombre}</strong>
                              <small>{[grupo.bodega && `Bodega: ${grupo.bodega}`, grupo.tipo && `Tipo: ${grupo.tipo}`, grupo.region && `Zona: ${grupo.region}`].filter(Boolean).join(' · ')}</small>
                            </div>
                            {tieneMultiples && <span className="supplier-fav-badge">{grupo.vinos.length} distribuidores</span>}
                          </div>
                          {grupo.vinos.map((vino, index) => {
                            const esMasBarato = tieneMultiples && index === 0
                            const coste = numeroCoste(vino.coste_estimado)
                            const rb = coste ? calcularBotella(coste) : null
                            const rc = coste ? calcularCopa(coste, margenCopaPct) : null
                            const alerta = rc?.ratioPct > 25
                            return (
                              <div key={vino.id} className={`supplier-fav-row${esMasBarato ? ' is-cheapest' : ''}`}>
                                <span className="supplier-fav-dist"><em>Proveedor</em><strong>{proveedorPorId[vino.proveedor_id]?.nombre || 'Proveedor'}</strong></span>
                                <span className="supplier-fav-format"><em>Formato / ref.</em><strong>{[vino.formato, vino.referencia].filter(Boolean).join(' · ') || '-'}</strong></span>
                                <strong className="supplier-fav-cost"><em>Coste botella</em>{dinero(vino.coste_estimado) || '-'}</strong>
                                {rb ? (
                                  <div className="supplier-pvp-calc">
                                    <span className="pvp-line"><em>PVP botella</em><strong>{rb.pvp.toFixed(2)} €</strong><small>{rb.etiqueta}</small></span>
                                    <span className="pvp-line"><em>PVP copa</em><strong>{rc.pvp.toFixed(2)} €</strong>
                                      <small className={alerta ? 'pvp-ratio-warn' : 'pvp-ratio-ok'} title={`${rc.ratioPct}% del precio botella · ${rc.copasHastaEmpatar} copas igualan la botella`}>
                                        {rc.ratioPct !== null ? `${rc.ratioPct}% bot.` : ''}
                                      </small>
                                    </span>
                                  </div>
                                ) : <span className="supplier-pvp-empty">—</span>}
                                <div className="supplier-row-actions">
                                  <button type="button" className={`supplier-fav-btn${vino.favorito ? ' is-fav' : ''}`} onClick={() => toggleFavorito(vino)} title={vino.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'} disabled={togglingFavorito.has(vino.id)}>
                                    {vino.favorito ? '★' : '☆'}
                                  </button>
                                  <button onClick={() => { editarVino(vino); cambiarVistaProveedores('gestion') }}>Editar</button>
                                  <button className="admin-plain-button" onClick={() => borrar(vino.id, 'vino')}>Borrar</button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="supplier-table supplier-table--pvp">
                    <div className="supplier-table-head">
                      <button type="button" onClick={() => cambiarOrdenReferencias('nombre')} className={ordenReferencias.campo === 'nombre' ? 'is-active' : ''}>Vino <span>{etiquetaOrden('nombre')}</span></button>
                      <button type="button" onClick={() => cambiarOrdenReferencias('bodega')} className={ordenReferencias.campo === 'bodega' ? 'is-active' : ''}>Bodega <span>{etiquetaOrden('bodega')}</span></button>
                      <button type="button" onClick={() => cambiarOrdenReferencias('zona')} className={ordenReferencias.campo === 'zona' ? 'is-active' : ''}>Zona / Tipo <span>{etiquetaOrden('zona')}</span></button>
                      <button type="button" onClick={() => cambiarOrdenReferencias('formato')} className={ordenReferencias.campo === 'formato' ? 'is-active' : ''}>Formato <span>{etiquetaOrden('formato')}</span></button>
                      <button type="button" onClick={() => cambiarOrdenReferencias('coste')} className={ordenReferencias.campo === 'coste' ? 'is-active' : ''}>Coste botella <span>{etiquetaOrden('coste')}</span></button>
                      <button type="button" onClick={() => cambiarOrdenReferencias('pvp')} className={ordenReferencias.campo === 'pvp' ? 'is-active' : ''}>PVP botella <span>{etiquetaOrden('pvp')}</span></button>
                      <span></span>
                    </div>
                    {referenciasVisibles.map(vino => {
                      const rb = calcularBotella(numeroCoste(vino.coste_estimado))
                      return (
                      <div className="supplier-table-row" key={vino.id}>
                        <div>
                          <strong>{vino.nombre}</strong>
                          <small>Proveedor: {proveedorPorId[vino.proveedor_id]?.nombre || vino.proveedores_vino?.nombre || 'Proveedor'}</small>
                        </div>
                        <span>{vino.bodega || '-'}</span>
                        <span>{[vino.region, vino.tipo, vino.uva].filter(Boolean).join(' · ') || '-'}</span>
                        <span>{[vino.formato, vino.referencia].filter(Boolean).join(' · ') || '-'}</span>
                        <strong>{dinero(vino.coste_estimado) || '-'}</strong>
                        {rb ? <strong>{rb.pvp.toFixed(2)} €</strong> : <span>—</span>}
                        <div className="supplier-row-actions">
                          <button
                            type="button"
                            className={`supplier-fav-btn${vino.favorito ? ' is-fav' : ''}`}
                            onClick={() => toggleFavorito(vino)}
                            title={vino.favorito ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                            disabled={togglingFavorito.has(vino.id)}
                          >
                            {vino.favorito ? '★' : '☆'}
                          </button>
                          <button onClick={() => { editarVino(vino); cambiarVistaProveedores('gestion') }}>Editar</button>
                          <button className="admin-plain-button" onClick={() => borrar(vino.id, 'vino')}>Borrar</button>
                        </div>
                      </div>
                    )
                    })}
                  </div>
                )}
                <div className="supplier-pagination">
                  <button disabled={paginaReferencias <= 1} onClick={() => setPaginaReferencias(pagina => Math.max(1, pagina - 1))}>Anterior</button>
                  <span>Mostrando {referenciasVisibles.length} de {vinosFiltrados.length}</span>
                  <button disabled={paginaReferencias >= totalPaginasReferencias} onClick={() => setPaginaReferencias(pagina => Math.min(totalPaginasReferencias, pagina + 1))}>Siguiente</button>
                </div>
              </>
            )}
          </div>
          </section>
          )}

          {vistaProveedores === 'gestion' && (
          <div className="supplier-sections">
            <section className="supplier-section">
              <div className="supplier-section-head">
                <h2>Proveedores</h2>
                {proveedores.length > 0 && <span>{proveedores.length} registrados</span>}
              </div>
              {proveedores.length === 0 && <p className="consult-empty">Aún no hay proveedores privados. Crea uno con el formulario de arriba.</p>}
              <div className="supplier-rows">
                {proveedores.map(proveedor => (
                  <div className="supplier-row" key={proveedor.id}>
                    <div className="supplier-row-info">
                      <strong>{proveedor.nombre}</strong>
                      <span>{[proveedor.zona, proveedor.contacto, proveedor.email, proveedor.telefono].filter(Boolean).join(' · ') || 'Sin zona ni contacto'}</span>
                    </div>
                    <div className="supplier-row-stats">
                      <span className="supplier-row-badge">{conteoPorProveedor[proveedor.id] || 0} refs</span>
                      <span className={`supplier-row-status${proveedor.visible_restaurantes ? ' is-public' : ''}`}>
                        {proveedor.visible_restaurantes ? 'Visible' : 'Privado'}
                      </span>
                    </div>
                    <div className="supplier-row-btns">
                      <button type="button" className="supplier-btn-edit" onClick={() => editarProveedor(proveedor)}>✏ Editar</button>
                      <button type="button" className="supplier-btn-danger" onClick={() => borrar(proveedor.id, 'proveedor')}>✕ Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="supplier-section">
              <div className="supplier-section-head">
                <h2>Catálogos cargados</h2>
                {proveedores.filter(p => conteoPorProveedor[p.id] > 0).length > 0 && (
                  <span>{proveedores.filter(p => conteoPorProveedor[p.id] > 0).length} con referencias</span>
                )}
              </div>
              {proveedores.filter(proveedor => conteoPorProveedor[proveedor.id] > 0).length === 0 && (
                <p className="consult-empty">Aún no hay catálogos. Usa el acordeón de importación para cargar el PDF de un distribuidor.</p>
              )}
              <div className="supplier-rows">
                {proveedores.filter(proveedor => conteoPorProveedor[proveedor.id] > 0).map(proveedor => (
                  <div className="supplier-row" key={`${proveedor.id}-catalogo`}>
                    <div className="supplier-row-info">
                      <strong>{proveedor.nombre}</strong>
                      <span>{proveedor.zona || 'Sin zona asignada'}</span>
                    </div>
                    <div className="supplier-row-stats">
                      <span className="supplier-row-badge">{conteoPorProveedor[proveedor.id]} referencias</span>
                    </div>
                    <div className="supplier-row-btns">
                      <button type="button" className="supplier-btn-primary" onClick={() => { setProveedorSeleccionado(proveedor.id); cambiarVistaProveedores('catalogo') }}>
                        → Ver catálogo
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          )}
    </div>
  )
}

export default function ProveedoresPage() {
  return (
    <Suspense fallback={<p className="admin-loading">Cargando</p>}>
      <ProveedoresPageContent />
    </Suspense>
  )
}
