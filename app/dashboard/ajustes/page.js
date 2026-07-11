'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { etiquetaActividadReal } from '../../lib/actividadReal'
import { esPerfilBodega } from '../../lib/plans'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'

export default function AjustesHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [pinSala, setPinSala] = useState('')
  const [pinConfigurado, setPinConfigurado] = useState(false)
  const [guardandoPin, setGuardandoPin] = useState(false)
  const [mensajePin, setMensajePin] = useState('')
  const [mensajeActividad, setMensajeActividad] = useState('')
  const [guardandoActividad, setGuardandoActividad] = useState(false)
  const [copiado, setCopiado] = useState('')
  const [loading, setLoading] = useState(true)
  const [esAdmin, setEsAdmin] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email, isAdmin } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      setEsAdmin(Boolean(isAdmin))
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      setRestaurante(rest || null)
      setPinConfigurado(Boolean(rest?.camarero_pin_hash || rest?.camarero_pin))
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />

  const perfilBodega = esPerfilBodega(restaurante)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const destino = restaurante?.hub_activo ? `/r/${restaurante.slug}` : `/carta/${restaurante?.slug || ''}`
  const urlPublica = `${origin}${destino}`
  const urlCarta = `${origin}/carta/${restaurante?.slug || ''}`
  const urlCamarero = `${origin}/camarero/${restaurante?.slug || ''}`
  const urlReferencias = `${origin}/dashboard/vinos`
  const urlBodega = `${origin}/dashboard/bodega`
  const urlMapa = `${origin}/dashboard/menu-engineering`
  const urlInventario = `${origin}/dashboard/inventario`
  const actividadIniciada = Boolean(restaurante?.actividad_real_desde)

  const checklist = perfilBodega ? [
    {
      titulo: 'Actividad real definida',
      detalle: actividadIniciada ? `Cuenta desde ${etiquetaActividadReal(restaurante)}` : 'Define desde cuando cuentan ventas, stock y movimientos.',
      href: '#actividad-real',
      pendiente: !actividadIniciada,
    },
    { titulo: 'Referencias completas', detalle: 'Revisa coste, proveedor, stock minimo y perfil comercial.', href: '/dashboard/vinos?filtro=pendientes' },
    { titulo: 'Mapa estrella/joya revisado', detalle: 'Detecta estrellas, joyas, caballos de batalla y referencias a archivar.', href: '/dashboard/menu-engineering' },
    { titulo: 'Inventario preparado', detalle: 'Conteo fisico, bajo minimo y capital inmovilizado.', href: '/dashboard/inventario' },
  ] : [
    { titulo: 'QR probado en movil', detalle: restaurante?.hub_activo ? 'El QR abre el hub publico.' : 'El QR abre la carta directa.', href: '/dashboard/qr' },
    { titulo: 'Marca revisada', detalle: 'Logo, colores, banner y estilo visual de la carta.', href: '/dashboard/personalizar' },
    { titulo: 'PIN de sala definido', detalle: pinConfigurado ? 'El equipo puede entrar en modo camarero.' : 'Define un PIN antes de formar al equipo.', href: '#pin-sala', pendiente: !pinConfigurado },
    { titulo: 'Carta publica abierta', detalle: 'Comprueba que precios, platos y enlaces cargan bien.', href: destino },
  ]
  const checklistPendiente = checklist.some(item => item.pendiente)

  async function guardarPinSala() {
    if (!restaurante?.id) return
    setGuardandoPin(true)
    setMensajePin('')
    const pinLimpio = String(pinSala || '').trim()
    if (pinLimpio.length < 4) {
      setMensajePin('Usa al menos 4 digitos.')
      setGuardandoPin(false)
      return
    }
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch('/api/camarero/configurar-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      body: JSON.stringify({ restaurante_id: restaurante.id, pin: pinLimpio }),
    })
    if (res.ok) {
      setRestaurante({ ...restaurante, camarero_pin_configurado: true })
      setPinConfigurado(true)
      setPinSala('')
    }
    setMensajePin(res.ok ? 'PIN de sala guardado.' : 'No se pudo guardar el PIN.')
    setGuardandoPin(false)
  }

  async function copiar(texto, tipo) {
    if (!texto) return
    await navigator.clipboard?.writeText(texto)
    setCopiado(tipo)
    setTimeout(() => setCopiado(''), 1800)
  }

  async function guardarInicioActividad(fechaISO) {
    if (!restaurante?.id || guardandoActividad) return
    setGuardandoActividad(true)
    setMensajeActividad('')
    const { data, error } = await supabase
      .from('restaurantes')
      .update({ actividad_real_desde: fechaISO })
      .eq('id', restaurante.id)
      .select()
      .single()

    if (!error && data) {
      setRestaurante(data)
      setMensajeActividad(fechaISO ? 'Actividad real iniciada desde hoy.' : 'Actividad real pausada. Las pruebas no alimentaran decisiones.')
    } else {
      setMensajeActividad('No se pudo guardar el estado de actividad real.')
    }
    setGuardandoActividad(false)
  }

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Ajustes"
      title={perfilBodega ? 'Cuenta y puesta en marcha de bodega' : 'Accesos, marca y puesta en marcha'}
      subtitle={perfilBodega
        ? 'Ajustes operativos de la membresia sommelier: actividad real, accesos internos y enlaces de trabajo. Sin QR, sin carta publica.'
        : 'Configuracion que se toca poco, pero que debe quedar perfecta antes de entregar la carta al restaurante.'}
      actions={perfilBodega
        ? <Link className={styles.secondary} href="/dashboard/menu-engineering">Ver mapa estrella/joya</Link>
        : <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>}
      help={perfilBodega ? {
        title: 'Ajustes de membresia sommelier',
        intro: 'Esta zona deja la cuenta lista para trabajar con datos reales de bodega.',
        items: [
          { title: 'Actividad real', text: 'Separa pruebas de datos que alimentan compras, inventario y decisiones economicas.' },
          { title: 'Accesos internos', text: 'Vuelve rapido a referencias, stock, inventario y mapa estrella/joya.' },
          { title: 'Datos de bodega', text: 'El foco esta en coste, rotacion, proveedor, stock minimo y capital inmovilizado.' },
        ],
      } : {
        title: 'Cuando tocar ajustes',
        intro: 'Esta zona se usa sobre todo al dar de alta el restaurante o cuando cambia la identidad visual.',
        items: [
          { title: 'QR y accesos', text: 'Comprueba si el QR debe abrir la carta de vinos directa o el hub con reservas y otros enlaces.' },
          { title: 'Diseno', text: 'Ajusta logo, banner, colores y tipografia para que la carta parezca del restaurante, no de una plantilla.' },
          { title: 'Despues de lanzar', text: 'No hace falta revisarlo a diario. Solo vuelve aqui si cambias enlaces, imagen o material impreso.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        {perfilBodega ? (
          <>
            <div className={styles.stat}><p className={styles.statValue}>Sommelier</p><p className={styles.statLabel}>Membresia</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{etiquetaActividadReal(restaurante)}</p><p className={styles.statLabel}>Actividad real</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{restaurante?.slug || '-'}</p><p className={styles.statLabel}>Identificador interno</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{esAdmin ? 'Admin' : 'Cliente'}</p><p className={styles.statLabel}>Acceso</p></div>
          </>
        ) : (
          <>
            <div className={styles.stat}><p className={styles.statValue}>{restaurante?.hub_activo ? 'Hub' : 'Carta'}</p><p className={styles.statLabel}>Destino del QR</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{pinConfigurado ? 'Listo' : 'Falta'}</p><p className={styles.statLabel}>PIN camarero</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{restaurante?.slug || '-'}</p><p className={styles.statLabel}>Slug publico</p></div>
            <div className={styles.stat}><p className={styles.statValue}>{etiquetaActividadReal(restaurante)}</p><p className={styles.statLabel}>Actividad real</p></div>
          </>
        )}
      </section>

      {checklistPendiente && <section className={styles.panelDark} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{perfilBodega ? 'Checklist de arranque bodega' : 'Checklist de entrega'}</h2>
            <p className={styles.panelSub}>{perfilBodega ? 'Lo minimo para que el sumiller pueda sustituir el Excel con datos fiables.' : 'Lo minimo que debe quedar comprobado antes de poner el QR en mesa.'}</p>
          </div>
          <span className={styles.badge}>{checklist.filter(item => !item.pendiente).length} / {checklist.length}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.itemStack}>
            {checklist.map(item => (
              item.href.startsWith('#') ? (
                <a key={item.titulo} href={item.href} className={styles.itemCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.detalle}</p>
                    </div>
                    <span className={styles.badge}>{item.pendiente ? 'Pendiente' : 'Listo'}</span>
                  </div>
                </a>
              ) : (
                <Link key={item.titulo} href={item.href} target={item.href.startsWith('/') ? undefined : '_blank'} className={styles.itemCard}>
                  <div className={styles.sectionHead} style={{ margin: 0 }}>
                    <div>
                      <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                      <p className={styles.sectionText}>{item.detalle}</p>
                    </div>
                    <span className={styles.badge}>{item.pendiente ? 'Pendiente' : 'Listo'}</span>
                  </div>
                </Link>
              )
            ))}
          </div>
        </div>
      </section>}

      <section className={styles.hubGrid}>
        {perfilBodega ? (
          <>
            <Link className={styles.hubCard} href="/dashboard/vinos">
              <p className={styles.eyebrow}>Base de bodega</p>
              <h2>Referencias</h2>
              <p>Fichas, anadas, coste, proveedor, stock minimo y estado comercial.</p>
              <span>Gestionar vinos</span>
            </Link>
            <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/bodega">
              <p className={styles.eyebrow}>Compra</p>
              <h2>Stock y pedido</h2>
              <p>Bajo minimo, compra sugerida, movimientos y capital inmovilizado.</p>
              <span>Ver bodega</span>
            </Link>
            <Link className={styles.hubCard} href="/dashboard/menu-engineering">
              <p className={styles.eyebrow}>Decision</p>
              <h2>Estrellas y joyas</h2>
              <p>Mapa de salida real, margen, rotacion y potencial de cada referencia.</p>
              <span>Analizar mapa</span>
            </Link>
            <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/inventario">
              <p className={styles.eyebrow}>Conteo</p>
              <h2>Inventario</h2>
              <p>Prioriza conteos, revisa desviaciones y protege las referencias clave.</p>
              <span>Preparar inventario</span>
            </Link>
          </>
        ) : (
          <>
            <Link className={styles.hubCard} href="/dashboard/qr">
              <p className={styles.eyebrow}>Mesas</p>
              <h2>QR y accesos</h2>
              <p>Descarga el QR y revisa a donde envia: carta o hub publico.</p>
              <span>{restaurante?.hub_activo ? 'Hub activo' : 'Carta directa'}</span>
            </Link>
            <Link className={`${styles.hubCard} ${styles.hubCardDark}`} href="/dashboard/personalizar">
              <p className={styles.eyebrow}>Marca</p>
              <h2>Diseno de carta</h2>
              <p>Colores, tipografia, logo y banner de la carta publica.</p>
              <span>Editar identidad</span>
            </Link>
          </>
        )}
      </section>

      <section className={styles.gridTwo} style={{ marginTop: 16 }}>
        {(esAdmin || perfilBodega) && <div className={styles.panel} id="actividad-real">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{perfilBodega ? 'Arranque de datos reales' : 'Arranque de actividad real'}</h2>
              <p className={styles.panelSub}>{perfilBodega
                ? 'Hasta que la bodega trabaje con datos reales, las pruebas no deben alimentar mapa estrella/joya, inventario ni compras.'
                : 'Hasta que el restaurante empiece de verdad, las pruebas no deben alimentar Actividad, Briefing, Inventario ni Rentabilidad.'}</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemCard} style={{ marginBottom: 12 }}>
              <p className={styles.eyebrow}>Estado actual</p>
              <h3 className={styles.sectionTitle}>{actividadIniciada ? `Cuenta desde ${etiquetaActividadReal(restaurante)}` : 'Actividad real no iniciada'}</h3>
              <p className={styles.sectionText}>No borra datos antiguos. Solo evita que el historico de pruebas se use para decisiones comerciales.</p>
            </div>
            {esAdmin && (
              <div className={styles.itemStack}>
                <button className={styles.primary} onClick={() => guardarInicioActividad(new Date().toISOString())} disabled={guardandoActividad}>
                  {actividadIniciada ? 'Reiniciar desde hoy' : 'Empezar actividad real hoy'}
                </button>
                {actividadIniciada && (
                  <button className={styles.ghost} onClick={() => guardarInicioActividad(null)} disabled={guardandoActividad}>
                    Pausar actividad real
                  </button>
                )}
              </div>
            )}
            {mensajeActividad && <p className={styles.tiny}>{mensajeActividad}</p>}
          </div>
        </div>}

        {!perfilBodega && <div className={styles.panel} id="pin-sala">
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>PIN de modo camarero</h2>
              <p className={styles.panelSub}>Acceso sencillo para sala, distinto por restaurante y editable cuando cambie el equipo.</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.formGrid}>
              <div>
                <label className={styles.label}>PIN sala</label>
                <input
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  value={pinSala}
                  onChange={e => setPinSala(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Ej. 4826"
                />
                {mensajePin && <p className={styles.tiny}>{mensajePin}</p>}
              </div>
              <div>
                <label className={styles.label}>Enlace camarero</label>
                <a className={styles.secondary} href={urlCamarero} target="_blank" rel="noreferrer">
                  Abrir modo camarero
                </a>
              </div>
            </div>
            <button className={styles.primary} onClick={guardarPinSala} disabled={guardandoPin} style={{ marginTop: 14 }}>
              {guardandoPin ? 'Guardando...' : 'Guardar PIN'}
            </button>
          </div>
        </div>}

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2 className={styles.panelTitle}>{perfilBodega ? 'Enlaces internos de trabajo' : 'Enlaces para compartir'}</h2>
              <p className={styles.panelSub}>{perfilBodega ? 'Atajos para compartir con el equipo de bodega o volver rapido a pantallas clave.' : 'Utiles para imprenta, equipo de sala, WhatsApp o pruebas rapidas.'}</p>
            </div>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.itemStack}>
              {perfilBodega ? (
                <>
                  <button className={styles.ghost} onClick={() => copiar(urlReferencias, 'referencias')}>{copiado === 'referencias' ? 'Copiado' : 'Copiar referencias'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlBodega, 'bodega')}>{copiado === 'bodega' ? 'Copiado' : 'Copiar bodega'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlMapa, 'mapa')}>{copiado === 'mapa' ? 'Copiado' : 'Copiar mapa estrella/joya'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlInventario, 'inventario')}>{copiado === 'inventario' ? 'Copiado' : 'Copiar inventario'}</button>
                </>
              ) : (
                <>
                  <button className={styles.ghost} onClick={() => copiar(urlPublica, 'publica')}>{copiado === 'publica' ? 'Copiado' : 'Copiar experiencia publica'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlCarta, 'carta')}>{copiado === 'carta' ? 'Copiado' : 'Copiar carta directa'}</button>
                  <button className={styles.ghost} onClick={() => copiar(urlCamarero, 'camarero')}>{copiado === 'camarero' ? 'Copiado' : 'Copiar modo camarero'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </ModuleShell>
  )
}
