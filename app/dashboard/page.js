'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Link from 'next/link'
import { clearAdminRestaurantEmail, clearDemoEmail, getEffectiveRestaurantEmail } from '../demo'
import styles from './dashboard.module.css'

function normalizar(texto = '') {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function porcentaje(valor, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round((valor / total) * 100)))
}

export default function DashboardHome() {
  const [restaurante, setRestaurante] = useState(null)
  const [stats, setStats] = useState({ referencias: 0, escaneos: 0, escaneosTotales: 0, sommelier: 0, stockBajo: 0, sinStock: 0, platos: 0 })
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [objetivo, setObjetivo] = useState('vender_copas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const objetivoGuardado = window.localStorage.getItem(`cartavinos_objetivo_${rest.id}`)
        if (objetivoGuardado) setObjetivo(objetivoGuardado)
        const { data: vinos } = await supabase.from('vinos').select('id, nombre, bodega, tipo, stock, precio_copa, precio_botella, region, uva, notas_cata, internacional, activo').eq('restaurante_id', rest.id)
        const { data: platos } = await supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true)
        setVinos(vinos || [])
        setPlatos(platos || [])
        const hoy = new Date().toISOString().split('T')[0]
        const { data: statsHoy } = await supabase.from('estadisticas').select('tipo').eq('restaurante_id', rest.id).gte('created_at', hoy)
        const { data: statsTotales } = await supabase.from('estadisticas').select('tipo').eq('restaurante_id', rest.id).eq('tipo', 'escaneo')
        setStats({
          referencias: vinos?.length || 0,
          escaneos: statsHoy?.filter(s => s.tipo === 'escaneo').length || 0,
          escaneosTotales: statsTotales?.length || 0,
          sommelier: statsHoy?.filter(s => s.tipo === 'sommelier').length || 0,
          stockBajo: vinos?.filter(v => v.stock > 0 && v.stock <= 3).length || 0,
          sinStock: vinos?.filter(v => v.stock === 0).length || 0,
          platos: platos?.length || 0,
        })
      }
      setLoading(false)
    }
    cargar()
  }, [])

  async function cerrarSesion() {
    clearAdminRestaurantEmail()
    clearDemoEmail()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function guardarObjetivo(nuevoObjetivo) {
    setObjetivo(nuevoObjetivo)
    if (restaurante?.id) window.localStorage.setItem(`cartavinos_objetivo_${restaurante.id}`, nuevoObjetivo)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 12, letterSpacing: '0.15em', color: '#bbb' }}>CARGANDO</p>
    </div>
  )

  const cardStyle = {
    background: '#fff',
    border: '1px solid #f0f0f0',
    padding: '28px 24px',
    cursor: 'pointer',
    height: '100%',
    boxSizing: 'border-box',
  }

  const iconBox = (color, iconColor, icon) => (
    <div style={{ width: 52, height: 52, borderRadius: 8, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: iconColor }}>
      {icon}
    </div>
  )

  const hover = {
    onMouseEnter: e => { e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)' },
    onMouseLeave: e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.boxShadow = 'none' },
  }

  const vinosActivos = vinos.filter(v => v.activo !== false)
  const tiposConteo = vinosActivos.reduce((acc, vino) => {
    acc[vino.tipo] = (acc[vino.tipo] || 0) + 1
    return acc
  }, {})
  const vinosPorCopa = vinosActivos.filter(v => Number(v.precio_copa) > 0)
  const textoPlato = plato => normalizar(`${plato.nombre} ${plato.descripcion || ''} ${plato.categoria || ''}`)
  const textoVino = vino => normalizar(`${vino.nombre || ''} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
  const vinosConTexto = terminos => vinosActivos.filter(vino => terminos.some(termino => textoVino(vino).includes(termino)))
  const platosConTexto = terminos => platos.filter(plato => terminos.some(termino => textoPlato(plato).includes(termino)))
  const tieneTipo = tipos => vinosActivos.some(vino => tipos.includes(vino.tipo))
  const vinosUnicos = grupos => [...new Map(grupos.flat().filter(Boolean).map(vino => [vino.id, vino])).values()]
  const vinosPorTipo = tipos => vinosActivos.filter(vino => tipos.includes(vino.tipo))
  const esTawnyOPorto = vino => ['tawny', 'porto', 'oporto'].some(termino => textoVino(vino).includes(termino))

  const platosFritura = platosConTexto(['frit', 'croqueta', 'flamenqu', 'rebozado'])
  const platosQueso = platosConTexto(['queso', 'quesos', 'cabra', 'curado'])
  const platosPescado = platosConTexto(['pescado', 'bacalao', 'salmon', 'atun', 'chipiron', 'gamba', 'marisco', 'boqueron'])
  const platosCarneIntensa = platosConTexto(['codillo', 'rabo', 'vaca', 'ternera', 'presa', 'solomillo', 'cerdo', 'cordero', 'brasa'])
  const platosPicante = platosConTexto(['picante', 'pil pil', 'ajillo', 'curry', 'brava'])
  const platosSinRasgos = platos.filter(plato => {
    const texto = textoPlato(plato)
    return !['brasa', 'frito', 'ahumado', 'gratinado', 'salsa dulce', 'picante', 'verdura verde', 'setas', 'trufa', 'frutos secos', 'queso', 'frio', 'umami', 'salino', 'dulce'].some(rasgo => texto.includes(rasgo))
  })

  const vinosFrescos = vinosConTexto(['perfil fresco', 'alta acidez', 'salino', 'mineral'])
  const vinosOxidativos = vinosConTexto(['oxidativo', 'fino', 'manzanilla', 'amontillado', 'oloroso', 'palo cortado'])
  const vinosFloralDulce = vinosConTexto(['floral', 'dulce', 'oxidativo'])
  const tintosEstructura = vinosActivos.filter(vino => vino.tipo === 'tinto' && ['con cuerpo', 'fruta madura', 'tostado', 'madera', 'tanino amable'].some(termino => textoVino(vino).includes(termino)))
  const tintosActivos = vinosActivos.filter(vino => vino.tipo === 'tinto')
  const faltanTintosParaCarta = platosCarneIntensa.length >= 2 && (tintosActivos.length < 3 || tintosEstructura.length < 2)
  const vinosSinPrecio = vinosActivos.filter(vino => !Number(vino.precio_botella))
  const vinosSinPerfil = vinosActivos.filter(vino => !vino.notas_cata || normalizar(vino.notas_cata).length < 12)
  const vinosSinStock = vinosActivos.filter(vino => vino.stock === null || vino.stock === undefined || Number(vino.stock) === 0)
  const vinosTipoDudoso = vinosActivos.filter(vino => !['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja'].includes(vino.tipo))
  const platosSinDescripcion = platos.filter(plato => !plato.descripcion || plato.descripcion.trim().length < 8)
  const platosConPrecio = platos.filter(plato => Number(plato.precio) > 0)
  const platosSinPrecio = platos.filter(plato => !Number(plato.precio))
  const precioMedioPlato = platosConPrecio.length ? platosConPrecio.reduce((sum, plato) => sum + Number(plato.precio), 0) / platosConPrecio.length : 0
  const precioMedioVino = vinosActivos.filter(vino => Number(vino.precio_botella) > 0).length
    ? vinosActivos.filter(vino => Number(vino.precio_botella) > 0).reduce((sum, vino) => sum + Number(vino.precio_botella), 0) / vinosActivos.filter(vino => Number(vino.precio_botella) > 0).length
    : 0
  const platosPremium = platosConPrecio.filter(plato => Number(plato.precio) >= Math.max(20, precioMedioPlato * 1.35))
  const vinosPremium = vinosActivos.filter(vino => Number(vino.precio_botella) >= Math.max(35, precioMedioVino * 1.25))
  const vinosFrituraCandidatos = vinosUnicos([vinosFrescos, vinosPorTipo(['generoso', 'espumoso'])])
    .filter(vino => !['tinto', 'dulce'].includes(vino.tipo) && !esTawnyOPorto(vino))
  const vinosQuesoCandidatos = vinosUnicos([vinosFloralDulce, vinosPorTipo(['generoso', 'dulce', 'blanco', 'rosado'])])
    .filter(vino => vino.tipo !== 'tinto' || ['fruta madura', 'tanino amable', 'oxidativo'].some(termino => textoVino(vino).includes(termino)))
  const vinosPescadoCandidatos = vinosUnicos([vinosFrescos, vinosPorTipo(['blanco', 'rosado', 'espumoso', 'generoso'])])
    .filter(vino => vino.tipo !== 'dulce' && !esTawnyOPorto(vino))
  const vinosCarneCandidatos = vinosUnicos([tintosEstructura, tintosActivos, vinosOxidativos])
    .filter(vino => vino.tipo === 'tinto' || vino.tipo === 'generoso')
  const coberturaSuficiente = item => item.vinos >= Math.min(item.platos, 3)
  const cobertura = [
    { label: 'Frituras', platos: platosFritura.length, vinos: vinosFrituraCandidatos.length, criterio: 'acidez, salinidad, burbuja o generoso seco' },
    { label: 'Quesos', platos: platosQueso.length, vinos: vinosQuesoCandidatos.length, criterio: 'blanco, generoso, dulce u oxidativo segun queso' },
    { label: 'Pescados', platos: platosPescado.length, vinos: vinosPescadoCandidatos.length, criterio: 'blanco, rosado, burbuja, salinidad o generoso seco' },
    { label: 'Carnes', platos: platosCarneIntensa.length, vinos: vinosCarneCandidatos.length, criterio: 'tinto con estructura o generoso con cuerpo' },
  ].filter(item => item.platos > 0).map(item => ({ ...item, suficiente: coberturaSuficiente(item) }))
  const oportunidadTicketAlto = {
    platos: platosPremium.length,
    vinos: vinosPremium.length,
    texto: `${platosPremium.length} platos de precio alto y ${vinosPremium.length} vinos premium detectados`,
  }

  const calidadPlatos = Math.round((porcentaje(platos.length - platosSinDescripcion.length, platos.length) * 0.35) + (porcentaje(platos.length - platosSinRasgos.length, platos.length) * 0.45) + (porcentaje(platos.length - platosSinPrecio.length, platos.length) * 0.2))
  const calidadVinos = Math.round((porcentaje(vinosActivos.length - vinosSinPrecio.length, vinosActivos.length) * 0.4) + (porcentaje(vinosActivos.length - vinosSinPerfil.length, vinosActivos.length) * 0.4) + (porcentaje(vinosActivos.length - vinosTipoDudoso.length, vinosActivos.length) * 0.2))
  const calidadStock = porcentaje(vinosActivos.length - vinosSinStock.length, vinosActivos.length)
  const categoriasConPlato = [platosFritura, platosQueso, platosPescado, platosCarneIntensa].filter(grupo => grupo.length > 0).length
  const categoriasCubiertas = cobertura.length ? cobertura.filter(item => item.suficiente).length : 0
  const calidadMaridaje = categoriasConPlato ? porcentaje(categoriasCubiertas, categoriasConPlato) : Math.min(calidadPlatos, calidadVinos)
  const calidadGlobal = Math.round((calidadPlatos * 0.28) + (calidadVinos * 0.32) + (calidadMaridaje * 0.28) + (calidadStock * 0.12))

  const checksCalidad = [
    { label: 'Carta de platos', valor: calidadPlatos, href: '/dashboard/platos', detalle: `${platosSinDescripcion.length} sin descripción · ${platosSinRasgos.length} sin rasgos · ${platosSinPrecio.length} sin precio` },
    { label: 'Carta de vinos', valor: calidadVinos, href: '/dashboard/vinos', detalle: `${vinosSinPrecio.length} sin precio · ${vinosSinPerfil.length} sin perfil` },
    { label: 'Maridaje', valor: calidadMaridaje, href: '/dashboard', detalle: `${categoriasCubiertas}/${categoriasConPlato || 0} familias con candidatos` },
    { label: 'Stock', valor: calidadStock, href: '/dashboard/vinos', detalle: `${vinosSinStock.length} sin stock actualizado` },
  ]

  const tareasCalidad = [
    platosSinRasgos.length > 0 && { texto: `Completar rasgos de ${platosSinRasgos.length} platos`, href: '/dashboard/platos' },
    platosSinDescripcion.length > 0 && { texto: `Revisar descripción de ${platosSinDescripcion.length} platos`, href: '/dashboard/platos' },
    platosSinPrecio.length > 0 && { texto: `Añadir precio a ${platosSinPrecio.length} platos`, href: '/dashboard/platos' },
    vinosSinPrecio.length > 0 && { texto: `Añadir precio a ${vinosSinPrecio.length} vinos`, href: '/dashboard/vinos' },
    vinosSinPerfil.length > 0 && { texto: `Perfil de cata pendiente en ${vinosSinPerfil.length} vinos`, href: '/dashboard/vinos' },
    vinosSinStock.length > 0 && { texto: `Actualizar stock de ${vinosSinStock.length} referencias`, href: '/dashboard/vinos' },
    vinosTipoDudoso.length > 0 && { texto: `Corregir tipo de ${vinosTipoDudoso.length} vinos`, href: '/dashboard/vinos' },
  ].filter(Boolean).slice(0, 5)

  const zonaRestauranteTexto = normalizar(`${restaurante?.ciudad || ''} ${restaurante?.provincia || ''} ${restaurante?.region || ''}`)
  const terminosZonaBase = zonaRestauranteTexto.split(/[^a-z0-9]+/).filter(termino => termino.length > 3)
  const terminosZonaExtra = zonaRestauranteTexto.includes('malaga')
    ? ['malaga', 'sierras de malaga', 'montes de malaga', 'ronda', 'axarquia']
    : []
  const terminosZona = [...new Set([...terminosZonaBase, ...terminosZonaExtra])]
  const vinosLocales = vinosActivos.filter(vino => {
    const texto = textoVino(vino)
    return terminosZona.some(termino => texto.includes(termino))
  })

  const objetivos = [
    { id: 'vender_copas', label: 'Vender mas por copas', detalle: `${vinosPorCopa.length} referencias marcadas por copa` },
    { id: 'subir_ticket', label: 'Subir ticket medio', detalle: `${vinosPremium.length} vinos premium para defender` },
    { id: 'rotar_stock', label: 'Rotar stock', detalle: 'Prioriza vinos con stock suficiente y maridaje viable' },
    { id: 'vino_local', label: 'Potenciar vino local', detalle: `${vinosLocales.length} vinos de zona detectados` },
  ]

  const diagnosticoCarta = [
    vinosPorCopa.length < Math.max(3, Math.round(vinosActivos.length * 0.15)) && {
      titulo: 'Refuerza los vinos por copa',
      desc: `Ahora tienes ${vinosPorCopa.length} referencias por copa. Para sala, conviene tener opciones claras de blanco fresco, tinto amable y generoso/espumoso si la cocina lo pide.`,
      accion: 'Añadir copa o marcar vinos aptos por copa',
      nivel: 'alto',
    },
    (tiposConteo.blanco || 0) < (tiposConteo.tinto || 0) * 0.35 && {
      titulo: 'La carta se apoya mucho en tintos',
      desc: 'Hay margen para blancos con acidez, salinidad o perfil aromático. Ayudan mucho con frituras, pescados, entrantes y quesos.',
      accion: 'Pedir criterio de selección para blancos gastronómicos',
      consultoria: true,
      nivel: 'medio',
    },
    (tiposConteo.tinto || 0) < Math.max(2, Math.round(vinosActivos.length * 0.2)) && platosCarneIntensa.length > 0 && {
      titulo: 'Faltan tintos defendibles',
      desc: `La carta tiene ${platosCarneIntensa.length} platos de carne, brasa o intensidad, pero solo ${tiposConteo.tinto || 0} tintos activos. Aqui no conviene añadir por añadir: hace falta elegir estilos que cubran cuerpo, frescura, tanino y ticket.`,
      accion: 'Pedir propuesta de tintos al consultor',
      consultoria: true,
      nivel: 'alto',
    },
    platosFritura.length > 0 && !tieneTipo(['generoso', 'espumoso']) && vinosFrescos.length < 2 && {
      titulo: 'Faltan aliados para frituras y rebozados',
      desc: `Hay ${platosFritura.length} platos de fritura o rebozado, pero poca cobertura de generosos secos, burbuja o vinos frescos/salinos.`,
      accion: 'Pedir selección de estilos para fritura',
      consultoria: true,
      nivel: 'alto',
    },
    platosQueso.length > 0 && !tieneTipo(['generoso', 'dulce', 'blanco']) && vinosFloralDulce.length < 1 && {
      titulo: 'Los quesos necesitan más cobertura',
      desc: 'La carta tiene platos con queso, pero faltan estilos que suelen funcionar mejor que el tinto por defecto: fino/manzanilla, blanco floral o dulce/oxidativo según el queso.',
      accion: 'Marcar o incorporar vino floral, oxidativo o dulce',
      nivel: 'alto',
    },
    platosPescado.length > 0 && vinosFrescos.length < 2 && !tieneTipo(['generoso', 'espumoso']) && {
      titulo: 'Pescados con poca red de seguridad',
      desc: `Hay ${platosPescado.length} platos de pescado/marisco. Conviene tener blancos frescos, salinos, generosos secos o espumosos para no caer siempre en la misma referencia.`,
      accion: 'Etiquetar perfiles fresco/salino o añadir alternativas',
      nivel: 'medio',
    },
    platosCarneIntensa.length > 0 && tintosEstructura.length < 2 && !vinosOxidativos.length && {
      titulo: 'Carnes intensas con pocas opciones claras',
      desc: `Hay ${platosCarneIntensa.length} platos de carne intensa o brasa. Si todos los tintos se parecen, el modo camarero rotará peor y venderá siempre los mismos.`,
      accion: faltanTintosParaCarta ? 'Pedir criterio para ampliar tintos' : 'Marcar tintos con cuerpo, fruta madura, tostado o tanino amable',
      consultoria: faltanTintosParaCarta,
      nivel: 'medio',
    },
    platosPicante.length > 0 && !vinosConTexto(['baja graduacion', 'floral', 'dulce', 'perfil fresco']).length && {
      titulo: 'El picante necesita vinos más amables',
      desc: `Hay ${platosPicante.length} platos con ajo/picante. Alcohol alto y tanino suelen complicar la venta; conviene identificar vinos frescos, florales o con algo de dulzor.`,
      accion: 'Crear una opción segura para picante',
      nivel: 'medio',
    },
    platosSinRasgos.length > Math.max(3, Math.round(platos.length * 0.35)) && {
      titulo: 'Faltan rasgos en la carta de comida',
      desc: `${platosSinRasgos.length} platos activos no tienen rasgos claros de maridaje en la descripción. El motor puede recomendarlos, pero afinará menos.`,
      accion: 'Completar chips de platos en Gestión de platos',
      nivel: 'alto',
    },
    objetivo === 'vino_local' && {
      titulo: 'Vino local poco representado',
      desc: `${restaurante?.ciudad ? `El local esta en ${restaurante.ciudad}` : 'La zona del local'} y he detectado ${vinosLocales.length} vinos de la zona en la carta. Potenciar territorio exige revisar bodegas cercanas, distribuidores y estilo de cocina.`,
      accion: vinosLocales.length ? 'Crear narrativa de vino local y elegir referencias de apoyo' : 'Pedir propuesta de bodegas y distribuidores locales',
      consultoria: true,
      nivel: vinosLocales.length >= 3 ? 'medio' : 'alto',
    },
    stats.stockBajo > 0 && {
      titulo: 'Usa el modo camarero para rotar stock',
      desc: `${stats.stockBajo} vinos están en stock bajo. Puedes marcarlos como recomendación prioritaria cuando encajen con el plato.`,
      accion: 'Usar objetivo Rotar stock en sala',
      nivel: 'medio',
    },
    objetivo === 'subir_ticket' && {
      titulo: 'Crea un argumento premium',
      desc: platosPremium.length
        ? `Tienes ${platosPremium.length} platos por encima del precio medio. Son candidatos claros para defender botellas premium y subir ticket.`
        : 'Para subir ticket, no basta enseñar el vino caro: prepara una frase de venta por plato que explique textura, salsa y por qué merece la pena.',
      accion: 'Revisar fichas premium y frases de venta',
      nivel: 'medio',
    },
    platosPremium.length > 0 && vinosPremium.length < Math.max(2, Math.round(platosPremium.length * 0.35)) && {
      titulo: 'Faltan vinos premium para platos de mayor ticket',
      desc: `Hay ${platosPremium.length} platos de precio alto y solo ${vinosPremium.length} vinos claramente premium. Puedes estar perdiendo oportunidad de ticket medio.`,
      accion: 'Pedir propuesta premium alineada con la carta',
      consultoria: true,
      nivel: 'alto',
    },
  ].filter(Boolean)

  const mejoras = diagnosticoCarta.slice(0, 6)
  const oportunidadesConsultoria = diagnosticoCarta.filter(item => item.consultoria)

  const secciones = [
    {
      href: '/dashboard/vinos',
      titulo: 'Carta de vinos',
      desc: 'Gestiona tu lista, añade referencias y controla el stock',
      stat: `${stats.referencias} referencias`,
      color: '#E1F5EE', iconColor: '#0F6E56',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={26} height={26}>
        <path d="M8 3h8l1 9a5 5 0 0 1-10 0L8 3z"/>
        <line x1="7" y1="8" x2="17" y2="8"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
      </svg>
    },
    {
      href: '/dashboard/platos',
      titulo: 'Platos',
      desc: 'Añade y organiza los platos del menú de cocina',
      stat: `${stats.platos} platos activos`,
      color: '#FAECE7', iconColor: '#993C1D',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={26} height={26}>
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 3v9"/><path d="M8 12h8"/>
        <path d="M5.2 17.8A8 8 0 0 0 12 21a8 8 0 0 0 6.8-3.2"/>
      </svg>
    },
    {
      href: '/dashboard/estadisticas',
      titulo: 'Estadísticas',
      desc: 'Escaneos QR, consultas al sommelier y tendencias',
      stat: `${stats.escaneosTotales} escaneos totales`,
      color: '#E6F1FB', iconColor: '#185FA5',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={26} height={26}>
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    },
    {
      href: '/dashboard/qr',
      titulo: 'Mi QR',
      desc: 'Descarga e imprime el código QR de tu carta',
      stat: null,
      color: '#EEEDFE', iconColor: '#534AB7',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={26} height={26}>
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/>
        <rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/>
      </svg>
    },
    {
      href: '/dashboard/personalizar',
      titulo: 'Personalizar',
      desc: 'Colores, logo y apariencia de tu carta pública',
      stat: null,
      color: '#FBEAF0', iconColor: '#993556',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={26} height={26}>
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    },
  ]

  const estadoCarta = calidadGlobal >= 80 ? 'Lista para vender' : calidadGlobal >= 55 ? 'Casi lista' : 'Necesita criterio'
  const metricasPremium = [
    { label: 'Vinos activos', valor: stats.referencias, detalle: `${vinosPorCopa.length} por copa` },
    { label: 'Platos activos', valor: stats.platos, detalle: `${platosConPrecio.length} con precio` },
    { label: 'Consultas hoy', valor: stats.sommelier, detalle: `${stats.escaneos} escaneos hoy` },
    { label: 'Stock a revisar', valor: stats.stockBajo + stats.sinStock, detalle: `${stats.sinStock} sin stock` },
  ]
  const serviciosConsultoria = [
    'Auditoria de bodega',
    'Rediseño carta vinos',
    'Ticket medio',
    'Formacion sala',
    'Distribuidores',
    'Experiencias vino',
  ]
  const consultoriaEmail = 'cataconjuanjo@gmail.com'
  const consultoriaSubject = encodeURIComponent(`Consultoria carta de vinos - ${restaurante?.nombre || 'Restaurante'}`)
  const consultoriaBody = encodeURIComponent(`Hola Juanjo,\n\nMe gustaria solicitar una consultoria para revisar la carta de vinos de ${restaurante?.nombre || 'mi restaurante'}.\n\nMe interesa especialmente:\n- Auditoria de bodega\n- Rediseno de carta de vinos\n- Ticket medio\n- Seleccion de proveedores o distribuidores\n\nGracias.`)
  const consultoriaHref = `mailto:${consultoriaEmail}?subject=${consultoriaSubject}&body=${consultoriaBody}`

  const accesosPremium = [
    { href: '/dashboard/vinos', titulo: 'Carta de vinos', texto: 'Referencias, precios, copa y stock', stat: `${stats.referencias} referencias` },
    { href: '/dashboard/platos', titulo: 'Platos', texto: 'Contexto para maridaje y ticket', stat: `${stats.platos} activos` },
    { href: '/dashboard/estadisticas', titulo: 'Estadisticas', texto: 'Escaneos, consultas y traccion', stat: `${stats.escaneosTotales} escaneos` },
    { href: '/dashboard/seleccion', titulo: 'Seleccion destacada', texto: 'Vinos con narrativa propia', stat: 'Curadoria' },
    { href: '/dashboard/personalizar', titulo: 'Marca del local', texto: 'Logo, color y presencia publica', stat: 'Identidad' },
    { href: '/dashboard/qr', titulo: 'QR de sala', texto: 'Acceso fisico a la carta digital', stat: 'Operativa' },
  ]

  const dashboardPremium = true
  if (dashboardPremium) return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <p className={styles.eyebrow}>Panel de gestion</p>
          <h1 className={styles.topTitle}>{restaurante?.nombre || 'Carta de vinos'}</h1>
          <p className={styles.topSub}>{restaurante?.ciudad || 'Hospitality wine program'}</p>
        </div>
        <div className={styles.topActions}>
          <a href={`/carta/${restaurante?.slug}`} target="_blank" className={styles.topLink}>Carta publica</a>
          <a href={`/camarero/${restaurante?.slug}`} target="_blank" className={styles.topLink}>Modo camarero</a>
          <button type="button" onClick={cerrarSesion} className={styles.topButton}>Salir</button>
        </div>
      </header>

      <div className={styles.wrap}>
        <section className={styles.summary}>
          <div className={styles.heroPanel}>
            <p className={styles.eyebrow}>Estrategia de vino</p>
            <h2 className={styles.heroTitle}>Del vino correcto al vino que vende y emociona</h2>
            <p className={styles.heroText}>
              Un panel para leer carta, bodega y sala como una sola unidad: rentabilidad, coherencia, rotacion y experiencia del cliente.
            </p>
          </div>
          <div className={styles.scorePanel}>
            <div>
              <p className={styles.eyebrow}>Estado de carta</p>
              <p className={styles.scoreNumber}>{calidadGlobal}%</p>
              <p className={styles.scoreLabel}>{estadoCarta}</p>
            </div>
            <p className={styles.scoreLabel}>Preparacion global: platos, vinos, maridaje y stock.</p>
          </div>
        </section>

        <section className={styles.metricGrid}>
          {metricasPremium.map(metrica => (
            <div key={metrica.label} className={styles.metric}>
              <p className={styles.eyebrow}>{metrica.label}</p>
              <p className={styles.metricValue}>{metrica.valor}</p>
              <p className={styles.metricLabel}>{metrica.detalle}</p>
            </div>
          ))}
        </section>

        <section className={styles.mainGrid}>
          <div>
            <div className={styles.panelDark}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Diagnostico de carta</p>
                  <h2 className={styles.panelTitle}>Huecos entre vino, cocina y venta</h2>
                  <p className={styles.panelSub}>Prioriza lo que afecta a venta sugerida, ticket medio y coherencia de la bodega.</p>
                </div>
                <span className={styles.badge}>{mejoras.length} alertas</span>
              </div>

              {mejoras.length > 0 ? (
                <div className={styles.diagnosticList}>
                  {mejoras.map(mejora => (
                    <article key={mejora.titulo} className={styles.diagnosticItem}>
                      <div>
                        <h3 className={styles.diagnosticTitle}>{mejora.titulo}</h3>
                        <p className={styles.diagnosticText}>{mejora.desc}</p>
                        <p className={styles.diagnosticAction}>{mejora.accion}</p>
                        {mejora.consultoria && <p className={styles.consultLabel}>Requiere criterio de consultor</p>}
                      </div>
                      <span className={`${styles.level} ${mejora.nivel === 'alto' ? styles.levelHigh : styles.levelMedium}`}>
                        {mejora.nivel}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className={styles.empty}>No hay alertas importantes ahora mismo.</p>
              )}

              {tareasCalidad.length > 0 && (
                <div className={styles.taskList}>
                  {tareasCalidad.map(tarea => (
                    <Link key={tarea.texto} href={tarea.href} className={styles.taskLink}>{tarea.texto}</Link>
                  ))}
                </div>
              )}
            </div>

            {cobertura.length > 0 && (
              <>
                <div className={styles.coverageIntro}>
                  <p className={styles.eyebrow}>Cobertura orientativa de maridaje</p>
                  <p>Estos numeros no son maridajes cerrados. Indican cuantos vinos candidatos hay por estilo, tipo y notas de cata para cada familia de platos.</p>
                </div>
                <div className={styles.coverageGrid}>
                  {cobertura.map(item => {
                    return (
                      <div key={item.label} className={styles.coverageItem}>
                        <p className={styles.coverageName}>{item.label}</p>
                        <p className={styles.coverageNumber}>{item.platos}</p>
                        <p className={styles.coverageText}>{item.vinos} vinos candidatos detectados</p>
                        <p className={styles.coverageHint}>{item.criterio}</p>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {oportunidadTicketAlto.platos > 0 && (
              <div className={styles.ticketInsight}>
                <div>
                  <p className={styles.eyebrow}>Ticket alto</p>
                  <p className={styles.ticketTitle}>{oportunidadTicketAlto.texto}</p>
                  <p className={styles.ticketText}>Esto no es una familia de maridaje: mide si hay botellas premium suficientes para defender platos de mayor precio y subir ticket medio con sentido.</p>
                </div>
                <Link href="/dashboard/vinos" className={styles.ticketLink}>Revisar vinos premium</Link>
              </div>
            )}
          </div>

          <aside>
            <section className={styles.consultPanel}>
              <p className={styles.eyebrow}>Consultoria disponible</p>
              <p className={styles.quote}>Criterio experto para que la carta venda sin perder identidad.</p>
              <p className={styles.consultText}>
                Cuando el diagnostico detecta huecos de compra, pricing, proveedores o formacion, la app lo marca como oportunidad consultiva.
              </p>
              <a href={consultoriaHref} className={styles.consultButton}>Solicitar consultoria</a>
              <div className={styles.serviceTags}>
                {serviciosConsultoria.map(servicio => (
                  <span key={servicio} className={styles.serviceTag}>{servicio}</span>
                ))}
              </div>
              {oportunidadesConsultoria.length > 0 && (
                <p className={styles.consultLabel}>{oportunidadesConsultoria.length} oportunidades activas</p>
              )}
            </section>

            <section className={`${styles.panel} ${styles.sectionSpace}`}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Objetivo comercial</p>
                  <h2 className={styles.panelTitle}>Prioridad de sala</h2>
                </div>
              </div>
              <div className={styles.objectiveGrid}>
                {objetivos.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => guardarObjetivo(item.id)}
                    className={`${styles.objectiveButton} ${objetivo === item.id ? styles.objectiveActive : ''}`}
                  >
                    <span>{item.label}</span>
                    <small>{item.detalle}</small>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className={styles.quickGrid}>
          {accesosPremium.map((item, index) => (
            <Link key={item.href} href={item.href} className={`${styles.quickCard} ${index === 0 ? styles.quickCardDark : ''}`}>
              <div>
                <p className={styles.moduleLabel}>Modulo</p>
                <h3 className={styles.quickTitle}>{item.titulo}</h3>
                <p className={styles.quickText}>{item.texto}</p>
              </div>
              <div className={styles.quickFooter}>
                <p className={styles.quickStat}>{item.stat}</p>
                <span className={styles.moduleArrow}>Abrir pantalla -&gt;</span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 1, height: 32, background: '#e8e8e8' }} />
          <div>
            <p style={{ fontSize: 15, fontWeight: 400, color: '#111', margin: 0, fontFamily: 'Georgia, serif' }}>{restaurante?.nombre}</p>
            <p style={{ fontSize: 11, color: '#bbb', margin: 0, letterSpacing: '0.05em' }}>{restaurante?.ciudad}</p>
          </div>
        </div>
        <button onClick={cerrarSesion} style={{ background: 'none', border: '1px solid #e8e8e8', color: '#aaa', padding: '6px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 12, letterSpacing: '0.05em' }}>
          Salir
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>

        {/* Bienvenida */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Panel de gestión</p>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: '#111', margin: 0, fontFamily: 'Georgia, serif' }}>{restaurante?.nombre}</h1>
        </div>

        <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, marginBottom: 22 }}>
            <div>
              <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px' }}>Estado de la carta</p>
              <p style={{ fontSize: 20, color: '#111', margin: 0, fontFamily: 'Georgia, serif', fontWeight: 300 }}>
                {calidadGlobal >= 80 ? 'Lista para vender' : calidadGlobal >= 55 ? 'Casi lista' : 'Necesita limpieza'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 36, color: calidadGlobal >= 80 ? '#0F6E56' : calidadGlobal >= 55 ? '#BA7517' : '#993C1D', margin: 0, fontFamily: 'Georgia, serif', fontWeight: 300 }}>{calidadGlobal}%</p>
              <p style={{ fontSize: 11, color: '#bbb', margin: 0 }}>preparación global</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: tareasCalidad.length ? 20 : 0 }}>
            {checksCalidad.map(check => (
              <Link key={check.label} href={check.href} style={{ textDecoration: 'none' }}>
                <div style={{ border: '1px solid #f0f0f0', padding: 14, height: '100%', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <p style={{ fontSize: 12, color: '#111', margin: 0, fontWeight: 500 }}>{check.label}</p>
                    <p style={{ fontSize: 12, color: check.valor >= 80 ? '#0F6E56' : check.valor >= 55 ? '#BA7517' : '#993C1D', margin: 0 }}>{check.valor}%</p>
                  </div>
                  <div style={{ height: 5, background: '#f1f1f1', overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: `${check.valor}%`, height: '100%', background: check.valor >= 80 ? '#0F6E56' : check.valor >= 55 ? '#BA7517' : '#993C1D' }} />
                  </div>
                  <p style={{ fontSize: 11, color: '#aaa', margin: 0, lineHeight: 1.4 }}>{check.detalle}</p>
                </div>
              </Link>
            ))}
          </div>

          {tareasCalidad.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {tareasCalidad.map(tarea => (
                <Link key={tarea.texto} href={tarea.href} style={{ textDecoration: 'none' }}>
                  <span style={{ display: 'inline-block', border: '1px solid #e8e8e8', color: '#777', background: '#fafafa', borderRadius: 20, padding: '7px 11px', fontSize: 11 }}>
                    {tarea.texto}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #f0f0f0', padding: '24px', marginBottom: 24 }}>
          <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>Objetivo comercial</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {objetivos.map(item => (
              <button key={item.id} onClick={() => guardarObjetivo(item.id)} style={{
                background: objetivo === item.id ? '#111' : '#fafafa',
                color: objetivo === item.id ? '#fff' : '#888',
                border: '1px solid #e8e8e8',
                padding: '9px 14px',
                borderRadius: 8,
                fontSize: 12,
                cursor: 'pointer'
              }}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {oportunidadesConsultoria.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #eadfcb', padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18 }}>
              <div>
                <p style={{ fontSize: 10, color: '#BA7517', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px' }}>Oportunidad de consultoría</p>
                <p style={{ fontSize: 18, color: '#111', margin: '0 0 6px', fontFamily: 'Georgia, serif', fontWeight: 300 }}>
                  La carta pide criterio profesional
                </p>
                <p style={{ fontSize: 12, color: '#777', lineHeight: 1.6, margin: 0 }}>
                  Hay decisiones de compra o reposicionamiento que la app detecta, pero conviene resolver con una propuesta de selección: estilos, rango de precio, margen y platos objetivo.
                </p>
              </div>
              <span style={{ fontSize: 12, color: '#111', background: '#F6E7CC', borderRadius: 20, padding: '7px 11px', whiteSpace: 'nowrap' }}>
                {oportunidadesConsultoria.length} oportunidades
              </span>
            </div>
          </div>
        )}

        {cobertura.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cobertura.length, 4)}, minmax(0, 1fr))`, gap: 1, background: '#f0f0f0', border: '1px solid #f0f0f0', marginBottom: 24 }}>
            {cobertura.map(item => {
              const suficiente = item.vinos >= Math.min(item.platos, 3)
              return (
                <div key={item.label} style={{ background: '#fff', padding: '18px 16px' }}>
                  <p style={{ fontSize: 10, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 8px' }}>{item.label}</p>
                  <p style={{ fontSize: 24, fontWeight: 300, color: '#111', margin: 0, fontFamily: 'Georgia, serif' }}>{item.platos}</p>
                  <p style={{ fontSize: 11, color: suficiente ? '#4A8C6F' : '#BA7517', margin: '6px 0 0' }}>
                    {item.vinos} vinos candidatos detectados
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {mejoras.length > 0 && (
          <div style={{ background: '#111', padding: '24px', marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 6px' }}>Diagnóstico de carta</p>
                <p style={{ fontSize: 18, color: '#fff', margin: 0, fontFamily: 'Georgia, serif', fontWeight: 300 }}>Huecos entre cocina, vino y venta</p>
              </div>
              <span style={{ fontSize: 11, color: '#111', background: '#fff', borderRadius: 20, padding: '6px 10px', whiteSpace: 'nowrap' }}>
                {mejoras.length} alertas
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {mejoras.map(mejora => (
                <div key={mejora.titulo} style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <p style={{ fontSize: 14, color: '#fff', margin: 0, fontWeight: 500 }}>{mejora.titulo}</p>
                    <span style={{ fontSize: 9, color: mejora.nivel === 'alto' ? '#111' : '#ddd', background: mejora.nivel === 'alto' ? '#fff' : '#333', borderRadius: 20, padding: '3px 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {mejora.nivel}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6 }}>{mejora.desc}</p>
                  <p style={{ fontSize: 11, color: '#fff', margin: '12px 0 0', lineHeight: 1.4 }}>{mejora.accion}</p>
                  {mejora.consultoria && (
                    <p style={{ fontSize: 10, color: '#C4A55A', margin: '8px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Requiere criterio de consultor</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tarjetas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

          {secciones.map(s => (
            <Link key={s.href} href={s.href} style={{ textDecoration: 'none' }}>
              <div style={cardStyle} {...hover}>
                {iconBox(s.color, s.iconColor, s.icon)}
                <p style={{ fontSize: 15, fontWeight: 500, color: '#111', margin: '0 0 4px' }}>{s.titulo}</p>
                <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 10px', lineHeight: 1.6 }}>{s.desc}</p>
                {s.stat && <p style={{ fontSize: 12, fontWeight: 500, color: '#555', margin: 0 }}>{s.stat}</p>}
              </div>
            </Link>
          ))}

          {/* Ver carta pública */}
          <a href={`/carta/${restaurante?.slug}`} target="_blank" style={{ textDecoration: 'none' }}>
            <div style={cardStyle} {...hover}>
              {iconBox('#E1F5EE', '#0F6E56',
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={26} height={26}>
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              )}
              <p style={{ fontSize: 15, fontWeight: 500, color: '#111', margin: '0 0 4px' }}>Ver carta pública</p>
              <p style={{ fontSize: 12, color: '#aaa', margin: 0, lineHeight: 1.6 }}>Así la ven tus clientes al escanear el QR</p>
            </div>
          </a>

          {/* Modo camarero */}
          <a href={`/camarero/${restaurante?.slug}`} target="_blank" style={{ textDecoration: 'none' }}>
            <div style={cardStyle} {...hover}>
              {iconBox('#F1EFE8', '#5F5E5A',
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width={26} height={26}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              )}
              <p style={{ fontSize: 15, fontWeight: 500, color: '#111', margin: '0 0 4px' }}>Modo camarero</p>
              <p style={{ fontSize: 12, color: '#aaa', margin: 0, lineHeight: 1.6 }}>Vista simplificada para el personal de sala</p>
            </div>
          </a>

        </div>
      </div>
    </main>
  )
}
