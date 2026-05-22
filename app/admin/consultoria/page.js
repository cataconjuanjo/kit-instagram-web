'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { isAdminEmail, setAdminRestaurantEmail } from '../../demo'

function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function pct(valor, total) {
  return total ? Math.round((valor / total) * 100) : 0
}

function decimal(valor) {
  return Number(valor) || 0
}

function eur(valor) {
  return `${decimal(valor).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`
}

const IVA_HOSTELERIA = 1.10
const sinIva = valor => decimal(valor) / IVA_HOSTELERIA
const conIva = valor => decimal(valor) * IVA_HOSTELERIA

function ticketReferencia(restaurante, platosActivos, vinosConPrecio) {
  const ticketGuardado = decimal(restaurante.ticket_medio || restaurante.ticket_medio_comida || restaurante.ticket_comida)
  if (ticketGuardado > 0) return { valor: ticketGuardado, fuente: 'ticket configurado' }
  const platosConPrecio = platosActivos.filter(p => decimal(p.precio) > 0)
  if (platosConPrecio.length) {
    const mediaPlato = platosConPrecio.reduce((sum, p) => sum + decimal(p.precio), 0) / platosConPrecio.length
    return { valor: Math.round(mediaPlato * 2.2), fuente: 'estimado por carta de comida' }
  }
  const mediaVino = vinosConPrecio.length
    ? vinosConPrecio.reduce((sum, v) => sum + decimal(v.precio_botella), 0) / vinosConPrecio.length
    : 30
  return { valor: Math.round(Math.max(22, mediaVino * 0.9)), fuente: 'estimado por precio de vino' }
}

function mapaPrecios(vinosConPrecio, ticket) {
  const total = vinosConPrecio.length
  const ticketSinIva = sinIva(ticket)
  const rangos = [
    { id: 'baja', label: 'Gama baja', objetivo: 20, min: 0, max: Math.max(sinIva(18), ticketSinIva * 0.45) },
    { id: 'media', label: 'Gama media', objetivo: 45, min: Math.max(sinIva(18), ticketSinIva * 0.45), max: Math.max(sinIva(28), ticketSinIva * 0.75) },
    { id: 'alta', label: 'Gama alta', objetivo: 15, min: Math.max(sinIva(28), ticketSinIva * 0.75), max: Math.max(sinIva(55), ticketSinIva * 1.8) },
    { id: 'muy_alta', label: 'Muy alta', objetivo: 15, min: Math.max(sinIva(55), ticketSinIva * 1.8), max: Math.max(sinIva(95), ticketSinIva * 3) },
    { id: 'premium', label: 'Premium', objetivo: 5, min: Math.max(sinIva(95), ticketSinIva * 3), max: Infinity },
  ]
  const gamas = rangos.map(rango => {
    const vinos = vinosConPrecio.filter(v => {
      const precio = sinIva(v.precio_botella)
      return precio > rango.min && precio <= rango.max
    })
    const real = pct(vinos.length, total)
    return {
      ...rango,
      vinos: vinos.length,
      real,
      diferencia: real - rango.objetivo,
      rangoTexto: rango.max === Infinity
        ? `>${Math.round(conIva(rango.min))}`
        : `${Math.round(conIva(rango.min + 1))}-${Math.round(conIva(rango.max))}`
    }
  })
  const desajustes = gamas
    .filter(g => Math.abs(g.diferencia) >= 10 || (g.objetivo > 0 && g.vinos === 0))
    .map(g => `${g.label}: ${g.real}% real vs ${g.objetivo}% objetivo`)
  return { gamas, desajustes, base: 'calculo_sin_iva_muestra_con_iva' }
}

function haceDiasISO(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function incluye(texto, terminos) {
  const limpio = normalizar(texto)
  return terminos.some(termino => limpio.includes(normalizar(termino)))
}

function textoVino(vino) {
  return `${vino.nombre || ''} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`
}

function textoPlato(plato) {
  return `${plato.nombre || ''} ${plato.descripcion || ''} ${plato.categoria || ''}`
}

function analizar(restaurante, vinos = [], platos = [], estadisticas = [], propuestas = []) {
  const activos = vinos.filter(vino => vino.activo !== false)
  const platosActivos = platos.filter(plato => plato.activo !== false)
  const total = activos.length
  const tipos = activos.reduce((acc, vino) => {
    acc[vino.tipo || 'sin_tipo'] = (acc[vino.tipo || 'sin_tipo'] || 0) + 1
    return acc
  }, {})
  const regiones = activos.reduce((acc, vino) => {
    const region = normalizar(vino.region || '')
    if (!region) return acc
    const clave = region.includes('rioja') ? 'rioja' : region.includes('ribera') ? 'ribera' : region
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})

  const porCopa = activos.filter(v => Number(v.precio_copa) > 0)
  const sinPrecio = activos.filter(v => !Number(v.precio_botella))
  const sinPerfil = activos.filter(v => !v.notas_cata || normalizar(v.notas_cata).length < 12)
  const sinAnada = activos.filter(v => !v.anada)
  const sinStock = activos.filter(v => Number(v.stock) === 0)
  const sinCoste = activos.filter(v => !decimal(v.coste_compra))
  const sinProveedor = activos.filter(v => !v.proveedor)
  const sinStockMinimo = activos.filter(v => !decimal(v.stock_minimo))
  const bajoMinimo = activos.filter(v => decimal(v.stock_minimo) > 0 && decimal(v.stock) <= decimal(v.stock_minimo))
  const conMargen = activos.filter(v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0)
  const margenMedio = conMargen.length
    ? Math.round(conMargen.reduce((sum, v) => sum + (((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100), 0) / conMargen.length)
    : null
  const margenBajo = conMargen.filter(v => (((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100) < 55)
  const valorCoste = activos.reduce((sum, v) => sum + decimal(v.stock) * decimal(v.coste_compra), 0)
  const valorVenta = activos.reduce((sum, v) => sum + decimal(v.stock) * decimal(v.precio_botella), 0)

  const dulces = activos.filter(v => v.tipo === 'dulce' || incluye(textoVino(v), ['dulce', 'moscatel', 'px', 'pedro ximenez', 'sauternes', 'tokaji']))
  const generosos = activos.filter(v => v.tipo === 'generoso' || incluye(textoVino(v), ['fino', 'manzanilla', 'amontillado', 'oloroso', 'palo cortado']))
  const espumosos = activos.filter(v => v.tipo === 'espumoso' || incluye(textoVino(v), ['cava', 'champagne', 'corpinnat', 'ancestral', 'brut']))
  const frescos = activos.filter(v => incluye(textoVino(v), ['fresco', 'alta acidez', 'salino', 'mineral', 'albarino', 'riesling', 'godello']))
  const tintosMadera = activos.filter(v => v.tipo === 'tinto' && incluye(textoVino(v), ['madera', 'tostado', 'crianza', 'reserva', 'roble']))

  const platosPostre = platosActivos.filter(p => incluye(textoPlato(p), ['postre', 'tarta', 'queso', 'torrija', 'helado', 'brownie', 'chocolate']))
  const platosFritura = platosActivos.filter(p => incluye(textoPlato(p), ['frit', 'croqueta', 'rebozado', 'flamenquin']))
  const platosPescado = platosActivos.filter(p => incluye(textoPlato(p), ['pescado', 'marisco', 'gamba', 'atun', 'salmon', 'bacalao', 'boqueron']))
  const platosQueso = platosActivos.filter(p => incluye(textoPlato(p), ['queso', 'quesos', 'curado', 'cabra']))
  const platosCarne = platosActivos.filter(p => incluye(textoPlato(p), ['brasa', 'vaca', 'ternera', 'presa', 'solomillo', 'rabo', 'cordero', 'cerdo']))

  const zona = normalizar(`${restaurante.ciudad || ''} ${restaurante.provincia || ''}`)
  const terminosLocales = [
    ...zona.split(/[^a-z0-9]+/).filter(t => t.length > 3),
    zona.includes('malaga') && 'sierras de malaga',
    zona.includes('jerez') && 'jerez',
    zona.includes('cadiz') && 'cadiz'
  ].filter(Boolean)
  const locales = terminosLocales.length
    ? activos.filter(v => terminosLocales.some(t => normalizar(textoVino(v)).includes(t)))
    : []

  const vinosConPrecio = activos.filter(v => Number(v.precio_botella) > 0)
  const platosConPrecio = platosActivos.filter(p => Number(p.precio) > 0)
  const ticket = ticketReferencia(restaurante, platosActivos, vinosConPrecio)
  const wineMapping = mapaPrecios(vinosConPrecio, ticket.valor)
  const precioMedioVino = vinosConPrecio.reduce((sum, v, _, arr) => sum + Number(v.precio_botella) / arr.length, 0)
  const precioMedioPlato = platosConPrecio.reduce((sum, p, _, arr) => sum + Number(p.precio) / arr.length, 0)
  const vinosPremium = activos.filter(v => Number(v.precio_botella) >= Math.max(35, precioMedioVino * 1.35))
  const platosPremium = platosActivos.filter(p => Number(p.precio) >= Math.max(20, precioMedioPlato * 1.35))

  const eventosVenta = estadisticas.filter(e => e.tipo === 'venta').map(e => ({ ...e, parsed: leerDetalle(e.detalle) }))
  const escaneos30 = estadisticas.filter(e => e.tipo === 'escaneo').length
  const sommelier30 = estadisticas.filter(e => e.tipo === 'sommelier').length
  const ventasMarcadas = eventosVenta.filter(e => e.parsed?.resultado === 'vendida')
  const incidenciasStock = eventosVenta.filter(e => ['no_stock', 'agotado'].includes(e.parsed?.resultado))
  const dudasSala = eventosVenta.filter(e => ['no_convence', 'otra'].includes(e.parsed?.resultado))
  const propuestasAbiertas = propuestas.filter(p => p.estado !== 'descartada' && p.estado !== 'incorporada')
  const propuestasInteresan = propuestas.filter(p => p.estado === 'interesa')
  const vinosConDudas = Object.entries(dudasSala.reduce((acc, evento) => {
    const clave = evento.parsed?.vino || evento.parsed?.vino_id || 'Vino sin identificar'
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3)

  const alertas = []
  const oportunidad = (peso, titulo, detalle, servicio) => alertas.push({ peso, titulo, detalle, servicio })

  if (total < 8) oportunidad(14, 'Carta de vinos muy corta', 'Hay pocas referencias para construir relato, margen y maridajes por familias de platos.', 'Diseno de carta base')
  if (porCopa.length < Math.max(3, Math.round(total * 0.12))) oportunidad(12, 'Poca estrategia por copa', `${porCopa.length} referencias por copa sobre ${total}. Falta palanca de rotación y ticket medio.`, 'Programa de vinos por copa')
  if (locales.length < Math.max(2, Math.round(total * 0.08))) oportunidad(13, 'Vino local débil', `${locales.length} referencias locales detectadas. Hay margen para identidad territorial y storytelling.`, 'Selección de bodegas locales')
  if (platosPostre.length >= 2 && dulces.length === 0) oportunidad(15, 'Postres sin vino de cierre', `${platosPostre.length} platos/postres detectados y ningun vino dulce claro.`, 'Maridaje postres y venta sugerida')
  if (platosFritura.length >= 2 && generosos.length + espumosos.length < 2) oportunidad(13, 'Frituras sin aliados claros', 'Faltan generosos secos, burbuja o blancos salinos para vender con frituras/rebozados.', 'Ajuste de estilos por cocina')
  if (platosPescado.length >= 2 && frescos.length + espumosos.length + generosos.length < 3) oportunidad(10, 'Pescados con poca cobertura fresca', 'Pocos vinos frescos, salinos, blancos o burbuja para pescado y marisco.', 'Rediseno por maridaje')
  if (platosQueso.length >= 1 && generosos.length + dulces.length < 2) oportunidad(9, 'Quesos sin recorrido de maridaje', 'Hay queso en carta pero poca cobertura de generoso, oxidativo o dulce.', 'Experiencia de quesos y vino')
  if (platosCarne.length >= 2 && (tipos.tinto || 0) < 4) oportunidad(8, 'Carnes con pocos tintos defendibles', 'La cocina pide tintos con perfiles distintos, no solo una opción genérica.', 'Curaduría de tintos')
  if (pct((regiones.rioja || 0) + (regiones.ribera || 0), total) > 35) oportunidad(12, 'Exceso Rioja/Ribera', `${pct((regiones.rioja || 0) + (regiones.ribera || 0), total)}% de la carta está concentrada en Rioja/Ribera.`, 'Diversificación de regiones')
  if (pct(tintosMadera.length, total) > 28) oportunidad(8, 'Perfil tinto demasiado parecido', 'Muchos tintos parecen apoyarse en madera/crianza; puede cansar y limitar maridajes.', 'Arquitectura de estilos')
  if ((tipos.blanco || 0) < (tipos.tinto || 0) * 0.35 && platosPescado.length + platosFritura.length > 2) oportunidad(9, 'Faltan blancos gastronómicos', 'La cocina da razones para vender blancos, pero la carta se apoya demasiado en tintos.', 'Selección de blancos')
  if (vinosPremium.length < Math.max(2, Math.round(platosPremium.length * 0.5)) && platosPremium.length > 1) oportunidad(8, 'Ticket alto sin vinos premium suficientes', `${platosPremium.length} platos de ticket alto y ${vinosPremium.length} vinos premium claros.`, 'Subida de ticket medio')
  if (sinPerfil.length > total * 0.35) oportunidad(7, 'Faltan argumentos de venta', `${sinPerfil.length} vinos sin perfil de cata útil para sala.`, 'Formación de sala')
  if (sinPrecio.length > 0) oportunidad(6, 'Vinos sin precio', `${sinPrecio.length} referencias sin precio de botella.`, 'Auditoria operativa')
  if (sinAnada.length > total * 0.35) oportunidad(5, 'Anadas poco cuidadas', `${sinAnada.length} referencias sin anada.`, 'Limpieza de carta')
  if (sinStock.length > total * 0.25) oportunidad(5, 'Stock poco fiable', `${sinStock.length} referencias con stock cero.`, 'Control de bodega')
  if (sinCoste.length > total * 0.35) oportunidad(12, 'No se está midiendo rentabilidad real', `${sinCoste.length} vinos sin coste de compra. Sin eso no hay margen, solo intuición.`, 'Auditoría de margen y bodega')
  if (margenBajo.length > 0) oportunidad(11, 'Margen bajo en referencias con datos', `${margenBajo.length} vinos bajan del 55% de margen estimado. Puede haber compra cara o PVP mal defendido.`, 'Pricing y beverage cost')
  if (bajoMinimo.length > 0) oportunidad(9, 'Reposición pendiente', `${bajoMinimo.length} vinos están por debajo del stock mínimo configurado.`, 'Rutina de compras')
  if (sinProveedor.length > total * 0.4) oportunidad(8, 'Proveedores poco trazados', `${sinProveedor.length} vinos sin proveedor. Hay margen para ordenar compra y negociación.`, 'Mapa de proveedores')
  if (wineMapping.desajustes.length > 0) oportunidad(12, 'Mapa de precios descompensado', wineMapping.desajustes.slice(0, 2).join('. '), 'Wine mapping y arquitectura de precios')
  if (incidenciasStock.length >= 2) oportunidad(10, 'Sala está encontrando roturas de stock', `${incidenciasStock.length} incidencias marcadas en los últimos 30 días.`, 'Control de servicio y reposición')
  if (dudasSala.length >= 3) oportunidad(9, 'Vinos que no terminan de convencer en sala', `${dudasSala.length} dudas o cambios marcados. Puede faltar argumento, precio o alternativa.`, 'Formación de sala')
  if (propuestasInteresan.length > 0) oportunidad(14, 'Cliente caliente con propuestas abiertas', `${propuestasInteresan.length} propuestas marcadas como interesan. Buen momento para cerrar acción.`, 'Seguimiento comercial')
  if (propuestasAbiertas.length > 3) oportunidad(6, 'Propuestas acumuladas sin cierre', `${propuestasAbiertas.length} propuestas abiertas. Conviene simplificar y llevar una decisión concreta.`, 'Seguimiento de propuestas')

  const alertasOrdenadas = alertas.sort((a, b) => b.peso - a.peso)
  const score = Math.min(100, Math.round(alertasOrdenadas.reduce((sum, a) => sum + a.peso, 0)))
  const prioridad = score >= 65 ? 'Alta' : score >= 35 ? 'Media' : 'Baja'
  const servicios = [...new Set(alertasOrdenadas.map(a => a.servicio))].slice(0, 3)
  const propuesta = alertasOrdenadas.slice(0, 3).map(a => a.titulo).join('. ')
  const siguienteMovimiento = alertasOrdenadas[0]
    ? `${alertasOrdenadas[0].servicio}: ${alertasOrdenadas[0].titulo.toLowerCase()}`
    : 'Mantenimiento fino: revisar relato, sala y pequeñas mejoras de carta'

  return {
    score,
    prioridad,
    alertas: alertasOrdenadas,
    servicios,
    propuesta,
    siguienteMovimiento,
    ventasMarcadas,
    incidenciasStock,
    dudasSala,
    propuestasAbiertas,
    vinosConDudas,
    metricas: {
      vinos: total,
      platos: platosActivos.length,
      copa: porCopa.length,
      locales: locales.length,
      dulces: dulces.length,
      generosos: generosos.length,
      precioMedioVino: Math.round(precioMedioVino || 0),
      margenMedio,
      margenBajo: margenBajo.length,
      bajoMinimo: bajoMinimo.length,
      sinCoste: sinCoste.length,
      sinProveedor: sinProveedor.length,
      sinStockMinimo: sinStockMinimo.length,
      valorCoste,
      valorVenta,
      escaneos30,
      sommelier30
    },
    diagnostico: {
      ticket,
      wineMapping,
      salud: [
        { label: 'Sin precio', valor: sinPrecio.length, total },
        { label: 'Sin anada', valor: sinAnada.length, total },
        { label: 'Sin perfil de venta', valor: sinPerfil.length, total },
        { label: 'Sin coste', valor: sinCoste.length, total },
        { label: 'Sin proveedor', valor: sinProveedor.length, total },
        { label: 'Stock cero', valor: sinStock.length, total },
      ],
      equilibrio: [
        { label: 'Tintos', valor: tipos.tinto || 0 },
        { label: 'Blancos', valor: tipos.blanco || 0 },
        { label: 'Espumosos', valor: tipos.espumoso || 0 },
        { label: 'Generosos', valor: tipos.generoso || 0 },
        { label: 'Dulces', valor: dulces.length },
        { label: 'Por copa', valor: porCopa.length },
        { label: 'Locales', valor: locales.length },
      ]
    }
  }
}

export default function RadarConsultoria() {
  const [user, setUser] = useState(null)
  const [restaurantes, setRestaurantes] = useState([])
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [abierto, setAbierto] = useState(null)
  const [ticketDrafts, setTicketDrafts] = useState({})
  const [guardandoTicket, setGuardandoTicket] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }
      setUser(user)
      const desde = haceDiasISO(30)
      const [{ data: rests }, { data: vinosData }, { data: platosData }, { data: estadisticasData }, { data: propuestasData }] = await Promise.all([
        supabase.from('restaurantes').select('*').order('nombre'),
        supabase.from('vinos').select('*'),
        supabase.from('platos').select('*'),
        supabase.from('estadisticas').select('*').gte('created_at', desde),
        supabase.from('consultor_propuestas').select('*').order('created_at', { ascending: false })
      ])
      setRestaurantes(rests || [])
      setTicketDrafts(Object.fromEntries((rests || []).map(rest => [
        rest.id,
        rest.ticket_medio_comida || rest.ticket_medio || rest.ticket_comida || ''
      ])))
      setVinos(vinosData || [])
      setPlatos(platosData || [])
      setEstadisticas(estadisticasData || [])
      setPropuestas(propuestasData || [])
      setLoading(false)
    }
    cargar()
  }, [])

  const informes = useMemo(() => restaurantes.map(restaurante => {
    const vinosRest = vinos.filter(v => v.restaurante_id === restaurante.id)
    const platosRest = platos.filter(p => p.restaurante_id === restaurante.id)
    const estadisticasRest = estadisticas.filter(e => e.restaurante_id === restaurante.id)
    const propuestasRest = propuestas.filter(p => p.restaurante_id === restaurante.id)
    return { restaurante, ...analizar(restaurante, vinosRest, platosRest, estadisticasRest, propuestasRest) }
  }).sort((a, b) => b.score - a.score), [restaurantes, vinos, platos, estadisticas, propuestas])

  const informesFiltrados = informes.filter(informe => {
    if (filtro === 'alta') return informe.prioridad === 'Alta'
    if (filtro === 'margen') return informe.metricas.sinCoste > 0 || informe.metricas.margenBajo > 0
    if (filtro === 'sala') return informe.dudasSala.length > 0 || informe.incidenciasStock.length > 0
    if (filtro === 'propuestas') return informe.propuestasAbiertas.length > 0
    return true
  })

  function gestionar(restaurante) {
    setAdminRestaurantEmail(restaurante.email)
    window.location.href = '/dashboard'
  }

  async function guardarTicket(informe) {
    const restaurante = informe.restaurante
    const valor = ticketDrafts[restaurante.id]
    setGuardandoTicket(restaurante.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/restaurantes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          ...restaurante,
          ticket_medio_comida: valor === '' ? null : Number(valor)
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el ticket.')
      setRestaurantes(actual => actual.map(rest => rest.id === restaurante.id ? data.restaurante : rest))
    } catch (error) {
      alert(error.message || 'No se pudo guardar el ticket medio.')
    } finally {
      setGuardandoTicket('')
    }
  }

  if (loading) {
    return (
      <main className="admin-page">
        <p className="admin-loading">Cargando radar</p>
      </main>
    )
  }

  const alta = informes.filter(i => i.prioridad === 'Alta').length
  const media = informes.filter(i => i.prioridad === 'Media').length
  const valorCartera = informes.reduce((sum, informe) => sum + informe.metricas.valorCoste, 0)
  const propuestasAbiertas = informes.reduce((sum, informe) => sum + informe.propuestasAbiertas.length, 0)
  const alertasSala = informes.reduce((sum, informe) => sum + informe.incidenciasStock.length + informe.dudasSala.length, 0)
  const filtros = [
    ['todas', 'Todas'],
    ['alta', 'Prioridad alta'],
    ['margen', 'Margen/bodega'],
    ['sala', 'Sala'],
    ['propuestas', 'Propuestas'],
  ]

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div>
          <p className="admin-kicker">Superadmin</p>
          <h1>Radar consultoría</h1>
          <p>{user?.email}</p>
        </div>
      </header>

      <section className="admin-shell">
        <aside className="admin-sidebar">
          <p className="admin-kicker">Consultor</p>
          <Link className="active" href="/admin/consultoria">Radar</Link>
          <Link href="/admin/propuestas">Propuestas</Link>
          <Link href="/admin/proveedores">Proveedores</Link>
          <Link href="/sommelier">Selección Juanjo</Link>
          <Link href="/admin">Restaurantes</Link>
        </aside>

        <div className="admin-main">
        <div className="consult-hero">
          <div>
            <p className="eyebrow">Oportunidades privadas</p>
            <h2>Detecta dónde Carta Viva puede convertirse en consultoría.</h2>
            <p>Lectura estratégica de carta, cocina, margen, stock, proveedores, uso real y argumentos de sala. Esto no se muestra al restaurante.</p>
          </div>
          <div className="consult-summary">
            <strong>{alta}</strong><span>prioridad alta</span>
            <strong>{media}</strong><span>prioridad media</span>
          </div>
        </div>

        {false && <div className="consult-command">
          <article><strong>{eur(valorCartera)}</strong><span>bodega a coste medida</span></article>
          <article><strong>{alertasSala}</strong><span>señales de sala 30 días</span></article>
          <article><strong>{propuestasAbiertas}</strong><span>propuestas abiertas</span></article>
          <article><strong>{informes.filter(i => i.metricas.sinCoste > 0).length}</strong><span>restaurantes sin costes completos</span></article>
        </div>}

        <div className="consult-overview">
          <span>{informes.length} restaurantes</span>
          <span>{alta} prioridad alta</span>
          <span>{media} prioridad media</span>
          <span>{informes.filter(i => i.metricas.sinCoste > 0).length} sin costes completos</span>
          <span>{propuestasAbiertas} propuestas abiertas</span>
        </div>

        <div className="consult-filterbar">
          {filtros.map(([id, label]) => (
            <button key={id} className={filtro === id ? 'active' : ''} onClick={() => setFiltro(id)}>{label}</button>
          ))}
        </div>

        <div className="consult-grid">
          {informesFiltrados.map(informe => (
            <article className="consult-card" key={informe.restaurante.id}>
              <div className="consult-card-head">
                <div>
                  <p className="admin-kicker">{informe.prioridad}</p>
                  <h3>{informe.restaurante.nombre}</h3>
                  <span>{informe.restaurante.ciudad || 'Sin ciudad'} · {informe.metricas.vinos} vinos · {informe.metricas.platos} platos</span>
                  {false && <div className="consult-360-wide strategy-panel">
                    <div className="strategy-head">
                      <div>
                        <span>Diagnóstico estratégico</span>
                        <strong>Mapa de precios y salud de carta</strong>
                      </div>
                      <div className="ticket-editor">
                        <label>Ticket medio comida real</label>
                        <div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={ticketDrafts[informe.restaurante.id] ?? ''}
                            placeholder={`${informe.diagnostico.ticket.valor}`}
                            onChange={e => setTicketDrafts(actual => ({ ...actual, [informe.restaurante.id]: e.target.value }))}
                          />
                          <button onClick={() => guardarTicket(informe)} disabled={guardandoTicket === informe.restaurante.id}>
                            {guardandoTicket === informe.restaurante.id ? 'Guardando' : 'Guardar'}
                          </button>
                        </div>
                        <small>Ahora: {eur(informe.diagnostico.ticket.valor)} PVP IVA incl. · {informe.diagnostico.ticket.fuente}</small>
                      </div>
                    </div>

                    <div className="strategy-grid">
                      <section>
                        <h4>Wine mapping</h4>
                        {informe.diagnostico.wineMapping.gamas.map(gama => (
                          <div className="mapping-row" key={gama.id}>
                            <div>
                              <strong>{gama.label}</strong>
                              <span>{gama.rangoTexto} EUR PVP · {gama.vinos} vinos</span>
                            </div>
                            <div className="mapping-bar"><i style={{ width: `${Math.min(100, gama.real)}%` }} /></div>
                            <b>{gama.real}%</b>
                            <em>obj. {gama.objetivo}%</em>
                          </div>
                        ))}
                      </section>

                      <section>
                        <h4>Salud operativa</h4>
                        <div className="strategy-pills">
                          {informe.diagnostico.salud.map(item => (
                            <span key={item.label} className={item.valor > Math.max(0, item.total * 0.2) ? 'is-warning' : ''}>{item.label}: {item.valor}</span>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h4>Equilibrio comercial</h4>
                        <div className="strategy-pills">
                          {informe.diagnostico.equilibrio.map(item => (
                            <span key={item.label}>{item.label}: {item.valor}</span>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>}
                </div>
                <div className={`consult-score consult-score-${informe.prioridad.toLowerCase()}`}>{informe.score}</div>
              </div>

              <div className="consult-metrics">
                <span>{informe.metricas.copa} copa</span>
                <span>{informe.metricas.locales} locales</span>
                <span>{informe.metricas.dulces} dulces</span>
                <span>{informe.metricas.precioMedioVino} EUR medio</span>
                <span>{informe.metricas.margenMedio ?? '-'}% margen</span>
                <span>{informe.metricas.bajoMinimo} bajo mínimo</span>
              </div>

              <div className="consult-next">
                <span>Siguiente movimiento</span>
                <strong>{informe.siguienteMovimiento}</strong>
              </div>

              {informe.alertas.length ? (
                <div className="consult-alerts">
                  {informe.alertas.slice(0, 3).map(alerta => (
                    <div key={alerta.titulo}>
                      <strong>{alerta.titulo}</strong>
                      <p>{alerta.detalle}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="consult-empty">Sin alertas claras. Oportunidad de mantenimiento o afinado puntual.</div>
              )}

              <div className="consult-services">
                {(informe.servicios.length ? informe.servicios : ['Mantenimiento estratégico']).map(servicio => (
                  <span key={servicio}>{servicio}</span>
                ))}
              </div>

              <div className="consult-actions">
                <button onClick={() => gestionar(informe.restaurante)}>Abrir dashboard</button>
                <a href={`/carta/${informe.restaurante.slug}`} target="_blank" rel="noreferrer">Ver carta</a>
                <button className="consult-secondary" onClick={() => setAbierto(abierto === informe.restaurante.id ? null : informe.restaurante.id)}>Ficha 360</button>
                <Link href={`/admin/informe/${informe.restaurante.id}`}>Ver informe</Link>
                <Link href={`/admin/propuestas?restaurante=${informe.restaurante.id}&titulo=${encodeURIComponent(informe.alertas[0]?.titulo || '')}&motivo=${encodeURIComponent(informe.alertas[0]?.detalle || '')}&prioridad=${informe.prioridad === 'Alta' ? 'alta' : informe.prioridad === 'Media' ? 'media' : 'baja'}`}>Crear propuesta</Link>
              </div>

              {abierto === informe.restaurante.id && (
                <div className="consult-360">
                  <div>
                    <span>Economia</span>
                    <strong>{eur(informe.metricas.valorCoste)} a coste</strong>
                    <p>{eur(informe.metricas.valorVenta)} potencial venta. {informe.metricas.sinCoste} sin coste, {informe.metricas.margenBajo} con margen bajo.</p>
                  </div>
                  <div>
                    <span>Sala</span>
                    <strong>{informe.ventasMarcadas.length} ventas marcadas</strong>
                    <p>{informe.incidenciasStock.length} incidencias stock, {informe.dudasSala.length} dudas/cambios, {informe.metricas.sommelier30} usos maridaje.</p>
                  </div>
                  <div>
                    <span>Compra</span>
                    <strong>{informe.metricas.bajoMinimo} bajo mínimo</strong>
                    <p>{informe.metricas.sinProveedor} sin proveedor, {informe.metricas.sinStockMinimo} sin stock mínimo.</p>
                  </div>
                  <div>
                    <span>Seguimiento</span>
                    <strong>{informe.propuestasAbiertas.length} propuestas abiertas</strong>
                    <p>{informe.propuesta || 'No hay una propuesta comercial clara generada aún.'}</p>
                  </div>
                  {informe.vinosConDudas.length > 0 && (
                    <div className="consult-360-wide">
                      <span>Vinos con fricción en sala</span>
                      <p>{informe.vinosConDudas.map(([vino, total]) => `${vino} (${total})`).join(' · ')}</p>
                    </div>
                  )}
                  <div className="consult-360-wide strategy-panel">
                    <div className="strategy-head">
                      <div>
                        <span>Diagnóstico estratégico</span>
                        <strong>Mapa de precios y salud de carta</strong>
                      </div>
                      <div className="ticket-editor">
                        <label>Ticket medio comida real</label>
                        <div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={ticketDrafts[informe.restaurante.id] ?? ''}
                            placeholder={`${informe.diagnostico.ticket.valor}`}
                            onChange={e => setTicketDrafts(actual => ({ ...actual, [informe.restaurante.id]: e.target.value }))}
                          />
                          <button onClick={() => guardarTicket(informe)} disabled={guardandoTicket === informe.restaurante.id}>
                            {guardandoTicket === informe.restaurante.id ? 'Guardando' : 'Guardar'}
                          </button>
                        </div>
                        <small>Ahora: {eur(informe.diagnostico.ticket.valor)} · {informe.diagnostico.ticket.fuente}</small>
                      </div>
                    </div>

                    <div className="strategy-grid">
                      <section>
                        <h4>Wine mapping</h4>
                        {informe.diagnostico.wineMapping.gamas.map(gama => (
                          <div className="mapping-row" key={gama.id}>
                            <div>
                              <strong>{gama.label}</strong>
                              <span>{gama.rangoTexto} EUR · {gama.vinos} vinos</span>
                            </div>
                            <div className="mapping-bar"><i style={{ width: `${Math.min(100, gama.real)}%` }} /></div>
                            <b>{gama.real}%</b>
                            <em>obj. {gama.objetivo}%</em>
                          </div>
                        ))}
                      </section>

                      <section>
                        <h4>Salud operativa</h4>
                        <div className="strategy-pills">
                          {informe.diagnostico.salud.map(item => (
                            <span key={item.label} className={item.valor > Math.max(0, item.total * 0.2) ? 'is-warning' : ''}>{item.label}: {item.valor}</span>
                          ))}
                        </div>
                      </section>

                      <section>
                        <h4>Equilibrio comercial</h4>
                        <div className="strategy-pills">
                          {informe.diagnostico.equilibrio.map(item => (
                            <span key={item.label}>{item.label}: {item.valor}</span>
                          ))}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
        </div>
      </section>
    </main>
  )
}
