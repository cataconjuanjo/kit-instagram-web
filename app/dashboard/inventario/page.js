'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { getEffectiveRestaurantEmail } from '../../demo'
import {
  SELECT_CLIENT_RESTAURANTE_DASHBOARD,
  SELECT_CLIENT_VINO_DASHBOARD,
} from '../../lib/clientSupabaseSelects'
import { cargarDemoDashboard } from '../../lib/demoDashboardClient'
import { FeatureGate, LoadingState, ModuleShell } from '../moduleComponents'
import { puedeUsar } from '../../lib/plans'
import styles from '../module.module.css'
import InventarioPanel from './InventarioPanel'
import SommStockSection from './SommStockSection'

export default function InventarioSemanal() {
  const [restaurante, setRestaurante] = useState(null)
  const [vinos, setVinos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { email, restauranteId, isDemo } = await getEffectiveRestaurantEmail(supabase)
      if (!email && !restauranteId) { window.location.href = '/login'; return }
      if (isDemo) {
        const demo = await cargarDemoDashboard(email)
        if (demo?.restaurante) {
          setRestaurante(demo.restaurante)
          setVinos(demo.vinos || [])
        }
        setLoading(false)
        return
      }
      const consulta = supabase.from('restaurantes').select(SELECT_CLIENT_RESTAURANTE_DASHBOARD)
      const { data: rest } = restauranteId
        ? await consulta.eq('id', restauranteId).single()
        : await consulta.eq('email', email).single()
      if (rest) {
        setRestaurante(rest)
        const { data } = await supabase
          .from('vinos')
          .select(SELECT_CLIENT_VINO_DASHBOARD)
          .eq('restaurante_id', rest.id)
          .eq('activo', true)
          .order('nombre')
        setVinos(data || [])
      }
      setLoading(false)
    }
    cargar()
  }, [])

  function handleStockActualizado(stockMap) {
    setVinos(prev => prev.map(v =>
      stockMap.has(String(v.id)) ? { ...v, stock: stockMap.get(String(v.id)) } : v
    ))
  }

  if (loading) return <LoadingState />
  if (!restaurante) {
    return (
      <ModuleShell
        restaurante={null}
        eyebrow="Inventario inteligente"
        title="No se pudo cargar el inventario"
        subtitle="La pantalla esta lista, pero falta una sesion de restaurante o la demo local no ha devuelto datos."
      >
        <div className={styles.empty}>
          Inicia sesion con un restaurante o vuelve a cargar la demo para ver referencias, prioridades y conteo semanal.
        </div>
      </ModuleShell>
    )
  }

  return (
    <FeatureGate restaurante={restaurante} feature="inventario" title="Inventario no incluido">
      <ModuleShell
        restaurante={restaurante}
        eyebrow="Inventario inteligente"
        title="Revisar solo lo importante"
        subtitle="Una rutina semanal para contar vinos de riesgo, aplicar diferencias y medir el impacto económico sin revisar toda la bodega."
        help={{
          title: 'Inventario práctico',
          intro: 'La idea no es contar todo cada día, sino revisar primero las referencias que pueden generar problemas.',
          items: [
            { title: 'Empieza por prioridad', text: 'Bajo mínimo, incidencias, vinos premium y copa tienen más impacto que una lista alfabética.' },
            { title: 'Cuenta y compara', text: 'Rellena solo las unidades contadas cuando haya diferencia real con el stock de la app.' },
            { title: 'Aplica al final', text: 'El botón de aplicar actualiza stock y guarda el movimiento para mantener trazabilidad.' },
            { title: 'Separa motivos', text: 'Venta no registrada, merma, invitacion y ajuste no son lo mismo: solo la venta explica coste asociado a ingreso.' },
          ],
        }}
      >
        <InventarioPanel
          restauranteId={restaurante.id}
          vinos={vinos}
          actividadDesde={restaurante.actividad_real_desde}
          onStockActualizado={handleStockActualizado}
          compact={false}
        />
        {puedeUsar(restaurante, 'somm_pmp') && (
          <SommStockSection restauranteId={restaurante.id} />
        )}
      </ModuleShell>
    </FeatureGate>
  )
}
