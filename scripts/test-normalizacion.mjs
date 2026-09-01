/**
 * Test unitario de normalización del catálogo.
 * Ejecutar: node scripts/test-normalizacion.mjs
 * No conecta con Supabase ni toca la base de datos.
 */

import { titleCaseNombre } from '../app/lib/normalizarNombre.js'
import { splitZonaTipo, sospechaZona, splitFormato } from '../app/lib/normalizarCatalogo.js'

const CASOS = [
  // ── Nombres ──────────────────────────────────────────────────────────────
  { tipo: 'nombre', label: 'Número + paréntesis + año',      entrada: '12 (DOCE) 2020' },
  { tipo: 'nombre', label: 'Comillas + paréntesis alemán',   entrada: '"A.d.L." (Aus den Lagen)' },
  { tipo: 'nombre', label: 'Número en nombre (sin cambio)',  entrada: '7 Vidas Blanco' },
  // ── Regiones ─────────────────────────────────────────────────────────────
  { tipo: 'region', label: 'Eslogan sin mayúsculas',         entrada: 'vinos son fruto de un gran esfuerzo · blanco' },
  { tipo: 'region', label: 'Código numérico italiano',       entrada: '7 - EMILIA ROMAGNA · rosado' },
  { tipo: 'region', label: 'DO con clasificación S/DO',      entrada: 'RIBEIRO S/DO · dulce' },
  // ── Formatos ─────────────────────────────────────────────────────────────
  { tipo: 'formato', label: 'Soto: 150cl + u/c + ref',       entrada: '150cl · 3 u/c Mad · 722035' },
  { tipo: 'formato', label: 'Soto: 0.75L + ref numérica',    entrada: '0.75 L · 016446' },
  { tipo: 'formato', label: 'Formato simple sin separador',  entrada: 'botella 75 cl' },
  { tipo: 'formato', label: 'Nombre especial + volumen',     entrada: 'doble magnum 300 cl' },
]

// ── Procesadores ────────────────────────────────────────────────────────────

function procesarNombre(entrada) {
  const salida = titleCaseNombre(entrada)
  const estado = salida === entrada ? 'SIN_CAMBIO' : 'OK'
  return { salida, estado }
}

function procesarRegion(entrada) {
  const { zona, tipo } = splitZonaTipo(entrada)
  const sospecha = sospechaZona(zona)
  const estado = sospecha ? 'REVISAR_ZONA' : 'OK'
  return {
    salida: `zona="${zona}" | tipo="${tipo}"`,
    estado,
  }
}

function procesarFormato(entrada) {
  const r = splitFormato(entrada)
  const estado = r.revisar ? 'REVISAR_FORMATO' : 'OK'
  const partes = [
    `tamanyo="${r.tamanyo}"`,
    `uds=${r.unidades_por_caja ?? '—'}`,
    `ref="${r.referencia_proveedor}"`,
  ]
  if (r.almacen_proveedor) partes.push(`almacen="${r.almacen_proveedor}"`)
  return { salida: partes.join(' | '), estado }
}

// ── Renderizado ─────────────────────────────────────────────────────────────

const W_TIPO   = 8
const W_LABEL  = 34
const W_ENT    = 52
const W_SAL    = 64
const W_EST    = 16

function pad(s, n) { return String(s ?? '').padEnd(n) }
function sep(cols) { return cols.map(n => '─'.repeat(n + 2)).join('┼') }

const encabezado = [
  pad('TIPO',   W_TIPO),
  pad('CASO',   W_LABEL),
  pad('ENTRADA', W_ENT),
  pad('SALIDA',  W_SAL),
  pad('ESTADO',  W_EST),
].join(' │ ')

console.log('\n' + encabezado)
console.log(sep([W_TIPO, W_LABEL, W_ENT, W_SAL, W_EST]))

for (const { tipo, label, entrada } of CASOS) {
  let res
  if (tipo === 'nombre')  res = procesarNombre(entrada)
  if (tipo === 'region')  res = procesarRegion(entrada)
  if (tipo === 'formato') res = procesarFormato(entrada)

  const fila = [
    pad(tipo,    W_TIPO),
    pad(label,   W_LABEL),
    pad(entrada.slice(0, W_ENT),  W_ENT),
    pad(res.salida.slice(0, W_SAL), W_SAL),
    pad(res.estado, W_EST),
  ].join(' │ ')

  console.log(fila)
}

console.log('\nTest completado. Ninguna conexión a Supabase realizada.\n')

// ── Detalles formato (fila larga → segunda pasada) ──────────────────────────

console.log('── Detalle completo de formatos ──────────────────────────────')
for (const { tipo, label, entrada } of CASOS.filter(c => c.tipo === 'formato')) {
  const r = splitFormato(entrada)
  console.log(`\n[${label}]`)
  console.log(`  entrada           : "${entrada}"`)
  console.log(`  tamanyo           : "${r.tamanyo}"`)
  console.log(`  unidades_por_caja : ${r.unidades_por_caja ?? 'null'}`)
  console.log(`  referencia        : "${r.referencia_proveedor}"`)
  console.log(`  almacen_proveedor : "${r.almacen_proveedor}"`)
  console.log(`  revisar           : ${r.revisar}`)
}
