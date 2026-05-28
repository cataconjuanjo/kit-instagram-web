import { analizarConGrafo } from '../../lib/chartierGraph'

function compactarCandidato(item) {
  const vino = item.vino || {}
  return {
    vino_id: vino.id,
    nombre: vino.nombre,
    scoreGrafo: item.scoreGrafo,
    riesgos: item.riesgos || [],
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
      precio_copa: vino.precio_copa,
      precio_botella: vino.precio_botella,
      notas_cata: vino.notas_cata,
      stock: vino.stock,
      activo: vino.activo,
    }))
}

export async function POST(request) {
  try {
    const { consulta, vinos = [] } = await request.json()
    const textoConsulta = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
    if (!textoConsulta.trim()) {
      return Response.json({ error: 'consulta requerida' }, { status: 400 })
    }

    const carta = vinosDisponibles(vinos)
    const analisis = await analizarConGrafo(textoConsulta, carta)
    if (!analisis) {
      return Response.json({ candidatos: [], confianza: 'baja', tieneDirecto: false })
    }

    return Response.json({
      terminosDetectados: analisis.terminosDetectados || [],
      nodosResueltos: analisis.nodosResueltos || [],
      confianza: analisis.confianza,
      tieneDirecto: analisis.tieneDirecto,
      candidatos: (analisis.candidatos || []).map(compactarCandidato),
    })
  } catch (error) {
    console.error('[maridaje-grafo]', error)
    return Response.json({ error: 'Error analizando el grafo Chartier' }, { status: 500 })
  }
}
