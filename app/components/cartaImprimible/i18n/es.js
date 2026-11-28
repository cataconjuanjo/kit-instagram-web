// Diccionario de la Carta Imprimible. Fuente única en español para que en
// F3 podamos añadir `en.js` y `fr.js` sin volver a cazar strings sueltas.
//
// Reglas:
//   - Mantener claves estables y descriptivas.
//   - NUNCA interpolar HTML aquí; valores literales listos para usar.
//   - Si una clave no existe, `t()` devuelve la propia clave (fallback
//     visible en dev) para detectar textos sin traducir.
export const ES = {
  // Pie / nota legal
  'pdf.nota.iva':              'Precios en euros, IVA incluido',

  // Sección por copa (añadida al agrupar vinos con copa_modo='seccion'|'ambos')
  'pdf.seccion.copa':          'Por copa',

  // QR de la carta (default cuando el restaurante no personaliza el texto)
  'pdf.qr.cta_default':        'Maridajes y fichas · escanea',

  // Etiquetas de precio (para futuras plantillas que las muestren)
  'pdf.precio.botella':        'Botella',
  'pdf.precio.copa':           'Copa',

  // Accesibilidad
  'pdf.aria.carta':            'Carta de vinos imprimible',
}

export default ES
