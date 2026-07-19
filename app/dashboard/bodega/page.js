'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { actividadRealDesdeISO } from '../../lib/actividadReal'
import { esPerfilBodega } from '../../lib/plans'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import styles from '../module.module.css'
import ResponsiveOverlay from '../ResponsiveOverlay'

function eur(valor) {
  return `${(Number(valor) || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`
}

function decimal(valor) {
  return Number(valor) || 0
}

function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function telefonoWhatsApp(telefono = '') {
  const limpio = String(telefono || '').replace(/[^\d+]/g, '')
  if (!limpio) return ''
  if (limpio.startsWith('+')) return limpio.slice(1)
  if (limpio.length === 9) return `34${limpio}`
  return limpio.replace(/^\+/, '')
}

function margen(vino) {
  const venta = decimal(vino.precio_botella)
  const coste = decimal(vino.coste_compra)
  if (!venta || !coste) return null
  return Math.round(((venta - coste) / venta) * 100)
}

function margenColor(valor) {
  if (valor == null) return '#8b8278'
  if (valor >= 68) return '#4A8C6F'
  if (valor >= 55) return '#b8860b'
  return '#b85454'
}

function tipoVino(vino) {
  const texto = normalizar([vino.tipo, vino.categoria, vino.color, vino.nombre].filter(Boolean).join(' '))
  if (texto.includes('espum') || texto.includes('champagne') || texto.includes('cava')) return 'Espumosos'
  if (texto.includes('rosado') || texto.includes('rose')) return 'Rosados'
  if (texto.includes('blanco') || texto.includes('albari') || texto.includes('verdejo') || texto.includes('chardonnay')) return 'Blancos'
  if (texto.includes('dulce') || texto.includes('generoso') || texto.includes('jerez') || texto.includes('oloroso') || texto.includes('amontillado')) return 'Especiales'
  return 'Tintos'
}

function bottleTone(vino) {
  const tipo = tipoVino(vino)
  if (tipo === 'Blancos') return 'White'
  if (tipo === 'Espumosos') return 'Sparkling'
  if (tipo === 'Rosados') return 'Rose'
  if (tipo === 'Especiales') return 'Amber'
  return 'Red'
}

const DIAS_PERIODO_ROTACION = 30
const DIAS_ENTREGA_PEDIDO = 7
const STOCK_SEGURIDAD_DEFECTO = 2

function planReposicion(vino, ventasMarcadas = 0) {
  const stock = decimal(vino.stock)
  const minimo = decimal(vino.stock_minimo)
  const ventasDia = ventasMarcadas / DIAS_PERIODO_ROTACION
  const consumoEntrega = ventasDia > 0 ? Math.ceil(ventasDia * DIAS_ENTREGA_PEDIDO) : 0
  const stockSeguridad = minimo > 0 ? minimo : STOCK_SEGURIDAD_DEFECTO
  const puntoPedido = Math.max(minimo, consumoEntrega + stockSeguridad)
  const objetivoBase = Math.max(stockSeguridad * 2, stockSeguridad + 3)
  const objetivo = Math.max(objetivoBase, puntoPedido + consumoEntrega)
  const diasCobertura = ventasDia > 0 ? Math.round(stock / ventasDia) : null
  const pedir = stock <= puntoPedido ? Math.max(1, Math.ceil(objetivo - stock)) : 0
  return {
    ventasMarcadas,
    ventasDia,
    consumoEntrega,
    stockSeguridad,
    puntoPedido: Math.ceil(puntoPedido),
    objetivo: Math.ceil(objetivo),
    diasCobertura,
    pedir,
  }
}

export default function ControlBodega() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [proveedoresContacto, setProveedoresContacto] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [incidencias, setIncidencias] = useState([])
  const [eventosSala, setEventosSala] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [editando, setEditando] = useState(null)
  const [mostrarPropuestas, setMostrarPropuestas] = useState(false)
  const [mostrarReferencias, setMostrarReferencias] = useState(false)
  const [mostrarMovimientos, setMostrarMovimientos] = useState(false)
  const [vistaBodega, setVistaBodega] = useState('resumen')
  const [filtroReferencias, setFiltroReferencias] = useState('todos')
  const [busquedaReferencias, setBusquedaReferencias] = useState('')
  const [pedidoRapido, setPedidoRapido] = useState({})
  const [pedidoManual, setPedidoManual] = useState({})
  const [pedidoCopiado, setPedidoCopiado] = useState(false)
  const [proveedorCopiado, setProveedorCopiado] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardadoBodega, setGuardadoBodega] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const desdeActividad = actividadRealDesdeISO(rest)
        let ventasQuery = Promise.resolve({ data: [] })
        if (desdeActividad) {
          ventasQuery = supabase.from('estadisticas').select('*').eq('restaurante_id', rest.id).eq('tipo', 'venta').gte('created_at', desdeActividad).order('created_at', { ascending: false }).limit(80)
        }
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const proveedoresQuery = token
          ? fetch(`/api/proveedores-visibles?${new URLSearchParams({ restaurante_id: rest.id })}`, { headers: { Authorization: `Bearer ${token}` } })
          : Promise.resolve(null)
        const [{ data: vinosData }, { data: propuestasData }, { data: incidenciasData }, { data: movimientosData }, proveedoresRes] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id).order('nombre'),
          supabase.from('consultor_propuestas').select('*').eq('restaurante_id', rest.id).neq('estado', 'descartada').order('created_at', { ascending: false }),
          ventasQuery,
          supabase.from('movimientos_stock').select('*, vinos(nombre, bodega)').eq('restaurante_id', rest.id).order('created_at', { ascending: false }).limit(10),
          proveedoresQuery,
        ])
        const proveedoresData = proveedoresRes?.ok ? await proveedoresRes.json() : {}
        setVinos(vinosData || [])
        setProveedoresContacto(proveedoresData.proveedores_detalle || [])
        setPropuestas(propuestasData || [])
        setMovimientos(movimientosData || [])
        const eventosVenta = (incidenciasData || []).map(item => {
          try { return { ...item, parsed: JSON.parse(item.detalle || '{}') } } catch { return null }
        }).filter(Boolean)
        setEventosSala(eventosVenta)
        setIncidencias(eventosVenta.filter(item => ['no_stock', 'agotado'].includes(item.parsed?.resultado)))
      }
      setLoading(false)
    }
    cargar()
  }, [])

  useEffect(() => {
    if (loading || typeof window === 'undefined') return
    const hash = window.location.hash
    window.requestAnimationFrame(() => {
      if (hash === '#pedido') setVistaBodega('compras')
      const filtrosPorHash = {
        '#referencias-pendientes': 'pendientes',
        '#referencias-sin-coste': 'sin_coste',
        '#referencias-sin-proveedor': 'sin_proveedor',
        '#referencias-sin-stock': 'sin_stock',
        '#referencias-sin-minimo': 'sin_minimo',
      }
      if (['#referencias', '#proveedores', '#rotacion', '#movimientos', ...Object.keys(filtrosPorHash)].includes(hash)) setVistaBodega('stock')
      if (hash === '#referencias') setMostrarReferencias(true)
      if (filtrosPorHash[hash]) {
        setFiltroReferencias(filtrosPorHash[hash])
        setMostrarReferencias(true)
      }
      if (hash === '#propuestas') {
        setVistaBodega('propuestas')
        setMostrarPropuestas(true)
      }
    })
  }, [loading, propuestas.length])

  const datos = useMemo(() => {
    const ventasPorVino = eventosSala.reduce((acc, evento) => {
      if (evento.parsed?.resultado !== 'vendida') return acc
      const id = evento.parsed?.vino_id
      if (!id) return acc
      acc[id] = (acc[id] || 0) + 1
      return acc
    }, {})
    const activos = vinos
      .filter(vino => vino.activo !== false)
      .map(vino => {
        const reposicion = planReposicion(vino, ventasPorVino[vino.id] || 0)
        return { ...vino, ventasMarcadas: reposicion.ventasMarcadas, reposicion }
      })
    const conCoste = activos.filter(vino => decimal(vino.coste_compra) > 0 && decimal(vino.precio_botella) > 0)
    const valorCoste = activos.reduce((sum, vino) => sum + decimal(vino.stock) * decimal(vino.coste_compra), 0)
    const valorVenta = activos.reduce((sum, vino) => sum + decimal(vino.stock) * decimal(vino.precio_botella), 0)
    const margenMedio = conCoste.length
      ? Math.round(conCoste.reduce((sum, vino) => sum + (margen(vino) || 0), 0) / conCoste.length)
      : null
    const margenPotencial = Math.max(0, valorVenta - valorCoste)
    const bajoMinimo = activos.filter(vino => decimal(vino.stock_minimo) > 0 && decimal(vino.stock) <= decimal(vino.stock_minimo))
    const sinCoste = activos.filter(vino => !decimal(vino.coste_compra))
    const margenBajo = conCoste.filter(vino => (margen(vino) || 0) < 55)
    const sinPrecio = activos.filter(vino => !decimal(vino.precio_botella))
    const sinProveedor = activos.filter(vino => !vino.proveedor)
    const sinStockActual = activos.filter(vino => vino.stock === null || vino.stock === undefined || decimal(vino.stock) === 0)
    const sinStockMinimo = activos.filter(vino => !decimal(vino.stock_minimo))
    const pedido = activos
      .filter(vino => vino.reposicion.pedir > 0 && (decimal(vino.stock_minimo) > 0 || vino.reposicion.ventasMarcadas > 0))
      .map(vino => ({ ...vino, pedir: vino.reposicion.pedir }))
    const pedidoPorProveedor = Object.entries(pedido.reduce((acc, vino) => {
      const proveedor = vino.proveedor?.trim() || 'Sin proveedor'
      acc[proveedor] = acc[proveedor] || []
      acc[proveedor].push(vino)
      return acc
    }, {})).sort((a, b) => a[0].localeCompare(b[0]))
    const proveedores = Object.entries(activos.reduce((acc, vino) => {
      const proveedor = vino.proveedor?.trim() || 'Sin proveedor'
      acc[proveedor] = acc[proveedor] || { refs: 0, coste: 0, venta: 0 }
      acc[proveedor].refs += 1
      acc[proveedor].coste += decimal(vino.stock) * decimal(vino.coste_compra)
      acc[proveedor].venta += decimal(vino.ventasMarcadas) * decimal(vino.precio_botella)
      return acc
    }, {})).map(([proveedor, info]) => [
      proveedor,
      { ...info, retorno: info.coste > 0 ? info.venta / info.coste : null },
    ]).sort((a, b) => b[1].coste - a[1].coste).slice(0, 5)
    const proveedoresExistentes = [...new Set(activos.map(vino => vino.proveedor?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    const sinRotacion = activos
      .filter(vino => decimal(vino.stock) >= Math.max(8, decimal(vino.stock_minimo) * 3) && !ventasPorVino[vino.id])
      .sort((a, b) => (decimal(b.stock) * decimal(b.coste_compra)) - (decimal(a.stock) * decimal(a.coste_compra)))
    const topRotacion = activos
      .map(vino => ({ ...vino, ventasMarcadas: ventasPorVino[vino.id] || 0 }))
      .filter(vino => vino.ventasMarcadas > 0)
      .sort((a, b) => b.ventasMarcadas - a.ventasMarcadas)
      .slice(0, 5)

    return { activos, valorCoste, valorVenta, margenMedio, margenPotencial, bajoMinimo, sinCoste, margenBajo, sinPrecio, sinProveedor, sinStockActual, sinStockMinimo, pedido, pedidoPorProveedor, proveedores, proveedoresExistentes, sinRotacion, topRotacion }
  }, [vinos, eventosSala])
  const contactosPorProveedor = useMemo(() => {
    return Object.fromEntries(proveedoresContacto.map(proveedor => [
      normalizar(proveedor.nombre),
      proveedor,
    ]))
  }, [proveedoresContacto])

  function iniciarEdicion(vino) {
    setError('')
    setGuardadoBodega('')
    setEditando({
      id: vino.id,
      nombre: vino.nombre,
      bodega: vino.bodega,
      stock: vino.stock ?? '',
      precio_botella: vino.precio_botella,
      coste_compra: vino.coste_compra || '',
      stock_minimo: vino.stock_minimo || '',
      proveedor: vino.proveedor || '',
      referencia_proveedor: vino.referencia_proveedor || '',
      formato_compra: vino.formato_compra || '',
    })
  }

  function editarProveedorDesdePedido(vino) {
    setVistaBodega('stock')
    setFiltroReferencias('todos')
    setMostrarReferencias(true)
    iniciarEdicion(vino)
    window.requestAnimationFrame(() => {
      document.getElementById('referencias')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function abrirReferencias(filtro = 'todos') {
    setVistaBodega('stock')
    setFiltroReferencias(filtro)
    setMostrarReferencias(true)
    setEditando(null)
    window.requestAnimationFrame(() => {
      document.getElementById('referencias')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function abrirPropuestas() {
    setVistaBodega('propuestas')
    setMostrarPropuestas(true)
    window.requestAnimationFrame(() => {
      document.getElementById('propuestas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function abrirMovimientos() {
    setVistaBodega('stock')
    setMostrarMovimientos(true)
    window.requestAnimationFrame(() => {
      document.getElementById('movimientos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function abrirAccionBodega(event, href) {
    if (!href?.startsWith('#')) return
    event.preventDefault()
    if (href === '#pedido') {
      setVistaBodega('compras')
      return
    }
    if (href === '#propuestas') {
      abrirPropuestas()
      return
    }
    setVistaBodega('stock')
    if (href === '#movimientos') setMostrarMovimientos(true)
    if (href === '#referencias') setMostrarReferencias(true)
    if (href === '#referencias-pendientes') abrirReferencias('pendientes')
    if (href === '#referencias-sin-coste') abrirReferencias('sin_coste')
    if (href === '#referencias-sin-proveedor') abrirReferencias('sin_proveedor')
    if (href === '#referencias-sin-stock') abrirReferencias('sin_stock')
    if (href === '#referencias-sin-minimo') abrirReferencias('sin_minimo')
  }

  function moverEdicion(direccion) {
    if (!editando || !referenciasVisibles.length) return
    const index = referenciasVisibles.findIndex(vino => vino.id === editando.id)
    if (index < 0) return
    const siguiente = referenciasVisibles[index + direccion]
    if (siguiente) iniciarEdicion(siguiente)
  }

  async function guardarBodega({ cerrar = false, siguiente = false } = {}) {
    if (!editando) return
    setGuardando(true)
    setError('')
    setGuardadoBodega('')
    const cambios = {
      stock: parseInt(editando.stock, 10) || 0,
      coste_compra: parseFloat(editando.coste_compra) || 0,
      stock_minimo: parseInt(editando.stock_minimo, 10) || 0,
      proveedor: editando.proveedor || '',
      referencia_proveedor: editando.referencia_proveedor || '',
      formato_compra: editando.formato_compra || '',
    }
    const { error: updateError } = await supabase.from('vinos').update(cambios).eq('id', editando.id)
    if (updateError) {
      setError('No se pudo guardar el control de bodega.')
    } else {
      setVinos(vinos.map(vino => vino.id === editando.id ? { ...vino, ...cambios } : vino))
      setGuardadoBodega('Guardado.')
      if (cerrar) {
        setEditando(null)
      } else if (siguiente) {
        const index = referenciasVisibles.findIndex(vino => vino.id === editando.id)
        const siguienteVino = referenciasVisibles[index + 1]
        if (siguienteVino) {
          iniciarEdicion(siguienteVino)
          setGuardadoBodega('Guardado. Siguiente referencia abierta.')
        }
      } else {
        setEditando({ ...editando, ...cambios })
      }
    }
    setGuardando(false)
  }

  async function cambiarEstadoPropuesta(propuesta, estado) {
    const { error: updateError } = await supabase
      .from('consultor_propuestas')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', propuesta.id)

    if (!updateError) {
      setPropuestas(propuestas.map(item => item.id === propuesta.id ? { ...item, estado } : item).filter(item => item.estado !== 'descartada'))
    }
  }

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const perfilBodega = esPerfilBodega(restaurante)
  const datosPendientesTotal = datos.sinCoste.length + datos.sinProveedor.length + datos.sinStockActual.length + datos.sinStockMinimo.length + datos.sinPrecio.length
  const acciones = [
    datos.pedido.length > 0 && { tipo: 'Compra', texto: `Preparar pedido de ${datos.pedido.length} vinos en minimo o punto de pedido`, href: '#pedido' },
    datos.sinCoste.length > 0 && { tipo: 'Margen', texto: `Completar coste de ${datos.sinCoste.length} referencias`, href: '#referencias-sin-coste' },
    datos.sinProveedor.length > 0 && { tipo: 'Proveedor', texto: `Asignar proveedor a ${datos.sinProveedor.length} vinos`, href: '#referencias-sin-proveedor' },
    datos.sinStockActual.length > 0 && { tipo: 'Stock', texto: `Registrar stock actual de ${datos.sinStockActual.length} vinos`, href: '#referencias-sin-stock' },
    !perfilBodega && incidencias.length > 0 && { tipo: 'Sala', texto: `${incidencias.length} incidencias pendientes en cierre`, href: '/dashboard/cierre#incidencias' },
    datos.margenBajo.length > 0 && { tipo: 'Margen', texto: `Revisar ${datos.margenBajo.length} vinos con margen bajo`, href: '#referencias' },
    datos.sinRotacion.length > 0 && { tipo: 'Rotación', texto: `Revisar ${datos.sinRotacion.length} vinos con stock alto sin salida`, href: '#rotacion' },
    propuestas.length > 0 && { tipo: 'Mejora', texto: `Valorar ${propuestas.length} propuestas`, href: '#propuestas' },
  ].filter(Boolean)

  const referenciasVisibles = datos.activos.filter(vino => {
    if (filtroReferencias === 'pendientes') return !decimal(vino.coste_compra) || !vino.proveedor || vino.stock === null || vino.stock === undefined || decimal(vino.stock) === 0 || !decimal(vino.stock_minimo)
    if (filtroReferencias === 'sin_coste') return !decimal(vino.coste_compra)
    if (filtroReferencias === 'sin_proveedor') return !vino.proveedor
    if (filtroReferencias === 'sin_stock') return vino.stock === null || vino.stock === undefined || decimal(vino.stock) === 0
    if (filtroReferencias === 'sin_minimo') return !decimal(vino.stock_minimo)
    return true
  }).filter(vino => {
    const q = normalizar(busquedaReferencias.trim())
    if (!q) return true
    return normalizar([
      vino.nombre,
      vino.bodega,
      vino.proveedor,
      vino.region,
      vino.referencia_proveedor,
    ].filter(Boolean).join(' ')).includes(q)
  })

  const etiquetaFiltroReferencias = {
    todos: `${datos.activos.length} referencias`,
    pendientes: `${referenciasVisibles.length} pendientes`,
    sin_coste: `${referenciasVisibles.length} sin coste`,
    sin_proveedor: `${referenciasVisibles.length} sin proveedor`,
    sin_stock: `${referenciasVisibles.length} sin stock actual`,
    sin_minimo: `${referenciasVisibles.length} sin stock minimo`,
  }[filtroReferencias]
  const modoCompletarDatos = filtroReferencias !== 'todos'

  const pedidoManualLista = Object.entries(pedidoManual)
    .map(([id, cantidad]) => {
      const vino = datos.activos.find(item => String(item.id) === String(id))
      const pedir = parseInt(cantidad, 10) || 0
      return vino && pedir > 0 ? { ...vino, pedir, pedidoManual: true } : null
    })
    .filter(Boolean)

  const pedidoCombinado = Array.from([
    ...datos.pedido.map(vino => ({ ...vino, pedidoManual: false })),
    ...pedidoManualLista,
  ].reduce((acc, vino) => {
    const actual = acc.get(vino.id)
    acc.set(vino.id, actual
      ? { ...actual, pedir: actual.pedir + vino.pedir, pedidoManual: actual.pedidoManual || vino.pedidoManual }
      : vino)
    return acc
  }, new Map()).values())

  const pedidoPorProveedor = Object.entries(pedidoCombinado.reduce((acc, vino) => {
    const proveedor = vino.proveedor?.trim() || 'Sin proveedor'
    acc[proveedor] = acc[proveedor] || []
    acc[proveedor].push(vino)
    return acc
  }, {})).sort((a, b) => a[0].localeCompare(b[0]))
  const referenciasEnStock = datos.activos.filter(vino => decimal(vino.stock) > 0).length
  const disponibilidad = datos.activos.length ? Math.round((referenciasEnStock / datos.activos.length) * 100) : 0
  const sinStockReal = datos.activos.filter(vino => decimal(vino.stock) <= 0)
  const categoriasDisponibilidad = ['Tintos', 'Blancos', 'Espumosos', 'Rosados'].map(categoria => {
    const refs = datos.activos.filter(vino => tipoVino(vino) === categoria)
    const disponibles = refs.filter(vino => decimal(vino.stock) > 0).length
    return {
      categoria,
      total: refs.length,
      porcentaje: refs.length ? Math.round((disponibles / refs.length) * 100) : 0,
    }
  }).filter(item => item.total > 0)
  const alertasStock = [
    ...sinStockReal.map(vino => ({ vino, estado: 'Sin stock', detalle: '0 unidades', severidad: 'danger' })),
    ...datos.bajoMinimo.filter(vino => decimal(vino.stock) > 0).map(vino => ({ vino, estado: 'Bajo minimo', detalle: `${decimal(vino.stock)} unidades`, severidad: 'warning' })),
    ...datos.sinRotacion.slice(0, 3).map(vino => ({ vino, estado: 'Stock inmovilizado', detalle: `${decimal(vino.stock)} unidades`, severidad: 'neutral' })),
  ].slice(0, 5)
  const topQuiebre = [...pedidoCombinado]
    .sort((a, b) => {
      const scoreA = (a.ventasMarcadas || 0) * 4 + (decimal(a.stock_minimo) > 0 ? 2 : 0) - decimal(a.stock)
      const scoreB = (b.ventasMarcadas || 0) * 4 + (decimal(b.stock_minimo) > 0 ? 2 : 0) - decimal(b.stock)
      return scoreB - scoreA
    })
    .slice(0, 4)

  function contactoProveedor(nombre) {
    return contactosPorProveedor[normalizar(nombre)] || null
  }

  function cambiarPedidoRapido(vinoId, valor) {
    setPedidoRapido({ ...pedidoRapido, [vinoId]: String(valor || '').replace(/[^\d]/g, '') })
  }

  function anadirPedidoManual(vino) {
    const cantidad = parseInt(pedidoRapido[vino.id], 10) || 0
    if (cantidad <= 0) return
    setPedidoManual({ ...pedidoManual, [vino.id]: (parseInt(pedidoManual[vino.id], 10) || 0) + cantidad })
    setPedidoRapido({ ...pedidoRapido, [vino.id]: '' })
  }

  function quitarPedidoManual(vinoId) {
    const siguiente = { ...pedidoManual }
    delete siguiente[vinoId]
    setPedidoManual(siguiente)
  }

  function textoPedidoCompleto() {
    return [
      `Pedido sugerido - ${restaurante?.nombre || 'Carta Viva'}`,
      '',
      ...pedidoPorProveedor.flatMap(([proveedor, vinosProveedor]) => [
        proveedor,
        ...vinosProveedor.map(vino => {
          const cobertura = vino.reposicion?.diasCobertura == null ? 'sin ventas recientes' : `${vino.reposicion.diasCobertura} dias`
          return `- ${vino.nombre}: pedir ${vino.pedir} uds. Stock ${vino.stock || 0}, minimo ${vino.stock_minimo || 0}, punto pedido ${vino.reposicion?.puntoPedido || vino.stock_minimo || 0}, cobertura ${cobertura}`
        }),
        '',
      ]),
    ].join('\n')
  }

  async function copiarPedido() {
    if (!pedidoCombinado.length || typeof navigator === 'undefined') return
    await navigator.clipboard.writeText(textoPedidoCompleto())
    setPedidoCopiado(true)
    setTimeout(() => setPedidoCopiado(false), 1800)
  }

  function abrirWhatsAppPedido() {
    if (!pedidoCombinado.length || typeof window === 'undefined') return
    const texto = encodeURIComponent(textoPedidoCompleto())
    window.open(`https://wa.me/?text=${texto}`, '_blank', 'noopener,noreferrer')
  }

  function textoPedidoProveedor(proveedor, vinosProveedor) {
    return [
      `Hola, te paso pedido para ${restaurante?.nombre || (perfilBodega ? 'la bodega' : 'el restaurante')}:`,
      '',
      `Proveedor: ${proveedor}`,
      '',
      ...vinosProveedor.map(vino => {
        const referencia = vino.referencia_proveedor ? ` · ref. ${vino.referencia_proveedor}` : ''
        const formato = vino.formato_compra ? ` · ${vino.formato_compra}` : ''
        const cobertura = vino.reposicion?.diasCobertura == null ? 'sin ventas recientes' : `${vino.reposicion.diasCobertura} dias de cobertura`
        return `- ${vino.nombre}${referencia}: ${vino.pedir} uds.${formato} Stock ${vino.stock || 0}; punto pedido ${vino.reposicion?.puntoPedido || vino.stock_minimo || 0}; ${cobertura}`
      }),
      '',
      'Gracias.',
    ].join('\n')
  }

  async function copiarPedidoProveedor(proveedor, vinosProveedor) {
    if (!vinosProveedor?.length || typeof navigator === 'undefined') return
    await navigator.clipboard.writeText(textoPedidoProveedor(proveedor, vinosProveedor))
    setProveedorCopiado(proveedor)
    setTimeout(() => setProveedorCopiado(''), 1800)
  }

  function abrirWhatsAppProveedor(proveedor, vinosProveedor) {
    const texto = encodeURIComponent(textoPedidoProveedor(proveedor, vinosProveedor))
    const telefono = telefonoWhatsApp(contactoProveedor(proveedor)?.telefono)
    const url = telefono ? `https://wa.me/${telefono}?text=${texto}` : `https://wa.me/?text=${texto}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function renderGrupoPedido([proveedor, vinosProveedor]) {
    const faltaProveedor = proveedor === 'Sin proveedor'
    const contacto = contactoProveedor(proveedor)
    const tieneTelefono = Boolean(telefonoWhatsApp(contacto?.telefono))

    return (
      <article key={proveedor} className={styles.itemCard}>
        <div className={styles.sectionHead} style={{ margin: 0 }}>
          <div>
            <p className={styles.eyebrow}>{vinosProveedor.length} referencias</p>
            <h3 className={styles.sectionTitle}>{faltaProveedor ? `${vinosProveedor.length} vinos no se pueden mandar todavia` : proveedor}</h3>
            {faltaProveedor && (
              <p className={styles.sectionText} style={{ marginTop: 4 }}>
                Falta proveedor. Completalo para que cada referencia entre en el mensaje correcto.
              </p>
            )}
          </div>
          <div className={styles.actionRow}>
            <span className={styles.badge}>{vinosProveedor.reduce((sum, vino) => sum + vino.pedir, 0)} uds.</span>
            {!faltaProveedor && (
              <>
                <button className={styles.ghost} onClick={() => copiarPedidoProveedor(proveedor, vinosProveedor)}>
                  {proveedorCopiado === proveedor ? 'Copiado' : 'Copiar para WhatsApp'}
                </button>
                <button className={styles.ghost} onClick={() => abrirWhatsAppProveedor(proveedor, vinosProveedor)}>
                  {tieneTelefono ? 'WhatsApp directo' : 'Abrir WhatsApp'}
                </button>
              </>
            )}
          </div>
        </div>
        {!faltaProveedor && contacto && (
          <p className={styles.sectionText} style={{ margin: '8px 0 0' }}>
            {[contacto.telefono ? `Tel. ${contacto.telefono}` : null, contacto.email].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className={styles.itemStack} style={{ marginTop: 12 }}>
          {vinosProveedor.map(vino => (
            <div key={vino.id} className={styles.sectionHead} style={{ margin: 0, paddingTop: 8, borderTop: '1px solid rgba(23,20,22,0.08)' }}>
              <p className={styles.sectionText} style={{ margin: 0 }}>
                {vino.nombre} - stock {vino.stock || 0} - minimo {vino.stock_minimo || 0} - punto pedido {vino.reposicion?.puntoPedido || vino.stock_minimo || 0}
                {vino.reposicion?.diasCobertura == null ? ' - sin ventas recientes' : ` - cobertura ${vino.reposicion.diasCobertura} dias`}
              </p>
              <div className={styles.actionRow}>
                <strong className={styles.badge}>Pedir {vino.pedir}</strong>
                {faltaProveedor && (
                  <button className={styles.ghost} onClick={() => editarProveedorDesdePedido(vino)}>
                    Completar proveedor
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </article>
    )
  }

  return (
    <FeatureGate restaurante={restaurante} feature="bodega" title="Bodega no incluida">
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Bodega"
      title={perfilBodega ? 'Control de bodega para sumiller' : 'Stock, margen y reposición'}
      subtitle={perfilBodega
        ? 'KPI, compras, margen, proveedor e inventario para dejar atrás el Excel sin perder criterio profesional.'
        : 'Vista operativa: cuánto hay en bodega, qué comprar y qué datos faltan. La edición completa queda plegada.'}
      actions={<Link className={styles.secondary} href="/dashboard/inventario">Inventario</Link>}
      help={{
        title: perfilBodega ? 'Rutina del sumiller' : 'Qué hacer aquí',
        intro: perfilBodega
          ? 'Bodega concentra decisiones de compra, margen, rotación y proveedor. La IA ordena señales; el criterio lo mantiene el sumiller.'
          : 'Bodega es la pantalla de control, no la de carga masiva. Sirve para ver riesgos y preparar compras.',
        items: perfilBodega ? [
          { title: 'Compra primero', text: 'Bajo mínimo y punto de pedido convierten stock real en una lista preparada por proveedor.' },
          { title: 'Defiende margen', text: 'Coste, PVP y ventas recientes separan vinos estrella, joyas y referencias que revisar.' },
          { title: 'Limpia Excel', text: 'Proveedor, referencia y stock mínimo quedan en ficha para inventario, pedidos y reporting.' },
        ] : [
          { title: 'Mira urgencias', text: 'Bajo mínimo, margen bajo y datos sin completar son las acciones que más impacto tienen.' },
          { title: 'Prepara pedido', text: 'Usa la lista sugerida como punto de partida antes de hablar con proveedor o consultor.' },
          { title: 'Edita lo necesario', text: 'Coste, proveedor y stock mínimo alimentan margen, reposición e inventario inteligente.' },
        ],
      }}
    >
      {error && <div className={styles.empty} style={{ minHeight: 70, marginBottom: 16, color: '#9b3535' }}>{error}</div>}

      <div className={styles.cellarPage}>
      <section className={styles.cellarCockpit}>
        <div className={styles.cellarHeroCopy}>
          <p className={styles.eyebrow}>{perfilBodega ? 'Carta Viva Bodega' : 'Cava viva'}</p>
          <h2>{perfilBodega ? 'Tu bodega, en criterio y números' : 'Compra, margen y stock en una sola mirada'}</h2>
          <p>
            {perfilBodega
              ? 'Primero lo que hay que decidir hoy: pedido, margen, stock inmovilizado y referencias que conviene mover.'
              : 'Primero lo que hay que decidir hoy: pedido, datos que bloquean margen e incidencias que debe cerrar sala.'}
          </p>
          <div className={styles.cellarLiveBadge}><span />Actualizado al momento</div>
          <div className={styles.cellarHeroActions}>
            <button type="button" className={styles.primary} onClick={() => setVistaBodega('compras')}>Preparar pedido</button>
            {perfilBodega ? (
              <Link className={styles.secondary} href="/dashboard/menu-engineering">Ver estrellas y joyas</Link>
            ) : (
              <button type="button" className={styles.secondary} onClick={abrirPropuestas}>Ver propuestas</button>
            )}
            <Link className={styles.ghost} href="/dashboard/vinos?filtro=stock">Stock bajo</Link>
          </div>
        </div>
        <div className={styles.cellarHeroMetrics}>
          <article>
            <strong>{datos.activos.length.toLocaleString('es-ES')}</strong>
            <span>referencias totales</span>
          </article>
          <article>
            <strong>{referenciasEnStock.toLocaleString('es-ES')}</strong>
            <span>en stock - {disponibilidad}%</span>
          </article>
          <article>
            <strong>{sinStockReal.length + datos.bajoMinimo.length}</strong>
            <span>sin stock o minimo</span>
          </article>
        </div>
      </section>

      <section className={styles.cellarCockpitDeck}>
        <div className={styles.cellarCockpitGrid}>
          <article className={styles.cellarGlassPanel}>
            <div className={styles.cellarPanelTop}>
              <h3>Disponibilidad por categoria</h3>
              <strong>{disponibilidad}%</strong>
            </div>
            <div className={styles.cellarDonut} style={{ '--availability': `${disponibilidad}%` }}>
              <span>{disponibilidad}%</span>
              <small>Disponible</small>
            </div>
            <div className={styles.cellarCategoryList}>
              {(categoriasDisponibilidad.length ? categoriasDisponibilidad : [{ categoria: 'Sin categorias', porcentaje: disponibilidad, total: datos.activos.length }]).map(item => (
                <div key={item.categoria}>
                  <span>{item.categoria}</span>
                  <strong>{item.porcentaje}%</strong>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.cellarGlassPanel}>
            <div className={styles.cellarPanelTop}>
              <h3>Alertas de stock</h3>
              <button type="button" onClick={() => { setVistaBodega('stock'); abrirReferencias('sin_stock') }}>Ver stock</button>
            </div>
            <div className={styles.cellarAlertList}>
              {alertasStock.length ? alertasStock.map(alerta => (
                <button type="button" key={`${alerta.estado}-${alerta.vino.id}`} onClick={() => { setVistaBodega('stock'); abrirReferencias(alerta.severidad === 'danger' ? 'sin_stock' : 'todos') }} className={styles[`cellarAlert${alerta.severidad.charAt(0).toUpperCase()}${alerta.severidad.slice(1)}`]}>
                  <span />
                  <strong>{alerta.vino.nombre}</strong>
                  <small>{alerta.detalle}</small>
                </button>
              )) : (
                <p className={styles.cellarQuietText}>Sin alertas criticas con los datos actuales.</p>
              )}
            </div>
          </article>
        </div>

        <article className={styles.cellarRiskPanel}>
          <div className={styles.cellarPanelTop}>
            <h3>Top vinos en riesgo de quiebre</h3>
            <button type="button" onClick={() => setVistaBodega('compras')}>Preparar pedido</button>
          </div>
          <div className={styles.cellarBottleGrid}>
            {(topQuiebre.length ? topQuiebre : datos.bajoMinimo.slice(0, 4)).map(vino => {
              const stock = decimal(vino.stock)
              const minimo = Math.max(1, decimal(vino.stock_minimo) || vino.reposicion?.puntoPedido || 1)
              const ratio = Math.max(6, Math.min(100, Math.round((stock / minimo) * 100)))
              return (
                <button type="button" key={vino.id} className={styles.cellarBottleCard} onClick={() => setVistaBodega('compras')}>
                  <span className={`${styles.cellarBottleArt} ${styles[`cellarBottle${bottleTone(vino)}`]}`} />
                  <strong>{vino.nombre}</strong>
                  <small>{vino.bodega || vino.proveedor || 'Sin bodega'}</small>
                  <em>Stock: {stock} uds.</em>
                  <i><span style={{ width: `${ratio}%` }} /></i>
                </button>
              )
            })}
            {!topQuiebre.length && !datos.bajoMinimo.length && (
              <p className={styles.cellarQuietText}>No hay referencias en riesgo inmediato.</p>
            )}
          </div>
        </article>
      </section>

      <nav className={styles.innerTabs} aria-label="Secciones de bodega">
        <button type="button" className={vistaBodega === 'resumen' ? styles.innerTabActive : ''} onClick={() => setVistaBodega('resumen')}>
          Resumen
        </button>
        <button type="button" className={vistaBodega === 'compras' ? styles.innerTabActive : ''} onClick={() => setVistaBodega('compras')}>
          Compras {pedidoCombinado.length > 0 && <span>{pedidoCombinado.length}</span>}
        </button>
        <button type="button" className={vistaBodega === 'stock' ? styles.innerTabActive : ''} onClick={() => setVistaBodega('stock')}>
          Stock {datosPendientesTotal > 0 && <span>{datosPendientesTotal}</span>}
        </button>
        <button type="button" className={vistaBodega === 'propuestas' ? styles.innerTabActive : ''} onClick={abrirPropuestas}>
          Propuestas {propuestas.length > 0 && <span>{propuestas.length}</span>}
        </button>
      </nav>

      {vistaBodega === 'resumen' && <section className={styles.statsGrid}>
        <StatCard
          value={eur(datos.valorCoste)}
          label="Valor a coste"
          hint="Dinero inmovilizado en bodega."
          info="Suma el stock actual de cada vino multiplicado por su coste de compra. Si falta coste o stock, esa referencia pesa como cero y conviene completarla."
        />
        <StatCard
          value={datos.margenMedio == null ? '-' : `${datos.margenMedio}%`}
          label="Margen medio"
          valueStyle={{ color: margenColor(datos.margenMedio) }}
          hint="Solo referencias con coste y PVP."
          info="Media del margen bruto de los vinos que tienen coste de compra y precio de venta. Sirve para detectar si la carta esta vendiendo demasiado barato o si falta dato economico."
        />
        <StatCard
          value={datos.bajoMinimo.length}
          label="Bajo mínimo"
          hint="Riesgo de rotura de stock."
          info="Cuenta los vinos cuyo stock actual esta en el minimo definido o por debajo. Es una senal de compra o de sustituto antes del servicio."
        />
        <StatCard
          value={pedidoCombinado.length}
          label="Pedido sugerido"
          hint="Reposicion calculada."
          info="Referencias que la app propone pedir por bajo stock, minimo definido, venta reciente o pedido manual. No compra automaticamente: prepara la decision."
        />
      </section>}

      {(vistaBodega === 'resumen' || vistaBodega === 'compras') && <section className={`${styles.gridTwo} ${styles.singleView}`}>
        {vistaBodega === 'resumen' && <div className={styles.panelDark}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Qué mirar ahora</h2>
              <p className={styles.panelSub}>{perfilBodega ? 'Compra, margen y datos pendientes con lectura de stock, proveedor y venta real.' : 'Compra, margen y datos pendientes. Las incidencias se resuelven en Cierre.'}</p>
            </div>
            <span className={styles.badge}>{acciones.length}</span>
          </div>
          <div className={styles.panelBody}>
            {acciones.length ? (
              <div className={styles.itemStack}>
                {acciones.slice(0, 5).map(accion => (
                  <Link key={accion.texto} href={accion.href} onClick={event => abrirAccionBodega(event, accion.href)} className={styles.itemCard} style={{ background: '#231e20', borderColor: '#3a3033', textDecoration: 'none' }}>
                    <p className={styles.eyebrow}>{accion.tipo}</p>
                    <p className={styles.sectionTitle} style={{ color: '#fffaf3' }}>{accion.texto}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className={styles.panelSub}>Sin urgencias de bodega con los datos actuales.</p>
            )}
          </div>
        </div>}

        {vistaBodega === 'compras' && <div className={styles.panel} id="pedido">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Pedido sugerido</h2>
              <p className={styles.panelSub}>Agrupado por proveedor. Se activa por stock minimo, ventas recientes, plazo de entrega y colchon de seguridad.</p>
            </div>
            <div className={styles.actionRow}>
              <span className={styles.badge}>{pedidoCombinado.length}</span>
              {pedidoCombinado.length > 0 && (
                <>
                  <button className={styles.ghost} onClick={copiarPedido}>{pedidoCopiado ? 'Copiado' : 'Copiar para WhatsApp'}</button>
                  <button className={styles.ghost} onClick={abrirWhatsAppPedido}>Abrir WhatsApp</button>
                </>
              )}
            </div>
          </div>
          <div className={styles.panelBody}>
            {pedidoCombinado.length ? (
              <div className={styles.itemStack}>
                {pedidoPorProveedor.map(renderGrupoPedido)}
              </div>
            ) : (
              <div className={styles.empty}>No hay pedido sugerido ahora.</div>
            )}
          </div>
        </div>}
      </section>}

      {vistaBodega === 'stock' && <section className={styles.gridTwo} id="rotacion" style={{ marginTop: 16 }}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Stock alto sin salida</h2>
              <p className={styles.panelSub}>Dinero inmovilizado que conviene destacar, formar o retirar.</p>
            </div>
            <span className={styles.badge}>{datos.sinRotacion.length}</span>
          </div>
          <div className={styles.panelBody}>
            {datos.sinRotacion.length ? (
              <div className={styles.itemStack}>
                {datos.sinRotacion.slice(0, 5).map(vino => (
                  <article key={vino.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                        <p className={styles.sectionText}>{vino.proveedor || 'Sin proveedor'} · stock {vino.stock || 0} · coste inmovilizado {eur(decimal(vino.stock) * decimal(vino.coste_compra))}</p>
                      </div>
                      <span className={styles.badge}>{perfilBodega ? 'Sin ventas recientes' : 'Sin ventas marcadas'}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>No hay stock alto sin salida marcada.</div>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Referencias con tracción</h2>
              <p className={styles.panelSub}>{perfilBodega ? 'Vinos con salida real que conviene proteger, reponer o defender ante dirección.' : 'Vinos que sala está consiguiendo vender o defender.'}</p>
            </div>
            <span className={styles.badge}>{datos.topRotacion.length}</span>
          </div>
          <div className={styles.panelBody}>
            {datos.topRotacion.length ? (
              <div className={styles.itemStack}>
                {datos.topRotacion.map(vino => (
                  <article key={vino.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                        <p className={styles.sectionText}>{vino.bodega || 'Sin bodega'} · margen {margen(vino) ?? '-'}%</p>
                      </div>
                      <span className={styles.badge}>{vino.ventasMarcadas} ventas</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>{perfilBodega ? 'Aún no hay ventas recientes registradas.' : 'Aún no hay ventas marcadas desde sala.'}</div>
            )}
          </div>
        </div>
      </section>}

      {vistaBodega === 'stock' && <section className={styles.panel} id="movimientos" style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Libro de movimientos</h2>
            <p className={styles.panelSub}>Últimos cambios de stock con motivo y trazabilidad.</p>
          </div>
          <div className={styles.actionRow}>
            <span className={styles.badge}>{movimientos.length}</span>
            <button className={styles.ghost} onClick={() => setMostrarMovimientos(!mostrarMovimientos)}>
              {mostrarMovimientos ? 'Ocultar' : 'Ver movimientos'}
            </button>
          </div>
        </div>
        {mostrarMovimientos && <div className={styles.panelBody}>
          {movimientos.length ? (
            <div className={styles.itemStack}>
              {movimientos.map(mov => (
                <article key={mov.id} className={styles.itemCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <p className={styles.eyebrow}>{mov.tipo}</p>
                      <h3 className={styles.sectionTitle}>{mov.vinos?.nombre || 'Vino'}</h3>
                      <p className={styles.sectionText}>{mov.motivo || 'Sin motivo'} · {mov.stock_anterior ?? '-'} → {mov.stock_nuevo ?? '-'}</p>
                    </div>
                    <span className={styles.badge}>{mov.cantidad > 0 ? `+${mov.cantidad}` : mov.cantidad}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>Aún no hay movimientos de stock registrados.</div>
          )}
        </div>}
      </section>}

      {vistaBodega === 'stock' && <section className={styles.gridTwo} id="proveedores" style={{ marginTop: 16 }}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Datos pendientes</h2>
              <p className={styles.panelSub}>Completar esto convierte la bodega en una herramienta fiable.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              <article className={styles.itemCard}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <p className={styles.sectionTitle}>{datos.sinCoste.length} vinos sin coste de compra</p>
                  <button className={styles.ghost} onClick={() => abrirReferencias('sin_coste')}>Completar</button>
                </div>
              </article>
              <article className={styles.itemCard}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <p className={styles.sectionTitle}>{datos.sinProveedor.length} vinos sin proveedor</p>
                  <button className={styles.ghost} onClick={() => abrirReferencias('sin_proveedor')}>Completar</button>
                </div>
              </article>
              <article className={styles.itemCard}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <p className={styles.sectionTitle}>{datos.sinStockMinimo.length} vinos sin stock minimo</p>
                  <button className={styles.ghost} onClick={() => abrirReferencias('sin_minimo')}>Completar</button>
                </div>
              </article>
              <article className={styles.itemCard}>
                <div className={styles.sectionHead} style={{ margin: 0 }}>
                  <p className={styles.sectionTitle}>{datos.sinPrecio.length} vinos sin precio de venta</p>
                  <Link className={styles.ghost} href="/dashboard/vinos?filtro=pendientes">Completar</Link>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Proveedores</h2>
              <p className={styles.panelSub}>Peso aproximado por proveedor.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            {datos.proveedores.length ? (
              <div className={styles.itemStack}>
                {datos.proveedores.map(([proveedor, info]) => (
                  <article className={styles.itemCard} key={proveedor}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{proveedor}</h3>
                        <p className={styles.sectionText}>
                          {info.refs} referencias · retorno {info.retorno == null ? '-' : `${info.retorno.toFixed(2)}x`}
                        </p>
                      </div>
                      <span className={styles.badge}>{eur(info.coste)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Aún no hay proveedores informados.</div>
            )}
          </div>
        </div>
      </section>}

      {vistaBodega === 'propuestas' && <section className={`${styles.panelDark} ${styles.notificationFocus}`} id="propuestas" style={{ marginTop: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Propuestas recibidas</h2>
              <p className={styles.panelSub}>Ideas de compra o ajuste listas para decidir.</p>
            </div>
            <button className={styles.secondary} onClick={() => setMostrarPropuestas(!mostrarPropuestas)}>
              {mostrarPropuestas ? 'Ocultar' : `Ver ${propuestas.length}`}
            </button>
          </div>
          {mostrarPropuestas && propuestas.length > 0 && (
            <div className={styles.panelBody}>
              <div className={styles.itemStack}>
                {propuestas.map(propuesta => (
                  <article key={propuesta.id} className={styles.itemCard} style={{ background: '#231e20', borderColor: '#3a3033' }}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <p className={styles.eyebrow}>{propuesta.prioridad} · {propuesta.estado}</p>
                        <h3 className={styles.sectionTitle} style={{ color: '#fffaf3' }}>{propuesta.titulo}</h3>
                        <p className={styles.sectionText} style={{ color: 'rgba(255,250,243,0.62)' }}>{[propuesta.vino, propuesta.tipo, propuesta.zona].filter(Boolean).join(' · ') || 'Propuesta'}</p>
                      </div>
                    </div>
                    {propuesta.motivo && <p className={styles.lead} style={{ color: 'rgba(255,250,243,0.72)', marginTop: 12 }}>{propuesta.motivo}</p>}
                    <div className={styles.actionRow} style={{ marginTop: 14 }}>
                      <button className={styles.secondary} onClick={() => cambiarEstadoPropuesta(propuesta, 'interesa')}>Me interesa</button>
                      <button className={styles.ghost} onClick={() => cambiarEstadoPropuesta(propuesta, 'incorporada')}>Incorporada</button>
                      <button className={styles.ghost} onClick={() => cambiarEstadoPropuesta(propuesta, 'descartada')}>Descartar</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {mostrarPropuestas && propuestas.length === 0 && (
            <div className={styles.panelBody}>
              <div className={styles.empty}>No hay propuestas pendientes ahora.</div>
            </div>
          )}
        </section>}

      {vistaBodega === 'stock' && <section className={styles.panel} id="referencias" style={{ marginTop: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Referencias de bodega</h2>
            <p className={styles.panelSub}>{modoCompletarDatos ? 'Completa primero stock actual, coste, proveedor y mínimo de aviso. El pedido queda para la vista de compras.' : 'Edición avanzada de stock actual, coste, proveedor, stock mínimo y pedido manual.'}</p>
          </div>
          <button className={styles.ghost} onClick={() => setMostrarReferencias(!mostrarReferencias)}>
            {mostrarReferencias ? 'Ocultar' : `Editar ${etiquetaFiltroReferencias}`}
          </button>
        </div>
        {mostrarReferencias && (
          <div className={styles.panelBody}>
            <div style={{ marginBottom: 12 }}>
              <label className={styles.label}>Buscar referencia</label>
              <input
                className={styles.input}
                value={busquedaReferencias}
                onChange={e => setBusquedaReferencias(e.target.value)}
                placeholder="Nombre, bodega, proveedor o referencia..."
              />
            </div>
            <div className={styles.actionRow} style={{ marginBottom: 12 }}>
              <button className={filtroReferencias === 'todos' ? styles.secondary : styles.ghost} onClick={() => setFiltroReferencias('todos')}>Todas</button>
              <button className={filtroReferencias === 'pendientes' ? styles.secondary : styles.ghost} onClick={() => setFiltroReferencias('pendientes')}>Pendientes</button>
              <button className={filtroReferencias === 'sin_coste' ? styles.secondary : styles.ghost} onClick={() => setFiltroReferencias('sin_coste')}>Sin coste</button>
              <button className={filtroReferencias === 'sin_proveedor' ? styles.secondary : styles.ghost} onClick={() => setFiltroReferencias('sin_proveedor')}>Sin proveedor</button>
              <button className={filtroReferencias === 'sin_stock' ? styles.secondary : styles.ghost} onClick={() => setFiltroReferencias('sin_stock')}>Sin stock actual</button>
              <button className={filtroReferencias === 'sin_minimo' ? styles.secondary : styles.ghost} onClick={() => setFiltroReferencias('sin_minimo')}>Sin stock minimo</button>
            </div>
            <div className={styles.itemStack}>
              {referenciasVisibles.map(vino => {
                const m = margen(vino)
                const bajo = decimal(vino.stock_minimo) > 0 && decimal(vino.stock) <= decimal(vino.stock_minimo)
                const isEditing = editando?.id === vino.id
                const posicion = referenciasVisibles.findIndex(item => item.id === vino.id)
                const cantidadManual = parseInt(pedidoManual[vino.id], 10) || 0
                return (
                  <article key={vino.id} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{vino.nombre}</h3>
                        <p className={styles.sectionText}>{vino.bodega || 'Sin bodega'} · stock {vino.stock || 0} · venta {eur(vino.precio_botella)}</p>
                      </div>
                      <div className={styles.actionRow}>
                        {bajo && <span className={styles.badge}>Bajo mínimo</span>}
                        {cantidadManual > 0 && <span className={styles.badge}>Manual {cantidadManual}</span>}
                        <span className={styles.badge} style={{ color: margenColor(m) }}>{m == null ? 'Sin margen' : `${m}% margen`}</span>
                        <button className={styles.ghost} onClick={() => isEditing ? setEditando(null) : iniciarEdicion(vino)}>{isEditing ? 'Cerrar' : 'Editar'}</button>
                      </div>
                    </div>

                    {!modoCompletarDatos && <div className={styles.actionRow} style={{ marginTop: 12 }}>
                      <input
                        className={styles.input}
                        type="number"
                        min="1"
                        value={pedidoRapido[vino.id] || ''}
                        onChange={e => cambiarPedidoRapido(vino.id, e.target.value)}
                        placeholder="Pedir"
                        style={{ maxWidth: 110 }}
                      />
                      <button className={styles.ghost} onClick={() => anadirPedidoManual(vino)}>Añadir al pedido</button>
                      {cantidadManual > 0 && (
                        <button className={styles.ghost} onClick={() => quitarPedidoManual(vino.id)}>Quitar manual</button>
                      )}
                    </div>}

                    {isEditing && (
                      <ResponsiveOverlay
                        open
                        onClose={() => !guardando && setEditando(null)}
                        eyebrow="Control de bodega"
                        title={`Editar ${editando.nombre}`}
                        description={`${editando.bodega || 'Sin bodega'} · stock ${editando.stock || 0} · venta ${eur(editando.precio_botella)}`}
                        footer={
                          <>
                            <button type="button" className={styles.ghost} onClick={() => setEditando(null)} disabled={guardando}>Cancelar</button>
                            <button type="button" className={styles.secondary} onClick={() => guardarBodega({ siguiente: true })} disabled={guardando || posicion >= referenciasVisibles.length - 1}>Guardar y siguiente</button>
                            <button type="button" className={styles.primary} onClick={() => guardarBodega({ cerrar: true })} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
                          </>
                        }
                      >
                      <div className={styles.formGrid}>
                        <div>
                          <label className={styles.label}>Coste compra</label>
                          <input className={styles.input} type="number" step="0.01" value={editando.coste_compra} onChange={e => setEditando({ ...editando, coste_compra: e.target.value })} />
                          {parseFloat(editando.coste_compra) > 0 && (
                            <p style={{ margin: '5px 0 0', fontSize: 11, color: '#8b8278' }}>
                              x2 {(parseFloat(editando.coste_compra) * 2).toFixed(2)} € · x3 {(parseFloat(editando.coste_compra) * 3).toFixed(2)} €
                            </p>
                          )}
                        </div>
                        <div>
                          <label className={styles.label}>Stock actual</label>
                          <input className={styles.input} type="number" min="0" value={editando.stock} onChange={e => setEditando({ ...editando, stock: e.target.value })} />
                          <p style={{ margin: '5px 0 0', fontSize: 11, color: '#8b8278' }}>Botellas reales ahora mismo.</p>
                        </div>
                        <div>
                          <label className={styles.label}>Stock mínimo (aviso)</label>
                          <input className={styles.input} type="number" min="0" value={editando.stock_minimo} onChange={e => setEditando({ ...editando, stock_minimo: e.target.value })} />
                          <p style={{ margin: '5px 0 0', fontSize: 11, color: '#8b8278' }}>Umbral para avisar o preparar reposición.</p>
                        </div>
                        <div>
                          <label className={styles.label}>Proveedor</label>
                          <input
                            className={styles.input}
                            list="proveedores-bodega"
                            value={editando.proveedor}
                            onChange={e => setEditando({ ...editando, proveedor: e.target.value })}
                          />
                          <datalist id="proveedores-bodega">
                            {datos.proveedoresExistentes.map(proveedor => <option key={proveedor} value={proveedor} />)}
                          </datalist>
                        </div>
                        <div><label className={styles.label}>Referencia proveedor</label><input className={styles.input} value={editando.referencia_proveedor} onChange={e => setEditando({ ...editando, referencia_proveedor: e.target.value })} /></div>
                        <div className={styles.full}><label className={styles.label}>Formato compra</label><input className={styles.input} placeholder="Caja 6, caja 12, unidad..." value={editando.formato_compra} onChange={e => setEditando({ ...editando, formato_compra: e.target.value })} /></div>
                        <div className={styles.full}>
                          <div className={styles.actionRow}>
                            <button className={styles.ghost} onClick={() => moverEdicion(-1)} disabled={guardando || posicion <= 0}>Anterior</button>
                            <button className={styles.ghost} onClick={() => moverEdicion(1)} disabled={guardando || posicion >= referenciasVisibles.length - 1}>Siguiente</button>
                          </div>
                          {guardadoBodega && <p className={styles.tiny}>{guardadoBodega}</p>}
                        </div>
                      </div>
                      </ResponsiveOverlay>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </section>}
      </div>
    </ModuleShell>
    </FeatureGate>
  )
}
