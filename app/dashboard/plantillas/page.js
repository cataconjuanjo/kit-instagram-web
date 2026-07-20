'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { cargarDemoDashboard } from '../../lib/demoDashboardClient'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'

const PLANTILLAS = [
  {
    id: 'lanzamiento',
    nombre: 'Lanzamiento QR en sala',
    etiqueta: 'Activacion',
    descripcion: 'Para pasar de carta en borrador a material listo en mesa, con preview aprobada y equipo alineado.',
    ideal: 'Restaurantes que van a poner Carta Viva delante del cliente por primera vez.',
    emocion: 'Confianza, orden y control antes de publicar.',
    requisitos: ['Carta con precios visibles', 'Preview privada revisada', 'QR y material de mesa preparado'],
    acciones: [
      { texto: 'Revisar contenido minimo', href: '/dashboard/carta' },
      { texto: 'Generar preview privada', href: '/dashboard/qr#preview-privada' },
      { texto: 'Exportar material QR', href: '/dashboard/qr#pack-entrega' },
    ],
    piezas: ['Sobremesa QR', 'Mensaje para equipo', 'Checklist de publicacion'],
  },
  {
    id: 'temporada',
    nombre: 'Carta de temporada',
    etiqueta: 'Narrativa',
    descripcion: 'Para comunicar cambio de carta, producto de temporada o nueva seleccion de vinos sin rehacerlo todo.',
    ideal: 'Locales que cambian platos o quieren dar foco a una seleccion concreta.',
    emocion: 'Novedad cuidada, carta viva de verdad.',
    requisitos: ['Platos clave cargados', 'Vinos destacados', 'Texto breve para sala'],
    acciones: [
      { texto: 'Actualizar platos clave', href: '/dashboard/platos' },
      { texto: 'Elegir vinos con foco', href: '/dashboard/vinos' },
      { texto: 'Publicar nueva version', href: '/dashboard/qr' },
    ],
    piezas: ['Story Instagram', 'Texto WhatsApp', 'Argumento de sala'],
  },
  {
    id: 'degustacion',
    nombre: 'Menu degustacion con maridaje',
    etiqueta: 'Experiencia',
    descripcion: 'Para convertir platos y vinos en un recorrido guiado, mas facil de explicar y mas vendible.',
    ideal: 'Menus cerrados, eventos gastronomicos o noches especiales.',
    emocion: 'Ritual, descubrimiento y criterio.',
    requisitos: ['Platos ordenados por pase', 'Vinos con perfil claro', 'Equipo con guion corto'],
    acciones: [
      { texto: 'Preparar platos y descripciones', href: '/dashboard/platos?filtro=descripcion' },
      { texto: 'Revisar recomendaciones de sala', href: '/dashboard/sala' },
      { texto: 'Probar carta publica', href: '/dashboard/qr' },
    ],
    piezas: ['Guion por pases', 'Maridajes defendibles', 'Preview privada para cocina/sala'],
  },
  {
    id: 'premium',
    nombre: 'Bodega premium por botella',
    etiqueta: 'Margen',
    descripcion: 'Para elevar referencias de mas ticket con argumento, contexto y presencia visual.',
    ideal: 'Restaurantes con vinos inmovilizados, joyas de bodega o venta por botella importante.',
    emocion: 'Deseo, seguridad y recomendacion experta.',
    requisitos: ['Costes revisados', 'Stock disponible', 'Frase de venta por referencia'],
    acciones: [
      { texto: 'Revisar margen y coste', href: '/dashboard/precios' },
      { texto: 'Comprobar stock premium', href: '/dashboard/bodega' },
      { texto: 'Entrenar argumento en sala', href: '/dashboard/sala' },
    ],
    piezas: ['Seleccion premium', 'Briefing sala', 'Lectura de oportunidad'],
  },
  {
    id: 'evento',
    nombre: 'Evento privado o grupo',
    etiqueta: 'Privado',
    descripcion: 'Para preparar una experiencia temporal con enlace revisable, mensaje de bienvenida y carta controlada.',
    ideal: 'Catas privadas, grupos, reservas especiales o clientes que quieren algo cerrado.',
    emocion: 'Cercania, cuidado y sensacion de detalle.',
    requisitos: ['Preview privada', 'Mensaje de envio', 'Version publicada segura'],
    acciones: [
      { texto: 'Crear preview privada', href: '/dashboard/qr#preview-privada' },
      { texto: 'Personalizar marca', href: '/dashboard/personalizar' },
      { texto: 'Guardar version segura', href: '/dashboard/versiones' },
    ],
    piezas: ['Enlace privado', 'Copy de invitacion', 'Version recuperable'],
  },
]

function clavePlantilla(restauranteId) {
  return `carta_viva_plantilla_activa_${restauranteId}`
}

function clavePlanActivacion(restauranteId, plantillaId) {
  return `carta_viva_plan_activacion_${restauranteId}_${plantillaId}`
}

async function tokenSesion() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

function textoLista(items = []) {
  return items.filter(Boolean).map(item => `- ${item}`).join('\n')
}

function crearPlanActivacion(plantilla) {
  return {
    completados: Object.fromEntries((plantilla?.requisitos || []).map(item => [item, false])),
    objetivo: '',
    responsable: '',
    notas: '',
  }
}

function plantillaPorId(id) {
  return PLANTILLAS.find(item => item.id === id) || PLANTILLAS[0]
}

function leerPlantillaGuardada(restauranteId) {
  if (!restauranteId || typeof window === 'undefined') return PLANTILLAS[0].id
  try {
    const guardada = window.localStorage.getItem(clavePlantilla(restauranteId))
    return PLANTILLAS.some(item => item.id === guardada) ? guardada : PLANTILLAS[0].id
  } catch {
    return PLANTILLAS[0].id
  }
}

function leerPlanActivacion(restauranteId, plantilla) {
  const base = crearPlanActivacion(plantilla)
  if (!restauranteId || typeof window === 'undefined') return base
  try {
    const guardado = JSON.parse(window.localStorage.getItem(clavePlanActivacion(restauranteId, plantilla.id)) || 'null')
    return {
      ...base,
      ...guardado,
      completados: {
        ...base.completados,
        ...(guardado?.completados || {}),
      },
    }
  } catch {
    return base
  }
}

function planDesdeRemoto(plan, plantilla) {
  const base = crearPlanActivacion(plantilla)
  if (!plan) return base
  return {
    ...base,
    completados: {
      ...base.completados,
      ...(plan.completed_steps || {}),
    },
    objetivo: plan.objective_date || '',
    responsable: plan.responsible || '',
    notas: plan.notes || '',
  }
}

function payloadPlan(plan) {
  return {
    completed_steps: plan.completados || {},
    objective_date: plan.objetivo || '',
    responsible: plan.responsable || '',
    notes: plan.notas || '',
  }
}

function guardarPlanLocal(restauranteId, plantillaId, plan) {
  if (!restauranteId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(clavePlantilla(restauranteId), plantillaId)
    window.localStorage.setItem(clavePlanActivacion(restauranteId, plantillaId), JSON.stringify(plan))
  } catch {}
}

async function cargarPlanesRemotos(restauranteId) {
  const token = await tokenSesion()
  if (!token || !restauranteId) return null
  const query = new URLSearchParams({ restaurante_id: restauranteId })
  const res = await fetch(`/api/experiencias?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo cargar el plan de experiencia.')
  return data
}

async function guardarPlanRemoto(restauranteId, plantillaId, plan) {
  const token = await tokenSesion()
  if (!token || !restauranteId || !plantillaId) return null
  const res = await fetch('/api/experiencias', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      restaurante_id: restauranteId,
      template_id: plantillaId,
      is_active: true,
      ...payloadPlan(plan),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'No se pudo guardar el plan de experiencia.')
  return data
}

export default function PlantillasPage() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [plantillaActivaId, setPlantillaActivaId] = useState(PLANTILLAS[0].id)
  const [planActivacion, setPlanActivacion] = useState(() => crearPlanActivacion(PLANTILLAS[0]))
  const [experienciaPendiente, setExperienciaPendiente] = useState(false)
  const [sincronizandoExperiencia, setSincronizandoExperiencia] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId, isDemo } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) {
        window.location.href = '/login'
        return
      }

      if (isDemo) {
        const demo = await cargarDemoDashboard(email)
        if (demo?.restaurante) {
          const rest = demo.restaurante
          const plantillaGuardada = leerPlantillaGuardada(rest.id)
          setRestaurante(rest)
          setPlantillaActivaId(plantillaGuardada)
          setPlanActivacion(leerPlanActivacion(rest.id, plantillaPorId(plantillaGuardada)))
          setVinos(demo.vinos || [])
          setPlatos(demo.platos || [])
        }
        setLoading(false)
        return
      }

      const queryRestaurante = supabase.from('restaurantes').select('*')
      const { data: rest } = restauranteId
        ? await queryRestaurante.eq('id', restauranteId).single()
        : await queryRestaurante.eq('email', email).single()
      if (!rest) {
        setLoading(false)
        return
      }
      setRestaurante(rest)
      const plantillaGuardada = leerPlantillaGuardada(rest.id)
      setPlantillaActivaId(plantillaGuardada)
      setPlanActivacion(leerPlanActivacion(rest.id, plantillaPorId(plantillaGuardada)))
      try {
        const remotas = await cargarPlanesRemotos(rest.id)
        if (remotas?.experience_pending) {
          setExperienciaPendiente(true)
        } else if (remotas?.active_plan?.template_id) {
          const plantillaRemota = plantillaPorId(remotas.active_plan.template_id)
          const planRemoto = planDesdeRemoto(remotas.active_plan, plantillaRemota)
          setExperienciaPendiente(false)
          setPlantillaActivaId(plantillaRemota.id)
          setPlanActivacion(planRemoto)
          guardarPlanLocal(rest.id, plantillaRemota.id, planRemoto)
        } else if (remotas) {
          setExperienciaPendiente(false)
        }
      } catch (error) {
        setMensaje(error.message || 'No se pudo sincronizar el plan de experiencia.')
        setTimeout(() => setMensaje(''), 2400)
      }
      const [{ data: vinosData }, { data: platosData }] = await Promise.all([
        supabase.from('vinos').select('id, nombre, bodega, region, precio_botella, precio_copa, activo').eq('restaurante_id', rest.id).eq('activo', true).limit(80),
        supabase.from('platos').select('id, nombre, categoria, descripcion, precio, activo').eq('restaurante_id', rest.id).eq('activo', true).limit(80),
      ])
      setVinos(vinosData || [])
      setPlatos(platosData || [])
      setLoading(false)
    }
    cargar()
  }, [])

  const plantillaActiva = useMemo(
    () => PLANTILLAS.find(item => item.id === plantillaActivaId) || PLANTILLAS[0],
    [plantillaActivaId],
  )
  const vinosActivos = vinos.filter(vino => vino.activo !== false)
  const platosActivos = platos.filter(plato => plato.activo !== false)
  const vinosConPrecio = vinosActivos.filter(vino => Number(vino.precio_botella || vino.precio_copa || 0) > 0)
  const platosConDescripcion = platosActivos.filter(plato => plato.descripcion)
  const pasosCompletados = plantillaActiva.requisitos.filter(item => planActivacion.completados?.[item]).length
  const progresoPlan = plantillaActiva.requisitos.length
    ? Math.round((pasosCompletados / plantillaActiva.requisitos.length) * 100)
    : 0
  const enlacePublico = restaurante?.slug
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://cataconjuanjo.com'}/${restaurante.hub_activo ? 'r' : 'carta'}/${restaurante.slug}`
    : ''
  const muestrasVino = vinosActivos.slice(0, 3).map(vino => [vino.nombre, vino.bodega].filter(Boolean).join(' - '))
  const muestrasPlato = platosActivos.slice(0, 3).map(plato => plato.nombre)
  const preparacion = [
    vinosConPrecio.length > 0 ? `${vinosConPrecio.length} vinos con precio` : 'Completar precios de vinos',
    platosActivos.length > 0 ? `${platosActivos.length} platos disponibles` : 'Cargar platos clave',
    restaurante?.slug ? 'Enlace publico listo' : 'Falta slug publico',
  ]
  const guion = [
    `Plantilla: ${plantillaActiva.nombre}`,
    `Restaurante: ${restaurante?.nombre || 'Carta Viva'}`,
    '',
    plantillaActiva.descripcion,
    '',
    'Preparacion minima:',
    textoLista(plantillaActiva.requisitos),
    '',
    `Progreso interno: ${pasosCompletados}/${plantillaActiva.requisitos.length} pasos`,
    planActivacion.objetivo ? `Fecha objetivo: ${planActivacion.objetivo}` : null,
    planActivacion.responsable ? `Responsable: ${planActivacion.responsable}` : null,
    planActivacion.notas ? `Notas:\n${planActivacion.notas}` : null,
    '',
    muestrasVino.length ? `Vinos de apoyo:\n${textoLista(muestrasVino)}` : 'Vinos de apoyo: pendiente de cargar referencias.',
    muestrasPlato.length ? `Platos de apoyo:\n${textoLista(muestrasPlato)}` : 'Platos de apoyo: pendiente de cargar platos.',
    '',
    enlacePublico ? `Enlace final: ${enlacePublico}` : 'Enlace final: pendiente de publicar.',
  ].filter(item => item !== null).join('\n')

  function guardarPlanActivacion(next, plantillaId = plantillaActiva.id) {
    setPlanActivacion(next)
    guardarPlanLocal(restaurante?.id, plantillaId, next)
    if (!restaurante?.id) return
    setSincronizandoExperiencia(true)
    guardarPlanRemoto(restaurante.id, plantillaId, next)
      .then(data => {
        if (data?.experience_pending) {
          setExperienciaPendiente(true)
          return
        }
        if (data) setExperienciaPendiente(false)
      })
      .catch(error => {
        setMensaje(error.message || 'No se pudo sincronizar el plan.')
        setTimeout(() => setMensaje(''), 2400)
      })
      .finally(() => setSincronizandoExperiencia(false))
  }

  function actualizarPlanActivacion(campo, valor) {
    guardarPlanActivacion({ ...planActivacion, [campo]: valor })
  }

  function alternarPaso(item) {
    guardarPlanActivacion({
      ...planActivacion,
      completados: {
        ...(planActivacion.completados || {}),
        [item]: !planActivacion.completados?.[item],
      },
    })
  }

  function reiniciarPlanActivacion() {
    guardarPlanActivacion(crearPlanActivacion(plantillaActiva))
    setMensaje('Plan de activacion reiniciado.')
    setTimeout(() => setMensaje(''), 1800)
  }

  function seleccionarPlantilla(id) {
    const siguientePlantilla = plantillaPorId(id)
    const siguientePlan = leerPlanActivacion(restaurante?.id, siguientePlantilla)
    setPlantillaActivaId(id)
    setPlanActivacion(siguientePlan)
    setMensaje('Plantilla marcada como foco operativo.')
    guardarPlanLocal(restaurante?.id, id, siguientePlan)
    if (restaurante?.id) {
      setSincronizandoExperiencia(true)
      guardarPlanRemoto(restaurante.id, id, siguientePlan)
        .then(data => {
          if (data?.experience_pending) setExperienciaPendiente(true)
          else if (data) setExperienciaPendiente(false)
        })
        .catch(error => {
          setMensaje(error.message || 'No se pudo sincronizar la plantilla.')
        })
        .finally(() => setSincronizandoExperiencia(false))
    }
    setTimeout(() => setMensaje(''), 1800)
  }

  async function copiarGuion() {
    await navigator.clipboard?.writeText(guion)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1600)
  }

  if (loading) return <LoadingState />

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Plantillas"
      title="Experiencias listas para activar"
      subtitle="Elige un formato comercial y emocional para convertir la carta en una accion concreta: lanzamiento, temporada, degustacion, premium o evento privado."
      actions={
        <>
          <Link className={styles.secondary} href="/dashboard/qr">Preparar QR</Link>
          <Link className={styles.ghost} href="/dashboard/personalizar">Marca visual</Link>
        </>
      }
      help={{
        title: 'Como usar las plantillas',
        intro: 'No cambian datos por si solas. Sirven como plan de trabajo para decidir que revisar, que copiar y que pieza preparar antes de publicar.',
        items: [
          { title: 'Elige foco', text: 'Marca una plantilla segun el momento del restaurante.' },
          { title: 'Prepara contenido', text: 'Completa vinos, platos, marca y QR desde los accesos reales.' },
          { title: 'Entrega', text: 'Copia el guion y usa el pack de entrega para llevarlo a sala o al cliente.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        <article className={styles.stat}>
          <p className={styles.statValue}>{plantillaActiva.etiqueta}</p>
          <p className={styles.statLabel}>Foco activo</p>
          <p className={styles.statHint}>{plantillaActiva.nombre}</p>
        </article>
        <article className={styles.stat}>
          <p className={styles.statValue}>{vinosConPrecio.length}/{vinosActivos.length}</p>
          <p className={styles.statLabel}>Vinos con precio</p>
          <p className={styles.statHint}>Base para publicar sin friccion.</p>
        </article>
        <article className={styles.stat}>
          <p className={styles.statValue}>{platosConDescripcion.length}/{platosActivos.length}</p>
          <p className={styles.statLabel}>Platos con contexto</p>
          <p className={styles.statHint}>Mejora maridaje y guion de sala.</p>
        </article>
        <article className={styles.stat}>
          <p className={styles.statValue}>{restaurante?.slug ? 'Listo' : 'Pendiente'}</p>
          <p className={styles.statLabel}>Enlace publico</p>
          <p className={styles.statHint}>{restaurante?.slug ? 'Puede convertirse en QR.' : 'Revisa ajustes del restaurante.'}</p>
        </article>
      </section>

      {experienciaPendiente && (
        <section className={styles.pendingStrip}>
          <div>
            <p className={styles.eyebrow}>Persistencia pendiente</p>
            <h2>Plan guardado en este navegador</h2>
          </div>
          <p>Aplica supabase/add_experience_activation_plans.sql para guardar plantillas y planes entre dispositivos.</p>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Biblioteca de plantillas</h2>
            <p className={styles.panelSub}>Formatos pensados para vender, revisar o entregar Carta Viva con mas intencion.</p>
          </div>
          <span className={styles.badge}>{PLANTILLAS.length} formatos</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.templateGrid}>
            {PLANTILLAS.map(plantilla => {
              const activa = plantilla.id === plantillaActiva.id
              return (
                <button
                  type="button"
                  key={plantilla.id}
                  className={activa ? styles.templateCardActive : styles.templateCard}
                  onClick={() => seleccionarPlantilla(plantilla.id)}
                  aria-pressed={activa}
                >
                  <span>{plantilla.etiqueta}</span>
                  <strong>{plantilla.nombre}</strong>
                  <small>{plantilla.descripcion}</small>
                </button>
              )
            })}
          </div>
          {mensaje && <p className={styles.panelSub} style={{ marginTop: 12 }}>{mensaje}</p>}
        </div>
      </section>

      <section className={styles.templateWorkspace}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{plantillaActiva.nombre}</h2>
              <p className={styles.panelSub}>{plantillaActiva.ideal}</p>
            </div>
            <span className={styles.badge}>{plantillaActiva.etiqueta}</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.templateEmotion}>
              <strong>Emocion que debe transmitir</strong>
              <p>{plantillaActiva.emocion}</p>
            </div>
            <div className={styles.templateChecklist}>
              {plantillaActiva.requisitos.map((item, index) => (
                <div className={styles.templateCheck} key={item}>
                  <span>{index + 1}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
            <div className={styles.actionRow} style={{ marginTop: 14 }}>
              {plantillaActiva.acciones.map(accion => (
                <Link key={accion.texto} className={styles.secondary} href={accion.href}>{accion.texto}</Link>
              ))}
            </div>
          </div>
        </article>

        <aside className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>Guion de entrega</h2>
              <p className={styles.panelSub}>Texto base para equipo, cliente o consultoria.</p>
            </div>
            <button type="button" className={styles.ghost} onClick={copiarGuion}>{copiado ? 'Copiado' : 'Copiar'}</button>
          </div>
          <div className={styles.panelBody}>
            <pre className={styles.templateCopy}>{guion}</pre>
          </div>
        </aside>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Plan de activacion</h2>
            <p className={styles.panelSub}>Marca el avance real de esta experiencia antes de llevarla a mesa, redes o cliente.</p>
          </div>
          <span className={styles.badge}>
            {experienciaPendiente ? 'SQL pendiente' : sincronizandoExperiencia ? 'Guardando' : `${pasosCompletados}/${plantillaActiva.requisitos.length} pasos`}
          </span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.activationPlanHeader}>
            <div>
              <strong>{progresoPlan}% preparado</strong>
              <span>{progresoPlan === 100 ? 'Listo para entregar con control.' : 'Aun quedan detalles por cerrar antes de publicar o compartir.'}</span>
            </div>
            <div className={styles.activationPlanBar} aria-hidden="true">
              <span style={{ width: `${progresoPlan}%` }} />
            </div>
          </div>

          <div className={styles.formGrid}>
            <label>
              <span className={styles.label}>Fecha objetivo</span>
              <input
                className={styles.input}
                type="date"
                value={planActivacion.objetivo || ''}
                onChange={event => actualizarPlanActivacion('objetivo', event.target.value)}
              />
            </label>
            <label>
              <span className={styles.label}>Responsable</span>
              <input
                className={styles.input}
                value={planActivacion.responsable || ''}
                onChange={event => actualizarPlanActivacion('responsable', event.target.value)}
                placeholder="Sala, gerencia, Juanjo..."
              />
            </label>
          </div>

          <div className={styles.activationPlanGrid}>
            {plantillaActiva.requisitos.map(item => {
              const completado = Boolean(planActivacion.completados?.[item])
              return (
                <button
                  type="button"
                  key={item}
                  className={completado ? styles.activationStepDone : styles.activationStepTodo}
                  onClick={() => alternarPaso(item)}
                  aria-pressed={completado}
                >
                  <span>{completado ? 'OK' : 'Pendiente'}</span>
                  <strong>{item}</strong>
                </button>
              )
            })}
          </div>

          <label className={styles.activationNotes}>
            <span className={styles.label}>Notas de entrega</span>
            <textarea
              className={styles.textarea}
              value={planActivacion.notas || ''}
              onChange={event => actualizarPlanActivacion('notas', event.target.value)}
              placeholder="Ej. imprimir 12 sobremesas, avisar a sala el viernes, enviar preview al propietario..."
            />
          </label>

          <div className={styles.actionRow} style={{ marginTop: 14 }}>
            <Link className={styles.primary} href="/dashboard/qr#pack-entrega">Abrir pack QR</Link>
            <button type="button" className={styles.secondary} onClick={copiarGuion}>{copiado ? 'Guion copiado' : 'Copiar guion actualizado'}</button>
            <button type="button" className={styles.ghost} onClick={reiniciarPlanActivacion}>Reiniciar plan</button>
          </div>
        </div>
      </section>

      <section className={styles.gridThree}>
        {plantillaActiva.piezas.map((pieza, index) => (
          <article className={styles.itemCard} key={pieza}>
            <span className={styles.badge}>Pieza {index + 1}</span>
            <h3 className={styles.sectionTitle}>{pieza}</h3>
            <p className={styles.sectionText}>{preparacion[index] || 'Preparada desde QR, sala o personalizacion.'}</p>
          </article>
        ))}
      </section>
    </ModuleShell>
  )
}
