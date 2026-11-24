// FASE K — Bloque 3: construcción del informe de cliente de 1 página.
// Función pura: Radar/ficha pasan los datos necesarios y aquí producimos
// el objeto que la vista imprimible renderiza. Sin BD, sin React.

import { limpiarRutasTecnicas } from './consultoriaMetricas.js'

function toNumber(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

function toEuro(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return null
  return `${Math.round(v).toLocaleString('es-ES')} €`
}

function fraseCifraPrincipal(euros, numPrioridades = 3) {
  if (!euros) return 'Oportunidad anual pendiente de cuantificar con tu equipo.'
  if (numPrioridades <= 0) {
    return `Trabajando las oportunidades detectadas este trimestre, estimamos recuperar ${euros} al año en margen y rotación.`
  }
  if (numPrioridades === 1) {
    return `Si trabajamos la prioridad detectada este trimestre, estimamos recuperar ${euros} al año en margen y rotación.`
  }
  return `Si trabajamos las ${numPrioridades} prioridades este trimestre, estimamos recuperar ${euros} al año en margen y rotación.`
}

function limpiarTextoCliente(texto) {
  if (!texto) return ''
  const sin = limpiarRutasTecnicas(String(texto))
  // Elimina jerga interna que no debe aparecer en el informe del cliente.
  return sin
    .replace(/\bfase\s*\d+\b/gi, '')
    .replace(/\bsnapshot\b/gi, 'foto guardada')
    .replace(/\bscore\b/gi, '')
    .replace(/\bpersistid[oa]\b/gi, 'guardada')
    .replace(/\bmotor\b/gi, 'análisis')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Señales INTERNAS que NO deben aparecer como prioridades para el cliente.
// Son banderas comerciales/consultor, no problemas de SU carta.
const PRIORIDADES_INTERNAS = [
  /cliente caliente/i,
  /propuestas? abiertas?/i,
  /propuestas? acumuladas?/i,
  /sin contacto/i,
  /contacto programado/i,
  /contacto vencido/i,
  /seguimiento comercial/i,
  /alertas? abiertas?/i,
  /alertas? cr[ií]ticas?/i,
]

function esSenalInterna(p) {
  if (!p) return true
  const campos = [p.titulo, p.detalle, p.accion, p.servicio].filter(Boolean).join(' ')
  return PRIORIDADES_INTERNAS.some(re => re.test(campos))
}

// Reescribe el título de una alerta de carta en lenguaje de dueño.
// Mapa no exhaustivo: cae a un título decente si no reconoce el patrón.
function tituloParaCliente(crudo) {
  const t = String(crudo || '').toLowerCase()
  if (/vinos? sin precio/.test(t)) return 'Vinos de la carta sin precio'
  if (/vinos? sin cost/.test(t) || /no se est[áa] midiendo rentabilidad/.test(t) || /no se mide rentabilidad/.test(t)) return 'Vinos sin coste de compra registrado'
  if (/margen bajo/.test(t)) return 'Vinos con margen bajo'
  if (/poca estrategia por copa/.test(t) || /por copa/.test(t)) return 'Pocos vinos ofrecidos por copa'
  if (/vino local/.test(t)) return 'Poca presencia de bodegas locales'
  if (/postres sin vino/.test(t)) return 'Falta vino de cierre para postres'
  if (/frituras/.test(t)) return 'Frituras sin vinos que acompañen bien'
  if (/pescado/.test(t)) return 'Pescados con poca cobertura de blancos'
  if (/queso/.test(t)) return 'Quesos sin vinos de maridaje'
  if (/carnes/.test(t) || /tintos/.test(t)) return 'Carta tinta poco diferenciada'
  if (/exceso rioja|ribera/.test(t)) return 'Carta muy concentrada en Rioja y Ribera'
  if (/perfil tinto/.test(t)) return 'Tintos muy parecidos entre sí'
  if (/faltan blancos gastron/.test(t)) return 'Faltan blancos gastronómicos'
  if (/ticket alto/.test(t) || /premium/.test(t)) return 'Pocos vinos premium para el ticket medio'
  if (/faltan argumentos/.test(t) || /perfil de cata/.test(t)) return 'Vinos sin argumento de venta para sala'
  if (/anad|añad/.test(t)) return 'Vinos sin año de añada'
  if (/stock poco fiable|stock cero/.test(t)) return 'Vinos con stock dudoso'
  if (/reposici/.test(t)) return 'Vinos pendientes de reponer'
  if (/proveedor/.test(t)) return 'Vinos sin proveedor asignado'
  if (/mapa de precios|arquitectura de precios/.test(t)) return 'Mapa de precios desequilibrado'
  if (/roturas de stock/.test(t)) return 'Sala detecta roturas de stock'
  if (/convencen en sala|dudas/.test(t)) return 'Vinos que no convencen en sala'
  if (/carta.*corta/.test(t)) return 'Carta de vinos corta'
  // Fallback: devuelve el título original limpiado.
  return limpiarTextoCliente(crudo || 'Prioridad de carta')
}

// Frase corta de cliente a partir del detalle crudo. Sin cifras internas
// de restaurante, sin IDs, sin rutas, sin "alerta/score".
function fraseParaCliente(prioridad) {
  const base = prioridad.detalle || prioridad.accion || ''
  const limpio = limpiarTextoCliente(base)
  if (!limpio) return ''
  // Capitaliza y acota a ~180 caracteres (cabe bien en 1 página A4).
  const cap = limpio.charAt(0).toUpperCase() + limpio.slice(1)
  return cap.length > 180 ? `${cap.slice(0, 177).trim()}…` : cap
}

// Construye el objeto del informe para el cliente a partir de:
//   restaurante: { nombre, ciudad, provincia, ... }
//   oportunidadEuros: número (recuperación anual estimada, usado solo si no
//     se pasan palancas con desglose).
//   prioridades: array crudo de alertas del motor (compat con llamadores
//     antiguos que no conocen palancas).
//   palancas: array nuevo (fase L) con desglose por palanca de la
//     oportunidad económica. Cada palanca { id, titulo, euros, esInterna }.
//     Si se pasa, ES la fuente de prioridades: cuadra la suma con el total.
//   seguimiento: salida de agregarSeguimiento (opcional).
//   proximoContacto: ISO date (opcional).
export function construirInformeCliente({
  restaurante,
  oportunidadEuros,
  prioridades = [],
  palancas = null,
  seguimiento = null,
  proximoContacto = null,
  fecha = new Date(),
} = {}) {
  // Rama fase L: si recibimos palancas, las usamos.
  // FASE L-fix: se separan dos grupos:
  //   (a) palancas con IMPORTE RECUPERABLE: suman a la cifra principal y
  //       se pintan con € al lado.
  //   (b) palancas marcadas como `soloDatos: true` (p.ej. 'sin_coste'):
  //       se pintan como partida de datos SIN importe, no suman a la
  //       cifra principal, y van al final de la lista.
  // Las esInterna=true se descartan igual que antes.
  let prioridadesLimpias
  let totalMostrado = toNumber(oportunidadEuros)
  if (Array.isArray(palancas)) {
    const clienteBase = palancas.filter(p => p && !p.esInterna)
    const conImporte = clienteBase.filter(p => !p.soloDatos && toNumber(p.euros) > 0)
    const soloDatos = clienteBase.filter(p => p.soloDatos && toNumber(p.euros) > 0)

    // Primero las con importe (ya vienen ordenadas desc del motor), luego
    // partida de datos. Máximo 3 en total.
    const ordenadas = [...conImporte, ...soloDatos].slice(0, 3)
    // Cifra principal = SOLO suma de las con importe efectivamente mostradas.
    const conImporteMostradas = ordenadas.filter(p => !p.soloDatos)
    totalMostrado = conImporteMostradas.reduce((s, p) => s + toNumber(p.euros), 0)
    prioridadesLimpias = ordenadas.map((p, i) => ({
      numero: i + 1,
      titulo: tituloParaCliente(p.titulo),
      detalle: fraseParaCliente({ detalle: p.detalle || '', accion: p.accion || '' }),
      euros: p.soloDatos ? null : toEuro(p.euros),
      soloDatos: !!p.soloDatos,
    }))
  } else {
    // Rama fase K (legacy): prioridades crudas del motor, sin € fiable.
    // FASE K-fix: filtrar señales INTERNAS.
    const soloCarta = (prioridades || []).filter(p => p && !esSenalInterna(p))
    prioridadesLimpias = soloCarta.slice(0, 3).map((p, i) => ({
      numero: i + 1,
      titulo: tituloParaCliente(p.titulo),
      detalle: fraseParaCliente(p),
      euros: toEuro(p.euros),
      soloDatos: false,
    }))
  }

  const seguimientoResumen = seguimiento ? {
    enviadas: Number(seguimiento.porEstado?.enviada || 0) + Number(seguimiento.porEstado?.aceptada || 0) + Number(seguimiento.porEstado?.implantada || 0),
    aceptadas: Number(seguimiento.porEstado?.aceptada || 0) + Number(seguimiento.porEstado?.implantada || 0),
    implantadas: Number(seguimiento.porEstado?.implantada || 0),
    capturado: toEuro(seguimiento.capturado),
  } : null

  return {
    titulo: 'Cata con Juanjo · Informe de carta',
    fecha: fecha instanceof Date ? fecha.toISOString() : new Date(fecha).toISOString(),
    fechaLegible: new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
    restaurante: {
      nombre: restaurante?.nombre || 'Restaurante',
      ubicacion: [restaurante?.ciudad, restaurante?.provincia].filter(Boolean).join(' · '),
    },
    cifraPrincipal: {
      valor: toEuro(totalMostrado),
      // El número de la frase SIEMPRE coincide con las prioridades que
      // se listan arriba (incluida la partida de datos si aparece).
      frase: fraseCifraPrincipal(toEuro(totalMostrado), prioridadesLimpias.length),
    },
    prioridades: prioridadesLimpias,
    seguimiento: seguimientoResumen,
    proximoContacto: proximoContacto ? new Date(proximoContacto).toLocaleDateString('es-ES') : null,
  }
}

// Mínimo valor diagnóstico: comprueba que la salida no contiene jerga
// interna. Se usa en tests.
export function auditarInformeCliente(informe) {
  const banderas = []
  const texto = JSON.stringify(informe || {})
  if (/\bscore\b/i.test(texto)) banderas.push('contiene "score"')
  if (/\bsnapshot\b/i.test(texto)) banderas.push('contiene "snapshot"')
  if (/\bfase\s*\d+/i.test(texto)) banderas.push('contiene "Fase N"')
  if (/\/dashboard\//i.test(texto)) banderas.push('contiene rutas /dashboard/')
  if (/motor persistente/i.test(texto)) banderas.push('contiene "motor persistente"')
  if (/cliente caliente/i.test(texto)) banderas.push('contiene jerga comercial "cliente caliente"')
  if (/propuestas? abiertas?/i.test(texto)) banderas.push('contiene jerga comercial "propuestas abiertas"')
  if (/\balertas?\b/i.test(texto)) banderas.push('contiene "alerta"')
  return { limpio: banderas.length === 0, banderas }
}
