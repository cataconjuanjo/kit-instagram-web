'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import { esPerfilBodega } from '../../lib/plans'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'
import SuggestionDialog from '../SuggestionDialog'

function porcentaje(valor, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round((valor / total) * 100)))
}

export default function CartaHub() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [platos, setPlatos] = useState([])
  const [seleccion, setSeleccion] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarSugerencia, setMostrarSugerencia] = useState(false)

  useEffect(() => {
    async function cargar() {
      const { email } = await getEffectiveRestaurantEmail(supabase)
      if (!email) { window.location.href = '/login'; return }
      const { data: rest } = await supabase.from('restaurantes').select('*').eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const [{ data: vinosData }, { data: platosData }, { data: seleccionData }] = await Promise.all([
          supabase.from('vinos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('platos').select('*').eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('seleccion_especial').select('*').eq('restaurante_id', rest.id).eq('activo', true),
        ])
        setVinos(vinosData || [])
        setPlatos(platosData || [])
        setSeleccion(seleccionData || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  if (loading) return <LoadingState />

  if (esPerfilBodega(restaurante)) {
    return (
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Bodega"
        title="Carta publica no incluida en Sommelier"
        subtitle="Esta membresia esta pensada para que el sumiller gestione referencias, compras, stock, inventario, rentabilidad y mapa estrella/joya."
        actions={<Link className={styles.secondary} href="/dashboard/vinos">Gestionar referencias</Link>}
        narrow
      >
        <section className={styles.empty}>
          <div>
            <strong>Foco en gestion de bodega</strong>
            <p>Los maridajes, QR y publicaciones quedan fuera de esta experiencia para no mezclar sala con control de bodega.</p>
          </div>
        </section>
      </ModuleShell>
    )
  }

  const vinosSinPrecio = vinos.filter(vino => !Number(vino.precio_botella))
  const vinosSinPerfil = vinos.filter(vino => !vino.notas_cata || vino.notas_cata.length < 12)
  const vinosSinStock = vinos.filter(vino => vino.stock === null || vino.stock === undefined || Number(vino.stock) === 0)
  const platosSinDescripcion = platos.filter(plato => !plato.descripcion || plato.descripcion.length < 8)
  const platosSinPrecio = platos.filter(plato => !Number(plato.precio))
  const pendientesCarta = vinosSinPrecio.length + vinosSinPerfil.length + platosSinDescripcion.length + platosSinPrecio.length
  const pendientesMotor = vinosSinPerfil.length + platosSinDescripcion.length
  const calidadVinos = Math.round((porcentaje(vinos.length - vinosSinPrecio.length, vinos.length) * 0.45) + (porcentaje(vinos.length - vinosSinPerfil.length, vinos.length) * 0.45) + (porcentaje(vinos.length - vinosSinStock.length, vinos.length) * 0.1))
  const calidadPlatos = Math.round((porcentaje(platos.length - platosSinDescripcion.length, platos.length) * 0.65) + (porcentaje(platos.length - platosSinPrecio.length, platos.length) * 0.35))
  const calidadPublicacion = Math.round((calidadVinos * 0.58) + (calidadPlatos * 0.42))
  const sugerenciasRestaurante = seleccion.filter(item => String(item.nota_personal || '').startsWith('[RESTAURANTE] '))
  const estadoPublicacion = calidadPublicacion >= 80 ? 'Lista para enseñar' : calidadPublicacion >= 55 ? 'Publicable con avisos' : 'No la enseñaría aún'
  const checklist = [
    { titulo: 'Vinos con precio', valor: vinos.length - vinosSinPrecio.length, total: vinos.length, href: '/dashboard/vinos?filtro=pendientes' },
    { titulo: 'Vinos con perfil de venta', valor: vinos.length - vinosSinPerfil.length, total: vinos.length, href: '/dashboard/vinos?filtro=pendientes' },
    { titulo: 'Platos con pistas de venta', valor: platos.length - platosSinDescripcion.length, total: platos.length, href: '/dashboard/platos?filtro=descripcion' },
    { titulo: 'Platos con precio', valor: platos.length - platosSinPrecio.length, total: platos.length, href: '/dashboard/platos?filtro=sin_precio' },
  ]
  const pendientesPrioritarios = [
    ...vinosSinPrecio.slice(0, 3).map(vino => ({ tipo: 'Publicacion', nombre: vino.nombre, detalle: 'Vino sin precio', href: '/dashboard/vinos?filtro=pendientes' })),
    ...platosSinPrecio.slice(0, 2).map(plato => ({ tipo: 'Publicacion', nombre: plato.nombre, detalle: 'Plato sin precio', href: '/dashboard/platos?filtro=sin_precio' })),
    ...vinosSinPerfil.slice(0, 3).map(vino => ({ tipo: 'Recomendacion', nombre: vino.nombre, detalle: 'Falta perfil de venta', href: '/dashboard/vinos?filtro=pendientes' })),
    ...platosSinDescripcion.slice(0, 3).map(plato => ({ tipo: 'Recomendacion', nombre: plato.nombre, detalle: 'Faltan pistas para maridar', href: '/dashboard/platos?filtro=descripcion' })),
  ].slice(0, 5)
  const accionesRapidas = [
    { label: 'Importar vinos', href: '/dashboard/vinos?importar=1' },
    { label: 'Añadir vino', href: '/dashboard/vinos?new=1' },
    { label: 'Importar platos', href: '/dashboard/platos?importar=1' },
    { label: 'Vino destacado', action: () => setMostrarSugerencia(true) },
  ]

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Carta"
      title="Vinos, platos y destacados"
      subtitle="Aquí se mantiene la información que ve el cliente y usa el modo camarero para recomendar."
      actions={
        <>
          <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>
          <a className={styles.secondary} href={`/carta/${restaurante?.slug || ''}?print=1`} target="_blank" rel="noreferrer">Imprimir / PDF</a>
        </>
      }
      help={{
        title: 'Orden recomendado',
        intro: 'Esta pestaña es la base comercial de la carta. Si está bien alimentada, el resto de la app trabaja mejor.',
        items: [
          { title: 'Primero vinos', text: 'Comprueba precios, stock y perfil de venta. Sin eso, la carta pública y el modo camarero pierden fuerza.' },
          { title: 'Luego platos', text: 'Los platos necesitan descripcion interna: tecnica, salsa, intensidad o ingrediente clave. No se muestra como receta en la carta publica.' },
          { title: 'Destacados al final', text: 'Úsalos cuando quieras empujar margen, producto local, novedad o una referencia con buen relato de sala.' },
        ],
      }}
    >
      <section className={styles.statsGrid}>
        <div className={styles.stat}><p className={styles.statValue}>{vinos.length}</p><p className={styles.statLabel}>Vinos activos</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{platos.length}</p><p className={styles.statLabel}>Platos activos</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{calidadPublicacion}%</p><p className={styles.statLabel}>{estadoPublicacion}</p></div>
        <div className={styles.stat}><p className={styles.statValue}>{pendientesMotor}</p><p className={styles.statLabel}>Faltan para recomendar</p></div>
      </section>

      <section className={styles.quickActionBar} aria-label="Acciones rapidas de carta">
        {accionesRapidas.map(accion => (
          accion.action
            ? <button key={accion.label} type="button" className={styles.secondary} onClick={accion.action}>{accion.label}</button>
            : <Link key={accion.href} className={styles.secondary} href={accion.href}>{accion.label}</Link>
        ))}
      </section>

      <section className={pendientesCarta ? styles.panelDark : styles.panel} style={{ marginBottom: 16 }}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Preflight antes de enseñar el QR</h2>
            <p className={styles.panelSub}>Una revisión rápida para evitar platos sin argumento, vinos sin precio o una carta que parezca incompleta.</p>
          </div>
          <span className={styles.badge}>{estadoPublicacion}</span>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.gridTwo}>
            <div className={styles.itemStack}>
              {checklist.map(item => {
                const valor = porcentaje(item.valor, item.total)
                return (
                  <Link key={item.titulo} href={item.href} className={styles.itemCard}>
                    <div className={styles.sectionHead} style={{ margin: 0 }}>
                      <div>
                        <h3 className={styles.sectionTitle}>{item.titulo}</h3>
                        <p className={styles.sectionText}>{item.valor} de {item.total || 0} completados</p>
                      </div>
                      <span className={styles.badge}>{valor}%</span>
                    </div>
                  </Link>
                )
              })}
            </div>

            <div className={styles.itemStack}>
              {pendientesPrioritarios.length ? pendientesPrioritarios.map(item => (
                <Link key={`${item.tipo}-${item.nombre}`} href={item.href} className={styles.itemCard}>
                  <p className={styles.eyebrow}>{item.tipo}</p>
                  <h3 className={styles.sectionTitle}>{item.nombre}</h3>
                  <p className={styles.sectionText}>{item.detalle}</p>
                </Link>
              )) : (
                <div className={styles.empty}>La carta no tiene pendientes críticos para publicar.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.hubGrid}>
        <Link className={styles.hubCard} href="/dashboard/vinos">
          <p className={styles.eyebrow}>Base de carta</p>
          <h2>Vinos</h2>
          <p>Alta, importación, precios, stock básico y perfiles de venta.</p>
          <span>{vinosSinPrecio.length} sin precio · {vinosSinPerfil.length} sin perfil</span>
        </Link>
        <Link className={styles.hubCard} href="/dashboard/platos">
          <p className={styles.eyebrow}>Maridaje</p>
          <h2>Platos</h2>
          <p>Carta de comida, categorias y pistas de venta para que la recomendacion encaje.</p>
          <span>{platosSinDescripcion.length} necesitan pistas de venta</span>
        </Link>
        <button type="button" className={`${styles.hubCard} ${styles.hubCardDark}`} onClick={() => setMostrarSugerencia(true)}>
          <p className={styles.eyebrow}>Escaparate</p>
          <h2>Sugerencia de la casa</h2>
          <p>La Selección Juanjo la mantiene el consultor. Aquí podéis añadir una recomendación propia del restaurante.</p>
          <span>{sugerenciasRestaurante.length ? `${sugerenciasRestaurante.length} vinos recomendados` : 'Sin recomendacion propia'}</span>
        </button>
      </section>
      <SuggestionDialog
        open={mostrarSugerencia}
        onClose={() => setMostrarSugerencia(false)}
        restaurante={restaurante}
        vinos={vinos}
        seleccion={seleccion}
        onChange={setSeleccion}
      />
    </ModuleShell>
  )
}
