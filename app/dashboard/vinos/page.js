'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import { limiteVinosPlan, nombrePlan, puedeUsar } from '../../lib/plans'
import styles from '../module.module.css'

const perfilesVino = [
  { label: 'Fresco', texto: 'perfil fresco' },
  { label: 'Alta acidez', texto: 'alta acidez' },
  { label: 'Salino', texto: 'salino' },
  { label: 'Mineral', texto: 'mineral' },
  { label: 'Floral', texto: 'floral' },
  { label: 'Baja graduación', texto: 'baja graduacion' },
  { label: 'Fruta madura', texto: 'fruta madura' },
  { label: 'Con cuerpo', texto: 'con cuerpo' },
  { label: 'Tanino amable', texto: 'tanino amable' },
  { label: 'Madera', texto: 'madera' },
  { label: 'Tostado', texto: 'tostado' },
  { label: 'Oxidativo', texto: 'oxidativo' },
  { label: 'Dulce', texto: 'dulce' },
]

function normalizar(texto = '') {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function csvValor(valor = '') {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`
}

function descargarArchivo(nombre, contenido, tipo = 'text/csv;charset=utf-8;') {
  const blob = new Blob([contenido], { type: tipo })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nombre
  link.click()
  URL.revokeObjectURL(url)
}

function notasConPerfil(notas = '', perfil) {
  const limpias = notas.trim()
  const textoNormalizado = normalizar(limpias)
  const perfilNormalizado = normalizar(perfil.texto)

  if (textoNormalizado.includes(perfilNormalizado)) {
    return limpias
      .replace(new RegExp(`(^|[,.;] )${perfil.texto}([,.;]|$)`, 'i'), '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;])/g, '$1')
      .replace(/[,.;]\s*$/, '')
      .trim()
  }

  return limpias ? `${limpias}. ${perfil.texto}` : perfil.texto
}

function PerfilVino({ vino, onChange }) {
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '4px 0 10px' }}>Perfil para maridaje y venta</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {perfilesVino.map(perfil => {
          const activo = normalizar(vino.notas_cata || '').includes(normalizar(perfil.texto))
          return (
            <button
              key={perfil.texto}
              type="button"
              onClick={() => onChange({ ...vino, notas_cata: notasConPerfil(vino.notas_cata, perfil) })}
              style={{
                background: activo ? '#111' : '#fff',
                color: activo ? '#fff' : '#777',
                border: activo ? '1px solid #111' : '1px solid #e8e8e8',
                borderRadius: 999,
                padding: '7px 11px',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              {perfil.label}
            </button>
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: '#bbb', margin: '10px 0 0', lineHeight: 1.5 }}>
        Estos perfiles ayudan al modo camarero a distinguir, por ejemplo, un blanco salino para fritura de un blanco floral para queso o aperitivo.
      </p>
    </div>
  )
}

export default function Dashboard() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [proveedoresCatalogo, setProveedoresCatalogo] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarImportador, setMostrarImportador] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('importar') === '1'
  ))
  const [arrastrandoPdf, setArrastrandoPdf] = useState(false)
  const [progresoPdf, setProgresoPdf] = useState('')
  const [busquedaVinos, setBusquedaVinos] = useState('')
  const [filtroVinos, setFiltroVinos] = useState('todos')
  const [filtrosColumnaVinos, setFiltrosColumnaVinos] = useState({ vino: '', bodega: '', tipo: '', precio: '', stock: '' })
  const [ordenVinos, setOrdenVinos] = useState({ key: 'nombre', dir: 'asc' })
  const [paginaVinos, setPaginaVinos] = useState(1)
  const [pageSizeVinos, setPageSizeVinos] = useState(10)
  const [mensajeVinos, setMensajeVinos] = useState('')
  const [generandoCata, setGenerandoCata] = useState(false)
  const [editandoAnada, setEditandoAnada] = useState(null)
const [nuevaAnada, setNuevaAnada] = useState('')
const [editandoPrecio, setEditandoPrecio] = useState(null)
const [editandoVino, setEditandoVino] = useState(null)
const [nuevoPrecio, setNuevoPrecio] = useState('')
const [vinosImportar, setVinosImportar] = useState([])
const [pdfNombre, setPdfNombre] = useState('')
const [leyendoPdf, setLeyendoPdf] = useState(false)
const [errorPdf, setErrorPdf] = useState('')
const [errorBodega, setErrorBodega] = useState('')
const [importando, setImportando] = useState(false)
const [seleccionados, setSeleccionados] = useState([])
const [accionMasiva, setAccionMasiva] = useState('proveedor')
const [valorMasivo, setValorMasivo] = useState('')
const [aplicandoMasivo, setAplicandoMasivo] = useState(false)
const inputPdfRef = useRef(null)
  const [nuevoVino, setNuevoVino] = useState({
    nombre: '', bodega: '', tipo: 'tinto', region: '',
    uva: '', anada: '', precio_copa: '', precio_botella: '', stock: '', coste_compra: '', stock_minimo: '', proveedor: '', notas_cata: ''
  })

  useEffect(() => {
    async function cargarDatos() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data: vinosData } = await supabase.from('vinos').select('*').eq('restaurante_id', rest.id)
        setVinos(vinosData || [])
        const token = (await supabase.auth.getSession()).data.session?.access_token
        if (token) {
          const query = new URLSearchParams({ restaurante_id: rest.id })
          const res = await fetch(`/api/proveedores-visibles?${query}`, { headers: { Authorization: `Bearer ${token}` } })
          const data = res.ok ? await res.json() : {}
          setProveedoresCatalogo(data.proveedores || [])
        }
      }
      setLoading(false)
    }
    cargarDatos()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('new') === '1') {
      setMostrarFormulario(true)
    }
  }, [])

  useEffect(() => {
    setPaginaVinos(1)
  }, [busquedaVinos, filtroVinos, pageSizeVinos, filtrosColumnaVinos])

async function añadirVino() {
const limiteVinos = restaurante ? limiteVinosPlan(restaurante) : 60
const vinosActivos = vinos.filter(vino => vino.activo !== false)

    if (!nuevoVino.nombre || !nuevoVino.tipo) return
    if (vinosActivos.length >= limiteVinos) {
      setErrorBodega(`El plan ${nombrePlan(restaurante)} permite hasta ${limiteVinos} vinos activos.`)
      return
    }
    setGenerandoCata(true)

    let notasCata = ''
    try {
      const res = await fetch('/api/cata', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          nombre: nuevoVino.nombre,
          bodega: nuevoVino.bodega,
          tipo: nuevoVino.tipo,
          region: nuevoVino.region,
          uva: nuevoVino.uva,
          anada: nuevoVino.anada,
          restaurante_id: restaurante.id
        })
      })
      const data = await res.json()
      notasCata = data.notas || ''
    } catch (e) {
      notasCata = ''
    }

    const { data, error } = await supabase.from('vinos').insert([{
      ...nuevoVino,
      restaurante_id: restaurante.id,
      precio_copa: parseFloat(nuevoVino.precio_copa) || 0,
      precio_botella: parseFloat(nuevoVino.precio_botella) || 0,
      stock: parseInt(nuevoVino.stock) || 0,
      coste_compra: parseFloat(nuevoVino.coste_compra) || 0,
      stock_minimo: parseInt(nuevoVino.stock_minimo) || 0,
      proveedor: nuevoVino.proveedor || '',
notas_cata: [nuevoVino.notas_cata, notasCata].filter(Boolean).join('. '),
    }]).select()

setGenerandoCata(false)
    if (!error) {
      setVinos([...vinos, data[0]])
      setNuevoVino({
        nombre: '', bodega: '', tipo: 'tinto', region: '',
        uva: '', anada: '', precio_copa: '', precio_botella: '', stock: '', coste_compra: '', stock_minimo: '', proveedor: '', notas_cata: ''
      })
      setMostrarFormulario(false)
    }
  }

const limiteVinosActual = restaurante ? limiteVinosPlan(restaurante) : 60
const vinosActivosActuales = vinos.filter(vino => vino.activo !== false)

function vinoDuplicado(vino) {
  const nombre = normalizar(vino.nombre)
  return vinos.some(v => normalizar(v.nombre) === nombre)
}

function actualizarVinoImportar(index, cambios) {
  setVinosImportar(vinosImportar.map((vino, i) => i === index ? { ...vino, ...cambios } : vino))
}

function leerBase64(file) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

async function procesarArchivos(files) {
  const lista = Array.from(files)
  const grandes = lista.filter(f => f.size > 3 * 1024 * 1024)
  const validos = lista.filter(f => f.size <= 3 * 1024 * 1024)
  if (grandes.length) {
    setErrorPdf(`${grandes.map(f => `"${f.name}"`).join(', ')} ${grandes.length === 1 ? 'supera' : 'superan'} los 3 MB. Comprime o divide el PDF.`)
  }
  if (!validos.length) return
  setPdfNombre(validos.map(f => f.name).join(', '))
  setLeyendoPdf(true)
  const todosVinos = []
  for (let i = 0; i < validos.length; i++) {
    if (validos.length > 1) setProgresoPdf(`Procesando archivo ${i + 1} de ${validos.length}...`)
    const base64 = await leerBase64(validos[i])
    if (!base64) continue
    try {
      const res = await fetch('/api/importar-vinos-pdf', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ fileBase64: base64, mediaType: validos[i].type || 'application/pdf', restaurante_id: restaurante.id })
      })
      const data = await res.json()
      if (res.ok && Array.isArray(data.vinos)) todosVinos.push(...data.vinos)
    } catch {}
  }
  if (!todosVinos.length) {
    if (!grandes.length) setErrorPdf('No se encontraron vinos en los archivos.')
  } else {
    const vistos = new Set()
    const unicos = todosVinos.filter(v => {
      const key = normalizar(v.nombre)
      if (vistos.has(key)) return false
      vistos.add(key)
      return true
    })
    setVinosImportar(unicos.map(vino => ({
      nombre: vino.nombre || '',
      bodega: vino.bodega || '',
      tipo: vino.tipo || 'tinto',
      region: vino.region || '',
      uva: vino.uva || '',
      anada: vino.anada || '',
      precio_copa: Number(vino.precio_copa) > 0 ? vino.precio_copa : '',
      precio_botella: Number(vino.precio_botella) > 0 ? vino.precio_botella : '',
      stock: 1,
      notas_cata: vino.notas_cata || '',
      activo: true,
    })))
  }
  setProgresoPdf('')
  setLeyendoPdf(false)
}

function archivoPdfSeleccionado(e) {
  const files = e.target.files
  if (!files?.length) return
  setErrorPdf('')
  procesarArchivos(files)
}

function handleDragOver(e) {
  e.preventDefault()
  setArrastrandoPdf(true)
}

function handleDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) setArrastrandoPdf(false)
}

function handleDrop(e) {
  e.preventDefault()
  setArrastrandoPdf(false)
  setErrorPdf('')
  const files = e.dataTransfer.files
  if (files?.length) procesarArchivos(files)
}

async function guardarImportacionVinos() {
  const nuevos = vinosImportar.filter(vino => vino.activo && vino.nombre.trim() && !vinoDuplicado(vino))
  if (!nuevos.length || !restaurante?.id) return
  const hueco = Math.max(0, limiteVinosActual - vinosActivosActuales.length)
  if (nuevos.length > hueco) {
    setErrorPdf(`Tu plan permite ${limiteVinosActual} vinos activos. Puedes importar ${hueco} ahora mismo.`)
    return
  }
  setImportando(true)
  const { data, error } = await supabase.from('vinos').insert(nuevos.map(vino => ({
    nombre: vino.nombre.trim(),
    bodega: vino.bodega || '',
    tipo: vino.tipo || 'tinto',
    region: vino.region || '',
    uva: vino.uva || '',
    anada: vino.anada || '',
    precio_copa: parseFloat(vino.precio_copa) || 0,
    precio_botella: parseFloat(vino.precio_botella) || 0,
    stock: parseInt(vino.stock) || 0,
    notas_cata: vino.notas_cata || '',
    restaurante_id: restaurante.id,
    activo: true,
  }))).select()

  if (!error) {
    setVinos([...vinos, ...(data || [])])
    setVinosImportar([])
    setPdfNombre('')
    setMostrarImportador(false)
  }
  setImportando(false)
}
async function guardarAnada(vino) {
    await supabase.from('vinos').update({ anada: nuevaAnada }).eq('id', vino.id)
    setVinos(vinos.map(v => v.id === vino.id ? { ...v, anada: nuevaAnada } : v))
    setEditandoAnada(null)
    setNuevaAnada('')
  }
  async function guardarPrecio(vino) {
    await supabase.from('vinos').update({ precio_botella: parseFloat(nuevoPrecio) }).eq('id', vino.id)
    setVinos(vinos.map(v => v.id === vino.id ? { ...v, precio_botella: parseFloat(nuevoPrecio) } : v))
    setEditandoPrecio(null)
    setNuevoPrecio('')
  }
  async function toggleActivo(vino) {
    if (vino.activo === false && vinosActivosActuales.length >= limiteVinosActual) {
      setErrorBodega(`El plan ${nombrePlan(restaurante)} permite hasta ${limiteVinosActual} vinos activos.`)
      return
    }
    await supabase.from('vinos').update({ activo: !vino.activo }).eq('id', vino.id)
    setVinos(vinos.map(v => v.id === vino.id ? { ...v, activo: !v.activo } : v))
  }
  async function borrarVino(vino) {
  if (!confirm(`¿Seguro que quieres eliminar "${vino.nombre}"? Esta acción no se puede deshacer.`)) return
  await supabase.from('vinos').delete().eq('id', vino.id)
  setVinos(vinos.filter(v => v.id !== vino.id))
}
async function actualizarStock(vino, cambio) {
  const stockAnterior = Number(vino.stock) || 0
  const nuevoStock = Math.max(0, (vino.stock || 0) + cambio)
  const { error } = await supabase.from('vinos').update({ stock: nuevoStock }).eq('id', vino.id)
  if (error) return
  if (restaurante?.id && stockAnterior !== nuevoStock) {
    await supabase.from('movimientos_stock').insert([{
      restaurante_id: restaurante.id,
      vino_id: vino.id,
      tipo: cambio > 0 ? 'entrada' : 'ajuste',
      cantidad: nuevoStock - stockAnterior,
      stock_anterior: stockAnterior,
      stock_nuevo: nuevoStock,
      motivo: cambio > 0 ? 'Ajuste rápido: entrada manual' : 'Ajuste rápido: salida manual',
    }])
  }
  setVinos(vinos.map(v => v.id === vino.id ? { ...v, stock: nuevoStock } : v))
}

async function duplicarVino(vino) {
  if (!restaurante?.id) return
  const copia = {
    restaurante_id: restaurante.id,
    nombre: `${vino.nombre} (copia)`,
    bodega: vino.bodega || '',
    tipo: vino.tipo || 'tinto',
    region: vino.region || '',
    uva: vino.uva || '',
    anada: vino.anada || '',
    precio_copa: vino.precio_copa || null,
    precio_botella: Number(vino.precio_botella) || 0,
    stock: Number(vino.stock) || 0,
    coste_compra: Number(vino.coste_compra) || 0,
    stock_minimo: Number(vino.stock_minimo) || 0,
    proveedor: vino.proveedor || '',
    notas_cata: vino.notas_cata || '',
    activo: false,
  }
  const { data, error } = await supabase.from('vinos').insert([copia]).select()
  if (!error && data?.[0]) {
    setVinos([...vinos, data[0]])
    setMensajeVinos('Vino duplicado como borrador oculto')
  }
}

async function guardarEdicion(vino) {
  const { error } = await supabase.from('vinos').update({
    nombre: vino.nombre,
    bodega: vino.bodega,
    tipo: vino.tipo,
    region: vino.region,
    uva: vino.uva,
    anada: vino.anada,
    precio_copa: vino.precio_copa !== '' ? parseFloat(vino.precio_copa) : null,
precio_botella: parseFloat(vino.precio_botella) || 0,
    coste_compra: parseFloat(vino.coste_compra) || 0,
    stock_minimo: parseInt(vino.stock_minimo, 10) || 0,
    proveedor: vino.proveedor || '',
    notas_cata: vino.notas_cata || '',
  }).eq('id', vino.id)
  if (error) {
    setErrorBodega('No se pudieron guardar los campos de bodega. Ejecuta supabase/add_bodega_control.sql si aún no lo has hecho.')
  } else {
    setErrorBodega('')
    setVinos(vinos.map(v => v.id === vino.id ? { ...v, ...vino, precio_copa: vino.precio_copa !== '' ? parseFloat(vino.precio_copa) : null,
precio_botella: parseFloat(vino.precio_botella) || 0, coste_compra: parseFloat(vino.coste_compra) || 0, stock_minimo: parseInt(vino.stock_minimo, 10) || 0, proveedor: vino.proveedor || '' } : v))
    setEditandoVino(null)
  }
}

const proveedoresDisponibles = [...new Set([
  ...proveedoresCatalogo,
  ...vinos.map(vino => String(vino.proveedor || '').trim()).filter(Boolean),
])].sort((a, b) => a.localeCompare(b, 'es'))

function alternarSeleccion(id) {
  setSeleccionados(actual => actual.includes(id) ? actual.filter(item => item !== id) : [...actual, id])
}

function alternarSeleccionVisibles(vinosVisibles) {
  const idsVisibles = vinosVisibles.map(vino => vino.id)
  const todosMarcados = idsVisibles.length > 0 && idsVisibles.every(id => seleccionados.includes(id))
  setSeleccionados(actual => todosMarcados
    ? actual.filter(id => !idsVisibles.includes(id))
    : [...new Set([...actual, ...idsVisibles])])
}

function ordenarPorVino(key) {
  setOrdenVinos(actual => ({ key, dir: actual.key === key && actual.dir === 'asc' ? 'desc' : 'asc' }))
}

function valorOrdenVino(vino, key) {
  if (key === 'precio_copa') return Number(vino.precio_copa) || 0
  if (key === 'precio_botella') return Number(vino.precio_botella) || 0
  if (key === 'stock') return Number(vino.stock) || 0
  if (key === 'tipo') return tipoLabel[vino.tipo] || vino.tipo || ''
  if (key === 'bodega') return `${vino.bodega || ''} ${vino.region || ''}`
  return vino.nombre || ''
}

function vinoComoFila(vino) {
  return [
    vino.nombre,
    vino.bodega,
    vino.region,
    tipoLabel[vino.tipo] || vino.tipo,
    vino.uva,
    vino.anada,
    vino.precio_copa,
    vino.precio_botella,
    vino.stock,
    vino.proveedor,
    vino.activo === false ? 'Oculto' : 'Activo',
  ]
}

async function aplicarAccionMasiva() {
  if (!seleccionados.length) return
  const cambios = {}
  if (accionMasiva === 'proveedor') {
    if (!valorMasivo.trim()) return
    cambios.proveedor = valorMasivo.trim()
  }
  if (accionMasiva === 'stock_minimo') {
    if (valorMasivo === '' || Number.isNaN(Number(valorMasivo))) return
    cambios.stock_minimo = Math.max(0, parseInt(valorMasivo, 10) || 0)
  }
  if (accionMasiva === 'mostrar') cambios.activo = true
  if (accionMasiva === 'ocultar') {
    if (!confirm(`¿Ocultar ${seleccionados.length} referencias de la carta pública?`)) return
    cambios.activo = false
  }

  setAplicandoMasivo(true)
  setErrorBodega('')
  const { error } = await supabase.from('vinos').update(cambios).in('id', seleccionados)
  if (error) {
    setErrorBodega('No se pudo aplicar el cambio masivo.')
  } else {
    setVinos(actual => actual.map(vino => seleccionados.includes(vino.id) ? { ...vino, ...cambios } : vino))
    setSeleccionados([])
    setValorMasivo('')
  }
  setAplicandoMasivo(false)
}

  const tipoDot = { tinto: '#7B2D2D', blanco: '#C4A55A', rosado: '#C47A8A', espumoso: '#4A8C6F', generoso: '#854F0B', dulce: '#993556', naranja: '#D85A30', sin_alcohol: '#7B9E87' }
  const tipoLabel = { tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso', generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol' }

  const campo = (label, key, placeholder, type = 'text') => (
    <div>
      <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{label}</label>
      <input
        type={type}
        value={nuevoVino[key]}
        onChange={e => setNuevoVino({ ...nuevoVino, [key]: e.target.value })}
        placeholder={placeholder}
        style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111' }}
      />
    </div>
  )

  if (loading) return <LoadingState />

  const filtroUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('filtro') : ''
  const vinosBase = filtroUrl === 'pendientes'
    ? vinos.filter(v => !Number(v.precio_botella) || !v.notas_cata || v.notas_cata.length < 12)
    : vinos
  const busquedaNormalizada = normalizar(busquedaVinos)
  const filtrosVinosNormalizados = Object.fromEntries(
    Object.entries(filtrosColumnaVinos).map(([key, value]) => [key, normalizar(value)])
  )
  const vinosVisibles = vinosBase.filter(vino => {
    const texto = normalizar([
      vino.nombre,
      vino.bodega,
      vino.region,
      vino.uva,
      vino.anada,
      vino.proveedor,
      vino.notas_cata,
      tipoLabel[vino.tipo],
    ].filter(Boolean).join(' '))
    const coincideBusqueda = !busquedaNormalizada || texto.includes(busquedaNormalizada)
    const coincideEstado =
      filtroVinos === 'todos' ||
      (filtroVinos === 'activos' && vino.activo !== false) ||
      (filtroVinos === 'ocultos' && vino.activo === false) ||
      (filtroVinos === 'pendientes' && (!Number(vino.precio_botella) || !vino.notas_cata || vino.notas_cata.length < 12)) ||
      (filtroVinos === 'stock' && Number(vino.stock_minimo || 0) > 0 && Number(vino.stock) <= Number(vino.stock_minimo || 0)) ||
      (filtroVinos === 'sin_stock' && Number(vino.stock) <= 0) ||
      (filtroVinos === 'sin_coste' && !Number(vino.coste_compra)) ||
      (filtroVinos === 'sin_proveedor' && !String(vino.proveedor || '').trim()) ||
      (filtroVinos === 'sin_minimo' && !Number(vino.stock_minimo))
    const coincideColumnas =
      (!filtrosVinosNormalizados.vino || normalizar(`${vino.nombre || ''} ${vino.uva || ''} ${vino.anada || ''}`).includes(filtrosVinosNormalizados.vino)) &&
      (!filtrosVinosNormalizados.bodega || normalizar(`${vino.bodega || ''} ${vino.region || ''}`).includes(filtrosVinosNormalizados.bodega)) &&
      (!filtrosVinosNormalizados.tipo || normalizar(tipoLabel[vino.tipo] || vino.tipo || '').includes(filtrosVinosNormalizados.tipo)) &&
      (!filtrosVinosNormalizados.precio || normalizar(`${vino.precio_copa || ''} ${vino.precio_botella || ''}`).includes(filtrosVinosNormalizados.precio)) &&
      (!filtrosVinosNormalizados.stock || normalizar(String(vino.stock ?? '')).includes(filtrosVinosNormalizados.stock))
    return coincideBusqueda && coincideEstado && coincideColumnas
  }).sort((a, b) => {
    const valorA = valorOrdenVino(a, ordenVinos.key)
    const valorB = valorOrdenVino(b, ordenVinos.key)
    const resultado = typeof valorA === 'number' && typeof valorB === 'number'
      ? valorA - valorB
      : String(valorA).localeCompare(String(valorB), 'es', { numeric: true, sensitivity: 'base' })
    return ordenVinos.dir === 'asc' ? resultado : -resultado
  })
  const totalPaginasVinos = Math.max(1, Math.ceil(vinosVisibles.length / pageSizeVinos))
  const paginaVinosSegura = Math.min(paginaVinos, totalPaginasVinos)
  const inicioVinos = (paginaVinosSegura - 1) * pageSizeVinos
  const vinosPagina = vinosVisibles.slice(inicioVinos, inicioVinos + pageSizeVinos)
  const visiblesSeleccionados = vinosPagina.filter(vino => seleccionados.includes(vino.id)).length
  const todosVisiblesSeleccionados = vinosPagina.length > 0 && visiblesSeleccionados === vinosPagina.length
  const rangoVinos = vinosVisibles.length === 0 ? '0' : `${inicioVinos + 1}-${inicioVinos + vinosPagina.length}`
  const cabeceraVinos = ['Nombre', 'Bodega', 'Region', 'Tipo', 'Uva', 'Anada', 'Precio copa', 'Precio botella', 'Stock', 'Proveedor', 'Estado']
  const csvVinos = [cabeceraVinos, ...vinosVisibles.map(vinoComoFila)].map(fila => fila.map(csvValor).join(',')).join('\n')
  const vinosActivos = vinos.filter(vino => vino.activo !== false)
  const vinosSinPrecio = vinosActivos.filter(vino => !Number(vino.precio_botella))
  const vinosSinPerfil = vinosActivos.filter(vino => !vino.notas_cata || vino.notas_cata.length < 12)
  const vinosSinStock = vinosActivos.filter(vino => Number(vino.stock) <= 0)
  const vinosSinCoste = vinosActivos.filter(vino => !Number(vino.coste_compra))
  const vinosSinProveedor = vinosActivos.filter(vino => !String(vino.proveedor || '').trim())
  const pendientesVinos = [
    { label: 'Sin precio', count: vinosSinPrecio.length, href: '?filtro=pendientes', filter: 'pendientes', text: 'Bloquea publicacion y venta.' },
    { label: 'Sin perfil', count: vinosSinPerfil.length, href: '?filtro=pendientes', filter: 'pendientes', text: 'Debilita maridaje y modo camarero.' },
    { label: 'Sin stock', count: vinosSinStock.length, href: '?filtro=sin_stock', filter: 'sin_stock', text: 'Puede crear incidencias en sala.' },
    { label: 'Sin coste', count: vinosSinCoste.length, href: '?filtro=sin_coste', filter: 'sin_coste', text: 'Impide leer margen real.' },
    { label: 'Sin proveedor', count: vinosSinProveedor.length, href: '?filtro=sin_proveedor', filter: 'sin_proveedor', text: 'Complica el pedido.' },
  ]

  async function copiarVinos() {
    const texto = [cabeceraVinos, ...vinosVisibles.map(vinoComoFila)].map(fila => fila.join('\t')).join('\n')
    await navigator.clipboard?.writeText(texto)
    setMensajeVinos(`${vinosVisibles.length} vinos copiados al portapapeles`)
  }

  async function copiarVino(vino) {
    await navigator.clipboard?.writeText(vinoComoFila(vino).join('\t'))
    setMensajeVinos('Vino copiado al portapapeles')
  }

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Carta de vinos"
      title="Gestión de referencias"
      subtitle="Controla precios, stock, perfiles de cata e importaciones para que sala y maridaje trabajen con la misma información."
      actions={
        <>
          {puedeUsar(restaurante, 'bodega') && <a href="/dashboard/bodega" className={styles.secondary}>Control bodega</a>}
          {puedeUsar(restaurante, 'importador_pdf') && (
            <button
              onClick={() => { setMostrarImportador(!mostrarImportador); setMostrarFormulario(false) }}
              className={mostrarImportador ? styles.ghost : styles.secondary}
            >
              {mostrarImportador ? 'Cerrar importador' : 'Importar carta'}
            </button>
          )}
            <button
              data-shortcut-edit="true"
              onClick={() => { setMostrarFormulario(!mostrarFormulario); setMostrarImportador(false) }}
            className={mostrarFormulario ? styles.ghost : styles.primary}
          >
            {mostrarFormulario ? 'Cancelar' : 'Añadir vino'}
          </button>
        </>
      }
      help={{
        title: 'Gestión de vinos',
        intro: 'Aquí se crea y corrige la base de datos de la carta. Lo crítico es que cada vino sea vendible y encontrable.',
        items: [
          { title: 'Alta rápida', text: 'Nombre, tipo y precio son lo mínimo para aparecer con sentido en la carta pública.' },
          { title: 'Perfil de venta', text: 'Notas y etiquetas ayudan al modo camarero a recomendar sin depender de memoria.' },
          { title: 'Bodega después', text: 'Coste, proveedor y stock mínimo afinan margen y reposición; no tienen que bloquear el alta inicial.' },
        ],
      }}
    >
      <div className={styles.winePage}>
        {errorBodega && <div className={styles.empty} style={{ minHeight: 70, marginBottom: 16, color: '#9b3535' }}>{errorBodega}</div>}
        <section className={styles.pendingStrip}>
          <div>
            <p className={styles.eyebrow}>Cola de mejora</p>
            <h2>Lo que hace que la carta venda mejor</h2>
            <p>Precio, perfil y stock primero. Coste y proveedor afinan bodega y margen.</p>
          </div>
          <div className={styles.pendingGrid}>
            {pendientesVinos.map(item => (
              <button
                key={item.label}
                type="button"
                className={filtroVinos === item.filter ? styles.pendingItemActive : styles.pendingItem}
                onClick={() => setFiltroVinos(item.filter)}
              >
                <strong>{item.count}</strong>
                <span>{item.label}</span>
                <small>{item.text}</small>
              </button>
            ))}
          </div>
        </section>

        {mostrarImportador && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '28px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>Importar carta de vinos</p>
            <p style={{ fontSize: 13, color: '#999', lineHeight: 1.6, margin: '0 0 16px' }}>
              Sube la carta en cualquier formato: PDF, Excel, CSV o foto (JPG/PNG). La IA extrae nombre, bodega, tipo, región, uva, añada y precios. Revisa y corrige antes de guardar.
            </p>
            <input ref={inputPdfRef} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,.xlsx,.xls,.csv,text/csv" onChange={archivoPdfSeleccionado} style={{ display: 'none' }} />
            <div
              onClick={() => !leyendoPdf && inputPdfRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ width: '100%', background: arrastrandoPdf ? '#fdf6f8' : leyendoPdf ? '#f3f3f3' : '#fafafa', color: leyendoPdf ? '#aaa' : '#111', border: `1px dashed ${arrastrandoPdf ? '#74223d' : '#d8d8d8'}`, padding: '20px 18px', fontSize: 13, cursor: leyendoPdf ? 'not-allowed' : 'pointer', marginBottom: 12, textAlign: 'center', boxSizing: 'border-box', userSelect: 'none' }}
            >
              {leyendoPdf
                ? (progresoPdf || 'Leyendo archivo...')
                : pdfNombre
                  ? `Cargado: ${pdfNombre}`
                  : <span>PDF · Excel · CSV · Foto — arrastra o haz clic<br /><span style={{ fontSize: 11, color: '#bbb' }}>Puedes seleccionar varios archivos · Máx. 3 MB por archivo</span></span>}
            </div>
            {errorPdf && <p style={{ fontSize: 12, color: '#c07070', margin: '0 0 12px' }}>{errorPdf}</p>}

            {vinosImportar.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <p style={{ fontSize: 12, color: '#999', margin: 0 }}>{vinosImportar.length} vinos detectados · {vinosImportar.filter(v => vinoDuplicado(v)).length} duplicados</p>
                  <button onClick={guardarImportacionVinos} disabled={importando || !vinosImportar.some(v => v.activo && !vinoDuplicado(v))}
                    style={{ background: importando ? '#888' : '#111', color: '#fff', border: 'none', padding: '10px 18px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: importando ? 'not-allowed' : 'pointer' }}>
                    {importando ? 'Guardando...' : `Guardar ${vinosImportar.filter(v => v.activo && !vinoDuplicado(v)).length}`}
                  </button>
                </div>
                <div className={styles.importTable}>
                  {vinosImportar.map((vino, index) => {
                    const duplicado = vinoDuplicado(vino)
                    return (
                      <div key={`${vino.nombre}-${index}`} className={styles.importWineRow} style={{ borderBottom: index < vinosImportar.length - 1 ? '1px solid #f8f8f8' : 'none', opacity: vino.activo && !duplicado ? 1 : 0.45 }}>
                        <input type="checkbox" checked={vino.activo && !duplicado} disabled={duplicado} onChange={e => actualizarVinoImportar(index, { activo: e.target.checked })} style={{ marginTop: 8 }} />
                        <input value={vino.nombre} onChange={e => actualizarVinoImportar(index, { nombre: e.target.value })} placeholder="Vino" style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#111', background: 'transparent' }} />
                        <input value={vino.bodega} onChange={e => actualizarVinoImportar(index, { bodega: e.target.value })} placeholder="Bodega" style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }} />
                        <select value={vino.tipo} onChange={e => actualizarVinoImportar(index, { tipo: e.target.value })} style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }}>
                          {['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol'].map(tipo => <option key={tipo} value={tipo}>{tipoLabel[tipo]}</option>)}
                        </select>
                        <input value={vino.region} onChange={e => actualizarVinoImportar(index, { region: e.target.value })} placeholder="Región" style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }} />
                        <input value={vino.anada} onChange={e => actualizarVinoImportar(index, { anada: e.target.value })} placeholder="Añada" style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }} />
                        <input value={vino.precio_copa} onChange={e => actualizarVinoImportar(index, { precio_copa: e.target.value })} placeholder="Copa" style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }} />
                        <div>
                          <input value={vino.precio_botella} onChange={e => actualizarVinoImportar(index, { precio_botella: e.target.value })} placeholder="Botella" style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }} />
                          {duplicado && <p style={{ fontSize: 10, color: '#c07070', margin: '4px 0 0' }}>Ya existe</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {/* Formulario */}
        {mostrarFormulario && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '28px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 24px' }}>Nuevo vino</p>
            <div className={styles.wineFormGrid}>
              {campo('Nombre *', 'nombre', 'Ej. Barbazul Tinto')}
              {campo('Bodega', 'bodega', 'Ej. Primitivo Quiles')}
              {campo('Región', 'region', 'Ej. Cádiz')}
              {campo('Uva', 'uva', 'Ej. Syrah, Tintilla')}
              {campo('Añada', 'anada', 'Ej. 2021')}
              <div>
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Tipo *</label>
                <select value={nuevoVino.tipo} onChange={e => setNuevoVino({ ...nuevoVino, tipo: e.target.value })}
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111' }}>
                  <option value="tinto">Tinto</option>
                  <option value="blanco">Blanco</option>
                  <option value="rosado">Rosado</option>
                  <option value="espumoso">Espumoso</option>
                  <option value="generoso">Generoso</option>
                  <option value="dulce">Dulce</option>
                  <option value="naranja">Naranja</option>
                  <option value="sin_alcohol">Sin alcohol</option>
                </select>
              </div>
              {campo('Precio copa (€)', 'precio_copa', '4.00', 'number')}
              {campo('Precio botella (€)', 'precio_botella', '22.00', 'number')}
              {campo('Stock', 'stock', '12', 'number')}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Notas de cata y venta</label>
                <textarea
                  value={nuevoVino.notas_cata}
                  onChange={e => setNuevoVino({ ...nuevoVino, notas_cata: e.target.value })}
                  placeholder="Ej. Perfil fresco, salino, alta acidez"
                  rows={3}
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111', resize: 'vertical', fontFamily: 'system-ui, sans-serif' }}
                />
              </div>
              <PerfilVino vino={nuevoVino} onChange={setNuevoVino} />
              <details className={styles.advancedDetails}>
                <summary>Bodega avanzada</summary>
                <div className={styles.wineFormGrid} style={{ marginTop: 12 }}>
                  {campo('Coste compra (€)', 'coste_compra', '8.50', 'number')}
                  {campo('Stock mínimo', 'stock_minimo', '3', 'number')}
                  {campo('Proveedor', 'proveedor', 'Distribuidor habitual')}
                </div>
              </details>
            </div>
            <button data-shortcut-save="true" onClick={añadirVino} disabled={generandoCata} style={{ background: generandoCata ? '#888' : '#111', color: '#fff', border: 'none', padding: '12px 28px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: generandoCata ? 'not-allowed' : 'pointer' }}>
  {generandoCata ? 'Generando notas de cata...' : 'Guardar vino'}
</button>
          </div>
        )}

        {/* Lista vinos */}
        <section className={styles.listToolbar}>
          <div>
            <label className={styles.label}>Buscar referencia</label>
            <input
              className={styles.searchInput}
              value={busquedaVinos}
              onChange={e => setBusquedaVinos(e.target.value)}
              placeholder="Nombre, bodega, uva, región, añada o proveedor"
            />
          </div>
          <div>
            <label className={styles.label}>Vista</label>
            <select className={styles.toolbarSelect} value={filtroVinos} onChange={e => setFiltroVinos(e.target.value)}>
              <option value="todos">Todos los vinos</option>
              <option value="activos">Activos</option>
              <option value="pendientes">Pendientes</option>
              <option value="stock">Stock bajo</option>
              <option value="sin_stock">Sin stock</option>
              <option value="sin_coste">Sin coste</option>
              <option value="sin_proveedor">Sin proveedor</option>
              <option value="sin_minimo">Sin stock mínimo</option>
              <option value="ocultos">Ocultos</option>
            </select>
          </div>
          <div className={styles.toolbarSummary}>
            <p className={styles.resultCount}>{rangoVinos} de {vinosVisibles.length} referencias</p>
            <label className={styles.pageSizeControl}>
              <span>Por pagina</span>
              <select value={pageSizeVinos} onChange={e => setPageSizeVinos(Number(e.target.value))}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <button type="button" className={styles.bulkToggle} onClick={() => alternarSeleccionVisibles(vinosPagina)}>
              {todosVisiblesSeleccionados ? 'Desmarcar pagina' : 'Seleccionar pagina'}
            </button>
            <div className={styles.quickActions}>
              <button type="button" onClick={() => descargarArchivo('vinos.csv', csvVinos)}>CSV</button>
              <button type="button" onClick={copiarVinos}>Copiar</button>
            </div>
          </div>
        </section>

        {mensajeVinos && (
          <div className={styles.inlineToast} role="status">
            {mensajeVinos}
            <button type="button" onClick={() => setMensajeVinos('')} aria-label="Cerrar aviso">Cerrar</button>
          </div>
        )}

        {seleccionados.length > 0 && <section className={styles.bulkPanel}>
          <p className={styles.bulkCount}>{seleccionados.length} seleccionados</p>
          <button type="button" className={styles.bulkClear} onClick={() => setSeleccionados([])}>Limpiar selección</button>
            <div className={styles.bulkActions}>
              <select className={styles.select} value={accionMasiva} onChange={e => { setAccionMasiva(e.target.value); setValorMasivo('') }}>
                <option value="proveedor">Asignar proveedor</option>
                <option value="stock_minimo">Definir stock mínimo</option>
                <option value="mostrar">Mostrar en carta</option>
                <option value="ocultar">Ocultar de carta</option>
              </select>
              {['proveedor', 'stock_minimo'].includes(accionMasiva) && (
                <input
                  className={styles.input}
                  type={accionMasiva === 'stock_minimo' ? 'number' : 'text'}
                  min={accionMasiva === 'stock_minimo' ? '0' : undefined}
                  value={valorMasivo}
                  onChange={e => setValorMasivo(e.target.value)}
                  placeholder={accionMasiva === 'proveedor' ? 'Nombre del proveedor' : 'Unidades mínimas'}
                  list={accionMasiva === 'proveedor' ? 'proveedores-vino' : undefined}
                />
              )}
              <button className={styles.primary} onClick={aplicarAccionMasiva} disabled={aplicandoMasivo}>
                {aplicandoMasivo ? 'Aplicando...' : 'Aplicar'}
              </button>
            </div>
        </section>}

        <datalist id="proveedores-vino">
          {proveedoresDisponibles.map(proveedor => <option key={proveedor} value={proveedor} />)}
        </datalist>

        <div className={styles.wineList}>
          {/* Cabecera columnas */}
          <div className={styles.wineListHeader}>
  {['Vino', 'Bodega · Región', 'Copa', 'Botella', 'Stock', ''].map(h => (
              <p key={h} style={{ fontSize: 10, color: '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{h}</p>
            ))}
          </div>

          <div className={styles.inlineColumnFilters}>
            <button type="button" onClick={() => ordenarPorVino('nombre')}>Vino {ordenVinos.key === 'nombre' ? (ordenVinos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => ordenarPorVino('bodega')}>Bodega {ordenVinos.key === 'bodega' ? (ordenVinos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => ordenarPorVino('precio_copa')}>Copa {ordenVinos.key === 'precio_copa' ? (ordenVinos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => ordenarPorVino('precio_botella')}>Botella {ordenVinos.key === 'precio_botella' ? (ordenVinos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => ordenarPorVino('stock')}>Stock {ordenVinos.key === 'stock' ? (ordenVinos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" className={styles.clearFilters} onClick={() => setFiltrosColumnaVinos({ vino: '', bodega: '', tipo: '', precio: '', stock: '' })}>Limpiar</button>
            <input aria-label="Filtrar vino" value={filtrosColumnaVinos.vino} onChange={e => setFiltrosColumnaVinos({ ...filtrosColumnaVinos, vino: e.target.value })} placeholder="Filtrar vino" />
            <input aria-label="Filtrar bodega o region" value={filtrosColumnaVinos.bodega} onChange={e => setFiltrosColumnaVinos({ ...filtrosColumnaVinos, bodega: e.target.value })} placeholder="Bodega/region" />
            <input aria-label="Filtrar tipo" value={filtrosColumnaVinos.tipo} onChange={e => setFiltrosColumnaVinos({ ...filtrosColumnaVinos, tipo: e.target.value })} placeholder="Tipo" />
            <input aria-label="Filtrar precio" value={filtrosColumnaVinos.precio} onChange={e => setFiltrosColumnaVinos({ ...filtrosColumnaVinos, precio: e.target.value })} placeholder="Precio" />
            <input aria-label="Filtrar stock" value={filtrosColumnaVinos.stock} onChange={e => setFiltrosColumnaVinos({ ...filtrosColumnaVinos, stock: e.target.value })} placeholder="Stock" />
            <span />
          </div>

          {vinosVisibles.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <p style={{ color: '#ccc', fontSize: 14, fontWeight: 300 }}>{filtroUrl === 'pendientes' ? 'No hay vinos pendientes de completar.' : 'Aún no hay vinos. Añade el primero.'}</p>
            </div>
          ) : (
            vinosPagina.map((v, i) => (
              <div key={v.id} className={styles.wineRowGroup}>
              <div className={styles.wineListRow} style={{
                borderBottom: i < vinosPagina.length - 1 ? '1px solid #f8f8f8' : 'none',
                opacity: v.activo ? 1 : 0.4
              }}>
                <div className={styles.wineNameCell}>
                  <input type="checkbox" checked={seleccionados.includes(v.id)} onChange={() => alternarSeleccion(v.id)} aria-label={`Seleccionar ${v.nombre}`} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: tipoDot[v.tipo], flexShrink: 0 }} />
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: '#111' }}>{v.nombre}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#ccc' }}>
  {tipoLabel[v.tipo]} · {editandoAnada === v.id ? (
    <span>
      <input
        type="text"
        value={nuevaAnada}
        onChange={e => setNuevaAnada(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && guardarAnada(v)}
        placeholder="Ej. 2022"
        autoFocus
        style={{ width: 60, fontSize: 11, border: 'none', borderBottom: '1px solid #111', outline: 'none', background: 'transparent', color: '#111', padding: '0 2px' }}
      />
      <span onClick={() => guardarAnada(v)} style={{ marginLeft: 6, color: '#111', cursor: 'pointer' }}>✓</span>
      <span onClick={() => setEditandoAnada(null)} style={{ marginLeft: 4, color: '#ccc', cursor: 'pointer' }}>×</span>
    </span>
  ) : (
    <span onClick={() => { setEditandoAnada(v.id); setNuevaAnada(v.anada || '') }} style={{ cursor: 'pointer', borderBottom: '1px dashed #ccc' }}>
      {v.anada || 'Añadir añada'}
    </span>
  )}
</p>
                  </div>
                </div>
                <p data-label="Bodega" style={{ margin: 0, fontSize: 13, color: '#888', alignSelf: 'center' }}>{v.bodega}{v.region ? ` · ${v.region}` : ''}</p>
                <p data-label="Copa" style={{ margin: 0, fontSize: 13, color: '#111', alignSelf: 'center' }}>{v.precio_copa} €</p>
                <p data-label="Botella" style={{ margin: 0, fontSize: 13, color: '#111', alignSelf: 'center' }}>
  {editandoPrecio === v.id ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        value={nuevoPrecio}
        onChange={e => setNuevoPrecio(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && guardarPrecio(v)}
        autoFocus
        style={{ width: 50, fontSize: 13, border: 'none', borderBottom: '1px solid #111', outline: 'none', background: 'transparent', color: '#111', padding: '0 2px' }}
      />
      <span style={{ fontSize: 11 }}>€</span>
      <span onClick={() => guardarPrecio(v)} style={{ color: '#111', cursor: 'pointer' }}>✓</span>
      <span onClick={() => setEditandoPrecio(null)} style={{ color: '#ccc', cursor: 'pointer' }}>×</span>
    </span>
  ) : (
    <span onClick={() => { setEditandoPrecio(v.id); setNuevoPrecio(v.precio_botella || '') }} style={{ cursor: 'pointer', borderBottom: '1px dashed #ccc' }}>
      {v.precio_botella} €
    </span>
  )}
</p>
                <div data-label="Stock" style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
  <button onClick={() => actualizarStock(v, -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #e8e8e8', background: 'none', cursor: v.stock === 0 ? 'not-allowed' : 'pointer', color: '#aaa', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>−</button>
  <span style={{ fontSize: 13, color: v.stock === 0 ? '#C47A8A' : v.stock <= 3 ? '#C4A55A' : '#888', minWidth: 20, textAlign: 'center' }}>{v.stock}</span>
  <button onClick={() => actualizarStock(v, 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #e8e8e8', background: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>+</button>
</div>
                <details className={styles.rowMenu}>
                  <summary aria-label={`Acciones para ${v.nombre}`}>...</summary>
                  <button data-shortcut-edit="true" aria-label={`Editar ${v.nombre}`} onClick={() => { setEditandoVino({...v, precio_copa: v.precio_copa || '', precio_botella: v.precio_botella || '', coste_compra: v.coste_compra || '', stock_minimo: v.stock_minimo || '', proveedor: v.proveedor || ''}); }}>Editar</button>
                  <button onClick={() => copiarVino(v)}>Copiar fila</button>
                  <button onClick={() => duplicarVino(v)}>Duplicar</button>
                  <button onClick={() => toggleActivo(v)}>{v.activo ? 'Ocultar' : 'Mostrar'}</button>
                  <button className={styles.dangerAction} onClick={() => borrarVino(v)}>Borrar</button>
                </details>
</div>
              {editandoVino?.id === v.id && (
                <div className={styles.inlineEditPanel}>
                  <p className={styles.inlineEditTitle}>Editando {editandoVino.nombre}</p>
                  <div className={styles.wineFormGrid}>
                    {[
                      { label: 'Nombre *', key: 'nombre' },
                      { label: 'Bodega', key: 'bodega' },
                      { label: 'Región', key: 'region' },
                      { label: 'Uva', key: 'uva' },
                      { label: 'Añada', key: 'anada' },
                      { label: 'Precio copa (€)', key: 'precio_copa' },
                      { label: 'Precio botella (€)', key: 'precio_botella' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f.label}</label>
                        <input
                          type="text"
                          value={editandoVino[f.key] || ''}
                          onChange={e => setEditandoVino({ ...editandoVino, [f.key]: e.target.value })}
                          list={f.key === 'proveedor' ? 'proveedores-vino' : undefined}
                          style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111' }}
                        />
                      </div>
                    ))}
                    <details className={styles.advancedDetails}>
                      <summary>Bodega avanzada</summary>
                      <div className={styles.wineFormGrid} style={{ marginTop: 12 }}>
                        {[
                          { label: 'Coste compra (€)', key: 'coste_compra' },
                          { label: 'Stock mínimo', key: 'stock_minimo' },
                          { label: 'Proveedor', key: 'proveedor' },
                        ].map(f => (
                          <div key={f.key}>
                            <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{f.label}</label>
                            <input
                              type="text"
                              value={editandoVino[f.key] || ''}
                              onChange={e => setEditandoVino({ ...editandoVino, [f.key]: e.target.value })}
                              list={f.key === 'proveedor' ? 'proveedores-vino' : undefined}
                              style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111' }}
                            />
                          </div>
                        ))}
                      </div>
                    </details>
                    <div>
                      <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Tipo *</label>
                      <select value={editandoVino.tipo} onChange={e => setEditandoVino({ ...editandoVino, tipo: e.target.value })}
                        style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111' }}>
                        <option value="tinto">Tinto</option>
                        <option value="blanco">Blanco</option>
                        <option value="rosado">Rosado</option>
                        <option value="espumoso">Espumoso</option>
                        <option value="generoso">Generoso</option>
                        <option value="dulce">Dulce</option>
                        <option value="naranja">Naranja</option>
                        <option value="sin_alcohol">Sin alcohol</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Notas de cata y venta</label>
                      <textarea
                        value={editandoVino.notas_cata || ''}
                        onChange={e => setEditandoVino({ ...editandoVino, notas_cata: e.target.value })}
                        rows={3}
                        style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111', resize: 'vertical', fontFamily: 'system-ui, sans-serif' }}
                      />
                    </div>
                    <PerfilVino vino={editandoVino} onChange={setEditandoVino} />
                  </div>
                  <div className={styles.wineActions}>
                    <button data-shortcut-save="true" onClick={() => guardarEdicion(editandoVino)} style={{ background: '#111', color: '#fff', border: 'none', padding: '12px 28px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Guardar cambios
                    </button>
                    <button onClick={() => setEditandoVino(null)} style={{ background: 'none', border: '1px solid #e8e8e8', padding: '12px 28px', fontSize: 11, color: '#aaa', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              </div>
            ))
          )}
        </div>
        {vinosVisibles.length > pageSizeVinos && (
          <nav className={styles.paginationBar} aria-label="Paginacion de vinos">
            <button type="button" onClick={() => setPaginaVinos(Math.max(1, paginaVinosSegura - 1))} disabled={paginaVinosSegura === 1}>
              Anterior
            </button>
            <span>Pagina {paginaVinosSegura} de {totalPaginasVinos}</span>
            <button type="button" onClick={() => setPaginaVinos(Math.min(totalPaginasVinos, paginaVinosSegura + 1))} disabled={paginaVinosSegura === totalPaginasVinos}>
              Siguiente
            </button>
          </nav>
        )}
      </div>
    </ModuleShell>
  )
}
