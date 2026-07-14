'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { actividadRealDesdeISO } from '../../lib/actividadReal'
import { esPerfilBodega } from '../../lib/plans'
import { priorizarVentas } from '../../lib/salesPriority'
import { FeatureGate, LoadingState, ModuleShell, StatCard } from '../moduleComponents'
import styles from '../module.module.css'

function decimal(val) { return parseFloat(val) || 0 }

async function copiarTexto(texto) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = texto
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const CATEGORIAS = [
  {
    id: 'estrella',
    icon: 'E',
    label: 'Estrella',
    desc: 'Alta salida · Alto margen',
    acciones: [
      'Protégelo: stock, reposición y proveedor siempre controlados.',
      'Mantén el precio salvo que el coste cambie.',
      'Úsalo como referencia de confianza para dirección.',
    ],
    color: '#7a5a1a',
    borde: '#d4a636',
    fondo: '#fdf8ee',
  },
  {
    id: 'joya',
    icon: 'J',
    label: 'Joya oculta',
    desc: 'Baja salida · Alto margen',
    acciones: [
      'Decide si merece más presencia o si ocupa demasiado capital.',
      'Prepara argumento de venta y momento de consumo.',
      'Mide 30 días antes de tocar precio.',
    ],
    color: '#2e6b47',
    borde: '#4a9c69',
    fondo: '#eef7f2',
  },
  {
    id: 'caballo',
    icon: 'C',
    label: 'Caballo de batalla',
    desc: 'Alta salida · Bajo margen',
    acciones: [
      'Renegocia el precio de compra con el proveedor.',
      'Ajusta PVP si el posicionamiento lo permite.',
      'Busca sustituto si el margen no se puede defender.',
    ],
    color: '#1a4f7a',
    borde: '#2e7ab8',
    fondo: '#eef4fb',
  },
  {
    id: 'revisar',
    icon: 'R',
    label: 'Revisar',
    desc: 'Baja salida · Bajo margen',
    acciones: [
      'Candidato a archivar, liquidar o sustituir.',
      'Negocia el precio de compra o busca otro proveedor.',
      'Si se conserva por criterio, documenta el motivo.',
    ],
    color: '#7a2020',
    borde: '#c03030',
    fondo: '#fdf0f0',
  },
]

const ANALISIS_DEMO = {
  estado: 'demo',
  totalVentas: 42,
  ventasTPV: 30,
  ventasSalaKpi: 12,
  ventasSalaOmitidas: 0,
  fuenteVentas: 'TPV + Sala',
  barreraRentabilidad: 12.4,
  barreraPopularidad: 17.5,
  vinosSinCoste: 0,
  vinos: [
    { id: 'demo-estrella', nombre: 'Ejemplo: Rioja crianza', bodega: 'Bodega de muestra', margen: 15.8, ventas: 14, pctVentas: 33.3, categoria: 'estrella' },
    { id: 'demo-joya', nombre: 'Ejemplo: Godello sobre lías', bodega: 'Bodega de muestra', margen: 14.2, ventas: 4, pctVentas: 9.5, categoria: 'joya' },
    { id: 'demo-caballo', nombre: 'Ejemplo: Verdejo por copa', bodega: 'Bodega de muestra', margen: 8.6, ventas: 16, pctVentas: 38.1, categoria: 'caballo' },
    { id: 'demo-revisar', nombre: 'Ejemplo: Reserva clásico', bodega: 'Bodega de muestra', margen: 7.9, ventas: 3, pctVentas: 7.1, categoria: 'revisar' },
  ],
}

export default function MenuEngineering() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoriaActiva, setCategoriaActiva] = useState('todas')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }
      const queryRestaurante = supabase.from('restaurantes').select('*')
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const desdeActividad = actividadRealDesdeISO(rest)
        let ventasQuery = Promise.resolve({ data: [] })
        if (desdeActividad) {
          ventasQuery = supabase
            .from('estadisticas')
            .select('id, detalle, created_at')
            .eq('restaurante_id', rest.id)
            .eq('tipo', 'venta')
            .gte('created_at', desdeActividad)
        }
        const [{ data: vinosData }, { data: statsData }] = await Promise.all([
          supabase
            .from('vinos')
            .select('id, nombre, bodega, precio_botella, coste_compra, stock, proveedor')
            .eq('restaurante_id', rest.id)
            .eq('activo', true),
          ventasQuery,
        ])
        setVinos(vinosData || [])
        setVentas(statsData || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  const analisis = useMemo(() => {
    if (!vinos.length) return null

    const lecturaVentas = priorizarVentas(ventas)
    const ventasPorId = lecturaVentas.ventasPorVinoId

    const vinosConCoste = vinos.filter(
      v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0
    )
    if (vinosConCoste.length < 3) return { estado: 'sin_coste', vinosConCoste }

    const totalVentas = lecturaVentas.unidadesKpi
    const resumenFuente = {
      ventasTPV: lecturaVentas.unidadesTPV,
      ventasSalaKpi: lecturaVentas.unidadesSalaKpi,
      ventasSalaOmitidas: lecturaVentas.unidadesSalaOmitidas,
      ventasMarcadas: lecturaVentas.ventasMarcadasEventos,
      fuenteVentas: lecturaVentas.tieneTPV ? 'TPV + Sala' : 'Sala',
    }
    if (totalVentas < 5) return { estado: 'sin_ventas', vinosConCoste, totalVentas, ...resumenFuente }

    const vinosCalculados = vinosConCoste.map(v => ({
      ...v,
      margen: decimal(v.precio_botella) - decimal(v.coste_compra),
      ventas: ventasPorId[v.id] || 0,
      pctVentas: ((ventasPorId[v.id] || 0) / totalVentas) * 100,
      valorStockCoste: decimal(v.stock) * decimal(v.coste_compra),
      ingresosEstimados: (ventasPorId[v.id] || 0) * decimal(v.precio_botella),
    }))

    const barreraRentabilidad =
      vinosCalculados.reduce((s, v) => s + v.margen, 0) / vinosCalculados.length

    const vinosConVentas = vinosCalculados.filter(v => v.ventas > 0).length
    const barreraPopularidad = vinosConVentas > 0
      ? (100 / vinosConVentas) * 0.7
      : 0

    const clasificados = vinosCalculados.map(v => {
      const rentable = v.margen >= barreraRentabilidad
      const popular = v.pctVentas >= barreraPopularidad
      return {
        ...v,
        retornoInventario: v.valorStockCoste > 0 ? v.ingresosEstimados / v.valorStockCoste : null,
        categoria: rentable && popular ? 'estrella'
          : !rentable && popular ? 'caballo'
          : rentable && !popular ? 'joya'
          : 'revisar',
      }
    })

    return {
      estado: 'ok',
      vinos: clasificados,
      totalVentas,
      ...resumenFuente,
      barreraRentabilidad,
      barreraPopularidad,
      vinosSinCoste: vinos.length - vinosConCoste.length,
    }
  }, [vinos, ventas])

  if (loading) return <LoadingState />
  if (!restaurante) return null

  const perfilBodega = esPerfilBodega(restaurante)
  const esDemo = analisis?.estado !== 'ok'
  const analisisVisible = esDemo ? ANALISIS_DEMO : analisis
  const fuenteOperativa = perfilBodega && analisisVisible?.fuenteVentas === 'Sala'
    ? 'Movimientos'
    : (analisisVisible?.fuenteVentas || (perfilBodega ? 'TPV / movimientos' : 'Sala'))
  const vinosAnalizados = analisisVisible?.vinos || []
  const vinosFiltrados = categoriaActiva === 'todas'
    ? vinosAnalizados
    : vinosAnalizados.filter(v => v.categoria === categoriaActiva)
  const maxMargen = Math.max(...vinosAnalizados.map(v => v.margen), analisisVisible?.barreraRentabilidad || 1, 1)
  const maxPopularidad = Math.max(...vinosAnalizados.map(v => v.pctVentas), analisisVisible?.barreraPopularidad || 1, 1)
  const resumenCategorias = CATEGORIAS.map(cat => ({
    ...cat,
    vinos: vinosAnalizados.filter(v => v.categoria === cat.id),
  }))
  const valorStockTotal = vinosAnalizados.reduce((sum, v) => sum + decimal(v.valorStockCoste), 0)
  const ingresosInventarioTotal = vinosAnalizados.reduce((sum, v) => sum + decimal(v.ingresosEstimados), 0)
  const retornoInventarioGlobal = valorStockTotal > 0 ? ingresosInventarioTotal / valorStockTotal : null
  const capitalSinVenta = vinosAnalizados
    .filter(v => decimal(v.valorStockCoste) > 0 && v.ventas === 0)
    .reduce((sum, v) => sum + decimal(v.valorStockCoste), 0)
  const accionesPrioritarias = [
    ...vinosAnalizados
      .filter(v => ['joya', 'revisar'].includes(v.categoria) && decimal(v.valorStockCoste) > 0 && (v.retornoInventario == null || v.retornoInventario < 0.5))
      .sort((a, b) => decimal(b.valorStockCoste) - decimal(a.valorStockCoste))
      .slice(0, 2)
      .map(v => ({ vino: v, tipo: 'Liberar capital', texto: `Tiene ${decimal(v.valorStockCoste).toFixed(0)} EUR a coste y retorno ${v.retornoInventario == null ? '0.00' : v.retornoInventario.toFixed(2)}x.` })),
    ...vinosAnalizados
      .filter(v => v.categoria === 'caballo')
      .sort((a, b) => b.ventas - a.ventas)
      .slice(0, 3)
      .map(v => ({ vino: v, tipo: 'Renegociar margen', texto: `Se vende bien (${v.ventas}) pero deja ${v.margen.toFixed(2)}€ por botella.` })),
    ...vinosAnalizados
      .filter(v => v.categoria === 'joya')
      .sort((a, b) => b.margen - a.margen)
      .slice(0, 3)
      .map(v => ({
        vino: v,
        tipo: perfilBodega ? 'Activar joya' : 'Empujar en sala',
        texto: perfilBodega
          ? `Margen alto (${v.margen.toFixed(2)}€) con poca salida (${v.pctVentas.toFixed(1)}%). Decidir si se defiende, se rota o se libera capital.`
          : `Margen alto (${v.margen.toFixed(2)}€) con poca salida (${v.pctVentas.toFixed(1)}%).`,
      })),
    ...vinosAnalizados
      .filter(v => v.categoria === 'revisar')
      .sort((a, b) => a.ventas - b.ventas || a.margen - b.margen)
      .slice(0, 3)
      .map(v => ({ vino: v, tipo: 'Revisar continuidad', texto: perfilBodega ? 'Bajo margen y baja salida. Candidato a archivar, liquidar o sustituir.' : 'Bajo margen y baja popularidad. Candidato a sustituir.' })),
  ].slice(0, 5)

  const informeAcciones = [
    `${perfilBodega ? 'Mapa de bodega' : 'Plan de rentabilidad'} - ${restaurante?.nombre || (perfilBodega ? 'Bodega' : 'Restaurante')}`,
    '',
    `Ventas KPI analizadas: ${analisisVisible?.totalVentas || 0}`,
    `Fuente prioritaria: ${fuenteOperativa}`,
    `TPV: ${analisisVisible?.ventasTPV || 0} | ${perfilBodega ? 'movimientos no duplicados' : 'Sala no duplicada'}: ${analisisVisible?.ventasSalaKpi || 0}`,
    analisisVisible?.ventasSalaOmitidas ? `${perfilBodega ? 'Movimientos omitidos por TPV' : 'Sala omitida por TPV'}: ${analisisVisible.ventasSalaOmitidas}` : null,
    `Margen medio: ${analisisVisible?.barreraRentabilidad?.toFixed(2) || '0.00'}€`,
    `${perfilBodega ? 'Barrera de salida' : 'Barrera popularidad'}: ${analisisVisible?.barreraPopularidad?.toFixed(1) || '0.0'}%`,
    '',
    'Acciones prioritarias:',
    ...(accionesPrioritarias.length
      ? accionesPrioritarias.map((item, index) => `${index + 1}. ${item.tipo}: ${item.vino.nombre}. ${item.texto}`)
      : ['1. Sin acciones urgentes con los datos actuales.']),
  ].filter(linea => linea !== null).join('\n')

  async function copiarPlan() {
    await copiarTexto(informeAcciones)
    setMensaje('Plan copiado.')
    setTimeout(() => setMensaje(''), 1800)
  }

  return (
    <FeatureGate restaurante={restaurante} feature="estadisticas" title={perfilBodega ? 'Mapa de bodega no incluido' : 'Análisis no incluido'}>
      <ModuleShell
        restaurante={restaurante}
        eyebrow={perfilBodega ? 'Mapa sumiller' : 'Análisis'}
        title={perfilBodega ? 'Mapa de bodega: estrellas y joyas' : 'Rentabilidad de carta'}
        subtitle={perfilBodega
          ? 'Cada referencia clasificada por salida real, margen y capital inmovilizado. Decide qué proteger, activar, renegociar o archivar.'
          : 'Cada vino clasificado por popularidad real y margen. Toma decisiones de precio, posición y sustitución con datos.'}
        help={{
          title: perfilBodega ? 'Lectura del sumiller' : 'Cómo funciona',
          intro: perfilBodega
            ? 'Cruza coste, PVP, ventas KPI y stock para convertir la bodega en decisiones: proteger, activar, renegociar o liberar capital.'
            : 'Necesita dos datos por vino: precio de coste (en Bodega) y ventas registradas en Sala. Cuantas más ventas acumuladas, más preciso el análisis.',
          items: perfilBodega ? [
            { title: 'Estrella', text: 'Alta salida y margen sano. Proteger stock y continuidad.' },
            { title: 'Joya oculta', text: 'Rentable pero dormida. Decidir si se activa o libera capital.' },
            { title: 'Caballo de batalla', text: 'Sale mucho pero deja poco. Renegociar coste, PVP o sustituto.' },
            { title: 'Revisar', text: 'Poca salida y bajo margen. Archivar, liquidar o justificar por criterio.' },
          ] : [
            { title: 'Estrella', text: 'Se vende bien y deja buen margen. Cuídalo y dale visibilidad.' },
            { title: 'Joya oculta', text: 'Rentable pero poco pedido. Entrenar sala o darle mejor posición en carta.' },
            { title: 'Caballo de batalla', text: 'Se vende mucho pero con poco margen. Renegociar coste o ajustar PVP.' },
            { title: 'Revisar', text: 'Poco vendido y poco rentable. Candidato a salir de carta.' },
          ],
        }}
      >
        {analisis?.estado === 'sin_coste' && (
          <div className={styles.panel} style={{ borderLeft: '3px solid #d4a636', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#7a5a20' }}>
              <strong>Faltan precios de coste.</strong>{' '}
              Introduce el coste de compra en al menos 3 vinos desde{' '}
              <a href="/dashboard/bodega#referencias" style={{ color: '#7a5a20' }}>{perfilBodega ? 'Bodega → Referencias' : 'Bodega → Inventario'}</a>{' '}
              para activar el mapa.{' '}
              {analisis.vinosConCoste.length > 0 && `Ahora solo hay ${analisis.vinosConCoste.length}.`}
            </p>
          </div>
        )}

        {analisis?.estado === 'sin_ventas' && (
          <div className={styles.panel} style={{ borderLeft: '3px solid #d4a636', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#7a5a20' }}>
              <strong>Pocas ventas registradas.</strong>{' '}
              Hay {analisis.totalVentas} de 5 ventas KPI mínimas. Cuantas más semanas de datos, más fiable el resultado.
            </p>
          </div>
        )}

        {esDemo && (
          <div className={styles.panel} style={{ borderLeft: '3px solid #531827', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#531827' }}>
              <strong>Vista previa con datos de ejemplo.</strong>{' '}
              {perfilBodega
                ? 'Así se organizará la bodega cuando haya suficiente actividad real. Ninguna cifra ni referencia de esta muestra pertenece a tu cuenta.'
                : 'Así se organizará tu carta cuando haya suficiente actividad real. Ninguna cifra ni referencia de esta muestra pertenece a tu restaurante.'}
            </p>
          </div>
        )}

        {analisisVisible && (
          <>
            <section className={styles.profitHero}>
              <div>
                <p className={styles.eyebrow}>{perfilBodega ? 'Mapa estrella / joya' : 'Mapa de decisión'}</p>
                <h2>{perfilBodega ? 'Qué proteger, activar o sacar de bodega' : 'Qué vino empujar, cuidar o sacar'}</h2>
                <p>
                  {perfilBodega
                    ? 'La bodega se cruza por margen, salida real y capital. Arriba interesa; a la derecha se mueve. Lo importante es decidir el siguiente movimiento.'
                    : 'La carta se cruza por margen y popularidad real. Arriba interesa; a la derecha se vende. Lo importante no es mirar números, es decidir el siguiente movimiento.'}
                </p>
                <div className={styles.profitHeroActions}>
                  <button type="button" className={styles.primary} onClick={copiarPlan}>Copiar plan</button>
                  <a className={styles.secondary} href={perfilBodega ? '/dashboard/tpv' : '/dashboard/sala'}>{perfilBodega ? 'Importar ventas' : 'Registrar ventas'}</a>
                  <a className={styles.ghost} href="/dashboard/bodega">Completar costes</a>
                </div>
                {mensaje && <p className={styles.tiny}>{mensaje}</p>}
              </div>
              <div className={styles.profitHeroScore} aria-label={`${accionesPrioritarias.length} acciones prioritarias`}>
                <strong>{accionesPrioritarias.length}</strong>
                <span>acciones claras</span>
              </div>
            </section>

            <section className={styles.panel} style={{ marginBottom: 16, borderLeft: '3px solid #531827' }}>
              <div className={styles.panelHead}>
                <div>
                  <p className={styles.eyebrow}>Capa WINSPID</p>
                  <h2 className={styles.panelTitle}>Retorno de inventario</h2>
                  <p className={styles.panelSub}>
                    Mide cuánto vende cada euro inmovilizado en bodega. No cambia los cuadrantes: ayuda a saber si Estrella, Joya, Caballo o Revisar también trabajan bien el capital.
                  </p>
                </div>
              </div>
              <div className={styles.statsGrid} style={{ marginBottom: 0 }}>
                <div className={styles.stat}>
                  <p className={styles.statValue}>{retornoInventarioGlobal == null ? '-' : `${retornoInventarioGlobal.toFixed(2)}x`}</p>
                  <p className={styles.statLabel}>Ventas por euro en bodega</p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statValue}>{valorStockTotal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</p>
                  <p className={styles.statLabel}>Capital analizado</p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statValue}>{capitalSinVenta.toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</p>
                  <p className={styles.statLabel}>Capital sin venta</p>
                </div>
                <div className={styles.stat}>
                  <p className={styles.statValue}>{ingresosInventarioTotal.toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR</p>
                  <p className={styles.statLabel}>Venta estimada</p>
                </div>
              </div>
            </section>

            <section className={`${styles.statsGrid} ${styles.profitStats}`}>
              <StatCard
                value={analisisVisible.totalVentas}
                label="Ventas KPI"
                hint="Base del mapa."
                info="Ventas usadas para clasificar la carta. TPV tiene prioridad y sala se usa solo cuando no duplica una venta real."
              />
              <StatCard
                value={`${analisisVisible.ventasTPV ?? '-'}/${analisisVisible.ventasSalaKpi ?? '-'}`}
                label={perfilBodega ? 'TPV/movimientos' : 'TPV/Sala'}
                hint="Fuentes separadas."
                info="Muestra cuantas ventas vienen del TPV y cuantas de sala o movimientos no duplicados. Sirve para saber de donde nace el analisis."
              />
              <StatCard
                value={`${analisisVisible.barreraRentabilidad.toFixed(2)} EUR`}
                label="Margen medio"
                hint="Umbral del cuadrante."
                info="Media del beneficio absoluto por botella entre vinos con coste y PVP. Se usa como linea para separar margen alto y bajo."
              />
              <StatCard
                value={`${analisisVisible.barreraPopularidad.toFixed(1)}%`}
                label={perfilBodega ? 'Barrera salida' : 'Barrera popularidad'}
                hint="Umbral de movimiento."
                info="Porcentaje minimo de ventas sobre el total para considerar que una referencia se mueve bien dentro del periodo analizado."
              />
              <StatCard
                value={resumenCategorias.find(c => c.id === 'estrella')?.vinos.length || 0}
                label="Vinos estrella"
                hint="Alta salida y margen."
                info="Referencias que venden por encima de la barrera de salida y dejan margen por encima de la media. Conviene proteger stock y proveedor."
              />
              <StatCard
                value={retornoInventarioGlobal == null ? '-' : `${retornoInventarioGlobal.toFixed(2)}x`}
                label="Retorno inventario"
                hint="Ventas por euro en bodega."
                info="Relaciona venta estimada con el capital a coste inmovilizado. Cuanto mas bajo, mas dinero hay parado respecto a la salida."
              />
              <StatCard
                value={`${capitalSinVenta.toLocaleString('es-ES', { maximumFractionDigits: 0 })} EUR`}
                label="Capital sin venta"
                hint="Stock parado."
                info="Valor a coste de referencias con stock pero sin ventas KPI en el periodo. Es una senal para no comprar mas, activar o retirar."
              />
              {analisisVisible.vinosSinCoste > 0 && (
                <StatCard
                  value={analisisVisible.vinosSinCoste}
                  label="Sin coste de compra"
                  hint="No entran en margen."
                  info="Vinos activos sin coste informado. No se pueden clasificar bien por rentabilidad hasta completar ese dato."
                />
              )}
            </section>

            {!esDemo && analisisVisible.ventasSalaOmitidas > 0 && (
              <section className={styles.panel} style={{ marginBottom: 16 }}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>TPV como fuente prioritaria</h2>
                    <p className={styles.panelSub}>
                      {perfilBodega
                        ? `${analisisVisible.ventasSalaOmitidas} movimientos no entran en KPI porque ya existe TPV para el mismo vino y día.`
                        : `${analisisVisible.ventasSalaOmitidas} ventas marcadas en sala no entran en KPI porque ya existe TPV para el mismo vino y día.`}
                    </p>
                  </div>
                  <span className={styles.badge}>sin doble conteo</span>
                </div>
              </section>
            )}

            {analisisVisible.vinosSinCoste > 0 && (
              <section className={styles.panel} style={{ marginBottom: 16 }}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>Dato pendiente</h2>
                    <p className={styles.panelSub}>
                      {analisisVisible.vinosSinCoste} {analisisVisible.vinosSinCoste === 1 ? 'vino' : 'vinos'} sin coste de compra no {analisisVisible.vinosSinCoste === 1 ? 'aparece' : 'aparecen'} en el análisis.
                    </p>
                  </div>
                  <a className={styles.secondary} href="/dashboard/bodega">Completar en Bodega</a>
                </div>
              </section>
            )}

            <section className={styles.gridTwo}>
              <div className={styles.panelDark}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>{perfilBodega ? 'Matriz de bodega' : 'Matriz de carta'}</h2>
                    <p className={styles.panelSub}>{perfilBodega ? 'Cada punto es una referencia. Margen arriba, salida real a la derecha.' : 'Cada punto es un vino. Margen arriba, popularidad a la derecha.'}</p>
                  </div>
                </div>
                <div className={styles.panelBody}>
                  <div className={styles.profitMatrix}>
                    <span className={styles.profitAxisY}>Margen</span>
                    <span className={styles.profitAxisX}>Popularidad</span>
                    <span className={styles.profitThresholdY} style={{ left: `${Math.min(88, Math.max(12, (analisisVisible.barreraPopularidad / maxPopularidad) * 82 + 8))}%` }} />
                    <span className={styles.profitThresholdX} style={{ bottom: `${Math.min(88, Math.max(12, (analisisVisible.barreraRentabilidad / maxMargen) * 82 + 8))}%` }} />
                    <span className={`${styles.profitQuadrantLabel} ${styles.profitQuadrantTopRight}`}>Estrella</span>
                    <span className={`${styles.profitQuadrantLabel} ${styles.profitQuadrantTopLeft}`}>Joya</span>
                    <span className={`${styles.profitQuadrantLabel} ${styles.profitQuadrantBottomRight}`}>Renegociar</span>
                    <span className={`${styles.profitQuadrantLabel} ${styles.profitQuadrantBottomLeft}`}>Revisar</span>
                    {vinosAnalizados.map(vino => {
                      const cat = CATEGORIAS.find(c => c.id === vino.categoria)
                      const left = Math.min(92, Math.max(8, (vino.pctVentas / maxPopularidad) * 84 + 6))
                      const bottom = Math.min(92, Math.max(8, (vino.margen / maxMargen) * 84 + 6))
                      return (
                        <button
                          key={vino.id}
                          type="button"
                          className={`${styles.profitPoint} ${categoriaActiva !== 'todas' && categoriaActiva !== vino.categoria ? styles.profitPointMuted : ''}`}
                          style={{ left: `${left}%`, bottom: `${bottom}%`, borderColor: cat?.borde, background: cat?.color }}
                          onClick={() => setCategoriaActiva(vino.categoria)}
                          aria-label={`${vino.nombre}. ${cat?.label}. Margen ${vino.margen.toFixed(2)} euros, ${perfilBodega ? 'salida' : 'popularidad'} ${vino.pctVentas.toFixed(1)} por ciento`}
                          title={`${vino.nombre} · ${cat?.label}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.panelHead}>
                  <div>
                    <h2 className={styles.panelTitle}>Acciones prioritarias</h2>
                    <p className={styles.panelSub}>{perfilBodega ? 'Ordenadas para que compra, inventario y dirección sepan qué mover primero.' : 'Ordenadas para que sala y compras sepan qué mover primero.'}</p>
                  </div>
                  <button type="button" className={styles.secondary} onClick={copiarPlan}>Copiar</button>
                </div>
                <div className={styles.panelBody}>
                  {accionesPrioritarias.length ? (
                    <div className={styles.itemStack}>
                      {accionesPrioritarias.map(item => {
                        const cat = CATEGORIAS.find(c => c.id === item.vino.categoria)
                        return (
                          <article className={styles.profitActionCard} key={`${item.tipo}-${item.vino.id}`}>
                            <span style={{ borderColor: cat?.borde, color: cat?.color }}>{cat?.icon}</span>
                            <div>
                              <p className={styles.eyebrow}>{item.tipo}</p>
                              <h3>{item.vino.nombre}</h3>
                              <p>{item.texto}</p>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className={styles.empty}>Sin acciones urgentes con los datos actuales.</div>
                  )}
                </div>
              </div>
            </section>

            <section className={styles.panel} style={{ marginTop: 16 }}>
              <div className={styles.panelHead}>
                <div>
                  <h2 className={styles.panelTitle}>Cuadrantes</h2>
                  <p className={styles.panelSub}>{perfilBodega ? 'Filtra la bodega por tipo de decisión: proteger, activar, renegociar o revisar.' : 'Filtra la lista para trabajar solo el tipo de vino que toca ahora.'}</p>
                </div>
                <div className={styles.segmented} role="group" aria-label="Filtrar rentabilidad por cuadrante">
                  <button type="button" className={categoriaActiva === 'todas' ? styles.segmentActive : ''} onClick={() => setCategoriaActiva('todas')}>Todos</button>
                  {CATEGORIAS.map(cat => (
                    <button key={cat.id} type="button" className={categoriaActiva === cat.id ? styles.segmentActive : ''} onClick={() => setCategoriaActiva(cat.id)}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.profitCategoryGrid}>
                  {resumenCategorias.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`${styles.profitCategoryChip} ${categoriaActiva === cat.id ? styles.profitCategoryChipActive : ''}`}
                      onClick={() => setCategoriaActiva(cat.id)}
                      style={{ borderColor: cat.borde }}
                    >
                      <span style={{ color: cat.color }}>{cat.icon}</span>
                      <strong>{cat.vinos.length}</strong>
                      <small>{cat.label}</small>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              {CATEGORIAS.map(cat => {
                if (categoriaActiva !== 'todas' && categoriaActiva !== cat.id) return null
                const vinosCat = vinosFiltrados
                  .filter(v => v.categoria === cat.id)
                  .sort((a, b) => b.ventas - a.ventas || b.margen - a.margen)
                return (
                  <section
                    key={cat.id}
                    className={styles.panel}
                    style={{ borderLeft: `3px solid ${cat.borde}`, background: cat.fondo, padding: '14px 16px' }}
                  >
                    <div style={{ marginBottom: 10 }}>
                      <h2 className={styles.panelTitle} style={{ color: cat.color, marginBottom: 2 }}>
                        <span className={styles.profitCategoryIcon} style={{ borderColor: cat.borde }}>{cat.icon}</span> {cat.label}
                        <span style={{ fontWeight: 400, fontSize: 13, color: '#888', marginLeft: 8 }}>
                          — {cat.desc}
                        </span>
                      </h2>
                    </div>

                    {vinosCat.length === 0 ? (
                      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#aaa' }}>Ningún vino en esta categoría.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                        {vinosCat.map(v => (
                          <div
                            key={v.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: 10,
                              alignItems: 'center',
                              background: 'rgba(255,255,255,0.75)',
                              border: `1px solid ${cat.borde}33`,
                              borderRadius: 7,
                              padding: '9px 12px',
                            }}
                          >
                            <div>
                              <p style={{ margin: 0, fontSize: 14, fontWeight: 650, color: '#171416' }}>{v.nombre}</p>
                              {v.bodega && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#766e64' }}>{v.bodega}</p>}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: cat.color }}>
                                +{v.margen.toFixed(2)}€
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                                {v.ventas} {v.ventas === 1 ? 'venta' : 'ventas'} · {v.pctVentas.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <p style={{ margin: '0 0 5px', fontSize: 11, fontWeight: 700, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                        Acciones
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 15 }}>
                        {cat.acciones.map((a, i) => (
                          <li key={i} style={{ fontSize: 12, color: '#555', lineHeight: 1.5, marginBottom: 2 }}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </ModuleShell>
    </FeatureGate>
  )
}
