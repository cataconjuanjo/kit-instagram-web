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
// Fuente única, preferencia: conteo persistido (lo que devuelve el API
// radar-ejecutivo en resumen.alertas_criticas) > contar tabla `alerts` por
// severidad=crítica y estado abierto/en_progreso > fallback por pesos.
// El fallback se marca como 'estimado' para que la UI pueda rotularlo.
export function calcAlertasCriticas({ conteoPersistido, alertasDb, analisis } = {}) {
  if (typeof conteoPersistido === 'number' && Number.isFinite(conteoPersistido)) {
    return { valor: conteoPersistido, fuente: 'persistido' }
  }
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

// ---- Oportunidad económica desglosada por palanca ------------------------
// Antes vivía inline en consultoria/page.js como `oportunidadRadar`:
//   (margenBajo * 180) + (sinCoste * 60) + (propuestas * 120) + (copaFaltante * 90)
// Lo movemos al helper único para que el informe del cliente pueda pintar
// el € por prioridad y que la suma CUADRE con el total.
//
// Cada palanca lleva:
//   id: estable para filtros (p. ej. 'propuestas_abiertas' se filtra en el
//     informe del cliente por ser señal comercial interna).
//   titulo: lenguaje de dueño.
//   euros: estimado anual.
//   esInterna: true si es jerga comercial (no se muestra al cliente).
//
// Si `persistidoTotal` es > 0 (viene de ejecutivo.resumen.recuperacion_anual_
// estimada), lo usamos como total y escalamos las palancas heurísticas para
// que sumen exacto. Si no hay persistido, total = suma cruda.
export function calcPalancasOportunidad({ metricas, propuestasAbiertas, persistidoTotal } = {}) {
  const m = metricas || {}
  const vinos = toNumber(m.vinos)
  const copaActuales = toNumber(m.copa)
  const copaFaltante = Math.max(0, Math.round(vinos * 0.12) - copaActuales)
  const propuestas = toNumber(propuestasAbiertas)

  const crudas = [
    { id: 'margen_bajo',   titulo: 'Vinos con margen bajo', esInterna: false, euros: toNumber(m.margenBajo) * 180 },
    { id: 'sin_coste',     titulo: 'Vinos sin coste registrado (impide medir margen real)', esInterna: false, euros: toNumber(m.sinCoste) * 60 },
    { id: 'copa_faltante', titulo: 'Más vinos ofrecidos por copa', esInterna: false, euros: copaFaltante * 90 },
    { id: 'propuestas_abiertas', titulo: 'Cerrar propuestas comerciales abiertas', esInterna: true, euros: propuestas * 120 },
  ].filter(p => p.euros > 0)

  const sumaCruda = crudas.reduce((s, p) => s + p.euros, 0)
  const persistido = toNumber(persistidoTotal)
  const total = persistido > 0 ? Math.round(persistido) : sumaCruda

  // Si hay persistido, escalamos las palancas para que sumen exacto.
  if (persistido > 0 && sumaCruda > 0) {
    const factor = total / sumaCruda
    for (const p of crudas) p.euros = Math.round(p.euros * factor)
    // Absorber el resto del redondeo en la palanca con más peso para que
    // suma === total (si no, pueden quedar ±1-2 € sueltos).
    crudas.sort((a, b) => b.euros - a.euros)
    const resto = total - crudas.reduce((s, p) => s + p.euros, 0)
    if (crudas[0]) crudas[0].euros += resto
  }

  crudas.sort((a, b) => b.euros - a.euros)
  return { total, palancas: crudas }
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
  if (resumenEjecutivo && typeof resumenEjecutivo.candidatos_copa === 'number') {
    return { valor: resumenEjecutivo.candidatos_copa, fuente: 'persistido' }
  }
  const vinos = toNumber(metricas && metricas.vinos)
  const copaActuales = toNumber(metricas && metricas.copa)
  const estimado = Math.max(0, Math.round(vinos * 0.12) - copaActuales)
  return { valor: estimado, fuente: 'estimado' }
}

// Contador separado para "Vinos actualmente servidos por copa" — distinto
// concepto que "Candidatos a copa". Sirve para no forzar que coincidan.
export function calcVinosPorCopa({ metricas, vinos } = {}) {
  if (Array.isArray(vinos)) {
    return vinos.filter(v => v && v.activo !== false && toNumber(v.precio_copa) > 0).length
  }
  return toNumber(metricas && metricas.copa)
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

// ---- Matching: regla rica de auto-aplicación (fase J-fix) -----------------
// Entrada: array de grupos { vino, candidatos } donde vino puede traer
// `formato_compra` (texto, ej. '75 cl', '300 cl', 'Magnum 150 cl').
// Candidatos son { score, vino: { formato, ...}, proveedor, ... }.
//
// Regla:
//   1) Filtrar candidatos con score >= umbral.
//   2) Si hay 0 → revisión.
//   3) Si hay exactamente 1 → auto.
//   4) Si hay varios:
//      - Ordenar por score desc. Si el 1º no supera al 2º en >= 10 puntos → revisión.
//      - Si el vino de la carta tiene formato informado:
//          · El candidato elegido debe tener MISMO formato (en cl) → auto.
//          · Si no coincide → revisión.
//      - Si el vino no tiene formato:
//          · Si hay un único candidato ≥95% de 75 cl y ninguno de otro cl
//            con ≥95% → auto con ese.
//          · Si no → revisión.
//
// Devuelve { auto: [{ vino, candidato, score, formato }], revision: [...] }.
function _normalizarFormato(txt) {
  const bruto = String(txt || '').toLowerCase().replace(',', '.')
  const match = bruto.match(/(\d+(?:\.\d+)?)\s*cl/)
  if (match) return Math.round(parseFloat(match[1]))
  // aliases comunes sin cifra
  if (/magnum/.test(bruto)) return 150
  if (/jeroboam|jeroboa/.test(bruto)) return 300
  if (/matusale/.test(bruto)) return 600
  if (/salmanazar/.test(bruto)) return 900
  if (/balthazar/.test(bruto)) return 1200
  if (/nabucodonosor/.test(bruto)) return 1500
  if (/media.*botella|half/.test(bruto)) return 37
  return null
}

export function seleccionarMatchesParaAutoAplicar(grupos = [], { umbral = 95, ventajaMinima = 10 } = {}) {
  const u = toNumber(umbral)
  const v = toNumber(ventajaMinima)
  const auto = []
  const revision = []
  for (const grupo of grupos) {
    if (!grupo || !grupo.vino) continue
    // Ordenamos TODOS los candidatos por score (sin filtrar por umbral),
    // porque la comparación de ventaja considera también los que están
    // por debajo del umbral como 'segundo'.
    const todos = (grupo.candidatos || [])
      .map(c => ({ ...c, score: Math.min(99, Math.round(toNumber(c.score))) }))
      .sort((a, b) => b.score - a.score)
    const mejor = todos[0]
    if (!mejor || mejor.score < u) {
      revision.push({ vino: grupo.vino, motivo: 'sin_candidato', candidatos: todos })
      continue
    }
    const formatoVino = _normalizarFormato(grupo.vino.formato_compra)
    const formatoCand = _normalizarFormato(mejor.vino && mejor.vino.formato)

    // Caso (a): solo hay UN candidato en la lista total → auto directo
    // (si el formato no choca con el del vino cuando está informado).
    if (todos.length === 1) {
      if (formatoVino != null && formatoCand != null && formatoCand !== formatoVino) {
        revision.push({ vino: grupo.vino, motivo: 'formato_distinto', candidatos: todos })
      } else {
        auto.push({ vino: grupo.vino, candidato: mejor, score: mejor.score, motivo: 'unico_candidato' })
      }
      continue
    }

    // Caso (b): hay segundo candidato (dentro o fuera del umbral). Pedir
    // ventaja ≥ ventajaMinima puntos para considerar al mejor como ganador claro.
    const segundoScore = todos[1].score
    const ventaja = mejor.score - segundoScore
    if (ventaja < v) {
      revision.push({ vino: grupo.vino, motivo: 'ventaja_insuficiente', candidatos: todos })
      continue
    }

    if (formatoVino != null) {
      if (formatoCand === formatoVino) {
        auto.push({ vino: grupo.vino, candidato: mejor, score: mejor.score, motivo: 'formato_coincide' })
      } else {
        revision.push({ vino: grupo.vino, motivo: 'formato_distinto', candidatos: todos })
      }
      continue
    }

    // Vino sin formato: solo auto si TODOS los candidatos ≥umbral son 75cl.
    const candidatosAlto = todos.filter(c => c.score >= u)
    const formatosAlto = new Set(candidatosAlto.map(c => _normalizarFormato(c.vino && c.vino.formato)).filter(x => x != null))
    const soloSetentaicinco = formatosAlto.size === 1 && formatosAlto.has(75)
    if (soloSetentaicinco && formatoCand === 75) {
      auto.push({ vino: grupo.vino, candidato: mejor, score: mejor.score, motivo: 'asumido_75cl' })
    } else {
      revision.push({ vino: grupo.vino, motivo: 'sin_formato_informado', candidatos: todos })
    }
  }
  return { auto, revision }
}

// ---- Excluir demos de agregados ------------------------------------------
// Lista hardcoded pero separada de DEMO_IDS. DEMO_IDS controla cosmética en
// la UI del cliente (ocultar cifras). Esta lista controla si un restaurante
// debe EXCLUIRSE de métricas agregadas del panel del consultor.
const EXCLUIR_AGREGADO_SLUGS = new Set([
  'araboka',
  'sumiller-casa-marisma',
  'casa-marisma',
])

const EXCLUIR_AGREGADO_IDS = new Set([
  // Casa Marisma: demo pilotada. Queda en DEMO_IDS (cosmética cliente)
  // Y en esta lista (agregados consultor), por decisión de fase J-fix.
  '65d26545-7c7e-424c-9c29-33bfe8bbaafa',
])

export function esExcluidoDeAgregado(restaurante) {
  if (!restaurante) return false
  const slug = String(restaurante.slug || '').toLowerCase()
  const id = String(restaurante.id || '').toLowerCase()
  return EXCLUIR_AGREGADO_SLUGS.has(slug) || EXCLUIR_AGREGADO_IDS.has(id)
}

// ---- Sanitizador de rutas técnicas ---------------------------------------
// El texto que ve el cliente no debe contener rutas internas como
// "/dashboard/vinos?filtro=pendientes". Las sustituimos por lenguaje natural.
const SUSTITUCIONES_RUTAS = [
  { regex: /\/dashboard\/vinos\?filtro=pendientes/g, reemplazo: 'revisa los precios de los vinos pendientes' },
  { regex: /\/dashboard\/vinos\?filtro=[^\s)]+/g, reemplazo: 'revisa los vinos en la bodega' },
  { regex: /\/dashboard\/platos\?filtro=[^\s)]+/g, reemplazo: 'revisa los platos pendientes' },
  { regex: /\/dashboard\/bodega[^\s)]*/g, reemplazo: 'entra en la bodega' },
  { regex: /\/dashboard\/catalogo[^\s)]*/g, reemplazo: 'revisa el catálogo' },
  { regex: /\/dashboard\/cierre[^\s)]*/g, reemplazo: 'revisa el cierre del día' },
  { regex: /\/dashboard\/menu-engineering[^\s)]*/g, reemplazo: 'revisa el menú de maridajes' },
  { regex: /\/dashboard\/sala[^\s)]*/g, reemplazo: 'revisa el modo sala' },
  { regex: /\/dashboard\/simulador[^\s)]*/g, reemplazo: 'abre el simulador' },
  { regex: /\/dashboard\/estadisticas[^\s)]*/g, reemplazo: 'revisa las estadísticas' },
  { regex: /\/dashboard\/[^\s)]+/g, reemplazo: 'revisa el panel del restaurante' },
]

export function limpiarRutasTecnicas(texto) {
  if (!texto) return ''
  let resultado = String(texto)
  for (const { regex, reemplazo } of SUSTITUCIONES_RUTAS) {
    resultado = resultado.replace(regex, reemplazo)
  }
  return resultado
}

// ---- Deduplicación de acciones -------------------------------------------
// Dos acciones son duplicadas si coinciden la clave construida.
// Por defecto usamos restaurante_id + tipo + origen (campos del backend
// original). Admite además 'titulo' normalizado como criterio adicional
// — útil cuando una alerta auto-generada y una acción manual tienen el
// mismo título (p.ej. 'Costes pendientes' en Araboka).
function _normalizarClave(txt) {
  return String(txt || '').trim().toLowerCase()
}

export function deduplicarAcciones(acciones = [], { porTitulo = false } = {}) {
  const vistas = new Set()
  const salida = []
  for (const accion of acciones) {
    if (!accion) continue
    const restaurante = _normalizarClave(accion.restaurante_id || accion.restauranteId)
    const clave = porTitulo
      ? `${restaurante}::titulo::${_normalizarClave(accion.titulo)}`
      : `${restaurante}::${_normalizarClave(accion.tipo)}::${_normalizarClave(accion.origen)}`
    if (vistas.has(clave)) continue
    vistas.add(clave)
    salida.push(accion)
  }
  return salida
}

export const _internal = { EXCLUIR_AGREGADO_SLUGS, EXCLUIR_AGREGADO_IDS, floor }
