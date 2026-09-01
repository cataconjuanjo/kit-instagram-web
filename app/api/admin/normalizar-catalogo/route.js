import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { normalizarCamposVino } from '../../../lib/normalizarVino.js'

export const maxDuration = 30

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

async function validarAdmin(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesión no recibida', status: 401 }
  const supabaseAuth = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesión no válida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }
  return { user: data.user }
}

// Normalize a value for duplicate comparison: strip accents, lowercase, collapse spaces.
function claveDup(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Compare normalized result against stored row, returning only the changed fields.
function cambiados(row, norm) {
  const candidatos = {
    nombre: norm.nombre,
    tipo: norm.tipo,
    zona: norm.zona,
    nombre_raw: norm.nombre_raw,
    region_raw: norm.region_raw,
    tamanyo: norm.tamanyo,
    unidades_por_caja: norm.unidades_por_caja,
    referencia_proveedor: norm.referencia_proveedor,
    graduacion: norm.graduacion,
    almacen_proveedor: norm.almacen_proveedor,
    formato_raw: norm.formato_raw,
  }
  const diff = {}
  for (const [k, v] of Object.entries(candidatos)) {
    const stored = row[k] ?? null
    const nuevo = v ?? null
    if (stored !== nuevo) diff[k] = nuevo
  }
  return Object.keys(diff).length ? diff : null
}

// How many meaningful fields a row has (used to prefer the richer duplicate).
function richness(row) {
  return [row.tipo, row.region, row.bodega, row.uva, row.anada, row.coste_estimado]
    .filter(v => v && v !== '0' && v !== 0).length
}

export async function POST(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json().catch(() => ({}))
    const dryRun = body.dry_run !== false // safe default: dry run unless explicitly false

    // Fetch up to 2 000 active catalog entries per run to stay within 30 s budget.
    const { data: vinos, error } = await supabaseAdmin
      .from('proveedor_catalogo_vinos')
      .select('id, proveedor_id, nombre, bodega, tipo, region, uva, anada, formato, zona, nombre_raw, region_raw, tamanyo, unidades_por_caja, referencia_proveedor, graduacion, almacen_proveedor, formato_raw, activo, notas, coste_estimado')
      .eq('activo', true)
      .order('created_at', { ascending: true })
      .limit(2000)

    if (error) throw error

    const toUpdate = []   // { id, diff }
    const dupDesactivar = [] // ids to set activo: false with note
    const muestra = []

    // ── Phase 1: normalize ──────────────────────────────────────────
    for (const row of vinos) {
      const norm = normalizarCamposVino({
        nombre: row.nombre,
        tipo: row.tipo,
        region: row.region,
        formato: row.formato,
      })
      const diff = cambiados(row, norm)
      if (diff) {
        toUpdate.push({ id: row.id, diff })
        if (muestra.length < 10) {
          muestra.push({ id: row.id, nombre: row.nombre, cambios: diff })
        }
      }
    }

    // ── Phase 2: duplicate detection (same proveedor + normalized nombre+bodega+anada) ──
    const grupos = {}
    for (const row of vinos) {
      const clave = `${row.proveedor_id}||${claveDup(row.nombre)}||${claveDup(row.bodega)}||${claveDup(row.anada)}`
      if (!grupos[clave]) grupos[clave] = []
      grupos[clave].push(row)
    }

    for (const grupo of Object.values(grupos)) {
      if (grupo.length < 2) continue
      // Keep the richest; mark the rest as inactive.
      grupo.sort((a, b) => richness(b) - richness(a))
      for (const dup of grupo.slice(1)) {
        dupDesactivar.push(dup.id)
      }
    }

    if (!dryRun) {
      // Apply normalization updates in small batches to avoid timeouts.
      for (const { id, diff } of toUpdate) {
        await supabaseAdmin
          .from('proveedor_catalogo_vinos')
          .update(diff)
          .eq('id', id)
      }
      // Deactivate duplicates with a note.
      if (dupDesactivar.length) {
        await supabaseAdmin
          .from('proveedor_catalogo_vinos')
          .update({ activo: false, notas: '[duplicado detectado por normalización automática]' })
          .in('id', dupDesactivar)
      }
    }

    return Response.json({
      dry_run: dryRun,
      total_revisados: vinos.length,
      actualizados: toUpdate.length,
      duplicados_desactivados: dupDesactivar.length,
      muestra_cambios: muestra,
      aviso: vinos.length === 2000
        ? 'Se han revisado los primeros 2 000 registros. Ejecuta de nuevo para continuar si hay más.'
        : null,
    })
  } catch (err) {
    console.error('[normalizar-catalogo]', err)
    return Response.json({ error: 'Error durante la normalización.' }, { status: 500 })
  }
}
