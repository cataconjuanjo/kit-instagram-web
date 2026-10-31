/**
 * Función pura de agregación mensual del endpoint /api/graficos-somm.
 *
 * Entrada: resultado de cargarAgregadoLibro + helpers:
 *   { meses, cierresMap, historicoMap, presupuestoMap }
 *
 * Salida: array de meses con las métricas finales para los gráficos.
 *
 * Regla de null: para un mes estimado sin ventas (ventas_neto === 0),
 * ventas/cogs_pct/resultado quedan en null (no son 0 reales, son
 * "aún no hay datos"). La merma implícita del libro sí se devuelve:
 * aunque sea un mes abierto, se ve bien y refleja consumo contable.
 */

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

export function agregarGraficosSomm({ meses, cierresMap, historicoMap, presupuestoMap }) {
  return (meses || []).map(m => {
    const snap = (cierresMap && cierresMap[m.mes]) || {}
    const hist = (historicoMap && historicoMap[m.mes]) || null
    const pres = (presupuestoMap && presupuestoMap[m.mes]) || null
    const estaCerrado = m.estado === 'cerrado'

    // ventas_neto: cierre > histórico > null si estimado
    let ventas_neto
    if (Number.isFinite(Number(snap.ventas_neto))) {
      ventas_neto = r2(snap.ventas_neto)
    } else if (hist && Number.isFinite(Number(hist.ingresos))) {
      ventas_neto = r2(hist.ingresos)
    } else {
      ventas_neto = estaCerrado ? 0 : null
    }

    // consumo_mp (contable): histórico es la fuente
    const consumo_mp = hist && Number.isFinite(Number(hist.consumo_mp))
      ? r2(hist.consumo_mp) : null

    // coste teórico: cierre > libro.totales
    const coste_teorico = Number.isFinite(Number(snap.coste_ventas_teorico))
      ? r2(snap.coste_ventas_teorico)
      : r2(m.totales?.coste_teorico_ventas ?? 0)

    // cogs_pct: null si sin ventas reales (no 0)
    const cogs_pct = ventas_neto && ventas_neto > 0
      ? r2(coste_teorico / ventas_neto * 100)
      : null

    // resultado: cierre lo publica; si falta y mes estimado, null
    const resultado = Number.isFinite(Number(snap.resultado))
      ? r2(snap.resultado)
      : (estaCerrado ? 0 : null)

    // Merma implícita: siempre que exista totales.diferencia_consumo
    const merma_implicita = r2(m.totales?.diferencia_consumo ?? 0)

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
}
