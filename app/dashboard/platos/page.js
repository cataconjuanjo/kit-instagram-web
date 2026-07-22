'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { ADMIN_EMAIL, getEffectiveRestaurantEmail } from '../../demo'
import {
  SELECT_CLIENT_PLATO_DASHBOARD,
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
} from '../../lib/clientSupabaseSelects'
import { esPerfilBodega } from '../../lib/plans'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import ResponsiveOverlay from '../ResponsiveOverlay'
import ConfirmationDialog from '../ConfirmationDialog'

const rasgosMaridaje = [
  { label: 'Brasa', texto: 'brasa' },
  { label: 'Frito', texto: 'frito' },
  { label: 'Ahumado', texto: 'ahumado' },
  { label: 'Gratinado', texto: 'gratinado' },
  { label: 'Salsa dulce', texto: 'salsa dulce' },
  { label: 'Picante', texto: 'picante' },
  { label: 'Verdura verde', texto: 'verdura verde' },
  { label: 'Setas/trufa', texto: 'setas trufa' },
  { label: 'Frutos secos', texto: 'frutos secos' },
  { label: 'Queso', texto: 'queso' },
  { label: 'Frío', texto: 'frio' },
  { label: 'Umami', texto: 'umami' },
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

function descripcionConRasgo(descripcion = '', rasgo) {
  const limpia = descripcion.trim()
  const textoNormalizado = normalizar(limpia)
  const rasgoNormalizado = normalizar(rasgo.texto)

  if (textoNormalizado.includes(rasgoNormalizado)) {
    return limpia
      .replace(new RegExp(`(^|[,.;] )${rasgo.texto}([,.;]|$)`, 'i'), '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;])/g, '$1')
      .replace(/[,.;]\s*$/, '')
      .trim()
  }

  return limpia ? `${limpia}. ${rasgo.texto}` : rasgo.texto
}

function categoriaSugerida(nombre, descripcion = '') {
  const texto = normalizar(`${nombre} ${descripcion}`)
  if (['postre', 'tarta', 'helado', 'torrija', 'brownie'].some(t => texto.includes(t))) return 'Postres'
  if (['bacalao', 'salmon', 'atun', 'chipiron', 'boqueron', 'gamba', 'marisco', 'pescado'].some(t => texto.includes(t))) return 'Del mar'
  if (['rabo', 'codillo', 'vaca', 'ternera', 'presa', 'solomillo', 'cerdo', 'cordero', 'hamburguesa'].some(t => texto.includes(t))) return 'De la tierra'
  if (['sopa', 'crema', 'salmorejo', 'mazamorra', 'gazpacho', 'cuchara'].some(t => texto.includes(t))) return 'Cuchara'
  if (['tabla', 'queso', 'surtido'].some(t => texto.includes(t))) return 'Tablas'
  if (['croqueta', 'flamenquin', 'frito', 'bravas', 'gambas al pil pil'].some(t => texto.includes(t))) return 'Entrantes calientes'
  return 'Entrantes fríos'
}

function rasgosSugeridos(nombre, descripcion = '') {
  const texto = normalizar(`${nombre} ${descripcion}`)
  const reglas = [
    { match: ['brasa', 'parrilla', 'plancha'], rasgo: 'brasa' },
    { match: ['frito', 'frita', 'fritura', 'croqueta', 'flamenquin', 'rebozado'], rasgo: 'frito' },
    { match: ['ahumado', 'ahumada'], rasgo: 'ahumado' },
    { match: ['gratinado', 'gratinada', 'alioli', 'parmentier'], rasgo: 'gratinado' },
    { match: ['pedro ximenez', 'px', 'miel', 'caramelizada', 'caramelizado', 'barbacoa'], rasgo: 'salsa dulce' },
    { match: ['picante', 'pil pil', 'ajillo', 'curry', 'brava'], rasgo: 'picante' },
    { match: ['esparrago', 'esparragos', 'pimiento', 'hinojo', 'apio', 'pepino'], rasgo: 'verdura verde' },
    { match: ['seta', 'setas', 'trufa', 'boletus', 'champinon'], rasgo: 'setas trufa' },
    { match: ['almendra', 'almendras', 'nuez', 'nueces', 'avellana'], rasgo: 'frutos secos' },
    { match: ['queso', 'quesos', 'cheddar', 'cabra', 'curado'], rasgo: 'queso' },
    { match: ['frio', 'fria', 'salmorejo', 'mazamorra', 'ensaladilla', 'gazpacho'], rasgo: 'frío' },
    { match: ['rabo', 'codillo', 'madurada', 'jamon', 'trufa', 'soja'], rasgo: 'umami' },
  ]

  return reglas
    .filter(regla => regla.match.some(palabra => texto.includes(palabra)))
    .map(regla => regla.rasgo)
}

function limpiarLineaCarta(linea) {
  return linea
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[\).\-]\s*/, '')
    .trim()
}

function extraerPrecio(linea) {
  const conSeparador = linea.match(/\|\s*(\d+(?:[,.]\d{1,2})?)\s*(?:€|eur)?\s*\|?/i)
  if (conSeparador) return parseFloat(conSeparador[1].replace(',', '.')) || 0

  const alFinal = linea.match(/(\d+(?:[,.]\d{1,2})?)\s*(?:€|eur)\s*$/i)
  if (alFinal) return parseFloat(alFinal[1].replace(',', '.')) || 0

  return 0
}

function quitarPrecio(linea) {
  return linea
    .replace(/\|\s*\d+(?:[,.]\d{1,2})?\s*(?:€|eur)?\s*\|?/i, '|')
    .replace(/\s+\d+(?:[,.]\d{1,2})?\s*(?:€|eur)\s*$/i, '')
    .replace(/\|{2,}/g, '|')
    .replace(/^\|\s*|\s*\|$/g, '')
    .trim()
}

function analizarCartaTexto(texto, platosExistentes = []) {
  const existentes = new Set(platosExistentes.map(plato => normalizar(plato.nombre)))
  return texto
    .split(/\r?\n/)
    .map(limpiarLineaCarta)
    .filter(linea => linea.length > 2)
    .filter(linea => !/^(entrantes|carnes|pescados|postres|vinos|bebidas|para compartir)$/i.test(linea))
    .map(linea => {
      const precio = extraerPrecio(linea)
      const lineaSinPrecio = quitarPrecio(linea)
      const partes = lineaSinPrecio.includes('|') ? lineaSinPrecio.split('|') : lineaSinPrecio.split(/\s[-–—:]\s/)
      const nombre = partes[0].trim()
      const descripcionBase = partes.slice(1).join('. ').trim()
      const rasgos = rasgosSugeridos(nombre, descripcionBase)
      const descripcion = [...new Set([descripcionBase, ...rasgos].filter(Boolean))].join('. ')

      return {
        nombre,
        descripcion,
        precio,
        categoria: categoriaSugerida(nombre, descripcionBase),
        activo: true,
        duplicado: existentes.has(normalizar(nombre)),
        actualizar: existentes.has(normalizar(nombre)),
      }
    })
    .filter((plato, idx, lista) => lista.findIndex(item => normalizar(item.nombre) === normalizar(plato.nombre)) === idx)
}

function RasgosMaridaje({ plato, onChange }) {
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '4px 0 10px' }}>Pistas rápidas para vender y maridar</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {rasgosMaridaje.map(rasgo => {
          const activo = normalizar(plato.descripcion || '').includes(normalizar(rasgo.texto))
          return (
            <button
              key={rasgo.texto}
              type="button"
              onClick={() => onChange({ ...plato, descripcion: descripcionConRasgo(plato.descripcion, rasgo) })}
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
              {rasgo.label}
            </button>
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: '#bbb', margin: '10px 0 0', lineHeight: 1.5 }}>
        Estas pistas no se muestran como receta en la carta publica. Ayudan al modo camarero a elegir vinos por tecnica, salsa, intensidad e ingrediente clave.
      </p>
    </div>
  )
}

export default function Platos() {
  const [restaurante, setRestaurante] = useState(null)
  const [platos, setPlatos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFormulario, setMostrarFormulario] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('new') === '1'
  ))
  const [mostrarImportador, setMostrarImportador] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('importar') === '1'
  ))
  const [busquedaPlatos, setBusquedaPlatos] = useState('')
  const [filtroPlatos, setFiltroPlatos] = useState('todos')
  const [filtrosColumnaPlatos, setFiltrosColumnaPlatos] = useState({ plato: '', categoria: '', precio: '', descripcion: '' })
  const [ordenPlatos, setOrdenPlatos] = useState({ key: 'nombre', dir: 'asc' })
  const [paginaPlatos, setPaginaPlatos] = useState(1)
  const [pageSizePlatos, setPageSizePlatos] = useState(10)
  const [mensajePlatos, setMensajePlatos] = useState('')
  const [editandoPlato, setEditandoPlato] = useState(null)
  const [nuevoPlato, setNuevoPlato] = useState({ nombre: '', descripcion: '', categoria: 'Entrantes fríos', precio: '' })
  const [textoImportar, setTextoImportar] = useState('')
  const [platosImportar, setPlatosImportar] = useState([])
  const [importando, setImportando] = useState(false)
  const [pdfNombre, setPdfNombre] = useState('')
  const [leyendoPdf, setLeyendoPdf] = useState(false)
  const [errorPdf, setErrorPdf] = useState('')
  const [enriqueciendoBatch, setEnriqueciendoBatch] = useState(false)
  const [resultadoBatch, setResultadoBatch] = useState(null)
  const [puedeAnalizarChartier, setPuedeAnalizarChartier] = useState(false)
  const inputPdfRef = useRef(null)
  const menuPlatoRef = useRef(null)
  const [menuPlato, setMenuPlato] = useState(null)
  const [platoBorrar, setPlatoBorrar] = useState(null)
  const [borrandoId, setBorrandoId] = useState('')
  const [errorPlatos, setErrorPlatos] = useState('')

  const categorias = ['Entrantes fríos', 'Entrantes calientes', 'Cuchara', 'De la tierra', 'Del mar', 'Tablas', 'Postres']

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: sessionData } = await supabase.auth.getSession()
      setPuedeAnalizarChartier((sessionData.session?.user?.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase())
      const { data: rest } = await supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD).eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data } = await supabase.from('platos').select(SELECT_CLIENT_PLATO_DASHBOARD).eq('restaurante_id', rest.id).order('categoria')
        setPlatos(data || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (!menuPlato) return
    function cerrarMenu(e) {
      if (menuPlatoRef.current && !menuPlatoRef.current.contains(e.target)) {
        setMenuPlato(null)
      }
    }
    document.addEventListener('mousedown', cerrarMenu, true)
    return () => document.removeEventListener('mousedown', cerrarMenu, true)
  }, [menuPlato])

  // ── Enriquecimiento Chartier batch ────────────────────────────────────────
  async function enriquecerTodosLosPlatos() {
    if (!restaurante?.id || enriqueciendoBatch) return
    setEnriqueciendoBatch(true)
    setResultadoBatch(null)
    try {
      const res = await fetch('/api/enriquecer-platos-batch', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ restaurante_id: restaurante.id }),
      })
      const data = await res.json()
      setResultadoBatch(data)
    } catch {
      setResultadoBatch({ error: 'No se pudo conectar con el servidor' })
    }
    setEnriqueciendoBatch(false)
  }

  // ── Enriquecimiento Chartier en background ────────────────────────────────
  async function enriquecerPlato(plato) {
    if (!puedeAnalizarChartier) return
    try {
      const res = await fetch('/api/enriquecer-plato', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          nombre: plato.nombre,
          descripcion: plato.descripcion || '',
          categoria: plato.categoria || '',
          plato_id: plato.id,
          restaurante_id: plato.restaurante_id,
        }),
      })
      if (!res.ok) return
      const { familias_aromaticas } = await res.json()
      if (!familias_aromaticas) return
      setPlatos(prev => prev.map(p => p.id === plato.id ? { ...p, familias_aromaticas } : p))
    } catch {}
  }

  async function añadirPlato() {
    if (!nuevoPlato.nombre.trim()) return
    const { data, error } = await supabase.from('platos').insert([{
      ...nuevoPlato,
      precio: parseFloat(nuevoPlato.precio) || 0,
      restaurante_id: restaurante.id,
      activo: true
    }]).select(SELECT_CLIENT_PLATO_DASHBOARD)
    if (!error) {
      setPlatos([...platos, data[0]])
      setNuevoPlato({ nombre: '', descripcion: '', categoria: 'Entrantes fríos', precio: '' })
      setMostrarFormulario(false)
      enriquecerPlato(data[0]).catch(() => {})
    }
  }

  function previsualizarImportacion() {
    setPlatosImportar(analizarCartaTexto(textoImportar, platos))
  }

  function archivoPdfSeleccionado(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPdfNombre(file.name)
    setErrorPdf('')
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = String(reader.result || '').split(',')[1]
      if (!base64) {
        setErrorPdf('No se pudo leer el archivo.')
        return
      }
      setLeyendoPdf(true)
      try {
        const res = await fetch('/api/importar-platos-pdf', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ fileBase64: base64, mediaType: file.type || 'application/pdf', restaurante_id: restaurante.id })
        })
        const data = await res.json()
        if (!res.ok || !data.texto) {
          setErrorPdf(data.error || 'No se encontraron platos en el archivo.')
        } else {
          setTextoImportar(data.texto)
          setPlatosImportar(analizarCartaTexto(data.texto, platos))
        }
      } catch (error) {
        setErrorPdf('Error leyendo el archivo. Revisa que sea PDF, JPG o PNG y vuelve a intentarlo.')
      }
      setLeyendoPdf(false)
    }
    reader.readAsDataURL(file)
  }

  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' }
  }

  function actualizarPlatoImportar(index, cambios) {
    setPlatosImportar(platosImportar.map((plato, i) => i === index ? { ...plato, ...cambios } : plato))
  }

  async function guardarImportacion() {
    const seleccionados = platosImportar.filter(plato => plato.activo && plato.nombre.trim())
    const nuevos = seleccionados.filter(plato => !plato.duplicado)
    const existentes = seleccionados.filter(plato => plato.duplicado)
    if ((!nuevos.length && !existentes.length) || !restaurante?.id) return
    setImportando(true)
    let data = []
    let error = null

    if (nuevos.length) {
      const insert = await supabase.from('platos').insert(nuevos.map(plato => ({
        nombre: plato.nombre.trim(),
        descripcion: plato.descripcion || '',
        categoria: plato.categoria || 'Entrantes fríos',
        precio: parseFloat(plato.precio) || 0,
        restaurante_id: restaurante.id,
        activo: true,
      }))).select(SELECT_CLIENT_PLATO_DASHBOARD)
      data = insert.data || []
      error = insert.error
    }

    if (!error && existentes.length) {
      for (const plato of existentes) {
        const actual = platos.find(p => normalizar(p.nombre) === normalizar(plato.nombre))
        if (!actual) continue
        const cambios = {
          precio: parseFloat(plato.precio) || Number(actual.precio) || 0,
          categoria: plato.categoria || actual.categoria,
          descripcion: plato.descripcion || actual.descripcion || '',
        }
        const update = await supabase.from('platos').update(cambios).eq('id', actual.id).select(SELECT_CLIENT_PLATO_DASHBOARD)
        if (update.error) {
          error = update.error
          break
        }
        data = [...data, ...(update.data || [])]
      }
    }

    if (!error) {
      const actualizados = data || []
      const idsActualizados = new Set(actualizados.map(plato => plato.id))
      setPlatos([...platos.filter(plato => !idsActualizados.has(plato.id)), ...actualizados])
      setTextoImportar('')
      setPlatosImportar([])
      setMostrarImportador(false)
      // Enriquecer Chartier en background (sin bloquear UI)
      actualizados.forEach(plato => enriquecerPlato(plato).catch(() => {}))
    }
    setImportando(false)
  }

  async function guardarEdicion(plato) {
    const { error } = await supabase.from('platos').update({
      nombre: plato.nombre,
      descripcion: plato.descripcion,
      categoria: plato.categoria,
      precio: parseFloat(plato.precio) || 0
    }).eq('id', plato.id)
    if (!error) {
      setPlatos(platos.map(p => p.id === plato.id ? { ...p, ...plato } : p))
      setEditandoPlato(null)
      enriquecerPlato({ ...plato, restaurante_id: restaurante.id }).catch(() => {})
    }
  }

  async function toggleActivo(plato) {
    await supabase.from('platos').update({ activo: !plato.activo }).eq('id', plato.id)
    setPlatos(platos.map(p => p.id === plato.id ? { ...p, activo: !p.activo } : p))
  }

  async function duplicarPlato(plato) {
    if (!restaurante?.id) return
    const copia = {
      restaurante_id: restaurante.id,
      nombre: `${plato.nombre} (copia)`,
      descripcion: plato.descripcion || '',
      categoria: plato.categoria || 'Entrantes frios',
      precio: Number(plato.precio) || 0,
      activo: false,
    }
    const { data, error } = await supabase.from('platos').insert([copia]).select(SELECT_CLIENT_PLATO_DASHBOARD)
    if (!error && data?.[0]) {
      setPlatos([...platos, data[0]])
      setMensajePlatos('Plato duplicado como borrador oculto')
      enriquecerPlato(data[0]).catch(() => {})
    }
  }

  async function borrarPlato(plato) {
    setBorrandoId(plato.id)
    setErrorPlatos('')
    try {
      const { error } = await supabase.from('platos').delete().eq('id', plato.id)
      if (error) throw error
      setPlatos(actual => actual.filter(p => p.id !== plato.id))
      return true
    } catch {
      setErrorPlatos('No se pudo eliminar el plato. Vuelve a intentarlo.')
      return false
    } finally {
      setBorrandoId('')
    }
  }

  function ordenarPorPlato(key) {
    setOrdenPlatos(actual => ({ key, dir: actual.key === key && actual.dir === 'asc' ? 'desc' : 'asc' }))
  }

  function valorOrdenPlato(plato, key) {
    if (key === 'precio') return Number(plato.precio) || 0
    if (key === 'categoria') return plato.categoria || ''
    if (key === 'descripcion') return plato.descripcion || ''
    return plato.nombre || ''
  }

  function platoComoFila(plato) {
    return [
      plato.nombre,
      plato.categoria,
      plato.precio,
      plato.descripcion,
      plato.activo === false ? 'Oculto' : 'Activo',
    ]
  }

  if (loading) return <LoadingState />

  if (esPerfilBodega(restaurante)) {
    return (
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Bodega"
        title="Platos y maridaje no incluidos en Sommelier"
        subtitle="El sumiller ya decide armonias y servicio. Esta membresia se enfoca en bodega: referencias, compras, inventario, TPV, margen y rotacion."
        actions={<Link className={styles.secondary} href="/dashboard/vinos">Gestionar referencias</Link>}
        narrow
      >
        <section className={styles.empty}>
          <div>
            <strong>Foco profesional</strong>
            <p>Los datos que importan aqui son coste, proveedor, stock minimo, venta real, margen y capital inmovilizado por vino.</p>
          </div>
        </section>
      </ModuleShell>
    )
  }

  const busquedaNormalizada = normalizar(busquedaPlatos)
  const filtrosPlatosNormalizados = Object.fromEntries(
    Object.entries(filtrosColumnaPlatos).map(([key, value]) => [key, normalizar(value)])
  )
  const platosVisibles = platos.filter(plato => {
    const texto = normalizar([plato.nombre, plato.descripcion, plato.categoria].filter(Boolean).join(' '))
    const coincideBusqueda = !busquedaNormalizada || texto.includes(busquedaNormalizada)
    const coincideEstado =
      filtroPlatos === 'todos' ||
      (filtroPlatos === 'activos' && plato.activo !== false) ||
      (filtroPlatos === 'ocultos' && plato.activo === false) ||
      (filtroPlatos === 'sin_descripcion' && (!plato.descripcion || plato.descripcion.trim().length < 8)) ||
      (filtroPlatos === 'sin_precio' && !Number(plato.precio))
    const coincideColumnas =
      (!filtrosPlatosNormalizados.plato || normalizar(plato.nombre || '').includes(filtrosPlatosNormalizados.plato)) &&
      (!filtrosPlatosNormalizados.categoria || normalizar(plato.categoria || '').includes(filtrosPlatosNormalizados.categoria)) &&
      (!filtrosPlatosNormalizados.precio || normalizar(String(plato.precio ?? '')).includes(filtrosPlatosNormalizados.precio)) &&
      (!filtrosPlatosNormalizados.descripcion || normalizar(plato.descripcion || '').includes(filtrosPlatosNormalizados.descripcion))
    return coincideBusqueda && coincideEstado && coincideColumnas
  }).sort((a, b) => {
    const valorA = valorOrdenPlato(a, ordenPlatos.key)
    const valorB = valorOrdenPlato(b, ordenPlatos.key)
    const resultado = typeof valorA === 'number' && typeof valorB === 'number'
      ? valorA - valorB
      : String(valorA).localeCompare(String(valorB), 'es', { numeric: true, sensitivity: 'base' })
    return ordenPlatos.dir === 'asc' ? resultado : -resultado
  })
  const totalPaginasPlatos = Math.max(1, Math.ceil(platosVisibles.length / pageSizePlatos))
  const paginaPlatosSegura = Math.min(paginaPlatos, totalPaginasPlatos)
  const inicioPlatos = (paginaPlatosSegura - 1) * pageSizePlatos
  const platosPagina = platosVisibles.slice(inicioPlatos, inicioPlatos + pageSizePlatos)
  const rangoPlatos = platosVisibles.length === 0 ? '0' : `${inicioPlatos + 1}-${inicioPlatos + platosPagina.length}`
  const cabeceraPlatos = ['Nombre', 'Categoria', 'Precio', 'Descripcion', 'Estado']
  const csvPlatos = [cabeceraPlatos, ...platosVisibles.map(platoComoFila)].map(fila => fila.map(csvValor).join(',')).join('\n')
  const platosActivos = platos.filter(plato => plato.activo !== false)
  const platosSinPrecio = platosActivos.filter(plato => !Number(plato.precio))
  const platosSinPistas = platosActivos.filter(plato => !plato.descripcion || plato.descripcion.trim().length < 8)
  const platosSinCategoria = platosActivos.filter(plato => !String(plato.categoria || '').trim())
  const platosSinRasgos = platosActivos.filter(plato => {
    const descripcion = normalizar(plato.descripcion || '')
    return !rasgosMaridaje.some(rasgo => descripcion.includes(normalizar(rasgo.texto)))
  })
  const pendientesPlatos = [
    { label: 'Sin precio', count: platosSinPrecio.length, filter: 'sin_precio', text: 'Frena publicacion y ticket.' },
    { label: 'Sin pistas', count: platosSinPistas.length, filter: 'sin_descripcion', text: 'Debilita el maridaje.' },
    { label: 'Sin categoria', count: platosSinCategoria.length, filter: 'todos', text: 'Cuesta escanear la carta.' },
    { label: 'Sin rasgos', count: platosSinRasgos.length, filter: 'sin_descripcion', text: 'Faltan señales de venta.' },
  ]

  async function copiarPlatos() {
    const texto = [cabeceraPlatos, ...platosVisibles.map(platoComoFila)].map(fila => fila.join('\t')).join('\n')
    await navigator.clipboard?.writeText(texto)
    setMensajePlatos(`${platosVisibles.length} platos copiados al portapapeles`)
  }

  async function copiarPlato(plato) {
    await navigator.clipboard?.writeText(platoComoFila(plato).join('\t'))
    setMensajePlatos('Plato copiado al portapapeles')
  }

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Carta de comida"
      title="Gestión de platos"
      subtitle="Mantiene precios, categorias y pistas de venta para que el maridaje entienda la carta real sin publicar recetas."
      actions={
        <>
          <button
            onClick={() => { setMostrarImportador(!mostrarImportador); setMostrarFormulario(false) }}
            className={mostrarImportador ? styles.ghost : styles.secondary}
          >
            {mostrarImportador ? 'Cerrar importador' : 'Importar carta'}
          </button>
          <button
            data-shortcut-edit="true"
            onClick={() => { setMostrarFormulario(!mostrarFormulario); setMostrarImportador(false) }}
            className={mostrarFormulario ? styles.ghost : styles.primary}
          >
            {mostrarFormulario ? 'Cancelar' : 'Añadir plato'}
          </button>
        </>
      }
      help={{
        title: 'Platos que ayudan a vender vino',
        intro: 'La carta de comida no es otro servicio: es contexto interno para que el maridaje tenga criterio.',
        items: [
          { title: 'Pistas de venta', text: 'Incluye tecnica, salsa, intensidad o ingrediente clave. No se muestra como receta en la carta publica.' },
          { title: 'Rasgos internos', text: 'Brasa, frito, queso o umami ayudan al sistema a cruzar mejor platos y vinos sin dar mas trabajo a sala.' },
          { title: 'Importación', text: 'Si subes la carta, revisa duplicados y categorías antes de guardar para no ensuciar la base.' },
        ],
      }}
    >
      <div className={styles.menuPage}>
        {errorPlatos && <div className={styles.empty} role="alert" style={{ minHeight: 70, marginBottom: 16, color: '#9b3535' }}>{errorPlatos}</div>}
        <section className={styles.pendingStrip}>
          <div>
            <p className={styles.eyebrow}>Cola de mejora</p>
            <h2>Lo que ayuda a vender vino con la comida</h2>
            <p>Precio y pistas de venta primero. Los rasgos convierten cada plato en una oportunidad de maridaje.</p>
          </div>
          <div className={styles.pendingGrid}>
            {pendientesPlatos.map(item => (
              <button
                key={item.label}
                type="button"
                className={filtroPlatos === item.filter ? styles.pendingItemActive : styles.pendingItem}
                onClick={() => { setFiltroPlatos(item.filter); setPaginaPlatos(1) }}
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
            <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>Importar carta</p>
            <p style={{ fontSize: 13, color: '#999', lineHeight: 1.6, margin: '0 0 16px' }}>
              Sube un PDF, JPG o PNG, o pega una lista de platos, uno por linea. La app intentara detectar categoria y rasgos internos de maridaje antes de guardar.
            </p>
            <input ref={inputPdfRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={archivoPdfSeleccionado} style={{ display: 'none' }} />
            <button onClick={() => inputPdfRef.current?.click()} disabled={leyendoPdf}
              style={{ width: '100%', background: leyendoPdf ? '#f3f3f3' : '#fafafa', color: leyendoPdf ? '#aaa' : '#111', border: '1px dashed #d8d8d8', padding: '18px', fontSize: 13, cursor: leyendoPdf ? 'not-allowed' : 'pointer', marginBottom: 12 }}>
              {leyendoPdf ? 'Leyendo archivo...' : pdfNombre ? `Archivo cargado: ${pdfNombre}` : 'Subir carta en PDF, JPG o PNG'}
            </button>
            {errorPdf && (
              <p style={{ fontSize: 12, color: '#c07070', margin: '0 0 12px' }}>{errorPdf}</p>
            )}
            <textarea
              value={textoImportar}
              onChange={e => setTextoImportar(e.target.value)}
              placeholder={'Ensaladilla rusa\nCroquetas de jamón\nCodillo al Pedro Ximénez\nSalmón con espárragos\nQueso curado con AOVE y nueces'}
              rows={7}
              style={{ width: '100%', padding: 14, border: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: '#fafafa', color: '#111', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'system-ui, sans-serif', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: platosImportar.length ? 18 : 0 }}>
              <button onClick={previsualizarImportacion} style={{ background: '#111', color: '#fff', border: 'none', padding: '11px 20px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Previsualizar
              </button>
              {platosImportar.length > 0 && (
                <button onClick={guardarImportacion} disabled={importando || !platosImportar.some(p => p.activo)}
                  style={{ background: importando ? '#888' : '#fff', color: importando ? '#fff' : '#111', border: '1px solid #e8e8e8', padding: '11px 20px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: importando ? 'not-allowed' : 'pointer' }}>
                  {importando ? 'Guardando...' : `Guardar/actualizar ${platosImportar.filter(p => p.activo).length}`}
                </button>
              )}
            </div>

            {platosImportar.length > 0 && (
              <div style={{ border: '1px solid #f0f0f0', overflow: 'hidden' }}>
                {platosImportar.map((plato, index) => (
                  <div key={`${plato.nombre}-${index}`} className={styles.importDishRow} style={{ borderBottom: index < platosImportar.length - 1 ? '1px solid #f8f8f8' : 'none', opacity: plato.activo ? 1 : 0.45 }}>
                    <input type="checkbox" checked={plato.activo} onChange={e => actualizarPlatoImportar(index, { activo: e.target.checked })} style={{ marginTop: 10 }} />
                    <input value={plato.nombre} onChange={e => actualizarPlatoImportar(index, { nombre: e.target.value })} style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 13, color: '#111', background: 'transparent' }} />
                    <select value={plato.categoria} onChange={e => actualizarPlatoImportar(index, { categoria: e.target.value })} style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }}>
                      {categorias.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}
                    </select>
                    <input value={plato.precio || ''} onChange={e => actualizarPlatoImportar(index, { precio: e.target.value })} placeholder="Precio" style={{ border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent' }} />
                    <div>
                      <input value={plato.descripcion} onChange={e => actualizarPlatoImportar(index, { descripcion: e.target.value })} style={{ width: '100%', border: 'none', borderBottom: '1px solid #eee', outline: 'none', fontSize: 12, color: '#777', background: 'transparent', boxSizing: 'border-box' }} />
                      {plato.duplicado && <p style={{ fontSize: 10, color: '#BA7517', margin: '4px 0 0' }}>Ya existe: se actualizará</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ResponsiveOverlay
          open={mostrarFormulario}
          onClose={() => setMostrarFormulario(false)}
          eyebrow="Carta de comida"
          title="Añadir plato"
          description="Añade precio y unas pocas pistas internas para que sala y el motor de maridaje entiendan el plato."
          footer={
            <>
              <button type="button" className={styles.ghost} onClick={() => setMostrarFormulario(false)}>Cancelar</button>
              <button data-shortcut-save="true" className={styles.primary} onClick={añadirPlato} disabled={!nuevoPlato.nombre}>Guardar plato</button>
            </>
          }
        >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px 28px', marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Nombre *</label>
                <input type="text" value={nuevoPlato.nombre} onChange={e => setNuevoPlato({ ...nuevoPlato, nombre: e.target.value })}
                  placeholder="Ej. Codillo al Pedro Ximénez"
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Categoría</label>
                <select value={nuevoPlato.categoria} onChange={e => setNuevoPlato({ ...nuevoPlato, categoria: e.target.value })}
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111' }}>
                  {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Precio (€)</label>
                <input type="number" value={nuevoPlato.precio} onChange={e => setNuevoPlato({ ...nuevoPlato, precio: e.target.value })}
                  placeholder="Ej. 12.50"
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Pistas de venta y maridaje</label>
                <input type="text" value={nuevoPlato.descripcion} onChange={e => setNuevoPlato({ ...nuevoPlato, descripcion: e.target.value })}
                  placeholder="Ej. deshuesado, salsa de PX, meloso, umami"
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
                <p style={{ fontSize: 11, color: '#bbb', margin: '8px 0 0', lineHeight: 1.5 }}>Uso interno para recomendar vino y ayudar a sala. No se muestra como receta en la carta publica.</p>
              </div>
              <RasgosMaridaje plato={nuevoPlato} onChange={setNuevoPlato} />
            </div>
        </ResponsiveOverlay>

        <section className={styles.listToolbar}>
          <div>
            <label className={styles.label}>Buscar plato</label>
            <input
              className={styles.searchInput}
              value={busquedaPlatos}
              onChange={e => { setBusquedaPlatos(e.target.value); setPaginaPlatos(1) }}
              placeholder="Nombre, categoría, técnica, salsa o ingrediente"
            />
          </div>
          <div>
            <label className={styles.label}>Vista</label>
            <select className={styles.toolbarSelect} value={filtroPlatos} onChange={e => { setFiltroPlatos(e.target.value); setPaginaPlatos(1) }}>
              <option value="todos">Todos los platos</option>
              <option value="activos">Activos</option>
              <option value="sin_descripcion">Sin pistas de venta</option>
              <option value="sin_precio">Sin precio</option>
              <option value="ocultos">Ocultos</option>
            </select>
          </div>
          <div className={styles.toolbarSummary}>
            <p className={styles.resultCount}>{rangoPlatos} de {platosVisibles.length} platos</p>
            <label className={styles.pageSizeControl}>
              <span>Por pagina</span>
              <select value={pageSizePlatos} onChange={e => { setPageSizePlatos(Number(e.target.value)); setPaginaPlatos(1) }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            {puedeAnalizarChartier && (
            <button
              onClick={enriquecerTodosLosPlatos}
              className={styles.bulkToggle}
              disabled={enriqueciendoBatch}
              title="Analiza con IA los platos sin perfil aromático Chartier"
            >
              {enriqueciendoBatch ? '⏳ Analizando...' : '✦ Analizar Chartier'}
            </button>
            )}
            <div className={styles.quickActions}>
              <button type="button" onClick={() => descargarArchivo('platos.csv', csvPlatos)}>CSV</button>
              <button type="button" onClick={copiarPlatos}>Copiar</button>
            </div>
          </div>
          {resultadoBatch && (
            <p style={{ fontSize: 11, color: resultadoBatch.error ? '#c07070' : '#5a9a6a', margin: '6px 0 0', gridColumn: '1 / -1' }}>
              {resultadoBatch.error || resultadoBatch.mensaje}
            </p>
          )}
        </section>

        {mensajePlatos && (
          <div className={styles.inlineToast} role="status">
            {mensajePlatos}
            <button type="button" onClick={() => setMensajePlatos('')} aria-label="Cerrar aviso">Cerrar</button>
          </div>
        )}

        <div className={styles.dataList}>
          <div className={styles.dishListHeader}>
            {['Plato', 'Categoría', 'Precio', 'Pistas de venta', ''].map(h => (
              <p key={h} style={{ fontSize: 10, color: '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{h}</p>
            ))}
          </div>

          <div className={`${styles.inlineColumnFilters} ${styles.dishColumnFilters}`}>
            <button type="button" onClick={() => ordenarPorPlato('nombre')}>Plato {ordenPlatos.key === 'nombre' ? (ordenPlatos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => ordenarPorPlato('categoria')}>Categoria {ordenPlatos.key === 'categoria' ? (ordenPlatos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => ordenarPorPlato('precio')}>Precio {ordenPlatos.key === 'precio' ? (ordenPlatos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" onClick={() => ordenarPorPlato('descripcion')}>Pistas {ordenPlatos.key === 'descripcion' ? (ordenPlatos.dir === 'asc' ? '↑' : '↓') : ''}</button>
            <span />
            <input aria-label="Filtrar plato" value={filtrosColumnaPlatos.plato} onChange={e => { setFiltrosColumnaPlatos({ ...filtrosColumnaPlatos, plato: e.target.value }); setPaginaPlatos(1) }} placeholder="Filtrar plato" />
            <input aria-label="Filtrar categoria" value={filtrosColumnaPlatos.categoria} onChange={e => { setFiltrosColumnaPlatos({ ...filtrosColumnaPlatos, categoria: e.target.value }); setPaginaPlatos(1) }} placeholder="Categoria" />
            <input aria-label="Filtrar precio" value={filtrosColumnaPlatos.precio} onChange={e => { setFiltrosColumnaPlatos({ ...filtrosColumnaPlatos, precio: e.target.value }); setPaginaPlatos(1) }} placeholder="Precio" />
            <input aria-label="Filtrar pistas de venta" value={filtrosColumnaPlatos.descripcion} onChange={e => { setFiltrosColumnaPlatos({ ...filtrosColumnaPlatos, descripcion: e.target.value }); setPaginaPlatos(1) }} placeholder="Pistas" />
            <button type="button" className={styles.clearFilters} onClick={() => { setFiltrosColumnaPlatos({ plato: '', categoria: '', precio: '', descripcion: '' }); setPaginaPlatos(1) }}>Limpiar</button>
          </div>

          {platosVisibles.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <p style={{ color: '#ccc', fontSize: 14, fontWeight: 300 }}>Aún no hay platos que coincidan con esta vista.</p>
            </div>
          ) : (
            platosPagina.map((p, i) => (
              <div key={p.id} className={styles.wineRowGroup}>
                <div className={styles.dishListRow} style={{
                  borderBottom: i < platosPagina.length - 1 ? '1px solid #f8f8f8' : 'none',
                  opacity: p.activo ? 1 : 0.4
                }}>
                  <p style={{ margin: 0, fontSize: 14, color: '#111' }}>{p.nombre}</p>
                  <p data-label="Categoria" style={{ margin: 0, fontSize: 12, color: '#888' }}>{p.categoria}</p>
                  <p data-label="Precio" style={{ margin: 0, fontSize: 12, color: '#111' }}>{Number(p.precio) ? `${Number(p.precio).toFixed(2)} €` : '—'}</p>
                  <p data-label="Pistas" style={{ margin: 0, fontSize: 12, color: '#bbb' }}>{p.descripcion || '—'}</p>
                  <div
                    className={`${styles.rowMenu}${menuPlato === p.id ? ' ' + styles.rowMenuOpen : ''}`}
                    ref={menuPlato === p.id ? menuPlatoRef : null}
                  >
                    <button
                      className={styles.rowMenuTrigger}
                      aria-label={`Acciones para ${p.nombre}`}
                      onClick={() => setMenuPlato(menuPlato === p.id ? null : p.id)}
                    >...</button>
                    {menuPlato === p.id && (
                      <div className={styles.rowMenuDropdown}>
                        <button data-shortcut-edit="true" onClick={() => { setMenuPlato(null); setEditandoPlato({ ...p, precio: p.precio || '' }) }}>Editar</button>
                        <button onClick={() => { setMenuPlato(null); copiarPlato(p) }}>Copiar fila</button>
                        <button onClick={() => { setMenuPlato(null); duplicarPlato(p) }}>Duplicar</button>
                        <button onClick={() => { setMenuPlato(null); toggleActivo(p) }}>{p.activo ? 'Ocultar' : 'Mostrar'}</button>
                        <button className={styles.dangerAction} onClick={() => { setMenuPlato(null); setPlatoBorrar(p) }}>Borrar</button>
                      </div>
                    )}
                  </div>
                </div>
                {editandoPlato?.id === p.id && (
                  <ResponsiveOverlay
                    open
                    onClose={() => setEditandoPlato(null)}
                    eyebrow="Carta de comida"
                    title={`Editar ${editandoPlato.nombre}`}
                    description="Mantén el precio y las pistas internas que usa sala para recomendar."
                    footer={
                      <>
                        <button type="button" className={styles.ghost} onClick={() => setEditandoPlato(null)}>Cancelar</button>
                        <button data-shortcut-save="true" className={styles.primary} onClick={() => guardarEdicion(editandoPlato)} disabled={!editandoPlato.nombre}>Guardar cambios</button>
                      </>
                    }
                  >
                    <div className={styles.wineFormGrid}>
                      <div>
                        <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Nombre *</label>
                        <input type="text" value={editandoPlato.nombre} onChange={e => setEditandoPlato({ ...editandoPlato, nombre: e.target.value })}
                          style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Categoría</label>
                        <select value={editandoPlato.categoria} onChange={e => setEditandoPlato({ ...editandoPlato, categoria: e.target.value })}
                          style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111' }}>
                          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Precio (€)</label>
                        <input type="number" value={editandoPlato.precio || ''} onChange={e => setEditandoPlato({ ...editandoPlato, precio: e.target.value })}
                          style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Pistas de venta y maridaje</label>
                        <input type="text" value={editandoPlato.descripcion || ''} onChange={e => setEditandoPlato({ ...editandoPlato, descripcion: e.target.value })}
                          style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
                        <p style={{ fontSize: 11, color: '#bbb', margin: '8px 0 0', lineHeight: 1.5 }}>Uso interno para recomendar vino y ayudar a sala. No se muestra como receta en la carta publica.</p>
                      </div>
                      <RasgosMaridaje plato={editandoPlato} onChange={setEditandoPlato} />
                    </div>
                  </ResponsiveOverlay>
                )}
              </div>
            ))
          )}
        </div>
        {platosVisibles.length > pageSizePlatos && (
          <nav className={styles.paginationBar} aria-label="Paginacion de platos">
            <button type="button" onClick={() => setPaginaPlatos(Math.max(1, paginaPlatosSegura - 1))} disabled={paginaPlatosSegura === 1}>
              Anterior
            </button>
            <span>Pagina {paginaPlatosSegura} de {totalPaginasPlatos}</span>
            <button type="button" onClick={() => setPaginaPlatos(Math.min(totalPaginasPlatos, paginaPlatosSegura + 1))} disabled={paginaPlatosSegura === totalPaginasPlatos}>
              Siguiente
            </button>
          </nav>
        )}
        <ConfirmationDialog
          open={Boolean(platoBorrar)}
          onClose={() => setPlatoBorrar(null)}
          title="Eliminar plato"
          description={`Se eliminará “${platoBorrar?.nombre || ''}” de forma permanente.`}
          confirmLabel="Eliminar definitivamente"
          busy={Boolean(borrandoId)}
          onConfirm={async () => {
            const plato = platoBorrar
            if (!plato) return
            const eliminado = await borrarPlato(plato)
            if (eliminado) setPlatoBorrar(null)
          }}
        />
      </div>
    </ModuleShell>
  )
}
