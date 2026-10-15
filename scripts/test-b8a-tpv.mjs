/**
 * test-b8a-tpv.mjs — B8a integration tests against real DB (La Taberna)
 *
 * Requires:
 *   TEST_RESTAURANTE_ID  UUID del restaurante de prueba (La Taberna)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   TEST_RESTAURANTE_ID=<uuid> node scripts/test-b8a-tpv.mjs
 *
 * Cleanup: all test data (movimientos, lineas, vino_map, vinos) is deleted after each test.
 */

import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { describe, it, after } from 'node:test'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID   = process.env.TEST_RESTAURANTE_ID

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!RESTAURANTE_ID) {
  console.error('Falta TEST_RESTAURANTE_ID (UUID del restaurante de prueba, e.g. La Taberna)')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function crearVinoTest(extra = {}) {
  const { data, error } = await db
    .from('vinos')
    .insert({
      restaurante_id: RESTAURANTE_ID,
      nombre:         `__test_b8a_${Date.now()}`,
      tipo:           'tinto',
      stock:          10,
      por_copa:       false,
      ...extra,
    })
    .select('id, nombre, por_copa')
    .single()
  if (error) throw new Error(`crearVinoTest: ${error.message}`)
  return data
}

async function crearMapeo(producto_externo_id, vino_id, formato_venta, estado = 'activo') {
  const { error } = await db
    .from('tpv_vino_map')
    .upsert({
      restaurante_id:      RESTAURANTE_ID,
      fuente:              'square',
      producto_externo_id,
      vino_id:             estado === 'ignorar' ? null : vino_id,
      formato_venta:       estado === 'ignorar' ? null : formato_venta,
      estado,
    }, { onConflict: 'restaurante_id,fuente,producto_externo_id' })
  if (error) throw new Error(`crearMapeo: ${error.message}`)
}

async function registrar(payment_id, lines, payment_date = new Date().toISOString()) {
  const { data, error } = await db.rpc('registrar_ventas_tpv', {
    p_restaurante_id: RESTAURANTE_ID,
    p_payment_id:     payment_id,
    p_payment_date:   payment_date,
    p_lines:          lines,
    p_fuente:         'square',
  })
  if (error) throw new Error(`registrar_ventas_tpv: ${error.message}`)
  return data
}

async function asignarLineas(params) {
  const { data, error } = await db.rpc('asignar_lineas_tpv', {
    p_restaurante_id:      RESTAURANTE_ID,
    p_fuente:              'square',
    p_producto_externo_id: params.producto_externo_id ?? '',
    p_vino_id:             params.vino_id ?? null,
    p_formato_venta:       params.formato_venta ?? null,
    p_accion:              params.accion,
    p_linea_id:            params.linea_id ?? null,
  })
  if (error) throw new Error(`asignar_lineas_tpv: ${error.message}`)
  return data
}

async function limpiar({ vinos = [], producto_ids = [], payment_ids = [] }) {
  if (payment_ids.length) {
    for (const pid of payment_ids) {
      await db.from('tpv_lineas_sin_asignar')
        .delete()
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('referencia_ticket', pid)
      const refPrefijo = `square_${pid}`
      await db.from('movimientos_stock')
        .delete()
        .eq('restaurante_id', RESTAURANTE_ID)
        .like('referencia_externa', `${refPrefijo}%`)
    }
  }
  if (producto_ids.length) {
    await db.from('tpv_vino_map')
      .delete()
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('fuente', 'square')
      .in('producto_externo_id', producto_ids)
  }
  if (vinos.length) {
    await db.from('vinos')
      .delete()
      .eq('restaurante_id', RESTAURANTE_ID)
      .in('id', vinos.map(v => v.id))
  }
}

function uid() {
  return `tst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('T1 — registrar_ventas_tpv: idempotencia already_applied', async () => {
  const pid    = `pay_t1_${Date.now()}`
  const varId  = `var_t1_${Date.now()}`
  const lineUid = uid()
  let vino

  try {
    vino = await crearVinoTest()
    await crearMapeo(varId, vino.id, 'botella')

    const linea = {
      uid: lineUid, producto_externo_id: varId, vino_id: vino.id,
      formato_venta: 'botella', estado_mapeo: 'activo',
      nombre_producto: '__test', cantidad: 1,
      precio_unitario_bruto: 12, descuento_unitario: 0, importe_bruto_iva: 12,
    }

    const r1 = await registrar(pid, [linea])
    assert.equal(r1[0].status, 'ok', 'Primera llamada debe ser ok')

    const r2 = await registrar(pid, [linea])
    assert.equal(r2[0].status, 'already_applied', 'Segunda llamada debe ser already_applied')
    console.log('T1 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T2 — registrar_ventas_tpv: producto ignorado', async () => {
  const pid   = `pay_t2_${Date.now()}`
  const varId = `var_t2_${Date.now()}`
  let vino

  try {
    vino = await crearVinoTest()
    await crearMapeo(varId, null, null, 'ignorar')

    const linea = {
      uid: uid(), producto_externo_id: varId, vino_id: null,
      formato_venta: null, estado_mapeo: 'ignorar',
      nombre_producto: '__test_ignorar', cantidad: 2,
      precio_unitario_bruto: 5, descuento_unitario: 0, importe_bruto_iva: 10,
    }
    const r = await registrar(pid, [linea])
    assert.equal(r[0].status, 'ignorado', 'Producto ignorado → status ignorado')
    console.log('T2 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T3 — registrar_ventas_tpv: sin_mapeo → cola', async () => {
  const pid   = `pay_t3_${Date.now()}`
  const varId = `var_t3_${Date.now()}`

  try {
    const linea = {
      uid: uid(), producto_externo_id: varId, vino_id: null,
      formato_venta: null, estado_mapeo: null,
      nombre_producto: '__test_sin_mapeo', cantidad: 1,
      precio_unitario_bruto: 8, descuento_unitario: 0, importe_bruto_iva: 8,
    }
    const r = await registrar(pid, [linea])
    assert.equal(r[0].status, 'sin_mapeo', 'Sin mapeo → cola con tipo_incidencia sin_mapeo')
    console.log('T3 ✓')
  } finally {
    await limpiar({ payment_ids: [pid] })
  }
})

describe('T4 — registrar_ventas_tpv: cantidad decimal → cola', async () => {
  const pid   = `pay_t4_${Date.now()}`
  const varId = `var_t4_${Date.now()}`
  let vino

  try {
    vino = await crearVinoTest()
    await crearMapeo(varId, vino.id, 'botella')

    const linea = {
      uid: uid(), producto_externo_id: varId, vino_id: vino.id,
      formato_venta: 'botella', estado_mapeo: 'activo',
      nombre_producto: '__test_decimal', cantidad: 1.5,
      precio_unitario_bruto: 12, descuento_unitario: 0, importe_bruto_iva: 18,
    }
    const r = await registrar(pid, [linea])
    assert.equal(r[0].status, 'cantidad_no_entera', 'Decimal → cola con tipo_incidencia cantidad_no_entera')
    console.log('T4 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T5 — registrar_ventas_tpv: cantidad cero → cola', async () => {
  const pid   = `pay_t5_${Date.now()}`
  const varId = `var_t5_${Date.now()}`
  let vino

  try {
    vino = await crearVinoTest()
    await crearMapeo(varId, vino.id, 'botella')

    const linea = {
      uid: uid(), producto_externo_id: varId, vino_id: vino.id,
      formato_venta: 'botella', estado_mapeo: 'activo',
      nombre_producto: '__test_cero', cantidad: 0,
      precio_unitario_bruto: 0, descuento_unitario: 0, importe_bruto_iva: 0,
    }
    const r = await registrar(pid, [linea])
    assert.equal(r[0].status, 'cantidad_cero', 'Cero → cola con tipo_incidencia cantidad_cero')
    console.log('T5 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T6 — registrar_ventas_tpv: mapeo_invalido (copa sin por_copa)', async () => {
  const pid   = `pay_t6_${Date.now()}`
  const varId = `var_t6_${Date.now()}`
  let vino

  try {
    // vino con por_copa=false pero mapeado como copa
    vino = await crearVinoTest({ por_copa: false })
    await crearMapeo(varId, vino.id, 'copa')

    const linea = {
      uid: uid(), producto_externo_id: varId, vino_id: vino.id,
      formato_venta: 'copa', estado_mapeo: 'activo',
      nombre_producto: '__test_copa_invalida', cantidad: 1,
      precio_unitario_bruto: 4, descuento_unitario: 0, importe_bruto_iva: 4,
    }
    const r = await registrar(pid, [linea])
    assert.equal(r[0].status, 'mapeo_invalido', 'Copa en vino sin por_copa → mapeo_invalido')
    console.log('T6 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T7 — registrar_ventas_tpv: venta botella válida → ok + movimiento', async () => {
  const pid   = `pay_t7_${Date.now()}`
  const varId = `var_t7_${Date.now()}`
  let vino
  let lineUid

  try {
    vino = await crearVinoTest({ stock: 5 })
    await crearMapeo(varId, vino.id, 'botella')
    lineUid = uid()

    const linea = {
      uid: lineUid, producto_externo_id: varId, vino_id: vino.id,
      formato_venta: 'botella', estado_mapeo: 'activo',
      nombre_producto: '__test_botella', cantidad: 2,
      precio_unitario_bruto: 15, descuento_unitario: 0, importe_bruto_iva: 30,
    }
    const r = await registrar(pid, [linea])
    assert.equal(r[0].status, 'ok', 'Botella válida → ok')

    const { data: mov } = await db
      .from('movimientos_stock')
      .select('cantidad, referencia_externa, afecto_stock')
      .eq('restaurante_id', RESTAURANTE_ID)
      .like('referencia_externa', `square_${pid}%`)
      .single()
    assert.ok(mov, 'Movimiento creado en BD')
    assert.equal(mov.referencia_externa, `square_${pid}_${lineUid}`)
    console.log('T7 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T8 — registrar_ventas_tpv: venta copa válida → ok + movimiento', async () => {
  const pid   = `pay_t8_${Date.now()}`
  const varId = `var_t8_${Date.now()}`
  let vino

  try {
    vino = await crearVinoTest({ por_copa: true })
    await crearMapeo(varId, vino.id, 'copa')

    const linea = {
      uid: uid(), producto_externo_id: varId, vino_id: vino.id,
      formato_venta: 'copa', estado_mapeo: 'activo',
      nombre_producto: '__test_copa', cantidad: 2,
      precio_unitario_bruto: 4, descuento_unitario: 0, importe_bruto_iva: 8,
    }
    const r = await registrar(pid, [linea])
    assert.equal(r[0].status, 'ok', 'Copa válida → ok')
    console.log('T8 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T9 — registrar_ventas_tpv: array vacío → [] sin error', async () => {
  const pid = `pay_t9_${Date.now()}`
  try {
    const r = await registrar(pid, [])
    assert.deepEqual(r, [], 'Array vacío → []')
    console.log('T9 ✓')
  } finally {
    await limpiar({ payment_ids: [pid] })
  }
})

describe('T10 — asignar_lineas_tpv: asignar cola → ok', async () => {
  const pid   = `pay_t10_${Date.now()}`
  const varId = `var_t10_${Date.now()}`
  let vino

  try {
    vino = await crearVinoTest({ stock: 5 })
    // Meter una línea en cola (sin mapeo)
    await db.from('tpv_lineas_sin_asignar').insert({
      restaurante_id:     RESTAURANTE_ID,
      fuente:             'square',
      referencia_ticket:  pid,
      referencia_linea:   uid(),
      nombre_producto:    '__test_asignar',
      producto_externo_id: varId,
      cantidad:           1,
      precio_unitario:    12,
      descuento_unitario: 0,
      importe_bruto_iva:  12,
      fecha:              new Date().toISOString(),
      estado:             'pendiente',
      tipo_incidencia:    'sin_mapeo',
    })

    const r = await asignarLineas({
      producto_externo_id: varId,
      vino_id:             vino.id,
      formato_venta:       'botella',
      accion:              'asignar',
    })
    assert.ok(r.procesadas >= 1, 'Al menos una línea procesada')
    assert.equal(r.pendientes_restantes, 0, 'Cola vaciada')
    console.log('T10 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T11 — asignar_lineas_tpv: ignorar producto', async () => {
  const pid   = `pay_t11_${Date.now()}`
  const varId = `var_t11_${Date.now()}`

  try {
    await db.from('tpv_lineas_sin_asignar').insert({
      restaurante_id:     RESTAURANTE_ID,
      fuente:             'square',
      referencia_ticket:  pid,
      referencia_linea:   uid(),
      nombre_producto:    '__test_ignorar',
      producto_externo_id: varId,
      cantidad:           3,
      precio_unitario:    5,
      descuento_unitario: 0,
      importe_bruto_iva:  15,
      fecha:              new Date().toISOString(),
      estado:             'pendiente',
      tipo_incidencia:    'sin_mapeo',
    })

    const r = await asignarLineas({ producto_externo_id: varId, accion: 'ignorar' })
    assert.ok(r.procesadas >= 1, 'Línea descartada')
    assert.equal(r.pendientes_restantes, 0)
    console.log('T11 ✓')
  } finally {
    await limpiar({ payment_ids: [pid], producto_ids: [varId] })
  }
})

describe('T12 — asignar_lineas_tpv: descartar_linea individual', async () => {
  const pid     = `pay_t12_${Date.now()}`
  const lineUid = uid()
  let lineaId

  try {
    const { data } = await db
      .from('tpv_lineas_sin_asignar')
      .insert({
        restaurante_id:     RESTAURANTE_ID,
        fuente:             'square',
        referencia_ticket:  pid,
        referencia_linea:   lineUid,
        nombre_producto:    '__test_descartar',
        producto_externo_id: `var_t12_${Date.now()}`,
        cantidad:           0,
        precio_unitario:    0,
        descuento_unitario: 0,
        importe_bruto_iva:  0,
        fecha:              new Date().toISOString(),
        estado:             'pendiente',
        tipo_incidencia:    'cantidad_cero',
      })
      .select('id')
      .single()
    lineaId = data.id

    const r = await asignarLineas({ accion: 'descartar_linea', linea_id: lineaId })
    assert.equal(r.procesadas, 1, 'Una línea descartada')
    assert.equal(r.lineas[0].status, 'descartada')
    console.log('T12 ✓')
  } finally {
    await limpiar({ payment_ids: [pid] })
  }
})

describe('T13 — asignar_lineas_tpv: no_asignables no bloquea cola', async () => {
  const pid     = `pay_t13_${Date.now()}`
  const varId   = `var_t13_${Date.now()}`
  let vino

  try {
    vino = await crearVinoTest({ stock: 10 })

    // 2 líneas con cantidad cero (no asignables)
    const lineasMalas = [uid(), uid()]
    for (const lineUid of lineasMalas) {
      await db.from('tpv_lineas_sin_asignar').insert({
        restaurante_id:     RESTAURANTE_ID,
        fuente:             'square',
        referencia_ticket:  pid,
        referencia_linea:   lineUid,
        nombre_producto:    '__test_bloqueo',
        producto_externo_id: varId,
        cantidad:           0,
        precio_unitario:    0,
        descuento_unitario: 0,
        importe_bruto_iva:  0,
        fecha:              new Date().toISOString(),
        estado:             'pendiente',
        tipo_incidencia:    'cantidad_cero',
      })
    }

    // 1 línea asignable
    await db.from('tpv_lineas_sin_asignar').insert({
      restaurante_id:     RESTAURANTE_ID,
      fuente:             'square',
      referencia_ticket:  pid,
      referencia_linea:   uid(),
      nombre_producto:    '__test_buena',
      producto_externo_id: varId,
      cantidad:           1,
      precio_unitario:    12,
      descuento_unitario: 0,
      importe_bruto_iva:  12,
      fecha:              new Date().toISOString(),
      estado:             'pendiente',
      tipo_incidencia:    'sin_mapeo',
    })

    const r = await asignarLineas({
      producto_externo_id: varId,
      vino_id:             vino.id,
      formato_venta:       'botella',
      accion:              'asignar',
    })

    assert.equal(r.procesadas, 1, 'Línea buena procesada a pesar de las malas')
    assert.equal(r.no_asignables, 2, '2 no_asignables reportadas')
    assert.equal(r.pendientes_restantes, 0, 'Cola asignable vaciada')
    console.log('T13 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

describe('T14 — 201 no_asignables + 1 asignable: se procesa en 1 llamada, sin bucle', async () => {
  const pid   = `pay_t14_${Date.now()}`
  const varId = `var_t14_${Date.now()}`
  let vino

  try {
    vino = await crearVinoTest({ stock: 10 })

    // 201 líneas con cantidad=0 (no asignables — superan el LIMIT 200 del loop pero
    // el filtro las excluye, así que no bloquean la cola ni causan bucle infinito)
    const malas = Array.from({ length: 201 }, (_, i) => ({
      restaurante_id:     RESTAURANTE_ID,
      fuente:             'square',
      referencia_ticket:  pid,
      referencia_linea:   `${uid()}_bad${i}`,
      nombre_producto:    '__test_mala',
      producto_externo_id: varId,
      cantidad:           0,
      precio_unitario:    0,
      descuento_unitario: 0,
      importe_bruto_iva:  0,
      fecha:              new Date().toISOString(),
      estado:             'pendiente',
      tipo_incidencia:    'cantidad_cero',
    }))
    const { error: insErr } = await db.from('tpv_lineas_sin_asignar').insert(malas)
    if (insErr) throw new Error(`Insert malas T14: ${insErr.message}`)

    // 1 línea asignable (cantidad entera > 0)
    await db.from('tpv_lineas_sin_asignar').insert({
      restaurante_id:     RESTAURANTE_ID,
      fuente:             'square',
      referencia_ticket:  pid,
      referencia_linea:   uid(),
      nombre_producto:    '__test_buena',
      producto_externo_id: varId,
      cantidad:           1,
      precio_unitario:    12,
      descuento_unitario: 0,
      importe_bruto_iva:  12,
      fecha:              new Date().toISOString(),
      estado:             'pendiente',
      tipo_incidencia:    'sin_mapeo',
    })

    // Una sola llamada al RPC (pendientes_restantes=0 → la ruta no entra en bucle)
    const r = await asignarLineas({
      producto_externo_id: varId,
      vino_id:             vino.id,
      formato_venta:       'botella',
      accion:              'asignar',
    })

    assert.equal(r.procesadas, 1, 'La única línea asignable se procesa')
    assert.equal(r.no_asignables, 201, '201 no_asignables reportadas')
    assert.equal(r.pendientes_restantes, 0, 'Cola asignable vaciada: la ruta sale del bucle en la 1ª iteración')
    console.log('T14 ✓')
  } finally {
    await limpiar({ vinos: vino ? [vino] : [], producto_ids: [varId], payment_ids: [pid] })
  }
})

after(async () => {
  const { data: mapRows } = await db
    .from('tpv_vino_map')
    .select('producto_externo_id')
    .eq('restaurante_id', RESTAURANTE_ID)
    .like('producto_externo_id', 'var_t%')

  const { data: colaRows } = await db
    .from('tpv_lineas_sin_asignar')
    .select('producto_externo_id')
    .eq('restaurante_id', RESTAURANTE_ID)
    .like('producto_externo_id', 'var_t%')

  assert.equal(
    mapRows?.length ?? 0, 0,
    `tpv_vino_map: ${mapRows?.length ?? 0} fila(s) residual(es) con var_t*`
  )
  assert.equal(
    colaRows?.length ?? 0, 0,
    `tpv_lineas_sin_asignar: ${colaRows?.length ?? 0} fila(s) residual(es) con var_t*`
  )
  console.log('Check limpieza ✓')
})

console.log('\nTodos los tests B8a completados.')
