'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

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
    { match: ['frio', 'fria', 'salmorejo', 'mazamorra', 'ensaladilla', 'gazpacho'], rasgo: 'frio' },
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
      <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '4px 0 10px' }}>Rasgos para maridaje</p>
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
        Estos rasgos se guardan en la descripción y ayudan al modo camarero a entender técnica, salsa e intensidad.
      </p>
    </div>
  )
}

export default function Platos() {
  const [restaurante, setRestaurante] = useState(null)
  const [platos, setPlatos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarImportador, setMostrarImportador] = useState(false)
  const [editandoPlato, setEditandoPlato] = useState(null)
  const [nuevoPlato, setNuevoPlato] = useState({ nombre: '', descripcion: '', categoria: 'Entrantes fríos', precio: '' })
  const [textoImportar, setTextoImportar] = useState('')
  const [platosImportar, setPlatosImportar] = useState([])
  const [importando, setImportando] = useState(false)
  const [pdfNombre, setPdfNombre] = useState('')
  const [leyendoPdf, setLeyendoPdf] = useState(false)
  const [errorPdf, setErrorPdf] = useState('')
  const inputPdfRef = useRef(null)

  const categorias = ['Entrantes fríos', 'Entrantes calientes', 'Cuchara', 'De la tierra', 'Del mar', 'Tablas', 'Postres']

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data } = await supabase.from('platos').select('*').eq('restaurante_id', rest.id).order('categoria')
        setPlatos(data || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function añadirPlato() {
    if (!nuevoPlato.nombre.trim()) return
    const { data, error } = await supabase.from('platos').insert([{
      ...nuevoPlato,
      precio: parseFloat(nuevoPlato.precio) || 0,
      restaurante_id: restaurante.id,
      activo: true
    }]).select()
    if (!error) {
      setPlatos([...platos, data[0]])
      setNuevoPlato({ nombre: '', descripcion: '', categoria: 'Entrantes fríos', precio: '' })
      setMostrarFormulario(false)
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 })
        })
        const data = await res.json()
        if (!res.ok || !data.texto) {
          setErrorPdf(data.error || 'No se encontraron platos en el PDF.')
        } else {
          setTextoImportar(data.texto)
          setPlatosImportar(analizarCartaTexto(data.texto, platos))
        }
      } catch (error) {
        setErrorPdf('Error leyendo el PDF. Revisa que sea un PDF de texto y vuelve a intentarlo.')
      }
      setLeyendoPdf(false)
    }
    reader.readAsDataURL(file)
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
      }))).select()
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
        const update = await supabase.from('platos').update(cambios).eq('id', actual.id).select()
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
    }
  }

  async function toggleActivo(plato) {
    await supabase.from('platos').update({ activo: !plato.activo }).eq('id', plato.id)
    setPlatos(platos.map(p => p.id === plato.id ? { ...p, activo: !p.activo } : p))
  }

  async function borrarPlato(plato) {
    if (!confirm(`¿Seguro que quieres eliminar "${plato.nombre}"?`)) return
    await supabase.from('platos').delete().eq('id', plato.id)
    setPlatos(platos.filter(p => p.id !== plato.id))
  }

  if (loading) return <LoadingState />

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Carta de comida"
      title="Gestion de platos"
      subtitle="Mantiene precios, categorias y rasgos culinarios claros para que el maridaje entienda la carta real del restaurante."
      actions={
        <>
          <button
            onClick={() => { setMostrarImportador(!mostrarImportador); setMostrarFormulario(false) }}
            className={mostrarImportador ? styles.ghost : styles.secondary}
          >
            {mostrarImportador ? 'Cerrar importador' : 'Importar carta'}
          </button>
          <button
            onClick={() => { setMostrarFormulario(!mostrarFormulario); setMostrarImportador(false) }}
            className={mostrarFormulario ? styles.ghost : styles.primary}
          >
            {mostrarFormulario ? 'Cancelar' : 'Anadir plato'}
          </button>
        </>
      }
    >
      <div style={{ display: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/dashboard" style={{ fontSize: 12, color: '#aaa', textDecoration: 'none', letterSpacing: '0.05em' }}>← Volver</a>
          <div style={{ width: 1, height: 32, background: '#e8e8e8' }} />
          <p style={{ fontSize: 15, fontWeight: 400, color: '#111', margin: 0, fontFamily: 'Georgia, serif' }}>{restaurante?.nombre}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setMostrarImportador(!mostrarImportador); setMostrarFormulario(false) }} style={{
            background: mostrarImportador ? 'transparent' : '#fff', color: '#777',
            border: '1px solid #e8e8e8',
            padding: '8px 16px', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer'
          }}>
            {mostrarImportador ? 'Cerrar importador' : 'Importar carta'}
          </button>
          <button onClick={() => { setMostrarFormulario(!mostrarFormulario); setMostrarImportador(false) }} style={{
            background: mostrarFormulario ? 'transparent' : '#111', color: mostrarFormulario ? '#aaa' : '#fff',
            border: mostrarFormulario ? '1px solid #e8e8e8' : '1px solid #111',
            padding: '8px 20px', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer'
          }}>
            {mostrarFormulario ? 'Cancelar' : '+ Añadir plato'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 32px' }}>
        {mostrarImportador && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '28px', marginBottom: 24 }}>
            <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>Importar carta</p>
            <p style={{ fontSize: 13, color: '#999', lineHeight: 1.6, margin: '0 0 16px' }}>
              Sube un PDF o pega una lista de platos, uno por línea. La app intentará detectar categoría y rasgos de maridaje antes de guardar.
            </p>
            <input ref={inputPdfRef} type="file" accept="application/pdf" onChange={archivoPdfSeleccionado} style={{ display: 'none' }} />
            <button onClick={() => inputPdfRef.current?.click()} disabled={leyendoPdf}
              style={{ width: '100%', background: leyendoPdf ? '#f3f3f3' : '#fafafa', color: leyendoPdf ? '#aaa' : '#111', border: '1px dashed #d8d8d8', padding: '18px', fontSize: 13, cursor: leyendoPdf ? 'not-allowed' : 'pointer', marginBottom: 12 }}>
              {leyendoPdf ? 'Leyendo PDF...' : pdfNombre ? `PDF cargado: ${pdfNombre}` : 'Subir carta en PDF'}
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
                  <div key={`${plato.nombre}-${index}`} style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 1fr 80px 2fr', gap: 12, padding: '12px 14px', borderBottom: index < platosImportar.length - 1 ? '1px solid #f8f8f8' : 'none', opacity: plato.activo ? 1 : 0.45 }}>
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

        {mostrarFormulario && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '28px', marginBottom: 24 }}>
            <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 20px' }}>Nuevo plato</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px', marginBottom: 16 }}>
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
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Descripción</label>
                <input type="text" value={nuevoPlato.descripcion} onChange={e => setNuevoPlato({ ...nuevoPlato, descripcion: e.target.value })}
                  placeholder="Ej. Deshuesado, con salsa de PX"
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
              </div>
              <RasgosMaridaje plato={nuevoPlato} onChange={setNuevoPlato} />
            </div>
            <button onClick={añadirPlato} style={{ background: '#111', color: '#fff', border: 'none', padding: '12px 28px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Guardar plato
            </button>
          </div>
        )}

        {editandoPlato && (
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '28px', marginBottom: 24 }}>
            <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 20px' }}>Editando: {editandoPlato.nombre}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 28px', marginBottom: 16 }}>
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
                <label style={{ fontSize: 11, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Descripción</label>
                <input type="text" value={editandoPlato.descripcion || ''} onChange={e => setEditandoPlato({ ...editandoPlato, descripcion: e.target.value })}
                  style={{ width: '100%', padding: '10px 0', border: 'none', borderBottom: '1px solid #e8e8e8', fontSize: 14, outline: 'none', background: 'transparent', color: '#111', boxSizing: 'border-box' }} />
              </div>
              <RasgosMaridaje plato={editandoPlato} onChange={setEditandoPlato} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => guardarEdicion(editandoPlato)} style={{ background: '#111', color: '#fff', border: 'none', padding: '12px 28px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Guardar cambios
              </button>
              <button onClick={() => setEditandoPlato(null)} style={{ background: 'none', border: '1px solid #e8e8e8', padding: '12px 28px', fontSize: 11, color: '#aaa', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 80px 2fr 160px', gap: 12, padding: '12px 20px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
            {['Plato', 'Categoría', 'Precio', 'Descripción', ''].map(h => (
              <p key={h} style={{ fontSize: 10, color: '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{h}</p>
            ))}
          </div>

          {platos.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <p style={{ color: '#ccc', fontSize: 14, fontWeight: 300 }}>Aún no hay platos. Añade el primero.</p>
            </div>
          ) : (
            platos.map((p, i) => (
              <div key={p.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1.3fr 80px 2fr 160px', gap: 12,
                padding: '14px 20px', borderBottom: i < platos.length - 1 ? '1px solid #f8f8f8' : 'none',
                opacity: p.activo ? 1 : 0.4
              }}>
                <p style={{ margin: 0, fontSize: 14, color: '#111' }}>{p.nombre}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{p.categoria}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#111' }}>{Number(p.precio) ? `${Number(p.precio).toFixed(2)} €` : '—'}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#bbb' }}>{p.descripcion || '—'}</p>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setEditandoPlato(p)} style={{ background: 'none', border: '1px solid #e8e8e8', padding: '3px 8px', fontSize: 10, color: '#aaa', cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => toggleActivo(p)} style={{ background: 'none', border: '1px solid #e8e8e8', padding: '3px 8px', fontSize: 10, color: '#aaa', cursor: 'pointer' }}>{p.activo ? 'Ocultar' : 'Mostrar'}</button>
                  <button onClick={() => borrarPlato(p)} style={{ background: 'none', border: '1px solid #f0c0c0', padding: '3px 8px', fontSize: 10, color: '#c07070', cursor: 'pointer' }}>Borrar</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ModuleShell>
  )
}
