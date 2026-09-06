import { useState, useRef, useMemo, useCallback } from 'react'
import styles from './duelCarta.module.css'

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

const DC = {
  es: {
    pocosVinos: 'No hay suficientes vinos con etiqueta para empezar.',
    todos: 'Todos',
    queTipo: '¿Qué tipo de vino?',
    hint: 'Toca la que más te llame',
    yaTengo: 'Ya tengo mi vino',
    sigueEnPie: 'Sigue en pie',
    empezar: 'Empezar duelo →',
  },
  en: {
    pocosVinos: 'Not enough labelled wines to start.',
    todos: 'All',
    queTipo: 'What type of wine?',
    hint: 'Tap the one you prefer',
    yaTengo: 'I have my wine',
    sigueEnPie: 'Still standing',
    empezar: 'Start duel →',
  },
}

function ChampIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}>
      <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function DuelCartaView({
  vinos = [],
  slug,
  restauranteId,
  colorAcento,
  colorPrimario,
  colorFondo,
  onBack,
  onWineSelect,
  idioma = 'es',
  i = {},
}) {
  const sessionId = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )

  const dc = DC[idioma] || DC.es

  const [prefiltro, setPrefiltro]               = useState('todos')
  const [fase, setFase]                         = useState('prefiltro')
  const [pool, setPool]                         = useState([])
  const poolIdxRef                              = useRef(2)
  const [vinoA, setVinoA]                       = useState(null)
  const [vinoB, setVinoB]                       = useState(null)
  const [campeon, setCampeon]                   = useState(null)
  const [rondaActual, setRondaActual]           = useState(1)
  const [campeonVictorias, setCampeonVictorias] = useState(0)
  const [totalRondas, setTotalRondas]           = useState(0)
  const [roundKey, setRoundKey]                 = useState(0)

  const vinosConFoto = useMemo(() => vinos.filter(v => v.foto_url), [vinos])

  const tiposDisponibles = useMemo(() => {
    const counts = {}
    for (const v of vinosConFoto) counts[v.tipo] = (counts[v.tipo] || 0) + 1
    return Object.entries(counts).filter(([, n]) => n >= MIN_POOL).map(([tipo]) => tipo)
  }, [vinosConFoto])

  const poolParaTipo = useCallback((tipo) =>
    vinosConFoto.filter(v => tipo === 'todos' || v.tipo === tipo)
  , [vinosConFoto])

  function registrarRonda(aId, bId, elegidoId) {
    fetch(`/api/carta/${slug}/duelo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId.current,
        ronda: rondaActual,
        vino_a_id: aId,
        vino_b_id: bId,
        elegido_id: elegidoId ?? null,
        filtros: prefiltro !== 'todos' ? { tipo: prefiltro } : null,
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
    setRoundKey(0)
    setFase('duelo')
  }

  function elegir(vino) {
    registrarRonda(vinoA.id, vinoB.id, vino.id)

    const nuevasVictorias = campeon && vino.id === campeon.id ? campeonVictorias + 1 : 1
    const nuevoTotal      = totalRondas + 1
    const siguienteIdx    = poolIdxRef.current
    const hayMasVinos     = siguienteIdx < pool.length
    const hayMasRondas    = rondaActual < MAX_RONDAS

    setCampeon(vino)
    setCampeonVictorias(nuevasVictorias)
    setTotalRondas(nuevoTotal)

    if (!hayMasVinos || !hayMasRondas) {
      onWineSelect(vino, { victorias: nuevasVictorias, total: nuevoTotal })
      return
    }

    poolIdxRef.current = siguienteIdx + 1
    setVinoA(vino)
    setVinoB(pool[siguienteIdx])
    setRondaActual(r => r + 1)
    setRoundKey(k => k + 1)
  }

  function salirYaTengo() {
    if (fase === 'duelo' && vinoA && vinoB) registrarRonda(vinoA.id, vinoB.id, null)
    onBack()
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (vinosConFoto.length < MIN_POOL) {
    return (
      <section className={styles.duelWrap}>
        <p className={styles.emptyMsg}>{dc.pocosVinos}</p>
      </section>
    )
  }

  // ── Prefiltro ─────────────────────────────────────────────────────────────
  if (fase === 'prefiltro') {
    const poolActual   = poolParaTipo(prefiltro)
    const insuficiente = poolActual.length < MIN_POOL
    return (
      <section className={styles.duelWrap}>
        <div className={styles.prefiltroContent}>
          <p className={styles.prefiltroSub}>{dc.queTipo}</p>
          <div className={styles.tipoChips}>
            <button
              className={`${styles.tipoChip} ${prefiltro === 'todos' ? styles.tipoChipActive : ''}`}
              style={prefiltro === 'todos' ? { background: colorAcento, borderColor: colorAcento } : {}}
              onClick={() => setPrefiltro('todos')}
              type="button"
            >
              {dc.todos}
            </button>
            {tiposDisponibles.map(tipo => (
              <button
                key={tipo}
                className={`${styles.tipoChip} ${prefiltro === tipo ? styles.tipoChipActive : ''}`}
                style={prefiltro === tipo ? { background: colorAcento, borderColor: colorAcento } : {}}
                onClick={() => setPrefiltro(tipo)}
                type="button"
              >
                {(i.tipoLabel || {})[tipo] || tipo}
              </button>
            ))}
          </div>
          {insuficiente && <p className={styles.pocosAviso}>{dc.pocosVinos}</p>}
          <button
            className={styles.startBtn}
            style={{ background: colorAcento }}
            onClick={iniciarDuelo}
            disabled={insuficiente}
            type="button"
          >
            {i.dueloEmpezar || dc.empezar}
          </button>
        </div>
      </section>
    )
  }

  // ── Duelo en curso ────────────────────────────────────────────────────────
  const isChampionA = campeon?.id === vinoA?.id && rondaActual > 1

  return (
    <section className={styles.duelWrap}>

      {/* Top bar: story segments + skip action */}
      <div className={styles.duelTopBar}>
        <div className={styles.segmentTrack} role="progressbar" aria-valuenow={rondaActual} aria-valuemin={1} aria-valuemax={MAX_RONDAS} aria-label={idioma === 'en' ? `Round ${rondaActual} of ${MAX_RONDAS}` : `Ronda ${rondaActual} de ${MAX_RONDAS}`}>
          {Array.from({ length: MAX_RONDAS }, (_, idx) => (
            <div
              key={idx}
              className={styles.segment}
              style={
                idx < rondaActual - 1
                  ? { background: colorAcento }
                  : idx === rondaActual - 1
                  ? { background: colorAcento, opacity: 0.38 }
                  : {}
              }
            />
          ))}
        </div>
        <button className={styles.skipBtn} onClick={salirYaTengo} type="button">
          {i.yaTengo || dc.yaTengo}
        </button>
      </div>

      {/* Stage: champion | VS | challenger */}
      <div className={styles.duelStage}>

        {/* Card A — champion from round 2 onwards */}
        <div className={styles.cardWrap}>
          {/* Badge placeholder always rendered to preserve layout height */}
          <p
            className={styles.champBadge}
            style={{ visibility: isChampionA ? 'visible' : 'hidden', color: colorAcento }}
            aria-hidden={!isChampionA}
          >
            <ChampIcon />{dc.sigueEnPie}
          </p>
          <button
            className={`${styles.labelCard} ${isChampionA ? styles.labelCardChamp : ''}`}
            style={isChampionA ? { borderColor: colorAcento } : {}}
            onClick={() => elegir(vinoA)}
            type="button"
            aria-label={idioma === 'en' ? 'Choose wine A' : 'Elegir vino A'}
          >
            <img src={vinoA.foto_url} alt="" className={styles.labelPhoto} />
          </button>
        </div>

        {/* VS badge — key remounts it each round so the animation replays */}
        <div className={styles.vsColumn}>
          <div key={`vs-${roundKey}`} className={styles.vsBadge} style={{ background: colorAcento }}>
            VS
          </div>
        </div>

        {/* Card B — challenger, key remounts it so slide-in replays */}
        <div className={styles.cardWrap}>
          {/* Invisible placeholder matches champBadge height */}
          <p className={styles.champBadge} style={{ visibility: 'hidden' }} aria-hidden="true">‌</p>
          <button
            key={`b-${roundKey}`}
            className={`${styles.labelCard} ${styles.labelCardChallenger}`}
            onClick={() => elegir(vinoB)}
            type="button"
            aria-label={idioma === 'en' ? 'Choose wine B' : 'Elegir vino B'}
          >
            <img src={vinoB.foto_url} alt="" className={styles.labelPhoto} />
          </button>
        </div>
      </div>

      <p className={styles.duelHint}>{i.dueloHint || dc.hint}</p>
    </section>
  )
}
