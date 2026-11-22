// FASE K — Bloque 3: construcción del informe de cliente de 1 página.
// Función pura: Radar/ficha pasan los datos necesarios y aquí producimos
// el objeto que la vista imprimible renderiza. Sin BD, sin React.

import { limpiarRutasTecnicas } from './consultoriaMetricas.js'

function toEuro(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return null
  return `${Math.round(v).toLocaleString('es-ES')} €`
}

function fraseCifraPrincipal(euros) {
  if (!euros) return 'Oportunidad anual pendiente de cuantificar con tu equipo.'
  return `Si trabajamos las 3 prioridades este trimestre, estimamos recuperar ${euros} al año en margen y rotación.`
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

// Construye el objeto del informe para el cliente a partir de:
//   restaurante: { nombre, ciudad, provincia, ... }
//   oportunidadEuros: número (recuperación anual estimada)
//   prioridades: array de { titulo, euros, detalle, accion }  (hasta 3)
//   seguimiento: salida de agregarSeguimiento (opcional)
//   proximoContacto: ISO date (opcional)
export function construirInformeCliente({
  restaurante,
  oportunidadEuros,
  prioridades = [],
  seguimiento = null,
  proximoContacto = null,
  fecha = new Date(),
} = {}) {
  const prioridadesLimpias = prioridades
    .filter(Boolean)
    .slice(0, 3)
    .map((p, i) => ({
      numero: i + 1,
      titulo: limpiarTextoCliente(p.titulo || 'Prioridad'),
      detalle: limpiarTextoCliente(p.detalle || p.accion || ''),
      euros: toEuro(p.euros),
    }))

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
      valor: toEuro(oportunidadEuros),
      frase: fraseCifraPrincipal(toEuro(oportunidadEuros)),
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
  return { limpio: banderas.length === 0, banderas }
}
