const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) continue

    const key = match[1].trim()
    let value = match[2].trim()
    if (!key || process.env[key]) continue

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function isStrictOptional() {
  return ['1', 'true', 'yes'].includes(String(process.env.SUPABASE_SCHEMA_STRICT_OPTIONAL || '').toLowerCase())
}

const requiredChecks = [
  {
    label: 'restaurantes admin client',
    table: 'restaurantes',
    select: 'id, nombre, email, ciudad, slug, logo_url, color_primario, color_fondo, color_acento, tipografia, hub_activo, hub_titulo, hub_subtitulo, instagram_url, facebook_url, plan, subscription_status, trial_active_seconds_limit, trial_expires_at, trial_started_at, ticket_medio_comida, carta_publica_activa, created_at',
  },
  {
    label: 'vinos admin client',
    table: 'vinos',
    select: 'id, restaurante_id, nombre, bodega, tipo, region, uva, anada, precio_botella, precio_copa, coste_compra, stock, stock_minimo, proveedor, referencia_proveedor, formato_compra, activo, notas_cata',
  },
  {
    label: 'platos core',
    table: 'platos',
    select: 'id, restaurante_id, nombre, descripcion, categoria, precio, activo, familias_aromaticas',
  },
  {
    label: 'estadisticas base',
    table: 'estadisticas',
    select: 'id, restaurante_id, tipo, detalle, created_at',
  },
  {
    label: 'publication snapshots',
    table: 'publication_snapshots',
    select: 'id, restaurante_id, publication_event_id, version_number, contenido_resumen, restaurante_resumen, vinos_snapshot, platos_snapshot, actor_email, created_at',
  },
  {
    label: 'publication events',
    table: 'publication_events',
    select: 'id, restaurante_id, accion, estado_anterior, estado_nuevo, contenido_resumen, actor_email, created_at',
  },
  {
    label: 'consultor propuestas',
    table: 'consultor_propuestas',
    select: 'id, restaurante_id, titulo, vino, tipo, zona, proveedor_sugerido, coste_estimado, precio_recomendado, margen_objetivo, plato_objetivo, motivo, prioridad, estado, created_at, updated_at',
  },
  {
    label: 'seleccion especial admin client',
    table: 'seleccion_especial',
    select: 'id, restaurante_id, vino_id, orden, nota_personal, activo, created_at, vinos(nombre, bodega, tipo, region)',
  },
  {
    label: 'consultant diagnostics',
    table: 'consultant_diagnostics',
    select: 'id, restaurante_id, periodo_inicio, periodo_fin, score, prioridad, resumen_ejecutivo, estado_actual, problema_principal, quick_wins, medio_plazo, estrategico, problemas_detectados, created_at',
  },
  {
    label: 'opportunity snapshots',
    table: 'opportunity_snapshots',
    select: 'id, restaurante_id, periodo_inicio, periodo_fin, recuperacion_anual_estimada, impacto_acciones_rapidas, impacto_medio_plazo, impacto_estrategico, capital_liberable_estimado, confianza_media_pct, oportunidades_total, resumen, created_at',
  },
  {
    label: 'inventory snapshots',
    table: 'inventory_snapshots',
    select: 'id, restaurante_id, periodo_inicio, periodo_fin, referencias_activas, unidades_totales, valor_coste_total, valor_venta_total, stock_inmovilizado_refs, stock_inmovilizado_valor, referencias_lentas, exceso_stock_refs, proveedor_principal, proveedor_principal_pct, merma_unidades, tasa_merma_pct, created_at',
  },
  {
    label: 'wine list snapshots',
    table: 'wine_list_snapshots',
    select: 'id, restaurante_id, periodo_inicio, periodo_fin, referencias_total, referencias_con_venta, ventas_totales, pareto_top20_refs, pareto_top20_ventas_pct, bottom10_refs, productividad_media, huecos_precio, resumen_gamas, concentracion_tipos, concentracion_regiones, carta_inflada, motivo_principal, created_at',
  },
  {
    label: 'btg snapshots',
    table: 'btg_snapshots',
    select: 'id, restaurante_id, periodo_inicio, periodo_fin, referencias_activas, referencias_por_copa, cobertura_copa_pct, candidatos_copa, candidatos_copa_premium, candidatos_coravin, beneficio_potencial_estimado, motivo_principal, created_at',
  },
  {
    label: 'alerts',
    table: 'alerts',
    select: 'id, restaurante_id, entidad_tipo, entidad_id, severidad, clave, titulo, detalle, impacto, accion_sugerida, estado, periodo_inicio, periodo_fin, created_at, updated_at, resuelta_at, descartada_at, motivo_cierre, asignado_a, ultima_deteccion_at, veces_detectada',
  },
  {
    label: 'recommendations',
    table: 'recommendations',
    select: 'id, restaurante_id, entidad_tipo, entidad_id, tipo, titulo, detalle, accion, prioridad, esfuerzo, origen, estado, coeficientes, periodo_inicio, periodo_fin, created_at, updated_at',
  },
  {
    label: 'weekly summaries',
    table: 'weekly_executive_summaries',
    select: 'id, restaurante_id, periodo_key, periodo_inicio, periodo_fin, formula_version, titular, confianza, resumen, kpis, ganado, pendiente, decisiones, senales, copy_text, metadata, generated_by_email, generated_at, sent_at, sent_channel, delivery_status, delivery_channel, recipient_email, delivery_error, last_send_attempt_at, provider_message_id, created_at, updated_at',
  },
  {
    label: 'weekly preferences',
    table: 'weekly_summary_preferences',
    select: 'id, restaurante_id, enabled, channel, recipient_email, cc_email, send_day, send_hour, timezone, last_sent_at, last_error, created_at, updated_at',
  },
]

const driftChecks = [
  {
    label: 'restaurantes location enrichments',
    table: 'restaurantes',
    select: 'id, provincia, region',
    repair: 'supabase/repair_schema_drift_2026_07_22.sql',
  },
  {
    label: 'restaurantes legacy ticket aliases',
    table: 'restaurantes',
    select: 'id, ticket_medio, ticket_comida',
    repair: 'supabase/repair_schema_drift_2026_07_22.sql',
  },
  {
    label: 'pos import duplicate protection',
    table: 'pos_sale_lines',
    select: 'id, line_hash, duplicada, duplicate_of',
    repair: 'supabase/repair_schema_drift_2026_07_22.sql',
  },
  {
    label: 'pos import batch duplicate tracking',
    table: 'pos_import_batches',
    select: 'id, archivo_hash, duplicate_of, filas_duplicadas',
    repair: 'supabase/repair_schema_drift_2026_07_22.sql',
  },
]

async function runCheck(supabase, check) {
  const { error } = await supabase.from(check.table).select(check.select).limit(1)
  return { ...check, ok: !error, error }
}

function printResult(prefix, result) {
  if (result.ok) {
    console.log(`${prefix} OK ${result.label}`)
    return
  }

  const message = result.error?.message || 'Unknown schema error'
  const repair = result.repair ? ` Repair: ${result.repair}` : ''
  console.log(`${prefix} FAIL ${result.label}: ${message}${repair}`)
}

async function main() {
  loadEnvFile('.env.local')
  loadEnvFile('.env')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('Checking required Supabase schema...')
  const requiredResults = []
  for (const check of requiredChecks) {
    const result = await runCheck(supabase, check)
    requiredResults.push(result)
    printResult('REQ', result)
  }

  console.log('\nChecking known schema drift...')
  const driftResults = []
  for (const check of driftChecks) {
    const result = await runCheck(supabase, check)
    driftResults.push(result)
    printResult('DRIFT', result)
  }

  const requiredFailures = requiredResults.filter(result => !result.ok)
  const driftFailures = driftResults.filter(result => !result.ok)

  if (requiredFailures.length) {
    console.error(`\nSchema audit failed: ${requiredFailures.length} required check(s) failed.`)
    process.exit(1)
  }

  if (driftFailures.length) {
    console.warn(`\nSchema audit passed with ${driftFailures.length} drift warning(s). Apply supabase/repair_schema_drift_2026_07_22.sql to clear them.`)
    process.exit(isStrictOptional() ? 2 : 0)
  }

  console.log('\nSchema audit passed without drift warnings.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
