import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getUserFromRequest } from '../../_lib/auth'
import { analizarMaridaje } from '../../../lib/maridajeEngine'
import { analizarConGoldstein } from '../../../lib/goldsteinStructural'
import { analizarConGrafo } from '../../../lib/chartierGraph'
import { analizarFlavor, consultaEnriquecidaFlavor } from '../../../lib/flavorKnowledge'

const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

function compactarVino(vino = {}) {
  return {
    id: vino.id,
    nombre: vino.nombre,
    bodega: vino.bodega,
    tipo: vino.tipo,
    region: vino.region,
    uva: vino.uva,
    precio_botella: vino.precio_botella,
    notas_cata: vino.notas_cata,
    stock: vino.stock,
    activo: vino.activo,
  }
}

function vinosDisponibles(vinos = []) {
  return vinos
    .filter(vino => vino?.activo !== false && Number(vino?.stock) !== 0 && Number(vino?.precio_botella) > 0)
    .slice(0, 140)
    .map(compactarVino)
}

function candidatoMotor(item, index) {
  const vino = item?.vino || {}
  return {
    posicion: index + 1,
    vino_id: vino.id,
    nombre: vino.nombre,
    bodega: vino.bodega,
    tipo: vino.tipo,
    precio: vino.precio_botella,
    score: Math.round(Number(item?.score) || 0),
    motivo: item?.motivo || '',
    fuente: item?.fuente || '',
  }
}

function candidatoGrafo(item, index) {
  const vino = item?.vino || {}
  return {
    posicion: index + 1,
    vino_id: vino.id,
    nombre: vino.nombre,
    bodega: vino.bodega,
    tipo: vino.tipo,
    precio: vino.precio_botella,
    score: Number(item?.scoreGrafo) || 0,
    scoreChartier: Number(item?.scoreChartier) || 0,
    scoreGoldstein: Number(item?.scoreGoldstein) || 0,
    riesgos: item?.riesgos || [],
    evidencias: (item?.evidencias || []).slice(0, 3).map(evidencia => ({
      concepto: evidencia.concepto,
      familia: evidencia.familia,
      origen: evidencia.origen,
      fuente: evidencia.fuente,
    })),
  }
}

function resumenGoldstein(consulta, vinos) {
  const analisis = analizarConGoldstein(consulta, vinos)
  return {
    rasgosPlato: analisis.rasgosPlato || [],
    salsas: analisis.salsas || [],
    tecnicas: analisis.tecnicas || [],
    puentes: analisis.puentes || [],
    bloqueados: (analisis.candidatos || [])
      .filter(item => item.bloqueado)
      .slice(0, 8)
      .map(item => ({
        vino_id: item.vino?.id,
        nombre: item.vino?.nombre,
        riesgos: item.riesgos || [],
      })),
  }
}

async function analizarVersion(consulta, vinos) {
  const [motor, grafo] = await Promise.all([
    Promise.resolve(analizarMaridaje(consulta, vinos)),
    analizarConGrafo(consulta, vinos).catch(() => null),
  ])

  return {
    consulta,
    lectura: motor?.lectura || null,
    goldstein: resumenGoldstein(consulta, vinos),
    motor: {
      recomendados: (motor?.recomendados || []).map(candidatoMotor),
      candidatos: (motor?.candidatos || []).slice(0, 8).map(candidatoMotor),
    },
    grafo: grafo ? {
      confianza: grafo.confianza,
      tieneDirecto: grafo.tieneDirecto,
      terminosDetectados: grafo.terminosDetectados || [],
      nodosResueltos: grafo.nodosResueltos || [],
      candidatos: (grafo.candidatos || []).slice(0, 8).map(candidatoGrafo),
    } : null,
  }
}

function comparar(actual, flavor) {
  const topActual = actual?.grafo?.candidatos?.[0] || actual?.motor?.recomendados?.[0] || actual?.motor?.candidatos?.[0]
  const topFlavor = flavor?.grafo?.candidatos?.[0] || flavor?.motor?.recomendados?.[0] || flavor?.motor?.candidatos?.[0]
  const listaActual = new Map((actual?.motor?.candidatos || []).map(item => [String(item.vino_id || item.nombre), item.posicion]))
  const listaFlavor = (flavor?.motor?.candidatos || []).map(item => ({
    vino_id: item.vino_id,
    nombre: item.nombre,
    antes: listaActual.get(String(item.vino_id || item.nombre)) || null,
    ahora: item.posicion,
  }))

  return {
    cambiaPrimero: String(topActual?.vino_id || topActual?.nombre || '') !== String(topFlavor?.vino_id || topFlavor?.nombre || ''),
    primeroActual: topActual?.nombre || null,
    primeroFlavor: topFlavor?.nombre || null,
    movimientos: listaFlavor.filter(item => item.antes && item.antes !== item.ahora).slice(0, 8),
    nuevosEnTop: listaFlavor.filter(item => !item.antes).slice(0, 5),
  }
}

export async function GET(request) {
  const auth = await getUserFromRequest(request)
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
  if ((auth.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
    return Response.json({ error: 'Solo admin.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('restaurantes')
    .select('id, nombre, ciudad')
    .order('nombre')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ restaurantes: data || [] })
}

export async function POST(request) {
  try {
    const auth = await getUserFromRequest(request)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    if ((auth.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
      return Response.json({ error: 'Solo admin.' }, { status: 403 })
    }

    const { restaurante_id, consulta } = await request.json()
    const texto = String(consulta || '').trim()
    if (!restaurante_id || !texto) {
      return Response.json({ error: 'Restaurante y consulta son obligatorios.' }, { status: 400 })
    }
    if (texto.length > 600) {
      return Response.json({ error: 'Consulta demasiado larga para el laboratorio.' }, { status: 400 })
    }

    const [{ data: restaurante, error: restError }, { data: vinosData, error: vinosError }] = await Promise.all([
      supabaseAdmin.from('restaurantes').select('id, nombre').eq('id', restaurante_id).single(),
      supabaseAdmin.from('vinos').select('*').eq('restaurante_id', restaurante_id).eq('activo', true),
    ])

    if (restError || !restaurante) return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })
    if (vinosError) return Response.json({ error: vinosError.message }, { status: 500 })

    const vinos = vinosDisponibles(vinosData || [])
    const flavorLectura = analizarFlavor(texto)
    const textoFlavor = consultaEnriquecidaFlavor(texto, flavorLectura)
    const [actual, conFlavor] = await Promise.all([
      analizarVersion(texto, vinos),
      analizarVersion(textoFlavor, vinos),
    ])

    return Response.json({
      restaurante,
      consulta: texto,
      flavorLectura,
      actual,
      conFlavor,
      comparacion: comparar(actual, conFlavor),
    })
  } catch (error) {
    console.error('[admin/maridaje-lab]', error)
    return Response.json({ error: 'Error ejecutando laboratorio de maridaje.' }, { status: 500 })
  }
}

