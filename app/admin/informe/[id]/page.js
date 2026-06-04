'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../supabase'
import { isAdminEmail } from '../../../demo'

function normalizar(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function decimal(valor) {
  return Number(valor) || 0
}

function eur(valor) {
  return `${decimal(valor).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`
}

function minutosAHoras(minutos) {
  const total = Math.max(0, Math.round(minutos || 0))
  if (total < 60) return `${total} min`
  const horas = Math.floor(total / 60)
  const resto = total % 60
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

function haceDiasISO(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString()
}

function leerDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function incluye(texto, terminos) {
  const limpio = normalizar(texto)
  return terminos.some(termino => limpio.includes(normalizar(termino)))
}

function textoVino(vino) {
  return `${vino.nombre || ''} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`
}

function textoPlato(plato) {
  return `${plato.nombre || ''} ${plato.descripcion || ''} ${plato.categoria || ''}`
}

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

function analizar(restaurante, vinos = [], platos = [], estadisticas = [], propuestas = []) {
  const activos = vinos.filter(vino => vino.activo !== false)
  const platosActivos = platos.filter(plato => plato.activo !== false)
  const total = activos.length
  const tipos = activos.reduce((acc, vino) => {
    acc[vino.tipo || 'sin_tipo'] = (acc[vino.tipo || 'sin_tipo'] || 0) + 1
    return acc
  }, {})
  const regiones = activos.reduce((acc, vino) => {
    const region = normalizar(vino.region || '')
    if (!region) return acc
    const clave = region.includes('rioja') ? 'rioja' : region.includes('ribera') ? 'ribera' : region
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})

  const porCopa = activos.filter(v => decimal(v.precio_copa) > 0)
  const sinPrecio = activos.filter(v => !decimal(v.precio_botella))
  const sinPerfil = activos.filter(v => !v.notas_cata || normalizar(v.notas_cata).length < 12)
  const sinCoste = activos.filter(v => !decimal(v.coste_compra))
  const sinProveedor = activos.filter(v => !v.proveedor)
  const sinStockMinimo = activos.filter(v => !decimal(v.stock_minimo))
  const bajoMinimo = activos.filter(v => decimal(v.stock_minimo) > 0 && decimal(v.stock) <= decimal(v.stock_minimo))
  const conMargen = activos.filter(v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0)
  const margenMedio = conMargen.length
    ? Math.round(conMargen.reduce((sum, v) => sum + (((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100), 0) / conMargen.length)
    : null
  const margenBajo = conMargen.filter(v => (((decimal(v.precio_botella) - decimal(v.coste_compra)) / decimal(v.precio_botella)) * 100) < 55)
  const valorCoste = activos.reduce((sum, v) => sum + decimal(v.stock) * decimal(v.coste_compra), 0)
  const valorVenta = activos.reduce((sum, v) => sum + decimal(v.stock) * decimal(v.precio_botella), 0)

  const dulces = activos.filter(v => v.tipo === 'dulce' || incluye(textoVino(v), ['dulce', 'moscatel', 'px', 'pedro ximenez', 'sauternes', 'tokaji']))
  const generosos = activos.filter(v => v.tipo === 'generoso' || incluye(textoVino(v), ['fino', 'manzanilla', 'amontillado', 'oloroso', 'palo cortado']))
  const espumosos = activos.filter(v => v.tipo === 'espumoso' || incluye(textoVino(v), ['cava', 'champagne', 'corpinnat', 'ancestral', 'brut']))
  const frescos = activos.filter(v => incluye(textoVino(v), ['fresco', 'alta acidez', 'salino', 'mineral', 'albarino', 'riesling', 'godello']))
  const tintosMadera = activos.filter(v => v.tipo === 'tinto' && incluye(textoVino(v), ['madera', 'tostado', 'crianza', 'reserva', 'roble']))

  const platosPostre = platosActivos.filter(p => incluye(textoPlato(p), ['postre', 'tarta', 'queso', 'torrija', 'helado', 'brownie', 'chocolate']))
  const platosFritura = platosActivos.filter(p => incluye(textoPlato(p), ['frit', 'croqueta', 'rebozado', 'flamenquin']))
  const platosPescado = platosActivos.filter(p => incluye(textoPlato(p), ['pescado', 'marisco', 'gamba', 'atun', 'salmon', 'bacalao', 'boqueron']))
  const platosQueso = platosActivos.filter(p => incluye(textoPlato(p), ['queso', 'quesos', 'curado', 'cabra']))
  const platosCarne = platosActivos.filter(p => incluye(textoPlato(p), ['brasa', 'vaca', 'ternera', 'presa', 'solomillo', 'rabo', 'cordero', 'cerdo']))

  const zona = normalizar(`${restaurante?.ciudad || ''} ${restaurante?.provincia || ''}`)
  const terminosLocales = [
    ...zona.split(/[^a-z0-9]+/).filter(t => t.length > 3),
    zona.includes('malaga') && 'sierras de malaga',
    zona.includes('jerez') && 'jerez',
    zona.includes('cadiz') && 'cadiz'
  ].filter(Boolean)
  const locales = terminosLocales.length
    ? activos.filter(v => terminosLocales.some(t => normalizar(textoVino(v)).includes(t)))
    : []

  const vinosConPrecio = activos.filter(v => decimal(v.precio_botella) > 0)
  const platosConPrecio = platosActivos.filter(p => decimal(p.precio) > 0)
  const precioMedioVino = vinosConPrecio.reduce((sum, v, _, arr) => sum + decimal(v.precio_botella) / arr.length, 0)
  const precioMedioPlato = platosConPrecio.reduce((sum, p, _, arr) => sum + decimal(p.precio) / arr.length, 0)
  const vinosPremium = activos.filter(v => decimal(v.precio_botella) >= Math.max(35, precioMedioVino * 1.35))
  const platosPremium = platosActivos.filter(p => decimal(p.precio) >= Math.max(20, precioMedioPlato * 1.35))

  const eventosVenta = estadisticas.filter(e => e.tipo === 'venta').map(e => ({ ...e, parsed: leerDetalle(e.detalle) }))
  const ventasMarcadas = eventosVenta.filter(e => e.parsed?.resultado === 'vendida')
  const incidenciasStock = eventosVenta.filter(e => ['no_stock', 'agotado'].includes(e.parsed?.resultado))
  const dudasSala = eventosVenta.filter(e => ['no_convence', 'otra'].includes(e.parsed?.resultado))
  const escaneos30 = estadisticas.filter(e => e.tipo === 'escaneo').length
  const sommelier30 = estadisticas.filter(e => e.tipo === 'sommelier').length
  const propuestasAbiertas = propuestas.filter(p => p.estado !== 'descartada' && p.estado !== 'incorporada')
  const vinosPorId = new Map(activos.map(vino => [String(vino.id), vino]))
  const margenAsistido = ventasMarcadas.reduce((sum, evento) => {
    const vino = vinosPorId.get(String(evento.parsed?.vino_id || ''))
    if (!vino || !decimal(vino.precio_botella) || !decimal(vino.coste_compra)) return sum
    return sum + (decimal(vino.precio_botella) - decimal(vino.coste_compra)) * (decimal(evento.parsed?.cantidad) || 1)
  }, 0)
  const ventasConMargen = ventasMarcadas.filter(evento => {
    const vino = vinosPorId.get(String(evento.parsed?.vino_id || ''))
    return vino && decimal(vino.precio_botella) > 0 && decimal(vino.coste_compra) > 0
  }).length
  const minutosAhorrados =
    (sommelier30 * 2) +
    (ventasMarcadas.length * 1) +
    (incidenciasStock.length * 5) +
    (bajoMinimo.length * 3) +
    (propuestasAbiertas.length * 4)
  const riesgosDetectados = incidenciasStock.length + bajoMinimo.length + margenBajo.length + sinCoste.length + sinProveedor.length

  const alertas = []
  const oportunidad = (peso, titulo, detalle, accion) => alertas.push({ peso, titulo, detalle, accion })

  if (total < 8) oportunidad(14, 'Carta de vinos muy corta', 'Hay pocas referencias para construir relato, margen y maridajes por familias de platos.', 'Crear una carta base con estructura por estilos y objetivos de venta.')
  if (porCopa.length < Math.max(3, Math.round(total * 0.12))) oportunidad(12, 'Poca estrategia por copa', `${porCopa.length} referencias por copa sobre ${total}.`, 'Definir un programa de vinos por copa que rote stock y suba ticket.')
  if (locales.length < Math.max(2, Math.round(total * 0.08))) oportunidad(13, 'Vino local débil', `${locales.length} referencias locales detectadas.`, 'Introducir bodegas locales con relato y argumento de sala.')
  if (platosPostre.length >= 2 && dulces.length === 0) oportunidad(15, 'Postres sin vino de cierre', `${platosPostre.length} postres o platos dulces detectados y ningun vino dulce claro.`, 'Anadir una propuesta de vino dulce o generoso para cierre de comida.')
  if (platosFritura.length >= 2 && generosos.length + espumosos.length < 2) oportunidad(13, 'Frituras sin aliados claros', 'Faltan generosos secos, burbuja o blancos salinos.', 'Cubrir frituras con acidez, salinidad o generosos secos.')
  if (platosPescado.length >= 2 && frescos.length + espumosos.length + generosos.length < 3) oportunidad(10, 'Pescados con poca cobertura fresca', 'Pocos vinos frescos, salinos, blancos o burbuja para pescado y marisco.', 'Ampliar blancos gastronómicos y alternativas por plato.')
  if (platosQueso.length >= 1 && generosos.length + dulces.length < 2) oportunidad(9, 'Quesos sin recorrido de maridaje', 'Hay queso en carta pero poca cobertura de generoso, oxidativo o dulce.', 'Crear argumentos de maridaje para queso y cierre.')
  if (platosCarne.length >= 2 && (tipos.tinto || 0) < 4) oportunidad(8, 'Carnes con pocos tintos defendibles', 'La cocina pide tintos con perfiles distintos.', 'Diferenciar tintos por cuerpo, frescura, tanino y crianza.')
  if (total && Math.round((((regiones.rioja || 0) + (regiones.ribera || 0)) / total) * 100) > 35) oportunidad(12, 'Exceso Rioja/Ribera', 'La carta está demasiado concentrada en zonas muy parecidas para el cliente.', 'Diversificar regiones sin perder referencias reconocibles.')
  if (total && Math.round((tintosMadera.length / total) * 100) > 28) oportunidad(8, 'Perfil tinto demasiado parecido', 'Muchos tintos parecen apoyarse en madera/crianza.', 'Ordenar la arquitectura de estilos para evitar vinos redundantes.')
  if ((tipos.blanco || 0) < (tipos.tinto || 0) * 0.35 && platosPescado.length + platosFritura.length > 2) oportunidad(9, 'Faltan blancos gastronómicos', 'La cocina da razones para vender blancos, pero la carta se apoya demasiado en tintos.', 'Seleccionar blancos con acidez, salinidad y capacidad de venta.')
  if (vinosPremium.length < Math.max(2, Math.round(platosPremium.length * 0.5)) && platosPremium.length > 1) oportunidad(8, 'Ticket alto sin vinos premium suficientes', `${platosPremium.length} platos de ticket alto y ${vinosPremium.length} vinos premium claros.`, 'Crear escalones premium que sala pueda defender.')
  if (sinPerfil.length > total * 0.35) oportunidad(7, 'Faltan argumentos de venta', `${sinPerfil.length} vinos sin perfil de cata útil para sala.`, 'Trabajar fichas cortas y frases de venta por estilo.')
  if (sinPrecio.length > 0) oportunidad(6, 'Vinos sin precio', `${sinPrecio.length} referencias sin precio de botella.`, 'Cerrar precios y coherencia de PVP.')
  if (sinCoste.length > total * 0.35) oportunidad(12, 'No se mide rentabilidad real', `${sinCoste.length} vinos sin coste de compra.`, 'Completar costes para medir margen real y no solo intuición.')
  if (margenBajo.length > 0) oportunidad(11, 'Margen bajo en referencias con datos', `${margenBajo.length} vinos bajan del 55% de margen estimado.`, 'Revisar compra, PVP o argumento de valor.')
  if (bajoMinimo.length > 0) oportunidad(9, 'Reposición pendiente', `${bajoMinimo.length} vinos están por debajo del stock mínimo.`, 'Activar rutina de reposición y pedido sugerido.')
  if (sinProveedor.length > total * 0.4) oportunidad(8, 'Proveedores poco trazados', `${sinProveedor.length} vinos sin proveedor informado.`, 'Ordenar mapa de proveedores para compra y negociación.')
  if (incidenciasStock.length >= 2) oportunidad(10, 'Roturas de stock detectadas en sala', `${incidenciasStock.length} incidencias marcadas en los últimos 30 días.`, 'Conectar cierre de servicio con reposición.')
  if (dudasSala.length >= 3) oportunidad(9, 'Vinos que no convencen en sala', `${dudasSala.length} dudas o cambios marcados.`, 'Formar a sala y ajustar alternativas/precio.')

  const alertasOrdenadas = alertas.sort((a, b) => b.peso - a.peso)
  const score = Math.min(100, alertasOrdenadas.reduce((sum, alerta) => sum + alerta.peso, 0))
  const prioridad = score >= 65 ? 'Alta' : score >= 35 ? 'Media' : 'Baja'
  const plan = alertasOrdenadas.slice(0, 4).map((alerta, index) => ({
    fase: index + 1,
    titulo: alerta.titulo,
    accion: alerta.accion,
  }))

  return {
    score,
    prioridad,
    alertas: alertasOrdenadas,
    plan,
    impacto: {
      actividadAsistida: escaneos30 + sommelier30 + ventasMarcadas.length,
      margenAsistido,
      ventasConMargen,
      minutosAhorrados,
      riesgosDetectados,
      oportunidadesDetectadas: alertasOrdenadas.length,
    },
    metricas: {
      vinos: total,
      platos: platosActivos.length,
      copa: porCopa.length,
      locales: locales.length,
      dulces: dulces.length,
      generosos: generosos.length,
      precioMedioVino: Math.round(precioMedioVino || 0),
      margenMedio,
      margenBajo: margenBajo.length,
      bajoMinimo: bajoMinimo.length,
      sinCoste: sinCoste.length,
      sinProveedor: sinProveedor.length,
      sinStockMinimo: sinStockMinimo.length,
      valorCoste,
      valorVenta,
      ventasMarcadas: ventasMarcadas.length,
      incidenciasStock: incidenciasStock.length,
      dudasSala: dudasSala.length,
      escaneos30,
      sommelier30,
      propuestasAbiertas: propuestasAbiertas.length,
    }
  }
}

export default function InformeConsultor() {
  const params = useParams()
  const id = params?.id
  const [user, setUser] = useState(null)
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [estadisticas, setEstadisticas] = useState([])
  const [propuestas, setPropuestas] = useState([])
  const [impactoCopiado, setImpactoCopiado] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminEmail(user.email)) {
        window.location.href = '/login'
        return
      }
      setUser(user)
      const desde = haceDiasISO(30)
      const [{ data: rest }, { data: vinosData }, { data: platosData }, { data: statsData }, { data: propuestasData }] = await Promise.all([
        supabase.from('restaurantes').select('*').eq('id', id).single(),
        supabase.from('vinos').select('*').eq('restaurante_id', id),
        supabase.from('platos').select('*').eq('restaurante_id', id),
        supabase.from('estadisticas').select('*').eq('restaurante_id', id).gte('created_at', desde),
        supabase.from('consultor_propuestas').select('*').eq('restaurante_id', id).order('created_at', { ascending: false }),
      ])
      setRestaurante(rest)
      setVinos(vinosData || [])
      setPlatos(platosData || [])
      setEstadisticas(statsData || [])
      setPropuestas(propuestasData || [])
      setLoading(false)
    }
    if (id) cargar()
  }, [id])

  const informe = useMemo(() => restaurante ? analizar(restaurante, vinos, platos, estadisticas, propuestas) : null, [restaurante, vinos, platos, estadisticas, propuestas])

  if (loading) {
    return (
      <main className="admin-page">
        <p className="admin-loading">Generando informe</p>
      </main>
    )
  }

  if (!restaurante || !informe) {
    return (
      <main className="admin-page">
        <section className="admin-wrap">
          <div className="admin-empty">No se encontro el restaurante.</div>
        </section>
      </main>
    )
  }

  const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
  const topAlertas = informe.alertas.slice(0, 5)
  const impacto = informe.impacto
  const textoImpacto = [
    `Impacto mensual de ArmonIA - ${restaurante.nombre}`,
    '',
    `En los ultimos 30 dias, ArmonIA ha ayudado a controlar ${informe.metricas.escaneos30} escaneos de carta, ${informe.metricas.sommelier30} consultas de maridaje y ${informe.metricas.ventasMarcadas} ventas marcadas desde sala.`,
    `Margen bajo control: ${eur(impacto.margenAsistido)} de margen bruto monitorizado en ventas con coste y precio informados (${impacto.ventasConMargen} ventas con margen trazable).`,
    `Riesgo operativo detectado: ${informe.metricas.incidenciasStock} incidencias de stock, ${informe.metricas.bajoMinimo} referencias bajo minimo, ${informe.metricas.sinCoste} sin coste y ${informe.metricas.sinProveedor} sin proveedor.`,
    `Tiempo operativo estimado: ${minutosAHoras(impacto.minutosAhorrados)} de apoyo mensual entre consultas resueltas, ventas registradas, alertas y seguimiento de propuestas.`,
    '',
    'Lectura comercial: la app no sustituye el criterio del restaurante ni del consultor; ordena la informacion, evita decisiones a ciegas y convierte actividad dispersa en acciones concretas de carta, bodega y sala.',
  ].join('\n')

  async function copiarImpactoMensual() {
    await copiarTexto(textoImpacto)
    setImpactoCopiado(true)
    setTimeout(() => setImpactoCopiado(false), 1800)
  }

  return (
    <main className="report-page">
      <div className="report-actions no-print">
        <Link href="/admin/consultoria">Volver al radar</Link>
        <button onClick={() => window.print()}>Imprimir / guardar PDF</button>
      </div>

      <article className="report-sheet">
        <header className="report-hero">
          <div>
            <p className="report-kicker">Informe privado de consultoría</p>
            <h1>Estado de la carta de vinos de {restaurante.nombre}</h1>
            <p>{[restaurante.ciudad, restaurante.provincia].filter(Boolean).join(' · ') || 'Restaurante'} · {fecha}</p>
          </div>
          <div className={`report-score report-score-${informe.prioridad.toLowerCase()}`}>
            <span>{informe.score}</span>
            <strong>{informe.prioridad}</strong>
          </div>
        </header>

        <section className="report-summary">
          <h2>Diagnóstico ejecutivo</h2>
          <p>
            La carta muestra {informe.metricas.vinos} referencias activas y {informe.metricas.platos} platos cargados.
            El análisis detecta oportunidades en venta, margen, stock y relato de sala. Las prioridades no sustituyen el criterio del consultor:
            sirven para ordenar la conversación y convertir datos dispersos en decisiones.
          </p>
        </section>

        <section className="report-metrics">
          <div><span>Valor a coste</span><strong>{eur(informe.metricas.valorCoste)}</strong></div>
          <div><span>Potencial venta</span><strong>{eur(informe.metricas.valorVenta)}</strong></div>
          <div><span>Margen medio</span><strong>{informe.metricas.margenMedio ?? '-'}%</strong></div>
          <div><span>Usos maridaje 30d</span><strong>{informe.metricas.sommelier30}</strong></div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <div>
              <p className="report-kicker">Valor defendible</p>
              <h2>Impacto mensual de ArmonIA</h2>
            </div>
            <button
              type="button"
              className="no-print"
              onClick={copiarImpactoMensual}
              style={{
                border: '1px solid #171416',
                borderRadius: 999,
                background: '#171416',
                color: '#fffaf3',
                padding: '10px 14px',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {impactoCopiado ? 'Copiado' : 'Copiar bloque mensual'}
            </button>
          </div>
          <section className="report-metrics" style={{ marginTop: 0 }}>
            <div><span>Actividad asistida</span><strong>{impacto.actividadAsistida}</strong></div>
            <div><span>Margen monitorizado</span><strong>{eur(impacto.margenAsistido)}</strong></div>
            <div><span>Riesgos detectados</span><strong>{impacto.riesgosDetectados}</strong></div>
            <div><span>Tiempo estimado</span><strong>{minutosAHoras(impacto.minutosAhorrados)}</strong></div>
          </section>
          <div className="report-panel">
            <p>
              Estas cifras son prudentes: miden actividad controlada, margen trazable y riesgos detectados por la app,
              no promesas de venta atribuida. Sirven para justificar el seguimiento mensual y explicar por que la cuota
              queda por debajo del valor operativo que protege.
            </p>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <p className="report-kicker">Oportunidades principales</p>
            <h2>Donde se puede mejorar antes</h2>
          </div>
          <div className="report-alerts">
            {topAlertas.length ? topAlertas.map(alerta => (
              <article key={alerta.titulo}>
                <h3>{alerta.titulo}</h3>
                <p>{alerta.detalle}</p>
                <strong>{alerta.accion}</strong>
              </article>
            )) : (
              <article>
                <h3>Carta sin alertas criticas</h3>
                <p>La oportunidad está en mantenimiento, relato y afinado de sala.</p>
                <strong>Revisar narrativa y pequeños ajustes comerciales.</strong>
              </article>
            )}
          </div>
        </section>

        <section className="report-grid">
          <div className="report-panel">
            <p className="report-kicker">Rentabilidad</p>
            <h2>Bodega y margen</h2>
            <ul>
              <li>{informe.metricas.sinCoste} referencias sin coste de compra.</li>
              <li>{informe.metricas.margenBajo} referencias con margen inferior al 55%.</li>
              <li>{informe.metricas.sinProveedor} referencias sin proveedor informado.</li>
              <li>{informe.metricas.bajoMinimo} referencias por debajo de stock mínimo.</li>
            </ul>
          </div>
          <div className="report-panel">
            <p className="report-kicker">Sala</p>
            <h2>Uso y fricciones</h2>
            <ul>
              <li>{informe.metricas.ventasMarcadas} ventas marcadas en sala.</li>
              <li>{informe.metricas.incidenciasStock} incidencias de stock en 30 días.</li>
              <li>{informe.metricas.dudasSala} dudas o cambios de vino en sala.</li>
              <li>{informe.metricas.escaneos30} escaneos de carta pública en 30 días.</li>
            </ul>
          </div>
        </section>

        <section className="report-section">
          <div className="report-section-head">
            <p className="report-kicker">Plan recomendado</p>
            <h2>Hoja de ruta propuesta</h2>
          </div>
          <div className="report-plan">
            {(informe.plan.length ? informe.plan : [{ fase: 1, titulo: 'Mantenimiento estratégico', accion: 'Revisar carta, relato y pequeños ajustes comerciales.' }]).map(item => (
              <article key={`${item.fase}-${item.titulo}`}>
                <span>{item.fase}</span>
                <div>
                  <h3>{item.titulo}</h3>
                  <p>{item.accion}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="report-footer">
          <div>
            <strong>Carta Viva <em style={{fontStyle:'italic',letterSpacing:'0.08em'}}>×</em> @cataconjuanjo</strong>
            <p>Diagnóstico generado para orientar una conversación comercial y técnica sobre carta de vinos, bodega y servicio.</p>
          </div>
          <Link href={`/admin/propuestas?restaurante=${restaurante.id}&titulo=${encodeURIComponent(topAlertas[0]?.titulo || '')}&motivo=${encodeURIComponent(topAlertas[0]?.detalle || '')}&prioridad=${informe.prioridad === 'Alta' ? 'alta' : informe.prioridad === 'Media' ? 'media' : 'baja'}`} className="no-print">
            Crear propuesta desde este informe
          </Link>
        </footer>
      </article>
    </main>
  )
}
