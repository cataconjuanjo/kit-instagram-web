'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import styles from './kiosko.module.css'

// ── Constantes ──────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 60_000

const TIPO_LABELS = {
  tinto:       'Tinto',
  blanco:      'Blanco',
  rosado:      'Rosado',
  espumoso:    'Espumoso',
  generoso:    'Generoso',
  dulce:       'Dulce',
  naranja:     'Naranja',
  sin_alcohol: 'Sin alcohol',
}

const TIPO_COLORS = {
  tinto:       '#8B1A1A',
  blanco:      '#C4A843',
  rosado:      '#D4756A',
  espumoso:    '#7AB5C8',
  generoso:    '#B47C3C',
  dulce:       '#C4567C',
  naranja:     '#C4843C',
  sin_alcohol: '#5C9C5C',
}

const TIPO_ORDER = ['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol']

const SUGERENCIAS_MARIDAJE = [
  'Cigalas a la plancha',
  'Cordero al horno',
  'Queso manchego',
  'Jamón ibérico',
  'Paella de mariscos',
  'Chuletón de buey',
  'Aperitivo con amigos',
  'Postre de chocolate',
  'Celebración especial',
]

const VIEWS = { WELCOME: 'welcome', BROWSE: 'browse', PAIRING: 'pairing', DETAIL: 'detail' }

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizarTexto(t = '') {
  return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function formatPrecio(precio) {
  if (!precio) return ''
  return Number(precio).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function extraerValoresUnicos(vinos, campo) {
  return [...new Set(vinos.map(v => v[campo]).filter(Boolean))].sort()
}

function esColorClaro(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return false
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114)/1000 > 145
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function TipoChip({ tipo, size = 'sm' }) {
  const label = TIPO_LABELS[tipo] || tipo
  const color = TIPO_COLORS[tipo] || '#666'
  return (
    <span
      className={`${styles.tipoChip} ${size === 'lg' ? styles.tipoChipLg : ''}`}
      style={{ background: color }}
    >
      {label}
    </span>
  )
}

function WineCardPlaceholder({ tipo }) {
  const color = TIPO_COLORS[tipo] || '#2a2a2a'
  return (
    <div className={styles.cardImgPlaceholder} style={{ background: `linear-gradient(135deg, ${color}33, ${color}88)` }}>
      <span className={styles.cardImgIcon}>🍷</span>
    </div>
  )
}

function WineCard({ vino, onClick }) {
  return (
    <button className={styles.wineCard} onClick={() => onClick(vino)} type="button">
      <div className={styles.cardImg}>
        {vino.foto_url
          ? <img src={vino.foto_url} alt={vino.nombre} className={styles.cardImgPhoto} loading="lazy" />
          : <WineCardPlaceholder tipo={vino.tipo} />
        }
        {vino.destacado && <span className={styles.cardDestacado}>★ Destacado</span>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          {vino.tipo && <TipoChip tipo={vino.tipo} />}
          {vino.puntuacion && <span className={styles.cardPuntuacion}>{vino.puntuacion} pts</span>}
        </div>
        <p className={styles.cardNombre}>{vino.nombre}</p>
        {vino.bodega && <p className={styles.cardBodega}>{vino.bodega}</p>}
        <p className={styles.cardMeta}>
          {[vino.uva, vino.anada, vino.region].filter(Boolean).join(' · ')}
        </p>
        <div className={styles.cardFooter}>
          {vino.precio_pvp && <span className={styles.cardPrecio}>{formatPrecio(vino.precio_pvp)}</span>}
          {vino.ubicacion_estanteria && (
            <span className={styles.cardUbicacion}>📍 {vino.ubicacion_estanteria}</span>
          )}
        </div>
      </div>
    </button>
  )
}

function WineDetail({ vino, colorAcento, onClose, onPairingFrom }) {
  return (
    <div className={styles.detailOverlay}>
      <div className={styles.detailPanel}>
        <button className={styles.detailClose} onClick={onClose} type="button" aria-label="Cerrar">
          ✕
        </button>

        <div className={styles.detailContent}>
          <div className={styles.detailLeft}>
            {vino.foto_url
              ? <img src={vino.foto_url} alt={vino.nombre} className={styles.detailPhoto} />
              : (
                <div className={styles.detailPhotoPlaceholder} style={{ background: `linear-gradient(135deg, ${TIPO_COLORS[vino.tipo] || '#2a2a2a'}44, ${TIPO_COLORS[vino.tipo] || '#2a2a2a'}99)` }}>
                  <span>🍷</span>
                </div>
              )
            }
            {vino.destacado && (
              <div className={styles.detailDestacado} style={{ color: colorAcento }}>
                ★ Vino destacado
              </div>
            )}
          </div>

          <div className={styles.detailRight}>
            <div className={styles.detailHeader}>
              {vino.tipo && <TipoChip tipo={vino.tipo} size="lg" />}
              {vino.puntuacion && (
                <span className={styles.detailPuntuacion} style={{ color: colorAcento }}>
                  {vino.puntuacion} pts
                </span>
              )}
            </div>

            <h2 className={styles.detailNombre}>{vino.nombre}</h2>
            {vino.bodega && <p className={styles.detailBodega}>{vino.bodega}</p>}

            <div className={styles.detailMeta}>
              {vino.uva    && <span><strong>Uva</strong> {vino.uva}</span>}
              {vino.anada  && <span><strong>Añada</strong> {vino.anada}</span>}
              {vino.region && <span><strong>D.O.</strong> {vino.region}</span>}
              {vino.pais && vino.pais !== 'España' && <span><strong>País</strong> {vino.pais}</span>}
            </div>

            {vino.precio_pvp && (
              <div className={styles.detailPrecio} style={{ color: colorAcento }}>
                {formatPrecio(vino.precio_pvp)}
              </div>
            )}

            {vino.ubicacion_estanteria && (
              <div className={styles.detailUbicacion}>
                <span className={styles.detailUbicacionLabel}>Encuéntralo en</span>
                <span className={styles.detailUbicacionValor} style={{ color: colorAcento }}>
                  📍 {vino.ubicacion_estanteria}
                </span>
              </div>
            )}

            {(vino.descripcion || vino.notas_cata) && (
              <p className={styles.detailNotas}>{vino.descripcion || vino.notas_cata}</p>
            )}

            <button
              className={styles.detailPairingBtn}
              onClick={() => onPairingFrom(vino)}
              type="button"
            >
              ¿Con qué lo tomo?
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PairingView({ tienda, slug, colorAcento, onWineSelect, onBack }) {
  const [consulta, setConsulta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  async function consultar(texto) {
    const q = texto || consulta
    if (!q.trim()) return
    setCargando(true)
    setError('')
    setResultado(null)
    try {
      const res = await fetch(`/api/kiosko/${slug}/maridaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error en la consulta')
      setResultado(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  function usarSugerencia(sugerencia) {
    setConsulta(sugerencia)
    consultar(sugerencia)
  }

  return (
    <div className={styles.pairingView}>
      <div className={styles.pairingHeader}>
        <button className={styles.backBtn} onClick={onBack} type="button">
          ← Volver
        </button>
        <h2 className={styles.pairingTitle}>¿Para qué buscas el vino?</h2>
        <p className={styles.pairingSubtitle}>
          Dinos el plato, momento u ocasión y te recomendamos el vino perfecto de nuestra selección
        </p>
      </div>

      <div className={styles.pairingInputArea}>
        <textarea
          ref={textareaRef}
          className={styles.pairingTextarea}
          value={consulta}
          onChange={e => setConsulta(e.target.value)}
          placeholder="Ej: cigalas a la plancha, cordero asado, queso curado, celebración especial..."
          rows={3}
          maxLength={400}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); consultar() } }}
        />
        <button
          className={styles.pairingSubmitBtn}
          style={{ background: colorAcento }}
          onClick={() => consultar()}
          disabled={cargando || !consulta.trim()}
          type="button"
        >
          {cargando ? '⏳ Consultando...' : '🔍 Buscar vinos'}
        </button>
      </div>

      {!resultado && !cargando && !error && (
        <div className={styles.sugerencias}>
          <p className={styles.sugerenciasLabel}>Ideas rápidas:</p>
          <div className={styles.sugerenciasGrid}>
            {SUGERENCIAS_MARIDAJE.map(s => (
              <button
                key={s}
                className={styles.sugerenciaBtn}
                onClick={() => usarSugerencia(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className={styles.pairingError}>
          <p>{error}</p>
          <button onClick={() => setError('')} type="button">Intentar de nuevo</button>
        </div>
      )}

      {resultado && (
        <div className={styles.pairingResultados}>
          {resultado.intro && <p className={styles.pairingIntro}>{resultado.intro}</p>}
          <div className={styles.pairingWines}>
            {resultado.recomendaciones.map(vino => (
              <button
                key={vino.id}
                className={styles.pairingWineCard}
                onClick={() => onWineSelect(vino)}
                type="button"
              >
                <div className={styles.pairingWineLeft}>
                  {vino.foto_url
                    ? <img src={vino.foto_url} alt={vino.nombre} className={styles.pairingWinePhoto} />
                    : (
                      <div className={styles.pairingWinePhotoPlaceholder} style={{ background: `${TIPO_COLORS[vino.tipo] || '#333'}66` }}>
                        🍷
                      </div>
                    )
                  }
                </div>
                <div className={styles.pairingWineInfo}>
                  <div className={styles.pairingWineTop}>
                    {vino.tipo && <TipoChip tipo={vino.tipo} />}
                    {vino.precio_pvp && <span className={styles.pairingWinePrecio}>{formatPrecio(vino.precio_pvp)}</span>}
                  </div>
                  <p className={styles.pairingWineNombre}>{vino.nombre}</p>
                  {vino.bodega && <p className={styles.pairingWineBodega}>{vino.bodega}</p>}
                  <p className={styles.pairingWineRazon}>{vino.razon}</p>
                  {vino.ubicacion_estanteria && (
                    <p className={styles.pairingWineUbicacion}>📍 {vino.ubicacion_estanteria}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
          <button
            className={styles.pairingReiniciarBtn}
            onClick={() => { setResultado(null); setConsulta('') }}
            type="button"
          >
            Nueva búsqueda
          </button>
        </div>
      )}
    </div>
  )
}

function BrowseView({ vinos, tienda, slug, colorAcento, onWineSelect, onBack }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroPais, setFiltroPais] = useState('')

  const tipos  = useMemo(() => TIPO_ORDER.filter(t => vinos.some(v => v.tipo === t)), [vinos])
  const paises = useMemo(() => extraerValoresUnicos(vinos, 'pais'), [vinos])

  const vinosFiltrados = useMemo(() => {
    const qNorm = normalizarTexto(busqueda)
    return vinos.filter(v => {
      if (filtroTipo !== 'todos' && v.tipo !== filtroTipo) return false
      if (filtroPais && v.pais !== filtroPais) return false
      if (qNorm) {
        const txt = normalizarTexto([v.nombre, v.bodega, v.uva, v.region].filter(Boolean).join(' '))
        if (!txt.includes(qNorm)) return false
      }
      return true
    })
  }, [vinos, filtroTipo, busqueda, filtroPais])

  function limpiar() { setBusqueda(''); setFiltroTipo('todos'); setFiltroPais('') }
  const filtroActivo = filtroTipo !== 'todos' || busqueda || filtroPais

  return (
    <div className={styles.browseView}>
      <div className={styles.browseTopBar}>
        <div className={styles.browseTopRow}>
          <button className={styles.backBtn} onClick={onBack} type="button">← Inicio</button>
          <div className={styles.searchWrap}>
            <input
              className={styles.searchInput}
              type="search"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar vino, bodega, uva..."
            />
            {busqueda && (
              <button className={styles.searchClear} onClick={() => setBusqueda('')} type="button">✕</button>
            )}
          </div>
          <span className={styles.resultCount}>{vinosFiltrados.length} vinos</span>
          {filtroActivo && (
            <button className={styles.clearBtn} onClick={limpiar} type="button">Limpiar</button>
          )}
        </div>

        <div className={styles.tipoBar}>
          <button
            className={`${styles.tipoChipBtn} ${filtroTipo === 'todos' ? styles.tipoChipBtnActive : ''}`}
            onClick={() => setFiltroTipo('todos')}
            style={filtroTipo === 'todos' ? { background: colorAcento, borderColor: colorAcento, color: '#fff' } : {}}
            type="button"
          >Todos</button>
          {tipos.map(tipo => (
            <button
              key={tipo}
              className={`${styles.tipoChipBtn} ${filtroTipo === tipo ? styles.tipoChipBtnActive : ''}`}
              onClick={() => setFiltroTipo(tipo === filtroTipo ? 'todos' : tipo)}
              style={filtroTipo === tipo ? { background: TIPO_COLORS[tipo], borderColor: TIPO_COLORS[tipo], color: '#fff' } : {}}
              type="button"
            >{TIPO_LABELS[tipo] || tipo}</button>
          ))}
          {paises.length > 1 && (
            <select className={styles.paisSelect} value={filtroPais} onChange={e => setFiltroPais(e.target.value)}>
              <option value="">Todos los países</option>
              {paises.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className={styles.browseResults}>
        {vinosFiltrados.length === 0 ? (
          <div className={styles.noResults}>
            <p>No hay vinos con estos filtros.</p>
            <button onClick={limpiar} style={{ color: colorAcento }} type="button">Limpiar filtros</button>
          </div>
        ) : (
          <div className={styles.wineGrid}>
            {vinosFiltrados.map(v => <WineCard key={v.id} vino={v} onClick={onWineSelect} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function KioskoPage() {
  const { slug } = useParams()

  const [tienda, setTienda]       = useState(null)
  const [vinos, setVinos]         = useState([])
  const [cargando, setCargando]   = useState(true)
  const [error, setError]         = useState('')
  const [view, setView]           = useState(VIEWS.WELCOME)
  const [vinoDetalle, setVinoDetalle] = useState(null)

  const idleTimer = useRef(null)

  // ── Carga datos ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return
    async function cargar() {
      setCargando(true)
      setError('')
      try {
        // Tienda
        const resTienda = await fetch(`/api/kiosko/${slug}/vinos`)
        const dataTienda = await resTienda.json()
        if (!resTienda.ok) throw new Error(dataTienda.error || 'Tienda no encontrada')
        setVinos(dataTienda.vinos || [])

        // Datos de tienda por separado (slug → nombre, colores)
        const resMeta = await fetch(`/api/kiosko/${slug}/meta`)
        if (resMeta.ok) {
          const meta = await resMeta.json()
          setTienda(meta.tienda)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setCargando(false)
      }
    }
    cargar()
  }, [slug])

  // ── Idle timeout ─────────────────────────────────────────────────────────

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (view !== VIEWS.WELCOME) {
      idleTimer.current = setTimeout(() => {
        setView(VIEWS.WELCOME)
        setVinoDetalle(null)
      }, IDLE_TIMEOUT_MS)
    }
  }, [view])

  useEffect(() => {
    resetIdle()
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [resetIdle])

  useEffect(() => {
    const events = ['touchstart', 'touchmove', 'click', 'keydown', 'mousemove']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, resetIdle))
  }, [resetIdle])

  // ── Navegación ───────────────────────────────────────────────────────────

  function abrirDetalle(vino) {
    setVinoDetalle(vino)
    setView(VIEWS.DETAIL)
  }

  function volverDeDetalle() {
    setView(vinoDetalle ? VIEWS.BROWSE : VIEWS.WELCOME)
    setVinoDetalle(null)
  }

  function abrirPairingDesdeDetalle(vino) {
    setVinoDetalle(null)
    setView(VIEWS.PAIRING)
  }

  // ── Colores de marca ─────────────────────────────────────────────────────

  const colorPrimario = tienda?.color_primario || '#0d0d1a'
  const colorAcento   = tienda?.color_acento   || '#c9a96e'

  const temaClaro = esColorClaro(colorPrimario)
  const themeVars = {
    '--color-primario': colorPrimario,
    '--color-acento':   colorAcento,
    '--texto':      temaClaro ? '#141413'            : '#f0ede8',
    '--texto-m':    temaClaro ? 'rgba(20,20,19,.6)'  : 'rgba(240,237,232,.6)',
    '--texto-d':    temaClaro ? 'rgba(20,20,19,.38)' : 'rgba(240,237,232,.4)',
    '--sup1':       temaClaro ? 'rgba(0,0,0,.03)'    : 'rgba(255,255,255,.05)',
    '--sup2':       temaClaro ? '#F7F7F7'            : 'rgba(255,255,255,.08)',
    '--sup3':       temaClaro ? 'rgba(0,0,0,.07)'    : 'rgba(255,255,255,.12)',
    '--borde':      temaClaro ? '#EEEEEE'            : 'rgba(255,255,255,.1)',
    '--borde-f':    temaClaro ? '#AAAAAA'            : 'rgba(255,255,255,.35)',
    '--panel':      temaClaro ? '#FFFFFF'            : '#141420',
    '--sidebar':    temaClaro ? '#F7F7F7'            : 'rgba(0,0,0,.35)',
    '--sidebar-b':  temaClaro ? '#EEEEEE'            : 'rgba(255,255,255,.08)',
    '--overlay':    temaClaro ? 'rgba(0,0,0,.55)'    : 'rgba(0,0,0,.75)',
    '--spinner-t':  temaClaro ? 'rgba(0,0,0,.1)'     : 'rgba(255,255,255,.15)',
    '--btn-back':   temaClaro ? 'rgba(0,0,0,.05)'    : 'rgba(255,255,255,.08)',
    '--btn-back-b': temaClaro ? '#DDDDDD'            : 'rgba(255,255,255,.15)',
    '--select-bg':  temaClaro ? '#FFFFFF'            : '#1a1a2e',
    '--featured-b': temaClaro ? '#EEEEEE'            : 'rgba(255,255,255,.08)',
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <div className={styles.loadingScreen} style={themeVars}>
        <div className={styles.loadingSpinner} />
        <p style={{ color: colorAcento }}>Cargando...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorScreen} style={themeVars}>
        <p className={styles.errorMsg}>{error}</p>
        <button onClick={() => window.location.reload()} style={{ color: colorAcento }} type="button">
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className={styles.kiosko} style={themeVars}>
      {/* BIENVENIDA */}
      {view === VIEWS.WELCOME && (
        <div className={styles.welcomeView}>
          <div className={styles.welcomeContent}>
            {tienda?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tienda.logo_url} alt={tienda?.nombre} className={styles.welcomeLogo} />
            )}
            <h1 className={styles.welcomeNombre} style={{ color: colorAcento }}>
              {tienda?.nombre || 'Nuestra Selección de Vinos'}
            </h1>
            {tienda?.descripcion && (
              <p className={styles.welcomeDesc}>{tienda.descripcion}</p>
            )}
            <div className={styles.welcomeStats}>
              <span>{vinos.length} referencias</span>
              {(() => { const disp = vinos.filter(v => v.stock > 0).length; return disp > 0 && disp < vinos.length ? <span>{disp} disponibles</span> : null })()}
            </div>

            <div className={styles.welcomeActions}>
              <button
                className={styles.welcomeBtn}
                style={{ background: colorAcento, color: colorPrimario }}
                onClick={() => setView(VIEWS.BROWSE)}
                type="button"
              >
                🍾 Explorar vinos
              </button>
              <button
                className={`${styles.welcomeBtn} ${styles.welcomeBtnSecondary}`}
                style={{ borderColor: colorAcento, color: colorAcento }}
                onClick={() => setView(VIEWS.PAIRING)}
                type="button"
              >
                🍽️ ¿Con qué lo tomo?
              </button>
            </div>
          </div>

          {vinos.filter(v => v.destacado).length > 0 && (
            <div className={styles.welcomeFeatured}>
              <p className={styles.featuredLabel} style={{ color: colorAcento }}>★ Destacados</p>
              <div className={styles.featuredStrip}>
                {vinos.filter(v => v.destacado).slice(0, 6).map(v => (
                  <button
                    key={v.id}
                    className={styles.featuredCard}
                    onClick={() => abrirDetalle(v)}
                    type="button"
                  >
                    {v.foto_url
                      ? <img src={v.foto_url} alt={v.nombre} className={styles.featuredPhoto} loading="lazy" />
                      : <div className={styles.featuredPhotoPlaceholder} style={{ background: `${TIPO_COLORS[v.tipo] || '#333'}88` }}>🍷</div>
                    }
                    <p className={styles.featuredNombre}>{v.nombre}</p>
                    {v.precio_pvp && <p className={styles.featuredPrecio} style={{ color: colorAcento }}>{formatPrecio(v.precio_pvp)}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* EXPLORAR */}
      {view === VIEWS.BROWSE && (
        <BrowseView
          vinos={vinos}
          tienda={tienda}
          slug={slug}
          colorAcento={colorAcento}
          onWineSelect={abrirDetalle}
          onBack={() => setView(VIEWS.WELCOME)}
        />
      )}

      {/* MARIDAJE */}
      {view === VIEWS.PAIRING && (
        <PairingView
          tienda={tienda}
          slug={slug}
          colorAcento={colorAcento}
          onWineSelect={abrirDetalle}
          onBack={() => setView(VIEWS.WELCOME)}
        />
      )}

      {/* DETALLE */}
      {view === VIEWS.DETAIL && vinoDetalle && (
        <WineDetail
          vino={vinoDetalle}
          colorAcento={colorAcento}
          onClose={volverDeDetalle}
          onPairingFrom={abrirPairingDesdeDetalle}
        />
      )}
    </div>
  )
}
