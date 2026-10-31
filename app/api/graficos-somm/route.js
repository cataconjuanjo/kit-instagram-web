/**
 * GET /api/graficos-somm?restaurante_id=&anio=YYYY
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
 * Reutiliza las fórmulas de app/lib/libroBodega.js vía libroBodegaServer.
 * Error genérico al cliente, log en servidor.
 */

import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { cargarAgregadoLibro } from '../../lib/libroBodegaServer'
import { agregarGraficosSomm } from '../../lib/graficosSommAgregacion'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id   = searchParams.get('restaurante_id')
    const anio             = parseInt(searchParams.get('anio') || String(new Date().getFullYear()), 10)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const ctx = await cargarAgregadoLibro(
      supabaseAdmin, { restaurante_id, anio, includeExtras: true }
    )
    const serie = agregarGraficosSomm(ctx)

    return Response.json({ anio, meses: serie })
  } catch (e) {
    console.error('graficos-somm GET:', e)
    return Response.json({ error: 'Error interno al cargar los gráficos' }, { status: 500 })
  }
}
