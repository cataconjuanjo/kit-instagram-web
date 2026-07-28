'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import styles from './kiosko.module.css'

// ── Constantes ────────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 60_000
const SHOWCASE_INTERVAL_MS = 7_000
const MOBILE_SELECTION_MAX = 6
const COUNTER_ORDERS_IN_DEVELOPMENT = true

const TIPO_LABELS = {
  tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso',
  generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol',
}
const TIPO_COLORS = {
  tinto: '#8B1A1A', blanco: '#C4A843', rosado: '#D4756A', espumoso: '#7AB5C8',
  generoso: '#B47C3C', dulce: '#C4567C', naranja: '#C4843C', sin_alcohol: '#5C9C5C',
}
const TIPO_ORDER = ['tinto','blanco','rosado','espumoso','generoso','dulce','naranja','sin_alcohol']

const FONT_CSS = {
  clasica:  { css: "'Playfair Display', Georgia, serif",    google: 'Playfair+Display:ital,wght@0,400;0,700;1,400' },
  moderna:  { css: "'Inter', system-ui, sans-serif",         google: null },
  elegante: { css: "'Cormorant Garamond', Palatino, serif",  google: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400' },
  natural:  { css: "'Lato', Trebuchet MS, sans-serif",       google: 'Lato:wght@400;700' },
}

const SUGERENCIAS_MARIDAJE = [
  'Jamón Extrem 100% Bellota','Tabla de quesos canarios','Queso con trufa manchega',
  'Carpaccio de pulpo','Langostinos con salsa San Simón','Trio de croquetas',
  'Espárrago con trufa de verano','Gofre de sardinas bravas','Hot dog de pulpo',
]

const OCASIONES_IDS = [
  { id: 'regalo',      emoji: '🎁' },
  { id: 'celebracion', emoji: '🥂' },
  { id: 'casa',        emoji: '🏠' },
]
const PRESUPUESTOS_IDS = [
  { id: 'bajo',  label: 'Hasta 15 €' },
  { id: 'medio', label: '15 – 30 €'  },
  { id: 'alto',  label: '30 – 60 €'  },
  { id: 'libre', label: null },  // label viene de T
]
const ESTILOS_IDS = [
  { id: 'afrutado' },
  { id: 'seco'     },
  { id: 'cuerpo'   },
  { id: 'ligero'   },
  { id: 'espumoso' },
  { id: 'dulce'    },
]

const VIEWS = { WELCOME: 'welcome', BROWSE: 'browse', PAIRING: 'pairing', DETAIL: 'detail', WIZARD: 'wizard', SHOWCASE: 'showcase' }

const IDIOMAS = [
  { id: 'es', label: 'Español', flagClass: 'langFlagEs' },
  { id: 'en', label: 'English', flagClass: 'langFlagGb' },
  { id: 'fr', label: 'Français', flagClass: 'langFlagFr' },
  { id: 'de', label: 'Deutsch', flagClass: 'langFlagDe' },
]

const WELCOME_ACTION_EMOJIS = {
  browse: '🍾',
  choose: '🤔',
  pairing: '🍽️',
}

const MARIDAJE_ICONOS = [
  { icon: '🧀', terms: ['queso', 'trufa', 'manchego', 'manchega', 'curado', 'curada'] },
  { icon: '🥩', terms: ['jamon', 'iberico', 'bellota', 'carne', 'cordero', 'solomillo', 'ternera'] },
  { icon: '🐟', terms: ['pescado', 'sardina', 'atun', 'bacalao', 'merluza'] },
  { icon: '🦞', terms: ['marisco', 'cigala', 'langostino', 'gamba', 'pulpo', 'bogavante'] },
  { icon: '🫒', terms: ['oliva', 'aceituna', 'esparrago', 'verdura', 'ensalada'] },
  { icon: '🍯', terms: ['dulce', 'postre', 'miel', 'chocolate'] },
]

const T = {
  es: {
    explorar: 'Explorar vinos', elegir: 'Ayúdame\na elegir', maridaje: '¿Con qué\nlo tomo?',
    volver: '← Volver', inicio: 'Inicio', atras: 'Atrás', nuevaBusqueda: 'Empezar de nuevo',
    referencias: n => `${n} referencias`, disponibles: n => `${n} disponibles`, destacados: '★ Destacados',
    pairingTitle: '¿Para qué buscas el vino?',
    pairingSub: 'Dinos el plato, momento u ocasión y te recomendamos el vino perfecto de nuestra selección',
    pairingPlaceholder: 'Ej: cigalas a la plancha, cordero asado, queso curado, celebración especial…',
    buscando: '⏳ Consultando…', buscar: '🔍 Buscar vinos', ideasRapidas: 'Ideas rápidas:',
    intentarDeNuevo: 'Intentar de nuevo',
    wizardTitle: 'Ayúdame a elegir',
    q0: '¿Para qué ocasión buscas el vino?', q1: '¿Qué estilo suele gustar?', q2: '¿Cuál es el presupuesto?',
    browseInicio: '← Inicio', buscarPlaceholder: 'Buscar vino, bodega, uva…',
    vinos: n => `${n} vinos`, todos: 'Todos', pais: 'País', region: 'D.O.', precio: 'Precio',
    sinResultados: 'No hay vinos con estos filtros.', limpiarFiltros: 'Limpiar filtros', limpiar: 'Limpiar',
    destacado: '★ Vino destacado', uva: 'Uva', anada: 'Añada', do: 'D.O.', paisLabel: 'País',
    encuentraEn: 'Encuéntralo en', maridaCon: 'Marida con',
    tipoLabels: { tinto:'Tinto', blanco:'Blanco', rosado:'Rosado', espumoso:'Espumoso', generoso:'Generoso', dulce:'Dulce', naranja:'Naranja', sin_alcohol:'Sin alcohol' },
    ocasionLabels: { regalo:'Es un\nregalo', celebracion:'Celebración\no aperitivo', casa:'Para tomar\nen casa' },
    estiloLabels: { afrutado:'🍓 Afrutado', seco:'🍂 Seco y elegante', cuerpo:'💪 Con mucho cuerpo', ligero:'☁️ Ligero y fresco', espumoso:'✨ Espumoso', dulce:'🍯 Dulce o generoso' },
    sinLimite: 'Sin límite', miRango: '🎯 Mi rango', elegirPresupuesto: 'Elige tu presupuesto',
    buscarRango: '🔍 Buscar con este rango →', cancelar: 'Cancelar',
    buscandoVino: '⏳ Buscando el vino perfecto para ti…',
  },
  en: {
    explorar: 'Explore wines', elegir: 'Help me\nchoose', maridaje: 'What goes\nwith it?',
    volver: '← Back', inicio: 'Home', atras: 'Back', nuevaBusqueda: 'Start over',
    referencias: n => `${n} wines`, disponibles: n => `${n} available`, destacados: '★ Featured',
    pairingTitle: 'What are you looking for?',
    pairingSub: 'Tell us the dish, occasion or moment and we\'ll recommend the perfect wine from our selection',
    pairingPlaceholder: 'E.g: grilled prawns, roast lamb, aged cheese, special celebration…',
    buscando: '⏳ Searching…', buscar: '🔍 Find wines', ideasRapidas: 'Quick ideas:',
    intentarDeNuevo: 'Try again',
    wizardTitle: 'Help me choose',
    q0: 'What occasion are you shopping for?', q1: 'What style do you prefer?', q2: 'What\'s your budget?',
    browseInicio: '← Home', buscarPlaceholder: 'Search wine, winery, grape…',
    vinos: n => `${n} wines`, todos: 'All', pais: 'Country', region: 'Region', precio: 'Price',
    sinResultados: 'No wines match these filters.', limpiarFiltros: 'Clear filters', limpiar: 'Clear',
    destacado: '★ Featured wine', uva: 'Grape', anada: 'Vintage', do: 'Region', paisLabel: 'Country',
    encuentraEn: 'Find it at', maridaCon: 'Pairs with',
    tipoLabels: { tinto:'Red', blanco:'White', rosado:'Rosé', espumoso:'Sparkling', generoso:'Fortified', dulce:'Sweet', naranja:'Orange', sin_alcohol:'Alcohol-free' },
    ocasionLabels: { regalo:'A gift', celebracion:'Celebration\nor aperitif', casa:'Drink at\nhome' },
    estiloLabels: { afrutado:'🍓 Fruity', seco:'🍂 Dry & elegant', cuerpo:'💪 Full-bodied', ligero:'☁️ Light & fresh', espumoso:'✨ Sparkling', dulce:'🍯 Sweet or fortified' },
    sinLimite: 'No limit', miRango: '🎯 My range', elegirPresupuesto: 'Choose your budget',
    buscarRango: '🔍 Search this range →', cancelar: 'Cancel',
    buscandoVino: '⏳ Finding the perfect wine for you…',
  },
  fr: {
    explorar: 'Explorer les vins', elegir: 'Aidez-moi\nà choisir', maridaje: 'Avec quoi\nle servir ?',
    volver: '← Retour', inicio: 'Accueil', atras: 'Retour', nuevaBusqueda: 'Recommencer',
    referencias: n => `${n} vins`, disponibles: n => `${n} disponibles`, destacados: '★ En vedette',
    pairingTitle: 'Pour quel plat cherchez-vous ?',
    pairingSub: 'Dites-nous le plat, le moment ou l\'occasion et nous vous recommandons le vin parfait',
    pairingPlaceholder: 'Ex : homard grillé, agneau rôti, fromage affiné, occasion spéciale…',
    buscando: '⏳ Recherche…', buscar: '🔍 Trouver des vins', ideasRapidas: 'Idées rapides :',
    intentarDeNuevo: 'Réessayer',
    wizardTitle: 'Aidez-moi à choisir',
    q0: 'Pour quelle occasion cherchez-vous ?', q1: 'Quel style préférez-vous ?', q2: 'Quel est votre budget ?',
    browseInicio: '← Accueil', buscarPlaceholder: 'Chercher vin, domaine, cépage…',
    vinos: n => `${n} vins`, todos: 'Tous', pais: 'Pays', region: 'Région', precio: 'Prix',
    sinResultados: 'Aucun vin ne correspond à ces filtres.', limpiarFiltros: 'Effacer les filtres', limpiar: 'Effacer',
    destacado: '★ Vin vedette', uva: 'Cépage', anada: 'Millésime', do: 'Région', paisLabel: 'Pays',
    encuentraEn: 'Trouvez-le au', maridaCon: 'S\'accompagne avec',
    tipoLabels: { tinto:'Rouge', blanco:'Blanc', rosado:'Rosé', espumoso:'Pétillant', generoso:'Fortifié', dulce:'Doux', naranja:'Orange', sin_alcohol:'Sans alcool' },
    ocasionLabels: { regalo:'Un cadeau', celebracion:'Fête ou\napéritif', casa:'À déguster\nchez soi' },
    estiloLabels: { afrutado:'🍓 Fruité', seco:'🍂 Sec et élégant', cuerpo:'💪 Corsé', ligero:'☁️ Léger et frais', espumoso:'✨ Pétillant', dulce:'🍯 Doux ou fortifié' },
    sinLimite: 'Sans limite', miRango: '🎯 Ma fourchette', elegirPresupuesto: 'Choisissez votre budget',
    buscarRango: '🔍 Rechercher cette fourchette →', cancelar: 'Annuler',
    buscandoVino: '⏳ Nous cherchons le vin parfait pour vous…',
  },
  de: {
    explorar: 'Weine entdecken', elegir: 'Hilf mir\nwählen', maridaje: 'Womit\nkombinieren?',
    volver: '← Zurück', inicio: 'Start', atras: 'Zurück', nuevaBusqueda: 'Neu starten',
    referencias: n => `${n} Weine`, disponibles: n => `${n} verfügbar`, destacados: '★ Empfohlen',
    pairingTitle: 'Für welches Gericht suchen Sie?',
    pairingSub: 'Sagen Sie uns das Gericht oder den Anlass und wir empfehlen den perfekten Wein',
    pairingPlaceholder: 'Z.B.: Gegrillte Garnelen, Lammbraten, gereifter Käse, besonderer Anlass…',
    buscando: '⏳ Suche…', buscar: '🔍 Weine suchen', ideasRapidas: 'Schnelle Ideen:',
    intentarDeNuevo: 'Erneut versuchen',
    wizardTitle: 'Hilf mir wählen',
    q0: 'Für welchen Anlass suchen Sie?', q1: 'Welchen Stil bevorzugen Sie?', q2: 'Was ist Ihr Budget?',
    browseInicio: '← Start', buscarPlaceholder: 'Wein, Weingut, Traube suchen…',
    vinos: n => `${n} Weine`, todos: 'Alle', pais: 'Land', region: 'Region', precio: 'Preis',
    sinResultados: 'Keine Weine mit diesen Filtern.', limpiarFiltros: 'Filter löschen', limpiar: 'Löschen',
    destacado: '★ Empfohlener Wein', uva: 'Traube', anada: 'Jahrgang', do: 'Region', paisLabel: 'Land',
    encuentraEn: 'Finden Sie es bei', maridaCon: 'Passt zu',
    tipoLabels: { tinto:'Rotwein', blanco:'Weißwein', rosado:'Rosé', espumoso:'Schaumwein', generoso:'Likörwein', dulce:'Süßwein', naranja:'Orangenwein', sin_alcohol:'Alkoholfrei' },
    ocasionLabels: { regalo:'Ein Geschenk', celebracion:'Feier oder\nAperitif', casa:'Für zu\nHause' },
    estiloLabels: { afrutado:'🍓 Fruchtig', seco:'🍂 Trocken & elegant', cuerpo:'💪 Vollmundig', ligero:'☁️ Leicht & frisch', espumoso:'✨ Schaumwein', dulce:'🍯 Süß oder likör' },
    sinLimite: 'Kein Limit', miRango: '🎯 Mein Bereich', elegirPresupuesto: 'Budget wählen',
    buscarRango: '🔍 In diesem Bereich suchen →', cancelar: 'Abbrechen',
    buscandoVino: '⏳ Wir suchen den perfekten Wein für Sie…',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizarTexto(t = '') {
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function iconoMaridaje(texto = '') {
  const normal = normalizarTexto(texto)
  return MARIDAJE_ICONOS.find(item => item.terms.some(term => normal.includes(term)))?.icon || '🍴'
}
function inicialesTienda(nombre = '') {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return 'V'
  return partes.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}
function formatPrecio(p) {
  if (!p) return ''
  return Number(p).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function precioActual(vino) {
  return Number(vino?.precio_oferta || vino?.precio_pvp || 0)
}
function extraerValoresUnicos(vinos, campo) {
  return [...new Set(vinos.map(v => v[campo]).filter(Boolean))].sort()
}
function esColorClaro(hex) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return false
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114)/1000 > 145
}
const ESTILO_ES = {
  afrutado: 'Afrutado', seco: 'Seco y elegante', cuerpo: 'Con mucho cuerpo',
  ligero: 'Ligero y fresco', espumoso: 'Espumoso', dulce: 'Dulce o generoso',
}
function buildWizardQuery(w) {
  const parts = []
  if (w.ocasion === 'regalo')           parts.push('Es un regalo')
  else if (w.ocasion === 'celebracion') parts.push('Para una celebración o aperitivo')
  else if (w.ocasion === 'casa')        parts.push('Para tomar en casa tranquilamente')
  if (w.estilo && ESTILO_ES[w.estilo])  parts.push(`Estilo preferido: ${ESTILO_ES[w.estilo]}`)
  if (w.presupuesto === 'bajo')         parts.push('Presupuesto: hasta 15€')
  if (w.presupuesto === 'medio')        parts.push('Presupuesto: entre 15 y 30€')
  if (w.presupuesto === 'alto')         parts.push('Presupuesto: entre 30 y 60€')
  if (w.presupuesto === 'custom' && w.precioMin != null)
    parts.push(`Presupuesto: entre ${w.precioMin}€ y ${w.precioMax}€`)
  return parts.join('. ')
}

// ── Widget de satisfacción ────────────────────────────────────────────────────

const FEEDBACK_EMOJIS = [
  { emoji: '😢', label: 'Muy malo'   },
  { emoji: '😟', label: 'Malo'       },
  { emoji: '😐', label: 'Regular'    },
  { emoji: '🙂', label: 'Bueno'      },
  { emoji: '😄', label: 'Excelente'  },
]

function FeedbackWidget({ slug }) {
  const [rating,      setRating]      = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [sugerencia,  setSugerencia]  = useState('')
  const [enviando,    setEnviando]    = useState(false)
  const [enviado,     setEnviado]     = useState(false)

  async function enviar(r, sug) {
    setEnviando(true)
    try {
      await fetch(`/api/kiosko/${slug}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: r, sugerencia: sug }),
      })
    } catch {}
    setEnviando(false)
    setEnviado(true)
  }

  async function votar(r) {
    setRating(r)
    if (r <= 2) { setMostrarForm(true) }
    else { await enviar(r, '') }
  }

  if (enviado) return (
    <div className={styles.feedbackThanks}>¡Gracias por tu opinión! 🙏</div>
  )

  return (
    <div className={styles.feedbackWidget}>
      {!mostrarForm ? (
        <>
          <p className={styles.feedbackLabel}>¿Cómo ha sido tu experiencia?</p>
          <div className={styles.feedbackEmojis}>
            {FEEDBACK_EMOJIS.map((f, i) => (
              <button key={i} type="button" className={styles.feedbackEmoji}
                onClick={() => votar(i + 1)} title={f.label} aria-label={f.label}>
                {f.emoji}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.feedbackForm}>
          <p className={styles.feedbackFormTitle}>¿Qué podría mejorar?</p>
          <textarea
            className={styles.feedbackTextarea}
            value={sugerencia}
            onChange={e => setSugerencia(e.target.value)}
            placeholder="Cuéntanos tu experiencia…"
            rows={3}
            autoFocus
          />
          <div className={styles.feedbackFormBtns}>
            <button type="button" className={styles.feedbackCancel}
              onClick={() => { setMostrarForm(false); setRating(null) }}>
              Cancelar
            </button>
            <button type="button" className={styles.feedbackSubmit}
              disabled={enviando || !sugerencia.trim()}
              onClick={() => enviar(rating, sugerencia)}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Slider de precio doble ────────────────────────────────────────────────────

function PriceRangeSlider({ minAll, maxAll, valueMin, valueMax, onChangeMin, onChangeMax, acento }) {
  const range = maxAll - minAll || 1
  const pct1 = ((valueMin - minAll) / range) * 100
  const pct2 = ((valueMax - minAll) / range) * 100

  return (
    <div className={styles.priceSlider}>
      <div className={styles.priceSliderTrack}>
        <div className={styles.priceSliderFill} style={{ left: `${pct1}%`, width: `${pct2 - pct1}%`, background: acento }} />
      </div>
      <div className={styles.priceSliderInputs}>
        <input type="range" min={minAll} max={maxAll} value={valueMin}
          className={styles.priceSliderInput}
          style={{ '--thumb': acento }}
          onChange={e => { const v = Number(e.target.value); if (v < valueMax) onChangeMin(v) }}
        />
        <input type="range" min={minAll} max={maxAll} value={valueMax}
          className={styles.priceSliderInput}
          style={{ '--thumb': acento }}
          onChange={e => { const v = Number(e.target.value); if (v > valueMin) onChangeMax(v) }}
        />
      </div>
      <div className={styles.priceSliderValues}>
        <span>{valueMin} €</span>
        <span>{valueMax} €</span>
      </div>
    </div>
  )
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function KioskIcon({ name }) {
  if (name === 'choose') return (
    <svg className={styles.welcomeActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="17" />
      <path d="M28.5 19.5 20 22l-2.5 8.5 8.5-2.5 2.5-8.5Z" />
      <circle cx="24" cy="24" r="2" />
    </svg>
  )

  if (name === 'pairing') return (
    <svg className={styles.welcomeActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M16 8v16" />
      <path d="M11 8v9c0 4 2 7 5 7s5-3 5-7V8" />
      <path d="M16 24v16" />
      <path d="M31 8c4 3 6 8 5 14-.5 3-2 5-5 6v12" />
      <path d="M29 8v32" />
    </svg>
  )

  return (
    <svg className={styles.welcomeActionSvg} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M21 7h6" />
      <path d="M22 7v9l-5 7v15c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V23l-5-7V7" />
      <path d="M17 28h14" />
      <path d="M18 35h12" />
    </svg>
  )
}

function WelcomeActionIcon({ name, variant }) {
  if (variant === 'lineal') return <KioskIcon name={name} />
  return <span className={styles.welcomeActionEmoji} aria-hidden="true">{WELCOME_ACTION_EMOJIS[name]}</span>
}

function SafeImage({ src, alt, className, fallback, ...props }) {
  const [failedSrc, setFailedSrc] = useState('')
  const failed = Boolean(src && failedSrc === src)

  if (!src || failed) return fallback ?? null

  return (
    <img
      src={src}
      alt={alt || ''}
      className={className}
      onError={() => setFailedSrc(src)}
      {...props}
    />
  )
}

function LogoFallback({ nombre }) {
  return (
    <div className={styles.welcomeLogoFallback} aria-hidden="true">
      {inicialesTienda(nombre)}
    </div>
  )
}

function MobileQrModal({
  selection,
  onClose,
  onRemove,
  colorAcento,
  ordersEnabled = false,
  order,
}) {
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [counterMode, setCounterMode] = useState('options')
  const vinos = selection?.vinos || (selection?.vino ? [selection.vino] : [])
  const total = vinos.reduce((sum, vino) => sum + precioActual(vino), 0)

  useEffect(() => {
    if (!selection?.url || ordersEnabled) {
      queueMicrotask(() => setQrDataUrl(''))
      return
    }
    queueMicrotask(() => setQrDataUrl(''))
    QRCode.toDataURL(selection.url, {
      width: 760,
      margin: 2,
      color: { dark: '#171416', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [ordersEnabled, selection?.url])

  useEffect(() => {
    queueMicrotask(() => {
      setCounterMode('options')
      setCopiado(false)
    })
  }, [selection?.url])

  if (!selection || vinos.length === 0) return null

  async function copiar() {
    try {
      await navigator.clipboard.writeText(selection.url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch {}
  }

  return (
    <div className={styles.mobileQrOverlay} onClick={onClose}>
      <div className={styles.mobileQrPanel} onClick={e => e.stopPropagation()}>
        <button className={styles.mobileQrClose} type="button" onClick={onClose} aria-label="Cerrar">&times;</button>
        <p className={styles.mobileQrEyebrow}>Carrito de vinos</p>
        <h3>{vinos.length} {vinos.length === 1 ? 'vino guardado' : 'vinos guardados'}</h3>
        <p className={styles.mobileQrBodega}>
          {ordersEnabled
            ? 'Elige cómo quieres terminar esta selección en tienda.'
            : 'Cuando termines, escanea este QR para llevarte la lista al móvil.'}
        </p>
        {total > 0 && (
          <div className={styles.mobileQrTotal}>
            <span>Total orientativo</span>
            <strong>{formatPrecio(total)}</strong>
          </div>
        )}
        <div className={styles.mobileQrWineList}>
          {vinos.map(vino => (
            <div key={vino.id} className={styles.mobileQrWineRow}>
              <span>
                <strong>{vino.nombre}</strong>
                {vino.bodega && <small>{vino.bodega}</small>}
              </span>
              {precioActual(vino) > 0 && <em>{formatPrecio(precioActual(vino))}</em>}
              {onRemove && (
                <button type="button" onClick={() => onRemove(vino.id)} aria-label={`Quitar ${vino.nombre}`}>
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
        {ordersEnabled && (
          <div className={styles.counterOrderBox}>
            {order ? (
              <div className={styles.counterOrderSuccess}>
                <span>Pendiente de pago</span>
                <strong>{order.order_code}</strong>
                <p>Ya aparece en caja para cobrar, confirmar disponibilidad y preparar los vinos.</p>
              </div>
            ) : (
              <>
                <div className={styles.counterChoiceList}>
                  <button
                    type="button"
                    className={`${styles.counterChoiceBtn} ${counterMode === 'show' ? styles.counterChoiceActive : ''}`}
                    onClick={() => setCounterMode('show')}
                  >
                    <span>1</span>
                    <strong>Mostrar en caja</strong>
                    <em>El dependiente termina el pedido.</em>
                  </button>
                  <button
                    type="button"
                    className={`${styles.counterChoiceBtn} ${styles.counterChoiceDevelopment}`}
                    disabled
                  >
                    <span>2</span>
                    <strong>
                      Pedir en caja
                      <small>En desarrollo</small>
                    </strong>
                    <em>Estamos pausando esta funcion hasta cerrar bien el flujo operativo.</em>
                  </button>
                  <button
                    type="button"
                    className={`${styles.counterChoiceBtn} ${counterMode === 'payment' ? styles.counterChoiceActive : ''}`}
                    onClick={() => setCounterMode('payment')}
                  >
                    <span>3</span>
                    <strong>Pagar ahora</strong>
                    <em>Pasarela de pago de la tienda.</em>
                  </button>
                </div>
                {counterMode === 'show' && (
                  <div className={styles.counterChoiceNotice}>
                    <strong>Modo caja listo</strong>
                    <p>Enseña esta pantalla al equipo. Puede revisar los vinos de arriba, confirmar precio y terminar la venta.</p>
                  </div>
                )}
                {counterMode === 'payment' && (
                  <div className={styles.counterChoiceNotice}>
                    <strong>Pago online pendiente</strong>
                    <p>Esta opción queda reservada para abrir la pasarela de pago de la tienda cuando la conectemos.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!ordersEnabled && (
          <>
            <div className={styles.mobileQrBox}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR para abrir la seleccion en el movil" className={styles.mobileQrImg} />
                : <div className={styles.mobileQrLoading}>Generando QR...</div>}
            </div>
            <p className={styles.mobileQrHint}>La lista conserva nombres, precios, ubicaciones y notas para enseñarla en caja o guardarla.</p>
            <div className={styles.mobileQrActions}>
              <button type="button" onClick={copiar} style={{ background: colorAcento }}>
                {copiado ? 'Enlace copiado' : 'Copiar enlace'}
              </button>
              <button type="button" onClick={onClose} className={styles.mobileQrSecondary}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function WineCartIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 18h20l-2 21H16L14 18Z" />
      <path d="M18 18c0-5 2.8-8 6-8s6 3 6 8" />
      <path d="M23 22h4" />
      <path d="M24 22v5l-3 4v5h10v-5l-3-4v-5" />
      <path d="M22 32h8" />
    </svg>
  )
}

function MobileSelectionTray({ vinos, notice, onOpen, onClear, colorAcento, ordersEnabled = false }) {
  if (!vinos.length) return null
  const total = vinos.reduce((sum, vino) => sum + precioActual(vino), 0)

  return (
    <div className={styles.mobileSelectionTray}>
      <div className={styles.mobileSelectionCartIcon} aria-hidden="true">
        <WineCartIcon className={styles.mobileSelectionCartSvg} />
        <span>{vinos.length}</span>
      </div>
      <div className={styles.mobileSelectionInfo}>
        <span>Carrito de vinos</span>
        <strong>{notice || `${vinos.length} ${vinos.length === 1 ? 'vino guardado' : 'vinos guardados'}`}</strong>
      </div>
      <div className={styles.mobileSelectionNames}>
        {vinos.slice(0, 3).map(vino => vino.nombre).join(' · ')}
        {vinos.length > 3 ? ` · +${vinos.length - 3}` : ''}
      </div>
      {total > 0 && <div className={styles.mobileSelectionTotal}>{formatPrecio(total)}</div>}
      <button className={styles.mobileSelectionQrBtn} type="button" onClick={onOpen} style={{ background: colorAcento }}>
        {ordersEnabled ? 'Ver opciones' : 'Ver carrito y QR'}
      </button>
      <button className={styles.mobileSelectionClearBtn} type="button" onClick={onClear} aria-label="Vaciar carrito">
        &times;
      </button>
    </div>
  )
}

function BottleMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M21 7h6" />
      <path d="M22 7v9l-5 7v15c0 2 1.5 3 3 3h8c1.5 0 3-1 3-3V23l-5-7V7" />
      <path d="M18 29h12" />
      <path d="M19 36h10" />
    </svg>
  )
}

function LocationMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.4" />
    </svg>
  )
}

function TipoChip({ tipo, size = 'sm' }) {
  return (
    <span className={`${styles.tipoChip} ${size === 'lg' ? styles.tipoChipLg : ''}`} style={{ background: TIPO_COLORS[tipo] || '#666' }}>
      {TIPO_LABELS[tipo] || tipo}
    </span>
  )
}

function WineCardPlaceholder({ tipo }) {
  const color = TIPO_COLORS[tipo] || '#2a2a2a'
  return (
    <div className={styles.cardImgPlaceholder} style={{ background: `linear-gradient(135deg, ${color}33, ${color}88)` }}>
      <BottleMark className={styles.cardImgIcon} />
    </div>
  )
}

function WineCard({ vino, onClick }) {
  return (
    <button className={styles.wineCard} onClick={() => onClick(vino)} type="button">
      <div className={styles.cardImg}>
        <SafeImage
          src={vino.foto_url}
          alt={vino.nombre}
          className={styles.cardImgPhoto}
          loading="lazy"
          fallback={<WineCardPlaceholder tipo={vino.tipo} />}
        />
        {vino.destacado && <span className={styles.cardDestacado}>★ Destacado</span>}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          {vino.tipo && <TipoChip tipo={vino.tipo} />}
          {vino.puntuacion && <span className={styles.cardPuntuacion}>{vino.puntuacion} pts</span>}
        </div>
        <p className={styles.cardNombre}>{vino.nombre}</p>
        {vino.bodega && <p className={styles.cardBodega}>{vino.bodega}</p>}
        <p className={styles.cardMeta}>{[vino.uva, vino.anada, vino.region].filter(Boolean).join(' · ')}</p>
        <div className={styles.cardFooter}>
          {vino.precio_oferta
            ? <span className={styles.cardPrecioOferta}>
                <s className={styles.cardPrecioTachado}>{formatPrecio(vino.precio_pvp)}</s>
                <span className={styles.cardPrecioOfertaValor}>{formatPrecio(vino.precio_oferta)}</span>
                <span className={styles.ofertaBadge}>OFERTA</span>
              </span>
            : vino.precio_pvp && <span className={styles.cardPrecio}>{formatPrecio(vino.precio_pvp)}</span>}
          {vino.ubicacion_estanteria && (
            <span className={styles.cardUbicacion}>
              <LocationMark className={styles.locationIcon} />
              {vino.ubicacion_estanteria}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Ficha de vino enriquecida ─────────────────────────────────────────────────

function WineDetail({ vino, slug, colorAcento, onClose, onMobile, lang = 'es' }) {
  const fichaInicial = useMemo(() => {
    if (!vino?.ficha_ia) return null
    try { return typeof vino.ficha_ia === 'string' ? JSON.parse(vino.ficha_ia) : vino.ficha_ia }
    catch { return null }
  }, [vino?.ficha_ia])

  const [ficha, setFicha] = useState(fichaInicial)
  const [fichaReady, setFichaReady] = useState(!!fichaInicial)
  useEffect(() => {
    // La ficha cacheada es en español — si el idioma es distinto, regeneramos
    if (fichaInicial && lang === 'es') {
      queueMicrotask(() => {
        setFicha(fichaInicial)
        setFichaReady(true)
      })
      return
    }
    queueMicrotask(() => setFichaReady(false))
    fetch(`/api/kiosko/${slug}/ficha/${vino.id}?lang=${lang}`)
      .then(r => r.json())
      .then(d => { if (d.ficha) setFicha(d.ficha) })
      .catch(() => {})
      .finally(() => setFichaReady(true))
  }, [vino?.id, slug, fichaInicial, lang])

  const notasMostrar = ficha?.notas || vino.descripcion || vino.notas_cata

  return (
    <div className={styles.detailOverlay}>
      <div className={styles.detailPanel}>
        {/* Barra superior sticky en móvil */}
        <div className={styles.detailTopBar}>
          <div className={styles.detailHandle} />
          <button className={`${styles.detailClose} ${styles.detailCloseMobile}`} onClick={onClose} type="button" aria-label="Cerrar">✕</button>
        </div>
        {/* Botón de cierre para escritorio */}
        <button className={`${styles.detailClose} ${styles.detailCloseDesktop}`} onClick={onClose} type="button" aria-label="Cerrar">✕</button>
        <div className={styles.detailContent}>
          <div className={styles.detailLeft}>
            <SafeImage
              src={vino.foto_url}
              alt={vino.nombre}
              className={styles.detailPhoto}
              fallback={
                <div className={styles.detailPhotoPlaceholder} style={{ background: `linear-gradient(135deg, ${TIPO_COLORS[vino.tipo] || '#2a2a2a'}44, ${TIPO_COLORS[vino.tipo] || '#2a2a2a'}99)` }}>
                  <BottleMark className={styles.detailPhotoIcon} />
                </div>
              }
            />
            {vino.destacado && <div className={styles.detailDestacado} style={{ color: colorAcento }}>{T[lang].destacado}</div>}
          </div>

          <div className={styles.detailRight}>
            <div className={styles.detailHeader}>
              {vino.tipo && <TipoChip tipo={vino.tipo} size="lg" />}
              {vino.puntuacion && <span className={styles.detailPuntuacion} style={{ color: colorAcento }}>{vino.puntuacion} pts</span>}
            </div>
            <h2 className={styles.detailNombre}>{vino.nombre}</h2>
            {vino.bodega && <p className={styles.detailBodega}>{vino.bodega}</p>}

            <div className={styles.detailMeta}>
              {vino.uva   && <span><strong>{T[lang].uva}</strong> {vino.uva}</span>}
              {vino.anada && <span><strong>{T[lang].anada}</strong> {vino.anada}</span>}
              {vino.region && <span><strong>{T[lang].do}</strong> {vino.region}</span>}
              {vino.pais && vino.pais !== 'España' && <span><strong>{T[lang].paisLabel}</strong> {vino.pais}</span>}
            </div>

            {vino.precio_oferta
              ? <div className={styles.detailPrecioOferta}>
                  <s className={styles.detailPrecioTachado}>{formatPrecio(vino.precio_pvp)}</s>
                  <span className={styles.detailPrecioOfertaValor} style={{ color: colorAcento }}>{formatPrecio(vino.precio_oferta)}</span>
                  <span className={styles.ofertaBadgeLg}>OFERTA</span>
                </div>
              : vino.precio_pvp && <div className={styles.detailPrecio} style={{ color: colorAcento }}>{formatPrecio(vino.precio_pvp)}</div>}

            {vino.ubicacion_estanteria && (
              <div className={styles.detailUbicacion}>
                <span className={styles.detailUbicacionLabel}>{T[lang].encuentraEn}</span>
                <span className={styles.detailUbicacionValor} style={{ color: colorAcento }}>
                  <LocationMark className={styles.locationIcon} />
                  {vino.ubicacion_estanteria}
                </span>
              </div>
            )}

            <button className={styles.mobileCarryBtn} type="button" onClick={() => onMobile?.(vino, 'detail')}>
              <span aria-hidden="true">+</span>
              Añadir al carrito
            </button>

            {/* Notas de cata — skeleton mientras carga */}
            {!fichaReady ? (
              <div className={styles.skelNotas}>
                <div className={styles.skelLine} />
                <div className={styles.skelLine} style={{ width: '82%' }} />
                <div className={styles.skelLine} style={{ width: '68%' }} />
              </div>
            ) : notasMostrar ? (
              <p className={styles.detailNotas + ' ' + styles.detailNotasFadeIn}>{notasMostrar}</p>
            ) : null}

            {/* Datos extra de la ficha IA */}
            {fichaReady && ficha && (
              <div className={styles.fichaExtra}>
                {(ficha.temperatura || ficha.copa) && (
                  <div className={styles.fichaServicio}>
                    {ficha.temperatura && <span>🌡️ {ficha.temperatura}</span>}
                    {ficha.copa && <span>Copa {ficha.copa}</span>}
                  </div>
                )}
                {ficha.maridajes?.length > 0 && (
                  <div className={styles.fichaMaridajes}>
                    <p className={styles.fichaMaridajesLabel}>{T[lang].maridaCon}</p>
                    <div className={styles.fichaMaridajesGrid}>
                      {ficha.maridajes.map((m, i) => (
                        <span key={i} className={styles.fichaMaridajeTag}>
                          <span className={styles.foodPairingTagIcon} aria-hidden="true">{iconoMaridaje(m)}</span>
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {ficha.curiosidad && (
                  <p className={styles.fichaCuriosidad}>💡 {ficha.curiosidad}</p>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Wizard "Ayúdame a elegir" ─────────────────────────────────────────────────

function WizardView({ slug, tienda, colorAcento, colorPrimario, onWineSelect, onMobile, onBack, vinos = [], lang = 'es' }) {
  const [step, setStep]       = useState(0)
  const [wizard, setWizard]   = useState({ ocasion: '', estilo: '', presupuesto: '' })
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError]     = useState('')
  const [mostrarRango, setMostrarRango] = useState(false)

  const wizardPrecios = useMemo(() => {
    const ps = vinos.map(v => v.precio_pvp).filter(Boolean)
    return ps.length ? { min: Math.floor(Math.min(...ps)), max: Math.ceil(Math.max(...ps)) } : { min: 5, max: 200 }
  }, [vinos])
  const [wPrecioMin, setWPrecioMin] = useState(wizardPrecios.min)
  const [wPrecioMax, setWPrecioMax] = useState(wizardPrecios.max)

  function selOcasion(id) { setWizard(w => ({ ...w, ocasion: id })); setStep(1) }
  function selPresupuesto(id) {
    const next = { ...wizard, presupuesto: id }
    if (id === 'custom') {
      next.precioMin = wPrecioMin
      next.precioMax = wPrecioMax
    }
    setWizard(next)
    consultar(next)
  }
  function selEstilo(id) {
    const next = { ...wizard, estilo: id }
    setWizard(next)
    setStep(2)
  }

  async function consultar(w = wizard) {
    const q = buildWizardQuery(w)
    if (!q) return
    setCargando(true)
    setError('')
    setResultado(null)
    setStep(99)
    try {
      const res = await fetch(`/api/kiosko/${slug}/maridaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: q, mode: 'wizard', lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error en la consulta')
      setResultado(data)
    } catch (err) {
      setError(err.message)
      setStep(2)
    } finally {
      setCargando(false)
    }
  }

  function reset() { setStep(0); setWizard({ ocasion: '', estilo: '', presupuesto: '' }); setResultado(null); setError('') }

  return (
    <div className={styles.wizardView}>
      {tienda?.nombre && (
        <div className={styles.pairingBrand}>
          <span className={styles.pairingBrandNombre}>{tienda.nombre}</span>
          <span className={styles.pairingBrandCredit}>× @cataconjuanjo</span>
        </div>
      )}
      <div className={styles.wizardHeader}>
        <button className={styles.backBtn} onClick={resultado ? reset : (step === 0 ? onBack : () => setStep(s => s - 1))} type="button">
          ← {resultado ? T[lang].nuevaBusqueda : step === 0 ? T[lang].inicio : T[lang].atras}
        </button>
        <h2 className={styles.wizardTitle}>{T[lang].wizardTitle}</h2>
      </div>

      {/* Paso 0 — Ocasión */}
      {step === 0 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].q0}</p>
          <div className={styles.wizardOcasiones}>
            {OCASIONES_IDS.map(o => (
              <button key={o.id} className={styles.wizardOcasionBtn} onClick={() => selOcasion(o.id)} type="button"
                style={{ '--acento': colorAcento }}>
                <span className={styles.wizardOcasionIcon}>{o.emoji}</span>
                <span className={styles.wizardOcasionLabel}>{T[lang].ocasionLabels[o.id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paso 1 — Estilo */}
      {step === 1 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].q1}</p>
          <div className={styles.wizardEstilos}>
            {ESTILOS_IDS.map(e => (
              <button key={e.id} className={styles.wizardEstiloBtn} onClick={() => selEstilo(e.id)} type="button"
                style={{ '--acento': colorAcento }}>
                {T[lang].estiloLabels[e.id]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paso 2 — Presupuesto */}
      {step === 2 && (
        <div className={styles.wizardStep}>
          <p className={styles.wizardQuestion}>{T[lang].q2}</p>
          <div className={styles.wizardPresupuestos}>
            {PRESUPUESTOS_IDS.map(p => (
              <button key={p.id} className={styles.wizardPresupuestoBtn} onClick={() => selPresupuesto(p.id)} type="button"
                style={{ '--acento': colorAcento }}>
                {p.label ?? T[lang].sinLimite}
              </button>
            ))}
            <button className={`${styles.wizardPresupuestoBtn} ${styles.wizardPresupuestoBtnCustom}`}
              onClick={() => setMostrarRango(true)} type="button"
              style={{ '--acento': colorAcento }}>
              {T[lang].miRango}
            </button>
          </div>

          {mostrarRango && (
            <div className={styles.rangoOverlay} onClick={e => { if (e.target === e.currentTarget) setMostrarRango(false) }}>
              <div className={styles.rangoSheet}>
                <p className={styles.rangoSheetTitle}>{T[lang].elegirPresupuesto}</p>
                <PriceRangeSlider
                  minAll={wizardPrecios.min} maxAll={wizardPrecios.max}
                  valueMin={wPrecioMin} valueMax={wPrecioMax}
                  onChangeMin={setWPrecioMin} onChangeMax={setWPrecioMax}
                  acento={colorAcento}
                />
                <p className={styles.rangoSheetDisplay} style={{ color: colorAcento }}>
                  {wPrecioMin} € — {wPrecioMax} €
                </p>
                <button className={styles.rangoSheetBtn}
                  style={{ background: colorAcento, color: colorPrimario }}
                  onClick={() => { setMostrarRango(false); selPresupuesto('custom') }}
                  type="button">
                  {T[lang].buscarRango}
                </button>
                <button className={styles.rangoSheetCancel} onClick={() => setMostrarRango(false)} type="button">
                  {T[lang].cancelar}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cargando */}
      {step === 99 && cargando && (
        <div className={styles.wizardLoading}>
          <div className={styles.wizardSpinner} style={{ borderTopColor: colorAcento }} />
          <p style={{ color: colorAcento }}>{T[lang].buscandoVino}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={styles.pairingError}>
          <p>{error}</p>
          <button onClick={reset} type="button">{T[lang].intentarDeNuevo}</button>
        </div>
      )}

      {/* Resultados */}
      {resultado && (
        <div className={styles.pairingResultados}>
          {resultado.intro && <p className={styles.pairingIntro}>{resultado.intro}</p>}
          <div className={styles.pairingWines}>
            {resultado.recomendaciones.map(vino => (
              <article key={vino.id} className={styles.pairingWineCard}>
                <div className={styles.pairingWineLeft}>
                  <SafeImage
                    src={vino.foto_url}
                    alt={vino.nombre}
                    className={styles.pairingWinePhoto}
                    fallback={<div className={styles.pairingWinePhotoPlaceholder} style={{ background: `${TIPO_COLORS[vino.tipo] || '#333'}66` }}><BottleMark className={styles.pairingWineIcon} /></div>}
                  />
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
                    <p className={styles.pairingWineUbicacion}>
                      <LocationMark className={styles.locationIcon} />
                      {vino.ubicacion_estanteria}
                    </p>
                  )}
                  <div className={styles.pairingWineActions}>
                    <button className={styles.pairingWineOpenBtn} type="button" onClick={() => onWineSelect(vino)}>
                      Ver ficha
                    </button>
                    <button className={styles.pairingWineMobileBtn} type="button" onClick={() => onMobile?.(vino, 'wizard', vino.razon)}>
                      Añadir al carrito
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <button className={styles.pairingReiniciarBtn} onClick={reset} type="button">Nueva búsqueda</button>
        </div>
      )}
    </div>
  )
}

// ── Modo Mostrador ─────────────────────────────────────────────────────────────

function ShowcaseView({ vinos, tienda, colorAcento, colorPrimario, onExit }) {
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)
  const [hora, setHora] = useState('')

  const lista = useMemo(() => {
    const dest = vinos.filter(v => v.destacado && v.foto_url)
    return dest.length >= 3 ? dest : vinos.filter(v => v.foto_url).slice(0, 12)
  }, [vinos])

  useEffect(() => {
    function tick() { setHora(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })) }
    tick()
    const t = setInterval(tick, 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!lista.length) return
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % lista.length)
        setFade(true)
      }, 400)
    }, SHOWCASE_INTERVAL_MS)
    return () => clearInterval(t)
  }, [lista.length])

  const vino = lista[idx]
  if (!vino) return null

  return (
    <div className={styles.showcaseView} onClick={onExit} style={{ '--acento': colorAcento, '--primario': colorPrimario }}>
      {/* Fondo con foto */}
      <div className={`${styles.showcaseBg} ${fade ? styles.showcaseFadeIn : styles.showcaseFadeOut}`}>
        <SafeImage
          src={vino.foto_url}
          alt={vino.nombre}
          className={styles.showcaseBgImg}
          fallback={
            <div className={styles.showcaseBgFallback} style={{ background: `radial-gradient(circle at 50% 30%, ${TIPO_COLORS[vino.tipo] || '#333'}55, transparent 42%), linear-gradient(135deg, #11111a, #050506)` }}>
              <BottleMark className={styles.showcaseBgIcon} />
            </div>
          }
        />
        <div className={styles.showcaseBgOverlay} />
      </div>

      {/* Cabecera */}
      <div className={styles.showcaseTop}>
        <p className={styles.showcaseTienda}>{tienda?.nombre}</p>
        {hora && <p className={styles.showcaseHora}>{hora}</p>}
      </div>

      {/* Info del vino */}
      <div className={`${styles.showcaseInfo} ${fade ? styles.showcaseFadeIn : styles.showcaseFadeOut}`}>
        {vino.destacado && <p className={styles.showcaseDestacado} style={{ color: colorAcento }}>★ Destacado</p>}
        {vino.tipo && (
          <span className={styles.showcaseTipo} style={{ background: TIPO_COLORS[vino.tipo] || '#666' }}>
            {TIPO_LABELS[vino.tipo]}
          </span>
        )}
        <h2 className={styles.showcaseNombre}>{vino.nombre}</h2>
        {vino.bodega && <p className={styles.showcaseBodega}>{vino.bodega}</p>}
        <div className={styles.showcaseMeta}>
          {vino.uva   && <span>{vino.uva}</span>}
          {vino.anada && <span>{vino.anada}</span>}
          {vino.region && <span>{vino.region}</span>}
        </div>
        {vino.precio_pvp && (
          <p className={styles.showcasePrecio} style={{ color: colorAcento }}>{formatPrecio(vino.precio_pvp)}</p>
        )}
        {vino.ubicacion_estanteria && (
          <p className={styles.showcaseUbicacion}>
            <LocationMark className={styles.showcaseLocationIcon} />
            Estantería {vino.ubicacion_estanteria}
          </p>
        )}
      </div>

      {/* Pie */}
      <div className={styles.showcaseBottom}>
        <div className={styles.showcaseDots}>
          {lista.map((_, i) => (
            <span key={i} className={`${styles.showcaseDot} ${i === idx ? styles.showcaseDotActive : ''}`}
              style={i === idx ? { background: colorAcento } : {}} />
          ))}
        </div>
        <p className={styles.showcaseTap}>Toca la pantalla para explorar</p>
      </div>
    </div>
  )
}

// ── Vista Pairing ─────────────────────────────────────────────────────────────

function PairingView({ tienda, slug, colorAcento, vinos = [], onWineSelect, onMobile, onBack, lang = 'es' }) {
  const [consulta, setConsulta] = useState('')
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => { textareaRef.current?.focus() }, [])

  async function consultar(texto) {
    const q = texto || consulta
    if (!q.trim()) return
    setCargando(true); setError(''); setResultado(null)
    try {
      const res = await fetch(`/api/kiosko/${slug}/maridaje`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consulta: q, lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error en la consulta')
      setResultado(data)
    } catch (err) { setError(err.message) }
    finally { setCargando(false) }
  }

  return (
    <div className={styles.pairingView}>
      {tienda?.nombre && (
        <div className={styles.pairingBrand}>
          <span className={styles.pairingBrandNombre}>{tienda.nombre}</span>
          <span className={styles.pairingBrandCredit}>× @cataconjuanjo</span>
        </div>
      )}
      <div className={styles.pairingHeader}>
        <button className={styles.backBtn} onClick={onBack} type="button">{T[lang].volver}</button>
        <h2 className={styles.pairingTitle}>{T[lang].pairingTitle}</h2>
        <p className={styles.pairingSubtitle}>{T[lang].pairingSub}</p>
      </div>
      <div className={styles.pairingInputArea}>
        <textarea ref={textareaRef} className={styles.pairingTextarea} value={consulta}
          onChange={e => setConsulta(e.target.value)}
          placeholder={T[lang].pairingPlaceholder}
          rows={3} maxLength={400}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); consultar() } }}
        />
        <button className={styles.pairingSubmitBtn} style={{ background: colorAcento }}
          onClick={() => consultar()} disabled={cargando || !consulta.trim()} type="button">
          {cargando ? T[lang].buscando : T[lang].buscar}
        </button>
      </div>
      {!resultado && !cargando && !error && (
        <div className={styles.sugerencias}>
          <p className={styles.sugerenciasLabel}>{T[lang].ideasRapidas}</p>
          <div className={styles.sugerenciasGrid}>
            {SUGERENCIAS_MARIDAJE.map(s => (
              <button key={s} className={styles.sugerenciaBtn} onClick={() => { setConsulta(s); consultar(s) }} type="button">{s}</button>
            ))}
          </div>
        </div>
      )}
      {error && <div className={styles.pairingError}><p>{error}</p><button onClick={() => setError('')} type="button">{T[lang].intentarDeNuevo}</button></div>}
      {resultado && (
        <div className={styles.pairingResultados}>
          {resultado.intro && <p className={styles.pairingIntro}>{resultado.intro}</p>}
          <div className={styles.pairingWines}>
            {resultado.recomendaciones.map(vino => (
              <article key={vino.id} className={styles.pairingWineCard}>
                <div className={styles.pairingWineLeft}>
                  <SafeImage
                    src={vino.foto_url}
                    alt={vino.nombre}
                    className={styles.pairingWinePhoto}
                    fallback={<div className={styles.pairingWinePhotoPlaceholder} style={{ background: `${TIPO_COLORS[vino.tipo] || '#333'}66` }}><BottleMark className={styles.pairingWineIcon} /></div>}
                  />
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
                    <p className={styles.pairingWineUbicacion}>
                      <LocationMark className={styles.locationIcon} />
                      {vino.ubicacion_estanteria}
                    </p>
                  )}
                  <div className={styles.pairingWineActions}>
                    <button className={styles.pairingWineOpenBtn} type="button" onClick={() => onWineSelect(vino)}>
                      Ver ficha
                    </button>
                    <button className={styles.pairingWineMobileBtn} type="button" onClick={() => onMobile?.(vino, 'pairing', vino.razon)}>
                      Añadir al carrito
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <button className={styles.pairingReiniciarBtn} onClick={() => { setResultado(null); setConsulta('') }} type="button">Nueva búsqueda</button>
        </div>
      )}
    </div>
  )
}

// ── Vista Browse ──────────────────────────────────────────────────────────────

function BrowseView({ vinos, colorAcento, onWineSelect, onBack, lang = 'es' }) {
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroPais, setFiltroPais] = useState('')
  const [filtroRegion, setFiltroRegion] = useState('')

  const tipos    = useMemo(() => TIPO_ORDER.filter(t => vinos.some(v => v.tipo === t)), [vinos])
  const paises   = useMemo(() => extraerValoresUnicos(vinos, 'pais'), [vinos])
  const regiones = useMemo(() => extraerValoresUnicos(vinos, 'region'), [vinos])

  const preciosAll = useMemo(() => {
    const ps = vinos.map(v => v.precio_pvp).filter(Boolean)
    if (!ps.length) return null
    return { min: Math.floor(Math.min(...ps)), max: Math.ceil(Math.max(...ps)) }
  }, [vinos])

  const [precioMin, setPrecioMin] = useState(0)
  const [precioMax, setPrecioMax] = useState(9999)
  useEffect(() => {
    if (!preciosAll) return
    queueMicrotask(() => {
      setPrecioMin(preciosAll.min)
      setPrecioMax(preciosAll.max)
    })
  }, [preciosAll])

  const sliderActivo = preciosAll && (precioMin > preciosAll.min || precioMax < preciosAll.max)

  const vinosFiltrados = useMemo(() => {
    const qNorm = normalizarTexto(busqueda)
    return vinos.filter(v => {
      if (filtroTipo !== 'todos' && v.tipo !== filtroTipo) return false
      if (filtroPais && v.pais !== filtroPais) return false
      if (filtroRegion && v.region !== filtroRegion) return false
      if (preciosAll && v.precio_pvp != null) {
        if (v.precio_pvp < precioMin || v.precio_pvp > precioMax) return false
      }
      if (qNorm) {
        const txt = normalizarTexto([v.nombre, v.bodega, v.uva, v.region].filter(Boolean).join(' '))
        if (!txt.includes(qNorm)) return false
      }
      return true
    })
  }, [vinos, filtroTipo, busqueda, filtroPais, filtroRegion, precioMin, precioMax, preciosAll])

  function limpiar() {
    setBusqueda(''); setFiltroTipo('todos'); setFiltroPais(''); setFiltroRegion('')
    if (preciosAll) { setPrecioMin(preciosAll.min); setPrecioMax(preciosAll.max) }
  }
  const filtroActivo = filtroTipo !== 'todos' || busqueda || filtroPais || filtroRegion || sliderActivo

  return (
    <div className={styles.browseView}>
      <div className={styles.browseTopBar}>
        <div className={styles.browseTopRow}>
          <button className={styles.backBtn} onClick={onBack} type="button">{T[lang].browseInicio}</button>
          <div className={styles.searchWrap}>
            <input className={styles.searchInput} type="search" value={busqueda}
              onChange={e => setBusqueda(e.target.value)} placeholder={T[lang].buscarPlaceholder} />
            {busqueda && <button className={styles.searchClear} onClick={() => setBusqueda('')} type="button">✕</button>}
          </div>
          <span className={styles.resultCount}>{T[lang].vinos(vinosFiltrados.length)}</span>
          {filtroActivo && <button className={styles.clearBtn} onClick={limpiar} type="button">{T[lang].limpiar}</button>}
        </div>
        <div className={styles.tipoBar}>
          <button className={`${styles.tipoChipBtn} ${filtroTipo === 'todos' ? styles.tipoChipBtnActive : ''}`}
            onClick={() => setFiltroTipo('todos')}
            style={filtroTipo === 'todos' ? { background: colorAcento, borderColor: colorAcento, color: '#fff' } : {}}
            type="button">{T[lang].todos}</button>
          {tipos.map(tipo => (
            <button key={tipo} className={`${styles.tipoChipBtn} ${filtroTipo === tipo ? styles.tipoChipBtnActive : ''}`}
              onClick={() => setFiltroTipo(tipo === filtroTipo ? 'todos' : tipo)}
              style={filtroTipo === tipo ? { background: TIPO_COLORS[tipo], borderColor: TIPO_COLORS[tipo], color: '#fff' } : {}}
              type="button">{T[lang].tipoLabels[tipo] || tipo}</button>
          ))}
          {paises.length > 1 && (
            <select className={styles.paisSelect} value={filtroPais} onChange={e => setFiltroPais(e.target.value)}>
              <option value="">{T[lang].pais}</option>
              {paises.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {regiones.length > 1 && (
            <select className={styles.doSelect} value={filtroRegion} onChange={e => setFiltroRegion(e.target.value)}>
              <option value="">{T[lang].region}</option>
              {regiones.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
        </div>

        {preciosAll && preciosAll.min < preciosAll.max && (
          <div className={styles.priceRow}>
            <span className={styles.priceRowLabel}>{T[lang].precio}</span>
            <PriceRangeSlider
              minAll={preciosAll.min} maxAll={preciosAll.max}
              valueMin={precioMin} valueMax={precioMax}
              onChangeMin={setPrecioMin} onChangeMax={setPrecioMax}
              acento={colorAcento}
            />
          </div>
        )}
      </div>
      <div className={styles.browseResults}>
        {vinosFiltrados.length === 0
          ? <div className={styles.noResults}><p>{T[lang].sinResultados}</p><button onClick={limpiar} style={{ color: colorAcento }} type="button">{T[lang].limpiarFiltros}</button></div>
          : <div className={styles.wineGrid}>{vinosFiltrados.map(v => <WineCard key={v.id} vino={v} onClick={onWineSelect} />)}</div>
        }
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function KioskoPage() {
  const { slug }       = useParams()
  const searchParams   = useSearchParams()
  const modoMostrador  = searchParams.get('mostrador') === '1'

  const [tienda, setTienda]         = useState(null)
  const [vinos, setVinos]           = useState([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState('')
  const [view, setView]             = useState(modoMostrador ? VIEWS.SHOWCASE : VIEWS.WELCOME)
  const [vinoDetalle, setVinoDetalle] = useState(null)
  const [mobileVinos, setMobileVinos] = useState([])
  const [mobileSelection, setMobileSelection] = useState(null)
  const [cartNotice, setCartNotice] = useState('')
  const [kioskOrder, setKioskOrder] = useState(null)
  const [longPressTimer, setLongPressTimer] = useState(null)
  const [lang, setLang]             = useState('es')

  const idleTimer = useRef(null)
  const cartNoticeTimer = useRef(null)

  useEffect(() => {
    if (!slug) return
    async function cargar() {
      setCargando(true); setError('')
      try {
        const [r1, r2] = await Promise.all([
          fetch(`/api/kiosko/${slug}/vinos`),
          fetch(`/api/kiosko/${slug}/meta`),
        ])
        const d1 = await r1.json()
        if (!r1.ok) throw new Error(d1.error || 'Tienda no encontrada')
        setVinos(d1.vinos || [])
        if (r2.ok) { const d2 = await r2.json(); setTienda(d2.tienda) }
      } catch (err) { setError(err.message) }
      finally { setCargando(false) }
    }
    cargar()
  }, [slug])

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (view !== VIEWS.WELCOME && view !== VIEWS.SHOWCASE) {
      idleTimer.current = setTimeout(() => {
        setView(VIEWS.WELCOME)
        setVinoDetalle(null)
        setMobileVinos([])
        setMobileSelection(null)
        setCartNotice('')
      }, IDLE_TIMEOUT_MS)
    }
  }, [view])

  useEffect(() => { resetIdle(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current) } }, [resetIdle])
  useEffect(() => {
    const events = ['touchstart','touchmove','click','keydown','mousemove']
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, resetIdle))
  }, [resetIdle])

  useEffect(() => {
    const fontDef = FONT_CSS[tienda?.font_family]
    if (fontDef?.google) {
      const id = 'gfont-kiosko'
      if (!document.getElementById(id)) {
        const link = document.createElement('link')
        link.id = id; link.rel = 'stylesheet'
        link.href = `https://fonts.googleapis.com/css2?family=${fontDef.google}&display=swap`
        document.head.appendChild(link)
      }
    }
  }, [tienda?.font_family])

  function abrirDetalle(vino) { setVinoDetalle(vino); setView(VIEWS.DETAIL) }
  function volverDeDetalle() { setView(VIEWS.BROWSE); setVinoDetalle(null) }
  function abrirPairingDesdeDetalle() { setVinoDetalle(null); setView(VIEWS.PAIRING) }
  function normalizarMobileVinos(lista) {
    const vistos = new Set()
    return lista
      .filter(vino => vino?.id && !vistos.has(vino.id) && vistos.add(vino.id))
      .slice(0, MOBILE_SELECTION_MAX)
  }
  function mobileUrl(lista, source = 'selection', reason = '') {
    const seleccion = normalizarMobileVinos(Array.isArray(lista) ? lista : [lista])
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.cataconjuanjo.com'
    const params = new URLSearchParams({
      ids: seleccion.map(vino => vino.id).join(','),
      from: source,
      lang,
    })
    if (reason) params.set('motivo', String(reason).slice(0, 320))
    return `${origin}/kiosko/${slug}/movil?${params.toString()}`
  }
  function abrirMobileQrLista(lista = mobileVinos, source = 'selection', reason = '') {
    const seleccion = normalizarMobileVinos(lista)
    if (!seleccion.length) return
    setMobileVinos(seleccion)
    setKioskOrder(null)
    setMobileSelection({ vinos: seleccion, source, reason, url: mobileUrl(seleccion, source, reason) })
  }
  function abrirMobileQr(vino) {
    const estaba = mobileVinos.some(v => v.id === vino.id)
    const seleccion = normalizarMobileVinos([...mobileVinos, vino])
    setMobileVinos(seleccion)
    setMobileSelection(null)
    setCartNotice(estaba ? 'Este vino ya estaba en el carrito' : `${vino.nombre} añadido`)
    if (cartNoticeTimer.current) clearTimeout(cartNoticeTimer.current)
    cartNoticeTimer.current = setTimeout(() => setCartNotice(''), 1800)
  }
  function quitarMobileVino(id) {
    const seleccion = mobileVinos.filter(vino => vino.id !== id)
    setMobileVinos(seleccion)
    setCartNotice('')
    setKioskOrder(null)
    if (!seleccion.length) {
      setMobileSelection(null)
      return
    }
    setMobileSelection(prev => prev
      ? { ...prev, vinos: seleccion, url: mobileUrl(seleccion, prev.source, prev.reason) }
      : prev
    )
  }
  function vaciarMobileVinos() {
    setMobileVinos([])
    setMobileSelection(null)
    setCartNotice('')
    setKioskOrder(null)
  }

  // Long press en el logo → modo mostrador
  function onLogoPress()   { setLongPressTimer(setTimeout(() => setView(VIEWS.SHOWCASE), 2000)) }
  function onLogoRelease() { if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null) } }

  const colorPrimario = tienda?.color_primario || '#0d0d1a'
  const colorAcento   = tienda?.color_acento   || '#c9a96e'
  const temaClaro     = esColorClaro(colorPrimario)
  const fontCss       = FONT_CSS[tienda?.font_family]?.css || FONT_CSS.clasica.css
  const iconStyle      = tienda?.kiosko_icon_style === 'lineal' ? 'lineal' : 'emoji'
  const pedidosMostradorActivos = tienda?.kiosko_orders_enabled === true && !COUNTER_ORDERS_IN_DEVELOPMENT
  const themeVars = {
    '--color-primario': colorPrimario, '--color-acento': colorAcento, '--font-family': fontCss,
    '--texto':    temaClaro ? '#141413'            : '#f0ede8',
    '--texto-m':  temaClaro ? 'rgba(20,20,19,.6)'  : 'rgba(240,237,232,.6)',
    '--texto-d':  temaClaro ? 'rgba(20,20,19,.38)' : 'rgba(240,237,232,.4)',
    '--sup1':     temaClaro ? 'rgba(0,0,0,.03)'    : 'rgba(255,255,255,.05)',
    '--sup2':     temaClaro ? '#F7F7F7'            : 'rgba(255,255,255,.08)',
    '--sup3':     temaClaro ? 'rgba(0,0,0,.07)'    : 'rgba(255,255,255,.12)',
    '--borde':    temaClaro ? '#EEEEEE'            : 'rgba(255,255,255,.1)',
    '--borde-f':  temaClaro ? '#AAAAAA'            : 'rgba(255,255,255,.35)',
    '--panel':    temaClaro ? '#FFFFFF'            : '#141420',
    '--sidebar':  temaClaro ? '#F7F7F7'            : 'rgba(0,0,0,.35)',
    '--sidebar-b':temaClaro ? '#EEEEEE'            : 'rgba(255,255,255,.08)',
    '--overlay':  temaClaro ? 'rgba(0,0,0,.55)'    : 'rgba(0,0,0,.75)',
    '--spinner-t':temaClaro ? 'rgba(0,0,0,.1)'     : 'rgba(255,255,255,.15)',
    '--btn-back': temaClaro ? 'rgba(0,0,0,.05)'    : 'rgba(255,255,255,.08)',
    '--btn-back-b':temaClaro? '#DDDDDD'            : 'rgba(255,255,255,.15)',
    '--select-bg':temaClaro ? '#FFFFFF'            : '#1a1a2e',
    '--featured-b':temaClaro? '#EEEEEE'            : 'rgba(255,255,255,.08)',
  }

  if (cargando) return (
    <div className={styles.loadingScreen} style={themeVars}>
      <div className={styles.loadingSpinner} />
      <p style={{ color: colorAcento }}>Cargando...</p>
    </div>
  )
  if (error) return (
    <div className={styles.errorScreen} style={themeVars}>
      <p className={styles.errorMsg}>{error}</p>
      <button onClick={() => window.location.reload()} style={{ color: colorAcento }} type="button">Reintentar</button>
    </div>
  )

  return (
    <div className={styles.kiosko} style={themeVars}>
      <MobileQrModal
        selection={mobileSelection}
        onClose={() => setMobileSelection(null)}
        onRemove={kioskOrder ? null : quitarMobileVino}
        colorAcento={colorAcento}
        ordersEnabled={pedidosMostradorActivos}
        order={kioskOrder}
      />
      {view !== VIEWS.SHOWCASE && !mobileSelection && (
        <MobileSelectionTray
          vinos={mobileVinos}
          notice={cartNotice}
          onOpen={() => abrirMobileQrLista(mobileVinos)}
          onClear={vaciarMobileVinos}
          colorAcento={colorAcento}
          ordersEnabled={pedidosMostradorActivos}
        />
      )}

      {/* MODO MOSTRADOR */}
      {view === VIEWS.SHOWCASE && (
        <ShowcaseView vinos={vinos} tienda={tienda} colorAcento={colorAcento} colorPrimario={colorPrimario}
          onExit={() => setView(VIEWS.WELCOME)} />
      )}

      {/* BIENVENIDA */}
      {view === VIEWS.WELCOME && (
        <div className={styles.welcomeView}>
          {/* Cabecera: logo, nombre, descripción */}
          <div className={styles.welcomeContent}>
            {tienda?.logo_url && (
              <SafeImage
                src={tienda.logo_url}
                alt={tienda?.nombre}
                className={styles.welcomeLogo}
                fallback={<LogoFallback nombre={tienda?.nombre} />}
              />
            )}
            <h1
              className={styles.welcomeNombre}
              style={{ color: colorAcento }}
              onMouseDown={onLogoPress}
              onMouseUp={onLogoRelease}
              onTouchStart={onLogoPress}
              onTouchEnd={onLogoRelease}
            >
              {tienda?.nombre || 'Nuestra Selección de Vinos'}
            </h1>
            {tienda?.descripcion && <p className={styles.welcomeDesc}>{tienda.descripcion}</p>}
            <div className={styles.welcomeStats}>
              <span>{T[lang].referencias(vinos.length)}</span>
              {(() => { const d = vinos.filter(v => v.stock > 0).length; return d > 0 && d < vinos.length ? <span>{T[lang].disponibles(d)}</span> : null })()}
            </div>
          </div>

          {/* Acciones — tarjetas con icono grande centradas en el kiosko */}
          <div className={styles.welcomeActions}>
            <button className={styles.welcomeActionCard} onClick={() => setView(VIEWS.BROWSE)} type="button"
              style={{ '--acento': colorAcento }}>
              <span className={`${styles.welcomeActionIcon} ${iconStyle === 'emoji' ? styles.welcomeActionIconEmoji : ''}`}>
                <WelcomeActionIcon name="browse" variant={iconStyle} />
              </span>
              <span className={styles.welcomeActionLabel} style={{ color: colorAcento }}>{T[lang].explorar}</span>
            </button>
            <button className={styles.welcomeActionCard} onClick={() => setView(VIEWS.WIZARD)} type="button"
              style={{ '--acento': colorAcento }}>
              <span className={`${styles.welcomeActionIcon} ${iconStyle === 'emoji' ? styles.welcomeActionIconEmoji : ''}`}>
                <WelcomeActionIcon name="choose" variant={iconStyle} />
              </span>
              <span className={styles.welcomeActionLabel} style={{ color: colorAcento }}>{T[lang].elegir}</span>
            </button>
            <button className={styles.welcomeActionCard} onClick={() => setView(VIEWS.PAIRING)} type="button"
              style={{ '--acento': colorAcento }}>
              <span className={`${styles.welcomeActionIcon} ${iconStyle === 'emoji' ? styles.welcomeActionIconEmoji : ''}`}>
                <WelcomeActionIcon name="pairing" variant={iconStyle} />
              </span>
              <span className={styles.welcomeActionLabel} style={{ color: colorAcento }}>{T[lang].maridaje}</span>
            </button>
          </div>

          <div className={styles.langSelector}>
            {IDIOMAS.map(i => (
              <button key={i.id} type="button"
                className={`${styles.langBtn} ${lang === i.id ? styles.langBtnActive : ''}`}
                onClick={() => setLang(i.id)}
                title={i.label}
                aria-label={i.label}
                style={lang === i.id ? { borderColor: colorAcento } : {}}>
                <span className={`${styles.langFlag} ${styles[i.flagClass]}`} aria-hidden="true" />
              </button>
            ))}
          </div>

          <span className={styles.kioskoCredit}>
            Kiosko Virtual <span aria-hidden="true">×</span> @cataconjuanjo
          </span>

          {vinos.filter(v => v.destacado).length > 0 && (
            <div className={styles.welcomeFeatured}>
              <p className={styles.featuredLabel} style={{ color: colorAcento }}>{T[lang].destacados}</p>
              <div className={styles.featuredStrip}>
                {vinos.filter(v => v.destacado).slice(0, 8).map(v => (
                  <button key={v.id} className={styles.featuredCard} onClick={() => abrirDetalle(v)} type="button">
                    <SafeImage
                      src={v.foto_url}
                      alt={v.nombre}
                      className={styles.featuredPhoto}
                      loading="lazy"
                      fallback={<div className={styles.featuredPhotoPlaceholder} style={{ background: `${TIPO_COLORS[v.tipo] || '#333'}88` }}><BottleMark className={styles.featuredPhotoIcon} /></div>}
                    />
                    <p className={styles.featuredNombre}>{v.nombre}</p>
                    {v.precio_pvp && <p className={styles.featuredPrecio} style={{ color: colorAcento }}>{formatPrecio(v.precio_pvp)}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <FeedbackWidget slug={slug} />
        </div>
      )}

      {/* WIZARD */}
      {view === VIEWS.WIZARD && (
        <WizardView slug={slug} tienda={tienda} colorAcento={colorAcento} colorPrimario={colorPrimario}
          onWineSelect={abrirDetalle} onMobile={abrirMobileQr} onBack={() => setView(VIEWS.WELCOME)} vinos={vinos} lang={lang} />
      )}

      {/* EXPLORAR */}
      {view === VIEWS.BROWSE && (
        <BrowseView vinos={vinos} colorAcento={colorAcento}
          onWineSelect={abrirDetalle} onBack={() => setView(VIEWS.WELCOME)} lang={lang} />
      )}

      {/* MARIDAJE */}
      {view === VIEWS.PAIRING && (
        <PairingView tienda={tienda} slug={slug} colorAcento={colorAcento} vinos={vinos}
          onWineSelect={abrirDetalle} onMobile={abrirMobileQr} onBack={() => setView(VIEWS.WELCOME)} lang={lang} />
      )}

      {/* DETALLE */}
      {view === VIEWS.DETAIL && vinoDetalle && (
        <WineDetail vino={vinoDetalle} slug={slug} colorAcento={colorAcento}
          onClose={volverDeDetalle} onMobile={abrirMobileQr} lang={lang} />
      )}
    </div>
  )
}
