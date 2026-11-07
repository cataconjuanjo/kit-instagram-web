'use client'

import { useMemo, useState } from 'react'
import { abrirPortalStripe, crearCheckoutStripe } from '../lib/billingClient'
import { PLANES } from '../lib/plans'
import styles from './module.module.css'

const STATUS_LABEL = {
  active: 'Activo',
  trialing: 'En prueba',
  past_due: 'Pendiente de Stripe',
  cancelled: 'Cancelado',
}

// Descripcion comercial corta por plan. El NOMBRE y el PRECIO se leen SIEMPRE
// desde PLANES (app/lib/plans.js) — fuente de verdad unica. Aqui solo vive el
// copy adicional que no existe en plans.js.
const PLAN_DESCRIPCION = {
  basic:    'Carta QR, hub publico y maridaje para cliente.',
  pro:      'Modo camarero, estadisticas, objetivos de sala y control de bodega.',
  bodega:   'Inventario, margen, proveedores e inteligencia de referencias.',
  sumiller: 'Explotacion de bodega, presupuesto, bonus variable y stock de bodega avanzado.',
  premium:  'Acompanamiento consultor y soporte prioritario.',
}

// Orden de la opcion de upgrade (de menor a mayor). Incluye TODAS las keys
// existentes en PLANES para que planInicial no caiga al fallback cuando
// el usuario tenga un plan 'sumiller' (el bug reportado en v1 era que
// PLAN_OPTIONS omitia 'sumiller' y los somm aparecian como Sala/99 €).
const PLAN_OPTIONS = ['basic', 'pro', 'bodega', 'sumiller', 'premium']

function nombrePlanKey(plan) {
  return PLANES[plan]?.nombre || plan
}

function descripcionPlan(plan) {
  return PLAN_DESCRIPCION[plan] || ''
}

function fechaCorta(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function planInicial(restaurante) {
  const plan = restaurante?.plan
  // Si el plan esta en PLANES lo dejamos aunque no este en PLAN_OPTIONS
  // (robusto ante planes futuros). Si no, fallback a 'pro'.
  if (PLANES[plan]) return plan
  return 'pro'
}

function precioPlan(plan) {
  return PLANES[plan]?.precioOrientativo || ''
}

export default function BillingPanel({ restaurante, compact = false }) {
  const [planDraft, setPlanDraft] = useState({ restauranteId: '', plan: '' })
  const [loadingAction, setLoadingAction] = useState('')
  const [mensaje, setMensaje] = useState('')

  const estado = restaurante?.subscription_status || 'trialing'
  const activo = ['active', 'trialing'].includes(estado)
  const estadoLabel = STATUS_LABEL[estado] || estado || 'Sin estado'
  const planActual = planInicial(restaurante)
  const planSeleccionado = planDraft.restauranteId === restaurante?.id && PLAN_OPTIONS.includes(planDraft.plan)
    ? planDraft.plan
    : planActual
  const trialEnd = fechaCorta(restaurante?.trial_expires_at)
  const selectId = useMemo(
    () => `billing-plan-${restaurante?.id || 'actual'}-${compact ? 'compact' : 'panel'}`,
    [restaurante?.id, compact]
  )

  if (!restaurante?.id) return null

  async function redirigirCheckout() {
    setMensaje('')
    setLoadingAction('checkout')
    try {
      const url = await crearCheckoutStripe({
        restauranteId: restaurante.id,
        plan: planSeleccionado,
      })
      window.location.assign(url)
    } catch (error) {
      setMensaje(error.message || 'No se pudo iniciar Stripe.')
      setLoadingAction('')
    }
  }

  async function redirigirPortal() {
    setMensaje('')
    setLoadingAction('portal')
    try {
      const url = await abrirPortalStripe({ restauranteId: restaurante.id })
      window.location.assign(url)
    } catch (error) {
      setMensaje(error.message || 'No se pudo abrir la facturación.')
      setLoadingAction('')
    }
  }

  const contenido = (
    <>
      <div className={styles.itemCard} style={{ marginBottom: 12 }}>
        <div className={styles.sectionHead} style={{ margin: 0 }}>
          <div>
            <p className={styles.eyebrow}>Plan actual</p>
            <h3 className={styles.sectionTitle}>{nombrePlanKey(planActual)}</h3>
            <p className={styles.sectionText}>
              Estado: {estadoLabel}
              {estado === 'trialing' && trialEnd ? ` · prueba hasta ${trialEnd}` : ''}
            </p>
          </div>
          <span className={styles.badge}>{precioPlan(planActual) || 'Plan'}</span>
        </div>
      </div>

      {activo ? (
        <div className={styles.itemStack}>
          <button
            type="button"
            className={styles.primary}
            onClick={redirigirPortal}
            disabled={loadingAction === 'portal'}
          >
            {loadingAction === 'portal' ? 'Abriendo Stripe...' : 'Gestionar facturación'}
          </button>
        </div>
      ) : (
        <div className={styles.itemStack}>
          <div>
            <label className={styles.label} htmlFor={selectId}>Plan para activar</label>
            <select
              id={selectId}
              className={styles.select}
              value={planSeleccionado}
              onChange={event => setPlanDraft({ restauranteId: restaurante.id, plan: event.target.value })}
              disabled={loadingAction === 'checkout'}
            >
              {PLAN_OPTIONS.map(plan => (
                <option key={plan} value={plan}>
                  {nombrePlanKey(plan)}{precioPlan(plan) ? ` - ${precioPlan(plan)}` : ''}
                </option>
              ))}
            </select>
            <p className={styles.tiny}>{descripcionPlan(planSeleccionado)}</p>
          </div>
          <button
            type="button"
            className={styles.primary}
            onClick={redirigirCheckout}
            disabled={loadingAction === 'checkout'}
          >
            {loadingAction === 'checkout' ? 'Abriendo Stripe...' : 'Activar prueba gratuita'}
          </button>
          <p className={styles.tiny}>Stripe abre una suscripcion con 14 dias de prueba y codigos promocionales si estan configurados.</p>
        </div>
      )}

      {mensaje && <p className={styles.tiny} role="status">{mensaje}</p>}
    </>
  )

  if (compact) {
    return <div className={styles.itemStack}>{contenido}</div>
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Plan y facturación</h2>
          <p className={styles.panelSub}>
            {activo
              ? 'Gestiona tu tarjeta, facturas y plan desde el portal seguro de Stripe.'
              : '14 días de prueba gratuita. Se solicita tarjeta al activar; cancela antes de que termine si no quieres que empiece el cobro.'}
          </p>
        </div>
      </div>
      <div className={styles.panelBody}>
        {contenido}
      </div>
    </section>
  )
}
