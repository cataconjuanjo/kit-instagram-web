/**
 * CartaImprimible
 *
 * Plantilla A4 compartida por:
 *   - /admin/carta-pdf/[slug]       → preview dentro del panel admin
 *   - /imprimir/carta-pdf/[slug]    → ruta pública standalone (impresión real)
 *
 * MAQUETACIÓN
 *   Patrón de tabla con thead + tbody + tfoot:
 *     thead → spacer superior (10mm) + cabecera pequeña. Chromium
 *             repite el thead en cada página (table-header-group).
 *     tbody → hero compacto (logo izquierda, nombre+descripción
 *             derecha, altura máx ~45mm) seguido del cuerpo multicol
 *             y el pie. El hero compacto permite que los vinos
 *             empiecen en la página 1 inmediatamente debajo.
 *     tfoot → spacer inferior (10mm). Chromium repite el tfoot en
 *             cada página (table-footer-group), reproduciendo un
 *             margen inferior que se mantiene en TODAS las páginas.
 *
 *   El cuerpo @page { margin: 0 } (ver carta-imprimible.css) hace
 *   que el fondo a sangre llegue a los bordes del papel y que Chrome
 *   NO imprima su cabecera/pie (URL, fecha, nº de página). El margen
 *   visual lo reproducimos con los spacers y el padding lateral.
 */

import { formatearPrecioPdf, lineaOrigenVino } from '../../lib/cartaPdfUtils'

export function CartaImprimible({ restaurante, secciones, config }) {
  const styleSheet = {
    '--cpdf-bg': config.color_fondo,
    '--cpdf-fg': config.color_texto,
    '--cpdf-accent': config.color_acento,
    '--cpdf-font': config.font_stack,
  }

  const logoUrl = restaurante?.logo_url || ''
  const nombre = restaurante?.nombre || ''

  return (
    <article className="cpdf-sheet" style={styleSheet} aria-label="Carta de vinos imprimible">
      <table className="cpdf-page-table">
        <thead>
          <tr>
            <td>
              {/* Spacer del borde superior (se repite en cada página) */}
              <div className="cpdf-page-spacer cpdf-page-spacer--top" aria-hidden="true" />
              <div className="cpdf-sheet__pageheader" aria-hidden="true">
                <span>{nombre}</span>
                {logoUrl
                  ? <img src={logoUrl} alt="" />
                  : <span aria-hidden="true" />}
                <span>Carta de vinos</span>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {/*
                Hero COMPACTO en una sola fila: logo a la izquierda,
                nombre + descripción a la derecha. Máx. altura
                controlada por CSS (~45mm) para que los vinos quepan
                en la primera página inmediatamente debajo.
              */}
              <section className="cpdf-sheet__hero">
                {logoUrl ? (
                  <img className="cpdf-sheet__logo" src={logoUrl} alt="" />
                ) : <div className="cpdf-sheet__logo cpdf-sheet__logo--placeholder" aria-hidden="true" />}
                <div className="cpdf-sheet__hero-text">
                  <h1 className="cpdf-sheet__nombre">{nombre}</h1>
                  {config.carta_descripcion ? (
                    <p className="cpdf-sheet__descripcion">{config.carta_descripcion}</p>
                  ) : null}
                </div>
              </section>

              <div className="cpdf-sheet__body">
                {secciones.map(sec => (
                  <Seccion
                    key={sec.tipo}
                    seccion={sec}
                    mostrarCopa={!!config.carta_mostrar_copa}
                    incluirBodegaAnada={!!config.carta_incluir_bodega_anada}
                  />
                ))}
                {/*
                  Pie DENTRO del multicol como último ítem del flujo.
                  Al ser ítem (y no bloque externo que necesite su propia
                  caja de página), se sitúa al final de la última columna
                  utilizada. Antes vivía fuera del multicol y provocaba
                  una página extra solo con el pie cuando la última
                  columna quedaba casi llena.
                */}
                {config.carta_pie_texto ? (
                  <footer className="cpdf-sheet__pie">{config.carta_pie_texto}</footer>
                ) : null}
              </div>
            </td>
          </tr>
        </tbody>
        {/*
          Antes había un <tfoot> con spacer bottom repetido en cada página.
          Chromium lo empujaba a una página fantasma cuando el tbody
          terminaba cerca del límite. El margen inferior físico lo da
          ahora el padding-bottom del <td> del tbody (se aplica solo a la
          última página con contenido, en el resto Chromium pagina sin
          dejar franja inferior adicional).
        */}
      </table>
    </article>
  )
}

function Seccion({ seccion, mostrarCopa, incluirBodegaAnada }) {
  return (
    <section className="cpdf-section">
      <header className="cpdf-section__header">
        <span className="cpdf-section__title">{seccion.label}</span>
        <span className="cpdf-section__labels">
          {mostrarCopa && <span>Copa</span>}
          <span>Botella</span>
        </span>
      </header>
      {seccion.vinos.map(vino => (
        <Vino
          key={vino.id}
          vino={vino}
          mostrarCopa={mostrarCopa}
          incluirBodegaAnada={incluirBodegaAnada}
        />
      ))}
    </section>
  )
}

function Vino({ vino, mostrarCopa, incluirBodegaAnada }) {
  const precioBotella = formatearPrecioPdf(vino.precio_botella)
  const precioCopa = formatearPrecioPdf(vino.precio_copa)
  const origen = lineaOrigenVino(vino, { incluirBodega: incluirBodegaAnada, incluirAnada: incluirBodegaAnada })
  const nombre = (vino.nombre || '').toUpperCase()

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
      {origen && (
        <div className="cpdf-vino__linea2">{origen}</div>
      )}
    </div>
  )
}
