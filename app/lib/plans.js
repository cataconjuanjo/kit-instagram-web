export const PLANES = {
  basic: {
    nombre: 'Basico',
    precioOrientativo: '59 EUR/mes',
    limiteVinos: 100,
    features: ['carta_qr', 'hub', 'personalizacion_basica', 'maridaje_cliente'],
  },
  pro: {
    nombre: 'Sala',
    precioOrientativo: '99 EUR/mes',
    limiteVinos: 200,
    features: ['carta_qr', 'hub', 'personalizacion_avanzada', 'maridaje_cliente', 'modo_camarero', 'estadisticas', 'cierre_servicio', 'tpv_import', 'bodega', 'precios_margenes', 'inventario', 'importador_pdf'],
  },
  bodega: {
    nombre: 'Bodega',
    precioOrientativo: '149 EUR/mes',
    limiteVinos: 1000,
    features: ['estadisticas', 'tpv_import', 'bodega', 'precios_margenes', 'inventario', 'importador_pdf', 'informes', 'proveedores'],
  },
  premium: {
    nombre: 'Acompanado',
    precioOrientativo: 'Presupuesto personalizado',
    limiteVinos: 9999,
    features: ['carta_qr', 'hub', 'personalizacion_avanzada', 'maridaje_cliente', 'modo_camarero', 'estadisticas', 'cierre_servicio', 'tpv_import', 'bodega', 'precios_margenes', 'inventario', 'importador_pdf', 'informes', 'proveedores', 'consultoria'],
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

export function limiteVinosPlan(restaurante) {
  return PLANES[planRestaurante(restaurante)].limiteVinos
}

export function esPerfilBodega(restaurante) {
  return planRestaurante(restaurante) === 'bodega'
}

export function estadoPlan(restaurante) {
  const estado = restaurante?.subscription_status || 'trialing'
  return {
    activo: estadoSuscripcionActivo(restaurante),
    estado,
    nombre: nombrePlan(restaurante),
    plan: planRestaurante(restaurante),
  }
}
