'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import priceStyles from './precios.module.css'

const AJUSTES_INICIALES = {
  margen: 65,
  copas: 5,
}

function numero(valor) {
  if (typeof valor === 'string') valor = valor.replace(',', '.')
  return Number(valor) || 0
}

function euros(valor, decimales = 2) {
  return `${numero(valor).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} €`
}

function redondearBotella(valor) {
  const base = Math.floor(numero(valor))
  const decimales = numero(valor) - base
  return decimales >= 0.51 ? base + 1 : base
}

function redondearCopa(valor) {
  return Math.round(numero(valor) * 2) / 2
}

function calcularPrecios(costeValor, ajustes) {
  const coste = numero(costeValor)
  const margenObjetivo = Math.min(90, Math.max(5, numero(ajustes.margen))) / 100
  const copas = Math.min(10, Math.max(1, numero(ajustes.copas) || AJUSTES_INICIALES.copas))

  if (!coste) {
    return {
      baseBotella: 0,
      botella: 0,
      baseCopa: 0,
      copa: 0,
      margenBotella: 0,
      margenCopas: 0,
      ingresoCopas: 0,
    }
  }

  const baseBotella = coste / (1 - margenObjetivo)
  const botella = redondearBotella(baseBotella)
  const baseCopa = botella / copas
  const copa = redondearCopa(baseCopa)
  const ingresoCopas = copa * copas

  return {
    baseBotella,
    botella,
    baseCopa,
    copa,
    ingresoCopas,
    margenBotella: botella > 0 ? ((botella - coste) / botella) * 100 : 0,
    margenCopas: ingresoCopas > 0 ? ((ingresoCopas - coste) / ingresoCopas) * 100 : 0,
  }
}

function diferencia(actual, recomendado) {
  const valorActual = numero(actual)
  if (!valorActual) return { texto: 'Sin precio', tono: 'pending' }
  const delta = recomendado - valorActual
  if (Math.abs(delta) < 0.01) return { texto: 'En precio', tono: 'ok' }
  return {
    texto: `${delta > 0 ? '+' : ''}${euros(delta, delta % 1 === 0 ? 0 : 2)}`,
    tono: delta > 0 ? 'up' : 'down',
  }
}

export default function PreciosMargenes() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [ajustes, setAjustes] = useState(AJUSTES_INICIALES)
  const [simulacion, setSimulacion] = useState({ nombre: '', coste: '' })
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(1)
  const [guardandoId, setGuardandoId] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) {
        window.location.href = '/login'
        return
      }

      const consulta = supabase.from('restaurantes').select('*')
      const { data: rest } = restauranteId
        ? await consulta.eq('id', restauranteId).single()
        : await consulta.eq('email', email).single()

      if (rest) {
        setRestaurante(rest)
        const { data } = await supabase
          .from('vinos')
          .select('id, nombre, bodega, coste_compra, precio_botella, precio_copa, activo')
          .eq('restaurante_id', rest.id)
          .order('nombre')
        setVinos(data || [])

        try {
          const guardados = JSON.parse(window.localStorage.getItem(`precios_margenes_${rest.id}`) || '{}')
          setAjustes({
            ...AJUSTES_INICIALES,
            ...guardados,
            copas: numero(guardados.copas) || AJUSTES_INICIALES.copas,
          })
        } catch {}
      }
      setLoading(false)
    }
    cargar()
  }, [])

  function cambiarAjuste(campo, valor) {
    const siguientes = { ...ajustes, [campo]: valor }
    setAjustes(siguientes)
    setPagina(1)
    if (restaurante?.id) {
      window.localStorage.setItem(`precios_margenes_${restaurante.id}`, JSON.stringify(siguientes))
    }
  }

  async function aplicarPrecio(vino) {
    const recomendado = calcularPrecios(vino.coste_compra, ajustes)
    if (!recomendado.botella || !recomendado.copa) return

    setGuardandoId(vino.id)
    setMensaje('')
    const cambios = {
      precio_botella: recomendado.botella,
      precio_copa: recomendado.copa,
    }
    const { error } = await supabase.from('vinos').update(cambios).eq('id', vino.id)

    if (error) {
      setMensaje('No se pudieron aplicar los precios.')
    } else {
      setVinos(actuales => actuales.map(item => item.id === vino.id ? { ...item, ...cambios } : item))
      setMensaje(`Precios actualizados en ${vino.nombre}.`)
    }
    setGuardandoId(null)
  }

  const resultadoSimulacion = calcularPrecios(simulacion.coste, ajustes)

  const referencias = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    return vinos
      .filter(vino => vino.activo !== false)
      .filter(vino => {
        if (filtro === 'sin_coste') return !numero(vino.coste_compra)
        if (filtro === 'revisar') {
          if (!numero(vino.coste_compra)) return false
          const recomendado = calcularPrecios(vino.coste_compra, ajustes)
          return numero(vino.precio_botella) !== recomendado.botella || numero(vino.precio_copa) !== recomendado.copa
        }
        return true
      })
      .filter(vino => !termino || `${vino.nombre} ${vino.bodega || ''}`.toLowerCase().includes(termino))
  }, [vinos, busqueda, filtro, ajustes])

  const conCoste = vinos.filter(vino => vino.activo !== false && numero(vino.coste_compra) > 0)
  const porRevisar = conCoste.filter(vino => {
    const recomendado = calcularPrecios(vino.coste_compra, ajustes)
    return numero(vino.precio_botella) !== recomendado.botella || numero(vino.precio_copa) !== recomendado.copa
  })
  const totalPaginas = Math.max(1, Math.ceil(referencias.length / 10))
  const paginaActual = Math.min(pagina, totalPaginas)
  const referenciasPagina = referencias.slice((paginaActual - 1) * 10, paginaActual * 10)

  if (loading) return <LoadingState />
  if (!restaurante) return null

  return (
    <FeatureGate restaurante={restaurante} feature="precios_margenes" title="Precios y márgenes no incluidos">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Bodega"
        title="Precios y márgenes"
        subtitle="Calcula precios recomendados para vinos nuevos y revisa la rentabilidad de las referencias que ya están en carta."
        help={{
          title: 'El cálculo orienta; tú decides',
          intro: 'Los parámetros son visibles para que el restaurante entienda el criterio y pueda adaptarlo a su realidad.',
          items: [
            { title: 'Botella', text: 'Parte del coste y del margen objetivo. Los decimales desde 0,51 suben al euro siguiente; hasta 0,50 bajan.' },
            { title: 'Copa', text: 'El precio calculado puede quedar en 4 €, 4,50 €, 5 €, 5,50 €… Se redondea al múltiplo de 0,50 € más cercano.' },
            { title: 'Aplicación manual', text: 'La recomendación nunca modifica la carta hasta pulsar Aplicar precios.' },
          ],
        }}
      >
        <section className={styles.statsGrid}>
          <div className={styles.stat}><p className={styles.statValue}>{vinos.filter(v => v.activo !== false).length}</p><p className={styles.statLabel}>Vinos activos</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{conCoste.length}</p><p className={styles.statLabel}>Con coste informado</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{porRevisar.length}</p><p className={styles.statLabel}>Precios para revisar</p></div>
          <div className={styles.stat}><p className={styles.statValue}>{ajustes.margen}%</p><p className={styles.statLabel}>Margen objetivo</p></div>
        </section>

        <section className={styles.panel} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Criterio de cálculo</h2>
              <p className={styles.panelSub}>Estos ajustes se conservan para este restaurante.</p>
            </div>
            <span className={styles.badge}>Configuración comercial</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>Margen bruto objetivo</label>
                <div className={priceStyles.inputSuffix}>
                  <input className={styles.input} type="number" min="5" max="90" value={ajustes.margen} onChange={e => cambiarAjuste('margen', e.target.value)} />
                  <span>%</span>
                </div>
              </div>
              <div>
                <label className={styles.label}>Copas servidas por botella</label>
                <input className={styles.input} type="number" min="1" max="10" step="1" value={ajustes.copas} onChange={e => cambiarAjuste('copas', e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.panelDark} ${priceStyles.simulator}`} style={{ marginBottom: 16 }}>
          <div className={styles.panelHead}>
            <div>
              <p className={styles.eyebrow}>Vino nuevo</p>
              <h2 className={styles.panelTitle}>Simular un precio</h2>
              <p className={styles.panelSub}>Prueba una referencia antes de incorporarla a la carta.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={priceStyles.simulatorGrid}>
              <div className={priceStyles.simulatorFields}>
                <div>
                  <label className={styles.label}>Nombre del vino (opcional)</label>
                  <input className={styles.input} value={simulacion.nombre} onChange={e => setSimulacion({ ...simulacion, nombre: e.target.value })} placeholder="Ej. Finca La Montesa" />
                </div>
                <div>
                  <label className={styles.label}>Coste de compra</label>
                  <div className={priceStyles.inputSuffix}>
                    <input className={styles.input} type="number" min="0" step="0.01" value={simulacion.coste} onChange={e => setSimulacion({ ...simulacion, coste: e.target.value })} placeholder="8,50" />
                    <span>€</span>
                  </div>
                </div>
              </div>
              <div className={priceStyles.results}>
                <article>
                  <span>Botella recomendada</span>
                  <strong>{euros(resultadoSimulacion.botella, 0)}</strong>
                  <small>Base calculada: {euros(resultadoSimulacion.baseBotella)}</small>
                </article>
                <article>
                  <span>Copa recomendada</span>
                  <strong>{euros(resultadoSimulacion.copa)}</strong>
                  <small>Margen estimado: {Math.round(resultadoSimulacion.margenCopas)}%</small>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Revisar la carta actual</h2>
              <p className={styles.panelSub}>Compara los precios vigentes y aplica la recomendación vino a vino.</p>
            </div>
            <span className={styles.badge}>{referencias.length} referencias</span>
          </div>
          <div className={styles.panelBody}>
            <div className={priceStyles.toolbar}>
              <input className={styles.input} value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1) }} placeholder="Buscar vino o bodega..." />
              <select className={styles.select} value={filtro} onChange={e => { setFiltro(e.target.value); setPagina(1) }}>
                <option value="todos">Todos</option>
                <option value="revisar">Precios para revisar</option>
                <option value="sin_coste">Sin coste informado</option>
              </select>
            </div>

            {mensaje && <div className={priceStyles.notice} role="status">{mensaje}</div>}

            <div className={priceStyles.priceList}>
              {referenciasPagina.map(vino => {
                const recomendado = calcularPrecios(vino.coste_compra, ajustes)
                const botella = diferencia(vino.precio_botella, recomendado.botella)
                const copa = diferencia(vino.precio_copa, recomendado.copa)
                const sinCoste = !numero(vino.coste_compra)

                return (
                  <article className={priceStyles.priceRow} key={vino.id}>
                    <div className={priceStyles.wineIdentity}>
                      <strong>{vino.nombre}</strong>
                      <span>{vino.bodega || 'Sin bodega'} · coste {sinCoste ? 'pendiente' : euros(vino.coste_compra)}</span>
                    </div>
                    <div className={priceStyles.comparison}>
                      <span>Botella</span>
                      <strong>{euros(vino.precio_botella, 0)} → {sinCoste ? '—' : euros(recomendado.botella, 0)}</strong>
                      {!sinCoste && <small data-tone={botella.tono}>{botella.texto}</small>}
                    </div>
                    <div className={priceStyles.comparison}>
                      <span>Copa</span>
                      <strong>{euros(vino.precio_copa)} → {sinCoste ? '—' : euros(recomendado.copa)}</strong>
                      {!sinCoste && <small data-tone={copa.tono}>{copa.texto}</small>}
                    </div>
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={sinCoste || guardandoId === vino.id || (botella.tono === 'ok' && copa.tono === 'ok')}
                      onClick={() => aplicarPrecio(vino)}
                    >
                      {sinCoste ? 'Falta coste' : guardandoId === vino.id ? 'Guardando...' : botella.tono === 'ok' && copa.tono === 'ok' ? 'En precio' : 'Aplicar precios'}
                    </button>
                  </article>
                )
              })}
              {referencias.length === 0 && <div className={styles.empty}>No hay referencias para este filtro.</div>}
            </div>
            {totalPaginas > 1 && (
              <nav className={priceStyles.pagination} aria-label="Paginación de precios">
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={paginaActual === 1}
                  onClick={() => setPagina(actual => Math.max(1, actual - 1))}
                >
                  Anterior
                </button>
                <div className={priceStyles.pageTabs}>
                  {Array.from({ length: totalPaginas }, (_, index) => index + 1).map(numeroPagina => (
                    <button
                      type="button"
                      key={numeroPagina}
                      className={numeroPagina === paginaActual ? priceStyles.pageActive : priceStyles.pageButton}
                      onClick={() => setPagina(numeroPagina)}
                      aria-current={numeroPagina === paginaActual ? 'page' : undefined}
                    >
                      {numeroPagina}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.ghost}
                  disabled={paginaActual === totalPaginas}
                  onClick={() => setPagina(actual => Math.min(totalPaginas, actual + 1))}
                >
                  Siguiente
                </button>
              </nav>
            )}
          </div>
        </section>
      </ModuleShell>
    </FeatureGate>
  )
}
