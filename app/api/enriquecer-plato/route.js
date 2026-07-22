/**
 * /api/enriquecer-plato
 * Extrae el perfil aromático Chartier de un plato usando Claude Haiku.
 * Se llama en background después de guardar/editar un plato en el dashboard.
 * Rápido, barato, no bloquea la UI.
 */

import Anthropic from '@anthropic-ai/sdk'
import { comprobarCuotaIaRestaurante, registrarConsumoAnthropic, responderCuotaIaAgotada } from '../../lib/anthropicUsage'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { requireRestaurantAccess } from '../_lib/auth'

const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FAMILIAS_DISPONIBLES = `
anisado_mentolado: hinojo, menta, albahaca, apio, pepino, wasabi, cilantro, estragon, verbena
terpenico_floral: romero, azafran, cardamomo, lavanda, citricos, jengibre, tomillo, laurel, enebro
tioles: ajo, cebolla, alcaparra, pomelo, fruta de la pasion, tomate verde, brotes, cebollino
lactonas: coco, albaricoque, melocoton, vieira, maiz, nata, mantequilla, cerdo, morcilla, boniato
roble_barrica: brasa, asado, ahumado, tostado, cafe, cacao, sesamo tostado, cebolla caramelizada, pimenton dulce, Maillard
eugenol_clavo: clavo, canela, remolacha, vainilla, cuatro especias, albahaca tailandesa, carnes con especias
sotolon_oxidativo: curry, fenogreco, soja, miso, jarabe de arce, frutos secos, higos, datiles, setas secas
yodado_salino: ostras, algas, crustaceos, mariscos, pulpo, calamar, sepia, pescado crudo, ahumado, caviar, erizo
umami: setas frescas, trufa, queso curado, jamon, anchoa, tomate concentrado, guisantes, algas kombu
capsaicina_picante: guindilla, chile, chipotle, pimenton picante, cayena, sriracha, wasabi
carotenoides: pimenton, zanahoria, calabaza, boniato, tomate, naranja, mango
fruta_roja_floral: fresas, frambuesas, cerezas, rosas, geranio, flores comestibles, grosellas
`.trim()

const SYSTEM_PROMPT = `Eres un experto en la metodología aromática de François Chartier.
Dado un plato de restaurante, extrae su perfil aromático Chartier.
Devuelve ÚNICAMENTE JSON válido, sin markdown ni explicaciones.`

const USER_PROMPT = (nombre, descripcion, categoria) => `Plato: "${nombre}"
${descripcion ? `Descripción: "${descripcion}"` : ''}
Categoría: ${categoria || 'plato principal'}

Familias aromáticas disponibles (elige 1-3, solo las que claramente aplican):
${FAMILIAS_DISPONIBLES}

Devuelve este JSON exacto:
{
  "familias": ["id_familia1"],
  "ingrediente": "ingrediente principal del plato",
  "tecnica": "tecnica de coccion principal o cadena vacia si no aplica",
  "intensidad": 3
}

intensidad: 1 (muy delicado, sutil) → 5 (muy potente, intenso en boca).`

function extraerJson(texto) {
  const limpio = (texto || '').trim()
  try { return JSON.parse(limpio) } catch {}
  const match = limpio.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

function validarFamilias(result) {
  const FAMILIAS_VALIDAS = new Set([
    'anisado_mentolado', 'terpenico_floral', 'tioles', 'lactonas',
    'roble_barrica', 'eugenol_clavo', 'sotolon_oxidativo', 'yodado_salino',
    'umami', 'capsaicina_picante', 'carotenoides', 'fruta_roja_floral',
  ])
  if (!result || !Array.isArray(result.familias)) return null
  return {
    familias: result.familias.filter(f => FAMILIAS_VALIDAS.has(f)).slice(0, 3),
    ingrediente: String(result.ingrediente || '').slice(0, 100),
    tecnica: String(result.tecnica || '').slice(0, 60),
    intensidad: Math.max(1, Math.min(5, Number(result.intensidad) || 3)),
  }
}

export async function POST(req) {
  try {
    const { nombre, descripcion, categoria, plato_id, restaurante_id } = await req.json()

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    if ((auth.user?.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
      return Response.json({ error: 'Solo administracion puede lanzar el analisis Chartier.' }, { status: 403 })
    }

    if (!nombre?.trim()) {
      return Response.json({ error: 'Nombre del plato requerido' }, { status: 400 })
    }

    const cuotaIa = await comprobarCuotaIaRestaurante({
      restauranteId: restaurante_id,
      endpoint: 'enriquecer_plato',
    })
    if (!cuotaIa.ok) return responderCuotaIaAgotada(cuotaIa)

    const modelo = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model: modelo,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: USER_PROMPT(nombre, descripcion, categoria),
      }],
    })
    await registrarConsumoAnthropic({
      restauranteId: restaurante_id,
      endpoint: 'enriquecer_plato',
      modelo,
      usage: message.usage,
      metadata: { plato_id: plato_id || null, plato: nombre },
    })

    const texto = message.content?.[0]?.text || ''
    const parsed = extraerJson(texto)
    const familias_aromaticas = validarFamilias(parsed)

    if (!familias_aromaticas) {
      return Response.json({ familias_aromaticas: null, error: 'No se pudo extraer el perfil aromático' })
    }

    // Si se proporcionan IDs, actualizar directamente en Supabase (server-side)
    if (plato_id && restaurante_id) {
      await supabaseAdmin
        .from('platos')
        .update({ familias_aromaticas })
        .eq('id', plato_id)
        .eq('restaurante_id', restaurante_id)
    }

    return Response.json({ familias_aromaticas })
  } catch (error) {
    console.error('Error enriqueciendo plato:', error)
    return Response.json({ familias_aromaticas: null, error: 'Error al analizar el plato' })
  }
}
