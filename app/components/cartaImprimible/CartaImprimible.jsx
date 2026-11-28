/**
 * CartaImprimible v2
 *
 * Plantilla A4 compartida por:
 *   - /admin/carta-pdf/[slug]       → preview dentro del panel admin
 *   - /imprimir/carta-pdf/[slug]    → ruta pública standalone
 *
 * La config recibe `opciones` (resultado de normalizarOpcionesCartaPdf)
 * con todas las claves v2 (fuente_titulo, fuente_cuerpo, logos[], qr,
 * credito, copa_modo, orden_vinos, precio_formato, densidad_forzada…).
 *
 * REGLA DE ORO: con `opciones` = defaults, el render es equivalente al v1
 * (mismo número de páginas, mismo aspecto). Las features v2 son opt-in.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  formatearPrecioPdf, lineaOrigenVino, ordenarVinosSeccion, extraerSeccionCopa,
  notaIvaParaPie,
} from '../../lib/cartaPdfUtils'
import { stackFuente, factorAnchoFuente } from './fonts.js'

const UMBRAL_COMPACTO = 60
// Umbral para "compacto-extra" (cuerpo 8pt, hero aún menor): se activa
// en modo auto cuando ni siquiera el modo compacto normal (60) cabe en
// 2 páginas. 90+ vinos o 70+ vinos con copa_modo "junto"/"ambos" (línea
// 2 con padding-right reduce ancho útil y encoge menos filas por página).
const UMBRAL_XTRA_COMPACTO = 90

const CREDITO_TEXTO = 'Carta Viva × @cataconjuanjo'

export function CartaImprimible({ restaurante, secciones, config }) {
  const opciones = config?.opciones || {}

  // Compat v1: si no hay logos[], usar logo_url como logo 1 cabecera-izq.
  // tamano_mm=7 reproduce el max-height:7mm que capaba el antiguo CSS
  // de `.cpdf-sheet__pageheader img` — así la equivalencia por defecto
  // v1↔v2 se mantiene (mismo nº de páginas). Si el restaurante quiere
  // un logo mayor, lo configura explícitamente en `logos[]`.
  const logos = useMemo(() => {
    const explicit = Array.isArray(opciones.logos) ? opciones.logos : []
    if (explicit.length > 0) return explicit
    const url = restaurante?.logo_url
    return url
      ? [{ url, posicion: 'cabecera-izq', tamano_mm: 7, opacidad: 100 }]
      : []
  }, [opciones.logos, restaurante?.logo_url])

  const logosPorPos = useMemo(() => {
    const map = {
      'cabecera-izq': [], 'cabecera-centro': [], 'cabecera-der': [],
      'pie-izq': [], 'pie-centro': [], 'pie-der': [],
      'marca-agua': [],
    }
    for (const l of logos) {
      if (map[l.posicion]) map[l.posicion].push(l)
    }
    return map
  }, [logos])

  // Ordenar y agrupar vinos según opciones
  const seccionesRenderizables = useMemo(() => {
    const todosLosVinos = secciones.flatMap(s => s.vinos)
    const { seccionCopa, idsExcluir } = extraerSeccionCopa(todosLosVinos, opciones.copa_modo)

    const procesadas = secciones.map(sec => {
      const vinosFiltrados = sec.vinos.filter(v => !idsExcluir.has(v.id))
      const { lista, grupos } = ordenarVinosSeccion(
        vinosFiltrados,
        opciones.orden_vinos || 'alfabetico',
        opciones.orden_secundario || 'precio_asc'
      )
      return { ...sec, vinos: lista, grupos }
    }).filter(sec => sec.vinos.length > 0)

    // "Por copa" al principio (como sección virtual)
    if (seccionCopa) {
      const { lista: copaOrdenada } = ordenarVinosSeccion(
        seccionCopa.vinos,
        opciones.orden_vinos || 'alfabetico',
        opciones.orden_secundario || 'precio_asc'
      )
      return [{ ...seccionCopa, vinos: copaOrdenada, grupos: null, esCopa: true }, ...procesadas]
    }
    return procesadas
  }, [secciones, opciones.copa_modo, opciones.orden_vinos, opciones.orden_secundario])

  const totalVinos = seccionesRenderizables.reduce((n, s) => n + s.vinos.length, 0)
  const densidadForzada = opciones.densidad_forzada || 'auto'
  const copaModoLocal = opciones.copa_modo || 'no'
  const copaOcupaColumna = copaModoLocal === 'junto' || copaModoLocal === 'ambos'

  const compactoAuto = totalVinos > UMBRAL_COMPACTO
  // Auto-selección de "compacto-extra" cuando aún con compacto normal
  // es probable que se abra una 3ª página. Heurística: >=UMBRAL_XTRA
  // vinos, o >=70 vinos cuando copa ocupa una columna extra.
  const xtraAuto = totalVinos >= UMBRAL_XTRA_COMPACTO
    || (copaOcupaColumna && totalVinos >= 70)
  const compacto = densidadForzada === 'compacto'
    || densidadForzada === 'compacto-extra'
    || (densidadForzada === 'auto' && compactoAuto)
  const xtraCompact = densidadForzada === 'compacto-extra'
    || (densidadForzada === 'auto' && xtraAuto)

  // Factor de ancho del cuerpo (fuentes anchas comprimen un pelín el pt)
  const factorCuerpo = factorAnchoFuente(opciones.fuente_cuerpo)
  const stackTitulo = stackFuente(opciones.fuente_titulo, { paraTitulo: true })
  const stackCuerpo = stackFuente(opciones.fuente_cuerpo, { paraTitulo: false })

  const styleSheet = {
    '--cpdf-bg': config.color_fondo,
    '--cpdf-fg': config.color_texto,
    '--cpdf-accent': config.color_acento,
    '--cpdf-font': stackTitulo,              // retrocompat
    '--cpdf-font-titulo': stackTitulo,
    '--cpdf-font-cuerpo': stackCuerpo,
    '--cpdf-factor-cuerpo': String(factorCuerpo),
    // Reserva de ancho a la derecha de la línea 2 para no solapar los
    // precios. 14mm copa + 8mm gap + 14mm botella = 36mm.
    '--cpdf-precios-w': copaOcupaColumna ? '36mm' : '0',
  }

  const nombre = restaurante?.nombre || ''
  const sinEuro = opciones.precio_formato === 'sin_euro'
  const copaModo = opciones.copa_modo || 'no'

  // ¿QR en hero (cabecera-*)? Debe estar activo + carta pública + slug
  // + posición de cabecera. Si la posición es "pie-*", vive en el Pie.
  const qrOpc = opciones.qr || {}
  const qrCabeceraActivo = qrOpc.activo !== false
    && restaurante?.carta_publica_activa !== false
    && restaurante?.slug
    && String(qrOpc.posicion || 'cabecera-der').startsWith('cabecera-')
  const qrActivoHero = qrCabeceraActivo

  // Pie: combina carta_pie_texto (si el precio es sin € y nota_euros ON,
  // concatena la nota), y si corresponde añade el crédito discreto.
  const pieBase = config.carta_pie_texto || opciones.carta_pie_texto || ''
  // Nota IVA solo si: formato sin_euro + toggle nota_euros + el pie
  // del restaurante NO menciona ya "IVA" (evita duplicación).
  const notaEuros = notaIvaParaPie({
    precio_formato: opciones.precio_formato,
    nota_euros: opciones.nota_euros,
    carta_pie_texto: pieBase,
  }) || ''
  const piePartes = [pieBase, notaEuros].filter(Boolean)

  return (
    <article
      className={`cpdf-sheet${compacto ? ' cpdf-sheet--compact' : ''}${xtraCompact ? ' cpdf-sheet--xtra-compact' : ''}`}
      data-total-vinos={totalVinos}
      data-densidad={xtraCompact ? 'xtra-compact' : compacto ? 'compact' : 'normal'}
      style={styleSheet}
      aria-label="Carta de vinos imprimible"
    >
      {/* Marca de agua: se replica dentro del flujo del body; en print
          aparece como primera capa detrás del contenido del multicol. */}
      {logosPorPos['marca-agua'].length > 0 && (
        <MarcaAgua logos={logosPorPos['marca-agua']} />
      )}

      <table className="cpdf-page-table">
        <thead>
          <tr>
            <td>
              <div className="cpdf-page-spacer cpdf-page-spacer--top" aria-hidden="true" />
              <div className="cpdf-sheet__pageheader" aria-hidden="true">
                <LogoFila logos={logosPorPos['cabecera-izq']} />
                <span className="cpdf-pageheader__center">
                  {logosPorPos['cabecera-centro'].length > 0
                    ? <LogoFila logos={logosPorPos['cabecera-centro']} />
                    : nombre}
                </span>
                <LogoFila logos={logosPorPos['cabecera-der']} alignEnd />
              </div>
              {/*
                Crédito en el thead → se repite en cada página junto
                a la cabecera, SIN consumir altura del multicol. Antes
                vivía al final del flujo y empujaba una pág 3 con
                defaults. Se mantiene el requisito del brief: "sácalo
                del flujo del multicol".
              */}
              {opciones.credito !== false && (
                <div className="cpdf-credito cpdf-credito--thead" aria-label="Marca comercial">
                  {CREDITO_TEXTO}
                </div>
              )}
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <section className="cpdf-sheet__hero">
                <div className="cpdf-sheet__hero-text">
                  <h1 className="cpdf-sheet__nombre">{nombre}</h1>
                  {config.carta_descripcion ? (
                    <p className="cpdf-sheet__descripcion">{config.carta_descripcion}</p>
                  ) : null}
                </div>
                {/*
                  QR en el hero cuando qr.posicion='cabecera-*'. El hero
                  es flex row y el QR ocupa un slot fijo a la derecha
                  sin agrandar la altura (tamaño ≤ hero height).
                */}
                {qrActivoHero && (
                  <QrBlock qr={opciones.qr} slug={restaurante?.slug}
                    bgHex={config.color_fondo} fgHex={config.color_texto}
                    ubicacion="hero" />
                )}
              </section>

              <div className="cpdf-sheet__body">
                {seccionesRenderizables.map(sec => (
                  <Seccion
                    key={sec.tipo}
                    seccion={sec}
                    copaModo={copaModo}
                    sinEuro={sinEuro}
                    incluirBodegaAnada={!!config.carta_incluir_bodega_anada}
                    subtitulosRegion={!!opciones.subtitulos_region
                      && (opciones.orden_vinos === 'region')}
                  />
                ))}

                <PieYQrYCredito
                  piePartes={piePartes}
                  qr={opciones.qr}
                  logosPie={{
                    izq: logosPorPos['pie-izq'],
                    centro: logosPorPos['pie-centro'],
                    der: logosPorPos['pie-der'],
                  }}
                  cartaPublicaActiva={restaurante?.carta_publica_activa !== false}
                  slug={restaurante?.slug}
                  bgHex={config.color_fondo}
                  fgHex={config.color_texto}
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  )
}

function Seccion({ seccion, copaModo, sinEuro, incluirBodegaAnada, subtitulosRegion }) {
  const mostrarCopa = (copaModo === 'junto' || copaModo === 'ambos') && !seccion.esCopa
  const columnaExtraCopa = seccion.esCopa // sección "Por copa" muestra solo copa en destacado
  return (
    <section className="cpdf-section">
      <header className="cpdf-section__header">
        <span className="cpdf-section__title">{seccion.label}</span>
        <span className="cpdf-section__labels">
          {columnaExtraCopa
            ? <span>Copa</span>
            : <>
                {mostrarCopa && <span>Copa</span>}
                <span>Botella</span>
              </>}
        </span>
      </header>
      {subtitulosRegion && seccion.grupos
        ? seccion.grupos.map(g => (
            <div key={g.region} className="cpdf-section__grupo">
              <div className="cpdf-section__subtitulo">{g.region}</div>
              {g.vinos.map(vino => (
                <Vino key={vino.id} vino={vino} mostrarCopa={mostrarCopa}
                  seccionCopa={columnaExtraCopa} sinEuro={sinEuro}
                  incluirBodegaAnada={incluirBodegaAnada} />
              ))}
            </div>
          ))
        : seccion.vinos.map(vino => (
            <Vino key={vino.id} vino={vino} mostrarCopa={mostrarCopa}
              seccionCopa={columnaExtraCopa} sinEuro={sinEuro}
              incluirBodegaAnada={incluirBodegaAnada} />
          ))}
    </section>
  )
}

function Vino({ vino, mostrarCopa, seccionCopa, sinEuro, incluirBodegaAnada }) {
  const fmtOpts = { conEuro: !sinEuro }
  const precioBotella = formatearPrecioPdf(vino.precio_botella, fmtOpts)
  const precioCopa = formatearPrecioPdf(vino.precio_copa, fmtOpts)
  const origen = lineaOrigenVino(vino, { incluirBodega: incluirBodegaAnada, incluirAnada: incluirBodegaAnada })
  const nombre = (vino.nombre || '').toUpperCase()

  // En la sección virtual "Por copa" solo mostramos el precio de copa.
  if (seccionCopa) {
    return (
      <div className="cpdf-vino">
        <div className="cpdf-vino__linea1">
          <span className="cpdf-vino__nombre">{nombre}</span>
          <span className="cpdf-vino__precios">
            <span className="cpdf-vino__precio">{precioCopa || ''}</span>
          </span>
        </div>
        {origen && <div className="cpdf-vino__linea2">{origen}</div>}
      </div>
    )
  }

  return (
    <div className="cpdf-vino">
      <div className="cpdf-vino__linea1">
        <span className="cpdf-vino__nombre">{nombre}</span>
        <span className="cpdf-vino__precios">
          {mostrarCopa && (
            <span className="cpdf-vino__precio" aria-hidden={!precioCopa}>
              {precioCopa || ''}
            </span>
          )}
          <span className="cpdf-vino__precio">{precioBotella}</span>
        </span>
      </div>
      {origen && <div className="cpdf-vino__linea2">{origen}</div>}
    </div>
  )
}

function LogoFila({ logos, alignEnd = false }) {
  if (!logos || logos.length === 0) return <span aria-hidden="true" />
  return (
    <span className={`cpdf-logos-fila${alignEnd ? ' cpdf-logos-fila--end' : ''}`}>
      {logos.map((l, i) => (
        <img
          key={i}
          src={l.url}
          alt=""
          /*
           * Fix bug "logo 0×0":
           *   - Antes usábamos max-height + max-width sin height/width
           *     intrínseco. En SVGs con solo viewBox (sin width/height)
           *     el navegador hace fallback a 0×0 → el logo desaparecía.
           *   - Ahora: height en mm explícito + width:auto para que el
           *     navegador aplique la ratio (incluso en SVG). max-width
           *     limita el ancho máximo si el logo es muy apaisado.
           */
          style={{ height: `${l.tamano_mm}mm`, width: 'auto', maxWidth: '60mm' }}
        />
      ))}
    </span>
  )
}

function MarcaAgua({ logos }) {
  const primero = logos[0]
  if (!primero) return null
  return (
    <div
      className="cpdf-marca-agua"
      aria-hidden="true"
      style={{ opacity: (primero.opacidad || 8) / 100 }}
    >
      <img src={primero.url} alt="" style={{ maxWidth: `${primero.tamano_mm * 2}mm` }} />
    </div>
  )
}

function PieYQrYCredito({ piePartes, qr, logosPie, cartaPublicaActiva, slug, bgHex, fgHex }) {
  const qrActivo = qr && qr.activo !== false && cartaPublicaActiva && slug
  // Solo interesa el QR si está en una posición de pie. Las posiciones
  // 'cabecera-*' las renderiza el hero (QR arriba, sin consumir body).
  const qrEnPie = qrActivo && String(qr.posicion || 'cabecera-der').startsWith('pie-')
  const hayLogosPie = logosPie.izq.length > 0 || logosPie.centro.length > 0 || logosPie.der.length > 0
  const hayContenidoPie = piePartes.length > 0 || qrEnPie || hayLogosPie
  if (!hayContenidoPie) return null

  // Pie "simple" sin grid cuando sólo texto + QR (sin logos en pie).
  const necesitaGrid = hayLogosPie
  if (!necesitaGrid) {
    return (
      <footer className="cpdf-sheet__pie cpdf-sheet__pie--simple">
        {piePartes.length > 0 && (
          <div className="cpdf-pie-texto">{piePartes.map((p, i) => <div key={i}>{p}</div>)}</div>
        )}
        {qrEnPie && <QrBlock qr={qr} slug={slug} bgHex={bgHex} fgHex={fgHex} />}
      </footer>
    )
  }

  return (
    <footer className="cpdf-sheet__pie">
      <div className="cpdf-pie-grid">
        <div className="cpdf-pie-slot cpdf-pie-slot--izq">
          {qrActivo && qr.posicion === 'pie-izq'
            ? <QrBlock qr={qr} slug={slug} bgHex={bgHex} fgHex={fgHex} />
            : <LogoFila logos={logosPie.izq} />}
        </div>
        <div className="cpdf-pie-slot cpdf-pie-slot--centro">
          {piePartes.length > 0 && (
            <div className="cpdf-pie-texto">
              {piePartes.map((p, i) => <div key={i}>{p}</div>)}
            </div>
          )}
          {qrActivo && qr.posicion === 'pie-centro' && (
            <QrBlock qr={qr} slug={slug} bgHex={bgHex} fgHex={fgHex} />
          )}
          {logosPie.centro.length > 0 && <LogoFila logos={logosPie.centro} />}
        </div>
        <div className="cpdf-pie-slot cpdf-pie-slot--der">
          {qrActivo && qr.posicion === 'pie-der'
            ? <QrBlock qr={qr} slug={slug} bgHex={bgHex} fgHex={fgHex} />
            : <LogoFila logos={logosPie.der} alignEnd />}
        </div>
      </div>
    </footer>
  )
}

function QrBlock({ qr, slug, bgHex, fgHex, ubicacion = 'pie' }) {
  const url = useMemo(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://cataconjuanjo.com'
    const u = new URL(`/carta/${slug}`, base)
    u.searchParams.set('utm_source', 'carta_pdf')
    u.searchParams.set('utm_medium', 'qr')
    return u.toString()
  }, [slug])

  const tamanoMm = qr?.tamano_mm || 16
  const svg = useQrSvg(url, {
    bg: qr?.color_auto === false ? bgHex : '#ffffff',
    fg: qr?.color_auto === false ? fgHex : '#111111',
    tamanoMm,
  })

  // En el hero el texto va DEBAJO del QR (6pt, envuelve). En el pie
  // mantiene el estilo original (6.5pt debajo). La variante hero fija
  // max-width al doble del QR para que el texto envuelva sin forzar
  // altura por encima del hero compacto.
  const esHero = ubicacion === 'hero'
  const clase = `cpdf-qr${esHero ? ' cpdf-qr--hero' : ''}`
  return (
    <div className={clase} style={{ width: `${tamanoMm}mm` }}>
      {svg
        ? <span className="cpdf-qr__svg" dangerouslySetInnerHTML={{ __html: svg }} />
        : <span className="cpdf-qr__placeholder" />}
      {qr.texto
        ? <div className="cpdf-qr__texto" style={esHero ? { maxWidth: `${tamanoMm * 2}mm` } : undefined}>
            {qr.texto}
          </div>
        : null}
    </div>
  )
}

// Hook que carga qrcode on-demand y devuelve SVG string.
function useQrSvg(url, { bg = '#ffffff', fg = '#111111', tamanoMm = 18 }) {
  const [svg, setSvg] = useState(null)
  useEffect(() => {
    let cancelado = false
    async function gen() {
      try {
        const QRCode = (await import('qrcode')).default
        const svgString = await QRCode.toString(url, {
          type: 'svg',
          errorCorrectionLevel: 'M',
          margin: 2, // quiet zone ≥ 2 módulos
          color: { dark: fg, light: bg },
          width: tamanoMm * 4, // px, redimensionado por CSS
        })
        if (!cancelado) setSvg(svgString)
      } catch {
        if (!cancelado) setSvg(null)
      }
    }
    gen()
    return () => { cancelado = true }
  }, [url, bg, fg, tamanoMm])
  return svg
}
