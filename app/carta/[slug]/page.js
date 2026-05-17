'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import styles from './carta.module.css'

const t = {
  es: {
    cargando: 'CARGANDO',
    noEncontrado: 'Restaurante no encontrado.',
    referencias: 'referencias',
    carta: 'Carta',
    sommelier: 'Sommelier',
    buscar: 'Buscar vino, bodega o uva...',
    filtros: 'Filtros',
    todos: 'Todos',
    precioMaximo: 'Precio máximo',
    sinLimite: 'Sin límite',
    soloInternacionales: 'Solo internacionales',
    limpiarFiltros: 'Limpiar filtros',
    sinResultados: 'Sin resultados para esta búsqueda.',
    seleccionEspecial: 'Selección especial',
    fichaVino: 'Ficha del vino',
    region: 'Región',
    uva: 'Uva',
    anada: 'Añada',
    copa: 'Copa',
    botella: 'Botella',
    notasCata: 'Notas de cata',
    quePedir: '¿Qué vas a pedir?',
    seleccionaPlatos: 'Selecciona tus platos y te recomiendo el vino perfecto.',
    buscarPlato: 'Buscar plato...',
    sinPlatos: 'No hay platos con esa búsqueda.',
    tuSeleccion: 'Tu selección',
    comoQuieres: '¿Cómo quieres el vino?',
    unaBotella: 'Una botella',
    paraMesa: 'Para toda la mesa',
    porCopas: 'Por copas',
    porPlato: 'Una por plato',
    progresion: 'Progresión',
    variosOrden: 'Varios en orden',
    pedirRecomendacion: 'Pedir recomendación',
    consultando: 'Consultando...',
    nuevaConsulta: 'Nueva consulta',
    comparar: 'Comparar',
    vinosSeleccionados: 'vinos · Comparar',
    cerrarComparador: 'Cerrar comparador',
    añadirComparador: 'Añadir a comparador',
    quitarComparador: 'Quitar',
    maxComparador: 'Máximo 4 vinos',
    tipoLabel: { tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso', generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja' },
    tipoPlural: { tinto: 'Tintos', blanco: 'Blancos', rosado: 'Rosados', espumoso: 'Espumosos', generoso: 'Generosos', dulce: 'Dulces', naranja: 'Naranjas' },
    btl: 'btl',
  },
  en: {
    cargando: 'LOADING',
    noEncontrado: 'Restaurant not found.',
    referencias: 'wines',
    carta: 'Wine list',
    sommelier: 'Sommelier',
    buscar: 'Search wine, winery or grape...',
    filtros: 'Filters',
    todos: 'All',
    precioMaximo: 'Maximum price',
    sinLimite: 'No limit',
    soloInternacionales: 'International only',
    limpiarFiltros: 'Clear filters',
    sinResultados: 'No results for this search.',
    seleccionEspecial: 'Special selection',
    fichaVino: 'Wine details',
    region: 'Region',
    uva: 'Grape',
    anada: 'Vintage',
    copa: 'Glass',
    botella: 'Bottle',
    notasCata: 'Tasting notes',
    quePedir: 'What are you having?',
    seleccionaPlatos: 'Select your dishes and I\'ll recommend the perfect wine.',
    buscarPlato: 'Search dish...',
    sinPlatos: 'No dishes found for this search.',
    tuSeleccion: 'Your selection',
    comoQuieres: 'How would you like the wine?',
    unaBotella: 'One bottle',
    paraMesa: 'For the whole table',
    porCopas: 'By the glass',
    porPlato: 'One per dish',
    progresion: 'Progression',
    variosOrden: 'Several in order',
    pedirRecomendacion: 'Get recommendation',
    consultando: 'Consulting...',
    nuevaConsulta: 'New query',
    comparar: 'Compare',
    vinosSeleccionados: 'wines · Compare',
    cerrarComparador: 'Close comparator',
    añadirComparador: 'Add to compare',
    quitarComparador: 'Remove',
    maxComparador: 'Maximum 4 wines',
    tipoLabel: { tinto: 'Red', blanco: 'White', rosado: 'Rosé', espumoso: 'Sparkling', generoso: 'Fortified', dulce: 'Sweet', naranja: 'Orange' },
    tipoPlural: { tinto: 'Reds', blanco: 'Whites', rosado: 'Rosés', espumoso: 'Sparkling', generoso: 'Fortified', dulce: 'Sweet', naranja: 'Orange' },
    btl: 'btl',
  }
}

export default function CartaPublica({ params }) {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [seleccion, setSeleccion] = useState([])
  const [platosSeleccionados, setPlatosSeleccionados] = useState([])
  const [modoMesa, setModoMesa] = useState('botella')
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [precioMax, setPrecioMax] = useState(null)
  const [vinoSeleccionado, setVinoSeleccionado] = useState(null)
  const [vista, setVista] = useState('carta')
  const [respuesta, setRespuesta] = useState('')
  const [cargandoIA, setCargandoIA] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [soloInternacional, setSoloInternacional] = useState(false)
  const [soloCopa, setSoloCopa] = useState(false)
  const [seccionAbierta, setSeccionAbierta] = useState('')
  const [busquedaPlatos, setBusquedaPlatos] = useState('')
  const [categoriaPlatoAbierta, setCategoriaPlatoAbierta] = useState('')
  const [idioma, setIdioma] = useState('es')
  const [vinosComparador, setVinosComparador] = useState([])
  const [mostrarComparador, setMostrarComparador] = useState(false)
  const [perfiles, setPerfiles] = useState({})
const [cargandoPerfiles, setCargandoPerfiles] = useState(false)

  const i = t[idioma]
  const tipoDot = { tinto: '#7B2D2D', blanco: '#C4A55A', rosado: '#C47A8A', espumoso: '#4A8C6F', generoso: '#854F0B', dulce: '#993556', naranja: '#D85A30' }

  useEffect(() => {
    async function cargar() {
      const slug = (await params).slug
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('slug', slug).single()
      if (!rest) { setLoading(false); return }
      setRestaurante(rest)
      if (rest.color_primario) document.documentElement.style.setProperty('--color-primario', rest.color_primario)
      if (rest.color_fondo) document.documentElement.style.setProperty('--color-fondo', rest.color_fondo)
      if (rest.color_acento) document.documentElement.style.setProperty('--color-acento', rest.color_acento)
      document.documentElement.style.setProperty('--font-titulo', rest.tipografia === 'sans' ? 'system-ui, sans-serif' : 'Georgia, serif')
      const { data: vinosData } = await supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true).gt('stock', 0)
      setVinos(vinosData || [])
      const { data: platosData } = await supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true)
      setPlatos(platosData || [])
      const { data: selData } = await supabase
        .from('seleccion_especial')
        .select('*, vinos(nombre, bodega, tipo, region, uva, anada, precio_copa, precio_botella, notas_cata)')
        .eq('restaurante_id', rest.id)
        .eq('activo', true)
        .order('orden')
      setSeleccion(selData || [])
      await supabase.from('estadisticas').insert([{ restaurante_id: rest.id, tipo: 'escaneo', detalle: 'carta' }])
      setLoading(false)
    }
    cargar()
  }, [])

  async function preguntarSommelier() {
    if (!platosSeleccionados.length) return
    setCargandoIA(true)
    setRespuesta('')
    const consultaPlatos = platosSeleccionados
      .map(p => `${p.nombre}${p.precio ? ` (${p.precio}€)` : ''}${p.descripcion ? `: ${p.descripcion}` : ''}`)
      .join(', ')
    const modosTexto = {
      botella: idioma === 'en' ? 'a single bottle that works well for the whole table' : 'una sola botella que funcione bien para toda la mesa',
      copa: idioma === 'en' ? 'a different glass for each dish' : 'una copa diferente para cada plato',
      progresion: idioma === 'en' ? 'a wine progression from lighter to fuller body' : 'una progresión de vinos para toda la comida de menos a más cuerpo'
    }
    const res = await fetch('/api/maridaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consulta: consultaPlatos,
        modo: 'mesa',
        modoMesa: modosTexto[modoMesa],
        restaurante_id: restaurante.id,
        idioma
      })
    })
    const data = await res.json()
    setRespuesta(data.respuesta)
    await supabase.from('estadisticas').insert([{ restaurante_id: restaurante.id, tipo: 'sommelier', detalle: consultaPlatos }])
    setCargandoIA(false)
  }

  function toggleComparador(vino) {
    if (vinosComparador.find(v => v.id === vino.id)) {
      setVinosComparador(vinosComparador.filter(v => v.id !== vino.id))
    } else {
      if (vinosComparador.length >= 4) return
      setVinosComparador([...vinosComparador, vino])
    }
  }
async function cargarPerfiles(vinosACargar) {
  setCargandoPerfiles(true)
  const resultados = await Promise.all(
    vinosACargar.map(async v => {
      try {
  const res = await fetch('/api/perfil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: v.nombre, tipo: v.tipo, region: v.region, uva: v.uva, anada: v.anada })
  })
  const data = await res.json()
  console.log('Perfil recibido para', v.nombre, ':', JSON.stringify(data))
  return { id: v.id, perfil: data.perfil }
} catch (e) {
  console.log('Error perfil para', v.nombre, ':', e.message)
  return { id: v.id, perfil: { dulzor: 2, acidez: 3, taninos: 3, alcohol: 3, cuerpo: 3, intensidad: 3, final: 3 } }
}
    })
  )
const nuevosPerfiles = {}
resultados.forEach(r => { nuevosPerfiles[r.id] = r.perfil })
console.log('Perfiles a guardar:', JSON.stringify(nuevosPerfiles))
setPerfiles(nuevosPerfiles)
  setCargandoPerfiles(false)
}

  const preciosDisponibles = [...new Set(vinos.map(v => v.precio_botella).filter(Boolean).sort((a, b) => a - b))]
  const precioMaximo = preciosDisponibles[preciosDisponibles.length - 1] || 100

  const vinosFiltrados = vinos.filter(v => {
    const matchTipo = filtro === 'todos' || v.tipo === filtro
    const matchBusqueda = !busqueda || v.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (v.bodega && v.bodega.toLowerCase().includes(busqueda.toLowerCase())) || (v.uva && v.uva.toLowerCase().includes(busqueda.toLowerCase()))
    const matchPrecio = !precioMax || v.precio_botella <= precioMax
    const matchInternacional = !soloInternacional || v.internacional === true
    const matchCopa = !soloCopa || Number(v.precio_copa) > 0
    return matchTipo && matchBusqueda && matchPrecio && matchInternacional && matchCopa
  })

  const tipos = ['todos', ...new Set(vinos.map(v => v.tipo))]
  const colorPrimario = restaurante?.color_primario || '#111111'
  const colorAcento = restaurante?.color_acento || colorPrimario
  const fontTitulo = restaurante?.tipografia === 'sans' ? 'system-ui, sans-serif' : 'Georgia, serif'

  function heroStyle() {
    if (!restaurante?.banner_url) return { background: colorPrimario }
    const h = parseInt(colorPrimario.slice(1, 3), 16)
    const e = parseInt(colorPrimario.slice(3, 5), 16)
    const r = parseInt(colorPrimario.slice(5, 7), 16)
    const overlay = `rgba(${h},${e},${r},0.72)`
    return {
      backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${restaurante.banner_url})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  const categoriasBase = ['Entrantes fríos', 'Entrantes calientes', 'Cuchara', 'De la tierra', 'Del mar', 'Tablas']
  const categoriasPlatos = [
    ...categoriasBase.filter(categoria => platos.some(plato => plato.categoria === categoria)),
    ...[...new Set(platos.map(plato => plato.categoria || 'Otros'))].filter(categoria => !categoriasBase.includes(categoria))
  ]
  const normalizarTexto = texto => String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const busquedaPlatosLimpia = normalizarTexto(busquedaPlatos)
  const platosSommelierFiltrados = platos.filter(plato => {
    if (!busquedaPlatosLimpia) return true
    const texto = normalizarTexto(`${plato.nombre} ${plato.descripcion || ''} ${plato.categoria || ''}`)
    return texto.includes(busquedaPlatosLimpia)
  })

  const resumenVino = vino => [vino.bodega, vino.region, vino.anada].filter(Boolean).join(' · ')
  const notaCorta = texto => {
    if (!texto) return ''
    const limpia = texto.replace(/\s+/g, ' ').trim()
    return limpia.length > 120 ? `${limpia.slice(0, 117)}...` : limpia
  }
  const mostrarSeleccion = seleccion.length > 0 && !busqueda && filtro === 'todos' && !precioMax && !soloInternacional && !soloCopa
  const filtroActivo = precioMax || filtro !== 'todos' || soloInternacional || soloCopa
  const busquedaOFiltrado = Boolean(busqueda || filtroActivo)
  const tiposOrdenados = ['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja']
  const vinosPorCopa = vinos.filter(v => Number(v.precio_copa) > 0).length
  const vinosMenos30 = vinos.filter(v => Number(v.precio_botella) > 0 && Number(v.precio_botella) <= 30).length
  const vinosFrescos = vinos.filter(v => ['blanco', 'rosado', 'espumoso', 'generoso'].includes(v.tipo)).length

  function limpiarFiltrosCarta() {
    setPrecioMax(null)
    setFiltro('todos')
    setSoloInternacional(false)
    setSoloCopa(false)
    setBusqueda('')
  }

  function aplicarAtajo(id) {
    setBusqueda('')
    setSoloInternacional(false)
    setSoloCopa(false)
    setPrecioMax(null)
    setFiltro('todos')
    if (id === 'copa') setSoloCopa(true)
    if (id === 'menos30') setPrecioMax(30)
    if (id === 'frescos') setFiltro('blanco')
    if (id === 'espumosos') setFiltro('espumoso')
    setMostrarFiltros(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff', fontFamily: 'sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.15em', color: '#bbb' }}>{i.cargando}</p>
    </div>
  )

  if (!restaurante) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff', fontFamily: 'sans-serif' }}>
      <p style={{ color: '#999' }}>{i.noEncontrado}</p>
    </div>
  )

 if (mostrarComparador) {
  const ejes = ['dulzor', 'acidez', 'taninos', 'alcohol', 'cuerpo', 'intensidad', 'final']
  const etiquetas = { dulzor: 'Dulzor', acidez: 'Acidez', taninos: 'Taninos', alcohol: 'Alcohol', cuerpo: 'Cuerpo', intensidad: 'Intensidad', final: 'Final' }
  const coloresVino = ['#7B2D2D', '#C4A55A', '#534AB7', '#4A8C6F']

  function radarPath(perfil, cx, cy, r) {
    const n = ejes.length
    return ejes.map((eje, idx) => {
      const angle = (Math.PI * 2 * idx) / n - Math.PI / 2
      const val = (perfil[eje] || 1) / 5
      const x = cx + r * val * Math.cos(angle)
      const y = cy + r * val * Math.sin(angle)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ') + ' Z'
  }

  function gridPath(level, cx, cy, r) {
    const n = ejes.length
    return ejes.map((_, idx) => {
      const angle = (Math.PI * 2 * idx) / n - Math.PI / 2
      const x = cx + r * level * Math.cos(angle)
      const y = cy + r * level * Math.sin(angle)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ') + ' Z'
  }

  const cx = 150, cy = 150, r = 100

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: colorPrimario, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => setMostrarComparador(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#fff', padding: 0 }}>←</button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{i.comparar}</span>
        </div>
        <button onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
          {idioma === 'es' ? 'EN' : 'ES'}
        </button>
      </div>

      <div style={{ padding: '24px 16px' }}>

        {/* Leyenda */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {vinosComparador.map((v, idx) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: coloresVino[idx] }} />
              <p style={{ margin: 0, fontSize: 13, color: '#111', fontWeight: 500 }}>{v.nombre}</p>
            </div>
          ))}
        </div>

        {/* Radar */}
        {cargandoPerfiles || vinosComparador.some(v => !perfiles[v.id]) ? (
  <div style={{ textAlign: 'center', padding: '60px 0' }}>
    <p style={{ fontSize: 12, color: '#bbb', letterSpacing: '0.15em' }}>ANALIZANDO...</p>
  </div>
) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '24px', marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
            <svg width={300} height={300} viewBox="0 0 300 300">
              {[0.2, 0.4, 0.6, 0.8, 1].map(level => (
                <path key={level} d={gridPath(level, cx, cy, r)} fill="none" stroke="#f0f0f0" strokeWidth={1} />
              ))}
              {ejes.map((_, idx) => {
                const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
                return <line key={idx} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="#f0f0f0" strokeWidth={1} />
              })}
              {ejes.map((eje, idx) => {
                const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
                const lx = cx + (r + 20) * Math.cos(angle)
                const ly = cy + (r + 20) * Math.sin(angle)
                return (
                  <text key={eje} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#aaa" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {etiquetas[eje]}
                  </text>
                )
              })}
{console.log('Perfiles en render:', JSON.stringify(perfiles))}
{vinosComparador.map((v, idx) => {
  const perfil = perfiles[v.id]
  if (!perfil) return null
  const dashPatterns = ['none', '6,3', 'none', '6,3']
  return (
    <path
      key={v.id}
      d={radarPath(perfil, cx, cy, r)}
      fill={coloresVino[idx]}
      fillOpacity={0.12}
      stroke={coloresVino[idx]}
      strokeWidth={idx % 2 === 0 ? 2.5 : 1.5}
      strokeDasharray={dashPatterns[idx]}
    />
  )
})}
            </svg>
          </div>
        )}

        {/* Tabla comparativa */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${vinosComparador.length}, 1fr)`, gap: 1, background: '#f0f0f0', borderRadius: 12, overflow: 'hidden', minWidth: 300 }}>
            <div style={{ background: '#fafafa', padding: '12px 16px' }} />
            {vinosComparador.map((v, idx) => (
              <div key={v.id} style={{ background: '#fff', padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: coloresVino[idx], margin: '0 auto 4px' }} />
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#111' }}>{v.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#bbb' }}>{v.bodega}</p>
              </div>
            ))}
            {ejes.map(eje => (
              <>
                <div key={eje + '_label'} style={{ background: '#fafafa', padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{etiquetas[eje]}</p>
                </div>
                {vinosComparador.map(v => {
                  const val = perfiles[v.id]?.[eje] || 0
                  return (
                    <div key={v.id + eje} style={{ background: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} style={{ width: 8, height: 8, borderRadius: '50%', background: n <= val ? colorPrimario : '#f0f0f0' }} />
                      ))}
                    </div>
                  )
                })}
              </>
            ))}
            <div style={{ background: '#fafafa', padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{i.botella}</p>
            </div>
            {vinosComparador.map(v => (
              <div key={v.id + '_precio'} style={{ background: '#fff', padding: '10px 16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#111' }}>{v.precio_botella} €</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button onClick={() => { setVinosComparador([]); setMostrarComparador(false) }} style={{ width: '100%', background: 'none', border: '1px solid #e8e8e8', padding: '12px', fontSize: 12, color: '#aaa', cursor: 'pointer', borderRadius: 10 }}>
            {i.cerrarComparador}
          </button>
        </div>
      </div>
    </div>
  )
}

  // Vista ficha vino
  if (vinoSeleccionado) return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: colorPrimario, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => setVinoSeleccionado(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#fff', padding: 0 }}>←</button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{i.fichaVino}</span>
        </div>
        <button onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
          {idioma === 'es' ? 'EN' : 'ES'}
        </button>
      </div>
      <div style={{ padding: '32px 24px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: tipoDot[vinoSeleccionado.tipo] }} />
          <span style={{ fontSize: 12, color: '#999', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{i.tipoLabel[vinoSeleccionado.tipo]}</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 300, color: '#111', margin: '0 0 8px', fontFamily: fontTitulo, lineHeight: 1.3 }}>{vinoSeleccionado.nombre}</h1>
        <p style={{ fontSize: 16, color: '#888', margin: '0 0 32px', fontWeight: 300 }}>{vinoSeleccionado.bodega}</p>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden', marginBottom: 20 }}>
          {[
            { label: i.region, valor: vinoSeleccionado.region },
            { label: i.uva, valor: vinoSeleccionado.uva },
            { label: i.anada, valor: vinoSeleccionado.anada },
            { label: i.copa, valor: vinoSeleccionado.precio_copa ? `${vinoSeleccionado.precio_copa} €` : null },
            { label: i.botella, valor: vinoSeleccionado.precio_botella ? `${vinoSeleccionado.precio_botella} €` : null },
          ].filter(f => f.valor).map((f, idx, arr) => (
            <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: idx < arr.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
              <span style={{ fontSize: 14, color: '#aaa' }}>{f.label}</span>
              <span style={{ fontSize: 15, color: '#111', fontWeight: 500 }}>{f.valor}</span>
            </div>
          ))}
        </div>
        {vinoSeleccionado.notas_cata && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '20px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>{i.notasCata}</p>
            <p style={{ fontSize: 15, color: '#444', lineHeight: 1.8, margin: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{vinoSeleccionado.notas_cata}</p>
          </div>
        )}
        <button
          onClick={() => toggleComparador(vinoSeleccionado)}
          style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, letterSpacing: '0.05em',
            background: vinosComparador.find(v => v.id === vinoSeleccionado.id) ? colorPrimario : '#f5f5f5',
            color: vinosComparador.find(v => v.id === vinoSeleccionado.id) ? '#fff' : '#888',
          }}>
          {vinosComparador.find(v => v.id === vinoSeleccionado.id) ? '✓ ' + i.quitarComparador : '+ ' + i.añadirComparador}
        </button>
      </div>
    </div>
  )

  if (vista === 'carta') return (
    <div className={styles.shell} style={{ paddingBottom: vinosComparador.length > 0 ? 96 : 34 }}>
      <header className={styles.hero} style={heroStyle()}>
        <div className={styles.heroTop}>
          <div>
            {restaurante.logo_url && (
              <span className={styles.logoFrame}>
                <img src={restaurante.logo_url} alt={restaurante.nombre} className={styles.logo} />
              </span>
            )}
            <p className={styles.kicker}>{i.carta}</p>
            <h1 className={styles.title}>{restaurante.nombre}</h1>
            <p className={styles.meta}>{vinos.length} {i.referencias} · {restaurante.ciudad}</p>
          </div>
          <button className={styles.langButton} onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')}>
            {idioma === 'es' ? 'EN' : 'ES'}
          </button>
        </div>

        <nav className={styles.tabs}>
          <button className={`${styles.tab} ${styles.tabActive}`} onClick={() => setVista('carta')}>{i.carta}</button>
          <button className={styles.tab} onClick={() => setVista('sommelier')}>{i.sommelier}</button>
        </nav>
      </header>

      <main className={styles.content}>
        <section className={styles.searchPanel}>
          <div className={styles.searchRow}>
            <input
              className={styles.search}
              type="text"
              placeholder={i.buscar}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <button className={styles.filterButton} onClick={() => setMostrarFiltros(!mostrarFiltros)}>
              {i.filtros}
            </button>
          </div>

          {mostrarFiltros && (
            <div className={styles.filters}>
              <div className={styles.chipRow}>
                {tipos.map(tipo => (
                  <button
                    key={tipo}
                    className={`${styles.chip} ${filtro === tipo ? styles.chipActive : ''}`}
                    onClick={() => setFiltro(tipo)}
                    style={filtro === tipo ? { background: colorAcento, borderColor: colorAcento } : undefined}
                  >
                    {tipo === 'todos' ? i.todos : i.tipoLabel[tipo]}
                  </button>
                ))}
              </div>

              <div className={styles.filterLine}>
                <div className={styles.filterMeta}>
                  <span>{i.precioMaximo}</span>
                  <span>{precioMax ? `${precioMax} €` : i.sinLimite}</span>
                </div>
                <input
                  className={styles.range}
                  type="range"
                  min={0}
                  max={precioMaximo}
                  step={5}
                  value={precioMax || precioMaximo}
                  onChange={e => setPrecioMax(parseInt(e.target.value) === precioMaximo ? null : parseInt(e.target.value))}
                  style={{ accentColor: colorPrimario }}
                />
              </div>

              <div className={styles.toggleRow}>
                <span>{i.soloInternacionales}</span>
                <button
                  type="button"
                  className={`${styles.switch} ${soloInternacional ? styles.switchOn : ''}`}
                  onClick={() => setSoloInternacional(!soloInternacional)}
                  style={{ background: soloInternacional ? colorPrimario : '#d8d1c4' }}
                >
                  <span className={styles.switchKnob} />
                </button>
              </div>

              <div className={styles.toggleRow}>
                <span>Solo por copa</span>
                <button
                  type="button"
                  className={`${styles.switch} ${soloCopa ? styles.switchOn : ''}`}
                  onClick={() => setSoloCopa(!soloCopa)}
                  style={{ background: soloCopa ? colorPrimario : '#d8d1c4' }}
                >
                  <span className={styles.switchKnob} />
                </button>
              </div>

              {filtroActivo && (
                <button className={styles.clearButton} onClick={limpiarFiltrosCarta}>
                  {i.limpiarFiltros}
                </button>
              )}
            </div>
          )}
        </section>

        {!busqueda && (
          <section className={styles.shortcutPanel}>
            <button className={styles.shortcut} onClick={() => aplicarAtajo('copa')} disabled={!vinosPorCopa}>
              <span>Por copa</span>
              <small>{vinosPorCopa} vinos</small>
            </button>
            <button className={styles.shortcut} onClick={() => aplicarAtajo('menos30')} disabled={!vinosMenos30}>
              <span>Menos de 30 €</span>
              <small>{vinosMenos30} vinos</small>
            </button>
            <button className={styles.shortcut} onClick={() => aplicarAtajo('frescos')} disabled={!vinosFrescos}>
              <span>Frescos</span>
              <small>Blancos y afines</small>
            </button>
            <button className={styles.shortcut} onClick={() => setVista('sommelier')}>
              <span>Para mi comida</span>
              <small>Sommelier</small>
            </button>
          </section>
        )}

        {mostrarSeleccion && (
          <section className={styles.selection}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.kicker} style={{ color: '#9b7430', marginBottom: 5 }}>{i.seleccionEspecial}</p>
                <h2 className={styles.sectionTitle}>@cataconjuanjo</h2>
                <p className={styles.sectionSub}>WSET Level 3 · Selección del consultor</p>
              </div>
            </div>

            {seleccion.map(s => (
              <article key={s.id} className={styles.featuredCard} onClick={() => setVinoSeleccionado(s.vinos)}>
                <div className={styles.wineTop}>
                  <span className={styles.dot} style={{ background: tipoDot[s.vinos?.tipo] || colorPrimario }} />
                  <h3 className={styles.wineName}>{s.vinos?.nombre}</h3>
                </div>
                <p className={styles.wineNotes}>{s.nota_personal}</p>
                <div className={styles.priceBlock} style={{ marginTop: 12 }}>
                  <p className={styles.wineMeta} style={{ margin: 0 }}>{resumenVino(s.vinos || {})}</p>
                  <p className={styles.bottlePrice}>{s.vinos?.precio_botella} €</p>
                </div>
              </article>
            ))}
          </section>
        )}

        {vinosFiltrados.length === 0 && (
          <div className={styles.empty}>{i.sinResultados}</div>
        )}

        {tiposOrdenados.map(tipo => {
          const grupo = vinosFiltrados.filter(v => v.tipo === tipo)
          if (!grupo.length) return null
          const abierta = busquedaOFiltrado || seccionAbierta === tipo
          return (
            <section key={tipo} className={styles.accordionSection}>
              <button
                type="button"
                className={styles.accordionHead}
                onClick={() => setSeccionAbierta(seccionAbierta === tipo ? '' : tipo)}
                aria-expanded={abierta}
              >
                <div>
                  <h2 className={styles.sectionTitle}>{i.tipoPlural[tipo]}</h2>
                  <p className={styles.sectionSub}>{grupo.length} {i.referencias}</p>
                </div>
                <span className={styles.accordionIcon}>{abierta ? '−' : '+'}</span>
              </button>
              {abierta && grupo.map(v => {
                const enComparador = vinosComparador.find(vc => vc.id === v.id)
                return (
                  <article key={v.id} className={styles.wineCard} style={enComparador ? { borderColor: colorPrimario } : undefined}>
                    <div className={styles.wineInfo} onClick={() => setVinoSeleccionado(v)}>
                      <div className={styles.wineTop}>
                        <span className={styles.dot} style={{ background: tipoDot[v.tipo] || colorPrimario }} />
                        <h3 className={styles.wineName}>{v.nombre}</h3>
                      </div>
                      <p className={styles.wineMeta}>{resumenVino(v)}</p>
                      {v.notas_cata && <p className={styles.wineNotes}>{notaCorta(v.notas_cata)}</p>}
                    </div>
                    <div className={styles.priceBlock}>
                      {v.precio_copa && <p className={styles.glassPrice}>{v.precio_copa} € · {i.copa.toLowerCase()}</p>}
                      <p className={styles.bottlePrice}>{v.precio_botella} €</p>
                      <button
                        className={`${styles.compareButton} ${enComparador ? styles.compareActive : ''}`}
                        onClick={() => toggleComparador(v)}
                        disabled={vinosComparador.length >= 4 && !enComparador}
                        style={enComparador ? { background: colorPrimario, borderColor: colorPrimario } : undefined}
                        aria-label={enComparador ? i.quitarComparador : i.añadirComparador}
                      >
                        {enComparador ? '✓' : '+'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </section>
          )
        })}
      </main>

      {vinosComparador.length > 0 && (
        <div className={styles.compareBar} style={{ background: colorPrimario }}>
          <p className={styles.compareText}>{vinosComparador.length} {i.vinosSeleccionados}</p>
          <button
            className={styles.compareAction}
            onClick={() => { setMostrarComparador(true); cargarPerfiles(vinosComparador) }}
            style={{ color: colorPrimario }}
          >
            {i.comparar}
          </button>
        </div>
      )}
    </div>
  )

  if (vista === 'sommelier') return (
    <div className={styles.shell}>
      <header className={styles.hero} style={heroStyle()}>
        <div className={styles.heroTop}>
          <div>
            {restaurante.logo_url && (
              <span className={styles.logoFrame}>
                <img src={restaurante.logo_url} alt={restaurante.nombre} className={styles.logo} />
              </span>
            )}
            <p className={styles.kicker}>{i.sommelier}</p>
            <h1 className={styles.title}>{restaurante.nombre}</h1>
            <p className={styles.meta}>{restaurante.ciudad} · {platos.length} platos disponibles</p>
          </div>
          <button className={styles.langButton} onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')}>
            {idioma === 'es' ? 'EN' : 'ES'}
          </button>
        </div>

        <nav className={styles.tabs}>
          <button className={styles.tab} onClick={() => setVista('carta')}>{i.carta}</button>
          <button className={`${styles.tab} ${styles.tabActive}`} onClick={() => setVista('sommelier')}>{i.sommelier}</button>
        </nav>
      </header>

      <main className={styles.content}>
        <section className={styles.sommelierIntro}>
          <h2 className={styles.sommelierTitle}>{i.quePedir}</h2>
          <p className={styles.sommelierText}>{i.seleccionaPlatos}</p>
        </section>

        <section className={styles.dishSearchPanel}>
          <div className={styles.searchRow}>
            <input
              className={styles.search}
              type="text"
              placeholder={i.buscarPlato}
              value={busquedaPlatos}
              onChange={e => setBusquedaPlatos(e.target.value)}
            />
            {busquedaPlatos && (
              <button
                type="button"
                className={styles.filterButton}
                onClick={() => setBusquedaPlatos('')}
              >
                {i.limpiarFiltros}
              </button>
            )}
          </div>
        </section>

        {platosSeleccionados.length > 0 && (
          <section className={styles.selectedPanel}>
            <p className={styles.selectedHead}>{i.tuSeleccion}</p>
            {platosSeleccionados.map((p, idx) => (
              <div
                key={p.id || idx}
                className={styles.selectedDish}
                onClick={() => setPlatosSeleccionados(platosSeleccionados.filter((_, j) => j !== idx))}
              >
                <p className={styles.selectedDishName}>{p.nombre}</p>
                <span className={styles.selectedRemove}>×</span>
              </div>
            ))}

            <p className={styles.selectedHead} style={{ marginTop: 14 }}>{i.comoQuieres}</p>
            <div className={styles.modeGrid}>
              {[
                { id: 'botella', label: i.unaBotella, desc: i.paraMesa },
                { id: 'copa', label: i.porCopas, desc: i.porPlato },
                { id: 'progresion', label: i.progresion, desc: i.variosOrden },
              ].map(m => (
                <button
                  key={m.id}
                  className={`${styles.modeButton} ${modoMesa === m.id ? styles.modeButtonActive : ''}`}
                  onClick={() => setModoMesa(m.id)}
                >
                  <span className={styles.modeLabel}>{m.label}</span>
                  <span className={styles.modeDesc}>{m.desc}</span>
                </button>
              ))}
            </div>

            <button
              className={styles.recommendButton}
              onClick={preguntarSommelier}
              disabled={cargandoIA}
              style={{ background: cargandoIA ? '#8d8578' : colorAcento }}
            >
              {cargandoIA ? i.consultando : i.pedirRecomendacion}
            </button>

            {respuesta && (
              <div className={styles.answerBox}>
                <p className={styles.selectedHead}>{i.sommelier}</p>
                <p className={styles.answerText}>{respuesta}</p>
                <button
                  className={styles.clearButton}
                  onClick={() => { setRespuesta(''); setPlatosSeleccionados([]) }}
                  style={{ color: '#fffaf3', borderColor: 'rgba(255,250,243,0.2)', marginTop: 14 }}
                >
                  {i.nuevaConsulta}
                </button>
              </div>
            )}
          </section>
        )}

        {platosSommelierFiltrados.length === 0 && (
          <div className={styles.empty}>{i.sinPlatos}</div>
        )}

        {categoriasPlatos.map(categoria => {
          const grupo = platosSommelierFiltrados.filter(p => (p.categoria || 'Otros') === categoria)
          if (!grupo.length) return null
          const abierta = Boolean(busquedaPlatosLimpia) || categoriaPlatoAbierta === categoria
          const seleccionadosEnCategoria = grupo.filter(plato => platosSeleccionados.some(s => s.id === plato.id)).length
          return (
            <section key={categoria} className={styles.accordionSection}>
              <button
                type="button"
                className={styles.accordionHead}
                onClick={() => setCategoriaPlatoAbierta(categoriaPlatoAbierta === categoria ? '' : categoria)}
                aria-expanded={abierta}
              >
                <div>
                  <h2 className={styles.sectionTitle}>{categoria}</h2>
                  <p className={styles.sectionSub}>
                    {grupo.length} platos{seleccionadosEnCategoria ? ` · ${seleccionadosEnCategoria} seleccionados` : ''}
                  </p>
                </div>
                <span className={styles.accordionIcon}>{abierta ? '−' : '+'}</span>
              </button>
              {abierta && <div className={styles.dishList}>
                {grupo.map(p => {
                  const seleccionado = platosSeleccionados.some(s => s.id === p.id)
                  return (
                    <article
                      key={p.id}
                      className={`${styles.dishCard} ${seleccionado ? styles.dishSelected : ''}`}
                      onClick={() => {
                        if (seleccionado) setPlatosSeleccionados(platosSeleccionados.filter(s => s.id !== p.id))
                        else setPlatosSeleccionados([...platosSeleccionados, p])
                        setRespuesta('')
                      }}
                    >
                      <div>
                        <h3 className={styles.dishName}>{p.nombre}</h3>
                        {p.descripcion && <p className={styles.dishDesc}>{p.descripcion}</p>}
                      </div>
                      <div>
                        {Number(p.precio) > 0 && <p className={styles.dishPrice}>{Number(p.precio).toFixed(2)} €</p>}
                        <span className={styles.dishAdd} style={{ color: seleccionado ? colorPrimario : '#c7b99a' }}>
                          {seleccionado ? '✓' : '+'}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>}
            </section>
          )
        })}
      </main>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, sans-serif', paddingBottom: vinosComparador.length > 0 ? 80 : 0 }}>

      {/* Header */}
      <div style={{ background: colorPrimario, padding: '36px 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            {restaurante.logo_url && (
              <img src={restaurante.logo_url} alt={restaurante.nombre} style={{ height: 48, maxWidth: 160, objectFit: 'contain', marginBottom: 16, display: 'block', filter: 'brightness(0) invert(1)' }} />
            )}
            <h1 style={{ fontSize: 30, fontWeight: 300, color: '#fff', margin: '0 0 6px', fontFamily: 'Georgia, serif' }}>{restaurante.nombre}</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{vinos.length} {i.referencias} · {restaurante.ciudad}</p>
          </div>
          <button onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 13, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, marginTop: 4 }}>
            {idioma === 'es' ? 'EN' : 'ES'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: colorPrimario, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {[{ id: 'carta', label: i.carta }, { id: 'sommelier', label: i.sommelier }].map(tab => (
          <button key={tab.id} onClick={() => setVista(tab.id)} style={{
            flex: 1, padding: '14px', border: 'none', background: 'transparent',
            fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: vista === tab.id ? '#fff' : 'rgba(255,255,255,0.35)', cursor: 'pointer',
            borderBottom: vista === tab.id ? '2px solid #fff' : '2px solid transparent'
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {vista === 'carta' && (
        <div>
          {/* Buscador */}
          <div style={{ padding: '12px 16px', background: seleccion.length > 0 ? colorPrimario : '#fff', borderBottom: seleccion.length > 0 ? 'none' : '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder={i.buscar}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ flex: 1, padding: '11px 14px', border: seleccion.length > 0 ? '1px solid rgba(255,255,255,0.15)' : '1px solid #e8e8e8', borderRadius: 10, fontSize: 15, outline: 'none', color: seleccion.length > 0 ? '#fff' : '#111', background: seleccion.length > 0 ? 'rgba(255,255,255,0.1)' : '#fafafa' }}
              />
              <button onClick={() => setMostrarFiltros(!mostrarFiltros)} style={{
                padding: '11px 16px', border: '1px solid #e8e8e8', borderRadius: 10,
                background: mostrarFiltros ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
color: '#fff',
border: '1px solid rgba(255,255,255,0.15)',
              }}>
                {i.filtros}
              </button>
            </div>

            {mostrarFiltros && (
              <div style={{ paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {tipos.map(t => (
                    <button key={t} onClick={() => setFiltro(t)} style={{
                      padding: '6px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      background: filtro === t ? colorPrimario : 'transparent',
                      color: filtro === t ? '#fff' : '#aaa',
                      border: filtro === t ? `1px solid ${colorPrimario}` : '1px solid #e8e8e8'
                    }}>
                      {t === 'todos' ? i.todos : i.tipoLabel[t]}
                    </button>
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{i.precioMaximo}</span>
                    <span style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{precioMax ? `${precioMax} €` : i.sinLimite}</span>
                  </div>
                  <input type="range" min={0} max={precioMaximo} step={5}
                    value={precioMax || precioMaximo}
                    onChange={e => setPrecioMax(parseInt(e.target.value) === precioMaximo ? null : parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: colorPrimario }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{i.soloInternacionales}</span>
                  <div onClick={() => setSoloInternacional(!soloInternacional)} style={{
                    width: 38, height: 22, borderRadius: 11, background: soloInternacional ? colorPrimario : '#e0e0e0',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: soloInternacional ? 18 : 2, transition: 'left 0.2s' }} />
                  </div>
                </div>
                {(precioMax || filtro !== 'todos') && (
                  <button onClick={() => { setPrecioMax(null); setFiltro('todos'); setSoloInternacional(false) }} style={{
                    marginTop: 10, background: 'none', border: 'none', fontSize: 12, color: '#aaa',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0
                  }}>
                    {i.limpiarFiltros}
                  </button>
                )}
              </div>
            )}
          </div>
{/* Selección especial */}
{seleccion.length > 0 && !busqueda && filtro === 'todos' && !precioMax && (
  <div style={{ padding: '16px 16px 0' }}>

    {/* Cabecera selección */}
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <div style={{ width: 3, height: 36, background: colorPrimario, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 9, color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 2px' }}>{i.seleccionEspecial}</p>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#111', margin: 0 }}>@cataconjuanjo</p>
          <p style={{ fontSize: 11, color: '#aaa', margin: 0, letterSpacing: '0.04em' }}>WSET Level 3 · Apasionado del vino</p>
        </div>
      </div>
    </div>

    {/* Vinos */}
    {seleccion.map((s, idx) => (
      <div key={s.id}
        onClick={() => setVinoSeleccionado(s.vinos)}
        style={{ background: '#f5f2ee', borderRadius: 12, padding: '16px', marginBottom: 10, cursor: 'pointer', border: `1px solid ${colorPrimario}22` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[s.vinos?.tipo] || '#888', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#111', flex: 1, fontFamily: 'Georgia, serif' }}>{s.vinos?.nombre}</p>
          <div style={{ background: colorPrimario, color: '#fff', fontSize: 13, fontWeight: 500, padding: '4px 12px', borderRadius: 20, flexShrink: 0 }}>{s.vinos?.precio_botella} €</div>
        </div>
        <p style={{ margin: '0 0 10px 18px', fontSize: 13, color: '#555', lineHeight: 1.8, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{s.nota_personal}</p>
        <p style={{ margin: '0 0 0 18px', fontSize: 11, color: '#aaa' }}>{s.vinos?.bodega}{s.vinos?.region ? ` · ${s.vinos.region}` : ''}</p>
      </div>
    ))}

    <div style={{ height: 8 }} />
  </div>
)}

          {/* Lista vinos */}
          <div style={{ padding: '0 16px' }}>
            {vinosFiltrados.length === 0 && (
              <p style={{ textAlign: 'center', color: '#bbb', fontSize: 15, padding: '40px 0' }}>{i.sinResultados}</p>
            )}
            {['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja'].map(tipo => {
              const grupo = vinosFiltrados.filter(v => v.tipo === tipo)
              if (!grupo.length) return null
              return (
                <div key={tipo} style={{ marginTop: 24 }}>
                  <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 10px' }}>{i.tipoPlural[tipo]}</p>
                  {grupo.map(v => {
                    const enComparador = vinosComparador.find(vc => vc.id === v.id)
                    return (
                      <div key={v.id} style={{
                        background: '#fff', borderRadius: 10, border: `1px solid ${enComparador ? colorPrimario : '#f0f0f0'}`,
                        padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12
                      }}>
                        <div onClick={() => setVinoSeleccionado(v)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[v.tipo], flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#111' }}>{v.nombre}</p>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#999' }}>
                              {v.bodega}{v.region ? ` · ${v.region}` : ''}{v.anada ? ` · ${v.anada}` : ''}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {v.precio_copa && (
                              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#999' }}>{v.precio_copa} € <span style={{ fontSize: 10, color: '#ccc' }}>{i.copa.toLowerCase()}</span></p>
                            )}
                            <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#111' }}>{v.precio_botella} € <span style={{ fontSize: 10, color: '#ccc', fontWeight: 400 }}>{i.btl}</span></p>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleComparador(v)}
                          style={{
                            width: 32, height: 32, borderRadius: 8, border: 'none', cursor: vinosComparador.length >= 4 && !enComparador ? 'not-allowed' : 'pointer',
                            background: enComparador ? colorPrimario : '#f5f5f5',
                            color: enComparador ? '#fff' : '#aaa', fontSize: 18, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                          {enComparador ? '✓' : '+'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div style={{ height: 40 }} />
          </div>
        </div>
      )}

      {vista === 'sommelier' && (
        <div style={{ padding: '24px 16px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 300, fontFamily: 'Georgia, serif', color: '#111', margin: '0 0 6px' }}>{i.quePedir}</h2>
          <p style={{ fontSize: 14, color: '#bbb', margin: '0 0 24px', lineHeight: 1.6 }}>{i.seleccionaPlatos}</p>

          {platosSeleccionados.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px', marginBottom: 24, border: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>{i.tuSeleccion}</p>
              {platosSeleccionados.map((p, idx) => (
                <div key={idx} onClick={() => setPlatosSeleccionados(platosSeleccionados.filter((_, j) => j !== idx))} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: idx < platosSeleccionados.length - 1 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer'
                }}>
                  <p style={{ margin: 0, fontSize: 15, color: '#111' }}>{p.nombre}</p>
                  <span style={{ fontSize: 18, color: '#ccc' }}>×</span>
                </div>
              ))}
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 12, color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>{i.comoQuieres}</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {[
                    { id: 'botella', label: i.unaBotella, desc: i.paraMesa },
                    { id: 'copa', label: i.porCopas, desc: i.porPlato },
                    { id: 'progresion', label: i.progresion, desc: i.variosOrden },
                  ].map(m => (
                    <button key={m.id} onClick={() => setModoMesa(m.id)} style={{
                      flex: 1, padding: '12px 4px', border: 'none', borderRadius: 10, cursor: 'pointer',
                      background: modoMesa === m.id ? colorPrimario : '#f5f5f5',
                      color: modoMesa === m.id ? '#fff' : '#888',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{m.label}</span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{m.desc}</span>
                    </button>
                  ))}
                </div>
                <button onClick={preguntarSommelier} disabled={cargandoIA} style={{
                  width: '100%', padding: '15px', background: cargandoIA ? '#ccc' : colorAcento,
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: cargandoIA ? 'not-allowed' : 'pointer'
                }}>
                  {cargandoIA ? i.consultando : i.pedirRecomendacion}
                </button>
              </div>
              {respuesta && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
                  <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 12px' }}>{i.sommelier}</p>
                  <p style={{ fontSize: 16, color: '#333', lineHeight: 1.8, margin: 0, fontWeight: 300, whiteSpace: 'pre-wrap' }}>{respuesta}</p>
                  <button onClick={() => { setRespuesta(''); setPlatosSeleccionados([]) }} style={{
                    marginTop: 16, background: 'none', border: '1px solid #e8e8e8', borderRadius: 8,
                    padding: '10px 20px', fontSize: 12, color: '#aaa', cursor: 'pointer', letterSpacing: '0.05em'
                  }}>
                    {i.nuevaConsulta}
                  </button>
                </div>
              )}
            </div>
          )}

          {categoriasPlatos.map(categoria => {
            const grupo = platos.filter(p => (p.categoria || 'Otros') === categoria)
            if (!grupo.length) return null
            return (
              <div key={categoria} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 10px' }}>{categoria}</p>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                  {grupo.map((p, idx) => {
                    const seleccionado = platosSeleccionados.some(s => s.id === p.id)
                    return (
                      <div key={p.id} onClick={() => {
                        if (seleccionado) setPlatosSeleccionados(platosSeleccionados.filter(s => s.id !== p.id))
                        else setPlatosSeleccionados([...platosSeleccionados, p])
                        setRespuesta('')
                      }} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '15px 16px', borderBottom: idx < grupo.length - 1 ? '1px solid #f8f8f8' : 'none',
                        cursor: 'pointer', background: seleccionado ? '#f9f9f9' : 'transparent'
                      }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 15, color: '#111', fontWeight: seleccionado ? 500 : 400 }}>{p.nombre}</p>
                          {p.descripcion && <p style={{ margin: '3px 0 0', fontSize: 12, color: '#ccc' }}>{p.descripcion}</p>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          {Number(p.precio) > 0 && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#999' }}>{Number(p.precio).toFixed(2)} €</p>}
                          <span style={{ fontSize: 20, color: seleccionado ? colorPrimario : '#ddd', lineHeight: 1 }}>
                            {seleccionado ? '✓' : '+'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Barra comparador */}
      {vinosComparador.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: colorPrimario, padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          zIndex: 100
        }}>
          <p style={{ margin: 0, fontSize: 14, color: '#fff', fontWeight: 500 }}>
            {vinosComparador.length} {i.vinosSeleccionados}
          </p>
          <button onClick={() => { setMostrarComparador(true); cargarPerfiles(vinosComparador) }} style={{
            background: '#fff', color: colorPrimario, border: 'none',
            padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer'
          }}>
            {i.comparar} →
          </button>
        </div>
      )}
    </div>
  )
}
