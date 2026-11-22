// Helper único de métricas del panel de consultor.
// Fase J - bloque 1: una sola fuente para Radar, ficha e informe ejecutivo.
// Todas las funciones son puras: no leen Supabase ni depende de React.
// Las páginas pasan las estructuras ya cargadas y reciben el mismo valor.

function toNumber(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function floor(valor) {
  return Math.max(0, Math.floor(toNumber(valor)))
}

// ---- Puntuación -----------------------------------------------------------
// Fuente única: la función analizar() del propio panel. Le pasamos el objeto
// que ya calculan Radar y ficha (con score y prioridad). Si el objeto no
// tiene score, devolvemos neutro en vez de inventar persistidos.
export function calcPuntuacion(analisis) {
  const score = toNumber(analisis && analisis.score)
  const prioridad = analisis && analisis.prioridad
    ? analisis.prioridad
    : score >= 65 ? 'Alta' : score >= 35 ? 'Media' : 'Baja'
  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    prioridad,
    etiqueta: prioridad === 'Alta' ? 'ALTA' : prioridad === 'Media' ? 'MEDIA' : 'BAJA',
  }
}

// ---- Capital liberable ----------------------------------------------------
// Prioridad:
//  1) snapshot persistido (consultoriaFase1.oportunidad.snapshot)
//  2) campo ejecutivo (informe.ejecutivo?.resumen) si no hay snapshot
//  3) estimación local a partir de valor de coste y fricción
// Devolvemos { valor, fuente: 'persistido' | 'estimado' } para que la UI pueda rotularlo.
export function calcCapitalLiberable({ snapshotOportunidad, resumenEjecutivo, metricas } = {}) {
  const persistidoSnapshot = toNumber(snapshotOportunidad && snapshotOportunidad.capital_liberable_estimado)
  if (persistidoSnapshot > 0) {
    return { valor: Math.round(persistidoSnapshot), fuente: 'persistido' }
  }
  const persistidoEjecutivo = toNumber(resumenEjecutivo && resumenEjecutivo.capital_liberable_estimado)
  if (persistidoEjecutivo > 0) {
    return { valor: Math.round(persistidoEjecutivo), fuente: 'persistido' }
  }
  const valorCoste = toNumber(metricas && metricas.valorCoste)
  const vinos = toNumber(metricas && metricas.vinos)
  if (!valorCoste || !vinos) return { valor: 0, fuente: 'estimado' }
  const friccion = toNumber(metricas && metricas.margenBajo)
    + toNumber(metricas && metricas.bajoMinimo)
    + toNumber(metricas && metricas.sinProveedor)
  if (!friccion) return { valor: 0, fuente: 'estimado' }
  const estimado = Math.round(valorCoste * Math.min(0.18, Math.max(0.04, (friccion / vinos) * 0.18)))
  return { valor: estimado, fuente: 'estimado' }
}

// ---- Alertas críticas -----------------------------------------------------
// Fuente única: contar la tabla `alerts` filtrada por severidad=crítica y
// estado abierto/en_progreso cuando se nos pasa. Si no se nos pasa (ficha que
// aún no cargó alerts), hacemos fallback contando las alertas pesadas (>=12)
// del propio análisis local. Marcamos fuente para que la UI pueda rotularlo.
export function calcAlertasCriticas({ alertasDb, analisis } = {}) {
  if (Array.isArray(alertasDb)) {
    const criticas = alertasDb.filter(a => {
      const sev = String(a && (a.severidad || a.severity) || '').toLowerCase()
      const estado = String(a && a.estado || '').toLowerCase()
      const estadosAbiertos = ['abierta', 'en_progreso', 'pendiente', '']
      return sev === 'critica' && estadosAbiertos.includes(estado)
    }).length
    return { valor: criticas, fuente: 'persistido' }
  }
  const alertas = (analisis && Array.isArray(analisis.alertas)) ? analisis.alertas : []
  const estimado = alertas.filter(a => toNumber(a.peso) >= 12).length
  return { valor: estimado, fuente: 'estimado' }
}

// ---- Candidatos por copa --------------------------------------------------
// 1) Snapshot copa persistido si existe (suma de los 3 cubos)
// 2) campo ejecutivo
// 3) estimación local
export function calcCandidatosCopa({ snapshotCopa, resumenEjecutivo, metricas } = {}) {
  if (snapshotCopa) {
    const total = toNumber(snapshotCopa.candidatos_copa)
      + toNumber(snapshotCopa.candidatos_copa_premium)
      + toNumber(snapshotCopa.candidatos_coravin)
    if (total > 0) return { valor: total, fuente: 'persistido' }
  }
  const persistido = toNumber(resumenEjecutivo && resumenEjecutivo.candidatos_copa)
  if (persistido > 0) return { valor: persistido, fuente: 'persistido' }
  const vinos = toNumber(metricas && metricas.vinos)
  const copaActuales = toNumber(metricas && metricas.copa)
  const estimado = Math.max(0, Math.round(vinos * 0.12) - copaActuales)
  return { valor: estimado, fuente: 'estimado' }
}

// ---- Fotos (3 nombres distintos) -----------------------------------------
// Antes había 3 "fotos" con el mismo nombre. Las renombramos con etiquetas
// claras y una leyenda comprensible para un consultor.
//
//   envio_semanal:  "Resumen enviado al cliente esta semana"
//                   Fuente: weekly_summary.delivery_status === 'sent'
//
//   datos_radar:    "Datos guardados para el radar del consultor"
//                   Fuente: opportunity_snapshots u otro snapshot del motor
//
//   defensa_cliente:"Documentación lista para enseñar al cliente"
//                   Fuente: economic_traceability con foto_persistida
//
// Devolvemos siempre los 3 campos con { ok, label, descripcion }.
export function describirFotos({ semanal, snapshotMotor, defensa } = {}) {
  const semanalEnviado = String(semanal && (semanal.delivery && semanal.delivery.status || semanal.delivery_status) || '').toLowerCase() === 'sent'
  const motorGuardado = !!snapshotMotor
  const defensaOk = !!(defensa && (defensa.tiene_foto || defensa.estado === 'listo' || defensa.persistida))
  return {
    envio_semanal: {
      ok: semanalEnviado,
      label: 'Resumen enviado al cliente',
      descripcion: '¿Se mandó el resumen semanal por email esta semana?',
    },
    datos_radar: {
      ok: motorGuardado,
      label: 'Datos guardados para el radar',
      descripcion: '¿Hay cifras guardadas del motor para alimentar el radar?',
    },
    defensa_cliente: {
      ok: defensaOk,
      label: 'Documentación para el cliente',
      descripcion: '¿Hay informe guardado listo para enseñar al cliente?',
    },
  }
}

// ---- Selección Mi día -----------------------------------------------------
// Devuelve entre 0 y 5 tareas accionables, priorizadas por urgencia y € en juego.
// Entrada: array de contextos de restaurante con shape:
//   { restaurante: { id, nombre, slug },
//     propuestasInteresan: number,
//     alertasCriticas: number,
//     capitalLiberable: number,
//     costesBloqueantes: number,          // vinos sin coste + margen bajo
//     isDemoAgregado: boolean }           // excluir del embudo si true
// Reglas:
//  - excluimos demos del agregado.
//  - orden: cliente caliente (propuestas interesan) > crítica abierta > capital alto con bloqueo de costes
//  - deduplicamos: 1 tarea por restaurante
export function seleccionarTareasMiDia(contextos = [], { limite = 5 } = {}) {
  const limpios = contextos.filter(c => c && c.restaurante && !c.isDemoAgregado)
  const candidatas = []
  for (const c of limpios) {
    const base = { restaurante: c.restaurante, euros: toNumber(c.capitalLiberable) }
    if (toNumber(c.propuestasInteresan) > 0) {
      candidatas.push({
        ...base,
        tipo: 'cerrar_propuesta',
        verbo: 'Cierra la propuesta abierta',
        urgencia: 100 + toNumber(c.propuestasInteresan),
        cta: 'Ver propuestas',
        destino: `/admin/restaurante/${c.restaurante.id}?tab=propuestas`,
      })
      continue
    }
    if (toNumber(c.alertasCriticas) > 0) {
      candidatas.push({
        ...base,
        tipo: 'resolver_alerta',
        verbo: 'Resuelve la alerta crítica',
        urgencia: 80 + toNumber(c.alertasCriticas) * 5,
        cta: 'Ver alertas',
        destino: `/admin/alertas?restaurante=${c.restaurante.id}`,
      })
      continue
    }
    if (toNumber(c.costesBloqueantes) >= 3 && toNumber(c.capitalLiberable) >= 200) {
      candidatas.push({
        ...base,
        tipo: 'desbloquear_costes',
        verbo: 'Mete los costes que faltan',
        urgencia: 60 + Math.min(20, toNumber(c.capitalLiberable) / 50),
        cta: 'Ver costes',
        destino: `/admin/restaurante/${c.restaurante.id}`,
      })
      continue
    }
  }
  candidatas.sort((a, b) => b.urgencia - a.urgencia || b.euros - a.euros)
  return candidatas.slice(0, Math.max(0, limite))
}

// ---- Matching ≥95% --------------------------------------------------------
// Dado un conjunto de matches {wineId, score}, selecciona sólo los que
// cumplan el umbral y devuelve id + score.
export function seleccionarMatchesAutoaplicables(matches = [], { umbral = 95 } = {}) {
  const u = toNumber(umbral)
  return matches
    .filter(m => m && m.wineId && toNumber(m.score) >= u)
    .map(m => ({ wineId: m.wineId, score: Math.min(99, Math.round(toNumber(m.score))) }))
}

// ---- Excluir demos de agregados ------------------------------------------
// Lista hardcoded pero separada de DEMO_IDS. DEMO_IDS controla cosmética en
// la UI del cliente (ocultar cifras). Esta lista controla si un restaurante
// debe EXCLUIRSE de métricas agregadas del panel del consultor.
const EXCLUIR_AGREGADO_SLUGS = new Set([
  'araboka',
  'sumiller-casa-marisma',
])

const EXCLUIR_AGREGADO_IDS = new Set([
  // Vacío por ahora. Casa Marisma sigue en DEMO_IDS (UI cliente) pero
  // participa en agregados del consultor para poder usarse como caso real.
])

export function esExcluidoDeAgregado(restaurante) {
  if (!restaurante) return false
  const slug = String(restaurante.slug || '').toLowerCase()
  const id = String(restaurante.id || '').toLowerCase()
  return EXCLUIR_AGREGADO_SLUGS.has(slug) || EXCLUIR_AGREGADO_IDS.has(id)
}

export const _internal = { EXCLUIR_AGREGADO_SLUGS, EXCLUIR_AGREGADO_IDS, floor }
