/**
 * limpiar-parte-b4.mjs
 * Localiza y elimina un parte de servicio B4 por restaurante + fecha + turno.
 *
 * Por defecto:  --dry-run (solo imprime, sin escribir)
 * Para aplicar: node --env-file=.env.local scripts/limpiar-parte-b4.mjs --apply
 *
 * Args opcionales:
 *   --fecha YYYY-MM-DD    (defecto: 2026-10-14)
 *   --turno <texto>       (defecto: mediodia)
 *
 * Valores de turno válidos: mediodia | noche | unico
 *
 * Defaults fijos:
 *   Restaurante : La Taberna del Puerto (a4346301-4dc5-4cb5-a2f5-3ca6469acd66)
 *   Vino        : Ariyanas Natural     (760a5295-2146-4e0f-8261-21ca3a59a469)
 *   Stock rest. : 8
 *
 * Para si encuentra más de 1 parte con esa fecha+turno o si los conteos
 * no son exactamente 1 parte + 1 línea + 2 movimientos + 1 botella.
 *
 * Movimientos:
 *   - Apertura : parte_servicio_id = PARTE_ID (vino_id = VINO_ID)
 *   - Rotura   : tipo='rotura', cantidad=0, parte_servicio_id IS NULL,
 *                created_at >= botella.abierta_at
 *     (gestionar_botella_copa no guarda parte_servicio_id; cantidad=0 distingue
 *     del movimiento "Botella rota en servicio" que usa cantidad=-1)
 *
 * Nota: cuando se aplique supabase/b4_fix2_botella_id_mov.sql, la rotura
 * tendrá botella_abierta_id y el filtro puede simplificarse a esa FK.
 *
 * Orden seguro:
 *   1. Restaurar vino (stock → 8)
 *   2. Borrar movimientos (apertura + rotura por id)
 *   3. Borrar líneas del parte
 *   4. Borrar parte de servicio
 *   5. Borrar botellas_abiertas (vino + restaurante, estados activos)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const faltantes = [
  !SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean)
if (faltantes.length) {
  console.error(`ERROR: faltan: ${faltantes.join(', ')}`)
  process.exitCode = 1
}

// ── Defaults fijos ────────────────────────────────────────────────────────────
const RESTAURANTE_ID = 'a4346301-4dc5-4cb5-a2f5-3ca6469acd66'  // La Taberna del Puerto
const VINO_ID        = '760a5295-2146-4e0f-8261-21ca3a59a469'  // Ariyanas Natural
const STOCK_RESTORE  = 8

// ── Argumentos ────────────────────────────────────────────────────────────────
const argv   = process.argv
const arg    = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] ?? null : null }
const FECHA  = arg('--fecha') ?? '2026-10-14'
const TURNO  = arg('--turno') ?? 'mediodia'
const DRY_RUN = !argv.includes('--apply')

if (process.exitCode === 1) process.exit()

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

async function main() {
  console.log(`\nlimpiar-parte-b4.mjs  [${DRY_RUN ? 'DRY RUN — sin cambios' : 'APPLY'}]\n`)
  console.log(`Restaurante : ${RESTAURANTE_ID}  (La Taberna del Puerto)`)
  console.log(`Vino        : ${VINO_ID}  (Ariyanas Natural)`)
  console.log(`Fecha       : ${FECHA}`)
  console.log(`Turno       : ${TURNO}\n`)

  // ── Diagnóstico: todos los partes del día ─────────────────────────────────────
  const { data: partesDelDia, error: diaErr } = await db
    .from('partes_servicio')
    .select('id, turno, estado')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('fecha', FECHA)
    .order('turno')

  if (diaErr) {
    console.error(`ERROR en diagnóstico: ${diaErr.message}`)
    process.exitCode = 1; return
  }

  console.log(`Partes del día ${FECHA} en este restaurante (${partesDelDia?.length ?? 0}):`)
  if (!partesDelDia || partesDelDia.length === 0) {
    console.log('  (ninguno)')
  } else {
    for (const p of partesDelDia) {
      const marca = p.turno === TURNO ? ' ← buscando este' : ''
      console.log(`  ${p.id}  turno=${p.turno}  estado=${p.estado}${marca}`)
    }
  }
  console.log()

  // ── 1. Seleccionar parte por turno ────────────────────────────────────────────
  const partes = (partesDelDia || []).filter(p => p.turno === TURNO)

  if (partes.length === 0) {
    console.log(`Parte no encontrado para turno="${TURNO}" — ya fue borrado o no existe.`)
    return
  }
  if (partes.length > 1) {
    console.error(`ERROR: ${partes.length} partes encontrados para ${FECHA} / turno=${TURNO}:`)
    for (const p of partes) console.error(`  ${p.id}  [${p.estado}]`)
    console.error('Identifica el ID correcto y usa limpiar-parte-test-b4.mjs con IDs fijos.')
    process.exitCode = 1; return
  }

  const parte = partes[0]
  const PARTE_ID = parte.id
  console.log(`Parte encontrado : ${PARTE_ID}  turno=${parte.turno}  [${parte.estado}]`)

  // ── 2. Estado actual del vino ─────────────────────────────────────────────────
  const { data: vino, error: vinoErr } = await db
    .from('vinos')
    .select('id, nombre, stock, coste_compra, coste_medio_pmp, por_copa')
    .eq('id', VINO_ID)
    .single()
  if (vinoErr) {
    console.error(`ERROR leyendo vino: ${vinoErr.message}`)
    process.exitCode = 1; return
  }
  console.log(`\nVino   : ${vino.nombre}`)
  console.log(`  stock = ${vino.stock}  →  restaurará a ${STOCK_RESTORE}`)

  // ── 3. Botellas activas del vino (se necesita abierta_at como ancla) ──────────
  const { data: bots, error: botsErr } = await db
    .from('botellas_abiertas')
    .select('id, estado, abierta_at, cerrada_at, copas_restantes, copas_servidas, copas_teoricas')
    .eq('vino_id', VINO_ID)
    .eq('restaurante_id', RESTAURANTE_ID)
    .in('estado', ['abierta', 'agotada', 'cerrada_manual'])
  if (botsErr) {
    console.error(`ERROR leyendo botellas: ${botsErr.message}`)
    process.exitCode = 1; return
  }

  // abierta_at más antigua de las botellas activas → ancla para buscar la rotura
  const botAncla = (bots || []).reduce((min, b) =>
    (!min || b.abierta_at < min.abierta_at) ? b : min, null)
  const anclaTs = botAncla?.abierta_at ?? `${FECHA}T00:00:00Z`

  console.log(`\nBotellas_abiertas a borrar (${bots?.length ?? 0} — esperado 1):`)
  for (const b of bots || []) {
    console.log(`  ${b.id}  [${b.estado}]  servidas=${b.copas_servidas}  restantes=${b.copas_restantes}  teoricas=${b.copas_teoricas}  abierta_at=${b.abierta_at}`)
  }
  console.log(`  ancla temporal para rotura: ${anclaTs}`)

  // ── 4. Líneas del parte ───────────────────────────────────────────────────────
  const { data: lineas, error: lineasErr } = await db
    .from('partes_servicio_lineas')
    .select('id, tipo, cantidad, copas_vendidas, precio_unitario')
    .eq('parte_id', PARTE_ID)
  if (lineasErr) {
    console.error(`ERROR leyendo líneas: ${lineasErr.message}`)
    process.exitCode = 1; return
  }

  console.log(`\nLíneas a borrar (${lineas?.length ?? 0} — esperado 1):`)
  for (const l of lineas || []) {
    console.log(`  ${l.id}  ${l.tipo}  cantidad=${l.cantidad}  copas=${l.copas_vendidas}  precio=${l.precio_unitario}€`)
  }

  // ── 5. Movimientos: apertura (parte_servicio_id) ──────────────────────────────
  const { data: movsApertura, error: movAErr } = await db
    .from('movimientos_stock')
    .select('id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, parte_servicio_id, created_at')
    .eq('parte_servicio_id', PARTE_ID)
    .eq('vino_id', VINO_ID)
    .eq('restaurante_id', RESTAURANTE_ID)
  if (movAErr) {
    console.error(`ERROR leyendo movimientos apertura: ${movAErr.message}`)
    process.exitCode = 1; return
  }

  // ── 6. Movimientos: rotura de cierre manual ───────────────────────────────────
  // Filtros para distinguir del movimiento demo "Botella rota en servicio":
  //   · tipo='rotura'             — igual para ambos
  //   · cantidad=0                — cierre manual; la rotura normal tiene cantidad<0
  //   · parte_servicio_id IS NULL — gestionar_botella_copa no lo rellena
  //   · created_at >= anclaTs     — no anterior a la apertura de la botella
  //
  // Tras aplicar b4_fix2_botella_id_mov.sql el filtro podrá usar botella_abierta_id.
  const { data: movsRotura, error: movRErr } = await db
    .from('movimientos_stock')
    .select('id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, parte_servicio_id, created_at')
    .eq('tipo', 'rotura')
    .eq('vino_id', VINO_ID)
    .eq('restaurante_id', RESTAURANTE_ID)
    .is('parte_servicio_id', null)
    .eq('cantidad', 0)
    .gte('created_at', anclaTs)
  if (movRErr) {
    console.error(`ERROR leyendo movimientos rotura: ${movRErr.message}`)
    process.exitCode = 1; return
  }

  const movs = [...(movsApertura || []), ...(movsRotura || [])]
  const movIds = movs.map(m => m.id)

  console.log(`\nMovimientos a borrar (${movs.length} — esperado 2):`)
  for (const m of movs) {
    const linked = m.parte_servicio_id ? `parte=${m.parte_servicio_id.slice(0,8)}…` : 'parte_servicio_id=null'
    console.log(`  ${m.id}  ${m.tipo}  cantidad=${m.cantidad}  stock ${m.stock_anterior}→${m.stock_nuevo}  motivo=${m.motivo}  [${linked}]  created_at=${m.created_at}`)
  }

  // ── Verificación de conteos — para en error si no son exactamente los esperados ─
  const errores = []
  if ((bots?.length ?? 0) !== 1)     errores.push(`botellas: ${bots?.length ?? 0} (esperado 1)`)
  if ((lineas?.length ?? 0) !== 1)   errores.push(`líneas: ${lineas?.length ?? 0} (esperado 1)`)
  if ((movsApertura?.length ?? 0) !== 1) errores.push(`movimientos apertura: ${movsApertura?.length ?? 0} (esperado 1)`)
  if ((movsRotura?.length ?? 0) !== 1)   errores.push(`movimientos rotura cierre: ${movsRotura?.length ?? 0} (esperado 1)`)

  console.log(`\n${'─'.repeat(60)}`)
  if (errores.length) {
    console.error(`ERROR: conteos inesperados — ${errores.join('; ')}`)
    console.error('Revisa los datos antes de aplicar. El script no continuará.')
    process.exitCode = 1; return
  }
  console.log('Conteos verificados: 1 parte, 1 línea, 2 movimientos, 1 botella ✓')

  const botIds = (bots || []).map(b => b.id)
  console.log('\nAcciones que se ejecutarán:')
  console.log(`  1. Restaurar ${vino.nombre}: stock ${vino.stock} → ${STOCK_RESTORE}`)
  console.log(`  2. Borrar ${movIds.length} movimiento(s) (apertura + rotura de cierre)`)
  console.log(`  3. Borrar ${lineas?.length ?? 0} línea(s)  (parte_id=${PARTE_ID})`)
  console.log(`  4. Borrar parte  ${PARTE_ID}`)
  console.log(`  5. Borrar ${botIds.length} botella(s)  [${botIds.join(', ')}]`)

  if (DRY_RUN) {
    console.log(`\nDRY RUN completado — sin cambios.`)
    console.log(`Para aplicar:`)
    console.log(`  node --env-file=.env.local scripts/limpiar-parte-b4.mjs --apply\n`)
    return
  }

  // ── Aplicar cambios ───────────────────────────────────────────────────────────
  console.log('\nAplicando cambios...\n')

  const { error: vinoUpdErr } = await db
    .from('vinos').update({ stock: STOCK_RESTORE }).eq('id', VINO_ID)
  if (vinoUpdErr) {
    console.error(`ERROR restaurando vino — abortando (nada borrado): ${vinoUpdErr.message}`)
    process.exitCode = 1; return
  }
  console.log(`✓ ${vino.nombre}: stock → ${STOCK_RESTORE}`)

  const { error: movDelErr } = await db
    .from('movimientos_stock').delete()
    .in('id', movIds).eq('restaurante_id', RESTAURANTE_ID)
  if (movDelErr) {
    console.error(`ERROR borrando movimientos — vino ya restaurado, borra el resto manualmente: ${movDelErr.message}`)
    process.exitCode = 1; return
  }
  console.log(`✓ ${movIds.length} movimiento(s) eliminado(s)`)

  const { error: linDelErr } = await db
    .from('partes_servicio_lineas').delete().eq('parte_id', PARTE_ID)
  if (linDelErr) {
    console.error(`ERROR borrando líneas — borra parte y botellas manualmente: ${linDelErr.message}`)
    process.exitCode = 1; return
  }
  console.log(`✓ ${lineas?.length ?? 0} línea(s) eliminada(s)`)

  const { error: parteDelErr } = await db
    .from('partes_servicio').delete()
    .eq('id', PARTE_ID).eq('restaurante_id', RESTAURANTE_ID)
  if (parteDelErr) {
    console.error(`ERROR borrando parte — borra botellas manualmente: ${parteDelErr.message}`)
    process.exitCode = 1; return
  }
  console.log(`✓ Parte eliminado (${PARTE_ID})`)

  if (botIds.length > 0) {
    const { error: botDelErr } = await db
      .from('botellas_abiertas').delete()
      .in('id', botIds).eq('restaurante_id', RESTAURANTE_ID)
    if (botDelErr) {
      console.error(`ERROR borrando botellas_abiertas: ${botDelErr.message}`)
      process.exitCode = 1; return
    }
    console.log(`✓ ${botIds.length} botella(s) eliminada(s)`)
  }

  // ── Verificación final ────────────────────────────────────────────────────────
  const { data: vinoFinal } = await db.from('vinos').select('stock').eq('id', VINO_ID).single()
  const { data: parteCheck } = await db.from('partes_servicio').select('id').eq('id', PARTE_ID).maybeSingle()
  const { data: botCheck } = await db.from('botellas_abiertas').select('id')
    .eq('vino_id', VINO_ID).eq('restaurante_id', RESTAURANTE_ID)
    .in('estado', ['abierta', 'agotada', 'cerrada_manual'])

  console.log(`\nVerificación:`)
  console.log(`  stock = ${vinoFinal?.stock} (esperado ${STOCK_RESTORE}) ${vinoFinal?.stock === STOCK_RESTORE ? '✓' : '✗'}`)
  console.log(`  parte borrado = ${!parteCheck ? '✓' : '✗ (sigue existiendo)'}`)
  console.log(`  botellas activas restantes = ${(botCheck || []).length} (esperado 0) ${(botCheck || []).length === 0 ? '✓' : '✗'}`)

  console.log('\nLimpieza completada.\n')
}

main().catch(e => {
  console.error('ERROR no capturado:', e)
  process.exitCode = 1
})
