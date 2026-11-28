export const CONTENIDO_INICIAL = {
  loading: true,
  error: '',
  vinosActivos: 0,
  vinosConPrecio: 0,
  vinosSinPrecio: 0,
  vinosPorCopa: 0,
  platosActivos: 0,
}

export function decimalPublicacion(valor) {
  if (valor === null || valor === undefined || valor === '') return 0
  const numero = Number(String(valor).replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

export function resumirContenidoCarta(vinos = [], platos = []) {
  const vinosActivos = vinos || []
  const vinosConPrecio = vinosActivos.filter(vino => decimalPublicacion(vino.precio_botella) > 0 || decimalPublicacion(vino.precio_copa) > 0)
  const vinosPorCopa = vinosActivos.filter(vino => decimalPublicacion(vino.precio_copa) > 0)
  return {
    loading: false,
    error: '',
    vinosActivos: vinosActivos.length,
    vinosConPrecio: vinosConPrecio.length,
    vinosSinPrecio: Math.max(0, vinosActivos.length - vinosConPrecio.length),
    vinosPorCopa: vinosPorCopa.length,
    platosActivos: (platos || []).length,
  }
}

export function problemasPublicacionCarta(resumen = {}) {
  const problemas = []
  if (!Number(resumen.vinosActivos || 0)) problemas.push('La carta no tiene vinos visibles.')
  if (!Number(resumen.vinosConPrecio || 0)) problemas.push('La carta no tiene precios visibles.')
  return problemas
}

export function puedePublicarCarta(resumen = {}) {
  return problemasPublicacionCarta(resumen).length === 0
}

// ── Checklist de calidad antes de imprimir/publicar ─────────────────
// Produce avisos NO bloqueantes sobre la carta propuesta:
//   - vinos sin uva / sin DO (region) / sin añada → metadatos mejorables
//   - margen bruto por debajo del umbral → rentabilidad baja
//   - QR inactivo en las opciones → el restaurante no mide escaneos
// El único bloqueo sigue siendo "sin precio" (ya cubierto por
// problemasPublicacionCarta: el PDF imprime sin ellos).
//
// vinos: shape habitual {precio_botella, precio_copa, uva, region, anada, coste_compra?}
// opciones: carta_pdf_opciones ya normalizada (qr.activo)
// margen_objetivo: fracción decimal (ej. 0.65 = 65%). Si no se pasa, no se evalúa.
export function avisosCalidadCarta(vinos = [], opciones = null, margen_objetivo = null) {
  const activos = vinos || []
  const sinUva = activos.filter(v => !String(v?.uva || '').trim()).length
  const sinRegion = activos.filter(v => !String(v?.region || '').trim()).length
  const sinAnada = activos.filter(v => !String(v?.anada || '').trim()).length

  const avisos = []
  if (sinUva > 0)    avisos.push({ codigo: 'sin_uva',    nivel: 'aviso', texto: `${sinUva} vino${sinUva > 1 ? 's' : ''} sin uva.` })
  if (sinRegion > 0) avisos.push({ codigo: 'sin_do',     nivel: 'aviso', texto: `${sinRegion} vino${sinRegion > 1 ? 's' : ''} sin DO/región.` })
  if (sinAnada > 0)  avisos.push({ codigo: 'sin_anada',  nivel: 'aviso', texto: `${sinAnada} vino${sinAnada > 1 ? 's' : ''} sin añada.` })

  if (Number(margen_objetivo) > 0) {
    const objetivo = Number(margen_objetivo)
    const bajoMargen = activos.filter(v => {
      const coste = decimalPublicacion(v?.coste_compra)
      const pvp   = decimalPublicacion(v?.precio_botella)
      if (coste <= 0 || pvp <= 0) return false
      return (pvp - coste) / pvp < objetivo
    }).length
    if (bajoMargen > 0) {
      const pct = Math.round(objetivo * 100)
      avisos.push({ codigo: 'margen_bajo', nivel: 'aviso', texto: `${bajoMargen} vino${bajoMargen > 1 ? 's' : ''} con margen bruto por debajo del ${pct}%.` })
    }
  }

  if (opciones && opciones.qr && opciones.qr.activo === false) {
    avisos.push({ codigo: 'qr_inactivo', nivel: 'info', texto: 'El QR está desactivado en la carta PDF. No podrás medir escaneos.' })
  }

  return avisos
}

