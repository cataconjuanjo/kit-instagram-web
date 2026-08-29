// ── Config de precios del Kiosko (fuente única — leer desde aquí en toda la app) ──
export const KIOSKO_PLANS = {
  basic: {
    id: 'basic',
    name: 'Básico',
    price: 59,
    currency: 'EUR',
    period: 'mes',
    recommended: false,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 99,
    currency: 'EUR',
    period: 'mes',
    recommended: true,
  },
}

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
    features: ['carta_qr', 'hub', 'personalizacion_avanzada', 'maridaje_cliente', 'modo_camarero', 'estadisticas', 'cierre_servicio', 'tpv_import', 'bodega', 'precios_margenes', 'inventario', 'importador_pdf', 'vista_etiquetas_publica'],
  },
  bodega: {
    nombre: 'Bodega',
    precioOrientativo: '149 EUR/mes',
    limiteVinos: 1000,
    features: ['estadisticas', 'tpv_import', 'bodega', 'precios_margenes', 'inventario', 'importador_pdf', 'informes', 'proveedores'],
  },
  sumiller: {
    nombre: 'Carta Viva Somm',
    precioOrientativo: '199 EUR/mes',
    limiteVinos: 5000,
    features: [
      // Todo lo del plan Bodega
      'estadisticas', 'tpv_import', 'bodega', 'precios_margenes', 'inventario',
      'importador_pdf', 'informes', 'proveedores',
      // Features exclusivas SUMILLER
      'somm_explotacion',
      'somm_desviaciones',
      'somm_breakeven',
      'somm_presupuesto',
      'somm_benchmarking',
      'somm_informes_pdf',
      'somm_multi_restaurante',
      'somm_simulador_mult',
      'somm_pmp',
      'somm_4_canales',
      'somm_tipos_salida',
      'somm_ubicacion_fisica',
      'somm_diferencial_copa',
      'somm_historico',
      'somm_bonus_variable',
      'somm_stock_ventas_kpi',
      'somm_personal_desglose',
      'somm_libro_compras',
      'somm_categorias_gastos',
      'somm_tramos_mult',
      'somm_copa_formato',
      'somm_rentabilidad_coste',
      'somm_what_if',
    ],
  },
  premium: {
    nombre: 'Acompanado',
    precioOrientativo: 'Presupuesto personalizado',
    limiteVinos: 9999,
    features: ['carta_qr', 'hub', 'personalizacion_avanzada', 'maridaje_cliente', 'modo_camarero', 'estadisticas', 'cierre_servicio', 'tpv_import', 'bodega', 'precios_margenes', 'inventario', 'importador_pdf', 'informes', 'proveedores', 'consultoria', 'vista_etiquetas_publica', 'catalogo_consultor'],
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

export function esPerfilSomm(restaurante) {
  return planRestaurante(restaurante) === 'sumiller'
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
