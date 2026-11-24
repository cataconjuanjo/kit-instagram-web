// Tests del helper resolverPcv (bloque C1):
//   - Alta nueva: INSERT + enlace a oferta.
//   - Reimport idempotente: UPDATE que respeta campos de usuario.
//   - Cambio de precio: coste_estimado se actualiza.
//   - Match por claveDura sin referencia: UPDATE y rellena referencia.
//   - Dos pases consecutivos: sin duplicar filas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here    = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { resolverPcv } = require(resolve(here, '..', 'lib', 'upsertPcv.js'))

// ── Mock mínimo de supabase-js ───────────────────────────────────────────────
//
// Soporta exactamente lo que resolverPcv llama:
//   .from(t).select(cols).eq(c,v).eq(c,v).maybeSingle()
//   .from(t).select(cols).eq(c,v)                        (sin maybeSingle)
//   .from(t).insert(obj).select(cols).single()
//   .from(t).update(obj).eq(c,v).select(cols).single()
// Las tablas se guardan en un Map<string, Array<row>>.

function crearSupabaseMock(seed = {}) {
  const store = new Map()
  for (const [tabla, filas] of Object.entries(seed)) {
    store.set(tabla, filas.map(f => ({ ...f })))
  }
  let autoId = 1
  function nuevoId() { return `pcv-mock-${autoId++}` }

  function builder(tabla) {
    let filtros = []
    let modo = null   // 'select' | 'insert' | 'update'
    let payload = null

    const chain = {
      select() { return chain },
      eq(col, val) { filtros.push({ col, val }); return chain },
      _match() {
        const arr = store.get(tabla) || []
        return arr.filter(f => filtros.every(({ col, val }) => String(f[col]) === String(val)))
      },
      async maybeSingle() {
        if (modo === 'insert' || modo === 'update') return _runWrite(true)
        const m = chain._match()
        return { data: m[0] || null, error: null }
      },
      async single() {
        if (modo === 'insert' || modo === 'update') return _runWrite(true)
        const m = chain._match()
        if (!m.length) return { data: null, error: new Error('no rows') }
        return { data: m[0], error: null }
      },
      then(onFulfilled, onRejected) {
        // Si se hace await directo sobre un select().eq(), devuelve array.
        return Promise.resolve({ data: chain._match(), error: null }).then(onFulfilled, onRejected)
      },
      insert(obj) {
        modo = 'insert'
        payload = Array.isArray(obj) ? obj : [obj]
        return chain
      },
      update(obj) {
        modo = 'update'
        payload = obj
        return chain
      },
    }

    function _runWrite(singleWanted) {
      const arr = store.get(tabla) || []
      if (!store.has(tabla)) store.set(tabla, arr)
      if (modo === 'insert') {
        const inserted = payload.map(r => ({ id: r.id || nuevoId(), ...r }))
        arr.push(...inserted)
        return Promise.resolve({ data: singleWanted ? inserted[0] : inserted, error: null })
      }
      // update
      const actualizados = []
      for (const f of arr) {
        if (filtros.every(({ col, val }) => String(f[col]) === String(val))) {
          Object.assign(f, payload)
          actualizados.push(f)
        }
      }
      return Promise.resolve({
        data: singleWanted ? (actualizados[0] || null) : actualizados,
        error: actualizados.length || modo !== 'update' ? null : null,
      })
    }

    return chain
  }

  return {
    from(tabla) { return builder(tabla) },
    _debugStore: store,
  }
}

function claveDuraMatcher({ nombre, bodega, formatoMl, anada }) {
  return {
    _n: norm(nombre),
    _b: norm(bodega || ''),
    _ml: formatoMl,
    _a: anada,
    matches(row) {
      const rml = row.formato === '750 ml' ? 750 : (row.formato === '1500 ml' ? 1500 : row.formato_ml || null)
      const ra  = row.anada ? parseInt(row.anada, 10) : null
      return norm(row.nombre) === this._n
        && norm(row.bodega || '') === this._b
        && rml === this._ml
        && (ra ?? null) === (this._a ?? null)
    },
  }
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

// ── Pruebas ─────────────────────────────────────────────────────────────────

test('alta nueva: no existe pcv → INSERT', async () => {
  const sb = crearSupabaseMock({ proveedor_catalogo_vinos: [] })
  const res = await resolverPcv({
    supabase: sb,
    proveedor_id: 'prov-1',
    codigo_articulo: 'COD-001',
    claveDura: claveDuraMatcher({ nombre: 'Vino Alfa', bodega: 'Bodega Uno', formatoMl: 750, anada: 2022 }),
    datosInsert: {
      nombre: 'Vino Alfa', bodega: 'Bodega Uno', formato: '750 ml',
      anada: '2022', coste_estimado: 12.50, activo: true,
    },
    datosUpdate: {
      coste_estimado: 12.50, anada: '2022', formato: '750 ml', activo: true,
    },
  })
  assert.equal(res.accion, 'insert')
  const rows = sb._debugStore.get('proveedor_catalogo_vinos')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].referencia, 'COD-001')
  assert.equal(rows[0].proveedor_id, 'prov-1')
  assert.equal(rows[0].coste_estimado, 12.50)
})

test('reimport idempotente: ya existe por referencia → UPDATE sin pisar favorito/notas/pvp', async () => {
  const sb = crearSupabaseMock({
    proveedor_catalogo_vinos: [{
      id: 'pcv-1', proveedor_id: 'prov-1', referencia: 'COD-001',
      nombre: 'Vino Alfa', bodega: 'Bodega Uno', formato: '750 ml', anada: '2022',
      coste_estimado: 12.50,
      favorito: true, notas: 'nota del usuario', pvp_recomendado: 32, pvp_copa: 4.5,
    }],
  })
  const res = await resolverPcv({
    supabase: sb,
    proveedor_id: 'prov-1',
    codigo_articulo: 'COD-001',
    claveDura: null,
    datosInsert: { nombre: 'Vino Alfa', coste_estimado: 12.50 },
    datosUpdate: {
      coste_estimado: 12.50, anada: '2022', formato: '750 ml', activo: true,
      // El caller podría incluirlos; el helper los debe descartar:
      favorito: false, notas: 'borrado', pvp_recomendado: 0, pvp_copa: 0,
    },
  })
  assert.equal(res.accion, 'update')
  const [row] = sb._debugStore.get('proveedor_catalogo_vinos')
  assert.equal(row.favorito, true, 'favorito debe conservarse')
  assert.equal(row.notas, 'nota del usuario')
  assert.equal(row.pvp_recomendado, 32)
  assert.equal(row.pvp_copa, 4.5)
})

test('cambio de precio: coste_estimado se actualiza', async () => {
  const sb = crearSupabaseMock({
    proveedor_catalogo_vinos: [{
      id: 'pcv-1', proveedor_id: 'prov-1', referencia: 'COD-002',
      nombre: 'Vino Beta', bodega: 'Bodega Dos', formato: '750 ml', anada: '2021',
      coste_estimado: 20.00,
    }],
  })
  const res = await resolverPcv({
    supabase: sb,
    proveedor_id: 'prov-1',
    codigo_articulo: 'COD-002',
    claveDura: null,
    datosInsert: { nombre: 'Vino Beta' },
    datosUpdate: { coste_estimado: 22.75, activo: true },
  })
  assert.equal(res.accion, 'update')
  const [row] = sb._debugStore.get('proveedor_catalogo_vinos')
  assert.equal(row.coste_estimado, 22.75)
})

test('match por claveDura sin referencia previa: UPDATE + rellena referencia', async () => {
  const sb = crearSupabaseMock({
    proveedor_catalogo_vinos: [{
      id: 'pcv-7', proveedor_id: 'prov-1', referencia: null,
      nombre: 'Vino Gamma', bodega: 'Bodega Tres', formato: '750 ml', anada: '2020',
      coste_estimado: 18.00,
    }],
  })
  const res = await resolverPcv({
    supabase: sb,
    proveedor_id: 'prov-1',
    codigo_articulo: 'COD-003',
    claveDura: claveDuraMatcher({ nombre: 'Vino Gamma', bodega: 'Bodega Tres', formatoMl: 750, anada: 2020 }),
    datosInsert: { nombre: 'Vino Gamma' },
    datosUpdate: { coste_estimado: 19.00, activo: true },
  })
  assert.equal(res.accion, 'update')
  const [row] = sb._debugStore.get('proveedor_catalogo_vinos')
  assert.equal(row.referencia, 'COD-003')
  assert.equal(row.coste_estimado, 19.00)
})

test('no duplicación: dos pases consecutivos mantienen la misma fila', async () => {
  const sb = crearSupabaseMock({ proveedor_catalogo_vinos: [] })
  const input = {
    supabase: sb,
    proveedor_id: 'prov-1',
    codigo_articulo: 'COD-999',
    claveDura: claveDuraMatcher({ nombre: 'Vino Delta', bodega: 'Casa Marisma', formatoMl: 750, anada: 2019 }),
    datosInsert: { nombre: 'Vino Delta', bodega: 'Casa Marisma', formato: '750 ml', anada: '2019', coste_estimado: 15 },
    datosUpdate: { coste_estimado: 15, activo: true },
  }
  const r1 = await resolverPcv(input)
  const r2 = await resolverPcv(input)
  assert.equal(r1.accion, 'insert')
  assert.equal(r2.accion, 'update')
  assert.equal(sb._debugStore.get('proveedor_catalogo_vinos').length, 1)
})

test('vino_id no se pisa en update si ya existía', async () => {
  const sb = crearSupabaseMock({
    proveedor_catalogo_vinos: [{
      id: 'pcv-5', proveedor_id: 'prov-1', referencia: 'COD-5',
      nombre: 'Vino Epsilon', bodega: 'Casa Marisma', formato: '750 ml', anada: '2018',
      vino_id: 'vino-canon-xyz',
    }],
  })
  await resolverPcv({
    supabase: sb,
    proveedor_id: 'prov-1',
    codigo_articulo: 'COD-5',
    claveDura: null,
    datosInsert: { nombre: 'Vino Epsilon' },
    datosUpdate: { coste_estimado: 10, vino_id: 'otro-vino-mal' },
  })
  const [row] = sb._debugStore.get('proveedor_catalogo_vinos')
  assert.equal(row.vino_id, 'vino-canon-xyz', 'vino_id previo debe conservarse')
})
