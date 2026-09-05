import { useState, useRef, useMemo, useCallback } from 'react'
import styles from './duelo.module.css'

const MAX_RONDAS = 8
const MIN_POOL = 4

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const TIPO_LABELS = {
  es: { tinto: 'Tinto', blanco: 'Blanco', rosado: 'Rosado', espumoso: 'Espumoso', generoso: 'Generoso', dulce: 'Dulce', naranja: 'Naranja', sin_alcohol: 'Sin alcohol' },
  en: { tinto: 'Red', blanco: 'White', rosado: 'Rosé', espumoso: 'Sparkling', generoso: 'Fortified', dulce: 'Sweet', naranja: 'Orange', sin_alcohol: 'Alcohol-free' },
  fr: { tinto: 'Rouge', blanco: 'Blanc', rosado: 'Rosé', espumoso: 'Effervescent', generoso: 'Généreux', dulce: 'Doux', naranja: 'Orange', sin_alcohol: 'Sans alcool' },
  de: { tinto: 'Rot', blanco: 'Weiß', rosado: 'Rosé', espumoso: 'Perlwein', generoso: 'Edel', dulce: 'Süß', naranja: 'Orange', sin_alcohol: 'Alkoholfrei' },
}

const DT = {
  es: {
    titulo: 'Duelo a ciegas',
    prefiltroSub: '¿Qué tipo de vino?',
    todos: 'Todos',
    empezar: 'Empezar duelo →',
    hint: 'Toca la que más te llame',
    yaTengo: 'Ya tengo mi vino',
    ronda: (r, t) => `Ronda ${r} de ${t}`,
    gano: (v, t) => `Ganó ${v} de ${t} duelos`,
    resultadoEyebrow: 'Tu ganador',
    verFicha: 'Ver ficha completa →',
    pocosVinos: 'No hay suficientes vinos con etiqueta para este tipo.',
    inicio: '← Inicio',
  },
  en: {
    titulo: 'Blind Duel',
    prefiltroSub: 'What type of wine?',
    todos: 'All',
    empezar: 'Start duel →',
    hint: 'Tap the one you prefer',
    yaTengo: 'This is my wine',
    ronda: (r, t) => `Round ${r} of ${t}`,
    gano: (v, t) => `Won ${v} of ${t} rounds`,
    resultadoEyebrow: 'Your winner',
    verFicha: 'See full details →',
    pocosVinos: 'Not enough labelled wines for this type.',
    inicio: '← Home',
  },
  fr: {
    titulo: 'Duel à l\'aveugle',
    prefiltroSub: 'Quel type de vin ?',
    todos: 'Tous',
    empezar: 'Commencer →',
    hint: 'Touchez celle qui vous attire',
    yaTengo: 'J\'ai mon vin',
    ronda: (r, t) => `Round ${r} / ${t}`,
    gano: (v, t) => `Gagné ${v} sur ${t}`,
    resultadoEyebrow: 'Votre gagnant',
    verFicha: 'Voir la fiche →',
    pocosVinos: 'Pas assez de vins avec étiquette pour ce type.',
    inicio: '← Accueil',
  },
  de: {
    titulo: 'Blindverkostung',
    prefiltroSub: 'Welcher Weintyp?',
    todos: 'Alle',
    empezar: 'Duell starten →',
    hint: 'Tippe auf das, was dir gefällt',
    yaTengo: 'Mein Wein steht fest',
    ronda: (r, t) => `Runde ${r} von ${t}`,
    gano: (v, t) => `Gewann ${v} von ${t}`,
    resultadoEyebrow: 'Dein Sieger',
    verFicha: 'Details ansehen →',
    pocosVinos: 'Nicht genug Weine mit Etikett für diesen Typ.',
    inicio: '← Start',
  },
}

function t(lang, key, ...args) {
  const dict = DT[lang] || DT.es
  const val = dict[key] ?? (DT.es[key])
  return typeof val === 'function' ? val(...args) : val
}

export default function DuelView({ vinos = [], slug, colorAcento, onBack, onFunnelStep, onWineSelect, lang = 'es' }) {
  const sessionId = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )

  const [prefiltro, setPrefiltro]         = useState('todos')
  const [fase, setFase]                   = useState('prefiltro')
  const [pool, setPool]                   = useState([])
  const poolIdxRef                        = useRef(2)
  const [vinoA, setVinoA]                 = useState(null)
  const [vinoB, setVinoB]                 = useState(null)
  const [campeon, setCampeon]             = useState(null)
  const [rondaActual, setRondaActual]     = useState(1)
  const [campeonVictorias, setCampeonVictorias] = useState(0)
  const [totalRondas, setTotalRondas]     = useState(0)

  const vinosConFoto = useMemo(() => vinos.filter(v => v.foto_url), [vinos])

  const tiposDisponibles = useMemo(() => {
    const counts = {}
    for (const v of vinosConFoto) counts[v.tipo] = (counts[v.tipo] || 0) + 1
    return Object.entries(counts).filter(([, n]) => n >= MIN_POOL).map(([tipo]) => tipo)
  }, [vinosConFoto])

  const poolParaTipo = useCallback((tipo) =>
    vinosConFoto.filter(v => tipo === 'todos' || v.tipo === tipo)
  , [vinosConFoto])

  function trackFunnel(step) {
    fetch(`/api/kiosko/${slug}/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempt_id: sessionId.current, flow: 'duelo', step }),
    }).catch(() => {})
  }

  function registrarRonda(aId, bId, elegidoId) {
    fetch(`/api/kiosko/${slug}/duelo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id:  sessionId.current,
        ronda:       rondaActual,
        vino_a_id:   aId,
        vino_b_id:   bId,
        elegido_id:  elegidoId ?? null,
        filtros:     prefiltro !== 'todos' ? { tipo: prefiltro } : null,
      }),
    }).catch(() => {})
  }

  function iniciarDuelo() {
    const candidatos = poolParaTipo(prefiltro)
    if (candidatos.length < MIN_POOL) return
    const shuffled = shuffle(candidatos)
    setPool(shuffled)
    poolIdxRef.current = 2
    setVinoA(shuffled[0])
    setVinoB(shuffled[1])
    setCampeon(null)
    setCampeonVictorias(0)
    setTotalRondas(0)
    setRondaActual(1)
    setFase('duelo')
    trackFunnel('start')
    onFunnelStep?.('start')
  }

  function elegir(vino) {
    registrarRonda(vinoA.id, vinoB.id, vino.id)

    const nuevoCampeon      = vino
    const nuevasVictorias   = campeon && vino.id === campeon.id ? campeonVictorias + 1 : 1
    const nuevoTotal        = totalRondas + 1
    const siguienteIdx      = poolIdxRef.current
    const hayMasVinos       = siguienteIdx < pool.length
    const hayMasRondas      = rondaActual < MAX_RONDAS

    setCampeon(nuevoCampeon)
    setCampeonVictorias(nuevasVictorias)
    setTotalRondas(nuevoTotal)

    if (!hayMasVinos || !hayMasRondas) {
      setFase('resultado')
      trackFunnel('resultado')
      onFunnelStep?.('resultado')
      return
    }

    poolIdxRef.current = siguienteIdx + 1
    setVinoA(nuevoCampeon)
    setVinoB(pool[siguienteIdx])
    setRondaActual(r => r + 1)
  }

  function salirYaTengo() {
    if (fase === 'duelo' && vinoA && vinoB) registrarRonda(vinoA.id, vinoB.id, null)
    trackFunnel('abandon')
    onBack()
  }

  // Pool insuficiente en cualquier tipo → modo desactivado
  if (vinosConFoto.length < MIN_POOL) {
    return (
      <div className={styles.duelView}>
        <button className={styles.backBtn} onClick={onBack} type="button">
          {t(lang, 'inicio')}
        </button>
        <p className={styles.emptyMsg}>{t(lang, 'pocosVinos')}</p>
      </div>
    )
  }

  // ── Prefiltro ─────────────────────────────────────────────────────────────
  if (fase === 'prefiltro') {
    const poolActual = poolParaTipo(prefiltro)
    const insuficiente = poolActual.length < MIN_POOL
    return (
      <div className={styles.duelView}>
        <button className={styles.backBtn} onClick={onBack} type="button">
          {t(lang, 'inicio')}
        </button>
        <div className={styles.prefiltroContent}>
          <h2 className={styles.prefiltroTitle} style={{ color: colorAcento }}>
            {t(lang, 'titulo')}
          </h2>
          <p className={styles.prefiltroSub}>{t(lang, 'prefiltroSub')}</p>
          <div className={styles.tipoChips}>
            <button
              className={`${styles.tipoChip} ${prefiltro === 'todos' ? styles.tipoChipActive : ''}`}
              style={prefiltro === 'todos' ? { background: colorAcento } : {}}
              onClick={() => setPrefiltro('todos')}
              type="button"
            >
              {t(lang, 'todos')}
            </button>
            {tiposDisponibles.map(tipo => (
              <button
                key={tipo}
                className={`${styles.tipoChip} ${prefiltro === tipo ? styles.tipoChipActive : ''}`}
                style={prefiltro === tipo ? { background: colorAcento } : {}}
                onClick={() => setPrefiltro(tipo)}
                type="button"
              >
                {(TIPO_LABELS[lang] || TIPO_LABELS.es)[tipo] || tipo}
              </button>
            ))}
          </div>
          {insuficiente && <p className={styles.pocosAviso}>{t(lang, 'pocosVinos')}</p>}
          <button
            className={styles.startBtn}
            style={{ background: colorAcento }}
            onClick={iniciarDuelo}
            disabled={insuficiente}
            type="button"
          >
            {t(lang, 'empezar')}
          </button>
        </div>
      </div>
    )
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  if (fase === 'resultado' && campeon) {
    return (
      <div className={styles.duelView}>
        <div className={styles.resultadoView}>
          <div className={styles.resultadoHero}>
            <img
              src={campeon.foto_url}
              alt={campeon.nombre}
              className={styles.resultadoFoto}
            />
            <span className={styles.winChip} style={{ background: colorAcento }}>
              {t(lang, 'gano', campeonVictorias, totalRondas)}
            </span>
          </div>
          <div className={styles.resultadoInfo}>
            <p className={styles.resultadoEyebrow} style={{ color: colorAcento }}>
              {t(lang, 'resultadoEyebrow')}
            </p>
            <h2 className={styles.resultadoNombre}>{campeon.nombre}</h2>
            {(campeon.bodega || campeon.region) && (
              <p className={styles.resultadoMeta}>
                {[campeon.bodega, campeon.region].filter(Boolean).join(' · ')}
              </p>
            )}
            {campeon.precio_pvp && (
              <p className={styles.resultadoPrecio} style={{ color: colorAcento }}>
                {Number(campeon.precio_pvp).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
              </p>
            )}
            <button
              className={styles.fichaBtn}
              style={{ background: colorAcento }}
              onClick={() => onWineSelect(campeon)}
              type="button"
            >
              {t(lang, 'verFicha')}
            </button>
            <button className={styles.volverBtn} onClick={onBack} type="button">
              {t(lang, 'inicio')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Duelo en curso ────────────────────────────────────────────────────────
  return (
    <div className={styles.duelView}>
      <div className={styles.duelHeader}>
        <span className={styles.duelTitulo} style={{ color: colorAcento }}>
          {t(lang, 'titulo')}
        </span>
        <span className={styles.duelRonda}>
          {t(lang, 'ronda', rondaActual, MAX_RONDAS)}
        </span>
      </div>
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${((rondaActual - 1) / MAX_RONDAS) * 100}%`, background: colorAcento }}
        />
      </div>

      <div className={styles.duelStage}>
        <button className={styles.labelCard} onClick={() => elegir(vinoA)} type="button" aria-label={`Elegir vino A`}>
          <img src={vinoA.foto_url} alt="" className={styles.labelPhoto} />
        </button>
        <div className={styles.vsBadge} style={{ background: colorAcento }}>VS</div>
        <button className={styles.labelCard} onClick={() => elegir(vinoB)} type="button" aria-label={`Elegir vino B`}>
          <img src={vinoB.foto_url} alt="" className={styles.labelPhoto} />
        </button>
      </div>

      <p className={styles.duelHint}>{t(lang, 'hint')}</p>

      <button className={styles.yaTengoBtn} onClick={salirYaTengo} type="button">
        {t(lang, 'yaTengo')}
      </button>
    </div>
  )
}
