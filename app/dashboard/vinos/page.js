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
  const [loading, setLoading] = useState(true)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarImportador, setMostrarImportador] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('importar') === '1') setMostrarImportador(true)
  }, [])
  const [busquedaVinos, setBusquedaVinos] = useState('')
  const [filtroVinos, setFiltroVinos] = useState('todos')
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
      }
      setLoading(false)
    }
    cargarDatos()
  }, [])

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nuevoVino.nombre,
          bodega: nuevoVino.bodega,
          tipo: nuevoVino.tipo,
          region: nuevoVino.region,
          uva: nuevoVino.uva,
          anada: nuevoVino.anada
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

async function archivoPdfSeleccionado(e) {
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
      const res = await fetch('/api/importar-vinos-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mediaType: file.type || 'application/pdf' })
      })
      const data = await res.json()
      if (!res.ok || !Array.isArray(data.vinos) || !data.vinos.length) {
        setErrorPdf(data.error || 'No se encontraron vinos en el archivo.')
      } else {
        setVinosImportar(data.vinos.map(vino => ({
          nombre: vino.nombre || '',
          bodega: vino.bodega || '',
          tipo: vino.tipo || 'tinto',
          region: vino.region || '',
          uva: vino.uva || '',
          anada: vino.anada || '',
          precio_copa: vino.precio_copa || '',
          precio_botella: vino.precio_botella || '',
          stock: 1,
          notas_cata: vino.notas_cata || '',
          activo: true,
        })))
      }
    } catch (error) {
      setErrorPdf('Error leyendo el archivo. Formatos válidos: PDF, Excel (.xlsx), CSV, JPG o PNG.')
    }
    setLeyendoPdf(false)
  }
  reader.readAsDataURL(file)
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

  const tipoDot = { tinto: '#7B2D2D', blanco: '#C4A55A', rosado: '#C47A8A', espumoso: '#4A8C6F', generoso: '#854F0B', dulce: '#993556', naranja: '#D85A30' }
  const tipoLabel = { tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso', generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja' }

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
      (filtroVinos === 'stock' && Number(vino.stock_minimo || 0) > 0 && Number(vino.stock) <= Number(vino.stock_minimo || 0))
    return coincideBusqueda && coincideEstado
  })

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
        {mostrarImportador && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '28px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>Importar carta de vinos</p>
            <p style={{ fontSize: 13, color: '#999', lineHeight: 1.6, margin: '0 0 16px' }}>
              Sube la carta en cualquier formato: PDF, Excel, CSV o foto (JPG/PNG). La IA extrae nombre, bodega, tipo, región, uva, añada y precios. Revisa y corrige antes de guardar.
            </p>
            <input ref={inputPdfRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.xlsx,.xls,.csv,text/csv" onChange={archivoPdfSeleccionado} style={{ display: 'none' }} />
            <button onClick={() => inputPdfRef.current?.click()} disabled={leyendoPdf}
              style={{ width: '100%', background: leyendoPdf ? '#f3f3f3' : '#fafafa', color: leyendoPdf ? '#aaa' : '#111', border: '1px dashed #d8d8d8', padding: '18px', fontSize: 13, cursor: leyendoPdf ? 'not-allowed' : 'pointer', marginBottom: 12 }}>
              {leyendoPdf ? 'Leyendo archivo...' : pdfNombre ? `Archivo cargado: ${pdfNombre}` : 'PDF · Excel · CSV · Foto — arrastra o haz clic'}
            </button>
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
                          {['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja'].map(tipo => <option key={tipo} value={tipo}>{tipoLabel[tipo]}</option>)}
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
                </select>
              </div>
              {campo('Precio copa (€)', 'precio_copa', '4.00', 'number')}
              {campo('Precio botella (€)', 'precio_botella', '22.00', 'number')}
              {campo('Stock', 'stock', '12', 'number')}
              {campo('Coste compra (€)', 'coste_compra', '8.50', 'number')}
              {campo('Stock mínimo', 'stock_minimo', '3', 'number')}
              {campo('Proveedor', 'proveedor', 'Distribuidor habitual')}
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
            </div>
            <button onClick={añadirVino} disabled={generandoCata} style={{ background: generandoCata ? '#888' : '#111', color: '#fff', border: 'none', padding: '12px 28px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: generandoCata ? 'not-allowed' : 'pointer' }}>
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
          <div className={styles.segmented}>
            {[
              ['todos', 'Todos'],
              ['activos', 'Activos'],
              ['pendientes', 'Pendientes'],
              ['stock', 'Stock bajo'],
              ['ocultos', 'Ocultos'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={filtroVinos === id ? styles.segmentActive : ''}
                onClick={() => setFiltroVinos(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className={styles.resultCount}>{vinosVisibles.length} de {vinosBase.length} referencias</p>
        </section>

        <div className={styles.wineList}>
          {/* Cabecera columnas */}
          <div className={styles.wineListHeader}>
  {['Vino', 'Bodega · Región', 'Copa', 'Botella', 'Stock', ''].map(h => (
              <p key={h} style={{ fontSize: 10, color: '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{h}</p>
            ))}
          </div>

          {vinosVisibles.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <p style={{ color: '#ccc', fontSize: 14, fontWeight: 300 }}>{filtroUrl === 'pendientes' ? 'No hay vinos pendientes de completar.' : 'Aún no hay vinos. Añade el primero.'}</p>
            </div>
          ) : (
            vinosVisibles.map((v, i) => (
              <div key={v.id} className={styles.wineRowGroup}>
              <div className={styles.wineListRow} style={{
                borderBottom: i < vinosVisibles.length - 1 ? '1px solid #f8f8f8' : 'none',
                opacity: v.activo ? 1 : 0.4
              }}>
                <div className={styles.wineNameCell}>
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
                <p style={{ margin: 0, fontSize: 13, color: '#888', alignSelf: 'center' }}>{v.bodega}{v.region ? ` · ${v.region}` : ''}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#111', alignSelf: 'center' }}>{v.precio_copa} €</p>
                <p style={{ margin: 0, fontSize: 13, color: '#111', alignSelf: 'center' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
  <button onClick={() => actualizarStock(v, -1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #e8e8e8', background: 'none', cursor: v.stock === 0 ? 'not-allowed' : 'pointer', color: '#aaa', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>−</button>
  <span style={{ fontSize: 13, color: v.stock === 0 ? '#C47A8A' : v.stock <= 3 ? '#C4A55A' : '#888', minWidth: 20, textAlign: 'center' }}>{v.stock}</span>
  <button onClick={() => actualizarStock(v, 1)} style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid #e8e8e8', background: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>+</button>
</div>
                <div style={{ display: 'flex', gap: 4, alignSelf: 'center' }}>
  <button onClick={() => { setEditandoVino({...v, precio_copa: v.precio_copa || '', precio_botella: v.precio_botella || '', coste_compra: v.coste_compra || '', stock_minimo: v.stock_minimo || '', proveedor: v.proveedor || ''}); }} style={{ background: 'none', border: '1px solid #e8e8e8', padding: '4px 10px', fontSize: 10, color: '#aaa', cursor: 'pointer' }}>
    Editar
  </button>
  <button onClick={() => toggleActivo(v)} style={{ background: 'none', border: '1px solid #e8e8e8', padding: '4px 10px', fontSize: 10, color: '#aaa', cursor: 'pointer' }}>
    {v.activo ? 'Ocultar' : 'Mostrar'}
  </button>
  <button onClick={() => borrarVino(v)} style={{ background: 'none', border: '1px solid #f0c0c0', padding: '4px 10px', fontSize: 10, color: '#c07070', cursor: 'pointer' }}>
    Borrar
  </button>
</div>
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
                          style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: 'transparent', color: '#111' }}
                        />
                      </div>
                    ))}
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
                    <button onClick={() => guardarEdicion(editandoVino)} style={{ background: '#111', color: '#fff', border: 'none', padding: '12px 28px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
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
      </div>
    </ModuleShell>
  )
}
