'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import papilasKb from '../../data/papilas_kb_v2_completo_1.json'
import { buscarPlatoKb } from '../../data/platos_kb'
import { criteriosEstructurales } from '../../lib/maridajeEngine'
import styles from './camarero.module.css'

export default function Camarero({ params }) {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [vinoSeleccionado, setVinoSeleccionado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pin, setPin] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [errorPin, setErrorPin] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [vinosComparador, setVinosComparador] = useState([])
  const [mostrarComparador, setMostrarComparador] = useState(false)
  const [perfiles, setPerfiles] = useState({})
  const [cargandoPerfiles, setCargandoPerfiles] = useState(false)
  const [consultaVenta, setConsultaVenta] = useState('')
  const [platosMesaVenta, setPlatosMesaVenta] = useState([])
  const [objetivoVenta, setObjetivoVenta] = useState('equilibrado')
  const [rotacionVenta, setRotacionVenta] = useState(0)
  const [demoActivo, setDemoActivo] = useState(false)
  const [feedbackVenta, setFeedbackVenta] = useState({})
  const [historialVenta, setHistorialVenta] = useState([])
  const [vistaServicio, setVistaServicio] = useState('venta')
  const [busquedaPlatoVenta, setBusquedaPlatoVenta] = useState('')
  const [categoriaPlatoVenta, setCategoriaPlatoVenta] = useState('todos')
  const [mostrarPlatosVenta, setMostrarPlatosVenta] = useState(false)
  const [tipoVinoAbierto, setTipoVinoAbierto] = useState(null)

  const PIN = '1234'
  const tipoDot = { tinto: '#7B2D2D', blanco: '#C4A55A', rosado: '#C47A8A', espumoso: '#4A8C6F', generoso: '#854F0B', dulce: '#993556', naranja: '#D85A30' }
  const tipoLabel = { tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso', generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja' }
  const tipoPlural = { tinto: 'Tintos', blanco: 'Blancos', rosado: 'Rosados', espumoso: 'Espumosos', generoso: 'Generosos', dulce: 'Dulces', naranja: 'Naranjas' }
  const coloresVino = ['#7B2D2D', '#C4A55A', '#534AB7', '#4A8C6F']
  const ejes = ['dulzor', 'acidez', 'taninos', 'alcohol', 'cuerpo', 'intensidad', 'final']
  const etiquetas = { dulzor: 'Dulzor', acidez: 'Acidez', taninos: 'Taninos', alcohol: 'Alcohol', cuerpo: 'Cuerpo', intensidad: 'Intensidad', final: 'Final' }

  useEffect(() => {
    async function cargar() {
      const esDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'
      if (esDemo) {
        setDemoActivo(true)
        setAutenticado(true)
      }
      const slug = (await params).slug
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('slug', slug).single()
      if (rest) {
        setRestaurante(rest)
        const objetivoGuardado = typeof window !== 'undefined' ? window.localStorage.getItem(`cartavinos_objetivo_${rest.id}`) : null
        const mapaObjetivo = { vender_copas: 'copas', subir_ticket: 'ticket', rotar_stock: 'rotar', vino_local: 'local' }
        if (objetivoGuardado && mapaObjetivo[objetivoGuardado]) setObjetivoVenta(mapaObjetivo[objetivoGuardado])
        const { data: vinosData } = await supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true)
        setVinos(vinosData || [])
        const { data: platosData } = await supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true).order('categoria')
        setPlatos(platosData || [])
        const { data: ventasData } = await supabase
          .from('estadisticas')
          .select('detalle, created_at')
          .eq('restaurante_id', rest.id)
          .eq('tipo', 'venta')
          .order('created_at', { ascending: false })
          .limit(300)
        setHistorialVenta((ventasData || []).map(item => {
          try { return JSON.parse(item.detalle || '{}') } catch { return null }
        }).filter(Boolean))
        if (esDemo && platosData?.length) {
          const platoDemo = platosData.find(plato => plato.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('codillo')) || platosData[0]
          setConsultaVenta(`${platoDemo.nombre}${platoDemo.precio ? ` (${platoDemo.precio} EUR)` : ''}${platoDemo.descripcion ? `: ${platoDemo.descripcion}` : ''}`)
          setPlatosMesaVenta([platoDemo])
          setRotacionVenta(0)
        }
      }
      setLoading(false)
    }
    cargar()
  }, [])

  function comprobarPin() {
    if (pin === PIN) { setAutenticado(true); setErrorPin(false) }
    else setErrorPin(true)
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
          return { id: v.id, perfil: data.perfil }
        } catch (e) {
          return { id: v.id, perfil: { dulzor: 2, acidez: 3, taninos: 3, alcohol: 3, cuerpo: 3, intensidad: 3, final: 3 } }
        }
      })
    )
    const nuevosPerfiles = {}
    resultados.forEach(r => { nuevosPerfiles[r.id] = r.perfil })
    setPerfiles(nuevosPerfiles)
    setCargandoPerfiles(false)
  }

  function radarPath(perfil, cx, cy, r) {
    return ejes.map((eje, idx) => {
      const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
      const val = (perfil[eje] || 1) / 5
      const x = cx + r * val * Math.cos(angle)
      const y = cy + r * val * Math.sin(angle)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ') + ' Z'
  }

  function gridPath(level, cx, cy, r) {
    return ejes.map((_, idx) => {
      const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
      const x = cx + r * level * Math.cos(angle)
      const y = cy + r * level * Math.sin(angle)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ') + ' Z'
  }

  async function registrarFeedbackVenta(vino, resultado, label) {
    if (!restaurante || !vino) return

    const consultaActiva = consultaVentaActiva()
    const clave = `${vino.id}-${resultado}-${consultaActiva}`
    setFeedbackVenta(prev => ({ ...prev, [clave]: true }))

    const detalle = JSON.stringify({
      resultado,
      vino_id: vino.id,
      vino: vino.nombre,
      plato: consultaActiva,
      objetivo: objetivoVenta,
      posicion: label,
    })

    const { error } = await supabase.from('estadisticas').insert([{
      restaurante_id: restaurante.id,
      tipo: 'venta',
      detalle,
    }])

    if (error) {
      setFeedbackVenta(prev => ({ ...prev, [clave]: false }))
    } else {
      setHistorialVenta(prev => [{ resultado, vino_id: vino.id, vino: vino.nombre, plato: consultaActiva, objetivo: objetivoVenta, posicion: label }, ...prev].slice(0, 300))
    }
  }

  function normalizar(texto) {
    return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  function precioBotella(vino) {
    return Number(vino.precio_botella) || 0
  }

  function esVinoDeZona(vino) {
    const zona = normalizar(`${restaurante?.ciudad || ''} ${restaurante?.provincia || ''} ${restaurante?.region || ''}`)
    const base = zona.split(/[^a-z0-9]+/).filter(termino => termino.length > 3)
    const extra = zona.includes('malaga') ? ['malaga', 'sierras de malaga', 'montes de malaga', 'ronda', 'axarquia'] : []
    const terminos = [...new Set([...base, ...extra])]
    if (!terminos.length) return false
    const texto = normalizar(`${vino.nombre || ''} ${vino.bodega || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
    return terminos.some(termino => texto.includes(termino))
  }

  function textoPlano(valor) {
    if (!valor) return ''
    if (typeof valor === 'string') return valor
    if (Array.isArray(valor)) return valor.map(textoPlano).join(' ')
    if (typeof valor === 'object') return Object.values(valor).map(textoPlano).join(' ')
    return ''
  }

  function palabrasClave(texto) {
    const stop = new Set(['con', 'del', 'para', 'por', 'una', 'uno', 'los', 'las', 'que', 'vino', 'vinos', 'tipo', 'como', 'tambien', 'sobre'])
    return normalizar(texto).split(/[^a-z0-9]+/).filter(p => p.length > 3 && !stop.has(p))
  }

  function hashTexto(texto) {
    return normalizar(texto).split('').reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
  }

  function ordenarConRotacion(items, semilla) {
    return [...items].sort((a, b) => {
      const scoreDiff = b.score - a.score
      if (Math.abs(scoreDiff) > 10) return scoreDiff
      const aHash = Math.abs(hashTexto(`${a.vino.id}-${semilla}`)) % 1000
      const bHash = Math.abs(hashTexto(`${b.vino.id}-${semilla}`)) % 1000
      return aHash - bHash
    })
  }

  function elegirConRotacion(items, semilla, offset = 0) {
    if (!items.length) return null
    const ordenados = ordenarConRotacion(items, semilla)
    return ordenados[Math.abs(offset) % ordenados.length]
  }

  function terminosVinoDesdeCapitulo(capitulo) {
    const camposVino = Object.entries(capitulo)
      .filter(([key]) => key.includes('wine') || key.includes('wines'))
      .map(([, value]) => textoPlano(value))
      .join(' ')

    const pairings = textoPlano((capitulo.explicit_pairings_in_chapter || []).map(p => p.wine_chartier))
    const textoVinos = `${camposVino} ${pairings}`
    const tokens = palabrasClave(textoVinos)

    return [...new Set(tokens)]
  }

  function tiposInferidosDesdeCapitulo(capitulo) {
    const textoVinos = normalizar(Object.entries(capitulo)
      .filter(([key]) => key.includes('wine') || key.includes('wines'))
      .map(([, value]) => textoPlano(value))
      .join(' '))

    const tipos = new Set()
    const blancos = ['blanco', 'sauvignon', 'verdejo', 'riesling', 'albari', 'chenin', 'gewurztraminer', 'chardonnay', 'vermentino', 'furmint', 'moscatel']
    const tintos = ['tinto', 'syrah', 'shiraz', 'garnacha', 'monastrell', 'pinot', 'cabernet', 'merlot', 'tempranillo']
    const generosos = ['fino', 'oloroso', 'amontillado', 'jerez', 'manzanilla', 'vin jaune']
    const espumosos = ['espumoso', 'champagne', 'cava', 'prosecco']
    const dulces = ['sauternes', 'dulce', 'tokaji', 'vendimia tardia']
    const rosados = ['rosado', 'rose']

    if (blancos.some(t => textoVinos.includes(t))) tipos.add('blanco')
    if (tintos.some(t => textoVinos.includes(t))) tipos.add('tinto')
    if (generosos.some(t => textoVinos.includes(t))) tipos.add('generoso')
    if (espumosos.some(t => textoVinos.includes(t))) tipos.add('espumoso')
    if (dulces.some(t => textoVinos.includes(t))) tipos.add('dulce')
    if (rosados.some(t => textoVinos.includes(t))) tipos.add('rosado')

    return [...tipos]
  }

  function contextoVenta(consultaNormalizada) {
    const platoKb = buscarPlatoKb(consultaNormalizada)
    if (platoKb?.contexto) return platoKb.contexto
    if (consultaNormalizada.includes('queso')) return 'queso'
    if (consultaNormalizada.includes('fritura') || consultaNormalizada.includes('frito') || consultaNormalizada.includes('croqueta')) return 'fritura'
    if (consultaNormalizada.includes('aperitivo') || consultaNormalizada.includes('entrante') || consultaNormalizada.includes('compartir')) return 'aperitivo'
    if (consultaNormalizada.includes('carne') || consultaNormalizada.includes('rabo') || consultaNormalizada.includes('codillo') || consultaNormalizada.includes('cordero')) return 'carne'
    if (consultaNormalizada.includes('pescado') || consultaNormalizada.includes('marisco') || consultaNormalizada.includes('gamba') || consultaNormalizada.includes('lubina') || consultaNormalizada.includes('salmon') || consultaNormalizada.includes('bacalao') || consultaNormalizada.includes('chipiron')) return 'pescado'
    if (consultaNormalizada.includes('picante') || consultaNormalizada.includes('curry')) return 'picante'
    return 'general'
  }

  function metodosPlato(consultaNormalizada) {
    const platoKb = buscarPlatoKb(consultaNormalizada)
    return {
      brasa: platoKb?.metodos?.includes('brasa') || ['brasa', 'parrilla', 'plancha', 'barbacoa', 'brasas'].some(t => consultaNormalizada.includes(t)),
      frito: platoKb?.metodos?.includes('frito') || ['frito', 'frita', 'fritura', 'croqueta', 'flamenquin'].some(t => consultaNormalizada.includes(t)),
      gratinado: platoKb?.metodos?.includes('gratinado') || ['gratinado', 'gratinada', 'alioli', 'queso', 'quesos', 'parmentier', 'crema'].some(t => consultaNormalizada.includes(t)),
      ahumado: platoKb?.metodos?.includes('ahumado') || ['ahumado', 'ahumada'].some(t => consultaNormalizada.includes(t)),
      picante: platoKb?.metodos?.includes('picante') || ['picante', 'picantito', 'pil pil', 'ajillo', 'brava', 'curry'].some(t => consultaNormalizada.includes(t)),
      vegetalVerde: platoKb?.metodos?.includes('vegetal') || ['esparrago', 'esparragos', 'pimiento', 'pepino', 'menta', 'perejil', 'hinojo', 'apio'].some(t => consultaNormalizada.includes(t)),
      setasTrufa: platoKb?.metodos?.includes('setas_trufa') || ['seta', 'setas', 'boletus', 'champinon', 'champinones', 'trufa'].some(t => consultaNormalizada.includes(t)),
      dulce: platoKb?.metodos?.includes('dulce') || ['pedro ximenez', 'px', 'miel', 'pasas', 'caramelizada', 'caramelizado'].some(t => consultaNormalizada.includes(t)),
      frutosSecos: platoKb?.metodos?.includes('frutos_secos') || ['nuez', 'nueces', 'almendra', 'almendras', 'avellana'].some(t => consultaNormalizada.includes(t)),
      umami: platoKb?.metodos?.includes('umami') || false,
      frio: platoKb?.metodos?.includes('frio') || false,
    }
  }

  function lecturaVenta(consulta) {
    const texto = normalizar(consulta)
    if (!texto) return null
    const platoKb = buscarPlatoKb(texto)
    const estructural = criteriosEstructurales(texto)
    if (platoKb) {
      return {
        rasgos: [...new Set([...(platoKb.rasgos || []), ...(estructural.rasgos || [])])].slice(0, 7),
        buscar: [...new Set([...(platoKb.buscar || []), ...(estructural.buscar || [])])].slice(0, 7),
        evitar: [...new Set([...(platoKb.evitar || []), ...(estructural.evitar || [])])].slice(0, 6),
        frase: platoKb.frase,
        lectura: [platoKb.lectura, estructural.lectura].filter(Boolean).join(' '),
      }
    }
    const contexto = contextoVenta(texto)
    const metodo = metodosPlato(texto)
    const rasgos = []
    const buscar = []
    const evitar = []

    if (contexto === 'queso') {
      rasgos.push('lacteo', metodo.frutosSecos ? 'frutos secos' : 'umami')
      buscar.push('blancos florales', 'fino o manzanilla', 'rosado o dulce si el queso lo pide')
      evitar.push('tinto con tanino salvo queso preparado para ello')
    }
    if (contexto === 'fritura' || metodo.frito) {
      rasgos.push('grasa', 'crujiente', 'sal')
      buscar.push('acidez', 'salinidad', 'burbuja o generoso seco')
      evitar.push('tintos potentes', 'vinos dulces')
    }
    if (contexto === 'pescado') {
      rasgos.push('proteina de mar')
      buscar.push('frescura', 'acidez', 'perfil salino')
      evitar.push('tanino marcado')
    }
    if (contexto === 'carne') {
      rasgos.push('intensidad', metodo.brasa ? 'tostado/brasa' : 'sabor carnico')
      buscar.push(metodo.brasa ? 'estructura y notas tostadas' : 'fruta, cuerpo y buena acidez')
      evitar.push('vinos demasiado ligeros si el plato es intenso')
    }
    if (metodo.gratinado) {
      rasgos.push('grasa/lacteo')
      buscar.push('acidez para limpiar', 'volumen si hay crema o alioli')
    }
    if (metodo.vegetalVerde) {
      rasgos.push('vegetal verde')
      buscar.push('perfil vegetal o citrico')
      evitar.push('madera dominante')
    }
    if (metodo.picante) {
      rasgos.push('picante')
      buscar.push('alcohol moderado', 'frescura', 'ligero dulzor si procede')
      evitar.push('alcohol alto y tanino')
    }
    if (metodo.setasTrufa) {
      rasgos.push('terroso')
      buscar.push('evolucion, umami o textura')
    }
    if (metodo.dulce) {
      rasgos.push('dulzor/reduccion')
      buscar.push('volumen', 'oxidacion controlada o dulzor compatible')
    }

    const frase = contexto === 'queso'
      ? 'Aqui no venderia tinto por defecto: primero miraria textura, curacion y acompanamiento.'
      : contexto === 'pescado' && metodo.vegetalVerde
        ? 'Lo venderia desde la frescura: el vino debe acompanar la grasa del pescado sin pelearse con el vegetal.'
        : contexto === 'fritura' || metodo.frito
          ? 'Lo venderia desde la limpieza: algo que corte grasa y deje la boca lista para otro bocado.'
          : contexto === 'carne'
            ? 'Lo venderia desde la intensidad del plato y, si hay brasa, desde la afinidad con notas tostadas.'
            : 'Lo venderia buscando afinidad aromatica con el ingrediente dominante y la salsa.'

    return {
      rasgos: [...new Set([...rasgos, ...(estructural.rasgos || [])])].slice(0, 7),
      buscar: [...new Set([...buscar, ...(estructural.buscar || [])])].slice(0, 7),
      evitar: [...new Set([...evitar, ...(estructural.evitar || [])])].slice(0, 6),
      frase,
      lectura: estructural.lectura,
    }
  }

  function cambiarConsultaVenta(valor) {
    setConsultaVenta(valor)
    setPlatosMesaVenta([])
    setRotacionVenta(0)
  }

  function cambiarObjetivoVenta(valor) {
    setObjetivoVenta(valor)
    setRotacionVenta(0)
  }

  function consultaDesdePlato(plato) {
    return `${plato.nombre}${plato.precio ? ` (${plato.precio} EUR)` : ''}${plato.descripcion ? `: ${plato.descripcion}` : ''}`
  }

  function alternarPlatoMesa(plato) {
    const existe = platosMesaVenta.some(p => p.id === plato.id)
    const nuevosPlatos = existe
      ? platosMesaVenta.filter(p => p.id !== plato.id)
      : [...platosMesaVenta, plato]

    setPlatosMesaVenta(nuevosPlatos)
    setConsultaVenta(nuevosPlatos.map(consultaDesdePlato).join(', '))
    setRotacionVenta(0)
  }

  function consultaVentaActiva() {
    return platosMesaVenta.length
      ? platosMesaVenta.map(consultaDesdePlato).join(', ')
      : consultaVenta
  }

  function consultasVentaActuales() {
    if (platosMesaVenta.length) return platosMesaVenta.map(consultaDesdePlato)
    return consultaVenta
      .split(',')
      .map(parte => parte.trim())
      .filter(Boolean)
  }

  function ticketMesaVenta() {
    if (platosMesaVenta.length) {
      return platosMesaVenta.reduce((sum, plato) => sum + (Number(plato.precio) || 0), 0)
    }

    const preciosEnConsulta = consultaVenta
      .match(/\((\d+(?:[.,]\d{1,2})?)\s*(?:eur|€)\)/gi)
      ?.map(match => Number(match.replace(/[^\d,.]/g, '').replace(',', '.')) || 0) || []

    return preciosEnConsulta.reduce((sum, precio) => sum + precio, 0)
  }

  function rangoBotellaParaTicket(ticketComida, precioMedio) {
    if (!ticketComida) {
      return {
        min: Math.max(18, precioMedio * 0.65),
        ideal: precioMedio,
        max: Math.max(32, precioMedio * 1.25),
        lectura: 'Sin ticket de comida definido: uso el precio medio de la carta como referencia.',
      }
    }

    const min = Math.max(18, ticketComida * 0.35)
    const ideal = Math.max(22, ticketComida * 0.55)
    const max = Math.max(30, ticketComida * 0.8)

    return {
      min,
      ideal,
      max,
      lectura: `Mesa estimada ${ticketComida.toFixed(2)} EUR: botella logica entre ${min.toFixed(0)} y ${max.toFixed(0)} EUR.`,
    }
  }

  function precioMedioVinosVenta() {
    const disponibles = vinos.filter(v => v.activo !== false && v.stock !== 0 && precioBotella(v) > 0)
    if (!disponibles.length) return 28
    return disponibles.reduce((sum, vino) => sum + precioBotella(vino), 0) / disponibles.length
  }

  function lecturaMesaVenta() {
    const consultas = consultasVentaActuales()
    if (consultas.length <= 1) return lecturaVenta(consultas[0] || consultaVenta)

    const lecturas = consultas.map(lecturaVenta).filter(Boolean)
    const unir = key => [...new Set(lecturas.flatMap(lectura => lectura[key] || []))].slice(0, 6)

    return {
      rasgos: unir('rasgos'),
      buscar: unir('buscar'),
      evitar: unir('evitar'),
      frase: `Buscamos una botella puente para ${consultas.length} platos: suficiente frescura para los entrantes y estructura para el plato mas intenso.`,
      lectura: `${rangoBotellaParaTicket(ticketMesaVenta(), precioMedioVinosVenta()).lectura} La recomendacion no optimiza un plato aislado, sino el conjunto.`,
    }
  }

  const platosVenta = platos
    .filter(plato => plato.activo !== false)

  function compatibilidadContexto(vino, contexto, consultaNormalizada) {
    const textoVino = normalizar(`${vino.nombre} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
    const esTawnyOPorto = textoVino.includes('tawny') || textoVino.includes('porto') || textoVino.includes('oporto')
    const quesoTrucadoParaTinto = ['clavo', 'olivada', 'tomate seco', 'tomates secos'].some(t => consultaNormalizada.includes(t))
    const metodo = metodosPlato(consultaNormalizada)

    if (contexto === 'queso') {
      if (vino.tipo === 'tinto' && !quesoTrucadoParaTinto) {
        return { compatible: false, penalizacion: 80, razon: 'En quesos, el KB prioriza blancos, finos/manzanillas, rosados, dulces y oportos; el tinto queda como excepcion si el queso esta trucado.' }
      }
      return { compatible: true, penalizacion: 0 }
    }

    if (contexto === 'fritura') {
      if (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto) {
        return { compatible: false, penalizacion: 90, razon: 'Para fritura conviene tension, salinidad o burbuja; un tinto potente o un tawny no es la primera lectura del KB.' }
      }
      if (!['generoso', 'espumoso', 'blanco', 'rosado'].includes(vino.tipo)) {
        return { compatible: false, penalizacion: 50, razon: 'Para fritura se priorizan estilos frescos, salinos o con burbuja.' }
      }
      return { compatible: true, penalizacion: 0 }
    }

    if (contexto === 'aperitivo') {
      if (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto) {
        return { compatible: false, penalizacion: 60, razon: 'Para aperitivo se priorizan vinos frescos, salinos, blancos, generosos secos o espumosos.' }
      }
      return { compatible: true, penalizacion: 0 }
    }

    if (contexto === 'pescado') {
      const tintoJustificado = metodo.brasa || metodo.ahumado || metodo.setasTrufa || metodo.dulce
      if (vino.tipo === 'tinto' && !tintoJustificado) {
        return { compatible: false, penalizacion: 85, razon: 'En pescado sin brasa, ahumado, setas/trufa o reduccion intensa, se priorizan blancos, espumosos, rosados o generosos secos.' }
      }
      if ((consultaNormalizada.includes('salmon') || consultaNormalizada.includes('bacalao')) && metodo.vegetalVerde && vino.tipo === 'tinto') {
        return { compatible: false, penalizacion: 90, razon: 'Con pescado y verduras verdes como esparragos, el metodo de plato pide frescor y perfil vegetal antes que tinto.' }
      }
      if (metodo.gratinado || metodo.frito) {
        if (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto) {
          return { compatible: false, penalizacion: 90, razon: 'El gratinado, alioli o fritura pide acidez, salinidad o burbuja; evita tintos potentes y vinos dulces.' }
        }
      }
      return { compatible: true, penalizacion: 0 }
    }

    return { compatible: true, penalizacion: 0 }
  }

  function capitulosParaConsulta(consultaNormalizada) {
    const platoKb = buscarPlatoKb(consultaNormalizada)
    const atajos = {
      aperitivo: ['anisado', 'fino_oloroso', 'sabor_frio'],
      pescado: ['anisado', 'romero', 'azafran', 'sabor_frio', 'experiencias_armonias'],
      carne: ['carne_vacuno', 'roble_barrica', 'canela', 'clavo'],
      queso: ['quesos', 'anisado', 'fino_oloroso'],
      fritura: ['fino_oloroso', 'sabor_frio'],
      fresco: ['sabor_frio', 'anisado', 'jengibre'],
      premium: ['carne_vacuno', 'roble_barrica', 'sotolon', 'clavo'],
      picante: ['capsaicina', 'gewurztraminer_lichi_jengibre_scheurebe', 'jengibre'],
      curry: ['sotolon', 'capsaicina'],
      postre: ['sotolon', 'pina_fresa', 'jarabe_arce', 'canela'],
    }

    const capitulos = papilasKb.chapters || []
    const idsAtajo = [
      ...(platoKb?.capitulos || []),
      ...Object.entries(atajos)
      .filter(([key]) => consultaNormalizada.includes(key))
      .flatMap(([, ids]) => ids)
    ]

    const matches = capitulos.map(capitulo => {
      const textoCapitulo = normalizar([
        capitulo.id,
        capitulo.title,
        textoPlano(capitulo.foods_chartier_explicitly_named),
        textoPlano(capitulo.explicit_pairings_in_chapter?.map(p => p.dish_chartier)),
      ].join(' '))

      let score = idsAtajo.includes(capitulo.id) ? 12 : 0
      palabrasClave(consultaNormalizada).forEach(palabra => {
        if (textoCapitulo.includes(palabra)) score += 4
      })

      return {
        capitulo,
        score,
        terminosVino: terminosVinoDesdeCapitulo(capitulo),
        tipos: tiposInferidosDesdeCapitulo(capitulo),
      }
    }).filter(match => match.score > 0)

    if (matches.length) return matches.sort((a, b) => b.score - a.score).slice(0, 4)

    return capitulos
      .filter(capitulo => ['sabor_frio', 'anisado', 'fino_oloroso'].includes(capitulo.id))
      .map(capitulo => ({
        capitulo,
        score: 2,
        terminosVino: terminosVinoDesdeCapitulo(capitulo),
        tipos: tiposInferidosDesdeCapitulo(capitulo),
      }))
  }

  function fraseVenta(vino, motivo, fuente) {
    const tipo = tipoLabel[vino.tipo]?.toLowerCase() || 'vino'
    const origen = vino.region ? ` de ${vino.region}` : ''
    const uva = vino.uva ? `, con ${vino.uva}` : ''
    const base = `Recomiendalo como ${tipo}${origen}${uva}: ${motivo}.`
    return fuente ? `${base} Criterio: ${fuente}.` : base
  }

  function ajusteAprendizajeVenta(vino, contexto) {
    if (!historialVenta.length) return { ajuste: 0, muestras: 0 }

    const pesos = historialVenta.reduce((acc, evento) => {
      const mismoVino = String(evento.vino_id) === String(vino.id)
      if (!mismoVino) return acc

      const contextoEvento = contextoVenta(normalizar(evento.plato || ''))
      const mismoContexto = contextoEvento === contexto
      const pesoContexto = mismoContexto ? 1 : 0.35
      const pesoResultado = evento.resultado === 'vendida'
        ? 2.2
        : evento.resultado === 'no_convence'
          ? -2
          : evento.resultado === 'otra'
            ? -1
            : 0

      return {
        total: acc.total + (pesoResultado * pesoContexto),
        muestras: acc.muestras + pesoContexto,
        vendidas: acc.vendidas + (evento.resultado === 'vendida' ? pesoContexto : 0),
      }
    }, { total: 0, muestras: 0, vendidas: 0 })

    if (!pesos.muestras) return { ajuste: 0, muestras: 0 }

    const confianza = Math.min(pesos.muestras / 6, 1)
    const ajuste = Math.max(-10, Math.min(10, pesos.total * confianza))
    return { ajuste, muestras: pesos.muestras, vendidas: pesos.vendidas }
  }

  function puntuarParaVenta(vino, matchesKb, objetivo, precioMedio, contexto, consultaNormalizada, rangoTicket = null) {
    const textoVino = normalizar(`${vino.nombre} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
    let score = 0
    let motivo = 'busca afinidad aromatica con el plato, no solo el topico del color'
    let fuente = 'Papilas y moleculas'
    const compatibilidad = compatibilidadContexto(vino, contexto, consultaNormalizada)
    const metodo = metodosPlato(consultaNormalizada)

    if (vino.stock === 0) score -= 100

    matchesKb.forEach(match => {
      let matchScore = match.score
      const terminosCoincidentes = match.terminosVino.filter(termino => textoVino.includes(termino))
      const coincideTipo = match.tipos.includes(vino.tipo)

      if (coincideTipo) matchScore += 8
      matchScore += Math.min(terminosCoincidentes.length, 6) * 5

      if (matchScore > score) {
        motivo = terminosCoincidentes.length
          ? `comparte referencias aromaticas o de estilo con ${terminosCoincidentes.slice(0, 3).join(', ')}`
          : `encaja con la familia ${match.capitulo.title}`
        fuente = match.capitulo.title
      }
      score += matchScore
    })

    if (objetivo === 'rotar') {
      if (vino.stock > 3) score += Math.min(vino.stock, 18) / 2
      if (vino.stock > 0 && vino.stock <= 3) score -= 4
    }
    if (vino.precio_copa) score += objetivo === 'copas' ? 8 : 1
    if (precioBotella(vino) > precioMedio) score += objetivo === 'ticket' ? 5 : 0
    if (objetivo === 'local') score += esVinoDeZona(vino) ? 9 : -2

    if (rangoTicket) {
      const precio = precioBotella(vino)
      const dentroRango = precio >= rangoTicket.min && precio <= rangoTicket.max
      const distanciaIdeal = Math.abs(precio - rangoTicket.ideal)
      const tolerancia = Math.max(8, rangoTicket.ideal * 0.35)

      if (dentroRango) {
        score += objetivo === 'ticket' ? 9 : 5
        if (distanciaIdeal <= tolerancia * 0.55) score += 3
        motivo = `${motivo}; ademas encaja con el ticket estimado de la mesa`
      } else {
        const penalizacionPrecio = Math.min(9, (distanciaIdeal / tolerancia) * 3)
        score -= penalizacionPrecio
        if (objetivo === 'ticket' && precio > rangoTicket.max && precio <= rangoTicket.max * 1.35) {
          score += 4
          motivo = `${motivo}; puede defenderse como subida de ticket controlada`
        }
      }
    }

    if (metodo.brasa && contexto === 'carne' && vino.tipo === 'tinto') score += 8
    if (metodo.frito && ['generoso', 'espumoso', 'blanco'].includes(vino.tipo)) score += 8
    if (metodo.gratinado && ['blanco', 'generoso', 'espumoso'].includes(vino.tipo)) score += 5
    if (metodo.vegetalVerde && ['blanco', 'generoso', 'espumoso'].includes(vino.tipo)) score += 5
    if (metodo.vegetalVerde && ['sauvignon', 'verdejo', 'albari', 'riesling'].some(t => textoVino.includes(t))) score += 8
    if (metodo.setasTrufa && contexto === 'pescado' && ['tinto', 'blanco'].includes(vino.tipo)) score += 4
    if (metodo.dulce && ['dulce', 'generoso'].includes(vino.tipo)) score += 4

    if (metodo.frito && ['alta acidez', 'perfil fresco', 'salino', 'manzanilla', 'fino'].some(t => textoVino.includes(t))) score += 7
    if (metodo.gratinado && ['perfil fresco', 'alta acidez', 'salino', 'mineral'].some(t => textoVino.includes(t))) score += 4
    if (metodo.brasa && ['tostado', 'madera', 'fruta madura', 'con cuerpo', 'tanino amable'].some(t => textoVino.includes(t))) score += 6
    if (metodo.dulce && ['dulce', 'oxidativo', 'pedro ximenez', 'px', 'fruta madura'].some(t => textoVino.includes(t))) score += 6
    if (contexto === 'queso' && ['oxidativo', 'dulce', 'salino', 'floral', 'alta acidez'].some(t => textoVino.includes(t))) score += 6
    if ((contexto === 'aperitivo' || metodo.frio) && ['perfil fresco', 'alta acidez', 'salino', 'mineral', 'floral'].some(t => textoVino.includes(t))) score += 5
    if (metodo.picante && ['perfil fresco', 'floral', 'dulce', 'baja graduacion'].some(t => textoVino.includes(t))) score += 5

    const aprendizaje = ajusteAprendizajeVenta(vino, contexto)
    score += aprendizaje.ajuste
    if (Math.abs(aprendizaje.ajuste) >= 2.5) {
      motivo = aprendizaje.ajuste > 0
        ? `${motivo}; ademas ha funcionado bien en sala en casos parecidos`
        : `${motivo}; aunque el historial de sala pide prudencia con este vino`
      fuente = `${fuente} + feedback de sala`
    }

    score += Math.min(precioBotella(vino), 80) / 80
    score -= compatibilidad.penalizacion

    if (!compatibilidad.compatible && compatibilidad.razon) {
      motivo = compatibilidad.razon
      fuente = 'Restriccion de contexto del KB'
    }

    return { vino, score, motivo, fuente, compatible: compatibilidad.compatible, aprendizaje: ajusteAprendizajeVenta(vino, contexto) }
  }

  function calcularRecomendacionesVenta() {
    const disponibles = vinos.filter(v => v.activo !== false && v.stock !== 0 && precioBotella(v) > 0)
    if (!disponibles.length) return []

    const precioMedio = disponibles.reduce((sum, vino) => sum + precioBotella(vino), 0) / disponibles.length
    const consultas = consultasVentaActuales()
    const consultaNormalizada = normalizar(consultaVentaActiva())
    const esMesa = consultas.length > 1
    const ticketComida = ticketMesaVenta()
    const rangoTicket = rangoBotellaParaTicket(ticketComida, precioMedio)
    const puntuados = disponibles
      .map(vino => {
        if (!esMesa) {
          const contexto = contextoVenta(consultaNormalizada)
          const matchesKb = capitulosParaConsulta(consultaNormalizada)
          return puntuarParaVenta(vino, matchesKb, objetivoVenta, precioMedio, contexto, consultaNormalizada, rangoTicket)
        }

        const parciales = consultas.map(consulta => {
          const texto = normalizar(consulta)
          return puntuarParaVenta(vino, capitulosParaConsulta(texto), objetivoVenta, precioMedio, contextoVenta(texto), texto, rangoTicket)
        })
        const incompatibles = parciales.filter(item => !item.compatible)
        const scoreBase = parciales.reduce((sum, item) => sum + item.score, 0) / parciales.length
        const mejorParcial = parciales.sort((a, b) => b.score - a.score)[0]
        const penalizacionMesa = incompatibles.length * 45
        const compatible = incompatibles.length === 0

        return {
          vino,
          score: scoreBase - penalizacionMesa,
          motivo: compatible
            ? `funciona como vino puente para ${consultas.length} platos, sin chocar con ninguno de ellos`
            : `encaja con parte de la mesa, pero tiene conflicto con ${incompatibles.length} plato${incompatibles.length > 1 ? 's' : ''}`,
          fuente: compatible ? 'Modo mesa: compatibilidad transversal' : mejorParcial.fuente,
          compatible,
          rangoTicket,
          ticketComida,
        }
      })
      .sort((a, b) => b.score - a.score)
    const semilla = `${consultaNormalizada}-${objetivoVenta}-${rotacionVenta}`

    const usados = new Set()
    const bodegasUsadas = new Set()
    const elegir = (label, filtroPrecio) => {
      const candidatos = puntuados.filter(item => item.compatible && !usados.has(item.vino.id) && filtroPrecio(item.vino))
      if (!candidatos.length) return null

      const mejorScore = candidatos[0].score
      const margen = objetivoVenta === 'rotar' ? 24 : rotacionVenta > 0 ? 18 : 10
      const grupoBueno = candidatos.filter(item => mejorScore - item.score <= margen)
      const grupoDiverso = grupoBueno.filter(item => !item.vino.bodega || !bodegasUsadas.has(item.vino.bodega))
      const grupoElegible = grupoDiverso.length ? grupoDiverso : grupoBueno
      const desplazamiento = rotacionVenta + Math.abs(hashTexto(label)) % Math.max(grupoElegible.length, 1)
      const elegido = elegirConRotacion(grupoElegible, `${semilla}-${label}`, desplazamiento)
      if (!elegido) return null
      usados.add(elegido.vino.id)
      if (elegido.vino.bodega) bodegasUsadas.add(elegido.vino.bodega)
      return { ...elegido, label, rangoTicket, ticketComida }
    }

    return [
      elegir('Facil de vender', vino => precioBotella(vino) <= Math.max(30, rangoTicket.ideal) && precioBotella(vino) >= Math.max(14, rangoTicket.min * 0.75)),
      elegir('Recomendado', () => true),
      elegir('Premium', vino => precioBotella(vino) >= Math.max(35, rangoTicket.ideal, rangoTicket.max * 0.9)),
    ].filter(Boolean)
  }

  const tipos = ['todos', ...new Set(vinos.map(v => v.tipo))]
  const recomendacionesVenta = calcularRecomendacionesVenta()
  const lecturaActual = lecturaMesaVenta()
  const ticketActualVenta = ticketMesaVenta()
  const rangoActualVenta = rangoBotellaParaTicket(ticketActualVenta, precioMedioVinosVenta())
  const categoriasPlatosVenta = ['todos', ...new Set(platosVenta.map(plato => plato.categoria).filter(Boolean))]
  const platosVentaFiltrados = platosVenta.filter(plato => {
    const texto = normalizar(`${plato.nombre} ${plato.descripcion || ''} ${plato.categoria || ''}`)
    const matchCategoria = categoriaPlatoVenta === 'todos' || plato.categoria === categoriaPlatoVenta
    const matchBusqueda = !busquedaPlatoVenta || texto.includes(normalizar(busquedaPlatoVenta))
    return matchCategoria && matchBusqueda
  })
  const platosPanelAbierto = mostrarPlatosVenta || busquedaPlatoVenta.length > 0 || categoriaPlatoVenta !== 'todos'

  const vinosFiltrados = vinos.filter(v => {
    const matchBusqueda = !busqueda || busqueda.length < 2 ||
      v.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (v.bodega && v.bodega.toLowerCase().includes(busqueda.toLowerCase())) ||
      (v.uva && v.uva.toLowerCase().includes(busqueda.toLowerCase())) ||
      (v.region && v.region.toLowerCase().includes(busqueda.toLowerCase()))
    const matchFiltro = filtro === 'todos' || v.tipo === filtro
    return matchBusqueda && matchFiltro
  })

  const cx = 150, cy = 150, r = 100

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#111', fontFamily: 'sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.15em', color: '#666' }}>CARGANDO</p>
    </div>
  )

  if (!autenticado) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#111', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <p style={{ fontSize: 11, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px' }}>Modo camarero</p>
      <p style={{ fontSize: 20, fontWeight: 300, color: 'white', fontFamily: 'Georgia, serif', margin: '0 0 32px' }}>{restaurante?.nombre}</p>
      <input type="password" placeholder="PIN" value={pin}
        onChange={e => setPin(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && comprobarPin()}
        style={{ width: '100%', maxWidth: 200, padding: '14px', textAlign: 'center', fontSize: 24, letterSpacing: '0.3em', border: 'none', borderBottom: '1px solid #333', background: 'transparent', color: 'white', outline: 'none', marginBottom: 16 }}
      />
      {errorPin && <p style={{ fontSize: 12, color: '#c07070', margin: '0 0 16px' }}>PIN incorrecto</p>}
      <button onClick={comprobarPin} style={{ background: 'white', color: '#111', border: 'none', padding: '12px 32px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
        Entrar
      </button>
    </div>
  )

  // Vista comparador
  if (mostrarComparador) return (
    <div style={{ minHeight: '100vh', background: '#111', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #222' }}>
        <button onClick={() => setMostrarComparador(false)} style={{ background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer', padding: 0 }}>←</button>
        <span style={{ fontSize: 12, color: '#555', letterSpacing: '0.08em' }}>COMPARAR</span>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {vinosComparador.map((v, idx) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: coloresVino[idx] }} />
              <p style={{ margin: 0, fontSize: 13, color: '#fff', fontWeight: 500 }}>{v.nombre}</p>
            </div>
          ))}
        </div>

        {cargandoPerfiles || vinosComparador.some(v => !perfiles[v.id]) ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: 12, color: '#555', letterSpacing: '0.15em' }}>ANALIZANDO...</p>
          </div>
        ) : (
          <div style={{ background: '#1a1a1a', borderRadius: 12, padding: '20px', marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
            <svg width={300} height={300} viewBox="0 0 300 300">
              {[0.2, 0.4, 0.6, 0.8, 1].map(level => (
                <path key={level} d={gridPath(level, cx, cy, r)} fill="none" stroke="#333" strokeWidth={1} />
              ))}
              {ejes.map((_, idx) => {
                const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
                return <line key={idx} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="#333" strokeWidth={1} />
              })}
              {ejes.map((eje, idx) => {
                const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
                const lx = cx + (r + 20) * Math.cos(angle)
                const ly = cy + (r + 20) * Math.sin(angle)
                return (
                  <text key={eje} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#555">
                    {etiquetas[eje]}
                  </text>
                )
              })}
              {vinosComparador.map((v, idx) => {
                const perfil = perfiles[v.id]
                if (!perfil) return null
                const dashPatterns = ['none', '6,3', 'none', '6,3']
                return (
                  <path key={v.id} d={radarPath(perfil, cx, cy, r)}
                    fill={coloresVino[idx]} fillOpacity={0.15}
                    stroke={coloresVino[idx]} strokeWidth={idx % 2 === 0 ? 2.5 : 1.5}
                    strokeDasharray={dashPatterns[idx]}
                  />
                )
              })}
            </svg>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${vinosComparador.length}, 1fr)`, gap: 1, background: '#333', borderRadius: 8, overflow: 'hidden', minWidth: 300 }}>
            <div style={{ background: '#1a1a1a', padding: '10px 12px' }} />
            {vinosComparador.map((v, idx) => (
              <div key={v.id} style={{ background: '#1a1a1a', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: coloresVino[idx], margin: '0 auto 4px' }} />
                <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: '#fff' }}>{v.nombre}</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#555' }}>{v.bodega}</p>
              </div>
            ))}
            {ejes.map(eje => (
              <>
                <div key={eje + '_l'} style={{ background: '#111', padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#666' }}>{etiquetas[eje]}</p>
                </div>
                {vinosComparador.map(v => {
                  const val = perfiles[v.id]?.[eje] || 0
                  return (
                    <div key={v.id + eje} style={{ background: '#111', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} style={{ width: 7, height: 7, borderRadius: '50%', background: n <= val ? '#fff' : '#333' }} />
                      ))}
                    </div>
                  )
                })}
              </>
            ))}
            <div style={{ background: '#1a1a1a', padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#666' }}>Botella</p>
            </div>
            {vinosComparador.map(v => (
              <div key={v.id + '_p'} style={{ background: '#1a1a1a', padding: '8px 12px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#fff' }}>{v.precio_botella} €</p>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => { setVinosComparador([]); setMostrarComparador(false) }}
          style={{ width: '100%', marginTop: 16, background: 'none', border: '1px solid #333', padding: '12px', fontSize: 12, color: '#666', cursor: 'pointer', borderRadius: 8 }}>
          Cerrar comparador
        </button>
      </div>
    </div>
  )

  // Vista ficha vino
  if (vinoSeleccionado) return (
    <div style={{ minHeight: '100vh', background: '#111', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #222' }}>
        <button onClick={() => setVinoSeleccionado(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer', padding: 0 }}>←</button>
        <span style={{ fontSize: 12, color: '#555', letterSpacing: '0.08em' }}>FICHA DEL VINO</span>
      </div>
      <div style={{ padding: '28px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[vinoSeleccionado.tipo] }} />
          <span style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{tipoLabel[vinoSeleccionado.tipo]}</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 400, color: 'white', margin: '0 0 6px', fontFamily: 'Georgia, serif' }}>{vinoSeleccionado.nombre}</h1>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 28px' }}>{vinoSeleccionado.bodega}</p>
        <div style={{ borderTop: '1px solid #222' }}>
          {[
            { label: 'Región', valor: vinoSeleccionado.region },
            { label: 'Uva', valor: vinoSeleccionado.uva },
            { label: 'Añada', valor: vinoSeleccionado.anada },
            { label: 'Copa', valor: vinoSeleccionado.precio_copa ? `${vinoSeleccionado.precio_copa} €` : null },
            { label: 'Botella', valor: vinoSeleccionado.precio_botella ? `${vinoSeleccionado.precio_botella} €` : null },
            { label: 'Stock', valor: vinoSeleccionado.stock !== null ? `${vinoSeleccionado.stock} botellas` : null },
          ].filter(f => f.valor).map(f => (
            <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #222' }}>
              <span style={{ fontSize: 13, color: '#555' }}>{f.label}</span>
              <span style={{ fontSize: 14, color: f.label === 'Stock' && vinoSeleccionado.stock === 0 ? '#c07070' : f.label === 'Stock' && vinoSeleccionado.stock <= 3 ? '#C4A55A' : 'white' }}>{f.valor}</span>
            </div>
          ))}
        </div>
        {vinoSeleccionado.notas_cata && (
          <div style={{ marginTop: 20, padding: '16px', background: '#1a1a1a', borderRadius: 8 }}>
            <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 10px' }}>Notas de cata</p>
            <p style={{ fontSize: 14, color: '#aaa', lineHeight: 1.8, margin: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{vinoSeleccionado.notas_cata}</p>
          </div>
        )}
        <button onClick={() => toggleComparador(vinoSeleccionado)}
          style={{ width: '100%', marginTop: 20, padding: '14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
            background: vinosComparador.find(v => v.id === vinoSeleccionado.id) ? '#fff' : '#222',
            color: vinosComparador.find(v => v.id === vinoSeleccionado.id) ? '#111' : '#aaa' }}>
          {vinosComparador.find(v => v.id === vinoSeleccionado.id) ? '✓ Quitar del comparador' : '+ Añadir al comparador'}
        </button>
      </div>
    </div>
  )

  const interfazServicioCompacta = true
  if (interfazServicioCompacta) return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <p className={styles.eyebrow}>Modo camarero{demoActivo ? ' · Demo' : ''}</p>
          <h1 className={styles.title}>{restaurante?.nombre || 'Servicio'}</h1>
        </div>
        <nav className={styles.tabs} aria-label="Vista">
          <button type="button" onClick={() => setVistaServicio('venta')} className={`${styles.tab} ${vistaServicio === 'venta' ? styles.tabActive : ''}`}>
            Venta
          </button>
          <button type="button" onClick={() => setVistaServicio('bodega')} className={`${styles.tab} ${vistaServicio === 'bodega' ? styles.tabActive : ''}`}>
            Bodega
          </button>
        </nav>
      </header>

      {demoActivo && (
        <div className={styles.demoBanner}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 750 }}>Demo lista para grabar</p>
        </div>
      )}

      <main className={styles.workspace}>
        {vistaServicio === 'venta' ? (
          <section className={styles.serviceGrid}>
            <aside className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>Mesa</p>
                  <h2 className={styles.panelTitle}>{platosMesaVenta.length > 1 ? `${platosMesaVenta.length} platos` : 'Venta rapida'}</h2>
                  <p className={styles.panelSubtitle}>{platosMesaVenta.length ? platosMesaVenta.map(p => p.nombre).join(' · ') : 'Sin plato seleccionado'}</p>
                </div>
                <select value={objetivoVenta} onChange={e => cambiarObjetivoVenta(e.target.value)} className={styles.select}>
                  <option value="equilibrado">Equilibrado</option>
                  <option value="copas">Por copas</option>
                  <option value="ticket">Subir ticket</option>
                  <option value="rotar">Rotar stock</option>
                  <option value="local">Vino local</option>
                </select>
              </div>

              <div className={styles.panelBody}>
                <input
                  type="text"
                  placeholder="Plato o mesa"
                  value={consultaVenta}
                  onChange={e => cambiarConsultaVenta(e.target.value)}
                  className={styles.field}
                />

                {platosMesaVenta.length > 0 && (
                  <div className={styles.selectedBox}>
                    <div className={styles.selectedHeader}>
                      <p className={styles.sectionLabel} style={{ margin: 0 }}>Seleccionados</p>
                      <button type="button" onClick={() => { setPlatosMesaVenta([]); setConsultaVenta(''); setRotacionVenta(0) }} className={styles.plainButton}>
                        Limpiar
                      </button>
                    </div>
                    <div className={styles.chipWrap}>
                      {platosMesaVenta.map(plato => (
                        <button key={plato.id} type="button" onClick={() => alternarPlatoMesa(plato)} className={`${styles.chip} ${styles.chipActive}`}>
                          {plato.nombre} x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(ticketActualVenta > 0 || platosMesaVenta.length > 1) && (
                  <div className={styles.statsGrid}>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Ticket comida</p>
                      <p className={styles.statValue}>{ticketActualVenta.toFixed(2)} EUR</p>
                    </div>
                    <div className={styles.stat}>
                      <p className={styles.statLabel}>Botella logica</p>
                      <p className={styles.statValue}>{rangoActualVenta.min.toFixed(0)}-{rangoActualVenta.max.toFixed(0)} EUR</p>
                    </div>
                  </div>
                )}

                <p className={styles.sectionLabel}>Atajos</p>
                <div className={styles.scrollChips}>
                  {['Aperitivo', 'Pescado', 'Carne', 'Queso', 'Fritura', 'Fresco', 'Premium'].map(atajo => (
                    <button key={atajo} type="button" onClick={() => cambiarConsultaVenta(atajo)}
                      className={`${styles.chip} ${normalizar(consultaVenta) === normalizar(atajo) ? styles.chipActive : ''}`}>
                      {atajo}
                    </button>
                  ))}
                </div>

                {platosVenta.length > 0 && (
                  <>
                    <div className={styles.sectionHeaderLine}>
                      <p className={styles.sectionLabel}>Platos</p>
                      <button type="button" onClick={() => setMostrarPlatosVenta(!mostrarPlatosVenta)} className={styles.textButton}>
                        {platosPanelAbierto ? 'Ocultar' : `Mostrar (${platosVenta.length})`}
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar plato"
                      value={busquedaPlatoVenta}
                      onChange={e => setBusquedaPlatoVenta(e.target.value)}
                      className={styles.field}
                      style={{ marginBottom: 8 }}
                    />
                    <div className={styles.scrollChips} style={{ marginBottom: 10 }}>
                      {categoriasPlatosVenta.map(categoria => (
                        <button key={categoria} type="button" onClick={() => { setCategoriaPlatoVenta(categoria); setMostrarPlatosVenta(true) }}
                          className={`${styles.chip} ${categoriaPlatoVenta === categoria ? styles.chipActive : ''}`}>
                          {categoria === 'todos' ? 'Todos' : categoria}
                        </button>
                      ))}
                    </div>
                    {platosPanelAbierto && (
                      <div className={styles.dishGrid}>
                        {platosVentaFiltrados.map(plato => {
                          const seleccionado = platosMesaVenta.some(p => p.id === plato.id)
                          return (
                            <button key={plato.id} type="button" onClick={() => alternarPlatoMesa(plato)}
                              className={`${styles.dishButton} ${seleccionado ? styles.dishSelected : ''}`}>
                              <span className={styles.dishName}>{plato.nombre}</span>
                              <span className={styles.dishPrice}>{plato.precio ? `${Number(plato.precio).toFixed(2)} EUR` : plato.categoria || 'Carta'}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>

            <section className={styles.panelDark}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>Recomendacion</p>
                  <h2 className={styles.panelTitle}>Vinos para vender</h2>
                  <p className={styles.panelSubtitle}>{platosMesaVenta.length > 1 ? 'Botella puente para la mesa' : 'Tres caminos comerciales'}</p>
                </div>
                <button type="button" onClick={() => setRotacionVenta(rotacionVenta + 1)} className={styles.primaryButton}>
                  Otras opciones
                </button>
              </div>

              <div className={styles.panelBody}>
                {recomendacionesVenta.length > 0 ? (
                  <div className={styles.recommendGrid}>
                    {recomendacionesVenta.map(item => (
                      <RecomendacionVenta
                        key={item.label}
                        item={item}
                        tipoDot={tipoDot}
                        tipoLabel={tipoLabel}
                        fraseVenta={fraseVenta}
                        onSelect={setVinoSeleccionado}
                        onFeedback={registrarFeedbackVenta}
                        feedbackVenta={feedbackVenta}
                        consultaVenta={consultaVentaActiva()}
                      />
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyState}>Sin recomendacion disponible.</p>
                )}

                {lecturaActual && (
                  <div className={styles.salesNote}>
                    {lecturaActual.lectura && <p className={styles.salesNoteText}>{lecturaActual.lectura}</p>}
                    <p className={styles.salesNoteText} style={{ marginTop: lecturaActual.lectura ? 8 : 0 }}>{lecturaActual.frase}</p>
                    <div className={styles.noteGrid}>
                      {[
                        { label: 'Lectura', items: lecturaActual.rasgos },
                        { label: 'Buscar', items: lecturaActual.buscar },
                        { label: 'Evitar', items: lecturaActual.evitar },
                      ].filter(bloque => bloque.items.length > 0).map(bloque => (
                        <div key={bloque.label} className={styles.noteColumn}>
                          <p className={styles.noteLabel}>{bloque.label}</p>
                          <p className={styles.noteItems}>{bloque.items.join(' · ')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </section>
        ) : (
          <section className={styles.bodegaPanel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.eyebrow}>Bodega</p>
                <h2 className={styles.panelTitle}>{vinosFiltrados.length} referencias</h2>
              </div>
            </div>
            <div className={styles.bodegaControls}>
              <input
                type="text"
                placeholder="Buscar vino, bodega, uva, region"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className={styles.field}
              />
              <div className={styles.typeFilters}>
                {tipos.map(t => (
                  <button key={t} type="button" onClick={() => { setFiltro(t); setTipoVinoAbierto(t === 'todos' ? null : t) }}
                    className={`${styles.chip} ${filtro === t ? styles.chipActive : ''}`}>
                    {t === 'todos' ? 'Todos' : tipoLabel[t]}
                  </button>
                ))}
              </div>
            </div>

            {busqueda.length > 1 ? (
              vinosFiltrados.length === 0 ? (
                <p className={styles.emptyState}>Sin resultados para &quot;{busqueda}&quot;</p>
              ) : (
                <div>
                  {vinosFiltrados.map(v => (
                    <VinoRow key={v.id} v={v} tipoDot={tipoDot} tipoLabel={tipoLabel} enComparador={!!vinosComparador.find(vc => vc.id === v.id)} onSelect={setVinoSeleccionado} onComparador={toggleComparador} comparadorLleno={vinosComparador.length >= 4} />
                  ))}
                </div>
              )
            ) : (
              ['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja'].map(tipo => {
                const grupo = vinosFiltrados.filter(v => v.tipo === tipo)
                if (!grupo.length) return null
                const abierto = filtro !== 'todos' || tipoVinoAbierto === tipo
                return (
                  <div key={tipo} className={styles.wineSection}>
                    <button type="button" className={styles.wineSectionButton} onClick={() => setTipoVinoAbierto(abierto ? null : tipo)}>
                      <span>{tipoPlural[tipo]}</span>
                      <small>{grupo.length} referencias · {abierto ? 'Cerrar' : 'Abrir'}</small>
                    </button>
                    {abierto && grupo.map(v => (
                        <VinoRow key={v.id} v={v} tipoDot={tipoDot} tipoLabel={tipoLabel} enComparador={!!vinosComparador.find(vc => vc.id === v.id)} onSelect={setVinoSeleccionado} onComparador={toggleComparador} comparadorLleno={vinosComparador.length >= 4} />
                      ))}
                  </div>
                )
              })
            )}
          </section>
        )}
      </main>

      {vinosComparador.length > 0 && (
        <div className={styles.compareBar}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 750 }}>{vinosComparador.length} vinos · Comparar</p>
          <button type="button" onClick={() => { setMostrarComparador(true); cargarPerfiles(vinosComparador) }} className={styles.primaryButton}>
            Comparar
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#111', fontFamily: 'system-ui, sans-serif', paddingBottom: vinosComparador.length > 0 ? 80 : 0 }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #222' }}>
        <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>Modo camarero · {restaurante?.nombre}{demoActivo ? ' · Demo' : ''}</p>
        {demoActivo && (
          <div style={{ background: '#fff', color: '#111', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>Demo lista para grabar</p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#555' }}>Muestra la ficha de venta, pulsa Otras opciones compatibles y cambia a Rotar stock.</p>
          </div>
        )}
        <input type="text" placeholder="Buscar vino, bodega, uva, región..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} autoFocus
          style={{ width: '100%', padding: '10px 0', fontSize: 16, border: 'none', borderBottom: '1px solid #333', background: 'transparent', color: 'white', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
        />
        {/* Filtros por tipo */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {tipos.map(t => (
            <button key={t} onClick={() => { setFiltro(t); setTipoVinoAbierto(t === 'todos' ? null : t) }} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer', border: 'none',
              background: filtro === t ? '#fff' : '#222',
              color: filtro === t ? '#111' : '#666',
              letterSpacing: '0.05em'
            }}>
              {t === 'todos' ? 'Todos' : tipoLabel[t]}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#444', margin: '10px 0 0' }}>{vinosFiltrados.length} referencias</p>
      </div>

      {/* Venta asistida */}
      <div style={{ padding: '16px 20px 18px', borderBottom: '1px solid #222', background: '#151515' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 4px' }}>Venta rapida</p>
            <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>
              {platosMesaVenta.length > 1 ? `Botella puente para ${platosMesaVenta.length} platos` : 'Recomendacion para defender en mesa'}
            </p>
          </div>
          <select value={objetivoVenta} onChange={e => cambiarObjetivoVenta(e.target.value)}
            style={{ background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none' }}>
            <option value="equilibrado">Equilibrado</option>
            <option value="copas">Por copas</option>
            <option value="ticket">Subir ticket</option>
            <option value="rotar">Rotar stock</option>
            <option value="local">Vino local</option>
          </select>
        </div>

        <button onClick={() => setRotacionVenta(rotacionVenta + 1)}
          style={{ width: '100%', background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 10, padding: '9px 12px', fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>
          Otras opciones compatibles
        </button>

        <input type="text" placeholder="Ej. ensaladilla rusa, codillo al Pedro Ximenez, queso curado..."
          value={consultaVenta} onChange={e => cambiarConsultaVenta(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #333', background: '#111', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box', marginBottom: 10 }}
        />

        {platosMesaVenta.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>Mesa seleccionada</p>
              <button onClick={() => { setPlatosMesaVenta([]); setConsultaVenta(''); setRotacionVenta(0) }}
                style={{ background: 'transparent', color: '#666', border: 'none', fontSize: 11, cursor: 'pointer' }}>
                Limpiar
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {platosMesaVenta.map(plato => (
                <button key={plato.id} onClick={() => alternarPlatoMesa(plato)}
                  style={{ background: '#fff', color: '#111', border: 'none', borderRadius: 20, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}>
                  {plato.nombre} ×
                </button>
              ))}
            </div>
          </div>
        )}

        {(ticketActualVenta > 0 || platosMesaVenta.length > 1) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 10 }}>
            <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Ticket comida</p>
              <p style={{ fontSize: 18, color: '#fff', margin: 0, fontWeight: 600 }}>{ticketActualVenta.toFixed(2)} EUR</p>
            </div>
            <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 4px' }}>Botella logica</p>
              <p style={{ fontSize: 18, color: '#fff', margin: 0, fontWeight: 600 }}>{rangoActualVenta.min.toFixed(0)}-{rangoActualVenta.max.toFixed(0)} EUR</p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginBottom: recomendacionesVenta.length ? 12 : 0 }}>
          {['Aperitivo', 'Pescado', 'Carne', 'Queso', 'Fritura', 'Fresco', 'Premium'].map(atajo => (
            <button key={atajo} onClick={() => cambiarConsultaVenta(atajo)}
              style={{ flexShrink: 0, background: normalizar(consultaVenta) === normalizar(atajo) ? '#fff' : '#222', color: normalizar(consultaVenta) === normalizar(atajo) ? '#111' : '#777', border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>
              {atajo}
            </button>
          ))}
        </div>

        {platosVenta.length > 0 && (
          <div style={{ marginBottom: recomendacionesVenta.length ? 12 : 0 }}>
            <button onClick={() => setMostrarPlatosVenta(!mostrarPlatosVenta)}
              style={{ width: '100%', background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 10, padding: '9px 12px', fontSize: 12, cursor: 'pointer', marginBottom: mostrarPlatosVenta ? 10 : 0 }}>
              {mostrarPlatosVenta ? 'Ocultar platos' : `Mostrar platos de la carta (${platosVenta.length})`}
            </button>
            {mostrarPlatosVenta && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {platosVenta.map(plato => {
                  return (
                    <button key={plato.id} onClick={() => alternarPlatoMesa(plato)}
                      style={{ flexShrink: 0, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: platosMesaVenta.some(p => p.id === plato.id) ? '#fff' : '#222', color: platosMesaVenta.some(p => p.id === plato.id) ? '#111' : '#888', border: 'none', borderRadius: 20, padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>
                      {platosMesaVenta.some(p => p.id === plato.id) ? '✓ ' : ''}{plato.nombre}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {lecturaActual && (
          <div style={{ background: '#111', border: '1px solid #2a2a2a', borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <p style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 10px' }}>Ficha de venta</p>
            {lecturaActual.lectura && (
              <p style={{ fontSize: 12, color: '#888', lineHeight: 1.55, margin: '0 0 8px' }}>{lecturaActual.lectura}</p>
            )}
            <p style={{ fontSize: 13, color: '#ddd', lineHeight: 1.55, margin: '0 0 12px' }}>{lecturaActual.frase}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {[
                { label: 'Lectura', items: lecturaActual.rasgos },
                { label: 'Buscar', items: lecturaActual.buscar },
                { label: 'Evitar', items: lecturaActual.evitar },
              ].filter(bloque => bloque.items.length > 0).map(bloque => (
                <div key={bloque.label}>
                  <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>{bloque.label}</p>
                  <p style={{ fontSize: 12, color: '#aaa', lineHeight: 1.5, margin: 0 }}>{bloque.items.join(' · ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {recomendacionesVenta.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
            {recomendacionesVenta.map(item => (
              <RecomendacionVenta
                key={item.label}
                item={item}
                tipoDot={tipoDot}
                tipoLabel={tipoLabel}
                fraseVenta={fraseVenta}
                onSelect={setVinoSeleccionado}
                onFeedback={registrarFeedbackVenta}
                feedbackVenta={feedbackVenta}
                consultaVenta={consultaVentaActiva()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lista vinos */}
      <div>
        {busqueda.length > 1 ? (
          vinosFiltrados.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#444', fontSize: 14, padding: '40px 20px' }}>Sin resultados para &quot;{busqueda}&quot;</p>
          ) : (
            vinosFiltrados.map(v => (
              <VinoRow key={v.id} v={v} tipoDot={tipoDot} tipoLabel={tipoLabel} enComparador={!!vinosComparador.find(vc => vc.id === v.id)} onSelect={setVinoSeleccionado} onComparador={toggleComparador} comparadorLleno={vinosComparador.length >= 4} />
            ))
          )
        ) : (
          ['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja'].map(tipo => {
            const grupo = vinosFiltrados.filter(v => v.tipo === tipo)
            if (!grupo.length) return null
            const abierto = filtro !== 'todos' || tipoVinoAbierto === tipo
            return (
              <div key={tipo}>
                <button onClick={() => setTipoVinoAbierto(abierto ? null : tipo)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#151515', color: '#aaa', border: 'none', borderTop: '1px solid #242424', padding: '15px 20px', cursor: 'pointer' }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{tipoPlural[tipo]}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>{grupo.length} · {abierto ? 'Cerrar' : 'Abrir'}</span>
                </button>
                {abierto && grupo.map(v => (
                    <VinoRow key={v.id} v={v} tipoDot={tipoDot} tipoLabel={tipoLabel} enComparador={!!vinosComparador.find(vc => vc.id === v.id)} onSelect={setVinoSeleccionado} onComparador={toggleComparador} comparadorLleno={vinosComparador.length >= 4} />
                  ))}
              </div>
            )
          })
        )}
      </div>

      {/* Barra comparador */}
      {vinosComparador.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1a1a1a', borderTop: '1px solid #333', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#fff', fontWeight: 500 }}>{vinosComparador.length} vinos · Comparar</p>
          <button onClick={() => { setMostrarComparador(true); cargarPerfiles(vinosComparador) }}
            style={{ background: '#fff', color: '#111', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Comparar →
          </button>
        </div>
      )}
    </div>
  )
}

function RecomendacionVenta({ item, tipoDot, tipoLabel, fraseVenta, onSelect, onFeedback, feedbackVenta, consultaVenta }) {
  const { vino, label, motivo, fuente, aprendizaje, rangoTicket, ticketComida } = item
  const stockCritico = vino.stock > 0 && vino.stock <= 3
  const ajusteAprendido = aprendizaje && Math.abs(aprendizaje.ajuste) >= 2.5
  const precioVino = Number(vino.precio_botella) || 0
  const precioEnRango = rangoTicket && precioVino >= rangoTicket.min && precioVino <= rangoTicket.max
  const acciones = [
    { key: 'vendida', label: 'Vendida' },
    { key: 'no_convence', label: 'No convenció' },
    { key: 'otra', label: 'Pidió otra' },
  ]

  const tarjetaVentaCompacta = true
  if (tarjetaVentaCompacta) return (
    <article className={styles.recommendCard}>
      <div onClick={() => onSelect(vino)} className={styles.recommendClick}>
        <div className={styles.recommendMeta}>
          <span className={styles.tag}>
            <span className={styles.dot} style={{ background: tipoDot[vino.tipo] || '#666' }} />
            {label}
          </span>
          <span className={styles.price}>{vino.precio_botella} EUR</span>
        </div>
        <h3 className={styles.wineName}>{vino.nombre}</h3>
        <p className={styles.wineInfo}>
          {tipoLabel[vino.tipo] || 'Vino'}{vino.bodega ? ` · ${vino.bodega}` : ''}{vino.precio_copa ? ` · ${vino.precio_copa} EUR copa` : ''}
        </p>
        <p className={styles.reason}>{fraseVenta(vino, motivo, fuente)}</p>
        {ticketComida > 0 && rangoTicket && (
          <p className={styles.statusLine} style={{ color: precioEnRango ? '#1f7a61' : '#6f767d' }}>
            {precioEnRango ? 'Encaja con ticket mesa' : `Fuera de horquilla ${rangoTicket.min.toFixed(0)}-${rangoTicket.max.toFixed(0)} EUR`}
          </p>
        )}
        {stockCritico && (
          <p className={styles.statusLine} style={{ color: '#bc8c2a' }}>Ultimas {vino.stock} botellas</p>
        )}
        {ajusteAprendido && (
          <p className={styles.statusLine} style={{ color: aprendizaje.ajuste > 0 ? '#1f7a61' : '#bc8c2a' }}>
            {aprendizaje.ajuste > 0 ? 'Refuerzo por ventas reales' : 'Historial de sala con dudas'}
          </p>
        )}
      </div>

      <div className={styles.feedbackGrid}>
        {acciones.map(accion => {
          const enviado = feedbackVenta[`${vino.id}-${accion.key}-${consultaVenta}`]
          return (
            <button
              key={accion.key}
              type="button"
              onClick={() => onFeedback(vino, accion.key, label)}
              className={`${styles.feedbackButton} ${enviado ? styles.feedbackActive : ''}`}
            >
              {accion.label}
            </button>
          )
        })}
      </div>
    </article>
  )

  return (
    <div style={{ textAlign: 'left', background: '#202020', border: '1px solid #303030', borderRadius: 12, padding: 14, color: '#fff' }}>
      <div onClick={() => onSelect(vino)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[vino.tipo] || '#666', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#777', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
          </div>
          <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{vino.precio_botella} EUR</span>
        </div>
        <p style={{ margin: '0 0 4px', fontSize: 15, color: '#fff', fontWeight: 500 }}>{vino.nombre}</p>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#666' }}>
          {tipoLabel[vino.tipo] || 'Vino'}{vino.bodega ? ` · ${vino.bodega}` : ''}{vino.precio_copa ? ` · ${vino.precio_copa} EUR copa` : ''}
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#aaa', lineHeight: 1.55 }}>{fraseVenta(vino, motivo, fuente)}</p>
        {ticketComida > 0 && rangoTicket && (
          <p style={{ margin: '10px 0 0', fontSize: 10, color: precioEnRango ? '#7BAF8A' : '#777', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {precioEnRango ? 'Encaja con ticket mesa' : `Fuera de horquilla ${rangoTicket.min.toFixed(0)}-${rangoTicket.max.toFixed(0)} EUR`}
          </p>
        )}
        {stockCritico && (
          <p style={{ margin: '10px 0 0', fontSize: 10, color: '#C4A55A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ultimas {vino.stock} botellas</p>
        )}
        {ajusteAprendido && (
          <p style={{ margin: '10px 0 0', fontSize: 10, color: aprendizaje.ajuste > 0 ? '#7BAF8A' : '#C4A55A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {aprendizaje.ajuste > 0 ? 'Refuerzo por ventas reales' : 'Historial de sala con dudas'}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
        {acciones.map(accion => {
          const enviado = feedbackVenta[`${vino.id}-${accion.key}-${consultaVenta}`]
          return (
            <button
              key={accion.key}
              type="button"
              onClick={() => onFeedback(vino, accion.key, label)}
              style={{
                minHeight: 32,
                background: enviado ? '#fff' : '#262626',
                color: enviado ? '#111' : '#777',
                border: enviado ? '1px solid #fff' : '1px solid #333',
                borderRadius: 8,
                padding: '6px 4px',
                fontSize: 10,
                cursor: 'pointer'
              }}
            >
              {enviado ? '✓ ' : ''}{accion.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function VinoRow({ v, tipoDot, tipoLabel, enComparador, onSelect, onComparador, comparadorLleno }) {
  const stockColor = v.stock === 0 ? '#c07070' : v.stock <= 3 ? '#C4A55A' : '#555'
  const stockLabel = v.stock === 0 ? 'Sin stock' : v.stock <= 3 ? `${v.stock} bot.` : null

  const filaBodegaCompacta = true
  if (filaBodegaCompacta) return (
    <div className={`${styles.wineRow} ${enComparador ? styles.wineRowSelected : ''}`}>
      <div onClick={() => onSelect(v)} className={styles.wineRowMain}>
        <span className={styles.dot} style={{ background: tipoDot[v.tipo] || '#444' }} />
        <div className={styles.wineRowText}>
          <p className={styles.wineRowName}>{v.nombre}</p>
          <p className={styles.wineRowDetail}>
            {tipoLabel[v.tipo] || 'Vino'}{v.bodega ? ` · ${v.bodega}` : ''}{v.region ? ` · ${v.region}` : ''}{stockLabel ? ` · ${stockLabel}` : ''}
          </p>
        </div>
        <div className={styles.wineRowPrice}>
          <p style={{ color: '#17191d', fontSize: 14, fontWeight: 800 }}>{v.precio_botella} EUR</p>
          {v.precio_copa && <p style={{ color: '#7b8288', fontSize: 11 }}>{v.precio_copa} EUR copa</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onComparador(v)}
        className={`${styles.compareButton} ${enComparador ? styles.compareActive : ''}`}
        disabled={comparadorLleno && !enComparador}
      >
        {enComparador ? '−' : '+'}
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid #1a1a1a', background: enComparador ? '#1a1a1a' : 'transparent' }}>
      <div onClick={() => onSelect(v)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[v.tipo] || '#444', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 15, color: 'white' }}>{v.nombre}</p>
            {stockLabel && <span style={{ fontSize: 10, color: stockColor, border: `1px solid ${stockColor}`, padding: '1px 6px', borderRadius: 4 }}>{stockLabel}</span>}
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>{v.bodega}{v.region ? ` · ${v.region}` : ''}{v.anada ? ` · ${v.anada}` : ''}</p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'white' }}>{v.precio_botella} €</p>
          {v.precio_copa && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#555' }}>{v.precio_copa} € copa</p>}
        </div>
      </div>
      <button onClick={() => onComparador(v)}
        style={{ width: 30, height: 30, borderRadius: 6, border: 'none', cursor: comparadorLleno && !enComparador ? 'not-allowed' : 'pointer',
          background: enComparador ? '#fff' : '#222', color: enComparador ? '#111' : '#555',
          fontSize: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {enComparador ? '✓' : '+'}
      </button>
    </div>
  )
}
