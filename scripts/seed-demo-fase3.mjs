#!/usr/bin/env node
/**
 * seed-demo-fase3.mjs — Fase 3 (v3)
 *
 * F3-B: partes_servicio + lineas 2026-10-15 a 2026-10-17 (mediodía + noche).
 *       INSERT directo con estado='cerrado' — sin llamar a cerrar_parte_servicio
 *       → no activa movimientos_stock (confirmado en b7a_partes_servicio.sql:
 *       no hay triggers automáticos; solo la RPC explícita mueve stock).
 * F3-A: estadisticas tipo='venta'|'escaneo'|'sommelier'|'recomendacion'|'evento_carta'.
 *       Derivado de partes_servicio_lineas reales (incluye F3-B en --confirm).
 *
 * ORDEN DE EJECUCIÓN: F3-B (partes) → F3-A (estadísticas).
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-demo-fase3.mjs           ← dry-run
 *   node --env-file=.env.local scripts/seed-demo-fase3.mjs --confirm ← escritura
 *   node scripts/seed-demo-fase3.mjs --selftest                      ← tests sin BD
 *
 * Convención de cantidad (auditada en camarero/[slug]/page.js:321-348 y
 *   salesPriority.js:66):
 *   detalle.cantidad = unidades brutas del formato vendido.
 *   → venta_copa:    sum(partes_servicio_lineas.copas_vendidas)
 *   → venta_botella: sum(partes_servicio_lineas.cantidad)
 *   priorizarVentas() los suma en bruto (unidadesKpi). Sin conversión copa→botella.
 *
 * Turno DB: 'mediodia' | 'noche' | 'unico'
 *   (auditado en app/api/partes/route.js:56 y b7a_partes_servicio.sql:22)
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const IS_SELFTEST = process.argv.includes('--selftest')
const DRY_RUN     = !process.argv.includes('--confirm') || IS_SELFTEST

const DEMO_ID = process.env.SEED_DEMO_ID
if (!IS_SELFTEST && !DEMO_ID) {
  console.error('ERROR: SEED_DEMO_ID no está definido')
  process.exit(1)
}

// ── Denylist ──────────────────────────────────────────────────────────────────
const UUID_DENYLIST = new Set([
  'a1000000-0000-4000-8000-000000000000',
  'b2000000-0000-4000-8000-000000000000',
  'c3000000-0000-4000-8000-000000000000',
  'e5000000-0000-4000-8000-000000000000',
])
if (!IS_SELFTEST && UUID_DENYLIST.has(DEMO_ID)) {
  console.error(`ERROR: SEED_DEMO_ID ${DEMO_ID} está en la denylist`)
  process.exit(1)
}
const NAME_DENYLIST = ['lo de carmen', 'araboka', 'la taberna', 'modo sumiller']

// ── Constantes de rate F3-A ───────────────────────────────────────────────────
const ESCANEOS_POR_PARTE         = 10    // escaneos absolutos por parte de servicio
const RATE_SOMMELIER_DE_ESCANEOS = 0.25  // consultas sommelier = fracción de escaneos
const RATE_RECOM_POR_SOMMELIER   = 1.8   // recomendaciones por consulta sommelier
const RATE_EVENTO_POR_ESCANEO    = 1.5   // eventos_carta por escaneo (total < 15000)
const MULT_VERANO                = 1.2   // factor estacional (abr-oct)
const MULT_FIN_SEMANA            = 1.4   // factor viernes-sábado-domingo

// ── Constantes F3-B ───────────────────────────────────────────────────────────
const F3B_FECHAS  = ['2026-10-15', '2026-10-16', '2026-10-17']
const F3B_TURNOS  = ['mediodia', 'noche']
const F3B_REF_SEMANAS = 8   // semanas de histórico para media

// ── Paginación ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 1000
const IN_CHUNK  = 100

// ── Helpers ───────────────────────────────────────────────────────────────────

// España: UTC+2 verano (abr-oct), UTC+1 invierno (nov-mar)
function esVerano(fechaStr) {
  const mes = parseInt(fechaStr.slice(5, 7), 10)
  return mes >= 4 && mes <= 10
}

// turnos: Set<'mediodia'|'noche'|'unico'>; → ISO timestamp con offset español
// Turno DB auditado: 'mediodia' | 'noche' | 'unico' (app/api/partes/route.js:56)
function turnoCreatedAt(fechaStr, turnos) {
  let hora
  if (turnos.has('noche') && !turnos.has('mediodia'))      hora = '21:30'
  else if (turnos.has('mediodia') && !turnos.has('noche')) hora = '14:30'
  else                                                      hora = '20:00'
  const tz = esVerano(fechaStr) ? '+02:00' : '+01:00'
  return `${fechaStr}T${hora}:00${tz}`
}

// ISO 8601 week: 'YYYY-Www'
function semanaISO(fechaStr) {
  const d = new Date(fechaStr)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// Lee todas las páginas de Supabase (límite natural: 1000 filas/página)
async function fetchAllPages(queryFn) {
  let offset = 0
  let all = []
  let pages = 0
  for (;;) {
    const { data, error } = await queryFn(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data || []
    all = all.concat(rows)
    pages++
    if (rows.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return { data: all, pages }
}

// Divide un array en trozos de tamaño máximo `size`
function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

// Mediana de un array numérico; null si vacío
function mediana(arr) {
  if (!arr || arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Devuelve las n fechas con el mismo día de semana, yendo atrás semana a semana
function fechasSemanaAnterior(fechaStr, n = 8) {
  const ms = new Date(fechaStr + 'T12:00:00Z').getTime()
  const semanas = []
  for (let i = 1; i <= n; i++) {
    semanas.push(new Date(ms - i * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10))
  }
  return semanas
}

// ── Selftest ──────────────────────────────────────────────────────────────────
async function runSelftest() {
  console.log('\n── SELFTEST F3-A v3 (sin BD) ──────────────────────────────────')
  let extraFailed = 0
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
  const srcLines = src.split('\n')

  // (a) actividad_real_desde: el código lo verifica y aborta si es null/tardío
  {
    const hasGuard = src.includes('actividad_real_desde') && /process\.exit\(1\)/.test(src)
    if (!hasGuard) {
      console.log('  ✗ (a) guard actividad_real_desde + process.exit(1) no encontrado')
      extraFailed++
    } else {
      console.log('  (a) actividad_real_desde guard presente: ✓')
    }
  }

  // (b) convención copa: usa copas_vendidas (no cantidad) para venta_copa
  {
    const colCopas  = ['copas', '_vendidas'].join('')
    const tipoVCopa = ['venta', '_copa'].join('')
    if (!src.includes(colCopas) || !src.includes(tipoVCopa)) {
      console.log(`  ✗ (b) no encuentra '${colCopas}' o '${tipoVCopa}' en código`)
      extraFailed++
    } else {
      console.log(`  (b) convención ${colCopas} para ${tipoVCopa}: ✓`)
    }
  }

  // (c) fuente siempre 'sala', nunca 'tpv' en detalle insertado
  {
    const hasSala = /fuente:\s*['"]sala['"]/.test(src)
    const badFuente  = ['fuente', ":'tpv'"].join('')
    const badFuente2 = ['fuente', ':"tpv"'].join('')
    const hasTpv = src.includes(badFuente) || src.includes(badFuente2)
    if (!hasSala) {
      console.log("  ✗ (c) no encuentra fuente:'sala' en código")
      extraFailed++
    } else if (hasTpv) {
      console.log(`  ✗ (c) hay ${badFuente} en código (prohibido)`)
      extraFailed++
    } else {
      console.log("  (c) fuente:'sala' siempre, sin 'tpv': ✓")
    }
  }

  // (d) idempotencia: .delete() sobre estadisticas antes de insertar
  {
    const hasDelete = /\.delete\(\)/.test(src)
    const hasTabla  = /['"]estadisticas['"]/.test(src)
    if (!hasDelete || !hasTabla) {
      console.log('  ✗ (d) no hay .delete() sobre estadisticas (falta idempotencia)')
      extraFailed++
    } else {
      console.log('  (d) delete + insert idempotente sobre estadisticas: ✓')
    }
  }

  // (e) no-use-before-define para vars críticas declaradas con const
  {
    const checkVars = ['aggMap', 'estadisticasVentaRows']
    let eFailed = 0
    for (const v of checkVars) {
      const declRe = new RegExp(`^\\s+const ${v}\\s*[=\\[]`)
      const useRe  = new RegExp(`\\b${v}\\b`)
      const declIdx = srcLines.findIndex(l => declRe.test(l))
      if (declIdx < 0) { console.log(`  (e) '${v}' no es const o no se encuentra — skip`); continue }
      const earlyUse = srcLines.slice(0, declIdx).findIndex(l => {
        const stripped = l.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '§')
        return useRe.test(stripped) && !declRe.test(l)
      })
      if (earlyUse >= 0) {
        console.log(`  ✗ (e) TDZ '${v}': primer uso línea ${earlyUse + 1}, declarado en ${declIdx + 1}`)
        eFailed++
      } else {
        console.log(`  (e) no-use-before-define '${v}' (decl. línea ${declIdx + 1}): ✓`)
      }
    }
    if (eFailed > 0) extraFailed += eFailed
  }

  // (f) helpers: esVerano / turnoCreatedAt (con turno DB) / semanaISO
  {
    const novOk = esVerano('2025-11-15') === false
    const junOk = esVerano('2026-06-01') === true
    const octOk = esVerano('2025-10-31') === true
    // turnoCreatedAt usa 'noche'/'mediodia' (turno DB auditado)
    const tsOk  = turnoCreatedAt('2025-10-05', new Set(['noche']))    === '2025-10-05T21:30:00+02:00'
    const ts2Ok = turnoCreatedAt('2025-11-10', new Set(['mediodia'])) === '2025-11-10T14:30:00+01:00'
    const ts3Ok = turnoCreatedAt('2026-03-01', new Set(['mediodia', 'noche'])) === '2026-03-01T20:00:00+01:00'
    const swOk  = semanaISO('2025-10-06') === '2025-W41'
    if (!novOk || !junOk || !octOk || !tsOk || !ts2Ok || !ts3Ok || !swOk) {
      console.log(`  ✗ (f) helpers: esVerano=${novOk&&junOk&&octOk} ts=${tsOk} ts2=${ts2Ok} ts3=${ts3Ok} sem=${swOk}`)
      extraFailed++
    } else {
      console.log('  (f) helpers esVerano/turnoCreatedAt/semanaISO: ✓')
    }
  }

  // (g) delete chain: cada .delete() en código real tiene .eq('restaurante_id',) en ≤6 líneas siguientes
  // Codificado: ['delete', '()'].join('') para que este propio código no se automatchee
  {
    const delMethod = ['.delete', '()'].join('')
    let gFailed = 0
    srcLines.forEach((l, i) => {
      if (!l.includes(delMethod)) return
      // Saltar comentarios
      if (l.trim().startsWith('//')) return
      // Saltar ocurrencias dentro de strings/regex (strip: quitar strings y comentarios inline)
      const stripped = l
        .replace(/\/\/.*$/, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, '§')
        .replace(/"(?:[^"\\]|\\.)*"/g, '§')
      if (!stripped.includes(delMethod)) return
      const chain = srcLines.slice(i, i + 7).join('\n')
      if (!/\.eq\(['"]restaurante_id['"]/.test(chain)) {
        console.log(`  ✗ (g) ${delMethod} línea ${i + 1} sin .eq('restaurante_id',) en la cadena`)
        gFailed++
      }
    })
    if (gFailed === 0) console.log(`  (g) todas las cadenas ${delMethod} con restaurante_id: ✓`)
    else extraFailed += gFailed
  }

  // (h) paginación: fetchAllPages definida y partes_servicio_lineas solo en lecturas paginadas
  {
    const hasFetchAllPages = /async function fetchAllPages/.test(src)
    // Codificado: para que la línea de check no se automatchee
    const tablaLineas = ['partes', '_servicio', '_lineas'].join('')
    // Lecturas = líneas con from('...') hacia esa tabla (excluir inserts y comentarios)
    const badReads = srcLines.filter((l, i) => {
      if (!l.includes(`'${tablaLineas}'`)) return false
      if (l.trim().startsWith('//')) return false
      if (l.includes('tablaLineas')) return false
      // Excluir operaciones INSERT (la siguiente línea tiene .insert()
      const next3 = srcLines.slice(i, i + 4).join('\n')
      if (next3.includes('.insert(')) return false
      // Debe estar precedida de fetchAllPages en las 5 líneas anteriores
      const ctx = srcLines.slice(Math.max(0, i - 5), i + 1).join('\n')
      return !ctx.includes('fetchAllPages')
    })
    if (!hasFetchAllPages) {
      console.log('  ✗ (h) fetchAllPages no está definida')
      extraFailed++
    } else if (badReads.length > 0) {
      console.log(`  ✗ (h) ${badReads.length} lectura(s) de ${tablaLineas} sin fetchAllPages`)
      extraFailed++
    } else {
      console.log(`  (h) paginación: fetchAllPages definida + ${tablaLineas} paginada: ✓`)
    }
  }

  // (i) variable de entorno: NEXT_PUBLIC_SUPABASE_URL, nunca process.env.SUPABASE_URL suelto
  {
    const correctVar = ['NEXT_PUBLIC', '_SUPABASE_URL'].join('')
    const badEnvRef  = ['process.env.SUPABASE', '_URL'].join('')
    // Excluir líneas del propio selftest (que declaran estas variables)
    const realLines  = srcLines.filter(l => !l.includes('correctVar') && !l.includes('badEnvRef'))
    const hasCorrect = src.includes(correctVar)
    const hasBad     = realLines.some(l => {
      const stripped = l.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '§')
      return stripped.includes(badEnvRef)
    })
    if (!hasCorrect) {
      console.log(`  ✗ (i) ${correctVar} no aparece en el código`)
      extraFailed++
    } else if (hasBad) {
      console.log(`  ✗ (i) ${badEnvRef} encontrado sin prefijo NEXT_PUBLIC_ (variable incorrecta)`)
      extraFailed++
    } else {
      console.log(`  (i) variable de entorno ${correctVar} correcta: ✓`)
    }
  }

  const total  = 9
  const passed = total - Math.min(extraFailed, total)
  console.log(`\n  ${passed}/${total} checks pasados`)
  if (extraFailed === 0) console.log('  ✓ Todos los casos superados.')
  else console.log(`  FALLOS: ${extraFailed}`)
  process.exit(extraFailed > 0 ? 1 : 0)
}

if (IS_SELFTEST) { await runSelftest(); process.exit(0) }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPA_URL) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL no está definido')
    process.exit(1)
  }
  if (!SUPA_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY no está definido')
    process.exit(1)
  }

  const sb   = createClient(SUPA_URL, SUPA_KEY)
  const mode = DRY_RUN ? '[DRY-RUN]' : '[CONFIRM]'
  console.log(`\n${mode} seed-demo-fase3 v3  DEMO_ID=${DEMO_ID}\n`)

  // ── Paso 0: restaurante ──────────────────────────────────────────────────────
  const { data: rest, error: restErr } = await sb
    .from('restaurantes')
    .select('id, nombre, plan, subscription_status, actividad_real_desde, camarero_pin_bloqueo_activo')
    .eq('id', DEMO_ID)
    .single()
  if (restErr || !rest) {
    console.error(`ERROR: no se pudo leer restaurante ${DEMO_ID}: ${restErr?.message}`)
    process.exit(1)
  }
  for (const denied of NAME_DENYLIST) {
    if ((rest.nombre || '').toLowerCase().includes(denied)) {
      console.error(`ERROR: restaurante "${rest.nombre}" está en la denylist`)
      process.exit(1)
    }
  }
  console.log(`  restaurante:              "${rest.nombre}"`)
  console.log(`  actividad_real_desde:     ${rest.actividad_real_desde ?? 'NULL'}`)
  console.log(`  plan:                     ${rest.plan}`)
  console.log(`  camarero_pin_bloqueo:     ${rest.camarero_pin_bloqueo_activo}`)

  if (!rest.actividad_real_desde) {
    console.error('ERROR: actividad_real_desde es NULL — Rentabilidad nunca cargará estadísticas')
    console.error('       (MenuEngineeringClient.js:147 → if (desdeActividad) { ... })')
    process.exit(1)
  }
  if (new Date(rest.actividad_real_desde) > new Date('2025-10-01T00:00:00Z')) {
    console.error(`ERROR: actividad_real_desde ${rest.actividad_real_desde} es posterior a 2025-10-01`)
    process.exit(1)
  }
  console.log('  [OK] actividad_real_desde ≤ 2025-10-01\n')

  // ── Paso 0 — Audits (0.1–0.6, solo código, sin semillas) ────────────────────
  console.log('── AUDITS PASO 0 ────────────────────────────────────────────────────')
  console.log('  0.1 Formas de detalle por tipo en estadisticas:')
  console.log('      escaneo      → { destino:"carta"|"hub", experiencia_id:null|uuid }')
  console.log('        Fuente: app/carta/[slug]/page.js:878, app/r/[slug]/page.js:77')
  console.log('        Tipo público — sin sala_token (TIPOS_PUBLICOS, estadisticas/route.js:8)')
  console.log('      sommelier    → { origen:"cliente", modo:"mesa"|"quiz"|"vino",')
  console.log('        modo_armonia:"por_platos"|"recomendame"|"ya_tengo_vino",')
  console.log('        consulta:str, platos:[{id,nombre}]?, perfil_quiz?:{tipo,estilo,comida,precio} }')
  console.log('        Fuente: app/api/maridaje/route.js:78 (detalleSommelierArmonia)')
  console.log('        Requiere sala_token')
  console.log('      recomendacion→ { origen:"cliente", modo:str, modo_armonia:str,')
  console.log('        consulta:str, plato_ids:[uuid], vino_id:uuid, vino:str,')
  console.log('        posicion:int, precio:float }')
  console.log('        Fuente: app/api/maridaje/route.js:879')
  console.log('        Requiere sala_token')
  console.log('      evento_carta → { evento:"armonia_bubble_click"|"armonia_modo_XXX"|... }')
  console.log('        Fuente: app/carta/[slug]/page.js:660 (trackArmoniaEvento)')
  console.log('        Tipo público — sin sala_token')
  console.log('      venta        → { resultado:"vendida", vino_id, vino, cantidad, fuente:"sala" }')
  console.log('        Semilla: F3-A en este script')
  console.log()
  console.log('  0.3 Triggers SQL en partes_servicio / partes_servicio_lineas:')
  console.log('      ✓ NO hay triggers automáticos (auditado en supabase/b7a_partes_servicio.sql)')
  console.log('      Stock solo se mueve via RPC cerrar_parte_servicio (llamada explícita)')
  console.log('      cerrar_parte_servicio:')
  console.log('        venta_copa/invitacion_copa  → v_delta=0 (sin descuento de botella)')
  console.log('        venta_botella               → v_delta=-(cantidad) (descuenta stock)')
  console.log('        fuente_ventas="tpv"         → bloquea cerrar si hay líneas de venta')
  console.log('        fuente_ventas="ambas"       → omite líneas de venta (sin movimiento)')
  console.log('      F3-B: INSERT directo con estado="cerrado" sin llamar a la RPC')
  console.log('        → CERO movimientos_stock. Seguro.')
  console.log()
  console.log('  0.4 Cálculo mes abierto en Sala/Explotación:')
  console.log('      agregarPeriodoBodega (app/lib/agregarPeriodoBodega.js) lee:')
  console.log('        partes_servicio WHERE estado="cerrado" AND fecha BETWEEN desde AND hasta')
  console.log('      NO usa historico_mensual. El cálculo es LIVE desde partes cerrados.')
  console.log('      F3-B partes (cerrados por INSERT directo) APARECERÁN en Explotación oct-26.')
  console.log()

  const esPerfilBodega = rest.plan === 'bodega'
  console.log('  0.5 esPerfilBodega (app/lib/plans.js:103):')
  console.log(`      planRestaurante(rest) = '${rest.plan}'`)
  console.log(`      esPerfilBodega = ${esPerfilBodega}`)
  if (!esPerfilBodega) {
    console.log('      ⚠  plan !== "bodega" → Cola TPV (/dashboard/tpv/cola) BLOQUEADA')
    console.log('         (app/dashboard/tpv/cola/page.js:136 usa esPerfilBodega)')
    console.log('         → Si se quiere ver Cola TPV, cambiar plan a "bodega" en seed-demo-fase2.mjs')
  } else {
    console.log('      ✓ Cola TPV y Mapa Sumiller accesibles')
  }
  console.log()
  console.log('  0.6 Camarero PIN (app/api/camarero/sesion/route.js:82):')
  console.log(`      camarero_pin_bloqueo_activo = ${rest.camarero_pin_bloqueo_activo}`)
  if (rest.camarero_pin_bloqueo_activo !== true) {
    console.log('      ✓ PIN no requerido (línea 82: "if (!pinValido && …!== true) pinValido = true")')
    console.log('      → Cualquier llamada POST /api/camarero/sesion sin PIN obtiene sala_token')
  } else {
    console.log('      PIN activo — se valida via RPC verificar_pin_camarero')
  }
  console.log()

  // ── Leer partes existentes (paginado) ────────────────────────────────────────
  console.log('── LECTURA PARTES ───────────────────────────────────────────────────')
  const { data: partes, pages: partesPaginas } = await fetchAllPages(
    (lo, hi) => sb
      .from('partes_servicio')
      .select('id, fecha, turno, estado')
      .eq('restaurante_id', DEMO_ID)
      .range(lo, hi)
  )
  console.log(`  partes_servicio: ${partes.length} filas en ${partesPaginas} página(s)`)

  const cerrados  = partes.filter(p => p.estado === 'cerrado')
  const borradores = partes.filter(p => p.estado !== 'cerrado').length
  console.log(`  Cerrados: ${cerrados.length}  |  No cerrados: ${borradores}`)

  const parteMap = Object.fromEntries(partes.map(p => [p.id, p]))
  const parteIds = cerrados.map(p => p.id)

  if (parteIds.length === 0) {
    console.log('  Sin partes cerrados. F3-A y F3-B no tienen datos base.')
    return
  }

  // ── F3-B: calcular media 8 semanas para Thu/Fri/Sat ─────────────────────────
  console.log('\n── F3-B: PARTES 2026-10-15 A 2026-10-17 ────────────────────────────')
  const refFechasSet = new Set(
    F3B_FECHAS.flatMap(f => fechasSemanaAnterior(f, F3B_REF_SEMANAS))
  )
  const refParteIds = cerrados
    .filter(p => refFechasSet.has(p.fecha))
    .map(p => p.id)

  console.log(`  Fechas de referencia (8 semanas atrás por día): ${refFechasSet.size}`)
  console.log(`  Partes cerrados de referencia: ${refParteIds.length}`)

  // Leer lineas de los partes de referencia (paginado + chunks de 100 ids)
  const refLineas = []
  for (const chunk of chunkArray(refParteIds, IN_CHUNK)) {
    const { data: chunkData, pages: pgs } = await fetchAllPages(
      (lo, hi) => sb
        .from('partes_servicio_lineas')
        .select('parte_id, vino_id, tipo, cantidad, copas_vendidas, precio_unitario, vino:vinos(id, nombre, precio_botella, precio_copa)')
        .in('parte_id', chunk)
        .range(lo, hi)
    )
    refLineas.push(...chunkData)
    if (pgs > 1) console.log(`    chunk ${chunk.length} ids → ${chunkData.length} filas en ${pgs} páginas`)
  }
  console.log(`  Líneas de referencia leídas: ${refLineas.length}`)

  // Calcular medias por vino+tipo para las F3B_FECHAS
  const refTotals      = {}  // key: `${vino_id}|${tipo}` → total cantidad
  const refDates       = {}  // key → Set<fecha>
  const refVinos       = {}  // key → vino info
  const precios8SemMap = {}  // key → [precio_unitario de 8 semanas, ...]
  for (const l of refLineas) {
    const parte = parteMap[l.parte_id]
    if (!parte?.fecha || !l.vino_id) continue
    const key = `${l.vino_id}|${l.tipo}`
    const uds = l.tipo === 'venta_copa'
      ? Math.max(0, Number(l.copas_vendidas) || 0)
      : Math.max(0, Number(l.cantidad) || 0)
    refTotals[key]  = (refTotals[key] || 0) + uds
    if (!refDates[key]) refDates[key] = new Set()
    refDates[key].add(parte.fecha)
    if (!refVinos[key]) refVinos[key] = l.vino
    if (l.precio_unitario != null) {
      if (!precios8SemMap[key]) precios8SemMap[key] = []
      precios8SemMap[key].push(Number(l.precio_unitario))
    }
  }

  // Media por fecha (sobre fechas de referencia únicas)
  const refAvg = {}
  for (const [key, total] of Object.entries(refTotals)) {
    const nDates = refDates[key]?.size || 1
    refAvg[key] = { avg: total / nDates, vino: refVinos[key] }
  }

  // Fallback all-time: para claves sin precio_unitario en las 8 semanas de referencia
  const keysNeedAllTime = Object.keys(refAvg).filter(k => !precios8SemMap[k]?.length)
  const preciosAllTimeMap = {}
  if (keysNeedAllTime.length > 0) {
    const vinoIdsNeed = [...new Set(keysNeedAllTime.map(k => k.split('|')[0]))]
    const allTimeLineas = []
    for (const chunk of chunkArray(vinoIdsNeed, IN_CHUNK)) {
      const { data: atChunk } = await fetchAllPages(
        (lo, hi) => sb
          .from('partes_servicio_lineas')
          .select('vino_id, tipo, precio_unitario')
          .eq('restaurante_id', DEMO_ID)
          .in('vino_id', chunk)
          .not('precio_unitario', 'is', null)
          .range(lo, hi)
      )
      allTimeLineas.push(...(atChunk || []))
    }
    for (const l of allTimeLineas) {
      const key = `${l.vino_id}|${l.tipo}`
      if (!preciosAllTimeMap[key]) preciosAllTimeMap[key] = []
      preciosAllTimeMap[key].push(Number(l.precio_unitario))
    }
    console.log(`  Fallback all-time: ${vinoIdsNeed.length} vinos → ${allTimeLineas.length} líneas`)
  }

  // Construir mapa de precios con cadena: 8-sem → historico → carta-pvp
  const precioResultMap   = {}
  const avisoSinHistorico = []
  for (const key of Object.keys(refAvg)) {
    const [, tipo]  = key.split('|')
    const vinoData  = refVinos[key]
    const pvpActual = tipo === 'venta_copa'
      ? Number(vinoData?.precio_copa   || 0) || null
      : Number(vinoData?.precio_botella || 0) || null
    const med8 = mediana(precios8SemMap[key] || [])
    if (med8 != null) {
      precioResultMap[key] = { precio: med8,      origen: '8-sem',    pvp: pvpActual, nombre: vinoData?.nombre || '?' }
    } else {
      const medAll = mediana(preciosAllTimeMap[key] || [])
      if (medAll != null) {
        precioResultMap[key] = { precio: medAll,    origen: 'historico', pvp: pvpActual, nombre: vinoData?.nombre || '?' }
      } else {
        precioResultMap[key] = { precio: pvpActual, origen: 'carta-pvp', pvp: pvpActual, nombre: vinoData?.nombre || '?' }
        avisoSinHistorico.push(vinoData?.nombre || key.split('|')[0])
      }
    }
  }

  // Tabla de precios (visible siempre, también en dry-run)
  console.log('\n  Precios F3-B (mediana precio_unitario):')
  if (Object.keys(precioResultMap).length > 0) {
    console.log(`  ${'Vino'.padEnd(32)} ${'tipo'.padEnd(14)} ${'precio_usado'.padStart(13)} ${'PVP_actual'.padStart(11)} ${'origen'.padStart(10)}`)
    console.log('  ' + '─'.repeat(82))
    for (const [key, info] of Object.entries(precioResultMap).slice(0, 25)) {
      const [, tipo] = key.split('|')
      const nombre   = (info.nombre || '?').slice(0, 32)
      const precio   = info.precio != null ? `${Number(info.precio).toFixed(2)} €` : '—'
      const pvpStr   = info.pvp    != null ? `${Number(info.pvp).toFixed(2)} €`    : '—'
      console.log(`  ${nombre.padEnd(32)} ${tipo.padEnd(14)} ${precio.padStart(13)} ${pvpStr.padStart(11)} ${info.origen.padStart(10)}`)
    }
    if (Object.keys(precioResultMap).length > 25) {
      console.log(`  ... (${Object.keys(precioResultMap).length - 25} filas más)`)
    }
  }
  if (avisoSinHistorico.length > 0) {
    console.log(`\n  ⚠ Sin historial de precio (usando PVP carta): ${avisoSinHistorico.join(', ')}`)
  }

  // F3-B líneas a insertar por parte: top vinos con avg ≥ 0.1
  const f3bLineaTemplate = Object.entries(refAvg)
    .filter(([, v]) => v.avg >= 0.1)
    .map(([key, v]) => {
      const [vinoId, tipo] = key.split('|')
      const cantidad = Math.max(1, Math.round(v.avg))
      const info     = precioResultMap[key]
      return {
        vino_id:         vinoId,
        tipo,
        cantidad,
        copas_vendidas:  tipo === 'venta_copa' ? cantidad : null,
        precio_unitario: info?.precio ?? null,
        nombre:          info?.nombre || '?',
      }
    })
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 20)

  // F3-B dry-run: tabla comparativa
  const f3bTotalLineas = F3B_FECHAS.length * F3B_TURNOS.length * f3bLineaTemplate.length
  const f3bIngresos = f3bLineaTemplate.reduce((s, l) => {
    return s + (l.precio_unitario || 0) * l.cantidad
  }, 0)
  console.log(`\n  F3-B: ${F3B_FECHAS.length} fechas × ${F3B_TURNOS.length} turnos × ${f3bLineaTemplate.length} SKUs`)
  console.log(`  Total líneas F3-B: ${f3bTotalLineas}  |  Ingresos estimados/parte: ${f3bIngresos.toFixed(2)} €`)
  console.log(`\n  Fecha       Día     Partes ref  Avg líneas/turno`)
  console.log('  ' + '─'.repeat(48))
  for (const fecha of F3B_FECHAS) {
    const diaSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][
      new Date(fecha + 'T12:00:00Z').getUTCDay()
    ]
    const refPartesFecha = cerrados.filter(p => refFechasSet.has(p.fecha)).length
    console.log(`  ${fecha}  ${diaSemana}  ref=${refPartesFecha.toString().padStart(4)}        ${f3bLineaTemplate.length} SKUs/turno`)
  }

  if (f3bLineaTemplate.length === 0) {
    console.log('\n  ⚠ Sin histórico de vinos — F3-B omitida (no hay lineas de referencia)')
  }

  // ── F3-B escritura ───────────────────────────────────────────────────────────
  const f3bPartesInsertados = []
  if (!DRY_RUN && f3bLineaTemplate.length > 0) {
    console.log('\n  Borrando partes F3-B existentes (ON DELETE CASCADE borra sus líneas)...')
    const { error: delPartesErr } = await sb
      .from('partes_servicio')
      .delete()
      .eq('restaurante_id', DEMO_ID)
      .in('fecha', F3B_FECHAS)
    if (delPartesErr) throw new Error(`F3-B delete partes: ${delPartesErr.message}`)

    console.log('  Insertando partes_servicio (cerrado, sin llamar a RPC cerrar)...')
    for (const fecha of F3B_FECHAS) {
      for (const turno of F3B_TURNOS) {
        const { data: parte, error: insParteErr } = await sb
          .from('partes_servicio')
          .insert({
            restaurante_id: DEMO_ID,
            fecha,
            turno,
            estado:     'cerrado',
            cerrado_at: new Date(turnoCreatedAt(fecha, new Set([turno]))).toISOString(),
          })
          .select('id, fecha, turno')
          .single()
        if (insParteErr) throw new Error(`F3-B insert parte ${fecha}/${turno}: ${insParteErr.message}`)
        f3bPartesInsertados.push(parte)
        // Añadir a parteMap para que F3-A los incluya
        parteMap[parte.id] = parte
        parteIds.push(parte.id)
      }
    }
    console.log(`  ✓ ${f3bPartesInsertados.length} partes insertados`)

    console.log('  Insertando partes_servicio_lineas F3-B...')
    let lineasF3bInsertadas = 0
    for (const parte of f3bPartesInsertados) {
      const lineas = f3bLineaTemplate.map(tpl => ({
        parte_id:        parte.id,
        restaurante_id:  DEMO_ID,
        vino_id:         tpl.vino_id,
        tipo:            tpl.tipo,
        cantidad:        tpl.tipo === 'venta_copa' ? 1 : tpl.cantidad,
        copas_vendidas:  tpl.tipo === 'venta_copa' ? tpl.cantidad : null,
        precio_unitario: tpl.precio_unitario,
      }))
      const LCHUNK = 50
      for (let i = 0; i < lineas.length; i += LCHUNK) {
        const { error: insLinErr } = await sb
          .from('partes_servicio_lineas')
          .insert(lineas.slice(i, i + LCHUNK))
        if (insLinErr) throw new Error(`F3-B insert lineas parte ${parte.id}: ${insLinErr.message}`)
      }
      lineasF3bInsertadas += lineas.length
    }
    console.log(`  ✓ ${lineasF3bInsertadas} líneas insertadas (${f3bPartesInsertados.length} partes × ${f3bLineaTemplate.length} SKUs)`)
  } else if (DRY_RUN) {
    console.log('\n  [DRY-RUN] F3-B no escribe. --confirm para aplicar.')
  }

  // ── F3-A: leer lineas de TODOS los partes cerrados (paginado + chunks) ───────
  console.log('\n── F3-A: ESTADISTICAS ────────────────────────────────────────────────')

  // En --confirm, parteIds ya incluye los F3-B insertados
  const allParteIds = Object.values(parteMap)
    .filter(p => p.estado === 'cerrado')
    .map(p => p.id)

  const allLineas = []
  let totalLineasPaginas = 0
  for (const chunk of chunkArray(allParteIds, IN_CHUNK)) {
    const { data: chunkData, pages: pgs } = await fetchAllPages(
      (lo, hi) => sb
        .from('partes_servicio_lineas')
        .select('parte_id, vino_id, tipo, cantidad, copas_vendidas, vino:vinos(id, nombre)')
        .in('parte_id', chunk)
        .in('tipo', ['venta_botella', 'venta_copa'])
        .range(lo, hi)
    )
    allLineas.push(...chunkData)
    totalLineasPaginas += pgs
  }
  console.log(`  partes_servicio_lineas (venta): ${allLineas.length} filas en ${totalLineasPaginas} página(s)`)

  // Agregar por (fecha, vino_id)
  const aggMap = {}  // key: `${fecha}|${vinoId}`
  for (const l of allLineas) {
    const parte = parteMap[l.parte_id]
    if (!parte?.fecha || !l.vino_id) continue
    const key = `${parte.fecha}|${l.vino_id}`
    if (!aggMap[key]) {
      aggMap[key] = {
        fecha:    parte.fecha,
        vinoId:   l.vino_id,
        nombre:   l.vino?.nombre || '?',
        cantidad: 0,
        turnos:   new Set(),
      }
    }
    const uds = l.tipo === 'venta_copa'
      ? Math.max(0, Number(l.copas_vendidas) || 0)
      : Math.max(0, Number(l.cantidad) || 0)
    aggMap[key].cantidad += uds
    if (parte.turno) aggMap[key].turnos.add(parte.turno)
  }

  let filasVenta    = Object.values(aggMap).filter(r => r.cantidad > 0)
  let granularidad  = 'día'
  const LIMITE_DIARIO = 10000

  if (filasVenta.length > LIMITE_DIARIO) {
    granularidad = 'semana'
    const aggSem = {}
    for (const r of filasVenta) {
      const sem = semanaISO(r.fecha)
      const key = `${sem}|${r.vinoId}`
      if (!aggSem[key]) aggSem[key] = { fecha: r.fecha, vinoId: r.vinoId, nombre: r.nombre, cantidad: 0, turnos: new Set(['noche']) }
      aggSem[key].cantidad += r.cantidad
      if (r.fecha > aggSem[key].fecha) aggSem[key].fecha = r.fecha
    }
    filasVenta = Object.values(aggSem).filter(r => r.cantidad > 0)
    console.log(`  ⚠ Superado límite diario (${LIMITE_DIARIO}): granularidad → semana → ${filasVenta.length} filas`)
  } else {
    console.log(`  Granularidad: ${granularidad} — ${filasVenta.length} filas (límite ${LIMITE_DIARIO})`)
  }

  const estadisticasVentaRows = filasVenta.map(r => ({
    restaurante_id: DEMO_ID,
    tipo:           'venta',
    created_at:     turnoCreatedAt(r.fecha, r.turnos),
    detalle:        JSON.stringify({
      resultado: 'vendida',
      vino_id:   r.vinoId,
      vino:      r.nombre,
      cantidad:  r.cantidad,
      fuente:    'sala',
    }),
  }))

  // ── F3-A extended: escaneo / sommelier / recomendacion / evento_carta ────────
  const { data: vinosActivos } = await sb
    .from('vinos')
    .select('id, nombre, precio_botella, precio_copa, por_copa')
    .eq('restaurante_id', DEMO_ID)
    .eq('activo', true)

  const { data: platosActivos } = await sb
    .from('platos')
    .select('id, nombre')
    .eq('restaurante_id', DEMO_ID)
    .eq('activo', true)

  const vinosList  = (vinosActivos || []).filter(v => v.id)
  const platosList = (platosActivos || []).filter(p => p.id)

  // Top vinos por volumen de venta (de aggMap)
  const volPorVino = {}
  for (const r of filasVenta) {
    volPorVino[r.vinoId] = (volPorVino[r.vinoId] || 0) + r.cantidad
  }
  const topVinos = [...vinosList]
    .sort((a, b) => (volPorVino[b.id] || 0) - (volPorVino[a.id] || 0))
    .slice(0, 15)

  // Por fecha: cuántos partes hubo
  const partesEnFecha = {}
  for (const p of Object.values(parteMap)) {
    if (p.estado !== 'cerrado') continue
    if (!partesEnFecha[p.fecha]) partesEnFecha[p.fecha] = []
    partesEnFecha[p.fecha].push(p)
  }
  const fechasConPartes = Object.keys(partesEnFecha).sort()

  const escaneoRows       = []
  const sommelierRows     = []
  const recomendacionRows = []
  const eventoCartaRows   = []

  const EVENTOS_ARMONIA = [
    'armonia_bubble_click', 'armonia_modo_por_platos',
    'armonia_modo_recomendame', 'armonia_modo_ya_tengo_vino',
  ]
  const MODOS_ARMONIA = ['por_platos', 'recomendame', 'ya_tengo_vino']

  let sommelierAccum = 0  // para asignar recomendaciones

  for (const fecha of fechasConPartes) {
    const diasPartes  = partesEnFecha[fecha]
    const nPartes     = diasPartes.length
    const dw          = new Date(fecha + 'T12:00:00Z').getUTCDay()
    const isWeekend   = dw === 0 || dw === 5 || dw === 6
    const multFin     = isWeekend  ? MULT_FIN_SEMANA : 1.0
    const multEst     = esVerano(fecha) ? MULT_VERANO  : 1.0
    const turnosSet   = new Set(diasPartes.map(p => p.turno))

    const nEscaneos  = Math.round(ESCANEOS_POR_PARTE * nPartes * multFin * multEst)
    const nSommelier = Math.round(RATE_SOMMELIER_DE_ESCANEOS * nEscaneos)
    const nEvento    = Math.round(RATE_EVENTO_POR_ESCANEO    * nEscaneos)

    const tsBase = turnoCreatedAt(fecha, turnosSet)

    // escaneos
    for (let i = 0; i < nEscaneos; i++) {
      escaneoRows.push({
        restaurante_id: DEMO_ID,
        tipo:           'escaneo',
        created_at:     tsBase,
        detalle:        JSON.stringify({
          destino:        i % 5 === 0 ? 'hub' : 'carta',
          experiencia_id: null,
        }),
      })
    }

    // sommelier
    for (let i = 0; i < nSommelier; i++) {
      const plato = platosList[sommelierAccum % Math.max(1, platosList.length)]
      const modo  = MODOS_ARMONIA[sommelierAccum % MODOS_ARMONIA.length]
      sommelierRows.push({
        restaurante_id: DEMO_ID,
        tipo:           'sommelier',
        created_at:     tsBase,
        detalle:        JSON.stringify({
          origen:      'cliente',
          modo:        modo === 'por_platos' ? 'mesa' : modo === 'recomendame' ? 'quiz' : 'vino',
          modo_armonia: modo,
          consulta:    '',
          platos:      plato ? [{ id: plato.id, nombre: plato.nombre }] : [],
        }),
      })

      // recomendaciones: RATE_RECOM_POR_SOMMELIER por sesión
      const nRecom = Math.round(RATE_RECOM_POR_SOMMELIER)
      for (let j = 0; j < nRecom; j++) {
        const vino = topVinos[(sommelierAccum + j) % Math.max(1, topVinos.length)]
        if (!vino) continue
        recomendacionRows.push({
          restaurante_id: DEMO_ID,
          tipo:           'recomendacion',
          created_at:     tsBase,
          detalle:        JSON.stringify({
            origen:      'cliente',
            modo:        modo === 'por_platos' ? 'mesa' : modo === 'recomendame' ? 'quiz' : 'vino',
            modo_armonia: modo,
            consulta:    '',
            plato_ids:   plato ? [plato.id] : [],
            vino_id:     vino.id,
            vino:        vino.nombre,
            posicion:    j + 1,
            precio:      Number(vino.precio_botella) || 0,
          }),
        })
      }
      sommelierAccum++
    }

    // evento_carta
    for (let i = 0; i < nEvento; i++) {
      eventoCartaRows.push({
        restaurante_id: DEMO_ID,
        tipo:           'evento_carta',
        created_at:     tsBase,
        detalle:        JSON.stringify({
          evento: EVENTOS_ARMONIA[i % EVENTOS_ARMONIA.length],
        }),
      })
    }
  }

  const allStatsRows = [
    ...estadisticasVentaRows,
    ...escaneoRows,
    ...sommelierRows,
    ...recomendacionRows,
    ...eventoCartaRows,
  ]
  const LIMITE_TOTAL = 15000

  console.log(`\n  Estadísticas a insertar por tipo:`)
  console.log(`    venta:         ${estadisticasVentaRows.length}`)
  console.log(`    escaneo:       ${escaneoRows.length}`)
  console.log(`    sommelier:     ${sommelierRows.length}`)
  console.log(`    recomendacion: ${recomendacionRows.length}`)
  console.log(`    evento_carta:  ${eventoCartaRows.length}`)
  console.log(`    TOTAL:         ${allStatsRows.length}  (límite ${LIMITE_TOTAL})`)
  if (allStatsRows.length > LIMITE_TOTAL) {
    console.log(`  ⚠ AVISO: supera el límite de ${LIMITE_TOTAL} filas`)
  }

  // Tabla mensual por tipo
  console.log('\n  ── Tabla mensual ────────────────────────────────────────────────')
  const mensualMap = {}  // key: 'YYYY-MM'
  for (const row of allStatsRows) {
    const mes = (row.created_at || '').slice(0, 7)
    if (!mes) continue
    if (!mensualMap[mes]) mensualMap[mes] = { venta: 0, escaneo: 0, sommelier: 0, recomendacion: 0, evento_carta: 0 }
    mensualMap[mes][row.tipo] = (mensualMap[mes][row.tipo] || 0) + 1
  }
  const meses = Object.keys(mensualMap).sort()
  const hdr = `  ${'Mes'.padEnd(8)} ${'venta'.padStart(6)} ${'escaneo'.padStart(8)} ${'sommelier'.padStart(10)} ${'recom'.padStart(6)} ${'evento'.padStart(7)} ${'total'.padStart(7)}`
  console.log(hdr)
  console.log('  ' + '─'.repeat(56))
  for (const mes of meses) {
    const r = mensualMap[mes]
    const t = (r.venta||0)+(r.escaneo||0)+(r.sommelier||0)+(r.recomendacion||0)+(r.evento_carta||0)
    console.log(
      `  ${mes.padEnd(8)} ${String(r.venta||0).padStart(6)} ${String(r.escaneo||0).padStart(8)} ` +
      `${String(r.sommelier||0).padStart(10)} ${String(r.recomendacion||0).padStart(6)} ` +
      `${String(r.evento_carta||0).padStart(7)} ${String(t).padStart(7)}`
    )
  }

  // 5 ejemplos de detalle por tipo
  const tiposEjemplo = [
    { tipo: 'venta', rows: estadisticasVentaRows },
    { tipo: 'escaneo', rows: escaneoRows },
    { tipo: 'sommelier', rows: sommelierRows },
    { tipo: 'recomendacion', rows: recomendacionRows },
    { tipo: 'evento_carta', rows: eventoCartaRows },
  ]
  console.log('\n  ── 5 ejemplos de detalle por tipo ──────────────────────────────')
  for (const { tipo, rows } of tiposEjemplo) {
    console.log(`  [${tipo}]`)
    rows.slice(0, 5).forEach((r, i) => {
      const d = typeof r.detalle === 'string' ? r.detalle : JSON.stringify(r.detalle)
      console.log(`    ${i + 1}. ${d.slice(0, 120)}`)
    })
  }

  // ── Simulación Rentabilidad ───────────────────────────────────────────────────
  console.log('\n  ── Simulación MenuEngineeringClient.js ──────────────────────────')
  const { data: vinosData } = await sb
    .from('vinos')
    .select('id, nombre, bodega, precio_botella, coste_compra, stock')
    .eq('restaurante_id', DEMO_ID)
    .eq('activo', true)

  const decimal = v => parseFloat(v) || 0
  const ventasPorId = {}
  for (const row of estadisticasVentaRows) {
    const d   = JSON.parse(row.detalle)
    const vid = d.vino_id
    const c   = Math.max(1, Number(d.cantidad) || 1)
    ventasPorId[vid] = (ventasPorId[vid] || 0) + c
  }
  const unidadesKpi  = Object.values(ventasPorId).reduce((s, n) => s + n, 0)
  const vinosConCoste = (vinosData || []).filter(v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0)

  if (vinosConCoste.length < 3) {
    console.log(`  ⚠ estado='sin_coste': ${vinosConCoste.length} vinos con coste y precio (necesita ≥3)`)
  } else if (unidadesKpi < 5) {
    console.log(`  ⚠ estado='sin_ventas': unidadesKpi=${unidadesKpi} < 5`)
  } else {
    console.log(`  estado='ok' ✓ — ANALISIS_DEMO no se activa`)
  }
  console.log(`  unidadesKpi: ${unidadesKpi}  |  vinosConCoste: ${vinosConCoste.length}`)

  const vinosCalc = vinosConCoste.map(v => ({
    id: v.id, nombre: v.nombre, bodega: v.bodega,
    margen: decimal(v.precio_botella) - decimal(v.coste_compra),
    ventas: ventasPorId[v.id] || 0,
    pctVentas: unidadesKpi > 0 ? ((ventasPorId[v.id] || 0) / unidadesKpi) * 100 : 0,
    valorStockCoste:   decimal(v.stock) * decimal(v.coste_compra),
    ingresosEstimados: (ventasPorId[v.id] || 0) * decimal(v.precio_botella),
  }))
  const barreraRent = vinosCalc.length ? vinosCalc.reduce((s, v) => s + v.margen, 0) / vinosCalc.length : 0
  const vinosConVts = vinosCalc.filter(v => v.ventas > 0).length
  const barreraPopul = vinosConVts > 0 ? (100 / vinosConVts) * 0.7 : 0
  const clasificados = vinosCalc.map(v => ({
    ...v,
    retornoInv: v.valorStockCoste > 0 ? v.ingresosEstimados / v.valorStockCoste : null,
    categoria:  (v.margen >= barreraRent && v.pctVentas >= barreraPopul) ? 'estrella'
              : (v.margen <  barreraRent && v.pctVentas >= barreraPopul) ? 'caballo'
              : (v.margen >= barreraRent)                                ? 'joya'
              :                                                            'revisar',
  }))
  const conteo = { estrella: 0, joya: 0, caballo: 0, revisar: 0 }
  for (const v of clasificados) conteo[v.categoria]++
  const vsTotal = clasificados.reduce((s, v) => s + v.valorStockCoste, 0)
  const igTotal = clasificados.reduce((s, v) => s + v.ingresosEstimados, 0)
  const retGlobal = vsTotal > 0 ? igTotal / vsTotal : null

  console.log(`  barreraRentabilidad: ${barreraRent.toFixed(2)} €  barreraPopularidad: ${barreraPopul.toFixed(2)} %`)
  console.log(`  Cuadrantes: Estrella=${conteo.estrella} Joya=${conteo.joya} Caballo=${conteo.caballo} Revisar=${conteo.revisar}`)
  const top5 = [...clasificados].filter(v => v.ventas > 0).sort((a, b) => b.pctVentas - a.pctVentas).slice(0, 5)
  if (top5.length) {
    console.log(`  Top 5 por % ventas:`)
    const hdrT = `  ${'nombre'.padEnd(30)} ${'cat'.padEnd(8)} ${'vtas'.padStart(5)} ${'%kpi'.padStart(5)} ${'margen'.padStart(8)}`
    console.log(hdrT)
    for (const v of top5) {
      console.log(`  ${(v.nombre||'').slice(0,30).padEnd(30)} ${v.categoria.padEnd(8)} ${String(v.ventas).padStart(5)} ${v.pctVentas.toFixed(1).padStart(5)} ${(v.margen.toFixed(2)+'€').padStart(8)}`)
    }
  }
  if (retGlobal != null) console.log(`  Retorno inventario global (WINSPID): ${retGlobal.toFixed(2)}x`)

  // ── Escritura ─────────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n  [DRY-RUN] Sin escritura. Añade --confirm para aplicar.')
    return
  }

  console.log('\n  Borrando estadisticas existentes (por tipo)...')
  const TIPOS_A_BORRAR = ['venta', 'escaneo', 'sommelier', 'recomendacion', 'evento_carta']
  for (const tipo of TIPOS_A_BORRAR) {
    const { error: delErr } = await sb
      .from('estadisticas')
      .delete()
      .eq('restaurante_id', DEMO_ID)
      .eq('tipo', tipo)
    if (delErr) throw new Error(`delete estadisticas tipo='${tipo}': ${delErr.message}`)
  }
  console.log(`  ✓ Borradas estadísticas de tipos: ${TIPOS_A_BORRAR.join(', ')}`)

  console.log(`  Insertando ${allStatsRows.length} filas en chunks de 500...`)
  const CHUNK = 500
  let insertados = 0
  for (let i = 0; i < allStatsRows.length; i += CHUNK) {
    const chunk = allStatsRows.slice(i, i + CHUNK)
    const { error: insErr } = await sb.from('estadisticas').insert(chunk)
    if (insErr) throw new Error(`insert chunk ${i}: ${insErr.message}`)
    insertados += chunk.length
    if (allStatsRows.length > CHUNK) process.stdout.write(`\r    ... ${insertados}/${allStatsRows.length}`)
  }
  if (allStatsRows.length > CHUNK) process.stdout.write('\n')

  console.log(`\n  ✓ F3 completado:`)
  console.log(`    F3-B: ${f3bPartesInsertados.length} partes + ${f3bPartesInsertados.length * f3bLineaTemplate.length} líneas (2026-10-15 a 17)`)
  console.log(`    F3-A: ${insertados} estadísticas (granularidad: ${granularidad})`)
  console.log('\n  Próximos pasos:')
  console.log('    1. /dashboard/menu-engineering → análisis real (sin banner ANALISIS_DEMO)')
  console.log('    2. /dashboard/estadisticas → ver escaneos, sommelier, recomendaciones')
  console.log('    3. /dashboard/explotacion → octubre 2026 debe incluir partes F3-B')
}

main().catch(err => {
  console.error('ERROR fatal:', err.message || err)
  process.exit(1)
})
