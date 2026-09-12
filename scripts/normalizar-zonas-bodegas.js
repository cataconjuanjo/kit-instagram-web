'use strict'
/**
 * normalizar-zonas-bodegas.js
 * Bloque 4 — Pasada 1 (por defecto): genera propuestas en CSV y docs/bodegas-pendientes.md.
 * Pasada 2 (--apply): lee los CSV ya revisados y hace el backfill en la BD.
 *
 * Uso:
 *   node scripts/normalizar-zonas-bodegas.js            # pasada 1 — solo lectura
 *   node scripts/normalizar-zonas-bodegas.js --apply    # pasada 2 — escribe en BD
 */

const fs   = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Carga de entorno ──────────────────────────────────────────────────────────
function loadEnv () {
  const env = {}
  for (const f of ['.env.local', '.env.vercel']) {
    if (!fs.existsSync(f)) continue
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return { ...env, ...process.env }
}

// ── Supabase: fetch con paginación ────────────────────────────────────────────
async function fetchAll (sb, table, select, extra) {
  const all = []
  for (let o = 0; ; o += 1000) {
    let q = sb.from(table).select(select).range(o, o + 999)
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

// ── Normalización JS (equivalente a normalizar_texto() en BD) ─────────────────
function normJs (v) {
  if (!v) return ''
  return String(v)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Prefijos de denominación a eliminar DESPUÉS de normJs
// (ya están en minúsculas y sin puntuación)
const PREFIJOS_ZONA = [
  'd o ca ', 'd o c ', 'd o p ', 'd o ',  // más específico primero
  'do ca ', 'do c ', 'dop ', 'do ',
  'igp ', 'i g p ', 'igt ', 'i g t ',
  'vt ', 'v t ', 'lgp ', 'l g p ',
]

function stripZonaPrefijos (s) {
  let r = s.replace(/^\d+\s*[-]\s*/, '').trim() // "10 - FRIULI" → "friuli..."
  for (const p of PREFIJOS_ZONA) {
    if (r.startsWith(p)) { r = r.slice(p.length).trim(); break }
  }
  return r
}

// Palabras de ruido en bodegas (aplicadas sobre texto ya normalizado)
const RE_RUIDO_BOD = /\b(bodegas?|vinedos?|vinicola|cellers?|maisons?|domaines?|chateaux?|estate|winery|weingut|cantina|tenuta|azienda|agricola|viticultores|viticoltori)\b/g
const RE_RUIDO_LEG = /\b(s ?l|s ?a|s ?c|s ?r ?l|s ?coop)\b/g

function stripRuidoBodega (s) {
  return s.replace(RE_RUIDO_BOD, ' ').replace(RE_RUIDO_LEG, ' ')
    .replace(/\s+/g, ' ').trim()
}

// ── Similitud trigrama (aproxima pg_trgm con Jaccard sobre sets) ──────────────
function trigramas (s) {
  const set = new Set()
  const p = '  ' + s + '  '
  for (let i = 0; i <= p.length - 3; i++) set.add(p.slice(i, i + 3))
  return set
}

function trigSim (a, b) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const ta = trigramas(a)
  const tb = trigramas(b)
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

// ── Union-Find ────────────────────────────────────────────────────────────────
class UF {
  constructor (n) {
    this.p = Array.from({ length: n }, (_, i) => i)
    this.r = new Array(n).fill(0)
  }
  find (x) { return this.p[x] === x ? x : (this.p[x] = this.find(this.p[x])) }
  union (x, y) {
    const px = this.find(x), py = this.find(y)
    if (px === py) return
    if (this.r[px] < this.r[py]) this.p[px] = py
    else if (this.r[px] > this.r[py]) this.p[py] = px
    else { this.p[py] = px; this.r[px]++ }
  }
}

// ── CSV ───────────────────────────────────────────────────────────────────────
function csvEscape (v) {
  const s = v == null ? '' : String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s
}

function writeCsv (filepath, rows, cols) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true })
  const lines = [cols.join(','), ...rows.map(r => cols.map(c => csvEscape(r[c])).join(','))]
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8')
}

function readCsv (filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const headers = lines[0].split(',')
  return lines.slice(1).map(line => {
    const vals = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') inQ = false
        else cur += c
      } else if (c === '"') inQ = true
      else if (c === ',') { vals.push(cur); cur = '' }
      else cur += c
    }
    vals.push(cur)
    const row = {}
    headers.forEach((h, i) => { row[h] = vals[i] || '' })
    return row
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MAPA CANÓNICO DE ZONAS
// clave: normJs(valor) después de stripZonaPrefijos
// valor: { nombre, nivel, pais, padre? }
// ─────────────────────────────────────────────────────────────────────────────
const ZONA_CANON = {
  // Países
  'alemania':     { nombre: 'Alemania',  nivel: 'pais', pais: 'Alemania'       },
  'francia':      { nombre: 'Francia',   nivel: 'pais', pais: 'Francia'        },
  'espana':       { nombre: 'España',    nivel: 'pais', pais: 'España'         },
  'italia':       { nombre: 'Italia',    nivel: 'pais', pais: 'Italia'         },
  'argentina':    { nombre: 'Argentina', nivel: 'pais', pais: 'Argentina'      },
  'austria':      { nombre: 'Austria',   nivel: 'pais', pais: 'Austria'        },
  'portugal':     { nombre: 'Portugal',  nivel: 'pais', pais: 'Portugal'       },
  'chile':        { nombre: 'Chile',     nivel: 'pais', pais: 'Chile'          },
  'australia':    { nombre: 'Australia', nivel: 'pais', pais: 'Australia'      },
  'nueva zelanda':{ nombre: 'Nueva Zelanda', nivel: 'pais', pais: 'Nueva Zelanda' },
  'new zealand':  { nombre: 'Nueva Zelanda', nivel: 'pais', pais: 'Nueva Zelanda' },
  'sudafrica':    { nombre: 'Sudáfrica', nivel: 'pais', pais: 'Sudáfrica'      },
  'south africa': { nombre: 'Sudáfrica', nivel: 'pais', pais: 'Sudáfrica'      },
  'hungria':      { nombre: 'Hungría',   nivel: 'pais', pais: 'Hungría'        },
  'grecia':       { nombre: 'Grecia',    nivel: 'pais', pais: 'Grecia'         },
  'greece':       { nombre: 'Grecia',    nivel: 'pais', pais: 'Grecia'         },
  'rumania':      { nombre: 'Rumanía',   nivel: 'pais', pais: 'Rumanía'        },
  'georgia':      { nombre: 'Georgia',   nivel: 'pais', pais: 'Georgia'        },
  'japon':        { nombre: 'Japón',     nivel: 'pais', pais: 'Japón'          },
  'libano':       { nombre: 'Líbano',    nivel: 'pais', pais: 'Líbano'         },
  'estados unidos':{ nombre: 'Estados Unidos', nivel: 'pais', pais: 'Estados Unidos' },
  'usa':          { nombre: 'Estados Unidos', nivel: 'pais', pais: 'Estados Unidos' },
  // Francia — DOs / regiones
  'champagne':    { nombre: 'Champagne',        nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'bordeaux':     { nombre: 'Bordeaux',         nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'burdeos':      { nombre: 'Bordeaux',         nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'bourgogne':    { nombre: 'Borgoña',          nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'borgona':      { nombre: 'Borgoña',          nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'borgogna':     { nombre: 'Borgoña',          nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'rhone':        { nombre: 'Rhône',            nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'alsace':       { nombre: 'Alsacia',          nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'alsacia':      { nombre: 'Alsacia',          nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'beaujolais':   { nombre: 'Beaujolais',       nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'provence':     { nombre: 'Provenza',         nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'provenza':     { nombre: 'Provenza',         nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'languedoc':    { nombre: 'Languedoc',        nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'loire':        { nombre: 'Valle del Loira',  nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'jura':         { nombre: 'Jura',             nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'roussillon':   { nombre: 'Roussillon',       nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'savoie':       { nombre: 'Savoie',           nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'sud ouest':    { nombre: 'Suroeste de Francia', nivel: 'region', pais: 'Francia', padre: 'Francia' },
  'cognac':       { nombre: 'Cognac',           nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'armagnac':     { nombre: 'Armagnac',         nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  'calvados':     { nombre: 'Calvados',         nivel: 'do',     pais: 'Francia', padre: 'Francia'  },
  // España — DOs
  'rioja':                { nombre: 'Rioja',                    nivel: 'do', pais: 'España' },
  'la rioja':             { nombre: 'Rioja',                    nivel: 'do', pais: 'España' },
  'ribera del duero':     { nombre: 'Ribera del Duero',         nivel: 'do', pais: 'España', padre: 'Castilla y León' },
  'priorat':              { nombre: 'Priorat',                  nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'rias baixas':          { nombre: 'Rías Baixas',              nivel: 'do', pais: 'España', padre: 'Galicia' },
  'malaga':               { nombre: 'Málaga',                   nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'sierras de malaga':    { nombre: 'Sierras de Málaga',        nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'sierra de malaga':     { nombre: 'Sierras de Málaga',        nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'jerez xeres sherry':   { nombre: 'Jerez-Xérès-Sherry',      nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'jerez':                { nombre: 'Jerez-Xérès-Sherry',      nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'xerez':                { nombre: 'Jerez-Xérès-Sherry',      nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'sanlucar':             { nombre: 'Manzanilla-Sanlúcar',      nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'manzanilla sanlucar':  { nombre: 'Manzanilla-Sanlúcar',      nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'montsant':             { nombre: 'Montsant',                 nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'terra alta':           { nombre: 'Terra Alta',               nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'toro':                 { nombre: 'Toro',                     nivel: 'do', pais: 'España', padre: 'Castilla y León' },
  'bierzo':               { nombre: 'Bierzo',                   nivel: 'do', pais: 'España', padre: 'Castilla y León' },
  'rueda':                { nombre: 'Rueda',                    nivel: 'do', pais: 'España', padre: 'Castilla y León' },
  'penedes':              { nombre: 'Penedès',                  nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'cava':                 { nombre: 'Cava',                     nivel: 'do', pais: 'España' },
  'navarra':              { nombre: 'Navarra',                  nivel: 'do', pais: 'España' },
  'manchuela':            { nombre: 'Manchuela',                nivel: 'do', pais: 'España' },
  'la mancha':            { nombre: 'La Mancha',                nivel: 'do', pais: 'España' },
  'valencia':             { nombre: 'Valencia',                 nivel: 'do', pais: 'España' },
  'alicante':             { nombre: 'Alicante',                 nivel: 'do', pais: 'España' },
  'jumilla':              { nombre: 'Jumilla',                  nivel: 'do', pais: 'España' },
  'yecla':                { nombre: 'Yecla',                    nivel: 'do', pais: 'España' },
  'emporda':              { nombre: 'Empordà',                  nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'costers del segre':    { nombre: 'Costers del Segre',        nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'conca de barbera':     { nombre: 'Conca de Barberà',         nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'pla de bages':         { nombre: 'Pla de Bages',             nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'montilla moriles':     { nombre: 'Montilla-Moriles',         nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'condado de huelva':    { nombre: 'Condado de Huelva',        nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'ribeiro':              { nombre: 'Ribeiro',                  nivel: 'do', pais: 'España', padre: 'Galicia' },
  'valdeorras':           { nombre: 'Valdeorras',               nivel: 'do', pais: 'España', padre: 'Galicia' },
  'monterrei':            { nombre: 'Monterrei',                nivel: 'do', pais: 'España', padre: 'Galicia' },
  'ribeira sacra':        { nombre: 'Ribeira Sacra',            nivel: 'do', pais: 'España', padre: 'Galicia' },
  'getariako txakolina':  { nombre: 'Txakoli de Getaria',       nivel: 'do', pais: 'España', padre: 'País Vasco' },
  'txakoli':              { nombre: 'Txakoli de Getaria',       nivel: 'do', pais: 'España', padre: 'País Vasco' },
  'campo de borja':       { nombre: 'Campo de Borja',           nivel: 'do', pais: 'España', padre: 'Aragón' },
  'carinena':             { nombre: 'Cariñena',                 nivel: 'do', pais: 'España', padre: 'Aragón' },
  'somontano':            { nombre: 'Somontano',                nivel: 'do', pais: 'España', padre: 'Aragón' },
  'vinos de madrid':      { nombre: 'Vinos de Madrid',          nivel: 'do', pais: 'España' },
  'utiel requena':        { nombre: 'Utiel-Requena',            nivel: 'do', pais: 'España' },
  'binissalem':           { nombre: 'Binissalem',               nivel: 'do', pais: 'España' },
  'valdepenas':           { nombre: 'Valdepeñas',               nivel: 'do', pais: 'España' },
  'cigales':              { nombre: 'Cigales',                  nivel: 'do', pais: 'España', padre: 'Castilla y León' },
  'ribera del guadiana':  { nombre: 'Ribera del Guadiana',      nivel: 'do', pais: 'España' },
  'mentrida':             { nombre: 'Méntrida',                 nivel: 'do', pais: 'España' },
  'bullas':               { nombre: 'Bullas',                   nivel: 'do', pais: 'España' },
  'tierra de leon':       { nombre: 'Tierra de León',           nivel: 'do', pais: 'España', padre: 'Castilla y León' },
  // España — Regiones
  'cataluna':             { nombre: 'Cataluña',         nivel: 'region', pais: 'España'  },
  'galicia':              { nombre: 'Galicia',           nivel: 'region', pais: 'España'  },
  'castilla y leon':      { nombre: 'Castilla y León',   nivel: 'region', pais: 'España'  },
  'castilla leon':        { nombre: 'Castilla y León',   nivel: 'region', pais: 'España'  },
  'andalucia':            { nombre: 'Andalucía',         nivel: 'region', pais: 'España'  },
  'pais vasco':           { nombre: 'País Vasco',        nivel: 'region', pais: 'España'  },
  'aragon':               { nombre: 'Aragón',            nivel: 'region', pais: 'España'  },
  'extremadura':          { nombre: 'Extremadura',       nivel: 'region', pais: 'España'  },
  'canarias':             { nombre: 'Canarias',          nivel: 'region', pais: 'España'  },
  'islas canarias':       { nombre: 'Canarias',          nivel: 'region', pais: 'España'  },
  // Italia
  'toscana':              { nombre: 'Toscana',             nivel: 'region', pais: 'Italia' },
  'piemonte':             { nombre: 'Piemonte',            nivel: 'region', pais: 'Italia' },
  'sicilia':              { nombre: 'Sicilia',             nivel: 'region', pais: 'Italia' },
  'abruzzo':              { nombre: 'Abruzzo',             nivel: 'region', pais: 'Italia' },
  'veneto':               { nombre: 'Veneto',              nivel: 'region', pais: 'Italia' },
  'friuli venezia giulia':{ nombre: 'Friuli-Venezia Giulia', nivel: 'region', pais: 'Italia' },
  'friuli':               { nombre: 'Friuli-Venezia Giulia', nivel: 'region', pais: 'Italia' },
  'campania':             { nombre: 'Campania',            nivel: 'region', pais: 'Italia' },
  'puglia':               { nombre: 'Puglia',              nivel: 'region', pais: 'Italia' },
  'sardegna':             { nombre: 'Cerdeña',             nivel: 'region', pais: 'Italia' },
  'sardena':              { nombre: 'Cerdeña',             nivel: 'region', pais: 'Italia' },
  'lombardia':            { nombre: 'Lombardía',           nivel: 'region', pais: 'Italia' },
  'alto adige':           { nombre: 'Alto Adige',          nivel: 'do',     pais: 'Italia' },
  'trentino':             { nombre: 'Trentino',            nivel: 'region', pais: 'Italia' },
  'umbria':               { nombre: 'Umbría',              nivel: 'region', pais: 'Italia' },
  'lazio':                { nombre: 'Lacio',               nivel: 'region', pais: 'Italia' },
  'marche':               { nombre: 'Marcas',              nivel: 'region', pais: 'Italia' },
  'basilicata':           { nombre: 'Basilicata',          nivel: 'region', pais: 'Italia' },
  'calabria':             { nombre: 'Calabria',            nivel: 'region', pais: 'Italia' },
  'emilia romagna':       { nombre: 'Emilia-Romaña',       nivel: 'region', pais: 'Italia' },
  'molise':               { nombre: 'Molise',              nivel: 'region', pais: 'Italia' },
  'liguria':              { nombre: 'Liguria',             nivel: 'region', pais: 'Italia' },
  // Alemania
  'mosel':                { nombre: 'Mosel',               nivel: 'do', pais: 'Alemania' },
  'mosela':               { nombre: 'Mosel',               nivel: 'do', pais: 'Alemania' },
  'mosel saar ruwer':     { nombre: 'Mosel',               nivel: 'do', pais: 'Alemania' },
  'rheingau':             { nombre: 'Rheingau',            nivel: 'do', pais: 'Alemania' },
  'pfalz':                { nombre: 'Pfalz',               nivel: 'do', pais: 'Alemania' },
  'rheinhessen':          { nombre: 'Rheinhessen',         nivel: 'do', pais: 'Alemania' },
  'nahe':                 { nombre: 'Nahe',                nivel: 'do', pais: 'Alemania' },
  'saar':                 { nombre: 'Saar',                nivel: 'do', pais: 'Alemania' },
  'ahr':                  { nombre: 'Ahr',                 nivel: 'do', pais: 'Alemania' },
  'mittelrhein':          { nombre: 'Mittelrhein',         nivel: 'do', pais: 'Alemania' },
  'franken':              { nombre: 'Franken',             nivel: 'do', pais: 'Alemania' },
  'wurttemberg':          { nombre: 'Württemberg',         nivel: 'do', pais: 'Alemania' },
  'wurtemberg':           { nombre: 'Württemberg',         nivel: 'do', pais: 'Alemania' },
  'baden':                { nombre: 'Baden',               nivel: 'do', pais: 'Alemania' },
  'hessische bergstrasse':{ nombre: 'Hessische Bergstrasse', nivel: 'do', pais: 'Alemania' },
  'mittelmosel':          { nombre: 'Mosel',               nivel: 'do', pais: 'Alemania' },
  // Portugal
  'douro':                { nombre: 'Douro',               nivel: 'do', pais: 'Portugal' },
  'port':                 { nombre: 'Porto',               nivel: 'do', pais: 'Portugal' },
  'porto':                { nombre: 'Porto',               nivel: 'do', pais: 'Portugal' },
  'oporto':               { nombre: 'Porto',               nivel: 'do', pais: 'Portugal' },
  'vinho verde':          { nombre: 'Vinho Verde',         nivel: 'do', pais: 'Portugal' },
  'alentejo':             { nombre: 'Alentejo',            nivel: 'do', pais: 'Portugal' },
  'dao':                  { nombre: 'Dão',                 nivel: 'do', pais: 'Portugal' },
  'madeira':              { nombre: 'Madeira',             nivel: 'do', pais: 'Portugal' },
  'setubal':              { nombre: 'Setúbal',             nivel: 'region', pais: 'Portugal' },
  'peninsula de setubal': { nombre: 'Setúbal',             nivel: 'region', pais: 'Portugal' },
  'bairrada':             { nombre: 'Bairrada',            nivel: 'do', pais: 'Portugal' },
  'lisboa':               { nombre: 'Lisboa',              nivel: 'do', pais: 'Portugal' },
  'tejo':                 { nombre: 'Tejo',                nivel: 'do', pais: 'Portugal' },
  'algarve':              { nombre: 'Algarve',             nivel: 'do', pais: 'Portugal' },
  'tras os montes':       { nombre: 'Trás-os-Montes',      nivel: 'region', pais: 'Portugal' },
  // Argentina
  'mendoza':              { nombre: 'Mendoza',             nivel: 'region', pais: 'Argentina' },
  'salta':                { nombre: 'Salta',               nivel: 'region', pais: 'Argentina' },
  'patagonia':            { nombre: 'Patagonia',           nivel: 'region', pais: 'Argentina' },
  'san juan':             { nombre: 'San Juan',            nivel: 'region', pais: 'Argentina' },
  'neuquen':              { nombre: 'Neuquén',             nivel: 'region', pais: 'Argentina' },
  // Austria
  'wachau':               { nombre: 'Wachau',              nivel: 'do', pais: 'Austria' },
  'kamptal':              { nombre: 'Kamptal',             nivel: 'do', pais: 'Austria' },
  'kremstal':             { nombre: 'Kremstal',            nivel: 'do', pais: 'Austria' },
  'burgenland':           { nombre: 'Burgenland',          nivel: 'region', pais: 'Austria' },
  'steiermark':           { nombre: 'Estiria',             nivel: 'region', pais: 'Austria' },
  'niederosterreich':     { nombre: 'Baja Austria',        nivel: 'region', pais: 'Austria' },
  'traisental':           { nombre: 'Traisental',          nivel: 'do', pais: 'Austria' },
  'wagram':               { nombre: 'Wagram',              nivel: 'do', pais: 'Austria' },
  // Estados Unidos
  'california':           { nombre: 'California',          nivel: 'region', pais: 'Estados Unidos' },
  'napa valley':          { nombre: 'Napa Valley',         nivel: 'do', pais: 'Estados Unidos', padre: 'California' },
  'napa':                 { nombre: 'Napa Valley',         nivel: 'do', pais: 'Estados Unidos', padre: 'California' },
  'sonoma':               { nombre: 'Sonoma',              nivel: 'do', pais: 'Estados Unidos', padre: 'California' },
  'oregon':               { nombre: 'Oregón',              nivel: 'region', pais: 'Estados Unidos' },
  'washington':           { nombre: 'Washington',          nivel: 'region', pais: 'Estados Unidos' },
  // Resto del mundo
  'marlborough':          { nombre: 'Marlborough',         nivel: 'do', pais: 'Nueva Zelanda' },
  'central otago':        { nombre: 'Central Otago',       nivel: 'do', pais: 'Nueva Zelanda' },
  'stellenbosch':         { nombre: 'Stellenbosch',        nivel: 'do', pais: 'Sudáfrica'   },
  'barossa valley':       { nombre: 'Barossa Valley',      nivel: 'do', pais: 'Australia'   },
  'barossa':              { nombre: 'Barossa Valley',      nivel: 'do', pais: 'Australia'   },
  'mclaren vale':         { nombre: 'McLaren Vale',        nivel: 'do', pais: 'Australia'   },
  'eden valley':          { nombre: 'Eden Valley',         nivel: 'do', pais: 'Australia'   },
  'tokaj':                { nombre: 'Tokaj',               nivel: 'do', pais: 'Hungría'     },
  'tokaji':               { nombre: 'Tokaj',               nivel: 'do', pais: 'Hungría'     },
  'maipo':                { nombre: 'Valle del Maipo',     nivel: 'do', pais: 'Chile'       },
  'colchagua':            { nombre: 'Valle de Colchagua',  nivel: 'do', pais: 'Chile'       },
  'casablanca':           { nombre: 'Valle de Casablanca', nivel: 'do', pais: 'Chile'       },
  // Zonas adicionales (resuelven DUDOSOS del top 10)
  'loira':                { nombre: 'Valle del Loira',   nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'rodano':               { nombre: 'Rhône',             nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'chablis':              { nombre: 'Chablis',           nivel: 'do',     pais: 'Francia', padre: 'Borgoña'  },
  'cote de nuits':        { nombre: 'Côte de Nuits',    nivel: 'region', pais: 'Francia', padre: 'Borgoña'  },
  'cotes de provence':    { nombre: 'Côtes de Provence', nivel: 'do',    pais: 'Francia', padre: 'Provenza' },
  'cornas':               { nombre: 'Cornas',            nivel: 'do',     pais: 'Francia', padre: 'Rhône'    },
  'bandol':               { nombre: 'Bandol',            nivel: 'do',     pais: 'Francia', padre: 'Provenza' },
  'saint estephe':        { nombre: 'Saint-Estèphe',    nivel: 'do',     pais: 'Francia', padre: 'Bordeaux' },
  'saint emilion':        { nombre: 'Saint-Émilion',    nivel: 'do',     pais: 'Francia', padre: 'Bordeaux' },
  'fronsac':              { nombre: 'Fronsac',           nivel: 'do',     pais: 'Francia', padre: 'Bordeaux' },
  'pouilly fume':         { nombre: 'Pouilly-Fumé',     nivel: 'do',     pais: 'Francia', padre: 'Valle del Loira' },
  'sancerre':             { nombre: 'Sancerre',          nivel: 'do',     pais: 'Francia', padre: 'Valle del Loira' },
  'auvergne':             { nombre: 'Auvergne',         nivel: 'region', pais: 'Francia', padre: 'Francia'  },
  'languedoc rosellon':   { nombre: 'Languedoc-Roussillon', nivel: 'region', pais: 'Francia', padre: 'Francia' },
  'languedoc rosello':    { nombre: 'Languedoc-Roussillon', nivel: 'region', pais: 'Francia', padre: 'Francia' },
  // Italia adicionales
  'barbaresco':           { nombre: 'Barbaresco',        nivel: 'do',     pais: 'Italia', padre: 'Piemonte' },
  'barolo':               { nombre: 'Barolo',            nivel: 'do',     pais: 'Italia', padre: 'Piemonte' },
  'langhe':               { nombre: 'Langhe',            nivel: 'do',     pais: 'Italia', padre: 'Piemonte' },
  'brunelo di montalcino':{ nombre: 'Brunello di Montalcino', nivel: 'do', pais: 'Italia', padre: 'Toscana' },
  'brunello di montalcino':{ nombre: 'Brunello di Montalcino', nivel: 'do', pais: 'Italia', padre: 'Toscana' },
  'trentino alto adige':  { nombre: 'Trentino-Alto Adige', nivel: 'region', pais: 'Italia' },
  // España adicionales
  'alella':               { nombre: 'Alella',            nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'cebreros':             { nombre: 'Cebreros',          nivel: 'do', pais: 'España' },
  'ribera sacra':         { nombre: 'Ribeira Sacra',     nivel: 'do', pais: 'España', padre: 'Galicia'  },
  'corpinnat':            { nombre: 'Corpinnat',         nivel: 'do', pais: 'España', padre: 'Cataluña' },
  'murcia':               { nombre: 'Murcia',            nivel: 'region', pais: 'España' },
  'madrid':               { nombre: 'Vinos de Madrid',  nivel: 'do', pais: 'España' },
  'vinos de jerez':       { nombre: 'Jerez-Xérès-Sherry', nivel: 'do', pais: 'España', padre: 'Andalucía' },
  'valle de la orotava':  { nombre: 'Valle de la Orotava', nivel: 'do', pais: 'España', padre: 'Canarias' },
  // Uruguay
  'uruguay':              { nombre: 'Uruguay',           nivel: 'pais', pais: 'Uruguay' },
}

// Bodegas cuyos valores de campo `bodega` son etiquetas de sección, NO productores
const BODEGAS_PLACEHOLDER = new Set(['BORDEAUX SÉLECTION', 'BORDEAUX'])

// ─────────────────────────────────────────────────────────────────────────────
// PASADA 1 — análisis y generación de CSV
// ─────────────────────────────────────────────────────────────────────────────
async function pasada1 (sb) {
  console.log('Cargando catálogo…')
  const rows = await fetchAll(sb, 'proveedor_catalogo_vinos', 'zona,bodega,nombre,proveedor_id')
  console.log(`Total filas: ${rows.length}\n`)

  // ── Zonas ─────────────────────────────────────────────────────────────────
  const zonaCount = new Map()
  for (const r of rows) { const z = r.zona || '(null)'; zonaCount.set(z, (zonaCount.get(z) || 0) + 1) }

  const zonaRows = []
  for (const [orig, n] of [...zonaCount.entries()].sort((a, b) => b[1] - a[1])) {
    const normed    = normJs(orig)
    const stripped  = stripZonaPrefijos(normed)
    const canon     = ZONA_CANON[stripped] || ZONA_CANON[normed]
    const dudoso    = !canon || orig === '(null)'
    zonaRows.push({
      valor_original:    orig,
      apariciones:       n,
      propuesta_canonica: canon ? canon.nombre : '',
      nivel:             canon ? canon.nivel  : '',
      padre:             canon ? (canon.padre || '') : '',
      confianza:         canon ? (n >= 50 ? 'ALTA' : n >= 10 ? 'MEDIA' : 'BAJA') : '',
      DUDOSO:            dudoso ? 'TRUE' : '',
    })
  }

  writeCsv('data/mapeo-zonas.csv', zonaRows,
    ['valor_original', 'apariciones', 'propuesta_canonica', 'nivel', 'padre', 'confianza', 'DUDOSO'])

  // Resumen zonas
  const zonasMapeadas  = zonaRows.filter(r => !r.DUDOSO)
  const zonasDudosas   = zonaRows.filter(r => r.DUDOSO)
  const filasZonasMapeadas = zonasMapeadas.reduce((s, r) => s + Number(r.apariciones), 0)
  const canonicasDistintas = new Set(zonasMapeadas.map(r => r.propuesta_canonica)).size

  console.log('══ ZONAS ══════════════════════════════════════════════════════')
  console.log(`  Valores distintos en BD:      ${zonaRows.length}`)
  console.log(`  Mapeados a canónica:          ${zonasMapeadas.length} (→ ${canonicasDistintas} zonas canónicas)`)
  console.log(`  Filas que recibirán zona_id:  ${filasZonasMapeadas}`)
  console.log(`  DUDOSOS (sin mapear):         ${zonasDudosas.length}`)
  if (zonasDudosas.length) {
    console.log('  Lista de DUDOSOS:')
    zonasDudosas.forEach(r => console.log(`    ${String(r.apariciones).padStart(5)}  ${r.valor_original}`))
  }
  console.log(`  CSV: data/mapeo-zonas.csv\n`)

  // ── Bodegas ───────────────────────────────────────────────────────────────
  const bodegaCount = new Map()
  for (const r of rows) {
    const b = r.bodega || '(null)'
    if (BODEGAS_PLACEHOLDER.has(b)) continue  // excluidas del flujo normal
    bodegaCount.set(b, (bodegaCount.get(b) || 0) + 1)
  }

  const bodegaList = [...bodegaCount.entries()].sort((a, b) => b[1] - a[1])
  const n = bodegaList.length

  // Precompute normalized + stripped forms for similarity
  const normsStripped = bodegaList.map(([bod]) => stripRuidoBodega(normJs(bod)))

  // Union-Find para agrupar por similitud >= 0.85
  const uf = new UF(n)
  for (let i = 0; i < n; i++) {
    if (!normsStripped[i] || normsStripped[i].length < 3) continue
    for (let j = i + 1; j < n; j++) {
      if (!normsStripped[j] || normsStripped[j].length < 3) continue
      if (trigSim(normsStripped[i], normsStripped[j]) >= 0.85) uf.union(i, j)
    }
  }

  // Construir grupos
  const grupos = new Map() // root → [idx]
  for (let i = 0; i < n; i++) {
    const root = uf.find(i)
    if (!grupos.has(root)) grupos.set(root, [])
    grupos.get(root).push(i)
  }

  // Para cada grupo, canónica = el valor con más apariciones
  const bodegaRows = []
  let grupoId = 0
  for (const [, idxs] of [...grupos.entries()].sort((a, b) =>
    b[1].reduce((s, i) => s + bodegaList[i][1], 0) - a[1].reduce((s, i) => s + bodegaList[i][1], 0)
  )) {
    grupoId++
    const byCount = idxs.slice().sort((a, b) => bodegaList[b][1] - bodegaList[a][1])
    const canonOrig = bodegaList[byCount[0]][0]
    const totalApariciones = idxs.reduce((s, i) => s + bodegaList[i][1], 0)

    // Heurística DUDOSO:
    // - nombre normalizado muy corto (< 3 chars tras strip ruido)
    // - singleton con nombre todo en mayúsculas y > 50 filas (probable sección)
    //   EXCEPCIÓN: si pasa el "test de productor real" — aquí no tenemos fuente externa,
    //   así que lo marcamos MEDIA y el usuario decide
    const normCanon = normsStripped[byCount[0]]
    const esSingleton = idxs.length === 1
    const dudoso = normCanon.length < 3
    const confianza = idxs.length > 1 ? 'ALTA' : (totalApariciones >= 10 ? 'MEDIA' : 'BAJA')

    for (const idx of idxs) {
      bodegaRows.push({
        valor_original:    bodegaList[idx][0],
        propuesta_canonica: canonOrig,
        grupo_id:          grupoId,
        apariciones:       bodegaList[idx][1],
        confianza,
        DUDOSO:            dudoso ? 'TRUE' : '',
      })
    }
  }

  writeCsv('data/mapeo-bodegas.csv', bodegaRows,
    ['valor_original', 'propuesta_canonica', 'grupo_id', 'apariciones', 'confianza', 'DUDOSO'])

  // Resumen bodegas
  const gruposMulti   = [...grupos.values()].filter(g => g.length > 1)
  const bodegasDudosas = bodegaRows.filter(r => r.DUDOSO && r.valor_original === r.propuesta_canonica)
  const canonicasBod  = new Set(bodegaRows.map(r => r.propuesta_canonica)).size

  console.log('══ BODEGAS ════════════════════════════════════════════════════')
  console.log(`  Valores distintos (excl. placeholders): ${n}`)
  console.log(`  Grupos de similitud >= 0.85:            ${grupos.size}`)
  console.log(`  Grupos con >1 valor (fusiones):         ${gruposMulti.length}`)
  console.log(`  Canónicas distintas propuestas:         ${canonicasBod}`)
  console.log(`  DUDOSOS:                                ${bodegasDudosas.length}`)
  console.log(`  CSV: data/mapeo-bodegas.csv\n`)

  // ── Fusiones destacadas ───────────────────────────────────────────────────
  console.log('── Ejemplos de fusiones propuestas (grupos con >1 valor) ───────')
  let shown = 0
  for (const [, idxs] of grupos) {
    if (idxs.length < 2) continue
    const byCount = idxs.slice().sort((a, b) => bodegaList[b][1] - bodegaList[a][1])
    const canon = bodegaList[byCount[0]][0]
    const miembros = idxs.map(i => `${bodegaList[i][0]} (${bodegaList[i][1]})`).join(' | ')
    console.log(`  → ${canon}`)
    console.log(`    ${miembros}`)
    if (++shown >= 20) { console.log('    … (ver data/mapeo-bodegas.csv para el resto)'); break }
  }
  console.log()

  // ── Bodegas placeholder — bodegas-pendientes.md ───────────────────────────
  const placeholderRows = rows.filter(r => BODEGAS_PLACEHOLDER.has(r.bodega))
  const nombreCount = new Map()
  for (const r of placeholderRows) {
    const k = `${r.nombre}||${r.bodega}`
    nombreCount.set(k, (nombreCount.get(k) || 0) + 1)
  }
  const pendientesSorted = [...nombreCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => {
      const [nombre, bodega] = k.split('||')
      return { nombre, bodega_seccion: bodega, apariciones: n, bodega_real: '' }
    })

  const totalPend = placeholderRows.length
  const nomUnicos = pendientesSorted.length

  let md = `# Bodegas pendientes de identificar\n\n`
  md += `> Generado: 2026-09-12. Bloque 4.\n`
  md += `> Estas ${totalPend} filas tienen \`bodega_id = NULL\` y \`bodega_pendiente = true\`\n`
  md += `> porque el campo \`bodega\` contiene un encabezado de sección del PDF de Exclusivas Soto\n`
  md += `> ("BORDEAUX SÉLECTION" o "BORDEAUX"), no el nombre real del productor.\n`
  md += `> El nombre del châteu está en el campo \`nombre\`.\n>\n`
  md += `> Rellena la columna \`bodega_real\` poco a poco. Cuando una fila esté rellena,\n`
  md += `> el importador podrá crear o enlazar el registro de bodega correspondiente.\n\n`
  md += `**Filas afectadas:** ${totalPend} · **Nombres únicos:** ${nomUnicos}\n\n`
  md += `| nombre | bodega_sección | apariciones | bodega_real |\n`
  md += `|--------|---------------|-------------|-------------|\n`
  for (const r of pendientesSorted) {
    md += `| ${r.nombre} | ${r.bodega_seccion} | ${r.apariciones} | ${r.bodega_real} |\n`
  }
  fs.mkdirSync('docs', { recursive: true })
  fs.writeFileSync('docs/bodegas-pendientes.md', md, 'utf8')

  console.log('══ BORDEAUX / BORDEAUX SÉLECTION ══════════════════════════════')
  console.log(`  Filas afectadas (bodega_pendiente = true): ${totalPend}`)
  console.log(`  Nombres únicos en esas filas:             ${nomUnicos}`)
  console.log(`  bodega_id quedará NULL para todas ellas.`)
  console.log(`  Doc: docs/bodegas-pendientes.md\n`)

  console.log('Pasada 1 completada. Revisa y ajusta los CSV antes de --apply.')
}

// ─────────────────────────────────────────────────────────────────────────────
// PASADA 2 — backfill (--apply)
// ─────────────────────────────────────────────────────────────────────────────
async function pasada2 (sb) {
  if (!fs.existsSync('data/mapeo-zonas.csv') || !fs.existsSync('data/mapeo-bodegas.csv')) {
    throw new Error('Ejecuta primero sin --apply para generar los CSV de propuestas.')
  }

  const zonasCsv   = readCsv('data/mapeo-zonas.csv').filter(r => !r.DUDOSO && r.propuesta_canonica)
  const bodegasCsv = readCsv('data/mapeo-bodegas.csv').filter(r => !r.DUDOSO && r.propuesta_canonica)

  // ── Backfill zonas ────────────────────────────────────────────────────────
  console.log(`Procesando ${zonasCsv.length} filas de zona (no DUDOSO)…`)

  // Agrupar originales por canónica
  const byCanonZona = new Map()
  for (const r of zonasCsv) {
    if (!byCanonZona.has(r.propuesta_canonica)) {
      byCanonZona.set(r.propuesta_canonica, { nivel: r.nivel, pais: '', padre: r.padre, origValues: [] })
    }
    byCanonZona.get(r.propuesta_canonica).origValues.push(r.valor_original)
  }

  // Cargar zonas existentes
  const { data: zonaExistentes } = await sb.from('zona').select('id,nombre')
  const zonaIdMap = new Map((zonaExistentes || []).map(z => [z.nombre, z.id]))

  // Insertar canónicas que no existen (sin padre por ahora — FK circular)
  for (const [nombre, info] of byCanonZona) {
    if (zonaIdMap.has(nombre)) continue
    const { data, error } = await sb.from('zona').insert({ nombre, nivel: info.nivel || 'otro' }).select('id').single()
    if (error) { console.error(`  ERROR insertando zona "${nombre}": ${error.message}`); continue }
    zonaIdMap.set(nombre, data.id)
    console.log(`  + zona: ${nombre}`)
  }

  // Actualizar aliases
  for (const [nombre, info] of byCanonZona) {
    const id = zonaIdMap.get(nombre)
    if (!id) continue
    const aliasesNuevos = info.origValues.filter(v => v !== nombre && v !== '(null)')
    if (!aliasesNuevos.length) continue
    const { data: cur } = await sb.from('zona').select('aliases').eq('id', id).single()
    const existentes = cur?.aliases || []
    const merged = [...new Set([...existentes, ...aliasesNuevos])]
    await sb.from('zona').update({ aliases: merged }).eq('id', id)
  }

  // Backfill zona_id en proveedor_catalogo_vinos
  let filasZona = 0
  for (const [nombre, info] of byCanonZona) {
    const id = zonaIdMap.get(nombre)
    if (!id) continue
    const { error, count } = await sb.from('proveedor_catalogo_vinos')
      .update({ zona_id: id })
      .in('zona', info.origValues)
      .select('id', { count: 'exact', head: true })
    if (error) console.error(`  ERROR backfill zona "${nombre}": ${error.message}`)
    else filasZona += count || 0
  }
  console.log(`  Filas actualizadas con zona_id: ${filasZona}\n`)

  // ── Backfill bodegas ──────────────────────────────────────────────────────
  console.log(`Procesando ${bodegasCsv.length} filas de bodega (no DUDOSO)…`)

  const byCanonBod = new Map()
  for (const r of bodegasCsv) {
    if (!byCanonBod.has(r.propuesta_canonica)) byCanonBod.set(r.propuesta_canonica, [])
    byCanonBod.get(r.propuesta_canonica).push(r.valor_original)
  }

  const { data: bodegaExistentes } = await sb.from('bodega').select('id,nombre')
  const bodegaIdMap = new Map((bodegaExistentes || []).map(b => [b.nombre, b.id]))

  for (const [nombre] of byCanonBod) {
    if (bodegaIdMap.has(nombre)) continue
    const { data, error } = await sb.from('bodega').insert({ nombre }).select('id').single()
    if (error) { console.error(`  ERROR insertando bodega "${nombre}": ${error.message}`); continue }
    bodegaIdMap.set(nombre, data.id)
  }

  for (const [nombre, origValues] of byCanonBod) {
    const id = bodegaIdMap.get(nombre)
    if (!id) continue
    const aliasesNuevos = origValues.filter(v => v !== nombre && v !== '(null)')
    if (aliasesNuevos.length) {
      const { data: cur } = await sb.from('bodega').select('aliases').eq('id', id).single()
      const merged = [...new Set([...(cur?.aliases || []), ...aliasesNuevos])]
      await sb.from('bodega').update({ aliases: merged }).eq('id', id)
    }
  }

  let filasBodyega = 0
  for (const [nombre, origValues] of byCanonBod) {
    const id = bodegaIdMap.get(nombre)
    if (!id) continue
    const { error, count } = await sb.from('proveedor_catalogo_vinos')
      .update({ bodega_id: id })
      .in('bodega', origValues)
      .select('id', { count: 'exact', head: true })
    if (error) console.error(`  ERROR backfill bodega "${nombre}": ${error.message}`)
    else filasBodyega += count || 0
  }
  console.log(`  Filas actualizadas con bodega_id: ${filasBodyega}`)

  // ── Marcar bodega_pendiente para BORDEAUX / BORDEAUX SÉLECTION ────────────
  const { error: errPend, count: cPend } = await sb.from('proveedor_catalogo_vinos')
    .update({ bodega_pendiente: true })
    .in('bodega', [...BODEGAS_PLACEHOLDER])
    .select('id', { count: 'exact', head: true })
  if (errPend) console.error(`  ERROR marcando bodega_pendiente: ${errPend.message}`)
  else console.log(`  Filas con bodega_pendiente = true: ${cPend}`)

  console.log('\nPasada 2 completada.')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main () {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  const sb  = createClient(url, key)
  const args = process.argv.slice(2)
  if (args.includes('--apply')) await pasada2(sb)
  else await pasada1(sb)
}

main().catch(e => { console.error(e.message); process.exit(1) })
