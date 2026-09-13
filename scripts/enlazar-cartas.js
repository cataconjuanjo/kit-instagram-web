'use strict'
/**
 * enlazar-cartas.js
 * Enlaza cada línea de carta (tabla vinos) al catálogo canónico (vino_anada + oferta).
 *
 * Uso:
 *   node scripts/enlazar-cartas.js [--restaurante <uuid>] [--apply]
 *
 * Por defecto opera en dry-run: calcula el enlace e imprime el informe sin escribir.
 * Con --apply: escribe vino_anada_id, oferta_id y coste_compra (si estaba a 0).
 *
 * Restaurante por defecto: Lo de Carmen (db3af496-00f1-4295-82b6-35427b9b6286).
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')

try { process.loadEnvFile(path.join(__dirname, '..', '.env.local')) } catch {}

const RESTAURANTE_CARMEN = 'db3af496-00f1-4295-82b6-35427b9b6286'
const UMBRAL_BLANDA      = 0.45  // Jaccard mínimo para sugerir clave blanda (no auto-enlaza)

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizar(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

function simJaccard(a, b) {
  const wa = new Set(normalizar(a).split(' ').filter(w => w.length > 2))
  const wb = new Set(normalizar(b).split(' ').filter(w => w.length > 2))
  if (!wa.size || !wb.size) return 0
  let inter = 0
  for (const w of wa) if (wb.has(w)) inter++
  return inter / (wa.size + wb.size - inter)
}

function formatoAMl(str) {
  if (!str) return 750  // ausente → botella estándar
  const s = String(str).toLowerCase().replace(/\s/g, '').replace(',', '.')
  const named = {
    botella: 750, normal: 750, estandar: 750, standard: 750,
    media: 375, mediabotella: 375, halfbottle: 375,
    magnum: 1500, '2botella': 1500,
    jeroboam: 3000, doblemagnum: 3000,
    rehoboam: 4500,
    imperial: 6000, mathusalem: 6000, methuselah: 6000,
  }
  const norm = normalizar(str).replace(/ /g, '')
  if (named[norm] !== undefined) return named[norm]
  const mMatch = s.match(/^(\d+(?:\.\d+)?)ml$/)
  if (mMatch) return Math.round(parseFloat(mMatch[1]))
  const clMatch = s.match(/^(\d+(?:\.\d+)?)cl$/)
  if (clMatch) return Math.round(parseFloat(clMatch[1]) * 10)
  const lMatch  = s.match(/^(\d+(?:\.\d+)?)l$/)
  if (lMatch)  return Math.round(parseFloat(lMatch[1]) * 1000)
  return null  // no parseable
}

function parsearAnada(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s || ['s/a', 'n/a', 'nv', 's.a.', '-', 'sin añada', 'sin anada'].includes(s.toLowerCase())) return null
  const n = parseInt(s, 10)
  if (isNaN(n) || n < 1900 || n > 2099) return null
  return n
}

function eur(n) {
  if (n == null) return '—'
  return `${parseFloat(n).toFixed(2)} €`
}

function sep(c = '─') { return c.repeat(80) }

// ── Informe ──────────────────────────────────────────────────────────────────

function imprimirInforme({ restauranteId, modo, enlazadas, blandas, sinMatch, pvpAlerta }) {
  const LINE = sep('═')
  console.log(`\n${LINE}`)
  console.log(`ENLACE DE CARTAS — ${modo}`)
  console.log(`Restaurante: ${restauranteId}`)
  console.log(LINE)

  // ENLAZADAS (clave dura)
  const conOferta   = enlazadas.filter(e => e.ofertaId)
  const sinOferta   = enlazadas.filter(e => !e.ofertaId)
  console.log(`\nENLAZADAS POR CLAVE DURA — ${enlazadas.length} (${conOferta.length} con oferta · ${sinOferta.length} sin proveedor activo)`)
  console.log(sep())
  if (enlazadas.length === 0) {
    console.log('  (ninguna)')
  } else {
    for (const e of enlazadas) {
      const costeStr = e.coste ? `  coste ${eur(e.coste)}` : '  sin oferta'
      const pvpStr   = e.pvpActual ? `  PVP actual ${eur(e.pvpActual)}` : ''
      console.log(`  ✓ ${e.linea.nombre} (${e.linea.bodega || '?'} ${e.linea.anada || 'S/A'})${costeStr}${pvpStr}`)
    }
  }

  // PVP POR DEBAJO DEL SUELO
  if (pvpAlerta.length) {
    console.log(`\nPVP BAJO SUELO DE POLÍTICA — ${pvpAlerta.length} líneas`)
    console.log(sep())
    for (const a of pvpAlerta) {
      console.log(`  ⚠  ${a.nombre} (${a.bodega || '?'}) — PVP actual ${eur(a.pvpActual)} · suelo calculado ${eur(a.pvpSuelo)} (coste ${eur(a.coste)})`)
    }
  }

  // CLAVE BLANDA (sugerencias, no se enlazan)
  console.log(`\nSUGERENCIAS CLAVE BLANDA — ${blandas.length} (revisión manual)`)
  console.log(sep())
  if (blandas.length === 0) {
    console.log('  (ninguna)')
  } else {
    for (const b of blandas) {
      console.log(`  ? ${b.linea.nombre} (${b.linea.bodega || '?'}) →`)
      for (const c of b.candidatos) {
        console.log(`      sim ${c.sim.toFixed(2)}  ${c.nombre} añada ${c.anada ?? 'S/A'} ${c.ml}ml`)
      }
    }
  }

  // SIN MATCH — por motivo
  const sm = sinMatch
  const totalSinMatch = sm.bodega_desconocida.length + sm.formato_no_parseable.length +
                        sm.sin_proveedor.length + sm.sin_match.length
  console.log(`\nSIN ENLACE — ${totalSinMatch} líneas`)
  console.log(sep())

  if (sm.bodega_desconocida.length) {
    console.log(`  [Bodega desconocida — ${sm.bodega_desconocida.length}]`)
    for (const v of sm.bodega_desconocida) console.log(`    • ${v.nombre} (bodega "${v.bodega}"`)
  }
  if (sm.formato_no_parseable.length) {
    console.log(`  [Formato no parseable — ${sm.formato_no_parseable.length}]`)
    for (const v of sm.formato_no_parseable) console.log(`    • ${v.nombre}  formato "${v.formato_compra}"`)
  }
  if (sm.sin_proveedor.length) {
    console.log(`  [Vino que ningún proveedor trae — ${sm.sin_proveedor.length}]`)
    for (const v of sm.sin_proveedor) console.log(`    • ${v.linea.nombre} (${v.linea.bodega || '?'}) añada ${v.linea.anada || 'S/A'}`)
  }
  if (sm.sin_match.length) {
    console.log(`  [Sin coincidencia en catálogo — ${sm.sin_match.length}]`)
    for (const v of sm.sin_match) console.log(`    • ${v.nombre} (${v.bodega || '?'}) añada ${v.anada || 'S/A'}`)
  }
  if (totalSinMatch === 0) console.log('  (ninguna)')

  // RESUMEN
  console.log(`\n${LINE}`)
  console.log(`RESUMEN: ${enlazadas.length} enlazadas · ${blandas.length} sugerencias blanda · ${totalSinMatch} sin enlace · ${pvpAlerta.length} PVP bajo suelo`)
  console.log(`${LINE}\n`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args          = process.argv.slice(2)
  const apply         = args.includes('--apply')
  const restIdx       = args.indexOf('--restaurante')
  const restauranteId = restIdx !== -1 ? args[restIdx + 1] : RESTAURANTE_CARMEN
  const modo          = apply ? 'PUBLICAR' : 'DRY-RUN'

  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svcKey) throw new Error('Faltan credenciales')

  const supabase = createClient(url, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // 1. Líneas de carta del restaurante
  const { data: cartaLineas, error: cartaErr } = await supabase
    .from('vinos')
    .select('id, nombre, bodega, tipo, anada, formato_compra, precio_botella, precio_copa, coste_compra, activo')
    .eq('restaurante_id', restauranteId)
  if (cartaErr) throw cartaErr
  console.log(`\n${cartaLineas.length} líneas de carta`)

  // 2. Maestro canónico en memoria
  const { data: bodegas, error: bodErr } = await supabase.from('bodega').select('id, nombre')
  if (bodErr) throw bodErr
  const bodegaMapNorm = Object.fromEntries((bodegas || []).map(b => [normalizar(b.nombre), b.id]))

  const { data: canonico, error: canErr } = await supabase
    .from('vino_anada')
    .select('id, anada, formato_ml, vino:vino_id(id, nombre, nombre_norm, bodega_id)')
  if (canErr) throw canErr
  console.log(`${(canonico || []).length} registros vino_anada en catálogo canónico`)

  // Índice clave dura: "bodega_id|nombre_norm|anada|ml" → vino_anada_id
  const claveDuraMap = new Map()
  for (const va of canonico || []) {
    if (!va.vino?.bodega_id) continue
    const key = `${va.vino.bodega_id}|${va.vino.nombre_norm}|${va.anada ?? -1}|${va.formato_ml}`
    if (!claveDuraMap.has(key)) claveDuraMap.set(key, va.id)
  }

  // Índice por bodega_id para clave blanda
  const vaPorBodega = {}
  for (const va of canonico || []) {
    const bid = va.vino?.bodega_id
    if (!bid) continue
    if (!vaPorBodega[bid]) vaPorBodega[bid] = []
    vaPorBodega[bid].push(va)
  }

  // 3. Mejor oferta por vino_anada_id (menor coste, no descatalogado)
  const { data: todasOfertas } = await supabase
    .from('oferta')
    .select('id, vino_anada_id, coste, disponibilidad')
    .neq('disponibilidad', 'descatalogado')
    .not('coste', 'is', null)
  const mejorOfertaMap = {}
  for (const o of todasOfertas || []) {
    const coste = parseFloat(o.coste)
    const exist = mejorOfertaMap[o.vino_anada_id]
    if (!exist || coste < parseFloat(exist.coste)) mejorOfertaMap[o.vino_anada_id] = o
  }

  // 4. Política de precio (restaurante tiene precedencia sobre global)
  const { data: politicas } = await supabase
    .from('politica_precio')
    .select('ambito, margen_objetivo, redondeo_botella')
    .or(`restaurante_id.eq.${restauranteId},ambito.eq.global`)
    .order('ambito')  // 'global' < 'restaurante' → restaurante override
  const pol = (politicas || []).at(-1) || { margen_objetivo: 65, redondeo_botella: 1.00 }

  function pvpSuelo(coste) {
    const raw = parseFloat(coste) / (1 - pol.margen_objetivo / 100)
    return Math.ceil(raw / pol.redondeo_botella) * pol.redondeo_botella
  }

  // 5. Matching
  const enlazadas = []
  const blandas   = []
  const sinMatch  = { bodega_desconocida: [], formato_no_parseable: [], sin_proveedor: [], sin_match: [] }
  const pvpAlerta = []

  for (const v of cartaLineas) {
    const nombreNorm = normalizar(v.nombre)
    const bodegaNorm = normalizar(v.bodega || '')
    const bodegaId   = bodegaNorm ? bodegaMapNorm[bodegaNorm] : null
    const ml         = formatoAMl(v.formato_compra)
    const anada      = parsearAnada(v.anada)

    // Formato no parseable: campo existe pero no se puede convertir
    if (v.formato_compra && ml === null) {
      sinMatch.formato_no_parseable.push(v)
      continue
    }

    // Bodega desconocida
    if (bodegaNorm && !bodegaId) {
      sinMatch.bodega_desconocida.push(v)
      continue
    }

    // Clave dura: nombre_norm + bodega_id + anada + ml
    const mlEfectivo = ml ?? 750
    const keyDura = bodegaId ? `${bodegaId}|${nombreNorm}|${anada ?? -1}|${mlEfectivo}` : null
    const vaId    = keyDura && claveDuraMap.has(keyDura) ? claveDuraMap.get(keyDura) : null

    if (vaId) {
      const oferta   = mejorOfertaMap[vaId] || null
      const coste    = oferta ? parseFloat(oferta.coste) : null
      const pvpActual = v.precio_botella ? parseFloat(v.precio_botella) : null
      const suelo    = coste ? pvpSuelo(coste) : null

      enlazadas.push({
        linea: v, vaId, ofertaId: oferta?.id || null, coste, pvpActual, pvpSuelo: suelo,
        sinOferta: !oferta,
      })

      // Alerta PVP
      if (pvpActual && pvpActual > 0 && suelo && pvpActual < suelo) {
        pvpAlerta.push({ nombre: v.nombre, bodega: v.bodega, coste, pvpActual, pvpSuelo: suelo })
      }

      // Si vino matchó pero sin oferta → también a sin_proveedor
      if (!oferta) sinMatch.sin_proveedor.push({ linea: v })
      continue
    }

    // Clave blanda: Jaccard dentro de la misma bodega
    if (bodegaId && vaPorBodega[bodegaId]?.length) {
      const similares = (vaPorBodega[bodegaId] || [])
        .map(va => ({ va, sim: simJaccard(va.vino?.nombre || '', v.nombre) }))
        .filter(x => x.sim >= UMBRAL_BLANDA)
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 3)

      if (similares.length) {
        blandas.push({
          linea: v,
          candidatos: similares.map(x => ({
            vaId: x.va.id, sim: x.sim,
            nombre: x.va.vino?.nombre || '?', anada: x.va.anada, ml: x.va.formato_ml,
          }))
        })
        continue
      }
    }

    sinMatch.sin_match.push(v)
  }

  // 6. Imprimir informe
  imprimirInforme({ restauranteId, modo, enlazadas, blandas, sinMatch, pvpAlerta })

  if (!apply) {
    console.log('→ Dry-run. Ejecuta con --apply para escribir en DB.\n')
    return
  }

  // 7. Aplicar: escribir vino_anada_id, oferta_id y coste_compra (si estaba a 0)
  let escritas = 0
  let errores  = 0
  for (const e of enlazadas) {
    if (e.sinOferta) continue  // sin oferta: no tenemos coste, solo linkamos vino_anada_id
    const update = { vino_anada_id: e.vaId }
    if (e.ofertaId)  update.oferta_id = e.ofertaId
    if (e.coste && !(parseFloat(e.linea.coste_compra) > 0)) {
      update.coste_compra = e.coste  // solo rellena si estaba a 0 o null
    }
    const { error } = await supabase.from('vinos').update(update).eq('id', e.linea.id)
    if (error) { console.error(`  ✗ ${e.linea.nombre}: ${error.message}`); errores++ }
    else escritas++
  }
  // Líneas enlazadas sin oferta: solo escribir vino_anada_id
  for (const e of enlazadas.filter(x => x.sinOferta)) {
    const { error } = await supabase.from('vinos').update({ vino_anada_id: e.vaId }).eq('id', e.linea.id)
    if (error) { console.error(`  ✗ ${e.linea.nombre}: ${error.message}`); errores++ }
    else escritas++
  }

  console.log(`✓  ${escritas} líneas actualizadas en DB${errores ? ` · ${errores} errores` : ''}`)
}

main().catch(err => { console.error(`\nError: ${err.message}`); process.exit(1) })
