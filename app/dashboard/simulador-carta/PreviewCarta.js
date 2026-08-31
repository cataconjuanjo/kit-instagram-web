'use client'
import pStyles from './previewCarta.module.css'

const TIPOS_ORDEN = ['tinto', 'blanco', 'rosado', 'espumoso', 'naranja', 'generoso', 'dulce', 'sin_alcohol']
const TIPO_LABELS = {
  tinto: 'Tintos', blanco: 'Blancos', rosado: 'Rosados', espumoso: 'Espumosos',
  naranja: 'Naranjas', generoso: 'Generosos', dulce: 'Dulces', sin_alcohol: 'Sin alcohol',
}
const TIPO_DOT = {
  tinto: '#7B1E3B', blanco: '#c9a24b', rosado: '#e8a4a4', espumoso: '#c4a872',
  naranja: '#e8894a', generoso: '#9b6b2f', dulce: '#d4a24b', sin_alcohol: '#2e7d5b',
}

function fmt(valor) {
  const n = Number(valor)
  if (!n || n <= 0) return null
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function normalizar(s = '') {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export default function PreviewCarta({ lineas = [], restaurante }) {
  const activas = lineas.filter(l => l.estado === 'actual' || l.estado === 'nuevo')

  if (!activas.length) {
    return (
      <div className={pStyles.vacio}>
        El borrador está vacío — añade referencias desde el catálogo del consultor.
      </div>
    )
  }

  // Group: tipo (normalizado) → region → [lineas]
  const grupos = {}
  for (const l of activas) {
    const tipo = String(l.tipo || '').toLowerCase().trim() || '__sin_tipo'
    const region = l.region || 'Sin D.O.'
    if (!grupos[tipo]) grupos[tipo] = {}
    if (!grupos[tipo][region]) grupos[tipo][region] = []
    grupos[tipo][region].push(l)
  }

  const tiposOrdenados = [
    ...TIPOS_ORDEN.filter(t => grupos[t]),
    ...Object.keys(grupos).filter(t => !TIPOS_ORDEN.includes(t) && t !== '__sin_tipo'),
    ...(grupos['__sin_tipo'] ? ['__sin_tipo'] : []),
  ]

  return (
    <div className={pStyles.shell}>
      <header className={pStyles.header}>
        <p className={pStyles.headerEyebrow}>Borrador · Vista previa</p>
        <h1 className={pStyles.headerTitle}>{restaurante?.nombre || 'Carta de vinos'}</h1>
        <p className={pStyles.headerSub}>{activas.length} referencias activas en el borrador</p>
      </header>

      <div className={pStyles.content}>
        {tiposOrdenados.map(tipo => {
          const regionMap = grupos[tipo]
          const label = TIPO_LABELS[tipo] || (tipo === '__sin_tipo' ? 'Sin tipo' : tipo.charAt(0).toUpperCase() + tipo.slice(1))
          const dot = TIPO_DOT[tipo] || '#9a9186'

          const regionesOrdenadas = Object.entries(regionMap)
            .sort(([a], [b]) => normalizar(a).localeCompare(normalizar(b), 'es'))

          return (
            <div key={tipo} className={pStyles.tipoGroup}>
              <h2 className={pStyles.tipoTitle}>{label}</h2>
              {regionesOrdenadas.map(([region, vinos]) => (
                <div key={region} className={pStyles.regionGroup}>
                  <p className={pStyles.regionDo}>{region}</p>
                  {vinos
                    .slice()
                    .sort((a, b) => (Number(a.precio_botella) || 999) - (Number(b.precio_botella) || 999))
                    .map(v => {
                      const precioCopa = fmt(v.precio_copa)
                      const precioBotella = fmt(v.precio_botella)
                      return (
                        <article
                          key={v.id}
                          className={`${pStyles.wineCard} ${v.estado === 'nuevo' ? pStyles.wineCardNuevo : ''}`}
                        >
                          <div className={pStyles.wineInfo}>
                            <div className={pStyles.wineTop}>
                              <span className={pStyles.dot} style={{ background: dot }} />
                              <div className={pStyles.wineTitleBlock}>
                                <h3 className={pStyles.wineName}>{v.nombre}</h3>
                                {v.anada && <span className={pStyles.vintagePill}>{v.anada}</span>}
                              </div>
                            </div>
                            {v.bodega && <p className={pStyles.wineSecondary}>{v.bodega}</p>}
                          </div>
                          <div className={pStyles.priceCol}>
                            {precioCopa ? (
                              <>
                                <div className={pStyles.mainPrice}>
                                  <span className={pStyles.formattedPrice}>{precioCopa}</span>
                                  <small>copa</small>
                                </div>
                                {precioBotella && (
                                  <p className={pStyles.priceMeta}>{precioBotella} bot.</p>
                                )}
                              </>
                            ) : precioBotella ? (
                              <div className={pStyles.mainPrice}>
                                <span className={pStyles.formattedPrice}>{precioBotella}</span>
                                <small>bot.</small>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
