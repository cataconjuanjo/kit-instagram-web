export const SELECT_CLIENT_RESTAURANTE_ADMIN = [
  'id', 'nombre', 'email', 'ciudad', 'slug', 'logo_url',
  'color_primario', 'color_fondo', 'color_acento', 'tipografia',
  'hub_activo', 'hub_titulo', 'hub_subtitulo',
  'instagram_url', 'facebook_url', 'plan', 'subscription_status',
  'trial_active_seconds_limit', 'trial_expires_at', 'trial_started_at',
  'ticket_medio_comida', 'carta_publica_activa', 'created_at',
].join(', ')

export const SELECT_CLIENT_VINO_ADMIN = [
  'id', 'restaurante_id', 'nombre', 'bodega', 'tipo', 'region',
  'uva', 'anada', 'precio_botella', 'precio_copa', 'coste_compra',
  'stock', 'stock_minimo', 'proveedor', 'referencia_proveedor',
  'formato_compra', 'activo', 'notas_cata',
].join(', ')

export const SELECT_CLIENT_PLATO_ADMIN = [
  'id', 'restaurante_id', 'nombre', 'descripcion', 'categoria',
  'precio', 'activo', 'familias_aromaticas',
].join(', ')

export const SELECT_CLIENT_ESTADISTICA_ADMIN = [
  'id', 'restaurante_id', 'tipo', 'detalle', 'created_at',
].join(', ')

export const SELECT_CLIENT_PROPUESTA_ADMIN = [
  'id', 'restaurante_id', 'titulo', 'vino', 'tipo', 'zona',
  'proveedor_sugerido', 'coste_estimado', 'precio_recomendado',
  'margen_objetivo', 'plato_objetivo', 'motivo', 'prioridad',
  'estado', 'created_at', 'updated_at',
].join(', ')

export const SELECT_CLIENT_SELECCION_ESPECIAL_ADMIN = [
  'id', 'restaurante_id', 'vino_id', 'orden', 'nota_personal',
  'activo', 'created_at', 'vinos(nombre, bodega, tipo, region)',
].join(', ')

export const SELECT_CLIENT_RESTAURANTE_DASHBOARD = [
  'id', 'slug', 'nombre', 'email', 'ciudad',
  'color_acento', 'color_primario', 'color_fondo', 'tipografia',
  'logo_url', 'banner_url', 'banner_zoom', 'banner_x', 'banner_y',
  'carta_mostrar_euro', 'carta_copa_decimales', 'carta_pie_texto',
  'hub_activo', 'hub_titulo', 'hub_subtitulo', 'hub_fondo_url',
  'hub_fondo_zoom', 'hub_fondo_x', 'hub_fondo_y', 'hub_overlay',
  'hub_estilo', 'hub_mostrar_logo', 'hub_mostrar_nombre',
  'hub_mostrar_direccion', 'instagram_url', 'facebook_url',
  'camarero_pin_requerido', 'camarero_pin_bloqueo_activo',
  'carta_publica_activa', 'plan', 'subscription_status',
  'actividad_real_desde', 'trial_active_seconds_limit',
  'trial_expires_at', 'trial_started_at', 'ticket_medio_comida',
  'created_at',
].join(', ')

export const SELECT_CLIENT_VINO_DASHBOARD = [
  'id', 'restaurante_id', 'nombre', 'bodega', 'tipo', 'region',
  'uva', 'anada', 'precio_botella', 'precio_copa', 'coste_compra',
  'stock', 'stock_minimo', 'proveedor', 'referencia_proveedor',
  'formato_compra', 'notas_cata', 'activo', 'internacional',
].join(', ')

export const SELECT_CLIENT_PLATO_DASHBOARD = [
  'id', 'restaurante_id', 'nombre', 'descripcion', 'categoria',
  'precio', 'activo', 'familias_aromaticas',
].join(', ')

export const SELECT_CLIENT_ESTADISTICA_DASHBOARD = [
  'id', 'restaurante_id', 'tipo', 'detalle', 'created_at',
].join(', ')

export const SELECT_CLIENT_MOVIMIENTO_STOCK_DASHBOARD = [
  'id', 'restaurante_id', 'vino_id', 'tipo', 'cantidad',
  'stock_anterior', 'stock_nuevo', 'motivo', 'created_at',
  'vinos(nombre, bodega)',
].join(', ')
