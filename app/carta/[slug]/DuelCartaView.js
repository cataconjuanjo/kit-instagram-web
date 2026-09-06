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

// Strings are minimal — the rest come from the carta i18n object passed as prop
const DC = {
  es: { pocosVinos: 'No hay suficientes vinos con etiqueta para este tipo.', todos: 'Todos' },
  en: { pocosVinos: 'Not enough labelled wines for this type.', todos: 'All' },
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

  function registrarRonda(aId, bId, elegidoId) {
    fetch(`/api/carta/${slug}/duelo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id:     sessionId.current,
        ronda:          rondaActual,
        vino_a_id:      aId,
        vino_b_id:      bId,
        elegido_id:     elegidoId ?? null,
        filtros:        prefiltro !== 'todos' ? { tipo: prefiltro } : null,
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
  }

  function salirYaTengo() {
    if (fase === 'duelo' && vinoA && vinoB) registrarRonda(vinoA.id, vinoB.id, null)
    onBack()
  }

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
          <p className={styles.prefiltroSub}>
            {idioma === 'en' ? 'What type of wine?' : '¿Qué tipo de vino?'}
          </p>
          <div className={styles.tipoChips}>
            <button
              className={`${styles.tipoChip} ${prefiltro === 'todos' ? styles.tipoChipActive : ''}`}
              style={prefiltro === 'todos' ? { background: colorAcento } : {}}
              onClick={() => setPrefiltro('todos')}
              type="button"
            >
              {dc.todos}
            </button>
            {tiposDisponibles.map(tipo => (
              <button
                key={tipo}
                className={`${styles.tipoChip} ${prefiltro === tipo ? styles.tipoChipActive : ''}`}
                style={prefiltro === tipo ? { background: colorAcento } : {}}
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
            {i.dueloEmpezar || (idioma === 'en' ? 'Start duel →' : 'Empezar duelo →')}
          </button>
        </div>
      </section>
    )
  }

  // ── Duelo en curso ────────────────────────────────────────────────────────
  return (
    <section className={styles.duelWrap}>
      <div className={styles.duelHeader}>
        <span className={styles.duelTitulo} style={{ color: colorAcento }}>
          {i.duelo || (idioma === 'en' ? 'Blind duel' : 'Duelo de etiquetas')}
        </span>
        <span className={styles.duelRonda}>
          {i.dueloRonda
            ? i.dueloRonda(rondaActual, MAX_RONDAS)
            : (idioma === 'en' ? `Round ${rondaActual} of ${MAX_RONDAS}` : `Ronda ${rondaActual} de ${MAX_RONDAS}`)}
        </span>
      </div>

      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${((rondaActual - 1) / MAX_RONDAS) * 100}%`, background: colorAcento }}
        />
      </div>

      <div className={styles.duelStage}>
        <button
          className={styles.labelCard}
          onClick={() => elegir(vinoA)}
          type="button"
          aria-label={idioma === 'en' ? 'Choose wine A' : 'Elegir vino A'}
        >
          <img src={vinoA.foto_url} alt="" className={styles.labelPhoto} />
        </button>
        <div className={styles.vsBadge} style={{ background: colorAcento }}>VS</div>
        <button
          className={styles.labelCard}
          onClick={() => elegir(vinoB)}
          type="button"
          aria-label={idioma === 'en' ? 'Choose wine B' : 'Elegir vino B'}
        >
          <img src={vinoB.foto_url} alt="" className={styles.labelPhoto} />
        </button>
      </div>

      <p className={styles.duelHint}>
        {i.dueloHint || (idioma === 'en' ? 'Tap the one you prefer' : 'Toca la que más te llame')}
      </p>

      <button className={styles.yaTengoBtn} onClick={salirYaTengo} type="button">
        {i.yaTengo || (idioma === 'en' ? 'I already have my wine' : 'Ya tengo mi vino')}
      </button>
    </section>
  )
}
