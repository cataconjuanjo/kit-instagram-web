import { analizarConGrafo } from '../../lib/chartierGraph'
import { analizarConGoldstein } from '../../lib/goldsteinStructural'
import { analizarMaridaje } from '../../lib/maridajeEngine'

function compactarCandidato(item) {
  const vino = item.vino || {}
  return {
    vino_id: vino.id,
    nombre: vino.nombre,
    scoreGrafo: item.scoreGrafo,
    scoreChartier: item.scoreChartier,
    scoreGoldstein: item.scoreGoldstein,
    riesgos: item.riesgos || [],
    goldstein: item.goldstein ? {
      bloqueado: item.goldstein.bloqueado,
      fortalezas: item.goldstein.fortalezas || [],
      riesgos: item.goldstein.riesgos || [],
      reglas: (item.goldstein.reglas || []).slice(0, 4).map(regla => ({
        id: regla.id,
        dimension: regla.dimension,
        tipo: regla.tipo,
        delta: regla.delta,
        summary: regla.summary,
      })),
    } : null,
    evidencias: (item.evidencias || []).slice(0, 4).map(ev => ({
      wineLabel: ev.wineLabel,
      concepto: ev.concepto,
      familia: ev.familia,
      origen: ev.origen,
      relacion: ev.relacion,
      fuente: ev.fuente,
      strength: ev.strength,
      matchScore: ev.matchScore,
      peso: ev.peso,
    })),
  }
}

function compactarMotorItem(item) {
  const vino = item.vino || {}
  return {
    vino: {
      id: vino.id,
      nombre: vino.nombre,
      bodega: vino.bodega,
      tipo: vino.tipo,
      region: vino.region,
      uva: vino.uva,
      anada: vino.anada,
      precio_copa: vino.precio_copa,
      precio_botella: vino.precio_botella,
      notas_cata: vino.notas_cata,
      stock: vino.stock,
      activo: vino.activo,
    },
    score: item.score,
    motivo: item.motivo,
    fuente: item.fuente,
    compatible: item.compatible,
    rangoTicket: item.rangoTicket,
  }
}

function compactarMotor(analisis) {
  return {
    version: 'armonia-core-v1',
    lectura: analisis?.lectura || null,
    recomendados: (analisis?.recomendados || []).map(compactarMotorItem),
    candidatos: (analisis?.candidatos || []).slice(0, 80).map(compactarMotorItem),
  }
}

function claveVino(vino = {}) {
  return String(vino.id || vino.nombre || '')
}

function vinosDisponibles(vinos = []) {
  return vinos
    .filter(vino => vino?.activo !== false && vino?.stock !== 0 && Number(vino?.precio_botella) > 0)
    .slice(0, 120)
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
    }))
}

function compactarGoldstein(analisis) {
  if (!analisis) return null
  return {
    origen: analisis.origen,
    rasgosPlato: analisis.rasgosPlato || [],
    salsas: analisis.salsas || [],
    tecnicas: analisis.tecnicas || [],
    puentes: analisis.puentes || [],
    descartados: (analisis.candidatos || [])
      .filter(item => item.bloqueado)
      .map(item => ({
        vino_id: item.vino?.id,
        nombre: item.vino?.nombre,
        riesgos: item.riesgos || [],
      })),
  }
}

export async function POST(request) {
  try {
    const { consulta, vinos = [] } = await request.json()
    const textoConsulta = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
    if (!textoConsulta.trim()) {
      return Response.json({ error: 'consulta requerida' }, { status: 400 })
    }

    if (!Array.isArray(vinos)) {
      return Response.json({ error: 'vinos debe ser un array' }, { status: 400 })
    }

    const carta = vinosDisponibles(vinos)
    const goldsteinAnalisis = analizarConGoldstein(textoConsulta, carta)
    const bloqueadosGoldstein = new Set(
      (goldsteinAnalisis.candidatos || [])
        .filter(item => item.bloqueado)
        .map(item => claveVino(item.vino))
    )
    const cartaValidada = carta.filter(vino => !bloqueadosGoldstein.has(claveVino(vino)))
    const goldstein = compactarGoldstein(goldsteinAnalisis)
    const motor = compactarMotor(analizarMaridaje(textoConsulta, cartaValidada))
    let analisis = null
    try {
      analisis = await analizarConGrafo(textoConsulta, cartaValidada)
    } catch (error) {
      console.error('[maridaje-grafo] grafo no fatal:', error?.message)
    }
    if (!analisis) {
      return Response.json({ candidatos: [], confianza: 'baja', tieneDirecto: false, goldstein, motor })
    }

    return Response.json({
      terminosDetectados: analisis.terminosDetectados || [],
      nodosResueltos: analisis.nodosResueltos || [],
      confianza: analisis.confianza,
      tieneDirecto: analisis.tieneDirecto,
      goldstein,
      motor,
      candidatos: (analisis.candidatos || []).map(compactarCandidato),
    })
  } catch (error) {
    console.error('[maridaje-grafo]', error)
    return Response.json({ error: 'Error analizando el grafo Chartier' }, { status: 500 })
  }
}
