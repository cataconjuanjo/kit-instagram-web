/**
 * PATCH /api/admin/carta-pdf-config
 *
 * Guarda las preferencias de presentación de la Carta PDF imprimible de un
 * restaurante (reutiliza columnas existentes de branding + añade las dos
 * nuevas de la migración `add_carta_pdf`).
 *
 * Autorización: Bearer token del dueño del restaurante o del admin global.
 *               (NO es endpoint público.)
 *
 * Campos aceptados (todos opcionales, se sanean antes de escribir):
 *   - color_fondo         hex "#rrggbb" o "#rgb"
 *   - color_acento        hex
 *   - tipografia          enum 'serif' | 'sans' | 'condensed' | 'display' | 'garamond' | 'mono'
 *   - logo_url            string, URL http(s) o /ruta/relativa
 *   - carta_descripcion   string, máx 600 chars (puede ser '' para borrar)
 *   - carta_mostrar_copa  boolean
 *   - carta_pie_texto     string, máx 400 chars
 *
 * Si Postgres responde 42703 (columna inexistente) sobre las columnas nuevas,
 * se reintenta sin ellas para que la app degrade bien antes de aplicar la
 * migración en prod.
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getAdminEmail } from '../../_lib/isConsultor'

const TIPOGRAFIAS_VALIDAS = new Set(['serif', 'sans', 'condensed', 'display', 'garamond', 'mono'])
const COLUMNAS_NUEVAS = new Set(['carta_descripcion', 'carta_mostrar_copa'])

function sanitizarHex(valor) {
  if (typeof valor !== 'string') return null
  const v = valor.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const h = v.slice(1).split('').map(c => c + c).join('')
    return '#' + h.toLowerCase()
  }
  return null
}

function sanitizarUrl(valor) {
  if (typeof valor !== 'string') return null
  const raw = valor.trim().slice(0, 2048)
  if (!raw) return ''
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

function sanitizarTexto(valor, max) {
  if (valor === null || valor === undefined) return ''
  const s = String(valor).replace(/\s+/g, ' ').trim()
  if (s.length === 0) return ''
  return s.slice(0, max)
}

async function identificarUsuario(req) {
  const auth = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!auth) return null
  try {
    const supa = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
    const { data, error } = await supa.auth.getUser(auth)
    if (error || !data?.user?.email) return null
    return data.user.email.toLowerCase()
  } catch {
    return null
  }
}

export async function PATCH(req) {
  const email = await identificarUsuario(req)
  if (!email) return Response.json({ error: 'No autorizado.' }, { status: 401 })

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 })
  }

  const restauranteId = String(body?.restaurante_id || '').trim()
  if (!restauranteId) return Response.json({ error: 'restaurante_id requerido.' }, { status: 400 })

  const esAdmin = email === getAdminEmail()
  if (!esAdmin) {
    const { data: duenio } = await supabaseAdmin
      .from('restaurantes')
      .select('id')
      .eq('id', restauranteId)
      .eq('email', email)
      .maybeSingle()
    if (!duenio) return Response.json({ error: 'No autorizado.' }, { status: 403 })
  }

  // Construir update con solo los campos presentes y válidos
  const update = {}

  if ('color_fondo' in body) {
    const hex = sanitizarHex(body.color_fondo)
    if (hex) update.color_fondo = hex
  }
  if ('color_acento' in body) {
    const hex = sanitizarHex(body.color_acento)
    if (hex) update.color_acento = hex
  }
  if ('tipografia' in body) {
    const t = String(body.tipografia || '').trim().toLowerCase()
    if (TIPOGRAFIAS_VALIDAS.has(t)) update.tipografia = t
  }
  if ('logo_url' in body) {
    const url = sanitizarUrl(body.logo_url)
    if (url !== null) update.logo_url = url
  }
  if ('carta_descripcion' in body) {
    update.carta_descripcion = sanitizarTexto(body.carta_descripcion, 600) || null
  }
  if ('carta_mostrar_copa' in body) {
    update.carta_mostrar_copa = body.carta_mostrar_copa !== false
  }
  if ('carta_pie_texto' in body) {
    update.carta_pie_texto = sanitizarTexto(body.carta_pie_texto, 400) || null
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'Sin cambios aplicables.' }, { status: 400 })
  }

  async function intentarUpdate(payload) {
    return supabaseAdmin
      .from('restaurantes')
      .update(payload)
      .eq('id', restauranteId)
      .select('id')
      .single()
  }

  let { data, error } = await intentarUpdate(update)

  // Si las columnas nuevas no existen todavía (migración sin aplicar), degrada.
  if (error && error.code === '42703' && Object.keys(update).some(k => COLUMNAS_NUEVAS.has(k))) {
    const degradado = Object.fromEntries(
      Object.entries(update).filter(([k]) => !COLUMNAS_NUEVAS.has(k))
    )
    if (Object.keys(degradado).length === 0) {
      return Response.json({
        error: 'Migración pendiente: aplica supabase/migrations_pendientes/add_carta_pdf.up.sql',
        code: 'MIGRATION_PENDING',
      }, { status: 409 })
    }
    const retry = await intentarUpdate(degradado)
    data = retry.data
    error = retry.error
    if (!error) {
      return Response.json({
        ok: true,
        aviso: 'Guardado parcial: carta_descripcion y carta_mostrar_copa requieren aplicar la migración add_carta_pdf.',
      })
    }
  }

  if (error) {
    console.error('[carta-pdf-config]', { restauranteId, code: error.code, message: error.message })
    return Response.json({ error: 'No se pudo guardar la configuración.' }, { status: 500 })
  }

  return Response.json({ ok: true, id: data.id })
}
