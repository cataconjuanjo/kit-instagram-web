export const PLANES = {
  basic: {
    nombre: 'Basic',
    precioOrientativo: '29-39 €/mes',
    features: ['carta_qr', 'hub', 'personalizacion_basica', 'estadisticas_basicas'],
  },
  pro: {
    nombre: 'Pro Bodega',
    precioOrientativo: '79-99 €/mes',
    features: ['carta_qr', 'hub', 'personalizacion_avanzada', 'modo_camarero', 'bodega', 'inventario', 'maridaje', 'importador_pdf'],
  },
  premium: {
    nombre: 'Premium Consultoría',
    precioOrientativo: '149-249 €/mes',
    features: ['carta_qr', 'hub', 'personalizacion_avanzada', 'modo_camarero', 'bodega', 'inventario', 'maridaje', 'importador_pdf', 'informes', 'proveedores', 'consultoria'],
  },
}

export function planRestaurante(restaurante) {
  return PLANES[restaurante?.plan] ? restaurante.plan : 'basic'
}

export function estadoSuscripcionActivo(restaurante) {
  return ['active', 'trialing'].includes(restaurante?.subscription_status || 'trialing')
}

export function puedeUsar(restaurante, feature) {
  const plan = PLANES[planRestaurante(restaurante)]
  return estadoSuscripcionActivo(restaurante) && plan.features.includes(feature)
}

export function nombrePlan(restaurante) {
  return PLANES[planRestaurante(restaurante)].nombre
}
