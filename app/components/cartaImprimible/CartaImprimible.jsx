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
} from '../../lib/cartaPdfUtils'
import { stackFuente, factorAnchoFuente } from './fonts.js'

const UMBRAL_COMPACTO = 60

const CREDITO_TEXTO = 'Carta Viva × @cataconjuanjo'
const NOTA_EUROS_TEXTO = 'Precios en euros, IVA incluido'

export function CartaImprimible({ restaurante, secciones, config }) {
  const opciones = config?.opciones || {}

  // Compat v1: si no hay logos[], usar logo_url como logo 1 cabecera-izq.
  const logos = useMemo(() => {
    const explicit = Array.isArray(opciones.logos) ? opciones.logos : []
    if (explicit.length > 0) return explicit
    const url = restaurante?.logo_url
    return url
      ? [{ url, posicion: 'cabecera-izq', tamano_mm: 14, opacidad: 100 }]
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
  const compactoAuto = totalVinos > UMBRAL_COMPACTO
  const compacto = densidadForzada === 'compacto'
    || (densidadForzada === 'auto' && compactoAuto)

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
  }

  const nombre = restaurante?.nombre || ''
  const sinEuro = opciones.precio_formato === 'sin_euro'
  const copaModo = opciones.copa_modo || 'no'

  // Pie: combina carta_pie_texto (si el precio es sin € y nota_euros ON,
  // concatena la nota), y si corresponde añade el crédito discreto.
  const pieBase = config.carta_pie_texto || opciones.carta_pie_texto || ''
  const notaEuros = sinEuro && opciones.nota_euros !== false ? NOTA_EUROS_TEXTO : ''
  const piePartes = [pieBase, notaEuros].filter(Boolean)

  return (
    <article
      className={`cpdf-sheet${compacto ? ' cpdf-sheet--compact' : ''}`}
      data-total-vinos={totalVinos}
      data-densidad={compacto ? 'compact' : 'normal'}
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
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <section className="cpdf-sheet__hero">
                {logos.length === 0 ? null : null /* el logo principal ya va en el pageheader */}
                <div className="cpdf-sheet__hero-text">
                  <h1 className="cpdf-sheet__nombre">{nombre}</h1>
                  {config.carta_descripcion ? (
                    <p className="cpdf-sheet__descripcion">{config.carta_descripcion}</p>
                  ) : null}
                </div>
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
                  credito={opciones.credito !== false}
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
        <img key={i} src={l.url} alt=""
          style={{ maxHeight: `${l.tamano_mm}mm`, maxWidth: `${l.tamano_mm * 2}mm` }} />
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

function PieYQrYCredito({ piePartes, qr, credito, logosPie, cartaPublicaActiva, slug, bgHex, fgHex }) {
  const qrActivo = qr && qr.activo !== false && cartaPublicaActiva && slug
  const qrEnPie = qrActivo && String(qr.posicion || 'pie-der').startsWith('pie-')
  const hayContenidoPie = piePartes.length > 0 || credito || qrEnPie
    || logosPie.izq.length > 0 || logosPie.centro.length > 0 || logosPie.der.length > 0

  if (!hayContenidoPie) return null

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
      {credito && <div className="cpdf-credito" aria-label="Marca comercial">{CREDITO_TEXTO}</div>}
    </footer>
  )
}

function QrBlock({ qr, slug, bgHex, fgHex }) {
  const url = useMemo(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://cataconjuanjo.com'
    const u = new URL(`/carta/${slug}`, base)
    u.searchParams.set('utm_source', 'carta_pdf')
    u.searchParams.set('utm_medium', 'qr')
    return u.toString()
  }, [slug])

  const svg = useQrSvg(url, {
    bg: qr?.color_auto === false ? bgHex : '#ffffff',
    fg: qr?.color_auto === false ? fgHex : '#111111',
    tamanoMm: qr?.tamano_mm || 18,
  })

  return (
    <div className="cpdf-qr" style={{ width: `${qr.tamano_mm || 18}mm` }}>
      {svg
        ? <span className="cpdf-qr__svg" dangerouslySetInnerHTML={{ __html: svg }} />
        : <span className="cpdf-qr__placeholder" />}
      {qr.texto ? <div className="cpdf-qr__texto">{qr.texto}</div> : null}
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
