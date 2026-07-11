'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from './guideMode.module.css'

const GuideContext = createContext({
  enabled: false,
  toggle: () => {},
})

const GUIDES = {
  '/admin/consultoria': {
    title: 'Tu mesa de trabajo como consultor',
    intro: 'El Radar global ordena la cartera para decidir dónde intervenir primero y con qué objetivo.',
    items: [
      ['Prioridad', 'Combina urgencia, impacto económico y calidad de los datos de cada restaurante.', 'Empieza por los casos de prioridad alta que tengan una acción concreta.'],
      ['Oportunidad', 'Estima valor recuperable o mejora potencial; no es una promesa de facturación.', 'Úsala para ordenar la conversación y valida después el resultado real.'],
      ['Siguiente movimiento', 'Propone el paso más útil según la situación detectada.', 'Asígnalo, fija fecha y registra el desenlace para cerrar el ciclo.'],
    ],
  },
  '/admin/restaurante': {
    title: 'Lee la situación completa del restaurante',
    intro: 'Esta ficha reúne negocio, carta, bodega y actividad para preparar una intervención con contexto.',
    items: [
      ['Diagnóstico', 'Resume el principal problema u oportunidad con los datos disponibles.', 'Contrástalo con el restaurante antes de convertirlo en propuesta.'],
      ['KPIs de consultoría', 'Miden calidad del dato, rotación, rentabilidad y ejecución.', 'Compara periodos equivalentes y revisa siempre la fuente.'],
      ['Plan consultor', 'Ordena acciones por horizonte e impacto esperado.', 'Prioriza pocas acciones medibles y documenta el resultado.'],
    ],
  },
  '/admin/acciones': {
    title: 'Convierte diagnósticos en seguimiento',
    intro: 'El pipeline evita que una buena recomendación se pierda entre conversaciones y tareas.',
    items: [
      ['Estado', 'Indica si la acción está pendiente, en curso, bloqueada o terminada.', 'Actualízalo tras cada contacto para mantener fiable la agenda.'],
      ['Impacto', 'Valor esperado si la acción se ejecuta correctamente.', 'Prioriza impacto junto con esfuerzo y urgencia, no de forma aislada.'],
      ['Resultado', 'Evidencia de lo que cambió después de actuar.', 'Anota una cifra, aprendizaje o decisión concreta al cerrar.'],
    ],
  },
  '/admin/alertas': {
    title: 'Separa señales importantes del ruido',
    intro: 'Las alertas indican situaciones que merecen revisión; no sustituyen el criterio del consultor.',
    items: [
      ['Severidad', 'Nivel de riesgo o urgencia calculado por las reglas del sistema.', 'Atiende primero las alertas altas con datos recientes.'],
      ['Evidencia', 'Dato que ha activado la alerta y su periodo de referencia.', 'Comprueba calidad y contexto antes de contactar al cliente.'],
      ['Resolución', 'Acción tomada y motivo por el que la alerta puede cerrarse.', 'Cierra solo cuando exista una decisión o seguimiento registrado.'],
    ],
  },
  '/admin/propuestas': {
    title: 'Gestiona propuestas con contexto comercial',
    intro: 'Aquí conviertes oportunidades detectadas en recomendaciones que el restaurante puede valorar y aplicar.',
    items: [
      ['Propuesta', 'Cambio sugerido en carta, compra, precio o servicio.', 'Explica beneficio, esfuerzo y forma de comprobarlo.'],
      ['Estado', 'Momento de la decisión: pendiente, aceptada, descartada o incorporada.', 'Registra el motivo para aprender qué encaja con cada cliente.'],
      ['Seguimiento', 'Comprobación posterior a la aceptación.', 'Define de antemano fecha y métrica de éxito.'],
    ],
  },
  '/admin': {
    title: 'Gestiona la cartera de restaurantes',
    intro: 'Esta pantalla concentra altas, accesos y estado operativo de cada cuenta.',
    items: [
      ['Estado de cuenta', 'Situación de acceso y suscripción del restaurante.', 'Resuelve primero pagos o accesos que bloqueen el servicio.'],
      ['Ficha', 'Información central de operación y consultoría del cliente.', 'Mantén contacto, ubicación y plan actualizados.'],
      ['Acceso al dashboard', 'Permite revisar la experiencia exacta del restaurante.', 'Úsalo para acompañar y comprobar configuraciones.'],
    ],
  },
  '/dashboard': {
    title: 'Tu panel, traducido a decisiones',
    intro: 'Esta pantalla reúne lo que merece atención hoy. No necesitas analizarlo todo: empieza por la primera prioridad.',
    items: [
      ['Actividad', 'Escaneos y consultas muestran uso real de la carta, no ventas confirmadas.', 'Comprueba si la sala está recomendando la carta y registra el cierre para completar la lectura.'],
      ['Ventas KPI', 'Son ventas registradas con trazabilidad suficiente para medir resultados.', 'Úsalas para comparar semanas; evita sacar conclusiones de un solo servicio.'],
      ['Radar diario', 'Ordena incidencias y oportunidades por urgencia e impacto.', 'Resuelve primero una acción importante y marca el resultado.'],
    ],
  },
  '/dashboard/estadisticas': {
    title: 'Entiende la actividad de tu carta',
    intro: 'Aquí ves cómo clientes y sala utilizan Carta Viva. Actividad no siempre significa venta: se interpreta junto al cierre y el TPV.',
    items: [
      ['Escaneos', 'Veces que se abre la carta desde un QR.', 'Si bajan, revisa la visibilidad del QR y cómo lo presenta el equipo.'],
      ['Consultas', 'Búsquedas y recomendaciones solicitadas por clientes o sala.', 'Detecta qué estilos, platos o rangos de precio generan interés.'],
      ['Conversión', 'Parte de la actividad que termina en una venta registrada.', 'Mejora el registro del cierre antes de cambiar la carta.'],
    ],
  },
  '/dashboard/precios': {
    title: 'Convierte precios en margen defendible',
    intro: 'Compara coste y precio de venta para detectar referencias que trabajan bien y otras que necesitan revisión.',
    items: [
      ['Margen bruto', 'Lo que queda del PVP después de restar el coste de compra, antes de otros gastos.', 'Revisa primero vinos con margen bajo y buena rotación.'],
      ['Multiplicador', 'Cuántas veces el precio de venta contiene el coste.', 'No existe un multiplicador perfecto: ajústalo al coste, posicionamiento y ticket.'],
      ['Datos incompletos', 'Referencias sin coste o PVP fiable.', 'Completa estos datos antes de tomar decisiones económicas.'],
    ],
  },
  '/dashboard/bodega': {
    title: 'Lee la bodega como dinero en movimiento',
    intro: 'El objetivo no es tener más stock, sino disponer de lo necesario sin inmovilizar caja.',
    items: [
      ['Stock actual', 'Botellas disponibles según entradas, ventas y ajustes registrados.', 'Haz inventarios periódicos para mantenerlo fiable.'],
      ['Pedido sugerido', 'Cantidad orientativa según stock, mínimos y ritmo de salida.', 'Confirma eventos, reservas y plazo del proveedor antes de pedir.'],
      ['Stock lento', 'Referencias con poca salida durante el periodo analizado.', 'Prueba recomendación en sala, copa o sustitución antes de liquidar.'],
    ],
  },
  '/dashboard/sala': {
    title: 'Haz que la carta funcione durante el servicio',
    intro: 'Prepara al equipo para recomendar con seguridad, sin memorizar toda la bodega.',
    items: [
      ['Selección de sala', 'Referencias prioritarias para ofrecer hoy.', 'Comparte pocas opciones y un argumento sencillo por vino.'],
      ['Oportunidad', 'Vinos adecuados para una situación de venta concreta.', 'Úsala como sugerencia, respetando gusto y presupuesto del cliente.'],
      ['Resultado', 'Qué ocurrió después de recomendar.', 'Registrarlo enseña al sistema qué funciona en tu restaurante.'],
    ],
  },
  '/dashboard/cierre': {
    title: 'Cierra el turno para aprender del servicio',
    intro: 'Un cierre breve transforma impresiones de sala en datos útiles para mañana.',
    items: [
      ['Ventas', 'Unidades vendidas durante el turno.', 'Registra al menos las referencias prioritarias si no hay conexión TPV.'],
      ['Incidencias', 'Roturas, faltas, devoluciones o problemas del servicio.', 'Anótalas en el momento para ajustar stock y operativa.'],
      ['Dudas de sala', 'Preguntas que el equipo no pudo resolver con seguridad.', 'Conviértelas en una microformación antes del próximo turno.'],
    ],
  },
  '/dashboard/inventario': {
    title: 'Alinea la bodega real con el sistema',
    intro: 'El inventario físico corrige diferencias y devuelve confianza a pedidos, márgenes y alertas.',
    items: [
      ['Conteo real', 'Botellas que existen físicamente en bodega.', 'Cuenta por zonas y guarda solo cuando hayas terminado cada bloque.'],
      ['Diferencia', 'Distancia entre el stock calculado y el contado.', 'Investiga diferencias repetidas: venta sin registrar, merma o recepción pendiente.'],
      ['Valor de stock', 'Capital aproximado inmovilizado a coste de compra.', 'Vigila su evolución, no solo el número de botellas.'],
    ],
  },
  '/dashboard/menu-engineering': {
    title: 'Decide qué impulsar, ajustar o retirar',
    intro: 'Cruza popularidad y rentabilidad para evitar decidir solo por intuición.',
    items: [
      ['Popularidad', 'Frecuencia de venta frente al resto de referencias.', 'Comprueba que el periodo sea representativo.'],
      ['Rentabilidad', 'Contribución económica de cada venta.', 'Valora margen por unidad y volumen conjunto.'],
      ['Clasificación', 'Agrupa referencias según demanda y aportación.', 'Convierte cada grupo en una acción de carta o sala.'],
    ],
  },
  '/dashboard/tpv': {
    title: 'Trae ventas reales al análisis',
    intro: 'La importación TPV conecta la actividad de Carta Viva con lo que realmente se vendió.',
    items: [
      ['Correspondencia', 'Une cada línea del TPV con su vino o plato en Carta Viva.', 'Revisa nombres dudosos para evitar duplicados.'],
      ['Periodo', 'Fechas cubiertas por el archivo importado.', 'No solapes archivos salvo que el sistema indique que es seguro.'],
      ['Calidad', 'Porcentaje de líneas reconocidas correctamente.', 'Resuelve las no reconocidas antes de interpretar resultados.'],
    ],
  },
  '/dashboard/simulador': {
    title: 'Prueba decisiones antes de aplicarlas',
    intro: 'Los escenarios son estimaciones para comparar opciones, no promesas de resultado.',
    items: [
      ['Escenario', 'Supuestos de precio, coste, volumen y merma.', 'Cambia una variable cada vez para entender su efecto.'],
      ['Beneficio potencial', 'Diferencia estimada frente a la situación actual.', 'Contrástala con capacidad de venta y comportamiento real.'],
      ['Confianza', 'Fiabilidad según cantidad y calidad de datos disponibles.', 'Con confianza baja, usa el resultado como hipótesis de prueba.'],
    ],
  },
}

const FALLBACK_GUIDE = {
  title: 'Guía de esta pantalla',
  intro: 'Te explicamos el propósito de este módulo para que puedas usarlo sin conocimientos técnicos.',
  items: [
    ['Qué estás viendo', 'Información del restaurante organizada para una tarea concreta.', 'Empieza por los avisos o campos incompletos.'],
    ['Cómo interpretarlo', 'Los datos ganan valor cuando se comparan en el tiempo y tienen una fuente fiable.', 'Evita decidir por una cifra aislada.'],
    ['Siguiente paso', 'Cada bloque busca terminar en una acción sencilla y comprobable.', 'Haz un cambio, registra el resultado y vuelve a comparar.'],
  ],
}

export function GuideModeProvider({ restaurantId, children }) {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const storageKey = `carta_viva_guide_mode_${restaurantId || 'user'}`

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    setEnabled(saved === '1')
    setReady(true)
  }, [storageKey])

  const value = useMemo(() => ({
    enabled,
    ready,
    toggle: () => setEnabled(current => {
      const next = !current
      window.localStorage.setItem(storageKey, next ? '1' : '0')
      return next
    }),
  }), [enabled, ready, storageKey])

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
}

export function useGuideMode() {
  return useContext(GuideContext)
}

export function GuideToggle({ compact = false }) {
  const { enabled, toggle } = useGuideMode()
  return (
    <button
      type="button"
      className={`${styles.toggle} ${enabled ? styles.toggleActive : ''} ${compact ? styles.toggleCompact : ''}`}
      onClick={toggle}
      aria-pressed={enabled}
      title={enabled ? 'Ocultar explicaciones' : 'Mostrar explicaciones'}
    >
      <span className={styles.toggleIcon} aria-hidden="true">{enabled ? '✓' : '?'}</span>
      <span>{enabled ? 'Modo guía activo' : 'Modo guía'}</span>
    </button>
  )
}

export function GuidePanel() {
  const pathname = usePathname()
  const { enabled } = useGuideMode()
  if (!enabled) return null

  const exact = GUIDES[pathname]
  const prefix = Object.keys(GUIDES)
    .filter(path => path !== '/dashboard' && pathname.startsWith(path))
    .sort((a, b) => b.length - a.length)[0]
  const guide = exact || GUIDES[prefix] || FALLBACK_GUIDE

  return (
    <aside className={styles.panel} aria-label="Explicación de esta pantalla">
      <div className={styles.panelIntro}>
        <span className={styles.guideBadge}>MODO GUÍA</span>
        <div>
          <h2>{guide.title}</h2>
          <p>{guide.intro}</p>
        </div>
      </div>
      <div className={styles.guideGrid}>
        {guide.items.map(([title, meaning, action], index) => (
          <article key={title}>
            <span className={styles.step}>{index + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{meaning}</p>
              <small><strong>Qué hacer:</strong> {action}</small>
            </div>
          </article>
        ))}
      </div>
    </aside>
  )
}
