// Mini i18n para la Carta Imprimible. En F1 solo hay español; en F3 se
// añadirán otros idiomas y `t(clave, 'en')`. La API se mantiene estable:
//   t('pdf.seccion.copa')        → 'Por copa'
//   t('clave.que.no.existe')     → 'clave.que.no.existe'  (fallback)
import ES from './es.js'

const DICCIONARIOS = { es: ES }
const IDIOMA_PREDETERMINADO = 'es'

export function t(clave, idioma = IDIOMA_PREDETERMINADO) {
  const dicc = DICCIONARIOS[idioma] || DICCIONARIOS[IDIOMA_PREDETERMINADO]
  if (dicc && Object.prototype.hasOwnProperty.call(dicc, clave)) return dicc[clave]
  return clave
}

export { ES }
export default t
