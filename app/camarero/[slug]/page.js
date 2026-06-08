'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { chartierKb, fuenteChartier } from '../../lib/chartierKb'
import { buscarPlatoKb } from '../../data/platos_kb'
import { criteriosEstructurales } from '../../lib/maridajeEngine'
import { nombrePlan, puedeUsar } from '../../lib/plans'
import { bonusChartierFamilias } from '../../data/chartierFamilias'
import styles from './camarero.module.css'

const PERFIL_CLIENTE_NEUTRO = { bebe: 'ninguno', estilo: 'ninguno', gama: 'auto' }

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
  const [salaToken, setSalaToken] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [vinosComparador, setVinosComparador] = useState([])
  const [mostrarComparador, setMostrarComparador] = useState(false)
  const [perfiles, setPerfiles] = useState({})
  const [cargandoPerfiles, setCargandoPerfiles] = useState(false)
  const [consultaVenta, setConsultaVenta] = useState('')
  const [platosMesaVenta, setPlatosMesaVenta] = useState([])
  const [objetivoVenta, setObjetivoVenta] = useState('equilibrado')
  const [perfilClienteVenta, setPerfilClienteVenta] = useState(PERFIL_CLIENTE_NEUTRO)
  const [modoRecomendacionVenta, setModoRecomendacionVenta] = useState('platos')
  const [mostrarAfinadoCliente, setMostrarAfinadoCliente] = useState(false)
  const [rotacionVenta, setRotacionVenta] = useState(0)
  const [demoActivo, setDemoActivo] = useState(false)
  const [feedbackVenta, setFeedbackVenta] = useState({})
  const [historialVenta, setHistorialVenta] = useState([])
  const [historialRecomendaciones, setHistorialRecomendaciones] = useState([])
  const [vistaServicio, setVistaServicio] = useState('venta')
  const [busquedaPlatoVenta, setBusquedaPlatoVenta] = useState('')
  const [categoriaPlatoVenta, setCategoriaPlatoVenta] = useState('todos')
  const [mostrarPlatosVenta, setMostrarPlatosVenta] = useState(false)
  const [tipoVinoAbierto, setTipoVinoAbierto] = useState(null)
  const [grafoVenta, setGrafoVenta] = useState(null)
  const [cantidadRapida, setCantidadRapida] = useState(1)
  const [mensajeServicio, setMensajeServicio] = useState('')
  const ultimaRecomendacionRegistrada = useRef('')

  const tipoDot = { tinto: '#7B2D2D', blanco: '#C4A55A', rosado: '#C47A8A', espumoso: '#4A8C6F', generoso: '#854F0B', dulce: '#993556', naranja: '#D85A30', sin_alcohol: '#7B9E87' }
  const tipoLabel = { tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso', generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol' }
  const tipoPlural = { tinto: 'Tintos', blanco: 'Blancos', rosado: 'Rosados', espumoso: 'Espumosos', generoso: 'Generosos', dulce: 'Dulces', naranja: 'Naranjas', sin_alcohol: 'Sin alcohol' }
  const preguntasClienteVenta = {
    bebe: [
      { id: 'indiferente', label: 'No lo tiene claro' },
      { id: 'blanco', label: 'Blanco / fresco' },
      { id: 'tinto_suave', label: 'Tinto suave' },
      { id: 'tinto_cuerpo', label: 'Tinto con cuerpo' },
      { id: 'burbuja', label: 'Burbuja' },
      { id: 'generoso', label: 'Generoso' },
    ],
    estilo: [
      { id: 'facil', label: 'Facil de beber' },
      { id: 'fresco', label: 'Fresco' },
      { id: 'clasico', label: 'Clasico' },
      { id: 'local', label: 'De la zona' },
      { id: 'especial', label: 'Algo especial' },
    ],
  }
  const coloresVino = ['#7B2D2D', '#C4A55A', '#534AB7', '#4A8C6F']
  const ejes = ['dulzor', 'acidez', 'taninos', 'alcohol', 'cuerpo', 'intensidad', 'final']
  const etiquetas = { dulzor: 'Dulzor', acidez: 'Acidez', taninos: 'Taninos', alcohol: 'Alcohol', cuerpo: 'Cuerpo', intensidad: 'Intensidad', final: 'Final' }
  const chartierBusqueda = (chartierKb || []).map(capitulo => ({
    capitulo,
    textoBusqueda: normalizar([
      capitulo.id,
      capitulo.title,
      textoPlano(capitulo.foods),
      textoPlano(capitulo.foods_chartier_explicitly_named),
      textoPlano(capitulo.pairings?.map(p => p.dish)),
      textoPlano(capitulo.explicit_pairings_in_chapter?.map(p => p.dish_chartier)),
    ].join(' ')),
    terminosVino: terminosVinoDesdeCapitulo(capitulo),
    tipos: tiposInferidosDesdeCapitulo(capitulo),
  }))

  useEffect(() => {
    async function cargar() {
      const esDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'
      const slug = (await params).slug
      const res = await fetch(`/api/public/restaurante/${encodeURIComponent(slug)}`)
      const data = res.ok ? await res.json() : {}
      const rest = data.restaurante
      if (rest) {
        setRestaurante(rest)
        const objetivoGuardado = typeof window !== 'undefined' ? window.localStorage.getItem(`cartavinos_objetivo_${rest.id}`) : null
        const mapaObjetivo = { vender_copas: 'copas', subir_ticket: 'ticket', rotar_stock: 'rotar', vino_local: 'local' }
        if (objetivoGuardado && mapaObjetivo[objetivoGuardado]) setObjetivoVenta(mapaObjetivo[objetivoGuardado])
        if (esDemo) {
          setDemoActivo(true)
        }
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function comprobarPin() {
    if (!restaurante?.id) return
    await iniciarSesionSala(restaurante, pin)
  }

  async function iniciarSesionSala(rest, pinIntroducido, demo = false) {
    const res = await fetch('/api/camarero/sesion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurante_id: rest.id, pin: pinIntroducido, demo }),
    })
    if (!res.ok) {
      setErrorPin(true)
      return
    }
    const data = await res.json()
    setSalaToken(data.sala_token)
    setAutenticado(true)
    setErrorPin(false)
    await Promise.all([
      cargarDatosSala(rest, data.sala_token, demo),
      cargarHistorialSala(rest.id, data.sala_token),
    ])
  }

  async function cargarDatosSala(rest, token, demo = false) {
    const res = await fetch('/api/camarero/datos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurante_id: rest.id, sala_token: token }),
    })
    if (!res.ok) return
    const data = await res.json()
    setRestaurante({ ...rest, ...data.restaurante })
    setVinos(data.vinos || [])
    setPlatos(data.platos || [])
    if (demo && data.platos?.length) {
      const platoDemo = data.platos.find(plato => plato.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('codillo')) || data.platos[0]
      setConsultaVenta(`${platoDemo.nombre}${platoDemo.precio ? ` (${platoDemo.precio} EUR)` : ''}${platoDemo.descripcion ? `: ${platoDemo.descripcion}` : ''}`)
      setPlatosMesaVenta([platoDemo])
      setRotacionVenta(0)
    }
  }

  async function cargarHistorialSala(restauranteId, token) {
    if (!restauranteId) return
    const query = new URLSearchParams({ restaurante_id: restauranteId })
    const res = await fetch(`/api/estadisticas?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    setHistorialVenta((data.ventas || []).map(item => {
      try { return JSON.parse(item.detalle || '{}') } catch { return null }
    }).filter(Boolean))
    setHistorialRecomendaciones((data.recomendaciones || []).map(item => {
      try { return JSON.parse(item.detalle || '{}') } catch { return null }
    }).filter(Boolean))
  }

  useEffect(() => {
    if (demoActivo && restaurante?.id && !autenticado) {
      iniciarSesionSala(restaurante, '', true)
    }
  }, [demoActivo, restaurante, autenticado])

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
            body: JSON.stringify({ nombre: v.nombre, tipo: v.tipo, region: v.region, uva: v.uva, anada: v.anada, restaurante_id: restaurante.id })
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

  async function registrarFeedbackVenta(vino, resultado, label, cantidad = 1) {
    if (!restaurante || !vino) return

    const consultaActiva = consultaVentaActiva()
    const clave = `${vino.id}-${resultado}-${consultaActiva}`
    setFeedbackVenta(prev => ({ ...prev, [clave]: true }))
    const cantidadNormalizada = Math.max(1, Number(cantidad) || 1)

    const detalle = JSON.stringify({
      resultado,
      vino_id: vino.id,
      vino: vino.nombre,
      plato: consultaActiva,
      objetivo: objetivoVenta,
      posicion: label,
      cantidad: cantidadNormalizada,
    })

    const res = await fetch('/api/estadisticas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sala_token: salaToken,
        eventos: [{ restaurante_id: restaurante.id, tipo: 'venta', detalle }],
      }),
    })

    if (!res.ok) {
      setFeedbackVenta(prev => ({ ...prev, [clave]: false }))
      setMensajeServicio('No se pudo guardar. Reintenta en un momento.')
      setTimeout(() => setMensajeServicio(''), 2200)
    } else {
      setHistorialVenta(prev => [{ resultado, vino_id: vino.id, vino: vino.nombre, plato: consultaActiva, objetivo: objetivoVenta, posicion: label, cantidad: cantidadNormalizada }, ...prev].slice(0, 300))
      const textoResultado = {
        vendida: 'Venta marcada',
        no_convence: 'Duda marcada',
        otra: 'Cambio marcado',
        no_stock: 'Falta de stock marcada',
        agotado: 'Agotado marcado',
      }[resultado] || 'Señal guardada'
      setMensajeServicio(`${textoResultado}: ${vino.nombre}`)
      setTimeout(() => setMensajeServicio(''), 2200)
    }
  }

  function normalizar(texto) {
    return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  function incluyeTerminoCompleto(texto, termino) {
    const textoDelimitado = ` ${normalizar(texto).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `
    const terminoDelimitado = normalizar(termino).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
    return terminoDelimitado && textoDelimitado.includes(` ${terminoDelimitado} `)
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

    const pairings = textoPlano([
      ...(capitulo.explicit_pairings_in_chapter || []).map(p => p.wine_chartier),
      ...(capitulo.pairings || []).map(p => p.wine),
    ])
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
    if (esJamonCurado(consultaNormalizada)) return 'aperitivo'
    if (consultaNormalizada.includes('queso')) return 'queso'
    if (consultaNormalizada.includes('fritura') || consultaNormalizada.includes('frito') || consultaNormalizada.includes('croqueta')) return 'fritura'
    if (consultaNormalizada.includes('aperitivo') || consultaNormalizada.includes('entrante') || consultaNormalizada.includes('compartir')) return 'aperitivo'
    if (consultaNormalizada.includes('carne') || consultaNormalizada.includes('rabo') || consultaNormalizada.includes('codillo') || consultaNormalizada.includes('cordero')) return 'carne'
    if (consultaNormalizada.includes('pescado') || consultaNormalizada.includes('marisco') || consultaNormalizada.includes('gamba') || consultaNormalizada.includes('lubina') || consultaNormalizada.includes('salmon') || consultaNormalizada.includes('bacalao') || consultaNormalizada.includes('chipiron')) return 'pescado'
    if (consultaNormalizada.includes('picante') || consultaNormalizada.includes('curry')) return 'picante'
    return 'general'
  }

  function esJamonCurado(consultaNormalizada) {
    return ['jamon', 'serrano', 'prosciutto', 'paleta iberica', 'paleta de bellota'].some(t => consultaNormalizada.includes(t))
  }

  function esVinoDulceOSemidulce(vino, textoVino = '') {
    return vino.tipo === 'dulce' || ['semidulce', 'semi dulce', 'dulce', 'vendimia tardia', 'late harvest'].some(t => textoVino.includes(t))
  }

  function esBlancoLigeroDeUsoEstrecho(vino, textoVino = '') {
    return vino.tipo === 'blanco' && ['verdejo', 'rueda'].some(t => textoVino.includes(t))
  }

  function esGenerosoSeco(vino, textoVino = '') {
    return vino.tipo === 'generoso' || ['fino', 'manzanilla', 'amontillado', 'palo cortado', 'jerez'].some(t => textoVino.includes(t))
  }

  function esEspumosoSeco(vino, textoVino = '') {
    return vino.tipo === 'espumoso' || ['espumoso', 'cava', 'champagne', 'corpinnat', 'cremant', 'prosecco', 'brut', 'ancestral', 'pet nat'].some(t => textoVino.includes(t))
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
    if (esJamonCurado(texto)) {
      rasgos.push('sal', 'grasa', 'curacion', 'umami')
      buscar.push('fino o manzanilla', 'burbuja seca', 'blanco salino')
      evitar.push('tinto con tanino', 'madera dominante')
    }
    if (contexto === 'fritura' || metodo.frito) {
      rasgos.push('grasa', 'crujiente', 'sal')
      buscar.push('acidez', 'salinidad', 'burbuja o generoso seco')
      evitar.push('tintos potentes', 'vinos dulces')
    }
    if (contexto === 'pescado') {
      rasgos.push('proteína de mar')
      buscar.push('frescura', 'acidez', 'perfil salino')
      evitar.push('tanino marcado')
    }
    if (contexto === 'carne') {
      rasgos.push('intensidad', metodo.brasa ? 'tostado/brasa' : 'sabor cárnico')
      buscar.push(metodo.brasa ? 'estructura y notas tostadas' : 'fruta, cuerpo y buena acidez')
      evitar.push('vinos demasiado ligeros si el plato es intenso')
    }
    if (metodo.gratinado) {
      rasgos.push('grasa/lacteo')
      buscar.push('acidez para limpiar', 'volumen si hay crema o alioli')
    }
    if (metodo.vegetalVerde) {
      rasgos.push('vegetal verde')
      buscar.push('perfil vegetal o cítrico')
      evitar.push('madera dominante')
    }
    if (metodo.picante) {
      rasgos.push('picante')
      buscar.push('alcohol moderado', 'frescura', 'ligero dulzor si procede')
      evitar.push('alcohol alto y tanino')
    }
    if (metodo.setasTrufa) {
      rasgos.push('terroso')
      buscar.push('evolución, umami o textura')
    }
    if (metodo.dulce) {
      rasgos.push('dulzor/reducción')
      buscar.push('volumen', 'oxidación controlada o dulzor compatible')
    }

    const frase = contexto === 'queso'
      ? 'Aquí no vendería tinto por defecto: primero miraría textura, curación y acompañamiento.'
      : contexto === 'pescado' && metodo.vegetalVerde
        ? 'Lo vendería desde la frescura: el vino debe acompañar la grasa del pescado sin pelearse con el vegetal.'
        : contexto === 'fritura' || metodo.frito
          ? 'Lo vendería desde la limpieza: algo que corte grasa y deje la boca lista para otro bocado.'
          : contexto === 'carne'
            ? 'Lo vendería desde la intensidad del plato y, si hay brasa, desde la afinidad con notas tostadas.'
            : 'Lo vendería buscando afinidad aromática con el ingrediente dominante y la salsa.'

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

  function cambiarModoRecomendacionVenta(modo) {
    if (modo === modoRecomendacionVenta) return
    setModoRecomendacionVenta(modo)
    setPerfilClienteVenta(PERFIL_CLIENTE_NEUTRO)
    setConsultaVenta('')
    setPlatosMesaVenta([])
    setMostrarAfinadoCliente(false)
    setRotacionVenta(0)
  }

  function cambiarPerfilClienteVenta(campo, valor) {
    const siguientePerfil = { ...perfilClienteVenta, [campo]: valor }
    setPerfilClienteVenta(siguientePerfil)
    if (!platosMesaVenta.length) {
      setConsultaVenta(consultaDesdePerfilCliente(siguientePerfil))
    }
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
    if (normalizar(consultaVenta).length > 1) return consultaVenta
      .split(',')
      .map(parte => parte.trim())
      .filter(Boolean)
    return [consultaDesdePerfilCliente()]
  }

  function hayConsultaVenta() {
    return platosMesaVenta.length > 0 || normalizar(consultaVenta).length > 1 || tienePerfilClienteActivo()
  }

  function tienePerfilClienteActivo() {
    return perfilClienteVenta.bebe !== 'ninguno' || perfilClienteVenta.estilo !== 'ninguno' || perfilClienteVenta.gama !== 'auto'
  }

  function consultaDesdePerfilCliente(perfil = perfilClienteVenta) {
    const bebe = preguntasClienteVenta.bebe.find(opcion => opcion.id === perfil.bebe)?.label
    const estilo = preguntasClienteVenta.estilo.find(opcion => opcion.id === perfil.estilo)?.label
    const gama = gamasVenta().find(opcion => opcion.id === perfil.gama)?.label
    return [
      perfil.bebe === 'indiferente' ? 'cliente no tiene una preferencia clara de vino' : bebe ? `cliente suele beber ${bebe}` : '',
      estilo ? `busca ${estilo}` : '',
      gama && perfil.gama !== 'auto' ? `gama ${gama}` : '',
    ].filter(Boolean).join(', ')
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

  function ticketReferenciaVenta() {
    const ticketConfigurado = Number(restaurante?.ticket_medio || restaurante?.ticket_medio_comida || restaurante?.ticket_comida) || 0
    if (ticketConfigurado > 0) return { valor: ticketConfigurado, fuente: 'configurado' }
    if (ticketMesaVenta() > 0) return { valor: ticketMesaVenta(), fuente: 'mesa' }
    const platosConPrecio = platosVenta.filter(plato => Number(plato.precio) > 0)
    if (platosConPrecio.length) {
      const mediaPlato = platosConPrecio.reduce((sum, plato) => sum + Number(plato.precio), 0) / platosConPrecio.length
      return { valor: Math.round(mediaPlato * 2.5), fuente: 'estimado' }
    }
    const vinosConPrecio = vinos.filter(vino => vino?.activo !== false && vino?.stock !== 0 && precioBotella(vino) > 0)
    const precioMedioCarta = vinosConPrecio.length
      ? vinosConPrecio.reduce((sum, vino) => sum + precioBotella(vino), 0) / vinosConPrecio.length
      : 30
    return { valor: Math.max(40, precioMedioCarta / 0.75), fuente: 'carta' }
  }

  function gamasVenta() {
    const ticket = ticketReferenciaVenta().valor
    const tBaja = Math.max(22, ticket * 0.60)
    const tMedia = Math.max(tBaja + 10, ticket * 1.05)
    const tAlta = Math.max(tMedia + 14, ticket * 1.65)
    const tMuyAlta = Math.max(tAlta + 24, ticket * 2.50)
    const rangos = [
      { id: 'auto', label: 'Sin limite', min: 0, max: Infinity, helper: 'sin filtro' },
      { id: 'baja', label: 'Baja', min: 0, max: tBaja },
      { id: 'media', label: 'Media', min: tBaja, max: tMedia },
      { id: 'alta', label: 'Alta', min: tMedia, max: tAlta },
      { id: 'muy_alta', label: 'Muy alta', min: tAlta, max: tMuyAlta },
      { id: 'premium', label: 'Premium', min: tMuyAlta, max: Infinity },
    ]

    return rangos.map(gama => ({
      ...gama,
      helper: gama.helper || (gama.max === Infinity
        ? `desde ${Math.round(gama.min)} EUR`
        : gama.min === 0
          ? `hasta ${Math.round(gama.max)} EUR`
          : `${Math.round(gama.min)}-${Math.round(gama.max)} EUR`),
    }))
  }

  function gamaActivaVenta() {
    return gamasVenta().find(gama => gama.id === perfilClienteVenta.gama) || gamasVenta()[0]
  }

  function precioMedioVinosVenta() {
    const disponibles = vinos.filter(vino => esVinoElegibleParaObjetivo(vino, { ignorarGama: true }))
    if (!disponibles.length) return 28
    return disponibles.reduce((sum, vino) => sum + precioBotella(vino), 0) / disponibles.length
  }

  function esVinoElegibleParaObjetivo(vino, opciones = {}) {
    if (vino.activo === false || vino.stock === 0 || precioBotella(vino) <= 0) return false
    if ((objetivoVenta === 'copas' || objetivoVenta === 'sucesion_copas') && !(Number(vino.precio_copa) > 0)) return false
    if (objetivoVenta === 'local' && !esVinoDeZona(vino)) return false
    if (!opciones.ignorarGama && !encajaEnGamaCliente(vino)) return false
    return true
  }

  function encajaEnGamaCliente(vino) {
    if (perfilClienteVenta.gama === 'auto') return true
    const gama = gamaActivaVenta()
    const precio = precioBotella(vino)
    return gama.max === Infinity ? precio >= gama.min : precio >= gama.min && precio < gama.max
  }

  function encajaEnPreferenciaCliente(vino) {
    let encaja = true
    if (perfilClienteVenta.bebe === 'blanco') encaja = encaja && ['blanco', 'rosado', 'espumoso'].includes(vino.tipo)
    if (perfilClienteVenta.bebe === 'burbuja') encaja = encaja && vino.tipo === 'espumoso'
    if (perfilClienteVenta.bebe === 'generoso') encaja = encaja && vino.tipo === 'generoso'
    if (perfilClienteVenta.bebe === 'tinto_suave') encaja = encaja && vino.tipo === 'tinto'
    if (perfilClienteVenta.bebe === 'tinto_cuerpo') encaja = encaja && vino.tipo === 'tinto'
    if (perfilClienteVenta.estilo === 'local') encaja = encaja && esVinoDeZona(vino)
    return encaja
  }

  function ajustePreferenciasCliente(vino) {
    const textoVino = normalizar(`${vino.nombre || ''} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
    let score = 0
    const motivos = []

    if (perfilClienteVenta.bebe === 'blanco') {
      if (['blanco', 'rosado', 'espumoso'].includes(vino.tipo)) score += 10
      if (['tinto', 'generoso', 'dulce'].includes(vino.tipo)) score -= 5
      motivos.push('va hacia un perfil fresco y facil')
    }
    if (perfilClienteVenta.bebe === 'tinto_suave') {
      if (vino.tipo === 'tinto') score += 8
      if (['garnacha', 'pinot', 'mencia', 'joven', 'suave', 'fresco'].some(t => textoVino.includes(t))) score += 5
      if (['crianza', 'reserva', 'potente', 'madera', 'tanino'].some(t => textoVino.includes(t))) score -= 4
      motivos.push('mantiene el tinto en una zona amable')
    }
    if (perfilClienteVenta.bebe === 'tinto_cuerpo') {
      if (vino.tipo === 'tinto') score += 10
      if (['cuerpo', 'estructura', 'crianza', 'reserva', 'syrah', 'cabernet', 'monastrell'].some(t => textoVino.includes(t))) score += 4
      motivos.push('tiene mas presencia en boca')
    }
    if (perfilClienteVenta.bebe === 'burbuja') {
      score += vino.tipo === 'espumoso' ? 14 : -4
      motivos.push('responde a una peticion de burbuja')
    }
    if (perfilClienteVenta.bebe === 'generoso') {
      score += vino.tipo === 'generoso' ? 14 : -4
      motivos.push('entra en el terreno de los generosos')
    }

    if (perfilClienteVenta.estilo === 'fresco') {
      if (['blanco', 'rosado', 'espumoso', 'generoso'].includes(vino.tipo)) score += 4
      if (['fresco', 'acidez', 'salino', 'mineral', 'citrico'].some(t => textoVino.includes(t))) score += 6
      motivos.push('prioriza frescura')
    }
    if (perfilClienteVenta.estilo === 'local') {
      score += esVinoDeZona(vino) ? 12 : -3
      motivos.push('refuerza la zona')
    }
    if (perfilClienteVenta.estilo === 'especial') {
      if (precioBotella(vino) >= Math.max(35, precioMedioVinosVenta())) score += 5
      if (['parcel', 'edicion', 'singular', 'autor', 'ancestral', 'natural'].some(t => textoVino.includes(t))) score += 5
      motivos.push('suena mas especial sin complicar la venta')
    }
    if (perfilClienteVenta.estilo === 'clasico') {
      if (['rioja', 'ribera', 'rueda', 'jerez', 'montilla', 'crianza', 'reserva'].some(t => textoVino.includes(t))) score += 6
      motivos.push('se puede defender desde referencias reconocibles')
    }
    if (perfilClienteVenta.estilo === 'facil') {
      if (precioBotella(vino) <= Math.max(32, precioMedioVinosVenta())) score += 3
      if (['fresco', 'fruta', 'suave', 'amable', 'ligero'].some(t => textoVino.includes(t))) score += 4
    }

    if (perfilClienteVenta.gama !== 'auto') {
      const gama = gamaActivaVenta()
      motivos.push(`encaja en gama ${gama.label.toLowerCase()}`)
    }

    return { score, motivo: motivos[0] || '' }
  }

  function aplicarPerfilCliente(resultado) {
    const ajuste = ajustePreferenciasCliente(resultado.vino)
    if (!ajuste.score) return resultado
    return {
      ...resultado,
      score: resultado.score + ajuste.score,
      motivo: ajuste.motivo ? `${resultado.motivo}; ${ajuste.motivo}` : resultado.motivo,
    }
  }

  function lecturaMesaVenta() {
    if (!hayConsultaVenta()) return null
    const consultas = consultasVentaActuales()
    if (consultas.length <= 1) return lecturaVenta(consultas[0] || consultaVenta)

    const lecturas = consultas.map(lecturaVenta).filter(Boolean)
    const unir = key => [...new Set(lecturas.flatMap(lectura => lectura[key] || []))].slice(0, 6)

    return {
      rasgos: unir('rasgos'),
      buscar: unir('buscar'),
      evitar: unir('evitar'),
      frase: `Buscamos una botella puente para ${consultas.length} platos: suficiente frescura para los entrantes y estructura para el plato más intenso.`,
      lectura: `${rangoBotellaParaTicket(ticketMesaVenta(), precioMedioVinosVenta()).lectura} La recomendación no optimiza un plato aislado, sino el conjunto.`,
    }
  }

  const platosVenta = platos
    .filter(plato => plato.activo !== false)

  function compatibilidadContexto(vino, contexto, consultaNormalizada) {
    const textoVino = normalizar(`${vino.nombre} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
    const esTawnyOPorto = textoVino.includes('tawny') || textoVino.includes('porto') || textoVino.includes('oporto')
    const esPx = textoVino.includes('pedro ximenez') || textoVino.includes(' px ') || textoVino.includes('px,') || textoVino.includes('alvear px')
    const esDulceOxidativo = esVinoDulceOSemidulce(vino, textoVino) || esPx || esTawnyOPorto
    const quesoTrucadoParaTinto = ['clavo', 'olivada', 'tomate seco', 'tomates secos'].some(t => consultaNormalizada.includes(t))
    const metodo = metodosPlato(consultaNormalizada)
    const contextoDulcePermitido = contexto === 'postre' || contexto === 'queso' || [
      'postre', 'tarta', 'helado', 'brownie', 'chocolate', 'queso azul', 'azul',
      'caramelo', 'toffee', 'datil', 'higo', 'frutos secos', 'torrija'
    ].some(t => incluyeTerminoCompleto(consultaNormalizada, t))

    if (esDulceOxidativo && !contextoDulcePermitido && !metodo.picante) {
      return {
        compatible: false,
        penalizacion: 85,
        razon: 'Los vinos dulces o semidulces quedan reservados para postres, quesos, picante o platos claramente dulces; en platos salados normales conviene una opcion seca.'
      }
    }

    if (contexto === 'queso') {
      if (vino.tipo === 'tinto' && !quesoTrucadoParaTinto) {
        return { compatible: false, penalizacion: 80, razon: 'En quesos, el KB prioriza blancos, finos/manzanillas, rosados, dulces y oportos; el tinto queda como excepción si el queso está trucado.' }
      }
      return { compatible: true, penalizacion: 0 }
    }

    if (contexto === 'fritura') {
      if (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto) {
        return { compatible: false, penalizacion: 90, razon: 'Para fritura conviene tensión, salinidad o burbuja; un tinto potente o un tawny no es la primera lectura del KB.' }
      }
      if (!['generoso', 'espumoso', 'blanco', 'rosado'].includes(vino.tipo)) {
        return { compatible: false, penalizacion: 50, razon: 'Para fritura se priorizan estilos frescos, salinos o con burbuja.' }
      }
      return { compatible: true, penalizacion: 0 }
    }

    if (contexto === 'aperitivo') {
      if (esJamonCurado(consultaNormalizada) && vino.tipo === 'tinto') {
        return { compatible: false, penalizacion: 95, razon: 'Con jamon curado la sal y el umami endurecen el tanino; mejor fino, manzanilla, burbuja seca o blanco salino.' }
      }
      if (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto) {
        return { compatible: false, penalizacion: 60, razon: 'Para aperitivo se priorizan vinos frescos, salinos, blancos, generosos secos o espumosos.' }
      }
      return { compatible: true, penalizacion: 0 }
    }

    if (contexto === 'pescado') {
      const tintoJustificado = metodo.brasa || metodo.ahumado || metodo.setasTrufa || metodo.dulce
      if (vino.tipo === 'tinto' && !tintoJustificado) {
        return { compatible: false, penalizacion: 85, razon: 'En pescado sin brasa, ahumado, setas/trufa o reducción intensa, se priorizan blancos, espumosos, rosados o generosos secos.' }
      }
      if ((consultaNormalizada.includes('salmon') || consultaNormalizada.includes('bacalao')) && metodo.vegetalVerde && vino.tipo === 'tinto') {
        return { compatible: false, penalizacion: 90, razon: 'Con pescado y verduras verdes como espárragos, el método de plato pide frescor y perfil vegetal antes que tinto.' }
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

    const idsAtajo = [
      ...(platoKb?.capitulos || []),
      ...Object.entries(atajos)
      .filter(([key]) => consultaNormalizada.includes(key))
      .flatMap(([, ids]) => ids)
    ]

    const matches = chartierBusqueda.map(item => {
      const { capitulo } = item
      let score = idsAtajo.includes(capitulo.id) ? 12 : 0
      palabrasClave(consultaNormalizada).forEach(palabra => {
        if (item.textoBusqueda.includes(palabra)) score += 4
      })

      return {
        capitulo,
        score,
        terminosVino: item.terminosVino,
        tipos: item.tipos,
      }
    }).filter(match => match.score > 0)

    if (matches.length) return matches.sort((a, b) => b.score - a.score).slice(0, 4)

    return chartierBusqueda
      .filter(item => ['sabor_frio', 'anisado', 'fino_oloroso'].includes(item.capitulo.id))
      .map(item => ({
        capitulo: item.capitulo,
        score: 2,
        terminosVino: item.terminosVino,
        tipos: item.tipos,
      }))
  }

  const descripcionCapitulo = {
    anisado_blanco_herbaceo: 'perfil fresco y aromático que va bien con este plato',
    sabor_frio_manzana_sauvignon: 'carácter ligero y frutal que encaja con este tipo de cocina',
    fino_manzanilla_versatil: 'muy versátil, aguanta bien cualquier dirección del plato',
    romero_blancos_alsacianos: 'notas herbales y especiadas que acompañan la intensidad del plato',
    azafran_riesling_chardonnay: 'acidez y cuerpo que equilibran bien el plato',
    oloroso_alimentos_densos: 'estructura y densidad que aguantan los sabores más potentes',
    quesos_pasta_semidura_blancos: 'notas frescas y cremosas que van bien con la textura',
    quesos_corteza_floral_chardonnay: 'perfil floral y con cuerpo, buena opción para quesos suaves',
    sotolon_vino_jaune_curri: 'oxidativo y especiado, aguanta bien las especias del plato',
    capsaicina_guindilla_vinos_amortiguadores: 'su frescura templa bien el picante',
    fino_oloroso: 'generoso versátil, acompaña bien este tipo de plato',
  }

  function fraseVenta(vino, motivo) {
    const tipo = tipoLabel[vino.tipo]?.toLowerCase() || 'vino'
    const origen = vino.region ? ` de ${vino.region}` : ''
    const uva = vino.uva ? ` (${vino.uva})` : ''
    const cabecera = `${tipo.charAt(0).toUpperCase() + tipo.slice(1)}${origen}${uva}.`
    const cuerpo = motivo.charAt(0).toUpperCase() + motivo.slice(1)
    return `${cabecera} ${cuerpo}.`
  }

  function motivoMesaVenta(vino, numeroPlatos, consultaNormalizada) {
    const textoVino = normalizar(`${vino.nombre || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
    const metodo = metodosPlato(consultaNormalizada)
    const platos = numeroPlatos > 1 ? `${numeroPlatos} platos` : 'la mesa'

    if (vino.tipo === 'blanco') {
      if (metodo.gratinado) return `aporta frescura para limpiar la parte cremosa y suficiente volumen para acompanar ${platos}`
      if (metodo.vegetalVerde) return `acompana los matices verdes del plato con frescura y deja una sensacion ligera en la mesa`
      return `tiene frescura y amplitud para acompanar ${platos} sin hacerse pesado`
    }
    if (vino.tipo === 'espumoso') return `su acidez y burbuja limpian el paladar y funcionan muy bien cuando la mesa comparte varios bocados`
    if (vino.tipo === 'generoso') return `su perfil salino y seco da profundidad al plato y limpia la boca entre bocados`
    if (vino.tipo === 'rosado') return `ofrece fruta, frescura y cuerpo medio para moverse bien entre platos distintos`
    if (vino.tipo === 'tinto') {
      if (metodo.brasa || textoVino.includes('crianza') || textoVino.includes('barrica')) return `tiene fruta y estructura para sostener la intensidad del plato sin secar el paladar`
      return `aporta fruta y cuerpo medio, una opcion amable para acompanar ${platos}`
    }
    if (vino.tipo === 'dulce') return `funciona por contraste y afinidad aromatica cuando el plato tiene dulzor, queso o final de postre`
    return `mantiene equilibrio entre frescura, cuerpo y aroma para acompanar ${platos}`
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
            : evento.resultado === 'no_stock' || evento.resultado === 'agotado'
              ? -3
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

  function ajusteExposicionRecomendacion(vino, contexto) {
    if (!historialRecomendaciones.length) return { ajuste: 0, veces: 0 }

    const datos = historialRecomendaciones.reduce((acc, evento) => {
      const mismoVino = String(evento.vino_id) === String(vino.id) || normalizar(evento.vino) === normalizar(vino.nombre)
      if (!mismoVino) return acc

      const contextoEvento = contextoVenta(normalizar(evento.consulta || ''))
      const mismoContexto = contextoEvento === contexto
      const peso = mismoContexto ? 1 : 0.35
      return {
        total: acc.total + peso,
        mismoContexto: acc.mismoContexto + (mismoContexto ? 1 : 0),
      }
    }, { total: 0, mismoContexto: 0 })

    if (!datos.total) return { ajuste: 0, veces: 0 }

    const ajuste = -Math.min(9, Math.log2(datos.total + 1) * 2.4)
    return { ajuste, veces: datos.total, mismoContexto: datos.mismoContexto }
  }

  function puntuarParaVenta(vino, matchesKb, objetivo, precioMedio, contexto, consultaNormalizada, rangoTicket = null) {
    const textoVino = normalizar(`${vino.nombre} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
    let score = 0
    let motivo = 'buena elección para este tipo de plato'
    let fuente = ''
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
        motivo = descripcionCapitulo[match.capitulo.id] || 'encaja bien con este tipo de plato'
        fuente = `${fuenteChartier(match.capitulo)}: ${match.capitulo.title}`
      }
      score += matchScore
    })

    if (objetivo === 'rotar') {
      if (vino.stock > 3) score += Math.min(vino.stock, 18) / 2
      if (vino.stock > 0 && vino.stock <= 3) score -= 4
    }
    if (vino.precio_copa) score += (objetivo === 'copas' || objetivo === 'sucesion_copas') ? 8 : 1
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
        motivo = `${motivo}, y encaja con el presupuesto estimado de la mesa`
      } else {
        const penalizacionPrecio = Math.min(9, (distanciaIdeal / tolerancia) * 3)
        score -= penalizacionPrecio
        if (objetivo === 'ticket' && precio > rangoTicket.max && precio <= rangoTicket.max * 1.35) {
          score += 4
          motivo = `${motivo}; se puede ofrecer como opción un poco más especial sin romper el presupuesto`
        }
      }
    }

    if (metodo.brasa && contexto === 'carne' && vino.tipo === 'tinto') score += 8
    if (metodo.frito && ['generoso', 'espumoso', 'blanco'].includes(vino.tipo)) score += 8
    if (metodo.frito && esGenerosoSeco(vino, textoVino)) {
      score += 12
      motivo = 'su perfil salino y seco limpia la fritura y aguanta la grasa sin cansar'
    }
    if (metodo.frito && esEspumosoSeco(vino, textoVino)) {
      score += 12
      motivo = 'la burbuja seca y la acidez limpian grasa y sal entre bocados'
    }
    if (metodo.gratinado && ['blanco', 'generoso', 'espumoso'].includes(vino.tipo)) score += 5
    if (metodo.gratinado && esEspumosoSeco(vino, textoVino)) score += 8
    if (metodo.gratinado && esGenerosoSeco(vino, textoVino)) score += 7
    if (metodo.vegetalVerde && ['blanco', 'generoso', 'espumoso'].includes(vino.tipo)) score += 5
    if (metodo.vegetalVerde && ['sauvignon', 'verdejo', 'albari', 'riesling'].some(t => textoVino.includes(t))) score += 8
    if (metodo.setasTrufa && contexto === 'pescado' && ['tinto', 'blanco'].includes(vino.tipo)) score += 4
    const contextoDulcePermitido = contexto === 'postre' || contexto === 'queso' || [
      'postre', 'tarta', 'helado', 'brownie', 'chocolate', 'queso azul', 'azul',
      'caramelo', 'toffee', 'datil', 'higo', 'frutos secos', 'torrija'
    ].some(t => incluyeTerminoCompleto(consultaNormalizada, t))
    if (metodo.dulce && contextoDulcePermitido && ['dulce', 'generoso'].includes(vino.tipo)) score += 4

    if (metodo.frito && ['alta acidez', 'perfil fresco', 'salino', 'manzanilla', 'fino'].some(t => textoVino.includes(t))) score += 7
    if (metodo.gratinado && ['perfil fresco', 'alta acidez', 'salino', 'mineral'].some(t => textoVino.includes(t))) score += 4
    if (metodo.brasa && ['tostado', 'madera', 'fruta madura', 'con cuerpo', 'tanino amable'].some(t => textoVino.includes(t))) score += 6
    if (metodo.dulce && contextoDulcePermitido && ['dulce', 'oxidativo', 'pedro ximenez', 'px', 'fruta madura'].some(t => textoVino.includes(t))) score += 6
    if (contexto === 'queso' && ['oxidativo', 'dulce', 'salino', 'floral', 'alta acidez'].some(t => textoVino.includes(t))) score += 6
    if ((contexto === 'aperitivo' || metodo.frio) && ['perfil fresco', 'alta acidez', 'salino', 'mineral', 'floral'].some(t => textoVino.includes(t))) score += 5
    if (contexto === 'aperitivo' && esGenerosoSeco(vino, textoVino)) score += 10
    if (contexto === 'aperitivo' && esEspumosoSeco(vino, textoVino)) score += 10
    if (contexto === 'pescado' && esEspumosoSeco(vino, textoVino)) score += metodo.gratinado || metodo.frito ? 8 : 5
    if (esJamonCurado(consultaNormalizada)) {
      if (esGenerosoSeco(vino, textoVino)) {
        score += 28
        motivo = 'fino o manzanilla es la lectura mas directa: salinidad, crianza biologica y boca seca para grasa, sal y umami del jamon'
        fuente = fuente || 'Regla de sala: jamon curado'
      } else if (esEspumosoSeco(vino, textoVino)) {
        score += 18
        motivo = 'la burbuja seca limpia la grasa del jamon y respeta la sal sin endurecer taninos'
        fuente = fuente || 'Regla de sala: jamon curado'
      } else if (vino.tipo === 'blanco') {
        score += 4
      }
    }
    if (metodo.picante && ['perfil fresco', 'floral', 'dulce', 'baja graduacion'].some(t => textoVino.includes(t))) score += 5
    if (
      esBlancoLigeroDeUsoEstrecho(vino, textoVino) &&
      !['aperitivo', 'fritura', 'pescado'].includes(contexto) &&
      !metodo.vegetalVerde &&
      !metodo.frio
    ) {
      score -= 7
    }

    const aprendizaje = ajusteAprendizajeVenta(vino, contexto)
    score += aprendizaje.ajuste
    const exposicion = ajusteExposicionRecomendacion(vino, contexto)
    score += exposicion.ajuste
    if (Math.abs(aprendizaje.ajuste) >= 2.5) {
      motivo = aprendizaje.ajuste > 0
        ? `${motivo}; además ha funcionado bien en sala en mesas parecidas`
        : `${motivo}; aunque en sala no ha convencido mucho últimamente`
      fuente = fuente
    }

    score += Math.min(precioBotella(vino), 80) / 80
    score -= compatibilidad.penalizacion

    if (!compatibilidad.compatible && compatibilidad.razon) {
      motivo = compatibilidad.razon
      fuente = 'Restricción de contexto del KB'
    }

    return { vino, score, motivo, fuente, compatible: compatibilidad.compatible, aprendizaje, exposicion }
  }

  function calcularRecomendacionesVenta() {
    if (!hayConsultaVenta()) return []
    if (consultaGrafoVenta && grafoVenta?.consulta !== consultaGrafoVenta) return []
    let disponibles = vinos.filter(vino => esVinoElegibleParaObjetivo(vino))
    if (!disponibles.length && perfilClienteVenta.gama !== 'auto') {
      disponibles = vinos.filter(vino => esVinoElegibleParaObjetivo(vino, { ignorarGama: true }))
    }
    if (!disponibles.length) return []

    const filtradosPorPreferencia = tienePerfilClienteActivo()
      ? disponibles.filter(encajaEnPreferenciaCliente)
      : disponibles
    if (perfilClienteVenta.estilo === 'local' && !filtradosPorPreferencia.length) return []
    const candidatosBase = filtradosPorPreferencia.length ? filtradosPorPreferencia : disponibles

    const precioMedio = candidatosBase.reduce((sum, vino) => sum + precioBotella(vino), 0) / candidatosBase.length
    const consultas = consultasVentaActuales()
    const consultaActiva = consultaVentaActiva() || consultaDesdePerfilCliente()
    const consultaNormalizada = normalizar(consultaActiva)
    const esMesa = consultas.length > 1
    const ticketComida = ticketMesaVenta()
    const rangoTicket = rangoBotellaParaTicket(ticketComida, precioMedio)
    const grafoListo = grafoVenta?.consulta === consultaGrafoVenta
    const grafoCandidatos = grafoListo ? (grafoVenta?.candidatos || []) : []
    const descartadosGoldstein = grafoListo ? (grafoVenta?.goldstein?.descartados || []) : []
    const goldsteinBloqueados = new Set(
      descartadosGoldstein.flatMap(item => [String(item.vino_id || ''), normalizar(item.nombre)])
    )
    const bloqueadoPorGoldstein = vino => goldsteinBloqueados.has(String(vino.id || '')) || goldsteinBloqueados.has(normalizar(vino.nombre))
    const grafoPorVino = new Map(grafoCandidatos.map(item => [String(item.vino_id || item.nombre), item]))
    const grafoPorNombre = new Map(grafoCandidatos.map(item => [normalizar(item.nombre), item]))
    const aplicarGrafoChartier = resultado => {
      const item = grafoPorVino.get(String(resultado.vino.id)) || grafoPorNombre.get(normalizar(resultado.vino.nombre))
      if (!item) return resultado

      const ev = item.evidencias?.[0]
      const directo = item.evidencias?.some(e => e.origen === 'chartier_directo')
      const goldsteinActivo = Boolean(item.goldstein?.reglas?.length)
      const base = Math.log2(Math.max(2, Number(item.scoreGrafo) || 2)) * (directo ? 5.2 : 3.7)
      const bonus = Math.min(directo ? 44 : 28, Math.max(directo ? 16 : 8, base))
      const penalizacionRiesgo = (item.riesgos?.length || 0) * 8
      const motivoGrafo = ev?.concepto && ev?.wineLabel
        ? directo
          ? `Chartier conecta ${ev.concepto} con ${ev.wineLabel}`
          : `afinidad Chartier por ${ev.familia || ev.concepto}`
        : 'evidencia del grafo Chartier unificado'

      return {
        ...resultado,
        score: resultado.score + bonus - penalizacionRiesgo,
        motivo: item.riesgos?.length && penalizacionRiesgo >= bonus
          ? item.riesgos[0]
          : `${motivoGrafo}; ${resultado.motivo}`,
        fuente: `${directo ? 'Grafo Chartier unificado: evidencia directa' : 'Grafo Chartier unificado: familia aromatica'}${goldsteinActivo ? ' + validacion estructural Goldstein' : ''}`,
        chartierGrafo: item,
        goldsteinEstructural: goldsteinActivo ? item.goldstein : null,
      }
    }

    // ── Sucesión de copas: una copa por plato en arco armónico ───────────
    if (objetivoVenta === 'sucesion_copas' && esMesa) {
      const usadosIds = new Set()
      const copas = consultas.map((consulta, i) => {
        const texto = normalizar(consulta)
        const matchesKb = capitulosParaConsulta(texto)
        const contexto = contextoVenta(texto)
        const plato = platosMesaVenta[i]
        const candidatos = candidatosBase
          .filter(v => !bloqueadoPorGoldstein(v) && !usadosIds.has(v.id))
          .map(vino => {
            const res = puntuarParaVenta(vino, matchesKb, objetivoVenta, precioMedio, contexto, texto, rangoTicket)
            if (plato?.familias_aromaticas?.familias?.length) {
              const { bonus, motivo: m } = bonusChartierFamilias(vino, plato.familias_aromaticas.familias)
              res.score += bonus
              if (m && bonus > 0) res.motivo = m
            }
            return aplicarPerfilCliente(aplicarGrafoChartier(res))
          })
          .filter(item => item.compatible && item.score >= 0)
          .sort((a, b) => b.score - a.score)
        const elegido = candidatos[0]
        if (!elegido) return null
        const platoNombre = plato?.nombre || consulta.split('(')[0].trim()
        usadosIds.add(elegido.vino.id)
        return {
          ...elegido,
          label: `${i + 1}ª copa · ${platoNombre}`,
          platoNombre,
          rangoTicket,
          ticketComida,
          objetivo: objetivoVenta,
        }
      }).filter(Boolean)
      return copas
    }

    const puntuados = candidatosBase
      .map(vino => {
        if (!esMesa) {
          const contexto = contextoVenta(consultaNormalizada)
          const matchesKb = capitulosParaConsulta(consultaNormalizada)
          const resultado = puntuarParaVenta(vino, matchesKb, objetivoVenta, precioMedio, contexto, consultaNormalizada, rangoTicket)
          // ── Bonus Chartier desde familias_aromaticas del plato ────────────
          const platoActual = platosMesaVenta[0]
          if (platoActual?.familias_aromaticas?.familias?.length) {
            const { bonus, motivo: motivoChartier, riesgos } = bonusChartierFamilias(vino, platoActual.familias_aromaticas.familias)
            resultado.score += bonus
            if (motivoChartier && bonus > 0) resultado.motivo = motivoChartier
            if (riesgos?.length && bonus < 0) resultado.motivo = riesgos[0]
          }
          return aplicarPerfilCliente(aplicarGrafoChartier(resultado))
        }

        const parciales = consultas.map((consulta, i) => {
          const texto = normalizar(consulta)
          const resultado = puntuarParaVenta(vino, capitulosParaConsulta(texto), objetivoVenta, precioMedio, contextoVenta(texto), texto, rangoTicket)
          // ── Bonus Chartier por plato individual de la mesa ────────────────
          const plato = platosMesaVenta[i]
          if (plato?.familias_aromaticas?.familias?.length) {
            const { bonus, motivo: motivoChartier } = bonusChartierFamilias(vino, plato.familias_aromaticas.familias)
            resultado.score += bonus
            if (motivoChartier && bonus > 0) resultado.motivo = motivoChartier
          }
          return resultado
        })
        const incompatibles = parciales.filter(item => !item.compatible)
        const scoreBase = parciales.reduce((sum, item) => sum + item.score, 0) / parciales.length
        const mejorParcial = parciales.sort((a, b) => b.score - a.score)[0]
        const penalizacionMesa = incompatibles.length * 45
        const compatible = incompatibles.length === 0

        return aplicarPerfilCliente(aplicarGrafoChartier({
          vino,
          score: scoreBase - penalizacionMesa,
          motivo: compatible
            ? motivoMesaVenta(vino, consultas.length, consultaNormalizada)
            : `encaja con parte de la mesa, pero tiene conflicto con ${incompatibles.length} plato${incompatibles.length > 1 ? 's' : ''}`,
          fuente: compatible ? 'Modo mesa: compatibilidad transversal' : mejorParcial.fuente,
          compatible,
          rangoTicket,
          ticketComida,
        }))
      })
      .filter(item => !bloqueadoPorGoldstein(item.vino))
      .sort((a, b) => b.score - a.score)
    const semilla = `${consultaNormalizada}-${objetivoVenta}-${rotacionVenta}`

    const usados = new Set()
    const bodegasUsadas = new Set()
    const tiposUsados = new Set()
    const requiereSalinoBurbuja = consultas.some(consulta => {
      const texto = normalizar(consulta)
      const contexto = contextoVenta(texto)
      const metodo = metodosPlato(texto)
      return esJamonCurado(texto) || contexto === 'aperitivo' || contexto === 'fritura' || metodo.frito || metodo.gratinado || contexto === 'pescado'
    })
    const esVinoSalinoOBurbuja = vino => {
      const textoVino = normalizar(`${vino.nombre} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
      return esGenerosoSeco(vino, textoVino) || esEspumosoSeco(vino, textoVino)
    }
    const registrarUso = vino => {
      usados.add(vino.id)
      if (vino.bodega) bodegasUsadas.add(vino.bodega)
      if (vino.tipo) tiposUsados.add(vino.tipo)
    }
    const elegir = (label, filtroPrecio) => {
      const candidatos = puntuados.filter(item => item.compatible && item.score >= 6 && !usados.has(item.vino.id) && filtroPrecio(item.vino))
      if (!candidatos.length) return null

      const mejorScore = candidatos[0].score
      const margen = objetivoVenta === 'rotar' ? 22 : rotacionVenta > 0 ? 18 : 12
      const grupoBueno = candidatos.filter(item => mejorScore - item.score <= margen)
      const grupoTipoDiverso = grupoBueno.filter(item => !item.vino.tipo || !tiposUsados.has(item.vino.tipo))
      const grupoBodegaDiverso = grupoTipoDiverso.filter(item => !item.vino.bodega || !bodegasUsadas.has(item.vino.bodega))
      const grupoElegible = grupoBodegaDiverso.length ? grupoBodegaDiverso : grupoTipoDiverso.length ? grupoTipoDiverso : grupoBueno
      const desplazamiento = rotacionVenta + Math.abs(hashTexto(label)) % Math.max(grupoElegible.length, 1)
      const elegido = elegirConRotacion(grupoElegible, `${semilla}-${label}`, desplazamiento)
      if (!elegido) return null
      registrarUso(elegido.vino)
      return { ...elegido, label, rangoTicket, ticketComida, objetivo: objetivoVenta }
    }

    const lista = []
    const agregar = item => {
      if (item && lista.length < 3) lista.push(item)
    }
    if (tienePerfilClienteActivo()) agregar(elegir('Perfil cliente', () => true))
    if (lista.length < 3) agregar(elegir('Facil de vender', vino => precioBotella(vino) <= Math.max(30, rangoTicket.ideal) && precioBotella(vino) >= Math.max(14, rangoTicket.min * 0.75)))
    if (lista.length < 3 && requiereSalinoBurbuja) agregar(elegir('Salino / burbuja', esVinoSalinoOBurbuja))
    if (lista.length < 3) agregar(elegir('Recomendado', () => true))
    if (lista.length < 3) agregar(elegir('Premium', vino => precioBotella(vino) >= Math.max(35, rangoTicket.ideal, rangoTicket.max * 0.9)))

    const objetivo = Math.min(3, puntuados.filter(item => item.compatible).length)
    const restantes = puntuados.filter(item => item.compatible && !usados.has(item.vino.id))
    while (lista.length < objetivo && restantes.length) {
      const elegido = restantes.shift()
      registrarUso(elegido.vino)
      lista.push({
        ...elegido,
        label: `Alternativa compatible ${lista.length + 1}`,
        rangoTicket,
        ticketComida,
        objetivo: objetivoVenta,
      })
    }
    return lista
  }

  const consultaGrafoVenta = autenticado && vistaServicio === 'venta' && restaurante?.id && (platosMesaVenta.length > 0 || normalizar(consultaVenta).length > 1)
    ? (platosMesaVenta.length ? platosMesaVenta.map(consultaDesdePlato).join(', ') : consultaVenta)
    : ''
  const vinosGrafoPayload = useMemo(() => vinos
    .filter(vino => vino?.activo !== false && vino?.stock !== 0 && Number(vino?.precio_botella) > 0)
    .map(vino => ({
      id: vino.id,
      nombre: vino.nombre,
      bodega: vino.bodega,
      tipo: vino.tipo,
      region: vino.region,
      uva: vino.uva,
      anada: vino.anada,
      alcohol: vino.alcohol,
      graduacion: vino.graduacion,
      precio_copa: vino.precio_copa,
      precio_botella: vino.precio_botella,
      notas_cata: vino.notas_cata,
      stock: vino.stock,
      activo: vino.activo,
    })), [vinos])

  useEffect(() => {
    if (!consultaGrafoVenta || !vinosGrafoPayload.length) {
      return
    }

    const controller = new AbortController()
    let cancelado = false

    fetch('/api/maridaje-grafo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consulta: consultaGrafoVenta, vinos: vinosGrafoPayload }),
      signal: controller.signal,
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelado) setGrafoVenta(data ? { ...data, consulta: consultaGrafoVenta } : null)
      })
      .catch(() => {
        if (!cancelado) setGrafoVenta(null)
      })

    return () => {
      cancelado = true
      controller.abort()
    }
  }, [consultaGrafoVenta, vinosGrafoPayload])

  const tipos = useMemo(() => ['todos', ...new Set(vinos.map(v => v.tipo))], [vinos])
  const recomendacionesVenta = autenticado && vistaServicio === 'venta' ? calcularRecomendacionesVenta() : []
  const lecturaActual = autenticado && vistaServicio === 'venta' ? lecturaMesaVenta() : null
  const ticketActualVenta = autenticado ? ticketMesaVenta() : 0
  const rangoActualVenta = rangoBotellaParaTicket(ticketActualVenta, precioMedioVinosVenta())
  const gamasClienteVenta = autenticado ? gamasVenta() : []
  const ticketReferenciaCliente = autenticado ? ticketReferenciaVenta() : null
  const categoriasPlatosVenta = ['todos', ...new Set(platosVenta.map(plato => plato.categoria).filter(Boolean))]
  const platosVentaFiltrados = platosVenta.filter(plato => {
    const texto = normalizar(`${plato.nombre} ${plato.descripcion || ''} ${plato.categoria || ''}`)
    const matchCategoria = categoriaPlatoVenta === 'todos' || plato.categoria === categoriaPlatoVenta
    const matchBusqueda = !busquedaPlatoVenta || texto.includes(normalizar(busquedaPlatoVenta))
    return matchCategoria && matchBusqueda
  })
  const platosPanelAbierto = mostrarPlatosVenta || busquedaPlatoVenta.length > 0 || categoriaPlatoVenta !== 'todos'
  const recomendacionPrincipal = recomendacionesVenta[0] || null
  const ultimasSenales = historialVenta.slice(0, 4)
  const accionesRapidasVenta = [
    { key: 'vendida', label: 'Vendida', helper: 'Cuenta para rentabilidad' },
    { key: 'no_stock', label: 'No quedaba', helper: 'Aviso para bodega' },
    { key: 'no_convence', label: 'No convenció', helper: 'Duda de sala' },
    { key: 'otra', label: 'Pidió otra', helper: 'Cambio de decisión' },
  ]

  const vinosFiltrados = useMemo(() => vinos.filter(v => {
    const matchBusqueda = !busqueda || busqueda.length < 2 ||
      v.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (v.bodega && v.bodega.toLowerCase().includes(busqueda.toLowerCase())) ||
      (v.uva && v.uva.toLowerCase().includes(busqueda.toLowerCase())) ||
      (v.region && v.region.toLowerCase().includes(busqueda.toLowerCase()))
    const matchFiltro = filtro === 'todos' || v.tipo === filtro
    return matchBusqueda && matchFiltro
  }), [vinos, busqueda, filtro])

  useEffect(() => {
    if (!autenticado || vistaServicio !== 'venta' || !restaurante?.id || !hayConsultaVenta() || !recomendacionesVenta.length) return

    const consulta = consultaVentaActiva() || consultaDesdePerfilCliente()
    const firma = `${restaurante.id}|${consulta}|${objetivoVenta}|${perfilClienteVenta.bebe}|${perfilClienteVenta.estilo}|${perfilClienteVenta.gama}|${rotacionVenta}|${recomendacionesVenta.map(item => item.vino.id).join(',')}`
    if (ultimaRecomendacionRegistrada.current === firma) return
    ultimaRecomendacionRegistrada.current = firma

    const eventos = recomendacionesVenta.map((item, index) => ({
      restaurante_id: restaurante.id,
      tipo: 'recomendacion',
      detalle: JSON.stringify({
        origen: 'camarero',
        consulta: String(consulta || '').slice(0, 200),
        objetivo: objetivoVenta,
        perfil_cliente: perfilClienteVenta,
        etiqueta: item.label,
        vino_id: item.vino.id,
        vino: item.vino.nombre,
        posicion: index + 1,
        precio: item.vino.precio_botella,
      }),
    }))

    fetch('/api/estadisticas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sala_token: salaToken, eventos }),
    })
  }, [autenticado, vistaServicio, restaurante?.id, recomendacionesVenta, objetivoVenta, perfilClienteVenta, rotacionVenta, consultaVenta, platosMesaVenta, salaToken])

  const cx = 150, cy = 150, r = 100

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#111', fontFamily: 'sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.15em', color: '#666' }}>CARGANDO</p>
    </div>
  )

  if (restaurante && !puedeUsar(restaurante, 'modo_camarero')) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#111', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
      <p style={{ fontSize: 11, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 8px' }}>Plan {nombrePlan(restaurante)}</p>
      <p style={{ fontSize: 26, fontWeight: 300, color: 'white', fontFamily: 'Georgia, serif', margin: '0 0 14px' }}>Modo camarero no incluido</p>
      <p style={{ maxWidth: 360, color: '#aaa', fontSize: 14, lineHeight: 1.5, margin: 0 }}>Este acceso queda reservado para el Plan Sala o Acompanado.</p>
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
      <a href="/cartavinos" target="_blank" rel="noreferrer" style={{
        marginTop: 34,
        color: '#555',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textDecoration: 'none',
        textTransform: 'uppercase'
      }}>
        Carta Viva <span style={{fontStyle:'italic',letterSpacing:'0.08em'}}>×</span> @cataconjuanjo
      </a>
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
            { label: 'Uva / blend', valor: vinoSeleccionado.uva },
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
                  <h2 className={styles.panelTitle}>
                    {modoRecomendacionVenta === 'platos'
                      ? platosMesaVenta.length > 1 ? `${platosMesaVenta.length} platos` : 'Maridaje por platos'
                      : 'Preferencias del cliente'}
                  </h2>
                  <p className={styles.panelSubtitle}>
                    {modoRecomendacionVenta === 'platos'
                      ? platosMesaVenta.length ? platosMesaVenta.map(p => p.nombre).join(' · ') : 'Selecciona la comida de la mesa'
                      : 'Orienta la venta antes de elegir la comida'}
                  </p>
                </div>
                <select aria-label="Objetivo de recomendacion" value={objetivoVenta} onChange={e => cambiarObjetivoVenta(e.target.value)} className={styles.select}>
                  <option value="equilibrado">Mejor maridaje</option>
                  <option value="copas">Por copas</option>
                  <option value="sucesion_copas">Sucesión copas</option>
                  <option value="ticket">Subir ticket</option>
                  <option value="rotar">Rotar stock</option>
                  <option value="local">Vino local</option>
                </select>
              </div>

              <div className={styles.panelBody}>
                <div className={styles.recommendModeTabs} role="tablist" aria-label="Modo de recomendacion">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modoRecomendacionVenta === 'platos'}
                    onClick={() => cambiarModoRecomendacionVenta('platos')}
                    className={`${styles.recommendModeTab} ${modoRecomendacionVenta === 'platos' ? styles.recommendModeTabActive : ''}`}
                  >
                    Por platos
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={modoRecomendacionVenta === 'preferencias'}
                    onClick={() => cambiarModoRecomendacionVenta('preferencias')}
                    className={`${styles.recommendModeTab} ${modoRecomendacionVenta === 'preferencias' ? styles.recommendModeTabActive : ''}`}
                  >
                    Por preferencias
                  </button>
                </div>
                <p className={styles.modeHint}>
                  {modoRecomendacionVenta === 'platos'
                    ? 'Elige uno o varios platos. Chartier y Goldstein buscan el vino que mejor acompana la mesa.'
                    : 'Haz una o dos preguntas. La recomendacion parte de lo que busca el cliente.'}
                </p>

                {modoRecomendacionVenta === 'platos' && platosMesaVenta.length > 0 && (
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

                {modoRecomendacionVenta === 'platos' && (ticketActualVenta > 0 || platosMesaVenta.length > 1) && (
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

                {modoRecomendacionVenta === 'platos' && platosMesaVenta.length > 0 && !mostrarAfinadoCliente && (
                  <button type="button" onClick={() => setMostrarAfinadoCliente(true)} className={styles.refineButton}>
                    Afinar con preferencias del cliente
                  </button>
                )}

                {(modoRecomendacionVenta === 'preferencias' || mostrarAfinadoCliente) && (
                <div className={styles.waiterGuide}>
                  <div className={styles.guideHeader}>
                    <div>
                      <p className={styles.sectionLabel} style={{ margin: 0 }}>{mostrarAfinadoCliente ? 'Afinado opcional' : 'Preguntas al cliente'}</p>
                      <p className={styles.guideTitle}>{mostrarAfinadoCliente ? 'Matiza el maridaje' : 'Orienta la recomendacion'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPerfilClienteVenta(PERFIL_CLIENTE_NEUTRO)
                        if (!platosMesaVenta.length) setConsultaVenta('')
                        setRotacionVenta(0)
                      }}
                      className={styles.plainButton}
                    >
                      Reset
                    </button>
                  </div>

                  <p className={styles.guideQuestion}>Que suele beber?</p>
                  <div className={styles.optionGrid}>
                    {preguntasClienteVenta.bebe.map(opcion => (
                      <button
                        key={opcion.id}
                        type="button"
                        onClick={() => cambiarPerfilClienteVenta('bebe', opcion.id)}
                        className={`${styles.optionButton} ${perfilClienteVenta.bebe === opcion.id ? styles.optionActive : ''}`}
                      >
                        {opcion.label}
                      </button>
                    ))}
                  </div>

                  <p className={styles.guideQuestion}>Que busca hoy?</p>
                  <div className={styles.optionGrid}>
                    {preguntasClienteVenta.estilo.map(opcion => (
                      <button
                        key={opcion.id}
                        type="button"
                        onClick={() => cambiarPerfilClienteVenta('estilo', opcion.id)}
                        className={`${styles.optionButton} ${perfilClienteVenta.estilo === opcion.id ? styles.optionActive : ''}`}
                      >
                        {opcion.label}
                      </button>
                    ))}
                  </div>

                  <div className={styles.guideRangeHeader}>
                    <p className={styles.guideQuestion}>Gama</p>
                    {ticketReferenciaCliente && (
                      <span>{ticketReferenciaCliente.fuente === 'configurado' ? 'ticket medio' : 'estimado'} {Math.round(ticketReferenciaCliente.valor)} EUR</span>
                    )}
                  </div>
                  <div className={styles.rangeGrid}>
                    {gamasClienteVenta.map(gama => (
                      <button
                        key={gama.id}
                        type="button"
                        onClick={() => cambiarPerfilClienteVenta('gama', gama.id)}
                        className={`${styles.rangeButton} ${gama.id !== 'auto' && perfilClienteVenta.gama === gama.id ? styles.rangeActive : ''}`}
                      >
                        <strong>{gama.label}</strong>
                        <span>{gama.helper}</span>
                      </button>
                    ))}
                  </div>
                </div>
                )}

                {modoRecomendacionVenta === 'platos' && (
                  <>
                <p className={styles.sectionLabel}>Recomendar para...</p>
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
                      <p className={styles.sectionLabel}>Platos de la carta</p>
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
                  </>
                )}
              </div>
            </aside>

            <section className={styles.panelDark}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.eyebrow}>Recomendación</p>
                  <h2 className={styles.panelTitle}>Vinos para vender</h2>
                  <p className={styles.panelSubtitle}>
                    {consultaGrafoVenta && grafoVenta?.consulta !== consultaGrafoVenta
                      ? 'Cruzando grafo Chartier...'
                      : grafoVenta?.consulta === consultaGrafoVenta && grafoVenta?.candidatos?.length
                        ? 'Chartier + Goldstein activos'
                        : platosMesaVenta.length > 1 ? 'Botella puente para la mesa' : hayConsultaVenta() ? 'Tres opciones para la mesa' : 'Esperando seleccion'}
                  </p>
                </div>
                {recomendacionesVenta.length > 0 && (
                  <button type="button" onClick={() => setRotacionVenta(rotacionVenta + 1)} className={styles.primaryButton}>
                    Otras opciones
                  </button>
                )}
              </div>

              <div className={styles.panelBody}>
                {mensajeServicio && (
                  <div className={styles.serviceToast} role="status">
                    {mensajeServicio}
                  </div>
                )}

                {recomendacionPrincipal && (
                  <section className={styles.quickServicePanel} aria-label="Acciones rápidas de servicio">
                    <div className={styles.quickServiceHead}>
                      <div>
                        <p className={styles.sectionLabel} style={{ margin: 0 }}>Ahora en mesa</p>
                        <h3>{recomendacionPrincipal.vino.nombre}</h3>
                        <p>
                          {[
                            tipoLabel[recomendacionPrincipal.vino.tipo],
                            recomendacionPrincipal.vino.bodega,
                            recomendacionPrincipal.vino.precio_botella ? `${Number(recomendacionPrincipal.vino.precio_botella).toFixed(0)} EUR` : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <div className={styles.quickStepper} aria-label="Cantidad">
                        <button type="button" onClick={() => setCantidadRapida(Math.max(1, cantidadRapida - 1))} aria-label="Restar cantidad">-</button>
                        <strong>{cantidadRapida}</strong>
                        <button type="button" onClick={() => setCantidadRapida(cantidadRapida + 1)} aria-label="Sumar cantidad">+</button>
                      </div>
                    </div>
                    <div className={styles.quickActionGrid}>
                      {accionesRapidasVenta.map(accion => (
                        <button
                          key={accion.key}
                          type="button"
                          className={accion.key === 'vendida' ? styles.quickActionPrimary : styles.quickAction}
                          onClick={() => registrarFeedbackVenta(recomendacionPrincipal.vino, accion.key, 'rápida', cantidadRapida)}
                        >
                          <strong>{accion.label}</strong>
                          <span>{accion.helper}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {ultimasSenales.length > 0 && (
                  <div className={styles.recentSignals}>
                    <p className={styles.sectionLabel} style={{ margin: 0 }}>Últimas señales</p>
                    <div>
                      {ultimasSenales.map((evento, index) => (
                        <span key={`${evento.vino_id || evento.vino}-${evento.resultado}-${index}`}>
                          {evento.cantidad && evento.cantidad > 1 ? `${evento.cantidad}x ` : ''}{evento.vino || 'Vino'} · {{
                            vendida: 'vendida',
                            no_stock: 'no quedaba',
                            agotado: 'agotado',
                            no_convence: 'no convenció',
                            otra: 'pidió otra',
                          }[evento.resultado] || 'feedback'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

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
                  <p className={styles.emptyState}>
                    {consultaGrafoVenta && grafoVenta?.consulta !== consultaGrafoVenta
                      ? 'Validando compatibilidad...'
                      : perfilClienteVenta.estilo === 'local'
                        ? 'No hay vinos de la zona compatibles con el plato y los filtros elegidos.'
                        : hayConsultaVenta()
                          ? 'Sin recomendacion disponible.'
                          : modoRecomendacionVenta === 'platos'
                            ? 'Selecciona uno o varios platos para encontrar el mejor vino para la mesa.'
                            : 'Haz una o dos preguntas al cliente para orientar la recomendacion.'}
                  </p>
                )}

                {lecturaActual && (
                  <details className={styles.salesNote}>
                    <summary className={styles.salesNoteSummary}>Ver por que encajan</summary>
                    <div className={styles.salesNoteBody}>
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
                  </details>
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
                placeholder="Buscar vino, bodega, uva, región"
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
            <p style={{ fontSize: 10, color: '#555', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 4px' }}>Venta rápida</p>
            <p style={{ fontSize: 13, color: '#aaa', margin: 0 }}>
              {platosMesaVenta.length > 1 ? `Botella puente para ${platosMesaVenta.length} platos` : 'Recomendación para defender en mesa'}
            </p>
          </div>
          <select value={objetivoVenta} onChange={e => cambiarObjetivoVenta(e.target.value)}
            style={{ background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none' }}>
            <option value="equilibrado">Mejor maridaje</option>
            <option value="copas">Por copas</option>
            <option value="sucesion_copas">Sucesión copas</option>
            <option value="ticket">Subir ticket</option>
            <option value="rotar">Rotar stock</option>
            <option value="local">Vino local</option>
          </select>
        </div>

        <button onClick={() => setRotacionVenta(rotacionVenta + 1)}
          style={{ width: '100%', background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 10, padding: '9px 12px', fontSize: 12, cursor: 'pointer', marginBottom: 10 }}>
          Otras opciones compatibles
        </button>

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
  const { vino, label, motivo, aprendizaje, rangoTicket, ticketComida } = item
  const stockCritico = vino.stock > 0 && vino.stock <= 3
  const ajusteAprendido = aprendizaje && Math.abs(aprendizaje.ajuste) >= 2.5
  const esPorCopas = item.objetivo === 'copas' || item.objetivo === 'sucesion_copas'
  const precioPrincipal = esPorCopas ? Number(vino.precio_copa) || 0 : Number(vino.precio_botella) || 0
  const precioPrincipalLabel = esPorCopas ? `${precioPrincipal} EUR copa` : `${precioPrincipal} EUR`
  const precioVino = Number(vino.precio_botella) || 0
  const precioEnRango = rangoTicket && precioVino >= rangoTicket.min && precioVino <= rangoTicket.max
  const chartierDirecto = item.chartierGrafo?.evidencias?.some(ev => ev.origen === 'chartier_directo')
  const goldsteinActivo = Boolean(item.goldsteinEstructural?.reglas?.length)
  const resumenVenta = [
    tipoLabel[vino.tipo] || 'Vino',
    vino.bodega,
    vino.uva,
    vino.precio_copa ? `${vino.precio_copa} EUR copa` : ''
  ].filter(Boolean).join(' · ')
  const acciones = [
    { key: 'vendida', label: 'Vendida' },
    { key: 'no_convence', label: 'No convenció' },
    { key: 'otra', label: 'Pidió otra' },
    { key: 'no_stock', label: 'No quedaba' },
    { key: 'agotado', label: 'Agotado' },
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
          <span className={styles.price}>{precioPrincipalLabel}</span>
        </div>
        <h3 className={styles.wineName}>{vino.nombre}</h3>
        <p className={styles.wineInfo}>{resumenVenta}</p>
        <p className={styles.reason}>{fraseVenta(vino, motivo)}</p>
        {item.chartierGrafo && (
          <p className={styles.statusLine} style={{ color: chartierDirecto ? '#1f7a61' : '#6f767d' }}>
            {chartierDirecto ? 'Chartier directo' : 'Chartier por familia aromatica'}
          </p>
        )}
        {goldsteinActivo && (
          <p className={styles.statusLine} style={{ color: '#6f767d' }}>Goldstein estructural</p>
        )}
        {ticketComida > 0 && rangoTicket && (
          <p className={styles.statusLine} style={{ color: precioEnRango ? '#1f7a61' : '#6f767d' }}>
            {precioEnRango ? 'Precio coherente para la mesa' : `Revisar precio: ${rangoTicket.min.toFixed(0)}-${rangoTicket.max.toFixed(0)} EUR`}
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

      <div className={styles.feedbackActions}>
        <button
          type="button"
          onClick={() => onFeedback(vino, 'vendida', label)}
          className={`${styles.soldButton} ${feedbackVenta[`${vino.id}-vendida-${consultaVenta}`] ? styles.feedbackActive : ''}`}
        >
          Vendida
        </button>
        <details className={styles.feedbackMenu}>
          <summary>Mas resultados</summary>
          <div className={styles.feedbackGrid}>
            {acciones.filter(accion => accion.key !== 'vendida').map(accion => {
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
        </details>
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
          <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{precioPrincipalLabel}</span>
        </div>
        <p style={{ margin: '0 0 4px', fontSize: 15, color: '#fff', fontWeight: 500 }}>{vino.nombre}</p>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#666' }}>{resumenVenta}</p>
        <p style={{ margin: 0, fontSize: 12, color: '#aaa', lineHeight: 1.55 }}>{fraseVenta(vino, motivo)}</p>
        {item.chartierGrafo && (
          <p style={{ margin: '10px 0 0', fontSize: 10, color: chartierDirecto ? '#7BAF8A' : '#777', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {chartierDirecto ? 'Chartier directo' : 'Chartier por familia aromatica'}
          </p>
        )}
        {goldsteinActivo && (
          <p style={{ margin: '10px 0 0', fontSize: 10, color: '#777', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Goldstein estructural
          </p>
        )}
        {ticketComida > 0 && rangoTicket && (
          <p style={{ margin: '10px 0 0', fontSize: 10, color: precioEnRango ? '#7BAF8A' : '#777', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {precioEnRango ? 'Precio coherente para la mesa' : `Revisar precio: ${rangoTicket.min.toFixed(0)}-${rangoTicket.max.toFixed(0)} EUR`}
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
  const detalleFila = [tipoLabel[v.tipo] || 'Vino', v.bodega, v.uva, v.region, stockLabel].filter(Boolean).join(' · ')
  const detalleBodega = [v.bodega, v.uva, v.region, v.anada].filter(Boolean).join(' · ')

  const filaBodegaCompacta = true
  if (filaBodegaCompacta) return (
    <div className={`${styles.wineRow} ${enComparador ? styles.wineRowSelected : ''}`}>
      <div onClick={() => onSelect(v)} className={styles.wineRowMain}>
        <span className={styles.dot} style={{ background: tipoDot[v.tipo] || '#444' }} />
        <div className={styles.wineRowText}>
          <p className={styles.wineRowName}>{v.nombre}</p>
          <p className={styles.wineRowDetail}>{detalleFila}</p>
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
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#555' }}>{detalleBodega}</p>
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
