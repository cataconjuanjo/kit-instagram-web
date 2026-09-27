/**
 * Wine role-selection logic — pure functions, no server deps.
 * Importable directly in Node test files.
 */
import { resolverPerfilesVino } from './wineProfileTags.js'

export const SCORE_MINIMO_RECOMENDACION = 15
const UMBRAL_RELATIVO_AJUSTADO = 0.60

function rasgoDistintivo(vino, vinoEleccion, idioma = 'es') {
  const tipo = String(vino.tipo || '').toLowerCase()
  const tipoRef = String(vinoEleccion?.tipo || '').toLowerCase()

  if (tipo === 'espumoso') return idioma === 'en' ? 'Sparkling' : 'Con burbujas'
  if (tipo === 'blanco' && tipoRef !== 'blanco') return idioma === 'en' ? 'White option' : 'En blanco'
  if (tipo === 'rosado') return idioma === 'en' ? 'Rosé option' : 'En rosado'
  if (tipo === 'dulce') return idioma === 'en' ? 'Sweet' : 'Dulce'
  if (tipo === 'generoso') {
    const perfilesGen = resolverPerfilesVino(vino)
    if (perfilesGen.includes('mineral_salino')) return idioma === 'en' ? 'Saline dry' : 'Salino y seco'
    if (perfilesGen.includes('oxidativo')) return idioma === 'en' ? 'Nutty depth' : 'Con frutos secos'
    return idioma === 'en' ? 'Dry and precise' : 'Seco y preciso'
  }

  const perfiles = resolverPerfilesVino(vino)
  const perfilesRef = resolverPerfilesVino(vinoEleccion || {})

  if (perfiles.includes('cuerpo_ligero') && perfilesRef.includes('con_cuerpo')) {
    return idioma === 'en' ? 'Lighter' : 'Más ligero'
  }
  if (perfiles.includes('con_cuerpo') && perfilesRef.includes('cuerpo_ligero')) {
    return idioma === 'en' ? 'Fuller' : 'Con más cuerpo'
  }
  if (perfiles.includes('alta_acidez') && !perfilesRef.includes('alta_acidez')) {
    return idioma === 'en' ? 'Fresher' : 'Más fresco'
  }

  const frutaIds = ['fruta_roja', 'fruta_negra', 'fruta_hueso', 'fruta_tropical', 'fruta_citrica', 'fruta_verde']
  const frutaCount = perfiles.filter(id => frutaIds.includes(id)).length
  const frutaCountRef = perfilesRef.filter(id => frutaIds.includes(id)).length
  if (frutaCount > frutaCountRef && frutaCount >= 2) {
    return idioma === 'en' ? 'More fruity' : 'Más frutal'
  }

  return idioma === 'en' ? 'Another option' : 'Otra opción'
}

export function candidatosUnicos(candidatos = [], limite = 3) {
  const usados = new Set()
  return (candidatos || []).filter(item => {
    const clave = item?.vino?.id || item?.vino?.nombre
    if (!clave || usados.has(clave)) return false
    usados.add(clave)
    return true
  }).slice(0, limite)
}

/**
 * Assigns role labels to scored wine candidates.
 * @param {Array} candidatos - Scored wine candidates
 * @param {string} idioma - 'es' or 'en'
 * @param {boolean} soloCopa - Glass-only mode
 * @param {boolean} señalPresupuesto - Client signalled budget preference
 * @param {number|null} techoPrecio - Explicit price ceiling in euros, or null
 * @returns {Array} Up to 3 { item, rol } objects
 */
export function seleccionarVinosConRoles(candidatos, idioma = 'es', soloCopa = false, señalPresupuesto = false, techoPrecio = null) {
  const usados = new Set()
  const unicos = (candidatos || []).filter(item => {
    const k = item?.vino?.id || item?.vino?.nombre
    if (!k || usados.has(k)) return false
    usados.add(k)
    return true
  })
  if (!unicos.length) return []

  const aptos = unicos.filter(item => item.score >= SCORE_MINIMO_RECOMENDACION)
  let candidatosUsados = aptos.length >= 1 ? aptos : unicos

  // Filter by price ceiling if a specific amount was mentioned
  if (techoPrecio !== null) {
    const precioFn = v => soloCopa ? (Number(v.precio_copa) || 0) : (Number(v.precio_botella) || 0)
    const dentroTecho = candidatosUsados.filter(item => {
      const p = precioFn(item.vino)
      return p > 0 && p <= techoPrecio
    })
    if (dentroTecho.length >= 1) candidatosUsados = dentroTecho
  }

  const rolEleccion = idioma === 'en' ? 'My pick' : 'Mi elección'
  const rolAjustado = idioma === 'en' ? 'Best value' : 'Más ajustado'
  const precioVino = v => soloCopa ? (Number(v.precio_copa) || 0) : (Number(v.precio_botella) || 0)

  // Budget signal: Mi elección = cheapest qualifying wine instead of max score
  const eleccion = señalPresupuesto
    ? [...candidatosUsados].sort((a, b) => precioVino(a.vino) - precioVino(b.vino))[0]
    : candidatosUsados.reduce((best, item) => item.score > best.score ? item : best, candidatosUsados[0])

  if (candidatosUsados.length === 1) return [{ item: eleccion, rol: rolEleccion }]

  const restantes = candidatosUsados.filter(item => item !== eleccion)

  // Relative threshold: 60% of Mi elección ensures decent aromatic bridge for every slot
  const umbral = eleccion.score * UMBRAL_RELATIVO_AJUSTADO
  const restantesAptos = restantes.filter(item => item.score >= umbral)

  const precioEleccion = precioVino(eleccion.vino)

  // Más ajustado: cheapest qualifying wine strictly cheaper than Mi elección
  const candidatosMasAjustado = restantesAptos.filter(item => precioVino(item.vino) < precioEleccion)
  const masAjustado = candidatosMasAjustado.length > 0
    ? candidatosMasAjustado.reduce((cheapest, item) =>
        precioVino(item.vino) < precioVino(cheapest.vino) ? item : cheapest, candidatosMasAjustado[0])
    : null

  if (candidatosUsados.length === 2) {
    const segundo = restantes[0]
    if (!restantesAptos.includes(segundo)) return [{ item: eleccion, rol: rolEleccion }]
    const esMasCaro = precioVino(segundo.vino) >= precioEleccion
    return [
      { item: eleccion, rol: rolEleccion },
      { item: segundo, rol: esMasCaro ? rasgoDistintivo(segundo.vino, eleccion.vino, idioma) : rolAjustado },
    ]
  }

  // Tercero: qualifying, different from masAjustado
  const terceroBase = restantesAptos.filter(item => item !== masAjustado)
  const tercero = terceroBase.length > 0 ? terceroBase[0] : null

  if (!masAjustado && !tercero) return [{ item: eleccion, rol: rolEleccion }]
  if (!masAjustado) return [
    { item: eleccion, rol: rolEleccion },
    { item: tercero, rol: rasgoDistintivo(tercero.vino, eleccion.vino, idioma) },
  ]
  if (!tercero) return [
    { item: eleccion, rol: rolEleccion },
    { item: masAjustado, rol: rolAjustado },
  ]

  return [
    { item: eleccion, rol: rolEleccion },
    { item: tercero, rol: rasgoDistintivo(tercero.vino, eleccion.vino, idioma) },
    { item: masAjustado, rol: rolAjustado },
  ]
}
