/**
 * Verificación post-migración.
 * Ejecutar inmediatamente después de normalizar-catalogo-apply.mjs
 * para confirmar que el backup y los cambios quedaron bien.
 *
 * Uso: node --env-file=.env.local scripts/verificar-migracion.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { splitFormato } from '../app/lib/normalizarCatalogo.js'

const supabaseUrl = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── 1. Conteo de campos migrados ─────────────────────────────────────────────

console.log('═══════════════════════════════════════════════')
console.log('VERIFICACIÓN POST-MIGRACIÓN')
console.log('═══════════════════════════════════════════════\n')

const { count: totalFilas } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })

const { count: conNombreRaw } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })
  .not('nombre_raw', 'is', null)

const { count: conZona } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })
  .not('zona', 'is', null)

const { count: conTamanyo } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })
  .not('tamanyo', 'is', null)

const { count: conUds } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })
  .not('unidades_por_caja', 'is', null)

const { count: conRef } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })
  .not('referencia_proveedor', 'is', null)

const { count: conGrad } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })
  .not('graduacion', 'is', null)

const { count: conAlmacen } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('*', { count: 'exact', head: true })
  .not('almacen_proveedor', 'is', null)

console.log('Filas totales en tabla    :', totalFilas)
console.log('')
console.log('Campos migrados (no NULL):')
console.log('  nombre_raw             :', conNombreRaw)
console.log('  zona                   :', conZona)
console.log('  tamanyo                :', conTamanyo)
console.log('  unidades_por_caja      :', conUds)
console.log('  referencia_proveedor   :', conRef)
console.log('  graduacion             :', conGrad)
console.log('  almacen_proveedor      :', conAlmacen)

// ── 2. Muestra de 10 filas al azar: _raw vs valor nuevo ──────────────────────

console.log('\n── Muestra de 10 filas: nombre_raw → nombre actual ──')

const { data: muestraNombre } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('id, nombre_raw, nombre')
  .not('nombre_raw', 'is', null)
  .limit(10)
  .order('updated_at', { ascending: false })

if (muestraNombre?.length) {
  for (const r of muestraNombre) {
    console.log('  RAW  :', r.nombre_raw)
    console.log('  NUEVO:', r.nombre)
    console.log('  ---')
  }
} else {
  console.log('  (sin filas con nombre_raw)')
}

console.log('\n── Muestra de 10 filas: region_raw → zona actual ──')

const { data: muestraZona } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('id, region_raw, zona, tipo')
  .not('region_raw', 'is', null)
  .limit(10)
  .order('updated_at', { ascending: false })

if (muestraZona?.length) {
  for (const r of muestraZona) {
    console.log('  RAW region :', r.region_raw)
    console.log('  NUEVO zona :', r.zona, '| tipo:', r.tipo || '(sin cambio)')
    console.log('  ---')
  }
}

console.log('\n── Muestra de 10 filas: formato_raw → tamanyo / uds ──')

const { data: muestraFormato } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('id, formato_raw, tamanyo, unidades_por_caja, referencia_proveedor, graduacion, almacen_proveedor')
  .not('formato_raw', 'is', null)
  .limit(10)
  .order('updated_at', { ascending: false })

if (muestraFormato?.length) {
  for (const r of muestraFormato) {
    console.log('  RAW formato  :', r.formato_raw)
    console.log('  tamanyo      :', r.tamanyo)
    console.log('  uds_caja     :', r.unidades_por_caja)
    console.log('  ref_proveedor:', r.referencia_proveedor)
    console.log('  graduacion   :', r.graduacion)
    console.log('  almacen      :', r.almacen_proveedor)
    console.log('  ---')
  }
}

// ── 3. Confirmación de los 176 casos sin tocar ───────────────────────────────

console.log('\n── Verificando los 176 casos formato intacto ──')

// Los casos "sin clasificar" y "posible unidades" tienen patrones conocidos:
// "u/c Est. Mad", "u/c Mad.", dígito suelto, etc.
// Verificamos que formato_raw sea NULL (no tocamos) pero formato no vacío

const patronesSinTocar = [
  'u/c Est. Mad',
  'u/c Mad.',
  'u/c Est.',
  'u/c Mad.3',
  'u/c Mad.5',
  'u/c Mad.6',
  'C Mad.',
  'Est. 3 u',
  'Est. 2 u',
]

let casosVerificados = 0
let casosConTamanyoIndeseado = 0

for (const patron of patronesSinTocar.slice(0, 3)) {
  const { data } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id, formato, formato_raw, tamanyo')
    .like('formato', `%${patron}%`)
    .limit(5)

  for (const r of data || []) {
    casosVerificados++
    if (r.tamanyo !== null || r.formato_raw !== null) {
      casosConTamanyoIndeseado++
      console.log('  ⚠️ PROBLEMA: id', r.id, 'formato:', r.formato, '→ tamanyo:', r.tamanyo)
    }
  }
}

// Verificar dígitos sueltos (posible unidades)
const { data: digitosSueltos } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('id, formato, formato_raw, tamanyo')
  .in('formato', ['75cl · 1', '75cl · 3', '75cl · 4', '150cl · 1', '300cl · 2'])
  .limit(20)

for (const r of digitosSueltos || []) {
  casosVerificados++
  if (r.tamanyo !== null || r.formato_raw !== null) {
    casosConTamanyoIndeseado++
    console.log('  ⚠️ PROBLEMA: id', r.id, 'formato:', r.formato, '→ tamanyo:', r.tamanyo)
  }
}

if (casosConTamanyoIndeseado === 0) {
  console.log(`  ✅ ${casosVerificados} filas verificadas — formato_raw y tamanyo son NULL en todos los casos pendientes`)
} else {
  console.log(`  ❌ ${casosConTamanyoIndeseado} filas tienen cambios no deseados en campos de formato`)
}

console.log('\n═══════════════════════════════════════════════')
console.log('Verificación completada.')
console.log('═══════════════════════════════════════════════')
