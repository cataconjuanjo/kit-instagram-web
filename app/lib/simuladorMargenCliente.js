'use client'

/**
 * Cliente (navegador) para el simulador de margen de bodega:
 *   - cargarSupuestos / guardarSupuestos: persistencia en
 *     `simulador_margen_bodega` (una fila por restaurante).
 *   - Degradación con aviso si la tabla no existe (PGRST205 /
 *     42P01 / schema cache), usando el helper canónico
 *     `esRelacionInexistente` del módulo de eventos de bodega.
 *
 * No incluye lógica de cálculo (está en app/lib/simuladorMargen.js,
 * importable también desde el servidor y los tests).
 */

import { supabase } from '../supabase'
import { esRelacionInexistente } from './eventosBodega'
// Fase E-2: `limpiarSupuestos` vive ahora en el lib puro (sin 'use
// client') para que los tests puedan importarlo sin arrastrar supabase.
// Se re-exporta aquí para mantener la API pública del cliente.
import { limpiarSupuestos as _limpiar } from './simuladorMargen'
export const limpiarSupuestos = _limpiar

/**
 * Lee los supuestos del restaurante. Devuelve:
 *   { supuestos: {...}, falta_tabla: boolean, error: null | Error }
 *
 * - Si la tabla no existe en el schema cache → { supuestos: {},
 *   falta_tabla: true }. La UI avisa al usuario y sigue funcionando.
 * - Si la tabla existe y no hay fila → supuestos vacíos sin error.
 * - Cualquier otro error (RLS, red) se propaga en `error`.
 */
export async function cargarSupuestos(restauranteId) {
  if (!restauranteId) {
    return { supuestos: {}, falta_tabla: false, error: null }
  }
  const { data, error } = await supabase
    .from('simulador_margen_bodega')
    .select('supuestos')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()
  if (error) {
    if (esRelacionInexistente(error)) {
      return { supuestos: {}, falta_tabla: true, error: null }
    }
    return { supuestos: {}, falta_tabla: false, error }
  }
  return { supuestos: data?.supuestos || {}, falta_tabla: false, error: null }
}

/**
 * Upsert de supuestos. Devuelve:
 *   { ok: boolean, falta_tabla: boolean, error: null | Error }
 *
 * Normaliza entrada: null / '' / undefined → se omiten (no se
 * sobrescribe con cadenas vacías). Números finitos se guardan tal
 * cual; strings con coma decimal se convierten vía num().
 */
export async function guardarSupuestos(restauranteId, supuestos) {
  if (!restauranteId) {
    return { ok: false, falta_tabla: false, error: new Error('restauranteId requerido') }
  }
  const limpios = limpiarSupuestos(supuestos)
  const { error } = await supabase
    .from('simulador_margen_bodega')
    .upsert({
      restaurante_id: restauranteId,
      supuestos: limpios,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'restaurante_id' })
  if (error) {
    if (esRelacionInexistente(error)) {
      return { ok: false, falta_tabla: true, error: null }
    }
    return { ok: false, falta_tabla: false, error }
  }
  return { ok: true, falta_tabla: false, error: null }
}

