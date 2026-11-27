/**
 * CartaImprimible
 *
 * Componente puro de la hoja A4 (sin shell admin, sin controles). Se usa en:
 *   - /admin/carta-pdf/[slug]        → preview dentro del panel admin
 *   - /imprimir/carta-pdf/[slug]     → ruta de impresión standalone
 *
 * La ruta de impresión NO vive bajo /admin/ para no heredar el layout
 * admin (sidebar fixed, main con min-height: 100vh, overflow hidden en
 * varios ancestros). El bug "hoja en blanco al imprimir" se reproducía
 * precisamente porque esos ancestros limitaban la altura efectiva del
 * contenido impreso.
 *
 * Props:
 *   - restaurante { nombre, logo_url? }
 *   - secciones   Array<{ tipo, label, vinos }>  (ya agrupadas y ordenadas)
 *   - config      { color_fondo, color_acento, color_texto, font_stack,
 *                    carta_descripcion, carta_pie_texto, carta_mostrar_copa,
 *                    carta_incluir_bodega_anada }
 */

import { formatearPrecioPdf, lineaOrigenVino } from '../../lib/cartaPdfUtils'

export function CartaImprimible({ restaurante, secciones, config }) {
  const styleSheet = {
    '--cpdf-bg': config.color_fondo,
    '--cpdf-fg': config.color_texto,
    '--cpdf-accent': config.color_acento,
    '--cpdf-font': config.font_stack,
  }

  return (
    <article className="cpdf-sheet" style={styleSheet} aria-label="Carta de vinos imprimible">
      {/*
        Patrón table+thead para repetir cabecera en cada página.
        Chromium `--print-to-pdf` repite <thead> de forma nativa en
        cada page break, a diferencia de CSS `position: running()` que
        no funciona en la versión actual (verificado empíricamente con
        scripts/verify-carta-pdf-header.mjs).
      */}
      <table className="cpdf-page-table">
        <thead>
          <tr>
            <td>
              <div className="cpdf-sheet__pageheader" aria-hidden="true">
                <span>{restaurante?.nombre || ''}</span>
                {restaurante?.logo_url
                  ? <img src={restaurante.logo_url} alt="" />
                  : <span aria-hidden="true" />}
                <span>Carta de vinos</span>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <section className="cpdf-sheet__hero">
                {restaurante?.logo_url ? (
                  <img className="cpdf-sheet__logo" src={restaurante.logo_url} alt="" />
                ) : null}
                <h1 className="cpdf-sheet__nombre">{restaurante?.nombre || ''}</h1>
                {config.carta_descripcion ? (
                  <p className="cpdf-sheet__descripcion">{config.carta_descripcion}</p>
                ) : null}
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
              </div>

              {config.carta_pie_texto ? (
                <footer className="cpdf-sheet__pie">{config.carta_pie_texto}</footer>
              ) : null}
            </td>
          </tr>
        </tbody>
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
            // Celda vacía (sin "—") para preservar alineación de la columna BOTELLA.
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
