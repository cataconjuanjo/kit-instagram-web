'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import {
  SELECT_CLIENT_PLATO_DASHBOARD,
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
  SELECT_CLIENT_SELECCION_ESPECIAL_ADMIN,
  SELECT_CLIENT_VINO_DASHBOARD,
} from '../../lib/clientSupabaseSelects'
import { esPerfilBodega } from '../../lib/plans'
import { LoadingState, ModuleShell } from '../moduleComponents'
import styles from '../module.module.css'
import OpenCartaPruebaButton from '../OpenCartaPruebaButton'
import SuggestionDialog from '../SuggestionDialog'

const RESTAURANTE_PREFIX = '[RESTAURANTE] '

export default function Destacados() {
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
      const { data: rest } = await supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD).eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const [{ data: vinosData }, { data: platosData }, { data: seleccionData }] = await Promise.all([
          supabase.from('vinos').select(SELECT_CLIENT_VINO_DASHBOARD).eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('platos').select(SELECT_CLIENT_PLATO_DASHBOARD).eq('restaurante_id', rest.id).eq('activo', true),
          supabase.from('seleccion_especial').select(SELECT_CLIENT_SELECCION_ESPECIAL_ADMIN).eq('restaurante_id', rest.id).eq('activo', true),
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
        eyebrow="Carta"
        title="No disponible en Sommelier"
        narrow
      >
        <section className={styles.empty}>
          <div>
            <p>Los destacados no están disponibles en el perfil de bodega.</p>
          </div>
        </section>
      </ModuleShell>
    )
  }

  const vinosSinPrecio = vinos.filter(v => !Number(v.precio_botella))
  const vinosSinPerfil = vinos.filter(v => !v.notas_cata || v.notas_cata.length < 12)
  const platosSinDescripcion = platos.filter(p => !p.descripcion || p.descripcion.length < 8)
  const platosSinPrecio = platos.filter(p => !Number(p.precio))
  const pendientesVinos = vinosSinPrecio.length + vinosSinPerfil.length
  const pendientesPlatos = platosSinDescripcion.length + platosSinPrecio.length
  const pendientesCarta = pendientesVinos + pendientesPlatos

  const sugerenciasConsultor = seleccion.filter(item => !String(item.nota_personal || '').startsWith(RESTAURANTE_PREFIX))
  const sugerenciaRestaurante = seleccion.find(item => String(item.nota_personal || '').startsWith(RESTAURANTE_PREFIX))

  return (
    <ModuleShell
      restaurante={restaurante}
      eyebrow="Carta"
      title="Destacados"
      subtitle="Vinos en primer plano: selección del consultor y sugerencia propia del restaurante."
      actions={
        <OpenCartaPruebaButton className={styles.secondary} restauranteId={restaurante?.id}>Probar carta</OpenCartaPruebaButton>
      }
      help={{
        title: 'Cómo usar los destacados',
        intro: 'Los destacados son el escaparate activo de la carta.',
        items: [
          { title: 'Selección del consultor', text: 'Referencias curadas con criterio de margen, temporada o relato de sala.' },
          { title: 'Sugerencia del restaurante', text: 'Un único vino que elegís vosotros. Úsalo para empujar producto local, novedad o margen.' },
          { title: 'El orden importa', text: 'Primero fija los vinos con precio y perfil. Luego usa los destacados para dar visibilidad a lo que más os interesa.' },
        ],
      }}
    >
      {pendientesCarta > 0 && (
        <p style={{ marginBottom: 20, fontSize: 13, color: 'var(--cv-text-muted)' }}>
          {pendientesCarta} campos pendientes en la carta —{' '}
          {pendientesVinos > 0 && <Link href="/dashboard/vinos?filtro=pendientes">Revisar vinos</Link>}
          {pendientesVinos > 0 && pendientesPlatos > 0 && ' · '}
          {pendientesPlatos > 0 && <Link href="/dashboard/platos?filtro=descripcion">Revisar platos</Link>}
        </p>
      )}

      {sugerenciasConsultor.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Selección del consultor</p>
              <h2 className={styles.sectionTitle}>
                {sugerenciasConsultor.length} {sugerenciasConsultor.length === 1 ? 'vino destacado' : 'vinos destacados'}
              </h2>
            </div>
          </div>
          <div className={styles.itemStack}>
            {sugerenciasConsultor.map(item => {
              const vino = vinos.find(v => String(v.id) === String(item.vino_id))
              return (
                <article key={item.id} className={styles.itemCard}>
                  <p className={styles.eyebrow}>Selección</p>
                  <h3 className={styles.sectionTitle}>{vino?.nombre || 'Vino destacado'}</h3>
                  {vino && (
                    <p className={styles.sectionText}>
                      {vino.bodega}{vino.region ? ` · ${vino.region}` : ''}
                    </p>
                  )}
                  {item.nota_personal && (
                    <p className={styles.lead} style={{ marginTop: 12, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                      {item.nota_personal}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <div className={styles.sectionHead} style={{ marginBottom: 12 }}>
          <div>
            <p className={styles.eyebrow}>Escaparate</p>
            <h2 className={styles.sectionTitle}>Sugerencia de la casa</h2>
            <p className={styles.sectionText}>Un único vino que elegís vosotros. Se muestra en la carta pública y en el modo camarero.</p>
          </div>
          {!sugerenciaRestaurante && (
            <button type="button" className={styles.secondary} onClick={() => setMostrarSugerencia(true)}>
              Añadir sugerencia
            </button>
          )}
        </div>
        {sugerenciaRestaurante ? (() => {
          const vino = vinos.find(v => String(v.id) === String(sugerenciaRestaurante.vino_id))
          return (
            <article className={styles.itemCard}>
              <p className={styles.eyebrow}>Recomendación activa</p>
              <h3 className={styles.sectionTitle}>{vino?.nombre || 'Vino recomendado'}</h3>
              {vino && (
                <p className={styles.sectionText}>
                  {vino.bodega}{vino.region ? ` · ${vino.region}` : ''}
                </p>
              )}
              <p className={styles.lead} style={{ marginTop: 16, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {String(sugerenciaRestaurante.nota_personal || '').replace(RESTAURANTE_PREFIX, '')}
              </p>
              <button
                type="button"
                className={styles.ghost}
                style={{ marginTop: 16 }}
                onClick={() => setMostrarSugerencia(true)}
              >
                Cambiar sugerencia
              </button>
            </article>
          )
        })() : (
          <section className={styles.empty}>
            <div>
              <strong>Sin sugerencia activa</strong>
              <p>El restaurante no tiene ninguna recomendación propia en la carta pública ahora mismo.</p>
            </div>
          </section>
        )}
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
