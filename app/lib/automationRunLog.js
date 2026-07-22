function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

function ahoraIso() {
  return new Date().toISOString()
}

function objeto(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
}

function numero(valor) {
  return Number(valor) || 0
}

const SELECT_AUTOMATION_RUN_RECENT = [
  'id', 'job_key', 'job_type', 'status', 'started_at', 'duration_ms',
  'processed_count', 'success_count', 'error_count', 'skipped_count',
  'error_message',
].join(', ')

export async function iniciarAutomationRun({
  supabase,
  jobKey,
  jobType = 'api',
  triggerSource = null,
  restauranteId = null,
  idempotencyKey = null,
  metrics = {},
} = {}) {
  if (!supabase || !jobKey) return { id: null, startedMs: Date.now(), pending: 'automation_run_logs' }
  const startedMs = Date.now()
  const payload = {
    job_key: jobKey,
    job_type: jobType,
    trigger_source: triggerSource,
    restaurante_id: restauranteId || null,
    idempotency_key: idempotencyKey,
    status: 'running',
    started_at: ahoraIso(),
    metrics: objeto(metrics),
  }

  const { data, error } = await supabase
    .from('automation_run_logs')
    .insert(payload)
    .select('id, started_at')
    .single()

  if (error) {
    if (!esTablaNoExiste(error)) console.warn('[automation-run-log] inicio omitido:', error.message || error)
    return { id: null, startedMs, pending: 'automation_run_logs' }
  }

  return { id: data.id, startedAt: data.started_at, startedMs, pending: null }
}

export async function finalizarAutomationRun(run, {
  supabase,
  status = 'success',
  processedCount = 0,
  successCount = 0,
  errorCount = 0,
  skippedCount = 0,
  metrics = {},
  errorMessage = null,
} = {}) {
  if (!supabase || !run?.id) return { pending: run?.pending || 'automation_run_logs' }
  const durationMs = Math.max(0, Date.now() - (run.startedMs || Date.now()))
  const payload = {
    status,
    finished_at: ahoraIso(),
    duration_ms: durationMs,
    processed_count: numero(processedCount),
    success_count: numero(successCount),
    error_count: numero(errorCount),
    skipped_count: numero(skippedCount),
    metrics: objeto(metrics),
    error_message: errorMessage || null,
  }

  const { error } = await supabase
    .from('automation_run_logs')
    .update(payload)
    .eq('id', run.id)

  if (error) {
    if (!esTablaNoExiste(error)) console.warn('[automation-run-log] cierre omitido:', error.message || error)
    return { pending: 'automation_run_logs' }
  }

  return { pending: null }
}

export async function leerAutomationRunsRecientes({ supabase, dias = 7, limit = 120, jobKeys = [] } = {}) {
  if (!supabase) return { data: [], pending: 'automation_run_logs' }
  const desde = new Date(Date.now() - Math.max(1, Number(dias) || 7) * 24 * 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('automation_run_logs')
    .select(SELECT_AUTOMATION_RUN_RECENT)
    .gte('started_at', desde)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (jobKeys.length) query = query.in('job_key', jobKeys)

  const { data, error } = await query
  if (error) {
    if (esTablaNoExiste(error)) return { data: [], pending: 'automation_run_logs' }
    throw error
  }
  return { data: data || [], pending: null }
}

export function resumirAutomationRuns(rows = [], pending = null) {
  const resumen = {
    total: rows.length,
    success: rows.filter(row => row.status === 'success').length,
    partial: rows.filter(row => row.status === 'partial').length,
    failed: rows.filter(row => row.status === 'failed').length,
    running: rows.filter(row => row.status === 'running').length,
    skipped: rows.filter(row => row.status === 'skipped').length,
    processed: rows.reduce((sum, row) => sum + numero(row.processed_count), 0),
    errors: rows.reduce((sum, row) => sum + numero(row.error_count), 0),
    latest_at: rows[0]?.started_at || null,
  }

  const agrupados = new Map()
  for (const row of rows) {
    const actual = agrupados.get(row.job_key) || {
      job_key: row.job_key,
      total: 0,
      success: 0,
      partial: 0,
      failed: 0,
      running: 0,
      latest_at: row.started_at,
      latest_status: row.status,
      latest_error: row.error_message || null,
    }
    actual.total += 1
    actual[row.status] = numero(actual[row.status]) + 1
    if (!actual.latest_at || new Date(row.started_at) > new Date(actual.latest_at)) {
      actual.latest_at = row.started_at
      actual.latest_status = row.status
      actual.latest_error = row.error_message || null
    }
    agrupados.set(row.job_key, actual)
  }

  return {
    migration_pending: pending ? [pending] : [],
    resumen,
    por_job: [...agrupados.values()].sort((a, b) => new Date(b.latest_at || 0) - new Date(a.latest_at || 0)),
    recientes: rows.slice(0, 8).map(row => ({
      id: row.id,
      job_key: row.job_key,
      job_type: row.job_type,
      status: row.status,
      started_at: row.started_at,
      duration_ms: row.duration_ms,
      processed_count: row.processed_count,
      error_count: row.error_count,
      error_message: row.error_message,
    })),
  }
}
