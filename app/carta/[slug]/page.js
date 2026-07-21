'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { isLargeFormatWine } from '../../lib/wineFormat'
import { canonicalWineRegion, commercialScopeForWine, localWineLabel } from '../../lib/wineRegion'
import { reportarErrorCliente, slugDesdeRuta } from '../../lib/publicClientHelpers'
import { WINE_TYPE_COLORS, esPerfilGoiko } from '../../lib/winePresentation'
import BrandLogo from '../../components/BrandLogo'
import styles from './carta.module.css'

const FONT_MAP = {
  serif:     { family: 'Georgia, serif',                       googleFont: null },
  sans:      { family: 'system-ui, sans-serif',                googleFont: null },
  condensed: { family: '"Barlow Condensed", sans-serif',       googleFont: 'Barlow+Condensed:wght@400;600;700;800' },
  display:   { family: '"Playfair Display", serif',            googleFont: 'Playfair+Display:wght@400;500;600;700' },
  garamond:  { family: '"Cormorant Garamond", Georgia, serif', googleFont: 'Cormorant+Garamond:wght@400;500;600;700' },
}

const DEFAULT_RESTAURANT_BANNER = '/images/wine-cellar-hero.png'

function cargarGoogleFont(tipografia) {
  const font = FONT_MAP[tipografia]
  if (!font?.googleFont) return
  if (document.querySelector(`link[data-gfont="${tipografia}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`
  link.setAttribute('data-gfont', tipografia)
  document.head.appendChild(link)
}

function PreviewModeBanner({ styles, approved = false, approving = false, error = '', onApprove }) {
  const [formOpen, setFormOpen] = useState(false)
  const [approvalForm, setApprovalForm] = useState({ reviewer_name: '', reviewer_email: '', note: '' })

  function updateApprovalField(field, value) {
    setApprovalForm(prev => ({ ...prev, [field]: value }))
  }

  function submitApproval(event) {
    event.preventDefault()
    onApprove?.(approvalForm)
  }

  return (
    <div className={`${styles.previewModeBar} ${formOpen ? styles.previewModeBarOpen : ''}`} role="status">
      <div>
        <strong>{approved ? 'Preview aprobada' : 'Vista previa privada'}</strong>
        <span>
          {approved
            ? 'La revisión ha quedado registrada. Ya se puede publicar desde el dashboard.'
            : 'No es una carta publicada. Revisa contenido, precios y enlaces antes de compartir el QR real.'}
        </span>
        {error && <small>{error}</small>}
      </div>
      {onApprove && !formOpen && (
        <button type="button" onClick={() => setFormOpen(true)} disabled={approving || approved}>
          {approving ? 'Registrando...' : approved ? 'Aprobada' : 'Aprobar preview'}
        </button>
      )}
      {onApprove && formOpen && !approved && (
        <form className={styles.previewApprovalForm} onSubmit={submitApproval}>
          <input
            type="text"
            value={approvalForm.reviewer_name}
            onChange={event => updateApprovalField('reviewer_name', event.target.value)}
            placeholder="Nombre, cargo o equipo"
            maxLength={120}
            autoComplete="name"
          />
          <input
            type="email"
            value={approvalForm.reviewer_email}
            onChange={event => updateApprovalField('reviewer_email', event.target.value)}
            placeholder="Email opcional"
            maxLength={180}
            autoComplete="email"
          />
          <textarea
            value={approvalForm.note}
            onChange={event => updateApprovalField('note', event.target.value)}
            placeholder="Nota opcional"
            maxLength={800}
            rows={2}
          />
          <div>
            <button type="submit" disabled={approving}>
              {approving ? 'Registrando...' : 'Confirmar aprobación'}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} disabled={approving}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function ExperienceSignal({ experiencia }) {
  if (!experiencia) return null
  return (
    <div className={styles.experienceSignal}>
      <span>{experiencia.badge}</span>
      <strong>{experiencia.headline}</strong>
      <p>{experiencia.text}</p>
    </div>
  )
}

const t = {
  es: {
    cargando: 'CARGANDO',
    noEncontrado: 'Carta no encontrada.',
    noEncontradoTexto: 'Comprueba que el QR o el enlace sea el último. Si estás en una mesa, pide al equipo que lo revise.',
    errorCargaTitulo: 'No hemos podido cargar la carta.',
    errorCargaTexto: 'Revisa la conexión o vuelve a intentarlo en unos segundos.',
    reintentar: 'Reintentar',
    volverCartaViva: 'Volver a Carta Viva',
    cartaNoDisponible: 'Carta no disponible temporalmente.',
    cartaNoDisponibleTexto: 'El restaurante está revisando su carta. Vuelve a intentarlo más tarde o pide al equipo el enlace actualizado.',
    cartaRevisionTitulo: 'Carta en revisión.',
    cartaRevisionTexto: 'El restaurante está ajustando su carta antes de volver a publicarla. Puedes reintentarlo en unos segundos.',
    referencias: 'referencias',
    carta: 'Carta',
    sommelier: 'ArmonIA',
    buscar: 'Buscar vino, bodega o uva...',
    filtros: 'Filtros',
    todos: 'Todos',
    precioMaximo: 'Precio máximo',
    sinLimite: 'Sin límite',
    soloInternacionales: 'Solo internacionales',
    limpiarFiltros: 'Limpiar filtros',
    sinResultados: 'Sin resultados para esta búsqueda.',
    seleccionEspecial: 'Selección Juanjo',
    seleccionCoravin: 'Selección Coravin',
    seleccionCoravinSub: 'Botellas premium servidas por copa',
    fichaVino: 'Ficha del vino',
    region: 'Región',
    uva: 'Uva / blend',
    anada: 'Añada',
    copa: 'Copa',
    botella: 'Botella',
    notasCata: 'Notas de cata',
    quePedir: '¿Qué vas a pedir?',
    seleccionaPlatos: 'Selecciona tus platos y afinamos una recomendación de vino.',
    vinoManda: 'Ya tengo vino',
    vinoMandaSub: 'Elige el vino que quieres beber y te decimos qué platos pedir.',
    buscarVino: 'Buscar vino...',
    eligeVino: 'Elige un vino de la carta',
    vinoElegido: 'Vino elegido',
    platosParaVino: 'Platos para este vino',
    buscarPlato: 'Buscar plato...',
    sinPlatos: 'No hay platos con esa búsqueda.',
    tuSeleccion: 'Tu selección',
    comoQuieres: '¿Cómo quieres el vino?',
    unaBotella: 'Una botella',
    paraMesa: 'Para toda la mesa',
    porCopas: 'Por copas',
    porPlato: 'Una por plato',
    variosOrden: 'Varios en orden',
    sucesionCopas: 'Sucesión copas',
    arcoPlato: 'Copa a copa, en arco',
    recomendame: 'Recomiéndame',
    porPlatos: 'Por platos',
    quizSubtitulo: '4 preguntas · 3 vinos',
    quizQ1: '¿Qué tipo de vino?',
    quizQ2: '¿Cómo lo quieres?',
    quizQ3: '¿Con qué lo tomas?',
    quizQ4: '¿Hasta cuánto por botella?',
    quizEmpezar: 'Empezar de nuevo',
    quizAtras: '← Atrás',
    pedirRecomendacion: 'Pedir recomendación',
    consultando: 'Consultando...',
    nuevaConsulta: 'Nueva consulta',
    comparar: 'Comparar',
    vinosSeleccionados: 'vinos · Comparar',
    cerrarComparador: 'Cerrar comparador',
    añadirComparador: 'Añadir a comparador',
    quitarComparador: 'Quitar',
    maxComparador: 'Máximo 4 vinos',
    tipoLabel: { tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso', generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol', sidra: 'Sidra' },
    tipoPlural: { tinto: 'Tintos', blanco: 'Blancos', rosado: 'Rosados', espumoso: 'Espumosos', generoso: 'Generosos', dulce: 'Dulces', naranja: 'Naranjas', sin_alcohol: 'Sin alcohol', sidra: 'Sidras' },
    btl: 'btl',
  },
  en: {
    cargando: 'LOADING',
    noEncontrado: 'Wine list not found.',
    noEncontradoTexto: 'Check that the QR code or link is the latest one. If you are at a table, ask the team to review it.',
    errorCargaTitulo: 'We could not load the wine list.',
    errorCargaTexto: 'Check the connection or try again in a few seconds.',
    reintentar: 'Try again',
    volverCartaViva: 'Back to Carta Viva',
    cartaNoDisponible: 'Wine list temporarily unavailable.',
    cartaNoDisponibleTexto: 'The restaurant is reviewing its wine list. Try again later or ask the team for the updated link.',
    cartaRevisionTitulo: 'Wine list under review.',
    cartaRevisionTexto: 'The restaurant is adjusting its wine list before publishing it again. You can try again in a few seconds.',
    referencias: 'wines',
    carta: 'Wine list',
    sommelier: 'Pairing guide',
    buscar: 'Search wine, winery or grape...',
    filtros: 'Filters',
    todos: 'All',
    precioMaximo: 'Maximum price',
    sinLimite: 'No limit',
    soloInternacionales: 'International only',
    limpiarFiltros: 'Clear filters',
    sinResultados: 'No results for this search.',
    seleccionEspecial: 'Special selection',
    seleccionCoravin: 'Coravin selection',
    seleccionCoravinSub: 'Premium bottles served by the glass',
    fichaVino: 'Wine details',
    region: 'Region',
    uva: 'Grape / blend',
    anada: 'Vintage',
    copa: 'Glass',
    botella: 'Bottle',
    notasCata: 'Tasting notes',
    quePedir: 'What are you having?',
    seleccionaPlatos: 'Select your dishes and we will refine one wine recommendation.',
    vinoManda: 'I have a wine',
    vinoMandaSub: 'Choose the wine you want to drink and we will suggest what to order.',
    buscarVino: 'Search wine...',
    eligeVino: 'Choose a wine from the list',
    vinoElegido: 'Chosen wine',
    platosParaVino: 'Dishes for this wine',
    buscarPlato: 'Search dish...',
    sinPlatos: 'No dishes found for this search.',
    tuSeleccion: 'Your selection',
    comoQuieres: 'How would you like the wine?',
    unaBotella: 'One bottle',
    paraMesa: 'For the whole table',
    porCopas: 'By the glass',
    porPlato: 'One per dish',
    variosOrden: 'Several in order',
    sucesionCopas: 'Glass arc',
    arcoPlato: 'Glass by glass, in arc',
    recomendame: 'Recommend me',
    porPlatos: 'By dish',
    quizSubtitulo: '4 questions · 3 wines',
    quizQ1: 'What type of wine?',
    quizQ2: 'How do you like it?',
    quizQ3: 'What are you having?',
    quizQ4: 'Budget per bottle?',
    quizEmpezar: 'Start over',
    quizAtras: '← Back',
    pedirRecomendacion: 'Get recommendation',
    consultando: 'Consulting...',
    nuevaConsulta: 'New query',
    comparar: 'Compare',
    vinosSeleccionados: 'wines · Compare',
    cerrarComparador: 'Close comparator',
    añadirComparador: 'Add to compare',
    quitarComparador: 'Remove',
    maxComparador: 'Maximum 4 wines',
    tipoLabel: { tinto: 'Red', blanco: 'White', rosado: 'Rosé', espumoso: 'Sparkling', generoso: 'Fortified', dulce: 'Sweet', naranja: 'Orange', sin_alcohol: 'Non-alcoholic', sidra: 'Cider' },
    tipoPlural: { tinto: 'Reds', blanco: 'Whites', rosado: 'Rosés', espumoso: 'Sparkling', generoso: 'Fortified', dulce: 'Sweet', naranja: 'Orange', sin_alcohol: 'Non-alcoholic', sidra: 'Ciders' },
    btl: 'btl',
  }
}

const RESTAURANTE_PREFIX = '[RESTAURANTE] '
const esSugerenciaRestaurante = item => String(item.nota_personal || '').startsWith(RESTAURANTE_PREFIX)
const limpiarNotaSeleccion = nota => String(nota || '').replace(RESTAURANTE_PREFIX, '')
const precioValido = valor => Number(valor) > 0
const _formatPrecio = (valor, decimalesMax) => Number(valor || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: decimalesMax })
const precioCartaSeguro = (valor, formatter) => precioValido(valor) ? formatter(valor) : ''

function copyCartaRestaurante(base, restaurante = {}) {
  if (!esPerfilGoiko(restaurante)) return base
  return {
    ...base,
    soloInternacionales: 'Solo Francia, Italia y otros',
    tipoLabel: {
      ...base.tipoLabel,
      tinto: 'Tinto / ardo beltza',
      blanco: 'Blanco / ardo txuria',
      rosado: 'Rosado / ardo gorria',
      espumoso: 'Espumoso / aparduna',
      generoso: 'Generoso / ardo oparoa',
      dulce: 'Dulce / ardo gozoa',
      sidra: 'Sidra / sagardoa',
    },
    tipoPlural: {
      ...base.tipoPlural,
      tinto: 'Tintos / ardo beltzak',
      blanco: 'Blancos / ardo txuriak',
      rosado: 'Rosados / ardo gorriak',
      espumoso: 'Espumosos / apardunak',
      generoso: 'Generosos / ardo oparoak',
      dulce: 'Dulces / ardo gozoak',
      sidra: 'Sidras / sagardoak',
    },
    tiposOrdenados: ['sidra', 'tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol'],
    tiposPorCopaOrdenados: ['blanco', 'tinto', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol'],
    gruposAmbito: {
      local: 'Bertako ardoak / vinos de la zona',
      espana: 'D.O. peninsulares e islas',
      internacional: 'Francia, Italia y otros',
      sin_origen: 'Otras zonas / bestelakoak',
    },
    vinosPorCopa: 'Vinos por copa / Kopak',
  }
}

function textoVinoOrden(vino = {}) {
  return `${vino.nombre || ''} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`
}

function nombreVinoCarta(vino = {}) {
  return String(vino.nombre || '')
    .replace(/\b(MAGNUM|Jeroboam)(?=[A-ZÁÉÍÓÚÑ])/g, '$1 ')
    .replace(/([a-záéíóúñ])(?=(Bodegas|Domaine|Château|Chateau|Maison|Viña|Vina|Celler|Clos|Pago|Tempos|Marqués|Marques|Mestres|Jacquesson|Albamar|Fulcro|Zárate|Zarate|Rafael|Artuke|Frontonio|Sierra|CVNE|Antídoto|Antidoto|Bollinger|Bérêche|Bereche|Moët|Moet|Louis|Valette|Dard|Mas|Teso|Bruno)\b)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export default function CartaPublica() {
  const routeParams = useParams()
  const slug = slugDesdeRuta(routeParams, 'carta')
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [seleccion, setSeleccion] = useState([])
  const [platosSeleccionados, setPlatosSeleccionados] = useState([])
  const [modoMesa, setModoMesa] = useState('botella')
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [precioMax, setPrecioMax] = useState(null)
  const [vinoSeleccionado, setVinoSeleccionado] = useState(null)
  const [vista, setVista] = useState('carta')
  const [respuesta, setRespuesta] = useState('')
  const [cargandoIA, setCargandoIA] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [loadRetryKey, setLoadRetryKey] = useState(0)
  const [previewAprobacion, setPreviewAprobacion] = useState({ aprobada: false, loading: false, error: '' })
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const [soloInternacional, setSoloInternacional] = useState(false)
  const [soloCopa, setSoloCopa] = useState(false)
  const [seccionAbierta, setSeccionAbierta] = useState('')
  const [seccionInicialAplicada, setSeccionInicialAplicada] = useState(false)
  const [busquedaPlatos, setBusquedaPlatos] = useState('')
  const [categoriaPlatoAbierta, setCategoriaPlatoAbierta] = useState('')
  const [idioma, setIdioma] = useState('es')
  const [vinosComparador, setVinosComparador] = useState([])
  const [mostrarComparador, setMostrarComparador] = useState(false)
  const [perfiles, setPerfiles] = useState({})
  const [cargandoPerfiles, setCargandoPerfiles] = useState(false)
  const [historialSommelier, setHistorialSommelier] = useState([])
  const [inputSeguimiento, setInputSeguimiento] = useState('')
  const [modoSommelier, setModoSommelier] = useState('platos')
  const [vinoMandatoCliente, setVinoMandatoCliente] = useState(null)
  const [busquedaVinoSommelier, setBusquedaVinoSommelier] = useState('')
  const [pasoQuiz, setPasoQuiz] = useState(1)
  const [respuestasQuiz, setRespuestasQuiz] = useState({})
  const [respuestaQuiz, setRespuestaQuiz] = useState('')
  const [demoPresentacion] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo_presentacion') === '1'
  ))
  const scrollAntesFicha = useRef(0)
  const tokenPrueba = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('prueba') || ''
    : ''

  const reintentarCarga = () => {
    setLoadRetryKey(key => key + 1)
  }

  async function aprobarPreviewPublica(destino = 'carta', approvalData = {}) {
    if (!restaurante?.id || !tokenPrueba || previewAprobacion.loading || previewAprobacion.aprobada) return
    setPreviewAprobacion({ aprobada: false, loading: true, error: '' })
    try {
      const res = await fetch('/api/publicacion/preview-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurante_id: restaurante.id,
          preview_token: tokenPrueba,
          destino,
          reviewer_name: approvalData.reviewer_name,
          reviewer_email: approvalData.reviewer_email,
          note: approvalData.note,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar la aprobación.')
      setPreviewAprobacion({ aprobada: true, loading: false, error: '' })
    } catch (error) {
      setPreviewAprobacion({
        aprobada: false,
        loading: false,
        error: error.message || 'No se pudo registrar la aprobación.',
      })
    }
  }

  const estructuraPdfGoiko = esPerfilGoiko(restaurante)
  const i = useMemo(() => copyCartaRestaurante(t[idioma], restaurante), [idioma, restaurante])
  const tipoDot = WINE_TYPE_COLORS
  const seleccionJuanjo = seleccion.filter(item => !esSugerenciaRestaurante(item))
  const seleccionRestaurante = seleccion.filter(esSugerenciaRestaurante)
  const vinoEnSeleccion = (vino, lista) => lista.some(item => String(item.vino_id || item.vinos?.id) === String(vino.id))
  const seleccionDeVino = vino => seleccion.find(item => String(item.vino_id || item.vinos?.id) === String(vino.id))
  const etiquetasVino = vino => [
    vinoEnSeleccion(vino, seleccionJuanjo) && { texto: 'Selección del consultor', detalle: 'por @cataconjuanjo · WSET Level 3', tipo: 'consultor' },
    vinoEnSeleccion(vino, seleccionRestaurante) && { texto: 'Recomienda la casa', tipo: 'casa' },
  ].filter(Boolean)

  const mantenerPosicion = (accion, evento) => {
    if (typeof window === 'undefined') {
      accion()
      return
    }
    const elemento = evento?.currentTarget
    const topAntes = elemento?.getBoundingClientRect().top
    const scrollAntes = window.scrollY
    accion()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (elemento && document.body.contains(elemento) && topAntes !== undefined) {
          const topDespues = elemento.getBoundingClientRect().top
          window.scrollBy({ top: topDespues - topAntes, left: 0, behavior: 'auto' })
        } else {
          window.scrollTo({ top: scrollAntes, left: 0, behavior: 'auto' })
        }
      })
    })
  }

  const toggleSeccion = (id, evento) => {
    mantenerPosicion(() => {
      setSeccionAbierta(actual => actual === id ? '' : id)
    }, evento)
  }

  const abrirFichaVino = vino => {
    if (typeof window !== 'undefined') scrollAntesFicha.current = window.scrollY
    setVinoSeleccionado(vino)
  }

  const cerrarFichaVino = () => {
    const scrollDestino = scrollAntesFicha.current || 0
    setVinoSeleccionado(null)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollDestino, left: 0, behavior: 'auto' })
      })
    })
  }

  useEffect(() => {
    if (!vinoSeleccionado || typeof window === 'undefined') return
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }))
  }, [vinoSeleccionado])

  useEffect(() => {
    if (!slug) return
    let cancelado = false

    async function cargar() {
      setLoading(true)
      setLoadError(null)
      try {
        const query = new URLSearchParams({ carta: '1' })
        if (tokenPrueba) query.set('prueba', tokenPrueba)
        const res = await fetch(`/api/public/restaurante/${encodeURIComponent(slug)}?${query.toString()}`)
        const data = await res.json().catch(() => ({}))
        if (res.status === 404) {
          if (!cancelado) {
            setRestaurante(null)
            setLoadError({ type: 'not_found' })
          }
          return
        }
        if (res.status === 409) {
          if (!cancelado) {
            setRestaurante(null)
            setLoadError({ type: 'not_ready', message: data.error })
          }
          return
        }
        if (!res.ok) throw new Error(`GET carta publica ${res.status}`)
        const rest = data.restaurante
        if (!rest) {
          if (!cancelado) {
            setRestaurante(null)
            setLoadError({ type: 'not_found' })
          }
          return
        }
        if (cancelado) return
        setRestaurante(rest)
        if (rest.color_primario) document.documentElement.style.setProperty('--color-primario', rest.color_primario)
        if (rest.color_fondo) document.documentElement.style.setProperty('--color-fondo', rest.color_fondo)
        if (rest.color_acento) document.documentElement.style.setProperty('--color-acento', rest.color_acento)
        cargarGoogleFont(rest.tipografia)
        document.documentElement.style.setProperty('--font-titulo', (FONT_MAP[rest.tipografia] || FONT_MAP.serif).family)
        const vinosData = data.vinos
        const vinosActivos = vinosData || []
        setVinos(vinosActivos.filter(vino => vino.disponible !== false))
        const platosData = data.platos
        setPlatos(platosData || [])
        const selData = data.seleccion
        setSeleccion(selData || [])
        fetch('/api/estadisticas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurante_id: rest.id,
            tipo: 'escaneo',
            detalle: {
              destino: 'carta',
              experiencia_id: rest.experiencia_publica?.id || null,
            },
            prueba_token: tokenPrueba,
          }),
        }).catch(error => reportarErrorCliente('carta_publica_estadisticas', error))
      } catch (error) {
        if (!cancelado) {
          setRestaurante(null)
          setLoadError({ type: 'network' })
          reportarErrorCliente('carta_publica_carga', error)
        }
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [slug, tokenPrueba, loadRetryKey])

  useEffect(() => {
    if (!loading && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('print') === '1') {
      window.requestAnimationFrame(() => {
        setVista('carta')
        setBusqueda('')
        setFiltro('todos')
        setPrecioMax(null)
        setSoloCopa(false)
        setTimeout(() => window.print(), 500)
      })
    }
  }, [loading])

  async function leerStream(res, onChunk, onDone) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data) continue
        try {
          const parsed = JSON.parse(data)
          if (parsed.text !== undefined) onChunk(parsed.text)
          if (parsed.done) onDone(parsed.prefill || '')
        } catch {}
      }
    }
  }

  async function preguntarQuizCon(respuestas) {
    setCargandoIA(true)
    setRespuestaQuiz('')
    const res = await fetch('/api/maridaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modo: 'quiz',
        perfilQuiz: respuestas,
        restaurante_id: restaurante.id,
        idioma,
        historial: [],
        prueba_token: tokenPrueba,
      }),
    })
    if (!res.ok) {
      setRespuestaQuiz(idioma === 'en' ? 'Error. Please try again.' : 'Error al consultar. Inténtalo de nuevo.')
      setCargandoIA(false)
      return
    }
    let texto = ''
    await leerStream(res, chunk => { texto += chunk; setRespuestaQuiz(texto) }, () => {})
    setCargandoIA(false)
  }

  function responderQuiz(campo, valor) {
    const nuevas = { ...respuestasQuiz, [campo]: valor }
    setRespuestasQuiz(nuevas)
    if (pasoQuiz < 4) {
      setPasoQuiz(pasoQuiz + 1)
    } else {
      setPasoQuiz(5)
      preguntarQuizCon(nuevas)
    }
  }

  function reiniciarQuiz() {
    setPasoQuiz(1)
    setRespuestasQuiz({})
    setRespuestaQuiz('')
  }

  function irASeleccionSommelier() {
    if (typeof document === 'undefined') return
    document.getElementById('seleccion-sommelier')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function preguntarSommelier() {
    if (!platosSeleccionados.length) return
    setCargandoIA(true)
    setRespuesta('')
    setHistorialSommelier([])
    setInputSeguimiento('')
    const consultaPlatos = platosSeleccionados
      .map(p => `${p.nombre}${p.precio ? ` (${p.precio}€)` : ''}`)
      .join(', ')
    const modosTexto = {
      botella: idioma === 'en' ? 'a single bottle that works well for the whole table' : 'una sola botella que funcione bien para toda la mesa',
      copa: idioma === 'en' ? 'a different glass for each dish' : 'una copa diferente para cada plato',
      sucesion: idioma === 'en'
        ? 'a harmonic glass succession: one BTG wine per dish building an aromatic arc from lighter to fuller'
        : 'sucesion_copas: una copa diferente por plato siguiendo un arco armónico de menos a más cuerpo — solo vinos disponibles por copa',
    }
    const res = await fetch('/api/maridaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consulta: consultaPlatos,
        modo: 'mesa',
        modoMesa: modosTexto[modoMesa],
        restaurante_id: restaurante.id,
        plato_ids: platosSeleccionados.map(plato => plato.id).filter(Boolean),
        idioma,
        historial: [],
        prueba_token: tokenPrueba,
      }),
    })
    if (!res.ok) {
      setRespuesta(idioma === 'en' ? 'Error contacting the pairing guide. Please try again.' : 'Error al consultar ArmonIA. Inténtalo de nuevo.')
      setCargandoIA(false)
      return
    }
    let textoAcumulado = ''
    const promptUsuario = `El cliente va a pedir: ${consultaPlatos}. Quiere: ${modosTexto[modoMesa]}.`
    await leerStream(
      res,
      chunk => { textoAcumulado += chunk; setRespuesta(textoAcumulado) },
      prefill => {
        setHistorialSommelier([
          { role: 'user', content: promptUsuario },
          { role: 'assistant', content: prefill + textoAcumulado },
        ])
      }
    )
    setCargandoIA(false)
  }

  async function preguntarPlatosParaVino() {
    if (!vinoMandatoCliente) return
    setCargandoIA(true)
    setRespuesta('')
    setHistorialSommelier([])
    setInputSeguimiento('')
    const consultaVino = [
      vinoMandatoCliente.nombre,
      vinoMandatoCliente.bodega,
      vinoMandatoCliente.tipo,
      vinoMandatoCliente.region,
      vinoMandatoCliente.uva ? `uva: ${vinoMandatoCliente.uva}` : '',
      vinoMandatoCliente.notas_cata ? `notas: ${vinoMandatoCliente.notas_cata}` : '',
    ].filter(Boolean).join(', ')
    const res = await fetch('/api/maridaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consulta: consultaVino,
        modo: 'vino',
        restaurante_id: restaurante.id,
        idioma,
        historial: [],
        prueba_token: tokenPrueba,
      }),
    })
    if (!res.ok) {
      setRespuesta(idioma === 'en' ? 'Error contacting the pairing guide. Please try again.' : 'Error al consultar ArmonIA. Inténtalo de nuevo.')
      setCargandoIA(false)
      return
    }
    let textoAcumulado = ''
    const promptUsuario = idioma === 'en'
      ? `The customer wants to drink this wine: ${consultaVino}. Suggest dishes from the menu.`
      : `El cliente quiere beber este vino: ${consultaVino}. Sugiere platos de la carta.`
    await leerStream(
      res,
      chunk => { textoAcumulado += chunk; setRespuesta(textoAcumulado) },
      prefill => {
        setHistorialSommelier([
          { role: 'user', content: promptUsuario },
          { role: 'assistant', content: prefill + textoAcumulado },
        ])
      }
    )
    setCargandoIA(false)
  }

  async function preguntarSeguimiento() {
    const msg = inputSeguimiento.trim()
    if (!msg || cargandoIA || !historialSommelier.length) return
    setInputSeguimiento('')
    setCargandoIA(true)
    setRespuesta('')
    const res = await fetch('/api/maridaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensajeSeguimiento: msg,
        restaurante_id: restaurante.id,
        idioma,
        historial: historialSommelier,
        prueba_token: tokenPrueba,
      }),
    })
    if (!res.ok) {
      setRespuesta(idioma === 'en' ? 'Error contacting the pairing guide. Please try again.' : 'Error al consultar ArmonIA. Inténtalo de nuevo.')
      setCargandoIA(false)
      return
    }
    let textoAcumulado = ''
    await leerStream(
      res,
      chunk => { textoAcumulado += chunk; setRespuesta(textoAcumulado) },
      () => {
        setHistorialSommelier(prev => [
          ...prev,
          { role: 'user', content: msg },
          { role: 'assistant', content: textoAcumulado },
        ])
      }
    )
    setCargandoIA(false)
  }

  function toggleComparador(vino) {
    if (vinosComparador.find(v => v.id === vino.id)) {
      setVinosComparador(vinosComparador.filter(v => v.id !== vino.id))
    } else {
      if (vinosComparador.length >= 4) return
      setVinosComparador([...vinosComparador, vino])
    }
  }
async function cargarPerfiles(vinosACargar) {
  setCargandoPerfiles(true)
  const resultados = await Promise.all(
    vinosACargar.map(async v => {
      try {
  const res = await fetch('/api/perfil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: v.nombre, tipo: v.tipo, region: v.region, uva: v.uva, anada: v.anada, restaurante_id: restaurante.id, prueba_token: tokenPrueba })
  })
  const data = await res.json()
  console.log('Perfil recibido para', v.nombre, ':', JSON.stringify(data))
  return { id: v.id, perfil: data.perfil }
} catch (e) {
  console.log('Error perfil para', v.nombre, ':', e.message)
  return { id: v.id, perfil: { dulzor: 2, acidez: 3, taninos: 3, alcohol: 3, cuerpo: 3, intensidad: 3, final: 3 } }
}
    })
  )
const nuevosPerfiles = {}
resultados.forEach(r => { nuevosPerfiles[r.id] = r.perfil })
console.log('Perfiles a guardar:', JSON.stringify(nuevosPerfiles))
setPerfiles(nuevosPerfiles)
  setCargandoPerfiles(false)
}

  // Formateadores de precio dependientes de la configuración del restaurante
  const moneda = restaurante?.carta_mostrar_euro !== false ? ' €' : ''
  const precioBotellaCarta = valor => _formatPrecio(valor, 0) + moneda
  const precioCopaCarta = valor => _formatPrecio(valor, restaurante?.carta_copa_decimales !== false ? 2 : 0) + moneda
  const precioUnidadCarta = (precio, unidad) => `${precio} / ${String(unidad || '').toLowerCase()}`

  const preciosDisponibles = [...new Set(vinos.map(v => v.precio_botella).filter(Boolean).sort((a, b) => a - b))]
  const precioMaximo = preciosDisponibles[preciosDisponibles.length - 1] || 100

  const vinosFiltrados = useMemo(() => vinos.filter(v => {
    const matchTipo = filtro === 'todos' || v.tipo === filtro
    const matchBusqueda = !busqueda || v.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (v.bodega && v.bodega.toLowerCase().includes(busqueda.toLowerCase())) || (v.uva && v.uva.toLowerCase().includes(busqueda.toLowerCase()))
    const matchPrecio = !precioMax || v.precio_botella <= precioMax
    const matchInternacional = !soloInternacional || v.internacional === true
    const matchCopa = !soloCopa || Number(v.precio_copa) > 0
    return matchTipo && matchBusqueda && matchPrecio && matchInternacional && matchCopa
  }), [vinos, filtro, busqueda, precioMax, soloInternacional, soloCopa])

  const tiposDisponibles = [...new Set(vinos.map(v => v.tipo).filter(Boolean))]
  const tiposBaseOrdenados = i.tiposOrdenados || ['tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol', 'sidra']
  const tiposCopaBaseOrdenados = i.tiposPorCopaOrdenados || ['blanco', 'tinto', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol']
  const ordenarTiposDisponibles = orden => [...orden, ...tiposDisponibles]
    .filter((tipo, index, lista) => tipo && tiposDisponibles.includes(tipo) && lista.indexOf(tipo) === index)
  const tiposOrdenados = ordenarTiposDisponibles(tiposBaseOrdenados)
  const tiposPorCopaOrdenados = ordenarTiposDisponibles(tiposCopaBaseOrdenados)
  const tipos = ['todos', ...tiposOrdenados]
  const colorPrimario = restaurante?.color_primario || '#111111'
  const colorAcento = restaurante?.color_acento || colorPrimario
  const fontTitulo = (FONT_MAP[restaurante?.tipografia] || FONT_MAP.serif).family
  const claseTipografia = restaurante?.tipografia === 'garamond' ? styles.fontGaramond : ''

  function heroStyle() {
    const bannerUrl = restaurante?.banner_url || DEFAULT_RESTAURANT_BANNER
    const zoom = restaurante?.banner_url ? restaurante.banner_zoom || 100 : 100
    const x = restaurante?.banner_url ? restaurante.banner_x ?? 50 : 50
    const y = restaurante?.banner_url ? restaurante.banner_y ?? 50 : 50
    return {
      background: colorPrimario,
      '--hero-image': `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${bannerUrl})`,
      '--hero-position': `${x}% ${y}%`,
      '--hero-scale': String(Number(zoom || 100) / 100),
    }
  }

  function renderHeroLogo() {
    if (!restaurante?.logo_url) {
      return (
        <span className={styles.logoFrame}>
          <BrandLogo variant="horizontalDark" className={`${styles.logo} ${styles.logoFallback}`} />
        </span>
      )
    }

    return (
      <span className={styles.logoFrame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Logo configurable del restaurante: puede venir de Supabase u otra URL externa no controlada por next/image. */}
        <img
          src={restaurante.logo_url}
          alt={restaurante.nombre}
          className={styles.logo}
          loading="lazy"
        />
      </span>
    )
  }
  const categoriasBase = ['Entrantes fríos', 'Entrantes calientes', 'Cuchara', 'De la tierra', 'Del mar', 'Tablas']
  const categoriasPlatos = [
    ...categoriasBase.filter(categoria => platos.some(plato => plato.categoria === categoria)),
    ...[...new Set(platos.map(plato => plato.categoria || 'Otros'))].filter(categoria => !categoriasBase.includes(categoria))
  ]
  const normalizarTexto = useCallback(texto => String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), [])
  const busquedaPlatosLimpia = normalizarTexto(busquedaPlatos)
  const platosSommelierFiltrados = platos.filter(plato => {
    if (!busquedaPlatosLimpia) return true
    const texto = normalizarTexto(`${plato.nombre} ${plato.categoria || ''}`)
    return texto.includes(busquedaPlatosLimpia)
  })

  const busquedaVinoSommelierLimpia = normalizarTexto(busquedaVinoSommelier)
  const vinosSommelierFiltrados = vinos
    .filter(vino => vino?.activo !== false && vino?.tipo !== 'sidra' && !isLargeFormatWine(vino) && Number(vino.precio_botella) > 0)
    .filter(vino => {
      const texto = normalizarTexto(`${vino.nombre || ''} ${vino.bodega || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.tipo || ''}`)
      return !busquedaVinoSommelierLimpia || texto.includes(busquedaVinoSommelierLimpia)
    })
    .slice(0, 40)

  const resumenVino = vino => [vino.bodega, vino.uva, vino.region, vino.anada].filter(Boolean).join(' · ')
  const resumenVinoListado = vino => [vino.bodega, vino.uva, vino.anada].filter(Boolean).join(' · ')
  const notaCorta = texto => {
    if (!texto) return ''
    const limpia = texto.replace(/\s+/g, ' ').trim()
    return limpia.length > 120 ? `${limpia.slice(0, 117)}...` : limpia
  }
  const esCoravin = vino => normalizarTexto(vino.notas_cata || '').includes('coravin')
  const mostrarSeleccion = seleccion.length > 0 && !busqueda && filtro === 'todos' && !precioMax && !soloInternacional && !soloCopa
  const filtroActivo = precioMax || filtro !== 'todos' || soloInternacional || soloCopa
  const busquedaOFiltrado = Boolean(busqueda || filtroActivo)
  const vinosPorCopa = vinos.filter(v => Number(v.precio_copa) > 0).length
  const vinosMenos30 = vinos.filter(v => Number(v.precio_botella) > 0 && Number(v.precio_botella) <= 30).length
  const vinosFrescos = vinos.filter(v => ['blanco', 'rosado', 'espumoso', 'generoso'].includes(v.tipo)).length
  const vinosCoravinFiltrados = vinosFiltrados.filter(v => Number(v.precio_copa) > 0 && esCoravin(v))
  const vinosPorCopaFiltrados = vinosFiltrados.filter(v => Number(v.precio_copa) > 0 && !esCoravin(v))

  const ambitoComercial = useCallback((vino) => {
    return commercialScopeForWine(vino, restaurante)
  }, [restaurante])

  const gruposAmbito = useMemo(() => [
    { id: 'local', label: i.gruposAmbito?.local || localWineLabel(restaurante) },
    { id: 'espana', label: i.gruposAmbito?.espana || 'España' },
    { id: 'internacional', label: i.gruposAmbito?.internacional || 'Internacionales' },
    { id: 'sin_origen', label: i.gruposAmbito?.sin_origen || 'Sin D.O. / otros' },
  ], [i.gruposAmbito, restaurante])
  const pareceRosado = useCallback((vino) => {
    const texto = normalizarTexto(textoVinoOrden(vino))
    return ['rose', 'rosado', 'rosat', 'saignee', 'rose de riceys'].some(term => texto.includes(term))
  }, [normalizarTexto])
  const esEspumosoRosado = useCallback((vino) => {
    const texto = normalizarTexto(textoVinoOrden(vino))
    const pareceEspumoso = ['champagne', 'cava', 'corpinnat', 'brut', 'petillant', 'ancestral'].some(term => texto.includes(term))
    return pareceRosado(vino) && pareceEspumoso
  }, [normalizarTexto, pareceRosado])
  const esRosadoTranquilo = useCallback((vino) => (vino.tipo === 'rosado' || (vino.tipo === 'espumoso' && pareceRosado(vino))) && !esEspumosoRosado(vino), [pareceRosado, esEspumosoRosado])
  const esGranFormato = isLargeFormatWine
  const seccionesPdfGoiko = useMemo(() => [
    {
      id: 'pdf-sidras',
      label: 'Sidras / Sagardoak',
      sinRegion: true,
      filtro: vino => vino.tipo === 'sidra' && !esGranFormato(vino),
    },
    {
      id: 'pdf-generosos',
      label: 'Generosos / Ardo oparoak',
      ordenRegiones: ['jerez', 'manzanilla', 'montilla'],
      filtro: vino => vino.tipo === 'generoso' && !esGranFormato(vino),
    },
    {
      id: 'pdf-espumosos-blancos',
      label: 'Espumosos blancos / Apardun txuriak',
      ordenRegiones: ['sin ig', 'cava', 'penedes', 'corpinnat', 'champagne', 'cotes des blancs', 'cotes des bar', 'montagne de reims', 'vallee de la marne', 'vouvray', 'sudsteiermark'],
      filtro: vino => vino.tipo === 'espumoso' && !pareceRosado(vino) && !esGranFormato(vino),
    },
    {
      id: 'pdf-espumosos-rosados',
      label: 'Espumosos rosados / Apardun gorriak',
      ordenRegiones: ['cava', 'corpinnat', 'champagne'],
      filtro: vino => esEspumosoRosado(vino) && !esGranFormato(vino),
    },
    {
      id: 'pdf-rosados',
      label: 'Rosados / Ardo gorriak',
      ordenRegiones: ['navarra', 'manchuela', 'ribera', 'rioja', 'vin de france', 'rose de riceys', 'getariako', 'bizkaiko'],
      filtro: vino => esRosadoTranquilo(vino) && !esGranFormato(vino),
    },
    {
      id: 'pdf-blancos',
      label: 'Blancos / Ardo txuriak',
      ordenRegiones: ['navarra', 'rioja', 'rias baixas', 'ribeiro', 'galicia', 'monterrei', 'valdeorras', 'ribeira sacra', 'bierzo', 'rueda', 'segovia', 'castilla', 'salamanca', 'valdejalon', 'penedes', 'costers del segre', 'alella', 'terra alta', 'cadiz', 'orotava', 'canarias', 'lanzarote', 'irouleguy', 'jurancon', 'sancerre', 'saumur', 'savennieres', 'pouilly', 'vouvray', 'anjou', 'chablis', 'bourgogne', 'chassagne', 'saint romain', 'meursault', 'macon', 'aligote', 'rhone', 'crozes', 'roussillon', 'jura', 'arbois', 'alsace', 'austria', 'mosel', 'dao', 'portugal', 'alemania', 'grecia', 'italia'],
      filtro: vino => (vino.tipo === 'blanco' || vino.tipo === 'naranja') && !esGranFormato(vino),
    },
    {
      id: 'pdf-tintos',
      label: 'Tintos / Ardo beltzak',
      ordenRegiones: ['rioja alavesa', 'rioja alta', 'rioja oriental', 'rioja', 'navarra', 'arlanza', 'valdeorras', 'galicia', 'ribeira sacra', 'ribeiro', 'monterrei', 'rias baixas', 'bierzo', 'ribera', 'castilla', 'mentrida', 'toro', 'valdejalon', 'costers del segre', 'terra alta', 'montsant', 'mallorca', 'manchuela', 'terrerazo', 'jumilla', 'orotava', 'irouleguy', 'madiran', 'bordeaux', 'margaux', 'estephe', 'pessac', 'loire', 'chinon', 'anjou', 'saumur', 'sancerre', 'bourgogne', 'hautes cotes de nuits', 'cotes de nuits', 'aloxe', 'marsannay', 'fixin', 'gevrey', 'nuits saint georges', 'chassagne', 'volnay', 'corton', 'clos vougeot', 'macon', 'beaujolais', 'morgon', 'fleurie', 'jura', 'rhone', 'cotes du rhone', 'crozes', 'saint joseph', 'chateauneuf', 'vivarais', 'brunello', 'barolo', 'romagna', 'chianti', 'siciliana', 'douro', 'bairrada', 'dao', 'alentejo', 'peloponnese', 'primosten'],
      filtro: vino => vino.tipo === 'tinto' && !esGranFormato(vino),
    },
    {
      id: 'pdf-grandes-formatos',
      label: 'Grandes formatos',
      porTipo: true,
      tipos: ['espumoso', 'blanco', 'rosado', 'tinto', 'generoso', 'dulce', 'naranja'],
      filtro: esGranFormato,
    },
  ].map(seccion => ({
    ...seccion,
    vinos: vinosFiltrados.filter(seccion.filtro),
  })).filter(seccion => seccion.vinos.length > 0), [vinosFiltrados, pareceRosado, esEspumosoRosado, esRosadoTranquilo, esGranFormato])

  useEffect(() => {
    if (loading || seccionInicialAplicada || seccionAbierta || busquedaOFiltrado) return
    const timer = setTimeout(() => {
      if (vinosPorCopaFiltrados.length > 0) {
        setSeccionAbierta('copas')
        setSeccionInicialAplicada(true)
        return
      }
      if (estructuraPdfGoiko && seccionesPdfGoiko.length > 0) {
        setSeccionAbierta(seccionesPdfGoiko[0].id)
        setSeccionInicialAplicada(true)
        return
      }
      const primerAmbito = gruposAmbito.find(ambito => vinosFiltrados.some(v => ambitoComercial(v) === ambito.id))
      if (primerAmbito) setSeccionAbierta(primerAmbito.id)
      if (primerAmbito || vinosFiltrados.length > 0) setSeccionInicialAplicada(true)
    }, 0)
    return () => clearTimeout(timer)
  }, [loading, seccionInicialAplicada, seccionAbierta, busquedaOFiltrado, vinosPorCopaFiltrados.length, vinosFiltrados, estructuraPdfGoiko, seccionesPdfGoiko, gruposAmbito, ambitoComercial])

  function prioridadRegion(region, ordenPersonalizado = null) {
    const r = normalizarTexto(region)
    if (ordenPersonalizado?.length) {
      const index = ordenPersonalizado.findIndex(term => r.includes(term))
      if (index >= 0) return index + 1
    }
    const orden = [
      ['rioja', 1],
      ['ribera', 2],
      ['toro', 3],
      ['bierzo', 4],
      ['priorat', 5],
      ['montsant', 6],
      ['jumilla', 7],
      ['yecla', 8],
      ['alicante', 9],
      ['madrid', 10],
      ['gredos', 11],
      ['rias baixas', 12],
      ['rueda', 13],
      ['valdeorras', 14],
      ['ribeiro', 15],
    ]
    return orden.find(([term]) => r.includes(term))?.[1] || 100
  }

  function regionOrden(vino) {
    return canonicalWineRegion(vino)
  }

  function agruparPorRegion(lista, opciones = {}) {
    const grupos = lista.reduce((acc, vino) => {
      const region = regionOrden(vino)
      if (!acc[region]) acc[region] = []
      acc[region].push(vino)
      return acc
    }, {})

    return Object.entries(grupos)
      .sort(([a], [b]) => prioridadRegion(a, opciones.ordenRegiones) - prioridadRegion(b, opciones.ordenRegiones) || a.localeCompare(b, 'es'))
      .map(([region, items]) => ({
        region,
        vinos: opciones.preservarOrden ? items : items.sort((a, b) => Number(a.precio_botella || 0) - Number(b.precio_botella || 0) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
      }))
  }

  function renderBloquePdfGoiko(seccion, opciones = {}) {
    const lista = seccion.vinos
    if (!lista.length) return null
    if (seccion.porTipo) {
      const tiposSeccion = seccion.tipos || tiposOrdenados
      return tiposSeccion.map(tipo => {
        const vinosTipo = lista.filter(v => v.tipo === tipo)
        if (!vinosTipo.length) return null
        return (
          <div key={`${seccion.id}-${tipo}`} className={styles.regionSubgroup}>
            <p className={styles.regionName}>{i.tipoPlural[tipo] || tipo}</p>
            {agruparPorRegion(vinosTipo, { preservarOrden: true }).map(grupoRegion => (
              <div key={`${seccion.id}-${tipo}-${grupoRegion.region}`} className={styles.regionSubgroup}>
                <p className={styles.regionDo}>{grupoRegion.region}</p>
                {grupoRegion.vinos.map(v => renderVinoCard(v, opciones))}
              </div>
            ))}
          </div>
        )
      })
    }
    if (seccion.sinRegion) {
      return (
        <div className={styles.regionGroup}>
          {lista.map(v => renderVinoCard(v, opciones))}
        </div>
      )
    }
    return agruparPorRegion(lista, { ordenRegiones: seccion.ordenRegiones, preservarOrden: true }).map(grupoRegion => (
      <div key={`${seccion.id}-${grupoRegion.region}`} className={styles.regionSubgroup}>
        <p className={styles.regionName}>{grupoRegion.region}</p>
        {grupoRegion.vinos.map(v => renderVinoCard(v, opciones))}
      </div>
    ))
  }

  function renderBloqueAmbito(ambito, lista, opciones = {}) {
    const vinosAmbito = lista.filter(v => ambitoComercial(v) === ambito.id)
    if (!vinosAmbito.length) return null
    return (
      <div key={`${opciones.prefix || 'ambito'}-${ambito.id}`} className={styles.regionGroup}>
        {!opciones.ocultarAmbitoLabel && <h3 className={styles.regionTitle}>{ambito.label}</h3>}
        {(opciones.precioCopaPrincipal ? tiposPorCopaOrdenados : tiposOrdenados).map(tipo => {
          const vinosTipo = vinosAmbito.filter(v => v.tipo === tipo)
          if (!vinosTipo.length) return null
          return (
            <div key={`${opciones.prefix || 'ambito'}-${ambito.id}-${tipo}`} className={styles.regionSubgroup}>
              <p className={styles.regionName}>{i.tipoPlural[tipo]}</p>
              {agruparPorRegion(vinosTipo).map(grupoRegion => (
                <div key={`${opciones.prefix || 'ambito'}-${ambito.id}-${tipo}-${grupoRegion.region}`} className={styles.regionSubgroup}>
                  <p className={styles.regionDo}>{grupoRegion.region}</p>
                  {grupoRegion.vinos.map(v => renderVinoCard(v, opciones))}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  function renderVinoCard(v, opciones = {}) {
    const enComparador = vinosComparador.find(vc => vc.id === v.id)
    const tieneCopa = precioValido(v.precio_copa)
    const tieneBotella = precioValido(v.precio_botella)
    const precioCopaPrincipal = tieneCopa && (opciones.precioCopaPrincipal || !tieneBotella)
    const etiquetas = etiquetasVino(v)
    const recomendadoConsultor = etiquetas.some(etiqueta => etiqueta.tipo === 'consultor')
    const notaSeleccion = notaCorta(limpiarNotaSeleccion(seleccionDeVino(v)?.nota_personal))
    return (
      <article
        key={v.id}
        className={`${styles.wineCard} ${recomendadoConsultor ? styles.wineCardConsultant : ''}`}
        style={enComparador ? { borderColor: colorPrimario } : undefined}
      >
        <div className={styles.wineInfo} onClick={() => abrirFichaVino(v)}>
          <div className={styles.wineTop}>
            <span className={styles.dot} style={{ background: tipoDot[v.tipo] || colorPrimario }} />
            <div className={styles.wineTitleBlock}>
              <h3 className={styles.wineName}>{nombreVinoCarta(v)}</h3>
              {v.anada && <span className={styles.vintagePill}>{v.anada}</span>}
            </div>
          </div>
          {v.bodega && <p className={styles.wineMeta}>{v.bodega}</p>}
          {v.uva && <p className={styles.wineGrape}>{v.uva}</p>}
          {etiquetas.length > 0 && (
            <div className={styles.wineTags}>
              {etiquetas.map(etiqueta => (
                <span
                  key={etiqueta.tipo}
                  className={`${styles.wineTag} ${etiqueta.tipo === 'casa' ? styles.wineTagHouse : ''}`}
                >
                  {etiqueta.texto}
                </span>
              ))}
            </div>
          )}
          {etiquetas.some(etiqueta => etiqueta.tipo === 'consultor') && (
            <p className={styles.consultantSignature}>por @cataconjuanjo · WSET Level 3</p>
          )}
          {notaSeleccion && <p className={styles.wineNotes}>{notaSeleccion}</p>}
        </div>
        <div className={styles.priceBlock}>
          {precioCopaPrincipal ? (
            <>
              <div className={styles.mainPrice}>
                <span className={styles.formattedPrice}>{precioCopaCarta(v.precio_copa)}</span>
                <small>{i.copa}</small>
              </div>
              {tieneBotella && <p className={styles.priceMeta}>{precioUnidadCarta(precioBotellaCarta(v.precio_botella), i.botella)}</p>}
              {tieneBotella && <p className={styles.secondaryPrice}>{precioUnidadCarta(precioBotellaCarta(v.precio_botella), i.botella)}</p>}
              {tieneBotella && <p className={styles.glassPrice}>{precioUnidadCarta(precioBotellaCarta(v.precio_botella), i.botella)}</p>}
            </>
          ) : (
            <>
              <div className={styles.mainPrice}>
                <span className={styles.formattedPrice}>{precioCopaPrincipal ? precioCopaCarta(v.precio_copa) : precioCartaSeguro(v.precio_botella, precioBotellaCarta)}</span>
                <span>{precioCartaSeguro(v.precio_botella, precioBotellaCarta)}</span>
                <small>{i.botella}</small>
              </div>
              {tieneCopa && <p className={styles.priceMeta}>{precioUnidadCarta(precioCopaCarta(v.precio_copa), i.copa)}</p>}
              {tieneCopa && <p className={styles.secondaryPrice}>{precioUnidadCarta(precioCopaCarta(v.precio_copa), i.copa)}</p>}
              {tieneCopa && <p className={styles.glassPrice}>{precioUnidadCarta(precioCopaCarta(v.precio_copa), i.copa)}</p>}
              {tieneBotella && <p className={styles.bottlePrice}>{precioBotellaCarta(v.precio_botella)}</p>}
            </>
          )}
          <button
            className={`${styles.compareButton} ${enComparador ? styles.compareActive : ''}`}
            onClick={() => toggleComparador(v)}
            disabled={vinosComparador.length >= 4 && !enComparador}
            style={enComparador ? { background: colorPrimario, borderColor: colorPrimario } : undefined}
            aria-label={enComparador ? i.quitarComparador : i.añadirComparador}
          >
            {enComparador
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>
              : <span>{i.comparar}</span>
            }
          </button>
        </div>
      </article>
    )
  }

  function limpiarFiltrosCarta() {
    setPrecioMax(null)
    setFiltro('todos')
    setSoloInternacional(false)
    setSoloCopa(false)
    setBusqueda('')
  }

  function aplicarAtajo(id) {
    const yaActivo =
      (id === 'copa' && soloCopa) ||
      (id === 'menos30' && precioMax === 30) ||
      (id === 'frescos' && filtro === 'blanco') ||
      (id === 'espumosos' && filtro === 'espumoso')

    if (yaActivo) { limpiarFiltrosCarta(); return }

    setBusqueda('')
    setSoloInternacional(false)
    setSoloCopa(false)
    setPrecioMax(null)
    setFiltro('todos')
    if (id === 'copa') setSoloCopa(true)
    if (id === 'menos30') setPrecioMax(30)
    if (id === 'frescos') setFiltro('blanco')
    if (id === 'espumosos') setFiltro('espumoso')
    setMostrarFiltros(false)
  }

  function renderEstadoCarta({ title, text, eyebrow = 'Carta Viva', retryable = false, loadingState = false }) {
    return (
      <main className={styles.stateScreen}>
        <section className={styles.stateCard} aria-live="polite">
          {loadingState && <span className={styles.stateSpinner} aria-hidden="true" />}
          <p className={styles.stateEyebrow}>{eyebrow}</p>
          <h1 className={styles.stateTitle}>{title}</h1>
          {text && <p className={styles.stateText}>{text}</p>}
          <div className={styles.stateActions}>
            {retryable && (
              <button type="button" className={styles.stateButton} onClick={reintentarCarga}>
                {i.reintentar}
              </button>
            )}
            <a className={styles.stateLink} href="/cartavinos">
              {i.volverCartaViva}
            </a>
          </div>
        </section>
      </main>
    )
  }

  if (loading) return renderEstadoCarta({
    title: i.cargando,
    text: idioma === 'en' ? 'Preparing the live wine list.' : 'Preparando la carta viva del restaurante.',
    loadingState: true,
  })

  if (loadError?.type === 'network') return renderEstadoCarta({
    title: i.errorCargaTitulo,
    text: i.errorCargaTexto,
    retryable: true,
  })

  if (loadError?.type === 'not_ready') return renderEstadoCarta({
    title: i.cartaRevisionTitulo,
    text: i.cartaRevisionTexto,
    retryable: true,
  })

  if (!restaurante) return renderEstadoCarta({
    title: i.noEncontrado,
    text: i.noEncontradoTexto,
  })

  if (!restaurante.carta_disponible) return renderEstadoCarta({
    title: i.cartaNoDisponible,
    text: i.cartaNoDisponibleTexto,
    retryable: true,
  })

 if (mostrarComparador) {
  const ejes = ['dulzor', 'acidez', 'taninos', 'alcohol', 'cuerpo', 'intensidad', 'final']
  const etiquetas = { dulzor: 'Dulzor', acidez: 'Acidez', taninos: 'Taninos', alcohol: 'Alcohol', cuerpo: 'Cuerpo', intensidad: 'Intensidad', final: 'Final' }
  const coloresVino = ['#7B2D2D', '#C4A55A', '#534AB7', '#4A8C6F']

  function radarPath(perfil, cx, cy, r) {
    const n = ejes.length
    return ejes.map((eje, idx) => {
      const angle = (Math.PI * 2 * idx) / n - Math.PI / 2
      const val = (perfil[eje] || 1) / 5
      const x = cx + r * val * Math.cos(angle)
      const y = cy + r * val * Math.sin(angle)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ') + ' Z'
  }

  function gridPath(level, cx, cy, r) {
    const n = ejes.length
    return ejes.map((_, idx) => {
      const angle = (Math.PI * 2 * idx) / n - Math.PI / 2
      const x = cx + r * level * Math.cos(angle)
      const y = cy + r * level * Math.sin(angle)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ') + ' Z'
  }

  const cx = 150, cy = 150, r = 100

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: colorPrimario, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => setMostrarComparador(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#fff', padding: '0 8px', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>←</button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{i.comparar}</span>
        </div>
        <button onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
          {idioma === 'es' ? 'EN' : 'ES'}
        </button>
      </div>

      <div style={{ padding: '24px 16px' }}>

        {/* Leyenda */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          {vinosComparador.map((v, idx) => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: coloresVino[idx] }} />
              <p style={{ margin: 0, fontSize: 13, color: '#111', fontWeight: 500 }}>{nombreVinoCarta(v)}</p>
            </div>
          ))}
        </div>

        {/* Radar */}
        {cargandoPerfiles || vinosComparador.some(v => !perfiles[v.id]) ? (
  <div style={{ textAlign: 'center', padding: '60px 0' }}>
    <p style={{ fontSize: 12, color: '#bbb', letterSpacing: '0.15em' }}>ANALIZANDO...</p>
  </div>
) : (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '24px', marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
            <svg width={300} height={300} viewBox="0 0 300 300">
              {[0.2, 0.4, 0.6, 0.8, 1].map(level => (
                <path key={level} d={gridPath(level, cx, cy, r)} fill="none" stroke="#f0f0f0" strokeWidth={1} />
              ))}
              {ejes.map((_, idx) => {
                const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
                return <line key={idx} x1={cx} y1={cy} x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)} stroke="#f0f0f0" strokeWidth={1} />
              })}
              {ejes.map((eje, idx) => {
                const angle = (Math.PI * 2 * idx) / ejes.length - Math.PI / 2
                const lx = cx + (r + 20) * Math.cos(angle)
                const ly = cy + (r + 20) * Math.sin(angle)
                return (
                  <text key={eje} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#aaa" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {etiquetas[eje]}
                  </text>
                )
              })}
{vinosComparador.map((v, idx) => {
  const perfil = perfiles[v.id]
  if (!perfil) return null
  const dashPatterns = ['none', '6,3', 'none', '6,3']
  return (
    <path
      key={v.id}
      d={radarPath(perfil, cx, cy, r)}
      fill={coloresVino[idx]}
      fillOpacity={0.12}
      stroke={coloresVino[idx]}
      strokeWidth={idx % 2 === 0 ? 2.5 : 1.5}
      strokeDasharray={dashPatterns[idx]}
    />
  )
})}
            </svg>
          </div>
        )}

        {/* Tabla comparativa */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${vinosComparador.length}, 1fr)`, gap: 1, background: '#f0f0f0', borderRadius: 12, overflow: 'hidden', minWidth: 300 }}>
            <div style={{ background: '#fafafa', padding: '12px 16px' }} />
            {vinosComparador.map((v, idx) => (
              <div key={v.id} style={{ background: '#fff', padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: coloresVino[idx], margin: '0 auto 4px' }} />
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#111' }}>{nombreVinoCarta(v)}</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#bbb' }}>{[v.bodega, v.uva].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
            {ejes.map(eje => (
              <>
                <div key={eje + '_label'} style={{ background: '#fafafa', padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{etiquetas[eje]}</p>
                </div>
                {vinosComparador.map(v => {
                  const val = perfiles[v.id]?.[eje] || 0
                  return (
                    <div key={v.id + eje} style={{ background: '#fff', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} style={{ width: 8, height: 8, borderRadius: '50%', background: n <= val ? colorPrimario : '#f0f0f0' }} />
                      ))}
                    </div>
                  )
                })}
              </>
            ))}
            <div style={{ background: '#fafafa', padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#888' }}>{i.botella}</p>
            </div>
            {vinosComparador.map(v => (
              <div key={v.id + '_precio'} style={{ background: '#fff', padding: '10px 16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#111' }}>{precioCartaSeguro(v.precio_botella, precioBotellaCarta)}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button onClick={() => { setVinosComparador([]); setMostrarComparador(false) }} style={{ width: '100%', background: 'none', border: '1px solid #e8e8e8', padding: '12px', fontSize: 12, color: '#aaa', cursor: 'pointer', borderRadius: 10 }}>
            {i.cerrarComparador}
          </button>
        </div>
      </div>
    </div>
  )
}

  // Vista ficha vino
  if (vinoSeleccionado) return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: colorPrimario, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={cerrarFichaVino} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#fff', padding: '0 8px', minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8 }}>←<span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', opacity: 0.75 }}>Volver</span></button>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{i.fichaVino}</span>
        </div>
        <button onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 12, padding: '4px 10px', borderRadius: 6, cursor: 'pointer' }}>
          {idioma === 'es' ? 'EN' : 'ES'}
        </button>
      </div>
      <div style={{ padding: '32px 24px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: tipoDot[vinoSeleccionado.tipo] }} />
          <span style={{ fontSize: 12, color: '#999', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{i.tipoLabel[vinoSeleccionado.tipo]}</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 300, color: '#111', margin: '0 0 8px', fontFamily: fontTitulo, lineHeight: 1.3 }}>{nombreVinoCarta(vinoSeleccionado)}</h1>
        <p style={{ fontSize: 16, color: '#888', margin: '0 0 32px', fontWeight: 300 }}>{vinoSeleccionado.bodega}</p>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden', marginBottom: 20 }}>
          {[
            { label: i.region, valor: vinoSeleccionado.region },
            { label: i.uva, valor: vinoSeleccionado.uva },
            { label: i.anada, valor: vinoSeleccionado.anada },
            { label: i.copa, valor: vinoSeleccionado.precio_copa ? precioCopaCarta(vinoSeleccionado.precio_copa) : null },
            { label: i.botella, valor: vinoSeleccionado.precio_botella ? precioBotellaCarta(vinoSeleccionado.precio_botella) : null },
          ].filter(f => f.valor).map((f, idx, arr) => (
            <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: idx < arr.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
              <span style={{ fontSize: 14, color: '#aaa' }}>{f.label}</span>
              <span style={{ fontSize: 15, color: '#111', fontWeight: 500 }}>{f.valor}</span>
            </div>
          ))}
        </div>
        {vinoSeleccionado.notas_cata && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '20px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>{i.notasCata}</p>
            <p style={{ fontSize: 15, color: '#444', lineHeight: 1.8, margin: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{vinoSeleccionado.notas_cata}</p>
          </div>
        )}
        <button
          onClick={() => toggleComparador(vinoSeleccionado)}
          style={{
            width: '100%', padding: '14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, letterSpacing: '0.05em',
            background: vinosComparador.find(v => v.id === vinoSeleccionado.id) ? colorPrimario : '#f5f5f5',
            color: vinosComparador.find(v => v.id === vinoSeleccionado.id) ? '#fff' : '#888',
          }}>
          {vinosComparador.find(v => v.id === vinoSeleccionado.id) ? '✓ ' + i.quitarComparador : '+ ' + i.añadirComparador}
        </button>
      </div>
    </div>
  )

  if (vista === 'carta') return (
    <div className={`${styles.shell} ${claseTipografia}`}>
      {restaurante?.modo_prueba && (
        <PreviewModeBanner
          styles={styles}
          approved={previewAprobacion.aprobada}
          approving={previewAprobacion.loading}
          error={previewAprobacion.error}
          onApprove={data => aprobarPreviewPublica('carta', data)}
        />
      )}
      {demoPresentacion && (
        <div className={styles.demoPresentationBar}>
          <span>Vista cliente · Carta</span>
          <a href="/demo/taberna-del-puerto">Volver a la muestra</a>
        </div>
      )}
      <header className={styles.hero} style={heroStyle()}>
        <div className={styles.heroTop}>
          <div>
            {renderHeroLogo()}
            <p className={styles.kicker}>{i.carta}</p>
            <h1 className={styles.title}>{restaurante.nombre}</h1>
            <a className={styles.heroCredit} href="/cartavinos" target="_blank" rel="noreferrer">
              Carta Viva <span style={{fontStyle:'italic',letterSpacing:'0.08em'}}>×</span> @cataconjuanjo
            </a>
            <p className={styles.meta}>{vinos.length} {i.referencias} · {restaurante.ciudad}</p>
            <ExperienceSignal experiencia={restaurante.experiencia_publica} />
          </div>
          <button className={styles.langButton} onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')}>
            {idioma === 'es' ? 'EN' : 'ES'}
          </button>
        </div>

      </header>

      <main className={styles.content}>
        <section className={styles.searchPanel}>
          <div className={styles.searchRow}>
            <input
              className={styles.search}
              type="text"
              placeholder={i.buscar}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <button className={styles.filterButton} onClick={() => setMostrarFiltros(!mostrarFiltros)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
              {i.filtros}
            </button>
          </div>

          {mostrarFiltros && (
            <div className={styles.filters}>
              <div className={styles.chipRow}>
                {tipos.map(tipo => (
                  <button
                    key={tipo}
                    className={`${styles.chip} ${filtro === tipo ? styles.chipActive : ''}`}
                    onClick={() => setFiltro(tipo)}
                    style={filtro === tipo ? { background: colorAcento, borderColor: colorAcento } : undefined}
                  >
                    {tipo === 'todos' ? i.todos : i.tipoLabel[tipo]}
                  </button>
                ))}
              </div>

              <div className={styles.filterLine}>
                <div className={styles.filterMeta}>
                  <span>{i.precioMaximo}</span>
                  <span>{precioMax ? `${precioMax} €` : i.sinLimite}</span>
                </div>
                <input
                  className={styles.range}
                  type="range"
                  min={0}
                  max={precioMaximo}
                  step={5}
                  value={precioMax || precioMaximo}
                  onChange={e => setPrecioMax(parseInt(e.target.value) === precioMaximo ? null : parseInt(e.target.value))}
                  style={{ accentColor: colorPrimario }}
                />
              </div>

              <div className={styles.toggleRow}>
                <span>{i.soloInternacionales}</span>
                <button
                  type="button"
                  className={`${styles.switch} ${soloInternacional ? styles.switchOn : ''}`}
                  onClick={() => setSoloInternacional(!soloInternacional)}
                  style={{ background: soloInternacional ? colorPrimario : '#d8d1c4' }}
                >
                  <span className={styles.switchKnob} />
                </button>
              </div>

              <div className={styles.toggleRow}>
                <span>Solo por copa</span>
                <button
                  type="button"
                  className={`${styles.switch} ${soloCopa ? styles.switchOn : ''}`}
                  onClick={() => setSoloCopa(!soloCopa)}
                  style={{ background: soloCopa ? colorPrimario : '#d8d1c4' }}
                >
                  <span className={styles.switchKnob} />
                </button>
              </div>

              {filtroActivo && (
                <button className={styles.clearButton} onClick={limpiarFiltrosCarta}>
                  {i.limpiarFiltros}
                </button>
              )}
            </div>
          )}
        </section>

        {!busqueda && (
          <section className={styles.shortcutPanel}>
            <button
              className={`${styles.shortcut} ${soloCopa ? styles.shortcutActive : ''}`}
              onClick={() => aplicarAtajo('copa')} disabled={!vinosPorCopa}>
              <span>Por copa</span>
              <small>{soloCopa ? 'Toca para quitar' : `${vinosPorCopa} vinos`}</small>
            </button>
            <button
              className={`${styles.shortcut} ${precioMax === 30 ? styles.shortcutActive : ''}`}
              onClick={() => aplicarAtajo('menos30')} disabled={!vinosMenos30}>
              <span>Menos de 30 €</span>
              <small>{precioMax === 30 ? 'Toca para quitar' : `${vinosMenos30} vinos`}</small>
            </button>
            <button
              className={`${styles.shortcut} ${filtro === 'blanco' ? styles.shortcutActive : ''}`}
              onClick={() => aplicarAtajo('frescos')} disabled={!vinosFrescos}>
              <span>Frescos</span>
              <small>{filtro === 'blanco' ? 'Toca para quitar' : 'Blancos y afines'}</small>
            </button>
            <button className={styles.shortcut} onClick={() => setVista('sommelier')}>
              <span>Para mi comida</span>
              <small>{i.sommelier}</small>
            </button>
          </section>
        )}

        {vinosCoravinFiltrados.length > 0 && filtro === 'todos' && (
          <section className={styles.accordionSection}>
            <button
              type="button"
              className={styles.accordionHead}
              onClick={evento => toggleSeccion('coravin', evento)}
              aria-expanded={soloCopa || busquedaOFiltrado || seccionAbierta === 'coravin'}
            >
              <div>
                <h2 className={styles.sectionTitle}>{i.seleccionCoravin}</h2>
                <p className={styles.sectionSub}>{i.seleccionCoravinSub} - {vinosCoravinFiltrados.length} {i.referencias}</p>
              </div>
              <span className={styles.accordionIcon}>{soloCopa || busquedaOFiltrado || seccionAbierta === 'coravin' ? '-' : '+'}</span>
            </button>
            {(soloCopa || busquedaOFiltrado || seccionAbierta === 'coravin') && gruposAmbito.map(ambito =>
              renderBloqueAmbito(ambito, vinosCoravinFiltrados, { precioCopaPrincipal: true, prefix: 'coravin' })
            )}
          </section>
        )}

        {vinosPorCopaFiltrados.length > 0 && filtro === 'todos' && (
          <section className={styles.accordionSection}>
            <button
              type="button"
              className={styles.accordionHead}
              onClick={evento => toggleSeccion('copas', evento)}
              aria-expanded={soloCopa || busquedaOFiltrado || seccionAbierta === 'copas'}
            >
              <div>
                <h2 className={styles.sectionTitle}>{i.vinosPorCopa || 'Vinos por copa'}</h2>
                <p className={styles.sectionSub}>{vinosPorCopaFiltrados.length} {i.referencias}</p>
              </div>
              <span className={styles.accordionIcon}>{soloCopa || busquedaOFiltrado || seccionAbierta === 'copas' ? '−' : '+'}</span>
            </button>
            {(soloCopa || busquedaOFiltrado || seccionAbierta === 'copas') && gruposAmbito.map(ambito =>
              renderBloqueAmbito(ambito, vinosPorCopaFiltrados, { precioCopaPrincipal: true, prefix: 'copas', ocultarAmbitoLabel: estructuraPdfGoiko })
            )}
          </section>
        )}

        {false && mostrarSeleccion && (
          <section className={styles.selection}>
            {seleccionJuanjo.length > 0 && (
              <div className={styles.selectionGroup}>
              <div className={styles.selectionSource}>
                <span className={styles.selectionSourceMark} style={{ background: colorPrimario }} />
                <div>
                <p className={styles.kicker} style={{ color: '#9b7430', marginBottom: 5 }}>{i.seleccionEspecial}</p>
                <h2 className={styles.sectionTitle}>@cataconjuanjo</h2>
                <p className={styles.sectionSub}>WSET Level 3 · Selección del consultor</p>
              </div>
                </div>
            {seleccionJuanjo.map(s => (
              <article key={s.id} className={styles.featuredCard} onClick={() => abrirFichaVino(s.vinos)}>
                <div className={styles.wineTop}>
                  <span className={styles.dot} style={{ background: tipoDot[s.vinos?.tipo] || colorPrimario }} />
                  <h3 className={styles.wineName}>{nombreVinoCarta(s.vinos)}</h3>
                </div>
                <p className={styles.wineNotes}>{limpiarNotaSeleccion(s.nota_personal)}</p>
                <div className={styles.priceBlock} style={{ marginTop: 12 }}>
                  <p className={styles.wineMeta} style={{ margin: 0 }}>{resumenVino(s.vinos || {})}</p>
                  {precioValido(s.vinos?.precio_botella) && <p className={styles.bottlePrice}>{precioBotellaCarta(s.vinos.precio_botella)}</p>}
                </div>
              </article>
            ))}
            </div>
            )}

            {seleccionRestaurante.length > 0 && (
              <div className={styles.selectionGroup}>
                <div className={styles.selectionSource}>
                  <span className={styles.selectionSourceMark} style={{ background: colorPrimario }} />
                  <div>
                  <p className={styles.kicker} style={{ color: '#9b7430', marginBottom: 5 }}>Recomendación de la casa</p>
                  <h2 className={styles.sectionTitle}>{restaurante?.nombre}</h2>
                  <p className={styles.sectionSub}>Selección directa del restaurante</p>
                </div>
              </div>

            {seleccionRestaurante.map(s => (
              <article key={s.id} className={styles.featuredCard} onClick={() => abrirFichaVino(s.vinos)}>
                <div className={styles.wineTop}>
                  <span className={styles.dot} style={{ background: tipoDot[s.vinos?.tipo] || colorPrimario }} />
                  <h3 className={styles.wineName}>{nombreVinoCarta(s.vinos)}</h3>
                </div>
                <p className={styles.wineNotes}>{limpiarNotaSeleccion(s.nota_personal)}</p>
                <div className={styles.priceBlock} style={{ marginTop: 12 }}>
                  <p className={styles.wineMeta} style={{ margin: 0 }}>{resumenVino(s.vinos || {})}</p>
                  {precioValido(s.vinos?.precio_botella) && <p className={styles.bottlePrice}>{precioBotellaCarta(s.vinos.precio_botella)}</p>}
                </div>
              </article>
            ))}
              </div>
            )}
          </section>
        )}

        {vinosFiltrados.length === 0 && (
          <div className={styles.empty}>{i.sinResultados}</div>
        )}

        {false && vinosFiltrados.some(v => Number(v.precio_copa) > 0) && filtro === 'todos' && (
          <section className={styles.accordionSection}>
            <button
              type="button"
              className={styles.accordionHead}
              onClick={evento => toggleSeccion('copas', evento)}
              aria-expanded={soloCopa || busquedaOFiltrado || seccionAbierta === 'copas'}
            >
              <div>
                <h2 className={styles.sectionTitle}>{i.vinosPorCopa || 'Vinos por copa'}</h2>
                <p className={styles.sectionSub}>{vinosFiltrados.filter(v => Number(v.precio_copa) > 0).length} {i.referencias}</p>
              </div>
              <span className={styles.accordionIcon}>{soloCopa || busquedaOFiltrado || seccionAbierta === 'copas' ? '−' : '+'}</span>
            </button>
            {false && (soloCopa || busquedaOFiltrado || seccionAbierta === 'copas') && tiposPorCopaOrdenados.map(tipo => {
              const grupoTipo = vinosFiltrados.filter(v => v.tipo === tipo && Number(v.precio_copa) > 0)
              if (!grupoTipo.length) return null
              return (
                <div key={`copas-${tipo}`} className={styles.regionGroup}>
                  <h3 className={styles.regionTitle}>{i.tipoPlural[tipo]}</h3>
                  {agruparPorRegion(grupoTipo).map(grupoRegion => (
                    <div key={`copas-${tipo}-${grupoRegion.region}`} className={styles.regionSubgroup}>
                      <p className={styles.regionName}>{grupoRegion.region}</p>
                      {grupoRegion.vinos.map(v => renderVinoCard(v, { precioCopaPrincipal: true }))}
                    </div>
                  ))}
                </div>
              )
            })}
            {(soloCopa || busquedaOFiltrado || seccionAbierta === 'copas') && gruposAmbito.map(ambito =>
              renderBloqueAmbito(ambito, vinosFiltrados.filter(v => Number(v.precio_copa) > 0), { precioCopaPrincipal: true, prefix: 'copas', ocultarAmbitoLabel: estructuraPdfGoiko })
            )}
          </section>
        )}

        {estructuraPdfGoiko ? seccionesPdfGoiko.map(seccion => {
          const abierta = busquedaOFiltrado || seccionAbierta === seccion.id
          return (
            <section key={seccion.id} className={styles.accordionSection}>
              <button
                type="button"
                className={styles.accordionHead}
                onClick={evento => toggleSeccion(seccion.id, evento)}
                aria-expanded={abierta}
              >
                <div>
                  <h2 className={styles.sectionTitle}>{seccion.label}</h2>
                  <p className={styles.sectionSub}>{seccion.vinos.length} {i.referencias}</p>
                </div>
                <span className={styles.accordionIcon}>{abierta ? '−' : '+'}</span>
              </button>
              {abierta && renderBloquePdfGoiko(seccion)}
            </section>
          )
        }) : gruposAmbito.map(ambito => {
          const grupo = vinosFiltrados.filter(v => ambitoComercial(v) === ambito.id)
          if (!grupo.length) return null
          const abierta = busquedaOFiltrado || seccionAbierta === ambito.id
          return (
            <section key={ambito.id} className={styles.accordionSection}>
              <button
                type="button"
                className={styles.accordionHead}
                onClick={evento => toggleSeccion(ambito.id, evento)}
                aria-expanded={abierta}
              >
                <div>
                  <h2 className={styles.sectionTitle}>{ambito.label}</h2>
                  <p className={styles.sectionSub}>{grupo.length} {i.referencias}</p>
                </div>
                <span className={styles.accordionIcon}>{abierta ? '−' : '+'}</span>
              </button>
              {abierta && renderBloqueAmbito(ambito, vinosFiltrados, { prefix: 'carta' })}
            </section>
          )
        })}

        {false && tiposOrdenados.map(tipo => {
          const grupo = vinosFiltrados.filter(v => v.tipo === tipo)
          if (!grupo.length) return null
          const abierta = busquedaOFiltrado || seccionAbierta === tipo
          return (
            <section key={tipo} className={styles.accordionSection}>
              <button
                type="button"
                className={styles.accordionHead}
                onClick={evento => toggleSeccion(tipo, evento)}
                aria-expanded={abierta}
              >
                <div>
                  <h2 className={styles.sectionTitle}>{i.tipoPlural[tipo]}</h2>
                  <p className={styles.sectionSub}>{grupo.length} {i.referencias}</p>
                </div>
                <span className={styles.accordionIcon}>{abierta ? '−' : '+'}</span>
              </button>
              {abierta && agruparPorRegion(grupo).map(grupoRegion => (
                <div key={`${tipo}-${grupoRegion.region}`} className={styles.regionSubgroup}>
                  <p className={styles.regionName}>{grupoRegion.region}</p>
                  {grupoRegion.vinos.map(v => renderVinoCard(v))}
                </div>
              ))}
              {false && grupo.map(v => {
                const enComparador = vinosComparador.find(vc => vc.id === v.id)
                return (
                  <article key={v.id} className={styles.wineCard} style={enComparador ? { borderColor: colorPrimario } : undefined}>
                    <div className={styles.wineInfo} onClick={() => abrirFichaVino(v)}>
                      <div className={styles.wineTop}>
                        <span className={styles.dot} style={{ background: tipoDot[v.tipo] || colorPrimario }} />
                        <h3 className={styles.wineName}>{nombreVinoCarta(v)}</h3>
                      </div>
                      {resumenVinoListado(v) && <p className={styles.wineMeta}>{resumenVinoListado(v)}</p>}
                    </div>
                    <div className={styles.priceBlock}>
                      {precioValido(v.precio_copa) && <p className={styles.glassPrice}>{precioUnidadCarta(precioCopaCarta(v.precio_copa), i.copa.toLowerCase())}</p>}
                      {precioValido(v.precio_botella) && <p className={styles.bottlePrice}>{precioBotellaCarta(v.precio_botella)}</p>}
                      <button
                        className={`${styles.compareButton} ${enComparador ? styles.compareActive : ''}`}
                        onClick={() => toggleComparador(v)}
                        disabled={vinosComparador.length >= 4 && !enComparador}
                        style={enComparador ? { background: colorPrimario, borderColor: colorPrimario } : undefined}
                        aria-label={enComparador ? i.quitarComparador : i.añadirComparador}
                      >
                        {enComparador ? '✓' : '+'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </section>
          )
        })}
      </main>

      {vinosComparador.length > 0 && (
        <div className={styles.compareBar} style={{ background: colorPrimario }}>
          <p className={styles.compareText}>{vinosComparador.length} {i.vinosSeleccionados}</p>
          <button
            className={styles.compareAction}
            onClick={() => { setMostrarComparador(true); cargarPerfiles(vinosComparador) }}
            style={{ color: colorPrimario }}
          >
            {i.comparar} →
          </button>
        </div>
      )}

      <footer className={styles.brandCredit}>
        <p className={styles.priceLegal}>{restaurante?.carta_pie_texto || 'Los precios de esta carta están indicados en Euros € e incluyen el 10% de IVA.'}</p>
        <a href="/cartavinos" target="_blank" rel="noreferrer">Carta Viva <span style={{fontStyle:'italic',letterSpacing:'0.08em'}}>×</span> @cataconjuanjo</a>
      </footer>

      <nav className={styles.bottomNav}>
        <button className={`${styles.bottomNavBtn} ${styles.bottomNavActive}`} onClick={() => setVista('carta')} style={{ color: colorPrimario, borderTopColor: colorPrimario }}>{i.carta}</button>
        <button className={styles.bottomNavBtn} onClick={() => setVista('sommelier')} style={{ background: '#c9a84c', color: '#fff', borderTop: '3px solid #a8893a', fontWeight: 900 }}>{i.sommelier} ✦</button>
      </nav>
    </div>
  )

  if (vista === 'sommelier') return (
    <div className={`${styles.shell} ${claseTipografia}`}>
      {restaurante?.modo_prueba && (
        <PreviewModeBanner
          styles={styles}
          approved={previewAprobacion.aprobada}
          approving={previewAprobacion.loading}
          error={previewAprobacion.error}
          onApprove={data => aprobarPreviewPublica('carta', data)}
        />
      )}
      {demoPresentacion && (
        <div className={styles.demoPresentationBar}>
          <span>Vista cliente · ArmonIA</span>
          <a href="/demo/taberna-del-puerto">Volver a la muestra</a>
        </div>
      )}
      <header className={styles.hero} style={heroStyle()}>
        <div className={styles.heroTop}>
          <div>
            {renderHeroLogo()}
            <p className={styles.kicker}>{i.sommelier}</p>
            <h1 className={styles.title}>{restaurante.nombre}</h1>
            <a className={styles.heroCredit} href="/cartavinos" target="_blank" rel="noreferrer">
              Carta Viva <span style={{fontStyle:'italic',letterSpacing:'0.08em'}}>×</span> @cataconjuanjo
            </a>
            <p className={styles.meta}>{restaurante.ciudad} · {platos.length} platos disponibles</p>
            <ExperienceSignal experiencia={restaurante.experiencia_publica} />
          </div>
          <button className={styles.langButton} onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')}>
            {idioma === 'es' ? 'EN' : 'ES'}
          </button>
        </div>

      </header>

      <main className={styles.content}>
        <section className={styles.sommelierIntro}>
          <h2 className={styles.sommelierTitle}>{modoSommelier === 'quiz' ? i.recomendame : modoSommelier === 'vino' ? i.vinoManda : i.quePedir}</h2>
          <p className={styles.sommelierText}>{modoSommelier === 'quiz' ? i.quizSubtitulo : modoSommelier === 'vino' ? i.vinoMandaSub : i.seleccionaPlatos}</p>
          <div className={styles.journeyStrip} aria-label={idioma === 'en' ? 'Recommendation steps' : 'Pasos de la recomendación'}>
            <span className={modoSommelier === 'platos' && !platosSeleccionados.length ? styles.journeyActive : ''}><b>1</b>{idioma === 'en' ? 'Choose' : 'Elige'}</span>
            <span className={modoSommelier === 'platos' && platosSeleccionados.length > 0 && !respuesta ? styles.journeyActive : ''}><b>2</b>{idioma === 'en' ? 'Adjust' : 'Ajusta'}</span>
            <span className={respuesta || respuestaQuiz ? styles.journeyActive : ''}><b>3</b>{idioma === 'en' ? 'Enjoy' : 'Decide'}</span>
          </div>
          <div className={styles.sommelierModeTabs}>
            {[
              { id: 'platos', label: i.porPlatos },
              { id: 'quiz', label: i.recomendame },
              { id: 'vino', label: i.vinoManda },
            ].map(m => (
              <button
                key={m.id}
                className={modoSommelier === m.id ? styles.sommelierModeActive : ''}
                onClick={() => { setModoSommelier(m.id); setRespuesta(''); setRespuestaQuiz(''); setHistorialSommelier([]); setInputSeguimiento('') }}
                style={modoSommelier === m.id ? { background: colorAcento } : undefined}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {modoSommelier === 'quiz' && (() => {
          const preguntas = [
            { id: 'tipo', q: i.quizQ1, ops: [
              { v: 'blanco', l: i.tipoLabel.blanco }, { v: 'tinto', l: i.tipoLabel.tinto }, { v: 'espumoso', l: i.tipoLabel.espumoso },
              { v: 'rosado', l: i.tipoLabel.rosado }, { v: 'generoso', l: i.tipoLabel.generoso }, { v: null, l: idioma === 'en' ? 'No preference' : 'Me da igual' },
            ]},
            { id: 'estilo', q: i.quizQ2, ops: [
              { v: 'fresco', l: idioma === 'en' ? 'Fresh & light' : 'Fresco y ligero' },
              { v: 'cuerpo', l: idioma === 'en' ? 'Medium-bodied' : 'Con cuerpo' },
              { v: 'potente', l: idioma === 'en' ? 'Full & powerful' : 'Potente' },
              { v: 'dulce', l: idioma === 'en' ? 'Sweet' : 'Dulce' },
            ]},
            { id: 'comida', q: i.quizQ3, ops: [
              { v: 'pescado', l: idioma === 'en' ? 'Fish / seafood' : 'Pescado / marisco' },
              { v: 'carne', l: idioma === 'en' ? 'Meat / stew' : 'Carne / guiso' },
              { v: 'ligero', l: idioma === 'en' ? 'Light bites' : 'Algo ligero' },
              { v: 'solo', l: idioma === 'en' ? 'Just the wine' : 'Solo el vino' },
              { v: 'variado', l: idioma === 'en' ? 'Sharing / mixed' : 'Variado / compartimos' },
            ]},
            { id: 'precio', q: i.quizQ4, ops: [
              { v: '25', l: idioma === 'en' ? 'Up to 25€' : 'Hasta 25€' },
              { v: '50', l: idioma === 'en' ? 'Up to 50€' : 'Hasta 50€' },
              { v: '100', l: idioma === 'en' ? 'Up to 100€' : 'Hasta 100€' },
              { v: 'sin', l: idioma === 'en' ? 'No limit' : 'Sin límite' },
            ]},
          ]
          const preguntaActual = preguntas[pasoQuiz - 1]
          return (
            <section className={styles.selectedPanel} style={{ maxWidth: 480 }}>
              {pasoQuiz <= 4 ? (
                <>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                    {[1,2,3,4].map(n => (
                      <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= pasoQuiz ? colorAcento : '#e8e8e8' }} />
                    ))}
                  </div>
                  <p className={styles.selectedHead} style={{ fontSize: 17, marginBottom: 16 }}>{preguntaActual.q}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {preguntaActual.ops.map(op => (
                      <button key={String(op.v)} onClick={() => responderQuiz(preguntaActual.id, op.v)} style={{
                        padding: '13px 16px', border: `1px solid ${respuestasQuiz[preguntaActual.id] === op.v ? colorAcento : '#e8e8e8'}`,
                        borderRadius: 10, cursor: 'pointer', fontSize: 15, textAlign: 'left', fontWeight: 300,
                        background: respuestasQuiz[preguntaActual.id] === op.v ? colorAcento : '#fff',
                        color: respuestasQuiz[preguntaActual.id] === op.v ? '#fff' : '#333',
                      }}>
                        {op.l}
                      </button>
                    ))}
                  </div>
                  {pasoQuiz > 1 && (
                    <button onClick={() => setPasoQuiz(pasoQuiz - 1)} style={{ marginTop: 14, background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 13 }}>
                      {i.quizAtras}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {preguntas.map(p => {
                      const op = p.ops.find(o => o.v === respuestasQuiz[p.id])
                      return op ? <span key={p.id} style={{ background: colorAcento, color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12 }}>{op.l}</span> : null
                    })}
                  </div>
                  {cargandoIA && !respuestaQuiz && <p className={styles.sommelierText}>{i.consultando}</p>}
                  {respuestaQuiz && (
                    <p className={styles.answerText} style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{respuestaQuiz}</p>
                  )}
                  <button onClick={reiniciarQuiz} className={styles.clearButton} style={{ color: '#fffaf3', borderColor: 'rgba(255,250,243,0.2)', marginTop: 8 }}>
                    {i.quizEmpezar}
                  </button>
                </>
              )}
            </section>
          )
        })()}

        {modoSommelier === 'vino' && (
          <section className={styles.selectedPanel}>
            <p className={styles.selectedHead}>{vinoMandatoCliente ? i.vinoElegido : i.eligeVino}</p>

            {vinoMandatoCliente ? (
              <article className={styles.wineChoiceCard} onClick={() => abrirFichaVino(vinoMandatoCliente)}>
                <div>
                  <h3>{nombreVinoCarta(vinoMandatoCliente)}</h3>
                  <p>{[vinoMandatoCliente.bodega, vinoMandatoCliente.uva, vinoMandatoCliente.region].filter(Boolean).join(' · ')}</p>
                </div>
                <strong>{precioBotellaCarta(vinoMandatoCliente.precio_botella)}</strong>
              </article>
            ) : (
              <>
                <input
                  className={styles.darkSearch}
                  type="text"
                  placeholder={i.buscarVino}
                  value={busquedaVinoSommelier}
                  onChange={e => setBusquedaVinoSommelier(e.target.value)}
                />
                <div className={styles.wineChoiceList}>
                  {vinosSommelierFiltrados.map(vino => (
                    <button
                      key={vino.id}
                      type="button"
                      className={styles.wineChoiceButton}
                      onClick={() => { setVinoMandatoCliente(vino); setRespuesta(''); setHistorialSommelier([]) }}
                    >
                      <span className={styles.dot} style={{ background: tipoDot[vino.tipo] || colorPrimario }} />
                      <span>
                        <strong>{nombreVinoCarta(vino)}</strong>
                        <em>{[vino.bodega, vino.uva, vino.region].filter(Boolean).join(' · ')}</em>
                      </span>
                      <b>{precioBotellaCarta(vino.precio_botella)}</b>
                    </button>
                  ))}
                </div>
              </>
            )}

            {vinoMandatoCliente && (
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                <button
                  className={styles.recommendButton}
                  onClick={preguntarPlatosParaVino}
                  disabled={cargandoIA}
                  style={{ background: cargandoIA ? '#8d8578' : colorAcento }}
                >
                  {cargandoIA ? i.consultando : i.platosParaVino}
                </button>
                <button
                  className={styles.clearButton}
                  onClick={() => { setVinoMandatoCliente(null); setRespuesta(''); setHistorialSommelier([]) }}
                  style={{ color: '#fffaf3', borderColor: 'rgba(255,250,243,0.2)' }}
                >
                  {i.nuevaConsulta}
                </button>
              </div>
            )}

            {respuesta && (
              <div className={styles.answerBox}>
                <p className={styles.selectedHead}>{i.sommelier}</p>
                <p className={styles.answerText}>{respuesta}</p>
              </div>
            )}
          </section>
        )}

        {modoSommelier === 'platos' && <section className={styles.dishSearchPanel}>
          <div className={styles.searchRow}>
            <input
              className={styles.search}
              type="text"
              placeholder={i.buscarPlato}
              value={busquedaPlatos}
              onChange={e => setBusquedaPlatos(e.target.value)}
            />
            {busquedaPlatos && (
              <button
                type="button"
                className={styles.filterButton}
                onClick={() => setBusquedaPlatos('')}
              >
                {i.limpiarFiltros}
              </button>
            )}
          </div>
        </section>}

        {modoSommelier === 'platos' && platosSeleccionados.length > 0 && (
          <section className={styles.selectedPanel} id="seleccion-sommelier">
            <p className={styles.selectedHead}>{i.tuSeleccion}</p>
            {platosSeleccionados.map((p, idx) => (
              <div
                key={p.id || idx}
                className={styles.selectedDish}
                onClick={() => setPlatosSeleccionados(platosSeleccionados.filter((_, j) => j !== idx))}
              >
                <p className={styles.selectedDishName}>{p.nombre}</p>
                <span className={styles.selectedRemove}>×</span>
              </div>
            ))}

            <p className={styles.selectedHead} style={{ marginTop: 14 }}>{i.comoQuieres}</p>
            <div className={styles.modeGrid}>
              {[
                { id: 'botella', label: i.unaBotella, desc: i.paraMesa },
                { id: 'copa', label: i.porCopas, desc: i.porPlato },
                { id: 'sucesion', label: i.sucesionCopas, desc: i.arcoPlato },
              ].map(m => (
                <button
                  key={m.id}
                  className={`${styles.modeButton} ${modoMesa === m.id ? styles.modeButtonActive : ''}`}
                  onClick={() => setModoMesa(m.id)}
                >
                  <span className={styles.modeLabel}>{m.label}</span>
                  <span className={styles.modeDesc}>{m.desc}</span>
                </button>
              ))}
            </div>

            <button
              className={styles.recommendButton}
              onClick={preguntarSommelier}
              disabled={cargandoIA}
              style={{ background: cargandoIA ? '#8d8578' : colorAcento }}
            >
              {cargandoIA ? i.consultando : i.pedirRecomendacion}
            </button>

            {respuesta && (
              <div className={styles.answerBox} aria-live="polite">
                <p className={styles.selectedHead}>{i.sommelier}</p>
                <p className={styles.answerText}>{respuesta}</p>

                <div className={styles.answerActions}>
                  <button type="button" onClick={() => setVista('carta')}>{i.carta}</button>
                  <button type="button" onClick={() => { setRespuesta(''); setPlatosSeleccionados([]); setHistorialSommelier([]) }}>
                    {i.nuevaConsulta}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {modoSommelier === 'platos' && platosSommelierFiltrados.length === 0 && (
          <div className={styles.empty}>{i.sinPlatos}</div>
        )}

        {modoSommelier === 'platos' && categoriasPlatos.map(categoria => {
          const grupo = platosSommelierFiltrados.filter(p => (p.categoria || 'Otros') === categoria)
          if (!grupo.length) return null
          const abierta = Boolean(busquedaPlatosLimpia) || categoriaPlatoAbierta === categoria
          const seleccionadosEnCategoria = grupo.filter(plato => platosSeleccionados.some(s => s.id === plato.id)).length
          return (
            <section key={categoria} className={styles.accordionSection}>
              <button
                type="button"
                className={styles.accordionHead}
                onClick={() => setCategoriaPlatoAbierta(categoriaPlatoAbierta === categoria ? '' : categoria)}
                aria-expanded={abierta}
              >
                <div>
                  <h2 className={styles.sectionTitle}>{categoria}</h2>
                  <p className={styles.sectionSub}>
                    {grupo.length} platos{seleccionadosEnCategoria ? ` · ${seleccionadosEnCategoria} seleccionados` : ''}
                  </p>
                </div>
                <span className={styles.accordionIcon}>{abierta ? '−' : '+'}</span>
              </button>
              {abierta && <div className={styles.dishList}>
                {grupo.map(p => {
                  const seleccionado = platosSeleccionados.some(s => s.id === p.id)
                  return (
                    <article
                      key={p.id}
                      className={`${styles.dishCard} ${seleccionado ? styles.dishSelected : ''}`}
                      onClick={() => {
                        if (seleccionado) setPlatosSeleccionados(platosSeleccionados.filter(s => s.id !== p.id))
                        else setPlatosSeleccionados([...platosSeleccionados, p])
                        setRespuesta('')
                      }}
                    >
                      <div>
                        <h3 className={styles.dishName}>{p.nombre}</h3>
                      </div>
                      <div>
                        {Number(p.precio) > 0 && <p className={styles.dishPrice}>{Number(p.precio).toFixed(2)} €</p>}
                        <span className={styles.dishAdd} style={{ color: seleccionado ? colorPrimario : '#c7b99a' }}>
                          {seleccionado ? '✓' : '+'}
                        </span>
                      </div>
                    </article>
                  )
                })}
              </div>}
            </section>
          )
        })}
      </main>

      {modoSommelier === 'platos' && platosSeleccionados.length > 0 && !respuesta && (
        <div className={styles.selectionDock}>
          <div>
            <strong>{platosSeleccionados.length}</strong>
            <span>{idioma === 'en' ? 'dishes selected' : platosSeleccionados.length === 1 ? 'plato seleccionado' : 'platos seleccionados'}</span>
          </div>
          <button type="button" onClick={irASeleccionSommelier}>
            {idioma === 'en' ? 'Continue' : 'Continuar'}
          </button>
        </div>
      )}

      <nav className={styles.bottomNav}>
        <button className={styles.bottomNavBtn} onClick={() => setVista('carta')}>{i.carta}</button>
        <button className={`${styles.bottomNavBtn} ${styles.bottomNavActive}`} onClick={() => setVista('sommelier')} style={{ background: colorPrimario, color: '#fff', borderTop: `3px solid ${colorPrimario}`, fontWeight: 900 }}>{i.sommelier} ✦</button>
      </nav>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-fondo, #fafafa)', fontFamily: 'system-ui, sans-serif', paddingBottom: 80 }}>
      {restaurante?.modo_prueba && (
        <PreviewModeBanner
          styles={styles}
          approved={previewAprobacion.aprobada}
          approving={previewAprobacion.loading}
          error={previewAprobacion.error}
          onApprove={data => aprobarPreviewPublica('carta', data)}
        />
      )}

      {/* Header */}
      <div style={{ background: colorPrimario, padding: '36px 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            {restaurante.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- Logo configurable del restaurante en vista legacy.
              <img src={restaurante.logo_url} alt={restaurante.nombre} loading="lazy" style={{ height: 48, maxWidth: 160, objectFit: 'contain', marginBottom: 16, display: 'block' }} />
            )}
            <h1 style={{ fontSize: 30, fontWeight: 300, color: '#fff', margin: '0 0 6px', fontFamily: fontTitulo }}>{restaurante.nombre}</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{vinos.length} {i.referencias} · {restaurante.ciudad}</p>
            {restaurante.experiencia_publica && (
              <div style={{ marginTop: 14, borderLeft: '2px solid rgba(255,250,243,0.52)', paddingLeft: 12, maxWidth: 420 }}>
                <p style={{ margin: '0 0 4px', color: 'rgba(255,250,243,0.64)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{restaurante.experiencia_publica.badge}</p>
                <strong style={{ display: 'block', color: '#fffaf3', fontSize: 17, lineHeight: 1.18 }}>{restaurante.experiencia_publica.headline}</strong>
                <p style={{ margin: '5px 0 0', color: 'rgba(255,250,243,0.72)', fontSize: 12, lineHeight: 1.45 }}>{restaurante.experiencia_publica.text}</p>
              </div>
            )}
          </div>
          <button onClick={() => setIdioma(idioma === 'es' ? 'en' : 'es')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 13, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, marginTop: 4 }}>
            {idioma === 'es' ? 'EN' : 'ES'}
          </button>
        </div>
      </div>


      {vista === 'carta' && (
        <div>
          {/* Buscador */}
          <div style={{ padding: '12px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder={i.buscar}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ flex: 1, padding: '11px 14px', border: '1px solid #e8e8e8', borderRadius: 10, fontSize: 15, outline: 'none', color: '#111', background: '#fafafa' }}
              />
              <button onClick={() => setMostrarFiltros(!mostrarFiltros)} style={{
                padding: '11px 16px', borderRadius: 10, cursor: 'pointer',
                background: mostrarFiltros ? `${colorPrimario}12` : '#fafafa',
                color: mostrarFiltros ? colorPrimario : '#888',
                border: `1px solid ${mostrarFiltros ? colorPrimario : '#e8e8e8'}`,
                fontWeight: mostrarFiltros ? 600 : 400, fontSize: 13,
              }}>
                {i.filtros}{filtroActivo ? ' ·' : ''}
              </button>
            </div>

            {mostrarFiltros && (
              <div style={{ paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {tipos.map(t => (
                    <button key={t} onClick={() => setFiltro(t)} style={{
                      padding: '6px 16px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      background: filtro === t ? colorPrimario : 'transparent',
                      color: filtro === t ? '#fff' : '#aaa',
                      border: filtro === t ? `1px solid ${colorPrimario}` : '1px solid #e8e8e8'
                    }}>
                      {t === 'todos' ? i.todos : i.tipoLabel[t]}
                    </button>
                  ))}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{i.precioMaximo}</span>
                    <span style={{ fontSize: 13, color: '#111', fontWeight: 500 }}>{precioMax ? `${precioMax} €` : i.sinLimite}</span>
                  </div>
                  <input type="range" min={0} max={precioMaximo} step={5}
                    value={precioMax || precioMaximo}
                    onChange={e => setPrecioMax(parseInt(e.target.value) === precioMaximo ? null : parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: colorPrimario }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{i.soloInternacionales}</span>
                  <div onClick={() => setSoloInternacional(!soloInternacional)} style={{
                    width: 38, height: 22, borderRadius: 11, background: soloInternacional ? colorPrimario : '#e0e0e0',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: soloInternacional ? 18 : 2, transition: 'left 0.2s' }} />
                  </div>
                </div>
                {(precioMax || filtro !== 'todos') && (
                  <button onClick={() => { setPrecioMax(null); setFiltro('todos'); setSoloInternacional(false) }} style={{
                    marginTop: 10, background: 'none', border: 'none', fontSize: 12, color: '#aaa',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0
                  }}>
                    {i.limpiarFiltros}
                  </button>
                )}
              </div>
            )}
          </div>
{/* Selección especial */}
{seleccion.length > 0 && !busqueda && filtro === 'todos' && !precioMax && (
  <div style={{ padding: '16px 16px 0' }}>

    {/* Cabecera selección */}
    {seleccionJuanjo.length > 0 && <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <div style={{ width: 3, height: 36, background: colorPrimario, borderRadius: 2, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 9, color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 2px' }}>{i.seleccionEspecial}</p>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#111', margin: 0 }}>@cataconjuanjo</p>
          <p style={{ fontSize: 11, color: '#aaa', margin: 0, letterSpacing: '0.04em' }}>WSET Level 3 · Apasionado del vino</p>
        </div>
      </div>
    </div>}

    {/* Vinos */}
    {seleccionJuanjo.map((s) => (
      <div key={s.id}
        onClick={() => abrirFichaVino(s.vinos)}
        style={{ background: '#f5f2ee', borderRadius: 12, padding: '16px', marginBottom: 10, cursor: 'pointer', border: `1px solid ${colorPrimario}22` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[s.vinos?.tipo] || '#888', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#111', flex: 1, fontFamily: fontTitulo }}>{nombreVinoCarta(s.vinos)}</p>
          {precioValido(s.vinos?.precio_botella) && <div style={{ background: colorPrimario, color: '#fff', fontSize: 13, fontWeight: 500, padding: '4px 12px', borderRadius: 20, flexShrink: 0 }}>{precioBotellaCarta(s.vinos.precio_botella)}</div>}
        </div>
        <p style={{ margin: '0 0 10px 18px', fontSize: 13, color: '#555', lineHeight: 1.8, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{limpiarNotaSeleccion(s.nota_personal)}</p>
        <p style={{ margin: '0 0 0 18px', fontSize: 11, color: '#aaa' }}>{s.vinos?.bodega}{s.vinos?.region ? ` · ${s.vinos.region}` : ''}</p>
      </div>
    ))}

    {seleccionRestaurante.length > 0 && (
      <div style={{ margin: seleccionJuanjo.length ? '18px 0 12px' : '0 0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <div style={{ width: 3, height: 36, background: colorPrimario, borderRadius: 2, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 9, color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 2px' }}>Recomendación de la casa</p>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#111', margin: 0 }}>{restaurante?.nombre}</p>
            <p style={{ fontSize: 11, color: '#aaa', margin: 0, letterSpacing: '0.04em' }}>Selección directa del restaurante</p>
          </div>
        </div>
      </div>
    )}

    {seleccionRestaurante.map((s) => (
      <div key={s.id}
        onClick={() => abrirFichaVino(s.vinos)}
        style={{ background: '#f5f2ee', borderRadius: 12, padding: '16px', marginBottom: 10, cursor: 'pointer', border: `1px solid ${colorPrimario}22` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[s.vinos?.tipo] || '#888', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#111', flex: 1, fontFamily: fontTitulo }}>{nombreVinoCarta(s.vinos)}</p>
          {precioValido(s.vinos?.precio_botella) && <div style={{ background: colorPrimario, color: '#fff', fontSize: 13, fontWeight: 500, padding: '4px 12px', borderRadius: 20, flexShrink: 0 }}>{precioBotellaCarta(s.vinos.precio_botella)}</div>}
        </div>
        <p style={{ margin: '0 0 10px 18px', fontSize: 13, color: '#555', lineHeight: 1.8, fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>{limpiarNotaSeleccion(s.nota_personal)}</p>
        <p style={{ margin: '0 0 0 18px', fontSize: 11, color: '#aaa' }}>{s.vinos?.bodega}{s.vinos?.region ? ` · ${s.vinos.region}` : ''}</p>
      </div>
    ))}

    <div style={{ height: 8 }} />
  </div>
)}

          {/* Lista vinos */}
          <div style={{ padding: '0 16px' }}>
            {vinosFiltrados.length === 0 && (
              <p style={{ textAlign: 'center', color: '#bbb', fontSize: 15, padding: '40px 0' }}>{i.sinResultados}</p>
            )}
            {tiposOrdenados.map(tipo => {
              const grupo = vinosFiltrados.filter(v => v.tipo === tipo)
              if (!grupo.length) return null
              return (
                <div key={tipo} style={{ marginTop: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: colorPrimario, letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0, fontFamily: fontTitulo }}>{i.tipoPlural[tipo]}</p>
                    <div style={{ flex: 1, height: 1, background: `${colorPrimario}22` }} />
                  </div>
                  {grupo.map(v => {
                    const enComparador = vinosComparador.find(vc => vc.id === v.id)
                    return (
                      <div key={v.id} style={{
                        background: '#fff', borderRadius: 10, border: `1px solid ${enComparador ? colorPrimario : '#f0f0f0'}`,
                        padding: '14px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12
                      }}>
                        <div onClick={() => abrirFichaVino(v)} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tipoDot[v.tipo], flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#111' }}>{nombreVinoCarta(v)}</p>
                            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#999' }}>
                              {[v.bodega, v.anada].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {precioValido(v.precio_copa) && (
                              <p style={{ margin: '0 0 2px', fontSize: 12, color: '#999' }}>{precioCopaCarta(v.precio_copa)} <span style={{ fontSize: 10, color: '#ccc' }}>{i.copa.toLowerCase()}</span></p>
                            )}
                            {precioValido(v.precio_botella) && <p style={{ margin: 0, fontSize: 16, fontWeight: 500, color: '#111' }}>{precioBotellaCarta(v.precio_botella)} <span style={{ fontSize: 10, color: '#ccc', fontWeight: 400 }}>{i.btl}</span></p>}
                          </div>
                        </div>
                        <button
                          onClick={() => toggleComparador(v)}
                          title={enComparador ? 'Quitar de comparación' : 'Comparar este vino'}
                          style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            cursor: vinosComparador.length >= 4 && !enComparador ? 'not-allowed' : 'pointer',
                            background: enComparador ? colorPrimario : 'transparent',
                            border: enComparador ? 'none' : `1px solid #e0e0e0`,
                            color: enComparador ? '#fff' : '#bbb',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                          }}>
                          {enComparador
                            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20,6 9,17 4,12"/></svg>
                            : <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                  <circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>
                                </svg>
                                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.05em' }}>VS</span>
                              </>
                          }
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div style={{ height: 40 }} />
          </div>
        </div>
      )}

      {vista === 'sommelier' && (
        <div style={{ padding: '24px 16px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 300, fontFamily: fontTitulo, color: '#111', margin: '0 0 6px' }}>
            {modoSommelier === 'quiz' ? i.recomendame : i.quePedir}
          </h2>
          <p style={{ fontSize: 14, color: '#bbb', margin: '0 0 14px', lineHeight: 1.6 }}>
            {modoSommelier === 'quiz' ? i.quizSubtitulo : i.seleccionaPlatos}
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {[{ id: 'platos', label: i.porPlatos }, { id: 'quiz', label: i.recomendame }].map(m => (
              <button key={m.id} onClick={() => { setModoSommelier(m.id); setRespuesta(''); setRespuestaQuiz('') }} style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                background: modoSommelier === m.id ? colorAcento : '#f5f5f5',
                color: modoSommelier === m.id ? '#fff' : '#888', fontWeight: modoSommelier === m.id ? 500 : 400,
              }}>{m.label}</button>
            ))}
          </div>

          {modoSommelier === 'quiz' && (() => {
            const preguntas = [
              { id: 'tipo', q: i.quizQ1, ops: [
              { v: 'blanco', l: i.tipoLabel.blanco }, { v: 'tinto', l: i.tipoLabel.tinto }, { v: 'espumoso', l: i.tipoLabel.espumoso },
                { v: 'rosado', l: i.tipoLabel.rosado }, { v: 'generoso', l: i.tipoLabel.generoso }, { v: null, l: idioma === 'en' ? 'No preference' : 'Me da igual' },
              ]},
              { id: 'estilo', q: i.quizQ2, ops: [
                { v: 'fresco', l: idioma === 'en' ? 'Fresh & light' : 'Fresco y ligero' },
                { v: 'cuerpo', l: idioma === 'en' ? 'Medium-bodied' : 'Con cuerpo' },
                { v: 'potente', l: idioma === 'en' ? 'Full & powerful' : 'Potente' },
                { v: 'dulce', l: idioma === 'en' ? 'Sweet' : 'Dulce' },
              ]},
              { id: 'comida', q: i.quizQ3, ops: [
                { v: 'pescado', l: idioma === 'en' ? 'Fish / seafood' : 'Pescado / marisco' },
                { v: 'carne', l: idioma === 'en' ? 'Meat / stew' : 'Carne / guiso' },
                { v: 'ligero', l: idioma === 'en' ? 'Light bites' : 'Algo ligero' },
                { v: 'solo', l: idioma === 'en' ? 'Just the wine' : 'Solo el vino' },
              ]},
              { id: 'precio', q: i.quizQ4, ops: [
                { v: '25', l: idioma === 'en' ? 'Up to 25€' : 'Hasta 25€' },
                { v: '50', l: idioma === 'en' ? 'Up to 50€' : 'Hasta 50€' },
                { v: '100', l: idioma === 'en' ? 'Up to 100€' : 'Hasta 100€' },
                { v: 'sin', l: idioma === 'en' ? 'No limit' : 'Sin límite' },
              ]},
            ]
            const preguntaActual = preguntas[pasoQuiz - 1]
            return (
              <div style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #f0f0f0', marginBottom: 24 }}>
                {pasoQuiz <= 4 ? (
                  <>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
                      {[1,2,3,4].map(n => (
                        <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: n <= pasoQuiz ? colorAcento : '#e8e8e8' }} />
                      ))}
                    </div>
                    <p style={{ fontSize: 17, fontWeight: 300, color: '#111', margin: '0 0 14px', fontFamily: fontTitulo }}>{preguntaActual.q}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {preguntaActual.ops.map(op => (
                        <button key={String(op.v)} onClick={() => responderQuiz(preguntaActual.id, op.v)} style={{
                          padding: '13px 16px', border: `1px solid ${respuestasQuiz[preguntaActual.id] === op.v ? colorAcento : '#e8e8e8'}`,
                          borderRadius: 10, cursor: 'pointer', fontSize: 15, textAlign: 'left', fontWeight: 300,
                          background: respuestasQuiz[preguntaActual.id] === op.v ? colorAcento : '#fff',
                          color: respuestasQuiz[preguntaActual.id] === op.v ? '#fff' : '#333',
                        }}>
                          {op.l}
                        </button>
                      ))}
                    </div>
                    {pasoQuiz > 1 && (
                      <button onClick={() => setPasoQuiz(pasoQuiz - 1)} style={{ marginTop: 14, background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 13 }}>
                        {i.quizAtras}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {preguntas.map(p => {
                        const op = p.ops.find(o => o.v === respuestasQuiz[p.id])
                        return op ? <span key={p.id} style={{ background: colorAcento, color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12 }}>{op.l}</span> : null
                      })}
                    </div>
                    {cargandoIA && !respuestaQuiz && <p style={{ fontSize: 14, color: '#bbb' }}>{i.consultando}</p>}
                    {respuestaQuiz && (
                      <p style={{ fontSize: 15, color: '#333', lineHeight: 1.8, fontWeight: 300, whiteSpace: 'pre-wrap', margin: '0 0 16px' }}>{respuestaQuiz}</p>
                    )}
                    <button onClick={reiniciarQuiz} style={{ background: 'none', border: '1px solid #e8e8e8', borderRadius: 8, padding: '10px 20px', fontSize: 12, color: '#aaa', cursor: 'pointer' }}>
                      {i.quizEmpezar}
                    </button>
                  </>
                )}
              </div>
            )
          })()}

          {modoSommelier === 'platos' && platosSeleccionados.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, padding: '16px', marginBottom: 24, border: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }}>{i.tuSeleccion}</p>
              {platosSeleccionados.map((p, idx) => (
                <div key={idx} onClick={() => setPlatosSeleccionados(platosSeleccionados.filter((_, j) => j !== idx))} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: idx < platosSeleccionados.length - 1 ? '1px solid #f5f5f5' : 'none', cursor: 'pointer'
                }}>
                  <p style={{ margin: 0, fontSize: 15, color: '#111' }}>{p.nombre}</p>
                  <span style={{ fontSize: 18, color: '#ccc' }}>×</span>
                </div>
              ))}
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 12, color: '#bbb', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>{i.comoQuieres}</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  {[
                    { id: 'botella', label: i.unaBotella, desc: i.paraMesa },
                    { id: 'copa', label: i.porCopas, desc: i.porPlato },
                    { id: 'sucesion', label: i.sucesionCopas, desc: i.arcoPlato },
                  ].map(m => (
                    <button key={m.id} onClick={() => setModoMesa(m.id)} style={{
                      flex: 1, padding: '12px 4px', border: 'none', borderRadius: 10, cursor: 'pointer',
                      background: modoMesa === m.id ? colorPrimario : '#f5f5f5',
                      color: modoMesa === m.id ? '#fff' : '#888',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{m.label}</span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{m.desc}</span>
                    </button>
                  ))}
                </div>
                <button onClick={preguntarSommelier} disabled={cargandoIA} style={{
                  width: '100%', padding: '15px', background: cargandoIA ? '#ccc' : colorAcento,
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: cargandoIA ? 'not-allowed' : 'pointer'
                }}>
                  {cargandoIA ? i.consultando : i.pedirRecomendacion}
                </button>
              </div>
              {respuesta && (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
                  <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 12px' }}>{i.sommelier}</p>
                  <p style={{ fontSize: 16, color: '#333', lineHeight: 1.8, margin: 0, fontWeight: 300, whiteSpace: 'pre-wrap' }}>{respuesta}</p>
                  <button onClick={() => { setRespuesta(''); setPlatosSeleccionados([]); setHistorialSommelier([]) }} style={{
                    marginTop: 12, background: 'none', border: '1px solid #e8e8e8', borderRadius: 8,
                    padding: '10px 20px', fontSize: 12, color: '#aaa', cursor: 'pointer', letterSpacing: '0.05em'
                  }}>
                    {i.nuevaConsulta}
                  </button>
                </div>
              )}
            </div>
          )}

          {modoSommelier === 'platos' && categoriasPlatos.map(categoria => {
            const grupo = platos.filter(p => (p.categoria || 'Otros') === categoria)
            if (!grupo.length) return null
            return (
              <div key={categoria} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: '#bbb', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 10px' }}>{categoria}</p>
                <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                  {grupo.map((p, idx) => {
                    const seleccionado = platosSeleccionados.some(s => s.id === p.id)
                    return (
                      <div key={p.id} onClick={() => {
                        if (seleccionado) setPlatosSeleccionados(platosSeleccionados.filter(s => s.id !== p.id))
                        else setPlatosSeleccionados([...platosSeleccionados, p])
                        setRespuesta('')
                      }} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '15px 16px', borderBottom: idx < grupo.length - 1 ? '1px solid #f8f8f8' : 'none',
                        cursor: 'pointer', background: seleccionado ? '#f9f9f9' : 'transparent'
                      }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 15, color: '#111', fontWeight: seleccionado ? 500 : 400 }}>{p.nombre}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          {Number(p.precio) > 0 && <p style={{ margin: '0 0 4px', fontSize: 12, color: '#999' }}>{Number(p.precio).toFixed(2)} €</p>}
                          <span style={{ fontSize: 20, color: seleccionado ? colorPrimario : '#ddd', lineHeight: 1 }}>
                            {seleccionado ? '✓' : '+'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <footer className={styles.brandCredit}>
        <p className={styles.priceLegal}>{restaurante?.carta_pie_texto || 'Los precios de esta carta están indicados en Euros € e incluyen el 10% de IVA.'}</p>
        <a href="/cartavinos" target="_blank" rel="noreferrer">Carta Viva <span style={{fontStyle:'italic',letterSpacing:'0.08em'}}>×</span> @cataconjuanjo</a>
      </footer>

      {/* Pill comparador — flota sobre la nav */}
      {vinosComparador.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 68, left: 16, right: 16, zIndex: 99,
          background: colorPrimario, borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}>
          <p style={{ margin: 0, fontSize: 13, color: '#fff', fontWeight: 500 }}>
            {vinosComparador.length} {i.vinosSeleccionados}
          </p>
          <button onClick={() => { setMostrarComparador(true); cargarPerfiles(vinosComparador) }} style={{
            background: '#fff', color: colorPrimario, border: 'none',
            padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {i.comparar} →
          </button>
        </div>
      )}

      {/* Navegación inferior */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: '#fff', borderTop: '1px solid #ebebeb',
        display: 'flex',
      }}>
        {[
          { id: 'carta', label: i.carta, icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3h6l-1.5 9h-3L9 3z"/>
              <path d="M10.5 12c0 3 1.5 5 1.5 5s1.5-2 1.5-5"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
              <line x1="9" y1="21" x2="15" y2="21"/>
            </svg>
          )},
          { id: 'sommelier', label: i.sommelier, icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
            </svg>
          )},
        ].map(tab => (
          <button key={tab.id} onClick={() => setVista(tab.id)} style={{
            flex: 1, padding: '10px 8px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            color: vista === tab.id ? colorPrimario : '#c0c0c0',
          }}>
            {tab.icon}
            <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: vista === tab.id ? 700 : 400 }}>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
