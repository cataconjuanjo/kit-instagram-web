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

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id   = searchParams.get('restaurante_id')
    const anio             = parseInt(searchParams.get('anio') || String(new Date().getFullYear()), 10)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { meses, cierresMap, historicoMap, presupuestoMap } = await cargarAgregadoLibro(
      supabaseAdmin, { restaurante_id, anio, includeExtras: true }
    )

    const serie = meses.map(m => {
      const snap  = cierresMap[m.mes] || {}
      const hist  = historicoMap[m.mes] || null
      const pres  = presupuestoMap[m.mes] || null

      // ventas_neto: cierre > historico > 0
      const ventas_neto = Number.isFinite(Number(snap.ventas_neto))
        ? r2(snap.ventas_neto)
        : (hist ? r2(hist.ingresos) : 0)

      // consumo_mp (contable BI+compras−EI): histórico es la fuente de verdad
      const consumo_mp = hist ? r2(hist.consumo_mp) : null

      // coste teórico de ventas: cierre > libro.totales.coste_teorico_ventas
      const coste_teorico = Number.isFinite(Number(snap.coste_ventas_teorico))
        ? r2(snap.coste_ventas_teorico)
        : r2(m.totales.coste_teorico_ventas)

      const cogs_pct = ventas_neto > 0 ? r2(coste_teorico / ventas_neto * 100) : null

      const resultado = Number.isFinite(Number(snap.resultado)) ? r2(snap.resultado) : null

      // Merma implícita del libro: diferencia_consumo = consumo_real_stock − coste_teorico
      const merma_implicita = r2(m.totales.diferencia_consumo)

      const objetivo_mp_pct = pres && Number.isFinite(Number(pres.objetivo_mp_pct))
        ? r2(pres.objetivo_mp_pct) : null
      const objetivo_facturacion = pres && Number.isFinite(Number(pres.objetivo_facturacion))
        ? r2(pres.objetivo_facturacion) : null

      return {
        mes:              m.mes,
        estado:           m.estado,
        ventas_neto,
        consumo_mp,
        coste_teorico,
        cogs_pct,
        objetivo_mp_pct,
        objetivo_facturacion,
        resultado,
        merma_implicita,
      }
    })

    return Response.json({ anio, meses: serie })
  } catch (e) {
    console.error('graficos-somm GET:', e)
    return Response.json({ error: 'Error interno al cargar los gráficos' }, { status: 500 })
  }
}
