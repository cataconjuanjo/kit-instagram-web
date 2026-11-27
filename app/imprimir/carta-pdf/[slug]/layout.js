/**
 * Layout minimal para la ruta de impresión.
 *
 * El ÚNICO objetivo de este layout es NO envolver el contenido en nada
 * que pueda interferir con @media print. En particular evita:
 *   - El shell admin (sidebar fixed, main con min-height: 100vh,
 *     overflow:hidden en varios ancestros) que causaba el bug
 *     "hoja en blanco al imprimir" en /admin/carta-pdf/[slug].
 *   - CookieConsent, GuideModeProvider y demás chrome global.
 *
 * El root layout (app/layout.js) sigue aplicando (html, body, fuentes),
 * pero ese árbol no tiene estilos problemáticos para impresión.
 */
export const dynamic = 'force-dynamic'

export default function ImprimirCartaPdfLayout({ children }) {
  return children
}
