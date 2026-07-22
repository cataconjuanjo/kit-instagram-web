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

const PLAN_COPY = {
  basic: {
    nombre: 'Basico',
    descripcion: 'Carta QR, hub publico y maridaje para cliente.',
  },
  pro: {
    nombre: 'Sala',
    descripcion: 'Modo camarero, estadisticas, objetivos de sala y control de bodega.',
  },
  bodega: {
    nombre: 'Bodega',
    descripcion: 'Inventario, margen, proveedores e inteligencia de referencias.',
  },
  premium: {
    nombre: 'Acompanado',
    descripcion: 'Acompanamiento consultor y soporte prioritario.',
  },
}

const PLAN_OPTIONS = ['basic', 'pro', 'bodega', 'premium']

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
  return PLAN_OPTIONS.includes(plan) ? plan : 'pro'
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
      window.location.href = url
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
      window.location.href = url
    } catch (error) {
      setMensaje(error.message || 'No se pudo abrir la facturacion.')
      setLoadingAction('')
    }
  }

  const contenido = (
    <>
      <div className={styles.itemCard} style={{ marginBottom: 12 }}>
        <div className={styles.sectionHead} style={{ margin: 0 }}>
          <div>
            <p className={styles.eyebrow}>Plan actual</p>
            <h3 className={styles.sectionTitle}>{PLAN_COPY[planActual]?.nombre || planActual}</h3>
            <p className={styles.sectionText}>
              Estado: {estadoLabel}
              {trialEnd ? ` · prueba hasta ${trialEnd}` : ''}
            </p>
          </div>
          <span className={styles.badge}>{precioPlan(planActual) || 'Plan'}</span>
        </div>
      </div>

      {activo ? (
        <div className={styles.itemStack}>
          <p className={styles.sectionText} style={{ marginTop: 0 }}>
            Gestiona tarjeta, facturas, cancelacion o cambio de plan desde el portal seguro de Stripe.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={redirigirPortal}
            disabled={loadingAction === 'portal'}
          >
            {loadingAction === 'portal' ? 'Abriendo Stripe...' : 'Gestionar facturacion'}
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
                  {PLAN_COPY[plan].nombre} - {precioPlan(plan)}
                </option>
              ))}
            </select>
            <p className={styles.tiny}>{PLAN_COPY[planSeleccionado]?.descripcion}</p>
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
          <h2 className={styles.panelTitle}>Plan y facturacion</h2>
          <p className={styles.panelSub}>
            Activa la prueba, recupera una cuenta bloqueada o gestiona la suscripcion sin depender de un enlace manual.
          </p>
        </div>
      </div>
      <div className={styles.panelBody}>
        {contenido}
      </div>
    </section>
  )
}
