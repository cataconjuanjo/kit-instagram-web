/**
 * GET /api/graficos-somm?restaurante_id=&anio=YYYY[&comparar_con=YYYY]
 *
 * Devuelve agregación por mes para los gráficos del perfil Somm:
 *   - ventas_neto      (cierre si existe, histórico fallback)
 *   - consumo_mp       (histórico_mensual: fórmula contable BI+compras−EI)
 *   - coste_teorico    (cierre.coste_ventas_teorico o reconstruido del libro)
 *   - cogs_pct         (coste_teorico / ventas_neto × 100)
 *   - objetivo_mp_pct  (presupuesto_mensual)
 *   - resultado        (cierre.resultado)
 *   - merma_implicita  (totales.diferencia_consumo del libro)
 *   - estado           ('cerrado' | 'estimado')
 *
 * Si se pasa comparar_con=YYYY (entero 2000..anio-1), añade:
 *   - comparar_con:  entero
 *   - mesesPrev:     misma agregación del año comparado
 *   - comparables:   array de meses numéricos cerrados en ambos años
 *                    (excluye el mes en curso del año actual)
 *
 * Reutiliza las fórmulas de app/lib/libroBodega.js vía libroBodegaServer.
 * Error genérico al cliente, log en servidor.
 */

import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { cargarAgregadoLibro } from '../../lib/libroBodegaServer'
import { agregarGraficosSomm } from '../../lib/graficosSommAgregacion'
import { parsearComparar, calcularComparables } from '../../lib/graficosSommYoY'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id   = searchParams.get('restaurante_id')
    const anio             = parseInt(searchParams.get('anio') || String(new Date().getFullYear()), 10)
    const compararRaw      = searchParams.get('comparar_con')

    // Validación de comparar_con antes del auth: si está mal formado,
    // 400 con error genérico. Si no se pasa, undefined → modo clásico.
    let comparar_con
    try {
      comparar_con = parsearComparar(compararRaw, anio)
    } catch {
      return Response.json({ error: 'Parámetro comparar_con inválido' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    // Año actual (siempre)
    const ctx    = await cargarAgregadoLibro(
      supabaseAdmin, { restaurante_id, anio, includeExtras: true }
    )
    const serie  = agregarGraficosSomm(ctx)

    if (comparar_con == null) {
      // Modo clásico: forma de la respuesta IDÉNTICA a la de antes
      return Response.json({ anio, meses: serie })
    }

    // Modo YoY: cargar también el año a comparar
    const ctxPrev   = await cargarAgregadoLibro(
      supabaseAdmin, { restaurante_id, anio: comparar_con, includeExtras: true }
    )
    const seriePrev   = agregarGraficosSomm(ctxPrev)
    const comparables = calcularComparables(serie, seriePrev)

    return Response.json({
      anio,
      meses:         serie,
      comparar_con,
      mesesPrev:     seriePrev,
      comparables,
    })
  } catch (e) {
    console.error('graficos-somm GET:', e)
    return Response.json({ error: 'Error interno al cargar los gráficos' }, { status: 500 })
  }
}
