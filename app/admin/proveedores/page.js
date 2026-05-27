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

function dinero(valor) {
  const numero = Number(valor) || 0
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
    .slice(0, 18)
}

async function tokenAdmin() {
  const { data: sessionData } = await supabase.auth.getSession()
  return sessionData?.session?.access_token
}

const LIMITE_PDF_DIRECTO_MB = 5
const REFERENCIAS_POR_PAGINA = 60
const RANGOS_PRECIO = [
  { id: '', label: 'Todos los precios' },
  { id: 'sin_precio', label: 'Sin precio' },
  { id: '0-10', label: 'Hasta 10 EUR', min: 0, max: 10 },
  { id: '10-20', label: '10-20 EUR', min: 10, max: 20 },
  { id: '20-40', label: '20-40 EUR', min: 20, max: 40 },
  { id: '40+', label: 'Mas de 40 EUR', min: 40 },
]

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
  const [soloSinPrecio, setSoloSinPrecio] = useState(false)
  const [filtroImportacion, setFiltroImportacion] = useState('')
  const [reemplazarCatalogo, setReemplazarCatalogo] = useState(false)
  const [progresoGuardado, setProgresoGuardado] = useState('')
  const [textoCatalogo, setTextoCatalogo] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [vistaProveedores, setVistaProveedores] = useState(searchParams.get('vista') === 'catalogo' ? 'catalogo' : 'gestion')
  const catalogoRef = useRef(null)

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
    setVinos(data.vinos || [])

    const primerProveedor = data.proveedores?.[0]?.id || ''
    setProveedorSeleccionado(actual => actual || primerProveedor)
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
  }, [proveedorSeleccionado, busquedaReferencias, filtroZona, filtroBodega, filtroTipo, filtroPrecio, soloSinPrecio])

  const vinosFiltrados = useMemo(() => {
    const terminos = normalizar(busquedaReferencias).split(' ').filter(Boolean)
    const rango = RANGOS_PRECIO.find(item => item.id === filtroPrecio)
    return vinos.filter(vino => {
      if (proveedorSeleccionado && String(vino.proveedor_id) !== String(proveedorSeleccionado)) return false
      if (soloSinPrecio && Number(vino.coste_estimado) > 0) return false
      if (filtroZona && normalizar(vino.region) !== filtroZona) return false
      if (filtroBodega && normalizar(vino.bodega) !== filtroBodega) return false
      if (filtroTipo && normalizar(vino.tipo) !== filtroTipo) return false
      if (rango?.id === 'sin_precio' && Number(vino.coste_estimado) > 0) return false
      if (rango?.min !== undefined || rango?.max !== undefined) {
        const coste = Number(vino.coste_estimado) || 0
        if (!coste) return false
        if (rango.min !== undefined && coste < rango.min) return false
        if (rango.max !== undefined && coste > rango.max) return false
      }
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
  }, [vinos, proveedorSeleccionado, busquedaReferencias, filtroZona, filtroBodega, filtroTipo, filtroPrecio, soloSinPrecio])

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
    const conCoste = vinos.filter(vino => Number(vino.coste_estimado) > 0).length
    const sinCoste = vinos.length - conCoste
    const proveedoresConCatalogo = proveedores.filter(proveedor => conteoPorProveedor[proveedor.id] > 0).length
    return { conCoste, sinCoste, proveedoresConCatalogo }
  }, [vinos, proveedores, conteoPorProveedor])

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
      if (soloSinPrecio && Number(vino.coste_estimado) > 0) return false
      if (rango?.id === 'sin_precio' && Number(vino.coste_estimado) > 0) return false
      if (rango?.min !== undefined || rango?.max !== undefined) {
        const coste = Number(vino.coste_estimado) || 0
        if (!coste) return false
        if (rango.min !== undefined && coste < rango.min) return false
        if (rango.max !== undefined && coste > rango.max) return false
      }
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
    }
  }, [vinos, proveedorSeleccionado, busquedaReferencias, filtroZona, filtroBodega, filtroTipo, filtroPrecio, soloSinPrecio])

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

  const totalPaginasReferencias = Math.max(1, Math.ceil(vinosFiltrados.length / REFERENCIAS_POR_PAGINA))
  const referenciasVisibles = useMemo(() => {
    const inicio = (paginaReferencias - 1) * REFERENCIAS_POR_PAGINA
    return vinosFiltrados.slice(inicio, inicio + REFERENCIAS_POR_PAGINA)
  }, [vinosFiltrados, paginaReferencias])

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
            costeNumero: Number(vino.coste_estimado) || 0,
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
      const data = await res.json()
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
      const data = await res.json()
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
        coste_estimado: Number(vino.coste_estimado) > 0 ? vino.coste_estimado : '',
        pvp_recomendado: Number(vino.pvp_recomendado) > 0 ? vino.pvp_recomendado : '',
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
        coste_estimado: Number(vino.coste_estimado) > 0 ? vino.coste_estimado : '',
        pvp_recomendado: Number(vino.pvp_recomendado) > 0 ? vino.pvp_recomendado : '',
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
          <section className="admin-create supplier-panel">
            <div>
              <p className="eyebrow">{editandoProveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
              <h2>Ficha privada del distribuidor</h2>
              <p>Úsala como agenda comercial y fuente de compra. El check de visibilidad queda preparado, pero no publica nada por sí solo.</p>
            </div>
            <form onSubmit={guardarProveedor} className="admin-create-form">
              <label>Nombre<input value={proveedorForm.nombre} onChange={e => cambiarProveedor('nombre', e.target.value)} placeholder="Distribuidor, bodega o importador" required /></label>
              <label>Zona<input value={proveedorForm.zona} onChange={e => cambiarProveedor('zona', e.target.value)} placeholder="Málaga, Andalucía, nacional..." /></label>
              <label>Contacto<input value={proveedorForm.contacto} onChange={e => cambiarProveedor('contacto', e.target.value)} placeholder="Persona de contacto" /></label>
              <label>Email<input type="email" value={proveedorForm.email} onChange={e => cambiarProveedor('email', e.target.value)} placeholder="comercial@proveedor.com" /></label>
              <label>Teléfono<input value={proveedorForm.telefono} onChange={e => cambiarProveedor('telefono', e.target.value)} placeholder="+34..." /></label>
              <label className="admin-hub-switch">
                <input type="checkbox" checked={proveedorForm.visible_restaurantes} onChange={e => cambiarProveedor('visible_restaurantes', e.target.checked)} />
                Preparado para mostrar a restaurantes
              </label>
              <label className="admin-create-wide">Notas<textarea value={proveedorForm.notas} onChange={e => cambiarProveedor('notas', e.target.value)} placeholder="Condiciones, zonas fuertes, mínimos, tipo de catálogo, relación comercial..." /></label>
              <button disabled={guardando}>{guardando ? 'Guardando...' : editandoProveedor ? 'Guardar proveedor' : 'Crear proveedor'}</button>
              {editandoProveedor && <button type="button" className="admin-plain-button" onClick={() => { setEditandoProveedor(null); setProveedorForm(proveedorInicial) }}>Cancelar edición</button>}
            </form>
          </section>
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
          <section className="admin-create supplier-panel">
            <div>
              <p className="eyebrow">{editandoVino ? 'Editar referencia' : 'Nueva referencia'}</p>
              <h2>Vino de catálogo</h2>
              <p>Aquí sí conviene guardar uva o blend, coste y PVP sugerido: luego podrás convertirlo en propuesta para un restaurante.</p>
            </div>
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
                    <strong>{catalogoImportar.filter(vino => Number(vino.coste_estimado) > 0).length}</strong><span>con coste</span>
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
            <form onSubmit={guardarVino} className="admin-create-form">
              <label>
                Proveedor
                <select value={vinoForm.proveedor_id} onChange={e => cambiarVino('proveedor_id', e.target.value)} required>
                  <option value="">Selecciona...</option>
                  {proveedores.map(proveedor => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                </select>
              </label>
              <label>Vino<input value={vinoForm.nombre} onChange={e => cambiarVino('nombre', e.target.value)} placeholder="Nombre comercial" required /></label>
              <label>Bodega<input value={vinoForm.bodega} onChange={e => cambiarVino('bodega', e.target.value)} placeholder="Bodega" /></label>
              <label>Tipo<input value={vinoForm.tipo} onChange={e => cambiarVino('tipo', e.target.value)} placeholder="Tinto, blanco, generoso..." /></label>
              <label>Zona / D.O.<input value={vinoForm.region} onChange={e => cambiarVino('region', e.target.value)} placeholder="Rioja, Jerez, Málaga..." /></label>
              <label>Uva / blend<input value={vinoForm.uva} onChange={e => cambiarVino('uva', e.target.value)} placeholder="Tempranillo, Palomino, Garnacha..." /></label>
              <label>Añada<input value={vinoForm.anada} onChange={e => cambiarVino('anada', e.target.value)} placeholder="2022, saca 2024..." /></label>
              <label>Referencia<input value={vinoForm.referencia} onChange={e => cambiarVino('referencia', e.target.value)} placeholder="Código proveedor" /></label>
              <label>Formato<input value={vinoForm.formato} onChange={e => cambiarVino('formato', e.target.value)} placeholder="Botella 75 cl, caja 6..." /></label>
              <label>Coste estimado<input type="number" step="0.01" value={vinoForm.coste_estimado} onChange={e => cambiarVino('coste_estimado', e.target.value)} /></label>
              <label>PVP recomendado<input type="number" step="0.01" value={vinoForm.pvp_recomendado} onChange={e => cambiarVino('pvp_recomendado', e.target.value)} /></label>
              <label>Disponibilidad<input value={vinoForm.disponibilidad} onChange={e => cambiarVino('disponibilidad', e.target.value)} placeholder="Disponible, cupo, preguntar..." /></label>
              <label className="admin-hub-switch">
                <input type="checkbox" checked={vinoForm.activo} onChange={e => cambiarVino('activo', e.target.checked)} />
                Referencia activa
              </label>
              <label className="admin-create-wide">Notas<textarea value={vinoForm.notas} onChange={e => cambiarVino('notas', e.target.value)} placeholder="Por qué interesa, estilo, restaurantes donde encaja, margen, maridajes..." /></label>
              <button disabled={guardando || proveedores.length === 0}>{guardando ? 'Guardando...' : editandoVino ? 'Guardar referencia' : 'Añadir al catálogo'}</button>
              {editandoVino && <button type="button" className="admin-plain-button" onClick={() => { setEditandoVino(null); setVinoForm({ ...vinoInicial, proveedor_id: proveedorSeleccionado }) }}>Cancelar edición</button>}
            </form>
          </section>
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
            <select value={filtroPrecio} onChange={e => { setFiltroPrecio(e.target.value); setSoloSinPrecio(e.target.value === 'sin_precio') }}>
              {RANGOS_PRECIO.map(rango => <option key={rango.id || 'todos'} value={rango.id}>{rango.label}</option>)}
            </select>
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

            {(filtroZona || filtroBodega || filtroTipo || filtroPrecio || busquedaReferencias || soloSinPrecio) && (
              <div className="supplier-active-filters">
                {filtroZona && <span>Zona: {etiquetaFiltro(opcionesFiltros.zonas, filtroZona)}</span>}
                {filtroBodega && <span>Bodega: {etiquetaFiltro(opcionesFiltros.bodegas, filtroBodega)}</span>}
                {filtroTipo && <span>Tipo: {etiquetaFiltro(opcionesFiltros.tipos, filtroTipo)}</span>}
                {filtroPrecio && <span>{RANGOS_PRECIO.find(rango => rango.id === filtroPrecio)?.label}</span>}
                {busquedaReferencias && <span>Texto: {busquedaReferencias}</span>}
                <button className="admin-plain-button supplier-clear-filters" onClick={() => { setFiltroZona(''); setFiltroBodega(''); setFiltroTipo(''); setFiltroPrecio(''); setBusquedaReferencias(''); setSoloSinPrecio(false); setFiltroAbierto('') }}>
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
            {vinosFiltrados.length > 0 && (
              <>
                <div className="supplier-table">
                  <div className="supplier-table-head">
                    <span>Vino</span>
                    <span>Bodega</span>
                    <span>Zona / Tipo</span>
                    <span>Formato</span>
                    <span>Coste</span>
                    <span></span>
                  </div>
                  {referenciasVisibles.map(vino => (
                    <div className="supplier-table-row" key={vino.id}>
                      <div>
                        <strong>{vino.nombre}</strong>
                        <small>{proveedorPorId[vino.proveedor_id]?.nombre || vino.proveedores_vino?.nombre || 'Proveedor'}</small>
                      </div>
                      <span>{vino.bodega || '-'}</span>
                      <span>{[vino.region, vino.tipo, vino.uva].filter(Boolean).join(' · ') || '-'}</span>
                      <span>{[vino.formato, vino.referencia].filter(Boolean).join(' · ') || '-'}</span>
                      <strong>{dinero(vino.coste_estimado) || '-'}</strong>
                      <div className="supplier-row-actions">
                        <button onClick={() => { editarVino(vino); cambiarVistaProveedores('gestion') }}>Editar</button>
                        <button className="admin-plain-button" onClick={() => borrar(vino.id, 'vino')}>Borrar</button>
                      </div>
                    </div>
                  ))}
                </div>
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
          <div className="supplier-layout">
            <section className="supplier-list">
              <h2>Proveedores</h2>
              {proveedores.length === 0 && <p className="consult-empty">Aún no hay proveedores privados.</p>}
              {proveedores.map(proveedor => (
                <article className="admin-card supplier-card" key={proveedor.id}>
                  <div>
                    <span className="admin-slug">{proveedor.visible_restaurantes ? 'Preparado para mostrar' : 'Privado'}</span>
                    <h3>{proveedor.nombre}</h3>
                    <p>{conteoPorProveedor[proveedor.id] || 0} referencias guardadas</p>
                    <p>{[proveedor.zona, proveedor.contacto].filter(Boolean).join(' · ') || 'Sin zona/contacto'}</p>
                    <span>{[proveedor.email, proveedor.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</span>
                    {proveedor.notas && <small className="admin-slug">{proveedor.notas}</small>}
                  </div>
                  <div className="admin-card-actions">
                    <button onClick={() => editarProveedor(proveedor)}>Editar</button>
                    <button className="admin-plain-button" onClick={() => borrar(proveedor.id, 'proveedor')}>Borrar</button>
                  </div>
                </article>
              ))}
            </section>

            <section className="supplier-list">
              <h2>Catalogos cargados</h2>
              {proveedores.filter(proveedor => conteoPorProveedor[proveedor.id] > 0).length === 0 && <p className="consult-empty">Aun no hay catalogos cargados.</p>}
              {proveedores.filter(proveedor => conteoPorProveedor[proveedor.id] > 0).map(proveedor => (
                <article className="admin-card supplier-card" key={`${proveedor.id}-catalogo`}>
                  <div>
                    <span className="admin-slug">Catalogo privado</span>
                    <h3>{proveedor.nombre}</h3>
                    <p>{conteoPorProveedor[proveedor.id]} referencias guardadas</p>
                    <span>{proveedor.zona || 'Sin zona asignada'}</span>
                  </div>
                  <div className="admin-card-actions">
                    <button onClick={() => { setProveedorSeleccionado(proveedor.id); cambiarVistaProveedores('catalogo') }}>Ver catalogo</button>
                  </div>
                </article>
              ))}
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
