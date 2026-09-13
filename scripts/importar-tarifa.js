/**
 * importar-tarifa.js
 * Ingesta de tarifas versionada con diff previo a publicar.
 *
 * Uso:
 *   node scripts/importar-tarifa.js --proveedor <uuid> --fichero <ruta.json> [--periodo YYYY-MM-DD] [--apply]
 *
 * Por defecto opera en --dry-run: calcula el diff e imprime el informe sin escribir nada.
 * Con --apply: crea la tarifa en DB, inserta linea_cruda, crea ofertas nuevas y archiva la anterior.
 */

'use strict'

const { createClient } = require('@supabase/supabase-js')
const fs   = require('fs')
const path = require('path')

try { process.loadEnvFile(path.join(__dirname, '..', '.env.local')) } catch {}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizar(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

function formatoAMl(str) {
  if (!str) return null
  const s = String(str).toLowerCase().replace(/\s/g, '').replace(',', '.')
  const named = {
    'media': 375, 'mediabotella': 375, 'halfbottle': 375,
    'botella': 750, 'normal': 750, 'estandar': 750, 'standard': 750,
    'magnum': 1500, '2botella': 1500,
    'jeroboam': 3000, 'doblmagnum': 3000, 'doblemagnum': 3000,
    'rehoboam': 4500,
    'imperial': 6000, 'mathusalem': 6000, 'methuselah': 6000,
    'salmanazar': 9000, 'balthazar': 12000, 'nebuchadnezzar': 15000,
  }
  const norm = normalizar(str).replace(/ /g, '')
  if (named[norm]) return named[norm]

  let m
  if ((m = s.match(/^(\d+(?:\.\d+)?)ml$/)))    return Math.round(parseFloat(m[1]))
  if ((m = s.match(/^(\d+(?:\.\d+)?)cl$/)))    return Math.round(parseFloat(m[1]) * 10)
  if ((m = s.match(/^(\d+(?:\.\d+)?)l$/)))     return Math.round(parseFloat(m[1]) * 1000)
  if ((m = s.match(/^(\d+(?:\.\d+)?)litros?$/))) return Math.round(parseFloat(m[1]) * 1000)
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) {
    const n = parseFloat(m[1])
    if (n <= 0) return null
    if (n < 10) return Math.round(n * 1000)     // asumir litros
    if (n < 200) return Math.round(n * 10)      // asumir cl
    return Math.round(n)                         // asumir ml
  }
  return null
}

function validarAnada(raw) {
  if (raw === null || raw === undefined || raw === '' || raw === 'S/A' || raw === 'SV') {
    return { ok: true, valor: null }
  }
  const s = String(raw).trim()
  if (/^\d{4}$/.test(s)) {
    const y = parseInt(s, 10)
    if (y >= 1900 && y <= 2099) return { ok: true, valor: y }
  }
  return { ok: false, error: `Añada inválida: "${raw}"` }
}

function claveDura(nombre, bodega, formatoMl, anada) {
  return `${normalizar(nombre)}|${normalizar(bodega)}|${formatoMl}|${anada ?? 'sv'}`
}

function simJaccard(a, b) {
  const wa = new Set(normalizar(a).split(' ').filter(w => w.length > 2))
  const wb = new Set(normalizar(b).split(' ').filter(w => w.length > 2))
  if (!wa.size || !wb.size) return 0
  let inter = 0; for (const w of wa) if (wb.has(w)) inter++
  return inter / (wa.size + wb.size - inter)
}

function pct(nuevo, anterior) {
  if (!anterior) return null
  return Math.round(((nuevo - anterior) / anterior) * 100)
}

function eur(n) { return `${Number(n).toFixed(2)}€` }

function sep(ch = '─', n = 70) { return ch.repeat(n) }

// ── Validación de una línea ────────────────────────────────────────────────────

function validarLinea(obj, idx, codigosVistos, zonasSet) {
  const errores = []

  if (!obj.codigo_articulo) errores.push('codigo_articulo obligatorio')
  else if (codigosVistos.has(obj.codigo_articulo)) errores.push(`codigo_articulo duplicado: ${obj.codigo_articulo}`)
  else codigosVistos.add(obj.codigo_articulo)

  if (!obj.nombre_crudo) errores.push('nombre_crudo obligatorio')

  const coste = Number(obj.coste)
  if (!obj.coste && obj.coste !== 0) errores.push('coste obligatorio')
  else if (isNaN(coste) || coste <= 0 || coste >= 2000) errores.push(`coste fuera de rango: ${obj.coste}`)

  const ml = formatoAMl(obj.formato_crudo)
  if (!obj.formato_crudo) errores.push('formato_crudo obligatorio')
  else if (!ml) errores.push(`formato no convertible a ml: "${obj.formato_crudo}"`)

  const anadaResult = validarAnada(obj.anada)
  if (!anadaResult.ok) errores.push(anadaResult.error)

  const tiposValidos = ['tinto', 'blanco', 'rosado', 'espumoso', 'dulce', 'generoso', 'otros']
  if (obj.tipo && !tiposValidos.includes(obj.tipo)) errores.push(`tipo inválido: "${obj.tipo}"`)

  const zonaReconocida = !obj.zona_cruda || zonasSet.has(normalizar(obj.zona_cruda))

  return {
    ok: errores.length === 0,
    pendienteMapeo: errores.length === 0 && !zonaReconocida,
    errores,
    ml,
    anada: anadaResult.valor,
    coste,
    linea: idx + 1,
  }
}

// ── Crear vino canónico para una alta (--apply) ────────────────────────────────

async function resolverOCrearVinoAnada(supabase, nombreCrudo, bodegaCruda, anada, formatoMl) {
  const nombreNorm = normalizar(nombreCrudo)
  const bodegaNorm = normalizar(bodegaCruda)

  // Bodega
  let bodegaId = null
  if (bodegaNorm) {
    const { data: bdExist } = await supabase
      .from('bodega').select('id').ilike('nombre', bodegaNorm).maybeSingle()
    if (bdExist) {
      bodegaId = bdExist.id
    } else {
      const { data: bdNew } = await supabase
        .from('bodega').insert({ nombre: bodegaCruda }).select('id').single()
      bodegaId = bdNew?.id || null
    }
  }

  // Vino
  let vinoId = null
  const vinoQ = supabase.from('vino').select('id').eq('nombre_norm', nombreNorm)
  if (bodegaId) vinoQ.eq('bodega_id', bodegaId)
  const { data: vinoExist } = await vinoQ.maybeSingle()
  if (vinoExist) {
    vinoId = vinoExist.id
  } else {
    const { data: vinoNew } = await supabase
      .from('vino')
      .insert({ nombre: nombreCrudo, bodega_id: bodegaId || null })
      .select('id').single()
    vinoId = vinoNew?.id || null
  }
  if (!vinoId) throw new Error(`No se pudo crear el vino: "${nombreCrudo}"`)

  // Vino_anada
  const { data: vaExist } = await supabase
    .from('vino_anada').select('id')
    .eq('vino_id', vinoId)
    .eq('formato_ml', formatoMl)
    .eq('anada', anada ?? -1)  // centinela -1 = sin añada
    .maybeSingle()
  if (vaExist) return vaExist.id

  const { data: vaNew } = await supabase
    .from('vino_anada')
    .insert({ vino_id: vinoId, anada: anada || null, formato_ml: formatoMl })
    .select('id').single()
  return vaNew?.id || null
}

// ── Informe de impacto ─────────────────────────────────────────────────────────

function imprimirInforme({ proveedor, periodo, modo, altas, dedupPendientes, bajas, cambios, pendientes, cartaImpacto }) {
  const LINE = sep('═')
  const fav = item => item.esFavorito ? '  ★ FAVORITO ' : '  • '

  console.log(`\n${LINE}`)
  console.log(`INFORME DE IMPACTO — ${proveedor.nombre}`)
  console.log(`Período: ${periodo}  ·  Generado: ${new Date().toISOString().slice(0,19).replace('T',' ')}  ·  Modo: ${modo}`)
  console.log(LINE)

  // ALTAS
  console.log(`\nALTAS — ${altas.length} referencia${altas.length !== 1 ? 's' : ''} nueva${altas.length !== 1 ? 's' : ''}`)
  console.log(sep())
  if (altas.length === 0) {
    console.log('  (ninguna)')
  } else {
    for (const a of altas) {
      const anada = a.anada ? ` ${a.anada}` : ''
      console.log(`${fav(a)}${a.nombre_crudo} (${a.bodega_cruda || 'sin bodega'}${anada}) — ${a.formato_crudo}  ${eur(a.coste)}`)
    }
  }

  // ALTAS PENDIENTES DEDUP
  console.log(`\nALTAS PENDIENTES DEDUP — ${dedupPendientes.length} (similitud ≥0,65 con vino existente — revisar antes de publicar)`)
  console.log(sep())
  if (dedupPendientes.length === 0) {
    console.log('  (ninguna)')
  } else {
    for (const a of dedupPendientes) {
      console.log(`  • ${a.nombre_crudo} (${a.bodega_cruda || 'sin bodega'}) — similar a: ${a.similares.join(', ')}`)
    }
  }

  // BAJAS
  console.log(`\nBAJAS — ${bajas.length} referencia${bajas.length !== 1 ? 's' : ''} descatalogada${bajas.length !== 1 ? 's' : ''}`)
  console.log(sep())
  if (bajas.length === 0) {
    console.log('  (ninguna)')
  } else {
    for (const b of bajas) {
      const anada = b.anada ? ` ${b.anada}` : ''
      console.log(`${fav(b)}${b.nombre} (${b.bodega || 'sin bodega'}${anada}) — era ${eur(b.coste)}`)
      if (b.alternativa) {
        console.log(`             Alternativa: ${b.alternativa.nombre} en ${b.alternativa.proveedor} a ${eur(b.alternativa.coste)}`)
      }
    }
  }

  // CAMBIOS DE PRECIO
  const subidasFav  = cambios.filter(c => c.tipo === 'precio' && c.esFavorito && c.delta > 0)
  const alertas15   = cambios.filter(c => c.tipo === 'precio' && Math.abs(c.delta) > 15)
  console.log(`\nCAMBIOS DE PRECIO — ${cambios.filter(c => c.tipo === 'precio').length} referencia${cambios.filter(c=>c.tipo==='precio').length!==1?'s':''}`)
  if (alertas15.length) console.log(`  ⚠  ${alertas15.length} con variación superior al 15%`)
  console.log(sep())
  const precioCambios = cambios.filter(c => c.tipo === 'precio')
  if (precioCambios.length === 0) {
    console.log('  (ninguno)')
  } else {
    for (const c of precioCambios) {
      const flecha = c.delta > 0 ? '↑' : '↓'
      const alerta = Math.abs(c.delta) > 15 ? '  ▲ ALERTA >15%' : ''
      const fv = c.esFavorito ? '★ FAVORITO ' : ''
      console.log(`  ${flecha} ${fv}${c.delta > 0 ? '+' : ''}${c.delta}%  ${c.nombre} (${c.bodega || 'sin bodega'}) — ${eur(c.costeAnterior)} → ${eur(c.costeNuevo)}${alerta}`)
    }
  }

  // CAMBIOS DE AÑADA
  const anadaCambios = cambios.filter(c => c.tipo === 'anada')
  console.log(`\nCAMBIOS DE AÑADA — ${anadaCambios.length} referencia${anadaCambios.length !== 1 ? 's' : ''}`)
  console.log(sep())
  if (anadaCambios.length === 0) {
    console.log('  (ninguno)')
  } else {
    for (const c of anadaCambios) {
      const fv = c.esFavorito ? '★ FAVORITO ' : ''
      console.log(`${fav(c)}${fv}${c.nombre} (${c.bodega || 'sin bodega'}) — ${c.anadaAnterior ?? 'S/A'} → ${c.anadaNueva ?? 'S/A'}`)
    }
  }

  // IMPACTO EN CARTAS
  console.log(`\nIMPACTO EN CARTAS — ${cartaImpacto.totalLineas} línea${cartaImpacto.totalLineas !== 1 ? 's' : ''} en ${cartaImpacto.restaurantes.length} restaurante${cartaImpacto.restaurantes.length !== 1 ? 's' : ''}`)
  console.log(sep())
  if (cartaImpacto.restaurantes.length === 0) {
    console.log('  (ningún restaurante afectado)')
  } else {
    for (const r of cartaImpacto.restaurantes) {
      console.log(`  ${r.nombre}:`)
      for (const v of r.vinos) {
        console.log(`    ${v.cambio}  ${v.nombre}`)
      }
    }
  }

  // PENDIENTES DE MAPEO
  console.log(`\nLÍNEAS PENDIENTES DE MAPEO — ${pendientes.length}`)
  console.log(sep())
  if (pendientes.length === 0) {
    console.log('  (ninguna)')
  } else {
    for (const p of pendientes) {
      console.log(`  • L${p.linea}  ${p.nombre_crudo} — zona "${p.zona_cruda}" no reconocida`)
    }
  }

  // RESUMEN
  const nbFavBajas = bajas.filter(b => b.esFavorito).length
  const nbSubidas  = cambios.filter(c => c.tipo === 'precio' && c.delta > 0).length
  const nbBajadas  = cambios.filter(c => c.tipo === 'precio' && c.delta < 0).length
  console.log(`\n${LINE}`)
  console.log(`RESUMEN: ${altas.length} altas · ${dedupPendientes.length} dedup pendiente · ${bajas.length} bajas (${nbFavBajas} favoritos) · ${nbSubidas} subidas · ${nbBajadas} bajadas · ${anadaCambios.length} cambios de añada · ${pendientes.length} pendientes mapeo`)
  console.log(`${LINE}\n`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const getArg = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
  const hasFlag = flag => args.includes(flag)

  const proveedorId = getArg('--proveedor')
  const fichero     = getArg('--fichero')
  const periodoArg  = getArg('--periodo') || new Date().toISOString().slice(0, 10)
  const apply       = hasFlag('--apply')
  const modo        = apply ? 'PUBLICADO' : 'DRY-RUN'

  if (!proveedorId || !fichero) {
    console.error('Uso: node scripts/importar-tarifa.js --proveedor <uuid> --fichero <ruta.json> [--periodo YYYY-MM-DD] [--apply]')
    process.exit(1)
  }

  if (!fs.existsSync(fichero)) {
    console.error(`Fichero no encontrado: ${fichero}`)
    process.exit(1)
  }

  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svcKey) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(url, svcKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // 1. Proveedor
  const { data: prov, error: provErr } = await supabase
    .from('proveedores_vino').select('id, nombre').eq('id', proveedorId).single()
  if (provErr || !prov) { console.error(`Proveedor no encontrado: ${proveedorId}`); process.exit(1) }

  // 2. Zonas canónicas
  const { data: zonasRef } = await supabase
    .from('ref_denominaciones_es').select('nombre_oficial')
  const zonasSet = new Set((zonasRef || []).map(z => normalizar(z.nombre_oficial)))

  // 3. Cargar y validar el fichero de entrada
  let lineas
  try { lineas = JSON.parse(fs.readFileSync(fichero, 'utf8')) } catch (e) {
    console.error(`Error al leer JSON: ${e.message}`); process.exit(1)
  }
  if (!Array.isArray(lineas)) { console.error('El fichero debe ser un JSON array'); process.exit(1) }

  const codigosVistos = new Set()
  const validadas = lineas.map((obj, idx) => ({ obj, v: validarLinea(obj, idx, codigosVistos, zonasSet) }))

  const erroresCriticos = validadas.filter(x => !x.v.ok)
  if (erroresCriticos.length) {
    console.error(`\n${erroresCriticos.length} error(es) de validación:\n`)
    for (const { obj, v } of erroresCriticos) {
      console.error(`  L${v.linea}  ${obj.nombre_crudo || '(sin nombre)'}: ${v.errores.join('; ')}`)
    }
    console.error('\nCorrige los errores antes de continuar.')
    process.exit(1)
  }

  const pendientesMapeo = validadas.filter(x => x.v.pendienteMapeo)
  const procesables = validadas.filter(x => x.v.ok && !x.v.pendienteMapeo)
  console.log(`\n✓  ${lineas.length} líneas leídas · ${procesables.length} procesables · ${pendientesMapeo.length} pendientes de mapeo`)

  // 4. Tarifa anterior publicada de este proveedor
  const { data: prevTarifa } = await supabase
    .from('tarifa').select('id, periodo, estado')
    .eq('proveedor_id', proveedorId).eq('estado', 'publicada').maybeSingle()

  // 5. Ofertas de la tarifa anterior con contexto
  let prevOfertas = []
  if (prevTarifa) {
    const { data: po } = await supabase
      .from('oferta')
      .select(`id, codigo_articulo, coste, disponibilidad, referencia_origen_id, vino_anada_id,
               vino_anada:vino_anada_id(anada, formato_ml, vino:vino_id(nombre, bodega:bodega_id(nombre))),
               pcv:referencia_origen_id(favorito, nombre)`)
      .eq('tarifa_id', prevTarifa.id)
    prevOfertas = po || []
  }

  // Construir mapas de resolución
  const mapCodigo   = new Map()  // codigo_articulo → oferta
  const mapClaveDura = new Map() // clave_dura → oferta
  for (const o of prevOfertas) {
    if (o.codigo_articulo) mapCodigo.set(o.codigo_articulo, o)
    const va = o.vino_anada
    if (va) {
      const nombre = va.vino?.nombre || ''
      const bodega = va.vino?.bodega?.nombre || ''
      const clave  = claveDura(nombre, bodega, va.formato_ml, va.anada)
      mapClaveDura.set(clave, o)
    }
  }

  // 6. Tarifas publicadas de otros proveedores (para alternativas)
  const { data: otrasPublicadas } = await supabase
    .from('tarifa').select('id, proveedor_id, proveedores_vino:proveedor_id(nombre)')
    .eq('estado', 'publicada').neq('proveedor_id', proveedorId)
  const otrasTarifaIds = (otrasPublicadas || []).map(t => t.id)
  const otrasNombreMap = Object.fromEntries((otrasPublicadas || []).map(t => [t.id, t.proveedores_vino?.nombre || '?']))

  // 7. DIFF
  const altas    = []
  const sinCambio = []
  const cambios  = []
  const matchados = new Set()

  for (const { obj, v } of procesables) {
    let match = null
    let confianza = 0

    if (obj.codigo_articulo && mapCodigo.has(obj.codigo_articulo)) {
      match = mapCodigo.get(obj.codigo_articulo)
      confianza = 1.0
    } else {
      const clave = claveDura(obj.nombre_crudo, obj.bodega_cruda, v.ml, v.anada)
      if (mapClaveDura.has(clave)) {
        match = mapClaveDura.get(clave)
        confianza = 0.85
      }
    }

    if (!match) {
      altas.push({ ...obj, anada: v.anada, ml: v.ml, coste: v.coste, esFavorito: false, confianza: 0 })
      continue
    }

    matchados.add(match.id)
    const esFavorito = Boolean(match.pcv?.favorito)
    const prevAnada  = match.vino_anada?.anada ?? null
    const prevCoste  = parseFloat(match.coste)
    const nuevoCoste = v.coste

    if (prevAnada !== v.anada) {
      cambios.push({ tipo: 'anada', esFavorito, confianza,
        nombre: match.pcv?.nombre || match.vino_anada?.vino?.nombre || obj.nombre_crudo,
        bodega: match.vino_anada?.vino?.bodega?.nombre || obj.bodega_cruda,
        anadaAnterior: prevAnada, anadaNueva: v.anada,
        ofertaId: match.id, vinoAnadaId: match.vino_anada_id, obj, v })
    }

    const diff = pct(nuevoCoste, prevCoste)
    if (diff !== null && diff !== 0) {
      cambios.push({ tipo: 'precio', esFavorito, confianza, delta: diff,
        nombre: match.pcv?.nombre || match.vino_anada?.vino?.nombre || obj.nombre_crudo,
        bodega: match.vino_anada?.vino?.bodega?.nombre || obj.bodega_cruda,
        costeAnterior: prevCoste, costeNuevo: nuevoCoste,
        ofertaId: match.id, vinoAnadaId: match.vino_anada_id, obj, v })
    } else {
      sinCambio.push({ match, obj, v, esFavorito, confianza })
    }
  }

  // Bajas: ofertas de la tarifa anterior sin match en la nueva
  const bajas = []
  for (const o of prevOfertas) {
    if (matchados.has(o.id)) continue
    const va = o.vino_anada
    const esFavorito = Boolean(o.pcv?.favorito)
    const vinoAnadaId = o.vino_anada_id

    let alternativa = null
    if (esFavorito && vinoAnadaId && otrasTarifaIds.length) {
      const { data: alts } = await supabase
        .from('oferta').select('coste, tarifa_id, vino_anada:vino_anada_id(vino:vino_id(nombre))')
        .eq('vino_anada_id', vinoAnadaId).in('tarifa_id', otrasTarifaIds)
        .order('coste').limit(1)
      if (alts?.length) {
        const a = alts[0]
        alternativa = { nombre: a.vino_anada?.vino?.nombre || '?', proveedor: otrasNombreMap[a.tarifa_id] || '?', coste: a.coste }
      }
    }
    bajas.push({
      esFavorito, alternativa,
      nombre: o.pcv?.nombre || va?.vino?.nombre || '?',
      bodega: va?.vino?.bodega?.nombre || '?',
      anada: va?.anada ?? null, coste: parseFloat(o.coste),
      ofertaId: o.id, vinoAnadaId,
    })
  }

  // 7b. Dedup check para altas: similitud ≥ 0,65 con vinos de la misma bodega → pendiente_revision
  const dedupPendientes = []
  if (altas.length) {
    const { data: bodegas } = await supabase.from('bodega').select('id, nombre')
    const bodegaIdPorNorm = Object.fromEntries((bodegas || []).map(b => [normalizar(b.nombre), b.id]))
    for (let i = altas.length - 1; i >= 0; i--) {
      const a = altas[i]
      const bodegaId = bodegaIdPorNorm[normalizar(a.bodega_cruda || '')]
      if (!bodegaId) continue
      const { data: vinosBodega } = await supabase
        .from('vino').select('id, nombre').eq('bodega_id', bodegaId)
      const similares = (vinosBodega || []).filter(v => simJaccard(v.nombre, a.nombre_crudo) >= 0.65)
      if (similares.length) {
        dedupPendientes.push({ ...a, similares: similares.map(s => s.nombre) })
        altas.splice(i, 1)
      }
    }
  }

  // 8. Impacto en cartas
  const vinoIdsAfectados = [
    ...cambios.map(c => c.vinoAnadaId),
    ...bajas.map(b => b.vinoAnadaId),
  ].filter(Boolean)
  const cartaImpacto = { totalLineas: 0, restaurantes: [] }
  if (vinoIdsAfectados.length) {
    const { data: cartaVinos } = await supabase
      .from('vinos')
      .select('id, nombre, precio_botella, vino_id, restaurante_id, restaurantes:restaurante_id(nombre)')
      .in('vino_id', [...new Set(vinoIdsAfectados)])
    if (cartaVinos?.length) {
      const byRestaurante = {}
      for (const cv of cartaVinos) {
        const rNombre = cv.restaurantes?.nombre || cv.restaurante_id
        if (!byRestaurante[rNombre]) byRestaurante[rNombre] = []
        const cambio = cambios.find(c => c.vinoAnadaId === cv.vino_id)
        const baja   = bajas.find(b => b.vinoAnadaId === cv.vino_id)
        let cambioLabel = ''
        if (baja)   cambioLabel = `↗ DESCATALOGADO`
        if (cambio?.tipo === 'precio') cambioLabel = `↑ precio ${eur(cambio.costeAnterior)} → ${eur(cambio.costeNuevo)} (${cambio.delta > 0 ? '+' : ''}${cambio.delta}%)`
        if (cambio?.tipo === 'anada')  cambioLabel = `~ añada ${cambio.anadaAnterior ?? 'S/A'} → ${cambio.anadaNueva ?? 'S/A'}`
        byRestaurante[rNombre].push({ nombre: cv.nombre, cambio: cambioLabel })
        cartaImpacto.totalLineas++
      }
      for (const [nombre, vinos] of Object.entries(byRestaurante)) {
        cartaImpacto.restaurantes.push({ nombre, vinos })
      }
    }
  }

  // 9. Imprimir informe
  const pendientes = pendientesMapeo.map(({ obj, v }) => ({ linea: v.linea, nombre_crudo: obj.nombre_crudo, zona_cruda: obj.zona_cruda }))
  imprimirInforme({ proveedor: prov, periodo: periodoArg, modo, altas, dedupPendientes, bajas, cambios, pendientes, cartaImpacto })

  if (!apply) {
    console.log('→ Dry-run. Ejecuta con --apply para publicar.\n')
    return
  }

  // 10. PUBLICAR
  console.log('Publicando...')

  // 10a. Crear tarifa en borrador
  const { data: nuevaTarifa, error: tarifaErr } = await supabase
    .from('tarifa')
    .insert({ proveedor_id: proveedorId, periodo: periodoArg, estado: 'borrador', fichero_origen: path.basename(fichero) })
    .select('id').single()
  if (tarifaErr) throw tarifaErr

  // 10b. Insertar linea_cruda para todas las líneas (incluye pendientes mapeo)
  const todasLineas = validadas.filter(x => x.v.ok || x.v.pendienteMapeo)
  const codigosDedupPendiente = new Set(dedupPendientes.map(d => d.codigo_articulo).filter(Boolean))
  const lineaRows = todasLineas.map(({ obj, v }) => ({
    tarifa_id: nuevaTarifa.id,
    numero_linea: v.linea,
    texto_literal: JSON.stringify(obj),
    datos_json: obj,
    estado_revision: v.pendienteMapeo ? 'pendiente_mapeo'
      : (obj.codigo_articulo && codigosDedupPendiente.has(obj.codigo_articulo)) ? 'pendiente_revision'
      : 'ok',
    confianza: null,
  }))
  await supabase.from('linea_cruda').insert(lineaRows)

  // 10c. Crear nuevas ofertas para líneas procesables
  const ofertaRows = []
  for (const { obj, v, match, esFavorito, confianza } of [
    ...procesables.map(({ obj, v }) => {
      let match2 = null
      if (obj.codigo_articulo && mapCodigo.has(obj.codigo_articulo)) match2 = mapCodigo.get(obj.codigo_articulo)
      else {
        const c = claveDura(obj.nombre_crudo, obj.bodega_cruda, v.ml, v.anada)
        if (mapClaveDura.has(c)) match2 = mapClaveDura.get(c)
      }
      return { obj, v, match: match2, esFavorito: Boolean(match2?.pcv?.favorito), confianza: match2 ? (obj.codigo_articulo && mapCodigo.has(obj.codigo_articulo) ? 1.0 : 0.85) : 0 }
    })
  ]) {
    let vinoAnadaId = match?.vino_anada_id || null
    if (!vinoAnadaId) {
      // Alta: crear vino canónico
      try {
        vinoAnadaId = await resolverOCrearVinoAnada(supabase, obj.nombre_crudo, obj.bodega_cruda, v.anada, v.ml)
      } catch (e) {
        console.error(`  ✗ No se pudo crear vino_anada para "${obj.nombre_crudo}": ${e.message}`)
        continue
      }
    }
    ofertaRows.push({
      proveedor_id: proveedorId,
      vino_anada_id: vinoAnadaId,
      tarifa_id: nuevaTarifa.id,
      codigo_articulo: obj.codigo_articulo || null,
      coste: v.coste,
      disponibilidad: obj.disponibilidad || null,
    })
  }
  if (ofertaRows.length) await supabase.from('oferta').insert(ofertaRows)

  // 10d. Bajas: actualizar modelo canónico (oferta.disponibilidad) y modelo display (proveedor_catalogo_vinos.activo)
  // oferta.disponibilidad — el modelo canónico que leen bloque 6 y el filtro geográfico del bloque 8
  const bajasOfertaIds = bajas.map(b => b.ofertaId).filter(Boolean)
  if (bajasOfertaIds.length) {
    await supabase.from('oferta').update({ disponibilidad: 'descatalogado' }).in('id', bajasOfertaIds)
  }

  // proveedor_catalogo_vinos.activo=false — el flag que usa catalogo-consultor para sin_proveedor_activo
  const bajasConOrigen = bajas.filter(b => b.ofertaId)
  if (bajasConOrigen.length) {
    const { data: origenes } = await supabase
      .from('oferta').select('referencia_origen_id').in('id', bajasConOrigen.map(b => b.ofertaId))
    const ids = (origenes || []).map(o => o.referencia_origen_id).filter(Boolean)
    if (ids.length) await supabase.from('proveedor_catalogo_vinos').update({ activo: false, updated_at: new Date().toISOString() }).in('id', ids)
  }

  // 10e. Publicar tarifa y archivar la anterior
  if (prevTarifa) {
    await supabase.from('tarifa').update({ estado: 'archivada' }).eq('id', prevTarifa.id)
  }
  await supabase.from('tarifa').update({ estado: 'publicada', publicada_at: new Date().toISOString() }).eq('id', nuevaTarifa.id)

  console.log(`✓  Tarifa ${nuevaTarifa.id} publicada`)
  console.log(`   ${ofertaRows.length} ofertas creadas · ${bajasConOrigen.length} referencias marcadas descatalogadas`)
  if (prevTarifa) console.log(`   Tarifa anterior ${prevTarifa.id} archivada`)
}

main().catch(err => { console.error(`\nError: ${err.message}`); process.exit(1) })
