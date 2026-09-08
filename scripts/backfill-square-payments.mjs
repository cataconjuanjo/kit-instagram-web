#!/usr/bin/env node
/**
 * Backfill de ventas Square perdidas durante el corte de dominio (2026-09-07).
 *
 * Por defecto: DRY-RUN (no escribe nada). Para aplicar de verdad:
 *   node scripts/backfill-square-payments.mjs --apply
 *
 * Lo que hace:
 *   1. Trae todos los pagos COMPLETED de Square en la ventana del corte.
 *   2. Para cada pago comprueba processed_payments — los ya registrados se saltan
 *      solos (idempotencia garantizada por la constraint única de la tabla).
 *   3. DRY: muestra qué stock cambiaría. APPLY: inserta en processed_payments y
 *      llama a applyPaymentToStock (mismo código que el webhook real).
 *
 * NOTA: solo cubre ventas (payment.updated). Los cambios manuales de catálogo o
 * ajustes de inventario hechos directamente en el panel de Square durante el corte
 * hay que revisarlos a mano.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const DRY_RUN = !args.includes('--apply')

// --- 1. Cargar .env.local y poblar process.env ANTES del import dinámico ---
// Los módulos de la app leen env vars a nivel de módulo (module-scope constants).
// El import dinámico garantiza que process.env ya está poblado cuando se inicializan.
const envPath = resolve(__dirname, '../.env.local')
const env = {}
try {
  const rawEnv = readFileSync(envPath, 'utf-8').replace(/^﻿/, '').replace(/\r/g, '')
  for (const line of rawEnv.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
    if (m) {
      env[m[1]] = m[2].trim()
      process.env[m[1]] = m[2].trim()
    }
  }
} catch {
  console.error('No se pudo leer .env.local — asegurate de ejecutar desde la raiz del proyecto.')
  process.exit(1)
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

// Cliente Supabase del script (para consultar/insertar en processed_payments)
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// --- 2. Import dinámico DESPUES de setear process.env ---
const {
  listSquareSyncTiendas,
  fetchSquareOrder,
  buildPaymentQuantities,
  selectVinosBySquareIds,
  squareActivoFromStock,
  applyPaymentToStock,
} = await import('../app/api/_lib/squareSync.js')

// --- Ventana de recuperacion ---
// 2026-09-07 00:00 CEST (Madrid UTC+2) = 2026-09-06 22:00 UTC
// end_time con margen generoso — los ya procesados se saltan por idempotencia
const BEGIN_TIME = '2026-09-06T22:00:00Z'
const END_TIME   = '2026-09-08T12:00:00Z'

const SQUARE_API_BASE = 'https://connect.squareup.com'
const SQUARE_VERSION  = '2024-01-18'

// --- Helpers ---

async function fetchAllCompletedPayments(squareToken, locationId) {
  const payments = []
  let cursor = null

  do {
    const url = new URL(`${SQUARE_API_BASE}/v2/payments`)
    url.searchParams.set('location_id', locationId)
    url.searchParams.set('begin_time', BEGIN_TIME)
    url.searchParams.set('end_time', END_TIME)
    url.searchParams.set('sort_order', 'ASC')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${squareToken}`,
        'Square-Version': SQUARE_VERSION,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Square Payments API ${res.status}: ${body.slice(0, 500)}`)
    }

    const data = await res.json()
    payments.push(...(data.payments || []))
    cursor = data.cursor || null
  } while (cursor)

  return payments.filter(p => p.status === 'COMPLETED' && p.id && p.order_id)
}

async function checkProcessed(paymentId) {
  const { data, error } = await supabase
    .from('processed_payments')
    .select('payment_id')
    .eq('payment_id', paymentId)
    .maybeSingle()
  if (error) throw new Error(`processed_payments lookup: ${error.message}`)
  return data !== null
}

async function claimPayment(paymentId, tiendaSlug) {
  const { error } = await supabase
    .from('processed_payments')
    .insert({ payment_id: paymentId, tienda_slug: tiendaSlug })
  if (!error) return { claimed: true }
  // Duplicate key = ya procesado, OK saltar
  if (error.code === '23505' || /duplicate key|unique constraint/i.test(error.message || '')) {
    return { claimed: false, alreadyExists: true }
  }
  // Cualquier otro error (conexión, RLS, timeout) → lanzar para que el caller lo registre
  throw new Error(`processed_payments insert: ${error.message} (code: ${error.code})`)
}

function fmt(val) {
  return val === null || val === undefined ? 'null' : String(val)
}

// --- Main ---

console.log(`\n=== BACKFILL SQUARE PAYMENTS ${DRY_RUN ? '[DRY-RUN — sin escrituras]' : '[APLICANDO]'} ===`)
console.log(`Ventana: ${BEGIN_TIME} → ${END_TIME}\n`)

const tiendas = await listSquareSyncTiendas({ includePaused: false })

if (!tiendas.length) {
  console.log('No hay tiendas Square activas. Revisa SQUARE_SYNC_ENABLED y que las tiendas tengan token.')
  process.exit(0)
}

console.log(`Tiendas a revisar: ${tiendas.map(t => t.slug).join(', ')}\n`)

let totalCompletados = 0
let totalSaltados    = 0
let totalAplicar     = 0
let totalAplicados   = 0
let totalErrores     = 0

for (const tienda of tiendas) {
  if (!tienda.square_location_id) {
    console.log(`[${tienda.slug}] Sin square_location_id — saltando`)
    continue
  }
  if (!tienda.squareToken) {
    console.log(`[${tienda.slug}] Sin token Square — saltando`)
    continue
  }

  console.log(`\n--- Tienda: ${tienda.slug} (location: ${tienda.square_location_id}) ---`)

  let pagos
  try {
    pagos = await fetchAllCompletedPayments(tienda.squareToken, tienda.square_location_id)
  } catch (err) {
    console.error(`  ERROR obteniendo pagos de Square: ${err.message}`)
    continue
  }

  console.log(`  Pagos COMPLETED en ventana: ${pagos.length}`)
  totalCompletados += pagos.length

  for (const pago of pagos) {
    const yaProcessado = await checkProcessed(pago.id)

    if (yaProcessado) {
      process.stdout.write(`  [SKIP] ${pago.id} — ya en processed_payments\n`)
      totalSaltados++
      continue
    }

    totalAplicar++

    if (DRY_RUN) {
      // Proyectar cambios sin escribir
      try {
        const order = await fetchSquareOrder(pago.order_id, tienda.squareToken)
        const quantities = buildPaymentQuantities(order)

        if (!quantities.size) {
          console.log(`  [DRY] ${pago.id} — orden sin items ITEM (sin cambios de stock)`)
          continue
        }

        const catalogIds = [...quantities.keys()]
        const vinosBySquareId = await selectVinosBySquareIds(tienda.id, catalogIds, catalogIds)

        console.log(`  [DRY] ${pago.id} (order: ${pago.order_id}) — APLICARIA:`)
        for (const [catalogId, qty] of quantities) {
          const vino = vinosBySquareId.get(catalogId)
          if (!vino) {
            console.log(`        catalog ${catalogId.slice(0, 12)}… x${qty} -> NOT FOUND en vinos_tienda`)
            continue
          }
          const nuevoStock = Math.max(0, (vino.stock || 0) - qty)
          const activoNuevo = squareActivoFromStock(vino, nuevoStock)
          const activoCambia = Boolean(vino.activo) !== activoNuevo
          const activoInfo = activoCambia ? ` | activo ${fmt(vino.activo)} -> ${fmt(activoNuevo)}` : ''
          console.log(`        ${vino.nombre} x${qty} -> stock ${fmt(vino.stock)} -> ${nuevoStock}${activoInfo}`)
        }
      } catch (err) {
        console.log(`  [DRY] ${pago.id} — ERROR en proyeccion: ${err.message}`)
      }
    } else {
      // Aplicar: reclamar primero, luego actualizar stock
      let claimResult
      try {
        claimResult = await claimPayment(pago.id, tienda.slug)
      } catch (claimErr) {
        // Error real de BD (no duplicate key): NO silenciar como skip
        totalErrores++
        console.log(`  [ERROR] ${pago.id} — fallo al reclamar en processed_payments: ${claimErr.message}`)
        continue
      }
      if (!claimResult.claimed) {
        // Duplicate key: procesado entre el checkProcessed y el insert (carrera normal)
        console.log(`  [SKIP] ${pago.id} — ya en processed_payments (detectado en insert)`)
        totalSaltados++
        totalAplicar--
        continue
      }

      try {
        const { lineas, hasError, actualizados } = await applyPaymentToStock(pago, tienda)
        const noEncontrados = lineas.filter(l => l.status === 'not_found').length
        const sinCambio     = lineas.filter(l => l.status === 'unchanged').length

        if (hasError) {
          totalErrores++
          console.log(`  [ERROR] ${pago.id} — ${actualizados}/${lineas.length} actualizados (con errores)`)
          lineas.filter(l => l.status === 'error').forEach(l =>
            console.log(`          error en: ${l.vino_nombre || l.catalog_object_id}`)
          )
        } else {
          totalAplicados++
          const partes = [`${actualizados} act.`]
          if (sinCambio)     partes.push(`${sinCambio} sin cambio`)
          if (noEncontrados) partes.push(`${noEncontrados} no encontrados`)
          console.log(`  [OK]   ${pago.id} — ${partes.join(', ')}`)
          lineas.filter(l => l.status === 'ok').forEach(l =>
            console.log(`          ${l.vino_nombre}: ${fmt(l.stock_antes)} -> ${l.stock_despues}`)
          )
        }
      } catch (err) {
        totalErrores++
        console.log(`  [ERROR] ${pago.id} — ${err.message}`)
      }
    }
  }
}

console.log('\n=== RESUMEN ===')
console.log(`Pagos COMPLETED en ventana : ${totalCompletados}`)
console.log(`Ya en processed_payments   : ${totalSaltados}`)
console.log(`Pendientes (no procesados) : ${totalAplicar}`)
if (!DRY_RUN) {
  console.log(`Aplicados OK               : ${totalAplicados}`)
  console.log(`Con errores                : ${totalErrores}`)
} else {
  console.log('\nRevisa los [DRY] de arriba y ejecuta con --apply para aplicar los cambios.')
}
