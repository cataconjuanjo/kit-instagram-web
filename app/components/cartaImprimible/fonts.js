/**
 * Catálogo de 24 familias para la Carta PDF v2.
 *
 * Todas las fuentes se importan a nivel de módulo con next/font/google
 * (único modo soportado por Next para que descargue los .woff2 en build
 * y los sirva autoalojadas desde /_next/static/media/*.woff2). Ninguna
 * fuente entra en el bundle de otras rutas; cada restaurante sólo usa
 * dos (título + cuerpo) y el navegador sólo embebe esas en el PDF.
 *
 * Pesos cargados: los mínimos necesarios por familia (400/500/700). No
 * se cargan variantes que no se usan.
 *
 * `factorAncho` aplica un multiplicador de font-size cuando la familia
 * es notablemente más ancha que la base monospace (p. ej. Cinzel, Oswald).
 * El componente aplica el factor al cuerpo para evitar que la
 * paginación cambie de 2 a 3 páginas con 80 vinos.
 */

import {
  EB_Garamond, Cormorant_Garamond, Playfair_Display, Libre_Baskerville,
  Lora, Spectral, Crimson_Pro, Libre_Caslon_Text, Bodoni_Moda,
  DM_Serif_Display, Cinzel,
  Inter, Montserrat, Raleway, Josefin_Sans, Lato, Work_Sans, Poppins, Oswald,
  JetBrains_Mono, IBM_Plex_Mono, Space_Mono, Courier_Prime,
  Caveat,
} from 'next/font/google'

// Serif clásicas
const ebGaramond        = EB_Garamond        ({ subsets: ['latin'], display: 'swap', weight: ['400','600','700'], variable: '--cpdf-f-eb-garamond' })
const cormorantGaramond = Cormorant_Garamond ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-cormorant-garamond' })
const playfairDisplay   = Playfair_Display   ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-playfair-display' })
const libreBaskerville  = Libre_Baskerville  ({ subsets: ['latin'], display: 'swap', weight: ['400','700'],        variable: '--cpdf-f-libre-baskerville' })
const lora              = Lora               ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-lora' })
const spectral          = Spectral           ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-spectral' })
const crimsonPro        = Crimson_Pro        ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-crimson-pro' })
const libreCaslonText   = Libre_Caslon_Text  ({ subsets: ['latin'], display: 'swap', weight: ['400','700'],        variable: '--cpdf-f-libre-caslon-text' })
const bodoniModa        = Bodoni_Moda        ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-bodoni-moda' })
const dmSerifDisplay    = DM_Serif_Display   ({ subsets: ['latin'], display: 'swap', weight: ['400'],              variable: '--cpdf-f-dm-serif-display' })
const cinzel            = Cinzel             ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-cinzel' })

// Sans
const inter             = Inter              ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-inter' })
const montserrat        = Montserrat         ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-montserrat' })
const raleway           = Raleway            ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-raleway' })
const josefinSans       = Josefin_Sans       ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-josefin-sans' })
const lato              = Lato               ({ subsets: ['latin'], display: 'swap', weight: ['400','700'],        variable: '--cpdf-f-lato' })
const workSans          = Work_Sans          ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-work-sans' })
const poppins           = Poppins            ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-poppins' })
const oswald            = Oswald             ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-oswald' })

// Mono
const jetbrainsMono     = JetBrains_Mono     ({ subsets: ['latin'], display: 'swap', weight: ['400','700'],        variable: '--cpdf-f-jetbrains-mono' })
const ibmPlexMono       = IBM_Plex_Mono      ({ subsets: ['latin'], display: 'swap', weight: ['400','500','700'], variable: '--cpdf-f-ibm-plex-mono' })
const spaceMono         = Space_Mono         ({ subsets: ['latin'], display: 'swap', weight: ['400','700'],        variable: '--cpdf-f-space-mono' })
const courierPrime      = Courier_Prime      ({ subsets: ['latin'], display: 'swap', weight: ['400','700'],        variable: '--cpdf-f-courier-prime' })

// Manuscrita (idónea para título — aviso en UI)
const caveat            = Caveat             ({ subsets: ['latin'], display: 'swap', weight: ['400','700'],        variable: '--cpdf-f-caveat' })

/**
 * Catálogo. Cada entrada:
 *   id            — slug estable para la API y la DB
 *   label         — nombre visible en el <select>
 *   grupo         — serif | sans | mono | manuscrita
 *   obj           — handle de next/font (para extraer .variable y className)
 *   varName       — nombre de la CSS var (string) que inyecta next/font
 *   fallback      — pila CSS fallback si la var no está cargada
 *   factorAncho   — multiplicador font-size (1 = neutro; <1 encoge)
 *   soloTitulo    — true si la familia solo debería usarse como título
 */
export const CATALOGO_FUENTES = [
  // Serif clásicas
  { id: 'eb-garamond',        label: 'EB Garamond',        grupo: 'serif', obj: ebGaramond,        varName: '--cpdf-f-eb-garamond',        fallback: `'Garamond', serif`,            factorAncho: 1.00 },
  { id: 'cormorant-garamond', label: 'Cormorant Garamond', grupo: 'serif', obj: cormorantGaramond, varName: '--cpdf-f-cormorant-garamond', fallback: `'Garamond', serif`,            factorAncho: 1.00 },
  { id: 'playfair-display',   label: 'Playfair Display',   grupo: 'serif', obj: playfairDisplay,   varName: '--cpdf-f-playfair-display',   fallback: `'Georgia', serif`,             factorAncho: 0.95 },
  { id: 'libre-baskerville',  label: 'Libre Baskerville',  grupo: 'serif', obj: libreBaskerville,  varName: '--cpdf-f-libre-baskerville',  fallback: `'Baskerville', serif`,         factorAncho: 0.95 },
  { id: 'lora',               label: 'Lora',               grupo: 'serif', obj: lora,              varName: '--cpdf-f-lora',               fallback: `'Georgia', serif`,             factorAncho: 0.98 },
  { id: 'spectral',           label: 'Spectral',           grupo: 'serif', obj: spectral,          varName: '--cpdf-f-spectral',           fallback: `'Georgia', serif`,             factorAncho: 1.00 },
  { id: 'crimson-pro',        label: 'Crimson Pro',        grupo: 'serif', obj: crimsonPro,        varName: '--cpdf-f-crimson-pro',        fallback: `'Garamond', serif`,            factorAncho: 1.00 },
  { id: 'libre-caslon-text',  label: 'Libre Caslon',       grupo: 'serif', obj: libreCaslonText,   varName: '--cpdf-f-libre-caslon-text',  fallback: `'Caslon', serif`,              factorAncho: 0.98 },
  { id: 'bodoni-moda',        label: 'Bodoni Moda',        grupo: 'serif', obj: bodoniModa,        varName: '--cpdf-f-bodoni-moda',        fallback: `'Didot', serif`,               factorAncho: 0.95 },
  { id: 'dm-serif-display',   label: 'DM Serif Display',   grupo: 'serif', obj: dmSerifDisplay,    varName: '--cpdf-f-dm-serif-display',   fallback: `'Didot', serif`,               factorAncho: 0.92, soloTitulo: true },
  { id: 'cinzel',             label: 'Cinzel',             grupo: 'serif', obj: cinzel,            varName: '--cpdf-f-cinzel',             fallback: `'Trajan Pro', serif`,          factorAncho: 0.88, soloTitulo: true },
  // Sans
  { id: 'inter',              label: 'Inter',              grupo: 'sans',  obj: inter,             varName: '--cpdf-f-inter',              fallback: `system-ui, sans-serif`,         factorAncho: 0.95 },
  { id: 'montserrat',         label: 'Montserrat',         grupo: 'sans',  obj: montserrat,        varName: '--cpdf-f-montserrat',         fallback: `'Helvetica Neue', sans-serif`,  factorAncho: 0.93 },
  { id: 'raleway',            label: 'Raleway',            grupo: 'sans',  obj: raleway,           varName: '--cpdf-f-raleway',            fallback: `'Helvetica Neue', sans-serif`,  factorAncho: 0.95 },
  { id: 'josefin-sans',       label: 'Josefin Sans',       grupo: 'sans',  obj: josefinSans,       varName: '--cpdf-f-josefin-sans',       fallback: `'Futura', sans-serif`,          factorAncho: 0.98 },
  { id: 'lato',               label: 'Lato',               grupo: 'sans',  obj: lato,              varName: '--cpdf-f-lato',               fallback: `system-ui, sans-serif`,         factorAncho: 0.97 },
  { id: 'work-sans',          label: 'Work Sans',          grupo: 'sans',  obj: workSans,          varName: '--cpdf-f-work-sans',          fallback: `system-ui, sans-serif`,         factorAncho: 0.96 },
  { id: 'poppins',            label: 'Poppins',            grupo: 'sans',  obj: poppins,           varName: '--cpdf-f-poppins',            fallback: `system-ui, sans-serif`,         factorAncho: 0.93 },
  { id: 'oswald',             label: 'Oswald',             grupo: 'sans',  obj: oswald,            varName: '--cpdf-f-oswald',             fallback: `'Impact', sans-serif`,          factorAncho: 0.80, soloTitulo: true },
  // Mono
  { id: 'jetbrains-mono',     label: 'JetBrains Mono',     grupo: 'mono',  obj: jetbrainsMono,     varName: '--cpdf-f-jetbrains-mono',     fallback: `'Courier New', monospace`,     factorAncho: 1.00 },
  { id: 'ibm-plex-mono',      label: 'IBM Plex Mono',      grupo: 'mono',  obj: ibmPlexMono,       varName: '--cpdf-f-ibm-plex-mono',      fallback: `'Courier New', monospace`,     factorAncho: 1.00 },
  { id: 'space-mono',         label: 'Space Mono',         grupo: 'mono',  obj: spaceMono,         varName: '--cpdf-f-space-mono',         fallback: `'Courier New', monospace`,     factorAncho: 1.05 },
  { id: 'courier-prime',      label: 'Courier Prime',      grupo: 'mono',  obj: courierPrime,      varName: '--cpdf-f-courier-prime',      fallback: `'Courier New', monospace`,     factorAncho: 1.05 },
  // Manuscrita (solo título)
  { id: 'caveat',             label: 'Caveat',             grupo: 'manuscrita', obj: caveat,       varName: '--cpdf-f-caveat',             fallback: `cursive`,                       factorAncho: 1.00, soloTitulo: true },
]

const PORID = new Map(CATALOGO_FUENTES.map(f => [f.id, f]))

/**
 * Resuelve el id de fuente (puede ser "actual" o uno del catálogo) a
 * una pila CSS. "actual" mapea a EB Garamond para título y JetBrains
 * Mono para cuerpo (los valores v1 vigentes).
 */
export function stackFuente(id, { paraTitulo = false } = {}) {
  if (!id || id === 'actual') {
    const def = paraTitulo
      ? PORID.get('eb-garamond')
      : PORID.get('jetbrains-mono')
    return `var(${def.varName}), ${def.fallback}`
  }
  const f = PORID.get(id)
  if (!f) return paraTitulo
    ? `var(--cpdf-f-eb-garamond), 'Garamond', serif`
    : `var(--cpdf-f-jetbrains-mono), 'Courier New', monospace`
  return `var(${f.varName}), ${f.fallback}`
}

/**
 * Factor de ancho para el id dado (1 si "actual" o desconocido).
 */
export function factorAnchoFuente(id) {
  if (!id || id === 'actual') return 1
  const f = PORID.get(id)
  return f?.factorAncho || 1
}

/**
 * Devuelve el className concatenado con TODAS las .variable de
 * next/font. Se aplica al shell para que todas las vars estén
 * disponibles aunque el restaurante sólo use 2 familias.
 */
export function classNameTodasLasVariables() {
  return CATALOGO_FUENTES.map(f => f.obj.variable).join(' ')
}
